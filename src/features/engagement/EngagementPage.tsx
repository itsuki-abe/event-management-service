import { useCallback, useEffect, useRef, useState } from "react";
import { OrganizerAccess } from "../../components/organizer-access";
import { SpeakerAvatar } from "../../components/speaker-avatar";
import { WorkspaceShell } from "../../components/workspace";
import { type Participation, participationApi } from "../../lib/participation";
import {
	type EngagementSnapshot,
	type ReactionKind,
	reactionKinds,
	reactionLabels,
	type Talk,
} from "./types";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
	let response: Response;
	let result: T & { error?: string };
	try {
		response = await fetch(url, init);
		result = (await response.json()) as T & { error?: string };
	} catch {
		throw new Error(
			"通信に失敗しました。接続を確認して、もう一度お試しください。",
		);
	}
	if (!response.ok) throw new Error(result.error ?? "通信に失敗しました。");
	return result;
}
function useSnapshot(
	eventId: number,
	talkId: number | null,
	admin: boolean,
	enabled: boolean,
) {
	const [data, setData] = useState<EngagementSnapshot | null>(null);
	const [error, setError] = useState("");
	const sequence = useRef(0);
	const refresh = useCallback(async () => {
		if (!enabled) return;
		const seq = ++sequence.current;
		const params = new URLSearchParams({ eventId: String(eventId) });
		if (talkId) params.set("talkId", String(talkId));
		if (admin) params.set("admin", "1");
		try {
			const result = await api<EngagementSnapshot>(`/api/engagement?${params}`);
			if (sequence.current === seq) {
				setData(result);
				setError("");
			}
		} catch (cause) {
			if (sequence.current === seq)
				setError(
					cause instanceof Error ? cause.message : "通信に失敗しました。",
				);
		}
	}, [eventId, talkId, admin, enabled]);
	useEffect(() => {
		setData(null);
		let stopped = false;
		let timer: ReturnType<typeof setTimeout>;
		const poll = async () => {
			await refresh();
			if (!stopped) timer = setTimeout(poll, 2000);
		};
		void poll();
		window.addEventListener("online", refresh);
		return () => {
			stopped = true;
			clearTimeout(timer);
			sequence.current++;
			window.removeEventListener("online", refresh);
		};
	}, [refresh]);
	return { data, error, refresh };
}

export function EngagementPage({
	eventId,
	admin = false,
}: {
	eventId: number;
	admin?: boolean;
}) {
	const [viewTalkId, setViewTalkId] = useState<number | null>(null);
	const [authorized, setAuthorized] = useState<boolean | null>(null);
	useEffect(() => {
		if (!admin) return;
		const controller = new AbortController();
		void fetch("/api/lt", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ action: "authorize" }),
			signal: controller.signal,
		})
			.then((response) => setAuthorized(response.ok))
			.catch(() => {
				if (!controller.signal.aborted) setAuthorized(false);
			});
		return () => controller.abort();
	}, [admin]);
	const { data, error, refresh } = useSnapshot(
		eventId,
		viewTalkId,
		admin,
		!admin || authorized === true,
	);
	const [session, setSession] = useState<Participation | null>(null);
	useEffect(() => {
		if (admin) return;
		participationApi<Participation>(String(eventId), "session")
			.then(setSession)
			.catch(() => {});
	}, [admin, eventId]);
	const registered = Boolean(session?.participant);
	const [body, setBody] = useState("");
	const [draftTalk, setDraftTalk] = useState<Talk | null>(null);
	const [message, setMessage] = useState("");
	const [commentError, setCommentError] = useState("");
	const [now, setNow] = useState(0);
	useEffect(() => {
		setNow(Date.now());
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, []);
	useEffect(() => {
		if (!message) return;
		const timer = setTimeout(() => setMessage(""), 4000);
		return () => clearTimeout(timer);
	}, [message]);
	const [sending, setSending] = useState(false);
	const [reacting, setReacting] = useState(false);
	const [lastReaction, setLastReaction] = useState<ReactionKind | null>(null);
	const reactionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
		undefined,
	);
	useEffect(() => () => clearTimeout(reactionTimer.current), []);
	const target = draftTalk ?? data?.talk;
	const changed = Boolean(draftTalk && data?.talk?.id !== draftTalk.id);
	const post = (payload: Record<string, unknown>, method = "POST") =>
		api<{ id: number }>("/api/engagement", {
			method,
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ eventId, ...payload }),
		});
	async function sendReaction(kind: ReactionKind) {
		if (!data?.talk || reacting) return;
		setReacting(true);
		setMessage("");
		try {
			await post({ action: "reaction", talkId: data.talk.id, kind });
			setLastReaction(kind);
			setMessage(`${reactionLabels[kind].label}を送りました。`);
			await refresh();
		} catch (cause) {
			setMessage(
				cause instanceof Error ? cause.message : "送信できませんでした。",
			);
		} finally {
			reactionTimer.current = setTimeout(() => {
				setReacting(false);
				setLastReaction(null);
			}, 1000);
		}
	}
	async function sendComment() {
		if (!target || sending) return;
		setSending(true);
		setMessage("");
		setCommentError("");
		try {
			await post({
				action: "comment",
				talkId: target.id,
				body,
			});
			setBody("");
			setDraftTalk(null);
			setMessage("コメントを送りました。");
			await refresh();
		} catch (cause) {
			setCommentError(
				cause instanceof Error
					? cause.message
					: "送信できませんでした。入力内容は残っています。",
			);
		} finally {
			setSending(false);
		}
	}
	async function moderate(payload: Record<string, unknown>) {
		setSending(true);
		setMessage("");
		try {
			await post(payload, "PATCH");
			setMessage("変更を保存しました。");
			await refresh();
		} catch (cause) {
			setMessage(
				cause instanceof Error ? cause.message : "変更できませんでした。",
			);
		} finally {
			setSending(false);
		}
	}
	const talk = data?.talk;
	const remaining = talk
		? talk.durationSeconds -
			talk.elapsedSeconds -
			(talk.status === "running" && talk.resumedAt
				? Math.max(0, Math.floor((now - talk.resumedAt) / 1000))
				: 0)
		: 0;
	const seconds = Math.abs(remaining);
	const timerText = `${remaining < 0 ? "+" : ""}${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
	const labels = {
		pending: "開始待ち",
		running: "発表中",
		paused: "一時停止中",
		ended: "終了",
	};
	const comments = (
		<>
			<div className="conversation-heading">
				<h2>{admin ? "コメント管理" : "みんなのコメント"}</h2>
				{!data?.commentsEnabled && (
					<span className="badge peach">受付停止中</span>
				)}
			</div>
			<ul className="comment-list">
				{data?.comments.map((comment) => (
					<li
						className={`comment ${comment.hiddenAt ? "hidden-comment" : ""}`}
						key={comment.id}
					>
						<span className="initial" aria-hidden="true">
							{Array.from(comment.displayName || "ゲスト")[0]}
						</span>
						<div className="comment-text">
							<div className="author">
								<strong>{comment.displayName || "ゲスト"}</strong>
								<time dateTime={new Date(comment.createdAt).toISOString()}>
									{new Date(comment.createdAt).toLocaleTimeString("ja-JP", {
										hour: "2-digit",
										minute: "2-digit",
										timeZone: "Asia/Tokyo",
									})}
								</time>
							</div>
							{comment.hiddenAt ? (
								<details>
									<summary className="muted small">
										非表示のコメントを確認
									</summary>
									<p>{comment.body}</p>
								</details>
							) : (
								<p>{comment.body}</p>
							)}
							{admin &&
								(comment.hiddenAt ? (
									<span className="muted small">非表示</span>
								) : (
									<button
										className="text-button danger-text"
										type="button"
										disabled={sending}
										onClick={() =>
											void moderate({ action: "hide", commentId: comment.id })
										}
										aria-label={`${comment.displayName}さんのコメントを非表示`}
									>
										非表示にする
									</button>
								))}
						</div>
					</li>
				))}
			</ul>
			{!data?.comments.length && (
				<p className="empty muted">
					まだコメントはありません。
					<br />
					感想や質問を届けてみよう。
				</p>
			)}
			{Boolean(data && data.comments.length >= 200) && (
				<p className="subtle-tip">最新の200件を表示しています。</p>
			)}
		</>
	);
	return (
		<WorkspaceShell
			section={admin ? "comments" : "engagement"}
			eventId={eventId}
			name={data?.event.title}
			identity={session?.participant?.nickname}
		>
			<div className={`commons-app ${admin ? "operator" : ""}`}>
				<div className="page">
					{admin && authorized !== true ? (
						<OrganizerAccess authorized={authorized} />
					) : (
						<>
							{error && (
								<div className="notice error" role="alert">
									<Icon name="wifi_off" />
									<div>
										<strong>再接続中です</strong>
										<p>{error}</p>
										<p>
											最後に取得した情報を表示しています。自動で再接続します。
										</p>
										<button
											className="text-button"
											type="button"
											onClick={() => void refresh()}
										>
											再試行
										</button>
									</div>
								</div>
							)}
							{!data && !error && (
								<p className="loading" role="alert">
									イベントに接続しています…
								</p>
							)}
							{data && (
								<>
									{admin && (
										<div className="page-heading">
											<div>
												<h2>コメント管理</h2>
												<p className="muted">{data.event.title}</p>
											</div>
											<span className="badge blue">運営画面</span>
										</div>
									)}
									{admin && (
										<label className="talk-select">
											表示する発表
											<select
												value={viewTalkId ?? "live"}
												onChange={(event) =>
													setViewTalkId(
														event.target.value === "live"
															? null
															: Number(event.target.value),
													)
												}
											>
												<option value="live">進行中の発表に合わせる</option>
												{data.talks.map((item) => (
													<option key={item.id} value={item.id}>
														{item.speakerName} / {item.title}
													</option>
												))}
											</select>
										</label>
									)}
									<div className="live-layout">
										<section className="live-details">
											{talk ? (
												<>
													<div className="live-title">
														<div className="row between">
															<span className="eyebrow">
																LT LIVE ·{" "}
																{String(
																	data.talks.findIndex(
																		(item) => item.id === talk.id,
																	) + 1,
																).padStart(2, "0")}{" "}
																/ {String(data.talks.length).padStart(2, "0")}
															</span>
															<span
																className={`badge ${remaining < 0 ? "red" : talk.status === "pending" ? "blue" : "peach"}`}
															>
																{remaining < 0 && talk.status === "running"
																	? "時間超過"
																	: labels[talk.status]}
															</span>
														</div>
														<h1>{talk.title}</h1>
														<div className="talk-line">
															<span className="initial" aria-hidden="true">
																<SpeakerAvatar name={talk.speakerName} />
															</span>
															<strong>{talk.speakerName}</strong>
														</div>
													</div>
													<div className="time-panel">
														<span className="timer-caption">
															{remaining < 0
																? "超過時間"
																: talk.status === "pending"
																	? "持ち時間"
																	: "残り時間"}
														</span>
														<span
															className={`timer ${remaining < 0 ? "overtime" : ""}`}
														>
															{timerText}
														</span>
													</div>
													<div className="reaction-grid">
														{reactionKinds.map((kind) => (
															<button
																className={`reaction ${kind} ${lastReaction === kind ? "popped" : ""}`}
																type="button"
																key={kind}
																disabled={admin || reacting || !registered}
																onClick={() => void sendReaction(kind)}
																aria-label={`${reactionLabels[kind].label}を送る ${data.reactions[kind]}件`}
															>
																<Icon name={reactionLabels[kind].icon} />
																<span>
																	<strong>{reactionLabels[kind].label}</strong>
																	<small>{data.reactions[kind]}</small>
																</span>
															</button>
														))}
													</div>
													<p className="subtle-tip">
														気持ちが動いたら、何度でも。反応はこの発表に届きます。
													</p>
												</>
											) : (
												<div className="waiting">
													<Icon name="chat_bubble" />
													<h1>もうすぐ、はじまります。</h1>
													<p className="muted">
														発表が選択されると、ここから反応やコメントを送れます。
													</p>
												</div>
											)}
											<output className="connection">
												<Icon name={error ? "wifi_off" : "wifi"} />
												{error ? "再接続中" : "接続中"}
												<span>反応数は送信された回数です</span>
											</output>
										</section>
										<section className="conversation">
											{admin && (
												<div className="moderation-settings">
													<label className="toggle">
														<input
															type="checkbox"
															role="switch"
															aria-label="コメント受付"
															aria-checked={data.commentsEnabled}
															checked={data.commentsEnabled}
															disabled={sending}
															onChange={(event) =>
																void moderate({
																	action: "settings",
																	commentsEnabled: event.target.checked,
																	commentsProjectionEnabled:
																		data.commentsProjectionEnabled,
																})
															}
														/>
														<span>
															コメント
															{data.commentsEnabled ? "受付中" : "受付停止中"}
														</span>
													</label>
													<label className="toggle">
														<input
															type="checkbox"
															role="switch"
															aria-checked={data.commentsProjectionEnabled}
															checked={data.commentsProjectionEnabled}
															disabled={sending}
															onChange={(event) =>
																void moderate({
																	action: "settings",
																	commentsEnabled: data.commentsEnabled,
																	commentsProjectionEnabled:
																		event.target.checked,
																})
															}
														/>
														<span>会場投影を許可</span>
													</label>
													<p className="subtle-tip">
														参加者向けの一覧表示と、会場への投影許可は別々に設定します。投影画面との接続は別機能です。
													</p>
												</div>
											)}
											{comments}
											{!admin && session && !registered && (
												<a
													className="wc-button wc-primary wc-full"
													href={`/events/${eventId}`}
												>
													参加登録して反応・コメントする
												</a>
											)}
											{!admin && target && registered && (
												<form
													className="composer"
													onSubmit={(event) => {
														event.preventDefault();
														void sendComment();
													}}
												>
													{changed && (
														<div className="notice change-notice" role="alert">
															<Icon name="swap_horiz" />
															<span>
																<strong>発表が切り替わりました</strong>
																<br />
																送信先は変更していません。
															</span>
														</div>
													)}
													{commentError && (
														<div className="notice error" role="alert">
															<Icon name="error" />
															<span>
																<strong>送信できませんでした</strong>
																<br />
																{commentError}
																<br />
																入力は残っています。接続後に再送できます。
															</span>
														</div>
													)}
													<label htmlFor="comment-body">
														{target.speakerName}さんへの
														{changed ? "下書き" : "コメント"}
													</label>
													<textarea
														id="comment-body"
														placeholder="感想や質問を書いてみよう"
														value={body}
														disabled={sending}
														required
														onChange={(event) => {
															if (!draftTalk) setDraftTalk(talk ?? null);
															setBody(
																Array.from(event.target.value)
																	.slice(0, 200)
																	.join(""),
															);
														}}
														aria-describedby="composer-help character-count"
													/>
													<div className="composer-foot">
														<small id="composer-help">
															{session?.participant?.nickname}として投稿
														</small>
														<small id="character-count">
															{Array.from(body).length} / 200
														</small>
													</div>
													<button
														type="submit"
														className="primary full"
														disabled={
															sending || !data.commentsEnabled || !body.trim()
														}
													>
														{sending
															? "送信中…"
															: !data.commentsEnabled
																? "コメントの受付は停止中です"
																: changed
																	? `${target.speakerName}さんへ送信`
																	: commentError
																		? "再送信"
																		: "送信する"}
														<Icon name="send" />
													</button>
													{changed && (
														<button
															type="button"
															className="secondary full"
															disabled={sending || !talk}
															onClick={() => {
																setDraftTalk(talk ?? null);
																setCommentError("");
																setMessage(
																	"新しい発表に切り替えました。下書きは残っています。",
																);
															}}
														>
															新しい発表へ切り替える
														</button>
													)}
												</form>
											)}
										</section>
									</div>
								</>
							)}
						</>
					)}
				</div>
				{message && (
					<output className="toast" aria-live="polite">
						{message}
					</output>
				)}
			</div>
		</WorkspaceShell>
	);
}

function Icon({ name }: { name: string }) {
	return (
		<span className="mi" aria-hidden="true">
			{name}
		</span>
	);
}
