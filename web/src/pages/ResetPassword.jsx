import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import AuthShell from '../components/AuthShell.jsx';

export default function ResetPassword({ onDone }) {
	const [params] = useSearchParams();
	const token = params.get('token') || '';
	const navigate = useNavigate();
	const [state, setState] = useState({ loading: true, username: '', invalid: '' });
	const [password, setPassword] = useState('');
	const [confirm, setConfirm] = useState('');
	const [error, setError] = useState('');
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		api.get(`/auth/reset-password?token=${encodeURIComponent(token)}`).then((r) => {
			setState(r.ok
				? { loading: false, username: r.username, invalid: '' }
				: { loading: false, username: '', invalid: r.error || 'This reset link is invalid or has expired.' });
		});
	}, [token]);

	async function submit(e) {
		e.preventDefault();
		setBusy(true);
		setError('');
		const r = await api.post('/auth/reset-password', { token, password, password_confirm: confirm });
		setBusy(false);
		if (r.ok) {
			onDone(r.message);
			navigate('/', { replace: true });
		} else if (r.expired) {
			setState({ loading: false, username: '', invalid: r.error });
		} else {
			setError(r.error || 'Could not update password. Please try again.');
		}
	}

	return (
		<AuthShell title="Reset password — WD Support Hub">
			<h4 className="mb-1">Choose a new password</h4>
			<p className="text-muted mb-4">Reset links expire after use and after a short time window.</p>
			{state.loading ? null : state.invalid ? (
				<>
					<div className="alert alert-danger">{state.invalid}</div>
					<Link className="btn btn-danger btn-block" to="/forgot-password">Request a new link</Link>
				</>
			) : (
				<form onSubmit={submit} autoComplete="off">
					{error && <div className="alert alert-danger">{error}</div>}
					<div className="form-group">
						<label>Account</label>
						<input className="form-control" value={state.username} disabled />
					</div>
					<div className="form-group">
						<label htmlFor="password">New password</label>
						<input id="password" type="password" className="form-control" required minLength={10} autoFocus
							value={password} onChange={(e) => setPassword(e.target.value)} />
						<small className="form-text text-muted">At least 10 characters, with a letter and a number.</small>
					</div>
					<div className="form-group">
						<label htmlFor="password_confirm">Confirm new password</label>
						<input id="password_confirm" type="password" className="form-control" required minLength={10}
							value={confirm} onChange={(e) => setConfirm(e.target.value)} />
					</div>
					<button type="submit" className="btn btn-danger btn-block" disabled={busy}>Update password</button>
				</form>
			)}
			<div className="text-center mt-3"><Link to="/">Back to sign in</Link></div>
		</AuthShell>
	);
}
