CREATE TABLE `chat_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`participant_id` integer NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `chat_messages_participant_created_idx` ON `chat_messages` (`participant_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `device_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`participant_id` integer,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`participant_id`,`event_id`) REFERENCES `participants`(`id`,`event_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `device_sessions_token_hash_unique` ON `device_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `device_sessions_participant_idx` ON `device_sessions` (`participant_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `device_sessions_id_event_id_unique` ON `device_sessions` (`id`,`event_id`);--> statement-breakpoint
CREATE TABLE `event_guides` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_visible` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `event_guides_event_order_idx` ON `event_guides` (`event_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `event_live_state` (
	`event_id` integer PRIMARY KEY NOT NULL,
	`selected_talk_id` integer,
	`projected_session_id` integer,
	`comments_enabled` integer DEFAULT true NOT NULL,
	`comments_projection_enabled` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`selected_talk_id`,`event_id`) REFERENCES `talks`(`id`,`event_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`projected_session_id`,`event_id`) REFERENCES `device_sessions`(`id`,`event_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`starts_at` integer,
	`ends_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `matching_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`participant_id` integer NOT NULL,
	`request_text` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `matching_requests_participant_idx` ON `matching_requests` (`participant_id`);--> statement-breakpoint
CREATE TABLE `pairing_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`device_session_id` integer NOT NULL,
	`code_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`device_session_id`) REFERENCES `device_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pairing_requests_code_hash_unique` ON `pairing_requests` (`code_hash`);--> statement-breakpoint
CREATE TABLE `participants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`nickname` text NOT NULL,
	`role` text DEFAULT 'participant' NOT NULL,
	`profile` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "participants_role" CHECK("participants"."role" in ('participant', 'organizer'))
);
--> statement-breakpoint
CREATE INDEX `participants_event_idx` ON `participants` (`event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `participants_id_event_id_unique` ON `participants` (`id`,`event_id`);--> statement-breakpoint
CREATE TABLE `reactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`talk_id` integer NOT NULL,
	`participant_id` integer NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`talk_id`,`event_id`) REFERENCES `talks`(`id`,`event_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`participant_id`,`event_id`) REFERENCES `participants`(`id`,`event_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `reactions_talk_kind_idx` ON `reactions` (`talk_id`,`kind`);--> statement-breakpoint
CREATE TABLE `talk_comments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`talk_id` integer NOT NULL,
	`participant_id` integer NOT NULL,
	`body` text NOT NULL,
	`hidden_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`talk_id`,`event_id`) REFERENCES `talks`(`id`,`event_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`participant_id`,`event_id`) REFERENCES `participants`(`id`,`event_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `talk_comments_talk_created_idx` ON `talk_comments` (`talk_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `talks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`speaker_id` integer NOT NULL,
	`title` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`duration_seconds` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`resumed_at` integer,
	`elapsed_seconds` integer DEFAULT 0 NOT NULL,
	`ended_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`speaker_id`,`event_id`) REFERENCES `participants`(`id`,`event_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "talks_status" CHECK("talks"."status" in ('pending', 'running', 'paused', 'ended')),
	CONSTRAINT "talks_duration" CHECK("talks"."duration_seconds" > 0),
	CONSTRAINT "talks_elapsed" CHECK("talks"."elapsed_seconds" >= 0)
);
--> statement-breakpoint
CREATE INDEX `talks_event_order_idx` ON `talks` (`event_id`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `talks_one_active_per_event` ON `talks` (`event_id`) WHERE "talks"."status" in ('running', 'paused');--> statement-breakpoint
CREATE UNIQUE INDEX `talks_id_event_id_unique` ON `talks` (`id`,`event_id`);