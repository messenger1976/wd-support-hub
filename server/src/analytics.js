import { companyScope } from './permissions.js';
import { now, str } from './util.js';

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Hub statuses where the ball is in the hub's court. */
export const NEEDS_REPLY = ['open', 'waiting_support'];
export const ACTIVE_SQL = "t.status NOT IN ('resolved','closed')";

/** Minutes from creation to first hub reply / to resolution (resolved, else closed). */
export const FR_MIN = 'TIMESTAMPDIFF(MINUTE, t.created_at, t.first_response_at)';
export const RES_AT = 'COALESCE(t.resolved_at, t.closed_at)';
export const RES_MIN = `TIMESTAMPDIFF(MINUTE, t.created_at, ${RES_AT})`;

/**
 * ?range=7|30|90|365 (days ending today) or ?from=YYYY-MM-DD&to=YYYY-MM-DD.
 * Returns inclusive wall-clock bounds plus the list of days for trend charts.
 */
export function parseRange(q) {
	const today = new Date();
	let from;
	let to;
	if (DATE_RE.test(str(q.from)) && DATE_RE.test(str(q.to))) {
		from = new Date(`${q.from}T00:00:00`);
		to = new Date(`${q.to}T00:00:00`);
		if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) from = null;
		if (from && from > to) [from, to] = [to, from];
	}
	if (!from) {
		const days = [7, 30, 90, 365].includes(Number(q.range)) ? Number(q.range) : 30;
		to = new Date(today.getFullYear(), today.getMonth(), today.getDate());
		from = new Date(to);
		from.setDate(from.getDate() - (days - 1));
	}
	// Cap custom ranges at two years so trend series stay small.
	const maxFrom = new Date(to);
	maxFrom.setDate(maxFrom.getDate() - 730);
	if (from < maxFrom) from = maxFrom;

	const days = [];
	for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) days.push(ymd(d));
	return { from: `${ymd(from)} 00:00:00`, to: `${ymd(to)} 23:59:59`, fromDate: ymd(from), toDate: ymd(to), days };
}

/** Scope + optional ?company filter for ticket queries aliased `t`. */
export function ticketFilter(req, alias = 't') {
	const scope = companyScope(req.user, alias);
	const where = [scope.sql];
	const params = [...scope.params];
	const company = str(req.query.company);
	if (company && company !== 'all') {
		where.push(`${alias}.company_code = ?`);
		params.push(company);
	}
	return { where, params };
}

/** SQL expression (needs company alias `c`): 1 when an active ticket is past its SLA, as of `?` (now). */
export const BREACH_SQL = `(${ACTIVE_SQL} AND (
	(t.first_response_at IS NULL AND TIMESTAMPDIFF(MINUTE, t.created_at, ?) > COALESCE(c.sla_first_response_hours, 4) * 60)
	OR TIMESTAMPDIFF(MINUTE, t.created_at, ?) > COALESCE(c.sla_resolution_hours, 72) * 60
))`;

export function breachParams() {
	const ts = now();
	return [ts, ts];
}

const ONLINE_MINUTES = 5;
const IDLE_MINUTES = 24 * 60;

/** WD apps call the hub while Message Support is in use: online ≤ 5 min, idle ≤ 24 h, else offline. */
export function connectionState(lastSeen, ts = now()) {
	if (!lastSeen) return { state: 'never', minutes: null };
	const minutes = Math.max(0, Math.round((new Date(ts.replace(' ', 'T')) - new Date(lastSeen.replace(' ', 'T'))) / 60000));
	if (minutes <= ONLINE_MINUTES) return { state: 'online', minutes };
	if (minutes <= IDLE_MINUTES) return { state: 'idle', minutes };
	return { state: 'offline', minutes };
}

export function num(v, digits = 0) {
	if (v === null || v === undefined) return null;
	const n = Number(v);
	if (!Number.isFinite(n)) return null;
	const f = 10 ** digits;
	return Math.round(n * f) / f;
}

export function pct(part, total) {
	const p = Number(part);
	const t = Number(total);
	return t > 0 ? Math.round((p / t) * 1000) / 10 : null;
}
