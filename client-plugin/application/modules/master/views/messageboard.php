<?php
$mb_h = function ($s) {
	return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
};
$mb_categories = array(
	'announcement' => array('Announcements', 'Announcement', 'fa-bullhorn'),
	'update' => array('Updates', 'Update', 'fa-rocket'),
	'maintenance' => array('Maintenance', 'Maintenance', 'fa-tools'),
	'guide' => array('How-to guides', 'How-to guide', 'fa-book-open'),
	'tip' => array('Tips', 'Tip', 'fa-lightbulb')
);
$mb_date = function ($s) {
	$t = strtotime((string) $s);
	return $t ? date('M j, Y, g:i A', $t) : '';
};
$mb_used = array();
$mb_ended = 0;
foreach ($messages as $m) {
	$mb_used[$m['category']] = TRUE;
	if ( ! $m['live']) {
		$mb_ended++;
	}
}
?>
<main id="js-page-content" role="main" class="page-content mb-page">
	<ol class="breadcrumb page-breadcrumb d-none d-sm-flex">
		<li class="breadcrumb-item"><a href="<?php echo ADMIN_URL; ?>">Home</a></li>
		<li class="breadcrumb-item active">Announcements</li>
		<li class="position-absolute pos-top pos-right d-none d-sm-block"><span class="js-get-date"></span></li>
	</ol>
	<div class="subheader">
		<h1 class="subheader-title">
			<i class="subheader-icon fal fa-bullhorn"></i> Announcements &amp; Guides
			<small>Updates, maintenance notices and how-to guides from your system provider</small>
		</h1>
	</div>

	<?php if ( ! $enabled) { ?>
		<div class="alert alert-info"><i class="fal fa-info-circle mr-1"></i> The Message Board is not set up on this system yet.</div>
	<?php } else { ?>
		<?php if ($sync_error !== '') { ?>
			<div class="alert alert-warning py-2 fs-sm">
				<i class="fal fa-wifi-slash mr-1"></i> Could not reach the support hub just now, so you are seeing the announcements saved on this system<?php echo $last_success_at ? ' (last updated '.$mb_h($mb_date($last_success_at)).')' : ''; ?>.
			</div>
		<?php } ?>

		<div class="mb-filters">
			<div class="input-group input-group-sm mb-search">
				<div class="input-group-prepend"><span class="input-group-text"><i class="fal fa-search"></i></span></div>
				<input type="search" class="form-control" id="mb-q" placeholder="Search announcements and guides" aria-label="Search announcements and guides">
			</div>
			<div class="mb-cats" role="group" aria-label="Filter by type">
				<button type="button" class="btn btn-sm btn-primary" data-cat="">All</button>
				<?php foreach ($mb_categories as $key => $c) { if (empty($mb_used[$key])) continue; ?>
					<button type="button" class="btn btn-sm btn-outline-secondary" data-cat="<?php echo $key; ?>"><i class="fal <?php echo $c[2]; ?> mr-1"></i><?php echo $c[0]; ?></button>
				<?php } ?>
			</div>
			<?php if ($mb_ended) { ?>
				<div class="custom-control custom-switch ml-sm-auto">
					<input type="checkbox" class="custom-control-input" id="mb-show-ended">
					<label class="custom-control-label fs-sm" for="mb-show-ended">Show ended (<?php echo $mb_ended; ?>)</label>
				</div>
			<?php } ?>
		</div>

		<div id="mb-list">
			<?php foreach ($messages as $m) {
				$cat = isset($mb_categories[$m['category']]) ? $mb_categories[$m['category']] : $mb_categories['announcement'];
				$needs_ack = $m['require_ack'] && ! $m['acked'];
				$open = $focus !== '' && $focus === $m['uuid'];
				$search = strtolower($m['title'].' '.$m['ticker_text'].' '.strip_tags($m['body_html']));
			?>
				<div class="card mb-item mb-p-<?php echo $mb_h($m['priority']); ?><?php echo $m['live'] ? '' : ' mb-ended'; ?>"
					data-uuid="<?php echo $mb_h($m['uuid']); ?>"
					data-version="<?php echo (int) $m['version']; ?>"
					data-cat="<?php echo $mb_h($m['category']); ?>"
					data-live="<?php echo $m['live'] ? '1' : '0'; ?>"
					data-seen="<?php echo $m['seen'] ? '1' : '0'; ?>"
					data-search="<?php echo $mb_h($search); ?>"<?php echo ( ! $m['live'] && ! $open) ? ' hidden' : ''; ?>>
					<button type="button" class="mb-item-head" aria-expanded="<?php echo $open ? 'true' : 'false'; ?>" aria-controls="mb-body-<?php echo $mb_h($m['uuid']); ?>">
						<span class="mb-item-icon"><i class="fal <?php echo $cat[2]; ?>"></i></span>
						<span class="mb-item-main">
							<span class="mb-item-title"><?php echo $mb_h($m['title']); ?></span>
							<span class="mb-item-meta">
								<span><?php echo $mb_h($cat[1]); ?></span>
								<span><?php echo $mb_h($mb_date($m['starts_at'])); ?></span>
								<?php if ($m['ends_at']) { ?><span><?php echo $m['live'] ? 'Until ' : 'Ended '; ?><?php echo $mb_h($mb_date($m['ends_at'])); ?></span><?php } ?>
							</span>
							<span class="mb-item-badges">
								<?php if ($m['pinned']) { ?><span class="badge badge-secondary"><i class="fal fa-thumbtack mr-1"></i>Pinned</span><?php } ?>
								<?php if ($m['priority'] === 'critical') { ?><span class="badge badge-danger">Critical</span><?php } elseif ($m['priority'] === 'important') { ?><span class="badge badge-warning">Important</span><?php } ?>
								<?php if ($m['live'] && ! $m['seen']) { ?><span class="badge badge-primary mb-new">New</span><?php } ?>
								<?php if ($needs_ack) { ?><span class="badge badge-danger mb-needs-ack">Please confirm</span><?php } elseif ($m['require_ack']) { ?><span class="badge badge-success"><i class="fal fa-check mr-1"></i>Confirmed</span><?php } ?>
								<?php if ( ! $m['live']) { ?><span class="badge badge-light">Ended</span><?php } ?>
							</span>
						</span>
						<i class="fal fa-chevron-down mb-item-caret" aria-hidden="true"></i>
					</button>
					<div class="mb-item-body" id="mb-body-<?php echo $mb_h($m['uuid']); ?>"<?php echo $open ? '' : ' hidden'; ?>>
						<div class="mb-body">
							<?php echo trim(strip_tags($m['body_html'], '<img><iframe>')) !== '' ? $m['body_html'] : '<p>'.$mb_h($m['ticker_text']).'</p>'; ?>
						</div>
						<?php if ($needs_ack || ($m['allow_opt_out'] && $m['live'] && ! $m['require_ack'])) { ?>
							<div class="mb-item-actions">
								<?php if ($needs_ack) { ?>
									<button type="button" class="btn btn-primary btn-sm mb-ack"><i class="fal fa-check mr-1"></i>I have read this</button>
								<?php } ?>
								<?php if ($m['allow_opt_out'] && $m['live'] && ! $m['require_ack']) { ?>
									<div class="custom-control custom-checkbox ml-auto">
										<input type="checkbox" class="custom-control-input mb-optout" id="mb-optout-<?php echo $mb_h($m['uuid']); ?>"<?php echo $m['opted_out'] ? ' checked' : ''; ?>>
										<label class="custom-control-label fs-sm" for="mb-optout-<?php echo $mb_h($m['uuid']); ?>">Don't show this at sign-in</label>
									</div>
								<?php } ?>
							</div>
						<?php } ?>
					</div>
				</div>
			<?php } ?>

			<div class="mb-empty"<?php echo $messages ? ' hidden' : ''; ?> id="mb-empty">
				<i class="fal fa-bullhorn"></i>
				<div class="fw-500"><?php echo $messages ? 'Nothing matches your search.' : 'No announcements yet.'; ?></div>
				<div class="fs-sm">When your system provider posts an update, maintenance notice or guide, it will appear here.</div>
			</div>
		</div>
	<?php } ?>
</main>
<?php include 'footer.php'; ?>
<?php if ($enabled) { ?>
<script>
(function () {
	'use strict';
	var C = window.MB_CONFIG;
	var list = document.getElementById('mb-list');
	if (!list || !C) {
		return;
	}
	var q = document.getElementById('mb-q');
	var ended = document.getElementById('mb-show-ended');
	var empty = document.getElementById('mb-empty');
	var cat = '';
	var viewed = {};

	function post(item, event) {
		var xhr = new XMLHttpRequest();
		xhr.open('POST', C.event, true);
		xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
		xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
		xhr.send('uuid=' + encodeURIComponent(item.getAttribute('data-uuid')) + '&event=' + event + '&version=' + item.getAttribute('data-version'));
	}

	/** Keep the ticker, nav badge and this page in step without reloading. */
	function syncShared(uuid, event) {
		var m = window.MB && window.MB.find(uuid);
		if (m) {
			window.MB.event(m, event);
			return true;
		}
		return false;
	}

	function send(item, event) {
		if (!syncShared(item.getAttribute('data-uuid'), event)) {
			post(item, event);
		}
	}

	function markViewed(item) {
		var uuid = item.getAttribute('data-uuid');
		if (viewed[uuid]) {
			return;
		}
		viewed[uuid] = true;
		send(item, 'view');
		var badge = item.querySelector('.mb-new');
		if (badge) {
			badge.parentNode.removeChild(badge);
		}
	}

	function setOpen(item, open) {
		var head = item.querySelector('.mb-item-head');
		var body = item.querySelector('.mb-item-body');
		head.setAttribute('aria-expanded', open ? 'true' : 'false');
		body.hidden = !open;
		if (open) {
			markViewed(item);
		}
	}

	function filter() {
		var term = (q.value || '').trim().toLowerCase();
		var showEnded = !!(ended && ended.checked);
		var shown = 0;
		Array.prototype.forEach.call(list.querySelectorAll('.mb-item'), function (item) {
			var ok = (!cat || item.getAttribute('data-cat') === cat)
				&& (showEnded || item.getAttribute('data-live') === '1' || item.querySelector('.mb-item-head').getAttribute('aria-expanded') === 'true')
				&& (!term || item.getAttribute('data-search').indexOf(term) !== -1);
			item.hidden = !ok;
			if (ok) {
				shown++;
			}
		});
		empty.hidden = shown > 0;
	}

	list.addEventListener('click', function (e) {
		var item = e.target.closest('.mb-item');
		if (!item) {
			return;
		}
		if (e.target.closest('.mb-item-head')) {
			setOpen(item, item.querySelector('.mb-item-head').getAttribute('aria-expanded') !== 'true');
		} else if (e.target.closest('.mb-ack')) {
			send(item, 'ack');
			var actions = item.querySelector('.mb-item-actions');
			if (actions) {
				actions.innerHTML = '<span class="text-success fs-sm"><i class="fal fa-check-circle mr-1"></i>Thank you — confirmed.</span>';
			}
			var badge = item.querySelector('.mb-needs-ack');
			if (badge) {
				badge.className = 'badge badge-success';
				badge.innerHTML = '<i class="fal fa-check mr-1"></i>Confirmed';
			}
		}
	});
	list.addEventListener('change', function (e) {
		if (e.target.classList.contains('mb-optout')) {
			send(e.target.closest('.mb-item'), e.target.checked ? 'optout' : 'optin');
		}
	});
	q.addEventListener('input', filter);
	if (ended) {
		ended.addEventListener('change', filter);
	}
	Array.prototype.forEach.call(document.querySelectorAll('.mb-cats [data-cat]'), function (btn) {
		btn.addEventListener('click', function () {
			cat = btn.getAttribute('data-cat');
			Array.prototype.forEach.call(document.querySelectorAll('.mb-cats [data-cat]'), function (b) {
				b.className = 'btn btn-sm ' + (b === btn ? 'btn-primary' : 'btn-outline-secondary');
			});
			filter();
		});
	});

	var focused = list.querySelector('.mb-item-head[aria-expanded="true"]');
	if (focused) {
		var item = focused.closest('.mb-item');
		item.hidden = false;
		markViewed(item);
		setTimeout(function () { item.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 200);
	}
})();
</script>
<?php } ?>
