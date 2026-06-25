/**
 * Admin-only modal shell for the menu item / promotion editor (/edit-menu/?embed=panel).
 */
(function () {
  'use strict';

  var MODAL_ID = 'menu-item-edit-modal';
  var FRAME_ID = 'menuItemEditModalFrame';
  var EDIT_EMBED_PATH = '/edit-menu/?embed=panel';
  var FOCUS_ITEM_KEY = 'editMenuFocusItemUrl';
  var FOCUS_SECTION_SLUG_KEY = 'editMenuFocusSectionSlug';
  var FOCUS_PROMO_CATALOG_KEY = 'editMenuFocusPromoCatalogIndex';
  var FOCUS_PROMO_ID_KEY = 'editMenuFocusPromoId';

  function getModal() {
    return document.getElementById(MODAL_ID);
  }

  function getFrame() {
    return document.getElementById(FRAME_ID);
  }

  function hasAdminSiteAccess() {
    if (!window.AuthClient || !AuthClient.isAuthenticated() || !AuthClient.isAdmin()) {
      return false;
    }
    return (
      window.AuthClientAccess &&
      typeof AuthClientAccess.hasClientAccess === 'function' &&
      AuthClientAccess.hasClientAccess()
    );
  }

  function normalizeItemUrl(url) {
    var trimmed = String(url || '').trim();
    if (!trimmed) return '';
    if (trimmed.charAt(0) !== '/') trimmed = '/' + trimmed;
    return trimmed.replace(/\/+$/, '') + '/';
  }

  function setModalTitle(menuRoot) {
    var modal = getModal();
    if (!modal) return;
    var titleEl = modal.querySelector('.menu-item-edit-modal__title');
    if (!titleEl) return;
    var kind = (menuRoot && menuRoot.getAttribute('data-actions-kind')) || 'menu-item';
    var label =
      (menuRoot && menuRoot.getAttribute('data-item-title')) ||
      (kind === 'promotion' ? 'Promotion' : kind === 'section-header' ? 'Section' : 'Menu item');
    if (kind === 'promotion') {
      titleEl.textContent = 'Edit promotion';
    } else if (kind === 'section-header') {
      titleEl.textContent = 'Edit section · ' + label;
    } else {
      titleEl.textContent = 'Edit ' + label;
    }
  }

  function storeFocusKeys(menuRoot) {
    if (!menuRoot) return;
    var kind = menuRoot.getAttribute('data-actions-kind') || 'menu-item';
    try {
      if (kind === 'promotion') {
        sessionStorage.removeItem(FOCUS_ITEM_KEY);
        sessionStorage.removeItem(FOCUS_SECTION_SLUG_KEY);
        var catalogIndex = menuRoot.getAttribute('data-promotion-catalog-index');
        var adId = menuRoot.getAttribute('data-ad-id') || '';
        var slide = menuRoot.closest('article.ads-reels-slide');
        if ((!catalogIndex || catalogIndex === '') && slide) {
          catalogIndex = slide.getAttribute('data-catalog-index') || '';
        }
        if (!adId && slide) {
          adId = slide.getAttribute('data-ad-id') || slide.id || '';
        }
        if (catalogIndex != null && catalogIndex !== '') {
          sessionStorage.setItem(FOCUS_PROMO_CATALOG_KEY, String(catalogIndex));
        } else {
          sessionStorage.removeItem(FOCUS_PROMO_CATALOG_KEY);
        }
        if (adId) sessionStorage.setItem(FOCUS_PROMO_ID_KEY, adId);
        else sessionStorage.removeItem(FOCUS_PROMO_ID_KEY);
        return;
      }

      if (kind === 'section-header') {
        sessionStorage.removeItem(FOCUS_PROMO_CATALOG_KEY);
        sessionStorage.removeItem(FOCUS_PROMO_ID_KEY);
        sessionStorage.removeItem(FOCUS_ITEM_KEY);
        var headerEl = menuRoot.closest('.menu-header');
        var sectionSlug =
          menuRoot.getAttribute('data-section-slug') ||
          (headerEl && headerEl.getAttribute('data-section-slug')) ||
          '';
        if (sectionSlug) sessionStorage.setItem(FOCUS_SECTION_SLUG_KEY, sectionSlug);
        else sessionStorage.removeItem(FOCUS_SECTION_SLUG_KEY);
        return;
      }

      sessionStorage.removeItem(FOCUS_PROMO_CATALOG_KEY);
      sessionStorage.removeItem(FOCUS_PROMO_ID_KEY);
      sessionStorage.removeItem(FOCUS_SECTION_SLUG_KEY);
      var itemUrl =
        normalizeItemUrl(menuRoot.getAttribute('data-item-url')) ||
        normalizeItemUrl(
          (menuRoot.closest('.menu-item-card') &&
            menuRoot.closest('.menu-item-card').getAttribute('data-item-url')) ||
            ''
        );
      if (itemUrl) sessionStorage.setItem(FOCUS_ITEM_KEY, itemUrl);
      else sessionStorage.removeItem(FOCUS_ITEM_KEY);
    } catch (err) {
      /* ignore */
    }
  }

  function open(menuRoot) {
    if (!hasAdminSiteAccess()) return false;
    var modal = getModal();
    var frame = getFrame();
    if (!modal || !frame) return false;

    storeFocusKeys(menuRoot);
    setModalTitle(menuRoot);

    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('menu-item-edit-modal-open');

    var embedSrc = EDIT_EMBED_PATH;
    if (frame.getAttribute('src') !== embedSrc) {
      frame.setAttribute('src', embedSrc);
    } else if (frame.contentWindow) {
      try {
        frame.contentWindow.location.reload();
      } catch (reloadErr) {
        frame.setAttribute('src', embedSrc);
      }
    }

    return true;
  }

  function close() {
    var modal = getModal();
    var frame = getFrame();
    if (!modal) return;

    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('menu-item-edit-modal-open');

    if (frame) {
      frame.setAttribute('src', 'about:blank');
    }
  }

  function onDocumentClick(e) {
    if (e.target.closest('[data-close-menu-item-edit-modal]')) {
      e.preventDefault();
      close();
    }
  }

  function onDocumentKeydown(e) {
    if (e.key === 'Escape' && getModal() && !getModal().hidden) {
      close();
    }
  }

  function onMessage(event) {
    if (!event || event.data == null) return;
    var data = event.data;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (err) {
        return;
      }
    }
    if (!data || data.type !== 'ttms:close-menu-item-edit-modal') return;
    close();
    if (data.reload) {
      window.location.reload();
    }
  }

  function init() {
    document.removeEventListener('click', onDocumentClick, true);
    document.addEventListener('click', onDocumentClick, true);
    document.removeEventListener('keydown', onDocumentKeydown, true);
    document.addEventListener('keydown', onDocumentKeydown, true);
    window.removeEventListener('message', onMessage);
    window.addEventListener('message', onMessage);

    if (window.AuthMiddleware && typeof AuthMiddleware.toggleAuthElements === 'function') {
      AuthMiddleware.toggleAuthElements();
    }
  }

  function start() {
    if (window.AuthClient && typeof AuthClient.whenReady === 'function') {
      AuthClient.whenReady().then(init);
      return;
    }
    init();
  }

  window.addEventListener('ttms:auth-ready', init);
  document.addEventListener('ttms:page-enter', init);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  window.TTMSMenuItemEditModal = {
    open: open,
    close: close,
    hasAccess: hasAdminSiteAccess,
  };
})();
