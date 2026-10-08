import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { STATUS_LABELS, slaState } from '../lib/format.js';

export function PageHeader({ icon, title, subtitle, children }) {
	return (
		<div className="hub-page-head">
			<div className="hub-page-title">
				<h1>
					{icon && <Icon name={icon} size={22} className="mr-2" />}
					{title}
				</h1>
				{subtitle && <p>{subtitle}</p>}
			</div>
			{children && <div className="hub-page-actions">{children}</div>}
		</div>
	);
}

export function Spinner({ label = 'Loading…' }) {
	return (
		<div className="hub-empty">
			<div className="spinner-border spinner-border-sm text-primary" role="status" />
			<div className="mt-2">{label}</div>
		</div>
	);
}

export function EmptyState({ icon = 'inbox', title, children }) {
	return (
		<div className="hub-empty">
			<Icon name={icon} size={36} strokeWidth={1.3} />
			{title && <div className="font-weight-bold mt-2">{title}</div>}
			{children && <div className="mt-1">{children}</div>}
		</div>
	);
}

export function Forbidden() {
	return (
		<div className="card hub-card">
			<EmptyState icon="shield" title="No access">
				Your role does not include this module. Ask a hub Administrator if you need it.
			</EmptyState>
		</div>
	);
}

export function Alert({ type = 'danger', children, onClose }) {
	if (!children) return null;
	return (
		<div className={`alert alert-${type} d-flex align-items-start py-2`} role="alert">
			<div className="flex-grow-1">{children}</div>
			{onClose && <button type="button" className="close ml-2" aria-label="Close" onClick={onClose}>&times;</button>}
		</div>
	);
}

export function KpiCard({ label, value, hint, icon, tone = 'brand', onClick }) {
	const Tag = onClick ? 'button' : 'div';
	return (
		<Tag type={onClick ? 'button' : undefined} className={`hub-kpi hub-kpi-${tone}`} onClick={onClick}>
			<div className="hub-kpi-icon"><Icon name={icon} size={20} /></div>
			<div className="hub-kpi-body">
				<div className="hub-kpi-value">{value}</div>
				<div className="hub-kpi-label">{label}</div>
				{hint && <div className="hub-kpi-hint">{hint}</div>}
			</div>
		</Tag>
	);
}

const STATUS_VARIANTS = {
	open: 'primary', waiting_support: 'warning', waiting_client: 'info', resolved: 'success', closed: 'secondary',
};

export function StatusBadge({ status }) {
	return <span className={`badge badge-${STATUS_VARIANTS[status] || 'light'}`}>{STATUS_LABELS[status] || status}</span>;
}

export function PriorityBadge({ priority, all = false }) {
	if (priority === 'urgent') return <span className="badge badge-danger">Urgent</span>;
	if (priority === 'high') return <span className="badge badge-warning">High</span>;
	if (!all) return null;
	return <span className="badge badge-light">{priority === 'low' ? 'Low' : 'Normal'}</span>;
}

export function SlaBadge({ ticket, now }) {
	const s = slaState(ticket, now);
	if (!s.label) return null;
	return (
		<span className={`badge hub-sla hub-sla-${s.level}`} title="Based on this Water District's SLA targets">
			<Icon name="clock" size={11} strokeWidth={2.2} /> {s.label}
		</span>
	);
}

/** Controlled Bootstrap-styled modal (no jQuery). Full screen on phones. */
export function Modal({ open, title, onClose, children, footer, size = '' }) {
	useEffect(() => {
		if (!open) return undefined;
		const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
		document.addEventListener('keydown', onKey);
		document.body.classList.add('modal-open');
		return () => {
			document.removeEventListener('keydown', onKey);
			document.body.classList.remove('modal-open');
		};
	}, [open, onClose]);
	if (!open) return null;
	return (
		<>
			<div className="modal fade show d-block hub-modal" role="dialog" aria-modal="true" aria-label={title}
				onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
				<div className={`modal-dialog modal-dialog-centered modal-dialog-scrollable ${size ? `modal-${size}` : ''}`}>
					<div className="modal-content">
						<div className="modal-header">
							<h5 className="modal-title">{title}</h5>
							<button type="button" className="close" aria-label="Close" onClick={onClose}>&times;</button>
						</div>
						<div className="modal-body">{children}</div>
						{footer && <div className="modal-footer">{footer}</div>}
					</div>
				</div>
			</div>
			<div className="modal-backdrop fade show" />
		</>
	);
}

/** Confirmation dialog; `typeToConfirm` requires the user to type an exact word first. */
export function ConfirmModal({ open, title, children, confirmLabel = 'Confirm', tone = 'danger', typeToConfirm, busy, onConfirm, onClose }) {
	const [typed, setTyped] = useState('');
	useEffect(() => { if (open) setTyped(''); }, [open]);
	const blocked = typeToConfirm && typed.trim().toUpperCase() !== typeToConfirm.toUpperCase();
	return (
		<Modal open={open} title={title} onClose={onClose}
			footer={(
				<>
					<button type="button" className="btn btn-light" onClick={onClose}>Cancel</button>
					<button type="button" className={`btn btn-${tone}`} disabled={busy || blocked} onClick={() => onConfirm(typed)}>
						{busy ? 'Working…' : confirmLabel}
					</button>
				</>
			)}>
			{children}
			{typeToConfirm && (
				<div className="form-group mt-3 mb-0">
					<label className="small">Type <strong>{typeToConfirm}</strong> to confirm</label>
					<input className="form-control" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
				</div>
			)}
		</Modal>
	);
}

/** Range picker shared by Dashboard and Reports. value = { range, from, to }. */
export function RangePicker({ value, onChange }) {
	const custom = value.range === 'custom';
	return (
		<div className="hub-range">
			<select className="custom-select custom-select-sm" value={value.range} aria-label="Period"
				onChange={(e) => onChange({ ...value, range: e.target.value })}>
				<option value="7">Last 7 days</option>
				<option value="30">Last 30 days</option>
				<option value="90">Last 90 days</option>
				<option value="365">Last 12 months</option>
				<option value="custom">Custom…</option>
			</select>
			{custom && (
				<>
					<input type="date" className="form-control form-control-sm" value={value.from || ''} aria-label="From"
						onChange={(e) => onChange({ ...value, from: e.target.value })} />
					<input type="date" className="form-control form-control-sm" value={value.to || ''} aria-label="To"
						onChange={(e) => onChange({ ...value, to: e.target.value })} />
				</>
			)}
		</div>
	);
}

export function rangeParams(v) {
	return v.range === 'custom' && v.from && v.to ? { from: v.from, to: v.to } : { range: v.range === 'custom' ? '30' : v.range };
}
