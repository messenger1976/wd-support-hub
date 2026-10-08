import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_ROOT = path.resolve(here, '..');
export const REPO_ROOT = path.resolve(SERVER_ROOT, '..');

dotenv.config({ path: path.join(SERVER_ROOT, '.env') });

const env = process.env;

function int(name, fallback) {
	const v = parseInt(env[name] ?? '', 10);
	return Number.isFinite(v) ? v : fallback;
}

function clamp(v, min, max) {
	return Math.min(max, Math.max(min, v));
}

function bool(name) {
	return ['1', 'true', 'yes', 'on'].includes(String(env[name] ?? '').toLowerCase());
}

const timezone = env.APP_TIMEZONE || 'Asia/Manila';
// DATETIME columns are written as local wall-clock strings, exactly like PHP date().
process.env.TZ = timezone;

const appEnv = String(env.APP_ENV || 'production').toLowerCase();

let jwtSecret = env.JWT_SECRET || '';
if (!jwtSecret || jwtSecret === 'change-me-to-a-long-random-string') {
	if (appEnv !== 'local') {
		console.warn('[config] JWT_SECRET is not set — using a random secret; sessions end on restart.');
	}
	jwtSecret = crypto.randomBytes(48).toString('hex');
}

const trustProxyRaw = env.TRUST_PROXY ?? '0';
const trustProxy = /^\d+$/.test(trustProxyRaw) ? parseInt(trustProxyRaw, 10) : trustProxyRaw;

export const config = {
	port: int('PORT', 3000),
	appEnv,
	isLocal: appEnv === 'local',
	baseUrl: (env.BASE_URL || `http://localhost:${int('PORT', 3000)}/`).replace(/\/*$/, '/'),
	timezone,
	trustProxy,
	db: {
		host: env.DB_HOST || 'localhost',
		port: int('DB_PORT', 3306),
		user: env.DB_USER || 'root',
		password: env.DB_PASS || '',
		database: env.DB_NAME || 'wd_support_hub',
	},
	jwtSecret,
	sessionHours: clamp(int('SESSION_HOURS', 12), 1, 24 * 30),
	uploadDir: path.resolve(env.UPLOAD_DIR || path.join(REPO_ROOT, 'uploads')),
	maxUploadBytes: clamp(int('MAX_UPLOAD_KB', 4096), 64, 51200) * 1024,
	passwordReset: {
		ttlMinutes: clamp(int('PASSWORD_RESET_TTL_MINUTES', 60), 15, 1440),
		cooldownSeconds: Math.max(30, int('PASSWORD_RESET_COOLDOWN_SECONDS', 90)),
	},
	mail: {
		from: env.MAIL_FROM || 'noreply@localhost',
		fromName: env.MAIL_FROM_NAME || 'WD Support Hub',
		smtp: {
			host: env.SMTP_HOST || '',
			port: int('SMTP_PORT', 587),
			secure: bool('SMTP_SECURE'),
			user: env.SMTP_USER || '',
			pass: env.SMTP_PASS || '',
		},
	},
	firebase: {
		serviceAccountPath: env.FIREBASE_SERVICE_ACCOUNT_PATH || '',
		serviceAccountJson: env.FIREBASE_SERVICE_ACCOUNT_JSON || '',
		web: {
			apiKey: env.FIREBASE_API_KEY || '',
			authDomain: env.FIREBASE_AUTH_DOMAIN || '',
			projectId: env.FIREBASE_PROJECT_ID || '',
			messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID || '',
			appId: env.FIREBASE_APP_ID || '',
		},
		vapidKey: env.FIREBASE_VAPID_KEY || '',
	},
	webDist: path.join(REPO_ROOT, 'web', 'dist'),
};

export function firebaseWebConfig() {
	const w = config.firebase.web;
	if (!w.apiKey || !w.projectId || !w.messagingSenderId || !w.appId || !config.firebase.vapidKey) {
		return null;
	}
	return { ...w, vapidKey: config.firebase.vapidKey };
}
