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

  var statementOrders = [];

  function pdfText(value) {
    return '(' + String(value == null ? '' : value)
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/[^\x09\x20-\x7E]/g, ' ') + ')';
  }

  function pdfBlob(pageStreams) {
    var objects = [];
    var fontId = 3 + pageStreams.length * 2;
    var kids = pageStreams.map(function (_, i) { return (3 + i * 2) + ' 0 R'; }).join(' ');
    objects.push('<< /Type /Catalog /Pages 2 0 R >>');
    objects.push('<< /Type /Pages /Kids [' + kids + '] /Count ' + pageStreams.length + ' >>');
    pageStreams.forEach(function (stream, i) {
      var pageId = 3 + i * 2;
      objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ' + (pageId + 1) + ' 0 R /Resources << /Font << /F1 ' + fontId + ' 0 R >> >> >>');
      objects.push('<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream');
    });
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    var body = '%PDF-1.4\n';
    var offsets = [0];
    objects.forEach(function (obj, i) {
      offsets.push(body.length);
      body += (i + 1) + ' 0 obj\n' + obj + '\nendobj\n';
    });
    var xref = body.length;
    body += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
    offsets.slice(1).forEach(function (off) {
      body += ('0000000000' + off).slice(-10) + ' 00000 n \n';
    });
    body += 'trailer << /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
    return new Blob([body], { type: 'application/pdf' });
  }

  function clipPdf(value, max) {
    var text = String(value || '').replace(/\s+/g, ' ').trim();
    if (text.length <= max) return text;
    return text.slice(0, Math.max(0, max - 3)) + '...';
  }

  function statementPages(rows, meta) {
    var pages = [];
    var commands = [];
    var y = 744;
    function flush() {
      pages.push(commands.join('\n'));
      commands = [];
      y = 744;
    }
    function ensure(need) {
      if (y < need) flush();
    }
    function at(x, yy, size, text) {
      commands.push('BT /F1 ' + size + ' Tf 1 0 0 1 ' + x + ' ' + yy + ' Tm ' + pdfText(text) + ' Tj ET');
    }
    function header() {
      at(48, y, 16, 'Payment statement');
      y -= 22;
      at(48, y, 12, clipPdf(meta.title, 60));
      y -= 18;
      at(48, y, 10, 'Created ' + meta.when);
      y -= 16;
      at(48, y, 12, 'Collected ' + meta.total);
      y -= 22;
      at(48, y, 9, 'Date');
      at(168, y, 9, 'Customer');
      at(360, y, 9, 'Ticket');
      at(470, y, 9, 'Amount');
      y -= 8;
      commands.push('0.75 w 48 ' + y + ' m 564 ' + y + ' l S');
      y -= 16;
    }
    header();
    if (!rows.length) {
      at(48, y, 11, 'No payments collected yet.');
    }
    rows.forEach(function (row) {
      ensure(72);
      if (y > 720) header();
      at(48, y, 9, clipPdf(row.when, 18));
      at(168, y, 9, clipPdf(row.who, 28));
      at(360, y, 9, clipPdf(row.ticket, 14));
      at(470, y, 9, clipPdf(row.amount, 16));
      y -= 13;
      if (row.place) {
        ensure(64);
        at(168, y, 8, clipPdf(row.place, 70));
        y -= 14;
      }
    });
    flush();
    return pages;
  }

  function downloadStatement() {
    var rows = statementOrders.map(function (order) {
      var ticket = order.ticket_number || order.order_ref || String(order.id || '').slice(0, 8);
      return {
        when: paymentStamp(order.paid_at || order.updated_at),
        who: order.customer_name || 'Guest',
        ticket: ticket,
        place: paymentPlace(order),
        amount: paymentMoney(order.total) + ' ' + (order.currency || 'TTD'),
      };
    });
    var totalEl = $('dashboardPaymentsTotal');
    var form = $('dashboardPaymentsAccount');
    var title = (form && form.getAttribute('data-restaurant')) || document.title || 'Menu';
    var when = '';
    try {
      when = new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    } catch (e) {
      when = new Date().toISOString();
    }
    var blob = pdfBlob(statementPages(rows, {
      title: title,
      when: when,
      total: (totalEl && totalEl.textContent) || '',
    }));
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    var day = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = 'payment-statement-' + day + '.pdf';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
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
    statementOrders = rows;
    var statementBtn = $('dashboardPaymentsStatement');
    if (statementBtn) statementBtn.disabled = !rows.length;
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

  function paintDirectPayment() {
    var row = $('dashboardPaymentsDirect');
    if (!row) return;
    var status = $('dashboardPaymentsDirectStatus');
    if (row.getAttribute('data-direct') !== 'true') {
      row.setAttribute('data-state', 'disconnected');
      if (status) status.textContent = 'Direct payment is off';
      return;
    }
    var api = String(row.getAttribute('data-api') || '').replace(/\/+$/, '');
    if (!api) {
      row.setAttribute('data-state', 'disconnected');
      if (status) status.textContent = 'Direct payment is not connected';
      return;
    }
    row.setAttribute('data-state', 'checking');
    if (status) status.textContent = 'Checking direct payment…';
    fetch(api + '/health', { method: 'GET' })
      .then(function (res) {
        if (!res.ok) throw new Error('down');
        row.setAttribute('data-state', 'connected');
        row.classList.add('is-just-connected');
        if (status) status.textContent = 'Direct payment connected';
      })
      .catch(function () {
        row.setAttribute('data-state', 'disconnected');
        row.classList.remove('is-just-connected');
        if (status) status.textContent = 'Direct payment is not connected';
      });
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
    paintDirectPayment();
    var statementBtn = $('dashboardPaymentsStatement');
    if (statementBtn && !statementBtn.getAttribute('data-bound')) {
      statementBtn.setAttribute('data-bound', '1');
      statementBtn.addEventListener('click', function () {
        if (!statementOrders.length) return;
        downloadStatement();
      });
    }
    var openSettings = $('dashboardPaymentsOpenSettings');
    if (openSettings && !openSettings.getAttribute('data-bound')) {
      openSettings.setAttribute('data-bound', '1');
      openSettings.addEventListener('click', function () {
        openPaymentsHub('settings');
      });
    }
  }

  function payoutAccountList(status) {
    var list = status && status.bank_accounts;
    if (Array.isArray(list) && list.length) return list;
    if (status && status.bank_account_last4) {
      return [{
        bank_name: status.bank_name,
        bank_account_name: status.bank_account_name,
        bank_account_last4: status.bank_account_last4,
      }];
    }
    return [];
  }

  function syncPayoutAccountRemoves(bank) {
    var rows = bank.querySelectorAll('.dashboard-payments-account-row');
    Array.prototype.forEach.call(rows, function (row, index) {
      var button = row.querySelector('.dashboard-payments-account-remove');
      if (button) button.hidden = rows.length < 2 || index === 0;
    });
  }

  function addPayoutAccountRow(bank, focus, placeholder, keep) {
    var tpl = $('dashboardPaymentsAccountTemplate');
    var list = bank.querySelector('.dashboard-payments-account-list');
    if (!tpl || !list || !tpl.content || !tpl.content.firstElementChild) return null;
    var row = tpl.content.firstElementChild.cloneNode(true);
    list.appendChild(row);
    var input = row.querySelector('input');
    if (input && placeholder) input.placeholder = placeholder;
    if (input && keep) input.setAttribute('data-keep', keep);
    syncPayoutAccountRemoves(bank);
    if (focus && input) input.focus();
    return input;
  }

  function openPayoutBank(bank, focus) {
    if (!bank) return;
    bank.classList.add('is-open');
    var box = bank.querySelector('input[name="bank_pick"]');
    if (box) box.checked = true;
    var list = bank.querySelector('.dashboard-payments-account-list');
    if (list && !list.querySelector('input')) addPayoutAccountRow(bank, focus);
    else if (focus) {
      var input = bank.querySelector('.dashboard-payments-account-no');
      if (input) input.focus();
    }
  }

  function closePayoutBank(bank) {
    if (!bank) return;
    bank.classList.remove('is-open');
    var box = bank.querySelector('input[name="bank_pick"]');
    if (box) box.checked = false;
    var list = bank.querySelector('.dashboard-payments-account-list');
    if (list) list.innerHTML = '';
  }

  function payoutSaveStatus(message) {
    var status = $('dashboardPaymentsSaveStatus');
    if (!status) return;
    status.hidden = !message;
    status.textContent = message || '';
  }

  function collectPayoutAccounts(form) {
    var shared = '';
    var nameInput = form.querySelector('[name="bank_account_name"]');
    if (nameInput) shared = String(nameInput.value || '').trim();
    var accounts = [];
    var missing = [];
    Array.prototype.forEach.call(form.querySelectorAll('.dashboard-payments-bankcard'), function (card) {
      var box = card.querySelector('input[name="bank_pick"]');
      if (!card.classList.contains('is-open') && !(box && box.checked)) return;
      var bank = card.getAttribute('data-bank') || (box && box.value) || '';
      var found = 0;
      Array.prototype.forEach.call(card.querySelectorAll('.dashboard-payments-account-no'), function (input) {
        var digits = String(input.value || '').replace(/\D/g, '');
        var keep = input.getAttribute('data-keep') || '';
        if (digits.length < 4 && !keep) return;
        found += 1;
        accounts.push({
          bank_name: bank,
          bank_account_name: shared,
          bank_account: digits.length >= 4 ? digits : '',
          keep_last4: digits.length >= 4 ? '' : keep,
        });
      });
      if (!found) {
        var label = card.querySelector('strong');
        missing.push((label && label.textContent) || bank || 'that bank');
      }
    });
    return { accounts: accounts, missing: missing };
  }

  function paintSavedBanks(accounts, accountName) {
    var form = $('dashboardPaymentsAccount');
    if (!form) return;
    var active = document.activeElement;
    if (active && form.contains(active)) return;
    var sig = JSON.stringify(accounts || []);
    if (form.getAttribute('data-banks') === sig) return;
    form.setAttribute('data-banks', sig);
    var nameInput = form.querySelector('[name="bank_account_name"]');
    if (nameInput && accountName && !nameInput.value) nameInput.value = accountName;
    Array.prototype.forEach.call(form.querySelectorAll('.dashboard-payments-bankcard'), function (card) {
      closePayoutBank(card);
    });
    (accounts || []).forEach(function (item) {
      var card = form.querySelector('.dashboard-payments-bankcard[data-bank="' + String(item.bank_name || '').replace(/"/g, '\\"') + '"]');
      if (!card) return;
      openPayoutBank(card, false);
      var list = card.querySelector('.dashboard-payments-account-list');
      var existing = list ? list.querySelectorAll('.dashboard-payments-account-no') : [];
      var empty = existing.length === 1 && !existing[0].value && !existing[0].getAttribute('data-keep');
      if (empty) {
        existing[0].placeholder = item.bank_account_last4 ? 'Current ending ' + item.bank_account_last4 : 'Account number';
        if (item.bank_account_last4) existing[0].setAttribute('data-keep', item.bank_account_last4);
        return;
      }
      addPayoutAccountRow(card, false, item.bank_account_last4 ? 'Current ending ' + item.bank_account_last4 : 'Account number', item.bank_account_last4 || '');
    });
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
    var accounts = payoutAccountList(status);
    var bankText = accounts.map(function (item) {
      return [item.bank_name, item.bank_account_last4 ? '····' + item.bank_account_last4 : ''].filter(Boolean).join(' · ');
    }).join(' · ');
    if (!bankText && last4) bankText = [status.bank_name, '····' + last4].filter(Boolean).join(' · ');
    paintSavedBanks(accounts, status && status.bank_account_name);
    Array.prototype.forEach.call(banks, function (bank) {
      bank.hidden = !last4;
      bank.textContent = bankText;
    });
    if (ready) ready.textContent = paymentMoney(outstanding) + ' ' + currency;
    var amountInput = $('dashboardPaymentsAmount');
    if (amountInput && document.activeElement !== amountInput) {
      var asked = Number(status && status.requested_amount);
      var shown = requested && isFinite(asked) && asked > 0 ? asked : outstanding;
      var text = paymentMoney(shown);
      var previous = amountInput.getAttribute('data-saved') || '';
      if (!amountInput.value || amountInput.value === previous) {
        amountInput.value = text;
        amountInput.setAttribute('data-saved', text);
      }
    }
    if (amountInput) amountInput.disabled = !last4 || outstanding <= 0;
    if (openSettings) openSettings.hidden = !!last4;
    if (btn) {
      btn.hidden = !last4 || outstanding <= 0;
      btn.disabled = false;
      btn.textContent = requested ? 'Update amount' : 'Request transfer';
      btn.setAttribute('data-outstanding', String(outstanding));
      btn.setAttribute('data-currency', currency);
    }
    if (note) {
      if (!last4) {
        note.hidden = false;
        note.textContent = 'Add a bank account in Settings before requesting a transfer.';
      } else if (requested && when) {
        var queued = Number(status && status.requested_amount);
        if (!isFinite(queued) || queued <= 0) queued = outstanding;
        note.hidden = false;
        note.textContent = paymentMoney(queued) + ' ' + currency + ' is scheduled for ' + when + '.';
      } else if (outstanding > 0 && when) {
        note.hidden = false;
        note.textContent = 'Transfers go out at 9:00 AM, 1:00 PM, and 5:00 PM. The next one is ' + when + '.';
      } else {
        note.hidden = false;
        note.textContent = 'Money already transferred stays off this request.';
      }
    }
    paintTransferHistory(status && status.transfers);
  }

  function paintTransferHistory(rows) {
    var root = $('dashboardPaymentsHistory');
    var list = $('dashboardPaymentsHistoryList');
    if (!root || !list) return;
    var items = Array.isArray(rows) ? rows : [];
    if (!items.length) {
      root.hidden = true;
      list.innerHTML = '';
      return;
    }
    var labels = { scheduled: 'Scheduled', sent: 'Sent', cancelled: 'Cancelled' };
    list.innerHTML = items.map(function (row) {
      var state = labels[row.state] || 'Scheduled';
      var money = paymentMoney(row.amount) + ' ' + (row.currency || 'TTD');
      var when = row.when ? ' · ' + row.when : '';
      return '<li><span class="dashboard-payments-history-amount">' + escapeHtml(money) + '</span><span>' + escapeHtml(state + when) + '</span></li>';
    }).join('');
    root.hidden = false;
  }

  function bindPayout() {
    var form = $('dashboardPaymentsAccount');
    var btn = $('dashboardPaymentsTransferBtn');
    if (form && !form.getAttribute('data-bound')) {
      form.setAttribute('data-bound', '1');
      form.addEventListener('change', function (ev) {
        var box = ev.target;
        if (!box || box.name !== 'bank_pick') return;
        var card = box.closest('.dashboard-payments-bankcard');
        if (!card) return;
        if (box.checked) openPayoutBank(card, true);
        else closePayoutBank(card);
      });
      form.addEventListener('click', function (ev) {
        var reveal = ev.target.closest && ev.target.closest('.dashboard-payments-reveal');
        if (reveal && form.contains(reveal)) {
          var secret = reveal.closest('.dashboard-payments-secret');
          var input = secret && secret.querySelector('input');
          if (!input) return;
          var show = input.type === 'password';
          input.type = show ? 'text' : 'password';
          reveal.textContent = show ? 'Hide' : 'Show';
          reveal.setAttribute('aria-pressed', show ? 'true' : 'false');
          return;
        }
        var add = ev.target.closest && ev.target.closest('.dashboard-payments-add-account');
        if (add && form.contains(add)) {
          var bank = add.closest('.dashboard-payments-bankcard');
          if (bank) addPayoutAccountRow(bank, true);
          return;
        }
        var remove = ev.target.closest && ev.target.closest('.dashboard-payments-account-remove');
        if (remove && form.contains(remove)) {
          var row = remove.closest('.dashboard-payments-account-row');
          var owner = remove.closest('.dashboard-payments-bankcard');
          if (row) row.remove();
          if (owner) syncPayoutAccountRemoves(owner);
        }
      });
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        if (!global.OrderClient || typeof global.OrderClient.savePayoutAccount !== 'function') return;
        var picked = collectPayoutAccounts(form);
        var accounts = picked.accounts;
        if (!accounts.length) {
          payoutSaveStatus(picked.missing.length
            ? 'Enter the account number for ' + picked.missing.join(', ') + '.'
            : 'Choose a bank, then enter its account number.');
          return;
        }
        var data = new FormData(form);
        var first = accounts[0];
        var submit = form.querySelector('button[type="submit"]');
        if (submit) submit.disabled = true;
        payoutSaveStatus('Saving accounts…');
        global.OrderClient.savePayoutAccount({
          bank_name: first.bank_name,
          bank_account_name: data.get('bank_account_name'),
          bank_account: first.bank_account,
          restaurant_name: form.getAttribute('data-restaurant') || '',
          accounts: accounts,
        }).then(function (status) {
          form.removeAttribute('data-banks');
          payoutSaveStatus('Accounts saved.');
          paintPayout(status);
          openPaymentsHub('transfer');
        }).catch(function (err) {
          payoutSaveStatus((err && err.message) || 'Could not save the account');
        }).finally(function () {
          if (submit) submit.disabled = false;
        });
      });
    }
    if (btn && !btn.getAttribute('data-bound')) {
      btn.setAttribute('data-bound', '1');
      btn.addEventListener('click', function () {
        if (!global.OrderClient || typeof global.OrderClient.requestPayout !== 'function') return;
        var amountInput = $('dashboardPaymentsAmount');
        var amount = Number(String(amountInput && amountInput.value || '').replace(/[^0-9.]/g, ''));
        if (!isFinite(amount)) amount = 0;
        amount = Math.round(amount * 100) / 100;
        var readyAmount = Number(btn.getAttribute('data-outstanding'));
        var currency = btn.getAttribute('data-currency') || 'TTD';
        var note = $('dashboardPaymentsTransferNote');
        if (amount <= 0) {
          if (note) {
            note.hidden = false;
            note.textContent = 'Enter an amount to transfer';
          }
          return;
        }
        if (isFinite(readyAmount) && amount > readyAmount + 0.001) {
          if (note) {
            note.hidden = false;
            note.textContent = 'That is more than the ' + paymentMoney(readyAmount) + ' ' + currency + ' ready to transfer';
          }
          return;
        }
        btn.disabled = true;
        global.OrderClient.requestPayout({ amount: amount, currency: currency }).then(function (status) {
          if (amountInput) amountInput.setAttribute('data-saved', paymentMoney(amount));
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
