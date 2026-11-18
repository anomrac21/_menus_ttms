/**
 * Guest alerts inbox: recent notifications from this restaurant.
 */
(function () {
  'use strict';

  var HIDDEN = 'notify-inbox-hidden';
  var OPENING = 'is-notify-opening';
  var CLOSING = 'is-notify-closing';
  var CACHE_KEY = 'ttmenus_notify_inbox';
  var READ_KEY = 'ttmenus_notify_inbox_read';
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

  function readBook() {
    try {
      var raw = JSON.parse(localStorage.getItem(READ_KEY) || '{}');
      return raw && typeof raw === 'object' ? raw : {};
    } catch (e) {
      return {};
    }
  }

  function isUnread(item) {
    if (!item) return false;
    if (!item.id) return true;
    return !readBook()[item.id];
  }

  function markAllRead() {
    markRead(
      readCache().map(function (item) {
        return item.id;
      })
    );
    var list = document.getElementById('notify-inbox-list');
    if (!list) return;
    Array.prototype.forEach.call(list.querySelectorAll('.is-unread'), function (node) {
      node.classList.remove('is-unread');
    });
  }

  function markRead(ids) {
    var book = readBook();
    (ids || []).forEach(function (id) {
      if (id) book[id] = 1;
    });
    var keys = Object.keys(book);
    if (keys.length > 240) {
      keys.slice(0, keys.length - 240).forEach(function (key) {
        delete book[key];
      });
    }
    try {
      localStorage.setItem(READ_KEY, JSON.stringify(book));
    } catch (e) {}
    syncBadge(readCache());
  }

  function paintRead(root) {
    if (!root) return;
    root.classList.remove('is-unread');
    Array.prototype.forEach.call(root.querySelectorAll('.is-unread'), function (node) {
      node.classList.remove('is-unread');
    });
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
    if (isOpen()) renderList(next, { settle: true });
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
    return (items || []).filter(isUnread).length;
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
      if (!isSubscribed()) {
        btn.setAttribute('aria-label', 'Get menu alerts');
        btn.title = 'Get menu alerts';
      } else {
        btn.setAttribute(
          'aria-label',
          count > 0 ? 'Open menu alerts, ' + count + ' new' : 'Open menu alerts'
        );
        btn.title = 'Menu alerts';
      }
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

  function deliveryOrderFromHref(href) {
    var raw = String(href || '');
    if (!raw) return null;
    try {
      var url = new URL(raw, window.location.origin);
      var path = url.pathname.replace(/\/+$/, '');
      if (!/\/delivery$/i.test(path)) return null;
      var id = url.searchParams.get('order') || url.searchParams.get('delivery_order') || '';
      id = String(id).trim();
      if (!id) return null;
      return { id: id, pay: url.searchParams.get('pay') === '1' };
    } catch (e) {
      return null;
    }
  }

  function deliveryPageHref(target) {
    return '/delivery/?order=' + encodeURIComponent(target.id) + (target.pay ? '&pay=1' : '');
  }

  async function openDeliveryPanel(target) {
    if (typeof window.closeAllUiPanels === 'function') {
      window.closeAllUiPanels({ skipReelsModal: true });
    } else if (typeof window.closeNotifyInbox === 'function') {
      window.closeNotifyInbox({ instant: true });
    }
    if (!window.DeliveryClient || typeof DeliveryClient.getOrder !== 'function' || !window.TTMSDeliveryUI) {
      window.location.href = deliveryPageHref(target);
      return;
    }
    try {
      var order = await DeliveryClient.getOrder(target.id);
      if (
        order &&
        (order.status === 'payment_pending' || order.status === 'expired') &&
        typeof DeliveryClient.syncPayment === 'function'
      ) {
        order = await DeliveryClient.syncPayment(order.id).catch(function () {
          return order;
        });
      }
      var st = String((order && order.status) || '');
      if (
        (st === 'awaiting_drivers' || st === 'driver_offers' || st === 'requested' || st === 'offered') &&
        typeof TTMSDeliveryUI.showOffers === 'function'
      ) {
        await TTMSDeliveryUI.showOffers(order.id);
        return;
      }
      if (order && typeof TTMSDeliveryUI.showOrder === 'function') {
        TTMSDeliveryUI.showOrder(order);
        return;
      }
    } catch (err) {}
    window.location.href = deliveryPageHref(target);
  }

  function cssAttr(value) {
    var text = String(value || '');
    if (window.CSS && typeof CSS.escape === 'function') return CSS.escape(text);
    return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function dashboardOpen() {
    var dash = document.getElementById('dashboard');
    return !!(
      dash &&
      !dash.classList.contains('loader-hide-left') &&
      !dash.classList.contains('is-dashboard-closing') &&
      dash.getAttribute('aria-hidden') !== 'true'
    );
  }

  function panelAction(item) {
    var data = (item && item.data) || {};
    var href = String((item && item.url) || '');
    var delivery = deliveryOrderFromHref(href);
    if (delivery) return { type: 'delivery', target: delivery };
    var role = String(data.role || '').toLowerCase();
    if (role === 'client' || /dashboard/i.test(href)) {
      var card = /dashboardCardBody-delivery|\/delivery\//i.test(href) ? 'delivery' : 'orders';
      return { type: 'dashboard', card: card, id: data.order_id || data.delivery_order_id || '' };
    }
    if (data.order_id) return { type: 'customer', id: String(data.order_id) };
    return null;
  }

  function focusDashboardCard(action) {
    var bodyId = action.card === 'delivery' ? 'dashboardCardBody-delivery' : 'dashboardCardBody-orders';
    var body = document.getElementById(bodyId);
    var card = body && body.closest ? body.closest('.card, [data-dashboard-card]') : null;
    if (card) {
      card.classList.remove('is-collapsed');
      var toggle = card.querySelector('[data-dashboard-card-toggle]');
      if (toggle) toggle.setAttribute('aria-expanded', 'true');
    }
    var row = action.id && body ? body.querySelector('[data-id="' + cssAttr(action.id) + '"]') : null;
    if (row) {
      row.classList.add('is-notify-target');
      window.setTimeout(function () {
        row.classList.remove('is-notify-target');
      }, 2400);
    }
    var target = row || body || card;
    if (target && target.scrollIntoView) target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function openDashboardPanel(action) {
    if (typeof window.closeAllUiPanels === 'function') {
      window.closeAllUiPanels({ keepDashboard: true, skipReelsModal: true });
    } else if (typeof window.closeNotifyInbox === 'function') {
      window.closeNotifyInbox({ instant: true });
    }
    var already = dashboardOpen();
    if (!already && typeof window.toggleDashboard === 'function') window.toggleDashboard();
    window.setTimeout(function () {
      focusDashboardCard(action);
    }, already ? 40 : 420);
  }

  async function openCustomerOrder(id) {
    if (typeof window.closeAllUiPanels === 'function') {
      window.closeAllUiPanels({ keepCart: true, skipReelsModal: true });
    } else if (typeof window.closeNotifyInbox === 'function') {
      window.closeNotifyInbox({ instant: true });
    }
    if (window.TTMSCustomerOrder && typeof TTMSCustomerOrder.open === 'function') {
      try {
        await TTMSCustomerOrder.open(id);
        return true;
      } catch (err) {}
    }
    return false;
  }

  async function openItemPanel(item) {
    var action = panelAction(item);
    if (!action) return false;
    if (action.type === 'delivery') {
      await openDeliveryPanel(action.target);
      return true;
    }
    if (action.type === 'customer') {
      return openCustomerOrder(action.id);
    }
    openDashboardPanel(action);
    return true;
  }

  function bindCardClick(node, item) {
    if (!node || !item) return;
    node.addEventListener('click', function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      var action = panelAction(item);
      if (!action) {
        if (typeof window.closeNotifyInbox === 'function') window.closeNotifyInbox({ instant: !item.url });
        return;
      }
      e.preventDefault();
      markRead([item.id]);
      paintRead(node);
      if (
        item.id &&
        window.NotificationService &&
        typeof NotificationService.trackNotificationClick === 'function'
      ) {
        NotificationService.trackNotificationClick(item.id);
      }
      openItemPanel(item);
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

  function bindStack(root, latest) {
    var front = root.querySelector('.notify-stack__front');
    var sheet = root.querySelector('.notify-stack__sheet');
    var collapse = root.querySelector('.notify-stack__collapse');
    if (!front || !sheet) return;
    function setOpen(open) {
      root.classList.toggle('is-open', open);
      front.setAttribute('aria-expanded', open ? 'true' : 'false');
      sheet.setAttribute('aria-hidden', open ? 'false' : 'true');
    }
    function readStack() {
      var ids = [];
      Array.prototype.forEach.call(root.querySelectorAll('[data-notify-id]'), function (node) {
        if (node.getAttribute('data-notify-id')) ids.push(node.getAttribute('data-notify-id'));
      });
      markRead(ids);
      paintRead(root);
    }
    front.addEventListener('click', function (e) {
      if (e.target && e.target.closest && e.target.closest('.notify-stack__hint')) {
        e.preventDefault();
        readStack();
        setOpen(true);
        return;
      }
      if (latest && panelAction(latest)) {
        e.preventDefault();
        markRead([latest.id]);
        paintRead(front);
        openItemPanel(latest);
        return;
      }
      readStack();
      setOpen(true);
    });
    if (collapse) {
      collapse.addEventListener('click', function () {
        setOpen(false);
      });
    }
  }

  var paintedSig = '';

  function listSig(items) {
    return groupItems(items)
      .map(function (group) {
        return group.items
          .map(function (item) {
            return (item.id || '') + (isUnread(item) ? 'u' : 'r');
          })
          .join(',');
      })
      .join('~');
  }

  function renderList(items, opts) {
    var list = document.getElementById('notify-inbox-list');
    var empty = document.getElementById('notify-inbox-empty');
    if (!list) return;
    var sig = listSig(items || []);
    var settle = !!(opts && opts.settle);
    if (sig && sig === paintedSig && list.querySelector('.notify-inbox-item')) {
      list.classList.add('is-settled');
      if (empty) empty.hidden = true;
      return;
    }
    paintedSig = sig;
    list.classList.toggle('is-settled', settle);
    list.innerHTML = '';
    if (!items || !items.length) {
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    groupItems(items).forEach(function (group, index) {
      var latest = group.latest;
      var li = document.createElement('li');
      li.style.setProperty('--i', String(index));
      var unread = group.items.some(isUnread);
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
        '<button type="button" class="notify-stack__front notify-ios' +
        (unread ? ' is-unread' : '') +
        '" aria-expanded="false">' +
        iosCardInner(latest, place) +
        '<span class="notify-stack__hint">' +
        escapeHtml(group.items.length === 1 ? '1 update' : String(group.items.length) + ' updates') +
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
              iosLinkMarkup(item, isUnread(item), place, idx + 1) +
              '</li>'
            );
          })
          .join('') +
        '</ol>' +
        '<button type="button" class="notify-stack__collapse">Show less</button>' +
        '</div>' +
        '</article>';
      bindStack(li.querySelector('.notify-stack'), latest);
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
    var list = document.getElementById('notify-inbox-list');
    var hadCards = !!(list && list.querySelector('.notify-inbox-item'));
    renderList(cached, { settle: hadCards });

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
    var listNow = document.getElementById('notify-inbox-list');
    var showing = !!(listNow && listNow.querySelector('.notify-inbox-item'));
    renderList(merged, { settle: showing });
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
    paintedSig = '';
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
    if (panel.classList.contains(OPENING)) return;
    if (isOpen() && !panel.classList.contains(CLOSING)) return;

    if (typeof window.closeAllUiPanels === 'function') {
      window.closeAllUiPanels({ keepNotifyInbox: true, skipReelsModal: true });
    }
    if (typeof window.closeGuestTasteModal === 'function') window.closeGuestTasteModal({ instant: true });

    clearTimeout(animTimer);
    setOrigin(panel);
    document.body.classList.add('modal-open', 'is-notify-opening');
    document.body.classList.remove('is-notify-closing');
    panel.setAttribute('aria-hidden', 'false');
    panel.classList.add(OPENING);
    panel.classList.remove(HIDDEN, CLOSING);
    syncExpanded();
    loadInbox();

    if (prefersReducedMotion()) {
      panel.classList.remove(OPENING);
      document.body.classList.remove('is-notify-opening');
      syncExpanded();
      syncBadge(readCache());
      return;
    }

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

  function promptSubscribeThenOpen() {
    var svc = window.NotificationService;
    if (svc && typeof svc.subscribe === 'function') {
      Promise.resolve(svc.subscribe())
        .then(function () {
          if (isSubscribed()) openInbox();
          syncBadge(readCache());
          syncSubscribeChrome();
        })
        .catch(function () {
          syncBadge(readCache());
          syncSubscribeChrome();
        });
      return;
    }
    if (typeof window.toggleNotificationSubscription === 'function') {
      window.toggleNotificationSubscription();
    }
  }

  function toggleInbox() {
    if (isOpen()) {
      closeInbox();
      return;
    }
    if (!isSubscribed()) {
      promptSubscribeThenOpen();
      return;
    }
    openInbox();
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
    var mark = document.getElementById('notify-inbox-mark');
    if (mark && !mark.getAttribute('data-bound')) {
      mark.setAttribute('data-bound', '1');
      mark.addEventListener('click', markAllRead);
    }
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
