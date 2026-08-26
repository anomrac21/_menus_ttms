/**
 * Kitchen station: pending print queue by location. Prints only on Print now / Print all.
 */
(function () {
  'use strict';

  var LOCATION_KEY = 'ttmsKitchenLocation';
  var RECENT_MS = 3 * 60 * 1000;
  var busy = {};
  var orderCache = {};
  var printErrors = {};
  var recentPrinted = [];
  var lastPending = [];
  var pollTimer = null;
  var lastFingerprint = '';
  var knownIds = {};
  var refreshSeq = 0;
  var lastRefreshError = '';
  var qzState = 'unknown';
  var qzPrinter = '';
  var qzConnectPromise = null;
  var qzEventsBound = false;

  function cfg() {
    return window.ORDER_CONFIG || {};
  }

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

  function titleCase(s) {
    return String(s || '')
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, function (ch) {
        return ch.toUpperCase();
      })
      .trim();
  }

  function lineLabel(line) {
    var name = line.item || line.name || line.title || line.product || 'Item';
    var size = line.size && String(line.size) !== '-' ? ' (' + line.size + ')' : '';
    var qty = line.quantity || line.amt || line.qty || 1;
    var extra = line.note ? ' — ' + line.note : '';
    return qty + '× ' + name + size + extra;
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

  function locationCatalog() {
    var menu = window.MENU_CONFIG || {};
    return Array.isArray(menu.locations) ? menu.locations : [];
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

  function selectedLocation() {
    return ($('dashboardKitchenLocation') && $('dashboardKitchenLocation').value) || '';
  }

  function fillLocationFilter() {
    var sel = $('dashboardKitchenLocation');
    if (!sel || sel.getAttribute('data-filled') === '1') return;
    var locs = locationCatalog();
    if (!locs.length) return;
    sel.setAttribute('data-filled', '1');
    var saved = '';
    try {
      saved = sessionStorage.getItem(LOCATION_KEY) || '';
    } catch (_) {}
    locs.forEach(function (loc) {
      if (!loc || !loc.slug) return;
      var opt = document.createElement('option');
      opt.value = loc.slug;
      opt.textContent = loc.city || titleCase(loc.slug);
      sel.appendChild(opt);
    });
    if (saved && Array.prototype.some.call(sel.options, function (opt) { return opt.value === saved; })) {
      sel.value = saved;
    }
  }

  function persistLocation() {
    try {
      sessionStorage.setItem(LOCATION_KEY, selectedLocation());
    } catch (_) {}
  }

  function cacheOrders(orders) {
    (orders || []).forEach(function (o) {
      if (o && o.id) orderCache[o.id] = o;
    });
  }

  function inKitchenQueue(order) {
    return String((order && order.status) || 'open').toLowerCase() === 'open';
  }

  function rememberPrinted(order) {
    if (!order || !order.id) return;
    recentPrinted = recentPrinted.filter(function (r) {
      return r.order.id !== order.id;
    });
    recentPrinted.unshift({ order: order, printedAt: Date.now() });
  }

  function pruneRecent(pendingIds) {
    var now = Date.now();
    recentPrinted = recentPrinted.filter(function (r) {
      if (!r || !r.order || !r.order.id) return false;
      if (pendingIds[r.order.id]) return false;
      return now - r.printedAt < RECENT_MS;
    });
  }

  function displayOrders(pending) {
    var live = (pending || []).filter(inKitchenQueue);
    var pendingIds = {};
    live.forEach(function (o) {
      if (o && o.id) pendingIds[o.id] = true;
    });
    pruneRecent(pendingIds);
    var extra = recentPrinted
      .filter(function (r) {
        return r && r.order && inKitchenQueue(r.order);
      })
      .map(function (r) {
        var o = Object.assign({}, r.order);
        o.print_status = 'printed';
        return o;
      });
    return live.concat(extra);
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
    var selected = selectedLocation();
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

  var KITCHEN_REJECT_FLAG = 'Kitchen Rejected Order';
  var ticketBusy = 0;

  function ticketRefText(card) {
    var ref = card.querySelector('.dashboard-order-ticket-ref');
    return ref ? ref.textContent.trim() : 'this ticket';
  }

  function ticketTotalText(card) {
    var total = card.querySelector('.dashboard-order-total');
    return total ? total.textContent.trim() : '';
  }

  function confirmKitchenAction(card, act) {
    var refText = ticketRefText(card);
    var totalText = ticketTotalText(card);
    var msg;
    if (act === 'cancel') {
      msg = 'Are you sure you want to reject ' + refText;
    } else {
      msg = 'Are you sure you want to mark ' + refText + ' as ready';
    }
    if (totalText) msg += ' (' + totalText + ')';
    return window.confirm(msg + '?');
  }

  function promptKitchenRejectMessage() {
    var typed = window.prompt('Reject message for this order (optional):', '');
    if (typed === null) return null;
    return String(typed);
  }

  function kitchenRejectReason(message) {
    var msg = String(message || '').trim();
    return msg ? KITCHEN_REJECT_FLAG + ': ' + msg : KITCHEN_REJECT_FLAG;
  }

  function playTicketOutcome(card, act, ok) {
    var isCancel = act === 'cancel';
    var successClass = isCancel ? 'is-cancel-success' : 'is-ready-success';
    var failClass = isCancel ? 'is-cancel-fail' : 'is-ready-fail';
    var outcomeClasses = [
      'is-ready-success',
      'is-ready-fail',
      'is-cancel-success',
      'is-cancel-fail',
    ];
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
        (isCancel ? ' is-cancel' : ' is-ready') +
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
            ? 'Rejected'
            : 'Ready'
          : isCancel
            ? 'Could not reject'
            : 'Could not mark ready') +
        '</span>' +
        sparks;
      card.appendChild(burst);
      card.classList.add(ok ? successClass : failClass);
      window.setTimeout(finish, ok ? 980 : 780);
    });
  }

  function queuedCount(orders) {
    return (orders || []).filter(function (o) {
      return printState(o).kind !== 'printed';
    }).length;
  }

  function ordersFingerprint(orders, location) {
    return (
      String(location || '') +
      '|' +
      (orders || [])
        .map(function (o) {
          return [o.id, o.status, o.print_status, busy[o.id] ? '1' : '0', printErrors[o.id] || '', o.updated_at].join(':');
        })
        .join('|') +
      '|r' +
      recentPrinted
        .map(function (r) {
          return r.order.id;
        })
        .join(',')
    );
  }

  function qzLibraryLoaded() {
    return !!(window.qz && window.qz.websocket && typeof qz.websocket.isActive === 'function');
  }

  function qzIsActive() {
    try {
      return qzLibraryLoaded() && !!qz.websocket.isActive();
    } catch (_) {
      return false;
    }
  }

  function configuredPrinter() {
    return String((cfg().printerName || '')).trim();
  }

  function qzBadge() {
    if (!configuredPrinter()) {
      return {
        state: 'unused',
        text: 'QZ not used',
        title: 'QZ Tray is only needed for a named kitchen printer. This site has none, so this page does not connect.',
      };
    }
    if (qzIsActive()) {
      return { state: 'connected', text: 'QZ connected', title: 'QZ Tray app is linked to this page.' };
    }
    if (qzState === 'connecting') {
      return { state: 'connecting', text: 'QZ connecting', title: 'Opening websocket to the QZ Tray desktop app' };
    }
    if (qzState === 'missing' || !qzLibraryLoaded()) {
      return { state: 'missing', text: 'QZ not installed', title: 'Install the QZ Tray desktop app to print silently to the named kitchen printer.' };
    }
    return { state: 'offline', text: 'QZ offline', title: 'QZ Tray is not running. Start the app, then refresh.' };
  }

  function printerBadge() {
    var named = configuredPrinter();
    if (named) {
      return { state: 'named', text: named, title: 'Configured kitchen printer' };
    }
    var title = 'Set orderService.printerName when a thermal printer is available.';
    if (qzPrinter) {
      title += ' This computer’s OS default is “' + qzPrinter + '” — that is not a kitchen printer setup.';
    }
    return { state: 'unset', text: 'No printer configured', title: title };
  }

  function setBadge(kind, text, state, visible, title) {
    var host = $('dashboardKitchenBadges');
    if (!host) return;
    var el = host.querySelector('[data-badge="' + kind + '"]');
    if (!el) return;
    var label = el.querySelector('.dashboard-kitchen-badge-text');
    if (label && label.textContent !== text) label.textContent = text;
    if (state && el.getAttribute('data-state') !== state) el.setAttribute('data-state', state);
    if (title && el.getAttribute('title') !== title) el.setAttribute('title', title);
    if (visible === false) el.setAttribute('hidden', '');
    else if (visible === true) el.removeAttribute('hidden');
  }

  function paintStatus() {
    var errEl = $('dashboardKitchenError');
    if (errEl) {
      if (lastRefreshError) {
        errEl.hidden = false;
        errEl.textContent = lastRefreshError;
      } else {
        errEl.hidden = true;
        errEl.textContent = '';
      }
    }
    var shown = displayOrders(lastPending);
    var queued = queuedCount(shown);
    var printed = shown.length - queued;
    var loc = selectedLocation();
    var printer = printerBadge();
    var qz = qzBadge();
    setBadge('qz', qz.text, qz.state, true, qz.title);
    setBadge('queue', queued ? queued + ' queued' : 'Idle', queued ? 'queued' : 'idle');
    setBadge('printed', printed ? printed + ' printed' : 'Printed', 'printed', printed > 0);
    setBadge('location', loc ? locationMeta(loc).title : 'All locations', loc ? 'one' : 'all');
    setBadge('printer', printer.text, printer.state, true, printer.title);
  }

  async function refreshQzPrinter() {
    if (!qzIsActive()) {
      qzPrinter = '';
      return;
    }
    try {
      qzPrinter = configuredPrinter() || (await qz.printers.getDefault()) || '';
    } catch (_) {
      qzPrinter = configuredPrinter();
    }
  }

  function bindQzEvents() {
    if (!qzLibraryLoaded() || qzEventsBound) return;
    qzEventsBound = true;
    if (typeof qz.websocket.setClosedCallbacks === 'function') {
      qz.websocket.setClosedCallbacks(function () {
        qzState = 'offline';
        qzPrinter = '';
        paintStatus();
      });
    }
    if (typeof qz.websocket.setErrorCallbacks === 'function') {
      qz.websocket.setErrorCallbacks(function () {
        if (!qzIsActive()) {
          qzState = 'offline';
          paintStatus();
        }
      });
    }
  }

  function waitForQzLibrary(timeoutMs) {
    return new Promise(function (resolve) {
      if (qzLibraryLoaded()) return resolve(true);
      var start = Date.now();
      var timer = setInterval(function () {
        if (qzLibraryLoaded()) {
          clearInterval(timer);
          resolve(true);
        } else if (Date.now() - start > timeoutMs) {
          clearInterval(timer);
          resolve(false);
        }
      }, 100);
    });
  }

  async function ensureQzConnected() {
    if (!configuredPrinter()) return false;
    if (!qzLibraryLoaded()) {
      var wait = qzState === 'unknown' || qzState === 'connecting' ? 4000 : 0;
      if (!(await waitForQzLibrary(wait))) {
        qzState = 'missing';
        paintStatus();
        return false;
      }
    }
    bindQzEvents();
    if (qzIsActive()) {
      qzState = 'connected';
      await refreshQzPrinter();
      paintStatus();
      return true;
    }
    if (qzConnectPromise) return qzConnectPromise;
    qzState = 'connecting';
    paintStatus();
    qzConnectPromise = qz.websocket
      .connect({ retries: 0, keepAlive: 60 })
      .then(function () {
        qzState = 'connected';
        return refreshQzPrinter();
      })
      .then(function () {
        paintStatus();
        return true;
      })
      .catch(function () {
        qzState = 'offline';
        qzPrinter = '';
        paintStatus();
        return false;
      })
      .finally(function () {
        qzConnectPromise = null;
      });
    return qzConnectPromise;
  }

  function skeletonMarkup() {
    return (
      '<div class="dashboard-orders-throbber" role="status" aria-live="polite">' +
      '<span class="dashboard-orders-throbber-spin" aria-hidden="true"></span>' +
      '<p class="dashboard-orders-throbber-label">Loading print jobs…</p>' +
      '<div class="dashboard-orders-skeleton" aria-hidden="true">' +
      '<div class="dashboard-orders-skeleton-card"><span></span><span></span><span></span></div>' +
      '<div class="dashboard-orders-skeleton-card"><span></span><span></span><span></span></div>' +
      '</div></div>'
    );
  }

  function setRefreshing(on) {
    var page = $('dashboardKitchenPage');
    var btn = $('ttms-kitchen-refresh');
    if (page) page.classList.toggle('is-kitchen-loading', on);
    if (btn) {
      btn.classList.toggle('is-loading', on);
      btn.setAttribute('aria-busy', on ? 'true' : 'false');
    }
  }

  function showThrobber() {
    var host = $('ttms-kitchen-list');
    if (!host) return;
    host.setAttribute('aria-busy', 'true');
    host.innerHTML = skeletonMarkup();
  }

  function printState(order) {
    if (busy[order.id]) return { kind: 'printing', label: 'Printing' };
    if (printErrors[order.id]) return { kind: 'failed', label: 'Failed' };
    var raw = String(order.print_status || 'pending').toLowerCase();
    if (/fail/i.test(raw)) return { kind: 'failed', label: 'Failed' };
    if (raw === 'printed') return { kind: 'printed', label: 'Printed' };
    return { kind: 'pending', label: 'Queued' };
  }

  function chitText(order) {
    var lines = ['TTMENUS', 'Ticket #' + (order.ticket_number || ''), (order.fulfillment || '').toUpperCase()];
    var loc = locationMeta(orderLocationSlug(order), order);
    if (loc.title) lines.push(loc.title);
    if (order.table_number) lines.push('Table ' + order.table_number);
    if (order.customer_name) lines.push(order.customer_name);
    lines.push('----------------');
    parseCart(order).forEach(function (l) {
      var qty = l.quantity || l.amt || 1;
      var name = l.item || l.name || 'Item';
      var size = l.size && String(l.size) !== '-' ? ' ' + l.size : '';
      lines.push(qty + 'x ' + name + size);
      if (l.note) lines.push('  ' + l.note);
    });
    if (order.notes) {
      lines.push('----------------');
      lines.push(order.notes);
    }
    lines.push('----------------');
    lines.push(moneyLabel(order));
    lines.push('');
    return lines.join('\n');
  }

  async function printWithQz(text) {
    var name = configuredPrinter();
    if (!name) throw new Error('No kitchen printer is configured');
    if (!(await ensureQzConnected())) {
      throw new Error('QZ Tray is not running');
    }
    var config = qz.configs.create(name);
    return qz.print(config, [
      { type: 'raw', format: 'plain', data: text + '\n\n\n' },
    ]);
  }

  function printBrowser(text) {
    var w = window.open('', 'ttms-kitchen-print');
    if (!w) throw new Error('Pop-up blocked');
    w.document.write(
      '<pre style="font:14px/1.3 monospace;white-space:pre-wrap;">' +
        text.replace(/</g, '&lt;') +
        '</pre><script>window.onload=function(){window.print();}</script>'
    );
    w.document.close();
  }

  async function printOrder(order) {
    var text = chitText(order);
    if (configuredPrinter() && (await ensureQzConnected())) {
      await printWithQz(text);
      return;
    }
    printBrowser(text);
  }

  function locationCountLabel(group) {
    var queued = 0;
    var printed = 0;
    (group.orders || []).forEach(function (o) {
      if (printState(o).kind === 'printed') printed++;
      else queued++;
    });
    var parts = [];
    if (queued) parts.push(queued + ' queued');
    if (printed) parts.push(printed + ' printed');
    return parts.join(' · ') || 'None';
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
    var print = printState(o);
    var printing = !!busy[o.id];
    var err = printErrors[o.id] || '';
    var actionLabel = configuredPrinter() ? 'Print now' : 'Browser print';
    if (printing) actionLabel = 'Printing…';
    else if (print.kind === 'failed') actionLabel = configuredPrinter() ? 'Retry print' : 'Retry browser print';
    else if (print.kind === 'printed') actionLabel = configuredPrinter() ? 'Reprint' : 'Browser reprint';
    var orderStatus = String(o.status || 'open');
    var readyDisabled = printing || orderStatus !== 'open' ? ' disabled' : '';
    var cancelDisabled = printing || orderStatus === 'paid' || orderStatus === 'cancelled' ? ' disabled' : '';
    return (
      '<article class="dashboard-order-ticket dashboard-kitchen-ticket dashboard-order-ticket--' +
      escapeHtml(print.kind) +
      (enter ? ' is-entering' : '') +
      '" data-id="' +
      escapeHtml(o.id) +
      '">' +
      '<div class="dashboard-order-ticket-head">' +
      '<strong class="dashboard-order-ticket-ref">#' +
      escapeHtml(o.ticket_number || o.order_ref) +
      '</strong>' +
      '<span class="dashboard-order-status dashboard-order-status--' +
      escapeHtml(print.kind) +
      '">' +
      escapeHtml(print.label) +
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
        : '') +
      '<span class="dashboard-order-total">' +
      escapeHtml(moneyLabel(o)) +
      '</span>' +
      '</p>' +
      '<ul class="dashboard-order-lines">' +
      lines +
      '</ul>' +
      (o.notes ? '<p class="dashboard-order-notes">' + escapeHtml(o.notes) + '</p>' : '') +
      (err ? '<p class="dashboard-order-notes">' + escapeHtml(err) + '</p>' : '') +
      '<div class="dashboard-order-actions">' +
      '<button type="button" class="btn-dash btn-dash-secondary" data-act="ready"' +
      readyDisabled +
      '>Ready</button>' +
      '<button type="button" class="btn-dash btn-dash-primary" data-act="print"' +
      (printing ? ' disabled' : '') +
      '>' +
      actionLabel +
      '</button>' +
      '<button type="button" class="btn-dash btn-dash-secondary" data-act="cancel"' +
      cancelDisabled +
      '>Cancel</button>' +
      '</div>' +
      '</article>'
    );
  }

  function renderOrders(pending, opts) {
    opts = opts || {};
    var host = $('ttms-kitchen-list');
    if (!host) return;
    host.removeAttribute('aria-busy');
    var orders = displayOrders(pending);
    cacheOrders(orders);
    if (!orders.length) {
      var emptyMsg = selectedLocation()
        ? 'No pending tickets at this location.'
        : 'No pending tickets.';
      host.innerHTML =
        '<p class="dashboard-orders-empty' +
        (opts.animateAll && !prefersReducedMotion() ? ' is-entering' : '') +
        '">' +
        emptyMsg +
        '</p>';
      knownIds = {};
      return;
    }
    var groups = groupOrdersByLocation(orders);
    if (!groups.length) {
      host.innerHTML =
        '<p class="dashboard-orders-empty' +
        (opts.animateAll && !prefersReducedMotion() ? ' is-entering' : '') +
        '">No pending tickets at this location.</p>';
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
        var canPrintAll = group.orders.some(function (o) {
          return printState(o).kind !== 'printed' && !busy[o.id];
        });
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
          : '<p class="dashboard-orders-empty">No pending tickets at this location.</p>';
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
          '<div class="dashboard-kitchen-location-tools">' +
          '<span class="dashboard-orders-location-count">' +
          escapeHtml(locationCountLabel(group)) +
          '</span>' +
          (canPrintAll
            ? '<button type="button" class="btn-dash btn-dash-secondary dashboard-kitchen-print-all" data-act="print-all">' +
              (configuredPrinter() ? 'Print all' : 'Browser print all') +
              '</button>'
            : '') +
          '</div>' +
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
    var host = $('ttms-kitchen-list');
    if (!window.OrderClient || typeof window.OrderClient.kitchenPending !== 'function') {
      lastRefreshError = 'Order client failed to load. Hard-refresh this page.';
      paintStatus();
      return [];
    }
    if (silent && ticketBusy) return lastPending;
    var seq = ++refreshSeq;
    var hasTickets = !!(host && host.querySelector('.dashboard-kitchen-ticket'));
    if (!silent) {
      setRefreshing(true);
      if (!hasTickets) showThrobber();
    }
    try {
      var location = selectedLocation();
      var res = await window.OrderClient.kitchenPending(location);
      if (seq !== refreshSeq) return [];
      var pending = ((res && res.orders) || []).filter(inKitchenQueue);
      if (silent && ticketBusy) return pending;
      lastPending = pending;
      cacheOrders(pending);
      var shown = displayOrders(pending);
      var fingerprint = ordersFingerprint(shown, location);
      if (!(silent && fingerprint === lastFingerprint)) {
        renderOrders(pending, { animateAll: !silent && !opts.preserve });
        lastFingerprint = fingerprint;
      }
      lastRefreshError = '';
      paintStatus();
      return pending;
    } catch (e) {
      if (seq !== refreshSeq) return [];
      if (host && !host.querySelector('.dashboard-kitchen-ticket')) host.innerHTML = '';
      lastRefreshError = e.message || 'Kitchen poll failed';
      paintStatus();
      return [];
    } finally {
      if (!silent && seq === refreshSeq) setRefreshing(false);
    }
  }

  function dropKitchenTicket(id) {
    lastPending = lastPending.filter(function (o) {
      return o && o.id !== id;
    });
    recentPrinted = recentPrinted.filter(function (r) {
      return r && r.order && r.order.id !== id;
    });
    delete orderCache[id];
    delete printErrors[id];
    delete busy[id];
  }

  async function printOne(id) {
    var order = orderCache[id];
    if (!order) {
      var location = selectedLocation();
      var res = await window.OrderClient.kitchenPending(location);
      var pending = (res && res.orders) || [];
      cacheOrders(pending);
      order = orderCache[id];
    }
    if (!order) throw new Error('Ticket is no longer in the kitchen queue');
    busy[id] = true;
    delete printErrors[id];
    renderOrders(lastPending, { animateAll: false });
    try {
      await printOrder(order);
      await window.OrderClient.ackPrint(id, 'printed');
      rememberPrinted(order);
      lastPending = lastPending.filter(function (o) {
        return o.id !== id;
      });
      delete printErrors[id];
    } catch (err) {
      printErrors[id] = err.message || String(err);
      throw err;
    } finally {
      delete busy[id];
      renderOrders(lastPending, { animateAll: false });
    }
  }

  async function onAction(e) {
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    var act = btn.getAttribute('data-act');
    if (act === 'print-all') {
      var section = btn.closest('[data-location]');
      if (!section) return;
      btn.disabled = true;
      var ids = Array.prototype.map.call(section.querySelectorAll('.dashboard-kitchen-ticket[data-id]'), function (el) {
        return el.getAttribute('data-id');
      });
      var failed = 0;
      for (var i = 0; i < ids.length; i++) {
        var id = ids[i];
        var cached = orderCache[id];
        if (!cached) continue;
        if (printState(cached).kind === 'printed') continue;
        try {
          await printOne(id);
        } catch (_) {
          failed++;
        }
      }
      await refresh({ preserve: true });
      if (failed) alert(failed + ' ticket' + (failed === 1 ? '' : 's') + ' failed to print');
      return;
    }
    if (act !== 'print' && act !== 'ready' && act !== 'cancel') return;
    var card = btn.closest('[data-id]');
    if (!card) return;
    var ticketId = card.getAttribute('data-id');
    if (act === 'print') {
      btn.disabled = true;
      try {
        await printOne(ticketId);
        await refresh({ preserve: true });
      } catch (err) {
        await refresh({ preserve: true });
        alert(err.message || 'Print failed');
      }
      return;
    }
    if (!confirmKitchenAction(card, act)) return;
    var rejectMessage = '';
    if (act === 'cancel') {
      var typed = promptKitchenRejectMessage();
      if (typed === null) return;
      rejectMessage = typed;
    }
    btn.disabled = true;
    ticketBusy += 1;
    card.classList.add('is-charging');
    try {
      if (act === 'ready') await window.OrderClient.ready(ticketId);
      if (act === 'cancel') await window.OrderClient.cancel(ticketId, kitchenRejectReason(rejectMessage));
      await playTicketOutcome(card, act, true);
      dropKitchenTicket(ticketId);
      lastRefreshError = '';
      paintStatus();
      await refresh({ preserve: true });
    } catch (err) {
      await playTicketOutcome(card, act, false);
      lastRefreshError = err.message || (act === 'cancel' ? 'Reject failed' : 'Could not mark ready');
      paintStatus();
      btn.disabled = false;
    } finally {
      ticketBusy = Math.max(0, ticketBusy - 1);
      card.classList.remove('is-charging');
    }
  }

  async function init() {
    if (!window.AuthClientAccess || !(await AuthClientAccess.protectAdminPage({ redirectUrl: '/dashboard/', showError: true }))) {
      return;
    }
    fillLocationFilter();
    var list = $('ttms-kitchen-list');
    if (list) list.addEventListener('click', onAction);
    var refreshBtn = $('ttms-kitchen-refresh');
    if (refreshBtn) refreshBtn.addEventListener('click', function () {
      if (configuredPrinter() && !qzIsActive()) ensureQzConnected();
      refresh();
    });
    var location = $('dashboardKitchenLocation');
    if (location) {
      location.addEventListener('change', function () {
        persistLocation();
        lastFingerprint = '';
        knownIds = {};
        refresh();
      });
    }
    if (configuredPrinter()) ensureQzConnected();
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
