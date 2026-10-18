import {
	ArrowRight,
	ChevronRight,
	Info,
	Laptop,
	MapPin,
	Presentation,
	Users,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useRef, useState } from "react";
import {
	elapsedSeconds,
	formatTime,
	type LiveSnapshot,
	liveSnapshotSchema,
} from "../lib/lt";
import { type Participation, participationApi } from "../lib/participation";
import type { Guide as VenueGuide } from "../lib/venue";
import { SpeakerAvatar } from "./speaker-avatar";
import { WifiCard } from "./venue";
import { WorkspaceShell } from "./workspace";

export function Dashboard() {
	const [live, setLive] = useState<LiveSnapshot | null>(null);
	const [session, setSession] = useState<Participation | null>(null);
	const [guides, setGuides] = useState<VenueGuide[]>([]);
	const [error, setError] = useState("");
	const [tick, setTick] = useState(0);
	const [origin, setOrigin] = useState("");
	const clock = useRef({ server: 0, received: 0 });
	useEffect(() => {
		setOrigin(window.location.origin);
		const timer = setInterval(() => setTick(performance.now()), 1000);
		return () => clearInterval(timer);
	}, []);
	useEffect(() => {
		let active = true;
		let timer: ReturnType<typeof setTimeout>;
		async function load() {
			try {
				const response = await fetch("/api/lt", { cache: "no-store" });
				if (!response.ok)
					throw new Error(
						"イベント情報を取得できませんでした。再接続しています。",
					);
				const snapshot = liveSnapshotSchema.parse(await response.json());
				let participation: Participation | null = null;
				let published: VenueGuide[] = [];
				if (snapshot.event) {
					participation = await participationApi<Participation>(
						String(snapshot.event.id),
						"session",
					);
					if (participation.participant) {
						const venue = await participationApi<{ guides: VenueGuide[] }>(
							String(snapshot.event.id),
							"guide",
						);
						published = venue.guides.filter(
							(item) => item.isVisible && item.content.trim(),
						);
					}
				}
				if (active) {
					setLive(snapshot);
					setSession(participation);
					setGuides(published);
					clock.current = {
						server: snapshot.serverNow,
						received: performance.now(),
					};
					setTick(clock.current.received);
					setError("");
				}
			} catch (error) {
				if (active)
					setError(
						error instanceof Error ? error.message : "接続を確認してください。",
					);
			}
			if (active) timer = setTimeout(load, 5000);
		}
		void load();
		return () => {
			active = false;
			clearTimeout(timer);
		};
	}, []);
	const participant = session?.participant;
	const notice = guides.find((item) => item.category === "notice");
	const wifi = guides.find((item) => item.category === "wifi");
	const myTalk = live?.talks.find(
		(talk) => talk.speakerId === participant?.id && talk.status !== "ended",
	);
	const eventPath = live?.event ? `/events/${live.event.id}` : null;
	const current = live?.talks.find((talk) => talk.id === live.selectedTalkId);
	const currentIndex =
		live?.talks.findIndex((talk) => talk.id === current?.id) ?? -1;
	const serverTime =
		clock.current.server + Math.max(0, tick - clock.current.received) / 1000;
	const status = current
		? {
				pending: "開始待ち",
				running: "発表中",
				paused: "一時停止",
				ended: "終了",
			}[current.status]
		: "開始待ち";
	if (!participant || !eventPath) {
		return (
			<WorkspaceShell registrationOnly>
				{error && (
					<p role="alert" className="wc-notice wc-error">
						{error}
					</p>
				)}
				<section className="wc-registration-prompt" aria-busy={!live && !error}>
					<h1>
						{live?.event?.name ??
							(error
								? "イベントを確認できませんでした"
								: live
									? "イベントの準備中です"
									: "イベントを確認しています…")}
					</h1>
					{eventPath && (
						<div className="wc-registration-body">
							<div className="wc-registration-guide">
								<h2>まずは、スマホで参加登録</h2>
								<p>
									スマホのカメラでQRコードを読み取り、会場で呼ばれたい名前を登録しましょう。
								</p>
								<p>登壇する方は、登録後にPC／Macも接続できます。</p>
								<div className="wc-registration-actions">
									<p>スマホで開いている方は、こちらから。</p>
									<a className="wc-button wc-primary wc-full" href={eventPath}>
										参加登録へ進む
										<ArrowRight size={21} aria-hidden="true" />
									</a>
								</div>
							</div>
							{origin && (
								<figure className="wc-registration-qr">
									<QRCodeSVG
										value={`${origin}${eventPath}`}
										size={224}
										marginSize={4}
										level="M"
										role="img"
										title="スマホで参加登録ページを開くQRコード"
									/>
									<figcaption>スマホのカメラで読み取る</figcaption>
									<a href={eventPath}>
										{origin}
										{eventPath}
									</a>
								</figure>
							)}
						</div>
					)}
				</section>
			</WorkspaceShell>
		);
	}
	return (
		<WorkspaceShell
			name={live?.event?.name}
			eventId={live?.event?.id}
			identity={participant.nickname}
		>
			{error && (
				<p role="alert" className="wc-notice wc-error">
					{error}
					{live && " 最後に取得した情報を表示しています。"}
				</p>
			)}
			{myTalk && (
				<section className="wc-speaker-card">
					<Presentation size={26} aria-hidden="true" />
					<div>
						<span className="wc-badge blue">あなたの発表</span>
						<h2>{myTalk.title}</h2>
						<p>
							{session.devices.length > 1
								? "発表に使うPC／Macで発表者画面を開き、画面共有を準備してください。"
								: "画面共有には、発表に使うPC／Macの接続が必要です。"}
						</p>
						<div className="wc-banner-actions">
							{session.devices.length > 1 ? (
								<a className="wc-button wc-primary" href="/speaker">
									発表者画面を開く
									<ArrowRight size={18} aria-hidden="true" />
								</a>
							) : (
								<a
									className="wc-button wc-primary"
									href={`${eventPath}/connect`}
								>
									<Laptop size={20} aria-hidden="true" />
									PC／Macを接続
								</a>
							)}
						</div>
					</div>
				</section>
			)}
			{notice && (
				<div className="wc-notice">
					<Info size={22} aria-hidden="true" />
					<div>
						<strong>{notice.title}</strong>
						<p>{notice.content}</p>
					</div>
				</div>
			)}
			{wifi && <WifiCard guide={wifi} />}
			<div className="wc-home-layout">
				<section className="wc-home-intro">
					<div className="wc-eyebrow">
						{live?.event?.name ?? "TODAY’S WORKSHOP"}
					</div>
					<img
						className="wc-hero-image"
						src="/assets/commons/collaboration.png"
						alt="4人がテーブルを囲み共同制作しているイラスト"
						width={1774}
						height={887}
					/>
					<h1>LTを楽しもう</h1>
					<p>
						仲間の学びから、次のアイデアが生まれる。
						<br />
						今日の発表を、あなたのスマホとPCで。
					</p>
				</section>
				<section>
					<div className="wc-live-summary">
						<div className="wc-row wc-between">
							<span
								className={`wc-badge ${current?.status === "running" ? "peach" : "blue"}`}
							>
								{status}
							</span>
							{current && (
								<div className="wc-row">
									<span className="wc-timer">
										{formatTime(
											current.durationSeconds -
												elapsedSeconds(current, serverTime),
										)}
									</span>
									<span className="wc-small wc-muted">
										{current.status === "pending" ? "持ち時間" : "残り"}
									</span>
								</div>
							)}
						</div>
						<h2>
							{current?.title ??
								(live
									? "次の発表をお待ちください"
									: "イベントを確認しています…")}
						</h2>
						<div className="wc-row">
							<span className="wc-initial">
								{current ? <SpeakerAvatar name={current.speaker} /> : "W"}
							</span>
							<div>
								<strong>{current?.speaker ?? "まもなく、ここから。"}</strong>
								<br />
								<small className="wc-muted">
									{current
										? `LT ${String(currentIndex + 1).padStart(2, "0")} / ${String(live?.talks.length).padStart(2, "0")}`
										: "運営が発表を登録すると表示されます。"}
								</small>
							</div>
						</div>
						<a className="wc-button wc-primary wc-full" href="/screen">
							ライブに参加
							<ArrowRight size={21} aria-hidden="true" />
						</a>
					</div>
					<div className="wc-quick-links">
						<a className="wc-link-row" href={`${eventPath}/participants`}>
							<Users size={24} aria-hidden="true" />
							<span>
								参加者を見る<small>自己紹介・Xでつながる</small>
							</span>
							<ChevronRight size={22} aria-hidden="true" />
						</a>
						<a className="wc-link-row" href={`${eventPath}/guide`}>
							<MapPin size={24} aria-hidden="true" />
							<span>
								会場案内<small>Wi-Fi・トイレ・入退館</small>
							</span>
							<ChevronRight size={22} aria-hidden="true" />
						</a>
					</div>
				</section>
			</div>
			<section className="wc-participation-banner">
				<div>
					<span className="wc-badge blue">参加登録済み</span>
					<h2>{participant.nickname}さんの参加パス</h2>
					<p>プロフィールの編集や、登壇用のPC／Macの接続ができます。</p>
				</div>
				<div className="wc-banner-actions">
					<a className="wc-button wc-primary" href={eventPath}>
						プロフィールを確認
						<ArrowRight size={18} aria-hidden="true" />
					</a>
					<a className="wc-button wc-secondary" href={`${eventPath}/connect`}>
						<Laptop size={20} aria-hidden="true" />
						PC／Macを接続
					</a>
				</div>
			</section>
		</WorkspaceShell>
	);
}
