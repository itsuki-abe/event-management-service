CREATE TABLE `screen_share_signals` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` integer NOT NULL,
	`offer` text NOT NULL,
	`answer` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `screen_shares`(`session_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `screen_share_signals_session_idx` ON `screen_share_signals` (`session_id`);--> statement-breakpoint
CREATE TABLE `screen_shares` (
	`session_id` integer PRIMARY KEY NOT NULL,
	`event_id` integer NOT NULL,
	`talk_id` integer NOT NULL,
	`started_at` integer NOT NULL,
	`heartbeat_at` integer NOT NULL,
	FOREIGN KEY (`session_id`,`event_id`) REFERENCES `device_sessions`(`id`,`event_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`talk_id`,`event_id`) REFERENCES `talks`(`id`,`event_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `screen_shares_event_idx` ON `screen_shares` (`event_id`);