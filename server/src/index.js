import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import { config, firebaseWebConfig } from './config.js';
import { one, pool } from './db.js';
import { resolveAttachment } from './util.js';
import { pushEnabled } from './firebase.js';
import { requireAppHeader, requireUser } from './auth.js';
import clientApi from './routes/clientApi.js';
import hubAudit from './routes/hubAudit.js';
import hubAuth from './routes/hubAuth.js';
import hubBoard from './routes/hubBoard.js';
import hubCompanies from './routes/hubCompanies.js';
import hubDashboard from './routes/hubDashboard.js';
import hubInbox from './routes/hubInbox.js';
import hubReports from './routes/hubReports.js';
import hubUsers from './routes/hubUsers.js';

const FIREBASE_SDK_VERSION = '10.14.1';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', config.trustProxy);
app.use(cookieParser());

// Water District apps (Bearer company token).
app.use(clientApi);

// Super Admin SPA API.
const hub = express.Router();
hub.use(express.json({ limit: '1mb' }));
hub.use(requireAppHeader);
hub.get('/config', (req, res) => {
	const firebase = firebaseWebConfig();
	res.json({ ok: true, app_env: config.appEnv, firebase: firebase && pushEnabled() ? firebase : null });
});
hub.use('/auth', hubAuth);
hub.use(requireUser, hubInbox, hubDashboard, hubBoard, hubCompanies, hubReports, hubUsers, hubAudit);
app.use('/api/hub', hub);

// Message Board images: loaded straight from the hub by browsers inside the WD apps, so no login (UUIDs are unguessable).
app.get('/board-assets/:uuid', async (req, res) => {
	const row = await one('SELECT file_path, mime FROM wd_board_asset WHERE uuid = ? LIMIT 1', [String(req.params.uuid)]);
	const file = row ? resolveAttachment(row.file_path) : null;
	if (!file) return res.status(404).type('text/plain').send('Not found');
	res.set('X-Content-Type-Options', 'nosniff');
	res.set('Cache-Control', 'public, max-age=31536000, immutable');
	res.set('Cross-Origin-Resource-Policy', 'cross-origin');
	res.type(row.mime || 'application/octet-stream');
	return res.sendFile(file);
});

// The hub's only service worker: PWA caching (web/public/pwa-sw.js) plus Firebase Messaging,
// generated so the Firebase web config lives only in server/.env.
app.get('/firebase-messaging-sw.js', (req, res) => {
	const firebase = firebaseWebConfig();
	res.type('application/javascript').set('Cache-Control', 'no-cache');
	const pwa = "importScripts('/pwa-sw.js');\n";
	if (!firebase) return res.send(`${pwa}// Push notifications are not configured on this hub.\n`);
	const { vapidKey, ...web } = firebase;
	return res.send(`${pwa}importScripts('https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-messaging-compat.js');
firebase.initializeApp(${JSON.stringify(web)});
// Background notifications (notification payload + webpush link) are displayed by the SDK itself.
firebase.messaging();
`);
});

// Old emailed reset links from the PHP hub: index.php?action=reset_password&token=...
app.get('/index.php', (req, res) => {
	if (req.query.action === 'reset_password' && req.query.token) {
		return res.redirect(`/reset-password?token=${encodeURIComponent(String(req.query.token))}`);
	}
	return res.redirect('/');
});

// React build (web/dist) with SPA fallback.
const indexHtml = path.join(config.webDist, 'index.html');
const NO_CACHE_FILES = new Set(['pwa-sw.js', 'manifest.webmanifest', 'offline.html']);
app.use(express.static(config.webDist, {
	index: false,
	setHeaders(res, filePath) {
		if (NO_CACHE_FILES.has(path.basename(filePath))) res.set('Cache-Control', 'no-cache');
		else if (filePath.includes(`${path.sep}assets${path.sep}`)) res.set('Cache-Control', 'public, max-age=31536000, immutable');
	},
}));
app.use((req, res, next) => {
	// Missing files (e.g. an old hashed chunk) must 404, not get index.html cached in their place.
	if (req.method !== 'GET' || req.path.startsWith('/api') || path.extname(req.path)) return next();
	if (!fs.existsSync(indexHtml)) {
		return res.status(503).type('text/plain').send('Web app is not built yet. Run "npm run build" in the repo root.');
	}
	return res.sendFile(indexHtml);
});

app.use((req, res) => {
	res.status(404).json({ ok: false, error: 'Not found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
	if (err.type === 'entity.parse.failed') return res.status(400).json({ ok: false, error: 'Invalid payload' });
	if (err.code === 'LIMIT_FILE_SIZE') {
		return res.status(400).json({ ok: false, error: `File is larger than ${Math.round(config.maxUploadBytes / 1024)} KB.` });
	}
	if (err.expose) return res.status(err.status || 400).json({ ok: false, error: err.message });
	console.error(err);
	const dbDown = ['ECONNREFUSED', 'ER_ACCESS_DENIED_ERROR', 'ER_BAD_DB_ERROR', 'PROTOCOL_CONNECTION_LOST'].includes(err.code);
	return res.status(500).json({ ok: false, error: dbDown ? 'Hub database is not available.' : 'Server error.' });
});

// Express 5 passes listen errors (e.g. EADDRINUSE) to this callback instead of throwing.
app.listen(config.port, async (listenErr) => {
	if (listenErr) {
		console.error(`Cannot listen on port ${config.port}: ${listenErr.code || ''} ${listenErr.message}`);
		process.exit(1);
	}
	console.log(`WD Support Hub listening on port ${config.port} (${config.appEnv}, TZ ${config.timezone})`);
	const dbTarget = config.db.socketPath || `${config.db.host}:${config.db.port}`;
	try {
		await pool.query('SELECT 1');
		console.log(`[db] connected to ${dbTarget}/${config.db.database}`);
	} catch (err) {
		// "localhost" can fail on both ::1 and 127.0.0.1 as an AggregateError with an empty message.
		const detail = [err, ...(err.errors || [])]
			.map((e) => [e.code, e.address && `${e.address}:${e.port}`, e.message].filter(Boolean).join(' '))
			.filter(Boolean)
			.join(' | ');
		console.error(`[db] cannot reach MySQL ${dbTarget}/${config.db.database}: ${detail}`);
	}
	console.log(pushEnabled() && firebaseWebConfig()
		? '[firebase] push notifications enabled'
		: '[firebase] push notifications disabled (set FIREBASE_* in server/.env)');
});
