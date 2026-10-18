let memory = {};
const clock = { remaining: 154000, phase: "running", start: Date.now() };
let lastReaction = 0;
let published = false;
const HERO = "/assets/commons/collaboration.png";

export function mountCommons(target, options = {}) {
	const realDocument = target.ownerDocument;
	const removers = [];
	const body = new Proxy(target, {
		get(t, k) {
			if (k === "className") return t.className;
			const v = t[k];
			return typeof v === "function" ? v.bind(t) : v;
		},
		set(t, k, v) {
			t[k] = k === "className" ? `commons-root ${v}` : v;
			return true;
		},
	});
	const document = new Proxy(realDocument, {
		get(d, k) {
			if (k === "body") return body;
			if (k === "getElementById")
				return (id) =>
					id === "app" ? target : target.querySelector(`#${CSS.escape(id)}`);
			if (k === "querySelector" || k === "querySelectorAll")
				return target[k].bind(target);
			if (k === "addEventListener")
				return (type, fn) => {
					target.addEventListener(type, fn);
					removers.push(() => target.removeEventListener(type, fn));
				};
			const v = d[k];
			return typeof v === "function" ? v.bind(d) : v;
		},
	});
	("use strict");
	const current = Object.assign(
		{ view: "home", device: "mobile", state: "normal" },
		{
			view: options.view || "home",
			device: window.innerWidth < 760 ? "mobile" : "desktop",
			state: "normal",
		},
	);
	let draft = "",
		displayName = "",
		draftTarget = "misaki",
		copyFeedback = "",
		commentSent = false,
		teamJoined = false,
		opPanel = "comments",
		opWaiting = false,
		opProjecting = false,
		opStarted = false,
		commentsOpen = true,
		hiddenComments = {},
		shareReady = false,
		localState = "",
		toastTimer;
	let lastComment = "";
	let reactions = [128, 92, 76, 58];
	const talks = {
		misaki: {
			name: "佐藤 あかり",
			short: "佐藤",
			title: "小さな自動化から始めよう",
			initial: "佐",
		},
		ken: {
			name: "田中 悠",
			short: "田中",
			title: "チームでつくる開発文化",
			initial: "鈴",
		},
	};
	const reactionNames = ["拍手", "いいね", "学び", "熱い"],
		reactionIcons = [
			"front_hand",
			"thumb_up",
			"lightbulb",
			"local_fire_department",
		],
		reactionColors = ["blue", "peach", "yellow", "apricot"];
	function e(t) {
		return String(t == null ? "" : t).replace(
			/[&<>"']/g,
			(c) =>
				({
					"&": "&amp;",
					"<": "&lt;",
					">": "&gt;",
					'"': "&quot;",
					"'": "&#39;",
				})[c],
		);
	}
	function icon(n) {
		return `<span class="mi" aria-hidden="true" style="--icon:url(/assets/icons/${n}.svg)"></span>`;
	}
	function button(text, action, cls, extra) {
		return `<button type="button" class="${cls || ""}" data-action="${action}" ${extra || ""}>${text}</button>`;
	}
	function status(text, cls) {
		return `<span class="badge ${cls || "blue"}">${text}</span>`;
	}
	function title(h, sub, extra) {
		return `<div class="page-heading"><div><h1>${h}</h1>${sub ? `<p class="muted">${sub}</p>` : ""}</div>${extra || ""}</div>`;
	}
	function hero() {
		return `<img class="hero-image" src="${HERO}" alt="4人がテーブルを囲み共同制作しているイラスト">`;
	}
	function nav() {
		const items = [
			["home", "home", "ホーム"],
			["guide", "location_on", "会場"],
			["live", "chat_bubble", "ライブ"],
			["team", "groups", "チーム"],
		];
		return items
			.map((a) =>
				button(
					`${icon(a[1])}<span>${a[2]}</span>`,
					"navigate",
					`${current.view === a[0] ? "active" : ""}`,
					`data-view="${a[0]}" aria-current="${current.view === a[0] ? "page" : "false"}"`,
				),
			)
			.join("");
	}
	function shell(content, extra) {
		document.body.className = `${current.device === "mobile" ? "mobile" : "desktop"} ${extra || ""}`;
		return `<header class="site-header"><div class="brand">WORKSHOP COMMONS<small>つくる、つながる</small></div><nav class="header-nav" aria-label="参加者メニュー">${nav()}</nav><details class="role-menu"><summary>表示を切り替える</summary><div><button data-action="navigate" data-view="home">参加者</button><button data-action="navigate" data-view="operator">運営</button><button data-action="navigate" data-view="presenter">発表者</button><button data-action="navigate" data-view="projection">会場スクリーン</button></div></details><span class="event-date">Tech Meetup · 2026.10.18（日）</span></header><main class="page-scroll"><div class="page">${content}</div></main><nav class="bottom-nav" aria-label="参加者メニュー">${nav()}</nav>`;
	}
	function currentNotice() {
		return `<div class="notice">${icon("info")}<span><strong>退出時は名札を受付へ</strong><br>ご協力をお願いします。</span></div>`;
	}
	function homepage() {
		return shell(
			`<div class="home-layout"><section class="home-intro"><div class="eyebrow">2026.10.18（日） · Tech Meetup</div>${hero()}<h1>LTを楽しもう</h1><p>仲間の学びから、次のアイデアが生まれる。<br>気になった発表へ、気軽に反応を送ってみよう。</p></section><section><div class="live-summary"><div class="row between">${status("発表中", "peach")}<div class="row"><span class="timer">02:34</span><span class="small muted">残り</span></div></div><h2>小さな自動化から<br>始めよう</h2><div class="row"><span class="initial">佐</span><span><strong>佐藤 あかり</strong><br><small class="muted">LT 03 / 08</small></span></div>${button(`ライブに参加 ${icon("arrow_forward")}`, "navigate", "primary full", 'data-view="live"')}</div><div class="quick-links">${button(`${icon("location_on")}<span class="text">会場案内<span class="muted">Wi-Fi・トイレ・入退館</span></span>${icon("chevron_right")}`, "navigate", "link-row", 'data-view="guide"')}${button(`${icon("groups")}<span class="text">チームを見る<span class="muted">所属先と集合場所</span></span>${icon("chevron_right")}`, "navigate", "link-row", 'data-view="team"')}</div></section></div><div class="home-notice">${currentNotice()}</div>`,
		);
	}
	const guideDefs = [
		{
			id: "wifi",
			icon: "wifi",
			title: "Wi-Fi",
			sub: "会場のネットワーク",
			body: () =>
				`<div class="credential"><div class="credential-label">SSID</div><div class="row between"><span class="credential-value">Meetup_Guest</span>${button(`${icon("content_copy")}コピー`, "copy", "copy-btn", 'data-value="Meetup_Guest" data-label="SSID"')}</div></div><div class="credential"><div class="credential-label">パスワード</div><div class="row between"><span class="credential-value">tech2026</span>${button(`${icon("content_copy")}コピー`, "copy", "copy-btn", 'data-value="tech2026" data-label="パスワード"')}</div></div><p class="small muted" style="margin-top:20px">会場内でご利用ください。接続できない場合は受付スタッフにお声がけください。</p><div class="guide-copy" aria-live="polite">${e(copyFeedback)}</div>`,
		},
		{
			id: "toilet",
			icon: "wc",
			title: "トイレ",
			sub: "3F・エレベーター奥",
			body: () =>
				'<div class="details-copy"><h3>3Fのエレベーター奥です</h3><p style="margin-top:16px">会場を出て右へ進み、エレベーターを過ぎた奥にあります。発表中も自由に出入りできます。</p><p class="muted">場所がわからないときは、受付スタッフへお声がけください。</p></div>',
		},
		{
			id: "entry",
			icon: "meeting_room",
			title: "入退館",
			sub: "再入館は受付へ",
			body: () =>
				`<div class="details-copy"><h3>入口・受付は3Fです</h3><p style="margin-top:16px">エレベーターで3Fへお越しください。会場入口の受付で名札をお渡しします。</p><h3>再入館するとき</h3><p style="margin-top:12px">名札を持って受付へお声がけください。</p><div class="notice">${icon("info")}<span>退出時は名札を受付へ返却してください。</span></div></div>`,
		},
		{
			id: "rules",
			icon: "checklist",
			title: "ハウスルール",
			sub: "飲食・撮影・立入について",
			body: () =>
				`<div class="details-copy"><h3>みんなが心地よく過ごすために</h3><ul><li>飲み物はふた付きの容器でお願いします。</li><li>撮影するときは、写る方へひと声かけてください。</li><li>関係者用エリアへの立入りはご遠慮ください。</li></ul><div class="credential"><div class="credential-label">SNSハッシュタグ</div><div class="row between"><strong>#TechMeetup</strong>${button(`${icon("content_copy")}コピー`, "copy", "copy-btn", 'data-value="#TechMeetup" data-label="ハッシュタグ"')}</div></div><p class="small muted" style="margin-top:16px">資料や写真の公開範囲は発表者にご確認ください。</p><div class="guide-copy" aria-live="polite">${e(copyFeedback)}</div></div>`,
		},
		{
			id: "help",
			icon: "support_agent",
			title: "お問い合わせ",
			sub: "受付スタッフへ",
			body: () =>
				'<div class="details-copy"><h3>困ったら受付へ</h3><p style="margin-top:16px">入口の受付にスタッフがいます。会場設備や体調についても遠慮なくお声がけください。</p></div>',
		},
	];
	let guideOpen = "wifi";
	function guide() {
		const selected = guideDefs.find((x) => x.id === guideOpen) || guideDefs[0];
		const menu = guideDefs
			.map((d) =>
				button(
					`${icon(d.icon)}<span class="text">${d.title}<span class="small muted" style="display:block;margin-top:4px">${d.sub}</span></span>${icon("chevron_right")}`,
					"guide-select",
					`guide-choice ${d.id === selected.id ? "active" : ""}`,
					`data-id="${d.id}"`,
				),
			)
			.join("");
		const accordions = guideDefs
			.map(
				(d) =>
					`<details class="accordion" data-guide="${d.id}" ${d.id === selected.id ? "open" : ""}><summary>${icon(d.icon)}<span class="text">${d.title}<small>${d.sub}</small></span>${icon("expand_more")}</summary><div class="accordion-content">${d.body()}</div></details>`,
			)
			.join("");
		return shell(
			`${title("会場案内", "必要な情報は、いつでもここに。", button(`${icon("arrow_back")}ライブへ`, "navigate", "soft", 'data-view="live"'))}<div style="margin-bottom:24px">${currentNotice()}</div><div class="guide-layout"><aside class="guide-list" aria-label="案内の項目">${menu}</aside><section class="guide-detail"><h2>${icon(selected.icon)} ${selected.title}</h2>${selected.body()}</section></div>${accordions}`,
		);
	}
	function reactionButtons() {
		return `<div class="reaction-grid">${reactionNames.map((n, i) => button(`${icon(reactionIcons[i])}<span><strong>${n}</strong><small data-count="${i}">${reactions[i]}</small></span>`, "reaction", `reaction ${reactionColors[i]}`, `data-index="${i}" aria-label="${n}を送る"`)).join("")}</div>`;
	}
	function commentRows(moderate) {
		const data = [
			["小林", "小", "14:20", "具体例があってわかりやすいです！"],
			["鈴木", "鈴", "14:21", "小さく始める工夫、参考になります。"],
		];
		if (commentSent)
			data.push([
				displayName || "山田",
				(displayName || "山田").slice(0, 1),
				"14:22",
				lastComment || "ありがとうございます！",
			]);
		return data
			.map((a, i) => {
				if (hiddenComments[i]) return "";
				return `<div class="comment"><span class="initial ${i === 1 ? "peach" : ""}">${e(a[1])}</span><div class="text"><div class="author"><span>${e(a[0])}</span><time>${a[2]}</time></div><p>${e(a[3])}</p></div>${moderate ? button("非表示", "hide-comment", "copy-btn", `data-index="${i}" aria-label="${e(a[0])}さんのコメントを非表示"`) : ""}</div>`;
			})
			.join("");
	}
	function nameSheet() {
		return `<div class="overlay" role="dialog" aria-modal="true" aria-labelledby="name-title"><div class="sheet"><h2 id="name-title">コメントする名前</h2><p class="muted">閲覧とリアクションは<br>名前なしで使えます。</p><label for="display-name">表示名</label><input id="display-name" value="${e(displayName || "山田")}" maxlength="30" placeholder="例：山田" autocomplete="nickname"><p class="small muted" style="margin-top:10px">コメントと一緒に表示されます。</p>${button(`この名前で送信 ${icon("arrow_forward")}`, "save-name", "primary full")}${button("戻る", "dismiss-name", "secondary full")}</div></div>`;
	}
	function live() {
		const st = localState || current.state,
			changed = st === "changed",
			isNext = changed || nextTalk,
			speaker = isNext ? talks.ken : talks.misaki,
			target = talks[draftTarget],
			time = isNext ? "05:00" : "02:34";
		if (changed && !draft) draft = "仕組みをもう少し聞きたいです。";
		if (st === "failure" && !draft) draft = "仕組みをもう少し聞きたいです。";
		const warning = changed
			? `<div class="notice change-notice">${icon("swap_horiz")}<span><strong>発表が切り替わりました</strong><br>送信先は変更していません。</span></div>`
			: "";
		const fail =
			st === "failure"
				? `<div class="notice error" style="margin-bottom:14px">${icon("error")}<span><strong>送信できませんでした</strong><br>入力は残っています。接続後に再送できます。</span></div>`
				: "";
		const composer = `<div class="composer">${warning}${fail}<label for="comment-body">${e(target.name)}さんへの${changed ? "下書き" : "コメント"}</label><textarea id="comment-body" maxlength="200" placeholder="感想や質問を書いてみよう">${e(draft)}</textarea><div class="composer-foot"><small>${displayName ? `${e(displayName)}として投稿` : "初回の投稿時に表示名を入力"}</small><small id="char-count">${draft.length} / 200</small></div>${changed ? `<div class="change-actions">${button(`${target.short}さんへ送信`, "send-comment", "primary full")}${button("新しい発表へ切り替える", "retarget", "secondary full")}</div>` : button(`${st === "failure" ? "再送信" : "送信する"} ${icon("send")}`, "send-comment", "primary full", 'style="margin-top:14px"')}</div>`;
		const content = `<div class="live-layout"><section><div class="live-title"><div class="row between"><span class="eyebrow">LT LIVE · 03 / 08</span>${status(isNext ? "開始待ち" : "発表中", isNext ? "blue" : "peach")}</div><h1>${e(speaker.title)}</h1><div class="talk-line"><span class="initial">${speaker.initial}</span><strong>${e(speaker.name)}</strong></div></div><div class="time-panel"><span class="timer-caption">${isNext ? "持ち時間" : "残り時間"}</span><span class="timer">${time}</span></div>${reactionButtons()}<p class="subtle-tip">気持ちが動いたら、何度でも。反応はこの発表に届きます。</p></section><section class="conversation"><h2>みんなのコメント</h2>${commentRows(false)}${composer}</section></div>`;
		return shell(content) + (st === "name" ? nameSheet() : "");
	}
	function team() {
		let st = localState || current.state;
		if (st === "normal") st = "assigned";
		const left = `<section class="team-intro"><span class="eyebrow">WORKSHOP</span><h1>チームで、<br>アイデアを形に。</h1>${hero()}<p class="muted">少人数で話すと、もっとおもしろい。<br>一緒につくる仲間と、テーブルで会いましょう。</p></section>`;
		let right = "";
		if (st === "join")
			right = `${status("参加受付中", "green")}<h2>ワークショップに参加する</h2><p class="muted">3〜4人のチームに分かれます。<br>参加する方は表示名を入力してください。</p><div class="form-gap"><label for="team-name">表示名</label><input id="team-name" value="${e(displayName)}" maxlength="30" placeholder="例：山田"><p class="small muted" style="margin-top:9px">メンバーに表示される名前です。</p></div>${button(`チーム分けに参加 ${icon("arrow_forward")}`, "team-join", "primary full")}<p class="small muted" style="margin-top:17px">編成は運営が確定します。</p>`;
		else if (st === "waiting")
			right = `<div class="wait-symbol">${icon("hourglass_top")}</div><h2>参加を受け付けました</h2>${status("編成待ち", "blue")}<p style="margin-top:23px"><strong>${e(displayName || "山田")}さん</strong><br>運営がチームを確定すると、<br>ここに所属先が表示されます。</p><p class="small muted" style="margin:20px 0">このままライブを見ながら待てます。</p>${button(`ライブを見る ${icon("arrow_forward")}`, "navigate", "secondary full", 'data-view="live"')}`;
		else
			right = `${status("編成が確定しました", "green")}<h2 style="font-size:38px;color:var(--blue)">チーム C</h2><div class="team-location"><small>集合場所</small>テーブル C</div><p class="small muted">会場右奥のテーブルへお越しください。</p><div class="members">${[displayName || "山田", "鈴木", "小林", "伊藤"].map((n, i) => `<div class="member ${i === 0 ? "you" : ""}"><span class="initial">${e(n.slice(0, 1))}</span><strong>${e(n)}${i === 0 ? "（あなた）" : ""}</strong></div>`).join("")}</div><p class="small muted">4人でアイデアを形にしよう。</p>`;
		return shell(
			`<div class="team-layout">${left}<section class="team-panel">${right}</section></div>`,
		);
	}

	function slide(talk, large) {
		const t = talks[talk || "misaki"];
		return `<div class="slide-preview ${large ? "large" : ""}"><div class="eyebrow">Tech Meetup · 2026.10.18</div><h3>${e(t.title)}</h3><small>${e(t.name)} · 発表スライド</small></div>`;
	}
	function stateStrip(kind) {
		const states =
			kind === "operator"
				? [
						["normal", "通常"],
						["paused", "一時停止"],
						["overtime", "超過 00:15"],
						["reconnecting", "再接続中"],
					]
				: [
						["ready", "準備完了"],
						["disconnected", "切断"],
					];
		return `<div class="state-strip" aria-label="表示状態の見本">${states.map((a) => button(a[1], "state", `badge ${(localState || current.state) === a[0] ? "blue" : ""}`, `data-state="${a[0]}"`)).join("")}</div>`;
	}
	function operator() {
		const st = localState || current.state,
			standby = opWaiting && !opStarted,
			t = standby || opStarted ? talks.ken : talks.misaki;
		const label = standby
			? "開始待ち"
			: st === "paused"
				? "一時停止中"
				: st === "overtime"
					? "時間超過"
					: st === "reconnecting"
						? "再接続中"
						: "発表中";
		const time =
			standby || opStarted ? "05:00" : st === "overtime" ? "00:15" : "02:34";
		const muted = st === "reconnecting";
		const sidebar = `<aside><h3 style="margin-bottom:15px">発表一覧</h3><div class="op-list">${[
			["misaki", "佐藤 あかり", "小さな自動化から始めよう"],
			["ken", "田中 悠", "チームでつくる開発文化"],
			["other", "高橋 遥", "つながるUIの小さな工夫"],
		]
			.map((a, i) => {
				const act = t.name === a[1];
				return button(
					`<span class="num">${(`0${i + 3}`).slice(-2)}</span><span><strong>${a[1]}</strong><small>${a[2]}</small>${act ? `<small>${label}</small>` : ""}</span>`,
					"select-talk",
					`op-talk ${act ? "active" : ""}`,
					`data-talk="${a[0]}"`,
				);
			})
			.join(
				"",
			)}</div><p class="step-help">「次の発表へ」で終了と選択を行い、準備後に開始します。</p></aside>`;
		const center = `<section class="op-current"><div class="row between"><span class="eyebrow">現在の発表</span>${status(label, st === "overtime" ? "red" : standby ? "blue" : "peach")}</div><h1>${e(t.title)}</h1><div class="row"><span class="initial">${t.initial}</span><strong>${e(t.name)}</strong></div><div style="margin-top:28px"><div class="timer-caption">${standby ? "持ち時間" : st === "overtime" ? "超過時間" : "残り時間"}</div><div class="timer" style="margin-top:8px;color:${st === "overtime" ? "var(--red)" : "var(--ink)"}">${time}</div></div><div class="op-actions">${button(icon(st === "paused" ? "play_arrow" : "pause") + (st === "paused" ? "再開" : "一時停止"), "pause", "secondary", standby || muted ? "disabled" : "")}${button(`${icon("stop")}発表を終了`, "end-talk", "danger", standby || muted ? "disabled" : "")}</div><div class="next-section"><h3>${standby ? "準備が整ったら開始" : "次の登壇者へ"}</h3><p class="small muted" style="margin-top:8px">${standby ? "投影する共有を確認して、タイマーを開始します。" : "現在の発表を終了し、鈴木さんを開始待ちにします。"}</p>${button(standby ? `${icon("play_arrow")}タイマー開始` : `${icon("arrow_forward")}次の発表へ`, "next-or-start", "primary full", `style="margin-top:17px" ${muted ? "disabled" : ""}`)}</div></section>`;
		const source = `<aside class="next-source"><span class="eyebrow">${standby ? "選択中の共有" : "次の発表者の準備"}</span><h3>田中 悠<br><span style="font-size:16px;font-weight:500">チームでつくる開発文化</span></h3>${slide("ken")}${status(opProjecting ? "投影中" : "共有準備完了", opProjecting ? "blue" : "green")}${button(icon("present_to_all") + (opProjecting ? "投影先を確認済み" : "この共有を投影する"), "project", "secondary full", muted ? "disabled" : "")}<p class="step-help">本人が準備した共有を運営が選びます。投影とタイマー開始は別の操作です。</p></aside>`;
		const banner = muted
			? `<div class="notice error" style="margin-bottom:22px">${icon("wifi_off")}<span><strong>再接続中です</strong>　最後に取得した状態を表示しています。操作は復帰後に行えます。</span></div>`
			: "";
		let lower = "";
		if (opPanel === "comments")
			lower = `<div class="op-tools"><h3>現在の発表へのコメント</h3>${button(icon(commentsOpen ? "toggle_on" : "toggle_off") + (commentsOpen ? "投稿を受付中" : "投稿を停止中"), "toggle-comments", "toggle")}</div>${commentRows(true)}<p class="small muted" style="margin-top:15px">参加者への表示と、会場への投影は別々に設定します。会場投影：オフ</p>`;
		else
			lower = `<div class="op-tools"><div><h3>チーム編成プレビュー</h3><p class="small muted">14人 · 4人程度 · 4 / 4 / 3 / 3人</p></div>${button("受付を締め切る", "close-team", "secondary")}</div><div class="team-preview">${[
				["A", "4人", "山田・佐藤・小林・伊藤"],
				["B", "4人", "鈴木・田中・高橋・中村"],
				["C", "3人", "渡辺・加藤・吉田"],
				["D", "3人", "山本・山口・松本"],
			]
				.map(
					(a) =>
						`<div><strong>チーム ${a[0]} · ${a[1]}</strong><p class="small muted">${a[2]}</p><label class="small" style="margin-top:14px">集合場所</label><input value="テーブル ${a[0]}" aria-label="チーム${a[0]}の集合場所"></div>`,
				)
				.join(
					"",
				)}</div><div class="row">${button("この編成で確定", "confirm-teams", "primary")}${button("再編成する", "reshuffle", "secondary")}</div><p class="small muted" style="margin-top:13px">確定するまで参加者には表示しません。</p>`;
		return shell(
			`${title("LT進行", "Tech Meetup · 2026.10.18（日）", status("運営画面", "blue")) + banner}<div class="operator-grid">${sidebar}${center}${source}</div><div class="op-subnav">${button(`${icon("chat_bubble")}コメント管理`, "op-panel", `${opPanel === "comments" ? "active" : ""}`, 'data-panel="comments"')}${button(`${icon("groups")}チーム編成`, "op-panel", `${opPanel === "teams" ? "active" : ""}`, 'data-panel="teams"')}${button(`${icon("edit_note")}会場案内を確認`, "navigate", "", 'data-view="guide"')}</div><section class="op-subpanel">${lower}</section>${stateStrip("operator")}`,
			"operator",
		);
	}
	function presenter() {
		const st = localState || current.state,
			disconnected = st === "disconnected",
			ready = st === "ready" || shareReady;
		const shareLabel = disconnected
			? "切断"
			: ready
				? "共有準備完了"
				: "投影中";
		const panel =
			'<section class="share-panel"><div class="row between"><h2>画面共有</h2>' +
			status(shareLabel, disconnected ? "red" : ready ? "green" : "blue") +
			"</div>" +
			(disconnected
				? `<div class="notice error" style="margin-top:22px">${icon("wifi_off")}<span><strong>共有が切断されました</strong><br>もう一度、共有する画面を選んでください。</span></div>`
				: slide("misaki")) +
			(disconnected
				? button(
						`${icon("screen_share")}画面共有を準備する`,
						"prepare-share",
						"primary full",
					)
				: ready
					? `<p class="small muted">準備できました。運営が投影先を選ぶまでお待ちください。</p>${button(`${icon("stop_screen_share")}共有を停止する`, "stop-share", "danger full")}`
					: button(
							`${icon("stop_screen_share")}共有を停止する`,
							"stop-share",
							"danger full",
						)) +
			'<div class="share-steps"><h3>発表までの流れ</h3>' +
			[
				"本人が共有する画面を選ぶ",
				"運営がプレビューを確認し、投影する",
				"準備後に運営がタイマーを開始",
			]
				.map(
					(x, i) =>
						`<div class="row"><span class="step-num">${i + 1}</span><span>${x}</span></div>`,
				)
				.join("") +
			'</div><p class="small muted" style="margin-top:21px">共有する画面の選択には、ご本人の操作とブラウザーの許可が必要です。</p></section>';
		return shell(
			`${title("発表者の手元", "自分の発表と会場の反応を確認できます。")}<div class="presenter-layout"><section class="confidence">${status(ready && !disconnected ? "開始待ち" : "発表中", ready && !disconnected ? "blue" : "peach")}<h1>小さな自動化から<br>始めよう</h1><div class="row"><span class="initial">佐</span><strong>佐藤 あかり</strong></div><div class="timer" style="margin-top:30px">${ready && !disconnected ? "05:00" : "02:34"}</div><div class="timer-caption">${ready && !disconnected ? "持ち時間 · 運営の開始操作をお待ちください" : "残り時間 · 共有が切断しても進行は運営が判断します"}</div><div class="reaction-totals">${reactionNames.map((n, i) => `<div>${icon(reactionIcons[i])}<strong>${reactions[i]}</strong><span>${n}</span></div>`).join("")}</div><p class="subtle-tip">件数は送られた反応の数です。同じ人の複数回の反応を含みます。</p></section>${panel}</div>${stateStrip("presenter")}`,
		);
	}
	function projection() {
		document.body.className =
			current.device === "mobile" ? "mobile" : "desktop";
		if ((localState || current.state) === "disconnected")
			return `<main class="projection-root"><div class="projection-top"><strong>WORKSHOP COMMONS</strong><span>Tech Meetup</span></div><section class="projection-offline">${icon("screen_share")}<h1>画面共有が切断されました</h1><p>接続を確認しています。しばらくお待ちください。</p><div class="row" style="gap:25px">${status("発表中", "peach")}<span class="timer" style="font-size:80px">02:34</span></div><p style="font-size:17px">タイマーの一時停止・再開は運営が判断します。</p></section><div class="projection-footer"><span>佐藤 あかり · 小さな自動化から始めよう</span><span class="projection-url">参加用ページ</span></div></main>`;
		return `<main class="projection-root"><div class="projection-top"><strong>WORKSHOP COMMONS</strong><span>Tech Meetup · 2026.10.18（日）</span></div><div class="projection-main"><section class="projection-slide"><div class="eyebrow">LIGHTNING TALK · 03 / 08</div><h1>小さな自動化から<br>始めよう</h1><p>佐藤 あかり</p></section><aside class="projection-side">${status("発表中", "peach")}<div class="timer">02:34</div><div class="timer-caption">残り時間</div><p style="font-size:16px;margin-top:32px;line-height:1.7">会場の反応は<br>スマートフォンから。</p></aside></div><footer class="projection-footer"><div><small>次の発表</small><strong>田中 悠</strong>　チームでつくる開発文化</div><div><small>参加用ページ</small><span class="projection-url">参加用ページ</span></div></footer></main>`;
	}
	let nextTalk = false;
	function render() {
		if (current.view === "live" && current.state === "changed") nextTalk = true;
		const views = {
			home: homepage,
			guide: guide,
			live: live,
			team: team,
			operator: operator,
			presenter: presenter,
			projection: projection,
		};
		document.getElementById("app").innerHTML = (
			views[current.view] || homepage
		)();
		document.getElementById("app").style.height = "100%";
		enhance();
		save();
	}
	function notify(text) {
		const old = document.getElementById("toast");
		if (old) old.remove();
		const t = document.createElement("div");
		t.id = "toast";
		t.className = "toast";
		t.setAttribute("role", "status");
		t.textContent = text;
		document.body.appendChild(t);
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => {
			t.remove();
		}, 3200);
	}
	function navigate(view) {
		current.view = view;
		current.state = "normal";
		localState = "";
		nextTalk = false;
		render();
		if (options.onNavigate) options.onNavigate(view);
	}
	function preserveDraft() {
		const el = document.getElementById("comment-body");
		if (el) draft = el.value;
	}
	function sendComment() {
		preserveDraft();
		if (!draft.trim()) {
			notify("コメントを入力してください");
			return;
		}
		if (!displayName) {
			localState = "name";
			render();
			setTimeout(() => {
				const n = document.getElementById("display-name");
				if (n) n.focus();
			}, 30);
			return;
		}
		commentSent = true;
		lastComment = draft;
		draft = "";
		localState = "normal";
		render();
		notify(`${talks[draftTarget].short}さんへのコメントを送信しました`);
	}
	document.addEventListener("input", (ev) => {
		if (ev.target.id === "comment-body") {
			draft = ev.target.value;
			const count = document.getElementById("char-count");
			if (count) count.textContent = `${draft.length} / 200`;
		}
	});
	document.addEventListener("click", (ev) => {
		const el = ev.target.closest("[data-action]");
		if (!el || el.disabled) return;
		const a = el.dataset.action;
		if (a === "navigate") {
			preserveDraft();
			navigate(el.dataset.view);
		} else if (a === "copy") {
			const text = el.dataset.value,
				label = el.dataset.label;
			if (navigator.clipboard?.writeText)
				navigator.clipboard.writeText(text).catch(() => {});
			copyFeedback = `${label}をコピーしました`;
			const opened = document.querySelector(".accordion[open]");
			if (opened) guideOpen = opened.dataset.guide;
			render();
			notify(copyFeedback);
		} else if (a === "guide-select") {
			guideOpen = el.dataset.id;
			render();
		} else if (a === "reaction") {
			const i = Number(el.dataset.index);
			reactions[i]++;
			document.querySelectorAll(`[data-count="${i}"]`).forEach((x) => {
				x.textContent = reactions[i];
			});
			notify(`${reactionNames[i]}を送りました`);
		} else if (a === "send-comment") {
			sendComment();
		} else if (a === "save-name") {
			const n = document.getElementById("display-name");
			if (!n || !n.value.trim()) {
				notify("表示名を入力してください");
				return;
			}
			displayName = n.value.trim();
			localState = "normal";
			sendComment();
		} else if (a === "dismiss-name") {
			localState = "normal";
			render();
		} else if (a === "retarget") {
			preserveDraft();
			draftTarget = "ken";
			nextTalk = true;
			current.state = "normal";
			localState = "normal";
			render();
			notify("送信先を鈴木さんへ変更しました");
		} else if (a === "team-join") {
			const n = document.getElementById("team-name");
			if (!n || !n.value.trim()) {
				notify("表示名を入力してください");
				return;
			}
			displayName = n.value.trim();
			teamJoined = true;
			localState = "waiting";
			render();
			notify("参加を受け付けました");
		} else if (a === "op-panel") {
			opPanel = el.dataset.panel;
			render();
		} else if (a === "toggle-comments") {
			commentsOpen = !commentsOpen;
			render();
		} else if (a === "hide-comment") {
			hiddenComments[el.dataset.index] = true;
			render();
			notify("コメントを非表示にしました");
		} else if (a === "pause") {
			localState =
				(localState || current.state) === "paused" ? "normal" : "paused";
			render();
		} else if (a === "end-talk") {
			opWaiting = true;
			opStarted = false;
			localState = "normal";
			render();
			notify("発表を終了しました。次の発表は開始待ちです");
		} else if (a === "next-or-start") {
			if (!opWaiting) {
				opWaiting = true;
				opStarted = false;
				opProjecting = false;
				localState = "normal";
				render();
				notify("鈴木さんを開始待ちにしました");
			} else {
				if (!opProjecting) {
					notify("投影する共有を確認してください");
					return;
				}
				opStarted = true;
				opWaiting = false;
				localState = "normal";
				render();
				notify("タイマーを開始しました");
			}
		} else if (a === "select-talk") {
			if (el.dataset.talk === "ken") {
				opWaiting = true;
				opStarted = false;
				localState = "normal";
				render();
				notify("鈴木さんを選択しました。タイマーは開始していません");
			} else notify("現在の発表を表示しています");
		} else if (a === "project") {
			opProjecting = true;
			render();
			notify("鈴木さんの共有を投影対象にしました");
		} else if (a === "close-team") {
			notify("チーム分けの受付を締め切りました");
		} else if (a === "confirm-teams") {
			teamJoined = true;
			notify("編成を確定しました。所属先を参加者へ表示します");
		} else if (a === "reshuffle") {
			notify("別の編成プレビューを用意しました。確定するまで公開しません");
		} else if (a === "prepare-share") {
			shareReady = true;
			localState = "ready";
			render();
			notify("共有準備完了の表示見本です。実際の画面取得は行いません");
		} else if (a === "stop-share") {
			shareReady = false;
			localState = "disconnected";
			render();
			notify("共有を停止しました");
		} else if (a === "state") {
			localState = el.dataset.state;
			if (current.view === "operator") {
				opWaiting = false;
				opStarted = false;
			}
			if (current.view === "presenter") shareReady = localState === "ready";
			render();
			if (parent !== window)
				parent.postMessage({ type: "design-state", state: localState }, "*");
		}
	});

	function save() {
		memory = {
			draft,
			displayName,
			draftTarget,
			commentSent,
			teamJoined,
			opPanel,
			opWaiting,
			opProjecting,
			opStarted,
			commentsOpen,
			hiddenComments,
			shareReady,
			reactions,
			guideOpen,
			nextTalk,
			lastComment,
		};
	}
	function timeText() {
		const ms =
			clock.remaining -
			(clock.phase === "running" ? Date.now() - clock.start : 0);
		const s = Math.ceil(Math.abs(ms) / 1000);
		return `${(ms < 0 ? "超過 " : "") + String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
	}
	function tick() {
		target.querySelectorAll("[data-shared-timer]").forEach((el) => {
			el.textContent = timeText();
			el.classList.toggle("overtime", timeText().startsWith("超過"));
		});
	}
	function enhance() {
		target.querySelectorAll(".initial").forEach((el) => {
			const first = el.textContent;
			const img = realDocument.createElement("img");
			img.src =
				first === "佐" || first === "伊"
					? "/assets/commons/avatar-misaki.png"
					: "/assets/commons/avatar-ken.png";
			img.alt = "";
			img.width = 48;
			img.height = 48;
			el.replaceChildren(img);
		});
		target.querySelectorAll(".timer").forEach((el) => {
			if (el.textContent === "02:34") {
				el.dataset.sharedTimer = "true";
			}
		});
		tick();
		if (current.view === "projection") {
			const url = target.querySelector(".projection-url");
			if (url) {
				url.textContent = window.location.origin;
				const host = realDocument.createElement("div");
				host.className = "join-qr";
				url.before(host);
				options.renderQR?.(host, `${window.location.origin}/`);
			}
		}
	}
	function control(ev) {
		const el = ev.target.closest("[data-action]");
		if (!el || el.disabled) return;
		const a = el.dataset.action;
		if (a === "pause") {
			if (clock.phase === "running") {
				clock.remaining -= Date.now() - clock.start;
				clock.phase = "paused";
			} else {
				clock.start = Date.now();
				clock.phase = "running";
			}
		}
		if (a === "next-or-start") {
			if (!opWaiting) {
				nextTalk = true;
				clock.remaining = 300000;
				clock.phase = "waiting";
			} else if (opProjecting) {
				clock.phase = "running";
				clock.start = Date.now();
			}
		}
		if (a === "end-talk") {
			clock.phase = "ended";
			clock.remaining = 0;
		}
		if (a === "reaction") {
			if (Date.now() - lastReaction < 400) {
				ev.stopImmediatePropagation();
				return;
			}
			lastReaction = Date.now();
		}
		if (a === "confirm-teams") {
			published = true;
			teamJoined = true;
		}
		if (a === "navigate" && el.dataset.view === "team" && published) {
			localState = "assigned";
		}
	}
	target.addEventListener("click", control, true);
	removers.push(() => target.removeEventListener("click", control, true));
	function resize() {
		preserveDraft();
		const device = window.innerWidth < 760 ? "mobile" : "desktop";
		if (current.device !== device) {
			current.device = device;
			render();
		}
	}
	window.addEventListener("resize", resize);
	removers.push(() => window.removeEventListener("resize", resize));
	if (memory.draft !== undefined) draft = memory.draft;
	if (memory.displayName !== undefined) displayName = memory.displayName;
	if (memory.draftTarget !== undefined) draftTarget = memory.draftTarget;
	if (memory.commentSent !== undefined) commentSent = memory.commentSent;
	if (memory.teamJoined !== undefined) teamJoined = memory.teamJoined;
	if (memory.opPanel !== undefined) opPanel = memory.opPanel;
	if (memory.opWaiting !== undefined) opWaiting = memory.opWaiting;
	if (memory.opProjecting !== undefined) opProjecting = memory.opProjecting;
	if (memory.opStarted !== undefined) opStarted = memory.opStarted;
	if (memory.commentsOpen !== undefined) commentsOpen = memory.commentsOpen;
	if (memory.hiddenComments !== undefined)
		hiddenComments = memory.hiddenComments;
	if (memory.shareReady !== undefined) shareReady = memory.shareReady;
	if (memory.reactions !== undefined) reactions = memory.reactions;
	if (memory.guideOpen !== undefined) guideOpen = memory.guideOpen;
	if (memory.nextTalk !== undefined) nextTalk = memory.nextTalk;
	if (memory.lastComment !== undefined) lastComment = memory.lastComment;
	if (current.view === "team" && published) localState = "assigned";
	render();
	const interval = setInterval(tick, 250);
	return () => {
		preserveDraft();
		save();
		clearInterval(interval);
		clearTimeout(toastTimer);
		removers.forEach((fn) => {
			fn();
		});
	};
}
