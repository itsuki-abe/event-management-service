import {
	Home,
	Laptop,
	MapPin,
	MessageCircle,
	QrCode,
	Settings2,
	UserRound,
	Users,
} from "lucide-react";

export type WorkspaceSection =
	| "dashboard"
	| "registration"
	| "connect"
	| "live"
	| "speaker"
	| "admin"
	| "qr"
	| "guide"
	| "team";

export function WorkspaceShell({
	children,
	section = "dashboard",
	eventId = 1,
	name,
	identity,
	bare = false,
}: {
	children: React.ReactNode;
	section?: WorkspaceSection;
	eventId?: string | number;
	name?: string;
	identity?: string;
	bare?: boolean;
}) {
	if (bare) return children;
	const eventPath = `/events/${encodeURIComponent(eventId)}`;
	const active = ["registration", "connect", "qr"].includes(section)
		? "dashboard"
		: section;
	const navigation = [
		{ id: "dashboard", label: "ホーム", href: "/", icon: Home },
		{ id: "guide", label: "会場", href: `${eventPath}/guide`, icon: MapPin },
		{ id: "live", label: "ライブ", href: "/live", icon: MessageCircle },
		{ id: "team", label: "チーム", href: `${eventPath}/team`, icon: Users },
	];
	function items() {
		return navigation.map((item) => (
			<a
				key={item.id}
				href={item.href}
				className={active === item.id ? "active" : undefined}
				aria-current={active === item.id ? "page" : undefined}
			>
				<item.icon size={23} aria-hidden="true" />
				<span>{item.label}</span>
			</a>
		));
	}
	return (
		<div className="wc-app">
			<a className="wc-skip" href="#main-content">
				本文へスキップ
			</a>
			<header className="wc-header">
				<a href="/" className="wc-brand">
					WORKSHOP COMMONS<small>つくる、つながる</small>
				</a>
				<nav className="wc-desktop-nav" aria-label="参加者メニュー">
					{items()}
				</nav>
				<div className="wc-header-tools">
					<span className="wc-event-name">{name}</span>
					<a
						className="wc-icon-link wc-operator-link"
						href="/admin"
						aria-label="運営の進行"
						title="運営の進行"
					>
						<Settings2 size={21} aria-hidden="true" />
					</a>
					<a
						className="wc-icon-link"
						href={`${eventPath}/connect`}
						aria-label="PC／Macを接続"
						title="PC／Macを接続"
					>
						<Laptop size={22} aria-hidden="true" />
					</a>
					<a
						className="wc-icon-link wc-profile-link"
						href={eventPath}
						aria-label={
							identity
								? `${identity}さんのプロフィール`
								: "参加登録・プロフィール"
						}
						title="参加登録・プロフィール"
					>
						{identity ? (
							<span className="wc-profile-initial">{identity.slice(0, 1)}</span>
						) : (
							<UserRound size={22} aria-hidden="true" />
						)}
					</a>
				</div>
			</header>
			<main id="main-content" className="wc-page">
				{children}
				<footer className="wc-footer">
					<span>WORKSHOP COMMONS</span>
					<div>
						<a href={`${eventPath}/qr`}>
							<QrCode size={15} aria-hidden="true" />
							参加QR
						</a>
						<a href="/speaker">発表者</a>
						<a href="/admin">運営</a>
					</div>
				</footer>
			</main>
			<nav className="wc-bottom-nav" aria-label="参加者メニュー">
				{items()}
			</nav>
		</div>
	);
}
