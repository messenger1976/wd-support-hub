import express from 'express';
import { config } from '../config.js';
import { one, query } from '../db.js';
import { sendPasswordResetMail } from '../mail.js';
import {
	clearSession, currentUser, issueSession, loadUser, publicUser, requireUser, updateUserPassword, verifyPassword,
} from '../auth.js';
import { audit } from '../permissions.js';
import { clientIp, isEmail, now, passwordPolicyError, randomHex, sha256, str } from '../util.js';

const router = express.Router();

const GENERIC_RESET_INFO = 'If an account matches that username or email, we sent password reset instructions.';

router.post('/login', async (req, res) => {
	const username = str(req.body?.username).trim();
	const password = str(req.body?.password);
	const row = username ? await loadUser('u.username = ?', [username]) : null;
	if (!row || !verifyPassword(password, row.password_hash)) {
		return res.status(401).json({ ok: false, error: 'Invalid username or password.' });
	}
	if (Number(row.is_active) !== 1) {
		return res.status(401).json({ ok: false, error: 'This account is disabled. Ask a hub administrator to enable it.' });
	}
	await query('UPDATE wd_support_hub_user SET last_login_at = ? WHERE id = ?', [now(), row.id]);
	issueSession(res, row);
	req.user = publicUser(row);
	await audit(req, 'auth.login', 'user', row.id);
	return res.json({ ok: true, user: req.user });
});

router.post('/logout', (req, res) => {
	clearSession(res);
	res.json({ ok: true });
});

router.get('/me', async (req, res) => {
	const row = await currentUser(req);
	res.json({ ok: true, user: row ? publicUser(row) : null });
});

/* ---------- My Account ---------- */

router.post('/profile', requireUser, async (req, res) => {
	const displayName = str(req.body?.display_name).trim();
	const email = str(req.body?.email).trim();
	if (!displayName || displayName.length > 150) return res.json({ ok: false, error: 'Enter your name (max 150 characters).' });
	if (email && !isEmail(email)) return res.json({ ok: false, error: 'Enter a valid email address.' });
	await query('UPDATE wd_support_hub_user SET display_name = ?, email = ?, updated_at = ? WHERE id = ?',
		[displayName, email, now(), req.user.id]);
	await audit(req, 'account.profile', 'user', req.user.id, { display_name: displayName, email });
	const row = await loadUser('u.id = ?', [req.user.id]);
	return res.json({ ok: true, user: publicUser(row) });
});

router.post('/change-password', requireUser, async (req, res) => {
	const row = await one('SELECT password_hash FROM wd_support_hub_user WHERE id = ? LIMIT 1', [req.user.id]);
	if (!row || !verifyPassword(str(req.body?.current_password), row.password_hash)) {
		return res.json({ ok: false, error: 'Your current password is incorrect.' });
	}
	const password = str(req.body?.password);
	if (password !== str(req.body?.password_confirm)) return res.json({ ok: false, error: 'Passwords do not match.' });
	const policy = passwordPolicyError(password);
	if (policy) return res.json({ ok: false, error: policy });
	if (!(await updateUserPassword(req.user.id, password))) {
		return res.json({ ok: false, error: 'Could not update password. Please try again.' });
	}
	await invalidateUserResetTokens(req.user.id);
	// The password version in the cookie changed: re-issue so this browser stays signed in.
	issueSession(res, await one('SELECT * FROM wd_support_hub_user WHERE id = ? LIMIT 1', [req.user.id]));
	await audit(req, 'account.password', 'user', req.user.id);
	return res.json({ ok: true, message: 'Password updated. Other signed-in browsers were signed out.' });
});

/* ---------- Forgot password ---------- */

async function recentResetRequest(userId, ip) {
	const since = now(-config.passwordReset.cooldownSeconds * 1000);
	return !!(await one(
		`SELECT id FROM wd_support_password_reset
		 WHERE (user_id = ? OR request_ip = ?) AND created_at >= ? AND used_at IS NULL LIMIT 1`,
		[userId, ip, since],
	));
}

async function invalidateUserResetTokens(userId) {
	await query('UPDATE wd_support_password_reset SET used_at = ? WHERE user_id = ? AND used_at IS NULL', [now(), userId]);
}

async function createPasswordReset(user, ip) {
	const { ttlMinutes } = config.passwordReset;
	const token = randomHex(32);
	await invalidateUserResetTokens(user.id);
	await query(
		`INSERT INTO wd_support_password_reset (user_id, token_hash, expires_at, used_at, request_ip, created_at)
		 VALUES (?, ?, ?, NULL, ?, ?)`,
		[user.id, sha256(token), now(ttlMinutes * 60 * 1000), ip, now()],
	);
	return { token, ttlMinutes, url: `${config.baseUrl}reset-password?token=${encodeURIComponent(token)}` };
}

async function lookupValidReset(rawToken) {
	const token = str(rawToken).trim();
	if (!/^[a-f0-9]{64}$/.test(token)) return null;
	return one(
		`SELECT r.*, u.username, u.display_name, u.email
		 FROM wd_support_password_reset r
		 INNER JOIN wd_support_hub_user u ON u.id = r.user_id
		 WHERE r.token_hash = ? AND r.used_at IS NULL AND r.expires_at > ? LIMIT 1`,
		[sha256(token), now()],
	);
}

router.post('/forgot-password', async (req, res) => {
	const identifier = str(req.body?.identifier).trim();
	const ip = clientIp(req);
	const user = identifier
		? await one('SELECT * FROM wd_support_hub_user WHERE (username = ? OR email = ?) AND is_active = 1 LIMIT 1', [identifier, identifier])
		: null;

	if (!user || !isEmail(user.email)) {
		// Same outward message and similar timing for unknown accounts (no enumeration).
		await new Promise((r) => setTimeout(r, 200));
		return res.json({ ok: true, info: GENERIC_RESET_INFO });
	}
	if (await recentResetRequest(user.id, ip)) {
		return res.json({ ok: true, info: `${GENERIC_RESET_INFO} If you just requested one, wait a minute before trying again.` });
	}
	const reset = await createPasswordReset(user, ip);
	const mail = await sendPasswordResetMail(user, reset);
	const out = { ok: true, info: GENERIC_RESET_INFO };
	if (!mail.ok && config.isLocal) {
		// Local/XAMPP usually has no SMTP — expose the link only when APP_ENV=local.
		out.debug_url = reset.url;
	}
	return res.json(out);
});

/* ---------- Reset password (token link) ---------- */

router.get('/reset-password', async (req, res) => {
	const reset = await lookupValidReset(req.query.token);
	if (!reset) return res.json({ ok: false, error: 'This reset link is invalid or has expired.' });
	return res.json({ ok: true, username: reset.username });
});

router.post('/reset-password', async (req, res) => {
	const reset = await lookupValidReset(req.body?.token);
	if (!reset) return res.json({ ok: false, expired: true, error: 'This reset link is invalid or has expired.' });

	const password = str(req.body?.password);
	if (password !== str(req.body?.password_confirm)) {
		return res.json({ ok: false, error: 'Passwords do not match.' });
	}
	const policy = passwordPolicyError(password);
	if (policy) return res.json({ ok: false, error: policy });

	const consumed = await query(
		'UPDATE wd_support_password_reset SET used_at = ? WHERE id = ? AND used_at IS NULL',
		[now(), reset.id],
	);
	if (consumed.affectedRows !== 1) {
		return res.json({ ok: false, expired: true, error: 'This reset link was already used. Request a new one.' });
	}
	if (!(await updateUserPassword(reset.user_id, password))) {
		return res.json({ ok: false, error: 'Could not update password. Please try again.' });
	}
	await invalidateUserResetTokens(reset.user_id);
	clearSession(res);
	return res.json({ ok: true, message: 'Password updated. Sign in with your new password.' });
});

export default router;
