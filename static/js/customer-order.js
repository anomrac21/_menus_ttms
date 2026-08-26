/**
 * Customer order reopen — Recent orders / My orders tap into live ticket or delivery sheet.
 */
(function (global) {
  'use strict';

  var closeTimer = null;

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

  function unwrap(value) {
    if (global.OrderClient && typeof global.OrderClient.unwrapValue === 'function') {
      return global.OrderClient.unwrapValue(value);
    }
    if (typeof value !== 'string') return value;
    var s = value.trim();
    while (
      s.length >= 2 &&
      ((s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') ||
        (s.charAt(0) === "'" && s.charAt(s.length - 1) === "'"))
    ) {
      try {
        s = JSON.parse(s);
      } catch (_) {
        s = s.slice(1, -1);
      }
      if (typeof s !== 'string') return s;
      s = s.trim();
    }
    return s;
  }

  function formatMoney(currency, total) {
    if (global.OrderClient && typeof global.OrderClient.formatMoney === 'function') {
      return global.OrderClient.formatMoney(currency, total);
    }
    var cur = unwrap(currency) || '';
    var n = Number(total);
    return (cur ? cur + ' ' : '') + (isFinite(n) ? n.toFixed(2) : '0.00');
  }

  function titleCase(s) {
    return String(s || '')
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, function (ch) {
        return ch.toUpperCase();
      })
      .trim();
  }

  function fulfillmentLabel(order) {
    var table = String(order.table_number || '').trim();
    var fulfill = String(order.fulfillment || '').toLowerCase();
    if (fulfill === 'takeaway' || /^takeaway$/i.test(table)) return 'Takeaway';
    if (fulfill === 'dine_in' || fulfill === 'dine-in') {
      return table ? 'Table ' + table : 'Dine in';
    }
    return titleCase(fulfill) || 'Order';
  }

  function kitchenHint(status) {
    var key = String(status || '').toLowerCase();
    if (key === 'ready') return 'Your order is ready. Show this ticket at pickup.';
    if (key === 'paid') return 'Paid. Thank you — keep this ticket if you need a reprint.';
    if (key === 'cancelled') return 'This order was cancelled.';
    if (key === 'open') return 'The kitchen has your ticket. This updates when it is ready.';
    return 'Live status for this order.';
  }

  function lineLabel(line) {
    var name = line.item || line.name || line.title || line.product || 'Item';
    var qty = line.quantity || line.amt || line.qty || 1;
    return qty + '× ' + name;
  }

  function parseLines(order) {
    if (global.OrderClient && typeof global.OrderClient.parseCart === 'function') {
      return global.OrderClient.parseCart(order) || [];
    }
    return [];
  }

  function closeChrome() {
    if (typeof global.closeAllUiPanels === 'function') {
      global.closeAllUiPanels({ skipReelsModal: true });
      return;
    }
    if (typeof global.closeDashboard === 'function') global.closeDashboard();
    if (typeof global.closeAccountDashboard === 'function') global.closeAccountDashboard();
  }

  function prefersReducedMotion() {
    return global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function closePanel() {
    var panel = $('ttms-customer-order-panel');
    if (!panel || panel.hidden) return;
    if (closeTimer) {
      global.clearTimeout(closeTimer);
      closeTimer = null;
    }
    panel.classList.remove('is-opening');
    document.body.classList.remove('ttms-customer-order-open');
    if (prefersReducedMotion()) {
      panel.hidden = true;
      panel.classList.remove('is-open', 'is-closing');
      return;
    }
    panel.classList.add('is-closing');
    closeTimer = global.setTimeout(function () {
      panel.hidden = true;
      panel.classList.remove('is-closing', 'is-open');
      closeTimer = null;
    }, 280);
  }

  function openPanel() {
    var panel = ensurePanel();
    if (closeTimer) {
      global.clearTimeout(closeTimer);
      closeTimer = null;
    }
    panel.classList.remove('is-closing');
    panel.hidden = false;
    panel.classList.add('is-open');
    document.body.classList.add('ttms-customer-order-open');
    if (prefersReducedMotion()) return;
    panel.classList.remove('is-opening');
    void panel.offsetWidth;
    panel.classList.add('is-opening');
    global.setTimeout(function () {
      panel.classList.remove('is-opening');
    }, 420);
  }

  function ensurePanel() {
    var existing = $('ttms-customer-order-panel');
    if (existing) return existing;
    var el = document.createElement('div');
    el.id = 'ttms-customer-order-panel';
    el.className = 'ttms-customer-order-panel';
    el.hidden = true;
    el.innerHTML =
      '<div class="ttms-customer-order-panel__backdrop" data-close="1"></div>' +
      '<div class="ttms-customer-order-panel__sheet" role="dialog" aria-modal="true" aria-labelledby="ttms-customer-order-title">' +
      '<header class="ttms-customer-order-panel__header">' +
      '<div>' +
      '<h2 id="ttms-customer-order-title">Your order</h2>' +
      '<p class="ttms-customer-order-panel__sub" id="ttms-customer-order-sub"></p>' +
      '</div>' +
      '<button type="button" class="ttms-customer-order-panel__close" data-close="1" aria-label="Close">' +
      '<i class="fa fa-times" aria-hidden="true"></i></button>' +
      '</header>' +
      '<div class="ttms-customer-order-panel__body" id="ttms-customer-order-body"></div>' +
      '</div>';
    document.body.appendChild(el);
    el.addEventListener('click', function (e) {
      if (e.target && e.target.closest('[data-close]')) closePanel();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && el.classList.contains('is-open') && !el.hidden) {
        closePanel();
      }
    });
    return el;
  }

  function setPanelCopy(title, sub) {
    ensurePanel();
    var h = $('ttms-customer-order-title');
    var s = $('ttms-customer-order-sub');
    if (h) h.textContent = title || 'Your order';
    if (s) s.textContent = sub || '';
  }

  function showTicket(order) {
    var deliveryPanel = $('ttms-delivery-panel');
    if (deliveryPanel) {
      deliveryPanel.hidden = true;
      deliveryPanel.classList.remove('is-open', 'is-opening', 'is-closing');
      document.body.classList.remove('ttms-delivery-open');
    }
    var status = String(order.status || 'open');
    var ticket = order.ticket_number || order.order_ref || '';
    var lines = parseLines(order);
    var linesHtml = lines.length
      ? '<ul class="ttms-customer-order__lines">' +
        lines
          .map(function (line) {
            return '<li>' + escapeHtml(lineLabel(line)) + '</li>';
          })
          .join('') +
        '</ul>'
      : '';
    var restaurant = unwrap(order.restaurant_name) || '';
    setPanelCopy(titleCase(status) || 'Your order', ticket ? '#' + ticket : '');
    var body = $('ttms-customer-order-body');
    body.innerHTML =
      '<div class="ttms-customer-order ttms-customer-order--' +
      escapeHtml(status) +
      '">' +
      '<p class="ttms-customer-order__ticket">Ticket <strong>#' +
      escapeHtml(ticket || '—') +
      '</strong></p>' +
      (restaurant ? '<p class="ttms-customer-order__place">' + escapeHtml(restaurant) + '</p>' : '') +
      '<p class="ttms-customer-order__meta">' +
      escapeHtml(fulfillmentLabel(order)) +
      ' · ' +
      escapeHtml(formatMoney(order.currency, order.total)) +
      '</p>' +
      linesHtml +
      (order.notes
        ? '<p class="ttms-customer-order__notes">' + escapeHtml(order.notes) + '</p>'
        : '') +
      (order.delivery_error
        ? '<p class="ttms-customer-order__error">' + escapeHtml(order.delivery_error) + '</p>'
        : '') +
      '<p class="ttms-customer-order__hint">' +
      escapeHtml(kitchenHint(status)) +
      '</p>' +
      '<button type="button" class="ttms-customer-order__refresh" data-refresh-order="' +
      escapeHtml(order.id || '') +
      '">Refresh status</button>' +
      '</div>';
    var refresh = body.querySelector('[data-refresh-order]');
    if (refresh) {
      refresh.addEventListener('click', function () {
        var id = refresh.getAttribute('data-refresh-order');
        if (id) open(id);
      });
    }
    openPanel();
  }

  function isDriverPickStatus(status) {
    var st = String(status || '');
    return (
      st === 'awaiting_drivers' ||
      st === 'driver_offers' ||
      st === 'requested' ||
      st === 'offered'
    );
  }

  async function openDelivery(deliveryId) {
    if (!global.DeliveryClient || typeof global.DeliveryClient.getOrder !== 'function') {
      return false;
    }
    if (!global.TTMSDeliveryUI) return false;
    var d = await global.DeliveryClient.getOrder(deliveryId);
    closePanel();
    if (isDriverPickStatus(d && d.status) && typeof global.TTMSDeliveryUI.showOffers === 'function') {
      await global.TTMSDeliveryUI.showOffers(d.id);
      return true;
    }
    if (typeof global.TTMSDeliveryUI.showOrder === 'function') {
      global.TTMSDeliveryUI.showOrder(d);
      return true;
    }
    return false;
  }

  async function resolveOrder(orderOrId) {
    var snapshot = orderOrId && typeof orderOrId === 'object' ? orderOrId : null;
    var id = snapshot ? snapshot.id : orderOrId;
    if (!id) throw new Error('Missing order');
    if (global.OrderClient && typeof global.OrderClient.get === 'function') {
      try {
        var fresh = await global.OrderClient.get(id);
        return fresh && fresh.id ? fresh : snapshot || fresh;
      } catch (err) {
        if (snapshot) return snapshot;
        throw err;
      }
    }
    if (snapshot) return snapshot;
    throw new Error('Sign in to view this order');
  }

  async function open(orderOrId) {
    closeChrome();
    var order = await resolveOrder(orderOrId);
    var deliveryId = String(order.delivery_order_id || '').trim();
    if (deliveryId) {
      try {
        if (await openDelivery(deliveryId)) return;
      } catch (_) {
        /* kitchen ticket still shows the order */
      }
    }
    showTicket(order);
  }

  function clientMatch(a, b) {
    function norm(s) {
      return String(unwrap(s) || '')
        .toLowerCase()
        .replace(/^_+/, '')
        .replace(/^ttms_/, '');
    }
    var left = norm(a);
    var right = norm(b);
    return !left || !right || left === right;
  }

  function currentClientId() {
    return unwrap(
      (global.ORDER_CONFIG && global.ORDER_CONFIG.clientId) ||
        global.SITE_CLIENT_ID ||
        global.CLIENT_ID ||
        ''
    );
  }

  function orderLinesSummary(order) {
    var lines =
      global.OrderClient && typeof global.OrderClient.parseCart === 'function'
        ? global.OrderClient.parseCart(order)
        : [];
    if (!lines.length) return '';
    return lines
      .slice(0, 3)
      .map(lineLabel)
      .join(' · ');
  }

  var cartOrdersReq = 0;

  function isCartOrdersOpen() {
    var cart = $('cart');
    return !!(cart && cart.classList.contains('cart--orders'));
  }

  function setCartOrdersBusy(busy) {
    var cart = $('cart');
    var pane = $('cartOrdersPane');
    var throbber = $('cartOrdersThrobber');
    if (cart) cart.classList.toggle('cart--orders-loading', !!busy);
    if (pane) pane.setAttribute('aria-busy', busy ? 'true' : 'false');
    if (throbber) {
      throbber.hidden = !busy;
      throbber.setAttribute('aria-busy', busy ? 'true' : 'false');
    }
  }

  function setCartOrdersHeader(open) {
    var btn = $('cartOrdersBtn');
    var icon = btn && btn.querySelector('i');
    var title = document.querySelector('#cart-title .cart-title__text');
    var titleIcon = document.querySelector('#cart-title .cart-title__icon-wrap i');
    if (open) {
      if (icon) icon.className = 'fa fa-arrow-left';
      if (btn) {
        btn.title = 'Back to cart';
        btn.setAttribute('aria-label', 'Back to cart');
      }
      if (title) title.textContent = 'My orders';
      if (titleIcon) titleIcon.className = 'fa fa-list-alt';
    } else {
      if (icon) icon.className = 'fa fa-list-alt';
      if (btn) {
        btn.title = 'My orders';
        btn.setAttribute('aria-label', 'My orders at this restaurant');
      }
      if (title) title.textContent = 'My Order';
      if (titleIcon) titleIcon.className = 'fa fa-shopping-cart';
    }
  }

  function hideCartOrders() {
    cartOrdersReq += 1;
    var cart = $('cart');
    var pane = $('cartOrdersPane');
    if (cart) cart.classList.remove('cart--orders');
    if (pane) pane.hidden = true;
    setCartOrdersBusy(false);
    setCartOrdersHeader(false);
  }

  function renderCartOrders(orders, opts) {
    opts = opts || {};
    var list = $('cartOrdersList');
    var status = $('cartOrdersStatus');
    if (!list) return;
    var loading = !!opts.loading;
    setCartOrdersBusy(loading);
    if (status) {
      status.classList.remove('cart-orders-status--in');
      if (loading) status.textContent = '';
      else if (opts.error) status.textContent = 'Could not load orders. Try again.';
      else if (opts.needSignIn) status.textContent = 'Sign in to see orders at this restaurant.';
      else if (!orders || !orders.length) status.textContent = 'No orders at this restaurant yet.';
      else status.textContent = '';
      if (status.textContent) {
        void status.offsetWidth;
        status.classList.add('cart-orders-status--in');
      }
    }
    if (loading || !orders || !orders.length) {
      list.innerHTML = '';
      return;
    }
    list.innerHTML = orders
      .map(function (o, i) {
        var st = o.status || 'open';
        var lines = orderLinesSummary(o);
        var ticket = o.ticket_number || o.order_ref || '';
        var oid = o.id || '';
        return (
          '<li style="--cart-order-i:' +
          i +
          '">' +
          '<button type="button" class="cart-order-row cart-order-row--' +
          escapeHtml(st) +
          ' js-customer-order" data-order-id="' +
          escapeHtml(oid) +
          '"' +
          (oid ? '' : ' disabled') +
          ' aria-label="Open order #' +
          escapeHtml(ticket) +
          '">' +
          '<div class="cart-order-row__top">' +
          '<b>#' +
          escapeHtml(ticket) +
          '</b>' +
          '<span class="cart-order-row__status">' +
          escapeHtml(titleCase(st)) +
          '</span></div>' +
          '<div class="cart-order-row__meta">' +
          escapeHtml(fulfillmentLabel(o)) +
          ' · ' +
          escapeHtml(formatMoney(o.currency, o.total)) +
          '</div>' +
          (lines ? '<div class="cart-order-row__lines">' + escapeHtml(lines) + '</div>' : '') +
          '</button></li>'
        );
      })
      .join('');
  }

  function showCartOrders() {
    var cart = $('cart');
    var pane = $('cartOrdersPane');
    if (!cart || !pane) return;
    var req = ++cartOrdersReq;
    if (cart.classList.contains('cart-hidden') && typeof global.toggleCart === 'function') {
      global.toggleCart();
    }
    cart.classList.add('cart--orders');
    pane.hidden = false;
    setCartOrdersHeader(true);
    if (
      !global.OrderClient ||
      typeof global.OrderClient.mine !== 'function' ||
      !global.OrderClient.isSignedIn()
    ) {
      renderCartOrders([], { needSignIn: true });
      if (global.OrderClient && typeof global.OrderClient.requireSignIn === 'function') {
        global.OrderClient.requireSignIn();
      }
      return;
    }
    renderCartOrders([], { loading: true });
    global.OrderClient.mine()
      .then(function (res) {
        if (req !== cartOrdersReq || !isCartOrdersOpen()) return;
        var orders = (res && res.orders) || [];
        var cid = currentClientId();
        if (cid) {
          orders = orders.filter(function (o) {
            return clientMatch(o.client_id, cid);
          });
        }
        renderCartOrders(orders, {});
      })
      .catch(function () {
        if (req !== cartOrdersReq || !isCartOrdersOpen()) return;
        renderCartOrders([], { error: true });
      });
  }

  function toggleCartOrders() {
    if (isCartOrdersOpen()) hideCartOrders();
    else showCartOrders();
  }

  function hookCartClose() {
    if (global.TTMSCartPanel && typeof global.TTMSCartPanel.close === 'function' && !global.TTMSCartPanel.close._ttmsOrdersWrapped) {
      var panelClose = global.TTMSCartPanel.close;
      global.TTMSCartPanel.close = function () {
        hideCartOrders();
        return panelClose.apply(this, arguments);
      };
      global.TTMSCartPanel.close._ttmsOrdersWrapped = true;
    }
    if (typeof global.closeCart !== 'function' || global.closeCart._ttmsOrdersWrapped) return;
    var orig = global.closeCart;
    global.closeCart = function () {
      hideCartOrders();
      return orig.apply(this, arguments);
    };
    global.closeCart._ttmsOrdersWrapped = true;
  }

  function handleDelegatedClick(event) {
    var btn = event.target && event.target.closest('.js-customer-order[data-order-id]');
    if (!btn) return;
    var id = btn.getAttribute('data-order-id');
    if (!id) return;
    event.preventDefault();
    event.stopPropagation();
    open(id).catch(function (err) {
      alert((err && err.message) || 'Could not open this order');
    });
  }

  function bindCartOrdersBtn() {
    var btn = $('cartOrdersBtn');
    if (!btn || btn._ttmsOrdersBound) return;
    btn._ttmsOrdersBound = true;
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      hookCartClose();
      toggleCartOrders();
    });
  }

  function initCartOrders() {
    hookCartClose();
    bindCartOrdersBtn();
  }

  global.TTMSCustomerOrder = {
    open: open,
    close: closePanel,
    showCartOrders: showCartOrders,
    hideCartOrders: hideCartOrders,
    toggleCartOrders: toggleCartOrders,
  };

  document.addEventListener('click', handleDelegatedClick);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCartOrders);
  } else {
    initCartOrders();
  }
  global.addEventListener('ttms:auth-ready', hookCartClose);
})(typeof window !== 'undefined' ? window : this);
