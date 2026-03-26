-- Migrate stats_daily_tb.post_id to NOT NULL with sentinel 0 for site-wide rows
-- postId=0 is the sentinel for site-wide stats; NULL was never a valid value
-- (MySQL unique index treats NULL != NULL so ON DUPLICATE KEY UPDATE would not fire)

UPDATE `stats_daily_tb` SET `post_id` = 0 WHERE `post_id` IS NULL;
--> statement-breakpoint
ALTER TABLE `stats_daily_tb` MODIFY COLUMN `post_id` int NOT NULL;
