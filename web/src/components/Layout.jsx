import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { enablePush, initPush, onForegroundMessage, permission } from '../push.js';
import { can, initials } from '../lib/format.js';
import Icon from './Icon.jsx';

const COUNTS_POLL_MS = 30000;

/** Menu, in order. `perm` hides the entry when the role lacks it (any of the listed keys). */
const NAV = [
	{ to: '/dashboard', label: 'Dashboard', icon: 'dashboard', perm: ['dashboard.view'] },
	{ to: '/inbox', label: 'Inbox', icon: 'inbox', perm: ['inbox.view'], badge: true },
	{ to: '/reports', label: 'Reports', icon: 'reports', perm: ['reports.view'] },
	{ section: 'Administration' },
	{ to: '/wd', label: 'WD Setup', icon: 'building', perm: ['companies.view'] },
	{ to: '/users', label: 'Users', icon: 'users', perm: ['users.view', 'users.manage'] },
	{ to: '/roles', label: 'Roles & Permissions', icon: 'shield', perm: ['users.view', 'users.manage', 'roles.manage'] },
	{ to: '/audit', label: 'Audit Log', icon: 'list', perm: ['audit.view'] },
];

export function visibleNav(user) {
	const items = NAV.filter((n) => n.section || n.perm.some((p) => can(user, p)));
	// Drop section headings with nothing under them.
	return items.filter((n, i) => !n.section || (items[i + 1] && !items[i + 1].section));
}

export default function Layout({ user, hubConfig, onLogout }) {
	const navigate = useNavigate();
	const location = useLocation();
	const [menuOpen, setMenuOpen] = useState(false);
	const [userMenu, setUserMenu] = useState(false);
	const [counts, setCounts] = useState({ needs_reply: 0, unread: 0 });
	const [push, setPush] = useState({ available: false, permission: 'default', error: '' });
	const [toast, setToast] = useState(null);
	const userMenuRef = useRef(null);

	useEffect(() => { setMenuOpen(false); setUserMenu(false); }, [location.pathname]);

	const loadCounts = useCallback(async () => {
		if (!can(user, 'inbox.view')) return;
		const r = await api.get('/inbox-counts');
		if (r.ok) setCounts({ needs_reply: r.needs_reply, unread: r.unread });
	}, [user]);

	useEffect(() => {
		loadCounts();
		const t = setInterval(loadCounts, COUNTS_POLL_MS);
		const onRefresh = () => loadCounts();
		window.addEventListener('hub:counts', onRefresh);
		return () => {
			clearInterval(t);
			window.removeEventListener('hub:counts', onRefresh);
		};
	}, [loadCounts]);

	useEffect(() => {
		document.title = counts.needs_reply ? `(${counts.needs_reply}) WD Support Hub` : 'WD Support Hub';
	}, [counts.needs_reply]);

	// Firebase: register this browser silently if permission was already granted.
	useEffect(() => {
		if (!hubConfig?.firebase || !can(user, 'inbox.view')) return undefined;
		let unsubscribe = () => {};
		let cancelled = false;
		initPush(hubConfig.firebase).then(async (available) => {
			if (cancelled) return;
			setPush((p) => ({ ...p, available, permission: permission() }));
			if (!available) return;
			if (permission() === 'granted') {
				const r = await enablePush({ prompt: false });
				if (!r.ok && r.error) setPush((p) => ({ ...p, error: r.error }));
			}
			if (cancelled) return;
			unsubscribe = onForegroundMessage((payload) => {
				setToast({
					title: payload.notification?.title || 'New support message',
					body: payload.notification?.body || '',
					ticketUuid: payload.data?.ticket_uuid || '',
				});
				window.dispatchEvent(new CustomEvent('hub:push'));
				loadCounts();
			});
		});
		return () => {
			cancelled = true;
			unsubscribe();
		};
	}, [hubConfig, user, loadCounts]);

	useEffect(() => {
		if (!toast) return undefined;
		const t = setTimeout(() => setToast(null), 8000);
		return () => clearTimeout(t);
	}, [toast]);

	useEffect(() => {
		if (!userMenu) return undefined;
		const close = (e) => { if (!userMenuRef.current?.contains(e.target)) setUserMenu(false); };
		document.addEventListener('mousedown', close);
		return () => document.removeEventListener('mousedown', close);
	}, [userMenu]);

	async function turnOnNotifications() {
		const r = await enablePush({ prompt: true });
		setPush((p) => ({ ...p, permission: permission(), error: r.ok ? '' : r.error || '' }));
	}

	const nav = visibleNav(user);
	const pushOn = push.available && push.permission === 'granted' && !push.error;

	return (
		<div className={`hub-shell ${menuOpen ? 'menu-open' : ''}`}>
			<aside className="hub-nav" aria-label="Main menu">
				<div className="hub-nav-brand">
					<span className="hub-logo">WD</span>
					<div>
						<div className="hub-nav-title">Support Hub</div>
						<div className="hub-nav-sub">Water District systems</div>
					</div>
				</div>
				<nav className="hub-nav-list">
					{nav.map((n) => (n.section
						? <div key={n.section} className="hub-nav-section">{n.section}</div>
						: (
							<NavLink key={n.to} to={n.to} className={({ isActive }) => `hub-nav-link ${isActive ? 'active' : ''}`}>
								<Icon name={n.icon} />
								<span className="flex-grow-1">{n.label}</span>
								{n.badge && counts.needs_reply > 0 && (
									<span className="badge badge-pill badge-warning" title="Tickets waiting for a hub reply">{counts.needs_reply}</span>
								)}
							</NavLink>
						)))}
				</nav>
				<div className="hub-nav-foot">
					<div className="small">{user.role_name}</div>
					<div className="small text-white-50">
						{user.all_companies ? 'All Water Districts' : `${user.companies.length} Water District${user.companies.length === 1 ? '' : 's'}`}
					</div>
				</div>
			</aside>
			<button type="button" className="hub-nav-backdrop" aria-label="Close menu" onClick={() => setMenuOpen(false)} />

			<div className="hub-main">
				<header className="hub-topbar">
					<button type="button" className="btn hub-icon-btn d-lg-none" aria-label="Open menu" onClick={() => setMenuOpen(true)}>
						<Icon name="menu" size={22} />
					</button>
					<span className="hub-topbar-title d-lg-none">WD Support Hub</span>
					<div className="ml-auto d-flex align-items-center">
						{push.available && push.permission !== 'granted' && (
							<button type="button" className="btn btn-sm btn-outline-primary mr-2" onClick={turnOnNotifications}
								disabled={push.permission === 'denied'}
								title={push.permission === 'denied' ? 'Allow notifications for this site in the browser settings' : 'Get a browser notification for new WD messages'}>
								<Icon name="bell" size={15} className="mr-1" />
								<span className="d-none d-sm-inline">{push.permission === 'denied' ? 'Notifications blocked' : 'Enable notifications'}</span>
							</button>
						)}
						{pushOn && (
							<span className="hub-push-on mr-2" title="Browser notifications are on"><Icon name="bell" size={16} /></span>
						)}
						<div className="hub-user" ref={userMenuRef}>
							<button type="button" className="hub-user-btn" aria-haspopup="true" aria-expanded={userMenu}
								onClick={() => setUserMenu((v) => !v)}>
								<span className="hub-avatar">{initials(user.display_name)}</span>
								<span className="d-none d-md-inline text-left">
									<span className="d-block hub-user-name">{user.display_name}</span>
									<span className="d-block hub-user-role">{user.role_name}</span>
								</span>
							</button>
							{userMenu && (
								<div className="hub-user-menu shadow">
									<div className="px-3 py-2 border-bottom">
										<div className="font-weight-bold">{user.display_name}</div>
										<div className="small text-muted">@{user.username} · {user.role_name}</div>
									</div>
									<button type="button" className="dropdown-item" onClick={() => navigate('/account')}>
										<Icon name="user" size={15} className="mr-2" />My account
									</button>
									<button type="button" className="dropdown-item text-danger" onClick={onLogout}>
										<Icon name="logout" size={15} className="mr-2" />Sign out
									</button>
								</div>
							)}
						</div>
					</div>
				</header>
				{push.error && <div className="alert alert-warning mx-3 mt-3 mb-0 py-2">{push.error}</div>}
				<main className="hub-content">
					<Outlet />
				</main>
			</div>

			{toast && (
				<div className="hub-toast shadow" role="status">
					<button type="button" className="close ml-2" aria-label="Dismiss" onClick={() => setToast(null)}>&times;</button>
					<button type="button" className="hub-toast-body"
						onClick={() => { if (toast.ticketUuid) navigate(`/inbox?ticket=${encodeURIComponent(toast.ticketUuid)}`); setToast(null); }}>
						<strong className="d-block">{toast.title}</strong>
						<span>{toast.body}</span>
					</button>
				</div>
			)}
		</div>
	);
}
