import express from 'express';
import { config } from '../config.js';
import { one, query } from '../db.js';
import { ACTIVE_SQL, connectionState } from '../analytics.js';
import { audit, can, canSeeCompany, companyScope, requirePerm } from '../permissions.js';
import { isEmail, now, randomHex, str } from '../util.js';

/*
 * WD Setup: the Water Districts (tenants) allowed to push tickets to this hub.
 * The code is permanent once created: tickets, messages and upload folders are keyed on it.
 */
const router = express.Router();

const EDITABLE = [
	'name', 'short_name', 'ticket_prefix', 'contact_person', 'contact_email', 'contact_phone', 'address', 'app_url', 'notes',
	'sla_first_response_hours', 'sla_resolution_hours',
];

function maskToken(token) {
	const t = String(token || '');
	return t.length > 10 ? `${t.slice(0, 6)}••••••${t.slice(-4)}` : '••••••';
}

function newToken(code) {
	return `${code.toLowerCase().replace(/[^a-z0-9]/g, '')}-ms-${randomHex(16)}`;
}

function intIn(v, min, max, fallback) {
	const n = parseInt(v, 10);
	return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/** Validates and normalises the editable fields. Returns { data } or { error }. */
function readCompany(body) {
	const b = body || {};
	const data = {
		name: str(b.name).trim(),
		short_name: str(b.short_name).trim(),
		ticket_prefix: str(b.ticket_prefix).trim().toUpperCase(),
		contact_person: str(b.contact_person).trim(),
		contact_email: str(b.contact_email).trim(),
		contact_phone: str(b.contact_phone).trim(),
		address: str(b.address).trim(),
		app_url: str(b.app_url).trim(),
		notes: str(b.notes).trim(),
		sla_first_response_hours: intIn(b.sla_first_response_hours, 1, 720, 4),
		sla_resolution_hours: intIn(b.sla_resolution_hours, 1, 2160, 72),
	};
	if (!data.name || data.name.length > 150) return { error: 'Enter the Water District name (max 150 characters).' };
	if (data.short_name.length > 60) return { error: 'Short name is too long (max 60 characters).' };
	if (data.ticket_prefix && !/^[A-Z0-9]{2,10}$/.test(data.ticket_prefix)) {
		return { error: 'Ticket prefix must be 2–10 letters or digits (e.g. LAB).' };
	}
	if (data.contact_email && !isEmail(data.contact_email)) return { error: 'Enter a valid contact email.' };
	if (data.contact_person.length > 150 || data.contact_phone.length > 60 || data.address.length > 255) {
		return { error: 'A contact field is too long.' };
	}
	if (data.app_url && !/^https?:\/\/\S+$/i.test(data.app_url)) return { error: 'App URL must start with http:// or https://.' };
	if (data.app_url.length > 255) return { error: 'App URL is too long.' };
	if (data.sla_resolution_hours < data.sla_first_response_hours) {
		return { error: 'Resolution target cannot be shorter than the first-response target.' };
	}
	return { data };
}

const STATS = `
	(SELECT COUNT(*) FROM wd_support_ticket t WHERE t.company_code = c.code) AS tickets_total,
	(SELECT COUNT(*) FROM wd_support_ticket t WHERE t.company_code = c.code AND ${ACTIVE_SQL}) AS tickets_active,
	(SELECT COUNT(*) FROM wd_support_ticket t WHERE t.company_code = c.code AND t.status IN ('open','waiting_support')) AS tickets_needs_reply,
	(SELECT MAX(t.created_at) FROM wd_support_ticket t WHERE t.company_code = c.code) AS last_ticket_at,
	(SELECT COUNT(*) FROM wd_support_hub_user u WHERE u.all_companies = 1 AND u.is_active = 1)
		+ (SELECT COUNT(*) FROM wd_support_user_company uc INNER JOIN wd_support_hub_user u ON u.id = uc.user_id AND u.is_active = 1
			WHERE uc.company_code = c.code AND u.all_companies = 0) AS staff_count`;

function present(row, user, ts = now()) {
	const { token, ...rest } = row;
	return {
		...rest,
		tickets_total: Number(row.tickets_total || 0),
		tickets_active: Number(row.tickets_active || 0),
		tickets_needs_reply: Number(row.tickets_needs_reply || 0),
		staff_count: Number(row.staff_count || 0),
		token_masked: can(user, 'companies.token') ? maskToken(token) : '••••••',
		connection: connectionState(row.last_seen, ts),
	};
}

async function scopedCompany(req, res) {
	const code = str(req.params.code).toUpperCase();
	const row = await one(`SELECT c.*, ${STATS} FROM wd_support_company c WHERE c.code = ? LIMIT 1`, [code]);
	if (!row || !canSeeCompany(req.user, row.code)) {
		res.status(404).json({ ok: false, error: 'Water District not found.' });
		return null;
	}
	return row;
}

router.get('/wd', requirePerm('companies.view'), async (req, res) => {
	const scope = companyScope(req.user, 'c', 'code');
	const rows = await query(
		`SELECT c.*, ${STATS} FROM wd_support_company c WHERE ${scope.sql} ORDER BY c.status = 'active' DESC, c.name`,
		scope.params,
	);
	const ts = now();
	res.json({ ok: true, companies: rows.map((r) => present(r, req.user, ts)), hub_url: config.baseUrl, server_time: ts });
});

router.get('/wd/:code', requirePerm('companies.view'), async (req, res) => {
	const row = await scopedCompany(req, res);
	if (!row) return undefined;
	return res.json({ ok: true, company: present(row, req.user), server_time: now() });
});

router.post('/wd', requirePerm('companies.create'), async (req, res) => {
	const code = str(req.body?.code).trim().toUpperCase();
	if (!/^[A-Z0-9_]{2,32}$/.test(code)) {
		return res.json({ ok: false, error: 'Code must be 2–32 capital letters, digits or underscores (e.g. DIPOLOG).' });
	}
	const { data, error } = readCompany(req.body);
	if (error) return res.json({ ok: false, error });
	if (await one('SELECT id FROM wd_support_company WHERE code = ? LIMIT 1', [code])) {
		return res.json({ ok: false, error: `A Water District with code ${code} already exists.` });
	}
	const ts = now();
	await query('INSERT INTO wd_support_company SET ?', [{
		...data,
		code,
		ticket_prefix: data.ticket_prefix || code.slice(0, 3),
		status: 'active',
		token: newToken(code),
		token_rotated_at: ts,
		created_at: ts,
		updated_at: ts,
	}]);
	await audit(req, 'wd.create', 'company', code, { name: data.name });
	return res.json({ ok: true, code });
});

router.post('/wd/:code', requirePerm('companies.edit'), async (req, res) => {
	const row = await scopedCompany(req, res);
	if (!row) return undefined;
	const { data, error } = readCompany(req.body);
	if (error) return res.json({ ok: false, error });
	if (!data.ticket_prefix) data.ticket_prefix = row.ticket_prefix || row.code.slice(0, 3);
	await query('UPDATE wd_support_company SET ?, updated_at = ? WHERE code = ?', [data, now(), row.code]);
	const changed = EDITABLE.filter((k) => String(row[k] ?? '') !== String(data[k] ?? ''));
	await audit(req, 'wd.update', 'company', row.code, { changed });
	return res.json({ ok: true });
});

router.post('/wd/:code/deactivate', requirePerm('companies.deactivate'), async (req, res) => {
	const row = await scopedCompany(req, res);
	if (!row) return undefined;
	const ts = now();
	await query("UPDATE wd_support_company SET status = 'inactive', deactivated_at = ?, updated_at = ? WHERE code = ?", [ts, ts, row.code]);
	await audit(req, 'wd.deactivate', 'company', row.code);
	return res.json({ ok: true });
});

router.post('/wd/:code/activate', requirePerm('companies.deactivate'), async (req, res) => {
	const row = await scopedCompany(req, res);
	if (!row) return undefined;
	await query("UPDATE wd_support_company SET status = 'active', deactivated_at = NULL, updated_at = ? WHERE code = ?", [now(), row.code]);
	await audit(req, 'wd.activate', 'company', row.code);
	return res.json({ ok: true });
});

router.delete('/wd/:code', requirePerm('companies.deactivate'), async (req, res) => {
	const row = await scopedCompany(req, res);
	if (!row) return undefined;
	const used = await one(
		`SELECT (SELECT COUNT(*) FROM wd_support_ticket WHERE company_code = ?)
			+ (SELECT COUNT(*) FROM wd_support_message WHERE company_code = ?) AS n`,
		[row.code, row.code],
	);
	if (Number(used?.n || 0) > 0) {
		return res.json({ ok: false, error: 'This Water District has tickets. Deactivate it instead so its history stays in reports.' });
	}
	if (str(req.body?.confirm_code).toUpperCase() !== row.code) {
		return res.json({ ok: false, error: `Type ${row.code} to confirm.` });
	}
	await query('DELETE FROM wd_support_user_company WHERE company_code = ?', [row.code]);
	await query('DELETE FROM wd_support_company WHERE code = ?', [row.code]);
	await audit(req, 'wd.delete', 'company', row.code, { name: row.name });
	return res.json({ ok: true });
});

router.get('/wd/:code/token', requirePerm('companies.token'), async (req, res) => {
	const row = await scopedCompany(req, res);
	if (!row) return undefined;
	await audit(req, 'wd.token_view', 'company', row.code);
	return res.json({ ok: true, token: row.token });
});

router.post('/wd/:code/rotate-token', requirePerm('companies.token'), async (req, res) => {
	const row = await scopedCompany(req, res);
	if (!row) return undefined;
	const token = newToken(row.code);
	const ts = now();
	await query('UPDATE wd_support_company SET token = ?, token_rotated_at = ?, updated_at = ? WHERE code = ?', [token, ts, ts, row.code]);
	await audit(req, 'wd.token_rotate', 'company', row.code);
	return res.json({ ok: true, token });
});

/** Ready-to-paste application/config/message_support.php for the WD app. */
router.get('/wd/:code/connection', requirePerm('companies.view'), async (req, res) => {
	const row = await scopedCompany(req, res);
	if (!row) return undefined;
	const showToken = can(req.user, 'companies.token');
	const esc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
	const snippet = `<?php if ( ! defined('BASEPATH')) exit('No direct script access allowed');

/*
| Message Support plugin — ${esc(row.name)}
| Generated by WD Support Hub → WD Setup (${now().slice(0, 10)}).
*/

$config['ms_company_code'] = '${esc(row.code)}';
$config['ms_company_name'] = '${esc(row.name)}';
$config['ms_ticket_prefix'] = '${esc(row.ticket_prefix || row.code.slice(0, 3))}';
$config['ms_hub_url'] = '${esc(config.baseUrl)}';
$config['ms_api_token'] = '${showToken ? esc(row.token) : 'ASK-A-HUB-ADMINISTRATOR'}';
$config['ms_poll_seconds'] = 8;
$config['ms_max_upload_kb'] = 4096;
`;
	if (showToken) await audit(req, 'wd.connection_view', 'company', row.code);
	return res.json({ ok: true, snippet, includes_token: showToken, hub_url: config.baseUrl });
});

export default router;
