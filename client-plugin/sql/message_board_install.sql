-- Message Board plugin (WD app side). Run once on the Water District's database.
-- Messages are a cache of the hub's board (api.php?action=board); the hub stays the source of truth.

CREATE TABLE IF NOT EXISTS `tbl_board_message` (
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
	`starts_at` DATETIME NOT NULL,
	`ends_at` DATETIME DEFAULT NULL,
	`version` INT(11) NOT NULL DEFAULT 1,
	`updated_at` DATETIME DEFAULT NULL,
	`synced_at` DATETIME NOT NULL,
	PRIMARY KEY (`id`),
	UNIQUE KEY `uuid` (`uuid`),
	KEY `window` (`starts_at`, `ends_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Per-user state. user_key = "usertype:userid" (e.g. admin:1), because admin and staff ids can repeat.
CREATE TABLE IF NOT EXISTS `tbl_board_user_pref` (
	`id` INT(11) NOT NULL AUTO_INCREMENT,
	`message_uuid` VARCHAR(36) NOT NULL,
	`user_key` VARCHAR(80) NOT NULL,
	`seen_version` INT(11) NOT NULL DEFAULT 0,
	`view_count` INT(11) NOT NULL DEFAULT 0,
	`first_seen_at` DATETIME DEFAULT NULL,
	`last_seen_at` DATETIME DEFAULT NULL,
	`acked_version` INT(11) NOT NULL DEFAULT 0,
	`acked_at` DATETIME DEFAULT NULL,
	`opted_out_version` INT(11) NOT NULL DEFAULT 0,
	`opted_out_at` DATETIME DEFAULT NULL,
	PRIMARY KEY (`id`),
	UNIQUE KEY `message_user` (`message_uuid`, `user_key`),
	KEY `user_key` (`user_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Read receipts waiting to be sent to the hub (view / ack / optout / optin).
CREATE TABLE IF NOT EXISTS `tbl_board_receipt_queue` (
	`id` INT(11) NOT NULL AUTO_INCREMENT,
	`payload` TEXT NOT NULL,
	`attempts` INT(11) NOT NULL DEFAULT 0,
	`created_at` DATETIME NOT NULL,
	PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `tbl_board_state` (
	`id` INT(11) NOT NULL,
	`last_fetch_at` DATETIME DEFAULT NULL,
	`last_success_at` DATETIME DEFAULT NULL,
	`last_error` VARCHAR(500) NOT NULL DEFAULT '',
	`updated_at` DATETIME DEFAULT NULL,
	PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

INSERT IGNORE INTO `tbl_board_state` (`id`, `last_error`) VALUES (1, '');
