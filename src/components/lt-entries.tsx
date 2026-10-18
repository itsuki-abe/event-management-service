import { useId, useRef, useState } from "react";
import { formatTime, type LiveAction, type LiveSnapshot } from "../lib/lt";

type Entry = LiveSnapshot["myEntries"][number];
type Props = {
	data: LiveSnapshot | null;
	connected: boolean;
	busy: boolean;
	error: string;
	run: (action: LiveAction) => Promise<boolean | undefined>;
};

function EntryForm({
	entry,
	disabled,
	onSave,
	onCancel,
}: {
	entry?: Entry;
	disabled: boolean;
	onSave: (fields: {
		title: string;
		durationSeconds: number;
	}) => Promise<boolean | undefined>;
	onCancel?: () => void;
}) {
	const durationHelpId = useId();
	return (
		<form
			className="entry-form"
			aria-label={entry ? "エントリーを編集" : "LTにエントリー"}
			onSubmit={async (event) => {
				event.preventDefault();
				const form = event.currentTarget;
				const fields = new FormData(form);
				const duration = form.elements.namedItem(
					"duration",
				) as HTMLInputElement;
				const match = /^(\d{1,3})(?::([0-5]?\d))?$/.exec(duration.value.trim());
				const durationSeconds = match
					? Number(match[1]) * 60 + Number(match[2] ?? 0)
					: 0;
				if (!durationSeconds || durationSeconds > 86400) {
					duration.setCustomValidity(
						"持ち時間は5や3:30の形式で入力してください。",
					);
					duration.reportValidity();
					return;
				}
				if (
					await onSave({ title: String(fields.get("title")), durationSeconds })
				)
					form.reset();
			}}
		>
			<label>
				発表タイトル
				<input
					name="title"
					required
					maxLength={200}
					defaultValue={entry?.title}
				/>
			</label>
			<label>
				持ち時間
				<input
					name="duration"
					required
					defaultValue={entry ? formatTime(entry.durationSeconds) : "5"}
					onInput={(event) => event.currentTarget.setCustomValidity("")}
					aria-describedby={durationHelpId}
				/>
				<small id={durationHelpId}>分で入力（例：5、3:30）</small>
			</label>
			<div className="row">
				<button type="submit" className="primary" disabled={disabled}>
					{entry ? "変更を保存" : "エントリーする"}
				</button>
				{onCancel && (
					<button
						type="button"
						className="secondary"
						onClick={onCancel}
						disabled={disabled}
					>
						編集をやめる
					</button>
				)}
			</div>
		</form>
	);
}

export function EntryPanel({ data, connected, busy, error, run }: Props) {
	const [editing, setEditing] = useState<number | null>(null);
	const [message, setMessage] = useState("");
	const requestId = useRef<string | null>(null);
	const disabled = busy || !connected;
	return (
		<section className="entry-panel" aria-label="LTエントリー">
			<div className="wc-page-heading">
				<h1>LTエントリー・発表順</h1>
				<p>
					発表を登録して、手元のPC・スマホで順番を確認できます。主催者の変更は自動で反映されます。
				</p>
			</div>
			{error && (
				<p className="notice error" role="alert">
					{error}
				</p>
			)}
			{message && <output className="notice">{message}</output>}
			{!data ? (
				<p>読み込み中…</p>
			) : !data.event ? (
				<p>イベントの準備をお待ちください。</p>
			) : !data.participantId ? (
				<div className="panel entry-card">
					<h2>参加登録してエントリー</h2>
					<p>
						登録済みの方は、登録したスマホとこのPCを接続すると同じ本人として確認できます。
					</p>
					<div className="row">
						<a className="primary" href={`/events/${data.event.id}`}>
							参加登録
						</a>
						<a className="secondary" href={`/events/${data.event.id}/connect`}>
							このPCを接続
						</a>
					</div>
				</div>
			) : (
				<div className="entry-layout">
					<div className="panel entry-card">
						<h2>LTにエントリー</h2>
						<p>
							新しい発表は末尾に追加されます。主催者が順番を変更したり、エントリーを拒否する場合があります。
						</p>
						<EntryForm
							disabled={disabled}
							onSave={async (fields) => {
								setMessage("");
								requestId.current ??= crypto.randomUUID();
								const ok = await run({
									action: "enterTalk",
									revision: data.revision,
									requestId: requestId.current,
									...fields,
								});
								if (ok) {
									requestId.current = null;
									setMessage(
										"エントリーしました。最新の発表順を確認してください。",
									);
								}
								return ok;
							}}
						/>
					</div>
					<section className="panel entry-card" aria-label="自分のエントリー">
						<h2>自分のエントリー</h2>
						{data.myEntries.length === 0 && <p>まだエントリーしていません。</p>}
						{data.myEntries.map((entry) => {
							const index = data.talks.findIndex(
								(talk) => talk.id === entry.id,
							);
							const editable =
								entry.entryStatus === "accepted" && entry.status === "pending";
							return (
								<article className="my-entry" key={entry.id}>
									<h3>{entry.title}</h3>
									<output
										className="entry-position"
										data-entry-status={entry.entryStatus}
									>
										{entry.entryStatus === "rejected"
											? "主催者がエントリーを拒否しました"
											: entry.entryStatus === "cancelled"
												? "エントリーを取り消しました"
												: `あなたの発表は ${index + 1}番目 / 全${data.talks.length}件`}
									</output>
									{entry.rejectionReason && (
										<p className="notice error">
											拒否理由：{entry.rejectionReason}
										</p>
									)}
									{entry.entryStatus === "accepted" && (
										<small>
											{entry.status === "pending"
												? "開始待ち"
												: entry.status === "ended"
													? "終了"
													: entry.status === "paused"
														? "一時停止中"
														: "発表中"}{" "}
											· 持ち時間 {formatTime(entry.durationSeconds)}
										</small>
									)}
									{editing === entry.id && editable ? (
										<EntryForm
											entry={entry}
											disabled={disabled}
											onCancel={() => setEditing(null)}
											onSave={async (fields) => {
												setMessage("");
												const ok = await run({
													action: "editEntry",
													revision: data.revision,
													talkId: entry.id,
													...fields,
												});
												if (ok) {
													setEditing(null);
													setMessage("エントリーを更新しました。");
												}
												return ok;
											}}
										/>
									) : (
										editable && (
											<div className="row">
												<button
													className="secondary"
													type="button"
													disabled={disabled}
													onClick={() => setEditing(entry.id)}
												>
													編集
												</button>
												<button
													className="danger"
													type="button"
													disabled={disabled}
													onClick={async () => {
														if (
															confirm(
																`「${entry.title}」のエントリーを取り消しますか？`,
															) &&
															(await run({
																action: "cancelEntry",
																revision: data.revision,
																talkId: entry.id,
															}))
														)
															setMessage("エントリーを取り消しました。");
													}}
												>
													取り消す
												</button>
											</div>
										)
									)}
								</article>
							);
						})}
					</section>
				</div>
			)}
		</section>
	);
}
