import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import { Alert, ConfirmModal, EmptyState, PageHeader, Spinner } from '../components/ui.jsx';
import { CATEGORIES, CATEGORY, PRIORITY, STATES, toInput } from '../lib/board.js';
import { can, fmtDateTime, qs } from '../lib/format.js';

const TABS = [
	['', 'All'],
	['live', 'Live'],
	['scheduled', 'Scheduled'],
	['draft', 'Drafts'],
	['ended', 'Ended'],
	['archived', 'Archived'],
];

const CONFIRM = {
	publish: { title: 'Publish message', label: 'Publish', tone: 'primary' },
	unpublish: { title: 'Move back to drafts', label: 'Move to drafts', tone: 'warning' },
	'end-now': { title: 'End message now', label: 'End now', tone: 'warning' },
	archive: { title: 'Archive message', label: 'Archive', tone: 'secondary' },
	delete: { title: 'Delete message', label: 'Delete permanently', tone: 'danger' },
};

export function Targets({ m, names }) {
	if (m.all_companies) return <span className="hub-wd-chip">All Water Districts</span>;
	if (!m.companies.length) return <span className="small text-danger">No Water District chosen</span>;
	return m.companies.map((c) => <span key={c} className="hub-wd-chip mr-1">{names[c] || c}</span>);
}

export function Schedule({ m }) {
	return (
		<span>
			<Icon name="calendar" size={13} className="mr-1" />
			{fmtDateTime(m.starts_at)} → {m.ends_at ? fmtDateTime(m.ends_at) : 'no end date'}
		</span>
	);
}

export default function BoardList({ user }) {
	const navigate = useNavigate();
	const [params, setParams] = useSearchParams();
	const state = params.get('state') || '';
	const [category, setCategory] = useState('');
	const [company, setCompany] = useState('');
	const [q, setQ] = useState('');
	const [list, setList] = useState(null);
	const [counts, setCounts] = useState({});
	const [companies, setCompanies] = useState([]);
	const [error, setError] = useState('');
	const [notice, setNotice] = useState('');
	const [confirm, setConfirm] = useState(null);
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		api.get('/companies').then((r) => r.ok && setCompanies(r.companies));
	}, []);

	const load = useCallback(async () => {
		const r = await api.get(`/board${qs({ state, category, company, q: q.trim() })}`);
		if (r.ok) {
			setList(r.messages);
			setCounts(r.counts);
		} else setError(r.error || 'Could not load the Message Board.');
	}, [state, category, company, q]);

	useEffect(() => {
		const t = setTimeout(load, q ? 250 : 0);
		return () => clearTimeout(t);
	}, [load, q]);

	const names = Object.fromEntries(companies.map((c) => [c.code, c.short_name || c.name]));

	async function run(action, m) {
		setBusy(true);
		const url = `/board/${m.uuid}`;
		let r;
		if (action === 'delete') r = await api.del(url);
		else if (action === 'duplicate') r = await api.post(`${url}/duplicate`);
		else r = await api.post(`${url}/${action}`);
		setBusy(false);
		setConfirm(null);
		if (!r.ok) {
			setError(r.error || 'Action failed.');
			return;
		}
		if (action === 'duplicate') {
			navigate(`/message-board/${r.uuid}`, { state: { notice: 'Copy created as a draft. Adjust the dates and Water Districts, then publish.' } });
			return;
		}
		setNotice({
			publish: `"${m.title}" is published.`,
			unpublish: `"${m.title}" is back in drafts and hidden from the Water Districts.`,
			'end-now': `"${m.title}" has ended. It stays on the WD Announcements page as Ended.`,
			archive: `"${m.title}" is archived and hidden from the Water Districts.`,
			delete: `"${m.title}" was deleted.`,
		}[action]);
		load();
	}

	const total = Object.entries(counts).filter(([k]) => k !== 'archived').reduce((n, [, v]) => n + v, 0);
	const canPublish = can(user, 'board.publish');

	return (
		<>
			<PageHeader icon="megaphone" title="Message Board"
				subtitle="Announcements, updates and how-to guides shown in the Water District systems — as a ticker on every page and a popup after login">
				{can(user, 'board.create') && (
					<Link to="/message-board/new" className="btn btn-primary btn-sm"><Icon name="plus" size={15} className="mr-1" />New message</Link>
				)}
			</PageHeader>
			<Alert onClose={() => setError('')}>{error}</Alert>
			<Alert type="success" onClose={() => setNotice('')}>{notice}</Alert>

			<div className="hub-board-tabs" role="tablist" aria-label="Message status">
				{TABS.map(([k, l]) => (
					<button key={k || 'all'} type="button" role="tab" aria-selected={state === k}
						className={`hub-board-tab ${state === k ? 'active' : ''}`}
						onClick={() => setParams(k ? { state: k } : {}, { replace: true })}>
						{l}
						<span className="hub-board-tab-count">{k ? counts[k] || 0 : total}</span>
					</button>
				))}
			</div>

			<div className="hub-toolbar">
				<select className="custom-select custom-select-sm hub-w-auto" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
					<option value="">All categories</option>
					{CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
				</select>
				<select className="custom-select custom-select-sm hub-w-auto" value={company} onChange={(e) => setCompany(e.target.value)} aria-label="Water District">
					<option value="">All Water Districts</option>
					{companies.map((c) => <option key={c.code} value={c.code}>{c.short_name || c.name}</option>)}
				</select>
				<div className="hub-search hub-search-inline">
					<Icon name="search" size={15} />
					<input className="form-control form-control-sm" type="search" placeholder="Search title or ticker text" value={q}
						onChange={(e) => setQ(e.target.value)} aria-label="Search messages" />
				</div>
			</div>

			{!list && !error && <Spinner />}
			{list && list.length === 0 && (
				<div className="card hub-card">
					<EmptyState icon="megaphone" title={state ? `No ${STATES[state].label.toLowerCase()} messages` : 'No messages yet'}>
						{state || category || company || q
							? 'Nothing matches these filters.'
							: 'Write the first announcement — start from a template such as Scheduled maintenance or How-to guide.'}
						{can(user, 'board.create') && !state && !q && (
							<div className="mt-3"><Link to="/message-board/new" className="btn btn-primary btn-sm">New message</Link></div>
						)}
					</EmptyState>
				</div>
			)}

			<div className="hub-board-grid">
				{(list || []).map((m) => {
					const cat = CATEGORY[m.category] || CATEGORY.announcement;
					const st = STATES[m.state];
					const manage = m.can_manage;
					return (
						<div key={m.uuid} className={`card hub-card hub-board-card is-${m.state}`}>
							<button type="button" className="hub-board-card-main" onClick={() => navigate(`/message-board/${m.uuid}`)}>
								<span className="hub-board-cat-icon" style={{ background: cat.color }}><Icon name={cat.icon} size={18} /></span>
								<span className="min-w-0 flex-grow-1">
									<span className="d-flex align-items-center flex-wrap hub-board-badges">
										<span className={`badge badge-${st.badge}`} title={st.hint}>{st.label}</span>
										{m.priority !== 'normal' && <span className={`badge badge-${PRIORITY[m.priority].badge}`}>{PRIORITY[m.priority].label}</span>}
										{m.pinned ? <span className="badge badge-light"><Icon name="pin" size={11} /> Pinned</span> : null}
										<span className="small text-muted">{cat.label}</span>
									</span>
									<span className="hub-board-title">{m.title}</span>
									{m.ticker_text && <span className="hub-board-ticker">{m.ticker_text}</span>}
								</span>
							</button>
							<div className="hub-board-meta">
								<div><Targets m={m} names={names} /></div>
								<div><Schedule m={m} /></div>
								<div className="hub-board-flags">
									{m.show_ticker ? <span title="Shown in the ticker"><Icon name="message" size={13} /> Ticker</span> : null}
									{m.show_popup ? <span title="Shown in the login popup"><Icon name="megaphone" size={13} /> Popup</span> : null}
									{m.require_ack ? <span title="Users must click I have read this"><Icon name="check" size={13} /> Must acknowledge</span> : null}
									<span title="Who sees it in the WD app"><Icon name="users" size={13} /> {m.audience === 'admin' ? 'Admin only' : m.audience === 'staff' ? 'Staff only' : 'All users'}</span>
								</div>
								{m.stats && m.state !== 'draft' && (
									<div className="hub-board-stats">
										<span><strong>{m.stats.viewers}</strong> users saw it</span>
										{m.require_ack ? <span><strong>{m.stats.acks}</strong> acknowledged</span> : null}
										{m.stats.opted_out ? <span><strong>{m.stats.opted_out}</strong> opted out</span> : null}
									</div>
								)}
							</div>
							<div className="hub-wd-actions">
								<button type="button" className="btn btn-sm btn-light" onClick={() => navigate(`/message-board/${m.uuid}`)}>
									<Icon name={manage && can(user, 'board.create') ? 'edit' : 'eye'} size={14} className="mr-1" />
									{manage && can(user, 'board.create') && (m.state === 'draft' || canPublish) ? 'Edit' : 'View'}
								</button>
								{can(user, 'board.create') && (
									<button type="button" className="btn btn-sm btn-light" disabled={busy} onClick={() => run('duplicate', m)} title="Copy into a new draft">
										<Icon name="copy" size={14} className="mr-1" />Duplicate
									</button>
								)}
								{canPublish && manage && (
									<span className="ml-auto d-flex">
										{m.state === 'draft' && (
											<button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setConfirm({ action: 'publish', m })}>
												<Icon name="play" size={13} className="mr-1" />Publish
											</button>
										)}
										{m.state === 'live' && (
											<button type="button" className="btn btn-sm btn-outline-warning" onClick={() => setConfirm({ action: 'end-now', m })} title="Stop showing it now">
												<Icon name="stop" size={13} className="mr-1" />End now
											</button>
										)}
										{m.state === 'scheduled' && (
											<button type="button" className="btn btn-sm btn-outline-warning" onClick={() => setConfirm({ action: 'unpublish', m })}>Unschedule</button>
										)}
										{['ended', 'draft'].includes(m.state) && (
											<button type="button" className="btn btn-sm btn-outline-secondary ml-1" onClick={() => setConfirm({ action: 'archive', m })} title="Archive">
												<Icon name="archive" size={14} />
											</button>
										)}
										{m.state === 'archived' && (
											<button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setConfirm({ action: 'unpublish', m })}>Restore to drafts</button>
										)}
									</span>
								)}
								{can(user, 'board.delete') && manage && (
									<button type="button" className={`btn btn-sm btn-outline-danger ${canPublish ? 'ml-1' : 'ml-auto'}`} onClick={() => setConfirm({ action: 'delete', m })} title="Delete">
										<Icon name="trash" size={14} />
									</button>
								)}
							</div>
						</div>
					);
				})}
			</div>

			<ConfirmModal open={!!confirm} busy={busy} onClose={() => setConfirm(null)} onConfirm={() => run(confirm.action, confirm.m)}
				title={confirm ? CONFIRM[confirm.action].title : ''} confirmLabel={confirm ? CONFIRM[confirm.action].label : ''}
				tone={confirm ? CONFIRM[confirm.action].tone : 'primary'}>
				{confirm && (
					<>
						<p className="font-weight-bold mb-2">{confirm.m.title}</p>
						{confirm.action === 'publish' && (
							<p className="mb-0">
								It will show in the chosen Water Districts {confirm.m.starts_at.slice(0, 16) > toInput(new Date()).replace('T', ' ')
									? `from ${fmtDateTime(confirm.m.starts_at)}` : 'within about 5 minutes'}
								{confirm.m.ends_at ? ` until ${fmtDateTime(confirm.m.ends_at)}` : ', with no end date'}.
							</p>
						)}
						{confirm.action === 'unpublish' && <p className="mb-0">It will be hidden from the Water Districts until you publish it again.</p>}
						{confirm.action === 'end-now' && <p className="mb-0">The WD apps stop showing it in the ticker and popup at their next refresh (about 5 minutes).</p>}
						{confirm.action === 'archive' && <p className="mb-0">It disappears from the Water Districts, including their Announcements page. You can restore it later.</p>}
						{confirm.action === 'delete' && <p className="mb-0">The message and its read statistics are removed. This cannot be undone. Archive it instead to keep the history.</p>}
					</>
				)}
			</ConfirmModal>
		</>
	);
}
