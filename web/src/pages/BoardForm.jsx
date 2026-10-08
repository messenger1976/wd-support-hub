import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import BoardPreview from '../components/BoardPreview.jsx';
import Icon from '../components/Icon.jsx';
import RichEditor from '../components/RichEditor.jsx';
import { Alert, ConfirmModal, EmptyState, PageHeader, Spinner } from '../components/ui.jsx';
import {
	AUDIENCES, CATEGORIES, EMPTY_MESSAGE, PRIORITIES, STATES, TEMPLATES, addDays, dbToInput, inputToDate, relative, toInput, tomorrowAt,
} from '../lib/board.js';
import { can, fmtDateTime } from '../lib/format.js';

const TICKER_MAX = 300;

function Section({ title, hint, children }) {
	return (
		<div className="card hub-card">
			<div className="hub-card-head"><div><h2>{title}</h2>{hint && <small>{hint}</small>}</div></div>
			<div className="hub-card-body">{children}</div>
		</div>
	);
}

function Toggle({ checked, onChange, label, hint, disabled }) {
	return (
		<label className={`hub-check hub-toggle ${checked ? 'checked' : ''} ${disabled ? 'is-disabled' : ''}`}>
			<input type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked ? 1 : 0)} />
			<span>
				<span className="d-block font-weight-bold">{label}</span>
				{hint && <span className="d-block small text-muted">{hint}</span>}
			</span>
		</label>
	);
}

/** Plain-language summary of when the message shows, from the form values. */
function scheduleSummary(startV, endV) {
	const nowD = new Date();
	const start = inputToDate(startV) || nowD;
	const end = inputToDate(endV);
	if (end && end <= start) return { tone: 'danger', text: 'The end must be after the start.' };
	const startText = start <= nowD ? 'Shows as soon as it is published' : `Starts ${fmtDateTime(toInput(start).replace('T', ' '))} (${relative(start, nowD)})`;
	const endText = end ? `ends ${fmtDateTime(toInput(end).replace('T', ' '))} (${relative(end, nowD)})` : 'stays until you end or archive it';
	if (end && end <= nowD) return { tone: 'warning', text: 'This end time has already passed, so the message will not show.' };
	return { tone: 'info', text: `${startText}, and ${endText}.` };
}

function Stats({ uuid }) {
	const [data, setData] = useState(null);
	const [error, setError] = useState('');
	const [company, setCompany] = useState('');
	useEffect(() => {
		api.get(`/board/${uuid}/stats`).then((r) => (r.ok ? setData(r) : setError(r.error || 'Could not load statistics.')));
	}, [uuid]);
	if (error) return <Alert>{error}</Alert>;
	if (!data) return <Spinner />;
	const receipts = data.receipts.filter((r) => !company || r.company_code === company);
	const totals = data.companies.reduce((t, c) => ({
		viewers: t.viewers + c.viewers, acks: t.acks + c.acks, opted_out: t.opted_out + c.opted_out,
	}), { viewers: 0, acks: 0, opted_out: 0 });
	return (
		<>
			<div className="hub-kpis hub-kpis-3">
				<div className="hub-kpi hub-kpi-brand"><div className="hub-kpi-icon"><Icon name="eye" size={20} /></div>
					<div className="hub-kpi-body"><div className="hub-kpi-value">{totals.viewers}</div><div className="hub-kpi-label">Users who saw it</div></div></div>
				<div className="hub-kpi hub-kpi-success"><div className="hub-kpi-icon"><Icon name="check" size={20} /></div>
					<div className="hub-kpi-body"><div className="hub-kpi-value">{data.require_ack ? totals.acks : '—'}</div>
						<div className="hub-kpi-label">Acknowledged</div><div className="hub-kpi-hint">{data.require_ack ? 'Clicked "I have read this"' : 'Acknowledgement not required'}</div></div></div>
				<div className="hub-kpi hub-kpi-secondary"><div className="hub-kpi-icon"><Icon name="eyeOff" size={20} /></div>
					<div className="hub-kpi-body"><div className="hub-kpi-value">{totals.opted_out}</div><div className="hub-kpi-label">Chose "Don't show again"</div></div></div>
			</div>
			<div className="card hub-card mb-3">
				<div className="hub-card-head"><div><h2>By Water District</h2><small>Counts arrive when each WD app syncs (about every 5 minutes while users are signed in)</small></div></div>
				<div className="table-responsive">
					<table className="table table-sm hub-table mb-0">
						<thead><tr><th>Water District</th><th className="text-right">Users</th><th className="text-right">Views</th>
							<th className="text-right">Acknowledged</th><th className="text-right">Opted out</th><th>Last seen</th></tr></thead>
						<tbody>
							{data.companies.map((c) => (
								<tr key={c.code} className={company === c.code ? 'table-active' : ''} onClick={() => setCompany(company === c.code ? '' : c.code)} style={{ cursor: 'pointer' }}>
									<td className="font-weight-bold">{c.name}</td>
									<td className="text-right">{c.viewers}</td>
									<td className="text-right">{c.views}</td>
									<td className="text-right">{data.require_ack ? c.acks : '—'}</td>
									<td className="text-right">{c.opted_out}</td>
									<td className="small">{c.last_viewed_at ? fmtDateTime(c.last_viewed_at) : <span className="text-muted">Not yet</span>}</td>
								</tr>
							))}
							{!data.companies.length && <tr><td colSpan={6} className="text-muted">No target Water Districts.</td></tr>}
						</tbody>
					</table>
				</div>
			</div>
			<div className="card hub-card">
				<div className="hub-card-head"><div><h2>Users{company ? ` · ${company}` : ''}</h2><small>Who saw the message (from the WD apps)</small></div>
					{company && <button type="button" className="btn btn-sm btn-light ml-auto" onClick={() => setCompany('')}>Show all</button>}</div>
				{receipts.length === 0 ? <EmptyState icon="eye" title="No views reported yet" /> : (
					<div className="table-responsive">
						<table className="table table-sm hub-table mb-0">
							<thead><tr><th>User</th><th>WD</th><th className="text-right">Views</th><th>First seen</th><th>Acknowledged</th><th>Opted out</th></tr></thead>
							<tbody>
								{receipts.map((r) => (
									<tr key={`${r.company_code}-${r.user_name}-${r.first_viewed_at}`}>
										<td>{r.user_name || <span className="text-muted">(unnamed)</span>}</td>
										<td><span className="hub-wd-chip">{r.company_code}</span></td>
										<td className="text-right">{r.view_count}</td>
										<td className="small">{fmtDateTime(r.first_viewed_at)}</td>
										<td className="small">{r.acked_at ? <span className="text-success"><Icon name="check" size={12} /> {fmtDateTime(r.acked_at)}</span> : '—'}</td>
										<td className="small">{r.opted_out_at ? fmtDateTime(r.opted_out_at) : '—'}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</div>
		</>
	);
}

export default function BoardForm({ user }) {
	const { uuid } = useParams();
	const isNew = !uuid;
	const navigate = useNavigate();
	const location = useLocation();
	const [params, setParams] = useSearchParams();
	const tab = params.get('tab') || 'compose';
	const [form, setForm] = useState(() => ({ ...EMPTY_MESSAGE, all_companies: user.all_companies ? 1 : 0, starts_at: toInput(new Date()) }));
	const [message, setMessage] = useState(null);
	const [companies, setCompanies] = useState([]);
	const [error, setError] = useState('');
	const [notice, setNotice] = useState(location.state?.notice || '');
	const [saving, setSaving] = useState(false);
	const [dirty, setDirty] = useState(false);
	const [showAgain, setShowAgain] = useState(false);
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [template, setTemplate] = useState('');

	useEffect(() => {
		api.get('/companies').then((r) => r.ok && setCompanies(r.companies));
	}, []);

	const load = useCallback(async () => {
		if (isNew) return;
		const r = await api.get(`/board/${uuid}`);
		if (!r.ok) {
			setError(r.error || 'Message not found.');
			return;
		}
		const m = r.message;
		setMessage(m);
		setForm({
			...EMPTY_MESSAGE,
			...Object.fromEntries(Object.keys(EMPTY_MESSAGE).map((k) => [k, m[k] ?? EMPTY_MESSAGE[k]])),
			body_html: m.body_html || '',
			starts_at: dbToInput(m.starts_at),
			ends_at: dbToInput(m.ends_at),
		});
		setDirty(false);
		setShowAgain(false);
	}, [uuid, isNew]);

	useEffect(() => { load(); }, [load]);

	useEffect(() => {
		if (!dirty) return undefined;
		const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
		window.addEventListener('beforeunload', warn);
		return () => window.removeEventListener('beforeunload', warn);
	}, [dirty]);

	const set = (k) => (v) => {
		setDirty(true);
		setForm((f) => {
			const next = { ...f, [k]: v };
			if (k === 'priority' && v === 'critical') next.allow_opt_out = 0;
			return next;
		});
	};

	const coversAll = !!user.all_companies;
	const canCreate = can(user, 'board.create');
	const canPublish = can(user, 'board.publish');
	const status = message?.status || 'draft';
	const editable = isNew ? canCreate : !!message?.can_manage && canCreate && (status === 'draft' || canPublish);
	const summary = useMemo(() => scheduleSummary(form.starts_at, form.ends_at), [form.starts_at, form.ends_at]);
	const startsLater = (inputToDate(form.starts_at) || new Date()) > new Date();

	function applyTemplate(t) {
		setTemplate(t.key);
		setDirty(true);
		const start = toInput(new Date());
		setForm((f) => ({ ...f, ...t.fields, starts_at: start, ends_at: t.days ? addDays(start, t.days) : '' }));
	}

	function toggleCompany(code) {
		setDirty(true);
		setForm((f) => ({ ...f, companies: f.companies.includes(code) ? f.companies.filter((c) => c !== code) : [...f.companies, code] }));
	}

	async function upload(file) {
		const fd = new FormData();
		fd.append('image', file);
		return api.post('/board-assets', fd);
	}

	async function save(publish) {
		setError('');
		if (!form.title.trim()) {
			setError('Enter a title.');
			return;
		}
		setSaving(true);
		const payload = { ...form, publish, show_again: showAgain };
		const r = isNew ? await api.post('/board', payload) : await api.post(`/board/${uuid}`, payload);
		if (r.ok && !isNew && publish && status === 'draft') {
			const p = await api.post(`/board/${uuid}/publish`);
			if (!p.ok) {
				setSaving(false);
				setError(p.error || 'Saved, but could not publish.');
				load();
				return;
			}
		}
		setSaving(false);
		if (!r.ok) {
			setError(r.error || 'Could not save.');
			return;
		}
		setDirty(false);
		const done = publish
			? (startsLater ? 'Scheduled. It will appear in the Water Districts at its start time.' : 'Published. The Water Districts will show it within about 5 minutes.')
			: (status === 'draft' ? 'Draft saved. It is not visible to any Water District yet.' : 'Changes saved. The Water Districts pick them up within about 5 minutes.');
		if (isNew) {
			navigate(`/message-board/${r.uuid}`, { replace: true, state: { notice: done } });
			return;
		}
		setNotice(done);
		load();
	}

	async function remove() {
		const r = await api.del(`/board/${uuid}`);
		setConfirmDelete(false);
		if (!r.ok) {
			setError(r.error || 'Could not delete.');
			return;
		}
		setDirty(false);
		navigate('/message-board', { replace: true });
	}

	if (!isNew && !message && !error) return <Spinner />;
	if (!isNew && !message) {
		return (
			<>
				<PageHeader icon="megaphone" title="Message Board" />
				<Alert>{error}</Alert>
				<Link to="/message-board" className="btn btn-sm btn-light">Back to Message Board</Link>
			</>
		);
	}

	const st = message ? STATES[message.state] : null;
	const tickerLeft = TICKER_MAX - form.ticker_text.length;

	return (
		<>
			<PageHeader icon="megaphone" title={isNew ? 'New message' : message.title}
				subtitle={isNew ? 'Write once, show it in every chosen Water District system'
					: `${st.label} · v${message.version} · created by ${message.created_by_name || '—'} ${fmtDateTime(message.created_at)}${message.updated_by_name ? ` · last edited by ${message.updated_by_name}` : ''}`}>
				<Link to="/message-board" className="btn btn-sm btn-light"><Icon name="back" size={15} className="mr-1" />All messages</Link>
				{!isNew && can(user, 'board.delete') && message.can_manage && (
					<button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setConfirmDelete(true)}><Icon name="trash" size={14} /></button>
				)}
			</PageHeader>
			<Alert onClose={() => setError('')}>{error}</Alert>
			<Alert type="success" onClose={() => setNotice('')}>{notice}</Alert>
			{!isNew && !editable && (
				<Alert type="info">
					{!message.can_manage ? 'This message targets Water Districts outside your access, so it is read-only for you.'
						: status !== 'draft' && !canPublish ? 'Only users who can publish may edit a published message.' : 'Your role can view messages only.'}
				</Alert>
			)}

			{!isNew && can(user, 'board.stats') && (
				<ul className="nav nav-tabs hub-tabs">
					{[['compose', 'Message'], ['stats', 'Read statistics']].map(([k, l]) => (
						<li key={k} className="nav-item">
							<button type="button" className={`nav-link ${tab === k ? 'active' : ''}`} onClick={() => setParams({ tab: k }, { replace: true })}>{l}</button>
						</li>
					))}
				</ul>
			)}

			{tab === 'stats' && !isNew ? <Stats uuid={uuid} /> : (
				<div className="hub-grid hub-grid-2-1 hub-board-form">
					<fieldset disabled={!editable} className="hub-board-form-main">
						{isNew && (
							<Section title="Start from a template" hint="Optional — fills in the text, category and dates for you">
								<div className="hub-presets mb-0">
									{TEMPLATES.map((t) => (
										<button key={t.key} type="button" className={`hub-preset ${template === t.key ? 'active' : ''}`} onClick={() => applyTemplate(t)}>
											<strong>{t.label}</strong>
											<span className="d-block text-muted">{t.hint}</span>
										</button>
									))}
								</div>
							</Section>
						)}

						<Section title="Content">
							<div className="form-group">
								<label className="hub-label" htmlFor="mb-title">Title *</label>
								<input id="mb-title" className="form-control" value={form.title} maxLength={200} required autoFocus={isNew}
									onChange={(e) => set('title')(e.target.value)} placeholder="e.g. New online payment option" />
							</div>
							<div className="form-group">
								<label className="hub-label d-flex" htmlFor="mb-ticker">
									<span className="flex-grow-1">Ticker line</span>
									<span className={`small ${tickerLeft < 30 ? 'text-warning' : 'text-muted'}`}>{tickerLeft}</span>
								</label>
								<input id="mb-ticker" className="form-control" value={form.ticker_text} maxLength={TICKER_MAX}
									onChange={(e) => set('ticker_text')(e.target.value)} placeholder="One short sentence for the scrolling bar" />
								<small className="form-text text-muted">Plain text shown in the floating ticker. Leave empty to use the start of the message.</small>
							</div>
							<div className="form-group mb-0">
								<label className="hub-label">Message</label>
								<RichEditor value={form.body_html} onChange={set('body_html')} onUpload={upload} disabled={!editable}
									placeholder="Write the full announcement. Add headings, numbered steps, screenshots, links or a YouTube video." />
							</div>
						</Section>

						<Section title="How it appears" hint="Where and how loudly the message shows in the WD system">
							<label className="hub-label">Category</label>
							<div className="hub-board-choices mb-3">
								{CATEGORIES.map((c) => (
									<button key={c.key} type="button" className={`hub-board-choice ${form.category === c.key ? 'active' : ''}`}
										style={form.category === c.key ? { borderColor: c.color, color: c.color } : undefined} onClick={() => set('category')(c.key)}>
										<Icon name={c.icon} size={16} /><span>{c.label}</span>
									</button>
								))}
							</div>
							<label className="hub-label">Priority</label>
							<div className="btn-group btn-group-sm d-flex mb-1" role="group" aria-label="Priority">
								{PRIORITIES.map((p) => (
									<button key={p.key} type="button" className={`btn ${form.priority === p.key ? `btn-${p.badge}` : 'btn-outline-secondary'}`} onClick={() => set('priority')(p.key)}>{p.label}</button>
								))}
							</div>
							<small className="form-text text-muted mb-3">{PRIORITIES.find((p) => p.key === form.priority)?.hint}</small>
							<div className="hub-check-grid hub-toggle-grid">
								<Toggle checked={form.show_ticker} onChange={set('show_ticker')} label="Floating ticker" hint="One line on every page" />
								<Toggle checked={form.show_popup} onChange={set('show_popup')} label="Login popup" hint="Dashboard, right after login" />
								<Toggle checked={form.require_ack} onChange={set('require_ack')} label={'Must acknowledge'} hint={'Popup stays until "I have read this"'} />
								<Toggle checked={form.allow_opt_out && form.priority !== 'critical'} onChange={set('allow_opt_out')} disabled={form.priority === 'critical'}
									label={'Allow "Don\'t show again"'} hint={form.priority === 'critical' ? 'Not allowed for critical messages' : 'Users can hide the popup'} />
								<Toggle checked={form.pinned} onChange={set('pinned')} label="Pin to top" hint="Shown first in the ticker and popup" />
							</div>
							{!form.show_ticker && !form.show_popup && (
								<div className="small text-muted mt-2">Neither is on: the message only appears on the WD <em>Announcements &amp; Guides</em> page — useful for reference guides.</div>
							)}
						</Section>

						<Section title="Audience" hint="Which Water Districts, and who inside them">
							<label className="hub-label">Who sees it in the WD system</label>
							<div className="btn-group btn-group-sm d-flex mb-3" role="group" aria-label="Audience">
								{AUDIENCES.map((a) => (
									<button key={a.key} type="button" title={a.hint} className={`btn ${form.audience === a.key ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => set('audience')(a.key)}>{a.label}</button>
								))}
							</div>
							<label className="hub-label">Water Districts</label>
							<Toggle checked={form.all_companies} onChange={set('all_companies')} disabled={!coversAll}
								label="All Water Districts" hint={coversAll ? 'Including any Water District added later' : 'Your account covers only some Water Districts'} />
							{!form.all_companies && (
								<div className="hub-check-grid mt-2">
									{companies.map((c) => (
										<label key={c.code} className={`hub-check ${form.companies.includes(c.code) ? 'checked' : ''} ${c.status !== 'active' ? 'text-muted' : ''}`}>
											<input type="checkbox" checked={form.companies.includes(c.code)} onChange={() => toggleCompany(c.code)} />
											<span className="min-w-0"><span className="d-block text-truncate">{c.short_name || c.name}</span>
												<span className="small text-muted">{c.code}{c.status !== 'active' ? ' · deactivated' : ''}</span></span>
										</label>
									))}
								</div>
							)}
						</Section>

						<Section title="Schedule" hint="Philippine time (hub clock)">
							<div className="form-row">
								<div className="form-group col-sm-6">
									<label className="hub-label" htmlFor="mb-start">Start showing</label>
									<input id="mb-start" type="datetime-local" className="form-control" value={form.starts_at} onChange={(e) => set('starts_at')(e.target.value)} />
									<div className="hub-chip-row">
										<button type="button" className="btn btn-xs btn-light" onClick={() => set('starts_at')(toInput(new Date()))}>Now</button>
										<button type="button" className="btn btn-xs btn-light" onClick={() => set('starts_at')(tomorrowAt(8))}>Tomorrow 8:00 AM</button>
									</div>
								</div>
								<div className="form-group col-sm-6">
									<label className="hub-label" htmlFor="mb-end">Stop showing <span className="text-muted">(optional)</span></label>
									<input id="mb-end" type="datetime-local" className="form-control" value={form.ends_at} min={form.starts_at} onChange={(e) => set('ends_at')(e.target.value)} />
									<div className="hub-chip-row">
										{[[1, '1 day'], [3, '3 days'], [7, '1 week'], [30, '1 month']].map(([d, l]) => (
											<button key={d} type="button" className="btn btn-xs btn-light" onClick={() => set('ends_at')(addDays(form.starts_at, d))}>+{l}</button>
										))}
										<button type="button" className="btn btn-xs btn-light" onClick={() => set('ends_at')('')}>No end</button>
									</div>
								</div>
							</div>
							<div className={`alert alert-${summary.tone} py-2 mb-0 small`}><Icon name="clock" size={13} className="mr-1" />{summary.text}</div>
						</Section>

						{editable && (
							<div className="card hub-card hub-board-actions">
								<div className="hub-card-foot">
									{status === 'draft' ? (
										<>
											{canPublish && (
												<button type="button" className="btn btn-primary" disabled={saving} onClick={() => save(true)}>
													<Icon name={startsLater ? 'calendar' : 'send'} size={15} className="mr-1" />
													{saving ? 'Saving…' : startsLater ? 'Schedule' : 'Publish now'}
												</button>
											)}
											<button type="button" className={`btn ${canPublish ? 'btn-light' : 'btn-primary'}`} disabled={saving} onClick={() => save(false)}>
												{saving && !canPublish ? 'Saving…' : 'Save draft'}
											</button>
											{!canPublish && <span className="small text-muted">Your role saves drafts; someone who can publish will make it live.</span>}
										</>
									) : (
										<>
											<button type="button" className="btn btn-primary" disabled={saving} onClick={() => save(false)}>{saving ? 'Saving…' : 'Save changes'}</button>
											{['live', 'scheduled'].includes(message?.state) && (
												<label className="small mb-0 d-flex align-items-start">
													<input type="checkbox" className="mr-2 mt-1" checked={showAgain} onChange={(e) => setShowAgain(e.target.checked)} />
													<span>Show again to everyone<span className="d-block text-muted">Users who chose "Don't show again" or already acknowledged will see it again</span></span>
												</label>
											)}
										</>
									)}
									{dirty && <span className="small text-warning ml-auto">Unsaved changes</span>}
								</div>
							</div>
						)}
					</fieldset>

					<div className="hub-board-form-side">
						<div className="card hub-card hub-sticky">
							<div className="hub-card-head"><div><h2>Preview</h2><small>As the Water District users will see it</small></div></div>
							<div className="hub-card-body"><BoardPreview message={form} /></div>
						</div>
					</div>
				</div>
			)}

			<ConfirmModal open={confirmDelete} onClose={() => setConfirmDelete(false)} onConfirm={remove}
				title="Delete message" confirmLabel="Delete permanently">
				<p className="mb-0">The message and its read statistics are removed. This cannot be undone. Archive it instead to keep the history.</p>
			</ConfirmModal>
		</>
	);
}
