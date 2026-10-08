-- Firebase push notifications for existing wd_support_hub installs (Node hub, v2).
-- Safe to re-run.

USE `wd_support_hub`;

CREATE TABLE IF NOT EXISTS `wd_support_push_token` (
	`id` INT(11) NOT NULL AUTO_INCREMENT,
	`user_id` INT(11) NOT NULL,
	`token_hash` CHAR(64) NOT NULL,
	`token` TEXT NOT NULL,
	`user_agent` VARCHAR(255) NOT NULL DEFAULT '',
	`created_at` DATETIME NOT NULL,
	`updated_at` DATETIME NOT NULL,
	PRIMARY KEY (`id`),
	UNIQUE KEY `token_hash` (`token_hash`),
	KEY `user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
