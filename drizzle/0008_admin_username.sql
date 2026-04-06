ALTER TABLE `admin_tb`
  DROP INDEX `admin_tb_email_unique`,
  CHANGE COLUMN `email` `username` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  ADD CONSTRAINT `admin_tb_username_unique` UNIQUE(`username`);
