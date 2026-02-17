ALTER TABLE `post_tb` ADD `thumbnail_url` varchar(500);--> statement-breakpoint
UPDATE `post_tb` p
JOIN `asset_tb` a ON p.`thumbnail_asset_id` = a.`id`
SET p.`thumbnail_url` = CONCAT('/uploads/', a.`storage_key`)
WHERE p.`thumbnail_asset_id` IS NOT NULL;--> statement-breakpoint
ALTER TABLE `post_tb` DROP COLUMN `thumbnail_asset_id`;
