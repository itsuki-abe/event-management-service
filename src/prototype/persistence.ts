import type { Attendee, EventState, Team, Ticket } from "./domain";

const isRecord = (value: unknown): value is Record<string, unknown> =>
	value !== null && typeof value === "object" && !Array.isArray(value);

const isText = (value: unknown, maximum?: number): value is string =>
	typeof value === "string" &&
	value.trim().length > 0 &&
	(maximum === undefined || [...value].length <= maximum);

const isCount = (value: unknown): value is number =>
	typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

const isChoice = (
	value: unknown,
	choices: readonly string[],
): value is string => typeof value === "string" && choices.includes(value);

function isAttendee(value: unknown): value is Attendee {
	if (!isRecord(value)) return false;
	if (typeof value.id !== "string" || !/^attendee-[1-9]\d*$/.test(value.id))
		return false;
	const number = Number(value.id.slice("attendee-".length));
	return (
		Number.isSafeInteger(number) &&
		number < Number.MAX_SAFE_INTEGER &&
		isText(value.name, 40) &&
		isChoice(value.rolePreference, ["engineer", "designer", "planner"]) &&
		isChoice(value.eligibility, ["adult", "minor", "undisclosed"]) &&
		value.checkInToken === `DEMO-${String(number).padStart(3, "0")}` &&
		typeof value.checkedIn === "boolean" &&
		isChoice(value.approval, ["pending", "approved", "rejected"]) &&
		(value.teamId === null || isText(value.teamId))
	);
}

function isTeam(value: unknown): value is Team {
	return (
		isRecord(value) &&
		isText(value.id) &&
		isText(value.name) &&
		isText(value.color)
	);
}

function isTicket(value: unknown): value is Ticket {
	return (
		isRecord(value) &&
		isCount(value.number) &&
		value.number > 0 &&
		value.id === `ticket-${value.number}` &&
		isText(value.attendeeId) &&
		isText(value.title, 80) &&
		[3, 5, 10].includes(value.duration as number) &&
		isChoice(value.status, ["queued", "called", "live", "done", "cancelled"]) &&
		isRecord(value.reactions) &&
		isCount(value.reactions.clap) &&
		isCount(value.reactions.fire) &&
		isCount(value.reactions.heart)
	);
}

/** Reject malformed saves before either UI or domain operations can consume them. */
export function isEventState(value: unknown): value is EventState {
	if (
		!isRecord(value) ||
		!Array.isArray(value.attendees) ||
		value.attendees.length === 0 ||
		!value.attendees.every(isAttendee) ||
		!Array.isArray(value.teams) ||
		!value.teams.every(isTeam) ||
		!Array.isArray(value.tickets) ||
		!value.tickets.every(isTicket) ||
		!isCount(value.nextTicketNumber) ||
		value.nextTicketNumber < 1 ||
		value.nextTicketNumber >= Number.MAX_SAFE_INTEGER ||
		!isRecord(value.event) ||
		!isText(value.event.title) ||
		typeof value.event.announcement !== "string" ||
		[...value.event.announcement].length > 280 ||
		!isRecord(value.board) ||
		!isChoice(value.board.slide, ["overview", "teams", "lt", "announcement"]) ||
		typeof value.board.autoRotate !== "boolean"
	)
		return false;

	const attendeeIds = new Set(value.attendees.map((attendee) => attendee.id));
	const teamIds = new Set(value.teams.map((team) => team.id));
	const ticketIds = new Set(value.tickets.map((ticket) => ticket.id));
	if (
		attendeeIds.size !== value.attendees.length ||
		teamIds.size !== value.teams.length ||
		ticketIds.size !== value.tickets.length ||
		value.attendees.some(
			(attendee) =>
				attendee.teamId !== null &&
				(!teamIds.has(attendee.teamId) ||
					attendee.approval !== "approved" ||
					!attendee.checkedIn),
		)
	)
		return false;

	const activeAttendees = new Set<string>();
	let stageCount = 0;
	for (const ticket of value.tickets) {
		if (
			!attendeeIds.has(ticket.attendeeId) ||
			ticket.number >= value.nextTicketNumber
		)
			return false;
		if (["queued", "called", "live"].includes(ticket.status)) {
			const attendee = value.attendees.find(
				(entry) => entry.id === ticket.attendeeId,
			);
			if (
				!attendee?.checkedIn ||
				attendee.approval !== "approved" ||
				activeAttendees.has(ticket.attendeeId)
			)
				return false;
			activeAttendees.add(ticket.attendeeId);
		}
		if (ticket.status === "called" || ticket.status === "live") stageCount += 1;
	}
	return stageCount <= 1;
}

export function parsePersistedState(raw: string | null): EventState | null {
	if (!raw) return null;
	try {
		const value: unknown = JSON.parse(raw);
		return isRecord(value) && value.version === 1 && isEventState(value.state)
			? value.state
			: null;
	} catch {
		return null;
	}
}
