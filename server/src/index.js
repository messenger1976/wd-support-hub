import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import { config, firebaseWebConfig } from './config.js';
import { pool } from './db.js';
import { pushEnabled } from './firebase.js';
import { requireAppHeader, requireUser } from './auth.js';
import clientApi from './routes/clientApi.js';
import hubAudit from './routes/hubAudit.js';
import hubAuth from './routes/hubAuth.js';
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
hub.use(requireUser, hubInbox, hubDashboard, hubCompanies, hubReports, hubUsers, hubAudit);
app.use('/api/hub', hub);

// Firebase Messaging service worker, generated so the web config lives only in server/.env.
app.get('/firebase-messaging-sw.js', (req, res) => {
	const firebase = firebaseWebConfig();
	res.type('application/javascript').set('Cache-Control', 'no-cache');
	if (!firebase) return res.send('// Push notifications are not configured on this hub.\n');
	const { vapidKey, ...web } = firebase;
	return res.send(`importScripts('https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app-compat.js');
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
app.use(express.static(config.webDist, { index: false }));
app.use((req, res, next) => {
	if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
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

app.listen(config.port, async () => {
	console.log(`WD Support Hub listening on port ${config.port} (${config.appEnv}, TZ ${config.timezone})`);
	try {
		await pool.query('SELECT 1');
	} catch (err) {
		console.error(`[db] cannot reach MySQL ${config.db.host}/${config.db.database}: ${err.message}`);
	}
	console.log(pushEnabled() && firebaseWebConfig()
		? '[firebase] push notifications enabled'
		: '[firebase] push notifications disabled (set FIREBASE_* in server/.env)');
});
