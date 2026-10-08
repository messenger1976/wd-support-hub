import { useEffect } from 'react';

export default function AuthShell({ title, children }) {
	useEffect(() => {
		document.title = title;
	}, [title]);

	return (
		<div className="hub-auth">
			<header className="hub-auth-bar">
				<div className="container"><span className="hub-brand">Water District Support Hub</span></div>
			</header>
			<div className="container py-5">
				<div className="row">
					<div className="col-xl-6 col-lg-8 mx-auto">
						<div className="card p-4 hub-auth-card">{children}</div>
					</div>
				</div>
			</div>
		</div>
	);
}
