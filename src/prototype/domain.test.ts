import assert from "node:assert/strict";
import { test } from "node:test";
import type {
	BoardSlide,
	Duration,
	Eligibility,
	EventState,
	ReactionKind,
	Role,
} from "./domain.ts";
import {
	addReaction,
	assignTeams,
	callNextTicket,
	cancelTicket,
	checkIn,
	createSeedState,
	finishTicket,
	getCurrentTicket,
	getEligibleAttendees,
	getQueuedTickets,
	issueTicket,
	moveAttendee,
	registerAttendee,
	reviewAttendee,
	setAnnouncement,
	setBoardAutoRotate,
	setBoardSlide,
	startTicket,
} from "./domain.ts";

function freezeDeep<T>(value: T): T {
	if (value && typeof value === "object") {
		Object.freeze(value);
		for (const item of Object.values(value)) freezeDeep(item);
	}
	return value;
}

function ticketStatus(state: EventState, id: string) {
	return state.tickets.find((ticket) => ticket.id === id)?.status;
}

test("seed has deterministic demo counts, valid membership and independent allocations", () => {
	const state = createSeedState();
	assert.equal(state.attendees.length, 12);
	assert.equal(
		state.attendees.filter((attendee) => attendee.checkedIn).length,
		8,
	);
	assert.equal(
		state.attendees.filter((attendee) => attendee.approval === "pending")
			.length,
		3,
	);
	assert.equal(getEligibleAttendees(state).length, 8);
	assert.equal(state.teams.length, 3);
	assert.equal(getCurrentTicket(state)?.status, "live");
	assert.equal(getQueuedTickets(state).length, 3);
	assert.equal(state.nextTicketNumber, 5);
	assert.deepEqual(createSeedState(), state);
	assert.notEqual(createSeedState().attendees[0], state.attendees[0]);
	for (const attendee of state.attendees) {
		assert.equal(
			attendee.teamId !== null,
			attendee.approval === "approved" && attendee.checkedIn,
		);
	}
});

test("registration trims names, creates unique demo tokens, and waits for approval", () => {
	const original = freezeDeep(createSeedState());
	const state = registerAttendee(original, {
		name: "  テスト参加者  ",
		rolePreference: "designer",
		eligibility: "undisclosed",
	});
	const attendee = state.attendees.at(-1);
	assert.ok(attendee);
	assert.equal(original.attendees.length, 12);
	assert.equal(state.attendees.length, 13);
	assert.deepEqual(attendee, {
		id: "attendee-13",
		name: "テスト参加者",
		rolePreference: "designer",
		eligibility: "undisclosed",
		checkInToken: "DEMO-013",
		checkedIn: false,
		approval: "pending",
		teamId: null,
	});
	const again = registerAttendee(state, {
		name: "同名も可",
		rolePreference: "planner",
		eligibility: "adult",
	});
	assert.equal(again.attendees.at(-1)?.checkInToken, "DEMO-014");
	assert.throws(
		() =>
			issueTicket(state, { attendeeId: attendee.id, title: "LT", duration: 5 }),
		/承認済み/,
	);
});

test("registration validates input rather than inserting malformed entries", () => {
	const state = freezeDeep(createSeedState());
	assert.throws(
		() =>
			registerAttendee(state, {
				name: "  ",
				rolePreference: "engineer",
				eligibility: "adult",
			}),
		/名前/,
	);
	assert.throws(
		() =>
			registerAttendee(state, {
				name: "あ".repeat(41),
				rolePreference: "engineer",
				eligibility: "adult",
			}),
		/40文字/,
	);
	assert.throws(
		() =>
			registerAttendee(state, {
				name: "名前",
				rolePreference: "invalid" as Role,
				eligibility: "adult",
			}),
		/希望ロール/,
	);
	assert.throws(
		() =>
			registerAttendee(state, {
				name: "名前",
				rolePreference: "engineer",
				eligibility: "invalid" as Eligibility,
			}),
		/年齢区分/,
	);
});

test("check-in is case-insensitive, idempotent, token-scoped and permits pending review", () => {
	const original = freezeDeep(createSeedState());
	const state = checkIn(original, " demo-009 ");
	assert.equal(original.attendees[8].checkedIn, false);
	assert.equal(state.attendees[8].checkedIn, true);
	assert.equal(state.attendees[8].approval, "pending");
	assert.equal(state.attendees[8].teamId, null);
	assert.equal(getEligibleAttendees(state).length, 8);
	assert.equal(checkIn(state, "DEMO-009"), state);
	assert.throws(() => checkIn(state, "missing"), /見つかりません/);
	assert.throws(() => checkIn(state, "DEMO-012"), /承認されていません/);
});

test("approval and check-in are separate requirements; review is pending-only", () => {
	const original = freezeDeep(createSeedState());
	const approved = reviewAttendee(original, "attendee-10", "approved");
	assert.equal(original.attendees[9].approval, "pending");
	assert.equal(approved.attendees[9].approval, "approved");
	assert.equal(approved.attendees[9].checkedIn, false);
	assert.equal(getEligibleAttendees(approved).length, 8);
	assert.equal(getEligibleAttendees(checkIn(approved, "DEMO-010")).length, 9);
	assert.throws(
		() => reviewAttendee(approved, "attendee-10", "rejected"),
		/確認済み/,
	);
	assert.throws(
		() => reviewAttendee(original, "missing", "approved"),
		/見つかりません/,
	);
	assert.equal(
		reviewAttendee(original, "attendee-9", "rejected").attendees[8].approval,
		"rejected",
	);
});

test("minor and undisclosed approvals require explicit staff eligibility acknowledgement", () => {
	const state = freezeDeep(createSeedState());
	for (const id of ["attendee-9", "attendee-11"]) {
		assert.throws(() => reviewAttendee(state, id, "approved"), /スタッフ/);
		assert.throws(
			() =>
				reviewAttendee(state, id, "approved", { eligibilityReviewed: false }),
			/スタッフ/,
		);
		const approved = reviewAttendee(state, id, "approved", {
			eligibilityReviewed: true,
		});
		assert.equal(
			approved.attendees.find((attendee) => attendee.id === id)?.approval,
			"approved",
		);
		assert.equal(
			state.attendees.find((attendee) => attendee.id === id)?.approval,
			"pending",
		);
		assert.equal(
			reviewAttendee(state, id, "rejected").attendees.find(
				(attendee) => attendee.id === id,
			)?.approval,
			"rejected",
		);
	}
});

test("automatic team assignment is deterministic and balanced for all supported sizes", () => {
	const original = freezeDeep(createSeedState());
	for (let count = 2; count <= 6; count += 1) {
		const state = assignTeams(original, count);
		assert.equal(state.teams.length, count);
		assert.deepEqual(assignTeams(original, count), state);
		assert.deepEqual(assignTeams(state, count), state);
		const sizes = state.teams.map(
			(team) =>
				state.attendees.filter((attendee) => attendee.teamId === team.id)
					.length,
		);
		assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1);
		for (const role of ["engineer", "designer", "planner"]) {
			const amounts = state.teams.map(
				(team) =>
					state.attendees.filter(
						(attendee) =>
							attendee.teamId === team.id && attendee.rolePreference === role,
					).length,
			);
			assert.ok(Math.max(...amounts) - Math.min(...amounts) <= 1);
		}
		assert.equal(
			state.attendees.filter((attendee) => attendee.teamId !== null).length,
			8,
		);
	}
	assert.equal(assignTeams(original).teams.length, 2);
});

test("team assignment does not use age or names and clears stale ineligible membership", () => {
	const original = freezeDeep(createSeedState());
	const changed: EventState = {
		...original,
		attendees: original.attendees.map((attendee) => ({
			...attendee,
			name: "別名",
			eligibility: "undisclosed",
			teamId: "team-1",
		})),
	};
	const assigned = assignTeams(changed, 3);
	assert.deepEqual(
		assigned.attendees.map((attendee) => attendee.teamId),
		original.attendees.map((attendee) => attendee.teamId),
	);
	assert.equal(assigned.attendees[8].teamId, null);
});

test("team count validation rejects empty teams, fractions and out-of-range counts", () => {
	const state = freezeDeep(createSeedState());
	for (const count of [0, 1, 7, 2.5, NaN, Infinity])
		assert.throws(() => assignTeams(state, count), /2〜6/);
	const empty = { ...state, attendees: [] };
	assert.throws(() => assignTeams(empty), /チーム数以上/);
	const one = { ...state, attendees: state.attendees.slice(0, 1) };
	assert.throws(() => assignTeams(one, 2), /チーム数以上/);
});

test("manual team moves validate destination and eligibility, and allow unassignment", () => {
	const state = freezeDeep(createSeedState());
	const moved = moveAttendee(state, "attendee-1", "team-3");
	assert.equal(moved.attendees[0].teamId, "team-3");
	assert.equal(state.attendees[0].teamId, "team-1");
	assert.equal(
		moveAttendee(moved, "attendee-1", null).attendees[0].teamId,
		null,
	);
	assert.throws(() => moveAttendee(state, "attendee-9", "team-1"), /承認済み/);
	assert.throws(() => moveAttendee(state, "attendee-1", "missing"), /移動先/);
	assert.throws(() => moveAttendee(state, "missing", null), /見つかりません/);
});

test("LT issuance is sequential, validates input, and limits one active ticket per attendee", () => {
	const state = freezeDeep(createSeedState());
	const issued = issueTicket(state, {
		attendeeId: "attendee-5",
		title: "  わたしのLT  ",
		duration: 10,
	});
	assert.equal(issued.nextTicketNumber, 6);
	assert.equal(issued.tickets.at(-1)?.number, 5);
	assert.equal(issued.tickets.at(-1)?.title, "わたしのLT");
	assert.equal(issued.tickets.at(-1)?.status, "queued");
	assert.equal(state.tickets.length, 4);
	for (const id of ["attendee-1", "attendee-2", "attendee-5"]) {
		assert.throws(
			() => issueTicket(issued, { attendeeId: id, title: "重複", duration: 3 }),
			/有効なLT/,
		);
	}
	assert.throws(
		() =>
			issueTicket(state, {
				attendeeId: "attendee-9",
				title: "未承認",
				duration: 5,
			}),
		/承認済み/,
	);
	assert.throws(
		() =>
			issueTicket(state, { attendeeId: "attendee-5", title: " ", duration: 5 }),
		/タイトル/,
	);
	assert.throws(
		() =>
			issueTicket(state, {
				attendeeId: "attendee-5",
				title: "a".repeat(81),
				duration: 5,
			}),
		/80文字/,
	);
	assert.throws(
		() =>
			issueTicket(state, {
				attendeeId: "attendee-5",
				title: "LT",
				duration: 7 as Duration,
			}),
		/3・5・10/,
	);
	assert.throws(
		() =>
			issueTicket(state, { attendeeId: "missing", title: "LT", duration: 5 }),
		/見つかりません/,
	);
});

test("LT lifecycle enforces queued -> called -> live -> done, then explicit next call", () => {
	const seed = freezeDeep(createSeedState());
	assert.throws(() => callNextTicket(seed), /先に完了/);
	const finished = finishTicket(seed, "ticket-1");
	assert.equal(ticketStatus(seed, "ticket-1"), "live");
	assert.equal(ticketStatus(finished, "ticket-1"), "done");
	assert.equal(getCurrentTicket(finished), undefined);
	assert.equal(ticketStatus(finished, "ticket-2"), "queued");
	assert.throws(() => startTicket(finished, "ticket-2"), /呼び出し済み/);
	assert.throws(() => finishTicket(finished, "ticket-2"), /発表中/);
	const called = callNextTicket(finished);
	assert.equal(getCurrentTicket(called)?.id, "ticket-2");
	assert.equal(ticketStatus(called, "ticket-2"), "called");
	assert.throws(() => callNextTicket(called), /先に完了/);
	assert.throws(() => finishTicket(called, "ticket-2"), /発表中/);
	const live = startTicket(called, "ticket-2");
	assert.equal(ticketStatus(live, "ticket-2"), "live");
	assert.throws(() => startTicket(live, "ticket-2"), /呼び出し済み/);
	const done = finishTicket(live, "ticket-2");
	assert.equal(getCurrentTicket(done), undefined);
	assert.equal(getCurrentTicket(callNextTicket(done))?.id, "ticket-3");
	assert.throws(() => finishTicket(done, "ticket-2"), /発表中/);
	assert.throws(() => cancelTicket(done, "ticket-2"), /完了・取消済み/);
});

test("queue order is ticket-number order and cancelled tickets are skipped", () => {
	let state = cancelTicket(createSeedState(), "ticket-1");
	state = cancelTicket(state, "ticket-2");
	state = { ...state, tickets: [...state.tickets].reverse() };
	assert.deepEqual(
		getQueuedTickets(state).map((ticket) => ticket.number),
		[3, 4],
	);
	assert.equal(getCurrentTicket(callNextTicket(state))?.id, "ticket-3");
	assert.throws(() => cancelTicket(state, "ticket-2"), /完了・取消済み/);
	assert.throws(() => startTicket(state, "ticket-2"), /呼び出し済み/);
	const cleared = { ...state, tickets: [] };
	assert.throws(() => callNextTicket(cleared), /待機中/);
});

test("cancelling a called talk releases the stage; finishing or cancellation allows a new ticket", () => {
	let state = finishTicket(createSeedState(), "ticket-1");
	state = callNextTicket(state);
	state = cancelTicket(state, "ticket-2");
	assert.equal(getCurrentTicket(state), undefined);
	state = issueTicket(state, {
		attendeeId: "attendee-1",
		title: "もう一度",
		duration: 3,
	});
	state = issueTicket(state, {
		attendeeId: "attendee-2",
		title: "変更後のLT",
		duration: 5,
	});
	assert.deepEqual(
		state.tickets.slice(-2).map((ticket) => ticket.number),
		[5, 6],
	);
	assert.equal(getCurrentTicket(callNextTicket(state))?.id, "ticket-3");
});

test("start refuses a second simultaneous called/live ticket even in externally malformed state", () => {
	const seed = createSeedState();
	const malformed: EventState = {
		...seed,
		tickets: seed.tickets.map((ticket) =>
			ticket.id === "ticket-2" ? { ...ticket, status: "called" } : ticket,
		),
	};
	assert.throws(() => startTicket(malformed, "ticket-2"), /別のLT/);
});

test("reactions only increment the live ticket and never mutate past state", () => {
	const state = freezeDeep(createSeedState());
	const reacted = addReaction(state, "ticket-1", "clap");
	assert.equal(reacted.tickets[0].reactions.clap, 13);
	assert.equal(state.tickets[0].reactions.clap, 12);
	assert.equal(reacted.tickets[0].reactions.fire, 5);
	assert.throws(() => addReaction(state, "ticket-2", "heart"), /発表中/);
	assert.throws(() => addReaction(state, "missing", "heart"), /見つかりません/);
	assert.throws(
		() => addReaction(state, "ticket-1", "invalid" as ReactionKind),
		/リアクションを選んで/,
	);
	assert.throws(
		() => addReaction(finishTicket(state, "ticket-1"), "ticket-1", "heart"),
		/発表中/,
	);
});

test("announcement and board settings are immutable, validated, and reset with the seed", () => {
	const state = freezeDeep(createSeedState());
	const edited = setAnnouncement(state, "  次のLTを準備してください  ");
	assert.equal(edited.event.announcement, "次のLTを準備してください");
	assert.notEqual(edited.event.announcement, state.event.announcement);
	assert.equal(setAnnouncement(edited, " ").event.announcement, "");
	assert.throws(() => setAnnouncement(state, "あ".repeat(281)), /280文字/);
	const slide = setBoardSlide(edited, "lt");
	assert.equal(slide.board.slide, "lt");
	const rotating = setBoardAutoRotate(slide, true);
	assert.equal(rotating.board.autoRotate, true);
	assert.equal(slide.board.autoRotate, false);
	assert.throws(
		() => setBoardSlide(state, "invalid" as BoardSlide),
		/掲示画面/,
	);
	assert.deepEqual(createSeedState(), state);
});
