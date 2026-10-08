export const STATUS_LABELS = {
	open: 'Open',
	waiting_support: 'Waiting support',
	waiting_client: 'Waiting WD',
	resolved: 'Resolved',
	closed: 'Closed',
};

export const STATUS_COLORS = {
	open: '#2196f3',
	waiting_support: '#ffc241',
	waiting_client: '#1dc9b7',
	resolved: '#4caf50',
	closed: '#868e96',
};

export const PRIORITY_COLORS = { low: '#adb5bd', normal: '#6c757d', high: '#fd7e14', urgent: '#dc3545' };

export const BRAND_PALETTE = ['#584475', '#1dc9b7', '#ffc241', '#2196f3', '#fd3995', '#4caf50', '#fd7e14', '#868e96', '#8e44ad', '#20c997'];

export function can(user, key) {
	return !!user?.permissions?.includes(key);
}

/** 'Y-m-d H:i:s' (hub wall clock) → Date. */
export function toDate(s) {
	if (!s) return null;
	const d = new Date(String(s).replace(' ', 'T'));
	return Number.isNaN(d.getTime()) ? null : d;
}

/** Minutes → "45m", "3h 20m", "2d 4h". */
export function fmtMinutes(m) {
	if (m === null || m === undefined || m === '') return '—';
	const n = Math.round(Number(m));
	if (!Number.isFinite(n)) return '—';
	if (n < 60) return `${n}m`;
	if (n < 1440) {
		const h = Math.floor(n / 60);
		const mm = n % 60;
		return mm ? `${h}h ${mm}m` : `${h}h`;
	}
	const d = Math.floor(n / 1440);
	const h = Math.floor((n % 1440) / 60);
	return h ? `${d}d ${h}h` : `${d}d`;
}

export function fmtDateTime(s) {
	const d = toDate(s);
	if (!d) return '—';
	return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function fmtDate(s) {
	const d = toDate(s);
	return d ? d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
}

/** "just now", "5 min ago", "3 h ago", else a short date. `now` is the hub's server_time when known. */
export function fmtAgo(s, now) {
	const d = toDate(s);
	if (!d) return 'never';
	const ref = toDate(now) || new Date();
	const min = Math.round((ref - d) / 60000);
	if (min < 1) return 'just now';
	if (min < 60) return `${min} min ago`;
	if (min < 1440) return `${Math.round(min / 60)} h ago`;
	if (min < 1440 * 7) return `${Math.round(min / 1440)} d ago`;
	return fmtDate(s);
}

export function fmtPct(v) {
	return v === null || v === undefined ? '—' : `${Number(v).toFixed(Number(v) % 1 ? 1 : 0)}%`;
}

export function fmtInt(v) {
	return v === null || v === undefined ? '—' : Number(v).toLocaleString();
}

/**
 * SLA state of a ticket as of `now` (hub time):
 *   { level: 'breach'|'warn'|'ok'|'done', label }
 * Needs the ticket's sla_first_response_hours / sla_resolution_hours (joined by the API).
 */
export function slaState(t, now) {
	if (!t || ['resolved', 'closed'].includes(t.status)) return { level: 'done', label: '' };
	const created = toDate(t.created_at);
	const ref = toDate(now) || new Date();
	if (!created) return { level: 'ok', label: '' };
	const ageMin = (ref - created) / 60000;
	const frMin = Number(t.sla_first_response_hours || 4) * 60;
	const resMin = Number(t.sla_resolution_hours || 72) * 60;
	if (!t.first_response_at) {
		if (ageMin > frMin) return { level: 'breach', label: `Reply overdue ${fmtMinutes(ageMin - frMin)}` };
		if (ageMin > frMin * 0.75) return { level: 'warn', label: `Reply due in ${fmtMinutes(frMin - ageMin)}` };
	}
	if (ageMin > resMin) return { level: 'breach', label: `Overdue ${fmtMinutes(ageMin - resMin)}` };
	if (ageMin > resMin * 0.75) return { level: 'warn', label: `Due in ${fmtMinutes(resMin - ageMin)}` };
	return { level: 'ok', label: '' };
}

export function initials(name) {
	return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?';
}

/** Query string from an object, skipping empty values. */
export function qs(obj) {
	const p = new URLSearchParams();
	Object.entries(obj).forEach(([k, v]) => {
		if (v !== undefined && v !== null && v !== '') p.set(k, v);
	});
	const s = p.toString();
	return s ? `?${s}` : '';
}
