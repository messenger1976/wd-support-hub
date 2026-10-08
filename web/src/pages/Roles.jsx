import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import { Alert, ConfirmModal, PageHeader, Spinner } from '../components/ui.jsx';
import { can } from '../lib/format.js';

export default function Roles({ user }) {
	const [data, setData] = useState(null);
	const [selected, setSelected] = useState(null);
	const [draft, setDraft] = useState(null);
	const [error, setError] = useState('');
	const [notice, setNotice] = useState('');
	const [saving, setSaving] = useState(false);
	const [confirmDelete, setConfirmDelete] = useState(false);
	const manage = can(user, 'roles.manage');

	const load = useCallback(async (selectId) => {
		const r = await api.get('/roles');
		if (!r.ok) {
			setError(r.error || 'Could not load roles.');
			return;
		}
		setData(r);
		const pick = r.roles.find((x) => x.id === selectId) || r.roles[0];
		if (pick) {
			setSelected(pick.id);
			setDraft({ ...pick, permissions: [...pick.permissions] });
		}
	}, []);

	useEffect(() => { load(); }, [load]);

	function select(role) {
		setSelected(role.id);
		setDraft({ ...role, permissions: [...role.permissions] });
		setError('');
	}

	function startNew(from) {
		setSelected('new');
		setDraft({
			id: 0,
			name: from ? `${from.name} (copy)` : '',
			description: from?.description || '',
			is_system: false,
			full_access: false,
			permissions: from && !from.full_access ? [...from.permissions] : ['dashboard.view', 'inbox.view'],
			user_count: 0,
		});
	}

	const toggle = (key) => setDraft((d) => ({
		...d, permissions: d.permissions.includes(key) ? d.permissions.filter((k) => k !== key) : [...d.permissions, key],
	}));

	const toggleGroup = (group, on) => setDraft((d) => {
		const keys = group.actions.map((a) => a.key);
		const rest = d.permissions.filter((k) => !keys.includes(k));
		return { ...d, permissions: on ? [...rest, ...keys] : rest };
	});

	async function save() {
		setSaving(true);
		const body = { name: draft.name, description: draft.description, permissions: draft.permissions };
		const r = draft.id ? await api.post(`/roles/${draft.id}`, body) : await api.post('/roles', body);
		setSaving(false);
		if (!r.ok) {
			setError(r.error || 'Could not save the role.');
			return;
		}
		setNotice(draft.id ? 'Role saved. Users with this role get the new permissions on their next click.' : 'Role created.');
		load(draft.id || r.id);
	}

	async function remove() {
		setSaving(true);
		const r = await api.del(`/roles/${draft.id}`);
		setSaving(false);
		setConfirmDelete(false);
		if (!r.ok) {
			setError(r.error || 'Could not delete the role.');
			return;
		}
		setNotice('Role deleted.');
		load();
	}

	if (!data && !error) return <Spinner />;
	const editable = manage && draft && !draft.full_access;

	return (
		<>
			<PageHeader icon="shield" title="Roles & Permissions" subtitle="What each kind of hub user may see and do. Water District access is set per user.">
				{can(user, 'users.view') && (
					<Link to="/users" className="btn btn-sm btn-light"><Icon name="users" size={15} className="mr-1" />Users</Link>
				)}
				{manage && (
					<button type="button" className="btn btn-sm btn-primary" onClick={() => startNew(null)}>
						<Icon name="plus" size={15} className="mr-1" />New role
					</button>
				)}
			</PageHeader>
			<Alert onClose={() => setError('')}>{error}</Alert>
			<Alert type="success" onClose={() => setNotice('')}>{notice}</Alert>

			{data && (
				<div className="hub-roles">
					<div className="hub-role-list">
						{data.roles.map((r) => (
							<button key={r.id} type="button" className={`hub-role-item ${selected === r.id ? 'active' : ''}`} onClick={() => select(r)}>
								<div className="d-flex align-items-center">
									<strong className="flex-grow-1">{r.name}</strong>
									<span className="badge badge-light">{r.user_count} user{r.user_count === 1 ? '' : 's'}</span>
								</div>
								<small>{r.full_access ? 'Full access' : `${r.permissions.length} permissions`}{r.is_system ? ' · built-in' : ''}</small>
							</button>
						))}
						{selected === 'new' && (
							<div className="hub-role-item active"><strong>New role</strong><small>Not saved yet</small></div>
						)}
					</div>

					{draft && (
						<div className="card hub-card">
							<div className="hub-card-body">
								<div className="form-row">
									<div className="form-group col-md-5">
										<label className="hub-label">Role name</label>
										<input className="form-control" value={draft.name} disabled={!manage} maxLength={80}
											onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
									</div>
									<div className="form-group col-md-7">
										<label className="hub-label">Description</label>
										<input className="form-control" value={draft.description} disabled={!manage} maxLength={255}
											onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} />
									</div>
								</div>
								{draft.full_access && (
									<div className="alert alert-info py-2 small">
										The Administrator role always has every permission, including ones added in future versions. Only its name and description can change.
									</div>
								)}
								<div className="hub-perm-grid">
									{data.groups.map((g) => {
										const keys = g.actions.map((a) => a.key);
										const allOn = draft.full_access || keys.every((k) => draft.permissions.includes(k));
										return (
											<div key={g.module} className="hub-perm-row">
												<div className="hub-perm-module">
													<label className="mb-0">
														<input type="checkbox" className="mr-2" checked={allOn} disabled={!editable}
															onChange={(e) => toggleGroup(g, e.target.checked)} />
														<strong>{g.label}</strong>
													</label>
												</div>
												<div className="hub-perm-actions">
													{g.actions.map((a) => {
														const on = draft.full_access || draft.permissions.includes(a.key);
														return (
															<label key={a.key} className={`hub-perm-chip ${on ? 'on' : ''}`}>
																<input type="checkbox" checked={on} disabled={!editable} onChange={() => toggle(a.key)} />
																{a.label}
															</label>
														);
													})}
												</div>
											</div>
										);
									})}
								</div>
								<p className="small text-muted mt-3 mb-0">
									Replying, assigning or changing status also grants viewing the inbox; managing users also grants viewing users.
									You cannot give a role more permissions than you hold.
								</p>
							</div>
							{manage && (
								<div className="hub-card-foot">
									<button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
										{saving ? 'Saving…' : draft.id ? 'Save role' : 'Create role'}
									</button>
									{draft.id > 0 && (
										<button type="button" className="btn btn-light ml-2" onClick={() => startNew(draft)}>Duplicate</button>
									)}
									{draft.id > 0 && !draft.is_system && (
										<button type="button" className="btn btn-outline-danger ml-auto" onClick={() => setConfirmDelete(true)}
											disabled={draft.user_count > 0} title={draft.user_count ? 'Move its users to another role first' : ''}>
											<Icon name="trash" size={14} className="mr-1" />Delete
										</button>
									)}
								</div>
							)}
						</div>
					)}
				</div>
			)}

			<ConfirmModal open={confirmDelete} busy={saving} title="Delete role" confirmLabel="Delete role"
				onClose={() => setConfirmDelete(false)} onConfirm={remove}>
				<p className="mb-0">Delete the role <strong>{draft?.name}</strong>? No user has it, so nothing else changes.</p>
			</ConfirmModal>
		</>
	);
}
