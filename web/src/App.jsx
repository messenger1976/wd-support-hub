import { useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { api, onUnauthorized } from './api.js';
import { disablePush } from './push.js';
import { can } from './lib/format.js';
import Layout from './components/Layout.jsx';
import { Forbidden } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Inbox from './pages/Inbox.jsx';
import Reports from './pages/Reports.jsx';
import CompanyList from './pages/CompanyList.jsx';
import CompanyForm from './pages/CompanyForm.jsx';
import Users from './pages/Users.jsx';
import Roles from './pages/Roles.jsx';
import AuditLog from './pages/AuditLog.jsx';
import Account from './pages/Account.jsx';

function RequirePerm({ user, perm, children }) {
	const keys = Array.isArray(perm) ? perm : [perm];
	return keys.some((k) => can(user, k)) ? children : <Forbidden />;
}

/** First page the role may open. Old push links (/?ticket=…) go straight to the inbox. */
function Home({ user }) {
	const { search } = useLocation();
	const ticket = new URLSearchParams(search).get('ticket');
	if (ticket && can(user, 'inbox.view')) return <Navigate to={`/inbox?ticket=${encodeURIComponent(ticket)}`} replace />;
	if (can(user, 'dashboard.view')) return <Navigate to="/dashboard" replace />;
	if (can(user, 'inbox.view')) return <Navigate to="/inbox" replace />;
	if (can(user, 'reports.view')) return <Navigate to="/reports" replace />;
	return <Navigate to="/account" replace />;
}

export default function App() {
	const [user, setUser] = useState(undefined);
	const [hubConfig, setHubConfig] = useState(null);
	const [flash, setFlash] = useState('');

	useEffect(() => {
		onUnauthorized(() => setUser(null));
		api.get('/auth/me').then((r) => setUser(r.ok ? r.user : null));
		api.get('/config').then((r) => setHubConfig(r.ok ? r : {}));
	}, []);

	const logout = useCallback(async () => {
		await disablePush();
		await api.post('/auth/logout');
		setUser(null);
	}, []);

	if (user === undefined) return null;

	if (!user) {
		return (
			<Routes>
				<Route path="/forgot-password" element={<ForgotPassword />} />
				<Route path="/reset-password" element={<ResetPassword onDone={setFlash} />} />
				<Route path="*" element={<Login onLogin={(u) => { setFlash(''); setUser(u); }} flash={flash} />} />
			</Routes>
		);
	}

	const guard = (perm, el) => <RequirePerm user={user} perm={perm}>{el}</RequirePerm>;

	return (
		<Routes>
			<Route path="/forgot-password" element={<Navigate to="/" replace />} />
			<Route path="/reset-password" element={<ResetPassword onDone={setFlash} />} />
			<Route element={<Layout user={user} hubConfig={hubConfig} onLogout={logout} />}>
				<Route index element={<Home user={user} />} />
				<Route path="dashboard" element={guard('dashboard.view', <Dashboard user={user} />)} />
				<Route path="inbox" element={guard('inbox.view', <Inbox user={user} />)} />
				<Route path="reports" element={guard('reports.view', <Reports user={user} />)} />
				<Route path="reports/:type" element={guard('reports.view', <Reports user={user} />)} />
				<Route path="wd" element={guard('companies.view', <CompanyList user={user} />)} />
				<Route path="wd/new" element={guard('companies.create', <CompanyForm user={user} />)} />
				<Route path="wd/:code" element={guard('companies.view', <CompanyForm user={user} />)} />
				<Route path="users" element={guard(['users.view', 'users.manage'], <Users user={user} />)} />
				<Route path="roles" element={guard(['users.view', 'users.manage', 'roles.manage'], <Roles user={user} />)} />
				<Route path="audit" element={guard('audit.view', <AuditLog />)} />
				<Route path="account" element={<Account user={user} onUpdated={setUser} />} />
				<Route path="*" element={<Navigate to="/" replace />} />
			</Route>
		</Routes>
	);
}
