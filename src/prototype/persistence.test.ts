import assert from "node:assert/strict";
import { test } from "node:test";
import { createSeedState } from "./domain.ts";
import { isEventState, parsePersistedState } from "./persistence.ts";

test("valid seed state round-trips through the versioned envelope", () => {
	const state = createSeedState();
	assert.equal(isEventState(state), true);
	assert.deepEqual(
		parsePersistedState(JSON.stringify({ version: 1, state })),
		state,
	);
});

test("missing, invalid JSON, unsupported envelopes and malformed roots are ignored", () => {
	for (const raw of [
		null,
		"",
		"{",
		"null",
		"[]",
		"true",
		"{}",
		'{"version":2}',
	]) {
		assert.equal(parsePersistedState(raw), null);
	}
	for (const state of [null, [], {}, 1, "invalid"]) {
		assert.equal(
			parsePersistedState(JSON.stringify({ version: 1, state })),
			null,
		);
	}
});

test("empty or malformed attendees cannot reach the participant view", () => {
	const state = createSeedState();
	for (const attendees of [
		[],
		[null],
		[1],
		[{}],
		[{ ...state.attendees[0], name: null }],
	]) {
		assert.equal(isEventState({ ...state, attendees }), false);
	}
	for (const patch of [
		{ id: "attendee-0" },
		{ id: "attendee-9007199254740993" },
		{ name: " " },
		{ name: "a".repeat(41) },
		{ checkInToken: "wrong-token" },
		{ checkedIn: "true" },
		{ teamId: "missing-team" },
	]) {
		assert.equal(
			isEventState({
				...state,
				attendees: [
					{ ...state.attendees[0], ...patch },
					...state.attendees.slice(1),
				],
			}),
			false,
		);
	}
});

test("nested objects and enum values are validated", () => {
	const state = createSeedState();
	for (const patch of [
		{ event: null },
		{ event: { title: "Event", announcement: {} } },
		{ board: [] },
		{ board: { slide: "invalid", autoRotate: false } },
		{ board: { slide: ["lt"], autoRotate: false } },
		{ board: { slide: "lt", autoRotate: "false" } },
		{ teams: [null] },
		{ teams: [{ ...state.teams[0], name: {} }] },
		{ tickets: [null] },
	])
		assert.equal(isEventState({ ...state, ...patch }), false);
	for (const patch of [
		{ rolePreference: "invalid" },
		{ rolePreference: ["engineer"] },
		{ eligibility: "invalid" },
		{ eligibility: ["adult"] },
		{ approval: "invalid" },
		{ approval: ["approved"] },
	]) {
		assert.equal(
			isEventState({
				...state,
				attendees: [
					{ ...state.attendees[0], ...patch },
					...state.attendees.slice(1),
				],
			}),
			false,
		);
	}
	for (const patch of [
		{ status: "invalid" },
		{ status: ["live"] },
		{ duration: 4 },
		{ duration: "5" },
		{ title: null },
		{ reactions: null },
		{ reactions: { clap: 1, fire: 2 } },
		{ reactions: { clap: "1", fire: 2, heart: 3 } },
	]) {
		assert.equal(
			isEventState({
				...state,
				tickets: [{ ...state.tickets[0], ...patch }, ...state.tickets.slice(1)],
			}),
			false,
		);
	}
});

test("counters must be finite, safe, nonnegative integers", () => {
	const state = createSeedState();
	for (const number of [
		NaN,
		Infinity,
		-Infinity,
		-1,
		1.5,
		Number.MAX_SAFE_INTEGER + 1,
	]) {
		assert.equal(isEventState({ ...state, nextTicketNumber: number }), false);
		assert.equal(
			isEventState({
				...state,
				tickets: [
					{
						...state.tickets[0],
						reactions: { clap: number, fire: 0, heart: 0 },
					},
					...state.tickets.slice(1),
				],
			}),
			false,
		);
	}
	for (const nextTicketNumber of [0, 1, 4])
		assert.equal(isEventState({ ...state, nextTicketNumber }), false);
});

test("duplicate identities and broken references are rejected", () => {
	const state = createSeedState();
	assert.equal(
		isEventState({
			...state,
			attendees: [...state.attendees, state.attendees[0]],
		}),
		false,
	);
	assert.equal(
		isEventState({ ...state, teams: [...state.teams, state.teams[0]] }),
		false,
	);
	assert.equal(
		isEventState({ ...state, tickets: [...state.tickets, state.tickets[0]] }),
		false,
	);
	assert.equal(
		isEventState({
			...state,
			tickets: [
				{ ...state.tickets[0], attendeeId: "missing" },
				...state.tickets.slice(1),
			],
		}),
		false,
	);
});

test("persisted active tickets must preserve eligibility and a single live stage", () => {
	const state = createSeedState();
	for (const patch of [
		{ attendeeId: "attendee-9" },
		{ attendeeId: "attendee-1" },
		{ status: "live" },
		{ status: "called" },
	]) {
		assert.equal(
			isEventState({
				...state,
				tickets: [
					state.tickets[0],
					{ ...state.tickets[1], ...patch },
					...state.tickets.slice(2),
				],
			}),
			false,
		);
	}
});

test("a valid event may have no teams or tickets and a blank announcement", () => {
	const seed = createSeedState();
	assert.equal(
		isEventState({
			...seed,
			attendees: seed.attendees.map((attendee) => ({
				...attendee,
				teamId: null,
			})),
			teams: [],
			tickets: [],
			nextTicketNumber: 1,
			event: { ...seed.event, announcement: "" },
		}),
		true,
	);
});
