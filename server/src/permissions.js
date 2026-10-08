import { query } from './db.js';
import { clientIp, now } from './util.js';

/** Every permission the hub checks. Grouped by module; this list drives the role editor grid. */
export const PERMISSION_GROUPS = [
	{ module: 'dashboard', label: 'Dashboard', actions: [{ key: 'dashboard.view', label: 'View' }] },
	{
		module: 'inbox',
		label: 'Inbox (tickets)',
		actions: [
			{ key: 'inbox.view', label: 'View' },
			{ key: 'inbox.reply', label: 'Reply' },
			{ key: 'inbox.status', label: 'Change status' },
			{ key: 'inbox.assign', label: 'Assign' },
		],
	},
	{
		module: 'board',
		label: 'Message Board',
		actions: [
			{ key: 'board.view', label: 'View' },
			{ key: 'board.create', label: 'Create / edit drafts' },
			{ key: 'board.publish', label: 'Publish / schedule / archive' },
			{ key: 'board.delete', label: 'Delete' },
			{ key: 'board.stats', label: 'View read statistics' },
		],
	},
	{
		module: 'companies',
		label: 'WD Setup',
		actions: [
			{ key: 'companies.view', label: 'View' },
			{ key: 'companies.create', label: 'Create' },
			{ key: 'companies.edit', label: 'Edit' },
			{ key: 'companies.deactivate', label: 'Deactivate / delete' },
			{ key: 'companies.token', label: 'View / rotate API token' },
		],
	},
	{
		module: 'reports',
		label: 'Reports',
		actions: [
			{ key: 'reports.view', label: 'View' },
			{ key: 'reports.export', label: 'Export CSV' },
		],
	},
	{
		module: 'users',
		label: 'Users & roles',
		actions: [
			{ key: 'users.view', label: 'View users' },
			{ key: 'users.manage', label: 'Manage users' },
			{ key: 'roles.manage', label: 'Manage roles' },
		],
	},
	{ module: 'audit', label: 'Audit log', actions: [{ key: 'audit.view', label: 'View' }] },
];

export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((g) => g.actions.map((a) => a.key));

/** Role JSON → list of keys. "*" (Administrator) expands to every current permission. */
export function parsePermissions(raw) {
	let list;
	try {
		list = JSON.parse(raw || '[]');
	} catch {
		list = [];
	}
	if (!Array.isArray(list)) return [];
	if (list.includes('*')) return [...ALL_PERMISSIONS];
	return list.filter((k) => ALL_PERMISSIONS.includes(k));
}

export function isFullAccess(raw) {
	try {
		const list = JSON.parse(raw || '[]');
		return Array.isArray(list) && list.includes('*');
	} catch {
		return false;
	}
}

export function can(user, key) {
	return !!user?.permissions?.includes(key);
}

/** Passes when the user holds at least one of the keys. */
export function requirePerm(...keys) {
	return (req, res, next) => {
		if (keys.some((k) => can(req.user, k))) return next();
		return res.status(403).json({ ok: false, error: 'You do not have permission for this action.' });
	};
}

/** Water Districts the user may see; null means all of them. */
export function allowedCompanies(user) {
	return user?.all_companies ? null : (user?.companies || []);
}

export function canSeeCompany(user, code) {
	const allowed = allowedCompanies(user);
	return allowed === null || allowed.includes(code);
}

/** SQL fragment restricting `${alias}.${column}` to the user's Water Districts. */
export function companyScope(user, alias = 't', column = 'company_code') {
	const allowed = allowedCompanies(user);
	if (allowed === null) return { sql: '1=1', params: [] };
	if (!allowed.length) return { sql: '1=0', params: [] };
	return { sql: `${alias}.${column} IN (?)`, params: [allowed] };
}

const SECRET_KEYS = /pass|token|secret/i;

function scrub(details) {
	if (!details || typeof details !== 'object') return details;
	const out = {};
	for (const [k, v] of Object.entries(details)) {
		if (SECRET_KEYS.test(k)) continue;
		out[k] = v && typeof v === 'object' && !Array.isArray(v) ? scrub(v) : v;
	}
	return out;
}

/** Best-effort audit trail; never blocks or fails the request. */
export async function audit(req, action, entity, entityId, details) {
	try {
		const clean = scrub(details);
		await query('INSERT INTO wd_support_audit_log SET ?', [{
			user_id: req.user?.id || 0,
			user_name: req.user?.display_name || req.user?.username || '',
			action,
			entity: entity || '',
			entity_id: String(entityId ?? ''),
			details: clean && Object.keys(clean).length ? JSON.stringify(clean) : null,
			ip: clientIp(req),
			created_at: now(),
		}]);
	} catch (err) {
		console.error('[audit]', err.message);
	}
}
