import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { one, query } from './db.js';
import { isFullAccess, parsePermissions } from './permissions.js';
import { now, sha256 } from './util.js';

const COOKIE = 'wd_support_hub';

// PHP password_hash() writes $2y$; bcryptjs reads the identical $2b$ format.
function normalizeHash(hash) {
	return String(hash || '').replace(/^\$2y\$/, '$2b$');
}

export function verifyPassword(plain, hash) {
	try {
		return bcrypt.compareSync(String(plain), normalizeHash(hash));
	} catch {
		return false;
	}
}

export function hashPassword(plain) {
	return bcrypt.hashSync(String(plain), 10);
}

/** Changes whenever the password changes, so a reset signs out every other session. */
function passwordVersion(hash) {
	return sha256(String(hash || '')).slice(0, 16);
}

/** User row joined with its role and Water District list. */
export async function loadUser(where, params) {
	const row = await one(
		`SELECT u.*, r.name AS role_name, r.permissions AS role_permissions
		 FROM wd_support_hub_user u LEFT JOIN wd_support_role r ON r.id = u.role_id
		 WHERE ${where} LIMIT 1`,
		params,
	);
	if (!row) return null;
	const companies = await query('SELECT company_code FROM wd_support_user_company WHERE user_id = ? ORDER BY company_code', [row.id]);
	row.companies = companies.map((c) => c.company_code);
	return row;
}

export function publicUser(row) {
	return {
		id: Number(row.id),
		username: row.username,
		display_name: row.display_name,
		email: row.email,
		role_id: Number(row.role_id),
		role_name: row.role_name || '',
		full_access: isFullAccess(row.role_permissions),
		permissions: parsePermissions(row.role_permissions),
		all_companies: Number(row.all_companies) === 1,
		companies: row.companies || [],
	};
}

export function issueSession(res, row) {
	const token = jwt.sign(
		{ sub: Number(row.id), pv: passwordVersion(row.password_hash) },
		config.jwtSecret,
		{ expiresIn: `${config.sessionHours}h` },
	);
	res.cookie(COOKIE, token, {
		httpOnly: true,
		sameSite: 'strict',
		secure: config.baseUrl.startsWith('https://'),
		maxAge: config.sessionHours * 3600 * 1000,
		path: '/',
	});
}

export function clearSession(res) {
	res.clearCookie(COOKIE, { path: '/' });
}

/** Role, Water District access and deactivation are re-read on every request. */
export async function currentUser(req) {
	const token = req.cookies?.[COOKIE];
	if (!token) return null;
	let claims;
	try {
		claims = jwt.verify(token, config.jwtSecret);
	} catch {
		return null;
	}
	const row = await loadUser('u.id = ?', [claims.sub]);
	if (!row || Number(row.is_active) !== 1 || passwordVersion(row.password_hash) !== claims.pv) return null;
	return row;
}

export async function requireUser(req, res, next) {
	const row = await currentUser(req);
	if (!row) {
		clearSession(res);
		return res.status(401).json({ ok: false, error: 'Please sign in.' });
	}
	req.user = publicUser(row);
	next();
}

/** Cross-site forms cannot set custom headers; the SPA always sends this on writes. */
export function requireAppHeader(req, res, next) {
	if (req.method !== 'GET' && req.method !== 'HEAD' && req.get('X-Hub-Request') !== '1') {
		return res.status(403).json({ ok: false, error: 'Your session expired. Please try again.' });
	}
	next();
}

export async function updateUserPassword(userId, plain) {
	const r = await query(
		'UPDATE wd_support_hub_user SET password_hash = ?, updated_at = ? WHERE id = ?',
		[hashPassword(plain), now(), userId],
	);
	return r.affectedRows === 1;
}
