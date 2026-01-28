CREATE TABLE `session_tb` (
	`id` varchar(128) NOT NULL,
	`expires_at` int NOT NULL,
	`data` varchar(2048) NOT NULL,
	CONSTRAINT `session_tb_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_tb` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(20) NOT NULL,
	`github_id` varchar(50),
	`google_email` varchar(50),
	`writable` boolean NOT NULL DEFAULT false,
	`image_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deleted_at` timestamp,
	CONSTRAINT `user_tb_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `image_tb` (
	`id` int AUTO_INCREMENT NOT NULL,
	`url` varchar(255) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`deleted_at` timestamp,
	CONSTRAINT `image_tb_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `admin_tb` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(100) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`last_login_at` timestamp,
	CONSTRAINT `admin_tb_id` PRIMARY KEY(`id`),
	CONSTRAINT `admin_tb_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `oauth_account_tb` (
	`id` int AUTO_INCREMENT NOT NULL,
	`provider` enum('github','google') NOT NULL,
	`provider_user_id` varchar(100) NOT NULL,
	`email` varchar(100),
	`display_name` varchar(100) NOT NULL,
	`avatar_url` varchar(500),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `oauth_account_tb_id` PRIMARY KEY(`id`),
	CONSTRAINT `provider_user_idx` UNIQUE(`provider`,`provider_user_id`)
);
--> statement-breakpoint
CREATE TABLE `category_tb` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parent_id` int,
	`name` varchar(50) NOT NULL,
	`slug` varchar(100) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	`is_visible` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `category_tb_id` PRIMARY KEY(`id`),
	CONSTRAINT `category_tb_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `tag_tb` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(30) NOT NULL,
	`slug` varchar(50) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tag_tb_id` PRIMARY KEY(`id`),
	CONSTRAINT `tag_tb_name_unique` UNIQUE(`name`),
	CONSTRAINT `tag_tb_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `asset_tb` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storage_provider` varchar(20) NOT NULL DEFAULT 'local',
	`storage_key` varchar(500) NOT NULL,
	`mime_type` varchar(100) NOT NULL,
	`size_bytes` int NOT NULL,
	`width` int,
	`height` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `asset_tb_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `post_tb` (
	`id` int AUTO_INCREMENT NOT NULL,
	`category_id` int NOT NULL,
	`title` varchar(200) NOT NULL,
	`slug` varchar(200) NOT NULL,
	`content_md` text NOT NULL,
	`thumbnail_asset_id` int,
	`visibility` enum('public','private') NOT NULL DEFAULT 'public',
	`status` enum('draft','published','archived') NOT NULL DEFAULT 'draft',
	`published_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deleted_at` timestamp,
	CONSTRAINT `post_tb_id` PRIMARY KEY(`id`),
	CONSTRAINT `post_tb_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `post_tag_tb` (
	`post_id` int NOT NULL,
	`tag_id` int NOT NULL,
	CONSTRAINT `post_tag_tb_post_id_tag_id_pk` PRIMARY KEY(`post_id`,`tag_id`)
);
--> statement-breakpoint
CREATE TABLE `comment_tb` (
	`id` int AUTO_INCREMENT NOT NULL,
	`post_id` int NOT NULL,
	`parent_id` int,
	`depth` int NOT NULL DEFAULT 0,
	`reply_to_comment_id` int,
	`reply_to_name` varchar(50),
	`author_type` enum('oauth','guest') NOT NULL,
	`oauth_account_id` int,
	`guest_name` varchar(50),
	`guest_email` varchar(100),
	`guest_password_hash` varchar(255),
	`body` text NOT NULL,
	`is_secret` boolean NOT NULL DEFAULT false,
	`status` enum('active','deleted','hidden') NOT NULL DEFAULT 'active',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deleted_at` timestamp,
	CONSTRAINT `comment_tb_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `guestbook_entry_tb` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parent_id` int,
	`author_type` enum('oauth','guest') NOT NULL,
	`oauth_account_id` int,
	`guest_name` varchar(50),
	`guest_email` varchar(100),
	`guest_password_hash` varchar(255),
	`body` text NOT NULL,
	`is_secret` boolean NOT NULL DEFAULT false,
	`status` enum('active','deleted','hidden') NOT NULL DEFAULT 'active',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deleted_at` timestamp,
	CONSTRAINT `guestbook_entry_tb_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stats_daily_tb` (
	`id` int AUTO_INCREMENT NOT NULL,
	`post_id` int,
	`date` date NOT NULL,
	`pageviews` int NOT NULL DEFAULT 0,
	`uniques` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stats_daily_tb_id` PRIMARY KEY(`id`),
	CONSTRAINT `post_date_idx` UNIQUE(`post_id`,`date`)
);
--> statement-breakpoint
CREATE INDEX `parent_id_idx` ON `category_tb` (`parent_id`);--> statement-breakpoint
CREATE INDEX `sort_order_idx` ON `category_tb` (`sort_order`);--> statement-breakpoint
CREATE INDEX `category_published_idx` ON `post_tb` (`category_id`,`published_at`);--> statement-breakpoint
CREATE INDEX `status_published_idx` ON `post_tb` (`status`,`published_at`);--> statement-breakpoint
CREATE INDEX `tag_id_idx` ON `post_tag_tb` (`tag_id`);--> statement-breakpoint
CREATE INDEX `post_parent_created_idx` ON `comment_tb` (`post_id`,`parent_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `oauth_account_idx` ON `comment_tb` (`oauth_account_id`);--> statement-breakpoint
CREATE INDEX `status_idx` ON `comment_tb` (`status`);--> statement-breakpoint
CREATE INDEX `parent_id_idx` ON `guestbook_entry_tb` (`parent_id`);--> statement-breakpoint
CREATE INDEX `oauth_account_idx` ON `guestbook_entry_tb` (`oauth_account_id`);--> statement-breakpoint
CREATE INDEX `status_idx` ON `guestbook_entry_tb` (`status`);