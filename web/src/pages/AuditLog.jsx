import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import { Alert, EmptyState, PageHeader, Spinner } from '../components/ui.jsx';
import { fmtDateTime, qs } from '../lib/format.js';

const ACTION_LABELS = {
	'auth.login': 'Signed in',
	'account.profile': 'Updated own profile',
	'account.password': 'Changed own password',
	'ticket.status': 'Changed ticket status',
	'ticket.assign': 'Assigned ticket',
	'wd.create': 'Added Water District',
	'wd.update': 'Edited Water District',
	'wd.deactivate': 'Deactivated Water District',
	'wd.activate': 'Activated Water District',
	'wd.delete': 'Deleted Water District',
	'wd.token_view': 'Viewed API token',
	'wd.token_rotate': 'Rotated API token',
	'wd.connection_view': 'Viewed connection config',
	'user.create': 'Added user',
	'user.update': 'Edited user',
	'user.delete': 'Deleted user',
	'role.create': 'Added role',
	'role.update': 'Edited role',
	'role.delete': 'Deleted role',
	'report.export': 'Exported report',
};

function value(v) {
	if (Array.isArray(v)) return v.join(', ');
	if (v && typeof v === 'object') {
		if (v.from && v.to) return `${v.from} to ${v.to}`;
		return Object.entries(v).map(([k, x]) => `${k.replace(/_/g, ' ')} ${value(x)}`).join(', ');
	}
	return String(v);
}

function describe(details) {
	if (!details || typeof details !== 'object') return details ? String(details) : '';
	return Object.entries(details)
		.filter(([, v]) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && !v.length))
		.map(([k, v]) => `${k.replace(/_/g, ' ')}: ${value(v)}`)
		.join(' · ');
}

export default function AuditLog() {
	const [filters, setFilters] = useState({ entity: '', user_id: '', q: '', from: '', to: '' });
	const [page, setPage] = useState(1);
	const [data, setData] = useState(null);
	const [error, setError] = useState('');

	const load = useCallback(async () => {
		const r = await api.get(`/audit${qs({ ...filters, page })}`);
		if (r.ok) setData(r);
		else setError(r.error || 'Could not load the audit log.');
	}, [filters, page]);

	useEffect(() => {
		const t = setTimeout(load, filters.q ? 300 : 0);
		return () => clearTimeout(t);
	}, [load, filters.q]);

	const set = (k) => (e) => {
		setPage(1);
		setFilters((f) => ({ ...f, [k]: e.target.value }));
	};
	const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

	return (
		<>
			<PageHeader icon="list" title="Audit Log" subtitle="Who changed what on the hub — Water Districts, tokens, users, roles, ticket status and exports" />
			<Alert onClose={() => setError('')}>{error}</Alert>
			<div className="hub-toolbar">
				<select className="custom-select custom-select-sm hub-w-auto" value={filters.entity} onChange={set('entity')} aria-label="Area">
					<option value="">All areas</option>
					<option value="company">Water Districts</option>
					<option value="ticket">Tickets</option>
					<option value="user">Users</option>
					<option value="role">Roles</option>
					<option value="report">Reports</option>
				</select>
				<select className="custom-select custom-select-sm hub-w-auto" value={filters.user_id} onChange={set('user_id')} aria-label="User">
					<option value="">Everyone</option>
					{(data?.users || []).map((u) => <option key={u.user_id} value={u.user_id}>{u.user_name}</option>)}
				</select>
				<input type="date" className="form-control form-control-sm hub-w-auto" value={filters.from} onChange={set('from')} aria-label="From" />
				<input type="date" className="form-control form-control-sm hub-w-auto" value={filters.to} onChange={set('to')} aria-label="To" />
				<div className="hub-search hub-search-inline">
					<Icon name="search" size={15} />
					<input className="form-control form-control-sm" type="search" placeholder="Search" value={filters.q} onChange={set('q')} aria-label="Search log" />
				</div>
			</div>

			{!data && !error && <Spinner />}
			{data && (
				<div className="card hub-card">
					{data.entries.length === 0 ? <EmptyState icon="list" title="No entries" /> : (
						<div className="table-responsive">
							<table className="table table-sm hub-table hub-table-cards mb-0">
								<thead>
									<tr><th>When</th><th>Who</th><th>Action</th><th>Item</th><th>Details</th><th>IP</th></tr>
								</thead>
								<tbody>
									{data.entries.map((e) => (
										<tr key={e.id}>
											<td data-label="When" className="text-nowrap small">{fmtDateTime(e.created_at)}</td>
											<td data-label="Who">{e.user_name || '—'}</td>
											<td data-label="Action">{ACTION_LABELS[e.action] || e.action}</td>
											<td data-label="Item" className="small"><span className="text-muted">{e.entity}</span> {e.entity_id}</td>
											<td data-label="Details" className="small text-muted hub-td-wide">{describe(e.details)}</td>
											<td data-label="IP" className="small text-muted">{e.ip}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
					<div className="hub-card-foot">
						<span className="small text-muted">{data.total} entr{data.total === 1 ? 'y' : 'ies'}</span>
						<div className="btn-group btn-group-sm ml-auto">
							<button type="button" className="btn btn-light" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
							<span className="btn btn-light disabled">{page} / {pages}</span>
							<button type="button" className="btn btn-light" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
						</div>
					</div>
				</div>
			)}
		</>
	);
}
