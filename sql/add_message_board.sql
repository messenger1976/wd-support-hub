-- WD Support Hub v4: Message Board (announcements, updates and how-to guides for the WD apps).
-- Run ONCE on an existing wd_support_hub (fresh installs already include this in install_hub.sql).

USE `wd_support_hub`;

CREATE TABLE IF NOT EXISTS `wd_board_message` (
	`id` INT(11) NOT NULL AUTO_INCREMENT,
	`uuid` VARCHAR(36) NOT NULL,
	`title` VARCHAR(200) NOT NULL,
	`ticker_text` VARCHAR(300) NOT NULL DEFAULT '',
	`body_html` MEDIUMTEXT,
	`category` VARCHAR(20) NOT NULL DEFAULT 'announcement',
	`priority` VARCHAR(16) NOT NULL DEFAULT 'normal',
	`show_ticker` TINYINT(1) NOT NULL DEFAULT 1,
	`show_popup` TINYINT(1) NOT NULL DEFAULT 1,
	`require_ack` TINYINT(1) NOT NULL DEFAULT 0,
	`allow_opt_out` TINYINT(1) NOT NULL DEFAULT 1,
	`pinned` TINYINT(1) NOT NULL DEFAULT 0,
	`audience` VARCHAR(16) NOT NULL DEFAULT 'all',
	`all_companies` TINYINT(1) NOT NULL DEFAULT 1,
	`starts_at` DATETIME NOT NULL,
	`ends_at` DATETIME DEFAULT NULL,
	`status` VARCHAR(16) NOT NULL DEFAULT 'draft',
	`version` INT(11) NOT NULL DEFAULT 1,
	`published_at` DATETIME DEFAULT NULL,
	`created_by` INT(11) NOT NULL DEFAULT 0,
	`created_by_name` VARCHAR(150) NOT NULL DEFAULT '',
	`updated_by` INT(11) NOT NULL DEFAULT 0,
	`updated_by_name` VARCHAR(150) NOT NULL DEFAULT '',
	`created_at` DATETIME NOT NULL,
	`updated_at` DATETIME NOT NULL,
	PRIMARY KEY (`id`),
	UNIQUE KEY `uuid` (`uuid`),
	KEY `status_window` (`status`, `starts_at`, `ends_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `wd_board_message_company` (
	`message_id` INT(11) NOT NULL,
	`company_code` VARCHAR(32) NOT NULL,
	PRIMARY KEY (`message_id`, `company_code`),
	KEY `company_code` (`company_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `wd_board_asset` (
	`id` INT(11) NOT NULL AUTO_INCREMENT,
	`uuid` VARCHAR(36) NOT NULL,
	`file_path` VARCHAR(255) NOT NULL,
	`original_name` VARCHAR(255) NOT NULL DEFAULT '',
	`mime` VARCHAR(60) NOT NULL DEFAULT '',
	`size_bytes` INT(11) NOT NULL DEFAULT 0,
	`uploaded_by` INT(11) NOT NULL DEFAULT 0,
	`created_at` DATETIME NOT NULL,
	PRIMARY KEY (`id`),
	UNIQUE KEY `uuid` (`uuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `wd_board_receipt` (
	`id` INT(11) NOT NULL AUTO_INCREMENT,
	`message_uuid` VARCHAR(36) NOT NULL,
	`company_code` VARCHAR(32) NOT NULL,
	`wd_user_key` VARCHAR(80) NOT NULL,
	`user_name` VARCHAR(150) NOT NULL DEFAULT '',
	`view_count` INT(11) NOT NULL DEFAULT 0,
	`first_viewed_at` DATETIME DEFAULT NULL,
	`last_viewed_at` DATETIME DEFAULT NULL,
	`acked_at` DATETIME DEFAULT NULL,
	`opted_out_at` DATETIME DEFAULT NULL,
	`version` INT(11) NOT NULL DEFAULT 1,
	`updated_at` DATETIME NOT NULL,
	PRIMARY KEY (`id`),
	UNIQUE KEY `message_user` (`message_uuid`, `company_code`, `wd_user_key`),
	KEY `company_code` (`company_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Support Agents can read the board; Administrators ("*") get every board.* permission automatically.
UPDATE `wd_support_role`
	SET `permissions` = REPLACE(`permissions`, '"dashboard.view"', '"dashboard.view","board.view"'), `updated_at` = NOW()
	WHERE `id` = 2 AND `permissions` NOT LIKE '%board.view%' AND `permissions` LIKE '%"dashboard.view"%';
