-- Super Admin hub database (wd_support_hub).
-- Creates Water Districts (companies), hub users + roles, tickets, messages, push tokens and the audit log.
-- Existing installs: run add_push_tokens.sql (v2) and add_admin_modules.sql (v3) instead.

CREATE DATABASE IF NOT EXISTS `wd_support_hub` DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;
USE `wd_support_hub`;

CREATE TABLE IF NOT EXISTS `wd_support_company` (
	`id` INT(11) NOT NULL AUTO_INCREMENT,
	`code` VARCHAR(32) NOT NULL,
	`name` VARCHAR(150) NOT NULL,
	`short_name` VARCHAR(60) NOT NULL DEFAULT '',
	`status` VARCHAR(16) NOT NULL DEFAULT 'active',
	`ticket_prefix` VARCHAR(16) NOT NULL DEFAULT '',
	`contact_person` VARCHAR(150) NOT NULL DEFAULT '',
	`contact_email` VARCHAR(190) NOT NULL DEFAULT '',
	`contact_phone` VARCHAR(60) NOT NULL DEFAULT '',
	`address` VARCHAR(255) NOT NULL DEFAULT '',
	`app_url` VARCHAR(255) NOT NULL DEFAULT '',
	`notes` TEXT NULL,
	`sla_first_response_hours` INT(11) NOT NULL DEFAULT 4,
	`sla_resolution_hours` INT(11) NOT NULL DEFAULT 72,
	`token` VARCHAR(64) NOT NULL,
	`token_rotated_at` DATETIME DEFAULT NULL,
	`last_seen` DATETIME DEFAULT NULL,
	`deactivated_at` DATETIME DEFAULT NULL,
	`created_at` DATETIME NOT NULL,
	`updated_at` DATETIME DEFAULT NULL,
	PRIMARY KEY (`id`),
	UNIQUE KEY `code` (`code`),
	UNIQUE KEY `token` (`token`),
	KEY `status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `wd_support_role` (
	`id` INT(11) NOT NULL AUTO_INCREMENT,
	`name` VARCHAR(80) NOT NULL,
	`description` VARCHAR(255) NOT NULL DEFAULT '',
	`is_system` TINYINT(1) NOT NULL DEFAULT 0,
	`permissions` TEXT NOT NULL,
	`created_at` DATETIME NOT NULL,
	`updated_at` DATETIME NOT NULL,
	PRIMARY KEY (`id`),
	UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `wd_support_hub_user` (
	`id` INT(11) NOT NULL AUTO_INCREMENT,
	`username` VARCHAR(80) NOT NULL,
	`password_hash` VARCHAR(255) NOT NULL,
	`display_name` VARCHAR(150) NOT NULL DEFAULT 'Super Admin',
	`email` VARCHAR(190) NOT NULL DEFAULT '',
	`role_id` INT(11) NOT NULL DEFAULT 1,
	`is_active` TINYINT(1) NOT NULL DEFAULT 1,
	`all_companies` TINYINT(1) NOT NULL DEFAULT 1,
	`last_login_at` DATETIME DEFAULT NULL,
	`created_at` DATETIME NOT NULL,
	`updated_at` DATETIME DEFAULT NULL,
	PRIMARY KEY (`id`),
	UNIQUE KEY `username` (`username`),
	KEY `email` (`email`),
	KEY `role_id` (`role_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `wd_support_user_company` (
	`user_id` INT(11) NOT NULL,
	`company_code` VARCHAR(32) NOT NULL,
	PRIMARY KEY (`user_id`, `company_code`),
	KEY `company_code` (`company_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

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
	`assigned_user_id` INT(11) DEFAULT NULL,
	`last_message_at` DATETIME DEFAULT NULL,
	`first_response_at` DATETIME DEFAULT NULL,
	`resolved_at` DATETIME DEFAULT NULL,
	`closed_at` DATETIME DEFAULT NULL,
	`unread_client` TINYINT(1) NOT NULL DEFAULT 0,
	`unread_support` TINYINT(1) NOT NULL DEFAULT 0,
	`created_at` DATETIME NOT NULL,
	`updated_at` DATETIME NOT NULL,
	PRIMARY KEY (`id`),
	UNIQUE KEY `uuid` (`uuid`),
	KEY `company_code` (`company_code`),
	KEY `status` (`status`),
	KEY `last_message_at` (`last_message_at`),
	KEY `assigned_user_id` (`assigned_user_id`),
	KEY `created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `wd_support_message` (
	`id` INT(11) NOT NULL AUTO_INCREMENT,
	`uuid` VARCHAR(36) NOT NULL,
	`ticket_uuid` VARCHAR(36) NOT NULL,
	`company_code` VARCHAR(32) NOT NULL,
	`sender_side` VARCHAR(16) NOT NULL,
	`sender_name` VARCHAR(150) NOT NULL DEFAULT '',
	`sender_user_id` INT(11) DEFAULT NULL,
	`body` TEXT,
	`attachment_path` VARCHAR(255) DEFAULT NULL,
	`attachment_name` VARCHAR(255) DEFAULT NULL,
	`created_at` DATETIME NOT NULL,
	PRIMARY KEY (`id`),
	UNIQUE KEY `uuid` (`uuid`),
	KEY `ticket_uuid` (`ticket_uuid`),
	KEY `company_code` (`company_code`),
	KEY `created_at` (`created_at`),
	KEY `sender_user_id` (`sender_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Firebase Cloud Messaging tokens of hub user browsers (Node hub, v2).
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

CREATE TABLE IF NOT EXISTS `wd_support_audit_log` (
	`id` INT(11) NOT NULL AUTO_INCREMENT,
	`user_id` INT(11) NOT NULL DEFAULT 0,
	`user_name` VARCHAR(150) NOT NULL DEFAULT '',
	`action` VARCHAR(64) NOT NULL,
	`entity` VARCHAR(32) NOT NULL DEFAULT '',
	`entity_id` VARCHAR(64) NOT NULL DEFAULT '',
	`details` TEXT,
	`ip` VARCHAR(45) NOT NULL DEFAULT '',
	`created_at` DATETIME NOT NULL,
	PRIMARY KEY (`id`),
	KEY `created_at` (`created_at`),
	KEY `entity` (`entity`, `entity_id`),
	KEY `user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

INSERT IGNORE INTO `wd_support_role` (`id`, `name`, `description`, `is_system`, `permissions`, `created_at`, `updated_at`) VALUES
(1, 'Administrator', 'Full access to every module, including users, roles and WD Setup.', 1, '["*"]', NOW(), NOW()),
(2, 'Support Agent', 'Answers and manages tickets; sees dashboard and reports.', 1,
	'["dashboard.view","inbox.view","inbox.reply","inbox.status","inbox.assign","companies.view","reports.view"]', NOW(), NOW()),
(3, 'Viewer', 'Read-only: dashboard, tickets and reports (with export).', 1,
	'["dashboard.view","inbox.view","reports.view","reports.export"]', NOW(), NOW());

INSERT IGNORE INTO `wd_support_company` (`code`, `name`, `short_name`, `status`, `ticket_prefix`, `token`, `last_seen`, `created_at`, `updated_at`) VALUES
('LABASON', 'Labason Water District', 'Labason', 'active', 'LAB', 'labason-ms-7f3c9a2e1b4d6805c8e0', NULL, NOW(), NOW()),
('ROXAS', 'Roxas Water District', 'Roxas', 'active', 'ROX', 'roxas-ms-4e8b1c7a9d2f5603a1b9', NULL, NOW(), NOW());

INSERT IGNORE INTO `wd_support_hub_user` (`username`, `password_hash`, `display_name`, `email`, `role_id`, `is_active`, `all_companies`, `created_at`, `updated_at`) VALUES
('superadmin', '$2y$10$mwJL4PTq8e5BYw5PHCAV2eD8VD4Jz3/tG7xGplgr6VPy4GP1ytNBa', 'Super Admin', 'superadmin@example.com', 1, 1, 1, NOW(), NOW());
