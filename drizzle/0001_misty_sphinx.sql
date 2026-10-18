ALTER TABLE `event_live_state` ADD `revision` text DEFAULT '0' NOT NULL;--> statement-breakpoint
INSERT OR IGNORE INTO `event_live_state` (`event_id`) SELECT `id` FROM `events`;
