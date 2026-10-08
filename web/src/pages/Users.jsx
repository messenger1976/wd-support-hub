import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import {
	Alert, ConfirmModal, EmptyState, Modal, PageHeader, Spinner,
} from '../components/ui.jsx';
import { can, fmtAgo, initials } from '../lib/format.js';

const BLANK = {
	id: 0, username: '', display_name: '', email: '', role_id: 2, is_active: true, all_companies: false, companies: [], password: '',
};

function UserForm({ open, initial, meta, me, onClose, onSaved }) {
	const [form, setForm] = useState(BLANK);
	const [error, setError] = useState('');
	const [saving, setSaving] = useState(false);
	const isNew = !initial?.id;

	useEffect(() => {
		if (open) {
			setForm(initial ? { ...BLANK, ...initial, password: '' } : BLANK);
			setError('');
		}
	}, [open, initial]);

	const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
	const toggleCompany = (code) => setForm((f) => ({
		...f, companies: f.companies.includes(code) ? f.companies.filter((c) => c !== code) : [...f.companies, code],
	}));

	async function save() {
		setSaving(true);
		const body = { ...form, role_id: Number(form.role_id) };
		const r = isNew ? await api.post('/users', body) : await api.post(`/users/${form.id}`, body);
		setSaving(false);
		if (!r.ok) {
			setError(r.error || 'Could not save the user.');
			return;
		}
		onSaved(isNew ? `${form.display_name} was added.` : 'User updated.');
	}

	const role = meta.roles.find((r) => Number(r.id) === Number(form.role_id));

	return (
		<Modal open={open} title={isNew ? 'Add hub user' : `Edit ${initial?.display_name}`} onClose={onClose} size="lg"
			footer={(
				<>
					<button type="button" className="btn btn-light" onClick={onClose}>Cancel</button>
					<button type="button" className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : isNew ? 'Create user' : 'Save changes'}</button>
				</>
			)}>
			<Alert onClose={() => setError('')}>{error}</Alert>
			<div className="form-row">
				<div className="form-group col-md-6">
					<label className="hub-label">Full name *</label>
					<input className="form-control" value={form.display_name} onChange={set('display_name')} maxLength={150} autoFocus />
				</div>
				<div className="form-group col-md-6">
					<label className="hub-label">Username *</label>
					<input className="form-control" value={form.username} onChange={set('username')} disabled={!isNew} maxLength={80}
						placeholder="e.g. jdelacruz" autoComplete="off" />
					{!isNew && <small className="form-text text-muted">Usernames cannot be changed.</small>}
				</div>
			</div>
			<div className="form-row">
				<div className="form-group col-md-6">
					<label className="hub-label">Email</label>
					<input className="form-control" type="email" value={form.email} onChange={set('email')} maxLength={190} />
					<small className="form-text text-muted">Needed for "Forgot password".</small>
				</div>
				<div className="form-group col-md-6">
					<label className="hub-label">{isNew ? 'Initial password *' : 'Set a new password'}</label>
					<input className="form-control" type="password" value={form.password} onChange={set('password')} autoComplete="new-password"
						placeholder={isNew ? '' : 'Leave blank to keep the current password'} />
					<small className="form-text text-muted">At least 10 characters with a letter and a number.{!isNew && ' Setting one signs the user out everywhere.'}</small>
				</div>
			</div>
			<div className="form-row">
				<div className="form-group col-md-6">
					<label className="hub-label">Role *</label>
					<select className="custom-select" value={form.role_id} onChange={set('role_id')}>
						{meta.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
					</select>
					{role?.description && <small className="form-text text-muted">{role.description}</small>}
				</div>
				<div className="form-group col-md-6">
					<label className="hub-label">Account</label>
					<div className="custom-control custom-switch mt-2">
						<input type="checkbox" className="custom-control-input" id="u-active" checked={form.is_active} onChange={set('is_active')}
							disabled={form.id === me.id} />
						<label className="custom-control-label" htmlFor="u-active">{form.is_active ? 'Active — can sign in' : 'Disabled — cannot sign in'}</label>
					</div>
				</div>
			</div>
			<label className="hub-label">Water District access</label>
			<div className="custom-control custom-switch mb-2">
				<input type="checkbox" className="custom-control-input" id="u-all" checked={form.all_companies} onChange={set('all_companies')} />
				<label className="custom-control-label" htmlFor="u-all">All Water Districts (including ones added later)</label>
			</div>
			{!form.all_companies && (
				<div className="hub-check-grid">
					{meta.companies.map((c) => (
						<label key={c.code} className={`hub-check ${form.companies.includes(c.code) ? 'checked' : ''}`}>
							<input type="checkbox" checked={form.companies.includes(c.code)} onChange={() => toggleCompany(c.code)} />
							<span>
								<strong>{c.name}</strong>
								<small>{c.code}{c.status !== 'active' ? ' · deactivated' : ''}</small>
							</span>
						</label>
					))}
				</div>
			)}
		</Modal>
	);
}

export default function Users({ user }) {
	const [users, setUsers] = useState(null);
	const [meta, setMeta] = useState({ roles: [], companies: [] });
	const [q, setQ] = useState('');
	const [editing, setEditing] = useState(null);
	const [formOpen, setFormOpen] = useState(false);
	const [confirm, setConfirm] = useState(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const [notice, setNotice] = useState('');
	const manage = can(user, 'users.manage');

	const load = useCallback(async () => {
		const [u, m] = await Promise.all([api.get('/users'), api.get('/users/meta')]);
		if (u.ok) setUsers(u.users);
		else setError(u.error || 'Could not load users.');
		if (m.ok) setMeta({ roles: m.roles, companies: m.companies });
	}, []);

	useEffect(() => { load(); }, [load]);

	const companyName = (code) => meta.companies.find((c) => c.code === code)?.name || code;

	async function runConfirm() {
		const { action, target } = confirm;
		setBusy(true);
		const r = action === 'delete'
			? await api.del(`/users/${target.id}`)
			: await api.post(`/users/${target.id}`, { ...target, is_active: action === 'enable', password: '' });
		setBusy(false);
		setConfirm(null);
		if (!r.ok) {
			setError(r.error || 'Action failed.');
			return;
		}
		setNotice(action === 'delete' ? `${target.display_name} was deleted.` : `${target.display_name} is ${action === 'enable' ? 'enabled' : 'disabled'}.`);
		load();
	}

	const shown = (users || []).filter((u) => !q || `${u.display_name} ${u.username} ${u.email} ${u.role_name}`.toLowerCase().includes(q.toLowerCase()));

	return (
		<>
			<PageHeader icon="users" title="Users" subtitle="Hub staff accounts — who can sign in, their role and which Water Districts they handle">
				<Link to="/roles" className="btn btn-sm btn-light"><Icon name="shield" size={15} className="mr-1" />Roles &amp; permissions</Link>
				{manage && (
					<button type="button" className="btn btn-sm btn-primary" onClick={() => { setEditing(null); setFormOpen(true); }}>
						<Icon name="plus" size={15} className="mr-1" />Add user
					</button>
				)}
			</PageHeader>
			<Alert onClose={() => setError('')}>{error}</Alert>
			<Alert type="success" onClose={() => setNotice('')}>{notice}</Alert>

			<div className="hub-toolbar">
				<div className="hub-search hub-search-inline">
					<Icon name="search" size={15} />
					<input className="form-control form-control-sm" type="search" placeholder="Search name, username, role" value={q}
						onChange={(e) => setQ(e.target.value)} aria-label="Search users" />
				</div>
				{users && <span className="small text-muted">{users.filter((u) => u.is_active).length} active of {users.length}</span>}
			</div>

			{!users && !error && <Spinner />}
			{users && (
				<div className="card hub-card">
					{shown.length === 0 ? <EmptyState icon="users" title="No users match" /> : (
						<div className="table-responsive">
							<table className="table hub-table hub-table-cards mb-0">
								<thead>
									<tr>
										<th>User</th>
										<th>Role</th>
										<th>Water Districts</th>
										<th>Last sign-in</th>
										<th className="text-right">Active tickets</th>
										{manage && <th className="text-right">Actions</th>}
									</tr>
								</thead>
								<tbody>
									{shown.map((u) => (
										<tr key={u.id} className={u.is_active ? '' : 'text-muted'}>
											<td data-label="User">
												<div className="d-flex align-items-center">
													<span className="hub-avatar hub-avatar-sm mr-2">{initials(u.display_name)}</span>
													<div className="min-w-0">
														<div className="font-weight-bold">
															{u.display_name}
															{u.id === user.id && <span className="badge badge-light ml-1">you</span>}
															{!u.is_active && <span className="badge badge-secondary ml-1">disabled</span>}
														</div>
														<div className="small text-muted">@{u.username}{u.email ? ` · ${u.email}` : ''}</div>
													</div>
												</div>
											</td>
											<td data-label="Role"><span className="badge hub-role-badge">{u.role_name || '—'}</span></td>
											<td data-label="Water Districts" className="small">
												{u.all_companies ? <span className="text-success">All Water Districts</span> : u.companies.map(companyName).join(', ') || '—'}
											</td>
											<td data-label="Last sign-in" className="small">{u.last_login_at ? fmtAgo(u.last_login_at) : 'Never'}</td>
											<td data-label="Active tickets" className="text-right">{u.assigned_active}</td>
											{manage && (
												<td className="text-right text-nowrap hub-row-actions">
													<button type="button" className="btn btn-sm btn-light" title="Edit" onClick={() => { setEditing(u); setFormOpen(true); }}>
														<Icon name="edit" size={14} />
													</button>
													{u.id !== user.id && (
														<button type="button" className={`btn btn-sm ${u.is_active ? 'btn-outline-warning' : 'btn-outline-success'} ml-1`}
															title={u.is_active ? 'Disable' : 'Enable'}
															onClick={() => setConfirm({ action: u.is_active ? 'disable' : 'enable', target: u })}>
															<Icon name="power" size={14} />
														</button>
													)}
													{u.id !== user.id && (
														<button type="button" className="btn btn-sm btn-outline-danger ml-1" title="Delete"
															onClick={() => setConfirm({ action: 'delete', target: u })}>
															<Icon name="trash" size={14} />
														</button>
													)}
												</td>
											)}
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</div>
			)}

			<UserForm open={formOpen} initial={editing} meta={meta} me={user} onClose={() => setFormOpen(false)}
				onSaved={(msg) => { setFormOpen(false); setNotice(msg); load(); }} />

			<ConfirmModal open={!!confirm} busy={busy} onClose={() => setConfirm(null)} onConfirm={runConfirm}
				title={confirm?.action === 'delete' ? 'Delete user' : confirm?.action === 'disable' ? 'Disable user' : 'Enable user'}
				confirmLabel={confirm?.action === 'delete' ? 'Delete' : confirm?.action === 'disable' ? 'Disable' : 'Enable'}
				tone={confirm?.action === 'enable' ? 'success' : confirm?.action === 'disable' ? 'warning' : 'danger'}>
				{confirm?.action === 'disable' && <p className="mb-0"><strong>{confirm.target.display_name}</strong> is signed out and cannot sign in until enabled again. Their replies and history stay.</p>}
				{confirm?.action === 'enable' && <p className="mb-0"><strong>{confirm.target.display_name}</strong> will be able to sign in again.</p>}
				{confirm?.action === 'delete' && (
					<p className="mb-0">
						<strong>{confirm.target.display_name}</strong> is removed permanently and their {confirm.target.assigned_active} active ticket(s) become unassigned.
						Their past replies keep their name. Prefer <em>Disable</em> for staff who may come back.
					</p>
				)}
			</ConfirmModal>
		</>
	);
}
