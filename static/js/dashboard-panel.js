/**
 * TT Menus side dashboard panel: open/close + trigger binding.
 * Kept outside main.js so toggles survive Barba transitions and load reliably.
 */
(function () {
  'use strict';

  var HIDDEN_CLASS = 'loader-hide-left';
  var OPENING_CLASS = 'is-dashboard-opening';
  var CLOSING_CLASS = 'is-dashboard-closing';
  var OPEN_MS = 600;
  var CLOSE_MS = 300;
  var dashAnimTimer = null;

  function getDashboard() {
    return document.getElementById('dashboard');
  }

  function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function isDashboardHidden(dashboard) {
    if (!dashboard) return true;
    return (
      dashboard.classList.contains(HIDDEN_CLASS) &&
      !dashboard.classList.contains(OPENING_CLASS) &&
      !dashboard.classList.contains(CLOSING_CLASS)
    );
  }

  function isDashboardVisiblyOpen(dashboard) {
    if (!dashboard) return false;
    return !isDashboardHidden(dashboard) && !dashboard.classList.contains(CLOSING_CLASS);
  }

  function syncDashboardBtnExpanded() {
    var btn = document.getElementById('dashboardBtn');
    var dashboard = getDashboard();
    if (!btn || !dashboard) return;
    btn.setAttribute('aria-expanded', isDashboardVisiblyOpen(dashboard) ? 'true' : 'false');
  }

  function applyDashboardClosedChrome(dashboard) {
    document.body.classList.remove('is-dashboard-opening', 'is-dashboard-closing');
    if (dashboard) {
      dashboard.classList.remove(OPENING_CLASS, CLOSING_CLASS);
    }
    var accountPanel = document.getElementById('account-dashboard');
    var accountOpen =
      accountPanel && !accountPanel.classList.contains('loader-hide-right');
    var notify = document.getElementById('notify-inbox');
    var notifyOpen =
      notify &&
      !notify.classList.contains('notify-inbox-hidden') &&
      !notify.classList.contains('is-notify-closing');
    if (!accountOpen && !notifyOpen) {
      document.body.classList.remove('modal-open');
    }
    syncDashboardBtnExpanded();
  }

  function finishDashboardClose(dashboard) {
    dashAnimTimer = null;
    if (!dashboard) {
      applyDashboardClosedChrome(null);
      return;
    }
    dashboard.classList.add(HIDDEN_CLASS);
    dashboard.setAttribute('aria-hidden', 'true');
    applyDashboardClosedChrome(dashboard);
  }

  function openDashboardPanel() {
    var dashboard = getDashboard();
    if (!dashboard) return;

    if (isDashboardVisiblyOpen(dashboard) && !dashboard.classList.contains(CLOSING_CLASS)) {
      return;
    }

    clearTimeout(dashAnimTimer);
    dashAnimTimer = null;

    if (prefersReducedMotion()) {
      dashboard.classList.remove(HIDDEN_CLASS, OPENING_CLASS, CLOSING_CLASS);
      dashboard.setAttribute('aria-hidden', 'false');
      document.body.classList.add('modal-open');
      document.body.classList.remove('is-dashboard-opening', 'is-dashboard-closing');
      syncDashboardBtnExpanded();
      return;
    }

    var wasClosing = dashboard.classList.contains(CLOSING_CLASS);
    document.body.classList.add('modal-open', 'is-dashboard-opening');
    document.body.classList.remove('is-dashboard-closing');
    dashboard.setAttribute('aria-hidden', 'false');

    if (wasClosing) {
      dashboard.classList.remove(HIDDEN_CLASS, CLOSING_CLASS);
      void dashboard.offsetWidth;
      dashboard.classList.add(OPENING_CLASS);
    } else {
      dashboard.classList.add(OPENING_CLASS);
      dashboard.classList.remove(HIDDEN_CLASS, CLOSING_CLASS);
    }

    syncDashboardBtnExpanded();
    dashAnimTimer = setTimeout(function () {
      dashAnimTimer = null;
      dashboard.classList.remove(OPENING_CLASS);
      document.body.classList.remove('is-dashboard-opening');
    }, OPEN_MS);
  }

  function closeDashboard(options) {
    options = options || {};
    var dashboard = getDashboard();
    if (!dashboard) return;

    if (isDashboardHidden(dashboard)) {
      applyDashboardClosedChrome(dashboard);
      return;
    }
    if (dashboard.classList.contains(CLOSING_CLASS) && !options.instant) {
      return;
    }

    clearTimeout(dashAnimTimer);
    dashAnimTimer = null;

    if (options.instant || prefersReducedMotion()) {
      finishDashboardClose(dashboard);
      return;
    }

    document.body.classList.add('modal-open', 'is-dashboard-closing');
    document.body.classList.remove('is-dashboard-opening');
    dashboard.classList.remove(OPENING_CLASS, HIDDEN_CLASS);
    void dashboard.offsetWidth;
    dashboard.classList.add(CLOSING_CLASS);
    dashboard.setAttribute('aria-hidden', 'true');
    syncDashboardBtnExpanded();
    dashAnimTimer = setTimeout(function () {
      finishDashboardClose(dashboard);
    }, CLOSE_MS);
  }

  function toggleDashboard() {
    var dashboard = getDashboard();
    if (!dashboard) return;

    if (isDashboardHidden(dashboard) || dashboard.classList.contains(CLOSING_CLASS)) {
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
      openDashboardPanel();
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

  if (window.TTMSBarba) {
    registerBarbaDashboardPanel();
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', registerBarbaDashboardPanel);
  } else {
    registerBarbaDashboardPanel();
  }
})();
