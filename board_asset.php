<?php
// Message Board images for the legacy PHP hub; mirrors GET /board-assets/:uuid in server/src/index.js (no login, unguessable UUID).
require_once __DIR__ . '/lib.php';

$db = hub_db();
$uuid = isset($_GET['uuid']) ? preg_replace('/[^a-zA-Z0-9-]/', '', $_GET['uuid']) : '';
$row = NULL;
if ($db && $uuid !== '') {
	$q = $db->query("SELECT file_path, mime FROM wd_board_asset WHERE uuid = '".hub_esc($uuid)."' LIMIT 1");
	$row = $q ? $q->fetch_assoc() : NULL;
}
$file = $row ? $row['file_path'] : '';
if ($file && ! is_file($file)) {
	$parts = preg_split('#[\\\\/]uploads[\\\\/]#', $file);
	$file = count($parts) > 1 ? __DIR__.'/uploads/'.end($parts) : '';
}
if ( ! $file || ! is_file($file)) {
	http_response_code(404);
	header('Content-Type: text/plain');
	exit('Not found');
}
header('Content-Type: '.($row['mime'] ? $row['mime'] : 'application/octet-stream'));
header('X-Content-Type-Options: nosniff');
header('Cache-Control: public, max-age=31536000, immutable');
header('Content-Length: '.filesize($file));
readfile($file);
