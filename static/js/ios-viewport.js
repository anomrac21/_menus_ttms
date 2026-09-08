/**
 * iOS viewport height sync + scroll lock for modals/dashboards.
 * Watches body modal classes and locks page scroll so fixed overlays stay at the top.
 */
(function () {
  'use strict';

  var LOCK_CLASSES = [
    'cart-open',
    'modal-open',
    'table-modal-open',
    'menu-reels-item-modal-open',
    'ads-reels-open',
  ];

  var scrollY = 0;
  var locked = false;
  var lastVvh = '';
  var lastVvOffset = '';

  function viewportVarsStyle() {
    var el = document.getElementById('ttms-vv-vars');
    if (el) return el;
    el = document.createElement('style');
    el.id = 'ttms-vv-vars';
    (document.head || document.documentElement).appendChild(el);
    return el;
  }

  function syncViewportHeight() {
    var vv = window.visualViewport;
    var height = (vv ? vv.height : window.innerHeight) + 'px';
    var offset = (vv ? vv.offsetTop : 0) + 'px';
    if (height === lastVvh && offset === lastVvOffset) return;
    lastVvh = height;
    lastVvOffset = offset;
    /* Write on body, not html/:root: mutating documentElement.style
       makes Chrome discard DevTools edits to colors.css. */
    viewportVarsStyle().textContent =
      'html,body{--ttms-vvh:' + height + ';--ttms-vv-offset-top:' + offset + ';}';
  }

  function shouldLockScroll() {
    return LOCK_CLASSES.some(function (cls) {
      return document.body.classList.contains(cls);
    });
  }

  function applyScrollLock() {
    if (!document.body) return;

    var shouldLock = shouldLockScroll();
    if (shouldLock && !locked) {
      scrollY = window.scrollY || document.documentElement.scrollTop || 0;
      document.body.classList.add('ttms-scroll-locked');
      document.body.style.top = '-' + scrollY + 'px';
      document.documentElement.classList.add('ttms-scroll-locked');
      locked = true;
      syncViewportHeight();
      return;
    }

    if (!shouldLock && locked) {
      document.body.classList.remove('ttms-scroll-locked');
      document.body.style.top = '';
      document.documentElement.classList.remove('ttms-scroll-locked');
      locked = false;
      window.scrollTo(0, scrollY);
    }
  }

  function bindViewportListeners() {
    syncViewportHeight();

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', syncViewportHeight);
      window.visualViewport.addEventListener('scroll', syncViewportHeight);
    }

    window.addEventListener('resize', syncViewportHeight);
    window.addEventListener('orientationchange', function () {
      window.setTimeout(syncViewportHeight, 120);
    });
  }

  function bindScrollLockObserver() {
    if (!document.body || typeof MutationObserver === 'undefined') return;

    new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        if (mutations[i].attributeName === 'class') {
          applyScrollLock();
          break;
        }
      }
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

    applyScrollLock();
  }

  function init() {
    bindViewportListeners();
    bindScrollLockObserver();
  }

  bindViewportListeners();

  if (document.body) {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }

  window.TTMSViewport = {
    sync: syncViewportHeight,
    refreshScrollLock: applyScrollLock,
  };
})();
