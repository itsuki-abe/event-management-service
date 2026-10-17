/**
 * In-memory demo domain. All names, tokens and attendance records are synthetic.
 * Eligibility is self-declared demo data, not age or identity verification.
 * Mutations never change their input. No network or browser API is required.
 */

export type Role = "engineer" | "designer" | "planner";
export type Eligibility = "adult" | "minor" | "undisclosed";
export type Approval = "pending" | "approved" | "rejected";
export type TicketStatus = "queued" | "called" | "live" | "done" | "cancelled";
export type Duration = 3 | 5 | 10;
export type ReactionKind = "clap" | "fire" | "heart";
export type BoardSlide = "overview" | "teams" | "lt" | "announcement";

export interface Attendee {
	id: string;
	name: string;
	rolePreference: Role;
	eligibility: Eligibility;
	checkInToken: string;
	checkedIn: boolean;
	approval: Approval;
	teamId: string | null;
}

export interface Team {
	id: string;
	name: string;
	color: string;
}

export interface Ticket {
	id: string;
	number: number;
	attendeeId: string;
	title: string;
	duration: Duration;
	status: TicketStatus;
	reactions: Record<ReactionKind, number>;
}

export interface EventState {
	attendees: Attendee[];
	teams: Team[];
	tickets: Ticket[];
	nextTicketNumber: number;
	event: { title: string; announcement: string };
	board: { slide: BoardSlide; autoRotate: boolean };
}

export interface RegisterAttendeeInput {
	name: string;
	rolePreference: Role;
	eligibility: Eligibility;
}

export interface IssueTicketInput {
	attendeeId: string;
	title: string;
	duration: Duration;
}

export interface EligibilityReviewOptions {
	eligibilityReviewed?: boolean;
}

export const ROLE_LABELS: Record<Role, string> = {
	engineer: "エンジニア",
	designer: "デザイナー",
	planner: "企画・その他",
};

export const ELIGIBILITY_LABELS: Record<Eligibility, string> = {
	adult: "18歳以上（自己申告）",
	minor: "18歳未満（自己申告）",
	undisclosed: "未申告",
};

export const TEAM_ASSIGNMENT_EXPLANATION =
	"承認済み・チェックイン済みの参加者だけを、希望ロールごとに登録順で振り分けます。人数の少ないチーム、同じロールの少ないチーム、チーム番号の順に選びます。年齢区分は使いません。手動移動後は人数やロールに偏りが出る場合があります。";

const ROLES: Role[] = ["engineer", "designer", "planner"];
const ELIGIBILITIES: Eligibility[] = ["adult", "minor", "undisclosed"];
const SLIDES: BoardSlide[] = ["overview", "teams", "lt", "announcement"];
const REACTIONS: ReactionKind[] = ["clap", "fire", "heart"];
const TEAM_COLORS = [
	"#0d9488",
	"#f59e0b",
	"#6366f1",
	"#e879a5",
	"#0284c7",
	"#84a832",
];

const isActiveTicket = (ticket: Ticket) =>
	ticket.status === "queued" ||
	ticket.status === "called" ||
	ticket.status === "live";

function attendeeById(state: EventState, id: string): Attendee {
	const attendee = state.attendees.find((entry) => entry.id === id);
	if (!attendee) throw new Error("参加者が見つかりません。");
	return attendee;
}

function ticketById(state: EventState, id: string): Ticket {
	const ticket = state.tickets.find((entry) => entry.id === id);
	if (!ticket) throw new Error("LT整理券が見つかりません。");
	return ticket;
}

function validateEligible(attendee: Attendee): void {
	if (attendee.approval !== "approved" || !attendee.checkedIn) {
		throw new Error("承認済み・チェックイン済みの参加者だけが利用できます。");
	}
}

function textValue(value: string, label: string, maximum: number): string {
	if (typeof value !== "string" || !value.trim()) {
		throw new Error(`${label}を入力してください。`);
	}
	const trimmed = value.trim();
	if ([...trimmed].length > maximum) {
		throw new Error(`${label}は${maximum}文字以内で入力してください。`);
	}
	return trimmed;
}

function updateTicket(
	state: EventState,
	id: string,
	changes: Partial<Ticket>,
): EventState {
	return {
		...state,
		tickets: state.tickets.map((ticket) =>
			ticket.id === id ? { ...ticket, ...changes } : ticket,
		),
	};
}

export function getEligibleAttendees(state: EventState): Attendee[] {
	return state.attendees.filter(
		(attendee) => attendee.approval === "approved" && attendee.checkedIn,
	);
}

export function getCurrentTicket(state: EventState): Ticket | undefined {
	return state.tickets.find(
		(ticket) => ticket.status === "called" || ticket.status === "live",
	);
}

export function getQueuedTickets(state: EventState): Ticket[] {
	return state.tickets
		.filter((ticket) => ticket.status === "queued")
		.sort((a, b) => a.number - b.number);
}

/** New registrations are pending and cannot join teams or request an LT yet. */
export function registerAttendee(
	state: EventState,
	input: RegisterAttendeeInput,
): EventState {
	const name = textValue(input.name, "名前", 40);
	if (!ROLES.includes(input.rolePreference))
		throw new Error("希望ロールを選んでください。");
	if (!ELIGIBILITIES.includes(input.eligibility))
		throw new Error("年齢区分を選んでください。");
	const nextId =
		state.attendees.reduce((maximum, attendee) => {
			const suffix = Number(attendee.id.match(/^attendee-(\d+)$/)?.[1] ?? 0);
			return Math.max(maximum, suffix);
		}, 0) + 1;
	const attendee: Attendee = {
		id: `attendee-${nextId}`,
		name,
		rolePreference: input.rolePreference,
		eligibility: input.eligibility,
		checkInToken: `DEMO-${String(nextId).padStart(3, "0")}`,
		checkedIn: false,
		approval: "pending",
		teamId: null,
	};
	return { ...state, attendees: [...state.attendees, attendee] };
}

/** Demo tokens are deliberately human-readable and are not secure credentials. */
export function checkIn(state: EventState, token: string): EventState {
	if (typeof token !== "string")
		throw new Error("チェックインコードを入力してください。");
	const attendee = state.attendees.find(
		(entry) => entry.checkInToken === token.trim().toUpperCase(),
	);
	if (!attendee) throw new Error("チェックインコードが見つかりません。");
	if (attendee.approval === "rejected")
		throw new Error("参加が承認されていません。受付に確認してください。");
	if (attendee.checkedIn) return state;
	return {
		...state,
		attendees: state.attendees.map((entry) =>
			entry.id === attendee.id ? { ...entry, checkedIn: true } : entry,
		),
	};
}

/** Review is a one-way pending decision; this is not a live-event access revocation flow. */
export function reviewAttendee(
	state: EventState,
	id: string,
	decision: "approved" | "rejected",
	options?: EligibilityReviewOptions,
): EventState {
	if (decision !== "approved" && decision !== "rejected")
		throw new Error("承認または見送りを選んでください。");
	const attendee = attendeeById(state, id);
	if (attendee.approval !== "pending")
		throw new Error("この参加申込は確認済みです。");
	if (
		decision === "approved" &&
		attendee.eligibility !== "adult" &&
		options?.eligibilityReviewed !== true
	) {
		throw new Error(
			"未成年・年齢未申告の参加者は、スタッフが参加条件を確認してから承認してください。",
		);
	}
	return {
		...state,
		attendees: state.attendees.map((entry) =>
			entry.id === id ? { ...entry, approval: decision, teamId: null } : entry,
		),
	};
}

/**
 * Greedy, deterministic balancing, independent of age, eligibility and names.
 * For each role, keep registration order; select by team size, role count, index.
 * Reassignment replaces every previous team membership, including manual moves.
 */
export function assignTeams(state: EventState, count?: number): EventState {
	const eligible = getEligibleAttendees(state);
	const teamCount =
		count ?? Math.max(2, Math.min(6, Math.ceil(eligible.length / 4)));
	if (!Number.isInteger(teamCount) || teamCount < 2 || teamCount > 6) {
		throw new Error("チーム数は2〜6の整数で指定してください。");
	}
	if (eligible.length < teamCount)
		throw new Error(
			"チーム数以上の承認済み・チェックイン済み参加者が必要です。",
		);
	const teams: Team[] = Array.from({ length: teamCount }, (_, index) => ({
		id: `team-${index + 1}`,
		name: `チーム ${String.fromCharCode(65 + index)}`,
		color: TEAM_COLORS[index],
	}));
	const members = teams.map(() => [] as Attendee[]);
	const assignments = new Map<string, string>();
	for (const role of ROLES) {
		for (const attendee of eligible.filter(
			(entry) => entry.rolePreference === role,
		)) {
			const bestIndex = teams
				.map((_, index) => index)
				.sort(
					(a, b) =>
						members[a].length - members[b].length ||
						members[a].filter((entry) => entry.rolePreference === role).length -
							members[b].filter((entry) => entry.rolePreference === role)
								.length ||
						a - b,
				)[0];
			members[bestIndex].push(attendee);
			assignments.set(attendee.id, teams[bestIndex].id);
		}
	}
	return {
		...state,
		teams,
		attendees: state.attendees.map((attendee) => ({
			...attendee,
			teamId: assignments.get(attendee.id) ?? null,
		})),
	};
}

/** Manual moves may intentionally change the automatic size/role balance. */
export function moveAttendee(
	state: EventState,
	id: string,
	teamId: string | null,
): EventState {
	const attendee = attendeeById(state, id);
	if (teamId !== null) {
		validateEligible(attendee);
		if (!state.teams.some((team) => team.id === teamId))
			throw new Error("移動先のチームが見つかりません。");
	}
	return {
		...state,
		attendees: state.attendees.map((entry) =>
			entry.id === id ? { ...entry, teamId } : entry,
		),
	};
}

export function issueTicket(
	state: EventState,
	input: IssueTicketInput,
): EventState {
	const attendee = attendeeById(state, input.attendeeId);
	validateEligible(attendee);
	const title = textValue(input.title, "LTタイトル", 80);
	if (![3, 5, 10].includes(input.duration))
		throw new Error("発表時間は3・5・10分から選んでください。");
	if (
		state.tickets.some(
			(ticket) => ticket.attendeeId === attendee.id && isActiveTicket(ticket),
		)
	) {
		throw new Error("この参加者には有効なLT整理券があります。");
	}
	const ticket: Ticket = {
		id: `ticket-${state.nextTicketNumber}`,
		number: state.nextTicketNumber,
		attendeeId: attendee.id,
		title,
		duration: input.duration,
		status: "queued",
		reactions: { clap: 0, fire: 0, heart: 0 },
	};
	return {
		...state,
		tickets: [...state.tickets, ticket],
		nextTicketNumber: state.nextTicketNumber + 1,
	};
}

/** A separate explicit call is required after a talk finishes or is cancelled. */
export function callNextTicket(state: EventState): EventState {
	if (getCurrentTicket(state))
		throw new Error(
			"呼び出し中・発表中のLTを先に完了または取り消してください。",
		);
	const ticket = getQueuedTickets(state)[0];
	if (!ticket) throw new Error("待機中のLTはありません。");
	validateEligible(attendeeById(state, ticket.attendeeId));
	return updateTicket(state, ticket.id, { status: "called" });
}

export function startTicket(state: EventState, id: string): EventState {
	const ticket = ticketById(state, id);
	if (ticket.status !== "called")
		throw new Error("呼び出し済みのLTだけを開始できます。");
	if (
		state.tickets.some(
			(entry) =>
				entry.id !== id &&
				(entry.status === "called" || entry.status === "live"),
		)
	) {
		throw new Error("別のLTが呼び出し中・発表中です。");
	}
	validateEligible(attendeeById(state, ticket.attendeeId));
	return updateTicket(state, id, { status: "live" });
}

export function finishTicket(state: EventState, id: string): EventState {
	const ticket = ticketById(state, id);
	if (ticket.status !== "live")
		throw new Error("発表中のLTだけを完了できます。");
	return updateTicket(state, id, { status: "done" });
}

export function cancelTicket(state: EventState, id: string): EventState {
	const ticket = ticketById(state, id);
	if (!isActiveTicket(ticket))
		throw new Error("完了・取消済みのLTは変更できません。");
	return updateTicket(state, id, { status: "cancelled" });
}

/** Demo applause is unlimited; no claim of unique-person or authenticated counts. */
export function addReaction(
	state: EventState,
	ticketId: string,
	kind: ReactionKind,
): EventState {
	const ticket = ticketById(state, ticketId);
	if (!REACTIONS.includes(kind))
		throw new Error("リアクションを選んでください。");
	if (ticket.status !== "live")
		throw new Error("発表中のLTにリアクションできます。");
	return updateTicket(state, ticketId, {
		reactions: { ...ticket.reactions, [kind]: ticket.reactions[kind] + 1 },
	});
}

export function setAnnouncement(
	state: EventState,
	announcement: string,
): EventState {
	if (
		typeof announcement !== "string" ||
		[...announcement.trim()].length > 280
	) {
		throw new Error("お知らせは280文字以内で入力してください。");
	}
	return {
		...state,
		event: { ...state.event, announcement: announcement.trim() },
	};
}

export function setBoardSlide(
	state: EventState,
	slide: BoardSlide,
): EventState {
	if (!SLIDES.includes(slide)) throw new Error("掲示画面を選んでください。");
	return { ...state, board: { ...state.board, slide } };
}

export function setBoardAutoRotate(
	state: EventState,
	autoRotate: boolean,
): EventState {
	if (typeof autoRotate !== "boolean")
		throw new Error("自動切替の設定が正しくありません。");
	return { ...state, board: { ...state.board, autoRotate } };
}

/** Calling this again resets the demo to the exact same, separately allocated state. */
export function createSeedState(): EventState {
	const names = [
		"蒼井 はる",
		"森 ゆい",
		"佐藤 けい",
		"小林 そら",
		"田中 りん",
		"中村 なつ",
		"高橋 あお",
		"伊藤 みお",
		"山本 るい",
		"鈴木 なお",
		"渡辺 いと",
		"加藤 れい",
	];
	const attendees: Attendee[] = names.map((name, index) => ({
		id: `attendee-${index + 1}`,
		name,
		rolePreference: ROLES[index % ROLES.length],
		eligibility:
			index === 2 || index === 8
				? "minor"
				: index === 10
					? "undisclosed"
					: "adult",
		checkInToken: `DEMO-${String(index + 1).padStart(3, "0")}`,
		checkedIn: index < 8,
		approval: index < 8 ? "approved" : index < 11 ? "pending" : "rejected",
		teamId: null,
	}));
	const talks: Array<{ title: string; duration: Duration }> = [
		{ title: "小さな工夫で、つくるを楽しく", duration: 5 },
		{ title: "余白から考えるインターフェース", duration: 3 },
		{ title: "アイデアを最初の一歩に変える", duration: 5 },
		{ title: "週末につくった小さなツール", duration: 10 },
	];
	const state: EventState = {
		attendees,
		teams: [],
		tickets: talks.map((talk, index) => ({
			id: `ticket-${index + 1}`,
			number: index + 1,
			attendeeId: attendees[index].id,
			...talk,
			status: index === 0 ? "live" : "queued",
			reactions:
				index === 0
					? { clap: 12, fire: 5, heart: 8 }
					: { clap: 0, fire: 0, heart: 0 },
		})),
		nextTicketNumber: 5,
		event: {
			title: "つくる会 2026",
			announcement:
				"ようこそ、つくる会へ。チェックイン後はチームを確認して、自由につくり始めましょう。",
		},
		board: { slide: "overview", autoRotate: false },
	};
	return assignTeams(state, 3);
}
