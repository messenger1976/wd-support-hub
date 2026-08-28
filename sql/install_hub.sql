-- Super Admin hub database (wd_support_hub).
-- Creates companies, hub users, tickets, messages.

CREATE DATABASE IF NOT EXISTS `wd_support_hub` DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;
USE `wd_support_hub`;

CREATE TABLE IF NOT EXISTS `wd_support_company` (
	`id` INT(11) NOT NULL AUTO_INCREMENT,
	`code` VARCHAR(32) NOT NULL,
	`name` VARCHAR(150) NOT NULL,
	`token` VARCHAR(64) NOT NULL,
	`last_seen` DATETIME DEFAULT NULL,
	`created_at` DATETIME NOT NULL,
	PRIMARY KEY (`id`),
	UNIQUE KEY `code` (`code`),
	UNIQUE KEY `token` (`token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `wd_support_hub_user` (
	`id` INT(11) NOT NULL AUTO_INCREMENT,
	`username` VARCHAR(80) NOT NULL,
	`password_hash` VARCHAR(255) NOT NULL,
	`display_name` VARCHAR(150) NOT NULL DEFAULT 'Super Admin',
	`created_at` DATETIME NOT NULL,
	PRIMARY KEY (`id`),
	UNIQUE KEY `username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `wd_support_ticket` (
	`id` INT(11) NOT NULL AUTO_INCREMENT,
	`uuid` VARCHAR(36) NOT NULL,
	`company_code` VARCHAR(32) NOT NULL,
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
	KEY `company_code` (`company_code`),
	KEY `status` (`status`),
	KEY `last_message_at` (`last_message_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `wd_support_message` (
	`id` INT(11) NOT NULL AUTO_INCREMENT,
	`uuid` VARCHAR(36) NOT NULL,
	`ticket_uuid` VARCHAR(36) NOT NULL,
	`company_code` VARCHAR(32) NOT NULL,
	`sender_side` VARCHAR(16) NOT NULL,
	`sender_name` VARCHAR(150) NOT NULL DEFAULT '',
	`body` TEXT,
	`attachment_path` VARCHAR(255) DEFAULT NULL,
	`attachment_name` VARCHAR(255) DEFAULT NULL,
	`created_at` DATETIME NOT NULL,
	PRIMARY KEY (`id`),
	UNIQUE KEY `uuid` (`uuid`),
	KEY `ticket_uuid` (`ticket_uuid`),
	KEY `company_code` (`company_code`),
	KEY `created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

INSERT IGNORE INTO `wd_support_company` (`code`, `name`, `token`, `last_seen`, `created_at`) VALUES
('LABASON', 'Labason Water District', 'labason-ms-7f3c9a2e1b4d6805c8e0', NULL, NOW()),
('ROXAS', 'Roxas Water District', 'roxas-ms-4e8b1c7a9d2f5603a1b9', NULL, NOW());

INSERT IGNORE INTO `wd_support_hub_user` (`username`, `password_hash`, `display_name`, `created_at`) VALUES
('superadmin', '$2y$10$mwJL4PTq8e5BYw5PHCAV2eD8VD4Jz3/tG7xGplgr6VPy4GP1ytNBa', 'Super Admin', NOW());
