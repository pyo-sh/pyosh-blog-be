CREATE TABLE `site_settings_tb` (
  `id` int AUTO_INCREMENT NOT NULL,
  `guestbook_enabled` boolean NOT NULL DEFAULT true,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `site_settings_tb_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
INSERT INTO `site_settings_tb` (`id`, `guestbook_enabled`) VALUES (1, true);
