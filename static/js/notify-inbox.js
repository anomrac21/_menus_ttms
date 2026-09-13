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
  var OPEN_MS = 560;
  var CLOSE_MS = 360;
  var animTimer = null;

  function getPanel() {
    return document.getElementById('notify-inbox');
  }

  function getHeaderBtn() {
    return document.querySelector('[data-opens="notify-inbox"]') || document.getElementById('subBtnHeader');
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
    return cfg && typeof cfg === 'object' ? cfg : {};
  }

  function apiBase() {
    var cfg = notifyConfig();
    return String(cfg.apiUrl || 'https://notify.ttmenus.com/api/v1').replace(/\/+$/, '');
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
    if (window.NotificationService && NotificationService.shouldDisplayNotification) {
      if (!NotificationService.shouldDisplayNotification(item)) return false;
    }
    if (isPhotoReview(item)) {
      return !!(window.NotificationService && NotificationService.isCurrentUserAdmin && NotificationService.isCurrentUserAdmin());
    }
    if (isWelcome(item)) return false;
    return !!(item.title || item.message || item.body);
  }

  function normalizeItem(raw) {
    if (!raw) return null;
    var data = raw.data || {};
    return {
      id: raw.id || raw.delivery_id || '',
      title: raw.title || 'Menu alert',
      message: raw.message || raw.body || '',
      type: raw.type || 'general',
      created_at: raw.created_at || raw.delivered_at || new Date().toISOString(),
      url: raw.url || data.url || data.link || '',
      data: data,
    };
  }

  function mergeItems() {
    var byId = {};
    var list = [];
    Array.prototype.forEach.call(arguments, function (group) {
      (group || []).forEach(function (raw) {
        var item = normalizeItem(raw);
        if (!item || !isGuestVisible(item)) return;
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
    var item = normalizeItem(raw);
    if (!item || !isGuestVisible(item)) return;
    var next = mergeItems([item], readCache());
    writeCache(next);
    syncBadge(next);
    if (isOpen()) renderList(next);
  }

  function typeLabel(type) {
    if (type === 'menu_update') return 'Menu';
    if (type === 'promotion') return 'Special';
    if (type === 'order') return 'Order';
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
    var count = unreadCount(items || readCache());
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
        ? 'You get specials, hours, and menu updates on this phone.'
        : 'Get specials, hours, and menu updates on this phone.';
    }
    if (emptyHint) {
      emptyHint.textContent = on
        ? 'When this restaurant sends specials or menu updates, they show up here.'
        : 'Turn on alerts, then specials and menu updates from this restaurant will land here.';
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
    items.forEach(function (item) {
      var li = document.createElement('li');
      li.className = 'notify-inbox-item';
      var unread = itemTime(item) > seen;
      var href = item.url || '';
      var tag = href ? 'a' : 'button';
      li.innerHTML =
        '<' +
        tag +
        ' class="notify-inbox-card' +
        (unread ? ' is-unread' : '') +
        '"' +
        (href ? ' href="' + escapeHtml(href) + '"' : ' type="button"') +
        ' data-notify-id="' +
        escapeHtml(item.id) +
        '">' +
        '<span class="notify-inbox-card__top">' +
        '<span class="notify-inbox-card__type">' +
        escapeHtml(typeLabel(item.type)) +
        '</span>' +
        '<span class="notify-inbox-card__time">' +
        escapeHtml(formatWhen(item.created_at)) +
        '</span>' +
        '</span>' +
        '<strong class="notify-inbox-card__title">' +
        escapeHtml(item.title) +
        '</strong>' +
        (item.message
          ? '<p class="notify-inbox-card__body">' + escapeHtml(item.message) + '</p>'
          : '') +
        '</' +
        tag +
        '>';
      var card = li.firstElementChild;
      if (card) {
        card.addEventListener('click', function () {
          if (
            item.id &&
            window.NotificationService &&
            typeof NotificationService.trackNotificationClick === 'function'
          ) {
            NotificationService.trackNotificationClick(item.id);
          }
          if (typeof window.closeNotifyInbox === 'function') {
            window.closeNotifyInbox({ instant: !href });
          }
        });
      }
      list.appendChild(li);
    });
  }

  async function fetchJson(url) {
    var res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(String(res.status));
    return res.json();
  }

  async function loadInbox() {
    syncSubscribeChrome();
    setStatus('Loading alerts…');
    var cached = readCache();
    renderList(cached);

    var remote = [];
    var subId = subscriptionId();
    var domain = clientDomain();
    var base = apiBase();

    function authHeaders() {
      var headers = { Accept: 'application/json' };
      try {
        var token =
          window.AuthClient && AuthClient.getAccessToken ? AuthClient.getAccessToken() : '';
        if (token) headers.Authorization = 'Bearer ' + token;
      } catch (e) {}
      return headers;
    }

    async function fetchAuthJson(url) {
      var res = await fetch(url, { headers: authHeaders() });
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    }

    try {
      if (window.AuthClient && AuthClient.isAuthenticated && AuthClient.isAuthenticated()) {
        var mine = await fetchAuthJson(base + '/me/notifications?limit=30');
        remote = remote.concat((mine && mine.notifications) || []);
      }
    } catch (eMe) {}

    if (subId && !remote.length) {
      try {
        var feed = await fetchJson(
          base + '/subscriptions/' + encodeURIComponent(subId) + '/notifications?limit=30'
        );
        remote = remote.concat((feed && feed.notifications) || []);
      } catch (e) {}
    }

    if (domain) {
      try {
        var pub = await fetchJson(
          base + '/notifications?client_domain=' + encodeURIComponent(domain) + '&limit=20'
        );
        remote = remote.concat((pub && pub.notifications) || []);
      } catch (e) {}
    }

    var merged = mergeItems(remote, cached);
    writeCache(merged);
    setStatus('');
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
    var btn = getHeaderBtn();
    if (!btn || !btn.getBoundingClientRect) {
      panel.style.setProperty('--notify-from-x', Math.round(vw * -0.12) + 'px');
      panel.style.setProperty('--notify-from-y', Math.round(vh * -0.38) + 'px');
      return;
    }
    var rect = btn.getBoundingClientRect();
    panel.style.setProperty('--notify-from-x', rect.left + rect.width / 2 - vw / 2 + 'px');
    panel.style.setProperty('--notify-from-y', rect.top + rect.height / 2 - vh / 2 + 'px');
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
    var otherOpen =
      (dash && !dash.classList.contains('loader-hide-left') && !dash.classList.contains('is-dashboard-closing')) ||
      (account && !account.classList.contains('loader-hide-right'));
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      syncBadge(readCache());
      syncSubscribeChrome();
    });
  } else {
    syncBadge(readCache());
    syncSubscribeChrome();
  }

  document.addEventListener('keydown', onKeydown);
  document.addEventListener('ttms:notify-received', function (event) {
    rememberItem(event.detail);
  });
})();
