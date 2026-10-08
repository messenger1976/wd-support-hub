import express from 'express';
import { query } from '../db.js';
import {
	ACTIVE_SQL, FR_MIN, RES_AT, RES_MIN, breachParams, BREACH_SQL, connectionState, num, parseRange, pct, ticketFilter,
} from '../analytics.js';
import { audit, can, companyScope, requirePerm } from '../permissions.js';
import { TICKET_STATUSES, now, str } from '../util.js';

/*
 * Column types understood by the web app and the CSV writer:
 *   text | int | pct | min (duration in minutes) | datetime | status | priority
 */
const router = express.Router();

const FROM = `FROM wd_support_ticket t
	LEFT JOIN wd_support_company c ON c.code = t.company_code
	LEFT JOIN wd_support_hub_user a ON a.id = t.assigned_user_id`;
const WD_NAME = "COALESCE(NULLIF(c.short_name, ''), c.name, t.company_code)";

function statusFilter(req, where, params) {
	const status = str(req.query.status);
	if (status === 'active') where.push(ACTIVE_SQL);
	else if (TICKET_STATUSES.includes(status)) {
		where.push('t.status = ?');
		params.push(status);
	}
}

const REPORTS = {
	'wd-summary': {
		title: 'Water District Summary',
		description: 'Tickets raised per Water District in the period, with status mix, response times and SLA compliance.',
		filters: ['range', 'company'],
		async run(req, range) {
			const { where, params } = ticketFilter(req);
			const rows = await query(
				`SELECT t.company_code AS code, ${WD_NAME} AS wd,
					COUNT(*) AS total,
					SUM(t.status = 'open') AS open_n,
					SUM(t.status = 'waiting_support') AS waiting_support,
					SUM(t.status = 'waiting_client') AS waiting_client,
					SUM(t.status = 'resolved') AS resolved,
					SUM(t.status = 'closed') AS closed,
					AVG(CASE WHEN t.first_response_at IS NOT NULL THEN ${FR_MIN} END) AS avg_fr,
					AVG(CASE WHEN ${RES_AT} IS NOT NULL THEN ${RES_MIN} END) AS avg_res,
					SUM(t.first_response_at IS NOT NULL) AS responded,
					SUM(t.first_response_at IS NOT NULL AND ${FR_MIN} <= c.sla_first_response_hours * 60) AS fr_ok,
					SUM(${RES_AT} IS NOT NULL) AS res_n,
					SUM(${RES_AT} IS NOT NULL AND ${RES_MIN} <= c.sla_resolution_hours * 60) AS res_ok
				 ${FROM} WHERE ${where.join(' AND ')} AND t.created_at BETWEEN ? AND ?
				 GROUP BY t.company_code, wd ORDER BY total DESC`,
				[...params, range.from, range.to],
			);
			return {
				columns: [
					{ key: 'wd', label: 'Water District' },
					{ key: 'total', label: 'Tickets', type: 'int' },
					{ key: 'open_n', label: 'Open', type: 'int' },
					{ key: 'waiting_support', label: 'Waiting support', type: 'int' },
					{ key: 'waiting_client', label: 'Waiting WD', type: 'int' },
					{ key: 'resolved', label: 'Resolved', type: 'int' },
					{ key: 'closed', label: 'Closed', type: 'int' },
					{ key: 'avg_fr', label: 'Avg first response', type: 'min' },
					{ key: 'avg_res', label: 'Avg resolution', type: 'min' },
					{ key: 'fr_sla', label: 'First-response SLA', type: 'pct' },
					{ key: 'res_sla', label: 'Resolution SLA', type: 'pct' },
				],
				rows: rows.map((r) => ({
					wd: r.wd,
					total: Number(r.total),
					open_n: Number(r.open_n),
					waiting_support: Number(r.waiting_support),
					waiting_client: Number(r.waiting_client),
					resolved: Number(r.resolved),
					closed: Number(r.closed),
					avg_fr: num(r.avg_fr),
					avg_res: num(r.avg_res),
					fr_sla: pct(r.fr_ok, r.responded),
					res_sla: pct(r.res_ok, r.res_n),
				})),
				chart: { type: 'bar', label: 'wd', series: ['open_n', 'waiting_support', 'waiting_client', 'resolved', 'closed'], stacked: true },
			};
		},
	},

	register: {
		title: 'Ticket Register',
		description: 'Every ticket raised in the period with its owner, timings and SLA outcome.',
		filters: ['range', 'company', 'status'],
		async run(req, range) {
			const { where, params } = ticketFilter(req);
			statusFilter(req, where, params);
			const rows = await query(
				`SELECT t.ticket_no, ${WD_NAME} AS wd, t.subject, t.category, t.priority, t.status, t.user_name,
					a.display_name AS assigned, t.created_at, t.first_response_at, ${RES_AT} AS done_at,
					${FR_MIN} AS fr_min, ${RES_MIN} AS res_min,
					c.sla_first_response_hours AS fr_sla_h, ${BREACH_SQL} AS breached
				 ${FROM} WHERE ${where.join(' AND ')} AND t.created_at BETWEEN ? AND ?
				 ORDER BY t.created_at DESC LIMIT 5000`,
				[...breachParams(), ...params, range.from, range.to],
			);
			return {
				columns: [
					{ key: 'ticket_no', label: 'Ticket' },
					{ key: 'wd', label: 'Water District' },
					{ key: 'subject', label: 'Subject' },
					{ key: 'category', label: 'Category' },
					{ key: 'priority', label: 'Priority', type: 'priority' },
					{ key: 'status', label: 'Status', type: 'status' },
					{ key: 'user_name', label: 'Requested by' },
					{ key: 'assigned', label: 'Assigned to' },
					{ key: 'created_at', label: 'Created', type: 'datetime' },
					{ key: 'fr_min', label: 'First response', type: 'min' },
					{ key: 'res_min', label: 'Resolution', type: 'min' },
					{ key: 'sla', label: 'SLA' },
				],
				rows: rows.map((r) => {
					let sla = '';
					if (Number(r.breached) === 1) sla = 'Breached';
					else if (r.fr_min !== null) sla = Number(r.fr_min) <= Number(r.fr_sla_h) * 60 ? 'Met' : 'Late reply';
					else sla = 'Pending';
					return {
						ticket_no: r.ticket_no,
						wd: r.wd,
						subject: r.subject,
						category: r.category,
						priority: r.priority,
						status: r.status,
						user_name: r.user_name,
						assigned: r.assigned || '',
						created_at: r.created_at,
						fr_min: num(r.fr_min),
						res_min: num(r.res_min),
						sla,
					};
				}),
			};
		},
	},

	sla: {
		title: 'Response & Resolution Time (SLA)',
		description: 'Per Water District and month: how fast the hub replied and resolved, against each WD\'s SLA targets.',
		filters: ['range', 'company'],
		async run(req, range) {
			const { where, params } = ticketFilter(req);
			const rows = await query(
				`SELECT DATE_FORMAT(t.created_at, '%Y-%m') AS month, ${WD_NAME} AS wd,
					MAX(c.sla_first_response_hours) AS fr_target, MAX(c.sla_resolution_hours) AS res_target,
					COUNT(*) AS total,
					SUM(t.first_response_at IS NOT NULL) AS responded,
					SUM(t.first_response_at IS NOT NULL AND ${FR_MIN} <= c.sla_first_response_hours * 60) AS fr_ok,
					AVG(CASE WHEN t.first_response_at IS NOT NULL THEN ${FR_MIN} END) AS avg_fr,
					MAX(${FR_MIN}) AS max_fr,
					SUM(${RES_AT} IS NOT NULL) AS res_n,
					SUM(${RES_AT} IS NOT NULL AND ${RES_MIN} <= c.sla_resolution_hours * 60) AS res_ok,
					AVG(CASE WHEN ${RES_AT} IS NOT NULL THEN ${RES_MIN} END) AS avg_res
				 ${FROM} WHERE ${where.join(' AND ')} AND t.created_at BETWEEN ? AND ?
				 GROUP BY month, t.company_code, wd ORDER BY month DESC, wd`,
				[...params, range.from, range.to],
			);
			return {
				columns: [
					{ key: 'month', label: 'Month' },
					{ key: 'wd', label: 'Water District' },
					{ key: 'targets', label: 'Targets (reply / resolve)' },
					{ key: 'total', label: 'Tickets', type: 'int' },
					{ key: 'responded', label: 'Replied', type: 'int' },
					{ key: 'avg_fr', label: 'Avg first response', type: 'min' },
					{ key: 'max_fr', label: 'Slowest reply', type: 'min' },
					{ key: 'fr_sla', label: 'Reply SLA met', type: 'pct' },
					{ key: 'res_n', label: 'Resolved', type: 'int' },
					{ key: 'avg_res', label: 'Avg resolution', type: 'min' },
					{ key: 'res_sla', label: 'Resolve SLA met', type: 'pct' },
				],
				rows: rows.map((r) => ({
					month: r.month,
					wd: r.wd,
					targets: `${r.fr_target}h / ${r.res_target}h`,
					total: Number(r.total),
					responded: Number(r.responded),
					avg_fr: num(r.avg_fr),
					max_fr: num(r.max_fr),
					fr_sla: pct(r.fr_ok, r.responded),
					res_n: Number(r.res_n),
					avg_res: num(r.avg_res),
					res_sla: pct(r.res_ok, r.res_n),
				})),
			};
		},
	},

	categories: {
		title: 'Issue Category Analysis',
		description: 'Which problem areas (Billing, Payments, Reports, Login/Access…) generate tickets, per Water District.',
		filters: ['range', 'company'],
		async run(req, range) {
			const { where, params } = ticketFilter(req);
			const rows = await query(
				`SELECT t.category, t.company_code, ${WD_NAME} AS wd, COUNT(*) AS n,
					SUM(${ACTIVE_SQL}) AS active, AVG(CASE WHEN ${RES_AT} IS NOT NULL THEN ${RES_MIN} END) AS avg_res
				 ${FROM} WHERE ${where.join(' AND ')} AND t.created_at BETWEEN ? AND ?
				 GROUP BY t.category, t.company_code, wd`,
				[...params, range.from, range.to],
			);
			const wds = [...new Map(rows.map((r) => [r.company_code, r.wd])).entries()].sort((x, y) => x[1].localeCompare(y[1]));
			const byCat = new Map();
			let grand = 0;
			for (const r of rows) {
				const cur = byCat.get(r.category) || { category: r.category, total: 0, active: 0, resSum: 0, resN: 0 };
				cur.total += Number(r.n);
				cur.active += Number(r.active);
				cur[`wd_${r.company_code}`] = (cur[`wd_${r.company_code}`] || 0) + Number(r.n);
				if (r.avg_res !== null) {
					cur.resSum += Number(r.avg_res) * Number(r.n);
					cur.resN += Number(r.n);
				}
				byCat.set(r.category, cur);
				grand += Number(r.n);
			}
			const out = [...byCat.values()].sort((x, y) => y.total - x.total).map(({ resSum, resN, ...c }) => {
				const row = { ...c, share: pct(c.total, grand), avg_res: resN ? num(resSum / resN) : null };
				for (const [code] of wds) row[`wd_${code}`] = row[`wd_${code}`] || 0;
				return row;
			});
			return {
				columns: [
					{ key: 'category', label: 'Category' },
					{ key: 'total', label: 'Tickets', type: 'int' },
					{ key: 'share', label: 'Share', type: 'pct' },
					...wds.map(([code, name]) => ({ key: `wd_${code}`, label: name, type: 'int' })),
					{ key: 'active', label: 'Still active', type: 'int' },
					{ key: 'avg_res', label: 'Avg resolution', type: 'min' },
				],
				rows: out,
				chart: { type: 'bar', label: 'category', series: wds.map(([code]) => `wd_${code}`), stacked: true },
			};
		},
	},

	aging: {
		title: 'Backlog Aging',
		description: 'Active tickets right now, bucketed by age, so old issues are not forgotten. Ignores the date range.',
		filters: ['company'],
		async run(req) {
			const { where, params } = ticketFilter(req);
			const ts = now();
			const AGE = 'TIMESTAMPDIFF(HOUR, t.created_at, ?)';
			const rows = await query(
				`SELECT ${WD_NAME} AS wd,
					SUM(${AGE} < 24) AS d0,
					SUM(${AGE} >= 24 AND ${AGE} < 72) AS d1,
					SUM(${AGE} >= 72 AND ${AGE} < 168) AS d3,
					SUM(${AGE} >= 168 AND ${AGE} < 720) AS d7,
					SUM(${AGE} >= 720) AS d30,
					COUNT(*) AS total,
					SUM(t.status IN ('open','waiting_support')) AS needs_reply,
					MAX(${AGE}) AS oldest_h
				 ${FROM} WHERE ${where.join(' AND ')} AND ${ACTIVE_SQL}
				 GROUP BY t.company_code, wd ORDER BY total DESC`,
				[...Array(9).fill(ts), ...params],
			);
			return {
				columns: [
					{ key: 'wd', label: 'Water District' },
					{ key: 'd0', label: '< 1 day', type: 'int' },
					{ key: 'd1', label: '1–3 days', type: 'int' },
					{ key: 'd3', label: '3–7 days', type: 'int' },
					{ key: 'd7', label: '7–30 days', type: 'int' },
					{ key: 'd30', label: '30+ days', type: 'int' },
					{ key: 'total', label: 'Active total', type: 'int' },
					{ key: 'needs_reply', label: 'Needs hub reply', type: 'int' },
					{ key: 'oldest', label: 'Oldest', type: 'min' },
				],
				rows: rows.map((r) => ({
					wd: r.wd,
					d0: Number(r.d0),
					d1: Number(r.d1),
					d3: Number(r.d3),
					d7: Number(r.d7),
					d30: Number(r.d30),
					total: Number(r.total),
					needs_reply: Number(r.needs_reply),
					oldest: r.oldest_h === null ? null : Number(r.oldest_h) * 60,
				})),
				chart: { type: 'bar', label: 'wd', series: ['d0', 'd1', 'd3', 'd7', 'd30'], stacked: true },
			};
		},
	},

	staff: {
		title: 'Staff Performance',
		description: 'Hub replies, tickets handled and resolved per support user in the period.',
		filters: ['range', 'company'],
		async run(req, range) {
			const mScope = companyScope(req.user, 'm');
			const tScope = ticketFilter(req);
			const company = str(req.query.company);
			const mWhere = [mScope.sql, "m.sender_side = 'support'", 'm.created_at BETWEEN ? AND ?'];
			const mParams = [...mScope.params, range.from, range.to];
			if (company && company !== 'all') {
				mWhere.push('m.company_code = ?');
				mParams.push(company);
			}
			const replies = await query(
				`SELECT m.sender_user_id AS uid, MAX(m.sender_name) AS name, COUNT(*) AS replies,
					COUNT(DISTINCT m.ticket_uuid) AS tickets, COUNT(DISTINCT m.company_code) AS wds
				 FROM wd_support_message m WHERE ${mWhere.join(' AND ')}
				 GROUP BY m.sender_user_id, CASE WHEN m.sender_user_id IS NULL THEN m.sender_name END`,
				mParams,
			);
			const owned = await query(
				`SELECT t.assigned_user_id AS uid,
					SUM(${ACTIVE_SQL}) AS assigned_active,
					SUM(${RES_AT} BETWEEN ? AND ?) AS resolved,
					AVG(CASE WHEN t.created_at BETWEEN ? AND ? AND t.first_response_at IS NOT NULL THEN ${FR_MIN} END) AS avg_fr
				 FROM wd_support_ticket t WHERE ${tScope.where.join(' AND ')} AND t.assigned_user_id IS NOT NULL
				 GROUP BY t.assigned_user_id`,
				[range.from, range.to, range.from, range.to, ...tScope.params],
			);
			const users = await query('SELECT id, display_name, is_active FROM wd_support_hub_user');
			const byId = new Map();
			const get = (uid, name) => {
				const key = uid ? `u${uid}` : `n${name}`;
				if (!byId.has(key)) {
					const u = uid ? users.find((x) => Number(x.id) === Number(uid)) : null;
					byId.set(key, {
						name: u ? u.display_name : (name || '(unknown)'),
						status: u ? (Number(u.is_active) === 1 ? 'Active' : 'Disabled') : 'Former / unlinked',
						replies: 0, tickets: 0, wds: 0, assigned_active: 0, resolved: 0, avg_fr: null,
					});
				}
				return byId.get(key);
			};
			for (const r of replies) Object.assign(get(r.uid, r.name), { replies: Number(r.replies), tickets: Number(r.tickets), wds: Number(r.wds) });
			for (const r of owned) {
				Object.assign(get(r.uid), {
					assigned_active: Number(r.assigned_active || 0), resolved: Number(r.resolved || 0), avg_fr: num(r.avg_fr),
				});
			}
			return {
				columns: [
					{ key: 'name', label: 'Support user' },
					{ key: 'status', label: 'Account' },
					{ key: 'replies', label: 'Replies sent', type: 'int' },
					{ key: 'tickets', label: 'Tickets replied to', type: 'int' },
					{ key: 'wds', label: 'WDs served', type: 'int' },
					{ key: 'resolved', label: 'Assigned & resolved', type: 'int' },
					{ key: 'assigned_active', label: 'Assigned, still active', type: 'int' },
					{ key: 'avg_fr', label: 'Avg first response (assigned)', type: 'min' },
				],
				rows: [...byId.values()].sort((x, y) => y.replies - x.replies),
				chart: { type: 'bar', label: 'name', series: ['replies', 'resolved'] },
			};
		},
	},

	connectivity: {
		title: 'WD Connectivity & Setup',
		description: 'Last contact from each Water District app, token rotation age and recent ticket volume. Ignores the date range.',
		filters: [],
		async run(req) {
			const scope = companyScope(req.user, 'c', 'code');
			const ts = now();
			const since = now(-30 * 24 * 3600 * 1000);
			const rows = await query(
				`SELECT c.code, c.name, c.status, c.ticket_prefix, c.last_seen, c.token_rotated_at, c.created_at,
					c.sla_first_response_hours, c.sla_resolution_hours,
					(SELECT COUNT(*) FROM wd_support_ticket t WHERE t.company_code = c.code AND ${ACTIVE_SQL}) AS active,
					(SELECT COUNT(*) FROM wd_support_ticket t WHERE t.company_code = c.code AND t.created_at >= ?) AS last30,
					(SELECT MAX(t.created_at) FROM wd_support_ticket t WHERE t.company_code = c.code) AS last_ticket
				 FROM wd_support_company c WHERE ${scope.sql} ORDER BY c.name`,
				[since, ...scope.params],
			);
			const label = { online: 'Online', idle: 'Idle', offline: 'Offline', never: 'Never connected' };
			return {
				columns: [
					{ key: 'name', label: 'Water District' },
					{ key: 'code', label: 'Code' },
					{ key: 'status', label: 'Hub status' },
					{ key: 'connection', label: 'Connection' },
					{ key: 'last_seen', label: 'Last contact', type: 'datetime' },
					{ key: 'token_rotated_at', label: 'Token rotated', type: 'datetime' },
					{ key: 'sla', label: 'SLA (reply / resolve)' },
					{ key: 'active', label: 'Active tickets', type: 'int' },
					{ key: 'last30', label: 'Tickets (30 days)', type: 'int' },
					{ key: 'last_ticket', label: 'Last ticket', type: 'datetime' },
				],
				rows: rows.map((r) => ({
					name: r.name,
					code: r.code,
					status: r.status === 'active' ? 'Active' : 'Deactivated',
					connection: label[connectionState(r.last_seen, ts).state],
					last_seen: r.last_seen,
					token_rotated_at: r.token_rotated_at,
					sla: `${r.sla_first_response_hours}h / ${r.sla_resolution_hours}h`,
					active: Number(r.active),
					last30: Number(r.last30),
					last_ticket: r.last_ticket,
				})),
			};
		},
	},
};

/* ---------- CSV ---------- */

function fmtMinutes(m) {
	if (m === null || m === undefined) return '';
	return (Number(m) / 60).toFixed(1);
}

function csvCell(v) {
	let s = v === null || v === undefined ? '' : String(v);
	// Spreadsheet formula injection guard.
	if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
	return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(columns, rows) {
	const head = columns.map((c) => csvCell(c.type === 'min' ? `${c.label} (hours)` : c.type === 'pct' ? `${c.label} (%)` : c.label));
	const lines = [head.join(',')];
	for (const r of rows) {
		lines.push(columns.map((c) => csvCell(c.type === 'min' ? fmtMinutes(r[c.key]) : r[c.key])).join(','));
	}
	return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/* ---------- Routes ---------- */

router.get('/reports', requirePerm('reports.view'), (req, res) => {
	res.json({
		ok: true,
		reports: Object.entries(REPORTS).map(([key, r]) => ({ key, title: r.title, description: r.description, filters: r.filters })),
	});
});

router.get('/reports/:type', requirePerm('reports.view'), async (req, res) => {
	const report = REPORTS[req.params.type];
	if (!report) return res.status(404).json({ ok: false, error: 'Unknown report.' });
	const range = parseRange(req.query);
	const result = await report.run(req, range);
	const meta = {
		key: req.params.type,
		title: report.title,
		description: report.description,
		filters: report.filters,
		range: report.filters.includes('range') ? { from: range.fromDate, to: range.toDate } : null,
		generated_at: now(),
		generated_by: req.user.display_name,
	};
	if (str(req.query.format) === 'csv') {
		if (!can(req.user, 'reports.export')) {
			return res.status(403).json({ ok: false, error: 'You do not have permission to export reports.' });
		}
		await audit(req, 'report.export', 'report', req.params.type, { company: str(req.query.company) || 'all', range: meta.range });
		const suffix = meta.range ? `_${meta.range.from}_to_${meta.range.to}` : `_${meta.generated_at.slice(0, 10)}`;
		res.set('Content-Type', 'text/csv; charset=utf-8');
		res.set('Content-Disposition', `attachment; filename="wd-support_${req.params.type}${suffix}.csv"`);
		return res.send(toCsv(result.columns, result.rows));
	}
	return res.json({ ok: true, ...meta, ...result });
});

export default router;
