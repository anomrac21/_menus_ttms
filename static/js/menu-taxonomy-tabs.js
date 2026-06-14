/**
 * Tabbed taxonomy browser on /tags/
 */
(function () {
  'use strict';

  var HASH_PREFIX = 'taxonomy-';

  function initMenuTaxonomyTabs(root) {
    var container = root || document.querySelector('[data-menu-taxonomy-tabs]');
    if (!container || container._ttmsTaxonomyTabsBound) {
      return;
    }
    container._ttmsTaxonomyTabsBound = true;

    var tabs = Array.prototype.slice.call(container.querySelectorAll('[data-taxonomy-tab]'));
    var panels = Array.prototype.slice.call(container.querySelectorAll('[data-taxonomy-panel]'));
    if (!tabs.length || !panels.length) {
      return;
    }

    function activate(key, focusTab) {
      if (!key) {
        return;
      }
      tabs.forEach(function (tab) {
        var isActive = tab.getAttribute('data-taxonomy-tab') === key;
        tab.classList.toggle('is-active', isActive);
        tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
        tab.tabIndex = isActive ? 0 : -1;
        if (isActive && focusTab) {
          tab.focus();
        }
      });
      panels.forEach(function (panel) {
        var isActive = panel.getAttribute('data-taxonomy-panel') === key;
        panel.classList.toggle('is-active', isActive);
        panel.hidden = !isActive;
      });
      if (typeof window.liveSearch === 'function') {
        window.liveSearch();
      }
    }

    function keyFromHash() {
      var hash = window.location.hash || '';
      if (hash.indexOf('#' + HASH_PREFIX) !== 0) {
        return '';
      }
      return hash.slice(('#' + HASH_PREFIX).length);
    }

    function setHash(key) {
      if (!key || !window.history || !window.history.replaceState) {
        return;
      }
      var next = '#' + HASH_PREFIX + key;
      if (window.location.hash !== next) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search + next);
      }
    }

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var key = tab.getAttribute('data-taxonomy-tab');
        activate(key, false);
        setHash(key);
      });
      tab.addEventListener('keydown', function (event) {
        var index = tabs.indexOf(tab);
        var nextIndex = -1;
        if (event.key === 'ArrowRight') {
          nextIndex = (index + 1) % tabs.length;
        } else if (event.key === 'ArrowLeft') {
          nextIndex = (index - 1 + tabs.length) % tabs.length;
        } else if (event.key === 'Home') {
          nextIndex = 0;
        } else if (event.key === 'End') {
          nextIndex = tabs.length - 1;
        }
        if (nextIndex < 0) {
          return;
        }
        event.preventDefault();
        var nextKey = tabs[nextIndex].getAttribute('data-taxonomy-tab');
        activate(nextKey, true);
        setHash(nextKey);
      });
    });

    var hashKey = keyFromHash();
    if (hashKey && container.querySelector('[data-taxonomy-panel="' + hashKey + '"]')) {
      activate(hashKey, false);
    }

    window.addEventListener('hashchange', function () {
      var key = keyFromHash();
      if (key && container.querySelector('[data-taxonomy-panel="' + key + '"]')) {
        activate(key, false);
      }
    });
  }

  window.initMenuTaxonomyTabs = initMenuTaxonomyTabs;

  function boot() {
    initMenuTaxonomyTabs();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  if (window.TTMSBarba) {
    window.TTMSBarba.register(function () {
      var container = document.querySelector('[data-menu-taxonomy-tabs]');
      if (container) {
        container._ttmsTaxonomyTabsBound = false;
      }
      initMenuTaxonomyTabs();
    });
  }
})();
