<?php if ( ! defined('BASEPATH')) exit('No direct script access allowed');

/**
 * Message Board: announcements, updates and how-to guides from the WD Support Hub.
 * Every signed-in user can read the board, so there is no responsibility column for it.
 */
class messageboard extends CI_Controller {

	public $headerPage = '../../views/admin-includes/header';
	public $listPage = 'messageboard';

	private $user;

	public function __construct() {
		parent::__construct();
		$this->load->model('messageboard_model', 'my_model');
		$this->load->model('adminheader_model', 'top_model');
		// The autoloaded TCPDF library calls date_default_timezone_set('UTC'), which ini_set() cannot override.
		date_default_timezone_set('Asia/Manila');
		$this->user = $this->my_model->current_user();
		if ($this->user === NULL) {
			if ($this->input->is_ajax_request()) {
				$this->_json(array('ok' => FALSE, 'error' => 'Your session has ended. Please sign in again.'), 401);
			}
			redirect('master/', 'refresh');
		}
	}

	private function _json($data, $status = 200) {
		if ($status !== 200) {
			header('HTTP/1.1 '.$status.' '.($status === 401 ? 'Unauthorized' : 'Bad Request'));
		}
		header('Content-Type: application/json; charset=utf-8');
		header('Cache-Control: no-store');
		echo json_encode($data);
		exit;
	}

	private function _feed() {
		if ( ! $this->my_model->enabled()) {
			return array('ok' => TRUE, 'enabled' => FALSE, 'messages' => array(), 'unread' => 0, 'stale' => FALSE);
		}
		$messages = $this->my_model->messages_for($this->user, 'live');
		return array(
			'ok' => TRUE,
			'enabled' => TRUE,
			'messages' => $messages,
			'unread' => $this->my_model->unread_count($messages),
			'stale' => $this->my_model->is_stale(),
			'user_key' => $this->user['key']
		);
	}

	/** Announcements & Guides page: everything that has started, including messages that ended recently. */
	public function index() {
		@set_time_limit(20);
		$enabled = $this->my_model->enabled();
		if ($enabled) {
			$this->my_model->refresh();
		}
		$state = $enabled ? $this->my_model->state() : array('last_success_at' => NULL, 'last_error' => '');
		$header['roleResponsible'] = $this->top_model->get_responsibilities();
		$header['record_info'] = $this->top_model->get_last_login_details(1);
		$data = array(
			'enabled' => $enabled,
			'messages' => $enabled ? $this->my_model->messages_for($this->user, 'archive') : array(),
			'last_success_at' => $state['last_success_at'],
			'sync_error' => $state['last_error'],
			'company_name' => $this->my_model->cfg('ms_company_name', 'Water District'),
			'focus' => preg_replace('/[^A-Za-z0-9-]/', '', (string) $this->input->get('m'))
		);
		$this->load->view($this->headerPage, $header);
		$this->load->view($this->listPage, $data);
	}

	/** Live messages for the signed-in user (ticker, popup, nav badge). Never waits on the hub. */
	public function feed() {
		$this->_json($this->_feed());
	}

	/** Pull the latest board from the hub when the cache is stale, then return the feed. */
	public function refresh() {
		if ($this->input->server('REQUEST_METHOD') !== 'POST') {
			$this->_json(array('ok' => FALSE, 'error' => 'POST required'), 400);
		}
		@set_time_limit(20);
		if ($this->my_model->enabled()) {
			$this->my_model->refresh();
		}
		$this->_json($this->_feed());
	}

	/** One user action: view, ack (I have read this), optout (don't show again) or optin. */
	public function event() {
		if ($this->input->server('REQUEST_METHOD') !== 'POST' || ! $this->my_model->enabled()) {
			$this->_json(array('ok' => FALSE, 'error' => 'Not available'), 400);
		}
		$uuid = preg_replace('/[^A-Za-z0-9-]/', '', (string) $this->input->post('uuid'));
		$event = (string) $this->input->post('event');
		$version = (int) $this->input->post('version');
		if ($uuid === '' || ! $this->my_model->record_event($this->user, $uuid, $event, $version)) {
			$this->_json(array('ok' => FALSE, 'error' => 'That announcement is no longer available.'), 400);
		}
		$this->_json(array('ok' => TRUE));
	}
}
