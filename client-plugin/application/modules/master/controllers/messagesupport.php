<?php if ( ! defined('BASEPATH')) exit('No direct script access allowed');

class messagesupport extends CI_Controller {

	public $headerPage = '../../views/admin-includes/header';
	public $listPage = 'messagesupport';
	public $listPage_redirect = '/master/messagesupport';

	public function __construct() {
		parent::__construct();
		$this->load->model('messagesupport_model', 'my_model');
		$this->load->model('adminheader_model', 'top_model');
		ini_set('date.timezone', 'Asia/Manila');
		$this->_require_access();
	}

	private function _require_access() {
		$ut = strtolower(trim((string) $this->session->userdata('usertype')));
		if ($ut === 'admin') {
			return;
		}
		$rr = $this->top_model->get_responsibilities();
		$this->head['roleResponsible'] = is_array($rr) ? $rr : array();
		if (array_key_exists('message_support', $this->head['roleResponsible']) && (int) $this->head['roleResponsible']['message_support'] === 1) {
			$this->top_model->get_responsibilities_conditions($this->head['roleResponsible']['message_support']);
			return;
		}
		redirect('master/page/', 'refresh');
	}

	private function _roles() {
		return $this->top_model->get_responsibilities();
	}

	private function _actor() {
		$name = trim((string) $this->session->userdata('name'));
		if ($name === '') {
			$name = trim((string) $this->session->userdata('username'));
		}
		return array(
			'user_id' => (int) $this->session->userdata('userid'),
			'user_name' => $name !== '' ? $name : 'Staff',
			'usertype' => (string) $this->session->userdata('usertype')
		);
	}

	private function _json($data) {
		header('Content-Type: application/json; charset=utf-8');
		echo json_encode($data);
		exit;
	}

	public function index() {
		@set_time_limit(20);
		$this->my_model->sync_now();
		$header['roleResponsible'] = $this->_roles();
		$header['record_info'] = $this->top_model->get_last_login_details(1);
		$data = array(
			'categories' => $this->my_model->categories(),
			'priorities' => $this->my_model->priorities(),
			'poll_seconds' => (int) $this->my_model->cfg('ms_poll_seconds', 8),
			'sync_error' => $this->my_model->last_sync_error(),
			'company_name' => $this->my_model->cfg('ms_company_name', 'Water District')
		);
		$this->load->view($this->headerPage, $header);
		$this->load->view($this->listPage, $data);
	}

	public function tickets() {
		$this->my_model->sync_now();
		$status = trim((string) $this->input->get('status'));
		$q = trim((string) $this->input->get('q'));
		$this->_json(array(
			'ok' => TRUE,
			'tickets' => $this->my_model->list_tickets($status, $q),
			'unread' => $this->my_model->unread_count(),
			'sync_error' => $this->my_model->last_sync_error()
		));
	}

	public function unread() {
		$this->_json(array('ok' => TRUE, 'unread' => $this->my_model->unread_count()));
	}

	public function thread() {
		$uuid = trim((string) $this->input->get('uuid'));
		$ticket = $this->my_model->get_ticket_by_uuid($uuid);
		if ( ! $ticket) {
			$this->_json(array('ok' => FALSE, 'error' => 'Ticket not found'));
		}
		$this->my_model->mark_read($ticket['id'], 'client');
		$ticket = $this->my_model->get_ticket($ticket['id']);
		$this->_json(array(
			'ok' => TRUE,
			'ticket' => $ticket,
			'messages' => $this->my_model->list_messages($ticket['id'])
		));
	}

	public function create_ticket() {
		$actor = $this->_actor();
		$subject = trim((string) $this->input->post('subject'));
		$body = trim((string) $this->input->post('body'));
		$category = trim((string) $this->input->post('category'));
		$priority = trim((string) $this->input->post('priority'));
		if ($subject === '' || $body === '') {
			$this->_json(array('ok' => FALSE, 'error' => 'Subject and message are required.'));
		}
		if ( ! in_array($category, $this->my_model->categories(), TRUE)) {
			$category = 'Other';
		}
		if ( ! in_array($priority, $this->my_model->priorities(), TRUE)) {
			$priority = 'normal';
		}
		$file = ( ! empty($_FILES['attachment']['name'])) ? $_FILES['attachment'] : NULL;
		$ticket = $this->my_model->create_ticket(array(
			'subject' => $subject,
			'category' => $category,
			'priority' => $priority,
			'user_id' => $actor['user_id'],
			'user_name' => $actor['user_name'],
			'usertype' => $actor['usertype']
		), $body, $file);
		if (isset($ticket['error'])) {
			$this->_json(array('ok' => FALSE, 'error' => $ticket['error']));
		}
		$this->_json(array('ok' => TRUE, 'ticket' => $ticket));
	}

	public function send_message() {
		$actor = $this->_actor();
		$uuid = trim((string) $this->input->post('uuid'));
		$body = trim((string) $this->input->post('body'));
		$ticket = $this->my_model->get_ticket_by_uuid($uuid);
		if ( ! $ticket) {
			$this->_json(array('ok' => FALSE, 'error' => 'Ticket not found'));
		}
		if ($ticket['status'] === 'closed') {
			$this->_json(array('ok' => FALSE, 'error' => 'This ticket is closed. Reopen it to send a message.'));
		}
		$attachment = NULL;
		if ( ! empty($_FILES['attachment']['name'])) {
			$stored = $this->my_model->store_upload($ticket['uuid'], $_FILES['attachment']);
			if (is_array($stored) && isset($stored['error'])) {
				$this->_json(array('ok' => FALSE, 'error' => $stored['error']));
			}
			$attachment = $stored;
		}
		if ($body === '' && ! $attachment) {
			$this->_json(array('ok' => FALSE, 'error' => 'Type a message or attach a file.'));
		}
		$msg = $this->my_model->add_message($ticket['id'], 'client', $actor['user_name'], $body, $attachment, TRUE);
		$this->_json(array(
			'ok' => TRUE,
			'ticket' => $this->my_model->get_ticket($ticket['id']),
			'message' => $msg
		));
	}

	public function set_status() {
		$uuid = trim((string) $this->input->post('uuid'));
		$status = trim((string) $this->input->post('status'));
		$ticket = $this->my_model->get_ticket_by_uuid($uuid);
		if ( ! $ticket) {
			$this->_json(array('ok' => FALSE, 'error' => 'Ticket not found'));
		}
		$updated = $this->my_model->set_status($ticket['id'], $status);
		if ( ! $updated) {
			$this->_json(array('ok' => FALSE, 'error' => 'Invalid status'));
		}
		$this->_json(array('ok' => TRUE, 'ticket' => $updated));
	}

	public function attachment() {
		$uuid = trim((string) $this->input->get('msg'));
		$row = $this->db->get_where('tbl_support_message', array('uuid' => $uuid))->row_array();
		if ( ! $row || empty($row['attachment_path'])) {
			show_404();
			return;
		}
		$path = FCPATH.$row['attachment_path'];
		if ( ! is_file($path)) {
			show_404();
			return;
		}
		$name = $row['attachment_name'] ? $row['attachment_name'] : basename($path);
		$mime = function_exists('mime_content_type') ? mime_content_type($path) : 'application/octet-stream';
		header('Content-Type: '.$mime);
		header('Content-Disposition: inline; filename="'.str_replace('"', '', $name).'"');
		header('Content-Length: '.filesize($path));
		readfile($path);
		exit;
	}
}
