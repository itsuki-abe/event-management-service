import {
	ArrowRight,
	ChevronDown,
	ChevronUp,
	CircleAlert,
	type LucideIcon,
	Monitor,
	Pause,
	Pencil,
	Play,
	Plus,
	Square,
	Trash2,
	WifiOff,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	elapsedSeconds,
	formatTime,
	type LiveAction,
	type LiveSnapshot,
	liveSnapshotSchema,
} from "../lib/lt";

import { WorkspaceShell } from "./workspace";

type Mode = "audience" | "admin" | "screen" | "speaker";
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
			{Array.from(talk.speaker)[0]}
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

export function LtPage({ mode = "audience" }: { mode?: Mode }) {
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

	const content =
		mode === "admin" ? (
			<AdminView {...view} />
		) : mode === "speaker" ? (
			<SpeakerView {...view} />
		) : mode === "screen" ? (
			<ScreenView {...view} />
		) : (
			<AudienceView {...view} />
		);
	return (
		<WorkspaceShell
			section={mode === "audience" ? "live" : mode === "screen" ? "live" : mode}
			eventId={data?.event?.id ?? 1}
			name={data?.event?.name}
			bare={mode === "screen"}
		>
			<div className={`lt-app ${mode}`}>{content}</div>
		</WorkspaceShell>
	);
}

type ViewProps = ReturnType<typeof useLive> & {
	current: Talk | undefined;
	next: Talk | undefined;
	position: string;
};

function AudienceView({
	data,
	connected,
	now,
	current,
	next,
	position,
}: ViewProps) {
	return (
		<>
			<Connection connected={connected} hasData={Boolean(data)} />
			<div className="live-layout">
				<section aria-label="現在の発表">
					{current ? (
						<>
							<div className="live-title">
								<div className="row between">
									<span className="eyebrow">LT LIVE · {position}</span>
									<Status talk={current} now={now} />
								</div>
								<h1>{current.title}</h1>
								<div className="row">
									<Initial talk={current} />
									<strong>{current.speaker}</strong>
								</div>
							</div>
							<div className="time-panel">
								<Timer talk={current} now={now} />
							</div>
						</>
					) : (
						<p className="muted">
							{data ? "発表の開始をお待ちください。" : "読み込み中…"}
						</p>
					)}
				</section>
				{data && data.talks.length > 0 && (
					<section className="panel" aria-label="プログラム">
						<h2>プログラム</h2>
						<ol className="program">
							{data.talks.map((talk, index) => (
								<li
									key={talk.id}
									className={talk.id === current?.id ? "active" : talk.status}
									aria-current={talk.id === current?.id ? "true" : undefined}
								>
									<span className="num">{pad(index + 1)}</span>
									<span className="text">
										<strong>{talk.speaker}</strong>
										<small>{talk.title}</small>
									</span>
									{talk.id === current?.id ? (
										<Status talk={talk} now={now} />
									) : talk.id === next?.id ? (
										<span className="badge blue">次</span>
									) : talk.status === "ended" ? (
										<span className="badge gray">終了</span>
									) : (
										<small className="muted">
											{minutes(talk.durationSeconds)}
										</small>
									)}
								</li>
							))}
						</ol>
					</section>
				)}
			</div>
		</>
	);
}

function SpeakerView({ data, connected, now, current, next }: ViewProps) {
	return (
		<>
			<div className="wc-page-heading">
				<h1>発表者の手元</h1>
				<p>持ち時間と進行状況を確認できます。タイマーは運営が操作します。</p>
			</div>
			<Connection connected={connected} hasData={Boolean(data)} />
			<div>
				{current ? (
					<section className="confidence" aria-label="現在の発表">
						<Status talk={current} now={now} />
						<h1>{current.title}</h1>
						<div className="row">
							<Initial talk={current} />
							<strong>{current.speaker}</strong>
						</div>
						<Timer talk={current} now={now} />
						{current.status === "pending" && (
							<p className="timer-caption">運営の開始操作をお待ちください</p>
						)}
						{next && (
							<p className="speaker-next">
								次の発表　<strong>{next.speaker}</strong>　{next.title}
							</p>
						)}
					</section>
				) : (
					<p className="muted">
						発表が選ばれると、ここにタイマーが表示されます。
					</p>
				)}
			</div>
		</>
	);
}

function ScreenView({
	data,
	connected,
	now,
	current,
	next,
	position,
}: ViewProps) {
	const [joinUrl, setJoinUrl] = useState("");
	useEffect(() => setJoinUrl(`${location.host}/live`), []);
	return (
		<main className="projection-root">
			<Connection connected={connected} hasData={Boolean(data)} />
			<div className="projection-top">
				<strong>{data?.event?.name}</strong>
			</div>
			<section className="projection-main" aria-label="現在の発表">
				{current ? (
					<>
						<div className="projection-slide">
							<div className="eyebrow">LIGHTNING TALK · {position}</div>
							<h1>{current.title}</h1>
							<p>{current.speaker}</p>
						</div>
						<aside className="projection-side">
							<Status talk={current} now={now} />
							<Timer talk={current} now={now} />
						</aside>
					</>
				) : (
					<div className="projection-slide waiting">
						<h1>まもなく開始します</h1>
					</div>
				)}
			</section>
			<footer className="projection-footer">
				<div>
					{next && (
						<>
							<small>次の発表</small>
							<strong>{next.speaker}</strong>　{next.title}
						</>
					)}
				</div>
				<div>
					<small>参加用ページ</small>
					<span className="projection-url">{joinUrl}</span>
				</div>
			</footer>
		</main>
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

	if (authorized !== true)
		return (
			<div className="gate">
				{authorized === null ? (
					<p className="muted">確認中…</p>
				) : (
					<>
						<div className="wc-page-heading">
							<h1>運営用リンクから開いてください</h1>
							<p>
								このページは運営者専用です。運営チームで共有している運営用リンクを開くと、そのまま操作できます。
							</p>
						</div>
						<a href="/live">参加者向けの画面へ</a>
					</>
				)}
			</div>
		);

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

	return (
		<>
			<div className="wc-page-heading op-heading">
				<div>
					<h1>LT進行</h1>
					{data?.event && <p>{data.event.name}</p>}
				</div>
				<a
					className="wc-button wc-secondary"
					href="/screen"
					target="_blank"
					rel="noreferrer"
				>
					<Icon icon={Monitor} size={18} />
					会場スクリーンを開く
				</a>
			</div>
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
												発表者の準備ができたら、タイマーを開始します。
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

					<aside className="next-source" aria-label="次の発表">
						<span className="eyebrow">次の発表者</span>
						{next ? (
							<>
								<div className="row">
									<Initial talk={next} />
									<h3>
										{next.speaker}
										<span>{next.title}</span>
									</h3>
								</div>
								<p className="small muted">
									持ち時間 {minutes(next.durationSeconds)}
								</p>
							</>
						) : (
							<p className="small muted">次の発表はありません。</p>
						)}
					</aside>
				</div>
			)}
		</>
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
	disabled,
	onSave,
	onCancel,
}: {
	talk?: Talk;
	disabled: boolean;
	onSave: (
		fields: { title: string; speaker: string; durationSeconds: number },
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
						speaker: String(values.get("speaker")),
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
				<input
					name="speaker"
					required
					maxLength={100}
					defaultValue={talk?.speaker}
				/>
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
