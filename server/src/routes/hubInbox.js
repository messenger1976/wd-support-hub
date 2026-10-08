import path from 'node:path';
import express from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { one, query } from '../db.js';
import { deletePushToken, savePushToken } from '../firebase.js';
import { audit, canSeeCompany, companyScope, parsePermissions, requirePerm } from '../permissions.js';
import {
	ATTACHMENT_EXTENSIONS, TICKET_STATUSES, extensionOf, now, resolveAttachment, statusTimestamps, storeAttachment, str, uuid,
} from '../util.js';

const router = express.Router();

const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: config.maxUploadBytes, files: 1 },
	fileFilter(req, file, cb) {
		const ok = ATTACHMENT_EXTENSIONS.includes(extensionOf(file.originalname));
		cb(ok ? null : Object.assign(new Error('Allowed attachments: images or PDF.'), { status: 400, expose: true }), ok);
	},
});

const TICKET_SELECT = `SELECT t.*, c.name AS company_name, c.short_name AS company_short_name,
		c.sla_first_response_hours, c.sla_resolution_hours, a.display_name AS assigned_name
	FROM wd_support_ticket t
	LEFT JOIN wd_support_company c ON c.code = t.company_code
	LEFT JOIN wd_support_hub_user a ON a.id = t.assigned_user_id`;

/** Loads a ticket the current user may see, or sends 404. */
async function scopedTicket(req, res, select = TICKET_SELECT) {
	const ticket = await one(`${select} WHERE t.uuid = ? LIMIT 1`, [req.params.uuid]);
	if (!ticket || !canSeeCompany(req.user, ticket.company_code)) {
		res.status(404).json({ ok: false, error: 'Ticket not found' });
		return null;
	}
	return ticket;
}

/** Water Districts visible to this user (filters, forms). Any signed-in user may list them. */
router.get('/companies', async (req, res) => {
	const scope = companyScope(req.user, 'c', 'code');
	const companies = await query(
		`SELECT c.code, c.name, c.short_name, c.status FROM wd_support_company c WHERE ${scope.sql} ORDER BY c.name`,
		scope.params,
	);
	res.json({ ok: true, companies });
});

/** Active hub users who can work tickets in a WD (assignment dropdown). */
router.get('/assignees', requirePerm('inbox.view'), async (req, res) => {
	const rows = await query(
		`SELECT u.id, u.display_name, u.all_companies, r.permissions,
			(SELECT GROUP_CONCAT(uc.company_code) FROM wd_support_user_company uc WHERE uc.user_id = u.id) AS companies
		 FROM wd_support_hub_user u LEFT JOIN wd_support_role r ON r.id = u.role_id
		 WHERE u.is_active = 1 ORDER BY u.display_name`,
	);
	const company = str(req.query.company);
	const users = rows
		.filter((u) => {
			const perms = parsePermissions(u.permissions);
			if (!perms.includes('inbox.reply')) return false;
			if (!company || Number(u.all_companies) === 1) return true;
			return String(u.companies || '').split(',').includes(company);
		})
		.map((u) => ({ id: Number(u.id), display_name: u.display_name }));
	res.json({ ok: true, users });
});

/** Sidebar badge: tickets waiting on the hub, and how many have unread WD messages. */
router.get('/inbox-counts', requirePerm('inbox.view'), async (req, res) => {
	const scope = companyScope(req.user);
	const row = await one(
		`SELECT SUM(t.status IN ('open','waiting_support')) AS needs_reply, SUM(t.unread_support = 1) AS unread
		 FROM wd_support_ticket t WHERE ${scope.sql}`,
		scope.params,
	);
	res.json({ ok: true, needs_reply: Number(row?.needs_reply || 0), unread: Number(row?.unread || 0) });
});

router.get('/tickets', requirePerm('inbox.view'), async (req, res) => {
	const company = str(req.query.company);
	const status = str(req.query.status);
	const assigned = str(req.query.assigned);
	const q = str(req.query.q).trim();
	const scope = companyScope(req.user);
	const where = [scope.sql];
	const params = [...scope.params];
	if (company && company !== 'all') {
		where.push('t.company_code = ?');
		params.push(company);
	}
	if (status === 'active') {
		where.push("t.status NOT IN ('resolved','closed')");
	} else if (TICKET_STATUSES.includes(status)) {
		where.push('t.status = ?');
		params.push(status);
	}
	if (assigned === 'me') {
		where.push('t.assigned_user_id = ?');
		params.push(req.user.id);
	} else if (assigned === 'none') {
		where.push('t.assigned_user_id IS NULL');
	}
	if (q) {
		const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
		where.push('(t.subject LIKE ? OR t.ticket_no LIKE ? OR t.user_name LIKE ?)');
		params.push(like, like, like);
	}
	const tickets = await query(
		`${TICKET_SELECT} WHERE ${where.join(' AND ')} ORDER BY t.last_message_at DESC, t.id DESC LIMIT 500`,
		params,
	);
	res.json({ ok: true, tickets, server_time: now() });
});

router.get('/tickets/:uuid', requirePerm('inbox.view'), async (req, res) => {
	const ticket = await scopedTicket(req, res);
	if (!ticket) return undefined;
	if (Number(ticket.unread_support) === 1) {
		await query('UPDATE wd_support_ticket SET unread_support = 0 WHERE uuid = ?', [ticket.uuid]);
		ticket.unread_support = 0;
	}
	const rows = await query('SELECT * FROM wd_support_message WHERE ticket_uuid = ? ORDER BY id ASC', [ticket.uuid]);
	const messages = rows.map(({ attachment_path: p, ...m }) => ({
		...m,
		attachment_url: p ? `/api/hub/attachments/${encodeURIComponent(m.uuid)}` : null,
	}));
	return res.json({ ok: true, ticket, messages, server_time: now() });
});

router.post('/tickets/:uuid/messages', requirePerm('inbox.reply'), upload.single('attachment'), async (req, res) => {
	const ticket = await scopedTicket(req, res, 'SELECT t.* FROM wd_support_ticket t');
	if (!ticket) return undefined;
	const body = str(req.body?.body).trim();
	if (!body && !req.file) return res.json({ ok: false, error: 'Type a message or attach a file.' });

	const attachmentPath = req.file
		? storeAttachment(ticket.company_code, ticket.uuid, req.file.originalname, req.file.buffer)
		: null;
	const ts = now();
	await query('INSERT INTO wd_support_message SET ?', [{
		uuid: uuid(),
		ticket_uuid: ticket.uuid,
		company_code: ticket.company_code,
		sender_side: 'support',
		sender_name: req.user.display_name,
		sender_user_id: req.user.id,
		body,
		attachment_path: attachmentPath,
		attachment_name: req.file ? req.file.originalname : null,
		created_at: ts,
	}]);
	const status = ticket.status === 'closed' ? 'closed' : 'waiting_client';
	await query(
		`UPDATE wd_support_ticket SET status = ?, unread_client = 1, unread_support = 0, last_message_at = ?, updated_at = ?,
			first_response_at = COALESCE(first_response_at, ?),
			assigned_user_id = COALESCE(assigned_user_id, ?)
		 WHERE uuid = ?`,
		[status, ts, ts, ts, req.user.id, ticket.uuid],
	);
	return res.json({ ok: true });
});

router.post('/tickets/:uuid/status', requirePerm('inbox.status'), async (req, res) => {
	const status = str(req.body?.status);
	if (!TICKET_STATUSES.includes(status)) return res.json({ ok: false, error: 'Invalid status' });
	const ticket = await scopedTicket(req, res, 'SELECT t.* FROM wd_support_ticket t');
	if (!ticket) return undefined;
	const ts = now();
	const stamps = status === ticket.status ? {} : statusTimestamps(status, ts);
	await query(
		`UPDATE wd_support_ticket SET status = ?, updated_at = ?, resolved_at = ?, closed_at = ? WHERE uuid = ?`,
		[status, ts,
			stamps.resolved_at === undefined ? ticket.resolved_at : stamps.resolved_at,
			stamps.closed_at === undefined ? ticket.closed_at : stamps.closed_at,
			ticket.uuid],
	);
	await audit(req, 'ticket.status', 'ticket', ticket.ticket_no, { company: ticket.company_code, from: ticket.status, to: status });
	return res.json({ ok: true });
});

router.post('/tickets/:uuid/assign', requirePerm('inbox.assign'), async (req, res) => {
	const ticket = await scopedTicket(req, res, 'SELECT t.* FROM wd_support_ticket t');
	if (!ticket) return undefined;
	const userId = parseInt(req.body?.user_id, 10) || null;
	let assignee = null;
	if (userId) {
		assignee = await one('SELECT id, display_name, all_companies, is_active FROM wd_support_hub_user WHERE id = ? LIMIT 1', [userId]);
		if (!assignee || Number(assignee.is_active) !== 1) return res.json({ ok: false, error: 'That user is not available.' });
		if (Number(assignee.all_companies) !== 1) {
			const ok = await one('SELECT 1 AS ok FROM wd_support_user_company WHERE user_id = ? AND company_code = ?', [userId, ticket.company_code]);
			if (!ok) return res.json({ ok: false, error: `${assignee.display_name} has no access to this Water District.` });
		}
	}
	await query('UPDATE wd_support_ticket SET assigned_user_id = ? WHERE uuid = ?', [userId, ticket.uuid]);
	await audit(req, 'ticket.assign', 'ticket', ticket.ticket_no, {
		company: ticket.company_code, assigned_to: assignee ? assignee.display_name : '(unassigned)',
	});
	return res.json({ ok: true });
});

const INLINE_TYPES = {
	jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', pdf: 'application/pdf',
};

router.get('/attachments/:uuid', requirePerm('inbox.view'), async (req, res) => {
	const row = await one('SELECT attachment_path, attachment_name, company_code FROM wd_support_message WHERE uuid = ? LIMIT 1', [req.params.uuid]);
	const file = row && canSeeCompany(req.user, row.company_code) ? resolveAttachment(row.attachment_path) : null;
	if (!file) return res.status(404).type('text/plain').send('Not found');
	const name = (row.attachment_name || path.basename(file)).replace(/["\r\n]/g, '');
	const type = INLINE_TYPES[extensionOf(name)];
	res.set('X-Content-Type-Options', 'nosniff');
	res.type(type || 'application/octet-stream');
	res.set('Content-Disposition', `${type ? 'inline' : 'attachment'}; filename="${name.replace(/[^\x20-\x7e]/g, '_')}"`);
	return res.sendFile(file);
});

router.post('/push-tokens', async (req, res) => {
	const token = str(req.body?.token).trim();
	if (!token || token.length > 4096) return res.json({ ok: false, error: 'Invalid token' });
	await savePushToken(req.user.id, token, req.get('User-Agent'));
	res.json({ ok: true });
});

router.delete('/push-tokens', async (req, res) => {
	const token = str(req.body?.token).trim();
	if (token) await deletePushToken(req.user.id, token);
	res.json({ ok: true });
});

export default router;
