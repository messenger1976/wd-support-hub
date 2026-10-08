/*
 * Message Board — "what's new" popup, shown once on the dashboard right after sign-in.
 * One slide per message. Needs window.MB (messageboard.js), jQuery and Bootstrap 4.
 */
(function ($, window) {
	'use strict';

	var MB = window.MB;
	if (!MB || !$ || !$.fn.modal || !$.fn.carousel) {
		return;
	}

	MB.whenReady(function (data) {
		var list = ((data && data.messages) || []).filter(function (m) { return m.in_popup; });
		if (list.length) {
			setTimeout(function () { open(list); }, 500);
		}
	});

	function slideHtml(m, i) {
		var esc = MB.esc;
		var cat = MB.category(m);
		var pri = MB.priorityLabel(m);
		return '<div class="carousel-item' + (i === 0 ? ' active' : '') + '">' +
			'<article class="mb-slide" aria-labelledby="mb-slide-title-' + i + '">' +
				'<div class="mb-slide-chips">' +
					'<span class="mb-chip"><i class="fal ' + cat.icon + '"></i>' + esc(cat.label) + '</span>' +
					(pri ? '<span class="mb-chip mb-chip-' + esc(m.priority) + '">' + esc(pri) + '</span>' : '') +
					(m.require_ack ? '<span class="mb-chip"><i class="fal fa-check-double"></i>Please confirm</span>' : '') +
				'</div>' +
				'<h2 class="mb-slide-title" id="mb-slide-title-' + i + '">' + esc(m.title) + '</h2>' +
				'<div class="mb-slide-meta">' + esc(MB.dateLine(m)) + '</div>' +
				'<div class="mb-body">' + MB.bodyHtml(m) + '</div>' +
			'</article>' +
		'</div>';
	}

	function open(list) {
		var n = list.length;
		var cur = 0;
		var optout = {};
		var viewed = {};
		var hasAck = list.some(function (m) { return m.require_ack && !m.acked; });
		var dots = '';
		if (n > 1) {
			dots = '<div class="mb-dots" role="tablist">' + list.map(function (m, i) {
				return '<button type="button" data-to="' + i + '" aria-label="Announcement ' + (i + 1) + ' of ' + n + '"></button>';
			}).join('') + '</div>';
		}

		var $modal = $(
			'<div class="modal fade mb-popup" id="mb-popup" tabindex="-1" role="dialog" aria-labelledby="mb-popup-title" aria-hidden="true">' +
				'<div class="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-lg" role="document">' +
					'<div class="modal-content">' +
						'<div class="modal-header">' +
							'<h5 class="modal-title" id="mb-popup-title"><i class="fal fa-bullhorn mr-2"></i>' + (n > 1 ? 'What\'s new' : 'Announcement') + '</h5>' +
							'<span class="mb-popup-count"></span>' +
							'<button type="button" class="close mb-popup-x" title="Remind me later" aria-label="Remind me later"><i class="fal fa-times"></i></button>' +
						'</div>' +
						'<div class="modal-body">' +
							'<div id="mb-popup-carousel" class="carousel slide" data-interval="false" data-wrap="false" data-touch="true">' +
								'<div class="carousel-inner">' + list.map(slideHtml).join('') + '</div>' +
							'</div>' +
							dots +
						'</div>' +
						'<div class="modal-footer mb-popup-foot">' +
							'<div class="mb-popup-left">' +
								'<label class="mb-popup-optout"><input type="checkbox" class="mb-popup-optout-input"> Don\'t show this again</label>' +
								'<span class="mb-popup-must"><i class="fal fa-info-circle mr-1"></i>Please confirm you have read this.</span>' +
							'</div>' +
							'<button type="button" class="btn btn-light btn-sm mb-popup-later">Remind me later</button>' +
							'<button type="button" class="btn btn-outline-secondary btn-sm mb-popup-prev"><i class="fal fa-chevron-left mr-1"></i>Back</button>' +
							'<button type="button" class="btn btn-primary btn-sm mb-popup-ack"><i class="fal fa-check mr-1"></i>I have read this</button>' +
							'<button type="button" class="btn btn-primary btn-sm mb-popup-next">Next<i class="fal fa-chevron-right ml-1"></i></button>' +
							'<button type="button" class="btn btn-primary btn-sm mb-popup-done">Got it</button>' +
						'</div>' +
					'</div>' +
				'</div>' +
			'</div>'
		).appendTo(document.body);

		var $carousel = $modal.find('#mb-popup-carousel');
		var $body = $modal.find('.modal-body');

		function pending(i) {
			return !!(list[i].require_ack && !list[i].acked);
		}

		function firstPending() {
			for (var i = 0; i < n; i++) {
				if (pending(i)) {
					return i;
				}
			}
			return -1;
		}

		function toggle(sel, on) {
			$modal.find(sel).toggleClass('d-none', !on);
		}

		function update() {
			var m = list[cur];
			var mustAck = pending(cur);
			var blocked = firstPending() !== -1;
			$modal.find('.modal-header').attr('class', 'modal-header mb-p-' + m.priority);
			$modal.find('.mb-popup-count').text(n > 1 ? (cur + 1) + ' of ' + n : '');
			toggle('.mb-popup-optout', !!m.allow_opt_out && !m.require_ack);
			$modal.find('.mb-popup-optout-input').prop('checked', !!optout[cur]);
			toggle('.mb-popup-must', mustAck);
			toggle('.mb-popup-x', !blocked);
			toggle('.mb-popup-later', !blocked && cur < n - 1);
			toggle('.mb-popup-prev', cur > 0);
			toggle('.mb-popup-ack', mustAck);
			toggle('.mb-popup-next', !mustAck && cur < n - 1);
			toggle('.mb-popup-done', !mustAck && cur === n - 1);
			$modal.find('.mb-dots button').each(function (i) {
				$(this).toggleClass('active', i === cur).attr('aria-selected', i === cur ? 'true' : 'false');
			});
			if (!viewed[cur]) {
				viewed[cur] = true;
				MB.event(m, 'view');
			}
		}

		$carousel.carousel({ interval: false, wrap: false, touch: true, keyboard: true });
		$carousel.on('slide.bs.carousel', function (e) {
			if (e.to > cur && pending(cur)) {
				e.preventDefault();
			}
		});
		$carousel.on('slid.bs.carousel', function (e) {
			cur = e.to;
			$body.scrollTop(0);
			update();
		});

		$modal.on('click', '.mb-popup-next', function () { $carousel.carousel('next'); });
		$modal.on('click', '.mb-popup-prev', function () { $carousel.carousel('prev'); });
		$modal.on('click', '.mb-dots button', function () {
			$carousel.carousel(parseInt($(this).attr('data-to'), 10));
		});
		$modal.on('change', '.mb-popup-optout-input', function () {
			optout[cur] = this.checked;
		});
		$modal.on('click', '.mb-popup-ack', function () {
			MB.event(list[cur], 'ack');
			if (cur < n - 1) {
				$carousel.carousel('next');
			} else {
				update();
				$modal.find('.mb-popup-done').trigger('focus');
			}
		});
		$modal.on('click', '.mb-popup-x, .mb-popup-later, .mb-popup-done', function () {
			$modal.modal('hide');
		});

		// Required messages cannot be dismissed until each one is confirmed.
		$modal.on('hide.bs.modal', function (e) {
			var p = firstPending();
			if (p !== -1) {
				e.preventDefault();
				if (p !== cur) {
					$carousel.carousel(p);
				}
			}
		});
		$modal.on('hidden.bs.modal', function () {
			Object.keys(optout).forEach(function (i) {
				if (optout[i] && list[i].allow_opt_out) {
					MB.event(list[i], 'optout');
				}
			});
			$modal.remove();
		});
		$modal.on('shown.bs.modal', function () {
			$modal.find('.mb-popup-ack:visible, .mb-popup-next:visible, .mb-popup-done:visible').first().trigger('focus');
		});

		update();
		$modal.modal({ backdrop: hasAck ? 'static' : true, keyboard: !hasAck, show: true });
	}
})(window.jQuery, window);
