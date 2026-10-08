import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import { Alert, ConfirmModal, EmptyState, PageHeader, Spinner } from '../components/ui.jsx';
import { can, fmtAgo } from '../lib/format.js';

const CONNECTION = {
	online: { label: 'Online', cls: 'success' },
	idle: { label: 'Idle', cls: 'warning' },
	offline: { label: 'Offline', cls: 'danger' },
	never: { label: 'Never connected', cls: 'secondary' },
};

export default function CompanyList({ user }) {
	const navigate = useNavigate();
	const [list, setList] = useState(null);
	const [now, setNow] = useState('');
	const [filter, setFilter] = useState('all');
	const [q, setQ] = useState('');
	const [error, setError] = useState('');
	const [notice, setNotice] = useState('');
	const [confirm, setConfirm] = useState(null);
	const [busy, setBusy] = useState(false);

	const load = useCallback(async () => {
		const r = await api.get('/water-districts');
		if (r.ok) {
			setList(r.companies);
			setNow(r.server_time);
		} else setError(r.error || 'Could not load Water Districts.');
	}, []);

	useEffect(() => { load(); }, [load]);

	async function runConfirm(typed) {
		const { action, company } = confirm;
		setBusy(true);
		const r = action === 'delete'
			? await api.del(`/water-districts/${company.code}`, { confirm_code: typed })
			: await api.post(`/water-districts/${company.code}/${action}`);
		setBusy(false);
		setConfirm(null);
		if (!r.ok) {
			setError(r.error || 'Action failed.');
			return;
		}
		setNotice(action === 'delete' ? `${company.name} was deleted.`
			: action === 'deactivate' ? `${company.name} is deactivated. Its app can no longer reach the hub.`
				: `${company.name} is active again.`);
		load();
	}

	const shown = (list || []).filter((c) => (filter === 'all' || c.status === filter)
		&& (!q || `${c.name} ${c.short_name} ${c.code}`.toLowerCase().includes(q.toLowerCase())));
	const counts = {
		all: list?.length || 0,
		active: list?.filter((c) => c.status === 'active').length || 0,
		inactive: list?.filter((c) => c.status !== 'active').length || 0,
	};

	return (
		<>
			<PageHeader icon="building" title="WD Setup" subtitle="Water Districts connected to this support hub — profile, SLA targets and app connection">
				{can(user, 'companies.create') && (
					<Link to="/water-districts/new" className="btn btn-primary btn-sm"><Icon name="plus" size={15} className="mr-1" />Add Water District</Link>
				)}
			</PageHeader>
			<Alert onClose={() => setError('')}>{error}</Alert>
			<Alert type="success" onClose={() => setNotice('')}>{notice}</Alert>

			<div className="hub-toolbar">
				<div className="btn-group btn-group-sm" role="group" aria-label="Status filter">
					{[['all', 'All'], ['active', 'Active'], ['inactive', 'Deactivated']].map(([v, l]) => (
						<button key={v} type="button" className={`btn ${filter === v ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setFilter(v)}>
							{l} <span className="badge badge-light ml-1">{counts[v]}</span>
						</button>
					))}
				</div>
				<div className="hub-search hub-search-inline">
					<Icon name="search" size={15} />
					<input className="form-control form-control-sm" type="search" placeholder="Search name or code" value={q}
						onChange={(e) => setQ(e.target.value)} aria-label="Search Water Districts" />
				</div>
			</div>

			{!list && !error && <Spinner />}
			{list && shown.length === 0 && (
				<div className="card hub-card">
					<EmptyState icon="building" title="No Water Districts">
						{list.length ? 'Nothing matches this filter.' : 'Add the first Water District to start receiving tickets.'}
					</EmptyState>
				</div>
			)}

			<div className="hub-wd-grid">
				{shown.map((c) => {
					const conn = CONNECTION[c.connection.state];
					const inactive = c.status !== 'active';
					return (
						<div key={c.code} className={`card hub-card hub-wd-card ${inactive ? 'is-inactive' : ''}`}>
							<div className="hub-wd-card-head">
								<span className="hub-wd-avatar">{(c.short_name || c.name).slice(0, 2).toUpperCase()}</span>
								<div className="min-w-0">
									<div className="font-weight-bold text-truncate">{c.name}</div>
									<div className="small text-muted">{c.code} · prefix {c.ticket_prefix || '—'}</div>
								</div>
								<span className={`badge ml-auto ${inactive ? 'badge-secondary' : 'badge-success'}`}>{inactive ? 'Deactivated' : 'Active'}</span>
							</div>
							<div className="hub-wd-stats">
								<div><strong>{c.tickets_active}</strong><span>Active</span></div>
								<div><strong className={c.tickets_needs_reply ? 'text-warning' : ''}>{c.tickets_needs_reply}</strong><span>Needs reply</span></div>
								<div><strong>{c.tickets_total}</strong><span>All tickets</span></div>
								<div><strong>{c.staff_count}</strong><span>Hub staff</span></div>
							</div>
							<div className="hub-wd-meta">
								<div><span className={`hub-conn hub-conn-${conn.cls}`} />{conn.label}{c.last_seen ? ` · ${fmtAgo(c.last_seen, now)}` : ''}</div>
								<div><Icon name="clock" size={13} className="mr-1" />SLA {c.sla_first_response_hours}h reply · {c.sla_resolution_hours}h resolve</div>
								{c.contact_person && <div><Icon name="user" size={13} className="mr-1" />{c.contact_person}{c.contact_phone ? ` · ${c.contact_phone}` : ''}</div>}
							</div>
							<div className="hub-wd-actions">
								<button type="button" className="btn btn-sm btn-light" onClick={() => navigate(`/water-districts/${c.code}`)}>
									<Icon name={can(user, 'companies.edit') ? 'edit' : 'eye'} size={14} className="mr-1" />
									{can(user, 'companies.edit') ? 'Edit' : 'View'}
								</button>
								<button type="button" className="btn btn-sm btn-light" onClick={() => navigate(`/water-districts/${c.code}?tab=connection`)}>
									<Icon name="key" size={14} className="mr-1" />Connection
								</button>
								{can(user, 'companies.deactivate') && (
									inactive ? (
										<button type="button" className="btn btn-sm btn-outline-success ml-auto" onClick={() => setConfirm({ action: 'activate', company: c })}>
											<Icon name="power" size={14} className="mr-1" />Activate
										</button>
									) : (
										<button type="button" className="btn btn-sm btn-outline-warning ml-auto" onClick={() => setConfirm({ action: 'deactivate', company: c })}>
											<Icon name="power" size={14} className="mr-1" />Deactivate
										</button>
									)
								)}
								{can(user, 'companies.deactivate') && c.tickets_total === 0 && (
									<button type="button" className="btn btn-sm btn-outline-danger" title="Delete (only possible while it has no tickets)"
										onClick={() => setConfirm({ action: 'delete', company: c })}>
										<Icon name="trash" size={14} />
									</button>
								)}
							</div>
						</div>
					);
				})}
			</div>

			<ConfirmModal open={!!confirm} busy={busy} onClose={() => setConfirm(null)} onConfirm={runConfirm}
				title={confirm?.action === 'delete' ? 'Delete Water District' : confirm?.action === 'deactivate' ? 'Deactivate Water District' : 'Activate Water District'}
				confirmLabel={confirm?.action === 'delete' ? 'Delete permanently' : confirm?.action === 'deactivate' ? 'Deactivate' : 'Activate'}
				tone={confirm?.action === 'activate' ? 'success' : confirm?.action === 'deactivate' ? 'warning' : 'danger'}
				typeToConfirm={confirm?.action === 'delete' ? confirm.company.code : undefined}>
				{confirm?.action === 'deactivate' && (
					<p className="mb-0">
						<strong>{confirm.company.name}</strong> will stop syncing: its app's API token is refused until you activate it again.
						Its tickets stay in the inbox, dashboard and reports.
					</p>
				)}
				{confirm?.action === 'activate' && (
					<p className="mb-0"><strong>{confirm.company.name}</strong> will be able to send and receive tickets again with its current token.</p>
				)}
				{confirm?.action === 'delete' && (
					<p className="mb-0"><strong>{confirm.company.name}</strong> has no tickets, so it can be removed completely. This cannot be undone.</p>
				)}
			</ConfirmModal>
		</>
	);
}
