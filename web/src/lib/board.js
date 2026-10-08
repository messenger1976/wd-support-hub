/** Message Board labels shared by the list, the form and the preview. Keep in sync with server/src/board.js. */

export const CATEGORIES = [
	{ key: 'announcement', label: 'Announcement', icon: 'megaphone', color: '#0a6ba3', hint: 'News for every user' },
	{ key: 'update', label: 'System update', icon: 'sparkle', color: '#1a9e8f', hint: 'New features and changes' },
	{ key: 'maintenance', label: 'Maintenance', icon: 'tool', color: '#e8590c', hint: 'Downtime and service windows' },
	{ key: 'guide', label: 'How-to guide', icon: 'book', color: '#7b4bb3', hint: 'Step-by-step help' },
	{ key: 'tip', label: 'Tip', icon: 'bulb', color: '#c99a06', hint: 'Short time-savers' },
];

export const CATEGORY = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));

export const PRIORITIES = [
	{ key: 'normal', label: 'Normal', badge: 'info', hint: 'Shown in the usual colours' },
	{ key: 'important', label: 'Important', badge: 'warning', hint: 'Highlighted in amber' },
	{ key: 'critical', label: 'Critical', badge: 'danger', hint: 'Red; users cannot opt out' },
];

export const PRIORITY = Object.fromEntries(PRIORITIES.map((p) => [p.key, p]));

export const AUDIENCES = [
	{ key: 'all', label: 'All users', hint: 'Admin and staff accounts' },
	{ key: 'admin', label: 'Admin only', hint: 'The WD administrator account' },
	{ key: 'staff', label: 'Staff only', hint: 'Every non-admin user' },
];

export const STATES = {
	live: { label: 'Live', badge: 'success', hint: 'Showing in the WD apps now' },
	scheduled: { label: 'Scheduled', badge: 'info', hint: 'Will start showing at its start time' },
	draft: { label: 'Draft', badge: 'secondary', hint: 'Not visible to any Water District' },
	ended: { label: 'Ended', badge: 'light', hint: 'Past its end time; still listed in the WD archive for 90 days' },
	archived: { label: 'Archived', badge: 'dark', hint: 'Hidden from the Water Districts' },
};

const pad = (n) => String(n).padStart(2, '0');

/** Date → 'YYYY-MM-DDTHH:mm' for <input type="datetime-local">. */
export function toInput(d) {
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 'Y-m-d H:i:s' (hub clock) → datetime-local value. */
export function dbToInput(s) {
	return s ? String(s).slice(0, 16).replace(' ', 'T') : '';
}

export function inputToDate(v) {
	if (!v) return null;
	const d = new Date(v);
	return Number.isNaN(d.getTime()) ? null : d;
}

export function addDays(v, days) {
	const d = inputToDate(v) || new Date();
	d.setDate(d.getDate() + days);
	return toInput(d);
}

export function tomorrowAt(hour) {
	const d = new Date();
	d.setDate(d.getDate() + 1);
	d.setHours(hour, 0, 0, 0);
	return toInput(d);
}

/** "in 3 days", "2 h ago" between two Dates. */
export function relative(d, ref = new Date()) {
	if (!d) return '';
	const min = Math.round((d - ref) / 60000);
	const abs = Math.abs(min);
	const span = abs < 60 ? `${abs} min` : abs < 1440 ? `${Math.round(abs / 60)} h` : `${Math.round(abs / 1440)} day${Math.round(abs / 1440) === 1 ? '' : 's'}`;
	return min >= 0 ? `in ${span}` : `${span} ago`;
}

export const EMPTY_MESSAGE = {
	title: '',
	ticker_text: '',
	body_html: '',
	category: 'announcement',
	priority: 'normal',
	show_ticker: 1,
	show_popup: 1,
	require_ack: 0,
	allow_opt_out: 1,
	pinned: 0,
	audience: 'all',
	all_companies: 1,
	companies: [],
	starts_at: '',
	ends_at: '',
};

/** Starter content: hub staff pick one, then fill in the blanks. */
export const TEMPLATES = [
	{
		key: 'maintenance',
		label: 'Scheduled maintenance',
		hint: 'Warn users about downtime',
		days: 2,
		fields: {
			category: 'maintenance',
			priority: 'important',
			title: 'Scheduled system maintenance',
			ticker_text: 'The billing system will be unavailable on [date] from [time] to [time] for maintenance.',
			body_html: '<h2>Scheduled system maintenance</h2><p>The billing system will be <strong>unavailable</strong> on <strong>[date]</strong> from <strong>[start time]</strong> to <strong>[end time]</strong> while we apply updates.</p><h3>What you should do</h3><ul><li><p>Finish and save your work before the maintenance starts.</p></li><li><p>Print any reports you need during that time.</p></li><li><p>Sign in again after the maintenance window ends.</p></li></ul><p>Thank you for your patience.</p>',
			show_ticker: 1,
			show_popup: 1,
			require_ack: 0,
			allow_opt_out: 1,
		},
	},
	{
		key: 'feature',
		label: 'New feature',
		hint: 'Announce something new',
		days: 14,
		fields: {
			category: 'update',
			priority: 'normal',
			title: 'New in your billing system: [feature]',
			ticker_text: 'New: [feature] is now available. Open the dashboard announcement to see how it works.',
			body_html: '<h2>[Feature name] is now available</h2><p>[One sentence on what it does and who it helps.]</p><h3>Where to find it</h3><p>Go to <strong>[Menu] → [Page]</strong>.</p><h3>What changed</h3><ul><li><p>[Change 1]</p></li><li><p>[Change 2]</p></li></ul><p>Questions? Open <strong>Message Support</strong> and we will help.</p>',
			show_ticker: 1,
			show_popup: 1,
			require_ack: 0,
			allow_opt_out: 1,
		},
	},
	{
		key: 'guide',
		label: 'How-to guide',
		hint: 'Teach a task step by step',
		days: 0,
		fields: {
			category: 'guide',
			priority: 'normal',
			title: 'How to [do the task]',
			ticker_text: 'How-to: [do the task] in 3 steps. Tap to read the guide.',
			body_html: '<h2>How to [do the task]</h2><p>[When you would need this.]</p><ol><li><p>Open <strong>[Menu] → [Page]</strong>.</p></li><li><p>[Second step]. Add a screenshot with the image button.</p></li><li><p>Click <strong>[Save]</strong>.</p></li></ol><blockquote><p>Tip: [a short tip that avoids a common mistake].</p></blockquote>',
			show_ticker: 1,
			show_popup: 0,
			require_ack: 0,
			allow_opt_out: 1,
		},
	},
	{
		key: 'reminder',
		label: 'Reminder',
		hint: 'Deadlines and policies',
		days: 7,
		fields: {
			category: 'announcement',
			priority: 'important',
			title: 'Reminder: [deadline or policy]',
			ticker_text: 'Reminder: [deadline or policy] on [date].',
			body_html: '<h2>Reminder: [deadline or policy]</h2><p>Please remember that <strong>[what must happen]</strong> by <strong>[date]</strong>.</p><p>[Why it matters, in one sentence.]</p>',
			show_ticker: 1,
			show_popup: 1,
			require_ack: 1,
			allow_opt_out: 0,
		},
	},
];
