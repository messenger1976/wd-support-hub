<?php
$hub_config = array(
	'db_host' => 'localhost',
	'db_user' => 'root',
	'db_pass' => '',
	'db_name' => 'wd_support_hub',
	'base_url' => 'http://localhost/wd-support-hub/',
	'sa4_url' => 'http://localhost/smartadmin-html-full/dist/',
	'session_name' => 'wd_support_hub',
	'upload_dir' => __DIR__ . '/uploads/',

	// local | production — local may surface reset link if mail cannot send
	'app_env' => 'local',

	// Password reset
	'password_reset_ttl_minutes' => 60,
	'password_reset_cooldown_seconds' => 90,
	'mail_from' => 'noreply@localhost',
	'mail_from_name' => 'WD Support Hub',
);
