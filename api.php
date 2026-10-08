<?php
require_once __DIR__ . '/lib.php';

$db = hub_db();
if ( ! $db) {
	hub_json(array('ok' => FALSE, 'error' => 'Hub database is not available.'), 500);
}

$token = hub_bearer_token();
$company = hub_company_by_token($token);
if ( ! $company) {
	hub_json(array('ok' => FALSE, 'error' => 'Invalid company token.'), 401);
}
if (isset($company['status']) && $company['status'] !== 'active') {
	hub_json(array('ok' => FALSE, 'error' => 'This Water District is deactivated on the support hub.'), 401);
}

$code = $company['code'];
$action = isset($_GET['action']) ? $_GET['action'] : '';
if ($action === '') {
	$uri = isset($_SERVER['REQUEST_URI']) ? $_SERVER['REQUEST_URI'] : '';
	if (strpos($uri, 'api/push') !== FALSE) {
		$action = 'push';
	} elseif (strpos($uri, 'api/poll') !== FALSE) {
		$action = 'poll';
	}
}

$db->query("UPDATE wd_support_company SET last_seen = '".hub_esc(hub_now())."' WHERE id = ".(int) $company['id']);

if ($action === 'push' && $_SERVER['REQUEST_METHOD'] === 'POST') {
	$raw = file_get_contents('php://input');
	$payload = json_decode($raw, TRUE);
	if ( ! is_array($payload) || empty($payload['type'])) {
		hub_json(array('ok' => FALSE, 'error' => 'Invalid payload'));
	}
	if ($payload['type'] === 'ticket' && ! empty($payload['ticket'])) {
		hub_upsert_ticket($db, $code, $payload['ticket']);
		hub_json(array('ok' => TRUE));
	}
	if ($payload['type'] === 'message' && ! empty($payload['message']) && ! empty($payload['ticket_uuid'])) {
		hub_upsert_message($db, $code, $payload);
		hub_json(array('ok' => TRUE));
	}
	hub_json(array('ok' => FALSE, 'error' => 'Unknown push type'));
}

if ($action === 'poll') {
	$since = isset($_GET['since']) ? $_GET['since'] : '1970-01-01 00:00:00';
	$since = preg_replace('/[^0-9:\- ]/', '', $since);
	$messages = array();
	$q = $db->query("SELECT * FROM wd_support_message WHERE company_code = '".hub_esc($code)."' AND sender_side = 'support' AND created_at > '".hub_esc($since)."' ORDER BY id ASC LIMIT 200");
	while ($q && $row = $q->fetch_assoc()) {
		$item = array(
			'uuid' => $row['uuid'],
			'ticket_uuid' => $row['ticket_uuid'],
			'sender_side' => $row['sender_side'],
			'sender_name' => $row['sender_name'],
			'body' => $row['body'],
			'attachment_name' => $row['attachment_name'],
			'created_at' => $row['created_at']
		);
		if ( ! empty($row['attachment_path']) && is_file($row['attachment_path'])) {
			$item['attachment_base64'] = base64_encode(file_get_contents($row['attachment_path']));
		}
		$t = $db->query("SELECT status FROM wd_support_ticket WHERE uuid = '".hub_esc($row['ticket_uuid'])."' LIMIT 1");
		$tr = $t ? $t->fetch_assoc() : NULL;
		if ($tr) {
			$item['ticket_status'] = $tr['status'];
		}
		$messages[] = $item;
	}
	$tickets = array();
	$tq = $db->query("SELECT uuid, status, updated_at FROM wd_support_ticket WHERE company_code = '".hub_esc($code)."' AND updated_at > '".hub_esc($since)."'");
	while ($tq && $tr = $tq->fetch_assoc()) {
		$tickets[] = $tr;
	}
	hub_json(array('ok' => TRUE, 'messages' => $messages, 'tickets' => $tickets, 'server_time' => hub_now()));
}

if ($action === 'board') {
	hub_json(hub_board_snapshot($db, $code));
}

if ($action === 'board_receipts' && $_SERVER['REQUEST_METHOD'] === 'POST') {
	$payload = json_decode(file_get_contents('php://input'), TRUE);
	$events = (is_array($payload) && isset($payload['events']) && is_array($payload['events'])) ? array_slice($payload['events'], 0, 500) : array();
	hub_json(array('ok' => TRUE, 'accepted' => hub_board_receipts($db, $code, $events)));
}

hub_json(array('ok' => FALSE, 'error' => 'Unknown action'), 404);

/** Message Board snapshot for one WD; mirrors board() in server/src/routes/clientApi.js. */
function hub_board_snapshot($db, $code) {
	$now = hub_now();
	$ahead = date('Y-m-d H:i:s', time() + 7 * 86400);
	$history = date('Y-m-d H:i:s', time() - 90 * 86400);
	$scheme = ( ! empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
	$base = $scheme.'://'.$_SERVER['HTTP_HOST'].rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'])), '/');
	$c = hub_esc($code);
	$q = $db->query("SELECT m.uuid, m.title, m.ticker_text, m.body_html, m.category, m.priority, m.show_ticker, m.show_popup, m.require_ack,
			m.allow_opt_out, m.pinned, m.audience, m.starts_at, m.ends_at, m.version, m.updated_at
		FROM wd_board_message m
		WHERE m.status = 'published'
			AND (m.all_companies = 1 OR EXISTS (SELECT 1 FROM wd_board_message_company mc WHERE mc.message_id = m.id AND mc.company_code = '{$c}'))
			AND m.starts_at <= '".hub_esc($ahead)."'
			AND (m.ends_at IS NULL OR m.ends_at > '".hub_esc($history)."')
		ORDER BY m.pinned DESC, FIELD(m.priority, 'critical', 'important', 'normal'), m.starts_at DESC
		LIMIT 200");
	$messages = array();
	while ($q && $row = $q->fetch_assoc()) {
		$row['body_html'] = str_replace(' src="/board-assets/', ' src="'.$base.'/board-assets/', (string) $row['body_html']);
		foreach (array('show_ticker', 'show_popup', 'require_ack', 'allow_opt_out', 'pinned', 'version') as $k) {
			$row[$k] = (int) $row[$k];
		}
		$messages[] = $row;
	}
	return array('ok' => TRUE, 'messages' => $messages, 'server_time' => $now);
}

/** Mirrors boardReceipts() in server/src/routes/clientApi.js. Returns the number of accepted events. */
function hub_board_receipts($db, $code, $events) {
	$now = hub_now();
	$c = hub_esc($code);
	$accepted = 0;
	foreach ($events as $e) {
		if ( ! is_array($e)) {
			continue;
		}
		$muuid = isset($e['message_uuid']) ? (string) $e['message_uuid'] : '';
		$ukey = substr(isset($e['user_key']) ? (string) $e['user_key'] : '', 0, 80);
		$event = isset($e['event']) ? (string) $e['event'] : '';
		if ($muuid === '' || ! preg_match('/^[A-Za-z0-9_.:-]+$/', $ukey) || ! in_array($event, array('view', 'ack', 'optout', 'optin'), TRUE)) {
			continue;
		}
		$known = $db->query("SELECT m.id FROM wd_board_message m WHERE m.uuid = '".hub_esc($muuid)."'
			AND (m.all_companies = 1 OR EXISTS (SELECT 1 FROM wd_board_message_company mc WHERE mc.message_id = m.id AND mc.company_code = '{$c}')) LIMIT 1");
		if ( ! $known || ! $known->fetch_assoc()) {
			continue;
		}
		$at = preg_replace('/[^0-9:\- ]/', '', isset($e['at']) ? (string) $e['at'] : '');
		if ( ! preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/', $at) || $at > $now) {
			$at = $now;
		}
		$version = max(1, (int) (isset($e['version']) ? $e['version'] : 1));
		$uname = substr(isset($e['user_name']) ? (string) $e['user_name'] : '', 0, 150);
		$rq = $db->query("SELECT * FROM wd_board_receipt WHERE message_uuid = '".hub_esc($muuid)."' AND company_code = '{$c}' AND wd_user_key = '".hub_esc($ukey)."' LIMIT 1");
		$row = $rq ? $rq->fetch_assoc() : NULL;
		if ($row && $version < (int) $row['version'] && $event !== 'view') {
			continue;
		}
		$fresh = ! $row || $version > (int) $row['version'];
		$r = array(
			'view_count' => $row ? (int) $row['view_count'] : 0,
			'first_viewed_at' => $row ? $row['first_viewed_at'] : NULL,
			'last_viewed_at' => $row ? $row['last_viewed_at'] : NULL,
			'acked_at' => $fresh ? NULL : $row['acked_at'],
			'opted_out_at' => $fresh ? NULL : $row['opted_out_at'],
		);
		if ($event === 'view') {
			$r['view_count']++;
			$r['first_viewed_at'] = ($r['first_viewed_at'] && $r['first_viewed_at'] < $at) ? $r['first_viewed_at'] : $at;
			$r['last_viewed_at'] = ($r['last_viewed_at'] && $r['last_viewed_at'] > $at) ? $r['last_viewed_at'] : $at;
		} elseif ($event === 'ack') {
			$r['acked_at'] = $r['acked_at'] ? $r['acked_at'] : $at;
		} elseif ($event === 'optout') {
			$r['opted_out_at'] = $at;
		} else {
			$r['opted_out_at'] = NULL;
		}
		$sql = function ($v) {
			return $v === NULL ? 'NULL' : "'".hub_esc($v)."'";
		};
		$name = $uname !== '' ? $uname : ($row ? $row['user_name'] : '');
		$ver = max($version, $row ? (int) $row['version'] : 1);
		$set = 'view_count = '.(int) $r['view_count'].', first_viewed_at = '.$sql($r['first_viewed_at']).', last_viewed_at = '.$sql($r['last_viewed_at'])
			.', acked_at = '.$sql($r['acked_at']).', opted_out_at = '.$sql($r['opted_out_at']).', user_name = '.$sql($name)
			.', version = '.(int) $ver.", updated_at = '".hub_esc($now)."'";
		if ($row) {
			$db->query('UPDATE wd_board_receipt SET '.$set.' WHERE id = '.(int) $row['id']);
		} else {
			$db->query("INSERT INTO wd_board_receipt SET message_uuid = '".hub_esc($muuid)."', company_code = '{$c}', wd_user_key = '".hub_esc($ukey)."', ".$set);
		}
		$accepted++;
	}
	return $accepted;
}

function hub_upsert_ticket($db, $code, $ticket) {
	$uuid = hub_esc($ticket['uuid']);
	$exists = $db->query("SELECT id, status FROM wd_support_ticket WHERE uuid = '".$uuid."' LIMIT 1");
	$row = $exists ? $exists->fetch_assoc() : NULL;
	$now = hub_esc(hub_now());
	$fields = array(
		'company_code' => hub_esc($code),
		'ticket_no' => hub_esc(isset($ticket['ticket_no']) ? $ticket['ticket_no'] : ''),
		'subject' => hub_esc(isset($ticket['subject']) ? $ticket['subject'] : ''),
		'category' => hub_esc(isset($ticket['category']) ? $ticket['category'] : 'Other'),
		'priority' => hub_esc(isset($ticket['priority']) ? $ticket['priority'] : 'normal'),
		'status' => hub_esc(isset($ticket['status']) ? $ticket['status'] : 'open'),
		'user_id' => (int) (isset($ticket['user_id']) ? $ticket['user_id'] : 0),
		'user_name' => hub_esc(isset($ticket['user_name']) ? $ticket['user_name'] : ''),
		'usertype' => hub_esc(isset($ticket['usertype']) ? $ticket['usertype'] : ''),
		'last_message_at' => hub_esc(isset($ticket['last_message_at']) ? $ticket['last_message_at'] : $now),
		'unread_client' => (int) (isset($ticket['unread_client']) ? $ticket['unread_client'] : 0),
		'unread_support' => 1,
		'updated_at' => $now
	);
	if ($row) {
		$stamps = $row['status'] === $fields['status'] ? '' : hub_status_stamps_sql($fields['status'], $now);
		$db->query("UPDATE wd_support_ticket SET
			ticket_no='{$fields['ticket_no']}', subject='{$fields['subject']}', category='{$fields['category']}',
			priority='{$fields['priority']}', status='{$fields['status']}', user_name='{$fields['user_name']}',
			usertype='{$fields['usertype']}', last_message_at='{$fields['last_message_at']}',
			unread_support=1, updated_at='{$fields['updated_at']}'{$stamps}
			WHERE id=".(int) $row['id']);
	} else {
		$resolved = $fields['status'] === 'resolved' ? "'{$now}'" : 'NULL';
		$closed = $fields['status'] === 'closed' ? "'{$now}'" : 'NULL';
		$db->query("INSERT INTO wd_support_ticket (uuid, company_code, ticket_no, subject, category, priority, status, user_id, user_name, usertype, last_message_at, resolved_at, closed_at, unread_client, unread_support, created_at, updated_at)
			VALUES ('".$uuid."','{$fields['company_code']}','{$fields['ticket_no']}','{$fields['subject']}','{$fields['category']}','{$fields['priority']}','{$fields['status']}',{$fields['user_id']},'{$fields['user_name']}','{$fields['usertype']}','{$fields['last_message_at']}',{$resolved},{$closed},0,1,'{$now}','{$fields['updated_at']}')");
	}
}

/** SLA timestamps for a status change; mirrors statusTimestamps() in server/src/util.js. */
function hub_status_stamps_sql($status, $now) {
	if ($status === 'resolved') {
		return ", resolved_at='{$now}', closed_at=NULL";
	}
	if ($status === 'closed') {
		return ", closed_at='{$now}'";
	}
	return ', resolved_at=NULL, closed_at=NULL';
}

function hub_upsert_message($db, $code, $payload) {
	$msg = $payload['message'];
	$uuid = hub_esc($msg['uuid']);
	$exists = $db->query("SELECT id FROM wd_support_message WHERE uuid = '".$uuid."' LIMIT 1");
	if ($exists && $exists->fetch_assoc()) {
		return;
	}
	$path = NULL;
	$name = isset($msg['attachment_name']) ? $msg['attachment_name'] : NULL;
	if ( ! empty($payload['attachment_base64']) && $name) {
		$dir = __DIR__ . '/uploads/' . $code . '/' . preg_replace('/[^a-zA-Z0-9-]/', '', $payload['ticket_uuid']) . '/';
		if ( ! is_dir($dir)) {
			@mkdir($dir, 0777, TRUE);
		}
		$safe = preg_replace('/[^a-zA-Z0-9._-]/', '_', $name);
		$full = $dir.$safe;
		file_put_contents($full, base64_decode($payload['attachment_base64']));
		$path = $full;
	}
	$body = hub_esc(isset($msg['body']) ? $msg['body'] : '');
	$side = hub_esc(isset($msg['sender_side']) ? $msg['sender_side'] : 'client');
	$sname = hub_esc(isset($msg['sender_name']) ? $msg['sender_name'] : '');
	$created = hub_esc(isset($msg['created_at']) ? $msg['created_at'] : hub_now());
	$t_uuid = hub_esc($payload['ticket_uuid']);
	$apath = $path ? "'".hub_esc($path)."'" : 'NULL';
	$aname = $name ? "'".hub_esc($name)."'" : 'NULL';
	$db->query("INSERT INTO wd_support_message (uuid, ticket_uuid, company_code, sender_side, sender_name, body, attachment_path, attachment_name, created_at)
		VALUES ('".$uuid."','".$t_uuid."','".hub_esc($code)."','".$side."','".$sname."','".$body."',".$apath.",".$aname.",'".$created."')");
	$db->query("UPDATE wd_support_ticket SET unread_support=1, last_message_at='".$created."', updated_at='".hub_esc(hub_now())."' WHERE uuid='".$t_uuid."'");
}
