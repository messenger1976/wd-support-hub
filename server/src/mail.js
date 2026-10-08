import nodemailer from 'nodemailer';
import { config } from './config.js';
import { isEmail } from './util.js';

let transport = null;

function getTransport() {
	const s = config.mail.smtp;
	if (!s.host) return null;
	if (!transport) {
		transport = nodemailer.createTransport({
			host: s.host,
			port: s.port,
			secure: s.secure,
			auth: s.user ? { user: s.user, pass: s.pass } : undefined,
		});
	}
	return transport;
}

export async function sendPasswordResetMail(user, reset) {
	const email = String(user.email || '').trim();
	if (!isEmail(email)) return { ok: false, error: 'no_email' };
	const t = getTransport();
	if (!t) return { ok: false, error: 'mail_not_configured' };

	const { fromName, from } = config.mail;
	const display = user.display_name || user.username;
	const text = `Hello ${display},\n\n`
		+ 'We received a request to reset your WD Support Hub password.\n\n'
		+ `Open this link to choose a new password (expires in ${reset.ttlMinutes} minutes):\n`
		+ `${reset.url}\n\n`
		+ 'If you did not request this, you can ignore this email. Your password will stay the same.\n\n'
		+ `— ${fromName}\n`;

	try {
		await t.sendMail({
			from: { name: fromName.replace(/[\r\n]+/g, ''), address: from },
			replyTo: from,
			to: email,
			subject: 'Reset your WD Support Hub password',
			text,
			headers: { 'X-Mailer': 'WD-Support-Hub' },
		});
		return { ok: true };
	} catch (err) {
		console.error('[mail] password reset send failed:', err.message);
		return { ok: false, error: 'mail_failed' };
	}
}
