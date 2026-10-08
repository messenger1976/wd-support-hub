import express from 'express';
import { one, query } from '../db.js';
import { hashPassword, updateUserPassword } from '../auth.js';
import {
	ALL_PERMISSIONS, PERMISSION_GROUPS, audit, isFullAccess, parsePermissions, requirePerm,
} from '../permissions.js';
import { isEmail, now, passwordPolicyError, str } from '../util.js';

const router = express.Router();

/* ---------- helpers ---------- */

async function roleById(id) {
	return one('SELECT * FROM wd_support_role WHERE id = ? LIMIT 1', [id]);
}

/** Active users holding a full-access (Administrator-type) role, optionally excluding one user. */
async function activeAdminCount(excludeUserId = 0) {
	const rows = await query(
		`SELECT u.id, r.permissions FROM wd_support_hub_user u INNER JOIN wd_support_role r ON r.id = u.role_id
		 WHERE u.is_active = 1 AND u.id <> ?`,
		[excludeUserId],
	);
	return rows.filter((r) => isFullAccess(r.permissions)).length;
}

/** Nobody may hand out more than they hold: only full-access users can grant full access or unheld keys. */
function grantError(user, role) {
	if (user.full_access) return '';
	if (isFullAccess(role.permissions)) return 'Only an Administrator can give someone the Administrator role.';
	const missing = parsePermissions(role.permissions).filter((k) => !user.permissions.includes(k));
	return missing.length ? 'You cannot give permissions that you do not have yourself.' : '';
}

async function validCompanyCodes(codes) {
	if (!Array.isArray(codes) || !codes.length) return [];
	const rows = await query('SELECT code FROM wd_support_company WHERE code IN (?)', [codes.map(String)]);
	return rows.map((r) => r.code);
}

async function setUserCompanies(userId, codes) {
	await query('DELETE FROM wd_support_user_company WHERE user_id = ?', [userId]);
	if (codes.length) {
		await query('INSERT INTO wd_support_user_company (user_id, company_code) VALUES ?', [codes.map((c) => [userId, c])]);
	}
}

/** Validates the shared user fields. Returns { data, companies } or { error }. */
async function readUser(body) {
	const b = body || {};
	const data = {
		display_name: str(b.display_name).trim(),
		email: str(b.email).trim(),
		role_id: parseInt(b.role_id, 10) || 0,
		is_active: b.is_active === false || b.is_active === 0 || b.is_active === '0' ? 0 : 1,
		all_companies: b.all_companies === true || b.all_companies === 1 || b.all_companies === '1' ? 1 : 0,
	};
	if (!data.display_name || data.display_name.length > 150) return { error: 'Enter the full name (max 150 characters).' };
	if (data.email && !isEmail(data.email)) return { error: 'Enter a valid email address.' };
	if (!(await roleById(data.role_id))) return { error: 'Choose a role.' };
	const companies = data.all_companies ? [] : await validCompanyCodes(b.companies);
	if (!data.all_companies && !companies.length) {
		return { error: 'Choose at least one Water District, or allow all Water Districts.' };
	}
	return { data, companies };
}

/* ---------- Users ---------- */

router.get('/users', requirePerm('users.view', 'users.manage'), async (req, res) => {
	const rows = await query(
		`SELECT u.id, u.username, u.display_name, u.email, u.role_id, u.is_active, u.all_companies, u.last_login_at, u.created_at,
			r.name AS role_name,
			(SELECT GROUP_CONCAT(uc.company_code ORDER BY uc.company_code) FROM wd_support_user_company uc WHERE uc.user_id = u.id) AS companies,
			(SELECT COUNT(*) FROM wd_support_ticket t WHERE t.assigned_user_id = u.id AND t.status NOT IN ('resolved','closed')) AS assigned_active
		 FROM wd_support_hub_user u LEFT JOIN wd_support_role r ON r.id = u.role_id
		 ORDER BY u.is_active DESC, u.display_name`,
	);
	res.json({
		ok: true,
		users: rows.map((u) => ({
			...u,
			id: Number(u.id),
			role_id: Number(u.role_id),
			is_active: Number(u.is_active) === 1,
			all_companies: Number(u.all_companies) === 1,
			companies: u.companies ? String(u.companies).split(',') : [],
			assigned_active: Number(u.assigned_active || 0),
		})),
	});
});

/** Roles + every Water District, for the user form. */
router.get('/users/meta', requirePerm('users.view', 'users.manage'), async (req, res) => {
	const roles = await query('SELECT id, name, description FROM wd_support_role ORDER BY id');
	const companies = await query('SELECT code, name, status FROM wd_support_company ORDER BY name');
	res.json({ ok: true, roles, companies });
});

router.post('/users', requirePerm('users.manage'), async (req, res) => {
	const username = str(req.body?.username).trim();
	if (!/^[A-Za-z0-9._-]{3,80}$/.test(username)) {
		return res.json({ ok: false, error: 'Username must be 3–80 letters, digits, dots, dashes or underscores.' });
	}
	if (await one('SELECT id FROM wd_support_hub_user WHERE username = ? LIMIT 1', [username])) {
		return res.json({ ok: false, error: 'That username is already taken.' });
	}
	const { data, companies, error } = await readUser(req.body);
	if (error) return res.json({ ok: false, error });
	const grant = grantError(req.user, await roleById(data.role_id));
	if (grant) return res.json({ ok: false, error: grant });
	const password = str(req.body?.password);
	const policy = passwordPolicyError(password);
	if (policy) return res.json({ ok: false, error: policy });
	const ts = now();
	const r = await query('INSERT INTO wd_support_hub_user SET ?', [{
		...data, username, password_hash: hashPassword(password), created_at: ts, updated_at: ts,
	}]);
	await setUserCompanies(r.insertId, companies);
	const role = await roleById(data.role_id);
	await audit(req, 'user.create', 'user', r.insertId, {
		username, role: role?.name, all_companies: !!data.all_companies, companies,
	});
	return res.json({ ok: true, id: r.insertId });
});

router.post('/users/:id', requirePerm('users.manage'), async (req, res) => {
	const id = parseInt(req.params.id, 10);
	const existing = await one(
		`SELECT u.*, r.permissions, r.name AS role_name FROM wd_support_hub_user u
		 LEFT JOIN wd_support_role r ON r.id = u.role_id WHERE u.id = ? LIMIT 1`,
		[id],
	);
	if (!existing) return res.status(404).json({ ok: false, error: 'User not found.' });
	const { data, companies, error } = await readUser(req.body);
	if (error) return res.json({ ok: false, error });

	const newRole = await roleById(data.role_id);
	if (!req.user.full_access && isFullAccess(existing.permissions)) {
		return res.json({ ok: false, error: 'Only an Administrator can change an Administrator account.' });
	}
	const grant = Number(existing.role_id) === data.role_id ? '' : grantError(req.user, newRole);
	if (grant) return res.json({ ok: false, error: grant });
	const wasAdmin = Number(existing.is_active) === 1 && isFullAccess(existing.permissions);
	const staysAdmin = data.is_active === 1 && isFullAccess(newRole.permissions);
	if (id === req.user.id && !data.is_active) return res.json({ ok: false, error: 'You cannot disable your own account.' });
	if (wasAdmin && !staysAdmin && (await activeAdminCount(id)) === 0) {
		return res.json({ ok: false, error: 'This is the last active Administrator. Make another Administrator first.' });
	}

	const password = str(req.body?.password);
	if (password) {
		const policy = passwordPolicyError(password);
		if (policy) return res.json({ ok: false, error: policy });
	}

	await query('UPDATE wd_support_hub_user SET ?, updated_at = ? WHERE id = ?', [data, now(), id]);
	await setUserCompanies(id, companies);
	if (password) await updateUserPassword(id, password);
	if (!data.is_active) await query('DELETE FROM wd_support_push_token WHERE user_id = ?', [id]);

	await audit(req, 'user.update', 'user', id, {
		username: existing.username,
		role: newRole.name,
		active: !!data.is_active,
		all_companies: !!data.all_companies,
		companies,
		password_reset: !!password,
	});
	return res.json({ ok: true });
});

router.delete('/users/:id', requirePerm('users.manage'), async (req, res) => {
	const id = parseInt(req.params.id, 10);
	if (id === req.user.id) return res.json({ ok: false, error: 'You cannot delete your own account.' });
	const existing = await one(
		`SELECT u.*, r.permissions FROM wd_support_hub_user u LEFT JOIN wd_support_role r ON r.id = u.role_id WHERE u.id = ? LIMIT 1`,
		[id],
	);
	if (!existing) return res.status(404).json({ ok: false, error: 'User not found.' });
	if (!req.user.full_access && isFullAccess(existing.permissions)) {
		return res.json({ ok: false, error: 'Only an Administrator can delete an Administrator account.' });
	}
	if (Number(existing.is_active) === 1 && isFullAccess(existing.permissions) && (await activeAdminCount(id)) === 0) {
		return res.json({ ok: false, error: 'This is the last active Administrator and cannot be deleted.' });
	}
	await query('UPDATE wd_support_ticket SET assigned_user_id = NULL WHERE assigned_user_id = ?', [id]);
	await query('DELETE FROM wd_support_user_company WHERE user_id = ?', [id]);
	await query('DELETE FROM wd_support_push_token WHERE user_id = ?', [id]);
	await query('DELETE FROM wd_support_password_reset WHERE user_id = ?', [id]);
	await query('DELETE FROM wd_support_hub_user WHERE id = ?', [id]);
	await audit(req, 'user.delete', 'user', id, { username: existing.username, display_name: existing.display_name });
	return res.json({ ok: true });
});

/* ---------- Roles ---------- */

router.get('/roles', requirePerm('users.view', 'users.manage', 'roles.manage'), async (req, res) => {
	const rows = await query(
		`SELECT r.*, (SELECT COUNT(*) FROM wd_support_hub_user u WHERE u.role_id = r.id) AS user_count
		 FROM wd_support_role r ORDER BY r.id`,
	);
	res.json({
		ok: true,
		groups: PERMISSION_GROUPS,
		roles: rows.map((r) => ({
			id: Number(r.id),
			name: r.name,
			description: r.description,
			is_system: Number(r.is_system) === 1,
			full_access: isFullAccess(r.permissions),
			permissions: parsePermissions(r.permissions),
			user_count: Number(r.user_count),
		})),
	});
});

function readRole(body) {
	const name = str(body?.name).trim();
	const description = str(body?.description).trim();
	if (!name || name.length > 80) return { error: 'Enter a role name (max 80 characters).' };
	if (description.length > 255) return { error: 'Description is too long (max 255 characters).' };
	const perms = Array.isArray(body?.permissions) ? body.permissions.map(String).filter((k) => ALL_PERMISSIONS.includes(k)) : [];
	if (!perms.length) return { error: 'Tick at least one permission.' };
	// Replying, changing status or assigning is meaningless without seeing the inbox.
	if (perms.some((k) => k.startsWith('inbox.')) && !perms.includes('inbox.view')) perms.push('inbox.view');
	if (perms.some((k) => k.startsWith('companies.')) && !perms.includes('companies.view')) perms.push('companies.view');
	if (perms.includes('reports.export') && !perms.includes('reports.view')) perms.push('reports.view');
	if (perms.includes('users.manage') && !perms.includes('users.view')) perms.push('users.view');
	return { name, description, permissions: [...new Set(perms)] };
}

router.post('/roles', requirePerm('roles.manage'), async (req, res) => {
	const role = readRole(req.body);
	if (role.error) return res.json({ ok: false, error: role.error });
	const grant = grantError(req.user, { permissions: JSON.stringify(role.permissions) });
	if (grant) return res.json({ ok: false, error: grant });
	if (await one('SELECT id FROM wd_support_role WHERE name = ? LIMIT 1', [role.name])) {
		return res.json({ ok: false, error: 'A role with that name already exists.' });
	}
	const ts = now();
	const r = await query('INSERT INTO wd_support_role SET ?', [{
		name: role.name, description: role.description, is_system: 0,
		permissions: JSON.stringify(role.permissions), created_at: ts, updated_at: ts,
	}]);
	await audit(req, 'role.create', 'role', r.insertId, { name: role.name, permissions: role.permissions });
	return res.json({ ok: true, id: r.insertId });
});

router.post('/roles/:id', requirePerm('roles.manage'), async (req, res) => {
	const id = parseInt(req.params.id, 10);
	const existing = await roleById(id);
	if (!existing) return res.status(404).json({ ok: false, error: 'Role not found.' });
	const fullAccess = isFullAccess(existing.permissions);
	// The Administrator role always keeps every permission (including future ones).
	if (fullAccess && !req.user.full_access) {
		return res.json({ ok: false, error: 'Only an Administrator can edit the Administrator role.' });
	}
	const role = readRole(fullAccess ? { ...req.body, permissions: ['dashboard.view'] } : req.body);
	if (role.error) return res.json({ ok: false, error: role.error });
	const grant = fullAccess ? '' : grantError(req.user, { permissions: JSON.stringify(role.permissions) });
	if (grant) return res.json({ ok: false, error: grant });
	if (await one('SELECT id FROM wd_support_role WHERE name = ? AND id <> ? LIMIT 1', [role.name, id])) {
		return res.json({ ok: false, error: 'A role with that name already exists.' });
	}
	await query('UPDATE wd_support_role SET name = ?, description = ?, permissions = ?, updated_at = ? WHERE id = ?', [
		role.name, role.description, fullAccess ? existing.permissions : JSON.stringify(role.permissions), now(), id,
	]);
	await audit(req, 'role.update', 'role', id, { name: role.name, permissions: fullAccess ? ['*'] : role.permissions });
	return res.json({ ok: true });
});

router.delete('/roles/:id', requirePerm('roles.manage'), async (req, res) => {
	const id = parseInt(req.params.id, 10);
	const existing = await roleById(id);
	if (!existing) return res.status(404).json({ ok: false, error: 'Role not found.' });
	if (Number(existing.is_system) === 1) return res.json({ ok: false, error: 'Built-in roles cannot be deleted.' });
	const used = await one('SELECT COUNT(*) AS n FROM wd_support_hub_user WHERE role_id = ?', [id]);
	if (Number(used?.n || 0) > 0) return res.json({ ok: false, error: 'Move the users in this role to another role first.' });
	await query('DELETE FROM wd_support_role WHERE id = ?', [id]);
	await audit(req, 'role.delete', 'role', id, { name: existing.name });
	return res.json({ ok: true });
});

export default router;
