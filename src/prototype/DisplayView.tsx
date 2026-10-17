import { ArrowLeft, Maximize, Megaphone, Radio, Users } from "lucide-react";
import { useState } from "react";
import { getCurrentTicket, getQueuedTickets } from "./domain";
import { useEventStore } from "./store";

export function DisplayView() {
	const { state } = useEventStore();
	const current = getCurrentTicket(state);
	const queued = getQueuedTickets(state);
	const [error, setError] = useState("");
	async function fullscreen() {
		try {
			await document.documentElement.requestFullscreen();
		} catch {
			setError(
				"全画面表示は利用できません。ブラウザの全画面操作をお試しください。",
			);
		}
	}
	return (
		<main className="display-page">
			<header className="display-header">
				<a href="/" className="brand-mark" aria-label="管理画面へ">
					en<span>•</span>
				</a>
				<span>
					BUILD & CONNECT. <span className="display-divider">/</span> VOL. 01
				</span>
				<span className="display-demo">DEMO · 同一ブラウザ内同期</span>
			</header>
			<div className="display-content">
				{state.board.slide === "lt" && (
					<>
						<div className="display-kicker">
							<span className="live-dot" />
							{current?.status === "live"
								? "NOW ON STAGE"
								: current
									? "CALLING NEXT SPEAKER"
									: "READY FOR YOUR IDEA"}
						</div>
						<div className="display-ticket">
							#{current ? String(current.number).padStart(3, "0") : "---"}
						</div>
						<h1>{current?.title ?? "次のアイデアは、あなたから。"}</h1>
						<div className="display-speaker">
							{current
								? state.attendees.find((a) => a.id === current.attendeeId)?.name
								: "LTチケットを取って、ステージへ。"}
							{current && <span>{current.duration} MIN TALK</span>}
						</div>
						{current && (
							<div className="display-reactions">
								<span>👏 {current.reactions.clap}</span>
								<span>🔥 {current.reactions.fire}</span>
								<span>💚 {current.reactions.heart}</span>
							</div>
						)}
						<div className="display-next">
							<span>UP NEXT</span>
							{queued.slice(0, 2).map((t) => (
								<div key={t.id}>
									<strong>#{String(t.number).padStart(3, "0")}</strong>
									{t.title}
								</div>
							))}
							{!queued.length && <div>新しいアイデアをお待ちしています</div>}
						</div>
					</>
				)}
				{state.board.slide === "overview" && (
					<>
						<div className="display-kicker">
							<Users size={20} />
							WELCOME TO THE COMMUNITY
						</div>
						<h1 className="display-hero-title">
							BUILD &<br />
							<em>CONNECT.</em>
						</h1>
						<p className="display-subtitle">
							アイデアを持ち寄って、まだないものを作ろう。
						</p>
						<div className="display-numbers">
							<div>
								<strong>
									{state.attendees.filter((a) => a.checkedIn).length}
									<small>/{state.attendees.length}</small>
								</strong>
								<span>CHECKED IN</span>
							</div>
							<div>
								<strong>{state.teams.length}</strong>
								<span>TEAMS</span>
							</div>
							<div>
								<strong>{queued.length}</strong>
								<span>WAITING TALKS</span>
							</div>
						</div>
					</>
				)}
				{state.board.slide === "teams" && (
					<>
						<div className="display-kicker">MEET YOUR TEAM</div>
						<h1>ちがう得意を、ひとつに。</h1>
						<div className="display-teams">
							{state.teams.map((team, i) => (
								<section key={team.id}>
									<span>TEAM {String(i + 1).padStart(2, "0")}</span>
									<h2>{team.name}</h2>
									{state.attendees
										.filter((a) => a.teamId === team.id)
										.map((a) => (
											<p key={a.id}>{a.name}</p>
										))}
								</section>
							))}
						</div>
						{!state.teams.length && (
							<p className="display-subtitle">チーム編成をお待ちください。</p>
						)}
					</>
				)}
				{state.board.slide === "announcement" && (
					<>
						<div className="display-kicker">
							<Megaphone size={23} />
							FROM THE ORGANIZERS
						</div>
						<span className="display-announce-icon">✳</span>
						<h1>{state.event.announcement || "つくる。話す。つながる。"}</h1>
						{!state.event.announcement && (
							<p className="display-subtitle">
								お知らせはまだありません。今日の出会いを楽しもう。
							</p>
						)}
					</>
				)}
			</div>
			{state.event.announcement && state.board.slide !== "announcement" && (
				<div className="display-announcement">
					<Megaphone size={22} />
					{state.event.announcement}
				</div>
			)}
			<footer className="display-footer">
				<a href="/">
					<ArrowLeft size={14} />
					管理画面
				</a>
				<span>
					<Radio size={13} />
					デモデータ / 外部端末への配信は未接続
				</span>
				<button type="button" onClick={fullscreen}>
					<Maximize size={15} />
					全画面表示
				</button>
			</footer>
			{error && (
				<p role="alert" className="display-error">
					{error}
				</p>
			)}
		</main>
	);
}
