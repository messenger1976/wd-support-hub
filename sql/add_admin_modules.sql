-- WD Support Hub v3: Dashboard, WD Setup, Reports, Users/Roles (Node hub).
-- Run ONCE on an existing wd_support_hub created by install_hub.sql before v3
-- (fresh installs already include all of this in install_hub.sql).

USE `wd_support_hub`;

-- ---------- Water Districts (WD Setup) ----------
ALTER TABLE `wd_support_company`
	ADD COLUMN `short_name` VARCHAR(60) NOT NULL DEFAULT '' AFTER `name`,
	ADD COLUMN `status` VARCHAR(16) NOT NULL DEFAULT 'active' AFTER `short_name`,
	ADD COLUMN `ticket_prefix` VARCHAR(16) NOT NULL DEFAULT '' AFTER `status`,
	ADD COLUMN `contact_person` VARCHAR(150) NOT NULL DEFAULT '' AFTER `ticket_prefix`,
	ADD COLUMN `contact_email` VARCHAR(190) NOT NULL DEFAULT '' AFTER `contact_person`,
	ADD COLUMN `contact_phone` VARCHAR(60) NOT NULL DEFAULT '' AFTER `contact_email`,
	ADD COLUMN `address` VARCHAR(255) NOT NULL DEFAULT '' AFTER `contact_phone`,
	ADD COLUMN `app_url` VARCHAR(255) NOT NULL DEFAULT '' AFTER `address`,
	ADD COLUMN `notes` TEXT NULL AFTER `app_url`,
	ADD COLUMN `sla_first_response_hours` INT(11) NOT NULL DEFAULT 4 AFTER `notes`,
	ADD COLUMN `sla_resolution_hours` INT(11) NOT NULL DEFAULT 72 AFTER `sla_first_response_hours`,
	ADD COLUMN `token_rotated_at` DATETIME DEFAULT NULL AFTER `token`,
	ADD COLUMN `deactivated_at` DATETIME DEFAULT NULL AFTER `last_seen`,
	ADD COLUMN `updated_at` DATETIME DEFAULT NULL AFTER `created_at`,
	ADD KEY `status` (`status`);

UPDATE `wd_support_company` SET `ticket_prefix` = 'LAB', `short_name` = 'Labason' WHERE `code` = 'LABASON' AND `ticket_prefix` = '';
UPDATE `wd_support_company` SET `ticket_prefix` = 'ROX', `short_name` = 'Roxas' WHERE `code` = 'ROXAS' AND `ticket_prefix` = '';
UPDATE `wd_support_company` SET `updated_at` = `created_at` WHERE `updated_at` IS NULL;

-- ---------- Roles & permissions ----------
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

INSERT IGNORE INTO `wd_support_role` (`id`, `name`, `description`, `is_system`, `permissions`, `created_at`, `updated_at`) VALUES
(1, 'Administrator', 'Full access to every module, including users, roles and WD Setup.', 1, '["*"]', NOW(), NOW()),
(2, 'Support Agent', 'Answers and manages tickets; sees dashboard and reports.', 1,
	'["dashboard.view","inbox.view","inbox.reply","inbox.status","inbox.assign","companies.view","reports.view"]', NOW(), NOW()),
(3, 'Viewer', 'Read-only: dashboard, tickets and reports (with export).', 1,
	'["dashboard.view","inbox.view","reports.view","reports.export"]', NOW(), NOW());

-- ---------- Hub users ----------
ALTER TABLE `wd_support_hub_user`
	ADD COLUMN `role_id` INT(11) NOT NULL DEFAULT 1 AFTER `email`,
	ADD COLUMN `is_active` TINYINT(1) NOT NULL DEFAULT 1 AFTER `role_id`,
	ADD COLUMN `all_companies` TINYINT(1) NOT NULL DEFAULT 1 AFTER `is_active`,
	ADD COLUMN `last_login_at` DATETIME DEFAULT NULL AFTER `all_companies`,
	ADD COLUMN `updated_at` DATETIME DEFAULT NULL AFTER `created_at`,
	ADD KEY `role_id` (`role_id`);

CREATE TABLE IF NOT EXISTS `wd_support_user_company` (
	`user_id` INT(11) NOT NULL,
	`company_code` VARCHAR(32) NOT NULL,
	PRIMARY KEY (`user_id`, `company_code`),
	KEY `company_code` (`company_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- ---------- Tickets: assignment + SLA timestamps ----------
ALTER TABLE `wd_support_ticket`
	ADD COLUMN `assigned_user_id` INT(11) DEFAULT NULL AFTER `usertype`,
	ADD COLUMN `first_response_at` DATETIME DEFAULT NULL AFTER `last_message_at`,
	ADD COLUMN `resolved_at` DATETIME DEFAULT NULL AFTER `first_response_at`,
	ADD COLUMN `closed_at` DATETIME DEFAULT NULL AFTER `resolved_at`,
	ADD KEY `assigned_user_id` (`assigned_user_id`),
	ADD KEY `created_at` (`created_at`);

UPDATE `wd_support_ticket` t
	SET t.`first_response_at` = (
		SELECT MIN(m.`created_at`) FROM `wd_support_message` m
		WHERE m.`ticket_uuid` = t.`uuid` AND m.`sender_side` = 'support'
	)
	WHERE t.`first_response_at` IS NULL;
ALTER TABLE `wd_support_message`
	ADD COLUMN `sender_user_id` INT(11) DEFAULT NULL AFTER `sender_name`,
	ADD KEY `sender_user_id` (`sender_user_id`);

-- Best effort: link earlier hub replies to the hub user whose display name matches.
UPDATE `wd_support_message` m
	INNER JOIN `wd_support_hub_user` u ON u.`display_name` = m.`sender_name`
	SET m.`sender_user_id` = u.`id`
	WHERE m.`sender_side` = 'support' AND m.`sender_user_id` IS NULL;

UPDATE `wd_support_ticket` SET `resolved_at` = `updated_at` WHERE `status` = 'resolved' AND `resolved_at` IS NULL;
UPDATE `wd_support_ticket` SET `closed_at` = `updated_at` WHERE `status` = 'closed' AND `closed_at` IS NULL;

-- ---------- Audit log ----------
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
