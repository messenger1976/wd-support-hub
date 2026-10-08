import { useState } from 'react';
import Icon from './Icon.jsx';
import { CATEGORY, PRIORITY } from '../lib/board.js';

function Ticker({ m }) {
	const cat = CATEGORY[m.category] || CATEGORY.announcement;
	return (
		<div className={`hub-bp-ticker hub-bp-${m.priority}`}>
			<span className="hub-bp-grip"><Icon name="grip" size={14} strokeWidth={3} /></span>
			<span className="hub-bp-ticker-icon"><Icon name={cat.icon} size={14} /></span>
			<span className="hub-bp-ticker-text"><span>{m.ticker_text || m.title || 'Your ticker line appears here'}</span></span>
			<span className="hub-bp-ticker-count">1/1</span>
			<span className="hub-bp-ticker-btn"><Icon name="minus" size={13} /></span>
		</div>
	);
}

function Popup({ m }) {
	const cat = CATEGORY[m.category] || CATEGORY.announcement;
	return (
		<div className="hub-bp-modal">
			<div className={`hub-bp-modal-head hub-bp-${m.priority}`}>
				<Icon name="megaphone" size={16} className="mr-2" />
				<strong className="flex-grow-1">Announcements</strong>
				<span className="small">1 of 1</span>
			</div>
			<div className="hub-bp-modal-body">
				<div className="mb-2">
					<span className="hub-bp-cat" style={{ color: cat.color, borderColor: cat.color }}><Icon name={cat.icon} size={12} className="mr-1" />{cat.label}</span>
					{m.priority !== 'normal' && <span className={`badge badge-${PRIORITY[m.priority].badge} ml-1`}>{PRIORITY[m.priority].label}</span>}
				</div>
				<h4 className="hub-bp-title">{m.title || 'Message title'}</h4>
				{m.body_html
					? <div className="hub-board-body" dangerouslySetInnerHTML={{ __html: m.body_html }} />
					: <p className="text-muted">The message body appears here.</p>}
			</div>
			<div className="hub-bp-modal-foot">
				{m.require_ack ? (
					<span className="btn btn-sm btn-primary disabled"><Icon name="check" size={14} className="mr-1" />I have read this</span>
				) : (
					<>
						{m.allow_opt_out && m.priority !== 'critical'
							? <label className="small mb-0 mr-auto"><input type="checkbox" disabled className="mr-1" />Don't show this again</label>
							: <span className="small text-muted mr-auto">Shows at every login until it ends</span>}
						<span className="btn btn-sm btn-light disabled">Remind me later</span>
					</>
				)}
			</div>
		</div>
	);
}

/** How a message will look inside the Water District apps (SmartAdmin 4 shell). Static mock, not the WD code. */
export default function BoardPreview({ message }) {
	const [view, setView] = useState('ticker');
	const m = message;
	const views = [
		['ticker', 'Ticker'],
		['popup', 'Popup'],
		['phone', 'Phone'],
	];
	return (
		<div className="hub-bp">
			<div className="btn-group btn-group-sm mb-2 d-flex" role="group" aria-label="Preview">
				{views.map(([k, l]) => (
					<button key={k} type="button" className={`btn ${view === k ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setView(k)}>{l}</button>
				))}
			</div>

			{view === 'ticker' && (
				<div className="hub-bp-screen">
					<div className="hub-bp-header"><span className="hub-bp-burger" /><span className="hub-bp-head-title">Water District billing system</span><span className="hub-bp-avatar" /></div>
					{m.show_ticker ? <div className="hub-bp-float"><Ticker m={m} /></div> : null}
					<div className="hub-bp-page"><span /><span /><span /></div>
					{!m.show_ticker && <div className="hub-bp-off">The ticker is turned off for this message.</div>}
				</div>
			)}

			{view === 'popup' && (
				<div className="hub-bp-screen hub-bp-screen-dim">
					{m.show_popup ? <Popup m={m} /> : <div className="hub-bp-off">The login popup is turned off for this message.</div>}
				</div>
			)}

			{view === 'phone' && (
				<div className="hub-bp-phone">
					<div className="hub-bp-phone-screen">
						<div className="hub-bp-header"><span className="hub-bp-burger" /><span className="hub-bp-head-title">Billing</span></div>
						{m.show_ticker ? <div className="hub-bp-float"><Ticker m={m} /></div> : null}
						{m.show_popup ? <Popup m={m} /> : <div className="hub-bp-page"><span /><span /><span /></div>}
					</div>
				</div>
			)}
			<p className="small text-muted mt-2 mb-0">
				{view === 'ticker' && 'One line that floats at the top of every page. Users can drag it, minimise it, or tap it to read the full message.'}
				{view === 'popup' && 'Shown once on the dashboard right after login, one slide per message.'}
				{view === 'phone' && 'On phones the ticker slides one message at a time and the popup fills the screen.'}
			</p>
		</div>
	);
}
