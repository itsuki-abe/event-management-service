import { useCallback, useEffect, useRef, useState } from "react";
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
	token: string,
) {
	const [data, setData] = useState<EngagementSnapshot | null>(null);
	const [error, setError] = useState("");
	const sequence = useRef(0);
	const refresh = useCallback(async () => {
		if (admin && !token) return;
		const seq = ++sequence.current;
		const params = new URLSearchParams({ eventId: String(eventId) });
		if (talkId) params.set("talkId", String(talkId));
		if (admin) params.set("admin", "1");
		try {
			const result = await api<EngagementSnapshot>(
				`/api/engagement?${params}`,
				{ headers: admin ? { Authorization: `Bearer ${token}` } : undefined },
			);
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
	}, [eventId, talkId, admin, token]);
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
	const [tokenInput, setTokenInput] = useState("");
	const [token, setToken] = useState("");
	const { data, error, refresh } = useSnapshot(
		eventId,
		viewTalkId,
		admin,
		token,
	);
	const [displayName, setDisplayName] = useState("");
	const [body, setBody] = useState("");
	const [draftTalk, setDraftTalk] = useState<Talk | null>(null);
	const [message, setMessage] = useState("");
	const [commentError, setCommentError] = useState("");
	const [nameDialogOpen, setNameDialogOpen] = useState(false);
	const [nameDraft, setNameDraft] = useState("");
	const [now, setNow] = useState(0);
	const nameDialog = useRef<HTMLDialogElement>(null);
	useEffect(() => {
		setNow(Date.now());
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, []);
	useEffect(() => {
		if (nameDialogOpen) nameDialog.current?.showModal();
		else nameDialog.current?.close();
	}, [nameDialogOpen]);
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
				...(admin ? { Authorization: `Bearer ${token}` } : {}),
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
	async function sendComment(name = displayName) {
		if (!target || sending) return;
		setSending(true);
		setMessage("");
		setCommentError("");
		try {
			await post({
				action: "comment",
				talkId: target.id,
				displayName: name,
				body,
			});
			setDisplayName(name);
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
		<div className={`commons-app ${admin ? "operator" : ""}`}>
			<header className="site-header">
				<div className="brand">
					WORKSHOP COMMONS<small>つくる、つながる</small>
				</div>
				<nav className="header-nav" aria-label="メインメニュー">
					<a
						className={!admin ? "active" : ""}
						aria-current={!admin ? "page" : undefined}
						href={`/?eventId=${eventId}`}
					>
						LTライブ
					</a>
					<a
						className={admin ? "active" : ""}
						aria-current={admin ? "page" : undefined}
						href={`/admin?eventId=${eventId}`}
					>
						コメント管理
					</a>
				</nav>
				<span className="event-date">
					{data?.event.title || "イベントへようこそ"}
				</span>
			</header>
			<main className="page">
				{admin && !token ? (
					<section className="login-panel">
						<span className="badge blue">運営画面</span>
						<h1>コメントを、安心して届ける。</h1>
						<p className="muted">
							受付の切り替えやコメントの管理はこちらから。
						</p>
						<form
							onSubmit={(event) => {
								event.preventDefault();
								setToken(tokenInput.trim());
								setTokenInput("");
							}}
						>
							<label htmlFor="admin-token">運営用キー</label>
							<input
								id="admin-token"
								type="password"
								value={tokenInput}
								onChange={(event) => setTokenInput(event.target.value)}
								required
								autoComplete="off"
							/>
							<button type="submit" className="primary full">
								接続する
								<Icon name="arrow_forward" />
							</button>
						</form>
					</section>
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
									{admin && (
										<button
											className="text-button"
											type="button"
											onClick={() => setToken("")}
										>
											運営用キーを入力し直す
										</button>
									)}
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
											<h1>コメント管理</h1>
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
															{Array.from(talk.speakerName)[0]}
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
															disabled={admin || reacting}
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
																commentsProjectionEnabled: event.target.checked,
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
										{!admin && target && (
											<form
												className="composer"
												onSubmit={(event) => {
													event.preventDefault();
													if (!displayName.trim()) {
														setNameDialogOpen(true);
													} else void sendComment();
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
														{displayName ? (
															<button
																type="button"
																className="text-button"
																onClick={() => {
																	setNameDraft(displayName);
																	setNameDialogOpen(true);
																}}
															>
																{displayName}として投稿
																<Icon name="edit" />
															</button>
														) : (
															"初回の投稿時に表示名を入力"
														)}
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
								<footer className="page-footer">
									<span>WORKSHOP COMMONS · つくる、つながる</span>
									{admin && token ? (
										<button
											className="text-button"
											type="button"
											onClick={() => {
												setToken("");
												setMessage("");
											}}
										>
											運営接続を終了
										</button>
									) : (
										<a href={`/admin?eventId=${eventId}`}>
											運営の方はこちら
											<Icon name="arrow_forward" />
										</a>
									)}
								</footer>
							</>
						)}
					</>
				)}
			</main>
			<nav className="bottom-nav" aria-label="画面メニュー">
				<a
					href={`/?eventId=${eventId}`}
					className={!admin ? "active" : ""}
					aria-current={!admin ? "page" : undefined}
				>
					<Icon name="chat_bubble" />
					<span>ライブ</span>
				</a>
				<a
					href={`/admin?eventId=${eventId}`}
					className={admin ? "active" : ""}
					aria-current={admin ? "page" : undefined}
				>
					<Icon name="admin_panel_settings" />
					<span>コメント管理</span>
				</a>
			</nav>
			{message && (
				<output className="toast" aria-live="polite">
					{message}
				</output>
			)}
			<dialog
				ref={nameDialog}
				className="name-sheet"
				onCancel={() => setNameDialogOpen(false)}
				onClose={() => setNameDialogOpen(false)}
				aria-labelledby="name-title"
			>
				<form
					onSubmit={(event) => {
						event.preventDefault();
						if (!nameDraft.trim()) return;
						setDisplayName(nameDraft.trim());
						setNameDialogOpen(false);
						if (body.trim() && data?.commentsEnabled)
							void sendComment(nameDraft.trim());
					}}
				>
					<h2 id="name-title">コメントする名前</h2>
					<p className="muted">
						閲覧とリアクションは
						<br />
						名前なしで使えます。
					</p>
					<label htmlFor="display-name">表示名</label>
					<input
						id="display-name"
						value={nameDraft}
						onChange={(event) =>
							setNameDraft(Array.from(event.target.value).slice(0, 40).join(""))
						}
						placeholder="例：山田"
						required
						autoComplete="nickname"
					/>
					<p className="subtle-tip">コメントと一緒に表示されます。</p>
					<button type="submit" className="primary full">
						{body.trim() ? "この名前で送信" : "この名前を使う"}
						<Icon name="arrow_forward" />
					</button>
					<button
						type="button"
						className="secondary full"
						onClick={() => setNameDialogOpen(false)}
					>
						戻る
					</button>
				</form>
			</dialog>
		</div>
	);
}

function Icon({ name }: { name: string }) {
	return (
		<span className="mi" aria-hidden="true">
			{name}
		</span>
	);
}
