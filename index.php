<?php
require_once __DIR__ . '/lib.php';
hub_start_session();
global $hub_config;
$db = hub_db();
$sa4 = rtrim($hub_config['sa4_url'], '/').'/';
$base = rtrim($hub_config['base_url'], '/').'/';

$action = isset($_GET['action']) ? $_GET['action'] : '';
$flash_success = isset($_SESSION['hub_flash_success']) ? $_SESSION['hub_flash_success'] : '';
$flash_error = isset($_SESSION['hub_flash_error']) ? $_SESSION['hub_flash_error'] : '';
unset($_SESSION['hub_flash_success'], $_SESSION['hub_flash_error']);

if ($action === 'logout') {
	$_SESSION = array();
	session_destroy();
	header('Location: index.php');
	exit;
}

if ($action === 'login' && $_SERVER['REQUEST_METHOD'] === 'POST') {
	$error = 'Invalid username or password.';
	if ( ! hub_csrf_ok()) {
		$error = 'Your session expired. Please try again.';
	} else {
		$user = trim((string) $_POST['username']);
		$pass = (string) $_POST['password'];
		if ($db && $user !== '') {
			$stmt = $db->prepare('SELECT * FROM wd_support_hub_user WHERE username = ? LIMIT 1');
			$stmt->bind_param('s', $user);
			$stmt->execute();
			$row = $stmt->get_result()->fetch_assoc();
			$stmt->close();
			if ($row && password_verify($pass, $row['password_hash'])) {
				session_regenerate_id(TRUE);
				$_SESSION['hub_user'] = array(
					'id' => (int) $row['id'],
					'username' => $row['username'],
					'display_name' => $row['display_name']
				);
				header('Location: index.php');
				exit;
			}
		}
	}
}

/* ---------- Forgot password ---------- */
if ($action === 'forgot_password') {
	$info = '';
	$error = '';
	$debug_url = '';
	$identifier_value = '';

	if ($_SERVER['REQUEST_METHOD'] === 'POST') {
		if ( ! hub_csrf_ok()) {
			$error = 'Your session expired. Please try again.';
		} else {
			$identifier = trim((string) (isset($_POST['identifier']) ? $_POST['identifier'] : ''));
			$identifier_value = $identifier;
			// Always take roughly the same path timing/message (account enumeration safe).
			$generic = 'If an account matches that username or email, we sent password reset instructions.';
			$user = hub_find_user_for_reset($identifier);
			$ip = hub_client_ip();

			if ($user && ! empty($user['email']) && filter_var($user['email'], FILTER_VALIDATE_EMAIL)) {
				if (hub_reset_recent_request((int) $user['id'], $ip)) {
					$info = $generic.' If you just requested one, wait a minute before trying again.';
				} else {
					$reset = hub_create_password_reset($user);
					if ($reset) {
						$mail = hub_send_password_reset_mail($user, $reset);
						$info = $generic;
						if ( ! $mail['ok'] && hub_is_local()) {
							// Local/XAMPP often cannot deliver mail — expose link only in app_env=local.
							$debug_url = $reset['url'];
						}
					} else {
						$info = $generic;
					}
				}
			} else {
				// Unknown account / missing email — same outward message.
				usleep(200000);
				$info = $generic;
			}
		}
	}

	hub_auth_shell_start('Forgot password — WD Support Hub', $sa4);
	?>
									<h4 class="mb-1">Forgot password</h4>
									<p class="text-muted mb-4">Enter your username or account email. We will email a one-time reset link if a match is found.</p>
									<?php if ($error !== '') { ?><div class="alert alert-danger"><?php echo hub_h($error); ?></div><?php } ?>
									<?php if ($info !== '') { ?><div class="alert alert-success"><?php echo hub_h($info); ?></div><?php } ?>
									<?php if ($debug_url !== '') { ?>
									<div class="alert alert-warning">
										<strong>Local debug:</strong> mail could not be sent. Use this reset link:
										<a href="<?php echo hub_h($debug_url); ?>"><?php echo hub_h($debug_url); ?></a>
									</div>
									<?php } ?>
									<?php if ($info === '') { ?>
									<form method="post" action="index.php?action=forgot_password" autocomplete="off">
										<?php echo hub_csrf_field(); ?>
										<div class="form-group">
											<label for="identifier">Username or email</label>
											<input type="text" id="identifier" name="identifier" class="form-control" required
												value="<?php echo hub_h($identifier_value); ?>" autofocus>
										</div>
										<button type="submit" class="btn btn-danger btn-block">Send reset link</button>
									</form>
									<?php } else { ?>
									<a class="btn btn-outline-secondary btn-block" href="index.php?action=forgot_password">Request another link</a>
									<?php } ?>
									<div class="text-center mt-3">
										<a href="index.php">Back to sign in</a>
									</div>
	<?php
	hub_auth_shell_end();
	exit;
}

/* ---------- Reset password (token link) ---------- */
if ($action === 'reset_password') {
	$token = isset($_GET['token']) ? trim((string) $_GET['token']) : '';
	if ($token === '' && isset($_POST['token'])) {
		$token = trim((string) $_POST['token']);
	}
	$error = '';
	$reset = hub_lookup_valid_reset($token);

	if ($_SERVER['REQUEST_METHOD'] === 'POST') {
		if ( ! hub_csrf_ok()) {
			$error = 'Your session expired. Please request a new reset link.';
			$reset = NULL;
		} elseif ( ! $reset) {
			$error = 'This reset link is invalid or has expired.';
		} else {
			$pass = (string) (isset($_POST['password']) ? $_POST['password'] : '');
			$confirm = (string) (isset($_POST['password_confirm']) ? $_POST['password_confirm'] : '');
			$policy_error = '';
			if ($pass !== $confirm) {
				$error = 'Passwords do not match.';
			} elseif ( ! hub_password_policy_ok($pass, $policy_error)) {
				$error = $policy_error;
			} elseif ( ! hub_consume_reset_token((int) $reset['id'])) {
				$error = 'This reset link was already used. Request a new one.';
				$reset = NULL;
			} elseif ( ! hub_update_user_password((int) $reset['user_id'], $pass)) {
				$error = 'Could not update password. Please try again.';
			} else {
				hub_invalidate_user_reset_tokens((int) $reset['user_id']);
				$_SESSION = array();
				session_regenerate_id(TRUE);
				hub_start_session();
				$_SESSION['hub_flash_success'] = 'Password updated. Sign in with your new password.';
				header('Location: index.php');
				exit;
			}
		}
	}

	hub_auth_shell_start('Reset password — WD Support Hub', $sa4);
	?>
									<h4 class="mb-1">Choose a new password</h4>
									<p class="text-muted mb-4">Reset links expire after use and after a short time window.</p>
									<?php if ( ! $reset) { ?>
									<div class="alert alert-danger"><?php echo hub_h($error !== '' ? $error : 'This reset link is invalid or has expired.'); ?></div>
									<a class="btn btn-danger btn-block" href="index.php?action=forgot_password">Request a new link</a>
									<div class="text-center mt-3"><a href="index.php">Back to sign in</a></div>
									<?php } else { ?>
									<?php if ($error !== '') { ?><div class="alert alert-danger"><?php echo hub_h($error); ?></div><?php } ?>
									<form method="post" action="index.php?action=reset_password&amp;token=<?php echo hub_h(rawurlencode($token)); ?>" autocomplete="off">
										<?php echo hub_csrf_field(); ?>
										<input type="hidden" name="token" value="<?php echo hub_h($token); ?>">
										<div class="form-group">
											<label>Account</label>
											<input type="text" class="form-control" value="<?php echo hub_h($reset['username']); ?>" disabled>
										</div>
										<div class="form-group">
											<label for="password">New password</label>
											<input type="password" id="password" name="password" class="form-control" required minlength="10" autofocus>
											<small class="form-text text-muted">At least 10 characters, with a letter and a number.</small>
										</div>
										<div class="form-group">
											<label for="password_confirm">Confirm new password</label>
											<input type="password" id="password_confirm" name="password_confirm" class="form-control" required minlength="10">
										</div>
										<button type="submit" class="btn btn-danger btn-block">Update password</button>
									</form>
									<div class="text-center mt-3"><a href="index.php">Back to sign in</a></div>
									<?php } ?>
	<?php
	hub_auth_shell_end();
	exit;
}

if ( ! hub_user()) {
	hub_auth_shell_start('WD Support Hub', $sa4);
	?>
									<form method="post" action="index.php?action=login" autocomplete="off">
										<?php echo hub_csrf_field(); ?>
										<div class="form-group">
											<label for="username">Username</label>
											<input type="text" id="username" name="username" class="form-control" required autofocus>
										</div>
										<div class="form-group">
											<label for="password">Password</label>
											<input type="password" id="password" name="password" class="form-control" required>
										</div>
										<?php if ($flash_success !== '') { ?><div class="alert alert-success"><?php echo hub_h($flash_success); ?></div><?php } ?>
										<?php if ($flash_error !== '') { ?><div class="alert alert-danger"><?php echo hub_h($flash_error); ?></div><?php } ?>
										<?php if (isset($error)) { ?><div class="alert alert-danger"><?php echo hub_h($error); ?></div><?php } ?>
										<button type="submit" class="btn btn-danger btn-block">Sign in</button>
										<div class="text-center mt-3">
											<a href="index.php?action=forgot_password">Forgot password?</a>
										</div>
									</form>
	<?php
	hub_auth_shell_end();
	exit;
}

$me = hub_user();

if ($action === 'tickets') {
	$company = isset($_GET['company']) ? $_GET['company'] : '';
	$q = isset($_GET['q']) ? $_GET['q'] : '';
	$sql = "SELECT t.*, c.name AS company_name FROM wd_support_ticket t LEFT JOIN wd_support_company c ON c.code = t.company_code WHERE 1=1";
	if ($company !== '' && $company !== 'all') {
		$sql .= " AND t.company_code = '".hub_esc($company)."'";
	}
	if ($q !== '') {
		$sql .= " AND (t.subject LIKE '%".hub_esc($q)."%' OR t.ticket_no LIKE '%".hub_esc($q)."%' OR t.user_name LIKE '%".hub_esc($q)."%')";
	}
	$sql .= " ORDER BY t.last_message_at DESC, t.id DESC";
	$out = array();
	$r = $db->query($sql);
	while ($r && $row = $r->fetch_assoc()) {
		$out[] = $row;
	}
	hub_json(array('ok' => TRUE, 'tickets' => $out));
}

if ($action === 'thread') {
	$uuid = isset($_GET['uuid']) ? $_GET['uuid'] : '';
	$t = $db->query("SELECT t.*, c.name AS company_name FROM wd_support_ticket t LEFT JOIN wd_support_company c ON c.code = t.company_code WHERE t.uuid='".hub_esc($uuid)."' LIMIT 1");
	$ticket = $t ? $t->fetch_assoc() : NULL;
	if ( ! $ticket) {
		hub_json(array('ok' => FALSE, 'error' => 'Not found'));
	}
	$db->query("UPDATE wd_support_ticket SET unread_support=0 WHERE uuid='".hub_esc($uuid)."'");
	$msgs = array();
	$m = $db->query("SELECT * FROM wd_support_message WHERE ticket_uuid='".hub_esc($uuid)."' ORDER BY id ASC");
	while ($m && $row = $m->fetch_assoc()) {
		if ( ! empty($row['attachment_path'])) {
			$row['attachment_url'] = 'index.php?action=attachment&msg='.rawurlencode($row['uuid']);
		}
		$msgs[] = $row;
	}
	hub_json(array('ok' => TRUE, 'ticket' => $ticket, 'messages' => $msgs));
}

if ($action === 'send' && $_SERVER['REQUEST_METHOD'] === 'POST') {
	$uuid = isset($_POST['uuid']) ? $_POST['uuid'] : '';
	$body = isset($_POST['body']) ? trim($_POST['body']) : '';
	$t = $db->query("SELECT * FROM wd_support_ticket WHERE uuid='".hub_esc($uuid)."' LIMIT 1");
	$ticket = $t ? $t->fetch_assoc() : NULL;
	if ( ! $ticket) {
		hub_json(array('ok' => FALSE, 'error' => 'Ticket not found'));
	}
	$path = NULL;
	$aname = NULL;
	if ( ! empty($_FILES['attachment']['tmp_name']) && is_uploaded_file($_FILES['attachment']['tmp_name'])) {
		$dir = __DIR__.'/uploads/'.$ticket['company_code'].'/'.$ticket['uuid'].'/';
		if ( ! is_dir($dir)) {
			@mkdir($dir, 0777, TRUE);
		}
		$aname = $_FILES['attachment']['name'];
		$safe = preg_replace('/[^a-zA-Z0-9._-]/', '_', $aname);
		$path = $dir.date('YmdHis').'_'.$safe;
		move_uploaded_file($_FILES['attachment']['tmp_name'], $path);
	}
	if ($body === '' && ! $path) {
		hub_json(array('ok' => FALSE, 'error' => 'Type a message or attach a file.'));
	}
	$now = hub_now();
	$muuid = hub_uuid();
	$apath = $path ? "'".hub_esc($path)."'" : 'NULL';
	$anamesql = $aname ? "'".hub_esc($aname)."'" : 'NULL';
	$db->query("INSERT INTO wd_support_message (uuid, ticket_uuid, company_code, sender_side, sender_name, body, attachment_path, attachment_name, created_at)
		VALUES ('".hub_esc($muuid)."','".hub_esc($uuid)."','".hub_esc($ticket['company_code'])."','support','".hub_esc($me['display_name'])."','".hub_esc($body)."',".$apath.",".$anamesql.",'".hub_esc($now)."')");
	$status = $ticket['status'] === 'closed' ? 'closed' : 'waiting_client';
	$db->query("UPDATE wd_support_ticket SET status='".hub_esc($status)."', unread_client=1, unread_support=0, last_message_at='".hub_esc($now)."', updated_at='".hub_esc($now)."' WHERE uuid='".hub_esc($uuid)."'");
	hub_json(array('ok' => TRUE));
}

if ($action === 'set_status' && $_SERVER['REQUEST_METHOD'] === 'POST') {
	$uuid = isset($_POST['uuid']) ? $_POST['uuid'] : '';
	$status = isset($_POST['status']) ? $_POST['status'] : '';
	$ok = array('open', 'waiting_support', 'waiting_client', 'resolved', 'closed');
	if ( ! in_array($status, $ok, TRUE)) {
		hub_json(array('ok' => FALSE, 'error' => 'Invalid status'));
	}
	$db->query("UPDATE wd_support_ticket SET status='".hub_esc($status)."', updated_at='".hub_esc(hub_now())."' WHERE uuid='".hub_esc($uuid)."'");
	hub_json(array('ok' => TRUE));
}

if ($action === 'attachment') {
	$uuid = isset($_GET['msg']) ? $_GET['msg'] : '';
	$m = $db->query("SELECT * FROM wd_support_message WHERE uuid='".hub_esc($uuid)."' LIMIT 1");
	$row = $m ? $m->fetch_assoc() : NULL;
	if ( ! $row || empty($row['attachment_path']) || ! is_file($row['attachment_path'])) {
		http_response_code(404);
		echo 'Not found';
		exit;
	}
	$name = $row['attachment_name'] ? $row['attachment_name'] : basename($row['attachment_path']);
	header('Content-Type: application/octet-stream');
	header('Content-Disposition: inline; filename="'.str_replace('"', '', $name).'"');
	readfile($row['attachment_path']);
	exit;
}

$companies = array();
if ($db) {
	$cq = $db->query('SELECT code, name FROM wd_support_company ORDER BY name');
	while ($cq && $row = $cq->fetch_assoc()) {
		$companies[] = $row;
	}
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<title>WD Support Hub</title>
	<link rel="stylesheet" media="screen, print" href="<?php echo hub_h($sa4); ?>css/vendors.bundle.css">
	<link rel="stylesheet" media="screen, print" href="<?php echo hub_h($sa4); ?>css/app.bundle.css">
	<style>
		.ms-desk { height: calc(100vh - 80px); min-height: 520px; }
		.ms-ticket.active { background: #e8f4fc; }
		/* Re-enable the app title and make the whole page header purple (SmartAdmin hides .page-logo inside .page-header) */
		.page-header { background-color: #584475; }
		.page-header .page-logo {
			display: flex;
			position: static;
			background: #584475;
			box-shadow: none;
		}
		.page-header .page-logo-text { color: #fff; }
		.page-header .ml-auto span { color: #fff; }
	</style>
</head>
<body class="mod-bg-1 nav-function-hidden header-function-fixed">
	<div class="page-wrapper">
		<div class="page-inner">
			<header class="page-header" role="banner">
				<div class="page-logo"><span class="page-logo-text mr-1">Water District Support Hub</span></div>
				<div class="ml-auto d-flex align-items-center pr-3">
					<span class="mr-3"><?php echo hub_h($me['display_name']); ?></span>
					<a class="btn btn-sm btn-outline-light" href="index.php?action=logout">Logout</a>
				</div>
			</header>
			<main class="page-content p-3">
				<div class="d-flex p-0 border-faded shadow-4 bg-white ms-desk">
					<div class="border-faded border-left-0 border-top-0 border-bottom-0" style="width:20rem;">
						<div class="d-flex flex-column h-100">
							<div class="p-3 border-faded border-left-0 border-right-0 border-top-0">
								<select id="ms-filter-company" class="form-control form-control-sm mb-2">
									<option value="all">All companies</option>
									<?php foreach ($companies as $c) { ?>
									<option value="<?php echo hub_h($c['code']); ?>"><?php echo hub_h($c['name']); ?></option>
									<?php } ?>
								</select>
								<input type="text" id="ms-search" class="form-control form-control-sm" placeholder="Search tickets">
							</div>
							<div class="flex-1 custom-scroll">
								<ul class="list-unstyled m-0" id="js-ms-ticket-list"></ul>
							</div>
						</div>
					</div>
					<div class="d-flex flex-column flex-grow-1">
						<div class="d-flex align-items-center px-3 py-2 border-faded border-top-0 border-left-0 border-right-0">
							<div>
								<div class="fs-lg" id="ms-header-title">Select a ticket</div>
								<small class="text-muted" id="ms-header-sub">Labason, Roxas, and future WDs</small>
							</div>
							<div class="ml-auto d-none" id="ms-header-actions">
								<button type="button" class="btn btn-sm btn-outline-success" data-ms-status="resolved">Resolved</button>
								<button type="button" class="btn btn-sm btn-outline-secondary" data-ms-status="closed">Close</button>
								<button type="button" class="btn btn-sm btn-outline-info" data-ms-status="open">Reopen</button>
							</div>
						</div>
						<div class="flex-1 custom-scroll bg-gray-50">
							<div id="ms-chat-container" class="p-4"></div>
						</div>
						<div class="border-faded border-right-0 border-bottom-0 border-left-0 p-3">
							<textarea id="ms-composer" class="form-control mb-2" rows="3" placeholder="Reply as Super Admin..." disabled></textarea>
							<div class="d-flex align-items-center">
								<input type="file" id="ms-file" accept="image/*,.pdf">
								<button type="button" class="btn btn-info ml-auto" id="ms-btn-send" disabled>Send</button>
							</div>
						</div>
					</div>
				</div>
			</main>
		</div>
	</div>
	<script src="<?php echo hub_h($sa4); ?>js/vendors.bundle.js"></script>
	<script src="<?php echo hub_h($sa4); ?>js/app.bundle.js"></script>
	<script>
	(function ($) {
		var currentUuid = '';
		function esc(s) { return $('<div/>').text(s == null ? '' : String(s)).html(); }
		function badge(st) {
			var map = { open:'primary', waiting_support:'warning', waiting_client:'info', resolved:'success', closed:'secondary' };
			return '<span class="badge badge-'+(map[st]||'light')+'">'+esc(st)+'</span>';
		}
		function loadList() {
			$.getJSON('index.php', { action:'tickets', company:$('#ms-filter-company').val(), q:$('#ms-search').val() }, function (res) {
				var $ul = $('#js-ms-ticket-list').empty();
				$.each(res.tickets || [], function (_, t) {
					var unread = parseInt(t.unread_support, 10) === 1;
					var $a = $('<a href="javascript:void(0);" class="d-block px-3 py-2 text-dark ms-ticket"/>').attr('data-uuid', t.uuid);
					if (t.uuid === currentUuid) $a.addClass('active');
					$a.html('<div class="fw-500">'+esc(t.company_code)+' · '+esc(t.ticket_no)+'</div><div class="text-truncate">'+esc(t.subject)+'</div><small>'+badge(t.status)+(unread?' <span class="badge badge-danger">new</span>':'')+'</small>');
					$ul.append($('<li/>').append($a));
				});
			});
		}
		function loadThread(uuid) {
			currentUuid = uuid;
			$.getJSON('index.php', { action:'thread', uuid:uuid }, function (res) {
				if (!res.ok) return;
				var t = res.ticket;
				$('#ms-header-title').text(t.company_name+' · '+t.ticket_no+' · '+t.subject);
				$('#ms-header-sub').html(badge(t.status)+' · '+esc(t.priority)+' · '+esc(t.user_name));
				$('#ms-header-actions').removeClass('d-none');
				$('#ms-composer, #ms-btn-send').prop('disabled', t.status === 'closed');
				var $box = $('#ms-chat-container').empty();
				$.each(res.messages || [], function (_, m) {
					var mine = m.sender_side === 'support';
					var cls = 'chat-segment '+(mine?'chat-segment-sent':'chat-segment-get');
					var attach = m.attachment_url ? '<p><a href="'+m.attachment_url+'" target="_blank">'+esc(m.attachment_name||'file')+'</a></p>' : '';
					$box.append('<div class="'+cls+'"><div class="chat-message"><p>'+esc(m.body).replace(/\\n/g,'<br>')+'</p>'+attach+'</div><div class="fs-xs text-muted">'+(mine?'You':'Client')+' · '+esc(m.created_at)+'</div></div>');
				});
				loadList();
			});
		}
		$('#js-ms-ticket-list').on('click', '.ms-ticket', function () { loadThread($(this).data('uuid')); });
		$('#ms-filter-company, #ms-search').on('change keyup', loadList);
		$('#ms-btn-send').on('click', function () {
			if (!currentUuid) return;
			var fd = new FormData();
			fd.append('uuid', currentUuid);
			fd.append('body', $('#ms-composer').val());
			var f = $('#ms-file')[0].files[0];
			if (f) fd.append('attachment', f);
			$.ajax({ url:'index.php?action=send', method:'POST', data:fd, processData:false, contentType:false, dataType:'json' })
				.done(function (res) {
					if (!res.ok) { alert(res.error||'Send failed'); return; }
					$('#ms-composer').val(''); $('#ms-file').val('');
					loadThread(currentUuid);
				});
		});
		$('[data-ms-status]').on('click', function () {
			if (!currentUuid) return;
			$.post('index.php?action=set_status', { uuid: currentUuid, status: $(this).data('ms-status') }, function (res) {
				if (res.ok) loadThread(currentUuid);
			}, 'json');
		});
		loadList();
		setInterval(function () { loadList(); if (currentUuid) loadThread(currentUuid); }, 8000);
	})(jQuery);
	</script>
</body>
</html>
