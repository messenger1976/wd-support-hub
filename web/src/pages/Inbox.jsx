import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import { EmptyState, PriorityBadge, SlaBadge, StatusBadge } from '../components/ui.jsx';
import { can, fmtAgo, qs, toDate } from '../lib/format.js';

const POLL_MS = 8000;
const IMAGE_RE = /\.(jpe?g|png|gif|webp)$/i;

const STATUS_FILTERS = [
	{ value: 'active', label: 'Active' },
	{ value: 'open', label: 'Open' },
	{ value: 'waiting_support', label: 'Waiting support' },
	{ value: 'waiting_client', label: 'Waiting WD' },
	{ value: 'resolved', label: 'Resolved' },
	{ value: 'closed', label: 'Closed' },
	{ value: '', label: 'All statuses' },
];

function dayLabel(d) {
	const today = new Date();
	const y = new Date(today);
	y.setDate(today.getDate() - 1);
	if (d.toDateString() === today.toDateString()) return 'Today';
	if (d.toDateString() === y.toDateString()) return 'Yesterday';
	return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export default function Inbox({ user }) {
	const [params, setParams] = useSearchParams();
	const [companies, setCompanies] = useState([]);
	const [assignees, setAssignees] = useState([]);
	const [filters, setFilters] = useState({ company: 'all', status: 'active', assigned: '', q: '' });
	const [tickets, setTickets] = useState(null);
	const [serverTime, setServerTime] = useState('');
	const [currentUuid, setCurrentUuid] = useState(params.get('ticket') || '');
	const [thread, setThread] = useState(null);
	const [body, setBody] = useState('');
	const [file, setFile] = useState(null);
	const [sending, setSending] = useState(false);
	const [error, setError] = useState('');
	const fileRef = useRef(null);
	const chatRef = useRef(null);
	const lastMessageCount = useRef(0);
	const stickToBottom = useRef(true);

	const canReply = can(user, 'inbox.reply');
	const canStatus = can(user, 'inbox.status');
	const canAssign = can(user, 'inbox.assign');

	useEffect(() => {
		api.get('/companies').then((r) => r.ok && setCompanies(r.companies));
	}, []);

	// Deep link from a push notification or the dashboard.
	useEffect(() => {
		const t = params.get('ticket');
		if (t && t !== currentUuid) setCurrentUuid(t);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [params]);

	const loadList = useCallback(async () => {
		const r = await api.get(`/tickets${qs({ ...filters, company: filters.company === 'all' ? '' : filters.company })}`);
		if (r.ok) {
			setTickets(r.tickets);
			setServerTime(r.server_time);
		}
	}, [filters]);

	const loadThread = useCallback(async (uuid) => {
		if (!uuid) return;
		const r = await api.get(`/tickets/${encodeURIComponent(uuid)}`);
		if (r.ok) setThread(r);
		else setError(r.error || 'Could not open this ticket.');
	}, []);

	useEffect(() => {
		const t = setTimeout(loadList, filters.q ? 300 : 0);
		return () => clearTimeout(t);
	}, [loadList, filters.q]);

	useEffect(() => {
		setThread(null);
		setError('');
		lastMessageCount.current = 0;
		stickToBottom.current = true;
		if (currentUuid) loadThread(currentUuid).then(() => { loadList(); window.dispatchEvent(new CustomEvent('hub:counts')); });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [currentUuid]);

	const companyOfThread = thread?.ticket?.company_code;
	useEffect(() => {
		if (!canAssign || !companyOfThread) return;
		api.get(`/assignees?company=${encodeURIComponent(companyOfThread)}`).then((r) => r.ok && setAssignees(r.users));
	}, [canAssign, companyOfThread]);

	const refreshRef = useRef(() => {});
	refreshRef.current = () => {
		loadList();
		if (currentUuid) loadThread(currentUuid);
	};

	useEffect(() => {
		const t = setInterval(() => { if (!document.hidden) refreshRef.current(); }, POLL_MS);
		const onPush = () => refreshRef.current();
		window.addEventListener('hub:push', onPush);
		return () => {
			clearInterval(t);
			window.removeEventListener('hub:push', onPush);
		};
	}, []);

	useEffect(() => {
		const count = thread?.messages?.length || 0;
		if (count !== lastMessageCount.current && chatRef.current && stickToBottom.current) {
			chatRef.current.scrollTop = chatRef.current.scrollHeight;
		}
		lastMessageCount.current = count;
	}, [thread]);

	function onChatScroll() {
		const el = chatRef.current;
		if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
	}

	function openTicket(uuid) {
		setCurrentUuid(uuid);
		setParams({ ticket: uuid });
	}

	function backToList() {
		setCurrentUuid('');
		setThread(null);
		setParams({});
	}

	function clearFile() {
		setFile(null);
		if (fileRef.current) fileRef.current.value = '';
	}

	async function send() {
		if (!currentUuid || sending || (!body.trim() && !file)) return;
		const fd = new FormData();
		fd.append('body', body);
		if (file) fd.append('attachment', file);
		setSending(true);
		const r = await api.post(`/tickets/${encodeURIComponent(currentUuid)}/messages`, fd);
		setSending(false);
		if (!r.ok) {
			setError(r.error || 'Send failed');
			return;
		}
		setBody('');
		clearFile();
		stickToBottom.current = true;
		refreshRef.current();
		window.dispatchEvent(new CustomEvent('hub:counts'));
	}

	async function setStatus(status) {
		const r = await api.post(`/tickets/${encodeURIComponent(currentUuid)}/status`, { status });
		if (!r.ok) setError(r.error || 'Could not change the status.');
		refreshRef.current();
		window.dispatchEvent(new CustomEvent('hub:counts'));
	}

	async function assign(userId) {
		const r = await api.post(`/tickets/${encodeURIComponent(currentUuid)}/assign`, { user_id: userId || null });
		if (!r.ok) setError(r.error || 'Could not assign the ticket.');
		refreshRef.current();
	}

	const t = thread?.ticket;
	const closed = t?.status === 'closed';
	const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));

	let lastDay = '';
	return (
		<div className={`hub-inbox ${currentUuid ? 'view-thread' : 'view-list'}`}>
			<aside className="hub-inbox-list">
				<div className="hub-inbox-filters">
					<div className="hub-search">
						<Icon name="search" size={15} />
						<input className="form-control form-control-sm" type="search" placeholder="Search subject, ticket no. or requester"
							value={filters.q} onChange={set('q')} aria-label="Search tickets" />
					</div>
					<div className="hub-filter-row">
						<select className="custom-select custom-select-sm" value={filters.company} onChange={set('company')} aria-label="Water District">
							<option value="all">All Water Districts</option>
							{companies.map((c) => <option key={c.code} value={c.code}>{c.short_name || c.name}{c.status !== 'active' ? ' (inactive)' : ''}</option>)}
						</select>
						<select className="custom-select custom-select-sm" value={filters.status} onChange={set('status')} aria-label="Status">
							{STATUS_FILTERS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
						</select>
					</div>
					<div className="btn-group btn-group-sm btn-group-toggle w-100" role="group" aria-label="Assignment">
						{[['', 'All'], ['me', 'Mine'], ['none', 'Unassigned']].map(([v, l]) => (
							<button key={v} type="button" className={`btn ${filters.assigned === v ? 'btn-primary' : 'btn-outline-secondary'}`}
								onClick={() => setFilters((f) => ({ ...f, assigned: v }))}>{l}</button>
						))}
					</div>
				</div>
				<div className="hub-inbox-scroll">
					{tickets === null && <div className="hub-empty"><div className="spinner-border spinner-border-sm text-primary" /></div>}
					{tickets?.length === 0 && <EmptyState icon="inbox" title="No tickets">Nothing matches these filters.</EmptyState>}
					{tickets?.map((tk) => (
						<button key={tk.uuid} type="button" onClick={() => openTicket(tk.uuid)}
							className={`hub-ticket ${tk.uuid === currentUuid ? 'active' : ''} ${Number(tk.unread_support) === 1 ? 'is-unread' : ''}`}>
							<div className="d-flex align-items-center">
								<span className="hub-wd-chip">{tk.company_short_name || tk.company_code}</span>
								<span className="hub-ticket-no ml-2">{tk.ticket_no}</span>
								<span className="ml-auto hub-ticket-time">{fmtAgo(tk.last_message_at, serverTime)}</span>
							</div>
							<div className="hub-ticket-subject">{tk.subject}</div>
							<div className="hub-ticket-meta">
								<StatusBadge status={tk.status} />
								<PriorityBadge priority={tk.priority} />
								<SlaBadge ticket={tk} now={serverTime} />
								<span className="hub-ticket-owner">{tk.assigned_name ? `→ ${tk.assigned_name}` : tk.category}</span>
								{Number(tk.unread_support) === 1 && <span className="hub-dot" title="Unread" />}
							</div>
						</button>
					))}
				</div>
			</aside>

			<section className="hub-inbox-thread">
				{!currentUuid && <EmptyState icon="message" title="Select a ticket">Tickets from every connected Water District land here.</EmptyState>}
				{currentUuid && (
					<>
						<div className="hub-thread-head">
							<button type="button" className="btn hub-icon-btn d-lg-none" aria-label="Back to tickets" onClick={backToList}>
								<Icon name="back" />
							</button>
							<div className="hub-thread-title">
								<div className="h6 mb-0 text-truncate">{t ? `${t.ticket_no} · ${t.subject}` : 'Loading…'}</div>
								{t && (
									<div className="hub-thread-sub">
										<span className="hub-wd-chip">{t.company_short_name || t.company_name || t.company_code}</span>
										<StatusBadge status={t.status} />
										<PriorityBadge priority={t.priority} all />
										<SlaBadge ticket={t} now={thread.server_time} />
										<span className="d-none d-sm-inline text-muted small">{t.category} · {t.user_name || 'WD user'}</span>
									</div>
								)}
							</div>
						</div>
						{t && (canAssign || canStatus) && (
							<div className="hub-thread-tools">
								{canAssign && (
									<select className="custom-select custom-select-sm hub-assign" value={t.assigned_user_id || ''}
										onChange={(e) => assign(e.target.value)} aria-label="Assigned to">
										<option value="">Unassigned</option>
										{assignees.map((a) => <option key={a.id} value={a.id}>{a.id === user.id ? `${a.display_name} (me)` : a.display_name}</option>)}
										{t.assigned_user_id && !assignees.some((a) => a.id === Number(t.assigned_user_id)) && (
											<option value={t.assigned_user_id}>{t.assigned_name || 'Former user'}</option>
										)}
									</select>
								)}
								{canStatus && (
									<div className="btn-group btn-group-sm ml-auto">
										{!['resolved', 'closed'].includes(t.status) && (
											<button type="button" className="btn btn-outline-success" onClick={() => setStatus('resolved')}>
												<Icon name="check" size={14} /> <span className="d-none d-sm-inline">Resolved</span>
											</button>
										)}
										{t.status !== 'closed' && (
											<button type="button" className="btn btn-outline-secondary" onClick={() => setStatus('closed')}>Close</button>
										)}
										{['resolved', 'closed'].includes(t.status) && (
											<button type="button" className="btn btn-outline-primary" onClick={() => setStatus('open')}>Reopen</button>
										)}
									</div>
								)}
							</div>
						)}
						{error && <div className="alert alert-danger m-2 py-2 small">{error}</div>}

						<div className="hub-chat" ref={chatRef} onScroll={onChatScroll}>
							{!thread && <div className="hub-empty"><div className="spinner-border spinner-border-sm text-primary" /></div>}
							{thread?.messages.map((m) => {
								const mine = m.sender_side === 'support';
								const d = toDate(m.created_at);
								const day = d ? dayLabel(d) : '';
								const sep = day !== lastDay;
								lastDay = day;
								return (
									<div key={m.uuid}>
										{sep && <div className="hub-day"><span>{day}</span></div>}
										<div className={`hub-msg ${mine ? 'sent' : 'received'}`}>
											<div className="hub-bubble">
												{m.body && <div>{m.body}</div>}
												{m.attachment_url && IMAGE_RE.test(m.attachment_name || '') && (
													<a href={m.attachment_url} target="_blank" rel="noreferrer">
														<img className="hub-thumb" src={m.attachment_url} alt={m.attachment_name} loading="lazy" />
													</a>
												)}
												{m.attachment_url && !IMAGE_RE.test(m.attachment_name || '') && (
													<a className="hub-file" href={m.attachment_url} target="_blank" rel="noreferrer">
														<Icon name="clip" size={14} /> {m.attachment_name || 'file'}
													</a>
												)}
											</div>
											<div className="hub-msg-meta">
												{mine ? (m.sender_name || 'Support') : (m.sender_name || 'WD user')}
												{' · '}
												{d ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : ''}
											</div>
										</div>
									</div>
								);
							})}
						</div>

						{canReply ? (
							<div className="hub-composer">
								{closed && <div className="small text-muted mb-2">This ticket is closed. Reopen it to reply.</div>}
								{file && (
									<div className="hub-file-chip">
										<Icon name="clip" size={13} /> <span className="text-truncate">{file.name}</span>
										<button type="button" className="close ml-2" aria-label="Remove attachment" onClick={clearFile}>&times;</button>
									</div>
								)}
								<div className="d-flex align-items-end">
									<label className={`btn hub-round-btn btn-light mb-0 ${!t || closed ? 'disabled' : ''}`} title="Attach screenshot or PDF">
										<Icon name="clip" />
										<input type="file" ref={fileRef} accept="image/*,.pdf" hidden disabled={!t || closed}
											onChange={(e) => setFile(e.target.files?.[0] || null)} />
									</label>
									<textarea className="form-control hub-composer-input mx-2" rows={1} placeholder="Reply to the Water District…"
										value={body} disabled={!t || closed} aria-label="Reply"
										onChange={(e) => {
											setBody(e.target.value);
											e.target.style.height = 'auto';
											e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
										}}
										onKeyDown={(e) => {
											if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); }
										}} />
									<button type="button" className="btn btn-primary hub-round-btn" onClick={send}
										disabled={!t || closed || sending || (!body.trim() && !file)} aria-label="Send">
										{sending ? <span className="spinner-border spinner-border-sm" /> : <Icon name="send" />}
									</button>
								</div>
								<div className="small text-muted mt-1 d-none d-md-block">Ctrl+Enter to send</div>
							</div>
						) : (
							<div className="hub-composer small text-muted">Your role can view tickets but not reply.</div>
						)}
					</>
				)}
			</section>
		</div>
	);
}
