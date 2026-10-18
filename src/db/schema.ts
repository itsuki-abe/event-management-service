import { sql } from "drizzle-orm";
import {
	check,
	foreignKey,
	index,
	integer,
	sqliteTable,
	text,
	unique,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

const timestamps = () => ({
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`),
	updatedAt: integer("updated_at", { mode: "timestamp" })
		.notNull()
		.default(sql`(unixepoch())`)
		.$onUpdate(() => sql`(unixepoch())`),
});

export const events = sqliteTable("events", {
	id: integer().primaryKey({ autoIncrement: true }),
	name: text().notNull(),
	startsAt: integer("starts_at", { mode: "timestamp" }),
	endsAt: integer("ends_at", { mode: "timestamp" }),
	...timestamps(),
});

export const participants = sqliteTable(
	"participants",
	{
		id: integer().primaryKey({ autoIncrement: true }),
		eventId: integer("event_id")
			.notNull()
			.references(() => events.id),
		nickname: text().notNull(),
		role: text({ enum: ["participant", "organizer"] })
			.notNull()
			.default("participant"),
		profile: text(),
		...timestamps(),
	},
	(t) => [
		unique().on(t.id, t.eventId),
		index("participants_event_idx").on(t.eventId),
		check("participants_role", sql`${t.role} in ('participant', 'organizer')`),
	],
);

export const deviceSessions = sqliteTable(
	"device_sessions",
	{
		id: integer().primaryKey({ autoIncrement: true }),
		eventId: integer("event_id")
			.notNull()
			.references(() => events.id),
		participantId: integer("participant_id"),
		tokenHash: text("token_hash").notNull().unique(),
		expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
		...timestamps(),
	},
	(t) => [
		unique().on(t.id, t.eventId),
		foreignKey({
			columns: [t.participantId, t.eventId],
			foreignColumns: [participants.id, participants.eventId],
		}),
		index("device_sessions_participant_idx").on(t.participantId),
	],
);

export const pairingRequests = sqliteTable("pairing_requests", {
	id: integer().primaryKey({ autoIncrement: true }),
	deviceSessionId: integer("device_session_id")
		.notNull()
		.references(() => deviceSessions.id),
	codeHash: text("code_hash").notNull().unique(),
	expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
	consumedAt: integer("consumed_at", { mode: "timestamp" }),
	...timestamps(),
});

export const eventGuides = sqliteTable(
	"event_guides",
	{
		id: integer().primaryKey({ autoIncrement: true }),
		eventId: integer("event_id")
			.notNull()
			.references(() => events.id),
		category: text().notNull(),
		title: text().notNull(),
		content: text().notNull(),
		sortOrder: integer("sort_order").notNull().default(0),
		isVisible: integer("is_visible", { mode: "boolean" })
			.notNull()
			.default(true),
		...timestamps(),
	},
	(t) => [index("event_guides_event_order_idx").on(t.eventId, t.sortOrder)],
);

export const talks = sqliteTable(
	"talks",
	{
		id: integer().primaryKey({ autoIncrement: true }),
		eventId: integer("event_id")
			.notNull()
			.references(() => events.id),
		speakerId: integer("speaker_id").notNull(),
		title: text().notNull(),
		sortOrder: integer("sort_order").notNull().default(0),
		durationSeconds: integer("duration_seconds").notNull(),
		status: text({ enum: ["pending", "running", "paused", "ended"] })
			.notNull()
			.default("pending"),
		resumedAt: integer("resumed_at", { mode: "timestamp" }),
		elapsedSeconds: integer("elapsed_seconds").notNull().default(0),
		endedAt: integer("ended_at", { mode: "timestamp" }),
		...timestamps(),
	},
	(t) => [
		unique().on(t.id, t.eventId),
		foreignKey({
			columns: [t.speakerId, t.eventId],
			foreignColumns: [participants.id, participants.eventId],
		}),
		index("talks_event_order_idx").on(t.eventId, t.sortOrder),
		uniqueIndex("talks_one_active_per_event")
			.on(t.eventId)
			.where(sql`${t.status} in ('running', 'paused')`),
		check(
			"talks_status",
			sql`${t.status} in ('pending', 'running', 'paused', 'ended')`,
		),
		check("talks_duration", sql`${t.durationSeconds} > 0`),
		check("talks_elapsed", sql`${t.elapsedSeconds} >= 0`),
	],
);

export const eventLiveState = sqliteTable(
	"event_live_state",
	{
		eventId: integer("event_id")
			.primaryKey()
			.notNull()
			.references(() => events.id),
		selectedTalkId: integer("selected_talk_id"),
		projectedSessionId: integer("projected_session_id"),
		commentsEnabled: integer("comments_enabled", { mode: "boolean" })
			.notNull()
			.default(true),
		commentsProjectionEnabled: integer("comments_projection_enabled", {
			mode: "boolean",
		})
			.notNull()
			.default(false),
		...timestamps(),
	},
	(t) => [
		foreignKey({
			columns: [t.selectedTalkId, t.eventId],
			foreignColumns: [talks.id, talks.eventId],
		}),
		foreignKey({
			columns: [t.projectedSessionId, t.eventId],
			foreignColumns: [deviceSessions.id, deviceSessions.eventId],
		}),
	],
);

export const chatMessages = sqliteTable(
	"chat_messages",
	{
		id: integer().primaryKey({ autoIncrement: true }),
		participantId: integer("participant_id")
			.notNull()
			.references(() => participants.id),
		role: text().notNull(),
		content: text().notNull(),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(t) => [
		index("chat_messages_participant_created_idx").on(
			t.participantId,
			t.createdAt,
		),
	],
);

export const talkComments = sqliteTable(
	"talk_comments",
	{
		id: integer().primaryKey({ autoIncrement: true }),
		eventId: integer("event_id").notNull(),
		talkId: integer("talk_id").notNull(),
		participantId: integer("participant_id").notNull(),
		displayName: text("display_name").notNull().default(""),
		body: text().notNull(),
		hiddenAt: integer("hidden_at", { mode: "timestamp" }),
		...timestamps(),
	},
	(t) => [
		foreignKey({
			columns: [t.talkId, t.eventId],
			foreignColumns: [talks.id, talks.eventId],
		}),
		foreignKey({
			columns: [t.participantId, t.eventId],
			foreignColumns: [participants.id, participants.eventId],
		}),
		index("talk_comments_talk_created_idx").on(t.talkId, t.createdAt),
	],
);

export const reactions = sqliteTable(
	"reactions",
	{
		id: integer().primaryKey({ autoIncrement: true }),
		eventId: integer("event_id").notNull(),
		talkId: integer("talk_id").notNull(),
		participantId: integer("participant_id").notNull(),
		kind: text().notNull(),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.default(sql`(unixepoch())`),
	},
	(t) => [
		foreignKey({
			columns: [t.talkId, t.eventId],
			foreignColumns: [talks.id, talks.eventId],
		}),
		foreignKey({
			columns: [t.participantId, t.eventId],
			foreignColumns: [participants.id, participants.eventId],
		}),
		index("reactions_talk_kind_idx").on(t.talkId, t.kind),
		index("reactions_participant_created_idx").on(t.participantId, t.createdAt),
	],
);

export const matchingRequests = sqliteTable(
	"matching_requests",
	{
		id: integer().primaryKey({ autoIncrement: true }),
		participantId: integer("participant_id")
			.notNull()
			.references(() => participants.id),
		requestText: text("request_text").notNull(),
		status: text().notNull().default("pending"),
		...timestamps(),
	},
	(t) => [index("matching_requests_participant_idx").on(t.participantId)],
);
