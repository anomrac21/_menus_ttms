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

  var THRESHOLD = 72;
  var MAX_VISUAL = 96;
  var startY = 0;
  var startX = 0;
  var tracking = false;
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

  function onTouchMove(e) {
    if (!tracking || reloading) return;
    if (scrollTop() > 2) {
      tracking = false;
      lastPullPx = 0;
      hideIndicator();
      detachTouchListeners();
      return;
    }
    var touch = e.touches[0];
    var dy = touch.clientY - startY;
    var dx = touch.clientX - startX;
    if (dy <= 0) {
      lastPullPx = 0;
      hideIndicator();
      return;
    }
    if (Math.abs(dx) > Math.abs(dy) * 1.2) return;

    var clamped = Math.min(dy, MAX_VISUAL);
    if (clamped > 8) {
      try {
        e.preventDefault();
      } catch (err) {
        /* non-passive fallback */
      }
    }
    setIndicatorPull(clamped);
  }

  function onTouchEnd() {
    detachTouchListeners();

    if (!tracking || reloading) {
      tracking = false;
      lastPullPx = 0;
      hideIndicator();
      return;
    }
    tracking = false;

    var shouldReload = lastPullPx >= THRESHOLD;
    lastPullPx = 0;
    hideIndicator();

    if (shouldReload) {
      reloading = true;
      window.location.reload();
    }
  }

  function onTouchStart(e) {
    if (reloading) return;
    if (tracking) return;
    if (scrollTop() > 2) return;
    var t = e.touches[0];
    startY = t.clientY;
    startX = t.clientX;
    lastPullPx = 0;
    tracking = true;

    document.addEventListener('touchmove', onTouchMove, optsMove);
    document.addEventListener('touchend', onTouchEnd, optsEnd);
    document.addEventListener('touchcancel', onTouchEnd, optsEnd);
  }

  function init() {
    injectStyles();
    document.addEventListener('touchstart', onTouchStart, { passive: true, capture: false });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
