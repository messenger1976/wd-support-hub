/*
 * PWA caching for WD Support Hub. Imported by the server-generated /firebase-messaging-sw.js so the
 * hub keeps a single service worker at scope "/" (a second worker on the same scope would replace
 * the Firebase one and silently stop background push).
 *
 * Never cached: /api/* (tickets, messages, attachments, auth) — those stay network-only.
 */
const PWA_VERSION = 'v1';
const SHELL_CACHE = `wdhub-shell-${PWA_VERSION}`;
const ASSET_CACHE = `wdhub-assets-${PWA_VERSION}`;
const ASSET_CACHE_MAX = 80;
const OFFLINE_URL = '/offline.html';
const SHELL_FILES = [
	OFFLINE_URL,
	'/logo.svg',
	'/favicon.ico',
	'/manifest.webmanifest',
	'/icons/icon-192.png',
	'/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(SHELL_CACHE)
			.then((cache) => cache.addAll(SHELL_FILES.map((url) => new Request(url, { cache: 'reload' }))))
			.then(() => self.skipWaiting()),
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil((async () => {
		const keep = [SHELL_CACHE, ASSET_CACHE];
		const keys = await caches.keys();
		await Promise.all(keys.filter((k) => k.startsWith('wdhub-') && !keep.includes(k)).map((k) => caches.delete(k)));
		if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
		await self.clients.claim();
	})());
});

async function trimCache(name, max) {
	const cache = await caches.open(name);
	const keys = await cache.keys();
	await Promise.all(keys.slice(0, Math.max(0, keys.length - max)).map((k) => cache.delete(k)));
}

/** Pages: always try the network so a deploy is picked up at once; offline page as fallback. */
async function handleNavigation(event) {
	try {
		const preloaded = await event.preloadResponse;
		if (preloaded) return preloaded;
		return await fetch(event.request);
	} catch {
		const cache = await caches.open(SHELL_CACHE);
		return (await cache.match(OFFLINE_URL)) || Response.error();
	}
}

/** Vite build output is content-hashed, so a cached copy never goes stale. */
async function cacheFirst(request) {
	const cache = await caches.open(ASSET_CACHE);
	const hit = await cache.match(request);
	if (hit) return hit;
	const res = await fetch(request);
	if (res.ok && res.type === 'basic') {
		await cache.put(request, res.clone());
		trimCache(ASSET_CACHE, ASSET_CACHE_MAX);
	}
	return res;
}

/** Icons, logo, images: serve the cached copy fast, refresh it in the background. */
async function staleWhileRevalidate(event) {
	const cache = await caches.open(SHELL_CACHE);
	const hit = await cache.match(event.request);
	const refresh = fetch(event.request).then((res) => {
		if (res.ok && res.type === 'basic') cache.put(event.request, res.clone());
		return res;
	});
	if (hit) {
		event.waitUntil(refresh.catch(() => {}));
		return hit;
	}
	return refresh;
}

self.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;
	if (url.pathname.startsWith('/api') || url.pathname.endsWith('-sw.js') || url.pathname === '/api.php') return;

	if (request.mode === 'navigate') {
		event.respondWith(handleNavigation(event));
	} else if (url.pathname.startsWith('/assets/')) {
		event.respondWith(cacheFirst(request));
	} else if (/^\/(icons|img)\//.test(url.pathname) || /\.(svg|png|ico|webp|jpg|webmanifest)$/.test(url.pathname)) {
		event.respondWith(staleWhileRevalidate(event));
	}
});
