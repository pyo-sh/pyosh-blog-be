ALTER TABLE `post_tb` ADD `summary` varchar(200);--> statement-breakpoint
ALTER TABLE `post_tb` ADD `description` varchar(300);--> statement-breakpoint
ALTER TABLE `post_tb` ADD `comment_status` enum('open','locked','disabled') NOT NULL DEFAULT 'open';--> statement-breakpoint
ALTER TABLE `post_tb` ADD `is_pinned` boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE `post_tb` ADD `content_modified_at` timestamp;
