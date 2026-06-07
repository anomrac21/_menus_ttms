/**
 * Pull-down to reload — intended for installed PWA / standalone display mode
 * where there is no browser refresh control.
 */
(function () {
  'use strict';

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

  if (!isStandaloneAppDisplay()) return;

  var THRESHOLD = 300;
  var MAX_VISUAL = 360;
  var MIN_PULL_BEFORE_UI = 28;
  var HORIZONTAL_CANCEL_RATIO = 0.85;

  var BLOCKED_SELECTORS = [
    '#menu-reels-track',
    '.menu-reels-track',
    '.menu-reels-viewport',
    '.menu-reels-slide',
    '.menu-smash-pass',
    '.menu-smash-pass-card',
    '.menu-reels-item-modal',
    '.menu-reels-item-modal__body',
    '.menu-item-card.menu-reels-slide',
    '.hero-content.menu-reels-slide',
    '.ads-reels-track',
    '#ads-reels-overlay',
    '.ads-reels-slide',
    '#menublock',
    '.dashboard',
    '.menu-image-upload-modal',
    '.expanded-item-details',
    '.single-page-content',
    '.menu-item-slideshow',
    '.expanded-image-carousel',
    '.location-picker',
    '.search-results',
    'header',
    'footer',
  ].join(', ');

  var startY = 0;
  var startX = 0;
  var tracking = false;
  var pullCommitted = false;
  var reloading = false;
  var lastPullPx = 0;
  var optsMove = { passive: false, capture: true };
  var optsEnd = { capture: true };

  function scrollTop() {
    return (
      window.scrollY ||
      document.documentElement.scrollTop ||
      document.body.scrollTop ||
      0
    );
  }

  function isMenuReelsHomeActive() {
    return (
      document.body.classList.contains('menu-reels-mode') ||
      document.documentElement.classList.contains('menu-reels-mode') ||
      !!document.getElementById('menu-reels-track')
    );
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
    if (document.body.classList.contains('menu-reels-item-modal-open')) return true;
    if (target.closest(BLOCKED_SELECTORS)) return true;
    if (target.closest('main.main--home')) return true;
    return false;
  }

  function canUsePullToRefresh(target) {
    if (reloading) return false;
    if (isMenuReelsHomeActive()) return false;
    if (document.body.classList.contains('menu-reels-item-modal-open')) return false;
    if (scrollTop() > 2) return false;
    if (isTouchOnBlockedTarget(target)) return false;
    if (hasScrolledAncestor(target)) return false;
    return true;
  }

  function resetPullState() {
    tracking = false;
    pullCommitted = false;
    lastPullPx = 0;
    hideIndicator();
    detachTouchListeners();
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
      '<div class="ttms-ptr-inner"><span class="ttms-ptr-icon" aria-hidden="true">↓</span><span class="ttms-ptr-text">Pull to refresh</span></div>';
    document.body.appendChild(el);
    indicator = el;
    return el;
  }

  function injectStyles() {
    if (document.getElementById('ttms-ptr-styles')) return;
    var css =
      '#ttms-ptr-indicator{position:fixed;left:0;right:0;top:0;z-index:2147483000;' +
      'display:flex;justify-content:center;pointer-events:none;' +
      'transform:translateY(-100%);transition:opacity .15s ease;opacity:0;' +
      'font-family:system-ui,-apple-system,sans-serif;font-size:13px;}' +
      '#ttms-ptr-indicator.ttms-ptr-visible{opacity:1;}' +
      '.ttms-ptr-inner{margin-top:8px;padding:8px 14px;border-radius:999px;' +
      'background:rgba(0,0,0,.78);color:#fff;box-shadow:0 2px 12px rgba(0,0,0,.25);' +
      'display:flex;align-items:center;gap:8px;}' +
      '.ttms-ptr-icon{display:inline-block;transition:transform .12s ease;}' +
      '#ttms-ptr-indicator.ttms-ptr-ready .ttms-ptr-icon{transform:rotate(-180deg);}' +
      '#ttms-ptr-indicator.ttms-ptr-ready .ttms-ptr-text::after{content:" — release";}';
    var s = document.createElement('style');
    s.id = 'ttms-ptr-styles';
    s.textContent = css;
    document.head.appendChild(s);
  }

  function setIndicatorPull(dy) {
    lastPullPx = dy;
    var el = ensureIndicator();
    var t = Math.min(dy / THRESHOLD, 1);
    var translate = -100 + t * 100;
    el.style.transform = 'translateY(' + Math.min(translate, 0) + '%)';
    el.classList.add('ttms-ptr-visible');
    if (dy >= THRESHOLD) {
      el.classList.add('ttms-ptr-ready');
      el.setAttribute('aria-hidden', 'false');
    } else {
      el.classList.remove('ttms-ptr-ready');
      el.setAttribute('aria-hidden', 'true');
    }
  }

  function hideIndicator() {
    if (!indicator) return;
    indicator.classList.remove('ttms-ptr-visible', 'ttms-ptr-ready');
    indicator.style.transform = 'translateY(-100%)';
    indicator.setAttribute('aria-hidden', 'true');
  }

  function detachTouchListeners() {
    document.removeEventListener('touchmove', onTouchMove, optsMove);
    document.removeEventListener('touchend', onTouchEnd, optsEnd);
    document.removeEventListener('touchcancel', onTouchEnd, optsEnd);
  }

  function cancelPullGesture() {
    resetPullState();
  }

  function onTouchMove(e) {
    if (!tracking || reloading) return;

    if (!canUsePullToRefresh(e.target)) {
      cancelPullGesture();
      return;
    }

    if (scrollTop() > 2) {
      cancelPullGesture();
      return;
    }

    var touch = e.touches[0];
    var dy = touch.clientY - startY;
    var dx = touch.clientX - startX;

    if (dy <= 0) {
      pullCommitted = false;
      lastPullPx = 0;
      hideIndicator();
      return;
    }

    if (Math.abs(dx) > Math.abs(dy) * HORIZONTAL_CANCEL_RATIO) {
      cancelPullGesture();
      return;
    }

    if (!pullCommitted && dy < MIN_PULL_BEFORE_UI) {
      return;
    }

    pullCommitted = true;
    var clamped = Math.min(dy, MAX_VISUAL);
    try {
      e.preventDefault();
    } catch (err) {
      /* non-passive fallback */
    }
    setIndicatorPull(clamped);
  }

  function onTouchEnd() {
    detachTouchListeners();

    if (!tracking || reloading || !pullCommitted) {
      resetPullState();
      return;
    }

    tracking = false;
    pullCommitted = false;

    var shouldReload = lastPullPx >= THRESHOLD;
    lastPullPx = 0;
    hideIndicator();

    if (shouldReload) {
      reloading = true;
      window.location.reload();
    }
  }

  function onTouchStart(e) {
    if (reloading || tracking) return;
    if (!canUsePullToRefresh(e.target)) return;

    var t = e.touches[0];
    startY = t.clientY;
    startX = t.clientX;
    lastPullPx = 0;
    pullCommitted = false;
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
