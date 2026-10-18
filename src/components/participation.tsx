import { QRCodeSVG } from "qrcode.react";
import {
	type FormEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import {
	type Pairing,
	type PairingPreview,
	type Participant,
	type Participation,
	participationApi,
} from "../lib/participation";
import { type WorkspaceSection, WorkspaceShell } from "./workspace";
import { XProfileLink } from "./x-profile-link";

const errorMessage = (error: unknown) =>
	error instanceof Error
		? error.message
		: "通信に失敗しました。もう一度お試しください。";

export function EventShell({
	children,
	name,
	eventId,
	section = "registration",
	identity,
}: {
	children: React.ReactNode;
	name?: string;
	eventId?: string;
	section?: WorkspaceSection;
	identity?: string;
}) {
	return (
		<WorkspaceShell
			section={section}
			eventId={eventId}
			name={name}
			identity={identity}
			registrationOnly={section === "registration" && !identity}
		>
			<div className={`participation ${identity ? "is-registered" : ""}`}>
				<div className="event-content">
					<p className="eyebrow">
						{section === "qr"
							? "SCAN & JOIN"
							: section === "connect"
								? "CONNECT YOUR DEVICE"
								: "YOUR EVENT PASS"}
					</p>
					<p className="event-name">{name}</p>
					{children}
				</div>
			</div>
		</WorkspaceShell>
	);
}

function ProfileForm({
	participant,
	busy,
	onSave,
}: {
	participant?: Participant | null;
	busy: boolean;
	onSave: (body: {
		nickname: string;
		profile: string;
		xUsername: string;
	}) => void;
}) {
	function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		onSave({
			nickname: String(form.get("nickname") ?? ""),
			profile: String(form.get("profile") ?? ""),
			xUsername: String(form.get("xUsername") ?? ""),
		});
	}
	return (
		<form
			onSubmit={submit}
			className="stack"
			key={`${participant?.id}-${participant?.nickname}-${participant?.profile}-${participant?.xUsername}`}
		>
			<label>
				表示名 <span className="required">必須</span>
				<input
					name="nickname"
					autoComplete="nickname"
					required
					maxLength={40}
					defaultValue={participant?.nickname ?? ""}
					placeholder="会場で呼ばれたい名前"
				/>
			</label>
			<label>
				Xのプロフィール <span className="optional">任意</span>
				<input
					name="xUsername"
					autoComplete="off"
					autoCapitalize="none"
					autoCorrect="off"
					spellCheck={false}
					maxLength={200}
					defaultValue={participant?.xUsername ?? ""}
					placeholder="@your_name または https://x.com/your_name"
					aria-describedby="x-username-note"
				/>
				<span className="field-note" id="x-username-note">
					ユーザー名、またはX・TwitterのプロフィールURLを入力できます。入力しなくても参加できます。
				</span>
			</label>
			<label>
				自己紹介 <span className="optional">任意</span>
				<textarea
					name="profile"
					rows={3}
					maxLength={500}
					defaultValue={participant?.profile ?? ""}
					placeholder="興味のあること、今日話したいことなど"
				/>
				<span className="field-note">
					ほかの参加者に伝えたい内容を、500文字以内で。
				</span>
			</label>
			<p className="field-note">
				表示名・自己紹介・Xのプロフィールは、このイベントの登録済み参加者に公開されます。あとから編集・削除できます。
			</p>
			<button type="submit" disabled={busy}>
				{busy
					? "保存しています…"
					: participant
						? "プロフィールを保存"
						: "この名前で参加する →"}
			</button>
		</form>
	);
}

function CodeDisplay({
	eventId,
	pairing,
	onRefresh,
	busy,
}: {
	eventId: string;
	pairing: Pairing;
	onRefresh: () => void;
	busy: boolean;
}) {
	const [timestamp, setTimestamp] = useState(Date.now());
	useEffect(() => {
		const timer = setInterval(() => setTimestamp(Date.now()), 1000);
		return () => clearInterval(timer);
	}, []);
	const remaining = Math.max(
		0,
		pairing.expiresAt - Math.floor(timestamp / 1000),
	);
	const url = `${window.location.origin}/events/${eventId}#pair=${pairing.code}`;
	return (
		<div className="pairing-display">
			{remaining > 0 ? (
				<>
					<div className="qr-paper">
						<QRCodeSVG
							value={url}
							size={232}
							marginSize={2}
							level="M"
							title="スマホで読み取ってこの端末を接続"
						/>
					</div>
					<p className="expiry">
						有効期限 あと {Math.floor(remaining / 60)}:
						{String(remaining % 60).padStart(2, "0")}
					</p>
					<p className="muted">QRが読めないときは、スマホの参加ページに入力</p>
					<code className="pairing-code">{pairing.code}</code>
				</>
			) : (
				<div className="notice">
					<strong>コードの有効期限が切れました</strong>
					<p>新しいQRコードを表示して、もう一度読み取ってください。</p>
				</div>
			)}
			<button
				className="secondary"
				type="button"
				disabled={busy}
				onClick={onRefresh}
			>
				新しいコードを発行
			</button>
		</div>
	);
}

export function ParticipationPage({
	eventId,
	desktop = false,
}: {
	eventId: string;
	desktop?: boolean;
}) {
	const [data, setData] = useState<Participation | null>(null);
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");
	const [busy, setBusy] = useState(false);
	const writing = useRef(false);
	const generation = useRef(0);
	const [pairing, setPairing] = useState<Pairing | null>(null);
	const [code, setCode] = useState("");
	const [scannedCode, setScannedCode] = useState("");
	const [preview, setPreview] = useState<PairingPreview | null>(null);
	const [editing, setEditing] = useState(false);
	const [revokeId, setRevokeId] = useState<number | null>(null);
	const [origin, setOrigin] = useState("");
	const load = useCallback(async () => {
		try {
			setData(await participationApi<Participation>(eventId, "session"));
			setError("");
		} catch (error) {
			setError(errorMessage(error));
		}
	}, [eventId]);

	useEffect(() => {
		setOrigin(window.location.origin);
		const receiveCode = () => {
			const scanned = new URLSearchParams(window.location.hash.slice(1)).get(
				"pair",
			);
			if (!scanned) return;
			setCode(scanned);
			setScannedCode(scanned);
			window.history.replaceState(
				window.history.state,
				"",
				window.location.pathname + window.location.search,
			);
		};
		receiveCode();
		window.addEventListener("hashchange", receiveCode);
		void load();
		return () => window.removeEventListener("hashchange", receiveCode);
	}, [load]);

	useEffect(() => {
		if (!scannedCode || !data?.participant) return;
		let active = true;
		participationApi<PairingPreview>(eventId, "pairing/preview", {
			code: scannedCode,
		})
			.then((target) => {
				if (active) {
					setPreview(target);
					setScannedCode("");
				}
			})
			.catch((error) => {
				if (active) {
					setError(errorMessage(error));
					setScannedCode("");
				}
			});
		return () => {
			active = false;
		};
	}, [scannedCode, data?.participant, eventId]);

	useEffect(() => {
		if (!desktop) return;
		let stopped = false;
		let timer: ReturnType<typeof setTimeout>;
		const poll = async () => {
			const ticket = generation.current;
			if (writing.current) {
				if (!stopped) timer = setTimeout(poll, 2000);
				return;
			}
			try {
				const next = await participationApi<Participation>(eventId, "session");
				if (!stopped && !writing.current && ticket === generation.current) {
					setData(next);
					setError("");
					if (next.participant || !next.currentDeviceId) setPairing(null);
				}
			} catch (error) {
				if (!stopped && ticket === generation.current)
					setError(errorMessage(error));
			}
			if (!stopped) timer = setTimeout(poll, 2000);
		};
		timer = setTimeout(poll, 2000);
		return () => {
			stopped = true;
			clearTimeout(timer);
		};
	}, [desktop, eventId]);

	async function run(task: () => Promise<void>) {
		if (writing.current) return;
		writing.current = true;
		generation.current += 1;
		setBusy(true);
		setError("");
		setNotice("");
		try {
			await task();
		} catch (error) {
			setError(errorMessage(error));
		} finally {
			writing.current = false;
			setBusy(false);
		}
	}

	function saveProfile(body: {
		nickname: string;
		profile: string;
		xUsername: string;
	}) {
		void run(async () => {
			setData(
				await participationApi<Participation>(
					eventId,
					data?.participant ? "profile" : "register",
					body,
				),
			);
			setEditing(false);
			setNotice(
				data?.participant
					? "プロフィールを保存しました。"
					: "参加登録が完了しました。",
			);
		});
	}

	function issueCode() {
		void run(async () => {
			setPairing(await participationApi<Pairing>(eventId, "pairing", {}));
			setData(await participationApi<Participation>(eventId, "session"));
		});
	}

	function inspectCode(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		void run(async () => {
			setPreview(
				await participationApi<PairingPreview>(eventId, "pairing/preview", {
					code,
				}),
			);
		});
	}

	function confirmCode() {
		void run(async () => {
			try {
				setData(
					await participationApi<Participation>(eventId, "pairing/confirm", {
						code,
					}),
				);
				setCode("");
				setNotice("端末を接続しました。PC／Macの画面も確認してください。");
			} finally {
				setPreview(null);
			}
		});
	}

	function revokeDevice(id: number) {
		void run(async () => {
			setData(
				await participationApi<Participation>(eventId, "devices/revoke", {
					deviceId: id,
				}),
			);
			setRevokeId(null);
			setPairing(null);
			setNotice("端末の接続を解除しました。");
		});
	}

	return (
		<EventShell
			name={data?.event.name}
			eventId={eventId}
			section={desktop ? "connect" : "registration"}
			identity={data?.participant?.nickname}
		>
			{error && (
				<div role="alert" className="alert">
					<p>{error}</p>
					<button
						type="button"
						className="text-button"
						onClick={() => void load()}
					>
						参加状態を再確認
					</button>
				</div>
			)}
			{notice && <output className="success-message">{notice}</output>}
			{!data ? (
				<div className="card">
					<h1>
						{error
							? "イベントを確認できませんでした"
							: "イベントを確認しています…"}
					</h1>
					<p className="muted">
						会場のQRコード、または案内されたURLからお入りください。
					</p>
				</div>
			) : desktop && !data.participant ? (
				<>
					<div className="step-label">02 / CONNECT YOUR COMPUTER</div>
					<h1>
						このPCを、
						<br />
						あなたの参加者端末に。
					</h1>
					<p className="lead">
						参加登録したスマホでQRを読み取り、
						<br className="desktop-break" />
						スマホ側で接続を確定してください。
					</p>
					<section className="card centered">
						<span className="status-chip">接続待ち</span>
						{pairing ? (
							<CodeDisplay
								eventId={eventId}
								pairing={pairing}
								onRefresh={issueCode}
								busy={busy}
							/>
						) : (
							<div className="stack">
								<div className="device-illustration" aria-hidden="true">
									▱
								</div>
								<p>接続用のQRコードを、この画面に表示します。</p>
								<button type="button" disabled={busy} onClick={issueCode}>
									{busy ? "発行しています…" : "接続用QRを表示する"}
								</button>
							</div>
						)}
					</section>
					<p className="caption">
						ご自身のPC／Macで操作してください。共用の端末では接続しないでください。
					</p>
					<a className="back-link" href={`/events/${eventId}`}>
						スマホでの参加登録はこちら →
					</a>
				</>
			) : !data.participant ? (
				<>
					<div className="step-label">01 / JOIN THE EVENT</div>
					<h1>
						こんにちは。
						<br />
						まずは、表示名から。
					</h1>
					<p className="lead">
						会場で呼ばれたい名前で参加しましょう。
						<br />
						メールアドレスやパスワードは不要です。
					</p>
					{code && (
						<div className="notice">
							PCとの接続を受け付けました。先に参加登録を済ませてから、接続を確認してください。
						</div>
					)}
					<section className="card">
						<ProfileForm busy={busy} onSave={saveProfile} />
						<p className="privacy-note">
							登録状態はこのブラウザーに7日間保存されます。
							<br />
							Cookieを削除すると、この参加者への復帰はできません。
						</p>
					</section>
					<a className="back-link" href={`/events/${eventId}/connect`}>
						PC／Macを接続する方はこちら →
					</a>
				</>
			) : (
				<>
					<div className="step-label">
						{desktop ? "CONNECTED" : "YOU’RE IN"}
					</div>
					<h1>
						{desktop
							? "スマホと、つながりました。"
							: `${data.participant.nickname} さん、ようこそ。`}
					</h1>
					<p className="lead">
						{desktop
							? "このPCも、同じ参加者として利用できます。登壇する方は、発表者画面から画面共有を準備できます。"
							: "参加登録が完了しました。LTに反応したり、会場案内を確認したりできます。"}
					</p>
					{desktop && (
						<div className="button-row">
							<a className="button" href="/speaker">
								発表者画面を開く
							</a>
							<a className="button secondary" href="/">
								ホームへ
							</a>
						</div>
					)}
					{!desktop && (
						<div className="button-row">
							<a className="button" href="/screen">
								LTライブへ
							</a>
							<a className="button secondary" href={`/events/${eventId}/guide`}>
								会場案内
							</a>
						</div>
					)}
					<a className="back-link" href={`/events/${eventId}/participants`}>
						参加者一覧で、今日の仲間を見つける →
					</a>
					{preview ? (
						<section
							className="card confirmation"
							aria-labelledby="confirm-title"
						>
							<span className="status-chip">接続の確認</span>
							<h2 id="confirm-title">この端末を接続しますか？</h2>
							<p>
								<strong>{preview.deviceName}</strong> を「
								{data.participant.nickname}」さんの端末として接続します。
							</p>
							<p className="muted">
								自分のPC／Macに表示されているコードか確認してください。
							</p>
							<code className="pairing-code">{code}</code>
							<div className="button-row">
								<button type="button" disabled={busy} onClick={confirmCode}>
									この端末を接続する
								</button>
								<button
									type="button"
									className="secondary"
									disabled={busy}
									onClick={() => setPreview(null)}
								>
									キャンセル
								</button>
							</div>
						</section>
					) : (
						!desktop && (
							<details className="card" open={code ? true : undefined}>
								<summary className="section-heading">
									<h2>PC／Macでも使う（登壇する方など）</h2>
								</summary>
								<ol className="instructions">
									<li>
										自分のPC／Macで、次のURLを開きます。
										<div className="copy-field">
											<input
												aria-label="PCで開くURL"
												readOnly
												value={`${origin}/events/${eventId}/connect`}
												onFocus={(event) => event.currentTarget.select()}
											/>
											<button
												type="button"
												className="secondary"
												onClick={() =>
													void run(async () => {
														await navigator.clipboard.writeText(
															`${origin}/events/${eventId}/connect`,
														);
														setNotice("PCで開くURLをコピーしました。");
													})
												}
											>
												コピー
											</button>
										</div>
									</li>
									<li>PCに表示されたQRを、スマホのカメラで読み取ります。</li>
									<li>スマホで接続先を確認して、接続を確定します。</li>
								</ol>
								<form className="stack code-entry" onSubmit={inspectCode}>
									<label>
										QRが読めない場合は、PCのコードを入力
										<input
											name="code"
											autoComplete="off"
											autoCapitalize="characters"
											spellCheck={false}
											maxLength={32}
											required
											value={code}
											placeholder="XXXX-XXXX-XXXX-XXXX"
											onChange={(event) => setCode(event.target.value)}
										/>
									</label>
									<button type="submit" className="secondary" disabled={busy}>
										{busy ? "確認しています…" : "接続する端末を確認"}
									</button>
								</form>
							</details>
						)
					)}
					<section className="card">
						<div className="section-heading">
							<h2>あなたのプロフィール</h2>
							<button
								className="text-button"
								type="button"
								disabled={busy}
								onClick={() => setEditing(!editing)}
							>
								{editing ? "閉じる" : "編集"}
							</button>
						</div>
						{editing ? (
							<ProfileForm
								participant={data.participant}
								busy={busy}
								onSave={saveProfile}
							/>
						) : (
							<>
								<p className="profile-name">{data.participant.nickname}</p>
								<p className="profile-body">
									{data.participant.profile ||
										"自己紹介はまだ登録されていません。"}
								</p>
								{data.participant.xUsername && (
									<XProfileLink
										username={data.participant.xUsername}
										nickname={data.participant.nickname}
									/>
								)}
							</>
						)}
					</section>
					<section className="card">
						<div className="section-heading">
							<h2>接続済みの端末</h2>
							<span className="count">{data.devices.length} 台</span>
						</div>
						<ul className="device-list">
							{data.devices.map((device) => (
								<li key={device.id}>
									<div>
										<strong>{device.name}</strong>
										<span className="muted">
											{" "}
											· 端末 {device.id}
											{device.current ? " · この端末" : ""}
										</span>
									</div>
									<button
										type="button"
										className="text-button danger"
										disabled={busy}
										onClick={() => setRevokeId(device.id)}
									>
										接続解除
									</button>
								</li>
							))}
						</ul>
						{revokeId !== null && (
							<div className="notice">
								<p>
									{revokeId === data.currentDeviceId
										? "この端末の接続を解除すると、このブラウザーでは参加状態を失います。ほかに接続済みの端末がなければ、再登録が必要です。"
										: "この端末は参加者情報にアクセスできなくなります。"}
								</p>
								<div className="button-row">
									<button
										type="button"
										disabled={busy}
										onClick={() => revokeDevice(revokeId)}
									>
										接続を解除する
									</button>
									<button
										className="secondary"
										type="button"
										disabled={busy}
										onClick={() => setRevokeId(null)}
									>
										キャンセル
									</button>
								</div>
							</div>
						)}
					</section>
				</>
			)}
		</EventShell>
	);
}

export function VenueQrPage({ eventId }: { eventId: string }) {
	const [data, setData] = useState<Participation | null>(null);
	const [url, setUrl] = useState("");
	const [error, setError] = useState("");
	useEffect(() => {
		setUrl(`${window.location.origin}/events/${eventId}`);
		participationApi<Participation>(eventId, "session")
			.then(setData)
			.catch((error) => setError(errorMessage(error)));
	}, [eventId]);
	return (
		<EventShell name={data?.event.name} eventId={eventId} section="qr">
			<div className="venue-poster">
				<span className="step-label">SCAN & JOIN</span>
				<h1>
					今日の出会いは、
					<br />
					ここから。
				</h1>
				<p className="lead">
					スマホのカメラで読み取って、
					<br />
					イベントに参加しましょう。
				</p>
				{error ? (
					<p role="alert" className="alert">
						{error}
					</p>
				) : data && url ? (
					<>
						<div className="qr-paper venue-qr">
							<QRCodeSVG
								value={url}
								size={280}
								marginSize={2}
								level="M"
								title="イベント参加用QRコード"
							/>
						</div>
						<p className="poster-url">{url}</p>
						<p className="muted">名前を登録するだけで参加できます</p>
						<div className="button-row no-print">
							<a className="button" href={url}>
								参加ページを開く
							</a>
							<button
								type="button"
								className="secondary"
								onClick={() => window.print()}
							>
								このQRを印刷
							</button>
						</div>
					</>
				) : (
					<p>QRを準備しています…</p>
				)}
				<p className="caption">メールアドレス・パスワード不要</p>
			</div>
		</EventShell>
	);
}
