-- Message Support plugin (WD client). Safe to re-run.
-- Creates ticket/message/outbox tables and tbl_responsibilities.message_support.

SET @db := DATABASE();

-- Permission column
SET @col_exists := (
	SELECT COUNT(*)
	FROM INFORMATION_SCHEMA.COLUMNS
	WHERE TABLE_SCHEMA = @db
	  AND TABLE_NAME = 'tbl_responsibilities'
	  AND COLUMN_NAME = 'message_support'
);
SET @sql := IF(
	@col_exists = 0,
	'ALTER TABLE `tbl_responsibilities` ADD COLUMN `message_support` VARCHAR(10) NOT NULL DEFAULT ''0''',
	'SELECT ''message_support column already exists'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS `tbl_support_ticket` (
	`id` INT(11) NOT NULL AUTO_INCREMENT,
	`uuid` VARCHAR(36) NOT NULL,
	`ticket_no` VARCHAR(32) NOT NULL,
	`subject` VARCHAR(255) NOT NULL,
	`category` VARCHAR(64) NOT NULL DEFAULT 'Other',
	`priority` VARCHAR(16) NOT NULL DEFAULT 'normal',
	`status` VARCHAR(32) NOT NULL DEFAULT 'open',
	`user_id` INT(11) NOT NULL DEFAULT 0,
	`user_name` VARCHAR(150) NOT NULL DEFAULT '',
	`usertype` VARCHAR(50) NOT NULL DEFAULT '',
	`last_message_at` DATETIME DEFAULT NULL,
	`unread_client` TINYINT(1) NOT NULL DEFAULT 0,
	`unread_support` TINYINT(1) NOT NULL DEFAULT 0,
	`created_at` DATETIME NOT NULL,
	`updated_at` DATETIME NOT NULL,
	PRIMARY KEY (`id`),
	UNIQUE KEY `uuid` (`uuid`),
	UNIQUE KEY `ticket_no` (`ticket_no`),
	KEY `status` (`status`),
	KEY `last_message_at` (`last_message_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `tbl_support_message` (
	`id` INT(11) NOT NULL AUTO_INCREMENT,
	`uuid` VARCHAR(36) NOT NULL,
	`ticket_id` INT(11) NOT NULL,
	`sender_side` VARCHAR(16) NOT NULL,
	`sender_name` VARCHAR(150) NOT NULL DEFAULT '',
	`body` TEXT,
	`attachment_path` VARCHAR(255) DEFAULT NULL,
	`attachment_name` VARCHAR(255) DEFAULT NULL,
	`created_at` DATETIME NOT NULL,
	PRIMARY KEY (`id`),
	UNIQUE KEY `uuid` (`uuid`),
	KEY `ticket_id` (`ticket_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `tbl_support_sync_queue` (
	`id` INT(11) NOT NULL AUTO_INCREMENT,
	`uuid` VARCHAR(36) NOT NULL,
	`entity_type` VARCHAR(16) NOT NULL,
	`payload` LONGTEXT NOT NULL,
	`attempts` INT(11) NOT NULL DEFAULT 0,
	`last_error` VARCHAR(500) DEFAULT NULL,
	`status` VARCHAR(16) NOT NULL DEFAULT 'pending',
	`created_at` DATETIME NOT NULL,
	`updated_at` DATETIME NOT NULL,
	PRIMARY KEY (`id`),
	KEY `status` (`status`),
	KEY `uuid` (`uuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `tbl_support_sync_state` (
	`id` INT(11) NOT NULL,
	`last_pull_at` DATETIME DEFAULT NULL,
	`last_error` VARCHAR(500) DEFAULT NULL,
	`updated_at` DATETIME DEFAULT NULL,
	PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

INSERT IGNORE INTO `tbl_support_sync_state` (`id`, `last_pull_at`, `last_error`, `updated_at`)
VALUES (1, NULL, NULL, NOW());
