import {
	ArrowRight,
	BookOpen,
	Check,
	ChevronDown,
	CircleHelp,
	Compass,
	ExternalLink,
	Settings2,
	Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
	type GuideStep,
	type HelpSession,
	organizerSteps,
	participantSteps,
} from "../lib/usage-guide";
import { ScreenSharingGuide } from "./screen-sharing-guide";
import { WorkspaceShell } from "./workspace";
import "../usage-guide.css";

type Role = "participant" | "organizer";

const participantQuestions = [
	[
		"スマホだけでも参加できますか？",
		"はい。会場案内の確認、リアクション、コメント、参加者の検索はスマホで使えます。PCの接続は任意です。",
	],
	[
		"PCのQRを読み取れない・期限が切れたときは？",
		"PCで「新しいコードを発行」を押してください。QRが読めない場合は、PCに表示されたコードをスマホの参加ページに入力し、「接続する端末を確認」から接続を確定できます。",
	],
	[
		"発表する人は何を準備しますか？",
		"まず参加登録し、自分のPCを接続します。運営に発表者として登録してもらったら、「発表者」画面で「画面共有を準備する」を押し、ブラウザーで共有する画面を選びます。自分の順番になると会場に映ります。共有する画面は毎回自分で確認してください。",
	],
	[
		"コメントを送れません。どうしたらよいですか？",
		"発表が選ばれているか、コメントが受付中か確認してください。最初の投稿には表示名が必要です。通信エラーの場合は接続が戻ってから再送信してください。発表が変わった場合は送信先も確認します。",
	],
	[
		"登録した名前や接続した端末は、どこで変更できますか？",
		"画面上部のプロフィールから名前・自己紹介・Xを編集できます。同じページの「接続済みの端末」で、使わなくなった端末の接続を解除できます。",
	],
	[
		"登録したのに、もう一度登録画面が出ます。",
		"登録したときと同じブラウザーで開いてください。登録状態の保存期間は7日間です。Cookieの削除や期限切れで登録状態を失った場合は再登録が必要です。接続済みの別の端末が残っている場合は、そこからPCを接続できます。",
	],
];
const organizerQuestions = [
	[
		"会場はどこから追加しますか？",
		"「会場案内の設定」で、そのイベントのWi-Fi・トイレ・入退館などを入力します。住所やアクセス方法は「入退館」または「その他」に記載し、「参加者に公開する」をオンにして保存します。独立した会場一覧や、複数会場の登録画面はありません。",
	],
	[
		"保存した会場案内が参加者に表示されません。",
		"「参加者に公開する」がオンか、「変更を保存」を押したか確認してください。見出しと内容が空の項目は表示されません。Wi-FiはSSIDの入力も必要です。「参加者画面を開く」から確認できます。",
	],
	[
		"発表者の名前が選択肢に出ません。",
		"発表者に、同じイベントの参加用QRから参加登録してもらってください。登録済みの端末がある参加者が選択肢に表示されます。表示されないときは登録状態を確認してください。",
	],
	[
		"次の発表へ進んだのに、タイマーが動きません。",
		"「次の発表へ」は、現在の発表を終了し、次の発表を開始待ちにする操作です。発表者の準備と会場の表示を確認してから、あらためて「タイマー開始」を押してください。",
	],
	[
		"画面共有が映らないときは？",
		"発表者のPCが参加登録済みか、運営がその人を発表者として登録したか確認します。本人に「発表者」画面で共有を準備してもらい、運営側で対象の発表を選択してください。切断した場合は本人がもう一度画面を選びます。",
	],
	[
		"運営なのに、操作できません。",
		"運営用リンクを、操作したい端末とブラウザーで開き直してください。参加者としての登録と運営のログインは別です。このガイドの役割を切り替えても、操作権限は変わりません。",
	],
];

function GuideCard({ step, index }: { step: GuideStep; index: number }) {
	return (
		<article
			className="ug-step"
			id={step.id}
			aria-labelledby={`${step.id}-title`}
		>
			<div className="ug-step-heading">
				<span className="ug-step-number" aria-hidden="true">
					{String(index + 1).padStart(2, "0")}
				</span>
				<div>
					<h3 id={`${step.id}-title`}>{step.title}</h3>
					<p>{step.summary}</p>
				</div>
			</div>
			<ol className="ug-instructions">
				{step.steps.map((text) => (
					<li key={text}>{text}</li>
				))}
			</ol>
			<p className="ug-result">
				<Check size={18} aria-hidden="true" />
				<span>{step.result}</span>
			</p>
			{step.note && <p className="ug-note">{step.note}</p>}
			<a
				className="wc-button wc-secondary ug-action"
				href={step.link.href}
				target={step.link.newTab ? "_blank" : undefined}
				rel={step.link.newTab ? "noopener noreferrer" : undefined}
			>
				{step.link.label}
				{step.link.newTab ? (
					<>
						<ExternalLink size={17} aria-hidden="true" />
						<span className="ug-sr-only">（新しいタブで開く）</span>
					</>
				) : (
					<ArrowRight size={18} aria-hidden="true" />
				)}
			</a>
		</article>
	);
}

export function UsageGuidePage({
	eventId,
	role,
	welcome = false,
}: {
	eventId?: string;
	role?: Role;
	welcome?: boolean;
}) {
	const [session, setSession] = useState<HelpSession | null>(null);
	const [error, setError] = useState("");
	const [attempt, setAttempt] = useState(0);
	const [selected, setSelected] = useState<Role | null>(role ?? null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: Retry explicitly reloads the session.
	useEffect(() => {
		const controller = new AbortController();
		setError("");
		setSession(null);
		async function load() {
			try {
				const response = await fetch(
					`/api/help${eventId === undefined ? "" : `?eventId=${encodeURIComponent(eventId)}`}`,
					{ cache: "no-store", signal: controller.signal },
				);
				const data = (await response.json()) as HelpSession & {
					error?: string;
				};
				if (!response.ok)
					throw new Error(data.error ?? "参加状態を確認できませんでした。");
				if (!controller.signal.aborted) setSession(data as HelpSession);
			} catch (failure) {
				if (!controller.signal.aborted)
					setError(
						failure instanceof Error
							? failure.message
							: "接続を確認して、もう一度お試しください。",
					);
			}
		}
		void load();
		return () => controller.abort();
	}, [eventId, attempt]);
	const activeRole =
		selected ?? (session?.organizer ? "organizer" : "participant");
	const isOrganizer = activeRole === "organizer";
	const allowed =
		session && (isOrganizer ? session.organizer : Boolean(session.participant));
	const steps =
		session && allowed
			? isOrganizer
				? organizerSteps(session.event?.id ?? null)
				: participantSteps(session.event?.id ?? 1)
			: [];
	const roleTitle = isOrganizer ? "運営の使い方" : "参加者の使い方";
	const eventPath = session?.event ? `/events/${session.event.id}` : null;
	return (
		<WorkspaceShell
			section="help"
			eventId={session?.event?.id}
			name={session?.event?.name}
			identity={session?.participant?.nickname}
		>
			<div className="ug-page">
				<header className="ug-hero">
					<span className="ug-eyebrow">
						<BookOpen size={18} aria-hidden="true" /> はじめてでも、大丈夫。
					</span>
					<h1>使い方ガイド</h1>
					<p>
						どこを開いて、何をすればいいか。
						<br />
						あなたの役割に合わせて、順番にご案内します。
					</p>
					<fieldset className="ug-role-switch" aria-label="ガイドの役割">
						<button
							type="button"
							aria-pressed={!isOrganizer}
							onClick={() => setSelected("participant")}
						>
							<Users size={19} aria-hidden="true" />
							参加者の使い方
						</button>
						<button
							type="button"
							aria-pressed={isOrganizer}
							onClick={() => setSelected("organizer")}
						>
							<Settings2 size={19} aria-hidden="true" />
							運営の使い方
						</button>
					</fieldset>
				</header>
				{!session && !error && (
					<output className="ug-state" aria-live="polite">
						参加状態を確認しています…
					</output>
				)}
				{error && (
					<div className="ug-state">
						<p role="alert">{error}</p>
						<button
							className="wc-button wc-secondary"
							type="button"
							onClick={() => setAttempt((value) => value + 1)}
						>
							もう一度確認する
						</button>
						<a href="/">ホームに戻る</a>
					</div>
				)}
				{session && !allowed && (
					<section className="ug-state" aria-labelledby="ug-access-title">
						<CircleHelp size={32} aria-hidden="true" />
						<h2 id="ug-access-title">
							{isOrganizer
								? "運営用リンクから開いてください"
								: eventPath
									? "まずは参加登録をしましょう"
									: "イベントは準備中です"}
						</h2>
						<p>
							{isOrganizer
								? "運営チームから共有された運営用リンクを、このブラウザーで開くと運営向けの手順をご覧いただけます。"
								: eventPath
									? "会場で呼ばれたい名前を登録すると、参加者向けのガイドが開きます。メールアドレスやパスワードは不要です。"
									: "運営がイベントを作成したら、参加登録と使い方の案内をご利用いただけます。"}
						</p>
						{!isOrganizer && eventPath && (
							<a className="wc-button wc-primary" href={eventPath}>
								参加登録へ進む
								<ArrowRight size={18} aria-hidden="true" />
							</a>
						)}
						{isOrganizer && (
							<button
								className="wc-button wc-secondary"
								type="button"
								onClick={() => setSelected("participant")}
							>
								参加者の案内を見る
							</button>
						)}
						{!isOrganizer && session.organizer && eventPath && (
							<p>
								運営のログインは完了しています。参加者として使う場合は、参加登録も必要です。
							</p>
						)}
					</section>
				)}
				{session && allowed && (
					<>
						<section className="ug-start" aria-labelledby="ug-start-title">
							<div className="ug-start-icon">
								<Compass size={30} aria-hidden="true" />
							</div>
							<div>
								{welcome && !isOrganizer && (
									<p className="ug-welcome">参加登録が完了しました。</p>
								)}
								<h2 id="ug-start-title">
									{isOrganizer
										? "まずは、開催の準備から。"
										: `${session.participant?.nickname}さん、ようこそ。`}
								</h2>
								<p>
									{isOrganizer
										? session.event
											? "会場案内を公開し、参加用QRを用意しましょう。準備が済んだら、そのまま発表の進行へ進めます。"
											: "最初にイベントを作成しましょう。作成後に会場案内・受付・発表の準備へ進めます。"
										: "最初は会場案内を確認して、LTライブを開けば準備OK。必要な操作だけ、あとから読み返せます。"}
								</p>
								<a
									className="wc-button wc-primary"
									href={
										isOrganizer
											? session.event
												? `/admin/guide?eventId=${session.event.id}`
												: "/admin"
											: `${eventPath}/guide`
									}
								>
									{isOrganizer
										? session.event
											? "会場案内の準備を始める"
											: "イベントを作成する"
										: "会場案内を確認する"}
									<ArrowRight size={19} aria-hidden="true" />
								</a>
							</div>
						</section>
						<div className="ug-layout">
							<aside className="ug-index">
								<nav aria-label="使い方の目次">
									<p>このページの内容</p>
									{steps.map((step, index) => (
										<a key={step.id} href={`#${step.id}`}>
											<span>{String(index + 1).padStart(2, "0")}</span>
											{step.title}
										</a>
									))}
									<a href="#screen-sharing">画面共有のやり方</a>
									<a href="#questions">
										<CircleHelp size={17} aria-hidden="true" />
										困ったときは
									</a>
								</nav>
								<p>画面上部の「使い方」から、いつでもここに戻れます。</p>
							</aside>
							<div className="ug-content">
								<section aria-labelledby="ug-role-title">
									<div className="ug-section-heading">
										<h2 id="ug-role-title">{roleTitle}</h2>
										<p>
											{isOrganizer
												? "開催前の準備から、当日の進行まで。"
												: "スマホでできることから、順番に。"}
										</p>
									</div>
									<div className="ug-steps">
										{steps.map((step, index) => (
											<GuideCard step={step} index={index} key={step.id} />
										))}
									</div>
								</section>
								<p className="ug-note">
									LT進行・発表者・会場スクリーンは、最初に作成されたイベントが対象です。各画面のイベント名を確認してください。
								</p>
								<ScreenSharingGuide organizer={isOrganizer} />
								<section
									className="ug-questions"
									id="questions"
									aria-labelledby="ug-questions-title"
								>
									<div className="ug-section-heading">
										<h2 id="ug-questions-title">困ったときは</h2>
										<p>気になる質問を押すと、対処方法が開きます。</p>
									</div>
									{(isOrganizer
										? organizerQuestions
										: participantQuestions
									).map(([question, answer]) => (
										<details key={question}>
											<summary>
												{question}
												<ChevronDown size={19} aria-hidden="true" />
											</summary>
											<p>{answer}</p>
										</details>
									))}
								</section>
								<div className="ug-finish">
									<Check size={25} aria-hidden="true" />
									<h2>
										{isOrganizer
											? "準備ができたら、イベントを始めましょう。"
											: "準備ができたら、LTを楽しみましょう。"}
									</h2>
									<p>操作に迷ったら、いつでもこのガイドへ。</p>
									<a
										className="wc-button wc-primary"
										href={isOrganizer ? "/admin" : "/"}
									>
										{isOrganizer ? "LT進行へ進む" : "ホームへ進む"}
										<ArrowRight size={19} aria-hidden="true" />
									</a>
								</div>
							</div>
						</div>
					</>
				)}
			</div>
		</WorkspaceShell>
	);
}
