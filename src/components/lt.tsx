import {
	ArrowRight,
	ChevronDown,
	ChevronUp,
	CircleAlert,
	Flame,
	Hand,
	Lightbulb,
	type LucideIcon,
	Pause,
	Pencil,
	Play,
	Plus,
	ScreenShare,
	ScreenShareOff,
	Square,
	ThumbsUp,
	Trash2,
	WifiOff,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { EngagementPage } from "../features/engagement/EngagementPage";
import {
	type ReactionKind,
	reactionKinds,
	reactionLabels,
} from "../features/engagement/types";
import {
	elapsedSeconds,
	formatTime,
	type LiveAction,
	type LiveSnapshot,
	liveSnapshotSchema,
} from "../lib/lt";
import { participationApi } from "../lib/participation";
import type { Guide } from "../lib/venue";
import { draftsFrom } from "./guide-admin";
import { OrganizerAccess } from "./organizer-access";
import { ShareVideo, useSharePublisher, useShareViewer } from "./share";
import { SpeakerAvatar } from "./speaker-avatar";
import { WorkspaceShell } from "./workspace";

type Mode = "admin" | "screen" | "speaker";
type Talk = LiveSnapshot["talks"][number];
type TalkAction = Extract<LiveAction, { talkId: number }>["action"];
const statusLabels = {
	pending: "開始待ち",
	running: "発表中",
	paused: "一時停止中",
	ended: "終了",
};

function useLive() {
	const [data, setData] = useState<LiveSnapshot | null>(null);
	const [connected, setConnected] = useState(false);
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const clock = useRef({ server: 0, received: 0 });
	const generation = useRef(0);
	const writing = useRef(false);
	const [now, setNow] = useState(0);

	const accept = useCallback((snapshot: LiveSnapshot, started: number) => {
		const received = performance.now();
		clock.current = {
			server: snapshot.serverNow + (received - started) / 2000,
			received,
		};
		setNow(clock.current.server);
		setData(snapshot);
		setConnected(true);
	}, []);

	const load = useCallback(
		async (signal?: AbortSignal) => {
			if (writing.current) return;
			const ticket = ++generation.current;
			const started = performance.now();
			try {
				const response = await fetch("/api/lt", { cache: "no-store", signal });
				if (!response.ok) throw new Error(String(response.status));
				const snapshot = liveSnapshotSchema.parse(await response.json());
				if (ticket === generation.current) accept(snapshot, started);
			} catch {
				if (ticket === generation.current && !signal?.aborted)
					setConnected(false);
			}
		},
		[accept],
	);

	useEffect(() => {
		const controller = new AbortController();
		let timeout: ReturnType<typeof setTimeout>;
		const poll = async () => {
			await load(controller.signal);
			if (!controller.signal.aborted) timeout = setTimeout(poll, 1500);
		};
		void poll();
		const interval = setInterval(
			() =>
				setNow(
					clock.current.server +
						(performance.now() - clock.current.received) / 1000,
				),
			250,
		);
		return () => {
			controller.abort();
			clearTimeout(timeout);
			clearInterval(interval);
		};
	}, [load]);

	const run = useCallback(
		async (action: LiveAction) => {
			if (writing.current) return undefined;
			writing.current = true;
			++generation.current;
			setBusy(true);
			setError("");
			const started = performance.now();
			let ok = false;
			try {
				const response = await fetch("/api/lt", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(action),
				});
				const body: unknown = await response.json();
				if (!response.ok)
					throw new Error(
						body &&
							typeof body === "object" &&
							"error" in body &&
							typeof body.error === "string"
							? body.error
							: "操作に失敗しました。もう一度お試しください。",
					);
				accept(liveSnapshotSchema.parse(body), started);
				ok = true;
			} catch (cause) {
				setError(
					cause instanceof Error && !(cause instanceof TypeError)
						? cause.message
						: "通信に失敗しました。もう一度お試しください。",
				);
			} finally {
				writing.current = false;
				setBusy(false);
			}
			if (!ok) void load();
			return ok;
		},
		[accept, load],
	);
	return { data, connected, error, busy, now, run };
}

function timer(talk: Talk, now: number) {
	const remaining = Math.ceil(talk.durationSeconds - elapsedSeconds(talk, now));
	const over = remaining < 0 && talk.status !== "pending";
	return {
		text: formatTime(Math.abs(remaining)),
		over,
		label:
			talk.status === "pending"
				? "持ち時間"
				: over
					? "超過時間"
					: talk.status === "ended"
						? "終了時の残り時間"
						: "残り時間",
	};
}

function Icon({ icon: Glyph, size = 22 }: { icon: LucideIcon; size?: number }) {
	return <Glyph size={size} aria-hidden="true" />;
}

function Status({ talk, now }: { talk: Talk; now: number }) {
	const over = timer(talk, now).over && talk.status !== "ended";
	const tone = over
		? "red"
		: { pending: "blue", running: "peach", paused: "yellow", ended: "gray" }[
				talk.status
			];
	return (
		<span className={`badge ${tone}`}>
			{over ? "時間超過" : statusLabels[talk.status]}
		</span>
	);
}

function Initial({ talk }: { talk: Talk }) {
	return (
		<span
			className={`initial ${talk.id % 2 ? "" : "peach"}`}
			aria-hidden="true"
		>
			<SpeakerAvatar name={talk.speaker} />
		</span>
	);
}

function Timer({ talk, now }: { talk: Talk; now: number }) {
	const t = timer(talk, now);
	return (
		<div className={`time ${t.over ? "over" : ""}`}>
			<span className="timer-caption">{t.label}</span>
			<span className="timer">{t.text}</span>
		</div>
	);
}

function Connection({
	connected,
	hasData,
}: {
	connected: boolean;
	hasData: boolean;
}) {
	if (connected) return null;
	return (
		<output className="notice connection">
			<Icon icon={WifiOff} />
			<span>
				{hasData ? "再接続中… 最後に取得した情報を表示しています" : "接続中…"}
			</span>
		</output>
	);
}

function parseDuration(value: string) {
	const match = /^\s*(\d{1,3})(?::([0-5]?\d))?\s*$/.exec(value);
	if (!match) return null;
	const seconds = Number(match[1]) * 60 + Number(match[2] ?? 0);
	return seconds > 0 ? seconds : null;
}

const minutes = (seconds: number) =>
	seconds % 60 ? formatTime(seconds) : `${seconds / 60}分`;
const pad = (value: number) => String(value).padStart(2, "0");

export function LtPage({ mode }: { mode: Mode }) {
	const live = useLive();
	const { data } = live;
	const current = data?.talks.find((talk) => talk.id === data.selectedTalkId);
	const currentIndex = current ? (data?.talks.indexOf(current) ?? -1) : -1;
	const next = data?.talks
		.slice(currentIndex + 1)
		.find((talk) => talk.status === "pending");
	const position = current
		? `${pad(currentIndex + 1)} / ${pad(data?.talks.length ?? 0)}`
		: "";
	const view = { ...live, current, next, position };

	if (mode === "screen") {
		return (
			<EngagementPage
				key={data?.event?.id ?? 1}
				eventId={data?.event?.id ?? 1}
				stage={<ScreenView {...view} />}
			/>
		);
	}

	return (
		<WorkspaceShell
			section={mode}
			eventId={data?.event?.id ?? 1}
			name={data?.event?.name}
		>
			<div className={`lt-app ${mode}`}>
				{mode === "admin" ? <AdminView {...view} /> : <SpeakerView {...view} />}
			</div>
		</WorkspaceShell>
	);
}

type ViewProps = ReturnType<typeof useLive> & {
	current: Talk | undefined;
	next: Talk | undefined;
	position: string;
};

const reactionIcons = {
	applause: Hand,
	like: ThumbsUp,
	learn: Lightbulb,
	hot: Flame,
} satisfies Record<ReactionKind, LucideIcon>;

function useReactions(eventId: number | undefined, talkId: number | undefined) {
	const [totals, setTotals] = useState<Record<ReactionKind, number> | null>(
		null,
	);
	useEffect(() => {
		setTotals(null);
		if (eventId === undefined || talkId === undefined) return;
		let timer: ReturnType<typeof setTimeout>;
		const controller = new AbortController();
		const load = async () => {
			try {
				const response = await fetch(
					`/api/engagement?eventId=${eventId}&talkId=${talkId}`,
					{ cache: "no-store", signal: controller.signal },
				);
				if (response.ok)
					setTotals(
						(
							(await response.json()) as {
								reactions: Record<ReactionKind, number>;
							}
						).reactions,
					);
			} catch {}
			if (!controller.signal.aborted) timer = setTimeout(load, 3000);
		};
		void load();
		return () => {
			controller.abort();
			clearTimeout(timer);
		};
	}, [eventId, talkId]);
	return totals;
}

function SpeakerView({ data, connected, now, current }: ViewProps) {
	const eventId = data?.event?.id;
	const share = useSharePublisher(eventId);
	// The signed-in participant's own talk: the first one not yet finished.
	const mine = data?.talks.filter(
		(talk) => talk.speakerId === share.participantId,
	);
	const talk = mine?.find((item) => item.status !== "ended") ?? mine?.at(-1);
	const reactions = useReactions(data?.event?.id, talk?.id);
	// The selected talk's speaker is shown on the venue screen automatically.
	const projecting = share.stream !== null && talk?.id === current?.id;
	return (
		<>
			<div className="wc-page-heading">
				<h1>発表者の手元</h1>
				<p>自分の発表と会場の反応を確認できます。</p>
			</div>
			<Connection connected={connected} hasData={Boolean(data)} />
			{!share.loaded ? (
				<p className="muted">読み込み中…</p>
			) : !share.participantId ? (
				<section className="wc-access-panel">
					<h2>参加登録した端末で開いてください</h2>
					<p>
						発表者の確認には参加登録が必要です。スマートフォンで登録済みの場合は、このPCを接続してから開き直してください。
					</p>
					<div className="row">
						<a className="wc-button wc-primary" href={`/events/${eventId}`}>
							参加登録
						</a>
						<a
							className="wc-button wc-secondary"
							href={`/events/${eventId}/connect`}
						>
							このPCを接続
						</a>
					</div>
				</section>
			) : !talk ? (
				<section className="wc-access-panel">
					<h2>あなたの発表はまだありません</h2>
					<p>
						運営が発表者として登録すると、ここに持ち時間と画面共有の操作が表示されます。
					</p>
				</section>
			) : (
				<div className="presenter-layout">
					<section
						className="confidence"
						aria-label={talk.id === current?.id ? "現在の発表" : "自分の発表"}
					>
						<Status talk={talk} now={now} />
						<h1>{talk.title}</h1>
						<div className="row">
							<Initial talk={talk} />
							<strong>{talk.speaker}</strong>
						</div>
						<Timer talk={talk} now={now} />
						{talk.status !== "ended" && (
							<p className="timer-caption">
								{talk.status === "pending"
									? "運営の開始操作をお待ちください"
									: "共有が切断しても進行は運営が判断します"}
							</p>
						)}
						{reactions && (
							<>
								<div className="reaction-totals">
									{reactionKinds.map((kind) => (
										<div key={kind}>
											<Icon icon={reactionIcons[kind]} />
											<strong>{reactions[kind]}</strong>
											<span>{reactionLabels[kind].label}</span>
										</div>
									))}
								</div>
								<p className="subtle-tip">
									件数は送られた反応の数です。同じ人の複数回の反応を含みます。
								</p>
							</>
						)}
					</section>
					<section className="share-panel" aria-label="画面共有">
						<div className="row between">
							<h2>画面共有</h2>
							{share.stream ? (
								<span className={`badge ${projecting ? "blue" : "green"}`}>
									{projecting ? "投影中" : "共有準備完了"}
								</span>
							) : (
								share.disconnected && <span className="badge red">切断</span>
							)}
						</div>
						{share.stream ? (
							<div className="slide-preview">
								<ShareVideo stream={share.stream} label="共有中の画面" />
							</div>
						) : (
							share.disconnected && (
								<p className="notice error">
									<Icon icon={WifiOff} />
									<span>
										<strong>共有が切断されました</strong>
										<br />
										もう一度、共有する画面を選んでください。
									</span>
								</p>
							)
						)}
						{share.error && (
							<p className="notice error" role="alert">
								<Icon icon={CircleAlert} />
								<span>{share.error}</span>
							</p>
						)}
						{share.stream ? (
							<>
								{!projecting && (
									<p className="small muted">
										準備できました。自分の発表の順番になると、会場に映ります。
									</p>
								)}
								<button
									type="button"
									className="danger full"
									onClick={share.stop}
								>
									<Icon icon={ScreenShareOff} />
									共有を停止する
								</button>
							</>
						) : (
							<button
								type="button"
								className="primary full"
								disabled={talk.status === "ended"}
								onClick={share.prepare}
							>
								<Icon icon={ScreenShare} />
								画面共有を準備する
							</button>
						)}
						<div className="share-steps">
							<h3>発表までの流れ</h3>
							{[
								"本人が共有する画面を選ぶ",
								"自分の発表の順番になると、会場に映る",
								"運営がタイマーを開始",
							].map((step, index) => (
								<div key={step} className="row">
									<span className="step-num">{index + 1}</span>
									<span>{step}</span>
								</div>
							))}
						</div>
						<p className="small muted share-note">
							共有する画面の選択には、ご本人の操作とブラウザーの許可が必要です。
						</p>
					</section>
				</div>
			)}
		</>
	);
}

function ScreenView({ data, connected, current }: ViewProps) {
	const shares = data?.shares.filter(
		(share) => share.participantId === current?.speakerId,
	);
	const onStage = shares?.find((share) => share.live) ?? shares?.[0];
	const stream = useShareViewer(onStage);
	return (
		<section className="screen-stage" aria-label="発表者の共有画面">
			{stream ? (
				<ShareVideo stream={stream} label="発表者の画面" />
			) : (
				<output className="screen-placeholder">
					<Icon icon={ScreenShare} size={40} />
					<strong>
						{!connected
							? "画面共有に接続しています…"
							: onStage && !onStage.live
								? "画面共有が切断されました"
								: onStage
									? "共有画面に接続しています…"
									: "発表者の画面共有を待っています"}
					</strong>
					<p>共有が始まると、ここに発表画面が映ります。</p>
				</output>
			)}
		</section>
	);
}

function AdminView({
	data,
	connected,
	error,
	busy,
	now,
	run,
	current,
	next,
}: ViewProps) {
	const [authorized, setAuthorized] = useState<boolean | null>(null);
	const [editing, setEditing] = useState<number | null>(null);
	const [adding, setAdding] = useState(false);
	useEffect(() => {
		void run({ action: "authorize" }).then(
			(ok) => ok !== undefined && setAuthorized(ok),
		);
	}, [run]);

	if (authorized !== true) return <OrganizerAccess authorized={authorized} />;

	const active = data?.talks.find(
		(talk) => talk.status === "running" || talk.status === "paused",
	);
	const disabled = busy || !connected;
	const act = (action: TalkAction, talk: Talk, extra = {}) =>
		data &&
		run({
			action,
			revision: data.revision,
			talkId: talk.id,
			...extra,
		} as LiveAction);
	const live = current?.status === "running" || current?.status === "paused";
	const sourceTalk = current?.status === "pending" ? current : next;

	return (
		<>
			<div className="wc-admin-actions">
				<nav className="header-links" aria-label="表示画面を開く">
					<a href="/speaker" target="_blank" rel="noreferrer">
						発表者画面
					</a>
					<a href="/screen" target="_blank" rel="noreferrer">
						画面共有・リアクション
					</a>
				</nav>
			</div>
			{data?.event && <NoticeEditor eventId={String(data.event.id)} />}
			<Connection connected={connected} hasData={Boolean(data)} />
			{error && (
				<p className="notice error" role="alert">
					<Icon icon={CircleAlert} />
					<span>{error}</span>
				</p>
			)}
			{data && !data.event && (
				<div className="gate">
					<h2>イベントを作成</h2>
					<form
						className="stack"
						onSubmit={(event) => {
							event.preventDefault();
							void run({
								action: "createEvent",
								name: String(new FormData(event.currentTarget).get("name")),
							});
						}}
					>
						<label>
							イベント名
							<input name="name" required maxLength={100} />
						</label>
						<button type="submit" className="primary" disabled={disabled}>
							作成
						</button>
					</form>
				</div>
			)}
			{data?.event && (
				<div className="operator-grid">
					<aside aria-label="発表一覧">
						<h3>発表一覧</h3>
						<ol className="op-list">
							{data.talks.map((talk, index) =>
								editing === talk.id ? (
									<li key={talk.id} className="op-edit">
										<TalkForm
											talk={talk}
											participants={data.participants ?? []}
											disabled={disabled}
											onCancel={() => setEditing(null)}
											onSave={async (fields) => {
												if (
													await run({
														action: "saveTalk",
														revision: data.revision,
														id: talk.id,
														...fields,
													})
												)
													setEditing(null);
											}}
										/>
									</li>
								) : (
									<li
										key={talk.id}
										className={talk.id === current?.id ? "active" : talk.status}
									>
										<button
											type="button"
											className="op-talk"
											aria-pressed={talk.id === current?.id}
											title={active ? "発表中は切り替えできません" : undefined}
											disabled={
												disabled || Boolean(active) || talk.id === current?.id
											}
											onClick={() => act("select", talk)}
										>
											<span className="num">{pad(index + 1)}</span>
											<span>
												<strong>{talk.speaker}</strong>
												<small>{talk.title}</small>
												<small>
													{talk.status === "pending"
														? minutes(talk.durationSeconds)
														: statusLabels[talk.status]}
												</small>
											</span>
										</button>
										<span className="op-tools">
											<IconButton
												label={`「${talk.title}」を上へ`}
												icon={ChevronUp}
												disabled={disabled || index === 0}
												onClick={() => act("move", talk, { direction: "up" })}
											/>
											<IconButton
												label={`「${talk.title}」を下へ`}
												icon={ChevronDown}
												disabled={disabled || index === data.talks.length - 1}
												onClick={() => act("move", talk, { direction: "down" })}
											/>
											{talk.status === "pending" && (
												<>
													<IconButton
														label={`「${talk.title}」を編集`}
														icon={Pencil}
														disabled={disabled}
														onClick={() => setEditing(talk.id)}
													/>
													<IconButton
														label={`「${talk.title}」を削除`}
														icon={Trash2}
														disabled={disabled}
														onClick={() => {
															if (confirm(`「${talk.title}」を削除しますか？`))
																act("deleteTalk", talk);
														}}
													/>
												</>
											)}
										</span>
									</li>
								),
							)}
						</ol>
						<details
							className="add"
							open={adding || !data.talks.length}
							onToggle={(event) => setAdding(event.currentTarget.open)}
						>
							<summary>
								<Icon icon={Plus} />
								発表を追加
							</summary>
							<TalkForm
								participants={data.participants ?? []}
								disabled={disabled}
								onSave={async (fields, form) => {
									if (
										await run({
											action: "saveTalk",
											revision: data.revision,
											...fields,
										})
									) {
										setAdding(true);
										form.reset();
										form.querySelector("input")?.focus();
									}
								}}
							/>
						</details>
						<p className="step-help">
							「次の発表へ」で終了と選択を行い、準備後に開始します。
						</p>
						<p className="step-help">
							発表者は参加登録済みの人から選びます。登壇者には、スマホとつないだPC／Macで
							<strong> /speaker </strong>
							（ページ下部の「発表する方へ」）を開いてもらいます。
						</p>
					</aside>

					<section className="op-current" aria-label="現在の発表">
						{current ? (
							<>
								<div className="row between">
									<span className="eyebrow">現在の発表</span>
									<Status talk={current} now={now} />
								</div>
								<h1>{current.title}</h1>
								<div className="row">
									<Initial talk={current} />
									<strong>{current.speaker}</strong>
								</div>
								<div className="op-timer">
									<Timer talk={current} now={now} />
								</div>
								<div className="op-actions">
									<button
										type="button"
										className="secondary"
										disabled={disabled || !live}
										onClick={() =>
											act(
												current.status === "paused" ? "resume" : "pause",
												current,
											)
										}
									>
										<Icon icon={current.status === "paused" ? Play : Pause} />
										{current.status === "paused" ? "再開" : "一時停止"}
									</button>
									<button
										type="button"
										className="danger"
										disabled={disabled || !live}
										onClick={() => act("end", current)}
									>
										<Icon icon={Square} size={18} />
										発表を終了
									</button>
								</div>
								<div className="next-section">
									{current.status === "pending" ? (
										<>
											<h3>準備が整ったら開始</h3>
											<p className="small muted">
												発表者の画面が会場に映ったら、タイマーを開始します。
											</p>
											<button
												type="button"
												className="primary full"
												disabled={disabled}
												onClick={() => act("start", current)}
											>
												<Icon icon={Play} />
												タイマー開始
											</button>
										</>
									) : (
										<>
											<h3>次の登壇者へ</h3>
											<p className="small muted">
												{next
													? `現在の発表を終了し、${next.speaker}さんを開始待ちにします。`
													: "これが最後の発表です。"}
											</p>
											<button
												type="button"
												className="primary full"
												disabled={disabled || !next}
												onClick={() => act("next", current)}
											>
												<Icon icon={ArrowRight} />
												次の発表へ
											</button>
											<button
												type="button"
												className="text-button"
												disabled={disabled}
												onClick={() => {
													if (
														confirm(
															`「${current.title}」のタイマーを開始前に戻しますか？`,
														)
													)
														act("reset", current);
												}}
											>
												タイマーを開始前に戻す
											</button>
										</>
									)}
								</div>
							</>
						) : (
							<p className="muted">
								{data.talks.length
									? "発表一覧から発表を選んでください。"
									: "「発表を追加」から発表を登録してください。"}
							</p>
						)}
					</section>

					<ShareSource
						data={data}
						talk={sourceTalk}
						standby={sourceTalk === current}
					/>
				</div>
			)}
		</>
	);
}

function ShareSource({
	data,
	talk,
	standby,
}: {
	data: LiveSnapshot;
	talk: Talk | undefined;
	standby: boolean;
}) {
	const share = data.shares.find(
		(item) => item.participantId === talk?.speakerId && item.live,
	);
	const stream = useShareViewer(share);
	const onStage = standby && Boolean(share);
	return (
		<aside className="next-source" aria-label="発表者の共有">
			<span className="eyebrow">
				{standby ? "選択中の発表者の共有" : "次の発表者の準備"}
			</span>
			{talk ? (
				<>
					<h3>
						{talk.speaker}
						<span>{talk.title}</span>
					</h3>
					<div className="slide-preview">
						{stream ? (
							<ShareVideo stream={stream} label={`${talk.speaker}さんの共有`} />
						) : (
							<small>
								{share
									? "プレビューを接続しています…"
									: "発表者の共有を待っています"}
							</small>
						)}
					</div>
					{share && (
						<span className={`badge ${onStage ? "blue" : "green"}`}>
							{onStage ? "投影中" : "共有準備完了"}
						</span>
					)}
					<p className="step-help">
						発表を選ぶと、その発表者の共有が視聴ページに自動で映ります。
					</p>
				</>
			) : (
				<p className="small muted">次の発表はありません。</p>
			)}
		</aside>
	);
}

function NoticeEditor({ eventId }: { eventId: string }) {
	const [guides, setGuides] = useState<Guide[] | null>(null);
	const [text, setText] = useState("");
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState("");
	useEffect(() => {
		participationApi<{ guides: Guide[] }>(eventId, "guide/manage")
			.then((result) => {
				setGuides(result.guides);
				const notice = result.guides.find((g) => g.category === "notice");
				if (notice?.isVisible) setText(notice.content);
			})
			.catch(() => {});
	}, [eventId]);
	async function publish(content: string) {
		if (!guides) return;
		setBusy(true);
		setMessage("");
		try {
			const result = await participationApi<{ guides: Guide[] }>(
				eventId,
				"guide/manage",
				{
					guides: draftsFrom(guides).map((draft) =>
						draft.category === "notice"
							? {
									...draft,
									title: draft.title.trim() || "お知らせ",
									content,
									isVisible: Boolean(content.trim()),
								}
							: draft,
					),
				},
			);
			setGuides(result.guides);
			setText(content);
			setMessage(
				content.trim() ? "お知らせを出しました。" : "お知らせを消しました。",
			);
		} catch (cause) {
			setMessage(
				cause instanceof Error ? cause.message : "保存できませんでした。",
			);
		} finally {
			setBusy(false);
		}
	}
	if (!guides) return null;
	return (
		<form
			className="notice-editor"
			onSubmit={(event) => {
				event.preventDefault();
				void publish(text);
			}}
		>
			<label>
				参加者へのお知らせ
				<input
					value={text}
					maxLength={4000}
					placeholder="例：15:30から後半を再開します"
					onChange={(event) => setText(event.target.value)}
				/>
			</label>
			<button type="submit" className="primary" disabled={busy || !text.trim()}>
				お知らせを出す
			</button>
			<button
				type="button"
				className="secondary"
				disabled={busy}
				onClick={() => void publish("")}
			>
				消す
			</button>
			{message && <output className="small muted">{message}</output>}
		</form>
	);
}

function IconButton({
	label,
	icon,
	...props
}: {
	label: string;
	icon: LucideIcon;
	disabled: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			className="icon-button"
			aria-label={label}
			title={label}
			{...props}
		>
			<Icon icon={icon} size={18} />
		</button>
	);
}

function TalkForm({
	talk,
	participants,
	disabled,
	onSave,
	onCancel,
}: {
	talk?: Talk;
	participants: { id: number; nickname: string }[];
	disabled: boolean;
	onSave: (
		fields: { title: string; speakerId: number; durationSeconds: number },
		form: HTMLFormElement,
	) => Promise<void>;
	onCancel?: () => void;
}) {
	return (
		<form
			className="talk-form"
			onSubmit={(event) => {
				event.preventDefault();
				const form = event.currentTarget;
				const values = new FormData(form);
				const durationSeconds = parseDuration(String(values.get("duration")));
				if (!durationSeconds) return;
				void onSave(
					{
						title: String(values.get("title")),
						speakerId: Number(values.get("speakerId")),
						durationSeconds,
					},
					form,
				);
			}}
		>
			<label className="wide">
				タイトル
				<input
					name="title"
					required
					maxLength={200}
					defaultValue={talk?.title}
				/>
			</label>
			<label>
				発表者
				<select name="speakerId" required defaultValue={talk?.speakerId ?? ""}>
					<option value="" disabled>
						{participants.length
							? "選択してください"
							: "参加登録した人がいません"}
					</option>
					{participants.map((participant) => (
						<option key={participant.id} value={participant.id}>
							{participant.nickname}
						</option>
					))}
				</select>
			</label>
			<label>
				持ち時間
				<input
					name="duration"
					required
					pattern="\d{1,3}(:[0-5]?\d)?"
					title="分、または 分:秒（例：5、3:30）"
					defaultValue={
						talk
							? formatTime(talk.durationSeconds).replace(/^0(?=\d:)/, "")
							: "5:00"
					}
				/>
			</label>
			<span className="form-actions">
				<button type="submit" className="primary" disabled={disabled}>
					{talk ? "保存" : "追加"}
				</button>
				{onCancel && (
					<button type="button" className="secondary" onClick={onCancel}>
						キャンセル
					</button>
				)}
			</span>
		</form>
	);
}
