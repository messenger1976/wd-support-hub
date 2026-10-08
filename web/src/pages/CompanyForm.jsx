import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import { Alert, ConfirmModal, PageHeader, Spinner } from '../components/ui.jsx';
import { can, fmtAgo, fmtDateTime } from '../lib/format.js';

const EMPTY = {
	code: '', name: '', short_name: '', ticket_prefix: '', contact_person: '', contact_email: '', contact_phone: '',
	address: '', app_url: '', notes: '', sla_first_response_hours: 4, sla_resolution_hours: 72,
};

const SLA_PRESETS = [
	{ label: 'Standard', fr: 4, res: 72, hint: 'Reply within 4 h, resolve within 3 days' },
	{ label: 'Priority', fr: 2, res: 24, hint: 'Reply within 2 h, resolve within 1 day' },
	{ label: 'Basic', fr: 8, res: 120, hint: 'Reply within 1 working day, resolve within 5 days' },
];

const CONNECTION = {
	online: { label: 'Online', cls: 'success', text: 'The WD app contacted the hub in the last 5 minutes.' },
	idle: { label: 'Idle', cls: 'warning', text: 'The WD app contacted the hub today, but not in the last 5 minutes.' },
	offline: { label: 'Offline', cls: 'danger', text: 'No contact for more than a day. Check the app URL, network, and token.' },
	never: { label: 'Never connected', cls: 'secondary', text: 'The WD app has not called the hub yet. Finish the install checklist below.' },
};

async function copyText(text) {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}

function Field({ label, hint, children, className = '' }) {
	return (
		<div className={`form-group ${className}`}>
			<label className="hub-label">{label}</label>
			{children}
			{hint && <small className="form-text text-muted">{hint}</small>}
		</div>
	);
}

export default function CompanyForm({ user }) {
	const { code } = useParams();
	const isNew = !code;
	const navigate = useNavigate();
	const [params, setParams] = useSearchParams();
	const tab = params.get('tab') || 'profile';
	const [form, setForm] = useState(EMPTY);
	const [company, setCompany] = useState(null);
	const [serverTime, setServerTime] = useState('');
	const [error, setError] = useState('');
	const [notice, setNotice] = useState('');
	const [saving, setSaving] = useState(false);
	const [token, setToken] = useState('');
	const [snippet, setSnippet] = useState(null);
	const [confirmRotate, setConfirmRotate] = useState(false);
	const [rotating, setRotating] = useState(false);

	const editable = isNew ? can(user, 'companies.create') : can(user, 'companies.edit');
	const canToken = can(user, 'companies.token');

	const load = useCallback(async () => {
		if (isNew) return;
		const r = await api.get(`/wd/${encodeURIComponent(code)}`);
		if (!r.ok) {
			setError(r.error || 'Water District not found.');
			return;
		}
		setCompany(r.company);
		setServerTime(r.server_time);
		setForm({ ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, r.company[k] ?? EMPTY[k]])) });
	}, [code, isNew]);

	useEffect(() => { load(); }, [load]);

	const loadSnippet = useCallback(async () => {
		if (isNew) return;
		const r = await api.get(`/wd/${encodeURIComponent(code)}/connection`);
		if (r.ok) setSnippet(r);
	}, [code, isNew]);

	useEffect(() => {
		if (tab === 'connection') loadSnippet();
	}, [tab, loadSnippet]);

	const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

	async function save(e) {
		e.preventDefault();
		setSaving(true);
		setError('');
		const r = isNew ? await api.post('/wd', form) : await api.post(`/wd/${encodeURIComponent(code)}`, form);
		setSaving(false);
		if (!r.ok) {
			setError(r.error || 'Could not save.');
			return;
		}
		if (isNew) {
			navigate(`/wd/${r.code}?tab=connection`, { replace: true, state: { created: true } });
			return;
		}
		setNotice('Changes saved.');
		load();
	}

	async function reveal() {
		const r = await api.get(`/wd/${encodeURIComponent(code)}/token`);
		if (r.ok) setToken(r.token);
		else setError(r.error || 'Could not read the token.');
	}

	async function rotate() {
		setRotating(true);
		const r = await api.post(`/wd/${encodeURIComponent(code)}/rotate-token`);
		setRotating(false);
		setConfirmRotate(false);
		if (!r.ok) {
			setError(r.error || 'Could not rotate the token.');
			return;
		}
		setToken(r.token);
		setNotice('New token generated. Update message_support.php in the WD app now — the old token no longer works.');
		load();
		loadSnippet();
	}

	async function copy(text, what) {
		setNotice((await copyText(text)) ? `${what} copied to the clipboard.` : 'Copy failed — select the text and copy it manually.');
	}

	if (!isNew && !company && !error) return <Spinner />;

	const conn = company ? CONNECTION[company.connection.state] : null;
	const tabs = [
		{ key: 'profile', label: 'Profile' },
		{ key: 'sla', label: 'SLA targets' },
		...(isNew ? [] : [{ key: 'connection', label: 'Connection' }]),
	];

	return (
		<>
			<PageHeader icon="building" title={isNew ? 'Add Water District' : company?.name || code}
				subtitle={isNew ? 'Register a new Water District so its app can send tickets to the hub'
					: `${company?.code} · ${company?.status === 'active' ? 'Active' : 'Deactivated'} · created ${fmtDateTime(company?.created_at)}`}>
				<Link to="/wd" className="btn btn-sm btn-light"><Icon name="back" size={15} className="mr-1" />All Water Districts</Link>
			</PageHeader>
			<Alert onClose={() => setError('')}>{error}</Alert>
			<Alert type="success" onClose={() => setNotice('')}>{notice}</Alert>
			{company?.status === 'inactive' && (
				<Alert type="warning">This Water District is deactivated: its app's token is refused. Activate it from the WD Setup list.</Alert>
			)}

			<ul className="nav nav-tabs hub-tabs">
				{tabs.map((t) => (
					<li key={t.key} className="nav-item">
						<button type="button" className={`nav-link ${tab === t.key ? 'active' : ''}`} onClick={() => setParams({ tab: t.key }, { replace: true })}>
							{t.label}
						</button>
					</li>
				))}
			</ul>

			{tab !== 'connection' && (
				<form className="card hub-card hub-tab-card" onSubmit={save}>
					<fieldset disabled={!editable} className="hub-card-body">
						{tab === 'profile' && (
							<>
								<div className="form-row">
									<Field className="col-md-8" label="Water District name *">
										<input className="form-control" value={form.name} onChange={set('name')} required maxLength={150}
											placeholder="e.g. Dipolog City Water District" autoFocus={isNew} />
									</Field>
									<Field className="col-md-4" label="Short name" hint="Shown in lists and charts">
										<input className="form-control" value={form.short_name} onChange={set('short_name')} maxLength={60} placeholder="e.g. Dipolog" />
									</Field>
								</div>
								<div className="form-row">
									<Field className="col-md-4" label="Code *" hint={isNew ? 'Permanent. Capital letters, digits, underscore.' : 'The code cannot change — tickets are filed under it.'}>
										<input className="form-control text-uppercase" value={form.code} onChange={set('code')} disabled={!isNew}
											required maxLength={32} pattern="[A-Za-z0-9_]{2,32}" placeholder="DIPOLOG" />
									</Field>
									<Field className="col-md-4" label="Ticket prefix" hint="Must match ms_ticket_prefix in the WD app (e.g. LAB)">
										<input className="form-control text-uppercase" value={form.ticket_prefix} onChange={set('ticket_prefix')} maxLength={10} placeholder="DIP" />
									</Field>
									<Field className="col-md-4" label="WD app URL" hint="Where the WD staff use the billing system">
										<input className="form-control" type="url" value={form.app_url} onChange={set('app_url')} maxLength={255} placeholder="https://billing.example.gov.ph/" />
									</Field>
								</div>
								<h3 className="hub-form-section">Contact at the Water District</h3>
								<div className="form-row">
									<Field className="col-md-4" label="Contact person">
										<input className="form-control" value={form.contact_person} onChange={set('contact_person')} maxLength={150} placeholder="General Manager / IT focal" />
									</Field>
									<Field className="col-md-4" label="Email">
										<input className="form-control" type="email" value={form.contact_email} onChange={set('contact_email')} maxLength={190} />
									</Field>
									<Field className="col-md-4" label="Phone">
										<input className="form-control" value={form.contact_phone} onChange={set('contact_phone')} maxLength={60} />
									</Field>
								</div>
								<Field label="Office address">
									<input className="form-control" value={form.address} onChange={set('address')} maxLength={255} />
								</Field>
								<Field label="Internal notes" hint="Only hub staff see this (contract, remote-access arrangement, quirks).">
									<textarea className="form-control" rows={3} value={form.notes} onChange={set('notes')} />
								</Field>
							</>
						)}

						{tab === 'sla' && (
							<>
								<p className="text-muted">
									Targets drive the overdue badges in the inbox, the dashboard's "Past SLA target" count and the SLA reports.
									Times are counted in calendar hours from when the ticket reached the hub.
								</p>
								<div className="hub-presets">
									{SLA_PRESETS.map((p) => (
										<button key={p.label} type="button"
											className={`hub-preset ${Number(form.sla_first_response_hours) === p.fr && Number(form.sla_resolution_hours) === p.res ? 'active' : ''}`}
											onClick={() => setForm((f) => ({ ...f, sla_first_response_hours: p.fr, sla_resolution_hours: p.res }))}>
											<strong>{p.label}</strong>
											<span>{p.hint}</span>
										</button>
									))}
								</div>
								<div className="form-row mt-3">
									<Field className="col-sm-6" label="First response target (hours)" hint="Time allowed before the hub's first reply.">
										<input className="form-control" type="number" min={1} max={720} value={form.sla_first_response_hours} onChange={set('sla_first_response_hours')} required />
									</Field>
									<Field className="col-sm-6" label="Resolution target (hours)" hint="Time allowed until the ticket is resolved or closed.">
										<input className="form-control" type="number" min={1} max={2160} value={form.sla_resolution_hours} onChange={set('sla_resolution_hours')} required />
									</Field>
								</div>
							</>
						)}
					</fieldset>
					{editable && (
						<div className="hub-card-foot">
							<button type="submit" className="btn btn-primary" disabled={saving}>
								{saving ? 'Saving…' : isNew ? 'Create Water District' : 'Save changes'}
							</button>
							{isNew && <span className="small text-muted ml-3">An API token is generated automatically.</span>}
						</div>
					)}
				</form>
			)}

			{tab === 'connection' && company && (
				<div className="hub-grid hub-grid-1-1">
					<div className="card hub-card">
						<div className="hub-card-head"><div><h2>Connection status</h2><small>How the WD app talks to this hub</small></div></div>
						<div className="hub-card-body">
							<div className="d-flex align-items-center mb-2">
								<span className={`hub-conn hub-conn-${conn.cls}`} />
								<strong>{conn.label}</strong>
								<span className="ml-2 small text-muted">{company.last_seen ? `last contact ${fmtAgo(company.last_seen, serverTime)}` : ''}</span>
							</div>
							<p className="small text-muted">{conn.text}</p>

							<label className="hub-label">API token</label>
							<div className="input-group input-group-sm mb-2">
								<input className="form-control text-monospace" readOnly value={token || company.token_masked} aria-label="API token" />
								{canToken && (
									<div className="input-group-append">
										{!token && <button type="button" className="btn btn-outline-secondary" onClick={reveal}><Icon name="eye" size={14} /> Reveal</button>}
										{token && <button type="button" className="btn btn-outline-secondary" onClick={() => copy(token, 'Token')}><Icon name="copy" size={14} /> Copy</button>}
									</div>
								)}
							</div>
							<div className="small text-muted mb-3">
								Last rotated {company.token_rotated_at ? fmtDateTime(company.token_rotated_at) : 'never (original install token)'}.
								{!canToken && ' Your role cannot view or rotate tokens.'}
							</div>
							{canToken && (
								<button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setConfirmRotate(true)}>
									<Icon name="refresh" size={14} className="mr-1" />Rotate token
								</button>
							)}
						</div>
					</div>

					<div className="card hub-card">
						<div className="hub-card-head">
							<div><h2>WD app configuration</h2><small>Save as application/config/message_support.php</small></div>
							{snippet && <button type="button" className="btn btn-sm btn-light" onClick={() => copy(snippet.snippet, 'Configuration')}><Icon name="copy" size={14} className="mr-1" />Copy</button>}
						</div>
						<div className="hub-card-body">
							{snippet ? <pre className="hub-code">{snippet.snippet}</pre> : <Spinner />}
							{snippet && !snippet.includes_token && (
								<div className="small text-warning">The token is hidden for your role — ask a hub Administrator to fill in ms_api_token.</div>
							)}
						</div>
					</div>

					<div className="card hub-card hub-span-2">
						<div className="hub-card-head"><div><h2>Install checklist</h2><small>Connect a new Water District app in about 10 minutes</small></div></div>
						<ol className="hub-checklist">
							<li>
								<strong>Copy the plugin files</strong> from <code>wd-support-hub/client-plugin</code> into the WD app:
								the <code>messagesupport</code> controller, model and view under <code>application/modules/master/</code>.
							</li>
							<li><strong>Save the configuration</strong> above as <code>application/config/message_support.php</code> and create a writable <code>uploads/message_support/</code> folder.</li>
							<li><strong>Run</strong> <code>client-plugin/sql/install.sql</code> on the Water District's database (tickets tables + the <code>message_support</code> permission).</li>
							<li><strong>Add the menu entry</strong> and role key <code>message_support</code> (see <code>client-plugin/patches/NAV_AND_PERMISSIONS.md</code>).</li>
							<li><strong>Allow outbound HTTP(S)</strong> from the WD server to <code>{snippet?.hub_url || 'the hub URL'}</code>.</li>
							<li><strong>Smoke test:</strong> create a ticket in the WD app, reply here, and confirm the reply appears there within ~10 seconds. This page then shows <em>Online</em>.</li>
						</ol>
					</div>
				</div>
			)}

			<ConfirmModal open={confirmRotate} busy={rotating} onClose={() => setConfirmRotate(false)} onConfirm={rotate}
				title="Rotate API token" confirmLabel="Generate new token" typeToConfirm={company?.code}>
				<p>
					The current token stops working <strong>immediately</strong>. {company?.name} cannot send or receive tickets until
					its <code>message_support.php</code> has the new token.
				</p>
				<p className="mb-0 small text-muted">Rotate when a token may have leaked, when staff with server access leave, or on a yearly schedule.</p>
			</ConfirmModal>
		</>
	);
}
