<?php
require_once __DIR__ . '/config.php';

function hub_db() {
	static $mysqli = NULL;
	global $hub_config;
	if ($mysqli instanceof mysqli) {
		return $mysqli;
	}
	$mysqli = @new mysqli($hub_config['db_host'], $hub_config['db_user'], $hub_config['db_pass'], $hub_config['db_name']);
	if ($mysqli->connect_error) {
		return NULL;
	}
	$mysqli->set_charset('utf8');
	return $mysqli;
}

function hub_esc($s) {
	$db = hub_db();
	return $db ? $db->real_escape_string((string) $s) : addslashes((string) $s);
}

function hub_start_session() {
	global $hub_config;
	if (session_status() !== PHP_SESSION_ACTIVE) {
		session_name($hub_config['session_name']);
		session_start();
	}
}

function hub_user() {
	hub_start_session();
	return empty($_SESSION['hub_user']) ? NULL : $_SESSION['hub_user'];
}

function hub_require_login() {
	if ( ! hub_user()) {
		header('Location: index.php');
		exit;
	}
}

function hub_json($data, $code = 200) {
	http_response_code($code);
	header('Content-Type: application/json; charset=utf-8');
	echo json_encode($data);
	exit;
}

function hub_bearer_token() {
	$hdr = '';
	if ( ! empty($_SERVER['HTTP_AUTHORIZATION'])) {
		$hdr = $_SERVER['HTTP_AUTHORIZATION'];
	} elseif ( ! empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
		$hdr = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
	} elseif (function_exists('apache_request_headers')) {
		$h = apache_request_headers();
		if (isset($h['Authorization'])) {
			$hdr = $h['Authorization'];
		}
	}
	if (stripos($hdr, 'Bearer ') === 0) {
		return trim(substr($hdr, 7));
	}
	return '';
}

function hub_company_by_token($token) {
	$db = hub_db();
	if ( ! $db || $token === '') {
		return NULL;
	}
	$stmt = $db->prepare('SELECT * FROM wd_support_company WHERE token = ? LIMIT 1');
	if ( ! $stmt) {
		return NULL;
	}
	$stmt->bind_param('s', $token);
	$stmt->execute();
	$res = $stmt->get_result();
	$row = $res ? $res->fetch_assoc() : NULL;
	$stmt->close();
	return $row;
}

function hub_uuid() {
	$data = openssl_random_pseudo_bytes(16);
	$data[6] = chr(ord($data[6]) & 0x0f | 0x40);
	$data[8] = chr(ord($data[8]) & 0x3f | 0x80);
	$hex = bin2hex($data);
	return substr($hex, 0, 8).'-'.substr($hex, 8, 4).'-'.substr($hex, 12, 4).'-'.substr($hex, 16, 4).'-'.substr($hex, 20, 12);
}

function hub_now() {
	return date('Y-m-d H:i:s');
}

function hub_h($s) {
	return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
}
