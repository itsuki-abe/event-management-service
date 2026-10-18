import { RefreshCw, Search, Users } from "lucide-react";
import { useEffect, useState } from "react";
import {
	type ParticipantDirectory,
	participationApi,
} from "../lib/participation";
import { WorkspaceShell } from "./workspace";
import { XProfileLink } from "./x-profile-link";

export function ParticipantsPage({ eventId }: { eventId: string }) {
	const [data, setData] = useState<ParticipantDirectory | null>(null);
	const [error, setError] = useState("");
	const [query, setQuery] = useState("");
	const [revision, setRevision] = useState(0);
	const [refreshing, setRefreshing] = useState(false);
	// biome-ignore lint/correctness/useExhaustiveDependencies: revision restarts polling when the user requests a refresh.
	useEffect(() => {
		let active = true;
		let timer: ReturnType<typeof setTimeout>;
		async function load() {
			setRefreshing(true);
			try {
				const next = await participationApi<ParticipantDirectory>(
					eventId,
					"participants",
				);
				if (active) {
					setData(next);
					setError("");
				}
			} catch (error) {
				if (active) {
					setData(null);
					setError(
						error instanceof Error
							? error.message
							: "参加者一覧を取得できませんでした。",
					);
				}
			} finally {
				if (active) {
					setRefreshing(false);
					timer = setTimeout(load, 15000);
				}
			}
		}
		void load();
		return () => {
			active = false;
			clearTimeout(timer);
		};
	}, [eventId, revision]);
	const search = query.trim().toLocaleLowerCase();
	const visible =
		data?.participants.filter((person) =>
			[person.nickname, person.profile, person.xUrl].some((value) =>
				value?.toLocaleLowerCase().includes(search),
			),
		) ?? [];
	const self = data?.participants.find(
		(person) => person.id === data.currentParticipantId,
	);
	return (
		<WorkspaceShell
			section="participants"
			eventId={eventId}
			name={data?.event.name}
			identity={self?.nickname}
		>
			<div className="wc-page-heading wc-directory-heading">
				<div>
					<span className="wc-eyebrow">MEET THE COMMUNITY</span>
					<h1>今日、ここにいる仲間。</h1>
					<p>気になる自己紹介から、会話のきっかけを。Xでもつながりましょう。</p>
				</div>
				<a className="wc-button wc-secondary" href={`/events/${eventId}`}>
					自分のプロフィールを編集
				</a>
			</div>
			{error ? (
				<section className="wc-empty-panel">
					<Users size={38} aria-hidden="true" />
					<h2>参加者一覧を確認できませんでした</h2>
					<p role="alert">{error}</p>
					<a className="wc-button wc-primary" href={`/events/${eventId}`}>
						参加登録・プロフィールへ
					</a>
					<button
						type="button"
						className="wc-button wc-secondary"
						onClick={() => setRevision((value) => value + 1)}
						disabled={refreshing}
					>
						もう一度確認
					</button>
				</section>
			) : !data ? (
				<output>参加者を確認しています…</output>
			) : (
				<>
					<div className="wc-directory-toolbar">
						<label className="wc-directory-search">
							<Search size={20} aria-hidden="true" />
							<span className="wc-visually-hidden">
								参加者を名前・自己紹介・Xで検索
							</span>
							<input
								type="search"
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								placeholder="名前・自己紹介・Xで探す"
							/>
						</label>
						<output>
							{search ? `${visible.length} / ` : ""}
							{data.participants.length}人が参加
						</output>
						<button
							className="wc-button wc-secondary"
							type="button"
							onClick={() => setRevision((value) => value + 1)}
							disabled={refreshing}
						>
							<RefreshCw size={17} aria-hidden="true" />
							更新
						</button>
					</div>
					{visible.length ? (
						<ul className="wc-directory-grid" aria-label="参加者一覧">
							{visible.map((person) => (
								<li key={person.id} className="wc-person-card">
									<div className="wc-person-heading">
										<span className="wc-person-initial" aria-hidden="true">
											{Array.from(person.nickname)[0]}
										</span>
										<h2>{person.nickname}</h2>
										{person.id === data.currentParticipantId && (
											<span className="wc-badge blue">あなた</span>
										)}
									</div>
									<p className="wc-person-bio">
										{person.profile ||
											"自己紹介はこれから。会場で声をかけてみましょう。"}
									</p>
									{person.xUrl ? (
										<XProfileLink
											url={person.xUrl}
											nickname={person.nickname}
										/>
									) : (
										<span className="wc-person-no-x">Xは未登録</span>
									)}
								</li>
							))}
						</ul>
					) : (
						<section className="wc-empty-panel">
							<Users size={36} aria-hidden="true" />
							<h2>
								{search
									? "一致する参加者が見つかりません"
									: "参加者はまだいません"}
							</h2>
							<p>
								{search
									? "別の名前やキーワードで探してみてください。"
									: "参加登録が完了すると、ここに表示されます。"}
							</p>
							{search && (
								<button
									type="button"
									className="wc-button wc-secondary"
									onClick={() => setQuery("")}
								>
									検索をクリア
								</button>
							)}
						</section>
					)}
					<p className="wc-directory-note">
						このイベントの登録済み参加者に公開しています。一覧は15秒ごとに更新されます。
					</p>
				</>
			)}
		</WorkspaceShell>
	);
}
