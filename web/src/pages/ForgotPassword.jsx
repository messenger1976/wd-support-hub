import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import AuthShell from '../components/AuthShell.jsx';

export default function ForgotPassword() {
	const [identifier, setIdentifier] = useState('');
	const [info, setInfo] = useState('');
	const [error, setError] = useState('');
	const [debugUrl, setDebugUrl] = useState('');
	const [busy, setBusy] = useState(false);

	async function submit(e) {
		e.preventDefault();
		setBusy(true);
		setError('');
		const r = await api.post('/auth/forgot-password', { identifier: identifier.trim() });
		setBusy(false);
		if (!r.ok) {
			setError(r.error || 'Something went wrong. Please try again.');
			return;
		}
		setInfo(r.info);
		setDebugUrl(r.debug_url || '');
	}

	function again() {
		setInfo('');
		setDebugUrl('');
	}

	return (
		<AuthShell title="Forgot password — WD Support Hub">
			<h2>Forgot password</h2>
			<p className="text-muted mb-4">
				Enter your username or account email. We will email a one-time reset link if a match is found.
			</p>
			{error && <div className="alert alert-danger">{error}</div>}
			{info && <div className="alert alert-success">{info}</div>}
			{debugUrl && (
				<div className="alert alert-warning">
					<strong>Local debug:</strong> mail could not be sent. Use this reset link:{' '}
					<a href={debugUrl}>{debugUrl}</a>
				</div>
			)}
			{info ? (
				<button type="button" className="btn btn-outline-secondary btn-block" onClick={again}>
					Request another link
				</button>
			) : (
				<form onSubmit={submit} autoComplete="off">
					<div className="form-group">
						<label htmlFor="identifier">Username or email</label>
						<input id="identifier" className="form-control" required autoFocus
							value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
					</div>
					<button type="submit" className="btn btn-primary btn-block" disabled={busy}>Send reset link</button>
				</form>
			)}
			<div className="text-center mt-3"><Link to="/">Back to sign in</Link></div>
		</AuthShell>
	);
}
