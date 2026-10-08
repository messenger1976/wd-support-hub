import express from 'express';
import { one, query } from '../db.js';
import { requirePerm } from '../permissions.js';
import { str } from '../util.js';

const router = express.Router();
const PAGE_SIZE = 50;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

router.get('/audit', requirePerm('audit.view'), async (req, res) => {
	const page = Math.max(1, parseInt(req.query.page, 10) || 1);
	const where = ['1=1'];
	const params = [];
	const entity = str(req.query.entity);
	if (['company', 'user', 'role', 'ticket', 'report'].includes(entity)) {
		where.push('l.entity = ?');
		params.push(entity);
	}
	const userId = parseInt(req.query.user_id, 10);
	if (userId) {
		where.push('l.user_id = ?');
		params.push(userId);
	}
	const q = str(req.query.q).trim();
	if (q) {
		const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
		where.push('(l.action LIKE ? OR l.entity_id LIKE ? OR l.user_name LIKE ? OR l.details LIKE ?)');
		params.push(like, like, like, like);
	}
	if (DATE_RE.test(str(req.query.from))) {
		where.push('l.created_at >= ?');
		params.push(`${req.query.from} 00:00:00`);
	}
	if (DATE_RE.test(str(req.query.to))) {
		where.push('l.created_at <= ?');
		params.push(`${req.query.to} 23:59:59`);
	}
	const W = where.join(' AND ');
	const total = await one(`SELECT COUNT(*) AS n FROM wd_support_audit_log l WHERE ${W}`, params);
	const rows = await query(
		`SELECT l.* FROM wd_support_audit_log l WHERE ${W} ORDER BY l.id DESC LIMIT ? OFFSET ?`,
		[...params, PAGE_SIZE, (page - 1) * PAGE_SIZE],
	);
	const users = await query('SELECT DISTINCT user_id, user_name FROM wd_support_audit_log WHERE user_id > 0 ORDER BY user_name');
	res.json({
		ok: true,
		page,
		page_size: PAGE_SIZE,
		total: Number(total?.n || 0),
		users,
		entries: rows.map((r) => {
			let details = null;
			try {
				details = r.details ? JSON.parse(r.details) : null;
			} catch {
				details = r.details;
			}
			return { ...r, details };
		}),
	});
});

export default router;
