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
	return isset($_SERVER['HTTP_X_WD_TOKEN']) ? trim($_SERVER['HTTP_X_WD_TOKEN']) : '';
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

function hub_client_ip() {
	$ip = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '';
	return substr(preg_replace('/[^0-9a-fA-F:.]/', '', $ip), 0, 45);
}

function hub_is_local() {
	global $hub_config;
	return isset($hub_config['app_env']) && strtolower((string) $hub_config['app_env']) === 'local';
}

function hub_csrf_token() {
	hub_start_session();
	if (empty($_SESSION['hub_csrf'])) {
		$_SESSION['hub_csrf'] = bin2hex(openssl_random_pseudo_bytes(32));
	}
	return $_SESSION['hub_csrf'];
}

function hub_csrf_field() {
	return '<input type="hidden" name="csrf_token" value="'.hub_h(hub_csrf_token()).'">';
}

function hub_csrf_ok() {
	hub_start_session();
	$posted = isset($_POST['csrf_token']) ? (string) $_POST['csrf_token'] : '';
	$session = isset($_SESSION['hub_csrf']) ? (string) $_SESSION['hub_csrf'] : '';
	return $posted !== '' && $session !== '' && hash_equals($session, $posted);
}

function hub_password_policy_ok($password, &$error = NULL) {
	if (strlen($password) < 10) {
		$error = 'Password must be at least 10 characters.';
		return FALSE;
	}
	if (strlen($password) > 128) {
		$error = 'Password is too long.';
		return FALSE;
	}
	if ( ! preg_match('/[A-Za-z]/', $password) || ! preg_match('/[0-9]/', $password)) {
		$error = 'Password must include at least one letter and one number.';
		return FALSE;
	}
	return TRUE;
}

function hub_find_user_for_reset($identifier) {
	$db = hub_db();
	if ( ! $db || $identifier === '') {
		return NULL;
	}
	$stmt = $db->prepare('SELECT * FROM wd_support_hub_user WHERE username = ? OR email = ? LIMIT 1');
	if ( ! $stmt) {
		return NULL;
	}
	$stmt->bind_param('ss', $identifier, $identifier);
	$stmt->execute();
	$row = $stmt->get_result()->fetch_assoc();
	$stmt->close();
	return $row ? $row : NULL;
}

function hub_reset_recent_request($user_id, $ip) {
	global $hub_config;
	$db = hub_db();
	if ( ! $db) {
		return FALSE;
	}
	$cooldown = isset($hub_config['password_reset_cooldown_seconds'])
		? (int) $hub_config['password_reset_cooldown_seconds'] : 90;
	if ($cooldown < 30) {
		$cooldown = 30;
	}
	$since = date('Y-m-d H:i:s', time() - $cooldown);
	$stmt = $db->prepare(
		'SELECT id FROM wd_support_password_reset
		 WHERE (user_id = ? OR request_ip = ?) AND created_at >= ? AND used_at IS NULL
		 LIMIT 1'
	);
	if ( ! $stmt) {
		return FALSE;
	}
	$uid = (int) $user_id;
	$stmt->bind_param('iss', $uid, $ip, $since);
	$stmt->execute();
	$hit = $stmt->get_result()->fetch_assoc();
	$stmt->close();
	return (bool) $hit;
}

function hub_invalidate_user_reset_tokens($user_id) {
	$db = hub_db();
	if ( ! $db) {
		return;
	}
	$uid = (int) $user_id;
	$now = hub_now();
	$stmt = $db->prepare(
		'UPDATE wd_support_password_reset SET used_at = ?
		 WHERE user_id = ? AND used_at IS NULL'
	);
	if ($stmt) {
		$stmt->bind_param('si', $now, $uid);
		$stmt->execute();
		$stmt->close();
	}
}

function hub_create_password_reset($user) {
	global $hub_config;
	$db = hub_db();
	if ( ! $db || empty($user['id'])) {
		return NULL;
	}

	$ttl = isset($hub_config['password_reset_ttl_minutes'])
		? (int) $hub_config['password_reset_ttl_minutes'] : 60;
	if ($ttl < 15) {
		$ttl = 15;
	}
	if ($ttl > 1440) {
		$ttl = 1440;
	}

	$token = bin2hex(openssl_random_pseudo_bytes(32));
	$token_hash = hash('sha256', $token);
	$now = hub_now();
	$expires = date('Y-m-d H:i:s', time() + ($ttl * 60));
	$ip = hub_client_ip();
	$uid = (int) $user['id'];

	hub_invalidate_user_reset_tokens($uid);

	$stmt = $db->prepare(
		'INSERT INTO wd_support_password_reset (user_id, token_hash, expires_at, used_at, request_ip, created_at)
		 VALUES (?, ?, ?, NULL, ?, ?)'
	);
	if ( ! $stmt) {
		return NULL;
	}
	$stmt->bind_param('issss', $uid, $token_hash, $expires, $ip, $now);
	$ok = $stmt->execute();
	$stmt->close();
	if ( ! $ok) {
		return NULL;
	}

	$base = rtrim($hub_config['base_url'], '/').'/';
	return array(
		'token' => $token,
		'expires_at' => $expires,
		'ttl_minutes' => $ttl,
		'url' => $base.'index.php?action=reset_password&token='.rawurlencode($token)
	);
}

function hub_lookup_valid_reset($raw_token) {
	$db = hub_db();
	$raw_token = trim((string) $raw_token);
	if ( ! $db || $raw_token === '' || ! preg_match('/^[a-f0-9]{64}$/', $raw_token)) {
		return NULL;
	}
	$token_hash = hash('sha256', $raw_token);
	$now = hub_now();
	$stmt = $db->prepare(
		'SELECT r.*, u.username, u.display_name, u.email
		 FROM wd_support_password_reset r
		 INNER JOIN wd_support_hub_user u ON u.id = r.user_id
		 WHERE r.token_hash = ? AND r.used_at IS NULL AND r.expires_at > ?
		 LIMIT 1'
	);
	if ( ! $stmt) {
		return NULL;
	}
	$stmt->bind_param('ss', $token_hash, $now);
	$stmt->execute();
	$row = $stmt->get_result()->fetch_assoc();
	$stmt->close();
	return $row ? $row : NULL;
}

function hub_consume_reset_token($reset_id) {
	$db = hub_db();
	if ( ! $db) {
		return FALSE;
	}
	$now = hub_now();
	$id = (int) $reset_id;
	$stmt = $db->prepare(
		'UPDATE wd_support_password_reset SET used_at = ?
		 WHERE id = ? AND used_at IS NULL'
	);
	if ( ! $stmt) {
		return FALSE;
	}
	$stmt->bind_param('si', $now, $id);
	$stmt->execute();
	$affected = $stmt->affected_rows;
	$stmt->close();
	return $affected === 1;
}

function hub_update_user_password($user_id, $password) {
	$db = hub_db();
	if ( ! $db) {
		return FALSE;
	}
	$hash = password_hash($password, PASSWORD_DEFAULT);
	$uid = (int) $user_id;
	$stmt = $db->prepare('UPDATE wd_support_hub_user SET password_hash = ? WHERE id = ?');
	if ( ! $stmt) {
		return FALSE;
	}
	$stmt->bind_param('si', $hash, $uid);
	$ok = $stmt->execute();
	$stmt->close();
	return (bool) $ok;
}

function hub_mask_email($email) {
	$email = trim((string) $email);
	if ($email === '' || strpos($email, '@') === FALSE) {
		return '';
	}
	list($local, $domain) = explode('@', $email, 2);
	$keep = max(1, min(2, strlen($local)));
	return substr($local, 0, $keep).str_repeat('*', max(1, strlen($local) - $keep)).'@'.$domain;
}

function hub_send_password_reset_mail($user, $reset) {
	global $hub_config;
	$email = isset($user['email']) ? trim((string) $user['email']) : '';
	if ($email === '' || ! filter_var($email, FILTER_VALIDATE_EMAIL)) {
		return array('ok' => FALSE, 'error' => 'no_email');
	}

	$from = isset($hub_config['mail_from']) ? $hub_config['mail_from'] : 'noreply@localhost';
	$from_name = isset($hub_config['mail_from_name']) ? $hub_config['mail_from_name'] : 'WD Support Hub';
	$ttl = (int) $reset['ttl_minutes'];
	$display = isset($user['display_name']) && $user['display_name'] !== ''
		? $user['display_name'] : $user['username'];

	$subject = 'Reset your WD Support Hub password';
	$body = "Hello {$display},\n\n"
		."We received a request to reset your WD Support Hub password.\n\n"
		."Open this link to choose a new password (expires in {$ttl} minutes):\n"
		.$reset['url']."\n\n"
		."If you did not request this, you can ignore this email. Your password will stay the same.\n\n"
		."— {$from_name}\n";

	$headers = array();
	$headers[] = 'MIME-Version: 1.0';
	$headers[] = 'Content-Type: text/plain; charset=UTF-8';
	$headers[] = 'From: '.sprintf('%s <%s>', preg_replace('/[\r\n]+/', '', $from_name), $from);
	$headers[] = 'Reply-To: '.$from;
	$headers[] = 'X-Mailer: WD-Support-Hub';

	$ok = @mail($email, $subject, $body, implode("\r\n", $headers));
	return array('ok' => (bool) $ok, 'error' => $ok ? NULL : 'mail_failed');
}

function hub_auth_shell_start($title, $sa4) {
	?>
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<title><?php echo hub_h($title); ?></title>
	<link rel="stylesheet" media="screen, print" href="<?php echo hub_h($sa4); ?>css/vendors.bundle.css">
	<link rel="stylesheet" media="screen, print" href="<?php echo hub_h($sa4); ?>css/app.bundle.css">
</head>
<body class="mod-bg-1">
	<div class="page-wrapper">
		<div class="page-inner bg-brand-gradient">
			<div class="page-content-wrapper bg-transparent m-0">
				<div class="height-10 w-100 shadow-lg px-4 bg-brand-gradient">
					<div class="d-flex align-items-center container p-0">
						<div class="page-logo width-mobile-auto m-0 align-items-center justify-content-center p-0 bg-transparent bg-img-none shadow-0 height-9">
							<span class="page-logo-text mr-1">Water District Support Hub</span>
						</div>
					</div>
				</div>
				<div class="flex-1" style="background: url(<?php echo hub_h($sa4); ?>img/svg/pattern-1.svg) no-repeat center bottom fixed; background-size: cover;">
					<div class="container py-5 py-lg-8">
						<div class="row">
							<div class="col-xl-6 ml-auto mr-auto">
								<div class="card p-4 rounded-plus bg-faded">
	<?php
}

function hub_auth_shell_end() {
	?>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</body>
</html>
	<?php
}
