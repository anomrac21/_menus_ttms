/**
 * Central Barba.js lifecycle coordinator for TTMS menu sites.
 * Registers page re-init callbacks and runs them after each transition.
 */
(function () {
  'use strict';

  var callbacks = [];
  var scheduled = null;
  var bound = false;

  var FULL_PAGE_PATH_PREFIXES = [
    '/dashboard',
    '/login',
    '/edit-menu',
    '/analytics',
    '/notifications',
    '/menu-settings',
    '/admin',
  ];

  function shouldUseFullPageNavigation(href) {
    if (!href || href === '#') return false;
    if (typeof href !== 'string') return false;

    try {
      var url = new URL(href, window.location.href);
      if (/^(javascript:|mailto:|tel:)/i.test(url.href)) return true;
      if (url.origin !== window.location.origin) return true;

      var path = (url.pathname || '/').replace(/\/+$/, '') || '/';
      return FULL_PAGE_PATH_PREFIXES.some(function (prefix) {
        return path === prefix || path.indexOf(prefix + '/') === 0;
      });
    } catch (err) {
      return false;
    }
  }

  window.TTMSBarbaShouldPrevent = shouldUseFullPageNavigation;

  function runAfterTransition(source) {
    if (scheduled) {
      clearTimeout(scheduled);
    }

    scheduled = setTimeout(function () {
      scheduled = null;
      console.log('[TTMSBarba] Reinitializing page features (' + source + ')');

      callbacks.forEach(function (fn) {
        try {
          fn();
        } catch (err) {
          console.error('[TTMSBarba] Reinit callback failed:', err);
        }
      });

      document.dispatchEvent(new CustomEvent('ttms:page-enter', { detail: { source: source } }));
    }, 100);
  }

  function bindBarbaEvents() {
    if (bound || typeof window.barba === 'undefined') {
      return;
    }
    bound = true;

    ['barba:after', 'barba:afterEnter'].forEach(function (eventName) {
      document.addEventListener(eventName, function () {
        runAfterTransition(eventName);
      });
    });
  }

  function navigate(href) {
    if (!href || href === '#') return false;

    if (typeof window.closeAllPanelsBeforeNavigation === 'function') {
      window.closeAllPanelsBeforeNavigation();
    } else if (typeof window.ensureMenuReelsItemModalClosed === 'function') {
      window.ensureMenuReelsItemModalClosed();
    }

    try {
      var url = new URL(href, window.location.href);
      if (/^(javascript:|mailto:|tel:)/i.test(url.href)) return false;

      if (url.origin !== window.location.origin) {
        window.location.assign(url.href);
        return true;
      }

      if (shouldUseFullPageNavigation(url.href)) {
        window.location.assign(url.href);
        return true;
      }

      var target = url.pathname + url.search + url.hash;
      if (typeof window.barba !== 'undefined' && typeof window.barba.go === 'function') {
        window.barba.go(target);
        return true;
      }

      window.location.assign(url.href);
      return true;
    } catch (err) {
      window.location.assign(href);
      return true;
    }
  }

  window.TTMSBarba = {
    register: function (fn) {
      if (typeof fn === 'function' && callbacks.indexOf(fn) === -1) {
        callbacks.push(fn);
      }
    },
    runNow: function (source) {
      runAfterTransition(source || 'manual');
    },
    navigate: navigate,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindBarbaEvents);
  } else {
    bindBarbaEvents();
  }
})();
