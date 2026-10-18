import { useCallback, useEffect, useRef, useState } from "react";
import {
	elapsedSeconds,
	formatTime,
	type LiveAction,
	type LiveSnapshot,
	liveSnapshotSchema,
} from "../lib/lt";

type Mode = "audience" | "admin" | "screen" | "speaker";
type Talk = LiveSnapshot["talks"][number];
const statuses = {
	pending: "開始待ち",
	running: "発表中",
	paused: "一時停止",
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

	useEffect(() => {
		let stopped = false;
		let timeout: ReturnType<typeof setTimeout>;
		const controller = new AbortController();
		async function poll() {
			if (!writing.current) {
				const ticket = ++generation.current;
				const started = performance.now();
				try {
					const response = await fetch("/api/lt", {
						cache: "no-store",
						signal: controller.signal,
					});
					if (!response.ok) throw new Error("進行情報を取得できませんでした。");
					const snapshot = liveSnapshotSchema.parse(await response.json());
					if (!stopped && ticket === generation.current)
						accept(snapshot, started);
				} catch {
					if (!stopped && ticket === generation.current) setConnected(false);
				}
			}
			if (!stopped) timeout = setTimeout(poll, 1500);
		}
		void poll();
		const interval = setInterval(
			() =>
				setNow(
					clock.current.server +
						(performance.now() - clock.current.received) / 1000,
				),
			200,
		);
		return () => {
			stopped = true;
			controller.abort();
			clearTimeout(timeout);
			clearInterval(interval);
		};
	}, [accept]);

	async function run(action: LiveAction, key: string) {
		if (writing.current) return false;
		writing.current = true;
		++generation.current;
		setBusy(true);
		setError("");
		const started = performance.now();
		try {
			const response = await fetch("/api/lt", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${key}`,
				},
				body: JSON.stringify(action),
			});
			if (!response.ok) {
				const body: unknown = await response.json();
				throw new Error(
					body &&
						typeof body === "object" &&
						"error" in body &&
						typeof body.error === "string"
						? body.error
						: "操作に失敗しました。もう一度お試しください。",
				);
			}
			accept(liveSnapshotSchema.parse(await response.json()), started);
			return true;
		} catch (cause) {
			setError(
				cause instanceof Error
					? cause.message
					: "通信に失敗しました。もう一度お試しください。",
			);
			return false;
		} finally {
			writing.current = false;
			setBusy(false);
		}
	}
	return { data, connected, error, busy, now, run };
}

function Timer({ talk, now }: { talk: Talk; now: number }) {
	const remaining = talk.durationSeconds - elapsedSeconds(talk, now);
	const overtime = remaining <= 0;
	const warning = !overtime && remaining <= 60 && talk.status !== "ended";
	return (
		<div
			className={`timer ${overtime ? "overtime" : warning ? "warning" : ""}`}
		>
			<span className="timer-label">
				{talk.status === "pending"
					? "持ち時間"
					: talk.status === "ended"
						? "終了時の残り時間"
						: talk.status === "paused"
							? "一時停止中"
							: "残り時間"}
			</span>
			<span className="time">{formatTime(Math.ceil(remaining))}</span>
			<span className="timer-caption">
				{talk.status === "ended"
					? `発表時間 ${formatTime(elapsedSeconds(talk, now))}`
					: overtime
						? "時間超過"
						: warning
							? "残り1分以内"
							: `持ち時間 ${formatTime(talk.durationSeconds)}`}
			</span>
		</div>
	);
}

function Avatar({ name }: { name: string }) {
	return (
		<span className="avatar" aria-hidden="true">
			{Array.from(name)[0]}
		</span>
	);
}

export function LtPage({ mode = "audience" }: { mode?: Mode }) {
	const { data, connected, error, busy, now, run } = useLive();
	const [key, setKey] = useState("");
	const [editing, setEditing] = useState<Talk | null>(null);
	useEffect(() => {
		if (mode === "admin")
			setKey(sessionStorage.getItem("lt-organizer-key") ?? "");
	}, [mode]);
	const current = data?.talks.find((talk) => talk.id === data.selectedTalkId);
	const currentIndex =
		data?.talks.findIndex((talk) => talk.id === data.selectedTalkId) ?? -1;
	const next = data?.talks
		.slice(currentIndex + 1)
		.find((talk) => talk.status === "pending");
	const active = data?.talks.some(
		(talk) => talk.status === "running" || talk.status === "paused",
	);
	const disabled = busy || !connected;
	const admin = mode === "admin";
	const send = (action: "start" | "pause" | "resume" | "end" | "next") => {
		if (data && current)
			void run({ action, revision: data.revision, talkId: current.id }, key);
	};
	return (
		<div className={`lt-app ${mode}`}>
			<header className="site-header">
				<div>
					<a className="brand" href="/">
						{data?.event?.name ?? "LT LIVE"}
					</a>
					<span className="subtitle">
						{mode === "screen"
							? "会場スクリーン"
							: admin
								? "LT進行"
								: mode === "speaker"
									? "発表者"
									: "LTライブ"}
					</span>
				</div>
				{mode !== "screen" && (
					<nav aria-label="画面切り替え">
						<a
							href="/live"
							aria-current={mode === "audience" ? "page" : undefined}
						>
							ライブ
						</a>
						<a href="/admin" aria-current={admin ? "page" : undefined}>
							LT進行
						</a>
						<a
							href="/speaker"
							aria-current={mode === "speaker" ? "page" : undefined}
						>
							発表者
						</a>
						<a href="/screen" target="_blank" rel="noreferrer">
							投影画面 ↗
						</a>
					</nav>
				)}
			</header>
			<output className={`connection ${connected ? "online" : "offline"}`}>
				{connected
					? "進行情報を同期中"
					: data
						? "再接続中… 最後に取得した情報を表示しています"
						: "進行情報に接続中…"}
			</output>
			{error && (
				<p className="error" role="alert">
					{error}
				</p>
			)}
			{admin && (
				<section className="operator-access" aria-label="運営アクセス">
					{!key ? (
						<form
							onSubmit={(event) => {
								event.preventDefault();
								const value = String(
									new FormData(event.currentTarget).get("key") ?? "",
								).trim();
								if (value) {
									sessionStorage.setItem("lt-organizer-key", value);
									setKey(value);
								}
							}}
						>
							<label>
								運営キー
								<input
									name="key"
									type="password"
									autoComplete="off"
									required
									placeholder="運営から共有されたキー"
								/>
							</label>
							<button type="submit">運営操作を開く</button>
						</form>
					) : (
						<>
							<span>運営操作用のキーを設定済み</span>
							<button
								className="text-button"
								type="button"
								onClick={() => {
									sessionStorage.removeItem("lt-organizer-key");
									setKey("");
								}}
							>
								キーを変更
							</button>
						</>
					)}
				</section>
			)}
			{data && !data.event && (
				<section className="empty">
					<h1>イベントの開始を待っています</h1>
					{admin && key ? (
						<form
							onSubmit={(event) => {
								event.preventDefault();
								void run(
									{
										action: "createEvent",
										name: String(new FormData(event.currentTarget).get("name")),
									},
									key,
								);
							}}
						>
							<label>
								イベント名
								<input
									name="name"
									required
									maxLength={100}
									placeholder="イベント名を入力"
								/>
							</label>
							<button disabled={disabled} type="submit">
								イベントを作成
							</button>
						</form>
					) : (
						<p>運営が発表を登録すると、ここに表示されます。</p>
					)}
				</section>
			)}
			{data?.event && (
				<main className={admin ? "operator-layout" : "viewer-layout"}>
					{admin && (
						<aside className="schedule">
							<h2>
								進行リスト <span className="count">{data.talks.length}件</span>
							</h2>
							<ol>
								{data.talks.map((talk, index) => (
									<li
										key={talk.id}
										className={talk.id === current?.id ? "selected" : ""}
									>
										<button
											className="talk-select"
											type="button"
											disabled={
												disabled ||
												!key ||
												Boolean(active) ||
												current?.id === talk.id
											}
											onClick={() =>
												void run(
													{
														action: "select",
														revision: data.revision,
														talkId: talk.id,
													},
													key,
												)
											}
										>
											<span className="order">{index + 1}</span>
											<span>
												<strong>{talk.speaker}</strong>
												<span className="talk-title">{talk.title}</span>
												<span className={`badge ${talk.status}`}>
													{statuses[talk.status]}
												</span>
											</span>
										</button>
										{key && talk.status === "pending" && (
											<button
												className="text-button edit-button"
												type="button"
												disabled={busy}
												onClick={() => setEditing(talk)}
											>
												編集
											</button>
										)}
									</li>
								))}
							</ol>
							{!data.talks.length && <p>発表がまだ登録されていません。</p>}
						</aside>
					)}
					<section className="current-talk" aria-label="現在の発表">
						<h1>{admin ? "現在の発表" : "LTライブ"}</h1>
						{current ? (
							<>
								<div className="status-row">
									<span className={`badge ${current.status}`}>
										{statuses[current.status]}
									</span>
								</div>
								<h2 className="current-title">{current.title}</h2>
								<div className="speaker-info">
									<Avatar name={current.speaker} />
									<span>{current.speaker}</span>
								</div>
								<Timer talk={current} now={now} />
								{admin && key && (
									<div className="timer-controls">
										<div className="pause-finish">
											<button
												type="button"
												className="secondary"
												disabled={
													disabled ||
													!["running", "paused"].includes(current.status)
												}
												onClick={() =>
													send(current.status === "paused" ? "resume" : "pause")
												}
											>
												{current.status === "paused"
													? "タイマー再開"
													: "一時停止"}
											</button>
											<button
												type="button"
												className="finish"
												disabled={
													disabled ||
													!["running", "paused"].includes(current.status)
												}
												onClick={() => send("end")}
											>
												発表を終了
											</button>
										</div>
										<div className="advance-controls">
											<h3>
												{current.status === "pending"
													? "準備ができたら開始"
													: "次の発表へ"}
											</h3>
											<p>
												{current.status === "pending"
													? "発表者の準備ができたら、タイマーを開始してください。"
													: "現在の発表を終了し、次の発表を開始待ちにします。"}
											</p>
											{current.status === "pending" ? (
												<button
													type="button"
													disabled={disabled}
													onClick={() => send("start")}
												>
													タイマー開始
												</button>
											) : (
												<button
													type="button"
													disabled={disabled || !next}
													onClick={() => send("next")}
												>
													次の発表へ →
												</button>
											)}
										</div>
									</div>
								)}
							</>
						) : (
							<div className="empty">
								<p>発表の開始をお待ちください。</p>
								{admin && <p>進行リストから発表を選択してください。</p>}
							</div>
						)}
					</section>
					<section className="next-talk">
						<h2>次の発表</h2>
						{next ? (
							<>
								<div className="speaker-info">
									<Avatar name={next.speaker} />
									<strong>{next.speaker}</strong>
								</div>
								<h3>{next.title}</h3>
								<p>持ち時間 {formatTime(next.durationSeconds)}</p>
								<span className="badge pending">開始待ち</span>
							</>
						) : (
							<p>次の発表はありません。</p>
						)}
						{mode === "speaker" && (
							<p className="speaker-help">
								運営の開始操作でタイマーが動きます。準備ができたら運営へお知らせください。
							</p>
						)}
					</section>
					{admin && key && (
						<section className="talk-editor">
							<h2>{editing ? "発表を編集" : "発表を登録"}</h2>
							<form
								key={editing?.id ?? "new"}
								onSubmit={async (event) => {
									event.preventDefault();
									const form = event.currentTarget;
									const values = new FormData(form);
									const saved = await run(
										{
											action: "saveTalk",
											revision: data.revision,
											...(editing ? { id: editing.id } : {}),
											title: String(values.get("title")),
											speaker: String(values.get("speaker")),
											durationSeconds: Number(values.get("durationSeconds")),
											sortOrder: Number(values.get("sortOrder")),
										},
										key,
									);
									if (saved) {
										form.reset();
										setEditing(null);
									}
								}}
							>
								<label>
									発表者名
									<input
										name="speaker"
										required
										maxLength={100}
										defaultValue={editing?.speaker}
									/>
								</label>
								<label className="title-field">
									発表タイトル
									<input
										name="title"
										required
										maxLength={200}
										defaultValue={editing?.title}
									/>
								</label>
								<label>
									持ち時間（秒）
									<input
										type="number"
										name="durationSeconds"
										min="1"
										max="86400"
										step="1"
										required
										defaultValue={editing?.durationSeconds ?? 300}
									/>
								</label>
								<label>
									発表順
									<input
										type="number"
										name="sortOrder"
										max="100000"
										min="0"
										step="1"
										required
										defaultValue={
											editing?.sortOrder ??
											(data.talks.length
												? Math.max(
														...data.talks.map((talk) => talk.sortOrder),
													) + 1
												: 1)
										}
									/>
								</label>
								<div className="form-actions">
									<button type="submit" disabled={disabled}>
										{editing ? "変更を保存" : "発表を追加"}
									</button>
									{editing && (
										<button
											className="secondary"
											type="button"
											onClick={() => setEditing(null)}
										>
											キャンセル
										</button>
									)}
								</div>
							</form>
						</section>
					)}
				</main>
			)}
			{mode === "audience" && (
				<footer>
					発表の切り替えやタイマーは、運営の操作に合わせて更新されます。
				</footer>
			)}
		</div>
	);
}
