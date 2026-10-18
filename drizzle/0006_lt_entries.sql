ALTER TABLE `talks` ADD `entry_status` text DEFAULT 'accepted' NOT NULL;--> statement-breakpoint
ALTER TABLE `talks` ADD `rejection_reason` text;--> statement-breakpoint
ALTER TABLE `talks` ADD `entry_request_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `talks_entry_request_idx` ON `talks` (`entry_request_id`);