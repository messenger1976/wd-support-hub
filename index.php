<?php
require_once __DIR__ . '/lib.php';
hub_start_session();
global $hub_config;
$db = hub_db();
$sa4 = rtrim($hub_config['sa4_url'], '/').'/';
$base = rtrim($hub_config['base_url'], '/').'/';

$action = isset($_GET['action']) ? $_GET['action'] : '';

if ($action === 'logout') {
	$_SESSION = array();
	session_destroy();
	header('Location: index.php');
	exit;
}

if ($action === 'login' && $_SERVER['REQUEST_METHOD'] === 'POST') {
	$user = trim((string) $_POST['username']);
	$pass = (string) $_POST['password'];
	$error = 'Invalid username or password.';
	if ($db && $user !== '') {
		$stmt = $db->prepare('SELECT * FROM wd_support_hub_user WHERE username = ? LIMIT 1');
		$stmt->bind_param('s', $user);
		$stmt->execute();
		$row = $stmt->get_result()->fetch_assoc();
		$stmt->close();
		if ($row && password_verify($pass, $row['password_hash'])) {
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

if ( ! hub_user()) {
	?>
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<title>WD Support Hub</title>
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
							<span class="page-logo-text mr-1">WD Support Hub</span>
						</div>
					</div>
				</div>
				<div class="flex-1" style="background: url(<?php echo hub_h($sa4); ?>img/svg/pattern-1.svg) no-repeat center bottom fixed; background-size: cover;">
					<div class="container py-5 py-lg-8">
						<div class="row">
							<div class="col-xl-6 ml-auto mr-auto">
								<div class="card p-4 rounded-plus bg-faded">
									<form method="post" action="index.php?action=login">
										<div class="form-group">
											<label>Username</label>
											<input type="text" name="username" class="form-control" required>
										</div>
										<div class="form-group">
											<label>Password</label>
											<input type="password" name="password" class="form-control" required>
										</div>
										<?php if (isset($error)) { ?><div class="alert alert-danger"><?php echo hub_h($error); ?></div><?php } ?>
										<button type="submit" class="btn btn-danger btn-block">Sign in</button>
									</form>
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
	</style>
</head>
<body class="mod-bg-1 nav-function-hidden header-function-fixed">
	<div class="page-wrapper">
		<div class="page-inner">
			<header class="page-header" role="banner">
				<div class="page-logo"><span class="page-logo-text mr-1">WD Support Hub</span></div>
				<div class="ml-auto d-flex align-items-center pr-3">
					<span class="mr-3"><?php echo hub_h($me['display_name']); ?></span>
					<a class="btn btn-sm btn-outline-danger" href="index.php?action=logout">Logout</a>
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
