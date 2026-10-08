import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import AuthShell from '../components/AuthShell.jsx';

export default function Login({ onLogin, flash }) {
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const [error, setError] = useState('');
	const [busy, setBusy] = useState(false);

	async function submit(e) {
		e.preventDefault();
		setBusy(true);
		setError('');
		const r = await api.post('/auth/login', { username, password });
		setBusy(false);
		if (r.ok) onLogin(r.user);
		else setError(r.error || 'Invalid username or password.');
	}

	return (
		<AuthShell title="WD Support Hub">
			<form onSubmit={submit} autoComplete="off">
				<div className="form-group">
					<label htmlFor="username">Username</label>
					<input id="username" className="form-control" required autoFocus
						value={username} onChange={(e) => setUsername(e.target.value)} />
				</div>
				<div className="form-group">
					<label htmlFor="password">Password</label>
					<input id="password" type="password" className="form-control" required
						value={password} onChange={(e) => setPassword(e.target.value)} />
				</div>
				{flash && <div className="alert alert-success">{flash}</div>}
				{error && <div className="alert alert-danger">{error}</div>}
				<button type="submit" className="btn btn-danger btn-block" disabled={busy}>Sign in</button>
				<div className="text-center mt-3">
					<Link to="/forgot-password">Forgot password?</Link>
				</div>
			</form>
		</AuthShell>
	);
}
