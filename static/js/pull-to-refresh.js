/**
 * Pull-down to reload. PWA / standalone (menu) and client dashboard pages.
 * Dashboard uses soft refresh (reload data); menu pages use a full reload.
 */
(function () {
  'use strict';

  var HORIZONTAL_CANCEL_RATIO = 1.2;
  var CENTER_HOLD_MS = 640;

  var DASHBOARD_ROOT_SELECTORS = [
    '.dashboard-control-room',
    '.dashboard-analytics-page',
    '.dashboard-notify-page',
    '.dashboard-edit-page',
    '.dashboard-settings-page',
  ].join(', ');

  var BLOCKED_SELECTORS = [
    '.menu-smash-pass-card',
    '.menu-reels-item-modal',
    '.menu-reels-item-modal__body',
    '.ads-reels-track',
    '#ads-reels-overlay',
    '.ads-reels-slide',
    '#dashboard',
    '.menu-image-upload-modal',
    '.expanded-item-details',
    '.single-page-content',
    '.menu-item-slideshow',
    '.expanded-image-carousel',
    '.location-picker',
    '.search-results',
    '.header-menublock-toggle',
    '.header-menublock-backdrop',
    '.main-header.menublock-dropdown-open .header-nav',
    '#menublock',
  ].join(', ');

  var startY = 0;
  var startX = 0;
  var tracking = false;
  var reloading = false;
  var holding = false;
  var lastPullPx = 0;
  var optsMove = { passive: false, capture: true };
  var optsEnd = { capture: true };

  function isStandaloneAppDisplay() {
    try {
      if (window.navigator.standalone === true) return true;
      if (window.matchMedia('(display-mode: standalone)').matches) return true;
      if (window.matchMedia('(display-mode: fullscreen)').matches) return true;
      if (window.matchMedia('(display-mode: minimal-ui)').matches) return true;
    } catch (e) {
      /* ignore */
    }
    return false;
  }

  function isDashboardPage() {
    return !!document.querySelector(DASHBOARD_ROOT_SELECTORS);
  }

  function isPullToRefreshEnabled() {
    return isStandaloneAppDisplay() || isDashboardPage();
  }

  function windowScrollTop() {
    return (
      window.scrollY ||
      document.documentElement.scrollTop ||
      document.body.scrollTop ||
      0
    );
  }

  function menuReelsTrackScrollTop() {
    var track = document.getElementById('menu-reels-track');
    return track ? track.scrollTop : 0;
  }

  function isAtPageTop() {
    if (windowScrollTop() > 2) return false;
    if (menuReelsTrackScrollTop() > 2) return false;
    return true;
  }

  function isScrollableElement(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el === document.documentElement || el === document.body) return false;
    var style = window.getComputedStyle(el);
    var overflowY = style.overflowY;
    if (overflowY !== 'auto' && overflowY !== 'scroll' && overflowY !== 'overlay') {
      return false;
    }
    return el.scrollHeight > el.clientHeight + 1;
  }

  function hasScrolledAncestor(target) {
    var node = target;
    while (node && node !== document.documentElement) {
      if (isScrollableElement(node) && node.scrollTop > 2) {
        return true;
      }
      node = node.parentElement;
    }
    return false;
  }

  function isTouchOnBlockedTarget(target) {
    if (!target || !target.closest) return true;
    if (document.body.classList.contains('menublock-dropdown-open')) return true;
    if (document.body.classList.contains('menu-reels-item-modal-open')) return true;
    if (target.closest(BLOCKED_SELECTORS)) return true;
    return false;
  }

  function canUsePullToRefresh(target) {
    if (!isPullToRefreshEnabled()) return false;
    if (reloading || holding) return false;
    if (document.body.classList.contains('menublock-dropdown-open')) return false;
    if (document.body.classList.contains('menu-reels-item-modal-open')) return false;
    if (!isAtPageTop()) return false;
    if (isTouchOnBlockedTarget(target)) return false;
    if (hasScrolledAncestor(target)) return false;
    return true;
  }

  function resetPullState() {
    tracking = false;
    lastPullPx = 0;
    window.TTMS_PTR_PULLING = false;
    hideIndicator();
    detachTouchListeners();
  }

  function centerY() {
    var h = window.innerHeight || document.documentElement.clientHeight || 0;
    return Math.max(180, Math.round(h * 0.5));
  }

  function centerHoldMs() {
    try {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 220;
    } catch (e) {
      /* ignore */
    }
    return CENTER_HOLD_MS;
  }

  var indicator = null;
  function ensureIndicator() {
    if (indicator) return indicator;
    var el = document.createElement('div');
    el.id = 'ttms-ptr-indicator';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML =
      '<div class="ttms-ptr-scrim"></div>' +
      '<div class="ttms-ptr-inner">' +
      '<span class="ttms-ptr-orb" aria-hidden="true"><span class="ttms-ptr-icon">↓</span></span>' +
      '<span class="ttms-ptr-text">Pull to refresh</span>' +
      '</div>';
    document.body.appendChild(el);
    indicator = el;
    return el;
  }

  function injectStyles() {
    if (document.getElementById('ttms-ptr-styles')) return;
    var css =
      '#ttms-ptr-indicator{position:fixed;inset:0;z-index:2147483000;pointer-events:none;opacity:0;' +
      'font-family:var(--ttms-font-sans,system-ui,-apple-system,sans-serif);}' +
      '#ttms-ptr-indicator.ttms-ptr-visible{opacity:1;}' +
      '.ttms-ptr-scrim{position:absolute;inset:0;background:color-mix(in srgb, var(--dash-bg, var(--scheme-black, #090a13)) 72%, transparent);opacity:0;}' +
      '.ttms-ptr-inner{position:absolute;left:50%;top:0;display:flex;flex-direction:column;align-items:center;gap:0.85rem;' +
      'min-width:15.5rem;padding:1.55rem 1.7rem 1.35rem;border-radius:32px;' +
      'background:color-mix(in srgb, var(--dash-surface, var(--scheme-surface, #16181f)) 94%, transparent);' +
      'color:var(--dash-ink, var(--scheme-white, #fff));' +
      'box-shadow:0 24px 70px color-mix(in srgb, #000 42%, transparent);' +
      'transform:translate(-50%, -140%);will-change:transform;}' +
      '.ttms-ptr-orb{width:7.25rem;height:7.25rem;border-radius:50%;display:grid;place-items:center;position:relative;' +
      'background:color-mix(in srgb, var(--dash-accent, var(--scheme-accent, #e5ad36)) 22%, transparent);' +
      'color:var(--dash-accent, var(--scheme-accent, #e5ad36));' +
      'box-shadow:inset 0 0 0 2px color-mix(in srgb, var(--dash-accent, var(--scheme-accent, #e5ad36)) 45%, transparent);}' +
      '.ttms-ptr-icon{font-size:2.6rem;line-height:1;display:block;transition:transform .18s ease;}' +
      '.ttms-ptr-text{font-size:1.28rem;font-weight:700;letter-spacing:-0.01em;text-align:center;}' +
      '#ttms-ptr-indicator.ttms-ptr-ready .ttms-ptr-icon{transform:rotate(-180deg);}' +
      '#ttms-ptr-indicator.ttms-ptr-ready .ttms-ptr-orb{animation:ttms-ptr-pulse .7s ease-in-out infinite;}' +
      '#ttms-ptr-indicator.ttms-ptr-ready .ttms-ptr-orb::after{content:"";position:absolute;inset:-0.55rem;border-radius:50%;' +
      'border:2px solid color-mix(in srgb, var(--dash-accent, var(--scheme-accent, #e5ad36)) 70%, transparent);' +
      'animation:ttms-ptr-ring .9s ease-out infinite;}' +
      '#ttms-ptr-indicator.ttms-ptr-refreshing .ttms-ptr-icon{animation:ttms-ptr-spin .7s linear infinite;}' +
      '#ttms-ptr-indicator.ttms-ptr-refreshing .ttms-ptr-orb::after{content:"";position:absolute;inset:-0.35rem;border-radius:50%;' +
      'border:3px solid transparent;border-top-color:var(--dash-accent, var(--scheme-accent, #e5ad36));' +
      'animation:ttms-ptr-spin .7s linear infinite;}' +
      '@keyframes ttms-ptr-spin{to{transform:rotate(360deg);}}' +
      '@keyframes ttms-ptr-pulse{0%,100%{transform:scale(1);}50%{transform:scale(1.08);}}' +
      '@keyframes ttms-ptr-ring{0%{transform:scale(.86);opacity:.85;}100%{transform:scale(1.28);opacity:0;}}' +
      '@media (prefers-reduced-motion: reduce){' +
      '#ttms-ptr-indicator.ttms-ptr-ready .ttms-ptr-orb,' +
      '#ttms-ptr-indicator.ttms-ptr-ready .ttms-ptr-orb::after,' +
      '#ttms-ptr-indicator.ttms-ptr-refreshing .ttms-ptr-icon,' +
      '#ttms-ptr-indicator.ttms-ptr-refreshing .ttms-ptr-orb::after{animation:none;}}';
    var s = document.createElement('style');
    s.id = 'ttms-ptr-styles';
    s.textContent = css;
    document.head.appendChild(s);
  }

  function placeMessage(el, shown, scale) {
    var inner = el.querySelector('.ttms-ptr-inner');
    if (!inner) return;
    var h = inner.offsetHeight || 210;
    var y = shown - h / 2;
    inner.style.transform = 'translate(-50%, ' + y + 'px) scale(' + scale + ')';
  }

  function setIndicatorPull(dy) {
    var center = centerY();
    var shown = Math.min(Math.max(dy, 0), center);
    lastPullPx = shown;
    var t = shown / center;
    var el = ensureIndicator();
    el.classList.add('ttms-ptr-visible');
    el.classList.remove('ttms-ptr-refreshing');
    var scrim = el.querySelector('.ttms-ptr-scrim');
    if (scrim) scrim.style.opacity = String(Math.min(0.78, t * 0.78));
    placeMessage(el, shown, 0.78 + t * 0.3);
    var ready = shown >= center - 8;
    el.classList.toggle('ttms-ptr-ready', ready);
    var text = el.querySelector('.ttms-ptr-text');
    if (text) text.textContent = ready ? 'Release to refresh' : 'Pull to refresh';
    el.setAttribute('aria-hidden', ready ? 'false' : 'true');
  }

  function setIndicatorRefreshing(active) {
    var el = ensureIndicator();
    var text = el.querySelector('.ttms-ptr-text');
    if (active) {
      el.classList.add('ttms-ptr-visible', 'ttms-ptr-refreshing');
      el.classList.remove('ttms-ptr-ready');
      var scrim = el.querySelector('.ttms-ptr-scrim');
      if (scrim) scrim.style.opacity = '0.78';
      placeMessage(el, centerY(), 1.08);
      el.setAttribute('aria-hidden', 'false');
      if (text) text.textContent = 'Refreshing';
      return;
    }
    el.classList.remove('ttms-ptr-refreshing');
    if (text) text.textContent = 'Pull to refresh';
  }

  function hideIndicator() {
    if (!indicator) return;
    indicator.classList.remove('ttms-ptr-visible', 'ttms-ptr-ready', 'ttms-ptr-refreshing');
    indicator.setAttribute('aria-hidden', 'true');
    var scrim = indicator.querySelector('.ttms-ptr-scrim');
    if (scrim) scrim.style.opacity = '0';
    var inner = indicator.querySelector('.ttms-ptr-inner');
    if (inner) inner.style.transform = 'translate(-50%, -140%)';
    var text = indicator.querySelector('.ttms-ptr-text');
    if (text) text.textContent = 'Pull to refresh';
  }

  function detachTouchListeners() {
    document.removeEventListener('touchmove', onTouchMove, optsMove);
    document.removeEventListener('touchend', onTouchEnd, optsEnd);
    document.removeEventListener('touchcancel', onTouchEnd, optsEnd);
  }

  function cancelPullGesture() {
    resetPullState();
  }

  function runDashboardSoftRefresh() {
    var tasks = [];

    document.dispatchEvent(
      new CustomEvent('ttms:pull-refresh', { detail: { soft: true, dashboard: true } })
    );

    if (window.DashboardMenuStatus && typeof window.DashboardMenuStatus.refresh === 'function') {
      tasks.push(Promise.resolve(window.DashboardMenuStatus.refresh()));
    } else if (typeof window.__ttmsMenuStatusRefresh === 'function') {
      tasks.push(Promise.resolve(window.__ttmsMenuStatusRefresh()));
    }

    if (window.DashboardAnalyticsSnapshot) {
      if (document.getElementById('dashboardAnalyticsPage') && window.DashboardAnalyticsSnapshot.loadAnalyticsPage) {
        tasks.push(Promise.resolve(window.DashboardAnalyticsSnapshot.loadAnalyticsPage({ days: 30 })));
      } else if (window.DashboardAnalyticsSnapshot.loadDashboardCard) {
        tasks.push(Promise.resolve(window.DashboardAnalyticsSnapshot.loadDashboardCard({ days: 30 })));
      }
    }

    if (window.DashboardNotifications) {
      if (document.getElementById('dashboardNotificationsPage') && window.DashboardNotifications.refreshOverview) {
        tasks.push(Promise.resolve(window.DashboardNotifications.refreshOverview()));
      } else if (window.DashboardNotifications.loadDashboardCard) {
        tasks.push(Promise.resolve(window.DashboardNotifications.loadDashboardCard({ days: 30 })));
      }
    }

    return Promise.allSettled(tasks);
  }

  function performDashboardSoftRefresh() {
    if (reloading) return;
    reloading = true;
    setIndicatorRefreshing(true);

    runDashboardSoftRefresh()
      .catch(function () {
        /* ignore */
      })
      .then(function () {
        reloading = false;
        hideIndicator();
      });
  }

  function onTouchMove(e) {
    if (!tracking || reloading) return;

    if (!canUsePullToRefresh(e.target) || !isAtPageTop()) {
      cancelPullGesture();
      return;
    }

    var touch = e.touches[0];
    var dy = touch.clientY - startY;    var dx = touch.clientX - startX;
    if (dy <= 0) {
      window.TTMS_PTR_PULLING = false;
      lastPullPx = 0;
      hideIndicator();
      return;
    }

    if (Math.abs(dx) > Math.abs(dy) * HORIZONTAL_CANCEL_RATIO) {
      cancelPullGesture();
      return;
    }

    var clamped = Math.min(dy, centerY());
    if (clamped > 8) {
      window.TTMS_PTR_PULLING = true;
      try {
        e.preventDefault();
        e.stopImmediatePropagation();
      } catch (err) {
        /* non-passive fallback */
      }
    }
    setIndicatorPull(clamped);
  }

  function onTouchEnd() {
    detachTouchListeners();
    window.TTMS_PTR_PULLING = false;

    if (!tracking || reloading) {
      resetPullState();
      return;
    }

    tracking = false;

    var reachedCenter = lastPullPx >= centerY() - 8;
    lastPullPx = 0;

    if (reachedCenter) {
      holding = true;
      setIndicatorRefreshing(true);
      window.setTimeout(function () {
        holding = false;
        if (isDashboardPage()) {
          performDashboardSoftRefresh();
          return;
        }
        reloading = true;
        window.location.reload();
      }, centerHoldMs());
      return;
    }

    hideIndicator();
  }

  function onTouchStart(e) {
    if (reloading || holding || tracking) return;
    if (!canUsePullToRefresh(e.target)) return;

    var t = e.touches[0];
    startY = t.clientY;
    startX = t.clientX;
    lastPullPx = 0;
    tracking = true;

    document.addEventListener('touchmove', onTouchMove, optsMove);
    document.addEventListener('touchend', onTouchEnd, optsEnd);
    document.addEventListener('touchcancel', onTouchEnd, optsEnd);
  }

  function registerLifecycle() {
    if (window.TTMSBarba) {
      window.TTMSBarba.register(resetPullState);
    }
    document.addEventListener('ttms:page-enter', resetPullState);
    document.addEventListener('menuReelsFlattened', resetPullState);
  }

  function init() {
    if (!isPullToRefreshEnabled()) return;
    injectStyles();
    document.addEventListener('touchstart', onTouchStart, { passive: true, capture: false });
    registerLifecycle();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
