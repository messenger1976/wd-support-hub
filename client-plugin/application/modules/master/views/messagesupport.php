<?php
	$ms_poll = isset($poll_seconds) ? (int) $poll_seconds : 8;
	$ms_company = isset($company_name) ? $company_name : 'Water District';
	$ms_sync_error = isset($sync_error) ? $sync_error : '';
	$ms_categories = isset($categories) ? $categories : array('Other');
	$ms_priorities = isset($priorities) ? $priorities : array('normal');
	$ms_base = rtrim(ADMIN_URL, '/').'/messagesupport/';
	$ms_h = function ($s) { return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8'); };
?>
<style>
	/* Message Support — mobile first; side-by-side from lg (992px). */
	.ms-desk { display: flex; height: calc(100vh - 200px); min-height: 420px; overflow: hidden; }
	.ms-list { display: flex; flex-direction: column; width: 100%; background: #fff; }
	.ms-thread { display: flex; flex-direction: column; flex: 1 1 auto; min-width: 0; background: #fff; }
	.ms-scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; }
	.ms-desk[data-view="list"] .ms-thread,
	.ms-desk[data-view="thread"] .ms-list { display: none; }

	.ms-list-head { padding: .75rem 1rem; border-bottom: 1px solid rgba(0, 0, 0, .08); }
	.ms-search .form-control { border-left: 0; }
	.ms-search .input-group-text { background: #fff; }
	.ms-chips { display: flex; gap: .375rem; overflow-x: auto; margin-top: .625rem; padding-bottom: 2px; scrollbar-width: none; }
	.ms-chips::-webkit-scrollbar { display: none; }
	.ms-chip { flex-shrink: 0; white-space: nowrap; }

	.ms-ticket { position: relative; display: flex; align-items: flex-start; padding: .75rem 1rem; border-bottom: 1px solid rgba(0, 0, 0, .05); color: inherit; }
	.ms-ticket:hover, .ms-ticket:focus { background: rgba(136, 106, 181, .06); color: inherit; text-decoration: none; }
	.ms-ticket.active { background: rgba(136, 106, 181, .12); }
	.ms-ticket.active::before { content: ''; position: absolute; top: 0; bottom: 0; left: 0; width: 3px; background: #886ab5; }
	.ms-ticket-icon { display: inline-flex; flex-shrink: 0; align-items: center; justify-content: center; width: 2.5rem; height: 2.5rem; border-radius: 50%; background: rgba(136, 106, 181, .12); color: #886ab5; font-size: 1.05rem; }
	.ms-ticket-main { flex: 1 1 auto; min-width: 0; margin-left: .75rem; }
	.ms-ticket-subject { font-weight: 500; }
	.ms-ticket.is-unread .ms-ticket-subject { font-weight: 700; }
	.ms-unread-dot { display: inline-block; flex-shrink: 0; width: .55rem; height: .55rem; margin-left: .4rem; border-radius: 50%; background: #fd3995; }

	.ms-thread-head { display: flex; align-items: center; min-height: 3.75rem; padding: .5rem .75rem; border-bottom: 1px solid rgba(0, 0, 0, .08); }
	.ms-thread-title { flex: 1 1 auto; min-width: 0; }
	.ms-thread-body { background: #f7f9fa; }
	.ms-thread-body .chat-message { max-width: 85%; word-wrap: break-word; overflow-wrap: anywhere; }
	.ms-day { margin: .5rem 0 1rem; text-align: center; }
	.ms-day span { display: inline-block; padding: .15rem .75rem; border-radius: 1rem; background: rgba(0, 0, 0, .06); font-size: .75rem; color: #666; }
	.ms-thumb { display: block; max-width: 100%; width: 220px; max-height: 200px; margin-top: .35rem; border-radius: 6px; object-fit: cover; }

	.ms-composer { border-top: 1px solid rgba(0, 0, 0, .08); padding: .5rem .75rem; padding-bottom: calc(.5rem + env(safe-area-inset-bottom)); background: #fff; }
	.ms-composer textarea { max-height: 8rem; padding: .55rem .9rem; border-radius: 1.25rem; resize: none; }
	.ms-round { display: inline-flex; flex-shrink: 0; align-items: center; justify-content: center; width: 2.5rem; height: 2.5rem; padding: 0; border-radius: 50%; }
	.ms-file-chip { display: inline-flex; align-items: center; max-width: 100%; margin-bottom: .4rem; padding: .2rem .35rem .2rem .7rem; border-radius: 1rem; background: rgba(136, 106, 181, .12); font-size: .8rem; }

	.ms-empty { padding: 3rem 1.5rem; text-align: center; color: #999; }
	.ms-empty i { display: block; margin-bottom: .75rem; font-size: 2.5rem; opacity: .45; }

	@media (max-width: 575.98px) {
		.ms-page .subheader { margin-bottom: 1rem; }
		.ms-page .subheader-title { font-size: 1.3rem; }
		.ms-desk { height: calc(100vh - 150px); }
		#ms-new-modal .modal-dialog { max-width: none; min-height: 100%; margin: 0; }
		#ms-new-modal .modal-content { min-height: 100vh; border: 0; border-radius: 0; }
	}
	@media (min-width: 992px) {
		.ms-list { flex-shrink: 0; width: 21rem; border-right: 1px solid rgba(0, 0, 0, .08); }
		.ms-desk[data-view] .ms-list,
		.ms-desk[data-view] .ms-thread { display: flex; }
		.ms-thread-body .chat-message { max-width: 70%; }
	}
</style>
<main id="js-page-content" role="main" class="page-content ms-page">
	<ol class="breadcrumb page-breadcrumb d-none d-sm-flex">
		<li class="breadcrumb-item"><a href="<?php echo ADMIN_URL; ?>">Home</a></li>
		<li class="breadcrumb-item active">Message Support</li>
		<li class="position-absolute pos-top pos-right d-none d-sm-block"><span class="js-get-date"></span></li>
	</ol>
	<div class="subheader">
		<h1 class="subheader-title">
			<i class="subheader-icon fal fa-comments"></i> Message Support
			<small><?php echo $ms_h($ms_company); ?> · tickets to Super Admin</small>
		</h1>
	</div>

	<?php if ($ms_sync_error !== '') { ?>
	<div class="alert alert-warning alert-dismissible fade show" role="alert">
		<button type="button" class="close" data-dismiss="alert" aria-label="Close"><span>&times;</span></button>
		<strong><i class="fal fa-exclamation-triangle mr-1"></i> Hub sync:</strong> <?php echo $ms_h($ms_sync_error); ?>
		<small class="d-block">Tickets are saved here and will be sent automatically when the hub is reachable.</small>
	</div>
	<?php } ?>

	<div class="ms-desk border-faded shadow-4 rounded" id="ms-desk" data-view="list">
		<aside class="ms-list" aria-label="Tickets">
			<div class="ms-list-head">
				<div class="d-flex align-items-center mb-2">
					<h5 class="mb-0 fw-500">Tickets <span class="badge badge-danger badge-pill ml-1 d-none" id="ms-unread-count" title="Unread replies"></span></h5>
					<button type="button" class="btn btn-primary btn-sm ml-auto" id="ms-btn-new">
						<i class="fal fa-plus"></i><span class="ml-1">New ticket</span>
					</button>
				</div>
				<div class="input-group input-group-sm ms-search">
					<div class="input-group-prepend"><span class="input-group-text"><i class="fal fa-search"></i></span></div>
					<input type="search" class="form-control" id="ms-search" placeholder="Search subject, ticket no. or name" aria-label="Search tickets">
				</div>
				<div class="ms-chips" id="ms-chips" role="tablist" aria-label="Filter by status">
					<button type="button" class="btn btn-xs btn-pills btn-primary ms-chip" data-status="all">All</button>
					<button type="button" class="btn btn-xs btn-pills btn-outline-secondary ms-chip" data-status="waiting_client">Waiting on us</button>
					<button type="button" class="btn btn-xs btn-pills btn-outline-secondary ms-chip" data-status="waiting_support">Waiting support</button>
					<button type="button" class="btn btn-xs btn-pills btn-outline-secondary ms-chip" data-status="open">Open</button>
					<button type="button" class="btn btn-xs btn-pills btn-outline-secondary ms-chip" data-status="resolved">Resolved</button>
					<button type="button" class="btn btn-xs btn-pills btn-outline-secondary ms-chip" data-status="closed">Closed</button>
				</div>
				<div class="text-warning fs-xs mt-2 d-none" id="ms-sync-banner"><i class="fal fa-exclamation-triangle mr-1"></i><span></span></div>
			</div>
			<div class="ms-scroll">
				<ul class="list-unstyled m-0" id="js-ms-ticket-list"></ul>
				<div class="ms-empty" id="ms-list-state">
					<div class="spinner-border spinner-border-sm text-primary" role="status"></div>
					<div class="mt-2">Loading tickets…</div>
				</div>
			</div>
		</aside>

		<section class="ms-thread" aria-label="Conversation">
			<header class="ms-thread-head">
				<button type="button" class="btn btn-icon btn-sm btn-light rounded-circle mr-2 d-lg-none" id="ms-btn-back" title="Back to tickets" aria-label="Back to tickets">
					<i class="fal fa-arrow-left"></i>
				</button>
				<div class="ms-thread-title">
					<div class="fw-500 text-truncate" id="ms-header-title">Select a ticket</div>
					<div class="fs-xs text-muted text-truncate" id="ms-header-sub">Choose a ticket from the list, or create a new one.</div>
				</div>
				<div class="d-none ml-2 flex-shrink-0" id="ms-header-actions">
					<div class="btn-group btn-group-sm d-none d-md-inline-flex">
						<button type="button" class="btn btn-outline-success" data-ms-status="resolved"><i class="fal fa-check mr-1"></i>Resolved</button>
						<button type="button" class="btn btn-outline-secondary" data-ms-status="closed"><i class="fal fa-lock mr-1"></i>Close</button>
						<button type="button" class="btn btn-outline-info" data-ms-status="open"><i class="fal fa-redo mr-1"></i>Reopen</button>
					</div>
					<div class="dropdown d-md-none">
						<button type="button" class="btn btn-icon btn-sm btn-light rounded-circle" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false" aria-label="Ticket actions">
							<i class="fal fa-ellipsis-v"></i>
						</button>
						<div class="dropdown-menu dropdown-menu-right">
							<button type="button" class="dropdown-item" data-ms-status="resolved"><i class="fal fa-check mr-2 text-success"></i>Mark resolved</button>
							<button type="button" class="dropdown-item" data-ms-status="closed"><i class="fal fa-lock mr-2"></i>Close ticket</button>
							<button type="button" class="dropdown-item" data-ms-status="open"><i class="fal fa-redo mr-2 text-info"></i>Reopen ticket</button>
						</div>
					</div>
				</div>
			</header>

			<div class="ms-scroll ms-thread-body" id="ms-chat-scroll">
				<div id="ms-chat-container" class="p-3 p-md-4">
					<div class="ms-empty"><i class="fal fa-comments"></i>Open a ticket to see the conversation.</div>
				</div>
			</div>

			<footer class="ms-composer" id="ms-composer-wrap">
				<div class="alert alert-secondary py-2 px-3 mb-2 fs-sm d-none" id="ms-closed-note">
					<i class="fal fa-lock mr-1"></i> This ticket is closed. Reopen it to send a message.
				</div>
				<div class="ms-file-chip d-none" id="ms-file-chip">
					<i class="fal fa-paperclip mr-1"></i><span class="text-truncate" id="ms-file-label"></span>
					<button type="button" class="btn btn-icon btn-xs ml-1" id="ms-file-clear" aria-label="Remove attachment"><i class="fal fa-times"></i></button>
				</div>
				<div class="d-flex align-items-end">
					<label class="btn btn-light ms-round mb-0 mr-2" title="Attach screenshot or PDF" id="ms-attach-btn">
						<i class="fal fa-paperclip"></i>
						<input type="file" id="ms-file" class="d-none" accept="image/*,.pdf" disabled>
					</label>
					<textarea id="ms-composer" class="form-control" rows="1" placeholder="Type your message…" aria-label="Message" disabled></textarea>
					<button type="button" class="btn btn-info ms-round ml-2" id="ms-btn-send" title="Send" aria-label="Send" disabled>
						<i class="fal fa-paper-plane"></i>
					</button>
				</div>
				<div class="fs-xs text-muted mt-1 d-none d-lg-block">Enter to send · Shift+Enter for a new line</div>
			</footer>
		</section>
	</div>
</main>

<div class="modal fade" id="ms-new-modal" tabindex="-1" role="dialog" aria-labelledby="ms-new-title" aria-hidden="true">
	<div class="modal-dialog modal-dialog-centered modal-dialog-scrollable" role="document">
		<div class="modal-content">
			<div class="modal-header">
				<h5 class="modal-title" id="ms-new-title"><i class="fal fa-comment-plus mr-2"></i>New support ticket</h5>
				<button type="button" class="close" data-dismiss="modal" aria-label="Close"><span>&times;</span></button>
			</div>
			<div class="modal-body">
				<div class="form-group">
					<label for="ms-new-subject">Subject</label>
					<input type="text" class="form-control" id="ms-new-subject" maxlength="200" placeholder="Short summary of the problem">
				</div>
				<div class="form-row">
					<div class="form-group col-6">
						<label for="ms-new-category">Category</label>
						<select class="form-control" id="ms-new-category">
							<?php foreach ($ms_categories as $cat) { ?>
							<option value="<?php echo $ms_h($cat); ?>"><?php echo $ms_h($cat); ?></option>
							<?php } ?>
						</select>
					</div>
					<div class="form-group col-6">
						<label for="ms-new-priority">Priority</label>
						<select class="form-control" id="ms-new-priority">
							<?php foreach ($ms_priorities as $pr) { ?>
							<option value="<?php echo $ms_h($pr); ?>" <?php echo $pr === 'normal' ? 'selected' : ''; ?>><?php echo $ms_h(ucfirst($pr)); ?></option>
							<?php } ?>
						</select>
					</div>
				</div>
				<div class="form-group">
					<label for="ms-new-body">Message</label>
					<textarea class="form-control" id="ms-new-body" rows="5" placeholder="Describe what happened, the steps, and any account or OR numbers involved."></textarea>
				</div>
				<div class="form-group mb-0">
					<label for="ms-new-file">Attachment <span class="text-muted fw-300">(optional — screenshot or PDF)</span></label>
					<input type="file" class="form-control-file" id="ms-new-file" accept="image/*,.pdf">
				</div>
				<div class="alert alert-danger py-2 mt-3 mb-0 d-none" id="ms-new-error"></div>
			</div>
			<div class="modal-footer">
				<button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
				<button type="button" class="btn btn-primary" id="ms-new-save"><i class="fal fa-paper-plane mr-1"></i>Create ticket</button>
			</div>
		</div>
	</div>
</div>
<?php include 'footer.php'; ?>
<script>
(function ($) {
	var BASE = <?php echo json_encode($ms_base); ?>;
	var POLL = <?php echo (int) $ms_poll; ?> * 1000;
	var STORE_KEY = 'ms_open_ticket';
	var STATUS = {
		open: { cls: 'primary', label: 'Open' },
		waiting_support: { cls: 'warning', label: 'Waiting support' },
		waiting_client: { cls: 'info', label: 'Waiting on us' },
		resolved: { cls: 'success', label: 'Resolved' },
		closed: { cls: 'secondary', label: 'Closed' }
	};
	var CATEGORY_ICON = {
		'Billing': 'fa-file-invoice-dollar',
		'Payments': 'fa-credit-card',
		'Reports': 'fa-chart-bar',
		'Login/Access': 'fa-key'
	};
	var IMAGE_EXT = /\.(jpe?g|png|gif|webp)$/i;
	var MOBILE = window.matchMedia ? window.matchMedia('(max-width: 991.98px)') : null;

	var $desk = $('#ms-desk');
	var currentUuid = '';
	var currentStatus = 'all';
	var listLoaded = false;
	var threadSeq = 0;
	var lastCount = -1;

	function isMobile() { return !!(MOBILE && MOBILE.matches); }
	function esc(s) { return $('<div/>').text(s == null ? '' : String(s)).html(); }

	/* ---------- dates ('Y-m-d H:i:s' local strings) ---------- */
	function toDate(s) {
		var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(s || '');
		return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null;
	}
	function sameDay(a, b) { return a.toDateString() === b.toDateString(); }
	function clock(d) { return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
	function listTime(s) {
		var d = toDate(s), now = new Date();
		if (!d) return '';
		if (sameDay(d, now)) return clock(d);
		if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
		return d.toLocaleDateString();
	}
	function dayLabel(s) {
		var d = toDate(s), y = new Date();
		if (!d) return '';
		y.setDate(y.getDate() - 1);
		if (sameDay(d, new Date())) return 'Today';
		if (sameDay(d, y)) return 'Yesterday';
		return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
	}

	function badgeStatus(st) {
		var s = STATUS[st] || { cls: 'light', label: st };
		return '<span class="badge badge-' + s.cls + '">' + esc(s.label) + '</span>';
	}
	function badgePriority(p) {
		if (p === 'urgent') return '<span class="badge badge-danger">Urgent</span>';
		if (p === 'high') return '<span class="badge badge-warning">High</span>';
		return '<span class="text-muted">' + esc(p ? p.charAt(0).toUpperCase() + p.slice(1) : '') + '</span>';
	}

	/* ---------- view state (phones: list OR thread; desktop: both) ---------- */
	function setView(view) {
		$desk.attr('data-view', view);
		fitDesk();
	}

	function hashUuid() {
		var m = /(?:^#|&)ticket=([0-9a-fA-F-]{36})/.exec(window.location.hash || '');
		return m ? m[1] : '';
	}
	function savedUuid() {
		var h = hashUuid();
		if (h) return h;
		try { return window.sessionStorage.getItem(STORE_KEY) || ''; } catch (e) { return ''; }
	}
	function baseUrl() { return window.location.pathname + window.location.search; }
	// Phones push a history entry per opened ticket so the device Back button returns to the list.
	function rememberUuid(uuid, push) {
		if (window.history && window.history.replaceState) {
			var url = baseUrl() + (uuid ? '#ticket=' + uuid : '');
			if (push) window.history.pushState({ msThread: true }, '', url);
			else window.history.replaceState(window.history.state, '', url);
		}
		try {
			if (uuid) window.sessionStorage.setItem(STORE_KEY, uuid); else window.sessionStorage.removeItem(STORE_KEY);
		} catch (e) {}
	}

	function fitDesk() {
		var el = $desk.get(0);
		if (!el) return;
		var top = el.getBoundingClientRect().top + (window.pageYOffset || 0);
		var h = Math.max(420, Math.round(window.innerHeight - top - (isMobile() ? 12 : 24)));
		el.style.height = h + 'px';
	}

	/* ---------- ticket list ---------- */
	function listState(html) {
		$('#ms-list-state').toggleClass('d-none', !html).html(html || '');
	}

	function renderList(tickets, unread) {
		var $ul = $('#js-ms-ticket-list').empty();
		$('#ms-unread-count').toggleClass('d-none', !unread).text(unread || '');
		if (!tickets.length) {
			var filtered = currentStatus !== 'all' || $.trim($('#ms-search').val()) !== '';
			listState(filtered
				? '<i class="fal fa-filter"></i>No tickets match this filter.'
				: '<i class="fal fa-inbox"></i>No tickets yet.<div class="mt-3"><button type="button" class="btn btn-sm btn-primary js-ms-new"><i class="fal fa-plus mr-1"></i>Create your first ticket</button></div>');
			return;
		}
		listState('');
		$.each(tickets, function (_, t) {
			var unreadOne = parseInt(t.unread_client, 10) === 1;
			var icon = CATEGORY_ICON[t.category] || 'fa-question-circle';
			var $a = $('<a href="javascript:void(0);" class="ms-ticket"/>')
				.attr('data-uuid', t.uuid)
				.toggleClass('active', t.uuid === currentUuid)
				.toggleClass('is-unread', unreadOne)
				.html(
					'<span class="ms-ticket-icon"><i class="fal ' + icon + '"></i></span>' +
					'<div class="ms-ticket-main">' +
						'<div class="d-flex align-items-center">' +
							'<span class="ms-ticket-subject text-truncate">' + esc(t.subject) + '</span>' +
							'<small class="text-muted ml-auto pl-2 text-nowrap">' + esc(listTime(t.last_message_at)) + '</small>' +
						'</div>' +
						'<div class="d-flex align-items-center mt-1 fs-xs">' +
							'<span class="text-muted text-truncate mr-2">' + esc(t.ticket_no) + ' · ' + esc(t.category) + '</span>' +
							'<span class="ml-auto text-nowrap">' + badgeStatus(t.status) + '</span>' +
							(unreadOne ? '<span class="ms-unread-dot" title="New reply"></span>' : '') +
						'</div>' +
					'</div>'
				);
			$ul.append($('<li/>').append($a));
		});
	}

	function loadList(cb) {
		$.getJSON(BASE + 'tickets', { status: currentStatus, q: $.trim($('#ms-search').val()) })
			.done(function (res) {
				if (!res || !res.ok) return;
				listLoaded = true;
				renderList(res.tickets || [], parseInt(res.unread, 10) || 0);
				var err = res.sync_error || '';
				$('#ms-sync-banner').toggleClass('d-none', !err).find('span').text(err ? 'Hub sync: ' + err : '');
				if (typeof cb === 'function') cb();
			})
			.fail(function () {
				if (!listLoaded) listState('<i class="fal fa-wifi-slash"></i>Could not load tickets. Retrying…');
			});
	}

	/* ---------- conversation ---------- */
	function setComposerEnabled(on) {
		$('#ms-composer, #ms-btn-send, #ms-file').prop('disabled', !on);
		$('#ms-attach-btn').toggleClass('disabled', !on);
	}

	function resetThread() {
		$('#ms-header-title').text('Select a ticket');
		$('#ms-header-sub').text('Choose a ticket from the list, or create a new one.');
		$('#ms-header-actions').addClass('d-none');
		$('#ms-closed-note').addClass('d-none');
		$('#ms-chat-container').html('<div class="ms-empty"><i class="fal fa-comments"></i>Open a ticket to see the conversation.</div>');
		setComposerEnabled(false);
	}

	function renderThread(ticket, messages) {
		var scroller = document.getElementById('ms-chat-scroll');
		var nearBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80;
		var html = '';
		var lastDay = '';
		$.each(messages || [], function (_, m) {
			var day = (m.created_at || '').slice(0, 10);
			if (day && day !== lastDay) {
				html += '<div class="ms-day"><span>' + esc(dayLabel(m.created_at)) + '</span></div>';
				lastDay = day;
			}
			var mine = m.sender_side === 'client';
			var attach = '';
			if (m.attachment_path) {
				var href = BASE + 'attachment?msg=' + encodeURIComponent(m.uuid);
				var name = m.attachment_name || 'Attachment';
				attach = IMAGE_EXT.test(name)
					? '<a href="' + href + '" target="_blank" rel="noopener" title="' + esc(name) + '"><img class="ms-thumb" src="' + href + '" alt="' + esc(name) + '" loading="lazy"></a>'
					: '<p class="mb-0"><a href="' + href + '" target="_blank" rel="noopener"><i class="fal fa-file-pdf mr-1"></i>' + esc(name) + '</a></p>';
			}
			var body = m.body ? '<p class="mb-0">' + esc(m.body).replace(/\n/g, '<br>') + '</p>' : '';
			var when = toDate(m.created_at);
			html += '<div class="chat-segment ' + (mine ? 'chat-segment-sent' : 'chat-segment-get') + '">' +
				'<div class="chat-message">' + body + attach + '</div>' +
				'<div class="' + (mine ? 'text-right ' : '') + 'fw-300 text-muted mt-1 fs-xs">' +
					esc(mine ? (m.sender_name || 'You') : (m.sender_name || 'Super Admin')) + (when ? ' · ' + esc(clock(when)) : '') +
				'</div>' +
			'</div>';
		});
		$('#ms-chat-container').html(html || '<div class="ms-empty"><i class="fal fa-comment"></i>No messages yet.</div>');

		var count = (messages || []).length;
		if (lastCount === -1 || (count !== lastCount && nearBottom) || (count > lastCount && messages[count - 1].sender_side === 'client')) {
			scroller.scrollTop = scroller.scrollHeight;
		}
		lastCount = count;

		var closed = ticket.status === 'closed';
		$('#ms-header-title').text(ticket.ticket_no + ' · ' + ticket.subject);
		$('#ms-header-sub').html(badgeStatus(ticket.status) + ' ' + badgePriority(ticket.priority) +
			'<span class="d-none d-sm-inline"> · ' + esc(ticket.category) + ' · ' + esc(ticket.user_name) + '</span>');
		$('#ms-header-actions').removeClass('d-none');
		$('[data-ms-status="resolved"]').toggleClass('d-none', closed || ticket.status === 'resolved');
		$('[data-ms-status="closed"]').toggleClass('d-none', closed);
		$('[data-ms-status="open"]').toggleClass('d-none', !(closed || ticket.status === 'resolved'));
		$('#ms-closed-note').toggleClass('d-none', !closed);
		setComposerEnabled(!closed);
	}

	function loadThread(uuid) {
		if (!uuid) return;
		var seq = ++threadSeq;
		$.getJSON(BASE + 'thread', { uuid: uuid }).done(function (res) {
			if (seq !== threadSeq || uuid !== currentUuid) return;
			if (!res || !res.ok) {
				currentUuid = '';
				rememberUuid('', false);
				resetThread();
				setView('list');
				return;
			}
			renderThread(res.ticket, res.messages);
			$('#js-ms-ticket-list .ms-ticket').removeClass('active')
				.filter('[data-uuid="' + uuid + '"]').addClass('active').removeClass('is-unread')
				.find('.ms-unread-dot').remove();
		});
	}

	function openTicket(uuid, fromHistory) {
		if (!uuid) return;
		var changed = uuid !== currentUuid;
		currentUuid = uuid;
		if (changed) {
			lastCount = -1;
			$('#ms-chat-container').html('<div class="ms-empty"><div class="spinner-border spinner-border-sm text-primary" role="status"></div><div class="mt-2">Loading conversation…</div></div>');
			setComposerEnabled(false);
		}
		if (!fromHistory) rememberUuid(uuid, isMobile() && $desk.attr('data-view') === 'list');
		setView('thread');
		loadThread(uuid);
	}

	function showList() {
		currentUuid = '';
		threadSeq++;
		rememberUuid('', false);
		resetThread();
		$('#js-ms-ticket-list .ms-ticket').removeClass('active');
		setView('list');
		loadList();
	}

	/* ---------- composer ---------- */
	function autoGrow() {
		var ta = document.getElementById('ms-composer');
		ta.style.height = 'auto';
		ta.style.height = Math.min(ta.scrollHeight + 2, 128) + 'px';
	}
	function clearFile() {
		$('#ms-file').val('');
		$('#ms-file-chip').addClass('d-none');
		$('#ms-file-label').text('');
	}

	function sendCurrent() {
		if (!currentUuid || $('#ms-btn-send').prop('disabled')) return;
		var body = $.trim($('#ms-composer').val());
		var f = $('#ms-file')[0].files[0];
		if (!body && !f) { $('#ms-composer').focus(); return; }
		var fd = new FormData();
		fd.append('uuid', currentUuid);
		fd.append('body', body);
		if (f) fd.append('attachment', f);
		var $btn = $('#ms-btn-send').prop('disabled', true).html('<span class="spinner-border spinner-border-sm"></span>');
		$.ajax({ url: BASE + 'send_message', method: 'POST', data: fd, processData: false, contentType: false, dataType: 'json' })
			.done(function (res) {
				if (!res || !res.ok) { alert((res && res.error) || 'Send failed'); return; }
				$('#ms-composer').val('');
				autoGrow();
				clearFile();
				loadThread(currentUuid);
				loadList();
			})
			.fail(function () { alert('Could not send. Check your connection and try again.'); })
			.always(function () {
				$btn.html('<i class="fal fa-paper-plane"></i>').prop('disabled', $('#ms-composer').prop('disabled'));
			});
	}

	/* ---------- events ---------- */
	$('#js-ms-ticket-list').on('click', '.ms-ticket', function () { openTicket($(this).attr('data-uuid')); });
	$('#ms-btn-back').on('click', function () {
		if (window.history.state && window.history.state.msThread) window.history.back();
		else showList();
	});
	$(window).on('popstate', function () {
		var uuid = hashUuid();
		if (uuid) openTicket(uuid, true);
		else if (isMobile()) showList();
	});

	var searchTimer = null;
	$('#ms-search').on('input', function () {
		clearTimeout(searchTimer);
		searchTimer = setTimeout(loadList, 300);
	});
	$('#ms-chips').on('click', '.ms-chip', function () {
		currentStatus = $(this).attr('data-status');
		$('#ms-chips .ms-chip').removeClass('btn-primary').addClass('btn-outline-secondary');
		$(this).removeClass('btn-outline-secondary').addClass('btn-primary');
		this.scrollIntoView({ block: 'nearest', inline: 'center' });
		loadList();
	});

	$('#ms-btn-send').on('click', sendCurrent);
	$('#ms-composer').on('input', autoGrow).on('keydown', function (e) {
		// Phones have no Shift+Enter, so Enter adds a line there and the button sends.
		if (e.key === 'Enter' && !e.shiftKey && !isMobile()) { e.preventDefault(); sendCurrent(); }
	});
	$('#ms-file').on('change', function () {
		var f = this.files[0];
		$('#ms-file-label').text(f ? f.name : '');
		$('#ms-file-chip').toggleClass('d-none', !f);
	});
	$('#ms-file-clear').on('click', clearFile);

	$(document).on('click', '[data-ms-status]', function () {
		if (!currentUuid) return;
		$.post(BASE + 'set_status', { uuid: currentUuid, status: $(this).attr('data-ms-status') }, function (res) {
			if (res && res.ok) { loadThread(currentUuid); loadList(); }
			else alert((res && res.error) || 'Could not update status');
		}, 'json');
	});

	$(document).on('click', '#ms-btn-new, .js-ms-new', function () {
		$('#ms-new-error').addClass('d-none');
		$('#ms-new-modal').modal('show');
	});
	$('#ms-new-modal').on('shown.bs.modal', function () { $('#ms-new-subject').trigger('focus'); });
	$('#ms-new-save').on('click', function () {
		var $btn = $(this);
		var fd = new FormData();
		fd.append('subject', $.trim($('#ms-new-subject').val()));
		fd.append('body', $.trim($('#ms-new-body').val()));
		fd.append('category', $('#ms-new-category').val());
		fd.append('priority', $('#ms-new-priority').val());
		var f = $('#ms-new-file')[0].files[0];
		if (f) fd.append('attachment', f);
		$('#ms-new-error').addClass('d-none');
		$btn.prop('disabled', true);
		$.ajax({ url: BASE + 'create_ticket', method: 'POST', data: fd, processData: false, contentType: false, dataType: 'json' })
			.done(function (res) {
				if (!res || !res.ok) {
					$('#ms-new-error').removeClass('d-none').text((res && res.error) || 'Could not create ticket');
					return;
				}
				$('#ms-new-modal').modal('hide');
				$('#ms-new-subject, #ms-new-body').val('');
				$('#ms-new-file').val('');
				loadList(function () { openTicket(res.ticket.uuid); });
			})
			.fail(function () { $('#ms-new-error').removeClass('d-none').text('Could not reach the server. Try again.'); })
			.always(function () { $btn.prop('disabled', false); });
	});

	$(window).on('resize orientationchange', fitDesk);
	if (MOBILE && MOBILE.addListener) {
		MOBILE.addListener(function () { if (!currentUuid) setView('list'); fitDesk(); });
	}

	/* ---------- start ---------- */
	fitDesk();
	var restoreUuid = savedUuid();
	if (restoreUuid && isMobile() && window.history.pushState) {
		// Re-create "list -> ticket" history so Back returns to the list after a refresh.
		window.history.replaceState(null, '', baseUrl());
		window.history.pushState({ msThread: true }, '', baseUrl() + '#ticket=' + restoreUuid);
	}
	loadList(function () { if (restoreUuid) openTicket(restoreUuid, true); });
	setInterval(function () {
		loadList();
		if (currentUuid) loadThread(currentUuid);
	}, POLL);
})(jQuery);
</script>
