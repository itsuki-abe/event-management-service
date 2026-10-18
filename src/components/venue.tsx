import { ChevronRight, Copy, MapPin, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { type Participation, participationApi } from "../lib/participation";
import { WorkspaceShell } from "./workspace";

type Guide = { id: number; category: string; title: string; content: string };

export function VenuePage({ eventId }: { eventId: string }) {
	const [data, setData] = useState<{
		event: { name: string };
		guides: Guide[];
	} | null>(null);
	const [selected, setSelected] = useState<number | null>(null);
	const [error, setError] = useState("");
	const [feedback, setFeedback] = useState("");
	useEffect(() => {
		participationApi<{ event: { name: string }; guides: Guide[] }>(
			eventId,
			"guide",
		)
			.then(setData)
			.catch((error) => setError(error.message));
	}, [eventId]);
	const current =
		data?.guides.find((item) => item.id === selected) ?? data?.guides[0];
	async function copy(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			setFeedback("内容をコピーしました。");
		} catch {
			setFeedback("コピーできませんでした。内容を選択してコピーしてください。");
		}
	}
	function content(item: Guide) {
		return (
			<>
				<p className="wc-guide-content">{item.content}</p>
				<button
					className="wc-button wc-secondary wc-guide-copy"
					type="button"
					onClick={() => void copy(item.content)}
				>
					<Copy size={18} aria-hidden="true" />
					内容をコピー
				</button>
			</>
		);
	}
	return (
		<WorkspaceShell section="guide" name={data?.event.name} eventId={eventId}>
			<div className="wc-page-heading">
				<h1>会場案内</h1>
				<p>必要な情報は、いつでもここに。</p>
			</div>
			{error ? (
				<p role="alert" className="wc-notice wc-error">
					{error}
				</p>
			) : !data ? (
				<p>会場案内を確認しています…</p>
			) : !current ? (
				<section className="wc-empty-panel">
					<MapPin size={38} aria-hidden="true" />
					<h2>会場案内は準備中です</h2>
					<p>お困りのときは、受付スタッフへお声がけください。</p>
					<a className="wc-button wc-secondary" href="/live">
						ライブを見る
					</a>
				</section>
			) : (
				<>
					<div className="wc-guide-layout">
						<nav className="wc-guide-list" aria-label="案内の項目">
							{data.guides.map((item) => (
								<button
									key={item.id}
									type="button"
									className={current.id === item.id ? "active" : undefined}
									aria-pressed={current.id === item.id}
									onClick={() => setSelected(item.id)}
								>
									<MapPin size={20} aria-hidden="true" />
									{item.title}
								</button>
							))}
						</nav>
						<section className="wc-guide-detail">
							<h2>{current.title}</h2>
							{content(current)}
						</section>
						{data.guides.map((item) => (
							<details key={item.id} className="wc-accordion">
								<summary>
									<MapPin size={23} aria-hidden="true" />
									<span>{item.title}</span>
									<ChevronRight size={20} aria-hidden="true" />
								</summary>
								<div>{content(item)}</div>
							</details>
						))}
					</div>
					{feedback && <output className="wc-copy-feedback">{feedback}</output>}
				</>
			)}
		</WorkspaceShell>
	);
}

export function TeamPage({ eventId }: { eventId: string }) {
	const [data, setData] = useState<Participation | null>(null);
	const [error, setError] = useState("");
	useEffect(() => {
		participationApi<Participation>(eventId, "session")
			.then(setData)
			.catch((error) => setError(error.message));
	}, [eventId]);
	return (
		<WorkspaceShell
			section="team"
			name={data?.event.name}
			eventId={eventId}
			identity={data?.participant?.nickname}
		>
			<div className="wc-team-layout">
				<section className="wc-team-intro">
					<span className="wc-eyebrow">WORKSHOP</span>
					<h1>
						チームで、
						<br />
						アイデアを形に。
					</h1>
					<img
						className="wc-hero-image"
						src="/images/workshop-commons-hero.png"
						alt="4人がテーブルを囲み共同制作しているイラスト"
					/>
					<p>
						少人数で話すと、もっとおもしろい。
						<br />
						一緒につくる仲間と、テーブルで会いましょう。
					</p>
				</section>
				<section className="wc-empty-panel">
					<Users size={42} aria-hidden="true" />
					<h2>
						チームの案内を
						<br />
						お待ちください
					</h2>
					{error ? (
						<p role="alert">{error}</p>
					) : (
						<p>
							{data?.participant && (
								<strong>
									{data.participant.nickname}さん
									<br />
								</strong>
							)}
							所属チーム・集合場所は、
							<br />
							運営からの案内をご確認ください。
						</p>
					)}
					<a
						className="wc-button wc-secondary wc-full"
						href={data?.participant ? "/live" : `/events/${eventId}`}
					>
						{data?.participant ? "ライブを見る" : "先に参加登録する"}
					</a>
				</section>
			</div>
		</WorkspaceShell>
	);
}
