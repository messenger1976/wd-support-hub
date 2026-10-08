<?php if ( ! defined('BASEPATH')) exit('No direct script access allowed');

/**
 * Message Board: announcements, updates and guides published by the WD Support Hub.
 * The hub is the source of truth; this model keeps a local cache so pages never wait on the hub.
 */
class messageboard_model extends CI_Model {

	public $table_message = 'tbl_board_message';
	public $table_pref = 'tbl_board_user_pref';
	public $table_queue = 'tbl_board_receipt_queue';
	public $table_state = 'tbl_board_state';

	/** Seconds to wait before retrying after the hub could not be reached. */
	const RETRY_SECONDS = 60;
	const MAX_ATTEMPTS = 10;

	public function __construct() {
		parent::__construct();
		$this->load->config('message_support', TRUE);
	}

	public function cfg($key, $default = '') {
		$val = $this->config->item($key, 'message_support');
		return ($val === FALSE || $val === NULL) ? $default : $val;
	}

	/** False until sql/message_board_install.sql has been applied to this database. */
	public function tables_ready() {
		return $this->db->table_exists($this->table_message)
			&& $this->db->table_exists($this->table_pref)
			&& $this->db->table_exists($this->table_queue)
			&& $this->db->table_exists($this->table_state);
	}

	public function enabled() {
		return (bool) $this->cfg('ms_board_enabled', TRUE) && $this->tables_ready();
	}

	public function refresh_seconds() {
		return max(1, (int) $this->cfg('ms_board_refresh_minutes', 5)) * 60;
	}

	/** The signed-in user, or NULL. Admin and staff ids can repeat, so the key carries the user type. */
	public function current_user() {
		$id = (int) $this->session->userdata('userid');
		if ($id <= 0 || ! $this->session->userdata('username')) {
			return NULL;
		}
		$type = strtolower(preg_replace('/[^A-Za-z0-9_]/', '', (string) $this->session->userdata('usertype')));
		if ($type === '') {
			$type = 'user';
		}
		$name = trim((string) $this->session->userdata('name'));
		return array(
			'key' => substr($type.':'.$id, 0, 80),
			'name' => $name !== '' ? $name : (string) $this->session->userdata('username'),
			'audience' => $type === 'admin' ? 'admin' : 'staff'
		);
	}

	public function state() {
		$row = $this->db->get_where($this->table_state, array('id' => 1))->row_array();
		return $row ? $row : array('last_fetch_at' => NULL, 'last_success_at' => NULL, 'last_error' => '');
	}

	public function is_stale() {
		$state = $this->state();
		return empty($state['last_fetch_at']) || strtotime($state['last_fetch_at']) <= time() - $this->refresh_seconds();
	}

	/**
	 * Replace the cache with the hub's current board. On failure the cache is kept and the next
	 * attempt is allowed after RETRY_SECONDS, so an offline hub costs one slow request a minute at most.
	 */
	public function refresh($force = FALSE) {
		if ( ! $force && ! $this->is_stale()) {
			return TRUE;
		}
		$hub = rtrim($this->cfg('ms_hub_url'), '/').'/';
		$token = $this->cfg('ms_api_token');
		$now = date('Y-m-d H:i:s');
		if ($hub === '/' || $token === '') {
			$this->_save_state(array('last_fetch_at' => $now, 'last_error' => 'Hub URL or API token is not set.'));
			return FALSE;
		}

		$this->flush_receipts($hub, $token);

		$resp = $this->_http('GET', $hub.'api.php?action=board', NULL, $token);
		if ( ! is_array($resp) || empty($resp['ok']) || ! isset($resp['messages']) || ! is_array($resp['messages'])) {
			$err = is_array($resp) && isset($resp['error']) ? $resp['error'] : 'Hub board request failed';
			$retry_at = date('Y-m-d H:i:s', time() - $this->refresh_seconds() + self::RETRY_SECONDS);
			$this->_save_state(array('last_fetch_at' => $retry_at, 'last_error' => substr((string) $err, 0, 500)));
			return FALSE;
		}

		$keep = array();
		$this->db->trans_start();
		foreach ($resp['messages'] as $m) {
			$row = $this->_cache_row($m, $now);
			if ($row === NULL) {
				continue;
			}
			$keep[] = $row['uuid'];
			$exists = $this->db->select('id')->get_where($this->table_message, array('uuid' => $row['uuid']))->row_array();
			if ($exists) {
				$this->db->where('id', $exists['id'])->update($this->table_message, $row);
			} else {
				$this->db->insert($this->table_message, $row);
			}
		}
		$this->db->where('id >', 0);
		if ($keep) {
			$this->db->where_not_in('uuid', $keep);
		}
		$this->db->delete($this->table_message);
		$this->db->trans_complete();

		$this->_save_state(array('last_fetch_at' => $now, 'last_success_at' => $now, 'last_error' => ''));
		return TRUE;
	}

	/**
	 * Messages for one user with their personal flags.
	 * $scope 'live' = on air now (ticker / popup); 'archive' = everything that has started (Announcements page).
	 */
	public function messages_for($user, $scope = 'live') {
		$now = date('Y-m-d H:i:s');
		$sql = 'SELECT m.*, p.seen_version, p.view_count, p.acked_version, p.opted_out_version
			FROM '.$this->table_message.' m
			LEFT JOIN '.$this->table_pref.' p ON p.message_uuid = m.uuid AND p.user_key = ?
			WHERE m.starts_at <= ? AND m.audience IN (?, ?)';
		$binds = array($user['key'], $now, 'all', $user['audience']);
		if ($scope === 'live') {
			$sql .= ' AND (m.ends_at IS NULL OR m.ends_at > ?)';
			$binds[] = $now;
		}
		$sql .= " ORDER BY m.pinned DESC, FIELD(m.priority, 'critical', 'important', 'normal'), m.starts_at DESC, m.id DESC";
		$rows = $this->db->query($sql, $binds)->result_array();

		$out = array();
		foreach ($rows as $r) {
			$version = (int) $r['version'];
			$live = empty($r['ends_at']) || $r['ends_at'] > $now;
			$seen = (int) $r['seen_version'] >= $version;
			$acked = (int) $r['require_ack'] === 1 && (int) $r['acked_version'] >= $version;
			$opted_out = (int) $r['allow_opt_out'] === 1 && (int) $r['opted_out_version'] >= $version;
			$out[] = array(
				'uuid' => $r['uuid'],
				'title' => $r['title'],
				'ticker_text' => $r['ticker_text'] !== '' ? $r['ticker_text'] : $r['title'],
				'body_html' => (string) $r['body_html'],
				'category' => $r['category'],
				'priority' => $r['priority'],
				'require_ack' => (int) $r['require_ack'],
				'allow_opt_out' => (int) $r['allow_opt_out'],
				'pinned' => (int) $r['pinned'],
				'starts_at' => $r['starts_at'],
				'ends_at' => $r['ends_at'],
				'version' => $version,
				'live' => $live,
				'seen' => $seen,
				'acked' => $acked,
				'opted_out' => $opted_out,
				'in_ticker' => $live && (int) $r['show_ticker'] === 1,
				'in_popup' => $live && (int) $r['show_popup'] === 1 && ! $opted_out && ! $acked
			);
		}
		return $out;
	}

	public function unread_count($messages) {
		$n = 0;
		foreach ($messages as $m) {
			if ($m['live'] && ! $m['seen']) {
				$n++;
			}
		}
		return $n;
	}

	/** Record a user's view / ack / optout / optin locally and queue it for the hub's read statistics. */
	public function record_event($user, $uuid, $event, $version) {
		if ( ! in_array($event, array('view', 'ack', 'optout', 'optin'), TRUE)) {
			return FALSE;
		}
		$msg = $this->db->get_where($this->table_message, array('uuid' => $uuid))->row_array();
		if ( ! $msg || ! in_array($msg['audience'], array('all', $user['audience']), TRUE)) {
			return FALSE;
		}
		$version = min(max(1, (int) $version), (int) $msg['version']);
		$now = date('Y-m-d H:i:s');
		$pref = $this->db->get_where($this->table_pref, array('message_uuid' => $uuid, 'user_key' => $user['key']))->row_array();
		$row = array();
		if ($event === 'view') {
			$row['seen_version'] = max($version, $pref ? (int) $pref['seen_version'] : 0);
			$row['view_count'] = ($pref ? (int) $pref['view_count'] : 0) + 1;
			$row['last_seen_at'] = $now;
			if ( ! $pref || empty($pref['first_seen_at'])) {
				$row['first_seen_at'] = $now;
			}
		} elseif ($event === 'ack') {
			if ((int) $msg['require_ack'] !== 1) {
				return FALSE;
			}
			$row['acked_version'] = $version;
			$row['acked_at'] = $now;
			$row['seen_version'] = max($version, $pref ? (int) $pref['seen_version'] : 0);
		} elseif ($event === 'optout') {
			if ((int) $msg['allow_opt_out'] !== 1) {
				return FALSE;
			}
			$row['opted_out_version'] = $version;
			$row['opted_out_at'] = $now;
		} else {
			$row['opted_out_version'] = 0;
			$row['opted_out_at'] = NULL;
		}

		if ($pref) {
			$this->db->where('id', $pref['id'])->update($this->table_pref, $row);
		} else {
			$row['message_uuid'] = $uuid;
			$row['user_key'] = $user['key'];
			$this->db->insert($this->table_pref, $row);
		}

		$this->db->insert($this->table_queue, array(
			'payload' => json_encode(array(
				'message_uuid' => $uuid,
				'user_key' => $user['key'],
				'user_name' => substr($user['name'], 0, 150),
				'event' => $event,
				'at' => $now,
				'version' => $version
			)),
			'attempts' => 0,
			'created_at' => $now
		));
		return TRUE;
	}

	/** Send queued receipts in one batch. Receipts are statistics only, so a failing batch is dropped after MAX_ATTEMPTS. */
	public function flush_receipts($hub, $token) {
		$this->db->order_by('id', 'ASC');
		$this->db->limit(500);
		$rows = $this->db->get($this->table_queue)->result_array();
		if ( ! $rows) {
			return;
		}
		$ids = array();
		$events = array();
		foreach ($rows as $r) {
			$ids[] = (int) $r['id'];
			$payload = json_decode($r['payload'], TRUE);
			if (is_array($payload)) {
				$events[] = $payload;
			}
		}
		$resp = $events ? $this->_http('POST', $hub.'api.php?action=board_receipts', array('events' => $events), $token) : array('ok' => TRUE);
		if (is_array($resp) && ! empty($resp['ok'])) {
			$this->db->where_in('id', $ids)->delete($this->table_queue);
			return;
		}
		$this->db->set('attempts', 'attempts + 1', FALSE)->where_in('id', $ids)->update($this->table_queue);
		$this->db->where('attempts >=', self::MAX_ATTEMPTS)->delete($this->table_queue);
	}

	private function _cache_row($m, $now) {
		if ( ! is_array($m) || empty($m['uuid']) || ! preg_match('/^[A-Za-z0-9-]{8,36}$/', $m['uuid'])) {
			return NULL;
		}
		$starts = $this->_datetime(isset($m['starts_at']) ? $m['starts_at'] : '');
		if ($starts === NULL) {
			return NULL;
		}
		$pick = function ($value, $allowed, $default) {
			return in_array($value, $allowed, TRUE) ? $value : $default;
		};
		return array(
			'uuid' => $m['uuid'],
			'title' => mb_substr(trim((string) (isset($m['title']) ? $m['title'] : '')), 0, 200, 'UTF-8'),
			'ticker_text' => mb_substr(trim((string) (isset($m['ticker_text']) ? $m['ticker_text'] : '')), 0, 300, 'UTF-8'),
			'body_html' => $this->_clean_html(isset($m['body_html']) ? (string) $m['body_html'] : ''),
			'category' => $pick(isset($m['category']) ? $m['category'] : '', array('announcement', 'update', 'maintenance', 'guide', 'tip'), 'announcement'),
			'priority' => $pick(isset($m['priority']) ? $m['priority'] : '', array('normal', 'important', 'critical'), 'normal'),
			'show_ticker' => empty($m['show_ticker']) ? 0 : 1,
			'show_popup' => empty($m['show_popup']) ? 0 : 1,
			'require_ack' => empty($m['require_ack']) ? 0 : 1,
			'allow_opt_out' => empty($m['allow_opt_out']) ? 0 : 1,
			'pinned' => empty($m['pinned']) ? 0 : 1,
			'audience' => $pick(isset($m['audience']) ? $m['audience'] : '', array('all', 'admin', 'staff'), 'all'),
			'starts_at' => $starts,
			'ends_at' => $this->_datetime(isset($m['ends_at']) ? $m['ends_at'] : ''),
			'version' => max(1, (int) (isset($m['version']) ? $m['version'] : 1)),
			'updated_at' => $this->_datetime(isset($m['updated_at']) ? $m['updated_at'] : ''),
			'synced_at' => $now
		);
	}

	private function _datetime($value) {
		$value = trim((string) $value);
		return preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/', $value) ? $value : NULL;
	}

	/** The hub already sanitises message bodies; this is a second line of defence before echoing cached HTML. */
	private function _clean_html($html) {
		$html = preg_replace('#<(script|style|object|embed|form|input|button|textarea|select|meta|link|base)\b[^>]*>.*?</\1\s*>#is', '', $html);
		$html = preg_replace('#<(script|style|object|embed|form|input|button|textarea|select|meta|link|base)\b[^>]*/?>#i', '', $html);
		$html = preg_replace('#\son[a-z]+\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)#i', '', $html);
		$html = preg_replace('#(href|src)\s*=\s*(["\']?)\s*(javascript|vbscript|data):[^"\'>\s]*\2#i', '$1="#"', $html);
		$html = preg_replace_callback('#<iframe\b[^>]*>.*?</iframe\s*>#is', function ($m) {
			return preg_match('#\ssrc\s*=\s*["\']https://(www\.youtube\.com|www\.youtube-nocookie\.com|player\.vimeo\.com)/#i', $m[0]) ? $m[0] : '';
		}, $html);
		return $html;
	}

	private function _save_state($row) {
		$row['updated_at'] = date('Y-m-d H:i:s');
		if ($this->db->get_where($this->table_state, array('id' => 1))->num_rows()) {
			$this->db->where('id', 1)->update($this->table_state, $row);
		} else {
			$row['id'] = 1;
			$this->db->insert($this->table_state, $row);
		}
	}

	private function _http($method, $url, $body, $token) {
		$payload = ($body === NULL) ? NULL : json_encode($body);
		if (function_exists('curl_init')) {
			$ch = curl_init($url);
			$headers = array(
				'Accept: application/json',
				'Authorization: Bearer '.$token,
				'X-WD-Token: '.$token
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
			$errno = curl_errno($ch);
			$err = curl_error($ch);
			$code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
			curl_close($ch);
			if ($raw === FALSE || $errno) {
				return array('ok' => FALSE, 'error' => 'cURL error '.$errno.($err !== '' ? ': '.$err : '').' (HTTP '.$code.')');
			}
			$decoded = json_decode($raw, TRUE);
			return is_array($decoded) ? $decoded : array('ok' => FALSE, 'error' => 'Hub HTTP '.$code.' — invalid JSON response');
		}
		$opts = array(
			'http' => array(
				'method' => $method,
				'header' => "Accept: application/json\r\nAuthorization: Bearer ".$token."\r\nX-WD-Token: ".$token."\r\n",
				'timeout' => 8,
				'ignore_errors' => TRUE
			)
		);
		if ($payload !== NULL) {
			$opts['http']['header'] .= "Content-Type: application/json\r\n";
			$opts['http']['content'] = $payload;
		}
		$raw = @file_get_contents($url, FALSE, stream_context_create($opts));
		$decoded = ($raw === FALSE) ? NULL : json_decode($raw, TRUE);
		return is_array($decoded) ? $decoded : array('ok' => FALSE, 'error' => 'Hub request failed');
	}
}
