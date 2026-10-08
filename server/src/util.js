import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

export const TICKET_STATUSES = ['open', 'waiting_support', 'waiting_client', 'resolved', 'closed'];
export const ATTACHMENT_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'];

/**
 * resolved_at / closed_at to write for a status change; undefined means "keep the stored value".
 * Reopening (any active status) clears both so SLA reports measure the latest resolution.
 */
export function statusTimestamps(status, ts) {
	if (status === 'resolved') return { resolved_at: ts, closed_at: null };
	if (status === 'closed') return { resolved_at: undefined, closed_at: ts };
	return { resolved_at: null, closed_at: null };
}

const pad = (n) => String(n).padStart(2, '0');

/** Local wall-clock 'Y-m-d H:i:s', same format PHP date() produced. */
export function now(offsetMs = 0) {
	const d = new Date(Date.now() + offsetMs);
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} `
		+ `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function stamp() {
	return now().replace(/[^0-9]/g, '');
}

export function uuid() {
	return crypto.randomUUID();
}

export function sha256(s) {
	return crypto.createHash('sha256').update(s).digest('hex');
}

export function randomHex(bytes) {
	return crypto.randomBytes(bytes).toString('hex');
}

export function safeFileName(name) {
	return String(name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function safeSegment(s) {
	return String(s || '').replace(/[^a-zA-Z0-9-]/g, '');
}

export function clientIp(req) {
	return String(req.ip || '').replace(/[^0-9a-fA-F:.]/g, '').slice(0, 45);
}

export function str(v, fallback = '') {
	return v === undefined || v === null ? fallback : String(v);
}

export function isEmail(s) {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || ''));
}

export function passwordPolicyError(password) {
	if (password.length < 10) return 'Password must be at least 10 characters.';
	if (password.length > 128) return 'Password is too long.';
	if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
		return 'Password must include at least one letter and one number.';
	}
	return '';
}

export function extensionOf(name) {
	return path.extname(String(name || '')).slice(1).toLowerCase();
}

/** Writes an attachment under uploads/{COMPANY}/{ticket-uuid}/ and returns its absolute path. */
export function storeAttachment(companyCode, ticketUuid, originalName, buffer) {
	const dir = path.join(config.uploadDir, safeSegment(companyCode), safeSegment(ticketUuid));
	fs.mkdirSync(dir, { recursive: true });
	const full = path.join(dir, `${stamp()}_${safeFileName(originalName)}`);
	fs.writeFileSync(full, buffer);
	return full;
}

/**
 * Attachment paths are stored absolute (the PHP hub wrote e.g. C:\xampp\htdocs\wd-support-hub/uploads/...).
 * If the hub moved, fall back to the part after "uploads/" inside the configured upload dir.
 */
export function resolveAttachment(storedPath) {
	if (!storedPath) return null;
	if (fs.existsSync(storedPath) && fs.statSync(storedPath).isFile()) return storedPath;
	const parts = String(storedPath).split(/[\\/]uploads[\\/]/);
	if (parts.length < 2) return null;
	const candidate = path.resolve(config.uploadDir, parts[parts.length - 1]);
	if (!candidate.startsWith(config.uploadDir + path.sep)) return null;
	return fs.existsSync(candidate) && fs.statSync(candidate).isFile() ? candidate : null;
}
