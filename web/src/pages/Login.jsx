import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import AuthShell from '../components/AuthShell.jsx';
import Icon from '../components/Icon.jsx';

export default function Login({ onLogin, flash }) {
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const [showPassword, setShowPassword] = useState(false);
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
			<h2>Sign in</h2>
			<p className="text-muted mb-4">Use your hub staff account.</p>
			<form onSubmit={submit} autoComplete="off">
				<div className="form-group">
					<label htmlFor="username">Username</label>
					<input id="username" className="form-control" required autoFocus autoCapitalize="none" autoCorrect="off"
						spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} />
				</div>
				<div className="form-group">
					<label htmlFor="password">Password</label>
					<div className="hub-password">
						<input id="password" type={showPassword ? 'text' : 'password'} className="form-control" required
							value={password} onChange={(e) => setPassword(e.target.value)} />
						<button type="button" className="hub-password-toggle" onClick={() => setShowPassword((v) => !v)}
							aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>
							<Icon name={showPassword ? 'eyeOff' : 'eye'} size={18} />
						</button>
					</div>
				</div>
				{flash && <div className="alert alert-success">{flash}</div>}
				{error && <div className="alert alert-danger">{error}</div>}
				<button type="submit" className="btn btn-primary btn-block" disabled={busy}>
					{busy ? 'Signing in…' : 'Sign in'}
				</button>
				<div className="text-center mt-3">
					<Link to="/forgot-password">Forgot password?</Link>
				</div>
			</form>
		</AuthShell>
	);
}
