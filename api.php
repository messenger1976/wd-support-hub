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

hub_json(array('ok' => FALSE, 'error' => 'Unknown action'), 404);

function hub_upsert_ticket($db, $code, $ticket) {
	$uuid = hub_esc($ticket['uuid']);
	$exists = $db->query("SELECT id FROM wd_support_ticket WHERE uuid = '".$uuid."' LIMIT 1");
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
		$db->query("UPDATE wd_support_ticket SET
			ticket_no='{$fields['ticket_no']}', subject='{$fields['subject']}', category='{$fields['category']}',
			priority='{$fields['priority']}', status='{$fields['status']}', user_name='{$fields['user_name']}',
			usertype='{$fields['usertype']}', last_message_at='{$fields['last_message_at']}',
			unread_support=1, updated_at='{$fields['updated_at']}'
			WHERE id=".(int) $row['id']);
	} else {
		$db->query("INSERT INTO wd_support_ticket (uuid, company_code, ticket_no, subject, category, priority, status, user_id, user_name, usertype, last_message_at, unread_client, unread_support, created_at, updated_at)
			VALUES ('".$uuid."','{$fields['company_code']}','{$fields['ticket_no']}','{$fields['subject']}','{$fields['category']}','{$fields['priority']}','{$fields['status']}',{$fields['user_id']},'{$fields['user_name']}','{$fields['usertype']}','{$fields['last_message_at']}',0,1,'{$now}','{$fields['updated_at']}')");
	}
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
