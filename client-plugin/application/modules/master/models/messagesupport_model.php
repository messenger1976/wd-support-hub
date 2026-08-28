<?php if ( ! defined('BASEPATH')) exit('No direct script access allowed');

class messagesupport_model extends CI_Model {

	public $table_ticket = 'tbl_support_ticket';
	public $table_message = 'tbl_support_message';
	public $table_queue = 'tbl_support_sync_queue';
	public $table_state = 'tbl_support_sync_state';

	public function __construct() {
		parent::__construct();
		$this->load->config('message_support', TRUE);
	}

	/** False until sql/message_support_install.sql has been applied to this database. */
	public function tables_ready() {
		return $this->db->table_exists($this->table_ticket)
			&& $this->db->table_exists($this->table_message)
			&& $this->db->table_exists($this->table_queue)
			&& $this->db->table_exists($this->table_state);
	}

	public function cfg($key, $default = '') {
		$val = $this->config->item($key, 'message_support');
		return ($val === FALSE || $val === NULL) ? $default : $val;
	}

	public function new_uuid() {
		$data = function_exists('openssl_random_pseudo_bytes') ? openssl_random_pseudo_bytes(16) : md5(uniqid(mt_rand(), TRUE), TRUE);
		$data[6] = chr(ord($data[6]) & 0x0f | 0x40);
		$data[8] = chr(ord($data[8]) & 0x3f | 0x80);
		$hex = bin2hex($data);
		return substr($hex, 0, 8).'-'.substr($hex, 8, 4).'-'.substr($hex, 12, 4).'-'.substr($hex, 16, 4).'-'.substr($hex, 20, 12);
	}

	public function categories() {
		return array('Billing', 'Payments', 'Reports', 'Login/Access', 'Other');
	}

	public function priorities() {
		return array('low', 'normal', 'high', 'urgent');
	}

	public function statuses() {
		return array('open', 'waiting_support', 'waiting_client', 'resolved', 'closed');
	}

	public function unread_count() {
		if ( ! $this->db->table_exists($this->table_ticket)) {
			return 0;
		}
		$this->db->where('unread_client', 1);
		$this->db->where_in('status', array('open', 'waiting_support', 'waiting_client', 'resolved'));
		return (int) $this->db->count_all_results($this->table_ticket);
	}

	public function list_tickets($status = '', $q = '') {
		if ( ! $this->tables_ready()) {
			return array();
		}
		$this->db->select('*');
		$this->db->from($this->table_ticket);
		if ($status !== '' && $status !== 'all') {
			$this->db->where('status', $status);
		}
		if ($q !== '') {
			$this->db->like('subject', $q);
			$this->db->or_like('ticket_no', $q);
			$this->db->or_like('user_name', $q);
		}
		$this->db->order_by('last_message_at', 'DESC');
		$this->db->order_by('id', 'DESC');
		return $this->db->get()->result_array();
	}

	public function get_ticket_by_uuid($uuid) {
		return $this->db->get_where($this->table_ticket, array('uuid' => $uuid))->row_array();
	}

	public function get_ticket($id) {
		return $this->db->get_where($this->table_ticket, array('id' => (int) $id))->row_array();
	}

	public function list_messages($ticket_id) {
		$this->db->where('ticket_id', (int) $ticket_id);
		$this->db->order_by('id', 'ASC');
		return $this->db->get($this->table_message)->result_array();
	}

	public function next_ticket_no() {
		$prefix = $this->cfg('ms_ticket_prefix', 'WD');
		$year = date('Y');
		$like = $prefix.'-'.$year.'-';
		$this->db->select('ticket_no');
		$this->db->from($this->table_ticket);
		$this->db->like('ticket_no', $like, 'after');
		$this->db->order_by('id', 'DESC');
		$this->db->limit(1);
		$row = $this->db->get()->row_array();
		$n = 1;
		if ($row && preg_match('/(\d+)$/', $row['ticket_no'], $m)) {
			$n = (int) $m[1] + 1;
		}
		return $like.str_pad((string) $n, 4, '0', STR_PAD_LEFT);
	}

	public function create_ticket($data, $first_body, $attachment = NULL) {
		if ( ! $this->tables_ready()) {
			return array('error' => 'Message Support tables are missing. Run sql/message_support_install.sql on this database.');
		}
		$now = date('Y-m-d H:i:s');
		$uuid = $this->new_uuid();
		$row = array(
			'uuid' => $uuid,
			'ticket_no' => $this->next_ticket_no(),
			'subject' => $data['subject'],
			'category' => $data['category'],
			'priority' => $data['priority'],
			'status' => 'waiting_support',
			'user_id' => (int) $data['user_id'],
			'user_name' => $data['user_name'],
			'usertype' => $data['usertype'],
			'last_message_at' => $now,
			'unread_client' => 0,
			'unread_support' => 1,
			'created_at' => $now,
			'updated_at' => $now
		);
		$this->db->insert($this->table_ticket, $row);
		$ticket_id = (int) $this->db->insert_id();
		if ($attachment && isset($attachment['tmp_name'])) {
			$stored = $this->store_upload($uuid, $attachment);
			if (isset($stored['error'])) {
				$this->db->where('id', $ticket_id);
				$this->db->delete($this->table_ticket);
				return array('error' => $stored['error']);
			}
			$attachment = $stored;
		}
		$msg = $this->add_message($ticket_id, 'client', $data['user_name'], $first_body, $attachment, FALSE);
		$this->queue_upsert_ticket($this->get_ticket($ticket_id));
		if ($msg) {
			$this->queue_upsert_message($this->get_ticket($ticket_id), $msg);
		}
		$this->flush_outbox();
		return $this->get_ticket($ticket_id);
	}

	public function add_message($ticket_id, $side, $sender_name, $body, $attachment = NULL, $sync = TRUE) {
		$ticket = $this->get_ticket($ticket_id);
		if ( ! $ticket) {
			return FALSE;
		}
		$now = date('Y-m-d H:i:s');
		$msg = array(
			'uuid' => $this->new_uuid(),
			'ticket_id' => (int) $ticket_id,
			'sender_side' => $side,
			'sender_name' => $sender_name,
			'body' => $body,
			'attachment_path' => $attachment ? $attachment['path'] : NULL,
			'attachment_name' => $attachment ? $attachment['name'] : NULL,
			'created_at' => $now
		);
		$this->db->insert($this->table_message, $msg);
		$msg['id'] = (int) $this->db->insert_id();

		$upd = array(
			'last_message_at' => $now,
			'updated_at' => $now
		);
		if ($side === 'client') {
			$upd['unread_support'] = 1;
			$upd['unread_client'] = 0;
			if ($ticket['status'] === 'waiting_client' || $ticket['status'] === 'resolved') {
				$upd['status'] = 'waiting_support';
			} elseif ($ticket['status'] === 'closed') {
				$upd['status'] = 'waiting_support';
			}
		} else {
			$upd['unread_client'] = 1;
			$upd['unread_support'] = 0;
			if ($ticket['status'] === 'waiting_support' || $ticket['status'] === 'open') {
				$upd['status'] = 'waiting_client';
			}
		}
		$this->db->where('id', (int) $ticket_id);
		$this->db->update($this->table_ticket, $upd);

		if ($sync) {
			$ticket = $this->get_ticket($ticket_id);
			$this->queue_upsert_ticket($ticket);
			$this->queue_upsert_message($ticket, $msg);
			$this->flush_outbox();
		}
		return $msg;
	}

	public function set_status($ticket_id, $status) {
		$allowed = $this->statuses();
		if ( ! in_array($status, $allowed, TRUE)) {
			return FALSE;
		}
		$now = date('Y-m-d H:i:s');
		$this->db->where('id', (int) $ticket_id);
		$this->db->update($this->table_ticket, array('status' => $status, 'updated_at' => $now));
		$ticket = $this->get_ticket($ticket_id);
		$this->queue_upsert_ticket($ticket);
		$this->flush_outbox();
		return $ticket;
	}

	public function mark_read($ticket_id, $side = 'client') {
		$field = ($side === 'support') ? 'unread_support' : 'unread_client';
		$this->db->where('id', (int) $ticket_id);
		$this->db->update($this->table_ticket, array($field => 0, 'updated_at' => date('Y-m-d H:i:s')));
	}

	public function store_upload($ticket_uuid, $file) {
		if (empty($file) || empty($file['tmp_name']) || ! is_uploaded_file($file['tmp_name'])) {
			return NULL;
		}
		$max = (int) $this->cfg('ms_max_upload_kb', 4096) * 1024;
		if ((int) $file['size'] > $max) {
			return array('error' => 'File is larger than '.$this->cfg('ms_max_upload_kb', 4096).' KB.');
		}
		$ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
		$ok = array('jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf');
		if ( ! in_array($ext, $ok, TRUE)) {
			return array('error' => 'Allowed attachments: images or PDF.');
		}
		$dir = FCPATH.'uploads/message_support/'.$ticket_uuid.'/';
		if ( ! is_dir($dir)) {
			@mkdir($dir, 0777, TRUE);
		}
		$safe = preg_replace('/[^a-zA-Z0-9._-]/', '_', $file['name']);
		$fname = date('YmdHis').'_'.$safe;
		if ( ! move_uploaded_file($file['tmp_name'], $dir.$fname)) {
			return array('error' => 'Could not save the file.');
		}
		return array('path' => 'uploads/message_support/'.$ticket_uuid.'/'.$fname, 'name' => $file['name']);
	}

	public function queue_upsert_ticket($ticket) {
		if ( ! $ticket) {
			return;
		}
		$payload = array(
			'type' => 'ticket',
			'ticket' => $ticket,
			'company_code' => $this->cfg('ms_company_code'),
			'company_name' => $this->cfg('ms_company_name')
		);
		$this->_queue($ticket['uuid'], 'ticket', $payload);
	}

	public function queue_upsert_message($ticket, $msg) {
		if ( ! $ticket || ! $msg) {
			return;
		}
		$payload = array(
			'type' => 'message',
			'ticket_uuid' => $ticket['uuid'],
			'company_code' => $this->cfg('ms_company_code'),
			'message' => $msg
		);
		if ( ! empty($msg['attachment_path']) && is_file(FCPATH.$msg['attachment_path'])) {
			$payload['attachment_base64'] = base64_encode(file_get_contents(FCPATH.$msg['attachment_path']));
			$payload['attachment_name'] = $msg['attachment_name'];
		}
		$this->_queue($msg['uuid'], 'message', $payload);
	}

	private function _queue($uuid, $type, $payload) {
		if ( ! $this->db->table_exists($this->table_queue)) {
			return;
		}
		$now = date('Y-m-d H:i:s');
		$this->db->insert($this->table_queue, array(
			'uuid' => $uuid,
			'entity_type' => $type,
			'payload' => json_encode($payload),
			'attempts' => 0,
			'last_error' => NULL,
			'status' => 'pending',
			'created_at' => $now,
			'updated_at' => $now
		));
	}

	public function flush_outbox() {
		if ( ! $this->db->table_exists($this->table_queue)) {
			return;
		}
		$hub = rtrim($this->cfg('ms_hub_url'), '/').'/';
		$token = $this->cfg('ms_api_token');
		if ($hub === '/' || $token === '') {
			$this->_set_state_error('Hub URL or API token is not set.');
			return;
		}
		$this->db->where('status', 'pending');
		$this->db->order_by('id', 'ASC');
		$this->db->limit(20);
		$rows = $this->db->get($this->table_queue)->result_array();
		foreach ($rows as $row) {
			$resp = $this->_http('POST', $hub.'api.php?action=push', json_decode($row['payload'], TRUE), $token);
			$ok = is_array($resp) && ! empty($resp['ok']);
			$upd = array(
				'attempts' => (int) $row['attempts'] + 1,
				'updated_at' => date('Y-m-d H:i:s'),
				'status' => $ok ? 'done' : 'pending',
				'last_error' => $ok ? NULL : (is_array($resp) && isset($resp['error']) ? $resp['error'] : 'Hub push failed')
			);
			if ( ! $ok && $upd['attempts'] >= 8) {
				$upd['status'] = 'failed';
			}
			$this->db->where('id', (int) $row['id']);
			$this->db->update($this->table_queue, $upd);
			if ( ! $ok) {
				$this->_set_state_error($upd['last_error']);
			}
		}
	}

	public function pull_hub() {
		if ( ! $this->tables_ready()) {
			return;
		}
		$hub = rtrim($this->cfg('ms_hub_url'), '/').'/';
		$token = $this->cfg('ms_api_token');
		if ($hub === '/' || $token === '') {
			return;
		}
		$state = $this->db->get_where($this->table_state, array('id' => 1))->row_array();
		$since = ($state && ! empty($state['last_pull_at'])) ? $state['last_pull_at'] : '1970-01-01 00:00:00';
		$resp = $this->_http('GET', $hub.'api.php?action=poll&since='.rawurlencode($since), NULL, $token);
		if ( ! is_array($resp) || empty($resp['ok'])) {
			$err = is_array($resp) && isset($resp['error']) ? $resp['error'] : 'Hub poll failed';
			$this->_set_state_error($err);
			return;
		}
		if ( ! empty($resp['messages']) && is_array($resp['messages'])) {
			foreach ($resp['messages'] as $remote) {
				$this->_import_hub_message($remote);
			}
		}
		if ( ! empty($resp['tickets']) && is_array($resp['tickets'])) {
			foreach ($resp['tickets'] as $remote_t) {
				$this->_import_hub_ticket_status($remote_t);
			}
		}
		$now = date('Y-m-d H:i:s');
		$this->db->where('id', 1);
		$this->db->update($this->table_state, array(
			'last_pull_at' => isset($resp['server_time']) ? $resp['server_time'] : $now,
			'last_error' => NULL,
			'updated_at' => $now
		));
	}

	public function last_sync_error() {
		if ( ! $this->db->table_exists($this->table_state)) {
			return 'Message Support tables are missing. Run sql/message_support_install.sql on this database.';
		}
		$row = $this->db->get_where($this->table_state, array('id' => 1))->row_array();
		return ($row && ! empty($row['last_error'])) ? $row['last_error'] : '';
	}

	public function sync_now() {
		if ( ! $this->tables_ready()) {
			return;
		}
		$this->flush_outbox();
		$this->pull_hub();
	}

	private function _import_hub_ticket_status($remote) {
		if (empty($remote['uuid'])) {
			return;
		}
		$local = $this->get_ticket_by_uuid($remote['uuid']);
		if ( ! $local) {
			return;
		}
		$upd = array('updated_at' => date('Y-m-d H:i:s'));
		if ( ! empty($remote['status'])) {
			$upd['status'] = $remote['status'];
		}
		$this->db->where('id', (int) $local['id']);
		$this->db->update($this->table_ticket, $upd);
	}

	private function _import_hub_message($remote) {
		if (empty($remote['uuid']) || empty($remote['ticket_uuid'])) {
			return;
		}
		$exists = $this->db->get_where($this->table_message, array('uuid' => $remote['uuid']))->row_array();
		if ($exists) {
			return;
		}
		$ticket = $this->get_ticket_by_uuid($remote['ticket_uuid']);
		if ( ! $ticket) {
			return;
		}
		$attachment = NULL;
		if ( ! empty($remote['attachment_base64']) && ! empty($remote['attachment_name'])) {
			$dir = FCPATH.'uploads/message_support/'.$ticket['uuid'].'/';
			if ( ! is_dir($dir)) {
				@mkdir($dir, 0777, TRUE);
			}
			$safe = preg_replace('/[^a-zA-Z0-9._-]/', '_', $remote['attachment_name']);
			$fname = 'hub_'.$safe;
			file_put_contents($dir.$fname, base64_decode($remote['attachment_base64']));
			$attachment = array(
				'path' => 'uploads/message_support/'.$ticket['uuid'].'/'.$fname,
				'name' => $remote['attachment_name']
			);
		}
		$now = isset($remote['created_at']) ? $remote['created_at'] : date('Y-m-d H:i:s');
		$this->db->insert($this->table_message, array(
			'uuid' => $remote['uuid'],
			'ticket_id' => (int) $ticket['id'],
			'sender_side' => isset($remote['sender_side']) ? $remote['sender_side'] : 'support',
			'sender_name' => isset($remote['sender_name']) ? $remote['sender_name'] : 'Support',
			'body' => isset($remote['body']) ? $remote['body'] : '',
			'attachment_path' => $attachment ? $attachment['path'] : NULL,
			'attachment_name' => $attachment ? $attachment['name'] : NULL,
			'created_at' => $now
		));
		$upd = array(
			'last_message_at' => $now,
			'updated_at' => date('Y-m-d H:i:s'),
			'unread_client' => 1
		);
		if ( ! empty($remote['ticket_status'])) {
			$upd['status'] = $remote['ticket_status'];
		} elseif ($ticket['status'] === 'waiting_support' || $ticket['status'] === 'open') {
			$upd['status'] = 'waiting_client';
		}
		$this->db->where('id', (int) $ticket['id']);
		$this->db->update($this->table_ticket, $upd);
	}

	private function _set_state_error($err) {
		if ( ! $this->db->table_exists($this->table_state)) {
			return;
		}
		$this->db->where('id', 1);
		$this->db->update($this->table_state, array(
			'last_error' => substr((string) $err, 0, 500),
			'updated_at' => date('Y-m-d H:i:s')
		));
	}

	private function _http($method, $url, $body, $token) {
		$payload = ($body === NULL) ? NULL : json_encode($body);
		if (function_exists('curl_init')) {
			$ch = curl_init($url);
			$headers = array(
				'Accept: application/json',
				'Authorization: Bearer '.$token
			);
			if ($payload !== NULL) {
				$headers[] = 'Content-Type: application/json';
				curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
			}
			curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
			curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
			curl_setopt($ch, CURLOPT_RETURNTRANSFER, TRUE);
			curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 3);
			curl_setopt($ch, CURLOPT_TIMEOUT, 8);
			$raw = curl_exec($ch);
			$err = curl_error($ch);
			$code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
			curl_close($ch);
			if ($raw === FALSE) {
				return array('ok' => FALSE, 'error' => $err ? $err : 'HTTP error');
			}
			$decoded = json_decode($raw, TRUE);
			if ( ! is_array($decoded)) {
				if (stripos($raw, '<!DOCTYPE') !== FALSE || stripos($raw, '<html') !== FALSE) {
					return array('ok' => FALSE, 'error' => 'Hub returned HTML instead of JSON (check hub URL and api.php). HTTP '.$code);
				}
				return array('ok' => FALSE, 'error' => 'Hub HTTP '.$code.' — invalid JSON response');
			}
			return $decoded;
		}
		$opts = array(
			'http' => array(
				'method' => $method,
				'header' => "Accept: application/json\r\nAuthorization: Bearer ".$token."\r\n",
				'timeout' => 8,
				'ignore_errors' => TRUE
			)
		);
		if ($payload !== NULL) {
			$opts['http']['header'] .= "Content-Type: application/json\r\n";
			$opts['http']['content'] = $payload;
		}
		$raw = @file_get_contents($url, FALSE, stream_context_create($opts));
		if ($raw === FALSE) {
			return array('ok' => FALSE, 'error' => 'Could not reach hub');
		}
		$decoded = json_decode($raw, TRUE);
		return is_array($decoded) ? $decoded : array('ok' => FALSE, 'error' => 'Invalid hub JSON');
	}
}
