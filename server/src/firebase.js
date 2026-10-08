import fs from 'node:fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { config } from './config.js';
import { query } from './db.js';
import { parsePermissions } from './permissions.js';
import { now, sha256 } from './util.js';

let messaging;

function loadServiceAccount() {
	const { serviceAccountJson, serviceAccountPath } = config.firebase;
	if (serviceAccountJson) return JSON.parse(serviceAccountJson);
	if (serviceAccountPath) return JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
	return null;
}

function getFcm() {
	if (messaging !== undefined) return messaging;
	messaging = null;
	try {
		const account = loadServiceAccount();
		if (account) {
			messaging = getMessaging(initializeApp({ credential: cert(account) }));
		}
	} catch (err) {
		console.error('[firebase] could not initialise the Admin SDK:', err.message);
	}
	return messaging;
}

export function pushEnabled() {
	return getFcm() !== null;
}

export async function savePushToken(userId, token, userAgent) {
	const ts = now();
	await query(
		`INSERT INTO wd_support_push_token (user_id, token_hash, token, user_agent, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?)
		 ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), user_agent = VALUES(user_agent), updated_at = VALUES(updated_at)`,
		[userId, sha256(token), token, String(userAgent || '').slice(0, 255), ts, ts],
	);
}

export async function deletePushToken(userId, token) {
	await query('DELETE FROM wd_support_push_token WHERE token_hash = ? AND user_id = ?', [sha256(token), userId]);
}

const DEAD_TOKEN_CODES = new Set([
	'messaging/registration-token-not-registered',
	'messaging/invalid-registration-token',
]);

/** Web push to active hub users who may see this Water District's inbox. Never throws. */
export async function notifySupportUsers({ title, body, ticketUuid, companyCode }) {
	const fcm = getFcm();
	if (!fcm) return;
	try {
		const rows = await query(
			`SELECT p.token, r.permissions FROM wd_support_push_token p
			 INNER JOIN wd_support_hub_user u ON u.id = p.user_id AND u.is_active = 1
			 LEFT JOIN wd_support_role r ON r.id = u.role_id
			 WHERE u.all_companies = 1
				OR EXISTS (SELECT 1 FROM wd_support_user_company uc WHERE uc.user_id = u.id AND uc.company_code = ?)`,
			[companyCode || ''],
		);
		const tokens = rows.filter((r) => parsePermissions(r.permissions).includes('inbox.view')).map((r) => r.token);
		const link = `${config.baseUrl}inbox?ticket=${encodeURIComponent(ticketUuid || '')}`;
		for (let i = 0; i < tokens.length; i += 500) {
			const batch = tokens.slice(i, i + 500);
			const res = await fcm.sendEachForMulticast({
				tokens: batch,
				notification: { title, body: body.slice(0, 180) },
				data: { type: 'support_message', ticket_uuid: String(ticketUuid || '') },
				webpush: { fcmOptions: { link } },
			});
			const dead = [];
			res.responses.forEach((r, idx) => {
				if (!r.success && DEAD_TOKEN_CODES.has(r.error?.code)) dead.push(sha256(batch[idx]));
			});
			if (dead.length) {
				await query('DELETE FROM wd_support_push_token WHERE token_hash IN (?)', [dead]);
			}
		}
	} catch (err) {
		console.error('[firebase] notification failed:', err.message);
	}
}
