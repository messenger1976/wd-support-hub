import sanitizeHtml from 'sanitize-html';
import { config } from './config.js';
import { query } from './db.js';
import { now, str } from './util.js';

/*
 * Message Board helpers shared by the hub routes (routes/hubBoard.js) and the WD app API (routes/clientApi.js).
 * Dates are hub wall-clock 'Y-m-d H:i:s' strings, so they compare correctly as strings.
 */

export const BOARD_CATEGORIES = ['announcement', 'update', 'maintenance', 'guide', 'tip'];
export const BOARD_PRIORITIES = ['normal', 'important', 'critical'];
export const BOARD_AUDIENCES = ['all', 'admin', 'staff'];
export const BOARD_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
export const BOARD_IMAGE_MAX_BYTES = 3 * 1024 * 1024;

const MAX_BODY_CHARS = 500000;
const ASSET_PREFIX = '/board-assets/';

/** Tables are utf8 (3-byte); emoji and other astral characters are stored as HTML entities instead. */
function encodeAstral(html) {
	return html.replace(/[\u{10000}-\u{10FFFF}]/gu, (c) => `&#x${c.codePointAt(0).toString(16)};`);
}

function stripAstral(text) {
	return text.replace(/[\u{10000}-\u{10FFFF}]/gu, '');
}

const COLOR = [/^#[0-9a-f]{3,8}$/i, /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/i];

const SANITIZE = {
	allowedTags: [
		'h1', 'h2', 'h3', 'h4', 'p', 'br', 'hr', 'strong', 'b', 'em', 'i', 'u', 's', 'mark', 'span', 'blockquote',
		'ul', 'ol', 'li', 'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'code', 'pre', 'div', 'iframe',
		'figure', 'figcaption',
	],
	allowedAttributes: {
		a: ['href', 'target', 'rel'],
		img: ['src', 'alt', 'title', 'width', 'height'],
		iframe: ['src', 'width', 'height', 'allowfullscreen', 'frameborder'],
		div: ['data-youtube-video'],
		mark: ['data-color'],
		td: ['colspan', 'rowspan'],
		th: ['colspan', 'rowspan'],
		'*': ['style'],
	},
	allowedStyles: {
		'*': {
			color: COLOR,
			'background-color': COLOR,
			'text-align': [/^(left|right|center|justify)$/],
			'font-size': [/^\d{1,2}(\.\d{1,2})?(px|pt|em|rem)$/],
			'font-family': [/^[A-Za-z0-9 ,'"-]{1,80}$/],
		},
	},
	allowedSchemes: ['http', 'https', 'mailto', 'tel'],
	allowedSchemesByTag: { img: ['http', 'https'] },
	allowProtocolRelative: false,
	allowedIframeHostnames: ['www.youtube.com', 'www.youtube-nocookie.com', 'player.vimeo.com'],
	transformTags: {
		a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer' } }),
	},
};

export function sanitizeBody(html) {
	return encodeAstral(sanitizeHtml(str(html), SANITIZE)).trim();
}

export function plainText(html) {
	return sanitizeHtml(str(html), { allowedTags: [], allowedAttributes: {} })
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/\s+/g, ' ')
		.trim();
}

/** 'YYYY-MM-DDTHH:mm[:ss]' or 'YYYY-MM-DD HH:mm[:ss]' → 'Y-m-d H:i:s'; '' when invalid. */
export function normalizeDateTime(v) {
	const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(str(v).trim());
	if (!m) return '';
	const [, y, mo, d, h, mi, s = '00'] = m;
	const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
	if (date.getFullYear() !== Number(y) || date.getMonth() !== Number(mo) - 1 || date.getDate() !== Number(d)) return '';
	return `${y}-${mo}-${d} ${h}:${mi}:${s}`;
}

/** draft | scheduled | live | ended | archived, as of `ts`. */
export function boardState(m, ts = now()) {
	if (m.status === 'archived') return 'archived';
	if (m.status !== 'published') return 'draft';
	if (m.starts_at > ts) return 'scheduled';
	if (m.ends_at && m.ends_at <= ts) return 'ended';
	return 'live';
}

const bool = (v) => v === true || v === 1 || v === '1' || v === 'true' || v === 'on';

/**
 * Validates the editable fields of a message. Returns { data, companies } or { error }.
 * `companies` is the list of target WD codes (empty when all_companies).
 */
export function readMessage(body) {
	const b = body || {};
	const bodyHtml = sanitizeBody(b.body_html);
	const data = {
		title: stripAstral(str(b.title)).replace(/\s+/g, ' ').trim(),
		ticker_text: stripAstral(str(b.ticker_text)).replace(/\s+/g, ' ').trim(),
		body_html: bodyHtml,
		category: BOARD_CATEGORIES.includes(b.category) ? b.category : 'announcement',
		priority: BOARD_PRIORITIES.includes(b.priority) ? b.priority : 'normal',
		show_ticker: bool(b.show_ticker) ? 1 : 0,
		show_popup: bool(b.show_popup) ? 1 : 0,
		require_ack: bool(b.require_ack) ? 1 : 0,
		allow_opt_out: bool(b.allow_opt_out) ? 1 : 0,
		pinned: bool(b.pinned) ? 1 : 0,
		audience: BOARD_AUDIENCES.includes(b.audience) ? b.audience : 'all',
		all_companies: bool(b.all_companies) ? 1 : 0,
		starts_at: b.starts_at ? normalizeDateTime(b.starts_at) : now(),
		ends_at: b.ends_at ? normalizeDateTime(b.ends_at) : null,
	};
	if (!data.title || data.title.length > 200) return { error: 'Enter a title (max 200 characters).' };
	if (data.ticker_text.length > 300) return { error: 'The ticker line is too long (max 300 characters).' };
	if (bodyHtml.length > MAX_BODY_CHARS) return { error: 'The message is too long. Use fewer or smaller images.' };
	if (!data.starts_at) return { error: 'Enter a valid start date and time.' };
	if (b.ends_at && !data.ends_at) return { error: 'Enter a valid end date and time, or leave it empty.' };
	if (data.ends_at && data.ends_at <= data.starts_at) return { error: 'The end date and time must be after the start.' };
	// A critical notice must be seen by everyone, every login, until it ends.
	if (data.priority === 'critical') data.allow_opt_out = 0;
	if (!data.ticker_text && data.show_ticker) data.ticker_text = plainText(bodyHtml).slice(0, 200) || data.title;
	const companies = data.all_companies
		? []
		: [...new Set((Array.isArray(b.companies) ? b.companies : []).map((c) => str(c).toUpperCase()).filter(Boolean))];
	return { data, companies };
}

/** Error text when a message is not ready to go live, else ''. */
export function publishProblem(m, companies) {
	if (!m.title) return 'Add a title before publishing.';
	if (!plainText(m.body_html) && !/<img|<iframe/i.test(m.body_html || '') && !m.ticker_text) {
		return 'Write the message before publishing.';
	}
	if (!Number(m.all_companies) && !companies.length) return 'Choose at least one Water District, or All Water Districts.';
	return '';
}

/** Asset links are stored root-relative (/board-assets/…); WD apps load them from the hub, so make them absolute. */
export function absolutizeAssets(html, baseUrl = config.baseUrl) {
	const base = String(baseUrl).replace(/\/*$/, '');
	return str(html).replace(/(\ssrc=")\/board-assets\//g, `$1${base}${ASSET_PREFIX}`);
}

export async function targetsOf(messageIds) {
	const ids = messageIds.filter(Boolean);
	const map = new Map(ids.map((id) => [id, []]));
	if (!ids.length) return map;
	const rows = await query('SELECT message_id, company_code FROM wd_board_message_company WHERE message_id IN (?)', [ids]);
	rows.forEach((r) => map.get(r.message_id)?.push(r.company_code));
	return map;
}

export async function saveTargets(messageId, companies) {
	await query('DELETE FROM wd_board_message_company WHERE message_id = ?', [messageId]);
	if (companies.length) {
		await query('INSERT INTO wd_board_message_company (message_id, company_code) VALUES ?', [companies.map((c) => [messageId, c])]);
	}
}
