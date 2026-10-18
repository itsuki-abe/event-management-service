import { ArrowLeft, Check, Eye, EyeOff, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { ParticipationApiError, participationApi } from "../lib/participation";
import {
	decodeWifi,
	type Guide,
	type GuideCategory,
	guideCategories,
} from "../lib/venue";
import { WorkspaceShell } from "./workspace";
import "../guide-admin.css";

type Draft = Pick<Guide, "category" | "title" | "content" | "isVisible">;
type GuideData = { event: { id: number; name: string }; guides: Guide[] };

function draftsFrom(guides: Guide[]): Draft[] {
	return guideCategories.map(({ category, title }) => {
		const existing = guides.find((guide) => guide.category === category);
		return {
			category,
			title: existing?.title ?? title,
			content:
				existing?.content ??
				(category === "wifi"
					? JSON.stringify({ ssid: "", password: "", note: "" })
					: ""),
			isVisible: existing?.isVisible ?? false,
		};
	});
}

function hasContent(draft: Draft) {
	return Boolean(
		draft.title.trim() &&
			(draft.category === "wifi"
				? decodeWifi(draft.content)?.ssid.trim()
				: draft.content.trim()),
	);
}

export function GuideAdminPage({ eventId }: { eventId: string }) {
	const [data, setData] = useState<GuideData | null>(null);
	const [drafts, setDrafts] = useState<Draft[]>([]);
	const [saved, setSaved] = useState("");
	const [selected, setSelected] = useState<GuideCategory>("notice");
	const [error, setError] = useState("");
	const [denied, setDenied] = useState(false);
	const [message, setMessage] = useState("");
	const [loading, setLoading] = useState(true);
	const [busy, setBusy] = useState(false);
	const [attempt, setAttempt] = useState(0);
	const dirty = drafts.length > 0 && JSON.stringify(drafts) !== saved;
	// biome-ignore lint/correctness/useExhaustiveDependencies: The retry counter intentionally triggers a fresh request.
	useEffect(() => {
		let active = true;
		setLoading(true);
		participationApi<GuideData>(eventId, "guide/manage")
			.then((result) => {
				if (!active) return;
				const next = draftsFrom(result.guides);
				setData(result);
				setDrafts(next);
				setSaved(JSON.stringify(next));
				setError("");
				setDenied(false);
			})
			.catch((failure) => {
				if (active) {
					setError(
						failure instanceof Error
							? failure.message
							: "案内を取得できませんでした。",
					);
					setDenied(
						failure instanceof ParticipationApiError && failure.status === 401,
					);
				}
			})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => {
			active = false;
		};
	}, [eventId, attempt]);
	useEffect(() => {
		if (!dirty) return;
		const warn = (event: BeforeUnloadEvent) => {
			event.preventDefault();
		};
		window.addEventListener("beforeunload", warn);
		return () => window.removeEventListener("beforeunload", warn);
	}, [dirty]);
	function update(fields: Partial<Draft>) {
		setDrafts((items) =>
			items.map((item) =>
				item.category === selected ? { ...item, ...fields } : item,
			),
		);
		setMessage("");
	}
	async function save() {
		setBusy(true);
		setError("");
		setMessage("");
		try {
			const result = await participationApi<GuideData>(
				eventId,
				"guide/manage",
				{ guides: drafts },
			);
			const next = draftsFrom(result.guides);
			setData(result);
			setDrafts(next);
			setSaved(JSON.stringify(next));
			setMessage("会場案内を保存しました。参加者画面に反映されます。");
		} catch (failure) {
			setError(
				failure instanceof Error
					? failure.message
					: "保存できませんでした。もう一度お試しください。",
			);
		} finally {
			setBusy(false);
		}
	}
	const current = drafts.find((draft) => draft.category === selected);
	const definition = guideCategories.find((item) => item.category === selected);
	const wifi = current ? decodeWifi(current.content) : null;
	return (
		<WorkspaceShell section="admin" name={data?.event.name} eventId={eventId}>
			<div className="vg-admin-heading">
				<div className="wc-page-heading">
					<a className="vg-back" href="/admin">
						<ArrowLeft size={17} aria-hidden="true" />
						LT進行に戻る
					</a>
					<h1>会場案内の設定</h1>
					<p>会場で必要な情報を、参加者の手元へ。</p>
				</div>
				<a
					className="wc-button wc-secondary"
					href={`/events/${eventId}/guide`}
					target="_blank"
					rel="noreferrer"
				>
					<Eye size={18} aria-hidden="true" />
					参加者画面を開く
				</a>
			</div>
			{error && (
				<div className="wc-notice wc-error" role="alert">
					<p>{error}</p>
				</div>
			)}
			{loading ? (
				<output>運営権限と案内を確認しています…</output>
			) : !data ? (
				<section className="wc-empty-panel">
					<h2>
						{denied
							? "運営用リンクから開いてください"
							: "会場案内を取得できませんでした"}
					</h2>
					<p>
						{denied
							? "運営チームのリンクを開いたあと、この画面に戻ってください。"
							: "接続状況とイベントのURLを確認して、もう一度お試しください。"}
					</p>
					<button
						className="wc-button wc-secondary"
						type="button"
						onClick={() => setAttempt((value) => value + 1)}
					>
						もう一度確認する
					</button>
				</section>
			) : (
				current && (
					<form
						onSubmit={(event) => {
							event.preventDefault();
							void save();
						}}
					>
						<div className="vg-admin-layout">
							<nav className="vg-admin-menu" aria-label="設定する案内">
								{guideCategories.map((item) => {
									const draft = drafts.find(
										(entry) => entry.category === item.category,
									);
									const visible = draft?.isVisible && hasContent(draft);
									return (
										<button
											key={item.category}
											type="button"
											aria-pressed={selected === item.category}
											onClick={() => setSelected(item.category)}
										>
											<span>{item.title}</span>
											<small className={visible ? "vg-published" : ""}>
												{visible
													? "公開"
													: draft && hasContent(draft)
														? "非表示"
														: "未設定"}
											</small>
										</button>
									);
								})}
							</nav>
							<fieldset className="vg-editor" disabled={busy}>
								<legend className="vg-sr-only">
									{definition?.title}の設定
								</legend>
								<div className="vg-editor-heading">
									<h2>{definition?.title}</h2>
									<span className="wc-badge blue">
										{guideCategories.findIndex(
											(item) => item.category === selected,
										) + 1}{" "}
										/ {guideCategories.length}
									</span>
								</div>
								<p className="wc-muted wc-small">{definition?.description}</p>
								<label className="vg-publish-toggle">
									<input
										type="checkbox"
										checked={current.isVisible}
										onChange={(event) =>
											update({ isVisible: event.target.checked })
										}
									/>
									<span>
										{current.isVisible ? (
											<Eye size={19} aria-hidden="true" />
										) : (
											<EyeOff size={19} aria-hidden="true" />
										)}
										参加者に公開する
									</span>
								</label>
								<label className="vg-field">
									見出し
									<input
										value={current.title}
										maxLength={100}
										onChange={(event) => update({ title: event.target.value })}
									/>
								</label>
								{selected === "wifi" ? (
									<>
										{(
											[
												["ssid", "ネットワーク名（SSID）"],
												["password", "パスワード"],
												["note", "接続時の補足"],
											] as const
										).map(([field, label]) => (
											<div key={field} className="vg-field">
												<label htmlFor={`wifi-${field}`}>{label}</label>
												{field === "note" ? (
													<textarea
														id={`wifi-${field}`}
														value={wifi?.[field] ?? ""}
														rows={4}
														maxLength={1000}
														onChange={(event) =>
															update({
																content: JSON.stringify({
																	ssid: wifi?.ssid ?? "",
																	password: wifi?.password ?? "",
																	note: event.target.value,
																}),
															})
														}
													/>
												) : (
													<input
														id={`wifi-${field}`}
														value={wifi?.[field] ?? ""}
														maxLength={128}
														autoCapitalize="none"
														autoCorrect="off"
														spellCheck={false}
														onChange={(event) =>
															update({
																content: JSON.stringify({
																	ssid: wifi?.ssid ?? "",
																	password: wifi?.password ?? "",
																	note: wifi?.note ?? "",
																	[field]: event.target.value,
																}),
															})
														}
													/>
												)}
											</div>
										))}
										<p className="wc-muted wc-small">
											SSIDが未入力の場合は表示されません。パスワードなしのネットワークにも対応します。
										</p>
									</>
								) : (
									<label className="vg-field">
										{selected === "hashtag" ? "ハッシュタグ" : "案内の内容"}
										<textarea
											value={current.content}
											rows={selected === "hashtag" ? 3 : 8}
											maxLength={4000}
											onChange={(event) =>
												update({ content: event.target.value })
											}
										/>
									</label>
								)}
								<p className="vg-editor-note">
									未入力の項目は表示されません。変更は「変更を保存」で反映されます。
								</p>
							</fieldset>
						</div>
						<div className="vg-save-bar">
							<div>
								<strong>
									{dirty
										? "保存していない変更があります"
										: "変更は保存されています"}
								</strong>
								<p className="wc-small wc-muted">
									{
										drafts.filter(
											(draft) => draft.isVisible && hasContent(draft),
										).length
									}
									項目を公開
								</p>
							</div>
							<button
								className="wc-button wc-primary"
								type="submit"
								disabled={busy || !dirty}
							>
								<Save size={19} aria-hidden="true" />
								{busy ? "保存しています…" : "変更を保存"}
							</button>
						</div>
					</form>
				)
			)}
			<output className="vg-save-feedback" aria-live="polite">
				{message && (
					<>
						<Check size={18} aria-hidden="true" />
						{message}
					</>
				)}
			</output>
		</WorkspaceShell>
	);
}
