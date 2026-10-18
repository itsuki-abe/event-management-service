import {
	Home,
	Laptop,
	MapPin,
	MessageCircle,
	MessagesSquare,
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
	| "guide-admin"
	| "comments"
	| "engagement"
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
	registrationOnly = false,
}: {
	children: React.ReactNode;
	section?: WorkspaceSection;
	eventId?: string | number;
	name?: string;
	identity?: string;
	bare?: boolean;
	registrationOnly?: boolean;
}) {
	if (bare) return children;
	const eventPath = `/events/${encodeURIComponent(eventId)}`;
	const active = ["registration", "connect", "qr"].includes(section)
		? "dashboard"
		: section === "engagement"
			? "live"
			: section;
	const navigation = [
		{ id: "dashboard", label: "ホーム", href: "/", icon: Home },
		{ id: "guide", label: "会場", href: `${eventPath}/guide`, icon: MapPin },
		{
			id: "live",
			label: "LTライブ",
			href: `/engagement?eventId=${encodeURIComponent(eventId)}`,
			icon: MessageCircle,
		},
		{ id: "team", label: "チーム", href: `${eventPath}/team`, icon: Users },
	];
	const managementNavigation = [
		{ id: "admin", label: "LT進行", href: "/admin", icon: Settings2 },
		{
			id: "comments",
			label: "コメント管理",
			href: `/admin/comments?eventId=${encodeURIComponent(eventId)}`,
			icon: MessagesSquare,
		},
	];
	const management = [
		...managementNavigation,
		{
			id: "guide-admin",
			label: "会場案内の設定",
			href: `/admin/guide?eventId=${encodeURIComponent(eventId)}`,
		},
	];
	function items(includeManagement = false) {
		return [
			...navigation,
			...(includeManagement ? managementNavigation : []),
		].map((item) => (
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
	function itemsForManagement() {
		return management.map((item) => (
			<a
				key={item.id}
				href={item.href}
				aria-current={section === item.id ? "page" : undefined}
			>
				{item.label}
			</a>
		));
	}

	return (
		<div className={`wc-app${registrationOnly ? " wc-registration-only" : ""}`}>
			<a className="wc-skip" href="#main-content">
				本文へスキップ
			</a>
			<header className="wc-header">
				<a href="/" className="wc-brand">
					WORKSHOP COMMONS<small>つくる、つながる</small>
				</a>
				{!registrationOnly && (
					<>
						<nav className="wc-desktop-nav" aria-label="メインメニュー">
							{items(true)}
						</nav>
						<div className="wc-header-tools">
							<span className="wc-event-name">{name}</span>
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
									<span className="wc-profile-initial">
										{identity.slice(0, 1)}
									</span>
								) : (
									<UserRound size={22} aria-hidden="true" />
								)}
							</a>
						</div>
					</>
				)}
			</header>
			<main id="main-content" className="wc-page">
				{["admin", "comments", "guide-admin"].includes(section) && (
					<section className="wc-management" aria-label="運営管理">
						<h1>運営管理</h1>
						<p>発表の進行・コメント・会場案内を、ここから管理します。</p>
						<nav className="wc-section-tabs" aria-label="運営メニュー">
							{itemsForManagement()}
						</nav>
					</section>
				)}
				{["live", "engagement"].includes(section) && (
					<nav className="wc-section-tabs" aria-label="LTライブの表示">
						<a
							href="/live"
							aria-current={section === "live" ? "page" : undefined}
						>
							発表・タイマー
						</a>
						<a
							href={`/engagement?eventId=${encodeURIComponent(eventId)}`}
							aria-current={section === "engagement" ? "page" : undefined}
						>
							リアクション・コメント
						</a>
					</nav>
				)}
				{children}
				{!registrationOnly && (
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
				)}
			</main>
			{!registrationOnly && (
				<nav className="wc-bottom-nav" aria-label="参加者メニュー">
					{items()}
				</nav>
			)}
		</div>
	);
}
