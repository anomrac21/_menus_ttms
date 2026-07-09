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
    '/edit-menu-colors',
    '/edit-menu-rearrange',
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

  /**
   * Return true to skip Barba (UI-only taps must not trigger leave/showLoader).
   * Android Chrome: Barba treating href="#" as navigation leaves the black #loader stuck.
   */
  function shouldPreventBarbaNavigation(href, el) {
    if (el) {
      if (el.getAttribute('data-barba') === 'prevent') return true;
      if (el.getAttribute('role') === 'button') return true;
      if (el.hasAttribute('data-dashboard-toggle')) return true;
      if (el.id === 'menublockToggle' || el.classList.contains('header-menublock-toggle')) {
        return true;
      }
    }

    // Hash / empty / bare "#" — UI controls and in-page anchors, never Barba SPA
    if (!href || href === '#' || href === '' || href.charAt(0) === '#') {
      return true;
    }

    if (typeof href === 'string') {
      try {
        var url = new URL(href, window.location.href);
        if (url.origin === window.location.origin) {
          var path = (url.pathname || '/').replace(/\/+$/, '') || '/';
          var cur = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
          // Same path + hash only (e.g. /#Dessert) — not a page transition
          if (path === cur && url.hash) {
            return true;
          }
        }
      } catch (err) {
        /* ignore */
      }
    }

    return shouldUseFullPageNavigation(href);
  }

  window.TTMSBarbaShouldPrevent = shouldPreventBarbaNavigation;

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

  function navigate(href, el) {
    if (!href || href === '#' || href.charAt(0) === '#') return false;
    if (shouldPreventBarbaNavigation(href, el || null) && !shouldUseFullPageNavigation(href)) {
      return false;
    }

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

  function bindFullPageNavGuard() {
    if (window._ttmsFullPageNavGuardBound) return;
    window._ttmsFullPageNavGuardBound = true;

    document.addEventListener(
      'click',
      function (e) {
        if (e.defaultPrevented || e.button !== 0) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

        var link = e.target && e.target.closest && e.target.closest('a[href]');
        if (!link || link.target === '_blank' || link.hasAttribute('download')) return;

        var href = link.getAttribute('href');

        // UI-only controls: stop Barba from ever seeing these clicks.
        if (shouldPreventBarbaNavigation(href, link) && !shouldUseFullPageNavigation(href)) {
          // Only cancel bare "#" / empty — real "#section" anchors must still navigate.
          if (!href || href === '#') {
            e.preventDefault();
          }
          return;
        }

        if (!shouldUseFullPageNavigation(href)) return;

        e.preventDefault();
        if (typeof e.stopImmediatePropagation === 'function') {
          e.stopImmediatePropagation();
        }
        e.stopPropagation();

        if (typeof window.closeAllPanelsBeforeNavigation === 'function') {
          window.closeAllPanelsBeforeNavigation();
        } else if (typeof window.closeAll === 'function') {
          window.closeAll();
        }

        window.location.assign(new URL(href, window.location.href).href);
      },
      true
    );
  }

  bindFullPageNavGuard();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindBarbaEvents);
  } else {
    bindBarbaEvents();
  }
})();
