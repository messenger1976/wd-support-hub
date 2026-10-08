import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import { api } from './api.js';
import { SW_URL } from './pwa.js';

let messaging = null;
let vapidKey = '';
let currentToken = '';

/** Returns true when this browser can receive Firebase web push for the given hub config. */
export async function initPush(firebaseConfig) {
	if (!firebaseConfig || messaging) return !!messaging;
	if (!('Notification' in window) || !(await isSupported().catch(() => false))) return false;
	const { vapidKey: key, ...web } = firebaseConfig;
	vapidKey = key;
	messaging = getMessaging(initializeApp(web));
	return true;
}

export function permission() {
	return 'Notification' in window ? Notification.permission : 'denied';
}

/** Asks for permission if needed, then registers this browser's FCM token with the hub. */
export async function enablePush({ prompt }) {
	if (!messaging) return { ok: false, error: 'Notifications are not available in this browser.' };
	let perm = permission();
	if (perm === 'default' && prompt) perm = await Notification.requestPermission();
	if (perm !== 'granted') return { ok: false, error: perm === 'denied' ? 'Notifications are blocked for this site.' : '' };
	try {
		const registration = await navigator.serviceWorker.register(SW_URL);
		currentToken = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
	} catch (err) {
		return { ok: false, error: `Could not enable notifications: ${err.message}` };
	}
	if (!currentToken) return { ok: false, error: 'Firebase did not return a push token.' };
	return api.post('/push-tokens', { token: currentToken });
}

export async function disablePush() {
	if (currentToken) await api.del('/push-tokens', { token: currentToken });
	currentToken = '';
}

/** Foreground messages (the tab is open and focused); background ones are shown by the service worker. */
export function onForegroundMessage(cb) {
	return messaging ? onMessage(messaging, cb) : () => {};
}
