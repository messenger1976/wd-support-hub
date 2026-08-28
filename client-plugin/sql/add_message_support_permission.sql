-- Roles & Responsibilities: Message Support (sidebar).
-- Safe to re-run: skips if the column already exists.

SET @db := DATABASE();

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
