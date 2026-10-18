import { z } from "zod";

const talkSchema = z.object({
	id: z.number().int().positive(),
	title: z.string(),
	speaker: z.string(),
	sortOrder: z.number().int(),
	durationSeconds: z.number().int().positive(),
	status: z.enum(["pending", "running", "paused", "ended"]),
	resumedAt: z.number().nullable(),
	elapsedSeconds: z.number().nonnegative(),
});

export const liveSnapshotSchema = z.object({
	event: z
		.object({ id: z.number().int().positive(), name: z.string() })
		.nullable(),
	talks: z.array(talkSchema),
	selectedTalkId: z.number().int().positive().nullable(),
	revision: z.string(),
	serverNow: z.number(),
});

const revision = z.string().min(1).max(100);
const talkId = z.number().int().positive();
export const liveActionSchema = z.discriminatedUnion("action", [
	z.object({
		action: z.literal("createEvent"),
		name: z.string().trim().min(1).max(100),
	}),
	z.object({
		action: z.literal("saveTalk"),
		revision,
		id: talkId.optional(),
		title: z.string().trim().min(1).max(200),
		speaker: z.string().trim().min(1).max(100),
		durationSeconds: z.number().int().min(1).max(86400),
		sortOrder: z.number().int().min(0).max(100000),
	}),
	z.object({ action: z.literal("select"), revision, talkId }),
	z.object({ action: z.literal("start"), revision, talkId }),
	z.object({ action: z.literal("pause"), revision, talkId }),
	z.object({ action: z.literal("resume"), revision, talkId }),
	z.object({ action: z.literal("end"), revision, talkId }),
	z.object({ action: z.literal("next"), revision, talkId }),
]);

export type LiveSnapshot = z.infer<typeof liveSnapshotSchema>;
export type LiveAction = z.infer<typeof liveActionSchema>;

export function elapsedSeconds(
	talk: LiveSnapshot["talks"][number],
	now: number,
) {
	return (
		talk.elapsedSeconds +
		(talk.status === "running" && talk.resumedAt !== null
			? Math.max(0, now - talk.resumedAt)
			: 0)
	);
}

export function formatTime(seconds: number) {
	const value = Math.floor(Math.abs(seconds));
	return `${seconds < 0 ? "−" : ""}${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}
