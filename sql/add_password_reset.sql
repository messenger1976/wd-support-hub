-- Password reset support for existing wd_support_hub installs.
-- Safe to re-run (IF NOT EXISTS / conditional column add).

USE `wd_support_hub`;

-- Email on hub users (required for reset delivery)
SET @db := DATABASE();
SET @col_exists := (
	SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
	WHERE TABLE_SCHEMA = @db
	  AND TABLE_NAME = 'wd_support_hub_user'
	  AND COLUMN_NAME = 'email'
);
SET @sql := IF(
	@col_exists = 0,
	'ALTER TABLE `wd_support_hub_user` ADD COLUMN `email` VARCHAR(190) NOT NULL DEFAULT '''' AFTER `display_name`, ADD KEY `email` (`email`)',
	'SELECT ''email column already present'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS `wd_support_password_reset` (
	`id` INT(11) NOT NULL AUTO_INCREMENT,
	`user_id` INT(11) NOT NULL,
	`token_hash` CHAR(64) NOT NULL,
	`expires_at` DATETIME NOT NULL,
	`used_at` DATETIME DEFAULT NULL,
	`request_ip` VARCHAR(45) DEFAULT NULL,
	`created_at` DATETIME NOT NULL,
	PRIMARY KEY (`id`),
	UNIQUE KEY `token_hash` (`token_hash`),
	KEY `user_id` (`user_id`),
	KEY `expires_at` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Seed email for default superadmin if still empty (change in production).
UPDATE `wd_support_hub_user`
SET `email` = 'superadmin@example.com'
WHERE `username` = 'superadmin' AND (`email` IS NULL OR `email` = '' OR `email` = 'superadmin@localhost');
