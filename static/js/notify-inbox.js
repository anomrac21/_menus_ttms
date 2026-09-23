/**
 * Guest alerts inbox: recent notifications from this restaurant.
 */
(function () {
  'use strict';

  var HIDDEN = 'notify-inbox-hidden';
  var OPENING = 'is-notify-opening';
  var CLOSING = 'is-notify-closing';
  var CACHE_KEY = 'ttmenus_notify_inbox';
  var SEEN_KEY = 'ttmenus_notify_inbox_seen';
  var OPEN_MS = 420;
  var CLOSE_MS = 280;
  var animTimer = null;

  function getPanel() {
    return document.getElementById('notify-inbox');
  }

  function getHeaderBtn() {
    return (
      document.querySelector('[data-opens="notify-inbox"]') ||
      document.getElementById('headerNotificationBtn') ||
      document.getElementById('subBtnHeader')
    );
  }

  function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function notifyConfig() {
    var cfg = window.NOTIFY_CONFIG;
    if (typeof cfg === 'string') {
      try {
        cfg = JSON.parse(cfg);
      } catch (e) {
        cfg = {};
      }
    }
    if ((!cfg || typeof cfg !== 'object') && window.SiteConfig) {
      cfg = {};
    }
    return cfg && typeof cfg === 'object' ? cfg : {};
  }

  function apiBase() {
    var cfg = notifyConfig();
    if (cfg.apiUrl) return String(cfg.apiUrl).replace(/\/+$/, '');
    var service =
      (window.SiteConfig && window.SiteConfig.notifyServiceUrl) || 'https://notify.ttmenus.com';
    return String(service).replace(/\/+$/, '') + '/api/v1';
  }

  function clientDomain() {
    var cfg = notifyConfig();
    var domain = (cfg.clientDomain || (window.location && window.location.hostname) || '')
      .replace(/^www\./i, '');
    return domain;
  }

  function subscriptionId() {
    if (window.NotificationService && NotificationService.subscriptionId) {
      return NotificationService.subscriptionId;
    }
    try {
      var raw = localStorage.getItem('ttmenus_notification_subscription');
      if (!raw) return '';
      var parsed = JSON.parse(raw);
      return (parsed && parsed.id) || '';
    } catch (e) {
      return '';
    }
  }

  function isSubscribed() {
    return !!subscriptionId();
  }

  function signedIn() {
    try {
      return !!(window.AuthClient && AuthClient.isAuthenticated && AuthClient.isAuthenticated());
    } catch (e) {
      return false;
    }
  }

  function escapeHtml(text) {
    if (text == null) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function readCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      var items = raw ? JSON.parse(raw) : [];
      return Array.isArray(items) ? items : [];
    } catch (e) {
      return [];
    }
  }

  function writeCache(items) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify((items || []).slice(0, 40)));
    } catch (e) {}
  }

  function seenAt() {
    var n = parseInt(localStorage.getItem(SEEN_KEY) || '0', 10);
    return n > 0 ? n : 0;
  }

  function markSeen() {
    try {
      localStorage.setItem(SEEN_KEY, String(Date.now()));
    } catch (e) {}
  }

  function itemTime(item) {
    var value = item && (item.created_at || item.delivered_at || item.sent_at);
    var t = value ? Date.parse(value) : NaN;
    return isNaN(t) ? 0 : t;
  }

  function isWelcome(item) {
    var data = item && item.data;
    return !!(data && (data.welcome === true || data.welcome === 'true'));
  }

  function isPhotoReview(item) {
    if (item && item.type === 'photo_review') return true;
    var data = item && item.data;
    return !!(data && (data.photo_review === true || data.photo_review === 'true'));
  }

  function isGuestVisible(item) {
    if (!item) return false;
    if (isPhotoReview(item)) {
      return !!(window.NotificationService && NotificationService.isCurrentUserAdmin && NotificationService.isCurrentUserAdmin());
    }
    if (isWelcome(item)) return false;
    if (window.NotificationService && NotificationService.shouldDisplayNotification) {
      return !!NotificationService.shouldDisplayNotification(item);
    }
    return !!(item.title || item.message || item.body);
  }

  function normalizeItem(raw) {
    if (!raw) return null;
    var data = raw.data || {};
    return {
      id: raw.id || raw.delivery_id || '',
      title: raw.title || 'Menu alert',
      message: raw.message || raw.body || '',
      type: raw.type || data.action || 'general',
      created_at: raw.created_at || raw.delivered_at || new Date().toISOString(),
      url: raw.url || data.url || data.link || '',
      client_domain: raw.client_domain || data.client_domain || '',
      client_name: raw.client_name || data.restaurant_name || data.client_name || '',
      data: data,
    };
  }

  function orderKeyFromItem(item) {
    var data = (item && item.data) || {};
    var oid = data.order_id || data.delivery_order_id || item.order_id;
    if (oid) return 'order:' + String(oid).toLowerCase();
    var href = String((item && item.url) || '');
    var match = href.match(/[?&#]order=([^&#]+)/i);
    if (match && match[1]) {
      try {
        return 'order:' + decodeURIComponent(match[1]).toLowerCase();
      } catch (e) {
        return 'order:' + match[1].toLowerCase();
      }
    }
    if (data.ticket_number) return 'ticket:' + String(data.ticket_number).toLowerCase();
    return '';
  }

  function groupItems(items) {
    var groups = [];
    var byKey = {};
    (items || []).forEach(function (item) {
      var key = orderKeyFromItem(item) || 'id:' + (item.id || item.title + '|' + item.created_at);
      var group = byKey[key];
      if (!group) {
        group = { key: key, items: [] };
        byKey[key] = group;
        groups.push(group);
      }
      group.items.push(item);
    });
    groups.forEach(function (group) {
      group.items.sort(function (a, b) {
        return itemTime(b) - itemTime(a);
      });
      group.latest = group.items[0];
    });
    groups.sort(function (a, b) {
      return itemTime(b.latest) - itemTime(a.latest);
    });
    return groups;
  }

  function threadPlace(group) {
    var latest = group && group.latest;
    if (!latest) return '';
    var data = latest.data || {};
    return latest.client_name || data.restaurant_name || data.client_name || '';
  }

  function matchesThisVenue(item) {
    if (!item) return true;
    var data = item.data || {};
    if (String(data.role || '').toLowerCase() === 'driver') return false;
    var domain = clientDomain().toLowerCase();
    if (!domain) return true;
    var d = String(item.client_domain || data.client_domain || '')
      .replace(/^www\./i, '')
      .toLowerCase();
    if (!d) return true;
    return d === domain;
  }

  function mergeItems() {
    var byId = {};
    var list = [];
    Array.prototype.forEach.call(arguments, function (group) {
      (group || []).forEach(function (raw) {
        var item = normalizeItem(raw);
        if (!item || !isGuestVisible(item) || !matchesThisVenue(item)) return;
        var key = item.id || item.title + '|' + item.created_at;
        if (byId[key]) return;
        byId[key] = true;
        list.push(item);
      });
    });
    list.sort(function (a, b) {
      return itemTime(b) - itemTime(a);
    });
    return list.slice(0, 30);
  }

  function rememberItem(raw) {
    if (!signedIn()) return;
    var item = normalizeItem(raw);
    if (!item || !isGuestVisible(item)) return;
    var next = mergeItems([item], readCache());
    writeCache(next);
    syncBadge(next);
    if (isOpen()) renderList(next);
  }

  function typeLabel(type) {
    if (type === 'menu_update' || type === 'new_menu') return 'Menu';
    if (type === 'promotion' || type === 'deals') return 'Special';
    if (type === 'order' || type === 'order_ready' || type === 'order_paid' || type === 'delivered')
      return 'Order';
    if (type === 'nearby_client' || type === 'new_near') return 'Nearby';
    if (type === 'system') return 'Update';
    return 'Alert';
  }

  function formatWhen(value) {
    var t = value ? Date.parse(value) : NaN;
    if (isNaN(t)) return '';
    var delta = Date.now() - t;
    if (delta < 60 * 1000) return 'Just now';
    if (delta < 60 * 60 * 1000) return Math.floor(delta / 60000) + 'm ago';
    if (delta < 24 * 60 * 60 * 1000) return Math.floor(delta / 3600000) + 'h ago';
    if (delta < 7 * 24 * 60 * 60 * 1000) return Math.floor(delta / 86400000) + 'd ago';
    try {
      return new Date(t).toLocaleDateString();
    } catch (e) {
      return '';
    }
  }

  function unreadCount(items) {
    var seen = seenAt();
    return (items || []).filter(function (item) {
      return itemTime(item) > seen;
    }).length;
  }

  function syncBadge(items) {
    var badge = document.getElementById('notify-inbox-badge');
    var btn = getHeaderBtn();
    var count = signedIn() ? unreadCount(items || readCache()) : 0;
    if (badge) {
      if (count > 0) {
        badge.hidden = false;
        badge.textContent = count > 9 ? '9+' : String(count);
      } else {
        badge.hidden = true;
        badge.textContent = '';
      }
    }
    if (btn && btn.getAttribute('data-opens') === 'notify-inbox') {
      btn.setAttribute(
        'aria-label',
        count > 0 ? 'Open menu alerts, ' + count + ' new' : 'Open menu alerts'
      );
    }
  }

  function syncSubscribeChrome() {
    var wrap = document.getElementById('notify-inbox-subscribe');
    var btn = document.getElementById('notify-inbox-subscribe-btn');
    var copy = document.getElementById('notify-inbox-subscribe-copy');
    var emptyHint = document.getElementById('notify-inbox-empty-hint');
    var on = isSubscribed();
    if (wrap) wrap.classList.toggle('is-on', on);
    if (btn) btn.textContent = on ? 'Alerts on' : 'Get menu alerts';
    if (copy) {
      copy.textContent = on
        ? 'You get specials, hours, order, and menu updates on this phone.'
        : 'Get specials, hours, order, and menu updates on this phone.';
    }
    if (emptyHint) {
      emptyHint.textContent = on
        ? 'When this restaurant sends specials, menu updates, or order events, they show up here.'
        : 'Turn on alerts, then specials, menu updates, and order events from this restaurant will land here.';
    }
  }

  function setStatus(text) {
    var el = document.getElementById('notify-inbox-status');
    if (!el) return;
    if (!text) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.textContent = text;
  }

  function bindCardClick(node, item) {
    if (!node || !item) return;
    node.addEventListener('click', function () {
      if (
        item.id &&
        window.NotificationService &&
        typeof NotificationService.trackNotificationClick === 'function'
      ) {
        NotificationService.trackNotificationClick(item.id);
      }
      if (typeof window.closeNotifyInbox === 'function') {
        window.closeNotifyInbox({ instant: !item.url });
      }
    });
  }

  function roleLabel(item) {
    var role = String(((item && item.data) || {}).role || '').toLowerCase();
    if (role === 'driver') return 'Driver';
    if (role === 'client') return 'Restaurant';
    if (role === 'customer') return 'You';
    var href = String((item && item.url) || '');
    if (/\/drive\//i.test(href)) return 'Driver';
    if (/dashboard/i.test(href)) return 'Restaurant';
    if (/\/delivery\/track|#cart/i.test(href)) return 'You';
    return '';
  }

  var BELL_ICON =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" fill="currentColor"></path></svg>';

  function iosCardInner(item, place, step) {
    var app = place || item.client_name || 'TTMenus';
    var role = roleLabel(item);
    var badge = step
      ? '<span class="notify-ios__step" aria-hidden="true">' + escapeHtml(String(step)) + '</span>'
      : '<span class="notify-ios__icon" aria-hidden="true">' + BELL_ICON + '</span>';
    return (
      '<span class="notify-ios__meta">' +
      badge +
      '<span class="notify-ios__app">' +
      escapeHtml(app) +
      '</span>' +
      (role ? '<span class="notify-ios__role">' + escapeHtml(role) + '</span>' : '') +
      '<span class="notify-ios__time">' +
      escapeHtml(formatWhen(item.created_at)) +
      '</span>' +
      '</span>' +
      '<strong class="notify-ios__title">' +
      escapeHtml(item.title) +
      '</strong>' +
      (item.message
        ? '<span class="notify-ios__body">' + escapeHtml(item.message) + '</span>'
        : '')
    );
  }

  function iosLinkMarkup(item, unread, place, step) {
    var href = item.url || '';
    var tag = href ? 'a' : 'button';
    return (
      '<' +
      tag +
      ' class="notify-ios' +
      (unread ? ' is-unread' : '') +
      '"' +
      (href ? ' href="' + escapeHtml(href) + '"' : ' type="button"') +
      ' data-notify-id="' +
      escapeHtml(item.id) +
      '">' +
      iosCardInner(item, place, step) +
      '</' +
      tag +
      '>'
    );
  }

  function bindStack(root) {
    var front = root.querySelector('.notify-stack__front');
    var sheet = root.querySelector('.notify-stack__sheet');
    var collapse = root.querySelector('.notify-stack__collapse');
    if (!front || !sheet) return;
    function setOpen(open) {
      root.classList.toggle('is-open', open);
      front.setAttribute('aria-expanded', open ? 'true' : 'false');
      sheet.setAttribute('aria-hidden', open ? 'false' : 'true');
    }
    front.addEventListener('click', function () {
      setOpen(true);
    });
    if (collapse) {
      collapse.addEventListener('click', function () {
        setOpen(false);
      });
    }
  }

  function renderList(items) {
    var list = document.getElementById('notify-inbox-list');
    var empty = document.getElementById('notify-inbox-empty');
    if (!list) return;
    list.innerHTML = '';
    if (!items || !items.length) {
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    var seen = seenAt();
    groupItems(items).forEach(function (group, index) {
      var latest = group.latest;
      var li = document.createElement('li');
      li.style.setProperty('--i', String(index));
      var unread = group.items.some(function (item) {
        return itemTime(item) > seen;
      });
      var place = threadPlace(group);
      if (group.items.length < 2) {
        li.className = 'notify-inbox-item';
        li.innerHTML = iosLinkMarkup(latest, unread, place);
        bindCardClick(li.firstElementChild, latest);
        list.appendChild(li);
        return;
      }
      var flow = group.items.slice().reverse();
      li.className = 'notify-inbox-item notify-inbox-item--stack';
      li.innerHTML =
        '<article class="notify-stack' +
        (unread ? ' is-unread' : '') +
        '">' +
        '<div class="notify-stack__pile">' +
        '<div class="notify-stack__peeks" aria-hidden="true">' +
        '<span class="notify-stack__peek notify-stack__peek--2"></span>' +
        '<span class="notify-stack__peek notify-stack__peek--1"></span>' +
        '</div>' +
        '<button type="button" class="notify-stack__front notify-ios" aria-expanded="false">' +
        iosCardInner(latest, place) +
        '<span class="notify-stack__hint">' +
        escapeHtml(String(group.items.length) + ' notifications · tap to see the flow') +
        '</span>' +
        '</button>' +
        '</div>' +
        '<div class="notify-stack__sheet" aria-hidden="true">' +
        '<p class="notify-stack__sheet-label">How this order progressed</p>' +
        '<ol class="notify-stack__flow">' +
        flow
          .map(function (item, idx) {
            return (
              '<li data-step="' +
              escapeHtml(String(idx + 1)) +
              '" style="--i:' +
              escapeHtml(String(idx)) +
              '">' +
              iosLinkMarkup(item, itemTime(item) > seen, place, idx + 1) +
              '</li>'
            );
          })
          .join('') +
        '</ol>' +
        '<button type="button" class="notify-stack__collapse">Show less</button>' +
        '</div>' +
        '</article>';
      bindStack(li.querySelector('.notify-stack'));
      Array.prototype.forEach.call(li.querySelectorAll('.notify-stack__flow .notify-ios'), function (node, idx) {
        bindCardClick(node, flow[idx]);
      });
      list.appendChild(li);
    });
  }

  async function fetchJson(url, headers) {
    var res = await fetch(url, { headers: headers || { Accept: 'application/json' } });
    if (!res.ok) throw new Error(String(res.status));
    return res.json();
  }

  function authHeaders() {
    var headers = { Accept: 'application/json' };
    try {
      var token = window.AuthClient && AuthClient.getAccessToken ? AuthClient.getAccessToken() : '';
      if (token) headers.Authorization = 'Bearer ' + token;
    } catch (e) {}
    return headers;
  }

  async function waitForAuth() {
    try {
      if (window.AuthClient && AuthClient.whenReady) {
        await AuthClient.whenReady();
      }
    } catch (e) {}
    try {
      if (window.AuthClient && AuthClient.ensureAccessToken) {
        await AuthClient.ensureAccessToken();
      }
    } catch (eToken) {}
  }

  async function loadInbox() {
    syncSubscribeChrome();
    await waitForAuth();
    if (!signedIn()) {
      setStatus('');
      renderList([]);
      syncBadge([]);
      return;
    }
    setStatus('Loading alerts…');
    var cached = readCache();
    renderList(cached);

    var remote = [];
    var errors = [];
    var subId = subscriptionId();
    var base = apiBase();

    if (signedIn()) {
      try {
        var mine = await fetchJson(base + '/me/notifications?limit=30', authHeaders());
        remote = remote.concat((mine && mine.notifications) || []);
      } catch (eMe) {
        errors.push('Could not load account alerts');
      }
    }

    if (subId) {
      try {
        var feed = await fetchJson(
          base + '/subscriptions/' + encodeURIComponent(subId) + '/notifications?limit=30'
        );
        remote = remote.concat((feed && feed.notifications) || []);
      } catch (eFeed) {
        errors.push('Could not load device alerts');
      }
    }

    var merged = mergeItems(remote, cached);
    writeCache(merged);
    setStatus(merged.length ? '' : errors[0] || '');
    renderList(merged);
    syncBadge(merged);
  }

  function isHidden(panel) {
    return (
      !panel ||
      (panel.classList.contains(HIDDEN) &&
        !panel.classList.contains(OPENING) &&
        !panel.classList.contains(CLOSING))
    );
  }

  function isOpen() {
    var panel = getPanel();
    return panel && !isHidden(panel) && !panel.classList.contains(CLOSING);
  }

  function setOrigin(panel) {
    if (!panel) return;
    var vw = window.innerWidth || 1;
    var vh = window.innerHeight || 1;
    var panelW = Math.min(400, vw);
    var panelLeft = vw - panelW;
    var btn = getHeaderBtn();
    var cx = vw - Math.min(56, vw * 0.08);
    var cy = Math.min(40, vh * 0.08);
    if (btn && btn.getBoundingClientRect) {
      var rect = btn.getBoundingClientRect();
      cx = rect.left + rect.width / 2;
      cy = rect.top + rect.height / 2;
    }
    var ox = ((cx - panelLeft) / panelW) * 100;
    var oy = (cy / vh) * 100;
    if (!isFinite(ox)) ox = 92;
    if (!isFinite(oy)) oy = 8;
    panel.style.setProperty('--notify-origin-x', Math.max(-20, Math.min(120, ox)).toFixed(2) + '%');
    panel.style.setProperty('--notify-origin-y', Math.max(-20, Math.min(120, oy)).toFixed(2) + '%');
  }

  function syncExpanded() {
    var btn = getHeaderBtn();
    if (btn) btn.setAttribute('aria-expanded', isOpen() ? 'true' : 'false');
  }

  function finishClose(panel) {
    animTimer = null;
    if (panel) {
      panel.classList.add(HIDDEN);
      panel.classList.remove(OPENING, CLOSING);
      panel.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('is-notify-opening', 'is-notify-closing');
    var dash = document.getElementById('dashboard');
    var account = document.getElementById('account-dashboard');
    var tastes = document.getElementById('ttms-guest-taste-modal');
    var otherOpen =
      (dash &&
        !dash.classList.contains('loader-hide-left') &&
        !dash.classList.contains('is-dashboard-closing')) ||
      (account && !account.classList.contains('loader-hide-right')) ||
      (tastes &&
        !tastes.classList.contains('ttms-guest-taste-hidden') &&
        !tastes.classList.contains('is-taste-closing'));
    if (!otherOpen) document.body.classList.remove('modal-open');
    syncExpanded();
  }

  function openInbox() {
    var panel = getPanel();
    if (!panel) return;
    if (isOpen() && !panel.classList.contains(CLOSING)) return;

    if (typeof window.closeAllUiPanels === 'function') {
      window.closeAllUiPanels({ keepNotifyInbox: true, skipReelsModal: true });
    }
    if (typeof window.closeGuestTasteModal === 'function') window.closeGuestTasteModal({ instant: true });

    clearTimeout(animTimer);
    setOrigin(panel);
    document.body.classList.add('modal-open');
    panel.setAttribute('aria-hidden', 'false');
    markSeen();
    loadInbox();

    if (prefersReducedMotion()) {
      panel.classList.remove(HIDDEN, OPENING, CLOSING);
      document.body.classList.remove('is-notify-opening', 'is-notify-closing');
      syncExpanded();
      syncBadge(readCache());
      return;
    }

    document.body.classList.add('is-notify-opening');
    document.body.classList.remove('is-notify-closing');
    panel.classList.add(OPENING);
    panel.classList.remove(HIDDEN, CLOSING);
    syncExpanded();
    animTimer = setTimeout(function () {
      animTimer = null;
      panel.classList.remove(OPENING);
      document.body.classList.remove('is-notify-opening');
      syncBadge(readCache());
    }, OPEN_MS);
  }

  function closeInbox(options) {
    options = options || {};
    var panel = getPanel();
    if (!panel || isHidden(panel)) {
      finishClose(panel);
      return;
    }
    if (panel.classList.contains(CLOSING) && !options.instant) return;

    clearTimeout(animTimer);
    if (options.instant || prefersReducedMotion()) {
      finishClose(panel);
      return;
    }

    document.body.classList.add('modal-open', 'is-notify-closing');
    document.body.classList.remove('is-notify-opening');
    setOrigin(panel);
    panel.classList.remove(OPENING, HIDDEN);
    void panel.offsetWidth;
    panel.classList.add(CLOSING);
    panel.setAttribute('aria-hidden', 'true');
    syncExpanded();
    animTimer = setTimeout(function () {
      finishClose(panel);
    }, CLOSE_MS);
  }

  function toggleInbox() {
    if (isOpen()) closeInbox();
    else openInbox();
  }

  function onKeydown(event) {
    if (event.key === 'Escape' && isOpen()) {
      closeInbox();
    }
  }

  window.toggleNotifyInbox = toggleInbox;
  window.closeNotifyInbox = closeInbox;
  window.openNotifyInbox = openInbox;
  window.NotifyInbox = {
    remember: rememberItem,
    refresh: loadInbox,
    syncBadge: function () {
      syncBadge(readCache());
    },
    syncSubscribe: syncSubscribeChrome,
  };

  function bootInboxChrome() {
    waitForAuth().then(
      function () {
        syncBadge(signedIn() ? readCache() : []);
        syncSubscribeChrome();
      },
      function () {
        syncBadge([]);
        syncSubscribeChrome();
      }
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootInboxChrome);
  } else {
    bootInboxChrome();
  }

  document.addEventListener('keydown', onKeydown);
  document.addEventListener('ttms:notify-received', function (event) {
    rememberItem(event.detail);
  });
})();
