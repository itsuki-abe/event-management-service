import {
	ArrowRight,
	ArrowUpRight,
	Check,
	ChevronRight,
	CircleHelp,
	Clock3,
	Coffee,
	ExternalLink,
	LayoutDashboard,
	Megaphone,
	Monitor,
	Pause,
	Play,
	Plus,
	QrCode,
	Radio,
	RotateCcw,
	Search,
	Settings2,
	ShieldCheck,
	Sparkles,
	Ticket as TicketIcon,
	Users,
	Video,
	X,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { decisionsAdapter, getMockLiveContext } from "./adapters";
import {
	type Attendee,
	addReaction,
	assignTeams,
	callNextTicket,
	cancelTicket,
	checkIn,
	createSeedState,
	type EventState,
	finishTicket,
	getCurrentTicket,
	getQueuedTickets,
	issueTicket,
	moveAttendee,
	registerAttendee,
	reviewAttendee,
	setAnnouncement,
	setBoardSlide,
	startTicket,
	type Ticket,
} from "./domain";
import { useEventStore } from "./store";

type Page = "overview" | "attendees" | "teams" | "stage" | "participant";
type Store = ReturnType<typeof useEventStore>;
const nav = [
	{ id: "overview", label: "ダッシュボード", icon: LayoutDashboard },
	{ id: "attendees", label: "参加者・受付", icon: Users },
	{ id: "teams", label: "チーム編成", icon: Sparkles },
	{ id: "stage", label: "LT・ステージ", icon: Radio },
	{ id: "participant", label: "参加者ビュー", icon: TicketIcon },
] as const;
const roleLabels = {
	engineer: "エンジニア",
	designer: "デザイナー",
	planner: "企画・その他",
};
const approvalLabels = {
	pending: "承認待ち",
	approved: "承認済み",
	rejected: "見送り",
};
const ticketLabels = {
	queued: "順番待ち",
	called: "呼び出し中",
	live: "登壇中",
	done: "終了",
	cancelled: "キャンセル",
};
const ticketNumber = (n: number) => `${n}`.padStart(3, "0");
const attendeeName = (state: EventState, id: string) =>
	state.attendees.find((a) => a.id === id)?.name ?? "ゲスト";

function Avatar({ name, index = 0 }: { name: string; index?: number }) {
	return (
		<span className={`avatar color-${index % 5}`} aria-hidden="true">
			{name.slice(0, 1)}
		</span>
	);
}
function Pill({
	children,
	tone = "neutral",
}: {
	children: React.ReactNode;
	tone?: string;
}) {
	return <span className={`pill ${tone}`}>{children}</span>;
}
function usePage() {
	const [page, setPage] = useState<Page>("overview");
	useEffect(() => {
		const read = () => {
			const id = window.location.hash.slice(1);
			setPage(nav.some((item) => item.id === id) ? (id as Page) : "overview");
		};
		read();
		window.addEventListener("hashchange", read);
		return () => window.removeEventListener("hashchange", read);
	}, []);
	return [
		page,
		(id: Page) => {
			window.location.hash = id;
			setPage(id);
		},
	] as const;
}

export function EventApp() {
	const store = useEventStore();
	const { state, act, notice, error, clearError } = store;
	const [page, go] = usePage();
	const [registration, setRegistration] = useState(false);
	const [resetOpen, setResetOpen] = useState(false);
	const [selected, setSelected] = useState("");
	const pending = state.attendees.filter(
		(a) => a.approval === "pending",
	).length;
	return (
		<div className="app-shell">
			<aside className="sidebar">
				<a href="#overview" className="brand" aria-label="EN ホーム">
					<span className="brand-mark">
						en<span>•</span>
					</span>
					<span>
						EVENT SPACE<small>人と、アイデアがつながる。</small>
					</span>
				</a>
				<div className="event-switch">
					<span className="event-mini">E</span>
					<div>
						<strong>BUILD & CONNECT</strong>
						<small>デモイベント / Vol. 01</small>
					</div>
					<ChevronRight size={15} />
				</div>
				<span className="sidebar-label">WORKSPACE</span>
				<nav aria-label="メインナビゲーション">
					{nav.map((item) => (
						<button
							type="button"
							key={item.id}
							onClick={() => go(item.id)}
							className={`nav-item ${page === item.id ? "active" : ""}`}
							aria-current={page === item.id ? "page" : undefined}
						>
							<item.icon size={19} />
							<span>{item.label}</span>
							{item.id === "attendees" && pending > 0 && (
								<span className="nav-count">{pending}</span>
							)}
						</button>
					))}
				</nav>
				<div className="sidebar-bottom">
					<div className="demo-help">
						<span className="mini-icon">
							<CircleHelp size={17} />
						</span>
						<strong>明日の体験を、今日試そう。</strong>
						<p>
							すべて架空データのプロトタイプ。
							<br />
							操作はこのブラウザに保存されます。
						</p>
						<button
							type="button"
							className="text-button"
							onClick={() => setResetOpen(true)}
						>
							<RotateCcw size={13} />
							デモをリセット
						</button>
					</div>
					<div className="operator">
						<Avatar name="運営" />
						<div>
							<strong>運営スタッフ</strong>
							<small>デモモード・認証なし</small>
						</div>
						<Settings2 size={16} />
					</div>
				</div>
			</aside>
			<div className="workspace">
				<header className="topbar">
					<div className="breadcrumb">
						ワークスペース <ChevronRight size={13} />
						<strong>{nav.find((n) => n.id === page)?.label}</strong>
					</div>
					<div className="topbar-right">
						<Pill tone="amber">
							<span className="dot" />
							PROTOTYPE
						</Pill>
						<a
							href="/display"
							target="_blank"
							rel="noreferrer"
							className="button small"
						>
							<Monitor size={15} />
							会場スクリーン
							<ArrowUpRight size={14} />
						</a>
					</div>
				</header>
				<main id="main-content">
					{page === "overview" && (
						<Overview
							store={store}
							go={go}
							onRegister={() => setRegistration(true)}
						/>
					)}
					{page === "attendees" && (
						<Attendees store={store} onRegister={() => setRegistration(true)} />
					)}
					{page === "teams" && <Teams store={store} />}
					{page === "stage" && <Stage store={store} />}
					{page === "participant" && (
						<Participant
							store={store}
							selected={selected}
							setSelected={setSelected}
							onRegister={() => setRegistration(true)}
						/>
					)}
					<footer className="page-footer">
						<span>
							EN EVENT SPACE <span className="footer-dot">·</span>{" "}
							作る時間を、もっと楽しく。
						</span>
						<span>ブラウザ内デモ / 外部API未接続</span>
					</footer>
				</main>
			</div>
			{notice && !error && (
				<output className="toast" key={notice}>
					<Check size={16} />
					{notice}
				</output>
			)}
			{error && (
				<div className="toast error" role="alert">
					{error}
					<button
						type="button"
						aria-label="エラーを閉じる"
						onClick={clearError}
					>
						<X size={16} />
					</button>
				</div>
			)}
			{registration && (
				<RegisterModal
					close={() => setRegistration(false)}
					onSubmit={(input) => {
						const success = act((current) => {
							const next = registerAttendee(current, input);
							setSelected(next.attendees[next.attendees.length - 1].id);
							return next;
						}, "デモ参加者を登録しました。受付QRを確認できます。");
						if (success) {
							setRegistration(false);
							go("participant");
						}
					}}
				/>
			)}
			{resetOpen && (
				<Modal
					title="デモを最初の状態に戻しますか？"
					close={() => setResetOpen(false)}
				>
					<p className="muted">
						このブラウザの登録・承認・チーム・LTの変更を、架空の初期データに戻します。実サービスのデータには影響しません。
					</p>
					<div className="modal-actions">
						<button
							type="button"
							className="button"
							onClick={() => setResetOpen(false)}
						>
							戻る
						</button>
						<button
							type="button"
							className="button primary"
							onClick={() => {
								act(createSeedState, "デモデータをリセットしました");
								setSelected("");
								setResetOpen(false);
							}}
						>
							リセットする
						</button>
					</div>
				</Modal>
			)}
		</div>
	);
}

function PageHeading({
	eyebrow,
	title,
	description,
	children,
}: {
	eyebrow: string;
	title: string;
	description: string;
	children?: React.ReactNode;
}) {
	return (
		<div className="page-heading">
			<div>
				<div className="eyebrow">{eyebrow}</div>
				<h1>{title}</h1>
				<p>{description}</p>
			</div>
			<div className="heading-actions">{children}</div>
		</div>
	);
}
function Overview({
	store,
	go,
	onRegister,
}: {
	store: Store;
	go: (id: Page) => void;
	onRegister: () => void;
}) {
	const { state, act } = store;
	const present = state.attendees.filter((a) => a.checkedIn).length;
	const pending = state.attendees.filter((a) => a.approval === "pending");
	const current = getCurrentTicket(state);
	const queued = getQueuedTickets(state);
	const reactionCount = current
		? Object.values(current.reactions).reduce((a, b) => a + b, 0)
		: 0;
	return (
		<>
			<PageHeading
				eyebrow="EVENT OVERVIEW"
				title="イベントのいまを、見渡そう。"
				description="受付からチームづくり、ステージまで。今日の流れをひとつに。"
			>
				<button type="button" className="button primary" onClick={onRegister}>
					<Plus size={16} />
					参加者を追加
				</button>
			</PageHeading>
			<section className="event-hero">
				<div className="hero-content">
					<div className="hero-label">
						<span className="live-dot" /> DEMO EVENT{" "}
						<span className="hero-separator">/</span> VOL. 01
					</div>
					<h2>
						BUILD &<br />
						<em>CONNECT.</em>
					</h2>
					<p>アイデアを持ち寄って、まだないものを作ろう。</p>
					<div className="hero-meta">
						<span>
							<Clock3 size={14} />
							13:00 – 18:00
						</span>
						<span>
							<Users size={14} />
							コミュニティ・ハッカソン
						</span>
					</div>
				</div>
				<div className="hero-art" aria-hidden="true">
					<div className="orbit orbit-one" />
					<div className="orbit orbit-two" />
					<div className="orbit orbit-three" />
					<div className="orb orb-yellow" />
					<div className="orb orb-mint" />
					<div className="orbit-word">
						HELLO,
						<br />
						POSSIBILITY.
					</div>
					<span className="art-spark">✳</span>
				</div>
				<span className="hero-corner">一日限りの、チームになる。</span>
			</section>
			<div className="stats-grid">
				<Stat
					icon={<Users />}
					label="チェックイン"
					value={present}
					suffix={`/ ${state.attendees.length}`}
					note="参加者の来場状況"
					color="mint"
				/>
				<Stat
					icon={<ShieldCheck />}
					label="承認待ち"
					value={pending.length}
					suffix="名"
					note={
						pending.length
							? "スタッフ確認をお願いします"
							: "全員の確認が完了しました"
					}
					color="yellow"
				/>
				<Stat
					icon={<Sparkles />}
					label="チーム"
					value={state.teams.length}
					suffix="組"
					note="役割と人数をバランスよく"
					color="blue"
				/>
				<Stat
					icon={<TicketIcon />}
					label="LT 順番待ち"
					value={queued.length}
					suffix="人"
					note={
						current
							? `ただいま #${ticketNumber(current.number)} ${ticketLabels[current.status]}`
							: "次のアイデアを待っています"
					}
					color="pink"
				/>
			</div>
			<div className="dashboard-grid">
				<div className="dashboard-main">
					<section className="panel stage-preview">
						<div className="panel-heading">
							<div>
								<span className="eyebrow">LIVE STAGE</span>
								<h2>いま、ステージでは</h2>
							</div>
							<button
								type="button"
								className="text-button"
								onClick={() => go("stage")}
							>
								ステージ管理
								<ArrowRight size={15} />
							</button>
						</div>
						<div className="live-card">
							<div className="live-card-top">
								<Pill tone="mint">
									<span className="dot" />
									{current ? ticketLabels[current.status] : "待機中"}
								</Pill>
								<span className="mono">
									{current ? `${current.duration}:00 / LT` : "READY FOR IDEAS"}
								</span>
							</div>
							<div className="live-title">
								<span className="ticket-large">
									#{current ? ticketNumber(current.number) : "---"}
								</span>
								<h3>{current?.title ?? "次のアイデアは、あなたから。"}</h3>
							</div>
							<div className="live-person">
								<Avatar
									name={
										current ? attendeeName(state, current.attendeeId) : "EN"
									}
									index={2}
								/>
								<div>
									<strong>
										{current
											? attendeeName(state, current.attendeeId)
											: "登壇をお待ちしています"}
									</strong>
									<small>
										{current
											? "LIGHTNING TALK"
											: "LTチケットを発券してください"}
									</small>
								</div>
								<div className="reaction-summary">
									👏 🔥 💚 <strong>{reactionCount}</strong>
								</div>
							</div>
						</div>
						<div className="next-up">
							<span className="eyebrow">UP NEXT</span>
							{queued.slice(0, 2).map((t) => (
								<div key={t.id} className="next-item">
									<span className="queue-num">#{ticketNumber(t.number)}</span>
									<span>
										{t.title}
										<small>{attendeeName(state, t.attendeeId)}</small>
									</span>
									<span className="muted">{t.duration}分</span>
								</div>
							))}
							{!queued.length && (
								<p className="muted">待機中のチケットはありません。</p>
							)}
						</div>
					</section>
					<section className="panel flow-panel">
						<div className="panel-heading">
							<h2>今日の体験を、つなぐ</h2>
							<Pill>DEMO FLOW</Pill>
						</div>
						<div className="flow-grid">
							{[
								{
									icon: QrCode,
									label: "受付・チェックイン",
									text: "参加者のQRで、スムーズに。",
									page: "attendees",
								},
								{
									icon: Sparkles,
									label: "チームで出会う",
									text: "ちがう得意を、ひとつに。",
									page: "teams",
								},
								{
									icon: TicketIcon,
									label: "アイデアを話す",
									text: "チケットを取って、ステージへ。",
									page: "participant",
								},
							].map((step, i) => (
								<button
									type="button"
									className="flow-step"
									key={step.page}
									onClick={() => go(step.page as Page)}
								>
									<span className="step-num">0{i + 1}</span>
									<step.icon size={23} />
									<strong>{step.label}</strong>
									<small>{step.text}</small>
									<ArrowUpRight size={16} />
								</button>
							))}
						</div>
					</section>
				</div>
				<aside className="dashboard-rail">
					<section className="panel">
						<div className="panel-heading">
							<h2>確認を待っています</h2>
							<span className="count-badge">{pending.length}</span>
						</div>
						<div className="pending-list">
							{pending.slice(0, 3).map((a, i) => (
								<div key={a.id} className="pending-person">
									<Avatar name={a.name} index={i} />
									<div>
										<strong>{a.name}</strong>
										<small>
											{a.eligibility === "adult"
												? "参加承認"
												: "自己申告内容の確認"}
										</small>
									</div>
									<span className="tiny-dot" />
								</div>
							))}
							{!pending.length && (
								<p className="muted">確認待ちはありません。</p>
							)}
						</div>
						<button
							type="button"
							className="button full"
							onClick={() => go("attendees")}
						>
							参加者を確認
							<ArrowRight size={14} />
						</button>
					</section>
					<section className="panel announce-panel">
						<div className="panel-heading">
							<h2>
								<Megaphone size={17} />
								会場へのお知らせ
							</h2>
						</div>
						<p>
							{state.event.announcement || "みんなに伝えたいことはありますか？"}
						</p>
						<button
							type="button"
							className="button full"
							onClick={() =>
								act(
									(s) =>
										setAnnouncement(
											s,
											"🍕 ピザが到着しました！交流スペースへどうぞ。",
										),
									"会場スクリーンにピザ到着を表示しました",
								)
							}
						>
							<Coffee size={16} />
							ピザの到着を知らせる
						</button>
						<small>このブラウザの会場スクリーンに反映</small>
					</section>
					<section className="integration-note">
						<span className="mini-icon">
							<Sparkles size={17} />
						</span>
						<div>
							<strong>つぎの一歩も、ここから。</strong>
							<p>
								Decisions API と GPT-LIVE
								は接続前のモック。明日の実装ポイントを、画面で確かめられます。
							</p>
						</div>
					</section>
				</aside>
			</div>
		</>
	);
}
function Stat({
	icon,
	label,
	value,
	suffix,
	note,
	color,
}: {
	icon: React.ReactNode;
	label: string;
	value: number;
	suffix: string;
	note: string;
	color: string;
}) {
	return (
		<section className="stat-card">
			<span className={`stat-icon ${color}`}>{icon}</span>
			<div className="stat-label">{label}</div>
			<div className="stat-value">
				{value}
				<span>{suffix}</span>
			</div>
			<p>{note}</p>
		</section>
	);
}

function Attendees({
	store,
	onRegister,
}: {
	store: Store;
	onRegister: () => void;
}) {
	const { state, act } = store;
	const [query, setQuery] = useState("");
	const [filter, setFilter] = useState("all");
	const [token, setToken] = useState("");
	const [reviewed, setReviewed] = useState<Record<string, boolean>>({});
	const attendees = state.attendees.filter(
		(a) =>
			a.name.includes(query) &&
			(filter === "all" ||
				(filter === "pending" ? a.approval === "pending" : !a.checkedIn)),
	);
	return (
		<>
			<PageHeading
				eyebrow="PEOPLE & CHECK-IN"
				title="ようこそ、今日の仲間たち。"
				description="登録・受付・スタッフ確認をまとめて。表示される人物はすべて架空です。"
			>
				<button type="button" className="button primary" onClick={onRegister}>
					<Plus size={16} />
					参加者を追加
				</button>
			</PageHeading>
			<section className="checkin-banner">
				<span className="checkin-icon">
					<QrCode size={28} />
				</span>
				<div>
					<h2>受付チェックイン</h2>
					<p>デモQRの文字列を入力してください。カメラスキャンは未実装です。</p>
				</div>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						if (act((s) => checkIn(s, token), "チェックインが完了しました"))
							setToken("");
					}}
				>
					<label className="sr-only" htmlFor="checkin-token">
						チェックイントークン
					</label>
					<input
						id="checkin-token"
						value={token}
						onChange={(e) => setToken(e.target.value)}
						placeholder="DEMO-..."
						required
					/>
					<button type="submit" className="button primary">
						受付する
						<ArrowRight size={15} />
					</button>
				</form>
			</section>
			<section className="panel">
				<div className="list-toolbar">
					<div className="tab-group">
						{[
							{ value: "all", label: "すべて" },
							{ value: "pending", label: "承認待ち" },
							{ value: "not-arrived", label: "未受付" },
						].map((f) => (
							<button
								type="button"
								key={f.value}
								className={filter === f.value ? "selected" : ""}
								onClick={() => setFilter(f.value)}
							>
								{f.label}
							</button>
						))}
					</div>
					<label className="search-field">
						<Search size={16} />
						<input
							aria-label="参加者を検索"
							placeholder="名前で検索"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
						/>
					</label>
				</div>
				<div className="attendee-table">
					<div className="attendee-row table-head">
						<span>参加者 / 希望する役割</span>
						<span>受付状況</span>
						<span>参加承認</span>
						<span>スタッフ操作</span>
					</div>
					{attendees.map((a, i) => (
						<div key={a.id} className="attendee-row">
							<div className="person-cell">
								<Avatar name={a.name} index={i} />
								<div>
									<strong>{a.name}</strong>
									<small>{roleLabels[a.rolePreference]}</small>
									<span className="token-hint">{a.checkInToken}</span>
								</div>
							</div>
							<div>
								<Pill tone={a.checkedIn ? "mint" : "neutral"}>
									{a.checkedIn ? "受付済み" : "未受付"}
								</Pill>
							</div>
							<div>
								<Pill
									tone={
										a.approval === "approved"
											? "mint"
											: a.approval === "pending"
												? "amber"
												: "neutral"
									}
								>
									{approvalLabels[a.approval]}
								</Pill>
								<small className="eligibility-label">
									{a.eligibility === "adult"
										? "成人と自己申告（デモ）"
										: a.eligibility === "minor"
											? "未成年と自己申告（デモ）"
											: "年齢区分は未回答（デモ）"}
								</small>
							</div>
							<div className="row-actions">
								{!a.checkedIn && (
									<button
										type="button"
										className="button small"
										onClick={() =>
											act(
												(s) => checkIn(s, a.checkInToken),
												`${a.name} さんを受付しました`,
											)
										}
									>
										受付
									</button>
								)}
								{a.approval === "pending" && (
									<>
										{a.eligibility !== "adult" && (
											<label className="review-check">
												<input
													type="checkbox"
													checked={!!reviewed[a.id]}
													onChange={(e) =>
														setReviewed({
															...reviewed,
															[a.id]: e.target.checked,
														})
													}
												/>
												自己申告を確認（デモ）
											</label>
										)}
										<div className="inline-actions">
											<button
												type="button"
												className="button small primary"
												disabled={a.eligibility !== "adult" && !reviewed[a.id]}
												onClick={() =>
													act(
														(s) =>
															reviewAttendee(s, a.id, "approved", {
																eligibilityReviewed: !!reviewed[a.id],
															}),
														`${a.name} さんを承認しました`,
													)
												}
											>
												<Check size={13} />
												承認
											</button>
											<button
												type="button"
												className="button small"
												onClick={() =>
													act(
														(s) => reviewAttendee(s, a.id, "rejected"),
														`${a.name} さんを見送りにしました`,
													)
												}
											>
												見送り
											</button>
										</div>
									</>
								)}
								{a.checkedIn && a.approval !== "pending" && (
									<span className="muted small-text">確認済み</span>
								)}
							</div>
						</div>
					))}
					{!attendees.length && (
						<div className="empty-state">
							<Search />
							<h3>該当する参加者がいません</h3>
							<p>検索条件を変えてみてください。</p>
							<button
								type="button"
								className="button"
								onClick={() => {
									setQuery("");
									setFilter("all");
								}}
							>
								条件をクリア
							</button>
						</div>
					)}
				</div>
			</section>
			<div className="info-strip">
				<ShieldCheck size={18} />
				<p>
					年齢は架空の自己申告を使った確認フローです。AIによる推定、本人確認、保護者同意の取得は行いません。実運用のポリシーは別途設計が必要です。
				</p>
			</div>
			<section className="panel compact">
				<div className="panel-heading">
					<h2>ユーザー管理 / Decisions API</h2>
					<Pill tone="amber">
						{decisionsAdapter.mode.toUpperCase()} · {decisionsAdapter.status}
					</Pill>
				</div>
				<p className="muted">{decisionsAdapter.description}</p>
			</section>
		</>
	);
}

function Teams({ store }: { store: Store }) {
	const { state, act } = store;
	const [count, setCount] = useState(3);
	const eligible = state.attendees.filter(
		(a) => a.checkedIn && a.approval === "approved",
	);
	return (
		<>
			<PageHeading
				eyebrow="MAKE A TEAM"
				title="ちがう得意を、ひとつに。"
				description="受付・承認済みの参加者を、人数と希望する役割でバランスよく編成します。"
			/>
			<section className="team-generator">
				<div className="generator-icon">
					<Sparkles size={28} />
				</div>
				<div>
					<h2>いいチームの、最初の一歩。</h2>
					<p>
						編成対象 <strong>{eligible.length} 名</strong> /
						年齢などの属性は編成に使いません。
					</p>
				</div>
				<label>
					チーム数
					<select
						value={count}
						onChange={(e) => setCount(Number(e.target.value))}
					>
						{[2, 3, 4, 5, 6].map((n) => (
							<option key={n} value={n}>
								{n} チーム
							</option>
						))}
					</select>
				</label>
				<button
					type="button"
					className="button primary"
					onClick={() =>
						act((s) => assignTeams(s, count), `${count} チームに編成しました`)
					}
				>
					<Sparkles size={16} />
					{state.teams.length ? "チームを再編成" : "チームを作成"}
				</button>
			</section>
			<div className="info-strip">
				<CircleHelp size={18} />
				<p>
					人数の少ないチームを優先し、同じ人数なら同じ希望役割が少ないチームへ割り当てます。同条件では固定順です。再編成すると手動調整は上書きされます。
				</p>
			</div>
			<div className="team-grid">
				{state.teams.map((team, index) => {
					const members = eligible.filter((a) => a.teamId === team.id);
					return (
						<section
							key={team.id}
							className={`panel team-card team-color-${index % 4}`}
						>
							<div className="team-card-top">
								<span className="team-symbol">
									{String.fromCharCode(65 + index)}
								</span>
								<div>
									<span className="eyebrow">
										TEAM {`${index + 1}`.padStart(2, "0")}
									</span>
									<h2>{team.name}</h2>
								</div>
								<Pill>{members.length} 人</Pill>
							</div>
							<div className="role-summary">
								{Object.entries(roleLabels).map(([role, label]) => (
									<span key={role}>
										{label}
										<strong>
											{members.filter((a) => a.rolePreference === role).length}
										</strong>
									</span>
								))}
							</div>
							<div className="team-members">
								{members.map((a, i) => (
									<div className="team-member" key={a.id}>
										<Avatar name={a.name} index={i} />
										<div>
											<strong>{a.name}</strong>
											<small>{roleLabels[a.rolePreference]}</small>
										</div>
										<label>
											<span className="sr-only">{a.name} のチームを変更</span>
											<select
												aria-label={`${a.name} のチームを変更`}
												value={a.teamId ?? ""}
												onChange={(e) =>
													act(
														(s) =>
															moveAttendee(s, a.id, e.target.value || null),
														"チームを手動調整しました",
													)
												}
											>
												<option value="">未割当</option>
												{state.teams.map((t) => (
													<option key={t.id} value={t.id}>
														{t.name}
													</option>
												))}
											</select>
										</label>
									</div>
								))}
							</div>
							{!members.length && (
								<p className="muted">メンバーはまだいません。</p>
							)}
						</section>
					);
				})}
			</div>
			{!state.teams.length && (
				<section className="panel empty-state">
					<Sparkles size={35} />
					<h3>最初のチームを作りましょう</h3>
					<p>自動編成したあと、一人ずつ調整できます。</p>
				</section>
			)}
			{eligible.some((a) => !a.teamId) && (
				<section className="panel">
					<div className="panel-heading">
						<h2>未割当のメンバー</h2>
						<Pill>{eligible.filter((a) => !a.teamId).length} 人</Pill>
					</div>
					<div className="unassigned-list">
						{eligible
							.filter((a) => !a.teamId)
							.map((a) => (
								<div key={a.id}>
									<strong>{a.name}</strong>
									<span className="muted">{roleLabels[a.rolePreference]}</span>
									<label>
										<span className="sr-only">{a.name} のチームを変更</span>
										<select
											aria-label={`${a.name} のチームを変更`}
											value=""
											onChange={(e) =>
												act(
													(s) => moveAttendee(s, a.id, e.target.value),
													"チームに追加しました",
												)
											}
										>
											<option value="">チームを選択</option>
											{state.teams.map((t) => (
												<option key={t.id} value={t.id}>
													{t.name}
												</option>
											))}
										</select>
									</label>
								</div>
							))}
					</div>
				</section>
			)}
		</>
	);
}

function Stage({ store }: { store: Store }) {
	const { state, act } = store;
	const current = getCurrentTicket(state);
	const queued = getQueuedTickets(state);
	const [announcement, setAnnouncementDraft] = useState(
		state.event.announcement,
	);
	const context = getMockLiveContext(current?.title ?? "次のLT");
	return (
		<>
			<PageHeading
				eyebrow="LIGHTNING TALKS"
				title="そのアイデアに、出番を。"
				description="チケットを取って、順番が来たらステージへ。回転寿司のように気軽なLTを。"
			>
				<a
					href="/display"
					target="_blank"
					rel="noreferrer"
					className="button primary"
				>
					<Monitor size={16} />
					会場スクリーンを開く
					<ExternalLink size={14} />
				</a>
			</PageHeading>
			<div className="stage-grid">
				<div>
					<section className="panel">
						<div className="panel-heading">
							<div>
								<span className="eyebrow">ON STAGE</span>
								<h2>ステージコントロール</h2>
							</div>
							{current && (
								<Pill tone="mint">
									<span className="dot" />
									{ticketLabels[current.status]}
								</Pill>
							)}
						</div>
						{current ? (
							<>
								<div className="current-talk">
									<span className="ticket-large">
										#{ticketNumber(current.number)}
									</span>
									<h2>{current.title}</h2>
									<div className="live-person">
										<Avatar
											name={attendeeName(state, current.attendeeId)}
											index={3}
										/>
										<strong>{attendeeName(state, current.attendeeId)}</strong>
										<span className="duration">
											<Clock3 size={14} />
											持ち時間 {current.duration} 分
										</span>
									</div>
								</div>
								<div className="stage-actions">
									{current.status === "called" ? (
										<button
											type="button"
											className="button primary"
											onClick={() =>
												act(
													(s) => startTicket(s, current.id),
													"LTを開始しました",
												)
											}
										>
											<Play size={15} />
											登壇を開始
										</button>
									) : (
										<button
											type="button"
											className="button primary"
											onClick={() =>
												act(
													(s) => finishTicket(s, current.id),
													"LTを終了しました。次の方を呼び出せます。",
												)
											}
										>
											<Check size={15} />
											LTを終了する
										</button>
									)}
									{current.status === "called" && (
										<button
											type="button"
											className="button"
											onClick={() =>
												act(
													(s) => cancelTicket(s, current.id),
													"呼び出しを取り消しました",
												)
											}
										>
											キャンセル
										</button>
									)}
									<span className="muted">次の呼び出しは終了後に</span>
								</div>
								<Reactions state={state} ticket={current} act={act} />
							</>
						) : (
							<div className="empty-state">
								<Radio size={32} />
								<h3>次のアイデアを迎えましょう</h3>
								<p>
									{queued.length
										? `${queued.length}人がステージを待っています。`
										: "順番待ちのチケットはありません。"}
								</p>
								<button
									type="button"
									className="button primary"
									disabled={!queued.length}
									onClick={() =>
										act(callNextTicket, "次の登壇者を呼び出しました")
									}
								>
									<Megaphone size={16} />
									次の人を呼び出す
								</button>
							</div>
						)}
					</section>
					<section className="panel queue-panel">
						<div className="panel-heading">
							<div>
								<span className="eyebrow">SUSHI-STYLE QUEUE</span>
								<h2>アイデアが、めぐってくる。</h2>
							</div>
							<Pill>{queued.length} 人待ち</Pill>
						</div>
						<div className="ticket-belt">
							{queued.map((t, i) => (
								<div className="queue-ticket" key={t.id}>
									<div>
										<span className="eyebrow">
											{i === 0 ? "NEXT UP" : `WAITING ${i + 1}`}
										</span>
										<span>{t.duration}分</span>
									</div>
									<strong className="queue-ticket-number">
										#{ticketNumber(t.number)}
									</strong>
									<h3>{t.title}</h3>
									<p>{attendeeName(state, t.attendeeId)}</p>
									<button
										type="button"
										className="text-button muted"
										onClick={() =>
											act(
												(s) => cancelTicket(s, t.id),
												"チケットをキャンセルしました",
											)
										}
									>
										キャンセル
									</button>
								</div>
							))}
							{!queued.length && (
								<div className="queue-empty">
									新しいアイデアを待っています。参加者ビューで発券できます。
								</div>
							)}
						</div>
						<div className="queue-foot">
							<span>発券順でご案内します。</span>
							<button
								type="button"
								className="button small"
								disabled={!!current || !queued.length}
								onClick={() =>
									act(callNextTicket, "次の登壇者を呼び出しました")
								}
							>
								<Megaphone size={14} />
								次の人を呼び出す
							</button>
						</div>
					</section>
					<ScreenShare />
					<section className="panel">
						<div className="panel-heading">
							<h2>完了したLT</h2>
							<Pill>
								{state.tickets.filter((t) => t.status === "done").length} 件
							</Pill>
						</div>
						{state.tickets
							.filter((t) => t.status === "done")
							.map((t) => (
								<div className="history-row" key={t.id}>
									<span className="queue-num">#{ticketNumber(t.number)}</span>
									<strong>{t.title}</strong>
									<span>{attendeeName(state, t.attendeeId)}</span>
									<Check size={16} />
								</div>
							))}
						{!state.tickets.some((t) => t.status === "done") && (
							<p className="muted">終了したLTがここに並びます。</p>
						)}
					</section>
				</div>
				<aside>
					<section className="panel">
						<div className="panel-heading">
							<h2>
								<Monitor size={17} />
								スクリーンの表示
							</h2>
						</div>
						<label className="field-label" htmlFor="board-slide">
							投影テンプレート
						</label>
						<select
							id="board-slide"
							value={state.board.slide}
							onChange={(e) =>
								act(
									(s) =>
										setBoardSlide(
											s,
											e.target.value as EventState["board"]["slide"],
										),
									"会場スクリーンの表示を変更しました",
								)
							}
						>
							<option value="lt">LTステージ</option>
							<option value="overview">イベント・受付状況</option>
							<option value="teams">チーム紹介</option>
							<option value="announcement">お知らせ</option>
						</select>
						<p className="small-text muted">
							同じブラウザの別タブへ同期。複数端末への配信・スライドファイル作成は未実装です。
						</p>
						<a
							href="/display"
							target="_blank"
							rel="noreferrer"
							className="button full"
						>
							<ExternalLink size={14} />
							投影ウィンドウを開く
						</a>
					</section>
					<section className="panel">
						<div className="panel-heading">
							<h2>
								<Megaphone size={17} />
								会場のお知らせ
							</h2>
						</div>
						<form
							onSubmit={(e) => {
								e.preventDefault();
								act(
									(s) => setAnnouncement(s, announcement),
									"お知らせを更新しました",
								);
							}}
						>
							<label className="field-label" htmlFor="announcement">
								スクリーンに表示するメッセージ
							</label>
							<textarea
								id="announcement"
								maxLength={180}
								rows={4}
								value={announcement}
								onChange={(e) => setAnnouncementDraft(e.target.value)}
								placeholder="ピザが到着しました！"
							/>
							<button type="submit" className="button primary full">
								お知らせを反映
							</button>
						</form>
						<button
							type="button"
							className="text-button"
							onClick={() => {
								setAnnouncementDraft("");
								act((s) => setAnnouncement(s, ""), "お知らせを取り下げました");
							}}
						>
							お知らせをクリア
						</button>
					</section>
					<section className="panel ai-panel">
						<div className="panel-heading">
							<h2>
								<Sparkles size={18} />
								発表の、もう一歩先へ。
							</h2>
						</div>
						<Pill tone="amber">{context.label}</Pill>
						<p>{context.summary}</p>
						<div className="term-list">
							{context.terms.map((t) => (
								<div key={t.term}>
									<strong>{t.term}</strong>
									<p>{t.explanation}</p>
								</div>
							))}
						</div>
						<small>
							発表内容を解析した結果ではありません。API仕様とデータ送信範囲は未確定です。
						</small>
					</section>
				</aside>
			</div>
		</>
	);
}

function ScreenShare() {
	const [stream, setStream] = useState<MediaStream | null>(null);
	const [message, setMessage] = useState("");
	const [busy, setBusy] = useState(false);
	const video = useRef<HTMLVideoElement>(null);
	const active = useRef<MediaStream | null>(null);
	const mounted = useRef(false);
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
			active.current?.getTracks().forEach((t) => {
				t.stop();
			});
		};
	}, []);
	useEffect(() => {
		if (video.current) video.current.srcObject = stream;
	}, [stream]);
	const stop = () => {
		active.current?.getTracks().forEach((t) => {
			t.stop();
		});
		active.current = null;
		setStream(null);
		setMessage("画面共有を停止しました。");
	};
	async function start() {
		if (!navigator.mediaDevices?.getDisplayMedia) {
			setMessage(
				"このブラウザでは画面共有を利用できません。対応するデスクトップブラウザの localhost または HTTPS で開いてください。",
			);
			return;
		}
		setBusy(true);
		try {
			const media = await navigator.mediaDevices.getDisplayMedia({
				video: true,
				audio: false,
			});
			if (!mounted.current) {
				media.getTracks().forEach((track) => {
					track.stop();
				});
				return;
			}
			active.current = media;
			setStream(media);
			setMessage(
				"この画面内だけのプレビューです。別端末・会場スクリーンへは配信されません。",
			);
			media.getVideoTracks()[0].addEventListener(
				"ended",
				() => {
					active.current = null;
					setStream(null);
					setMessage("画面共有が終了しました。");
				},
				{ once: true },
			);
		} catch (cause) {
			setMessage(
				cause instanceof DOMException && cause.name === "NotAllowedError"
					? "画面共有はキャンセルされたか、許可されませんでした。"
					: "画面共有を開始できませんでした。ブラウザの対応・権限を確認してください。",
			);
		} finally {
			setBusy(false);
		}
	}
	return (
		<section className="panel share-panel">
			<div className="panel-heading">
				<div>
					<span className="eyebrow">SCREEN SHARE</span>
					<h2>見せたいものを、見せよう。</h2>
				</div>
				<Pill>ローカルプレビュー</Pill>
			</div>
			<p className="muted">
				ボタンを押すと、ブラウザが共有する画面を確認します。録画・アップロードはしません。
			</p>
			{stream ? (
				<video
					ref={video}
					autoPlay
					muted
					playsInline
					className="share-video"
					aria-label="共有画面のローカルプレビュー"
				/>
			) : (
				<div className="share-placeholder">
					<Monitor size={35} />
					<span>スライドやデモを、この画面内でプレビュー</span>
				</div>
			)}
			<button
				type="button"
				className="button"
				disabled={busy}
				onClick={stream ? stop : start}
			>
				{stream ? <Pause size={15} /> : <Video size={15} />}{" "}
				{stream ? "共有を停止" : busy ? "画面を選択中…" : "画面共有を試す"}
			</button>
			<output className="small-text muted share-status">
				{message || "WebRTC / 受信側 / 別端末配信は未接続です。"}
			</output>
		</section>
	);
}
function Reactions({
	state: _state,
	ticket,
	act,
}: {
	state: EventState;
	ticket: Ticket;
	act: Store["act"];
}) {
	return (
		<div className="reaction-bar">
			<span>気持ちを届けよう</span>
			<div>
				{(
					[
						{ kind: "clap", emoji: "👏", label: "拍手" },
						{ kind: "fire", emoji: "🔥", label: "熱い" },
						{ kind: "heart", emoji: "💚", label: "いいね" },
					] as const
				).map((r) => (
					<button
						type="button"
						aria-label={`${r.label}を送る`}
						key={r.kind}
						disabled={ticket.status !== "live"}
						onClick={() =>
							act(
								(s) => addReaction(s, ticket.id, r.kind),
								`${r.emoji} リアクションを反映しました`,
							)
						}
					>
						{r.emoji}
						<strong>{ticket.reactions[r.kind]}</strong>
					</button>
				))}
			</div>
			<small>ブラウザ内デモ</small>
		</div>
	);
}

function Participant({
	store,
	selected,
	setSelected,
	onRegister,
}: {
	store: Store;
	selected: string;
	setSelected: (id: string) => void;
	onRegister: () => void;
}) {
	const { state, act } = store;
	const attendee =
		state.attendees.find((a) => a.id === selected) ?? state.attendees[0];
	const [title, setTitle] = useState("");
	const [duration, setDuration] = useState<3 | 5 | 10>(5);
	const mine = state.tickets.find(
		(t) =>
			t.attendeeId === attendee.id &&
			["queued", "called", "live"].includes(t.status),
	);
	const current = getCurrentTicket(state);
	const team = state.teams.find((t) => t.id === attendee.teamId);
	const canIssue =
		attendee.checkedIn && attendee.approval === "approved" && !mine;
	const ahead = mine
		? state.tickets.filter(
				(t) => t.status === "queued" && t.number < mine.number,
			).length + (current && current.id !== mine.id ? 1 : 0)
		: 0;
	return (
		<>
			<PageHeading
				eyebrow="YOUR EVENT PASS"
				title="今日は、何をつくろう？"
				description="参加者として受付からLT登壇までを試せます。実際の個人情報は入力しないでください。"
			>
				<button type="button" className="button" onClick={onRegister}>
					<Plus size={16} />
					デモ参加者を登録
				</button>
			</PageHeading>
			<div className="participant-switch">
				<Pill tone="amber">参加者の切り替え / デモ専用</Pill>
				<label htmlFor="participant-select">体験する参加者</label>
				<select
					id="participant-select"
					value={attendee.id}
					onChange={(e) => setSelected(e.target.value)}
				>
					{state.attendees.map((a) => (
						<option key={a.id} value={a.id}>
							{a.name}
						</option>
					))}
				</select>
			</div>
			<div className="participant-grid">
				<div>
					<section className="event-pass">
						<div className="pass-top">
							<span className="brand-mark">
								en<span>•</span>
							</span>
							<span className="eyebrow">EVENT PASS / DEMO</span>
						</div>
						<h2>BUILD & CONNECT.</h2>
						<div className="pass-name">
							<Avatar name={attendee.name} index={2} />
							<div>
								<h3>{attendee.name}</h3>
								<span>{roleLabels[attendee.rolePreference]}</span>
							</div>
						</div>
						<div className="qr-wrap">
							<QRCodeSVG
								value={attendee.checkInToken}
								size={156}
								level="M"
								title={`${attendee.name} のデモ受付QR`}
							/>
							<span>受付でこのQRを提示</span>
							<strong className="mono">{attendee.checkInToken}</strong>
						</div>
						<div className="pass-footer">
							<Pill tone={attendee.checkedIn ? "mint" : "neutral"}>
								{attendee.checkedIn ? "チェックイン済み" : "受付前"}
							</Pill>
							<span>DEMO ONLY</span>
						</div>
					</section>
					<p className="small-text muted">
						QRには上記のデモトークンだけが入っています。カメラ受付の代わりに「参加者・受付」で文字列を入力できます。
					</p>
					<section className="panel progress-panel">
						<h2>今日のステップ</h2>
						{[
							{
								done: true,
								label: "参加者登録",
								detail: "あなたのパスを発行しました",
							},
							{
								done: attendee.checkedIn,
								label: "会場チェックイン",
								detail: "受付でQRまたはトークンを提示",
							},
							{
								done: attendee.approval === "approved",
								label: "スタッフの承認",
								detail: approvalLabels[attendee.approval],
							},
							{
								done: !!team,
								label: "チームに合流",
								detail: team?.name ?? "編成をお待ちください",
							},
						].map((step, i) => (
							<div
								className={`progress-step ${step.done ? "complete" : ""}`}
								key={step.label}
							>
								<span>{step.done ? <Check size={13} /> : i + 1}</span>
								<div>
									<strong>{step.label}</strong>
									<small>{step.detail}</small>
								</div>
							</div>
						))}
					</section>
				</div>
				<div>
					<section className="panel ticket-issuer">
						<div className="panel-heading">
							<div>
								<span className="eyebrow">TAKE YOUR TURN</span>
								<h2>5分の話が、次の出会いに。</h2>
							</div>
							<TicketIcon size={24} />
						</div>
						<p className="muted">
							まだ完成していなくても大丈夫。作っているもの、ひらめき、困りごとを持ち寄ろう。
						</p>
						{mine ? (
							<div className="my-ticket">
								<div>
									<span className="eyebrow">YOUR LT TICKET</span>
									<Pill tone={mine.status === "queued" ? "amber" : "mint"}>
										{ticketLabels[mine.status]}
									</Pill>
								</div>
								<strong>#{ticketNumber(mine.number)}</strong>
								<h3>{mine.title}</h3>
								<p>
									{mine.status === "queued"
										? `あなたの前に ${ahead} 人。順番が来るまでお待ちください。`
										: mine.status === "called"
											? "あなたの出番です。ステージへどうぞ！"
											: "ただいま登壇中。アイデアを届けましょう！"}
								</p>
								{mine.status !== "live" && (
									<button
										type="button"
										className="text-button"
										onClick={() =>
											act(
												(s) => cancelTicket(s, mine.id),
												"あなたのチケットをキャンセルしました",
											)
										}
									>
										チケットをキャンセル
									</button>
								)}
							</div>
						) : (
							<form
								onSubmit={(e) => {
									e.preventDefault();
									if (
										act(
											(s) =>
												issueTicket(s, {
													attendeeId: attendee.id,
													title,
													duration,
												}),
											"LTチケットを発券しました",
										)
									)
										setTitle("");
								}}
							>
								<label className="field-label" htmlFor="lt-title">
									話したいこと
								</label>
								<input
									id="lt-title"
									maxLength={80}
									value={title}
									onChange={(e) => setTitle(e.target.value)}
									placeholder="例：週末につくった小さなアプリの話"
									required
								/>
								<label className="field-label" htmlFor="lt-duration">
									持ち時間
								</label>
								<select
									id="lt-duration"
									value={duration}
									onChange={(e) =>
										setDuration(Number(e.target.value) as 3 | 5 | 10)
									}
								>
									<option value={3}>3分 / ちょっと話す</option>
									<option value={5}>5分 / いつものLT</option>
									<option value={10}>10分 / じっくりデモ</option>
								</select>
								<button
									type="submit"
									className="button primary full"
									disabled={!canIssue}
								>
									<TicketIcon size={16} />
									LTチケットを取る
									<ArrowRight size={15} />
								</button>
								{!canIssue && (
									<p className="small-text warning">
										発券にはチェックインとスタッフ承認が必要です。「参加者・受付」で操作できます。
									</p>
								)}
							</form>
						)}
					</section>
					{current && (
						<section className="panel">
							<div className="panel-heading">
								<h2>いまのLTに、リアクション</h2>
								<Pill tone="mint">{ticketLabels[current.status]}</Pill>
							</div>
							<h3>{current.title}</h3>
							<p className="muted">{attendeeName(state, current.attendeeId)}</p>
							<Reactions state={state} ticket={current} act={act} />
						</section>
					)}
					{state.event.announcement && (
						<section className="participant-announcement">
							<Megaphone size={23} />
							<div>
								<span className="eyebrow">FROM THE ORGANIZERS</span>
								<p>{state.event.announcement}</p>
							</div>
						</section>
					)}
					<section className="integration-note">
						<ShieldCheck size={20} />
						<p>
							この画面は認証・権限制御のないデモです。参加者の切り替え、スタッフ操作、データ保存は同一ブラウザ内だけで利用します。
						</p>
					</section>
				</div>
			</div>
		</>
	);
}

function Modal({
	title,
	close,
	children,
}: {
	title: string;
	close: () => void;
	children: React.ReactNode;
}) {
	const ref = useRef<HTMLDialogElement>(null);
	useEffect(() => {
		ref.current?.showModal();
	}, []);
	return (
		<dialog ref={ref} className="modal" onCancel={close} onClose={close}>
			<div className="modal-heading">
				<h2>{title}</h2>
				<button
					type="button"
					className="icon-button"
					aria-label="閉じる"
					onClick={close}
				>
					<X size={20} />
				</button>
			</div>
			{children}
		</dialog>
	);
}
function RegisterModal({
	close,
	onSubmit,
}: {
	close: () => void;
	onSubmit: (input: {
		name: string;
		rolePreference: Attendee["rolePreference"];
		eligibility: Attendee["eligibility"];
	}) => void;
}) {
	const [name, setName] = useState("");
	const [role, setRole] = useState<Attendee["rolePreference"]>("engineer");
	const [eligibility, setEligibility] =
		useState<Attendee["eligibility"]>("undisclosed");
	const submit = (e: FormEvent) => {
		e.preventDefault();
		onSubmit({ name, rolePreference: role, eligibility });
	};
	return (
		<Modal title="デモ参加者を登録" close={close}>
			<p className="muted">
				架空のニックネームで体験してください。メールアドレスや生年月日は収集しません。
			</p>
			<form onSubmit={submit}>
				<label className="field-label" htmlFor="register-name">
					架空のニックネーム
				</label>
				<input
					id="register-name"
					autoComplete="off"
					value={name}
					onChange={(e) => setName(e.target.value)}
					maxLength={40}
					placeholder="例：デモのはるさん"
					required
				/>
				<label className="field-label" htmlFor="register-role">
					希望する役割
				</label>
				<select
					id="register-role"
					value={role}
					onChange={(e) =>
						setRole(e.target.value as Attendee["rolePreference"])
					}
				>
					{Object.entries(roleLabels).map(([value, label]) => (
						<option key={value} value={value}>
							{label}
						</option>
					))}
				</select>
				<label className="field-label" htmlFor="register-eligibility">
					年齢区分の自己申告（デモ設定）
				</label>
				<select
					id="register-eligibility"
					value={eligibility}
					onChange={(e) =>
						setEligibility(e.target.value as Attendee["eligibility"])
					}
				>
					<option value="undisclosed">未回答として試す</option>
					<option value="adult">成人として試す</option>
					<option value="minor">未成年として試す</option>
				</select>
				<p className="small-text muted">
					未成年・未回答の設定では、スタッフの明示的な確認が必要になります。実際の年齢確認ではありません。
				</p>
				<div className="modal-actions">
					<button type="button" className="button" onClick={close}>
						キャンセル
					</button>
					<button type="submit" className="button primary">
						<Plus size={15} />
						登録してパスを発行
					</button>
				</div>
			</form>
		</Modal>
	);
}
