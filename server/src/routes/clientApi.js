import fs from 'node:fs';
import express from 'express';
import { absolutizeAssets } from '../board.js';
import { one, query } from '../db.js';
import { notifySupportUsers } from '../firebase.js';
import { now, resolveAttachment, statusTimestamps, storeAttachment, str } from '../util.js';

/*
 * REST API used by the Water District apps (client-plugin/messagesupport_model.php).
 * The contract is unchanged from the PHP hub: Bearer company token, and
 *   POST {hub}api.php?action=push   (or /api/push)
 *   GET  {hub}api.php?action=poll&since=Y-m-d H:i:s   (or /api/poll)
 * Message Board (client-plugin/messageboard_model.php):
 *   GET  {hub}api.php?action=board            (or /api/board)
 *   POST {hub}api.php?action=board_receipts   (or /api/board-receipts)
 */
const router = express.Router();

// The WD apps always send JSON, but PHP read the raw body regardless of Content-Type.
const jsonBody = express.json({ limit: '30mb', type: () => true });

async function companyAuth(req, res, next) {
	const header = req.get('Authorization') || '';
	// Some cPanel/Apache proxies drop Authorization before it reaches Node; X-WD-Token survives.
	const token = /^Bearer\s+/i.test(header)
		? header.replace(/^Bearer\s+/i, '').trim()
		: String(req.get('X-WD-Token') || '').trim();
	if (!token) {
		return res.status(401).json({ ok: false, error: 'Invalid company token (no token reached the hub).' });
	}
	const company = await one('SELECT * FROM wd_support_company WHERE token = ? LIMIT 1', [token]);
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

/** Upcoming messages are sent early so the WD can show them on time from its cache, even if the hub is unreachable then. */
const BOARD_LOOKAHEAD_DAYS = 7;
/** Ended messages stay listed this long on the WD's Announcements & Guides page. */
const BOARD_HISTORY_DAYS = 90;
const DAY_MS = 86400000;

/** Full snapshot of the Message Board for this WD; the WD replaces its cache with it. */
async function board(req, res) {
	const code = req.company.code;
	const ts = now();
	const rows = await query(
		`SELECT m.uuid, m.title, m.ticker_text, m.body_html, m.category, m.priority, m.show_ticker, m.show_popup, m.require_ack,
			m.allow_opt_out, m.pinned, m.audience, m.starts_at, m.ends_at, m.version, m.updated_at
		 FROM wd_board_message m
		 WHERE m.status = 'published'
			AND (m.all_companies = 1 OR EXISTS (SELECT 1 FROM wd_board_message_company mc WHERE mc.message_id = m.id AND mc.company_code = ?))
			AND m.starts_at <= ?
			AND (m.ends_at IS NULL OR m.ends_at > ?)
		 ORDER BY m.pinned DESC, FIELD(m.priority, 'critical', 'important', 'normal'), m.starts_at DESC
		 LIMIT 200`,
		[code, now(BOARD_LOOKAHEAD_DAYS * DAY_MS), now(-BOARD_HISTORY_DAYS * DAY_MS)],
	);
	const messages = rows.map((m) => ({
		...m,
		body_html: absolutizeAssets(m.body_html),
		show_ticker: Number(m.show_ticker),
		show_popup: Number(m.show_popup),
		require_ack: Number(m.require_ack),
		allow_opt_out: Number(m.allow_opt_out),
		pinned: Number(m.pinned),
		version: Number(m.version),
	}));
	res.json({ ok: true, messages, server_time: ts });
}

const RECEIPT_EVENTS = ['view', 'ack', 'optout', 'optin'];

/** Batched "seen / acknowledged / don't show again" events from WD users, for the hub's read statistics. */
async function boardReceipts(req, res) {
	const code = req.company.code;
	const events = Array.isArray(req.body?.events) ? req.body.events.slice(0, 500) : [];
	if (!events.length) return res.json({ ok: true, accepted: 0 });
	const ts = now();
	const uuids = [...new Set(events.map((e) => str(e?.message_uuid)).filter(Boolean))];
	const known = uuids.length
		? new Set((await query(
			`SELECT m.uuid FROM wd_board_message m WHERE m.uuid IN (?)
				AND (m.all_companies = 1 OR EXISTS (SELECT 1 FROM wd_board_message_company mc WHERE mc.message_id = m.id AND mc.company_code = ?))`,
			[uuids, code],
		)).map((r) => r.uuid))
		: new Set();
	let accepted = 0;
	for (const e of events) {
		const messageUuid = str(e?.message_uuid);
		const userKey = str(e?.user_key).slice(0, 80);
		const event = str(e?.event);
		if (!known.has(messageUuid) || !/^[A-Za-z0-9_.:-]+$/.test(userKey) || !RECEIPT_EVENTS.includes(event)) continue;
		const rawAt = str(e?.at).replace(/[^0-9:\- ]/g, '');
		const at = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(rawAt) && rawAt <= ts ? rawAt : ts;
		const version = Math.max(1, parseInt(e?.version, 10) || 1);
		const userName = str(e?.user_name).slice(0, 150);
		const row = await one(
			'SELECT * FROM wd_board_receipt WHERE message_uuid = ? AND company_code = ? AND wd_user_key = ? LIMIT 1',
			[messageUuid, code, userKey],
		);
		// A "show again" edit (higher version) starts acknowledgement and opt-out over.
		const fresh = !row || version > Number(row.version);
		const r = {
			view_count: Number(row?.view_count || 0),
			first_viewed_at: row?.first_viewed_at || null,
			last_viewed_at: row?.last_viewed_at || null,
			acked_at: fresh ? null : row.acked_at,
			opted_out_at: fresh ? null : row.opted_out_at,
		};
		if (row && version < Number(row.version) && event !== 'view') continue;
		if (event === 'view') {
			r.view_count += 1;
			r.first_viewed_at = r.first_viewed_at && r.first_viewed_at < at ? r.first_viewed_at : at;
			r.last_viewed_at = r.last_viewed_at && r.last_viewed_at > at ? r.last_viewed_at : at;
		} else if (event === 'ack') {
			r.acked_at = r.acked_at || at;
		} else if (event === 'optout') {
			r.opted_out_at = at;
		} else {
			r.opted_out_at = null;
		}
		const fields = { ...r, user_name: userName || row?.user_name || '', version: Math.max(version, Number(row?.version || 1)), updated_at: ts };
		if (row) {
			await query('UPDATE wd_board_receipt SET ? WHERE id = ?', [fields, row.id]);
		} else {
			await query('INSERT INTO wd_board_receipt SET ?', [{ ...fields, message_uuid: messageUuid, company_code: code, wd_user_key: userKey }]);
		}
		accepted += 1;
	}
	return res.json({ ok: true, accepted });
}

router.all('/api.php', companyAuth, jsonBody, async (req, res) => {
	const action = str(req.query.action);
	if (action === 'push' && req.method === 'POST') return push(req, res);
	if (action === 'poll') return poll(req, res);
	if (action === 'board') return board(req, res);
	if (action === 'board_receipts' && req.method === 'POST') return boardReceipts(req, res);
	return res.status(404).json({ ok: false, error: 'Unknown action' });
});
router.post('/api/push', companyAuth, jsonBody, push);
router.all('/api/poll', companyAuth, poll);
router.get('/api/board', companyAuth, board);
router.post('/api/board-receipts', companyAuth, jsonBody, boardReceipts);

export default router;
