/**
 * Restaurant Orders inbox: poll tickets, ready / charge / cancel / reprint.
 */
(function () {
  'use strict';

  var pollTimer = null;
  var lastFingerprint = '';
  var knownIds = {};
  var refreshSeq = 0;
  var notifyByOrderId = {};
  var notifyReceiptById = {};
  var notifyOpenByOrderId = {};
  var notifyLoadSeq = 0;
  var lastOrdersCache = [];

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function parseCart(order) {
    if (window.OrderClient && typeof window.OrderClient.parseCart === 'function') {
      return window.OrderClient.parseCart(order);
    }
    return [];
  }

  function lineItemName(line) {
    var name = String(line.item || line.name || line.title || line.product || 'Item');
    name = name.replace(/Sold out\s*$/i, '').replace(/\s+/g, ' ').trim();
    return name || 'Item';
  }

  function lineLabel(line) {
    var name = lineItemName(line);
    var size = line.size && String(line.size) !== '-' ? ' (' + line.size + ')' : '';
    var qty = line.quantity || line.amt || line.qty || 1;
    var extra = line.note ? ': ' + line.note : '';
    return qty + '× ' + name + size + extra;
  }

  function titleCase(s) {
    return String(s || '')
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, function (ch) {
        return ch.toUpperCase();
      })
      .trim();
  }

  function statusLabel(s) {
    return titleCase(s || 'open');
  }

  function fulfillmentMeta(order) {
    var table = String(order.table_number || '').trim();
    var fulfill = String(order.fulfillment || '').toLowerCase();
    var tableIsTakeaway = /^takeaway$/i.test(table);
    if (fulfill === 'takeaway' || tableIsTakeaway) {
      return { kind: 'takeaway', label: 'Takeaway' };
    }
    if (fulfill === 'dine_in' || fulfill === 'dine-in') {
      return { kind: 'dine_in', label: table ? 'Table ' + table : 'Dine in' };
    }
    if (table) return { kind: 'table', label: 'Table ' + table };
    return { kind: fulfill || 'order', label: titleCase(fulfill) || 'Order' };
  }

  function loyverseErrorLabel(raw) {
    var text = String(raw || '').trim();
    if (!text) return 'Loyverse failed';
    try {
      var parsed = JSON.parse(text.replace(/^loyverse status \d+:\s*/i, ''));
      if (parsed && Array.isArray(parsed.unmapped_lines) && parsed.unmapped_lines.length) {
        return 'Loyverse: map ' + parsed.unmapped_lines.join(', ');
      }
      if (parsed && parsed.error) return 'Loyverse: ' + parsed.error;
    } catch (_) {}
    if (/missing loyverse variant_id/i.test(text)) {
      return 'Loyverse: item not mapped — open POS Connect or Send to Loyverse after mapping';
    }
    if (text.length > 120) return 'Loyverse: ' + text.slice(0, 117) + '…';
    return 'Loyverse: ' + text;
  }

  function adapterChips(order) {
    var chips = [];
    if (order.loyverse_receipt_number) {
      chips.push({
        text: 'Receipt ' + order.loyverse_receipt_number,
        kind: 'ok',
      });
    } else if (order.loyverse_receipt_status === 'queued') {
      chips.push({ text: 'Loyverse queued', kind: '' });
    } else if (order.loyverse_error) {
      chips.push({ text: loyverseErrorLabel(order.loyverse_error), kind: 'fail' });
    } else if (order.loyverse_receipt_mode === 'off') {
      chips.push({ text: 'Loyverse off', kind: '' });
    } else if (order.loyverse_receipt_mode) {
      chips.push({
        text: 'Loyverse · ' + titleCase(order.loyverse_receipt_mode),
        kind: '',
      });
    }
    if (order.print_status) {
      chips.push({
        text: 'Print ' + titleCase(order.print_status),
        kind: /fail/i.test(String(order.print_status)) ? 'fail' : '',
      });
    }
    if (order.delivery_order_id) {
      chips.push({
        text: 'Delivery ' + String(order.delivery_order_id).slice(0, 8),
        kind: '',
      });
    }
    return chips;
  }

  function locationCatalog() {
    var cfg = window.MENU_CONFIG || {};
    return Array.isArray(cfg.locations) ? cfg.locations : [];
  }

  function moneyLabel(order) {
    if (window.OrderClient && typeof window.OrderClient.formatMoney === 'function') {
      return window.OrderClient.formatMoney(order.currency, order.total);
    }
    return String(order.currency || '') + ' ' + Number(order.total || 0).toFixed(2);
  }

  function orderLocationSlug(order) {
    if (window.OrderClient && typeof window.OrderClient.inferLocationSlug === 'function') {
      return String(window.OrderClient.inferLocationSlug(order) || '').trim();
    }
    return String((order && order.location_slug) || '').trim();
  }

  function locationMeta(slug, order) {
    var key = String(slug || '').trim();
    var found = locationCatalog().filter(function (loc) {
      return String(loc.slug || '') === key;
    })[0];
    if (found) {
      return {
        slug: String(found.slug || ''),
        title: found.city || titleCase(found.slug) || 'Location',
        subtitle: found.address || '',
      };
    }
    if (key) {
      return { slug: key, title: titleCase(key), subtitle: '' };
    }
    var name = String((order && order.restaurant_name) || '').trim();
    return { slug: '', title: name || 'Menu', subtitle: '' };
  }

  function selectedOrdersStatus() {
    var root = $('dashboardOrdersFilter');
    if (!root) return '';
    if (root.tagName === 'SELECT') return root.value || '';
    var active = root.querySelector('.dashboard-orders-status-filter.is-active[data-orders-status]');
    if (!active) active = root.querySelector('[data-orders-status][aria-selected="true"]');
    return active ? String(active.getAttribute('data-orders-status') || '') : '';
  }

  function onOrdersStatusFilterClick(e) {
    var btn = e.target.closest('[data-orders-status]');
    var root = $('dashboardOrdersFilter');
    if (!btn || !root || !root.contains(btn)) return;
    root.querySelectorAll('[data-orders-status]').forEach(function (el) {
      var on = el === btn;
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    refresh();
  }

  function fillLocationFilter() {
    var sel = $('dashboardOrdersLocation');
    if (!sel || sel.getAttribute('data-filled') === '1') return;
    var locs = locationCatalog();
    if (!locs.length) return;
    sel.setAttribute('data-filled', '1');
    locs.forEach(function (loc) {
      if (!loc || !loc.slug) return;
      var opt = document.createElement('option');
      opt.value = loc.slug;
      opt.textContent = loc.city || titleCase(loc.slug);
      sel.appendChild(opt);
    });
  }

  function groupOrdersByLocation(orders) {
    var groups = [];
    var bySlug = {};
    locationCatalog().forEach(function (loc) {
      if (!loc || !loc.slug) return;
      var meta = locationMeta(loc.slug);
      var group = { meta: meta, orders: [] };
      groups.push(group);
      bySlug[loc.slug] = group;
    });
    (orders || []).forEach(function (o) {
      var slug = orderLocationSlug(o);
      var key = slug || '__none__';
      var group = bySlug[key];
      if (!group) {
        group = { meta: locationMeta(slug, o), orders: [] };
        groups.push(group);
        bySlug[key] = group;
      }
      group.orders.push(o);
    });
    var selected = ($('dashboardOrdersLocation') && $('dashboardOrdersLocation').value) || '';
    if (selected) {
      return groups.filter(function (g) {
        return g.meta.slug === selected;
      });
    }
    return groups.filter(function (g) {
      return g.orders.length > 0;
    });
  }

  function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  var ticketBusy = 0;

  function ticketRefText(card) {
    var ref = card.querySelector('.dashboard-order-ticket-ref');
    return ref ? ref.textContent.trim() : 'this ticket';
  }

  function ticketTotalText(card) {
    var total = card.querySelector('.dashboard-order-total');
    return total ? total.textContent.trim() : '';
  }

  function ticketActionConfirm(card, act) {
    var refText = ticketRefText(card);
    var totalText = ticketTotalText(card);
    var msg;
    if (act === 'cancel') {
      msg = 'Are you sure you want to cancel ' + refText;
      if (totalText) msg += ' (' + totalText + ')';
    } else {
      msg = 'Are you sure you want to charge ' + refText;
      if (totalText) msg += ' for ' + totalText;
    }
    return window.confirm(msg + '?');
  }

  function playTicketOutcome(card, act, ok) {
    var isCancel = act === 'cancel';
    var successClass = isCancel ? 'is-cancel-success' : 'is-charge-success';
    var failClass = isCancel ? 'is-cancel-fail' : 'is-charge-fail';
    var outcomeClasses = ['is-charge-success', 'is-charge-fail', 'is-cancel-success', 'is-cancel-fail'];
    return new Promise(function (resolve) {
      var finish = function () {
        var burst = card.querySelector('.dashboard-order-charge-burst');
        if (burst) burst.remove();
        outcomeClasses.forEach(function (name) {
          card.classList.remove(name);
        });
        resolve();
      };
      outcomeClasses.forEach(function (name) {
        card.classList.remove(name);
      });
      var existing = card.querySelector('.dashboard-order-charge-burst');
      if (existing) existing.remove();
      if (prefersReducedMotion()) {
        finish();
        return;
      }
      var burst = document.createElement('div');
      burst.className =
        'dashboard-order-charge-burst' +
        (isCancel ? ' is-cancel' : ' is-charge') +
        (ok ? ' is-ok' : ' is-fail');
      burst.setAttribute('aria-hidden', 'true');
      var sparks = '';
      if (ok) {
        for (var i = 0; i < 8; i++) {
          sparks +=
            '<span class="' +
            (isCancel ? 'dashboard-order-cancel-ember' : 'dashboard-order-charge-spark') +
            (i % 2 ? ' is-alt' : '') +
            '" style="--i:' +
            i +
            '"></span>';
        }
      }
      var okIcon = isCancel
        ? '<svg class="dashboard-order-charge-burst-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2.2"/><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M8 8l8 8"/></svg>'
        : '<svg class="dashboard-order-charge-burst-icon" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>';
      var failIcon =
        '<svg class="dashboard-order-charge-burst-icon" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" d="M6 6l12 12M18 6L6 18"/></svg>';
      burst.innerHTML =
        '<span class="dashboard-order-charge-burst-ring"></span>' +
        (ok ? okIcon : failIcon) +
        '<span class="dashboard-order-charge-burst-label">' +
        (ok
          ? isCancel
            ? 'Cancelled'
            : 'Charged'
          : isCancel
            ? 'Could not cancel'
            : 'Could not charge') +
        '</span>' +
        sparks;
      card.appendChild(burst);
      card.classList.add(ok ? successClass : failClass);
      window.setTimeout(finish, ok ? 980 : 780);
    });
  }

  function ordersFingerprint(orders, filter, location) {
    return (
      String(filter || '') +
      '|' +
      String(location || '') +
      '|' +
      (orders || [])
        .map(function (o) {
          return [o.id, o.status, o.print_status, o.loyverse_receipt_number, o.loyverse_receipt_status, o.loyverse_error, o.updated_at].join(':');
        })
        .join('|')
    );
  }

  function skeletonMarkup() {
    return (
      '<div class="dashboard-orders-throbber" role="status" aria-live="polite">' +
      '<span class="dashboard-orders-throbber-spin" aria-hidden="true"></span>' +
      '<p class="dashboard-orders-throbber-label">Loading tickets…</p>' +
      '<div class="dashboard-orders-skeleton" aria-hidden="true">' +
      '<div class="dashboard-orders-skeleton-card"><span></span><span></span><span></span></div>' +
      '<div class="dashboard-orders-skeleton-card"><span></span><span></span><span></span></div>' +
      '</div></div>'
    );
  }

  function setRefreshing(on) {
    var page = $('dashboardOrdersPage');
    var btn = $('ttms-orders-refresh');
    var statusEl = $('dashboardOrdersStatus');
    if (page) page.classList.toggle('is-orders-loading', on);
    if (btn) {
      btn.classList.toggle('is-loading', on);
      btn.setAttribute('aria-busy', on ? 'true' : 'false');
    }
    if (on && statusEl && !lastFingerprint) statusEl.textContent = 'Loading tickets…';
  }

  function showThrobber() {
    var host = $('ttms-orders-list');
    if (!host) return;
    host.setAttribute('aria-busy', 'true');
    host.innerHTML = skeletonMarkup();
  }

  function enrichCartVariants(lines) {
    var resolver =
      window.posIntegration && typeof window.posIntegration.resolveVariantId === 'function'
        ? window.posIntegration.resolveVariantId
        : null;
    return (Array.isArray(lines) ? lines : []).map(function (line) {
      if (!line || typeof line !== 'object') return line;
      var copy = {};
      Object.keys(line).forEach(function (k) {
        copy[k] = line[k];
      });
      var existing = String(copy.variant_id || copy.loyverse_variant_id || '').trim();
      var mapped = resolver ? String(resolver(copy) || '').trim() : '';
      var vid = existing || mapped;
      if (vid) {
        copy.variant_id = vid;
        copy.loyverse_variant_id = vid;
      }
      return copy;
    });
  }

  function notifyActionLabel(action) {
    var key = String(action || '').toLowerCase();
    if (key === 'order_ready') return 'Ready';
    if (key === 'order_paid') return 'Paid';
    if (key === 'order_cancelled') return 'Cancelled';
    if (key === 'order_created') return 'Received';
    if (key === 'staff_message') return 'Staff message';
    return titleCase(key || 'Alert');
  }

  function formatNotifyWhen(value) {
    if (!value) return '';
    try {
      var d = new Date(value);
      if (isNaN(d.getTime())) return String(value);
      return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch (_) {
      return String(value);
    }
  }

  function receiptRank(status) {
    var key = String(status || '').toLowerCase();
    if (key === 'clicked' || key === 'read') return 5;
    if (key === 'confirmed' || key === 'opened') return 4;
    if (key === 'delivered' || key === 'received') return 3;
    if (key === 'sent') return 2;
    if (key === 'pending' || key === 'queued') return 1;
    if (key === 'failed' || key === 'bounced') return 0;
    return 1;
  }

  function bestReceiptFromDeliveries(deliveries, fallbackStatus) {
    var best = String(fallbackStatus || 'pending').toLowerCase();
    var bestRank = receiptRank(best);
    var when = '';
    (Array.isArray(deliveries) ? deliveries : []).forEach(function (d) {
      var status = String((d && d.status) || '').toLowerCase();
      var rank = receiptRank(status);
      if (rank > bestRank) {
        best = status;
        bestRank = rank;
      }
      var stamp = d && (d.clicked_at || d.confirmed_at || d.delivered_at);
      if (stamp) when = stamp;
    });
    if (best === 'clicked') best = 'read';
    if (best === 'confirmed' || best === 'opened') best = 'read';
    if (best === 'received') best = 'delivered';
    return { status: best, when: when };
  }

  function receiptTicksMarkup(receipt) {
    var status = String((receipt && receipt.status) || 'pending').toLowerCase();
    var label = 'Sending';
    var cls = 'is-pending';
    if (status === 'failed' || status === 'bounced') {
      label = 'Failed';
      cls = 'is-failed';
    } else if (status === 'read') {
      label = 'Read';
      cls = 'is-read';
    } else if (status === 'delivered') {
      label = 'Delivered';
      cls = 'is-delivered';
    } else if (status === 'sent') {
      label = 'Sent';
      cls = 'is-sent';
    }
    var twin = cls === 'is-delivered' || cls === 'is-read';
    return (
      '<span class="dashboard-order-notify-ticks ' +
      cls +
      '" title="' +
      escapeHtml(label) +
      '" aria-label="' +
      escapeHtml(label) +
      '">' +
      (cls === 'is-failed'
        ? '<i class="fa fa-exclamation-circle" aria-hidden="true"></i>'
        : cls === 'is-pending'
          ? '<i class="fa fa-clock-o" aria-hidden="true"></i>'
          : '<svg viewBox="0 0 16 11" aria-hidden="true" class="dashboard-order-notify-tick">' +
            '<path d="M1.2 5.6l2.7 2.7L8.9 1.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path>' +
            '</svg>' +
            (twin
              ? '<svg viewBox="0 0 16 11" aria-hidden="true" class="dashboard-order-notify-tick dashboard-order-notify-tick--second">' +
                '<path d="M1.2 5.6l2.7 2.7L8.9 1.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path>' +
                '</svg>'
              : '')) +
      '</span>'
    );
  }

  function renderNotifyHistory(orderId) {
    var items = (notifyByOrderId[orderId] || []).slice().reverse();
    if (!items.length) {
      return '<p class="dashboard-order-notify-empty">No customer alerts sent yet.</p>';
    }
    return (
      '<ul class="dashboard-order-notify-thread" aria-label="Sent customer alerts">' +
      items
        .slice(-20)
        .map(function (n) {
          var data = (n && n.data) || {};
          var notifId = String((n && n.id) || '').trim();
          var action = notifyActionLabel(data.action || n.type);
          var title = String((n && n.title) || action).trim();
          var message = String((n && n.message) || '').trim();
          var when = formatNotifyWhen(n.created_at || n.createdAt || n.sent_at);
          var receipt =
            (notifId && notifyReceiptById[notifId]) ||
            bestReceiptFromDeliveries(null, n.status || 'sent');
          return (
            '<li class="dashboard-order-notify-bubble" data-notification-id="' +
            escapeHtml(notifId) +
            '">' +
            '<div class="dashboard-order-notify-bubble-body">' +
            '<span class="dashboard-order-notify-bubble-kind">' +
            escapeHtml(action) +
            '</span>' +
            '<strong class="dashboard-order-notify-bubble-title">' +
            escapeHtml(title) +
            '</strong>' +
            (message && message !== title
              ? '<span class="dashboard-order-notify-bubble-msg">' + escapeHtml(message) + '</span>'
              : '') +
            '</div>' +
            '<div class="dashboard-order-notify-bubble-foot">' +
            (when ? '<time>' + escapeHtml(when) + '</time>' : '') +
            receiptTicksMarkup(receipt) +
            '</div>' +
            '</li>'
          );
        })
        .join('') +
      '</ul>'
    );
  }

  function notifyApiBase() {
    var cfg = window.NOTIFY_CONFIG || {};
    var raw = String(cfg.apiUrl || '').replace(/\/+$/, '');
    if (raw) return raw;
    var service = String(cfg.serviceUrl || 'https://notify.ttmenus.com').replace(/\/+$/, '');
    return service + '/api/v1';
  }

  function notifyClientDomain() {
    var cfg = window.NOTIFY_CONFIG || {};
    return String(cfg.clientDomain || (window.location && window.location.hostname) || '')
      .replace(/^www\./i, '')
      .trim();
  }

  function notifyAuthHeaders() {
    var token = '';
    try {
      if (window.AuthClient && typeof window.AuthClient.getAccessToken === 'function') {
        token = window.AuthClient.getAccessToken() || '';
      }
    } catch (_) {}
    var headers = { Accept: 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    return headers;
  }

  async function fetchNotificationReceipt(notificationId) {
    var id = String(notificationId || '').trim();
    if (!id) return null;
    if (notifyReceiptById[id] && notifyReceiptById[id].loaded) return notifyReceiptById[id];
    var base = notifyApiBase();
    if (!base) return null;
    try {
      var res = await fetch(base + '/notifications/' + encodeURIComponent(id), {
        method: 'GET',
        credentials: 'include',
        headers: notifyAuthHeaders(),
      });
      var data = null;
      try {
        data = await res.json();
      } catch (_) {
        data = null;
      }
      if (!res.ok) return null;
      var report = (data && data.report) || {};
      var notification = (data && data.notification) || {};
      var fallback = notification.status || 'sent';
      if (Number(report.opened) > 0 || Number(report.clicked) > 0) fallback = 'read';
      else if (Number(report.received) > 0 || Number(report.sent) > 0) fallback = 'delivered';
      else if (Number(report.failed) > 0 && !Number(report.sent)) fallback = 'failed';
      var receipt = bestReceiptFromDeliveries(data && data.deliveries, fallback);
      receipt.loaded = true;
      notifyReceiptById[id] = receipt;
      return receipt;
    } catch (_) {
      return null;
    }
  }

  async function loadReceiptsForOrder(orderId) {
    var items = notifyByOrderId[orderId] || [];
    if (!items.length) return;
    await Promise.all(
      items.map(function (n) {
        return fetchNotificationReceipt(n && n.id);
      })
    );
    paintNotifyHistories();
  }

  async function fetchOrderNotifications(orders) {
    var domain = notifyClientDomain();
    var base = notifyApiBase();
    if (!domain || !base) return;
    var seq = ++notifyLoadSeq;
    try {
      var res = await fetch(
        base + '/notifications?client_domain=' + encodeURIComponent(domain) + '&limit=100',
        {
          method: 'GET',
          credentials: 'include',
          headers: notifyAuthHeaders(),
        }
      );
      var data = null;
      try {
        data = await res.json();
      } catch (_) {
        data = null;
      }
      if (seq !== notifyLoadSeq || !res.ok) return;
      var items = (data && (data.notifications || data.items || data.data)) || [];
      var next = {};
      (Array.isArray(orders) ? orders : []).forEach(function (o) {
        if (o && o.id) next[o.id] = [];
      });
      items.forEach(function (n) {
        var dataMap = (n && n.data) || {};
        var oid = String(dataMap.order_id || dataMap.orderId || '').trim();
        if (!oid) return;
        if (!next[oid]) next[oid] = [];
        next[oid].push(n);
      });
      Object.keys(next).forEach(function (id) {
        next[id].sort(function (a, b) {
          var ta = new Date(a.created_at || a.createdAt || 0).getTime();
          var tb = new Date(b.created_at || b.createdAt || 0).getTime();
          return tb - ta;
        });
      });
      notifyByOrderId = next;
      paintNotifyHistories();
      Object.keys(notifyOpenByOrderId).forEach(function (orderId) {
        if (notifyOpenByOrderId[orderId]) loadReceiptsForOrder(orderId);
      });
    } catch (_) {}
  }

  function paintNotifyHistories() {
    var host = $('ttms-orders-list');
    if (!host) return;
    host.querySelectorAll('[data-order-notify]').forEach(function (wrap) {
      var id = wrap.getAttribute('data-order-notify');
      if (!id) return;
      var open = !!notifyOpenByOrderId[id];
      wrap.classList.toggle('is-open', open);
      wrap.classList.toggle('is-collapsed', !open);
      var toggle = wrap.querySelector('[data-act="notify-toggle"]');
      if (toggle) {
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        var countEl = toggle.querySelector('[data-notify-count]');
        var items = notifyByOrderId[id] || [];
        if (countEl) countEl.textContent = String(items.length);
      }
      var body = wrap.querySelector('[data-order-notify-body]');
      if (body) body.hidden = !open;
      var history = wrap.querySelector('[data-order-notify-history]');
      if (history) history.innerHTML = renderNotifyHistory(id);
    });
  }

  function setNotifyPanelOpen(orderId, open) {
    notifyOpenByOrderId[orderId] = !!open;
    paintNotifyHistories();
    if (open) loadReceiptsForOrder(orderId);
  }

  function renderTicket(o, enter) {
    var cartLines = parseCart(o);
    var lines = cartLines.length
      ? cartLines
          .map(function (l) {
            return '<li>' + escapeHtml(lineLabel(l)) + '</li>';
          })
          .join('')
      : '<li class="dashboard-order-lines-empty">No items listed</li>';
    var fulfill = fulfillmentMeta(o);
    var adapters = adapterChips(o)
      .map(function (chip) {
        return (
          '<span class="dashboard-order-adapter' +
          (chip.kind ? ' dashboard-order-adapter--' + chip.kind : '') +
          '">' +
          escapeHtml(chip.text) +
          '</span>'
        );
      })
      .join('');
    var paidDisabled = o.status === 'paid' || o.status === 'cancelled' ? ' disabled' : '';
    var readyDisabled = o.status !== 'open' && o.status !== 'ready' ? ' disabled' : '';
    var cancelDisabled = o.status === 'paid' || o.status === 'cancelled' ? ' disabled' : '';
    var canNotify = !!o.customer_user_id;
    var status = o.status || 'open';
    return (
      '<article class="dashboard-order-ticket dashboard-order-ticket--' +
      escapeHtml(status) +
      (enter ? ' is-entering' : '') +
      '" data-id="' +
      escapeHtml(o.id) +
      '" data-customer-user-id="' +
      escapeHtml(o.customer_user_id || '') +
      '">' +
      '<div class="dashboard-order-ticket-head">' +
      '<strong class="dashboard-order-ticket-ref">#' +
      escapeHtml(o.ticket_number || o.order_ref) +
      '</strong>' +
      '<span class="dashboard-order-status dashboard-order-status--' +
      escapeHtml(status) +
      '">' +
      escapeHtml(statusLabel(status)) +
      '</span>' +
      '</div>' +
      '<p class="dashboard-order-meta">' +
      '<span class="dashboard-order-chip dashboard-order-chip--' +
      escapeHtml(fulfill.kind) +
      '">' +
      escapeHtml(fulfill.label) +
      '</span>' +
      (o.customer_name
        ? '<span class="dashboard-order-chip">' + escapeHtml(o.customer_name) + '</span>'
        : o.customer_email
          ? '<span class="dashboard-order-chip">' + escapeHtml(o.customer_email) + '</span>'
          : '') +
      '<span class="dashboard-order-total">' +
      escapeHtml(moneyLabel(o)) +
      '</span>' +
      '</p>' +
      '<ul class="dashboard-order-lines">' +
      lines +
      '</ul>' +
      (o.notes ? '<p class="dashboard-order-notes">' + escapeHtml(o.notes) + '</p>' : '') +
      (o.cancel_reason
        ? '<p class="dashboard-order-notes dashboard-order-notes--reject">' +
          escapeHtml(o.cancel_reason) +
          '</p>'
        : '') +
      (adapters ? '<p class="dashboard-order-adapters">' + adapters + '</p>' : '') +
      '<div class="dashboard-order-notify ' +
      (notifyOpenByOrderId[o.id] ? 'is-open' : 'is-collapsed') +
      '" data-order-notify="' +
      escapeHtml(o.id) +
      '">' +
      '<button type="button" class="dashboard-order-notify-toggle" data-act="notify-toggle" aria-expanded="' +
      (notifyOpenByOrderId[o.id] ? 'true' : 'false') +
      '">' +
      '<span class="dashboard-order-notify-title">Customer alerts</span>' +
      '<span class="dashboard-order-notify-count" data-notify-count>' +
      (notifyByOrderId[o.id] || []).length +
      '</span>' +
      '<span class="dashboard-order-notify-chevron" aria-hidden="true"><i class="fa fa-chevron-down"></i></span>' +
      '</button>' +
      '<div class="dashboard-order-notify-body" data-order-notify-body' +
      (notifyOpenByOrderId[o.id] ? '' : ' hidden') +
      '>' +
      '<div class="dashboard-order-notify-history" data-order-notify-history="' +
      escapeHtml(o.id) +
      '">' +
      renderNotifyHistory(o.id) +
      '</div>' +
      (canNotify
        ? '<form class="dashboard-order-notify-form" data-act-form="notify">' +
          '<label class="visually-hidden" for="order-notify-' +
          escapeHtml(o.id) +
          '">Message to customer</label>' +
          '<input id="order-notify-' +
          escapeHtml(o.id) +
          '" class="dashboard-order-notify-input" type="text" maxlength="280" placeholder="Personal message to customer" required />' +
          '<button type="submit" class="btn-dash btn-dash-secondary" data-act="notify">Send</button>' +
          '</form>'
        : '<p class="dashboard-order-notify-empty">Guest checkout — no push inbox for a personal alert.</p>') +
      '</div>' +
      '</div>' +
      '<div class="dashboard-order-actions">' +
      '<button type="button" class="btn-dash btn-dash-secondary" data-act="ready"' +
      readyDisabled +
      '>Ready</button>' +
      '<button type="button" class="btn-dash btn-dash-primary" data-act="charge"' +
      paidDisabled +
      '>Charge</button>' +
      '<button type="button" class="btn-dash btn-dash-secondary" data-act="reprint">Reprint</button>' +
      (o.loyverse_receipt_mode && o.loyverse_receipt_mode !== 'off' && !o.loyverse_receipt_number
        ? '<button type="button" class="btn-dash btn-dash-secondary" data-act="loyverse-resend">' +
          (o.loyverse_receipt_status === 'queued' ? 'Retry Loyverse' : 'Send to Loyverse') +
          '</button>'
        : '') +
      '<button type="button" class="btn-dash btn-dash-secondary" data-act="cancel"' +
      cancelDisabled +
      '>Cancel</button>' +
      '</div>' +
      '</article>'
    );
  }

  function renderOrders(orders, opts) {
    opts = opts || {};
    var host = $('ttms-orders-list');
    if (!host) return;
    host.removeAttribute('aria-busy');
    if (!orders || !orders.length) {
      host.innerHTML =
        '<p class="dashboard-orders-empty' +
        (opts.animateAll && !prefersReducedMotion() ? ' is-entering' : '') +
        '">No tickets yet.</p>';
      knownIds = {};
      return;
    }
    var groups = groupOrdersByLocation(orders);
    if (!groups.length) {
      host.innerHTML =
        '<p class="dashboard-orders-empty' +
        (opts.animateAll && !prefersReducedMotion() ? ' is-entering' : '') +
        '">No tickets at this location.</p>';
      knownIds = {};
      return;
    }
    var motion = !prefersReducedMotion();
    var nextKnown = {};
    host.innerHTML = groups
      .map(function (group, groupIndex) {
        var meta = group.meta;
        var count = group.orders.length;
        var locKey = 'loc:' + (meta.slug || '__none__');
        var locEnter = motion && (opts.animateAll || !knownIds[locKey]);
        nextKnown[locKey] = 1;
        var tickets = count
          ? group.orders
              .map(function (o, ticketIndex) {
                nextKnown[o.id] = 1;
                var enter = motion && (opts.animateAll || !knownIds[o.id]);
                var html = renderTicket(o, enter);
                if (!enter) return html;
                return html.replace(
                  'class="dashboard-order-ticket',
                  'style="--orders-in-delay: ' +
                    (90 + groupIndex * 90 + ticketIndex * 70) +
                    'ms" class="dashboard-order-ticket'
                );
              })
              .join('')
          : '<p class="dashboard-orders-empty">No tickets at this location.</p>';
        return (
          '<section class="dashboard-orders-location' +
          (locEnter ? ' is-entering' : '') +
          '" data-location="' +
          escapeHtml(meta.slug) +
          '"' +
          (locEnter ? ' style="--orders-in-delay: ' + groupIndex * 70 + 'ms"' : '') +
          '>' +
          '<div class="dashboard-orders-location-head">' +
          '<div class="dashboard-orders-location-copy">' +
          '<h3 class="dashboard-orders-location-title">' +
          escapeHtml(meta.title) +
          '</h3>' +
          (meta.subtitle
            ? '<p class="dashboard-orders-location-sub">' + escapeHtml(meta.subtitle) + '</p>'
            : '') +
          '</div>' +
          '<span class="dashboard-orders-location-count">' +
          count +
          ' ticket' +
          (count === 1 ? '' : 's') +
          '</span>' +
          '</div>' +
          '<div class="dashboard-orders-location-list">' +
          tickets +
          '</div>' +
          '</section>'
        );
      })
      .join('');
    knownIds = nextKnown;
  }

  async function refresh(opts) {
    opts = opts || {};
    var silent = !!opts.silent;
    var statusEl = $('dashboardOrdersStatus');
    var host = $('ttms-orders-list');
    if (!window.OrderClient || typeof window.OrderClient.listClient !== 'function') {
      if (statusEl) statusEl.textContent = 'Order client failed to load. Hard-refresh this page.';
      return;
    }
    if (silent && ticketBusy) return;
    var seq = ++refreshSeq;
    var hasTickets = !!(host && host.querySelector('.dashboard-order-ticket'));
    if (!silent) {
      setRefreshing(true);
      if (!hasTickets) showThrobber();
    }
    try {
      var filter = selectedOrdersStatus();
      var location = ($('dashboardOrdersLocation') && $('dashboardOrdersLocation').value) || '';
      var res = await window.OrderClient.listClient({ status: filter, location: location });
      if (seq !== refreshSeq) return;
      if (silent && ticketBusy) return;
      var orders = res && res.orders ? res.orders : [];
      var fingerprint = ordersFingerprint(orders, filter, location);
      if (silent && fingerprint === lastFingerprint) return;
      lastOrdersCache = orders;
      renderOrders(orders, { animateAll: !silent && !opts.preserve });
      lastFingerprint = fingerprint;
      fetchOrderNotifications(orders);
      if (statusEl) {
        statusEl.textContent = orders.length
          ? orders.length + ' ticket' + (orders.length === 1 ? '' : 's')
          : 'No tickets yet. Place an order from the menu while signed in.';
      }
    } catch (e) {
      if (seq !== refreshSeq) return;
      if (host && !host.querySelector('.dashboard-order-ticket')) host.innerHTML = '';
      if (statusEl) statusEl.textContent = e.message || 'Could not load orders';
    } finally {
      if (!silent && seq === refreshSeq) setRefreshing(false);
    }
  }

  function findCachedOrder(id) {
    for (var i = 0; i < lastOrdersCache.length; i++) {
      if (lastOrdersCache[i] && lastOrdersCache[i].id === id) return lastOrdersCache[i];
    }
    return null;
  }

  async function onNotifySubmit(e) {
    var form = e.target.closest('[data-act-form="notify"]');
    if (!form) return;
    e.preventDefault();
    var card = form.closest('[data-id]');
    if (!card) return;
    var id = card.getAttribute('data-id');
    var input = form.querySelector('.dashboard-order-notify-input');
    var btn = form.querySelector('[data-act="notify"]');
    var message = input ? String(input.value || '').trim() : '';
    if (!message) {
      if (input) input.focus();
      return;
    }
    if (btn) btn.disabled = true;
    try {
      var order = findCachedOrder(id);
      var title =
        'Message from ' +
        String((order && order.restaurant_name) || 'the restaurant').trim();
      await window.OrderClient.notifyCustomer(id, { title: title, message: message });
      if (input) input.value = '';
      var statusEl = $('dashboardOrdersStatus');
      if (statusEl) statusEl.textContent = 'Personal alert sent for #' + (order && (order.ticket_number || order.order_ref) || id);
      notifyOpenByOrderId[id] = true;
      if (!notifyByOrderId[id]) notifyByOrderId[id] = [];
      var localId = 'local-' + Date.now();
      notifyByOrderId[id].unshift({
        id: localId,
        title: title,
        message: message,
        type: 'order',
        status: 'sent',
        created_at: new Date().toISOString(),
        data: { order_id: id, action: 'staff_message' },
      });
      notifyReceiptById[localId] = { status: 'sent', loaded: true };
      paintNotifyHistories();
      await fetchOrderNotifications(lastOrdersCache);
      await refresh({ preserve: true });
    } catch (err) {
      alert(err.message || 'Could not send alert');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function onAction(e) {
    var form = e.target.closest('[data-act-form="notify"]');
    if (form && e.target.closest('[data-act="notify"]') && e.type === 'click') {
      // Let the form submit handler run.
      return;
    }
    var btn = e.target.closest('[data-act]');
    if (!btn || btn.getAttribute('data-act') === 'notify') return;
    var card = btn.closest('[data-id]');
    if (!card) return;
    var id = card.getAttribute('data-id');
    var act = btn.getAttribute('data-act');
    if (act === 'notify-toggle') {
      setNotifyPanelOpen(id, !notifyOpenByOrderId[id]);
      return;
    }
    var needsConfirm = act === 'charge' || act === 'cancel';
    if (needsConfirm && !ticketActionConfirm(card, act)) return;
    btn.disabled = true;
    if (needsConfirm) {
      ticketBusy += 1;
      card.classList.add('is-charging');
    }
    try {
      if (act === 'ready') await window.OrderClient.ready(id);
      if (act === 'charge') await window.OrderClient.charge(id);
      if (act === 'reprint') await window.OrderClient.reprint(id);
      if (act === 'loyverse-resend') {
        var order = findCachedOrder(id);
        var enriched = enrichCartVariants(parseCart(order || { id: id }));
        await window.OrderClient.resendLoyverse(id, enriched.length ? enriched : undefined);
      }
      if (act === 'cancel') await window.OrderClient.cancel(id, '');
      if (needsConfirm) await playTicketOutcome(card, act, true);
      await refresh({ preserve: true });
    } catch (err) {
      if (needsConfirm) {
        await playTicketOutcome(card, act, false);
        var statusEl = $('dashboardOrdersStatus');
        if (statusEl) {
          statusEl.textContent =
            err.message || (act === 'cancel' ? 'Cancel failed' : 'Charge failed');
        }
      } else {
        alert(err.message || 'Action failed');
      }
      btn.disabled = false;
    } finally {
      if (needsConfirm) {
        ticketBusy = Math.max(0, ticketBusy - 1);
        card.classList.remove('is-charging');
      }
    }
  }

  async function init() {
    if (!window.AuthClientAccess || !(await AuthClientAccess.protectAdminPage({ redirectUrl: '/dashboard/', showError: true }))) {
      return;
    }
    var list = $('ttms-orders-list');
    if (list) {
      list.addEventListener('click', onAction);
      list.addEventListener('submit', onNotifySubmit);
    }
    var refreshBtn = $('ttms-orders-refresh');
    if (refreshBtn) refreshBtn.addEventListener('click', refresh);
    var filter = $('dashboardOrdersFilter');
    if (filter) filter.addEventListener('click', onOrdersStatusFilterClick);
    var location = $('dashboardOrdersLocation');
    if (location) location.addEventListener('change', refresh);
    fillLocationFilter();
    await refresh();
    pollTimer = setInterval(function () {
      refresh({ silent: true });
    }, 4000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  window.addEventListener('beforeunload', function () {
    if (pollTimer) clearInterval(pollTimer);
  });
})();
