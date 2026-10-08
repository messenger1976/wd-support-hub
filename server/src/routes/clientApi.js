import fs from 'node:fs';
import express from 'express';
import { one, query } from '../db.js';
import { notifySupportUsers } from '../firebase.js';
import { now, resolveAttachment, statusTimestamps, storeAttachment, str } from '../util.js';

/*
 * REST API used by the Water District apps (client-plugin/messagesupport_model.php).
 * The contract is unchanged from the PHP hub: Bearer company token, and
 *   POST {hub}api.php?action=push   (or /api/push)
 *   GET  {hub}api.php?action=poll&since=Y-m-d H:i:s   (or /api/poll)
 */
const router = express.Router();

// The WD apps always send JSON, but PHP read the raw body regardless of Content-Type.
const jsonBody = express.json({ limit: '30mb', type: () => true });

async function companyAuth(req, res, next) {
	const header = req.get('Authorization') || '';
	const token = /^Bearer\s+/i.test(header) ? header.replace(/^Bearer\s+/i, '').trim() : '';
	const company = token ? await one('SELECT * FROM wd_support_company WHERE token = ? LIMIT 1', [token]) : null;
	if (!company) {
		return res.status(401).json({ ok: false, error: 'Invalid company token.' });
	}
	if (company.status !== 'active') {
		return res.status(401).json({ ok: false, error: 'This Water District is deactivated on the support hub.' });
	}
	await query('UPDATE wd_support_company SET last_seen = ? WHERE id = ?', [now(), company.id]);
	req.company = company;
	next();
}

/** Returns false when the uuid already belongs to a different company. */
async function upsertTicket(code, t) {
	const ts = now();
	const existing = await one(
		'SELECT id, company_code, status, resolved_at, closed_at FROM wd_support_ticket WHERE uuid = ? LIMIT 1',
		[t.uuid],
	);
	if (existing && existing.company_code !== code) return false;
	const f = {
		ticket_no: str(t.ticket_no),
		subject: str(t.subject),
		category: str(t.category, 'Other'),
		priority: str(t.priority, 'normal'),
		status: str(t.status, 'open'),
		user_id: parseInt(t.user_id, 10) || 0,
		user_name: str(t.user_name),
		usertype: str(t.usertype),
		last_message_at: str(t.last_message_at, ts),
	};
	if (existing) {
		const stamps = existing.status === f.status ? {} : statusTimestamps(f.status, ts);
		await query(
			`UPDATE wd_support_ticket SET ticket_no = ?, subject = ?, category = ?, priority = ?, status = ?,
				user_name = ?, usertype = ?, last_message_at = ?, unread_support = 1, updated_at = ?,
				resolved_at = ?, closed_at = ?
			 WHERE id = ?`,
			[f.ticket_no, f.subject, f.category, f.priority, f.status, f.user_name, f.usertype, f.last_message_at, ts,
				stamps.resolved_at === undefined ? existing.resolved_at : stamps.resolved_at,
				stamps.closed_at === undefined ? existing.closed_at : stamps.closed_at,
				existing.id],
		);
	} else {
		const stamps = statusTimestamps(f.status, ts);
		await query(
			`INSERT INTO wd_support_ticket (uuid, company_code, ticket_no, subject, category, priority, status,
				user_id, user_name, usertype, last_message_at, resolved_at, closed_at, unread_client, unread_support, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`,
			[t.uuid, code, f.ticket_no, f.subject, f.category, f.priority, f.status, f.user_id, f.user_name, f.usertype,
				f.last_message_at, stamps.resolved_at ?? null, stamps.closed_at ?? null, ts, ts],
		);
	}
	return true;
}

/** Returns the inserted message row, null if it was already stored, false on a company mismatch. */
async function upsertMessage(code, payload) {
	const msg = payload.message;
	const ticketUuid = str(payload.ticket_uuid);
	if (await one('SELECT id FROM wd_support_message WHERE uuid = ? LIMIT 1', [msg.uuid])) return null;
	const ticket = await one('SELECT company_code FROM wd_support_ticket WHERE uuid = ? LIMIT 1', [ticketUuid]);
	if (ticket && ticket.company_code !== code) return false;

	const name = msg.attachment_name ? str(msg.attachment_name) : null;
	let attachmentPath = null;
	if (payload.attachment_base64 && name) {
		attachmentPath = storeAttachment(code, ticketUuid, name, Buffer.from(String(payload.attachment_base64), 'base64'));
	}
	const row = {
		uuid: str(msg.uuid),
		ticket_uuid: ticketUuid,
		company_code: code,
		sender_side: str(msg.sender_side, 'client'),
		sender_name: str(msg.sender_name),
		body: str(msg.body),
		attachment_path: attachmentPath,
		attachment_name: name,
		created_at: str(msg.created_at, now()),
	};
	await query('INSERT INTO wd_support_message SET ?', [row]);
	await query(
		'UPDATE wd_support_ticket SET unread_support = 1, last_message_at = ?, updated_at = ? WHERE uuid = ?',
		[row.created_at, now(), ticketUuid],
	);
	return row;
}

async function notifyNewClientMessage(company, row) {
	const t = await one('SELECT ticket_no, subject FROM wd_support_ticket WHERE uuid = ? LIMIT 1', [row.ticket_uuid]);
	const count = await one('SELECT COUNT(*) AS n FROM wd_support_message WHERE ticket_uuid = ?', [row.ticket_uuid]);
	const isNew = Number(count?.n || 0) <= 1;
	const label = t ? `${t.ticket_no} · ${t.subject}` : company.name;
	await notifySupportUsers({
		title: `${isNew ? 'New ticket' : 'New message'} — ${company.name}`,
		body: `${label}\n${row.sender_name ? `${row.sender_name}: ` : ''}${row.body || row.attachment_name || ''}`,
		ticketUuid: row.ticket_uuid,
		companyCode: company.code,
	});
}

async function push(req, res) {
	const p = req.body;
	const code = req.company.code;
	if (!p || typeof p !== 'object' || !p.type) {
		return res.json({ ok: false, error: 'Invalid payload' });
	}
	if (p.type === 'ticket' && p.ticket && typeof p.ticket === 'object') {
		if (!p.ticket.uuid) return res.json({ ok: false, error: 'Invalid payload' });
		const ok = await upsertTicket(code, p.ticket);
		return res.json(ok ? { ok: true } : { ok: false, error: 'Ticket belongs to another company' });
	}
	if (p.type === 'message' && p.message && typeof p.message === 'object' && p.ticket_uuid) {
		if (!p.message.uuid) return res.json({ ok: false, error: 'Invalid payload' });
		const row = await upsertMessage(code, p);
		if (row === false) return res.json({ ok: false, error: 'Ticket belongs to another company' });
		res.json({ ok: true });
		if (row && row.sender_side === 'client') {
			notifyNewClientMessage(req.company, row).catch((err) => console.error('[push] notify:', err.message));
		}
		return undefined;
	}
	return res.json({ ok: false, error: 'Unknown push type' });
}

async function poll(req, res) {
	const code = req.company.code;
	const since = str(req.query.since, '1970-01-01 00:00:00').replace(/[^0-9:\- ]/g, '') || '1970-01-01 00:00:00';
	const rows = await query(
		`SELECT m.*, t.status AS ticket_status FROM wd_support_message m
		 LEFT JOIN wd_support_ticket t ON t.uuid = m.ticket_uuid
		 WHERE m.company_code = ? AND m.sender_side = 'support' AND m.created_at > ?
		 ORDER BY m.id ASC LIMIT 200`,
		[code, since],
	);
	const messages = rows.map((r) => {
		const item = {
			uuid: r.uuid,
			ticket_uuid: r.ticket_uuid,
			sender_side: r.sender_side,
			sender_name: r.sender_name,
			body: r.body,
			attachment_name: r.attachment_name,
			created_at: r.created_at,
		};
		const file = resolveAttachment(r.attachment_path);
		if (file) item.attachment_base64 = fs.readFileSync(file).toString('base64');
		if (r.ticket_status !== null && r.ticket_status !== undefined) item.ticket_status = r.ticket_status;
		return item;
	});
	const tickets = await query(
		'SELECT uuid, status, updated_at FROM wd_support_ticket WHERE company_code = ? AND updated_at > ?',
		[code, since],
	);
	res.json({ ok: true, messages, tickets, server_time: now() });
}

router.all('/api.php', companyAuth, jsonBody, async (req, res) => {
	const action = str(req.query.action);
	if (action === 'push' && req.method === 'POST') return push(req, res);
	if (action === 'poll') return poll(req, res);
	return res.status(404).json({ ok: false, error: 'Unknown action' });
});
router.post('/api/push', companyAuth, jsonBody, push);
router.all('/api/poll', companyAuth, poll);

export default router;
