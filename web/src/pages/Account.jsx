import { useState } from 'react';
import { api } from '../api.js';
import { Alert, PageHeader } from '../components/ui.jsx';
import { initials } from '../lib/format.js';

export default function Account({ user, onUpdated }) {
	const [profile, setProfile] = useState({ display_name: user.display_name, email: user.email || '' });
	const [pw, setPw] = useState({ current_password: '', password: '', password_confirm: '' });
	const [msg, setMsg] = useState({ type: '', text: '' });
	const [busy, setBusy] = useState('');

	async function saveProfile(e) {
		e.preventDefault();
		setBusy('profile');
		const r = await api.post('/auth/profile', profile);
		setBusy('');
		if (!r.ok) return setMsg({ type: 'danger', text: r.error || 'Could not save.' });
		onUpdated(r.user);
		return setMsg({ type: 'success', text: 'Profile saved.' });
	}

	async function savePassword(e) {
		e.preventDefault();
		setBusy('password');
		const r = await api.post('/auth/change-password', pw);
		setBusy('');
		if (!r.ok) return setMsg({ type: 'danger', text: r.error || 'Could not change the password.' });
		setPw({ current_password: '', password: '', password_confirm: '' });
		return setMsg({ type: 'success', text: r.message || 'Password changed.' });
	}

	const setP = (k) => (e) => setProfile((p) => ({ ...p, [k]: e.target.value }));
	const setW = (k) => (e) => setPw((p) => ({ ...p, [k]: e.target.value }));

	return (
		<>
			<PageHeader icon="user" title="My account" subtitle="Your profile, password and access on the support hub" />
			<Alert type={msg.type} onClose={() => setMsg({ type: '', text: '' })}>{msg.text}</Alert>
			<div className="hub-grid hub-grid-1-1">
				<div className="card hub-card">
					<div className="hub-card-body d-flex align-items-center">
						<span className="hub-avatar hub-avatar-lg mr-3">{initials(user.display_name)}</span>
						<div>
							<div className="h5 mb-0">{user.display_name}</div>
							<div className="text-muted">@{user.username}</div>
							<div className="mt-1">
								<span className="badge hub-role-badge mr-1">{user.role_name}</span>
								<span className="small text-muted">
									{user.all_companies ? 'All Water Districts' : user.companies.join(', ')}
								</span>
							</div>
						</div>
					</div>
					<form className="hub-card-body border-top" onSubmit={saveProfile}>
						<div className="form-group">
							<label className="hub-label">Full name</label>
							<input className="form-control" value={profile.display_name} onChange={setP('display_name')} maxLength={150} required />
							<small className="form-text text-muted">Shown to Water District staff on your replies.</small>
						</div>
						<div className="form-group">
							<label className="hub-label">Email</label>
							<input className="form-control" type="email" value={profile.email} onChange={setP('email')} maxLength={190} />
							<small className="form-text text-muted">Used for password reset emails.</small>
						</div>
						<button type="submit" className="btn btn-primary" disabled={busy === 'profile'}>{busy === 'profile' ? 'Saving…' : 'Save profile'}</button>
					</form>
				</div>

				<form className="card hub-card" onSubmit={savePassword}>
					<div className="hub-card-head"><div><h2>Change password</h2><small>Other signed-in browsers will be signed out</small></div></div>
					<div className="hub-card-body">
						<div className="form-group">
							<label className="hub-label">Current password</label>
							<input className="form-control" type="password" value={pw.current_password} onChange={setW('current_password')} autoComplete="current-password" required />
						</div>
						<div className="form-group">
							<label className="hub-label">New password</label>
							<input className="form-control" type="password" value={pw.password} onChange={setW('password')} autoComplete="new-password" required />
							<small className="form-text text-muted">At least 10 characters with a letter and a number.</small>
						</div>
						<div className="form-group">
							<label className="hub-label">Confirm new password</label>
							<input className="form-control" type="password" value={pw.password_confirm} onChange={setW('password_confirm')} autoComplete="new-password" required />
						</div>
						<button type="submit" className="btn btn-primary" disabled={busy === 'password'}>{busy === 'password' ? 'Updating…' : 'Change password'}</button>
					</div>
				</form>
			</div>
		</>
	);
}
