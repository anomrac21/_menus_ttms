/**
 * Control-room card counts: open orders, delivery jobs, and mirrored snapshots.
 */
(function (global) {
  'use strict';

  var POLL_MS = 20000;
  var COUNT_IDS = [
    'dashboardCardOrdersCount',
    'dashboardOrdersHubInboxCount',
    'dashboardOrdersLinkInboxCount',
    'dashboardOrdersLinkKitchenCount',
    'dashboardCardDeliveryCount',
    'dashboardCardPaymentsCount',
    'dashboardCardEditMenuCount',
    'dashboardMenuHubPublishCount',
    'dashboardCardMenuImagesCount',
    'dashboardCardAnalyticsCount',
    'dashboardCardNotifyCount',
    'dashboardCardOrderingCount',
  ];

  function $(id) {
    return document.getElementById(id);
  }

  function prefersReducedMotion() {
    return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function parseCount(text) {
    var m = String(text == null ? '' : text).replace(/,/g, '').match(/(\d+)/);
    return m ? parseInt(m[1], 10) : NaN;
  }

  function playReveal(el, firstPaint) {
    if (prefersReducedMotion()) return;
    el.classList.remove('is-bump', 'is-reveal');
    void el.offsetWidth;
    el.classList.add(firstPaint ? 'is-reveal' : 'is-bump');
  }

  function animateCount(el, from, to, done) {
    if (el._countRaf) {
      global.cancelAnimationFrame(el._countRaf);
      el._countRaf = 0;
    }
    if (prefersReducedMotion() || from === to) {
      el.textContent = String(to);
      if (done) done();
      return;
    }
    var duration = Math.min(820, 320 + Math.abs(to - from) * 36);
    var start = global.performance && performance.now ? performance.now() : Date.now();
    function tick(now) {
      var t = Math.min(1, (now - start) / duration);
      var eased = 1 - Math.pow(1 - t, 3);
      el.textContent = String(Math.round(from + (to - from) * eased));
      if (t < 1) {
        el._countRaf = global.requestAnimationFrame(tick);
      } else {
        el._countRaf = 0;
        el.textContent = String(to);
        if (done) done();
      }
    }
    el._countRaf = global.requestAnimationFrame(tick);
  }

  function setCount(id, n) {
    var el = $(id);
    if (!el || n == null || isNaN(n)) return;
    var next = String(n);
    var prevAttr = el.getAttribute('data-count');
    var firstPaint = el.classList.contains('is-loading') || prevAttr === null;
    var from = prevAttr !== null ? parseInt(prevAttr, 10) : 0;
    if (isNaN(from)) from = 0;
    if (!firstPaint && prevAttr === next) {
      el.textContent = next;
      return;
    }
    el.classList.remove('is-loading');
    el.removeAttribute('aria-busy');
    el.setAttribute('data-count', next);
    el.classList.toggle('is-hot', n > 0);
    el.classList.toggle('is-zero', n === 0);
    var card = el.closest('.card');
    if (card) card.classList.toggle('has-hot-count', !!card.querySelector('.dashboard-card-count.is-hot'));
    playReveal(el, firstPaint);
    animateCount(el, firstPaint ? 0 : from, n);
  }

  function setUnavailable(id) {
    var el = $(id);
    if (!el || el.getAttribute('data-count') !== null) return;
    el.classList.remove('is-loading', 'is-hot', 'is-zero', 'is-bump', 'is-reveal');
    el.removeAttribute('aria-busy');
    el.textContent = '';
  }

  function sourceReady(raw) {
    raw = (raw || '').trim();
    if (!raw || raw === '' || raw === 'Checking…') return false;
    return true;
  }

  function mirror(srcId, destId, emptyIsZero) {
    var src = $(srcId);
    if (!src) {
      setCount(destId, 0);
      return;
    }
    function sync() {
      var raw = (src.textContent || '').trim();
      if (!sourceReady(raw)) return;
      if (/^no\b/i.test(raw) || /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(raw)) {
        setCount(destId, 0);
        return;
      }
      var n = parseCount(raw);
      if (!isNaN(n)) setCount(destId, n);
      else if (emptyIsZero) setCount(destId, 0);
    }
    sync();
    new MutationObserver(sync).observe(src, { childList: true, characterData: true, subtree: true });
  }

  function locationCount() {
    var cfg = global.MENU_CONFIG || {};
    var locs = Array.isArray(cfg.locations) ? cfg.locations : [];
    return locs.filter(function (loc) {
      return loc && loc.slug;
    }).length;
  }

  function isOpenDelivery(order) {
    var s = String((order && order.status) || '').toLowerCase();
    return !!s && !/^(delivered|completed|complete|cancelled|canceled|expired|rejected|failed|closed)$/.test(s);
  }

  var DELIVERY_LABEL = {
    awaiting_drivers: 'Finding drivers',
    requested: 'Finding drivers',
    driver_offers: 'Drivers available',
    offered: 'Drivers available',
    driver_selected: 'Driver selected',
    accepted: 'Driver accepted',
    awaiting_client: 'Needs review',
    payment_pending: 'Payment needed',
    preparing: 'Kitchen preparing',
    ready: 'Ready for pickup',
    picked_up: 'Picked up',
    delivering: 'On the way',
    paid: 'Paid',
  };

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function deliveryLabel(status) {
    var key = String(status || '').toLowerCase();
    return DELIVERY_LABEL[key] || key.replace(/_/g, ' ') || 'Open';
  }

  function paintActiveDeliveries(orders) {
    var open = (orders || []).filter(isOpenDelivery);
    var status = $('dashboardCardDeliveryStatus');
    var list = $('dashboardDeliveryActive');
    var empty = $('dashboardDeliveryActiveEmpty');
    if (status && status.textContent !== 'Off') {
      status.textContent = open.length ? String(open.length) : 'None';
    }
    if (!list) return;
    if (!open.length) {
      list.hidden = true;
      list.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    var html = open.slice(0, 8).map(function (order) {
      var name = order.customer_name || order.customer_email || 'Customer';
      var place = order.dropoff_address || '';
      var money = order.total == null || order.total === ''
        ? ''
        : String(order.total) + (order.currency ? ' ' + order.currency : '');
      var meta = [place, money].filter(Boolean).join(' · ');
      return (
        '<li>' +
        '<a class="dashboard-delivery-active-row" href="/delivery-orders/" data-id="' + escapeHtml(order.id) + '">' +
        '<span class="dashboard-delivery-active-status">' + escapeHtml(deliveryLabel(order.status)) + '</span>' +
        '<span class="dashboard-delivery-active-copy">' +
        '<strong>' + escapeHtml(name) + '</strong>' +
        (meta ? '<span>' + escapeHtml(meta) + '</span>' : '') +
        '</span>' +
        '</a></li>'
      );
    }).join('');
    if (list.getAttribute('data-sig') === html) {
      list.hidden = false;
      return;
    }
    list.setAttribute('data-sig', html);
    list.innerHTML = html;
    list.hidden = false;
  }

  function setOrdersCount(n) {
    setCount('dashboardCardOrdersCount', n);
    setCount('dashboardOrdersHubInboxCount', n);
    setCount('dashboardOrdersLinkInboxCount', n);
  }

  async function loadOrders() {
    if (!global.OrderClient || typeof global.OrderClient.listClient !== 'function') {
      setOrdersCount(0);
      return;
    }
    try {
      var res = await global.OrderClient.listClient({});
      var orders = (res && res.orders) || [];
      setOrdersCount(orders.length);
    } catch (_) {
      setUnavailable('dashboardCardOrdersCount');
      setUnavailable('dashboardOrdersHubInboxCount');
      setUnavailable('dashboardOrdersLinkInboxCount');
    }
  }

  async function loadKitchen() {
    if (!global.OrderClient || typeof global.OrderClient.kitchenPending !== 'function') {
      setCount('dashboardOrdersLinkKitchenCount', 0);
      return;
    }
    try {
      var res = await global.OrderClient.kitchenPending();
      var orders = (res && res.orders) || [];
      setCount('dashboardOrdersLinkKitchenCount', orders.length);
    } catch (_) {
      setUnavailable('dashboardOrdersLinkKitchenCount');
    }
  }

  var deliveryWait = 0;

  async function loadDelivery() {
    if (!global.DeliveryClient || typeof global.DeliveryClient.listClientOrders !== 'function') {
      if (deliveryWait < 8) {
        deliveryWait += 1;
        setTimeout(loadDelivery, 250);
      }
      return;
    }
    if (!global.DeliveryClient.enabled()) {
      setCount('dashboardCardDeliveryCount', 0);
      return;
    }
    try {
      var res = await global.DeliveryClient.listClientOrders();
      var orders = (res && (res.orders || res)) || [];
      if (!Array.isArray(orders)) orders = [];
      var open = orders.filter(isOpenDelivery);
      setCount('dashboardCardDeliveryCount', open.length);
      paintActiveDeliveries(open);
    } catch (_) {
      setCount('dashboardCardDeliveryCount', 0);
      paintActiveDeliveries([]);
    }
  }

  var paymentWait = 0;

  function paymentMoney(amount) {
    var n = Number(amount);
    if (!isFinite(n)) n = 0;
    return n.toFixed(2);
  }

  function paymentStamp(value) {
    var t = Date.parse(value || '');
    if (isNaN(t)) return '';
    try {
      return new Date(t).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch (e) {
      return '';
    }
  }

  function paymentPlace(order) {
    var kind = String((order && order.fulfillment) || '').toLowerCase();
    if (kind === 'dine_in') kind = 'Dine in';
    else if (kind === 'takeaway') kind = 'Takeaway';
    else if (kind === 'delivery') kind = 'Delivery';
    else kind = kind.replace(/_/g, ' ');
    var loc = String((order && order.location_slug) || '').replace(/-/g, ' ');
    return [kind, loc].filter(Boolean).join(' · ');
  }

  function paintPayments(orders) {
    var list = $('dashboardPaymentsList');
    var empty = $('dashboardPaymentsEmpty');
    var totalEl = $('dashboardPaymentsTotal');
    var rows = (orders || []).slice().sort(function (a, b) {
      return Date.parse((b && (b.paid_at || b.updated_at)) || 0) - Date.parse((a && (a.paid_at || a.updated_at)) || 0);
    });
    var totals = {};
    rows.forEach(function (order) {
      var currency = String((order && order.currency) || 'TTD');
      totals[currency] = (totals[currency] || 0) + Number(order && order.total);
    });
    var totalText = Object.keys(totals).map(function (currency) {
      return paymentMoney(totals[currency]) + ' ' + currency;
    }).join(' · ');
    if (totalEl) totalEl.textContent = rows.length ? totalText : 'None';
    if (!list) return;
    if (!rows.length) {
      list.hidden = true;
      list.innerHTML = '';
      list.removeAttribute('data-sig');
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    var html = rows.slice(0, 40).map(function (order) {
      var ticket = order.ticket_number || order.order_ref || String(order.id || '').slice(0, 8);
      var who = order.customer_name || 'Guest';
      var place = paymentPlace(order);
      var when = paymentStamp(order.paid_at || order.updated_at);
      var meta = [place, when].filter(Boolean).join(' · ');
      return (
        '<li>' +
        '<div class="dashboard-payments-row">' +
        '<span class="dashboard-payments-amount">' + escapeHtml(paymentMoney(order.total) + ' ' + (order.currency || 'TTD')) + '</span>' +
        '<span class="dashboard-payments-copy">' +
        '<strong>' + escapeHtml(who) + (ticket ? ' · ' + escapeHtml(ticket) : '') + '</strong>' +
        (meta ? '<span>' + escapeHtml(meta) + '</span>' : '') +
        '</span></div></li>'
      );
    }).join('');
    if (list.getAttribute('data-sig') === html) {
      list.hidden = false;
      return;
    }
    list.setAttribute('data-sig', html);
    list.innerHTML = html;
    list.hidden = false;
  }

  function paymentsHubKey() {
    var id = global.SITE_CLIENT_ID || global.CLIENT_ID || 'site';
    return 'ttms.dashboard.paymentsHub.' + String(id);
  }

  function openPaymentsHub(name) {
    var root = $('dashboardPaymentsHub');
    if (!root) return;
    if (name !== 'transfer' && name !== 'settings') name = 'overview';
    var tabs = root.querySelectorAll('[data-payments-hub]');
    var panels = root.querySelectorAll('[data-payments-hub-panel]');
    var i;
    for (i = 0; i < tabs.length; i++) {
      var on = tabs[i].getAttribute('data-payments-hub') === name;
      tabs[i].classList.toggle('is-active', on);
      tabs[i].setAttribute('aria-selected', on ? 'true' : 'false');
    }
    for (i = 0; i < panels.length; i++) {
      var show = panels[i].getAttribute('data-payments-hub-panel') === name;
      if (show) panels[i].removeAttribute('hidden');
      else panels[i].setAttribute('hidden', '');
    }
    try {
      localStorage.setItem(paymentsHubKey(), name);
    } catch (err) {}
  }

  function bindPaymentsHub() {
    var root = $('dashboardPaymentsHub');
    if (!root || root.getAttribute('data-hub-bound')) return;
    root.setAttribute('data-hub-bound', '1');
    root.addEventListener('click', function (ev) {
      var tab = ev.target.closest('[data-payments-hub]');
      if (!tab || !root.contains(tab)) return;
      openPaymentsHub(tab.getAttribute('data-payments-hub'));
    });
    var saved = 'overview';
    try {
      saved = localStorage.getItem(paymentsHubKey()) || 'overview';
    } catch (err) {}
    openPaymentsHub(saved);
    var openSettings = $('dashboardPaymentsOpenSettings');
    if (openSettings && !openSettings.getAttribute('data-bound')) {
      openSettings.setAttribute('data-bound', '1');
      openSettings.addEventListener('click', function () {
        openPaymentsHub('settings');
      });
    }
  }

  function paintPayout(status) {
    var banks = document.querySelectorAll('.dashboard-payments-bank');
    var ready = $('dashboardPaymentsReady');
    var openSettings = $('dashboardPaymentsOpenSettings');
    var btn = $('dashboardPaymentsTransferBtn');
    var note = $('dashboardPaymentsTransferNote');
    var last4 = status && status.bank_account_last4;
    var requested = status && status.transfer_state === 'requested';
    var outstanding = Number(status && status.outstanding);
    if (!isFinite(outstanding)) outstanding = 0;
    var when = (status && status.next_batch) || '';
    var currency = (status && status.currency) || 'TTD';
    var bankText = last4 ? [status.bank_name, '····' + last4].filter(Boolean).join(' · ') : '';
    var bankSelect = document.querySelector('#dashboardPaymentsAccount select[name="bank_name"]');
    if (bankSelect && status && status.bank_name) {
      var savedBank = String(status.bank_name);
      var known = false;
      Array.prototype.forEach.call(bankSelect.options, function (option) {
        if (option.value === savedBank) known = true;
      });
      if (!known) {
        var extra = document.createElement('option');
        extra.value = savedBank;
        extra.textContent = savedBank;
        bankSelect.appendChild(extra);
      }
      var current = bankSelect.value;
      var previous = bankSelect.getAttribute('data-saved') || '';
      if (!current || current === previous) {
        bankSelect.value = savedBank;
        bankSelect.setAttribute('data-saved', savedBank);
      }
    }
    Array.prototype.forEach.call(banks, function (bank) {
      bank.hidden = !last4;
      bank.textContent = bankText;
    });
    if (ready) ready.textContent = paymentMoney(outstanding) + ' ' + currency;
    if (openSettings) openSettings.hidden = !!last4;
    if (btn) {
      btn.hidden = !last4 || (outstanding <= 0 && !requested);
      btn.disabled = !!requested;
      btn.textContent = requested ? 'Transfer requested' : 'Request transfer';
    }
    if (note) {
      if (!last4) {
        note.hidden = false;
        note.textContent = 'Add a bank account in Settings before requesting a transfer.';
      } else if (requested && when) {
        note.hidden = false;
        note.textContent = 'Included in the ' + when + ' bank email with every restaurant who requested.';
      } else if (outstanding > 0 && when) {
        note.hidden = false;
        note.textContent = 'Bank emails go out at 9:00 AM, 1:00 PM, and 5:00 PM. Next one is ' + when + '.';
      } else {
        note.hidden = false;
        note.textContent = 'Collected payments already sent to the bank stay off this request.';
      }
    }
  }

  function bindPayout() {
    var form = $('dashboardPaymentsAccount');
    var btn = $('dashboardPaymentsTransferBtn');
    if (form && !form.getAttribute('data-bound')) {
      form.setAttribute('data-bound', '1');
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        if (!global.OrderClient || typeof global.OrderClient.savePayoutAccount !== 'function') return;
        var data = new FormData(form);
        var submit = form.querySelector('button[type="submit"]');
        if (submit) submit.disabled = true;
        global.OrderClient.savePayoutAccount({
          bank_name: data.get('bank_name'),
          bank_account_name: data.get('bank_account_name'),
          bank_account: data.get('bank_account'),
          restaurant_name: form.getAttribute('data-restaurant') || '',
        }).then(function (status) {
          form.reset();
          paintPayout(status);
          openPaymentsHub('transfer');
        }).catch(function (err) {
          var note = $('dashboardPaymentsTransferNote');
          if (note) {
            note.hidden = false;
            note.textContent = (err && err.message) || 'Could not save the account';
          }
        }).finally(function () {
          if (submit) submit.disabled = false;
        });
      });
    }
    if (btn && !btn.getAttribute('data-bound')) {
      btn.setAttribute('data-bound', '1');
      btn.addEventListener('click', function () {
        if (!global.OrderClient || typeof global.OrderClient.requestPayout !== 'function') return;
        btn.disabled = true;
        global.OrderClient.requestPayout().then(function (status) {
          paintPayout(status);
        }).catch(function (err) {
          btn.disabled = false;
          var note = $('dashboardPaymentsTransferNote');
          if (note) {
            note.hidden = false;
            note.textContent = (err && err.message) || 'Could not request the transfer';
          }
        });
      });
    }
  }

  async function loadPayments() {
    if (!global.OrderClient || typeof global.OrderClient.listClient !== 'function') {
      if (paymentWait < 8) {
        paymentWait += 1;
        setTimeout(loadPayments, 250);
      }
      return;
    }
    try {
      var res = await global.OrderClient.listClient({ status: 'paid' });
      var orders = (res && res.orders) || [];
      if (!Array.isArray(orders)) orders = [];
      setCount('dashboardCardPaymentsCount', orders.length);
      paintPayments(orders);
      if (typeof global.OrderClient.getPayout === 'function') {
        try {
          paintPayout(await global.OrderClient.getPayout());
        } catch (_) {}
      }
    } catch (_) {
      setCount('dashboardCardPaymentsCount', 0);
      paintPayments([]);
    }
  }

  function loadStatic() {
    setCount('dashboardCardOrderingCount', locationCount());
    mirror('dashboardCardMenuImagesPending', 'dashboardCardMenuImagesCount', true);
    mirror('dashboardCardAnalyticsVisits', 'dashboardCardAnalyticsCount', false);
    mirror('dashboardCardNotifySubs', 'dashboardCardNotifyCount', false);
    mirror('dashboardDraftBlockSummary', 'dashboardCardEditMenuCount', true);
    mirror('dashboardDraftBlockSummary', 'dashboardMenuHubPublishCount', true);
  }

  async function refresh() {
    await Promise.all([loadOrders(), loadKitchen(), loadDelivery(), loadPayments()]);
  }

  function init() {
    COUNT_IDS.forEach(function (id) {
      var el = $(id);
      if (!el || el.getAttribute('data-count') !== null) return;
      el.classList.add('is-loading');
      el.setAttribute('aria-busy', 'true');
      el.textContent = '';
    });
    loadStatic();
    bindPaymentsHub();
    bindPayout();
    refresh();
    setInterval(refresh, POLL_MS);
    setTimeout(function () {
      COUNT_IDS.forEach(function (id) {
        if (id === 'dashboardCardNotifyCount') return;
        var el = $(id);
        if (el && el.classList.contains('is-loading')) setCount(id, 0);
      });
    }, 12000);
  }

  global.DashboardOpsSnapshot = { init: init, refresh: refresh };
})(typeof window !== 'undefined' ? window : this);
