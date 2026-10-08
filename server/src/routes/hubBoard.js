import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { one, query } from '../db.js';
import {
	BOARD_IMAGE_EXTENSIONS, BOARD_IMAGE_MAX_BYTES, boardState, publishProblem, readMessage, saveTargets, targetsOf,
} from '../board.js';
import { allowedCompanies, audit, can, requirePerm } from '../permissions.js';
import { extensionOf, now, stamp, str, uuid } from '../util.js';

/*
 * Message Board: announcements, updates and how-to guides that the WD apps show as a ticker and a login popup.
 * Hub staff limited to some Water Districts may only target (and manage messages for) those WDs.
 */
const router = express.Router();

const IMAGE_TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };

const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: BOARD_IMAGE_MAX_BYTES, files: 1 },
	fileFilter(req, file, cb) {
		const ok = BOARD_IMAGE_EXTENSIONS.includes(extensionOf(file.originalname));
		cb(ok ? null : Object.assign(new Error('Images only: JPG, PNG, GIF or WebP.'), { status: 400, expose: true }), ok);
	},
});

/** All targets inside the user's Water Districts (or the user covers every WD). */
function canManage(user, msg, companies) {
	const allowed = allowedCompanies(user);
	if (allowed === null) return true;
	if (Number(msg.all_companies)) return false;
	return companies.length > 0 && companies.every((c) => allowed.includes(c));
}

function canSee(user, msg, companies) {
	const allowed = allowedCompanies(user);
	if (allowed === null || Number(msg.all_companies)) return true;
	return companies.some((c) => allowed.includes(c));
}

function present(m, companies, ts, extra = {}) {
	return {
		...m,
		companies,
		state: boardState(m, ts),
		show_ticker: Number(m.show_ticker),
		show_popup: Number(m.show_popup),
		require_ack: Number(m.require_ack),
		allow_opt_out: Number(m.allow_opt_out),
		pinned: Number(m.pinned),
		all_companies: Number(m.all_companies),
		version: Number(m.version),
		...extra,
	};
}

/** Loads a message the user may see, with its targets; sends 404 otherwise. */
async function scopedMessage(req, res) {
	const m = await one('SELECT * FROM wd_board_message WHERE uuid = ? LIMIT 1', [str(req.params.uuid)]);
	const companies = m ? (await targetsOf([m.id])).get(m.id) : [];
	if (!m || !canSee(req.user, m, companies)) {
		res.status(404).json({ ok: false, error: 'Message not found.' });
		return null;
	}
	return { m, companies };
}

/** Target WDs must exist and be within the user's scope. Returns an error string or ''. */
async function targetProblem(user, data, companies) {
	const allowed = allowedCompanies(user);
	if (data.all_companies && allowed !== null) return 'Your account covers only some Water Districts, so choose them one by one.';
	if (!companies.length) return '';
	const rows = await query('SELECT code FROM wd_support_company WHERE code IN (?)', [companies]);
	if (rows.length !== companies.length) return 'One of the chosen Water Districts no longer exists.';
	if (allowed !== null && companies.some((c) => !allowed.includes(c))) return 'You can only send to the Water Districts assigned to you.';
	return '';
}

async function receiptCounts(uuids) {
	const map = new Map();
	if (!uuids.length) return map;
	const rows = await query(
		`SELECT message_uuid, COUNT(*) AS viewers, SUM(acked_at IS NOT NULL) AS acks, SUM(opted_out_at IS NOT NULL) AS opted_out
		 FROM wd_board_receipt WHERE message_uuid IN (?) GROUP BY message_uuid`,
		[uuids],
	);
	rows.forEach((r) => map.set(r.message_uuid, {
		viewers: Number(r.viewers || 0), acks: Number(r.acks || 0), opted_out: Number(r.opted_out || 0),
	}));
	return map;
}

router.get('/board', requirePerm('board.view'), async (req, res) => {
	const state = str(req.query.state);
	const company = str(req.query.company).toUpperCase();
	const category = str(req.query.category);
	const q = str(req.query.q).trim();
	const where = ['1=1'];
	const params = [];
	if (category) {
		where.push('m.category = ?');
		params.push(category);
	}
	if (q) {
		const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
		where.push('(m.title LIKE ? OR m.ticker_text LIKE ?)');
		params.push(like, like);
	}
	const rows = await query(
		`SELECT m.id, m.uuid, m.title, m.ticker_text, m.category, m.priority, m.show_ticker, m.show_popup, m.require_ack,
			m.allow_opt_out, m.pinned, m.audience, m.all_companies, m.starts_at, m.ends_at, m.status, m.version, m.published_at,
			m.created_by_name, m.updated_by_name, m.created_at, m.updated_at
		 FROM wd_board_message m WHERE ${where.join(' AND ')}
		 ORDER BY m.pinned DESC, m.starts_at DESC, m.id DESC LIMIT 500`,
		params,
	);
	const ts = now();
	const targets = await targetsOf(rows.map((r) => r.id));
	const counts = can(req.user, 'board.stats') ? await receiptCounts(rows.map((r) => r.uuid)) : new Map();
	const all = rows
		.map((r) => present(r, targets.get(r.id) || [], ts, {
			stats: counts.get(r.uuid) || (can(req.user, 'board.stats') ? { viewers: 0, acks: 0, opted_out: 0 } : null),
			can_manage: canManage(req.user, r, targets.get(r.id) || []),
		}))
		.filter((m) => canSee(req.user, m, m.companies))
		.filter((m) => !company || m.all_companies || m.companies.includes(company));
	const stateCounts = { live: 0, scheduled: 0, draft: 0, ended: 0, archived: 0 };
	all.forEach((m) => { stateCounts[m.state] += 1; });
	const messages = state ? all.filter((m) => m.state === state) : all.filter((m) => m.state !== 'archived');
	res.json({ ok: true, messages, counts: stateCounts, server_time: ts });
});

router.get('/board/:uuid', requirePerm('board.view'), async (req, res) => {
	const found = await scopedMessage(req, res);
	if (!found) return undefined;
	const { m, companies } = found;
	return res.json({ ok: true, message: present(m, companies, now(), { can_manage: canManage(req.user, m, companies) }), server_time: now() });
});

router.post('/board', requirePerm('board.create'), async (req, res) => {
	const { data, companies, error } = readMessage(req.body);
	if (error) return res.json({ ok: false, error });
	const problem = await targetProblem(req.user, data, companies);
	if (problem) return res.json({ ok: false, error: problem });
	const publish = !!req.body?.publish;
	if (publish) {
		if (!can(req.user, 'board.publish')) return res.json({ ok: false, error: 'Your role can save drafts only. Ask someone who can publish.' });
		const why = publishProblem(data, companies);
		if (why) return res.json({ ok: false, error: why });
	}
	const ts = now();
	const id = uuid();
	const result = await query('INSERT INTO wd_board_message SET ?', [{
		...data,
		uuid: id,
		status: publish ? 'published' : 'draft',
		published_at: publish ? ts : null,
		created_by: req.user.id,
		created_by_name: req.user.display_name,
		updated_by: req.user.id,
		updated_by_name: req.user.display_name,
		created_at: ts,
		updated_at: ts,
	}]);
	await saveTargets(result.insertId, companies);
	await audit(req, publish ? 'board.publish' : 'board.create', 'board', id, {
		title: data.title, companies: data.all_companies ? 'ALL' : companies.join(','), starts_at: data.starts_at, ends_at: data.ends_at,
	});
	return res.json({ ok: true, uuid: id });
});

router.post('/board/:uuid', requirePerm('board.create'), async (req, res) => {
	const found = await scopedMessage(req, res);
	if (!found) return undefined;
	const { m, companies: before } = found;
	if (!canManage(req.user, m, before)) return res.status(403).json({ ok: false, error: 'This message targets Water Districts outside your access.' });
	if (m.status !== 'draft' && !can(req.user, 'board.publish')) {
		return res.json({ ok: false, error: 'Only users who can publish may edit a published message.' });
	}
	const { data, companies, error } = readMessage(req.body);
	if (error) return res.json({ ok: false, error });
	const problem = await targetProblem(req.user, data, companies);
	if (problem) return res.json({ ok: false, error: problem });
	if (m.status === 'published') {
		const why = publishProblem(data, companies);
		if (why) return res.json({ ok: false, error: why });
	}
	const showAgain = !!req.body?.show_again && m.status === 'published';
	await query('UPDATE wd_board_message SET ?, version = version + ?, updated_by = ?, updated_by_name = ?, updated_at = ? WHERE id = ?', [
		data, showAgain ? 1 : 0, req.user.id, req.user.display_name, now(), m.id,
	]);
	await saveTargets(m.id, companies);
	const changed = Object.keys(data).filter((k) => String(m[k] ?? '') !== String(data[k] ?? ''));
	await audit(req, 'board.update', 'board', m.uuid, { title: data.title, changed, show_again: showAgain });
	return res.json({ ok: true });
});

async function setStatus(req, res, status, action) {
	const found = await scopedMessage(req, res);
	if (!found) return undefined;
	const { m, companies } = found;
	if (!canManage(req.user, m, companies)) return res.status(403).json({ ok: false, error: 'This message targets Water Districts outside your access.' });
	if (status === 'published') {
		const why = publishProblem(m, companies);
		if (why) return res.json({ ok: false, error: why });
	}
	const ts = now();
	await query(
		'UPDATE wd_board_message SET status = ?, published_at = IF(? = \'published\', COALESCE(published_at, ?), published_at), updated_by = ?, updated_by_name = ?, updated_at = ? WHERE id = ?',
		[status, status, ts, req.user.id, req.user.display_name, ts, m.id],
	);
	await audit(req, action, 'board', m.uuid, { title: m.title });
	return res.json({ ok: true });
}

router.post('/board/:uuid/publish', requirePerm('board.publish'), (req, res) => setStatus(req, res, 'published', 'board.publish'));
router.post('/board/:uuid/unpublish', requirePerm('board.publish'), (req, res) => setStatus(req, res, 'draft', 'board.unpublish'));
router.post('/board/:uuid/archive', requirePerm('board.publish'), (req, res) => setStatus(req, res, 'archived', 'board.archive'));

/** Ends a live message now (keeps it in the WD archive page as Ended). */
router.post('/board/:uuid/end-now', requirePerm('board.publish'), async (req, res) => {
	const found = await scopedMessage(req, res);
	if (!found) return undefined;
	const { m, companies } = found;
	if (!canManage(req.user, m, companies)) return res.status(403).json({ ok: false, error: 'This message targets Water Districts outside your access.' });
	const ts = now();
	await query('UPDATE wd_board_message SET ends_at = ?, updated_by = ?, updated_by_name = ?, updated_at = ? WHERE id = ?', [
		ts, req.user.id, req.user.display_name, ts, m.id,
	]);
	await audit(req, 'board.end_now', 'board', m.uuid, { title: m.title });
	return res.json({ ok: true });
});

router.post('/board/:uuid/duplicate', requirePerm('board.create'), async (req, res) => {
	const found = await scopedMessage(req, res);
	if (!found) return undefined;
	const { m, companies } = found;
	const allowed = allowedCompanies(req.user);
	const keep = allowed === null ? companies : companies.filter((c) => allowed.includes(c));
	const ts = now();
	const id = uuid();
	const {
		id: oldId, uuid: oldUuid, status, version, published_at: pub, created_at: ca, updated_at: ua, ...copy
	} = m;
	const result = await query('INSERT INTO wd_board_message SET ?', [{
		...copy,
		uuid: id,
		title: `Copy of ${m.title}`.slice(0, 200),
		all_companies: allowed === null ? m.all_companies : 0,
		starts_at: ts,
		ends_at: null,
		status: 'draft',
		version: 1,
		published_at: null,
		created_by: req.user.id,
		created_by_name: req.user.display_name,
		updated_by: req.user.id,
		updated_by_name: req.user.display_name,
		created_at: ts,
		updated_at: ts,
	}]);
	await saveTargets(result.insertId, keep);
	await audit(req, 'board.duplicate', 'board', id, { from: oldUuid, title: m.title });
	return res.json({ ok: true, uuid: id });
});

router.delete('/board/:uuid', requirePerm('board.delete'), async (req, res) => {
	const found = await scopedMessage(req, res);
	if (!found) return undefined;
	const { m, companies } = found;
	if (!canManage(req.user, m, companies)) return res.status(403).json({ ok: false, error: 'This message targets Water Districts outside your access.' });
	await query('DELETE FROM wd_board_message_company WHERE message_id = ?', [m.id]);
	await query('DELETE FROM wd_board_receipt WHERE message_uuid = ?', [m.uuid]);
	await query('DELETE FROM wd_board_message WHERE id = ?', [m.id]);
	await audit(req, 'board.delete', 'board', m.uuid, { title: m.title });
	return res.json({ ok: true });
});

router.get('/board/:uuid/stats', requirePerm('board.stats'), async (req, res) => {
	const found = await scopedMessage(req, res);
	if (!found) return undefined;
	const { m, companies } = found;
	const allowed = allowedCompanies(req.user);
	const targetRows = Number(m.all_companies)
		? await query("SELECT code, name, short_name FROM wd_support_company WHERE status = 'active' ORDER BY name")
		: companies.length ? await query('SELECT code, name, short_name FROM wd_support_company WHERE code IN (?) ORDER BY name', [companies]) : [];
	const targets = targetRows.filter((c) => allowed === null || allowed.includes(c.code));
	const receipts = (await query(
		`SELECT company_code, user_name, view_count, first_viewed_at, last_viewed_at, acked_at, opted_out_at, version
		 FROM wd_board_receipt WHERE message_uuid = ? ORDER BY company_code, user_name`,
		[m.uuid],
	)).filter((r) => allowed === null || allowed.includes(r.company_code));
	const byCompany = targets.map((c) => {
		const rows = receipts.filter((r) => r.company_code === c.code);
		return {
			code: c.code,
			name: c.short_name || c.name,
			viewers: rows.length,
			views: rows.reduce((n, r) => n + Number(r.view_count || 0), 0),
			acks: rows.filter((r) => r.acked_at).length,
			opted_out: rows.filter((r) => r.opted_out_at).length,
			last_viewed_at: rows.reduce((max, r) => (r.last_viewed_at && r.last_viewed_at > max ? r.last_viewed_at : max), ''),
		};
	});
	return res.json({ ok: true, companies: byCompany, receipts, version: Number(m.version), require_ack: Number(m.require_ack) });
});

router.post('/board-assets', requirePerm('board.create'), upload.single('image'), async (req, res) => {
	if (!req.file) return res.json({ ok: false, error: 'Choose an image.' });
	const ext = extensionOf(req.file.originalname);
	const id = uuid();
	const dir = path.join(config.uploadDir, 'board');
	fs.mkdirSync(dir, { recursive: true });
	const full = path.join(dir, `${stamp()}_${id}.${ext}`);
	fs.writeFileSync(full, req.file.buffer);
	await query('INSERT INTO wd_board_asset SET ?', [{
		uuid: id,
		file_path: full,
		original_name: str(req.file.originalname).slice(0, 255),
		mime: IMAGE_TYPES[ext],
		size_bytes: req.file.size,
		uploaded_by: req.user.id,
		created_at: now(),
	}]);
	return res.json({ ok: true, url: `/board-assets/${id}` });
});

export default router;
