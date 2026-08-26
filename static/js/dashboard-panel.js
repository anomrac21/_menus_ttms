/**
 * TT Menus side dashboard panel — open/close + trigger binding.
 * Kept outside main.js so toggles survive Barba transitions and load reliably.
 */
(function () {
  'use strict';

  var HIDDEN_CLASS = 'loader-hide-left';
  var GUEST_EMPTY_TITLE = 'Powered by TT Menus';
  var GUEST_EMPTY_HINT =
    'Digital menus for restaurants and bars across Trinidad & Tobago. Sign in to see your recent orders here.';

  function getDashboard() {
    return document.getElementById('dashboard');
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function titleCase(s) {
    return String(s || '')
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, function (ch) {
        return ch.toUpperCase();
      })
      .trim();
  }

  function unwrapValue(value) {
    if (window.OrderClient && typeof window.OrderClient.unwrapValue === 'function') {
      return window.OrderClient.unwrapValue(value);
    }
    if (typeof value !== 'string') return value == null ? '' : value;
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

  function currentClientId() {
    return unwrapValue(
      (window.ORDER_CONFIG && window.ORDER_CONFIG.clientId) ||
        window.SITE_CLIENT_ID ||
        window.CLIENT_ID ||
        ''
    );
  }

  function moneyLabel(order) {
    if (window.OrderClient && typeof window.OrderClient.formatMoney === 'function') {
      return window.OrderClient.formatMoney(order.currency, order.total);
    }
    return String(unwrapValue(order.currency) || '') + ' ' + Number(order.total || 0).toFixed(2);
  }

  function clientMatch(a, b) {
    function norm(s) {
      return String(unwrapValue(s) || '')
        .toLowerCase()
        .replace(/^_+/, '')
        .replace(/^ttms_/, '');
    }
    var left = norm(a);
    var right = norm(b);
    return !left || !right || left === right;
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

  function lineLabel(line) {
    var name = line.item || line.name || line.title || line.product || 'Item';
    var qty = line.quantity || line.amt || line.qty || 1;
    return qty + '× ' + name;
  }

  function orderLinesSummary(order) {
    var lines =
      window.OrderClient && typeof window.OrderClient.parseCart === 'function'
        ? window.OrderClient.parseCart(order)
        : [];
    if (!lines.length) return '';
    return lines
      .slice(0, 3)
      .map(lineLabel)
      .join(' · ');
  }

  function setEmptyCopy(signedIn, hasError) {
    var empty = document.getElementById('dashboard-panel-empty');
    var title = document.getElementById('dashboard-panel-empty-title');
    var hint = document.getElementById('dashboard-panel-empty-hint');
    if (empty) empty.classList.toggle('dashboard-panel-empty--compact', !!signedIn);
    if (!title || !hint) return;
    if (!signedIn) {
      title.textContent = GUEST_EMPTY_TITLE;
      hint.textContent = GUEST_EMPTY_HINT;
      return;
    }
    title.textContent = hasError ? 'Could not load orders' : 'No recent orders';
    hint.textContent = hasError
      ? 'Pull this panel again after you are back online.'
      : 'Tap Order Now on the menu to place one. It will show up here.';
  }

  function renderRecentOrders(orders, opts) {
    opts = opts || {};
    var wrap = document.getElementById('dashboard-panel-orders');
    var list = document.getElementById('dashboard-panel-orders-list');
    if (!wrap || !list) return;
    var signedIn = !!(
      window.OrderClient &&
      typeof window.OrderClient.isSignedIn === 'function' &&
      window.OrderClient.isSignedIn()
    );
    if (!signedIn || !orders || !orders.length) {
      wrap.hidden = true;
      list.innerHTML = '';
      setEmptyCopy(signedIn, !!opts.error);
      return;
    }
    wrap.hidden = false;
    list.innerHTML = orders
      .slice(0, 8)
      .map(function (o) {
        var status = o.status || 'open';
        var lines = orderLinesSummary(o);
        var ticket = o.ticket_number || o.order_ref || '';
        var oid = o.id || '';
        return (
          '<li>' +
          '<button type="button" class="dashboard-panel-order dashboard-panel-order--' +
          escapeHtml(status) +
          ' js-customer-order" data-order-id="' +
          escapeHtml(oid) +
          '"' +
          (oid ? '' : ' disabled') +
          ' aria-label="Open order #' +
          escapeHtml(ticket) +
          '">' +
          '<div class="dashboard-panel-order__top">' +
          '<b>#' +
          escapeHtml(ticket) +
          '</b>' +
          '<span class="dashboard-panel-order__status">' +
          escapeHtml(titleCase(status)) +
          '</span>' +
          '</div>' +
          '<div class="dashboard-panel-order__meta">' +
          escapeHtml(fulfillmentLabel(o)) +
          ' · <span class="dashboard-panel-order__total">' +
          escapeHtml(moneyLabel(o)) +
          '</span></div>' +
          (lines
            ? '<div class="dashboard-panel-order__lines">' + escapeHtml(lines) + '</div>'
            : '') +
          '</button></li>'
        );
      })
      .join('');
  }

  function loadRecentOrders() {
    var wrap = document.getElementById('dashboard-panel-orders');
    if (!wrap) return Promise.resolve();
    if (
      !window.OrderClient ||
      typeof window.OrderClient.mine !== 'function' ||
      !window.OrderClient.enabled() ||
      !window.OrderClient.isSignedIn()
    ) {
      renderRecentOrders([], {});
      return Promise.resolve();
    }
    return window.OrderClient.mine()
      .then(function (res) {
        var orders = (res && res.orders) || [];
        var cid = currentClientId();
        if (cid) {
          orders = orders.filter(function (o) {
            return clientMatch(o.client_id, cid);
          });
        }
        renderRecentOrders(orders, {});
      })
      .catch(function () {
        renderRecentOrders([], { error: true });
      });
  }

  function syncDashboardBtnExpanded() {
    var btn = document.getElementById('dashboardBtn');
    var dashboard = getDashboard();
    if (!btn || !dashboard) return;
    var isOpen = !dashboard.classList.contains(HIDDEN_CLASS);
    btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  }

  function closeDashboard() {
    var dashboard = getDashboard();
    if (!dashboard) return;

    dashboard.classList.add(HIDDEN_CLASS);
    dashboard.setAttribute('aria-hidden', 'true');

    var accountPanel = document.getElementById('account-dashboard');
    var accountOpen =
      accountPanel && !accountPanel.classList.contains('loader-hide-right');
    if (!accountOpen) {
      document.body.classList.remove('modal-open');
    }

    syncDashboardBtnExpanded();
  }

  function toggleDashboard() {
    var dashboard = getDashboard();
    if (!dashboard) return;

    if (dashboard.classList.contains(HIDDEN_CLASS)) {
      if (typeof window.closeAllUiPanels === 'function') {
        window.closeAllUiPanels({ keepDashboard: true, skipReelsModal: true });
      } else {
        if (typeof window.closeCart === 'function') {
          window.closeCart();
        }
        var search = document.getElementById('search');
        if (
          search &&
          !search.classList.contains('hide-search') &&
          typeof window.toggleSearch === 'function'
        ) {
          window.toggleSearch();
        }
        if (typeof window.closeAccountDashboard === 'function') {
          window.closeAccountDashboard();
        }
      }

      dashboard.classList.remove(HIDDEN_CLASS);
      dashboard.setAttribute('aria-hidden', 'false');
      document.body.classList.add('modal-open');
      loadRecentOrders();
    } else {
      closeDashboard();
    }

    syncDashboardBtnExpanded();
  }

  function handleDashboardTriggerClick(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    if (typeof window.showDashboardControl === 'function') {
      window.showDashboardControl(false);
    }

    toggleDashboard();
    return false;
  }

  function bindDashboardTriggers() {
    document.querySelectorAll('#dashboardBtn, [data-dashboard-toggle]').forEach(function (el) {
      if (el._ttmsDashboardTriggerBound) return;
      el._ttmsDashboardTriggerBound = true;
      el.addEventListener('click', handleDashboardTriggerClick);
    });
    syncDashboardBtnExpanded();
  }

  function initDashboardPanel() {
    bindDashboardTriggers();
    loadRecentOrders();
  }

  window.toggleDashboard = toggleDashboard;
  window.closeDashboard = closeDashboard;
  window.bindDashboardTriggers = bindDashboardTriggers;
  window.bindDashboardBtn = bindDashboardTriggers;
  window.syncDashboardBtnExpanded = syncDashboardBtnExpanded;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDashboardPanel);
  } else {
    initDashboardPanel();
  }

  function registerBarbaDashboardPanel() {
    if (window.TTMSBarba) {
      window.TTMSBarba.register(initDashboardPanel);
    }
  }

  window.addEventListener('ttms:auth-ready', loadRecentOrders);

  if (window.TTMSBarba) {
    registerBarbaDashboardPanel();
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', registerBarbaDashboardPanel);
  } else {
    registerBarbaDashboardPanel();
  }
})();
