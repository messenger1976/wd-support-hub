/*
 * Message Board — shared feed, floating ticker and message viewer for the WD app.
 * Loaded on every admin page by admin-includes/messageboard_ticker.php (needs window.MB_CONFIG).
 * The dashboard popup (messageboard-popup.js) and the Announcements page build on window.MB.
 */
(function (window, document) {
	'use strict';

	var C = window.MB_CONFIG;
	if (!C || window.MB) {
		return;
	}

	var CATEGORY = {
		announcement: { label: 'Announcement', icon: 'fa-bullhorn' },
		update: { label: 'Update', icon: 'fa-rocket' },
		maintenance: { label: 'Maintenance', icon: 'fa-tools' },
		guide: { label: 'How-to guide', icon: 'fa-book-open' },
		tip: { label: 'Tip', icon: 'fa-lightbulb' }
	};
	var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	var RELOAD_MS = 5 * 60 * 1000;
	var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

	function store(key, value) {
		try {
			if (value === undefined) {
				return window.localStorage.getItem(key);
			}
			if (value === null) {
				window.localStorage.removeItem(key);
			} else {
				window.localStorage.setItem(key, value);
			}
		} catch (e) { /* private mode */ }
		return null;
	}

	function esc(s) {
		return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
			return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
		});
	}

	function clamp(n, min, max) {
		return Math.max(min, Math.min(n, Math.max(min, max)));
	}

	function request(method, url, data) {
		return new Promise(function (resolve, reject) {
			var xhr = new XMLHttpRequest();
			var body = null;
			xhr.open(method, url, true);
			xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
			xhr.setRequestHeader('Accept', 'application/json');
			if (data) {
				xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
				body = Object.keys(data).map(function (k) {
					return encodeURIComponent(k) + '=' + encodeURIComponent(data[k]);
				}).join('&');
			}
			xhr.onload = function () {
				var json = null;
				try { json = JSON.parse(xhr.responseText); } catch (e) { /* not JSON */ }
				if (json && json.ok) {
					resolve(json);
				} else {
					reject(json || { error: 'HTTP ' + xhr.status });
				}
			};
			xhr.onerror = function () { reject({ error: 'Network error' }); };
			xhr.send(body);
		});
	}

	/** "2026-10-08 14:30:00" → Date (wall-clock time of the WD). */
	function parseDb(s) {
		var p = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/);
		return p ? new Date(+p[1], +p[2] - 1, +p[3], +p[4], +p[5]) : null;
	}

	function fmtDate(s, withYear) {
		var d = parseDb(s);
		if (!d) {
			return '';
		}
		var h = d.getHours(), m = d.getMinutes();
		var time = ((h % 12) || 12) + ':' + (m < 10 ? '0' : '') + m + (h < 12 ? ' AM' : ' PM');
		return MONTHS[d.getMonth()] + ' ' + d.getDate() + (withYear === false ? '' : ', ' + d.getFullYear()) + ', ' + time;
	}

	function category(m) {
		return CATEGORY[m.category] || CATEGORY.announcement;
	}

	function priorityLabel(m) {
		return m.priority === 'critical' ? 'Critical' : (m.priority === 'important' ? 'Important' : '');
	}

	/* ------------------------------------------------------------------ shared feed */

	var MB = {
		config: C,
		data: null,
		ready: false,
		_listeners: [],
		_readyCbs: [],
		category: category,
		priorityLabel: priorityLabel,
		fmtDate: fmtDate,
		esc: esc
	};

	MB.onUpdate = function (fn) {
		MB._listeners.push(fn);
		if (MB.data) {
			fn(MB.data);
		}
	};

	/** Runs once the feed is final for this page load (after the hub refresh, or after it failed). */
	MB.whenReady = function (fn) {
		if (MB.ready) {
			fn(MB.data);
		} else {
			MB._readyCbs.push(fn);
		}
	};

	MB._emit = function () {
		MB._listeners.forEach(function (fn) {
			try { fn(MB.data); } catch (e) { if (window.console) { console.error(e); } }
		});
	};

	MB._set = function (data) {
		MB.data = data;
		MB._emit();
	};

	MB._done = function () {
		if (MB.ready) {
			return;
		}
		MB.ready = true;
		var cbs = MB._readyCbs;
		MB._readyCbs = [];
		cbs.forEach(function (fn) { fn(MB.data); });
	};

	/** Render from the local cache first, then let the server refresh from the hub if the cache is old. */
	MB.load = function () {
		return request('GET', C.feed + '?_=' + Date.now()).then(function (data) {
			MB._set(data);
			if (!data.enabled || !data.stale) {
				return null;
			}
			return request('POST', C.refresh, { go: 1 }).then(MB._set);
		}).catch(function () { /* keep whatever is on screen */ }).then(MB._done);
	};

	MB.find = function (uuid) {
		var list = (MB.data && MB.data.messages) || [];
		for (var i = 0; i < list.length; i++) {
			if (list[i].uuid === uuid) {
				return list[i];
			}
		}
		return null;
	};

	/** view | ack | optout | optin. Updates the local copy at once; the server queues it for the hub. */
	MB.event = function (m, event) {
		if (event === 'view') {
			m.seen = true;
		} else if (event === 'ack') {
			m.acked = true;
			m.seen = true;
			m.in_popup = false;
		} else if (event === 'optout') {
			m.opted_out = true;
			m.in_popup = false;
		} else if (event === 'optin') {
			m.opted_out = false;
		}
		if (MB.data && MB.data.messages) {
			MB.data.unread = MB.data.messages.filter(function (x) { return x.live && !x.seen; }).length;
			MB._emit();
		}
		return request('POST', C.event, { uuid: m.uuid, event: event, version: m.version }).catch(function () { return null; });
	};

	MB.dateLine = function (m) {
		var line = 'Posted ' + fmtDate(m.starts_at);
		if (m.ends_at) {
			line += (m.live === false ? ' · ended ' : ' · until ') + fmtDate(m.ends_at);
		}
		return line;
	};

	MB.bodyHtml = function (m) {
		return m.body_html && m.body_html.replace(/<[^>]*>|&nbsp;|\s/g, '') !== '' || /<(img|iframe)/i.test(m.body_html || '')
			? m.body_html
			: '<p>' + esc(m.ticker_text || m.title) + '</p>';
	};

	/* ------------------------------------------------------------------ viewer */

	var viewer = null;

	function closeViewer() {
		if (!viewer) {
			return;
		}
		document.removeEventListener('keydown', viewer.onKey);
		viewer.node.parentNode.removeChild(viewer.node);
		document.body.classList.remove('mb-noscroll');
		if (viewer.returnFocus && viewer.returnFocus.focus) {
			viewer.returnFocus.focus();
		}
		viewer = null;
	}

	/** Full message in a light dialog (from the ticker). Independent of Bootstrap so it works on every page. */
	MB.openViewer = function (m) {
		closeViewer();
		var cat = category(m);
		var pri = priorityLabel(m);
		var needsAck = m.require_ack && !m.acked;
		var node = document.createElement('div');
		node.className = 'mb-viewer';
		node.setAttribute('role', 'dialog');
		node.setAttribute('aria-modal', 'true');
		node.setAttribute('aria-labelledby', 'mb-viewer-title');
		node.innerHTML =
			'<div class="mb-viewer-card">' +
				'<div class="mb-viewer-head mb-p-' + esc(m.priority) + '">' +
					'<span class="mb-chip"><i class="fal ' + cat.icon + '"></i>' + esc(cat.label) + '</span>' +
					(pri ? '<span class="mb-chip mb-chip-strong">' + esc(pri) + '</span>' : '') +
					'<button type="button" class="mb-viewer-x" aria-label="Close"><i class="fal fa-times"></i></button>' +
				'</div>' +
				'<div class="mb-viewer-scroll">' +
					'<h2 class="mb-viewer-title" id="mb-viewer-title">' + esc(m.title) + '</h2>' +
					'<div class="mb-viewer-meta">' + esc(MB.dateLine(m)) + '</div>' +
					'<div class="mb-body">' + MB.bodyHtml(m) + '</div>' +
				'</div>' +
				'<div class="mb-viewer-foot">' +
					'<a class="mb-viewer-link" href="' + esc(C.page + '?m=' + encodeURIComponent(m.uuid)) + '"><i class="fal fa-list-ul mr-1"></i>All announcements</a>' +
					(needsAck
						? '<button type="button" class="btn btn-primary btn-sm mb-viewer-ack"><i class="fal fa-check mr-1"></i>I have read this</button>'
						: '<button type="button" class="btn btn-primary btn-sm mb-viewer-close">Close</button>') +
				'</div>' +
			'</div>';

		viewer = { node: node, returnFocus: document.activeElement };
		viewer.onKey = function (e) {
			if (e.key === 'Escape' || e.keyCode === 27) {
				closeViewer();
			}
		};
		node.addEventListener('click', function (e) {
			var t = e.target;
			if (t === node || t.closest('.mb-viewer-x') || t.closest('.mb-viewer-close')) {
				closeViewer();
			} else if (t.closest('.mb-viewer-ack')) {
				MB.event(m, 'ack');
				closeViewer();
			}
		});
		document.addEventListener('keydown', viewer.onKey);
		document.body.appendChild(node);
		document.body.classList.add('mb-noscroll');
		var focus = node.querySelector('.mb-viewer-ack, .mb-viewer-close');
		if (focus) {
			focus.focus();
		}
		MB.event(m, 'view');
	};

	/* ------------------------------------------------------------------ dragging */

	function rectOf(node) {
		return node.getBoundingClientRect();
	}

	/** Keeps a fixed element on screen, at its saved spot (stored as screen ratios) or its docked spot. */
	function Placer(node, storeKey, dock) {
		this.node = node;
		this.key = storeKey;
		this.dock = dock;
	}

	Placer.prototype.saved = function () {
		try {
			var p = JSON.parse(store(this.key) || 'null');
			return p && typeof p.rx === 'number' && typeof p.ry === 'number' ? p : null;
		} catch (e) {
			return null;
		}
	};

	Placer.prototype.apply = function () {
		var node = this.node;
		if (node.hidden) {
			return;
		}
		var w = node.offsetWidth, h = node.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
		var saved = this.saved();
		var pos = saved ? { left: saved.rx * vw, top: saved.ry * vh } : this.dock(w, h);
		this.moveTo(pos.left, pos.top);
	};

	Placer.prototype.moveTo = function (left, top) {
		var w = this.node.offsetWidth, h = this.node.offsetHeight;
		this.node.style.left = Math.round(clamp(left, 4, window.innerWidth - w - 4)) + 'px';
		this.node.style.top = Math.round(clamp(top, 4, window.innerHeight - h - 4)) + 'px';
	};

	Placer.prototype.save = function () {
		var r = rectOf(this.node);
		store(this.key, JSON.stringify({ rx: r.left / window.innerWidth, ry: r.top / window.innerHeight }));
	};

	Placer.prototype.reset = function () {
		store(this.key, null);
		this.apply();
	};

	/** Pointer-drag `placer.node` by `handle`. A press that does not move stays a normal click. */
	function draggable(placer, handle, onMoved) {
		var start = null;
		handle.addEventListener('pointerdown', function (e) {
			if (e.button !== undefined && e.button !== 0) {
				return;
			}
			var r = rectOf(placer.node);
			start = { x: e.clientX, y: e.clientY, left: r.left, top: r.top, moved: false };
			try { handle.setPointerCapture(e.pointerId); } catch (x) { /* old browsers */ }
		});
		handle.addEventListener('pointermove', function (e) {
			if (!start) {
				return;
			}
			var dx = e.clientX - start.x, dy = e.clientY - start.y;
			if (!start.moved && Math.abs(dx) + Math.abs(dy) < 6) {
				return;
			}
			start.moved = true;
			placer.node.classList.add('mb-dragging');
			placer.moveTo(start.left + dx, start.top + dy);
			e.preventDefault();
		});
		function end() {
			if (!start) {
				return;
			}
			var moved = start.moved;
			start = null;
			placer.node.classList.remove('mb-dragging');
			if (moved) {
				placer.save();
				handle.mbJustDragged = true;
				setTimeout(function () { handle.mbJustDragged = false; }, 0);
				if (onMoved) {
					onMoved();
				}
			}
		}
		handle.addEventListener('pointerup', end);
		handle.addEventListener('pointercancel', end);
	}

	/* ------------------------------------------------------------------ ticker */

	var T = { root: null, bubble: null, list: [], i: 0, timer: null, anim: null, paused: false, sig: '' };
	var minKey = 'mb:min:' + C.userKey;

	function headerRect() {
		var h = document.querySelector('.page-header');
		return h ? h.getBoundingClientRect() : null;
	}

	function isMobile() {
		return window.innerWidth < 992;
	}

	/** Desktop: centred inside the header bar. Phones and tablets: just below the header. */
	function dockTicker(w, h) {
		var r = headerRect(), vw = window.innerWidth;
		if (!r || r.bottom <= 0) {
			return { left: (vw - w) / 2, top: 8 };
		}
		if (isMobile()) {
			return { left: (vw - w) / 2, top: r.bottom + 6 };
		}
		return { left: r.left + (r.width - w) / 2, top: r.top + (r.height - h) / 2 };
	}

	function dockBubble(w) {
		var r = headerRect();
		return { left: window.innerWidth - w - 16, top: (r && r.bottom > 0 ? r.bottom : 0) + 10 };
	}

	function buildTicker() {
		var root = document.createElement('div');
		root.className = 'mb-ticker';
		root.hidden = true;
		root.setAttribute('role', 'region');
		root.setAttribute('aria-label', 'Announcements');
		root.innerHTML =
			'<button type="button" class="mb-grip" title="Drag to move · double-click to put it back" aria-label="Move the announcement bar"><i class="fal fa-grip-vertical"></i></button>' +
			'<span class="mb-icon" aria-hidden="true"><i class="fal fa-bullhorn"></i></span>' +
			'<div class="mb-viewport"><button type="button" class="mb-text"></button></div>' +
			'<span class="mb-count" aria-hidden="true"></span>' +
			'<button type="button" class="mb-btn mb-prev" aria-label="Previous announcement"><i class="fal fa-chevron-left"></i></button>' +
			'<button type="button" class="mb-btn mb-next" aria-label="Next announcement"><i class="fal fa-chevron-right"></i></button>' +
			'<button type="button" class="mb-btn mb-min" title="Minimise" aria-label="Minimise announcements"><i class="fal fa-minus"></i></button>';

		var bubble = document.createElement('button');
		bubble.type = 'button';
		bubble.className = 'mb-bubble';
		bubble.hidden = true;
		bubble.title = 'Announcements';
		bubble.setAttribute('aria-label', 'Show announcements');
		bubble.innerHTML = '<i class="fal fa-bullhorn"></i><span class="mb-bubble-badge"></span>';

		document.body.appendChild(root);
		document.body.appendChild(bubble);

		T.root = root;
		T.bubble = bubble;
		T.viewport = root.querySelector('.mb-viewport');
		T.text = root.querySelector('.mb-text');
		T.icon = root.querySelector('.mb-icon i');
		T.count = root.querySelector('.mb-count');
		T.place = new Placer(root, 'mb:pos:' + C.userKey, dockTicker);
		T.bubblePlace = new Placer(bubble, 'mb:bubble:' + C.userKey, dockBubble);

		var grip = root.querySelector('.mb-grip');
		draggable(T.place, grip, syncDockedClass);
		draggable(T.bubblePlace, bubble);
		grip.addEventListener('dblclick', function () {
			T.place.reset();
			syncDockedClass();
		});

		T.text.addEventListener('click', function () {
			var m = T.list[T.i];
			if (m) {
				MB.openViewer(m);
			}
		});
		root.querySelector('.mb-prev').addEventListener('click', function () { show(T.i - 1, -1); });
		root.querySelector('.mb-next').addEventListener('click', function () { show(T.i + 1, 1); });
		root.querySelector('.mb-min').addEventListener('click', function () { setMinimised(true, true); });
		bubble.addEventListener('click', function () {
			if (!bubble.mbJustDragged) {
				setMinimised(false, true);
			}
		});

		root.addEventListener('mouseenter', pause);
		root.addEventListener('mouseleave', resume);
		root.addEventListener('focusin', pause);
		root.addEventListener('focusout', resume);
		var touchTimer = null;
		root.addEventListener('touchstart', function () {
			clearTimeout(touchTimer);
			pause();
		}, { passive: true });
		root.addEventListener('touchend', function () {
			touchTimer = setTimeout(resume, 4000);
		}, { passive: true });

		var raf = null;
		window.addEventListener('resize', function () {
			if (raf) {
				return;
			}
			raf = window.requestAnimationFrame(function () {
				raf = null;
				T.place.apply();
				T.bubblePlace.apply();
				syncDockedClass();
				if (!T.root.hidden && T.list.length) {
					show(T.i, 0);
				}
			});
		});
	}

	/** While docked below the header on a phone, push the page down so the bar never covers the title. */
	function syncDockedClass() {
		var docked = !T.root.hidden && isMobile() && !T.place.saved();
		document.body.classList.toggle('mb-docked-below', docked);
	}

	function setMinimised(min, remember) {
		if (remember) {
			store(minKey, min ? '1' : null);
		}
		T.root.hidden = min;
		T.bubble.hidden = !min;
		if (min) {
			stop();
			T.bubblePlace.apply();
		} else {
			T.place.apply();
			show(T.i, 0);
		}
		syncDockedClass();
	}

	function stop() {
		clearTimeout(T.timer);
		T.timer = null;
		if (T.anim) {
			T.anim.onfinish = null;
			T.anim.cancel();
			T.anim = null;
		}
	}

	function pause() {
		T.paused = true;
		clearTimeout(T.timer);
		if (T.anim) {
			T.anim.pause();
		}
	}

	function resume() {
		if (!T.paused) {
			return;
		}
		T.paused = false;
		if (T.anim) {
			T.anim.play();
		} else if (T.list.length > 1) {
			T.timer = setTimeout(function () { show(T.i + 1, 1); }, 3000);
		}
	}

	function show(i, dir) {
		stop();
		if (!T.list.length) {
			return;
		}
		T.i = (i + T.list.length) % T.list.length;
		var m = T.list[T.i];
		var multi = T.list.length > 1;
		T.root.className = 'mb-ticker mb-p-' + m.priority + (multi ? ' mb-multi' : '') + (m.seen ? '' : ' mb-unseen');
		T.icon.className = 'fal ' + category(m).icon;
		T.text.textContent = m.ticker_text || m.title;
		T.text.title = m.title + ' — tap to read';
		T.text.setAttribute('aria-label', (priorityLabel(m) ? priorityLabel(m) + ': ' : '') + m.title + '. Open announcement.');
		T.count.textContent = (T.i + 1) + '/' + T.list.length;
		if (dir && !reduceMotion) {
			T.text.classList.remove('mb-in');
			void T.text.offsetWidth;
			T.text.classList.add('mb-in');
		}
		if (!T.root.hidden) {
			schedule();
		}
	}

	/** Long lines scroll once, then the next message slides in; short lines wait a few seconds. */
	function schedule() {
		if (T.paused) {
			return;
		}
		var over = T.text.offsetWidth - T.viewport.clientWidth;
		if (over > 4 && !reduceMotion && T.text.animate) {
			var distance = over + 16;
			T.anim = T.text.animate(
				[{ transform: 'translateX(0)' }, { transform: 'translateX(' + (-distance) + 'px)' }],
				{ duration: Math.max(3000, distance * 28), delay: 1800, endDelay: 1600, easing: 'linear', fill: 'forwards' }
			);
			T.anim.onfinish = function () {
				T.anim.cancel();
				T.anim = null;
				if (T.list.length > 1) {
					show(T.i + 1, 1);
				} else {
					schedule();
				}
			};
		} else if (T.list.length > 1) {
			T.timer = setTimeout(function () { show(T.i + 1, 1); }, 6000);
		}
	}

	function updateBadges(data) {
		var unread = (data && data.unread) || 0;
		var nodes = document.querySelectorAll('.js-mb-nav-badge');
		for (var i = 0; i < nodes.length; i++) {
			nodes[i].textContent = unread > 99 ? '99+' : String(unread);
			nodes[i].classList.toggle('d-none', unread === 0);
		}
		if (T.bubble) {
			T.bubble.querySelector('.mb-bubble-badge').textContent = unread ? (unread > 9 ? '9+' : String(unread)) : '';
		}
	}

	function onData(data) {
		updateBadges(data);
		var list = ((data && data.messages) || []).filter(function (m) { return m.in_ticker; });
		var sig = list.map(function (m) { return m.uuid + ':' + m.version; }).join('|');
		if (sig === T.sig) {
			var cur = T.list[T.i];
			if (T.root && cur) {
				T.root.classList.toggle('mb-unseen', !cur.seen);
			}
			return;
		}
		T.sig = sig;
		T.list = list;
		if (!T.root) {
			if (!list.length) {
				return;
			}
			buildTicker();
			updateBadges(data);
		}
		if (!list.length) {
			stop();
			T.root.hidden = true;
			T.bubble.hidden = true;
			syncDockedClass();
			return;
		}
		T.bubble.className = 'mb-bubble mb-p-' + list[0].priority;
		var urgent = list.some(function (m) { return m.priority === 'critical' && !m.seen; });
		T.i = 0;
		setMinimised(store(minKey) === '1' && !urgent, false);
	}

	MB.onUpdate(onData);
	window.MB = MB;

	MB.load();
	setInterval(function () {
		if (!document.hidden) {
			MB.load();
		}
	}, RELOAD_MS);
})(window, document);
