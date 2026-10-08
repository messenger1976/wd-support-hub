import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { gridless } from '../components/charts.js';
import Icon from '../components/Icon.jsx';
import {
	Alert, EmptyState, PageHeader, PriorityBadge, RangePicker, Spinner, StatusBadge, rangeParams,
} from '../components/ui.jsx';
import {
	BRAND_PALETTE, STATUS_COLORS, can, fmtDateTime, fmtInt, fmtMinutes, fmtPct, qs,
} from '../lib/format.js';

const REPORT_ICONS = {
	'wd-summary': 'building',
	register: 'list',
	sla: 'clock',
	categories: 'reports',
	aging: 'alert',
	staff: 'users',
	connectivity: 'wifi',
};

const SERIES_COLORS = {
	open_n: STATUS_COLORS.open,
	waiting_support: STATUS_COLORS.waiting_support,
	waiting_client: STATUS_COLORS.waiting_client,
	resolved: STATUS_COLORS.resolved,
	closed: STATUS_COLORS.closed,
	d0: '#4caf50',
	d1: '#1dc9b7',
	d3: '#ffc241',
	d7: '#fd7e14',
	d30: '#dc3545',
	replies: '#0a6ba3',
};

function Cell({ col, value }) {
	switch (col.type) {
		case 'int': return fmtInt(value);
		case 'pct': {
			if (value === null || value === undefined) return '—';
			const tone = value >= 90 ? 'text-success' : value >= 70 ? 'text-warning' : 'text-danger';
			return <span className={`font-weight-bold ${tone}`}>{fmtPct(value)}</span>;
		}
		case 'min': return fmtMinutes(value);
		case 'datetime': return value ? fmtDateTime(value) : '—';
		case 'status': return <StatusBadge status={value} />;
		case 'priority': return <PriorityBadge priority={value} all />;
		default:
			if (col.key === 'sla' && ['Breached', 'Late reply', 'Met', 'Pending'].includes(value)) {
				const cls = { Breached: 'danger', 'Late reply': 'warning', Met: 'success', Pending: 'light' }[value];
				return <span className={`badge badge-${cls}`}>{value}</span>;
			}
			if (col.key === 'connection') {
				const cls = { Online: 'success', Idle: 'warning', Offline: 'danger' }[value] || 'secondary';
				return <><span className={`hub-conn hub-conn-${cls}`} />{value}</>;
			}
			return value === null || value === undefined || value === '' ? '—' : String(value);
	}
}

function totalsRow(columns, rows) {
	if (rows.length < 2) return null;
	const out = {};
	let any = false;
	columns.forEach((c, i) => {
		if (i === 0) out[c.key] = 'Total';
		else if (c.type === 'int') {
			out[c.key] = rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0);
			any = true;
		}
	});
	return any ? out : null;
}

export default function Reports({ user }) {
	const { type } = useParams();
	const navigate = useNavigate();
	const [catalogue, setCatalogue] = useState([]);
	const [companies, setCompanies] = useState([]);
	const [period, setPeriod] = useState({ range: '30', from: '', to: '' });
	const [company, setCompany] = useState('all');
	const [status, setStatus] = useState('');
	const [report, setReport] = useState(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [sort, setSort] = useState({ key: '', dir: 1 });
	const loadSeq = useRef(0);

	useEffect(() => {
		api.get('/reports').then((r) => r.ok && setCatalogue(r.reports));
		api.get('/companies').then((r) => r.ok && setCompanies(r.companies));
	}, []);

	const active = type || catalogue[0]?.key;
	const meta = catalogue.find((r) => r.key === active);
	const filters = useMemo(() => meta?.filters || [], [meta]);

	const params = useMemo(() => ({
		...(filters.includes('range') ? rangeParams(period) : {}),
		...(filters.includes('company') && company !== 'all' ? { company } : {}),
		...(filters.includes('status') && status ? { status } : {}),
	}), [filters, period, company, status]);

	const load = useCallback(async () => {
		if (!active) return;
		const seq = ++loadSeq.current;
		setLoading(true);
		const r = await api.get(`/reports/${active}${qs(params)}`);
		if (seq !== loadSeq.current) return;
		setLoading(false);
		if (r.ok) {
			setReport(r);
			setError('');
		} else setError(r.error || 'Could not run the report.');
	}, [active, params]);

	useEffect(() => { load(); }, [load]);

	useEffect(() => {
		setSort({ key: '', dir: 1 });
		setReport(null);
	}, [active]);

	const rows = useMemo(() => {
		if (!report) return [];
		if (!sort.key) return report.rows;
		return [...report.rows].sort((a, b) => {
			const x = a[sort.key];
			const y = b[sort.key];
			if (x === y) return 0;
			if (x === null || x === undefined) return 1;
			if (y === null || y === undefined) return -1;
			return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * sort.dir;
		});
	}, [report, sort]);

	const chart = useMemo(() => {
		if (!report?.chart || !report.rows.length) return null;
		const labelOf = Object.fromEntries(report.columns.map((c) => [c.key, c.label]));
		return {
			data: {
				labels: report.rows.map((r) => r[report.chart.label]),
				datasets: report.chart.series.map((s, i) => ({
					label: labelOf[s] || s,
					data: report.rows.map((r) => r[s] || 0),
					backgroundColor: SERIES_COLORS[s] || BRAND_PALETTE[i % BRAND_PALETTE.length],
					borderRadius: 3,
					maxBarThickness: 40,
				})),
			},
			options: {
				scales: {
					x: { ...gridless.x, stacked: !!report.chart.stacked },
					y: { ...gridless.y, stacked: !!report.chart.stacked },
				},
				plugins: { legend: { position: 'bottom' } },
			},
		};
	}, [report]);

	const total = report ? totalsRow(report.columns, report.rows) : null;
	const csvUrl = active ? `/api/hub/reports/${active}${qs({ ...params, format: 'csv' })}` : '';

	return (
		<>
			<PageHeader icon="reports" title="Reports" subtitle="Support performance and Water District status — export to Excel or print">
				{report && (
					<>
						{can(user, 'reports.export') && (
							<a className="btn btn-sm btn-primary" href={csvUrl} download>
								<Icon name="download" size={15} className="mr-1" />Export CSV
							</a>
						)}
						<button type="button" className="btn btn-sm btn-light" onClick={() => window.print()}>
							<Icon name="printer" size={15} className="mr-1" />Print
						</button>
					</>
				)}
			</PageHeader>

			<div className="hub-reports">
				<nav className="hub-report-nav" aria-label="Reports">
					<select className="custom-select custom-select-sm d-lg-none mb-3" value={active || ''} aria-label="Choose report"
						onChange={(e) => navigate(`/reports/${e.target.value}`)}>
						{catalogue.map((r) => <option key={r.key} value={r.key}>{r.title}</option>)}
					</select>
					<div className="list-group d-none d-lg-flex">
						{catalogue.map((r) => (
							<button key={r.key} type="button" onClick={() => navigate(`/reports/${r.key}`)}
								className={`list-group-item list-group-item-action hub-report-link ${r.key === active ? 'active' : ''}`}>
								<Icon name={REPORT_ICONS[r.key] || 'reports'} size={16} className="mr-2" />
								{r.title}
							</button>
						))}
					</div>
				</nav>

				<div className="hub-report-main">
					{meta && (
						<div className="card hub-card mb-3">
							<div className="hub-card-body">
								<h2 className="hub-report-title">{meta.title}</h2>
								<p className="text-muted small mb-3">{meta.description}</p>
								<div className="hub-toolbar mb-0">
									{filters.includes('range') && <RangePicker value={period} onChange={setPeriod} />}
									{filters.includes('company') && (
										<select className="custom-select custom-select-sm hub-w-auto" value={company} onChange={(e) => setCompany(e.target.value)} aria-label="Water District">
											<option value="all">All Water Districts</option>
											{companies.map((c) => <option key={c.code} value={c.code}>{c.short_name || c.name}</option>)}
										</select>
									)}
									{filters.includes('status') && (
										<select className="custom-select custom-select-sm hub-w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
											<option value="">All statuses</option>
											<option value="active">Active only</option>
											<option value="open">Open</option>
											<option value="waiting_support">Waiting support</option>
											<option value="waiting_client">Waiting WD</option>
											<option value="resolved">Resolved</option>
											<option value="closed">Closed</option>
										</select>
									)}
									{loading && <span className="spinner-border spinner-border-sm text-primary ml-2" />}
								</div>
							</div>
						</div>
					)}

					<Alert onClose={() => setError('')}>{error}</Alert>
					{!report && !error && <Spinner label="Running report…" />}

					{report && (
						<div className="hub-print-area">
							<div className="hub-print-head">
								<h1>{report.title}</h1>
								<div>
									{report.range ? `Period ${report.range.from} to ${report.range.to}` : 'As of now'}
									{company !== 'all' && filters.includes('company') ? ` · ${companies.find((c) => c.code === company)?.name || company}` : ' · All Water Districts'}
									{` · generated ${fmtDateTime(report.generated_at)} by ${report.generated_by}`}
								</div>
							</div>

							{chart && (
								<div className="card hub-card mb-3 hub-no-break">
									<div className="hub-card-body"><div className="hub-chart"><Bar data={chart.data} options={chart.options} /></div></div>
								</div>
							)}

							<div className="card hub-card">
								{rows.length === 0 ? (
									<EmptyState icon="reports" title="No data">Nothing to report for these filters.</EmptyState>
								) : (
									<div className="table-responsive">
										<table className="table table-sm table-hover hub-table hub-report-table mb-0">
											<thead>
												<tr>
													{report.columns.map((c) => (
														<th key={c.key} className={['int', 'pct', 'min'].includes(c.type) ? 'text-right' : ''}>
															<button type="button" className="hub-sort" onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? -s.dir : -1 }))}>
																{c.label}
																{sort.key === c.key && <span className="ml-1">{sort.dir > 0 ? '▲' : '▼'}</span>}
															</button>
														</th>
													))}
												</tr>
											</thead>
											<tbody>
												{rows.map((r, i) => (
													// eslint-disable-next-line react/no-array-index-key
													<tr key={i}>
														{report.columns.map((c) => (
															<td key={c.key} className={['int', 'pct', 'min'].includes(c.type) ? 'text-right text-nowrap' : c.key === 'subject' ? 'hub-td-wide' : ''}>
																<Cell col={c} value={r[c.key]} />
															</td>
														))}
													</tr>
												))}
											</tbody>
											{total && (
												<tfoot>
													<tr>
														{report.columns.map((c) => (
															<th key={c.key} className={c.type === 'int' ? 'text-right' : ''}>
																{total[c.key] === undefined ? '' : c.type === 'int' ? fmtInt(total[c.key]) : total[c.key]}
															</th>
														))}
													</tr>
												</tfoot>
											)}
										</table>
									</div>
								)}
							</div>
							<div className="small text-muted mt-2 d-print-none">
								{rows.length} row{rows.length === 1 ? '' : 's'}. Click a column heading to sort. Durations show days (d), hours (h) and minutes (m); the CSV uses decimal hours.
							</div>
						</div>
					)}
				</div>
			</div>
		</>
	);
}
