import { useEffect, useState } from 'react';

/** Same file as push.js registers, so PWA caching and Firebase push share one worker at scope "/". */
export const SW_URL = '/firebase-messaging-sw.js';

let deferredPrompt = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

export function registerServiceWorker() {
	if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
	window.addEventListener('load', () => {
		navigator.serviceWorker.register(SW_URL).catch((err) => console.warn('Service worker not registered:', err.message));
	});
}

if (typeof window !== 'undefined') {
	window.addEventListener('beforeinstallprompt', (e) => {
		e.preventDefault();
		deferredPrompt = e;
		notify();
	});
	window.addEventListener('appinstalled', () => {
		deferredPrompt = null;
		notify();
	});
}

export function isStandalone() {
	return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isIos() {
	const ua = window.navigator.userAgent;
	return /iphone|ipad|ipod/i.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

/**
 * Install state for the "Install app" button.
 * mode: 'prompt' (Chrome/Edge/Android), 'ios' (Safari: Share → Add to Home Screen), or null.
 */
export function useInstallPrompt() {
	const [, force] = useState(0);
	useEffect(() => {
		const fn = () => force((n) => n + 1);
		listeners.add(fn);
		return () => listeners.delete(fn);
	}, []);

	let mode = null;
	if (!isStandalone()) {
		if (deferredPrompt) mode = 'prompt';
		else if (isIos()) mode = 'ios';
	}

	async function install() {
		if (!deferredPrompt) return false;
		deferredPrompt.prompt();
		const { outcome } = await deferredPrompt.userChoice;
		deferredPrompt = null;
		notify();
		return outcome === 'accepted';
	}

	return { mode, install };
}

export function useOnline() {
	const [online, setOnline] = useState(() => navigator.onLine);
	useEffect(() => {
		const on = () => setOnline(true);
		const off = () => setOnline(false);
		window.addEventListener('online', on);
		window.addEventListener('offline', off);
		return () => {
			window.removeEventListener('online', on);
			window.removeEventListener('offline', off);
		};
	}, []);
	return online;
}
