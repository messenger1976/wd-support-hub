<?php
	$sa4_page_icon = 'fal fa-comments';
	$sa4_page_title = 'Message Support';
	$sa4_page_subtitle = 'Tickets to Super Admin';
	$ms_poll = isset($poll_seconds) ? (int) $poll_seconds : 8;
	$ms_company = isset($company_name) ? $company_name : 'Water District';
	$ms_sync_error = isset($sync_error) ? $sync_error : '';
	$ms_categories = isset($categories) ? $categories : array('Other');
	$ms_priorities = isset($priorities) ? $priorities : array('normal');
	$ms_base = rtrim(ADMIN_URL, '/').'/messagesupport/';
?>
<style>
	.ms-desk { height: calc(100vh - 210px); min-height: 520px; max-height: 800px; }
	.ms-ticket.active { background: #e8f4fc; }
	#ms-chat-container { min-height: 240px; }
</style>
<main id="js-page-content" role="main" class="page-content">
	<ol class="breadcrumb page-breadcrumb">
		<li class="breadcrumb-item"><a href="<?php echo ADMIN_URL; ?>">Home</a></li>
		<li class="breadcrumb-item active">Message Support</li>
		<li class="position-absolute pos-top pos-right d-none d-sm-block"><span class="js-get-date"></span></li>
	</ol>
	<?php if (is_file(dirname(__FILE__).'/partials/sa4_kpi_subheader.php')) { include dirname(__FILE__).'/partials/sa4_kpi_subheader.php'; } ?>

	<?php if ($ms_sync_error !== '') { ?>
	<div class="alert alert-warning alert-dismissible fade show" id="ms-sync-alert" role="alert">
		<button type="button" class="close" data-dismiss="alert"><span>&times;</span></button>
		<strong>Hub sync:</strong> <?php echo htmlspecialchars($ms_sync_error, ENT_QUOTES, 'UTF-8'); ?>
		<small class="d-block">Tickets are saved locally and will retry automatically.</small>
	</div>
	<?php } ?>

	<div class="d-flex flex-grow-1 p-0 border-faded shadow-4 bg-white ms-desk">
		<div id="js-ms-contact" class="flex-wrap position-relative slide-on-mobile slide-on-mobile-left border-faded border-left-0 border-top-0 border-bottom-0" style="width:18rem;">
			<div class="d-flex flex-column bg-faded position-absolute pos-top pos-bottom w-100">
				<div class="px-3 py-3 border-faded border-left-0 border-right-0 border-top-0">
					<button type="button" class="btn btn-primary btn-sm btn-block mb-2" id="ms-btn-new">
						<i class="fal fa-plus mr-1"></i> New ticket
					</button>
					<input type="text" class="form-control form-control-sm bg-white mb-2" id="ms-search" placeholder="Search tickets">
					<select class="form-control form-control-sm" id="ms-filter-status">
						<option value="all">All statuses</option>
						<option value="open">Open</option>
						<option value="waiting_support">Waiting on support</option>
						<option value="waiting_client">Waiting on us</option>
						<option value="resolved">Resolved</option>
						<option value="closed">Closed</option>
					</select>
				</div>
				<div class="flex-1 h-100 custom-scroll">
					<div class="nav-title m-0 px-3 text-muted">Tickets</div>
					<ul class="list-unstyled m-0" id="js-ms-ticket-list"></ul>
					<div class="text-muted text-center p-3 d-none" id="ms-empty-list">No tickets yet.</div>
				</div>
			</div>
		</div>
		<div class="slide-on-mobile-backdrop" data-action="toggle" data-class="slide-on-mobile-left-show" data-target="#js-ms-contact"></div>

		<div class="d-flex flex-column flex-grow-1 bg-white">
			<div class="flex-grow-0">
				<div class="d-flex align-items-center p-0 border-faded border-top-0 border-left-0 border-right-0 flex-shrink-0">
					<div class="d-flex align-items-center w-100 pl-3 px-lg-4 py-2 position-relative">
						<div class="info-card-text">
							<div class="fs-lg text-truncate text-truncate-lg" id="ms-header-title">Select a ticket</div>
							<span class="text-truncate text-truncate-md opacity-80" id="ms-header-sub"><?php echo htmlspecialchars($ms_company, ENT_QUOTES, 'UTF-8'); ?> · Super Admin support</span>
						</div>
						<div class="ml-auto d-none" id="ms-header-actions">
							<button type="button" class="btn btn-sm btn-outline-success" data-ms-status="resolved">Resolved</button>
							<button type="button" class="btn btn-sm btn-outline-secondary" data-ms-status="closed">Close</button>
							<button type="button" class="btn btn-sm btn-outline-info d-none" id="ms-btn-reopen" data-ms-status="open">Reopen</button>
						</div>
					</div>
					<a href="javascript:void(0);" class="px-3 py-2 d-flex d-lg-none align-items-center justify-content-center mr-2 btn" data-action="toggle" data-class="slide-on-mobile-left-show" data-target="#js-ms-contact">
						<i class="fal fa-ellipsis-v h1 mb-0"></i>
					</a>
				</div>
			</div>
			<div class="flex-wrap align-items-center flex-grow-1 position-relative bg-gray-50">
				<div class="position-absolute pos-top pos-bottom w-100 overflow-hidden">
					<div class="d-flex h-100 flex-column">
						<div class="msgr d-flex h-100 flex-column bg-white">
							<div class="custom-scroll flex-1 h-100">
								<div id="ms-chat-container" class="w-100 p-4">
									<div class="text-muted text-center py-5" id="ms-empty-thread">Open a ticket from the left, or create a new one.</div>
								</div>
							</div>
							<div class="d-flex flex-column" id="ms-composer-wrap">
								<div class="border-faded border-right-0 border-bottom-0 border-left-0 flex-1 mr-3 ml-3 position-relative shadow-top">
									<div class="pt-3 pb-1 pr-0 pl-0 rounded-0">
										<textarea id="ms-composer" class="form-control border-0 shadow-0" rows="3" placeholder="Type your message..." disabled></textarea>
									</div>
								</div>
								<div class="height-8 px-3 d-flex flex-row align-items-center flex-wrap flex-shrink-0">
									<label class="btn btn-icon fs-xl mr-1 mb-0" title="Attach screenshot or PDF">
										<i class="fal fa-paperclip color-fusion-300"></i>
										<input type="file" id="ms-file" class="d-none" accept="image/*,.pdf">
									</label>
									<span class="text-muted fs-xs text-truncate" id="ms-file-label"></span>
									<div class="ml-auto">
										<button type="button" class="btn btn-info" id="ms-btn-send" disabled>Send</button>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</main>

<div class="modal fade" id="ms-new-modal" tabindex="-1" role="dialog" aria-hidden="true">
	<div class="modal-dialog" role="document">
		<div class="modal-content">
			<div class="modal-header">
				<h5 class="modal-title">New support ticket</h5>
				<button type="button" class="close" data-dismiss="modal"><span>&times;</span></button>
			</div>
			<div class="modal-body">
				<div class="form-group">
					<label>Subject</label>
					<input type="text" class="form-control" id="ms-new-subject" maxlength="200">
				</div>
				<div class="form-row">
					<div class="form-group col-md-6">
						<label>Category</label>
						<select class="form-control" id="ms-new-category">
							<?php foreach ($ms_categories as $cat) { ?>
							<option value="<?php echo htmlspecialchars($cat, ENT_QUOTES, 'UTF-8'); ?>"><?php echo htmlspecialchars($cat, ENT_QUOTES, 'UTF-8'); ?></option>
							<?php } ?>
						</select>
					</div>
					<div class="form-group col-md-6">
						<label>Priority</label>
						<select class="form-control" id="ms-new-priority">
							<?php foreach ($ms_priorities as $pr) { ?>
							<option value="<?php echo htmlspecialchars($pr, ENT_QUOTES, 'UTF-8'); ?>" <?php echo $pr === 'normal' ? 'selected' : ''; ?>><?php echo htmlspecialchars(ucfirst($pr), ENT_QUOTES, 'UTF-8'); ?></option>
							<?php } ?>
						</select>
					</div>
				</div>
				<div class="form-group">
					<label>Message</label>
					<textarea class="form-control" id="ms-new-body" rows="4"></textarea>
				</div>
				<div class="form-group mb-0">
					<label>Attachment (optional)</label>
					<input type="file" class="form-control-file" id="ms-new-file" accept="image/*,.pdf">
				</div>
				<div class="text-danger fs-sm mt-2 d-none" id="ms-new-error"></div>
			</div>
			<div class="modal-footer">
				<button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
				<button type="button" class="btn btn-primary" id="ms-new-save">Create ticket</button>
			</div>
		</div>
	</div>
</div>
<?php include 'footer.php'; ?>
<script>
(function ($) {
	var BASE = <?php echo json_encode($ms_base); ?>;
	var POLL = <?php echo (int) $ms_poll; ?> * 1000;
	var currentUuid = '';

	function esc(s) { return $('<div/>').text(s == null ? '' : String(s)).html(); }
	function badgeStatus(st) {
		var map = { open: 'primary', waiting_support: 'warning', waiting_client: 'info', resolved: 'success', closed: 'secondary' };
		var label = { open: 'Open', waiting_support: 'Waiting support', waiting_client: 'Waiting on us', resolved: 'Resolved', closed: 'Closed' };
		return '<span class="badge badge-' + (map[st] || 'light') + '">' + (label[st] || esc(st)) + '</span>';
	}
	function fmtTime(s) {
		if (!s) return '';
		return String(s).replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}).*$/, '$1 $2');
	}

	function renderList(tickets) {
		var $ul = $('#js-ms-ticket-list').empty();
		if (!tickets || !tickets.length) {
			$('#ms-empty-list').removeClass('d-none');
			return;
		}
		$('#ms-empty-list').addClass('d-none');
		$.each(tickets, function (_, t) {
			var unread = parseInt(t.unread_client, 10) === 1;
			var $a = $('<a href="javascript:void(0);" class="d-flex w-100 px-3 py-2 text-dark hover-white ms-ticket"/>');
			$a.attr('data-uuid', t.uuid);
			if (t.uuid === currentUuid) { $a.addClass('active'); }
			$a.html(
				'<div class="flex-1">' +
					'<div class="text-truncate text-truncate-md fw-500">' + esc(t.ticket_no) + ' · ' + esc(t.subject) + '</div>' +
					'<small class="d-block text-muted text-truncate">' + badgeStatus(t.status) + ' · ' + fmtTime(t.last_message_at) + '</small>' +
				'</div>' +
				(unread ? '<span class="badge badge-danger badge-pill">1</span>' : '')
			);
			$ul.append($('<li/>').append($a));
		});
	}

	function renderThread(ticket, messages) {
		var $box = $('#ms-chat-container').empty();
		$('#ms-empty-thread').remove();
		var lastDay = '';
		$.each(messages || [], function (_, m) {
			var day = (m.created_at || '').slice(0, 10);
			if (day && day !== lastDay) {
				$box.append('<div class="chat-segment"><div class="time-stamp text-center mb-2 fw-400">' + esc(day) + '</div></div>');
				lastDay = day;
			}
			var mine = m.sender_side === 'client';
			var cls = 'chat-segment ' + (mine ? 'chat-segment-sent' : 'chat-segment-get');
			var attach = '';
			if (m.attachment_path) {
				var href = BASE + 'attachment?msg=' + encodeURIComponent(m.uuid);
				attach = '<p><a href="' + href + '" target="_blank" rel="noopener"><i class="fal fa-paperclip"></i> ' + esc(m.attachment_name || 'Attachment') + '</a></p>';
			}
			var body = m.body ? '<p>' + esc(m.body).replace(/\n/g, '<br>') + '</p>' : '';
			$box.append(
				'<div class="' + cls + '">' +
					'<div class="chat-message">' + body + attach + '</div>' +
					'<div class="' + (mine ? 'text-right ' : '') + 'fw-300 text-muted mt-1 fs-xs">' + esc(m.sender_name) + ' · ' + fmtTime(m.created_at) + '</div>' +
				'</div>'
			);
		});
		var scroller = $box.parent().get(0);
		if (scroller) { scroller.scrollTop = scroller.scrollHeight; }

		$('#ms-header-title').text(ticket.ticket_no + ' · ' + ticket.subject);
		$('#ms-header-sub').html(badgeStatus(ticket.status) + ' · ' + esc(ticket.priority) + ' · ' + esc(ticket.category) + ' · ' + esc(ticket.user_name));
		$('#ms-header-actions').removeClass('d-none');
		var closed = ticket.status === 'closed';
		$('#ms-btn-reopen').toggleClass('d-none', !closed);
		$('#ms-composer, #ms-btn-send').prop('disabled', closed);
	}

	function loadList(cb) {
		$.getJSON(BASE + 'tickets', { status: $('#ms-filter-status').val(), q: $('#ms-search').val() }, function (res) {
			if (!res || !res.ok) { return; }
			renderList(res.tickets || []);
			if (typeof cb === 'function') { cb(); }
		});
	}

	function loadThread(uuid) {
		if (!uuid) { return; }
		currentUuid = uuid;
		$.getJSON(BASE + 'thread', { uuid: uuid }, function (res) {
			if (!res || !res.ok) { return; }
			renderThread(res.ticket, res.messages);
			$('#js-ms-ticket-list .ms-ticket').removeClass('active');
			$('#js-ms-ticket-list .ms-ticket[data-uuid="' + uuid + '"]').addClass('active');
		});
	}

	function sendCurrent() {
		if (!currentUuid) { return; }
		var fd = new FormData();
		fd.append('uuid', currentUuid);
		fd.append('body', $('#ms-composer').val());
		var f = $('#ms-file')[0].files[0];
		if (f) { fd.append('attachment', f); }
		$('#ms-btn-send').prop('disabled', true);
		$.ajax({ url: BASE + 'send_message', method: 'POST', data: fd, processData: false, contentType: false, dataType: 'json' })
			.done(function (res) {
				if (!res.ok) { alert(res.error || 'Send failed'); return; }
				$('#ms-composer').val('');
				$('#ms-file').val('');
				$('#ms-file-label').text('');
				loadThread(currentUuid);
				loadList();
			})
			.always(function () { $('#ms-btn-send').prop('disabled', false); });
	}

	$('#js-ms-ticket-list').on('click', '.ms-ticket', function () { loadThread($(this).data('uuid')); });
	$('#ms-filter-status, #ms-search').on('change keyup', function () { loadList(); });
	$('#ms-btn-new').on('click', function () {
		$('#ms-new-error').addClass('d-none');
		$('#ms-new-modal').modal('show');
	});
	$('#ms-btn-send').on('click', sendCurrent);
	$('#ms-composer').on('keydown', function (e) {
		if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendCurrent(); }
	});
	$('#ms-file').on('change', function () {
		var f = this.files[0];
		$('#ms-file-label').text(f ? f.name : '');
	});
	$('[data-ms-status]').on('click', function () {
		if (!currentUuid) { return; }
		$.post(BASE + 'set_status', { uuid: currentUuid, status: $(this).data('ms-status') }, function (res) {
			if (res && res.ok) { loadThread(currentUuid); loadList(); }
			else { alert((res && res.error) || 'Could not update status'); }
		}, 'json');
	});
	$('#ms-new-save').on('click', function () {
		var fd = new FormData();
		fd.append('subject', $('#ms-new-subject').val());
		fd.append('body', $('#ms-new-body').val());
		fd.append('category', $('#ms-new-category').val());
		fd.append('priority', $('#ms-new-priority').val());
		var f = $('#ms-new-file')[0].files[0];
		if (f) { fd.append('attachment', f); }
		$('#ms-new-error').addClass('d-none');
		$.ajax({ url: BASE + 'create_ticket', method: 'POST', data: fd, processData: false, contentType: false, dataType: 'json' })
			.done(function (res) {
				if (!res.ok) {
					$('#ms-new-error').removeClass('d-none').text(res.error || 'Could not create ticket');
					return;
				}
				$('#ms-new-modal').modal('hide');
				$('#ms-new-subject, #ms-new-body').val('');
				$('#ms-new-file').val('');
				currentUuid = res.ticket.uuid;
				loadList(function () { loadThread(currentUuid); });
			});
	});

	loadList();
	setInterval(function () {
		loadList();
		if (currentUuid) { loadThread(currentUuid); }
	}, POLL);
})(jQuery);
</script>
