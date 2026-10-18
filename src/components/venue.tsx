import {
	ArrowLeft,
	Check,
	ChevronRight,
	Copy,
	Hash,
	Info,
	MapPin,
	Megaphone,
	Phone,
	RefreshCw,
	ShieldCheck,
	Toilet,
	Wifi,
} from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { participationApi } from "../lib/participation";
import { decodeWifi, type Guide, guideCategories } from "../lib/venue";
import { WorkspaceShell } from "./workspace";

type VenueData = { event: { id: number; name: string }; guides: Guide[] };
const guideIcons = {
	notice: Megaphone,
	wifi: Wifi,
	toilet: Toilet,
	access: MapPin,
	rules: ShieldCheck,
	contact: Phone,
	hashtag: Hash,
	other: Info,
};

function GuideIcon({ category }: { category: string }) {
	const Icon = guideIcons[category as keyof typeof guideIcons] ?? Info;
	return <Icon size={23} aria-hidden="true" />;
}

function categoryTitle(category: string) {
	return (
		guideCategories.find((item) => item.category === category)?.title ??
		"ご案内"
	);
}

function GuideText({ text }: { text: string }) {
	const nodes: ReactNode[] = [];
	const pattern = /(?:https?:\/\/|mailto:|tel:)[^\s<>"\u3000]+/gi;
	let previous = 0;
	for (const match of text.matchAll(pattern)) {
		const start = match.index ?? 0;
		const candidate = match[0].replace(/[.,!?;:、。！？）\])]+$/, "");
		try {
			const url = new URL(candidate);
			if (!["http:", "https:", "mailto:", "tel:"].includes(url.protocol))
				continue;
			nodes.push(text.slice(previous, start));
			nodes.push(
				<a key={start} href={candidate} rel="noreferrer">
					{candidate}
				</a>,
			);
			previous = start + candidate.length;
		} catch {
			/* Unrecognized addresses remain plain text. */
		}
	}
	nodes.push(text.slice(previous));
	return <p className="venue-text">{nodes}</p>;
}

function CopyValue({
	text,
	label,
	prominent = false,
}: {
	text: string;
	label: string;
	prominent?: boolean;
}) {
	const [feedback, setFeedback] = useState<{
		text: string;
		status: "idle" | "copied" | "failed";
	}>({ text, status: "idle" });
	const status = feedback.text === text ? feedback.status : "idle";
	const manual = useRef<HTMLTextAreaElement>(null);
	const id = useId();
	useEffect(() => {
		if (status === "failed") {
			manual.current?.focus();
			manual.current?.select();
		}
		if (status !== "copied") return;
		const timer = window.setTimeout(
			() => setFeedback((current) => ({ ...current, status: "idle" })),
			4000,
		);
		return () => window.clearTimeout(timer);
	}, [status]);
	async function copy() {
		setFeedback({ text, status: "idle" });
		try {
			if (!navigator.clipboard?.writeText)
				throw new Error("clipboard unavailable");
			await navigator.clipboard.writeText(text);
			setFeedback({ text, status: "copied" });
		} catch {
			setFeedback({ text, status: "failed" });
		}
	}
	return (
		<div className={`venue-copy${prominent ? " venue-copy-prominent" : ""}`}>
			<button
				type="button"
				className="venue-copy-button"
				onClick={() => void copy()}
				aria-label={`${label}をコピー`}
				aria-describedby={status !== "idle" ? id : undefined}
			>
				{status === "copied" ? (
					<Check size={18} aria-hidden="true" />
				) : (
					<Copy size={18} aria-hidden="true" />
				)}
				<span>{status === "copied" ? "コピー済み" : "コピー"}</span>
			</button>
			<output
				id={id}
				className={status === "failed" ? "venue-copy-message" : "venue-sr-only"}
				aria-live="polite"
			>
				{status === "copied"
					? `${label}をコピーしました。`
					: status === "failed"
						? "コピーできませんでした。下の内容を長押し、または Ctrl+C／⌘C でコピーしてください。"
						: ""}
			</output>
			{status === "failed" && (
				<textarea
					ref={manual}
					className="venue-manual-copy"
					readOnly
					value={text}
					aria-label={`${label}（手動コピー用）`}
					onFocus={(event) => event.currentTarget.select()}
					rows={2}
				/>
			)}
		</div>
	);
}

function GuideContent({ guide }: { guide: Guide }) {
	return (
		<div className="venue-guide-body">
			<GuideText text={guide.content} />
			<CopyValue
				text={guide.content}
				label={guide.title || categoryTitle(guide.category)}
			/>
		</div>
	);
}

export function WifiCard({ guide }: { guide: Guide }) {
	const wifi = decodeWifi(guide.content);
	if (!wifi) return null;
	return (
		<section className="venue-wifi" aria-labelledby={`wifi-${guide.id}`}>
			<div className="venue-section-title">
				<Wifi size={25} aria-hidden="true" />
				<div>
					<span className="venue-kicker">NETWORK</span>
					<h2 id={`wifi-${guide.id}`}>{guide.title || "会場のWi-Fi"}</h2>
				</div>
			</div>
			<dl className="venue-network-fields">
				{[
					{ label: "ネットワーク名（SSID）", value: wifi.ssid },
					{ label: "パスワード", value: wifi.password },
				]
					.filter((field) => field.value.length > 0)
					.map((field) => (
						<div className="venue-network-field" key={field.label}>
							<div>
								<dt>{field.label}</dt>
								<dd>
									<code>{field.value}</code>
								</dd>
							</div>
							<CopyValue text={field.value} label={field.label} prominent />
						</div>
					))}
			</dl>
			{wifi.password.length === 0 && (
				<p className="venue-open-network">パスワードは不要です</p>
			)}
			{wifi.note.trim() && (
				<div className="venue-wifi-note">
					<Info size={16} aria-hidden="true" />
					<GuideText text={wifi.note} />
				</div>
			)}
		</section>
	);
}

export function VenuePage({ eventId }: { eventId: string }) {
	const [state, setState] = useState<{
		eventId: string;
		data: VenueData | null;
		error: string;
		loading: boolean;
	}>({ eventId, data: null, error: "", loading: true });
	const reload = useRef<() => void>(() => {});
	const [selected, setSelected] = useState<string | null>(null);
	const data = state.eventId === eventId ? state.data : null;
	const error = state.eventId === eventId ? state.error : "";
	const loading = state.eventId !== eventId || state.loading;
	useEffect(() => {
		let cancelled = false;
		let pending = false;
		setState((previous) => ({
			eventId,
			data: previous.eventId === eventId ? previous.data : null,
			error: "",
			loading: true,
		}));
		async function refresh() {
			if (pending) return;
			pending = true;
			try {
				const next = await participationApi<VenueData>(eventId, "guide");
				if (!cancelled)
					setState({ eventId, data: next, error: "", loading: false });
			} catch (cause) {
				if (!cancelled)
					setState((previous) => ({
						...previous,
						loading: false,
						error:
							cause instanceof Error ? cause.message : "通信に失敗しました。",
					}));
			} finally {
				pending = false;
			}
		}
		const visibleRefresh = () => {
			if (!document.hidden) void refresh();
		};
		reload.current = () => {
			setState((previous) => ({ ...previous, loading: true }));
			void refresh();
		};
		void refresh();
		const timer = window.setInterval(visibleRefresh, 15000);
		window.addEventListener("focus", visibleRefresh);
		window.addEventListener("online", visibleRefresh);
		document.addEventListener("visibilitychange", visibleRefresh);
		return () => {
			cancelled = true;
			window.clearInterval(timer);
			window.removeEventListener("focus", visibleRefresh);
			window.removeEventListener("online", visibleRefresh);
			document.removeEventListener("visibilitychange", visibleRefresh);
		};
	}, [eventId]);
	const guides = (data?.guides ?? [])
		.filter((guide) => {
			if (!guide.isVisible || !guide.title.trim() || !guide.content.trim())
				return false;
			if (guide.category !== "wifi") return true;
			const wifi = decodeWifi(guide.content);
			return wifi && wifi.ssid.trim().length > 0;
		})
		.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
	const notice = guides.find((guide) => guide.category === "notice");
	const networks = guides.filter((guide) => guide.category === "wifi");
	const hashtags = guides.filter((guide) => guide.category === "hashtag");
	const details = guides.filter(
		(guide) =>
			guide.id !== notice?.id &&
			guide.category !== "wifi" &&
			guide.category !== "hashtag",
	);
	const current =
		details.find((guide) => guide.category === selected) ?? details[0];
	return (
		<WorkspaceShell section="guide" name={data?.event.name} eventId={eventId}>
			<div className="venue-page">
				<div className="venue-heading">
					<div>
						<span className="venue-kicker">VENUE GUIDE</span>
						<h1>会場案内</h1>
						<p>つながる準備も、ちょっとした確認も。</p>
					</div>
					<MapPin
						className="venue-heading-icon"
						size={42}
						strokeWidth={1.4}
						aria-hidden="true"
					/>
				</div>
				{error && (
					<div role="alert" className="venue-error">
						<div>
							<strong>
								{data
									? "最新情報を確認できませんでした"
									: "会場案内を読み込めませんでした"}
							</strong>
							<p>
								{data
									? "表示中の案内は最後に取得した内容です。接続が戻ると自動で更新します。"
									: error}
							</p>
						</div>
						<button
							type="button"
							className="venue-retry"
							disabled={loading}
							onClick={() => reload.current()}
						>
							<RefreshCw size={17} aria-hidden="true" />
							{loading ? "確認中…" : "再読み込み"}
						</button>
					</div>
				)}
				{!data && loading && (
					<output className="venue-loading" aria-live="polite">
						<RefreshCw size={22} aria-hidden="true" />
						<span>会場案内を確認しています…</span>
					</output>
				)}
				{data && guides.length === 0 && (
					<section className="venue-empty">
						<MapPin size={34} aria-hidden="true" />
						<h2>会場案内は準備中です</h2>
						<p>公開されると、ここに表示されます。</p>
						<p>お困りのときは、受付スタッフへお声がけください。</p>
					</section>
				)}
				{notice && (
					<section
						className="venue-notice"
						aria-labelledby="venue-notice-title"
					>
						<Megaphone size={24} aria-hidden="true" />
						<div>
							<span className="venue-kicker">運営からのお知らせ</span>
							<h2 id="venue-notice-title">{notice.title || "お知らせ"}</h2>
							<GuideText text={notice.content} />
						</div>
					</section>
				)}
				{(networks.length > 0 || hashtags.length > 0) && (
					<div
						className={`venue-quick${networks.length > 0 && hashtags.length > 0 ? " venue-quick-split" : ""}`}
					>
						{networks.length > 0 && (
							<div className="venue-networks">
								{networks.map((guide) => (
									<WifiCard key={guide.category} guide={guide} />
								))}
							</div>
						)}
						{hashtags.length > 0 && (
							<div className="venue-hashtags">
								{hashtags.map((guide) => (
									<section
										className="venue-hashtag"
										key={guide.category}
										aria-labelledby={`hashtag-${guide.id}`}
									>
										<Hash size={26} aria-hidden="true" />
										<span className="venue-kicker">SHARE THE MOMENT</span>
										<h2 id={`hashtag-${guide.id}`}>
											{guide.title || "ハッシュタグ"}
										</h2>
										<GuideText text={guide.content} />
										<CopyValue
											text={guide.content}
											label="ハッシュタグ"
											prominent
										/>
									</section>
								))}
							</div>
						)}
					</div>
				)}
				{current && (
					<section
						className="venue-information"
						aria-labelledby="venue-information-title"
					>
						<div className="venue-information-heading">
							<h2 id="venue-information-title">会場での過ごし方</h2>
							<span>知りたい項目を選んでください</span>
						</div>
						<div className="venue-detail-layout">
							<nav className="venue-index" aria-label="会場案内の項目">
								{details.map((guide) => (
									<button
										key={guide.category}
										type="button"
										aria-pressed={current.id === guide.id}
										aria-controls="venue-detail"
										className={current.id === guide.id ? "active" : undefined}
										onClick={() => setSelected(guide.category)}
									>
										<GuideIcon category={guide.category} />
										<span>
											<small>{categoryTitle(guide.category)}</small>
											{guide.title || categoryTitle(guide.category)}
										</span>
										<ChevronRight size={17} aria-hidden="true" />
									</button>
								))}
							</nav>
							<section
								id="venue-detail"
								className="venue-detail"
								aria-labelledby="venue-detail-title"
							>
								<div className="venue-detail-title">
									<GuideIcon category={current.category} />
									<h3 id="venue-detail-title">
										{current.title || categoryTitle(current.category)}
									</h3>
								</div>
								<GuideContent key={current.category} guide={current} />
							</section>
							<div className="venue-accordions">
								{details.map((guide) => (
									<details key={guide.category} className="venue-accordion">
										<summary>
											<GuideIcon category={guide.category} />
											<span>
												<small>{categoryTitle(guide.category)}</small>
												{guide.title || categoryTitle(guide.category)}
											</span>
											<ChevronRight size={20} aria-hidden="true" />
										</summary>
										<div className="venue-accordion-content">
											<GuideContent guide={guide} />
											<button
												type="button"
												className="venue-close"
												onClick={(event) => {
													const element =
														event.currentTarget.closest("details");
													if (element) {
														element.open = false;
														element.querySelector("summary")?.focus();
													}
												}}
											>
												<ArrowLeft size={16} aria-hidden="true" />
												閉じる
											</button>
										</div>
									</details>
								))}
							</div>
						</div>
					</section>
				)}
				{data && guides.length > 0 && (
					<p className="venue-update-note">
						<span aria-hidden="true" />
						運営が公開した案内を自動で更新します
					</p>
				)}
			</div>
		</WorkspaceShell>
	);
}
