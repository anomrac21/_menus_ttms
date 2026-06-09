/**
 * Single Barba / page-enter reinit hub for menu pages.
 */
(function () {
  'use strict';

  if (window.__ttmsPageReinitLoaded) return;
  window.__ttmsPageReinitLoaded = true;

  function reinitTTMSPageFeatures() {
    if (typeof window.hydrateAllDraftMenuCardImages === 'function') {
      window.hydrateAllDraftMenuCardImages();
    }
    if (typeof window.liveSearch === 'function') {
      var searchInput = document.getElementById('searchbox');
      if (searchInput && searchInput.value.trim()) {
        window.liveSearch();
      }
    }
    if (typeof window.applyDayBasedPromos === 'function') {
      window.applyDayBasedPromos();
    }
    if (typeof window.initializeFooterVisibility === 'function') {
      window.initializeFooterVisibility();
    }
    if (typeof window.initSinglePageFeatures === 'function') {
      window.initSinglePageFeatures();
    }
    if (typeof window.updateLocationStatuses === 'function') {
      window.updateLocationStatuses();
    }
    if (typeof window.bindMenublockScroll === 'function') {
      window.bindMenublockScroll();
    }
    if (typeof window.updateHeaderMenublockScroll === 'function') {
      window.updateHeaderMenublockScroll();
    }
    if (typeof window.bindDashboardTriggers === 'function') {
      window.bindDashboardTriggers();
    }
    if (document.querySelector('.location-picker') && typeof window.initLocationPicker === 'function') {
      window.initLocationPicker();
    }
  }

  window.reinitTTMSPageFeatures = reinitTTMSPageFeatures;

  function registerBarbaReinit() {
    if (!window.TTMSBarba) return;

    window.TTMSBarba.register(function () {
      if (typeof window.initializeLocationNavigation === 'function') {
        setTimeout(window.initializeLocationNavigation, 100);
      }
    });

    window.TTMSBarba.register(function () {
      setTimeout(reinitTTMSPageFeatures, 50);
    });

    if (typeof window.reloadAppJS === 'function') {
      window.TTMSBarba.register(window.reloadAppJS);
    }
  }

  document.addEventListener('ttms:page-enter', function () {
    setTimeout(reinitTTMSPageFeatures, 80);
  });

  document.addEventListener('menuReelsFlattened', function () {
    if (typeof window.updateLocationStatuses === 'function') {
      setTimeout(window.updateLocationStatuses, 120);
    }
    if (document.querySelector('.location-picker') && typeof window.initLocationPicker === 'function') {
      window.initLocationPicker();
    }
    if (typeof window.consumeOpenLocationPickerIntent === 'function') {
      setTimeout(window.consumeOpenLocationPickerIntent, 180);
    }
  });

  if (window.TTMSBarba) {
    registerBarbaReinit();
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', registerBarbaReinit);
  } else {
    registerBarbaReinit();
  }
})();
