-- Rename hub tables tbl_support_* → wd_support_* (one-time, safe if already renamed).
-- Run on database wd_support_hub.

USE `wd_support_hub`;

SET @db := DATABASE();

SET @exists_old := (
	SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
	WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'tbl_support_company'
);
SET @exists_new := (
	SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
	WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'wd_support_company'
);

SET @sql := IF(
	@exists_old = 1 AND @exists_new = 0,
	'RENAME TABLE
		`tbl_support_company` TO `wd_support_company`,
		`tbl_support_hub_user` TO `wd_support_hub_user`,
		`tbl_support_ticket` TO `wd_support_ticket`,
		`tbl_support_message` TO `wd_support_message`',
	'SELECT ''Nothing to rename (already wd_support_* or tbl_support_* missing)'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
