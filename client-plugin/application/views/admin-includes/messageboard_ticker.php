<?php
/*
| Message Board — loads the floating ticker on every admin page.
| Included from admin-includes/header.php, right after </header>.
*/
$this->config->load('message_support', TRUE, TRUE);
$__mb_cfg = $this->config->item('message_support');
$__mb_on = ( ! is_array($__mb_cfg) || ! array_key_exists('ms_board_enabled', $__mb_cfg) || $__mb_cfg['ms_board_enabled'])
	&& (int) $this->session->userdata('userid') > 0
	&& $this->db->table_exists('tbl_board_message');
if ($__mb_on) {
	$__mb_type = strtolower(preg_replace('/[^A-Za-z0-9_]/', '', (string) $this->session->userdata('usertype')));
	$__mb_js = array(
		'feed' => ADMIN_URL.'messageboard/feed',
		'refresh' => ADMIN_URL.'messageboard/refresh',
		'event' => ADMIN_URL.'messageboard/event',
		'page' => ADMIN_URL.'messageboard',
		'userKey' => ($__mb_type !== '' ? $__mb_type : 'user').':'.(int) $this->session->userdata('userid')
	);
	$__mb_assets = base_url().'assets/messageboard/';
	$__mb_ver = '1.0.0';
?>
<link rel="stylesheet" href="<?php echo $__mb_assets; ?>messageboard.css?v=<?php echo $__mb_ver; ?>">
<script>window.MB_CONFIG = <?php echo json_encode($__mb_js); ?>;</script>
<script src="<?php echo $__mb_assets; ?>messageboard.js?v=<?php echo $__mb_ver; ?>" defer></script>
<?php } ?>
