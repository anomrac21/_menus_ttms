/**
 * Single menu item page — (re)init after Barba transitions and first load.
 */
(function () {
  'use strict';

  function initSinglePageFeatures() {
    if (typeof window.closeAllPanelsBeforeNavigation === 'function') {
      window.closeAllPanelsBeforeNavigation();
    } else if (typeof window.ensureMenuReelsItemModalClosed === 'function') {
      window.ensureMenuReelsItemModalClosed();
    }

    if (!document.querySelector('.single-page-item-card')) {
      return;
    }

    if (typeof window.reinitSinglePagePrice === 'function') {
      window.reinitSinglePagePrice();
    }

    if (window.TTMSMenuFavorites && typeof window.TTMSMenuFavorites.init === 'function') {
      window.TTMSMenuFavorites.init();
    }

    if (typeof window.initMenuImageIntegration === 'function') {
      window.initMenuImageIntegration();
    }

    if (typeof window.initMenuSmashPass === 'function') {
      window.initMenuSmashPass();
    }

    document.querySelectorAll('.single-page-item-card .js-share-btn').forEach(function (btn) {
      var titleEl = document.querySelector(
        '.single-page-item-card .menu-item-title-text, .single-page-item-card .single-page-title'
      );
      btn.dataset.shareUrl = window.location.href;
      if (titleEl && titleEl.textContent) {
        btn.dataset.shareTitle = titleEl.textContent.trim();
      }
    });
  }

  function register() {
    if (window.TTMSBarba) {
      window.TTMSBarba.register(initSinglePageFeatures);
    }
  }

  window.initSinglePageFeatures = initSinglePageFeatures;

  document.addEventListener('ttms:page-enter', initSinglePageFeatures);

  register();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSinglePageFeatures);
  } else {
    initSinglePageFeatures();
  }
})();
