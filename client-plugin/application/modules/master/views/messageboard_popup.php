<?php
/*
| Message Board — sign-in popup. Included from dashboard.php after footer.php, only on the first
| dashboard view after master::index() sets the session flag mb_popup_pending.
*/
if ($this->session->userdata('mb_popup_pending')) {
	$this->session->unset_userdata('mb_popup_pending');
	if ($this->db->table_exists('tbl_board_message')) {
?>
<script src="<?php echo base_url(); ?>assets/messageboard/messageboard-popup.js?v=1.0.0" defer></script>
<?php
	}
}
