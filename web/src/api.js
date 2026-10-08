let unauthorizedHandler = null;

export function onUnauthorized(fn) {
	unauthorizedHandler = fn;
}

async function request(method, url, body) {
	const opts = { method, credentials: 'same-origin', headers: { Accept: 'application/json' } };
	if (method !== 'GET') opts.headers['X-Hub-Request'] = '1';
	if (body instanceof FormData) {
		opts.body = body;
	} else if (body !== undefined) {
		opts.headers['Content-Type'] = 'application/json';
		opts.body = JSON.stringify(body);
	}
	let res;
	try {
		res = await fetch(`/api/hub${url}`, opts);
	} catch {
		return { ok: false, error: 'Cannot reach the hub server.' };
	}
	let data;
	try {
		data = await res.json();
	} catch {
		data = { ok: false, error: `Server returned HTTP ${res.status}.` };
	}
	if (res.status === 401 && !url.startsWith('/auth/') && unauthorizedHandler) unauthorizedHandler();
	return data;
}

export const api = {
	get: (url) => request('GET', url),
	post: (url, body) => request('POST', url, body ?? {}),
	del: (url, body) => request('DELETE', url, body ?? {}),
};
