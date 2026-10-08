import { useCallback, useEffect, useState } from 'react';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { gridless } from '../components/charts.js';
import Icon from '../components/Icon.jsx';
import {
	Alert, EmptyState, KpiCard, PageHeader, PriorityBadge, RangePicker, Spinner, StatusBadge, rangeParams,
} from '../components/ui.jsx';
import {
	BRAND_PALETTE, PRIORITY_COLORS, STATUS_COLORS, STATUS_LABELS, can, fmtAgo, fmtMinutes, fmtPct, qs,
} from '../lib/format.js';

const REFRESH_MS = 60000;
const CONNECTION = {
	online: { label: 'Online', cls: 'success' },
	idle: { label: 'Idle', cls: 'warning' },
	offline: { label: 'Offline', cls: 'danger' },
	never: { label: 'Never connected', cls: 'secondary' },
};

function ChartCard({ title, subtitle, children, className = '' }) {
	return (
		<div className={`card hub-card ${className}`}>
			<div className="hub-card-head">
				<div>
					<h2>{title}</h2>
					{subtitle && <small>{subtitle}</small>}
				</div>
			</div>
			<div className="hub-card-body">{children}</div>
		</div>
	);
}

function shortDay(d) {
	const [, m, day] = d.split('-');
	return `${Number(m)}/${Number(day)}`;
}

export default function Dashboard({ user }) {
	const navigate = useNavigate();
	const [period, setPeriod] = useState({ range: '30', from: '', to: '' });
	const [company, setCompany] = useState('all');
	const [companies, setCompanies] = useState([]);
	const [data, setData] = useState(null);
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		api.get('/companies').then((r) => r.ok && setCompanies(r.companies));
	}, []);

	const load = useCallback(async () => {
		setLoading(true);
		const r = await api.get(`/dashboard${qs({ ...rangeParams(period), company: company === 'all' ? '' : company })}`);
		setLoading(false);
		if (r.ok) {
			setData(r);
			setError('');
		} else setError(r.error || 'Could not load the dashboard.');
	}, [period, company]);

	useEffect(() => {
		load();
		const t = setInterval(() => { if (!document.hidden) load(); }, REFRESH_MS);
		return () => clearInterval(t);
	}, [load]);

	const k = data?.kpis;
	const goInbox = (extra = '') => can(user, 'inbox.view') && navigate(`/inbox${extra}`);

	const trendData = data && {
		labels: data.trend.map((d) => shortDay(d.date)),
		datasets: [
			{
				label: 'New tickets', data: data.trend.map((d) => d.created), borderColor: '#584475',
				backgroundColor: 'rgba(88,68,117,0.12)', fill: true, tension: 0.3, pointRadius: data.trend.length > 45 ? 0 : 2,
			},
			{
				label: 'Resolved / closed', data: data.trend.map((d) => d.resolved), borderColor: '#1dc9b7',
				backgroundColor: 'rgba(29,201,183,0.08)', fill: true, tension: 0.3, pointRadius: data.trend.length > 45 ? 0 : 2,
			},
		],
	};

	const statusData = data && {
		labels: data.by_status.map((s) => STATUS_LABELS[s.key] || s.key),
		datasets: [{ data: data.by_status.map((s) => s.count), backgroundColor: data.by_status.map((s) => STATUS_COLORS[s.key] || '#ccc'), borderWidth: 0 }],
	};

	const categoryData = data && {
		labels: data.by_category.map((c) => c.key),
		datasets: [{ label: 'Tickets', data: data.by_category.map((c) => c.count), backgroundColor: BRAND_PALETTE, borderRadius: 4, maxBarThickness: 28 }],
	};

	const wdData = data && {
		labels: data.by_company.map((c) => c.name),
		datasets: [
			{ label: 'Still active', data: data.by_company.map((c) => c.active), backgroundColor: '#ffc241', borderRadius: 3, maxBarThickness: 36 },
			{ label: 'Resolved / closed', data: data.by_company.map((c) => c.done), backgroundColor: '#1dc9b7', borderRadius: 3, maxBarThickness: 36 },
		],
	};

	const hourData = data && {
		labels: data.by_hour.map((_, h) => (h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`)),
		datasets: [{ label: 'Tickets', data: data.by_hour, backgroundColor: 'rgba(88,68,117,0.75)', borderRadius: 2 }],
	};

	const priorityData = data && {
		labels: data.by_priority.map((p) => p.key.charAt(0).toUpperCase() + p.key.slice(1)),
		datasets: [{ data: data.by_priority.map((p) => p.count), backgroundColor: data.by_priority.map((p) => PRIORITY_COLORS[p.key] || '#ccc'), borderWidth: 0 }],
	};

	return (
		<>
			<PageHeader icon="dashboard" title="Dashboard"
				subtitle={data ? `Support activity ${data.range.from} to ${data.range.to} · updated ${fmtAgo(data.server_time, data.server_time)}` : 'Support activity across Water Districts'}>
				<select className="custom-select custom-select-sm hub-w-auto" value={company} onChange={(e) => setCompany(e.target.value)} aria-label="Water District">
					<option value="all">All Water Districts</option>
					{companies.map((c) => <option key={c.code} value={c.code}>{c.short_name || c.name}</option>)}
				</select>
				<RangePicker value={period} onChange={setPeriod} />
				<button type="button" className="btn btn-sm btn-light" onClick={load} disabled={loading} title="Refresh">
					<Icon name="refresh" size={15} className={loading ? 'hub-spin' : ''} />
				</button>
			</PageHeader>

			<Alert onClose={() => setError('')}>{error}</Alert>
			{!data && !error && <Spinner label="Loading dashboard…" />}

			{data && (
				<>
					<div className="hub-kpis">
						<KpiCard icon="inbox" tone="warning" label="Needs a hub reply" value={k.needs_reply}
							hint={`${k.unread} with unread messages`} onClick={can(user, 'inbox.view') ? () => goInbox() : undefined} />
						<KpiCard icon="alert" tone={k.sla_breached ? 'danger' : 'success'} label="Past SLA target" value={k.sla_breached}
							hint={k.sla_breached ? 'Active tickets over reply/resolve target' : 'Everything within target'} />
						<KpiCard icon="message" tone="brand" label="Active tickets" value={k.active}
							hint={`${k.waiting_client} waiting on WD · ${k.unassigned} unassigned`} />
						<KpiCard icon="user" tone="info" label="Assigned to me" value={k.mine} hint="Active tickets you own" />
						<KpiCard icon="plus" tone="brand" label="New tickets (period)" value={k.created}
							hint={`${k.high_priority} high / urgent`} />
						<KpiCard icon="check" tone="success" label="Resolved (period)" value={k.resolved}
							hint={`Resolution SLA ${fmtPct(k.res_sla_pct)}`} />
						<KpiCard icon="clock" tone="info" label="Avg first response" value={fmtMinutes(k.avg_first_response_min)}
							hint={`Reply SLA met ${fmtPct(k.fr_sla_pct)}`} />
						<KpiCard icon="clock" tone="brand" label="Avg resolution" value={fmtMinutes(k.avg_resolution_min)}
							hint={`${k.messages_from_wd} WD msgs · ${k.messages_from_hub} hub replies`} />
						<KpiCard icon="wifi" tone={k.wds_online ? 'success' : 'secondary'} label="WDs online now" value={`${k.wds_online}/${k.wds_total}`}
							hint="Contacted the hub in the last 5 min" />
					</div>

					<div className="hub-grid hub-grid-2-1">
						<ChartCard title="Ticket trend" subtitle="New vs resolved per day">
							<div className="hub-chart-lg">
								<Line data={trendData} options={{ scales: gridless, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'bottom' } } }} />
							</div>
						</ChartCard>
						<ChartCard title="Status mix" subtitle="Tickets raised in the period">
							{data.by_status.length ? (
								<div className="hub-chart-lg">
									<Doughnut data={statusData} options={{ cutout: '62%', plugins: { legend: { position: 'bottom' } } }} />
								</div>
							) : <EmptyState title="No tickets in this period" />}
						</ChartCard>
					</div>

					<div className="hub-grid hub-grid-3">
						<ChartCard title="Issue categories" subtitle="What the WDs need help with">
							{data.by_category.length ? (
								<div className="hub-chart">
									<Bar data={categoryData} options={{ indexAxis: 'y', scales: { x: gridless.y, y: { grid: { display: false } } }, plugins: { legend: { display: false } } }} />
								</div>
							) : <EmptyState title="No data" />}
						</ChartCard>
						<ChartCard title="By Water District" subtitle="Tickets raised in the period">
							{data.by_company.length ? (
								<div className="hub-chart">
									<Bar data={wdData} options={{ scales: { x: { ...gridless.x, stacked: true }, y: { ...gridless.y, stacked: true } }, plugins: { legend: { position: 'bottom' } } }} />
								</div>
							) : <EmptyState title="No data" />}
						</ChartCard>
						<ChartCard title="Priority" subtitle="Tickets raised in the period">
							{data.by_priority.length ? (
								<div className="hub-chart">
									<Doughnut data={priorityData} options={{ cutout: '55%', plugins: { legend: { position: 'bottom' } } }} />
								</div>
							) : <EmptyState title="No data" />}
						</ChartCard>
					</div>

					<div className="hub-grid hub-grid-1-1">
						<div className="card hub-card">
							<div className="hub-card-head">
								<div>
									<h2>Needs attention</h2>
									<small>Waiting for a hub reply — overdue and urgent first</small>
								</div>
								{can(user, 'inbox.view') && <Link to="/inbox" className="btn btn-sm btn-light">Open inbox</Link>}
							</div>
							{data.attention.length === 0 ? (
								<EmptyState icon="check" title="All caught up">No ticket is waiting for a hub reply.</EmptyState>
							) : (
								<div className="list-group list-group-flush">
									{data.attention.map((t) => (
										<button key={t.uuid} type="button" className="list-group-item list-group-item-action hub-attn"
											onClick={() => goInbox(`?ticket=${encodeURIComponent(t.uuid)}`)} disabled={!can(user, 'inbox.view')}>
											<div className="d-flex align-items-center">
												<span className="hub-wd-chip">{t.company_name}</span>
												<span className="hub-ticket-no ml-2">{t.ticket_no}</span>
												<span className="ml-auto small text-muted">waiting {fmtMinutes(t.waiting_min)}</span>
											</div>
											<div className="text-truncate font-weight-bold my-1">{t.subject}</div>
											<div className="hub-ticket-meta">
												<StatusBadge status={t.status} />
												<PriorityBadge priority={t.priority} />
												{t.breached && <span className="badge hub-sla hub-sla-breach">Past SLA</span>}
												<span className="small text-muted">{t.assigned_name ? `→ ${t.assigned_name}` : 'Unassigned'}</span>
											</div>
										</button>
									))}
								</div>
							)}
						</div>

						<div className="card hub-card">
							<div className="hub-card-head">
								<div>
									<h2>Water District health</h2>
									<small>Connection and open workload per WD</small>
								</div>
								{can(user, 'companies.view') && <Link to="/wd" className="btn btn-sm btn-light">WD Setup</Link>}
							</div>
							<div className="table-responsive">
								<table className="table table-sm hub-table mb-0">
									<thead>
										<tr>
											<th>Water District</th>
											<th>Connection</th>
											<th className="text-right">Active</th>
											<th className="text-right">Needs reply</th>
										</tr>
									</thead>
									<tbody>
										{data.wds.map((w) => {
											const c = CONNECTION[w.connection.state];
											return (
												<tr key={w.code} className={w.status !== 'active' ? 'text-muted' : ''}>
													<td>
														<div className="font-weight-bold">{w.short_name || w.name}</div>
														<div className="small text-muted">{w.code}{w.status !== 'active' ? ' · deactivated' : ''}</div>
													</td>
													<td>
														<span className={`hub-conn hub-conn-${c.cls}`} />
														{c.label}
														<div className="small text-muted">{w.last_seen ? fmtAgo(w.last_seen, data.server_time) : ''}</div>
													</td>
													<td className="text-right">{w.active}</td>
													<td className="text-right">
														{w.needs_reply > 0 ? <span className="badge badge-warning">{w.needs_reply}</span> : 0}
													</td>
												</tr>
											);
										})}
									</tbody>
								</table>
							</div>
						</div>
					</div>

					<ChartCard title="Busiest hours" subtitle="When WDs raise tickets (hub time) — helps plan support coverage">
						<div className="hub-chart-sm">
							<Bar data={hourData} options={{ scales: gridless, plugins: { legend: { display: false } } }} />
						</div>
					</ChartCard>
				</>
			)}
		</>
	);
}
