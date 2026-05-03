CREATE TABLE `asset_category_tb` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(50),
	`name` varchar(50) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	`is_protected` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `asset_category_tb_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `asset_category_key_idx` ON `asset_category_tb` (`key`);--> statement-breakpoint
CREATE INDEX `asset_category_sort_order_idx` ON `asset_category_tb` (`sort_order`);--> statement-breakpoint
INSERT IGNORE INTO `asset_category_tb` (`key`, `name`, `sort_order`, `is_protected`) VALUES
	('thumbnail', '썸네일', 0, true),
	('default', '기본', 1, true),
	('uncategorized', '미분류', 2, true);
--> statement-breakpoint
ALTER TABLE `asset_tb` ADD `category_id` int;--> statement-breakpoint
ALTER TABLE `asset_tb` ADD `display_name` varchar(200);--> statement-breakpoint
UPDATE `asset_tb`
SET `category_id` = (
	SELECT `id` FROM `asset_category_tb` WHERE `key` = 'uncategorized' LIMIT 1
)
WHERE `category_id` IS NULL;
--> statement-breakpoint
ALTER TABLE `asset_tb` MODIFY COLUMN `category_id` int NOT NULL;--> statement-breakpoint
CREATE INDEX `asset_category_id_idx` ON `asset_tb` (`category_id`);--> statement-breakpoint
CREATE INDEX `asset_display_name_idx` ON `asset_tb` (`display_name`);
