import { useEffect, useState } from 'react';
import { useInstallPrompt } from '../pwa.js';
import Icon from './Icon.jsx';

const POINTS = [
	{ icon: 'message', text: 'One inbox for every Water District’s support tickets' },
	{ icon: 'bell', text: 'Instant notifications when a district needs a reply' },
	{ icon: 'reports', text: 'SLA tracking and service reports per district' },
];

export default function AuthShell({ title, children }) {
	const { mode, install } = useInstallPrompt();
	const [iosHint, setIosHint] = useState(false);

	useEffect(() => {
		document.title = title;
	}, [title]);

	return (
		<div className="hub-auth">
			<header className="hub-auth-hero">
				<img className="hub-auth-logo" src="/logo.svg" alt="" width="88" height="88" />
				<h1>Water District Support Hub</h1>
				<p>Support desk for the Water District billing and collection systems.</p>
				<ul className="hub-auth-points">
					{POINTS.map((p) => (
						<li key={p.icon}><Icon name={p.icon} size={18} />{p.text}</li>
					))}
				</ul>
			</header>
			<main className="hub-auth-body">
				<div className="hub-auth-card">{children}</div>
				<div className="hub-auth-foot">
					{mode === 'prompt' && (
						<button type="button" className="btn btn-link" onClick={install}>
							<Icon name="download" size={15} className="mr-1" />Install the app on this device
						</button>
					)}
					{mode === 'ios' && (
						<button type="button" className="btn btn-link" onClick={() => setIosHint((v) => !v)}>
							<Icon name="download" size={15} className="mr-1" />Add to Home Screen
						</button>
					)}
					{iosHint && <div className="mb-2">In Safari, tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.</div>}
					<div>&copy; {new Date().getFullYear()} Water District Support Hub</div>
				</div>
			</main>
		</div>
	);
}
