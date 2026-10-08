import express from 'express';
import { one, query } from '../db.js';
import {
	ACTIVE_SQL, BREACH_SQL, FR_MIN, RES_AT, RES_MIN, breachParams, connectionState, num, parseRange, pct, ticketFilter,
} from '../analytics.js';
import { companyScope, requirePerm } from '../permissions.js';
import { now } from '../util.js';

const router = express.Router();

router.get('/dashboard', requirePerm('dashboard.view'), async (req, res) => {
	const range = parseRange(req.query);
	const { where, params } = ticketFilter(req);
	const W = where.join(' AND ');
	const FROM = 'FROM wd_support_ticket t LEFT JOIN wd_support_company c ON c.code = t.company_code';
	const inRange = 't.created_at BETWEEN ? AND ?';
	const ts = now();

	const live = await one(
		`SELECT
			SUM(${ACTIVE_SQL}) AS active,
			SUM(t.status IN ('open','waiting_support')) AS needs_reply,
			SUM(t.status = 'waiting_client') AS waiting_client,
			SUM(t.unread_support = 1) AS unread,
			SUM(${ACTIVE_SQL} AND t.assigned_user_id IS NULL) AS unassigned,
			SUM(${ACTIVE_SQL} AND t.assigned_user_id = ?) AS mine,
			SUM(${BREACH_SQL}) AS sla_breached
		 ${FROM} WHERE ${W}`,
		[req.user.id, ...breachParams(), ...params],
	);

	const period = await one(
		`SELECT COUNT(*) AS created,
			SUM(t.first_response_at IS NOT NULL) AS responded,
			AVG(CASE WHEN t.first_response_at IS NOT NULL THEN ${FR_MIN} END) AS avg_first_response_min,
			SUM(t.first_response_at IS NOT NULL AND ${FR_MIN} <= c.sla_first_response_hours * 60) AS fr_within_sla,
			SUM(t.priority IN ('high','urgent')) AS urgent_count
		 ${FROM} WHERE ${W} AND ${inRange}`,
		[...params, range.from, range.to],
	);

	const resolved = await one(
		`SELECT COUNT(*) AS resolved, AVG(${RES_MIN}) AS avg_resolution_min,
			SUM(${RES_MIN} <= c.sla_resolution_hours * 60) AS res_within_sla
		 ${FROM} WHERE ${W} AND ${RES_AT} BETWEEN ? AND ?`,
		[...params, range.from, range.to],
	);

	const msgScope = companyScope(req.user, 'm');
	const msgWhere = [msgScope.sql, 'm.created_at BETWEEN ? AND ?'];
	const msgParams = [...msgScope.params, range.from, range.to];
	if (req.query.company && req.query.company !== 'all') {
		msgWhere.push('m.company_code = ?');
		msgParams.push(String(req.query.company));
	}
	const messages = await one(
		`SELECT SUM(m.sender_side = 'client') AS from_wd, SUM(m.sender_side = 'support') AS from_hub
		 FROM wd_support_message m WHERE ${msgWhere.join(' AND ')}`,
		msgParams,
	);

	// Trend: tickets created vs resolved per day.
	const createdDaily = await query(
		`SELECT DATE_FORMAT(t.created_at, '%Y-%m-%d') AS d, COUNT(*) AS n ${FROM} WHERE ${W} AND ${inRange} GROUP BY d`,
		[...params, range.from, range.to],
	);
	const resolvedDaily = await query(
		`SELECT DATE_FORMAT(${RES_AT}, '%Y-%m-%d') AS d, COUNT(*) AS n ${FROM} WHERE ${W} AND ${RES_AT} BETWEEN ? AND ? GROUP BY d`,
		[...params, range.from, range.to],
	);
	const toMap = (rows) => Object.fromEntries(rows.map((r) => [r.d, Number(r.n)]));
	const cMap = toMap(createdDaily);
	const rMap = toMap(resolvedDaily);
	const trend = range.days.map((d) => ({ date: d, created: cMap[d] || 0, resolved: rMap[d] || 0 }));

	const group = (col) => query(
		`SELECT ${col} AS k, COUNT(*) AS n ${FROM} WHERE ${W} AND ${inRange} GROUP BY k ORDER BY n DESC`,
		[...params, range.from, range.to],
	);
	const [byStatus, byCategory, byPriority, byHour] = await Promise.all([
		group('t.status'), group('t.category'), group('t.priority'), group('HOUR(t.created_at)'),
	]);
	const hours = Array.from({ length: 24 }, (_, h) => Number(byHour.find((r) => Number(r.k) === h)?.n || 0));

	const byCompany = await query(
		`SELECT t.company_code AS code, COALESCE(NULLIF(c.short_name, ''), c.name, t.company_code) AS name,
			COUNT(*) AS created,
			SUM(${ACTIVE_SQL}) AS active,
			SUM(t.status IN ('resolved','closed')) AS done
		 ${FROM} WHERE ${W} AND ${inRange} GROUP BY t.company_code, name ORDER BY created DESC`,
		[...params, range.from, range.to],
	);

	const attention = await query(
		`SELECT t.uuid, t.ticket_no, t.subject, t.status, t.priority, t.category, t.company_code, t.created_at,
			t.last_message_at, t.first_response_at, c.sla_first_response_hours, c.sla_resolution_hours,
			COALESCE(NULLIF(c.short_name, ''), c.name, t.company_code) AS company_name,
			a.display_name AS assigned_name, ${BREACH_SQL} AS breached,
			TIMESTAMPDIFF(MINUTE, t.last_message_at, ?) AS waiting_min
		 ${FROM} LEFT JOIN wd_support_hub_user a ON a.id = t.assigned_user_id
		 WHERE ${W} AND t.status IN ('open','waiting_support')
		 ORDER BY breached DESC, FIELD(t.priority, 'high', 'urgent') DESC, t.last_message_at ASC
		 LIMIT 8`,
		[...breachParams(), ts, ...params],
	);

	const cScope = companyScope(req.user, 'c', 'code');
	const health = await query(
		`SELECT c.code, c.name, c.short_name, c.status, c.last_seen,
			(SELECT COUNT(*) FROM wd_support_ticket t WHERE t.company_code = c.code AND ${ACTIVE_SQL}) AS active,
			(SELECT COUNT(*) FROM wd_support_ticket t WHERE t.company_code = c.code AND t.status IN ('open','waiting_support')) AS needs_reply,
			(SELECT MIN(t.last_message_at) FROM wd_support_ticket t WHERE t.company_code = c.code AND t.status IN ('open','waiting_support')) AS oldest_waiting
		 FROM wd_support_company c WHERE ${cScope.sql} ORDER BY c.status = 'active' DESC, c.name`,
		cScope.params,
	);
	const wds = health.map((h) => ({ ...h, connection: connectionState(h.last_seen, ts) }));
	const activeWds = wds.filter((w) => w.status === 'active');

	res.json({
		ok: true,
		range: { from: range.fromDate, to: range.toDate },
		server_time: ts,
		kpis: {
			active: Number(live?.active || 0),
			needs_reply: Number(live?.needs_reply || 0),
			waiting_client: Number(live?.waiting_client || 0),
			unread: Number(live?.unread || 0),
			unassigned: Number(live?.unassigned || 0),
			mine: Number(live?.mine || 0),
			sla_breached: Number(live?.sla_breached || 0),
			created: Number(period?.created || 0),
			high_priority: Number(period?.urgent_count || 0),
			resolved: Number(resolved?.resolved || 0),
			avg_first_response_min: num(period?.avg_first_response_min),
			avg_resolution_min: num(resolved?.avg_resolution_min),
			fr_sla_pct: pct(period?.fr_within_sla, period?.responded),
			res_sla_pct: pct(resolved?.res_within_sla, resolved?.resolved),
			messages_from_wd: Number(messages?.from_wd || 0),
			messages_from_hub: Number(messages?.from_hub || 0),
			wds_total: activeWds.length,
			wds_online: activeWds.filter((w) => w.connection.state === 'online').length,
		},
		trend,
		by_status: byStatus.map((r) => ({ key: r.k, count: Number(r.n) })),
		by_category: byCategory.map((r) => ({ key: r.k, count: Number(r.n) })),
		by_priority: byPriority.map((r) => ({ key: r.k, count: Number(r.n) })),
		by_hour: hours,
		by_company: byCompany.map((r) => ({
			code: r.code, name: r.name, created: Number(r.created), active: Number(r.active), done: Number(r.done),
		})),
		attention: attention.map((r) => ({ ...r, breached: Number(r.breached) === 1, waiting_min: num(r.waiting_min) })),
		wds,
	});
});

export default router;
