/**
 * Admin-only modal shell for the menu item / promotion editor (/edit-menu-colors/panel/?embed=panel).
 */
(function () {
  'use strict';

  var MODAL_ID = 'menu-item-edit-modal';
  var FRAME_ID = 'menuItemEditModalFrame';
  var DRAFT_BADGE_ID = 'menuItemEditModalDraftBadge';
  var LOADING_ID = 'menuItemEditModalLoading';
  var EDIT_EMBED_PATH = '/edit-menu-colors/panel/?embed=panel';
  var FOCUS_ITEM_KEY = 'editMenuFocusItemUrl';
  var FOCUS_SECTION_SLUG_KEY = 'editMenuFocusSectionSlug';
  var FOCUS_PROMO_CATALOG_KEY = 'editMenuFocusPromoCatalogIndex';
  var FOCUS_PROMO_ID_KEY = 'editMenuFocusPromoId';

  var currentMenuRoot = null;
  var currentContentPath = '';
  var modalLoadingFallbackTimer = null;
  var editDomSnapshot = null;
  var embedPanelReady = false;
  var embedWarmStarted = false;
  var pendingOpenRefocus = null;

  function getModal() {
    return document.getElementById(MODAL_ID);
  }

  function getFrame() {
    return document.getElementById(FRAME_ID);
  }

  function getDraftBadge() {
    return document.getElementById(DRAFT_BADGE_ID);
  }

  function getLoadingEl() {
    return document.getElementById(LOADING_ID);
  }

  function getSaveBtn() {
    return document.getElementById('menuItemEditModalSave');
  }

  function getDeleteBtn() {
    return document.getElementById('menuItemEditModalDelete');
  }

  function getDiscardPrompt() {
    return document.getElementById('menuItemEditDiscardPrompt');
  }

  function hasUnsavedChanges() {
    var saveBtn = getSaveBtn();
    if (!saveBtn) return false;
    if (saveBtn.classList.contains('menu-item-edit-modal__save--pending')) return true;
    var countEl = document.getElementById('menuItemEditModalSaveCount');
    if (countEl && !countEl.classList.contains('hidden')) {
      var n = parseInt(countEl.textContent, 10);
      if (!isNaN(n) && n > 0) return true;
    }
    return false;
  }

  function showDiscardPrompt() {
    var prompt = getDiscardPrompt();
    if (!prompt) return false;
    prompt.hidden = false;
    prompt.classList.remove('hidden');
    prompt.setAttribute('aria-hidden', 'false');
    var discardBtn = document.getElementById('menuItemEditDiscardConfirm');
    if (discardBtn && typeof discardBtn.focus === 'function') {
      window.setTimeout(function () {
        try { discardBtn.focus(); } catch (e) { /* ignore */ }
      }, 0);
    }
    return true;
  }

  function hideDiscardPrompt() {
    var prompt = getDiscardPrompt();
    if (!prompt) return;
    var active = document.activeElement;
    if (active && prompt.contains(active)) {
      try {
        active.blur();
      } catch (e) { /* ignore */ }
    }
    // Move focus out before aria-hidden — browsers warn if a focused descendant is hidden.
    var closeBtn = document.querySelector(
      '#' + MODAL_ID + ' [data-close-menu-item-edit-modal]'
    );
    var modal = getModal();
    var focusTarget =
      closeBtn && !prompt.contains(closeBtn)
        ? closeBtn
        : modal && typeof modal.focus === 'function'
          ? modal
          : document.body;
    try {
      if (focusTarget && typeof focusTarget.focus === 'function') {
        focusTarget.focus({ preventScroll: true });
      }
    } catch (e2) { /* ignore */ }
    prompt.classList.add('hidden');
    prompt.hidden = true;
    prompt.setAttribute('aria-hidden', 'true');
  }

  function requestClose() {
    if (hasUnsavedChanges()) {
      if (showDiscardPrompt()) return;
      if (!window.confirm('Lose unsaved changes? Closing discards what you have not saved.')) return;
    }
    close();
  }

  function setSaveBusy(on, message) {
    var btn = getSaveBtn();
    if (!btn) return;
    btn.disabled = !!on;
    btn.setAttribute('aria-busy', on ? 'true' : 'false');
    var label = btn.querySelector('.menu-item-edit-modal__save-label');
    if (label) label.textContent = on ? (message || 'Saving…') : 'Save';
  }

  function showSavedNotice(title) {
    var existing = document.getElementById('ttmsContentSavedNotice');
    if (existing) existing.remove();
    var el = document.createElement('div');
    el.id = 'ttmsContentSavedNotice';
    el.className = 'menu-item-edit-saved-notice';
    el.setAttribute('role', 'status');
    var name = title ? String(title).trim() : '';
    el.textContent = name
      ? 'Saved “' + name + '”. Publish from the dashboard when you want customers to see it.'
      : 'Saved. Publish from the dashboard when you want customers to see it.';
    document.body.appendChild(el);
    window.setTimeout(function () {
      if (el.parentNode) el.remove();
    }, 6500);
  }

  function postToFrame(payload) {
    var frame = getFrame();
    if (!frame || !frame.contentWindow) return;
    try {
      frame.contentWindow.postMessage(payload, window.location.origin);
    } catch (err) { /* ignore */ }
  }

  function applyEmbedChromeState(data) {
    var saveBtn = getSaveBtn();
    var deleteBtn = getDeleteBtn();
    var countEl = document.getElementById('menuItemEditModalSaveCount');
    if (saveBtn && data.save) {
      saveBtn.disabled = !!data.save.disabled;
      saveBtn.classList.toggle('menu-item-edit-modal__save--pending', !!data.save.pending);
      saveBtn.classList.toggle('menu-item-edit-modal__save--synced', !data.save.pending);
      if (data.save.title) saveBtn.title = data.save.title;
      if (data.save.label) saveBtn.setAttribute('aria-label', data.save.label);
      if (countEl) {
        if (data.save.pending && data.save.count > 0) {
          countEl.textContent = String(data.save.count);
          countEl.classList.remove('hidden');
          countEl.setAttribute('aria-hidden', 'false');
        } else {
          countEl.textContent = '';
          countEl.classList.add('hidden');
          countEl.setAttribute('aria-hidden', 'true');
        }
      }
    }
    if (deleteBtn && data.remove) {
      deleteBtn.disabled = !!data.remove.disabled;
      deleteBtn.classList.toggle('is-unmark', !!data.remove.unmark);
      if (data.remove.title) deleteBtn.title = data.remove.title;
      if (data.remove.label) deleteBtn.setAttribute('aria-label', data.remove.label);
      var icon = deleteBtn.querySelector('i');
      if (icon) icon.className = data.remove.unmark ? 'fa fa-undo' : 'fa fa-trash';
    }
  }

  function setModalLoading(on, message) {
    var loadingEl = getLoadingEl();
    if (!loadingEl) return;
    loadingEl.hidden = !on;
    loadingEl.setAttribute('aria-hidden', on ? 'false' : 'true');
    loadingEl.setAttribute('aria-busy', on ? 'true' : 'false');
    if (message) {
      var label = loadingEl.querySelector('.menu-item-edit-modal__loading-label');
      if (label) label.textContent = message;
    }
    if (on) {
      if (modalLoadingFallbackTimer) clearTimeout(modalLoadingFallbackTimer);
      modalLoadingFallbackTimer = setTimeout(function () {
        setModalLoading(false);
      }, 20000);
    } else if (modalLoadingFallbackTimer) {
      clearTimeout(modalLoadingFallbackTimer);
      modalLoadingFallbackTimer = null;
    }
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

  function editableElementForMenuRoot(menuRoot) {
    if (!menuRoot) return null;
    var kind = menuRoot.getAttribute('data-actions-kind') || 'menu-item';
    if (kind === 'promotion') {
      return menuRoot.closest('article.ads-reels-slide') || menuRoot;
    }
    if (kind === 'section-header') {
      return menuRoot.closest('.menu-header') || menuRoot;
    }
    return menuRoot.closest('.menu-item-card') || menuRoot;
  }

  function contentPathForMenuRoot(menuRoot) {
    var el = editableElementForMenuRoot(menuRoot);
    if (!el) return '';
    if (window.TTMSContentDrafts && typeof window.TTMSContentDrafts.contentPathForElement === 'function') {
      return window.TTMSContentDrafts.contentPathForElement(el) || '';
    }
    if (el.classList && el.classList.contains('menu-item-card')) {
      var itemUrl = el.getAttribute('data-item-url') || '';
      return itemUrl ? 'content' + itemUrl.replace(/\/$/, '') + '.md' : '';
    }
    if (el.classList && el.classList.contains('menu-header')) {
      var stored = String(el.getAttribute('data-content-path') || '').trim().replace(/\\/g, '/');
      if (stored.indexOf('content/') === 0 && /\/_index\.md$/i.test(stored)) return stored;
      var link = el.querySelector(
        'a.menu-header__link[href], .headerstyle h2 a[href], h2 a[href], h1 a[href]'
      );
      var href = link ? String(link.getAttribute('href') || '') : '';
      href = href.split('?')[0].split('#')[0].replace(/^https?:\/\/[^/]+/i, '');
      var parts = href.split('/').filter(Boolean);
      if (parts.length) return 'content/' + parts.join('/') + '/_index.md';
      var sectionSlug = String(el.getAttribute('data-section-slug') || '').replace(/^\/+|\/+$/g, '');
      return sectionSlug ? 'content/' + sectionSlug + '/_index.md' : '';
    }
    if (el.classList && el.classList.contains('ads-reels-slide')) {
      var storedPath = el.getAttribute('data-content-path') || '';
      if (storedPath) return storedPath;
      var promoSlug =
        window.TTMSContentDrafts && typeof window.TTMSContentDrafts.promotionSlugFromElement === 'function'
          ? window.TTMSContentDrafts.promotionSlugFromElement(el)
          : '';
      if (!promoSlug) {
        var adId = el.getAttribute('data-ad-id') || '';
        if (adId.indexOf('menu-ad-') === 0) {
          promoSlug = adId.replace(/^menu-ad-/, '').replace(/-\d+$/, '');
        }
      }
      return promoSlug ? 'content/promotions/' + promoSlug + '.md' : '';
    }
    return '';
  }

  function syncModalDraftBadge() {
    var badge = getDraftBadge();
    if (!badge) return;
    if (!hasAdminSiteAccess() || !currentContentPath) {
      badge.hidden = true;
      badge.classList.add('hidden');
      badge.removeAttribute('data-content-path');
      return;
    }
    var hasDraft =
      window.TTMSContentDrafts &&
      typeof window.TTMSContentDrafts.has === 'function' &&
      window.TTMSContentDrafts.has(currentContentPath);
    badge.hidden = !hasDraft;
    badge.classList.toggle('hidden', !hasDraft);
    badge.setAttribute('data-content-path', currentContentPath);
  }

  function refreshDraftBadgeState() {
    if (!hasAdminSiteAccess() || !currentMenuRoot) {
      syncModalDraftBadge();
      return;
    }
    currentContentPath = contentPathForMenuRoot(currentMenuRoot);
    if (window.TTMSContentDrafts && typeof window.TTMSContentDrafts.refresh === 'function') {
      window.TTMSContentDrafts.refresh().finally(syncModalDraftBadge);
      return;
    }
    syncModalDraftBadge();
  }

  function loadCmsDraftIntoFrame() {
    if (!currentContentPath) return;
    var frame = getFrame();
    var badge = getDraftBadge();
    if (!frame || !frame.contentWindow) return;
    if (badge) badge.classList.add('is-loading');
    try {
      frame.contentWindow.postMessage(
        {
          type: 'ttms:embed-panel-load-cms-draft',
          contentPath: currentContentPath,
        },
        window.location.origin
      );
    } catch (err) {
      /* ignore */
    }
    setTimeout(function () {
      if (badge) badge.classList.remove('is-loading');
    }, 1200);
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

  function snapshotTargetFor(menuRoot) {
    if (!menuRoot) return null;
    return (
      menuRoot.closest('.dashboard-settings-location-card') ||
      menuRoot.closest('.menu-item-card, .menu-header, article.ads-reels-slide') ||
      menuRoot
    );
  }

  function captureEditDomSnapshot(menuRoot) {
    editDomSnapshot = null;
    var target = snapshotTargetFor(menuRoot);
    if (!target || !target.parentNode) return;
    var isNew = !!(
      menuRoot.hasAttribute('data-dashboard-edit-new-item') ||
      menuRoot.hasAttribute('data-dashboard-edit-new-section') ||
      menuRoot.hasAttribute('data-dashboard-edit-new-promotion') ||
      target.querySelector(
        '[data-dashboard-edit-new-item], [data-dashboard-edit-new-section], [data-dashboard-edit-new-promotion]'
      )
    );
    editDomSnapshot = {
      el: target,
      html: target.outerHTML,
      isNew: isNew,
    };
  }

  function clearEditDomSnapshot() {
    editDomSnapshot = null;
  }

  function restoreEditDomSnapshot() {
    var snap = editDomSnapshot;
    editDomSnapshot = null;
    if (!snap || !snap.el) return;
    if (snap.isNew) {
      if (snap.el.parentNode) snap.el.parentNode.removeChild(snap.el);
      return;
    }
    if (!snap.el.parentNode || snap.html == null) return;
    try {
      var wrap = document.createElement('div');
      wrap.innerHTML = snap.html;
      var restored = wrap.firstElementChild;
      if (!restored) return;
      snap.el.parentNode.replaceChild(restored, snap.el);
    } catch (err) {
      /* ignore */
    }
  }

  function refreshCatalogUiAfterEdit() {
    var list = document.getElementById('menuCatalogList');
    if (!list) return;
    var summary = document.getElementById('menuCatalogSummary');
    var emptyEl = document.getElementById('menuCatalogEmpty');
    var visible = list.querySelectorAll('.dashboard-settings-location-card:not(.hidden)');
    var count = visible.length;
    var noun = summary ? summary.getAttribute('data-noun') || 'item' : 'item';
    if (emptyEl) emptyEl.classList.toggle('hidden', count > 0);
    if (summary) {
      var scope = '';
      var match = String(summary.textContent || '').match(/\s+in\s+(.+)$/);
      if (match) scope = ' in ' + match[1];
      if (count === 0) summary.textContent = 'No ' + noun + 's' + scope;
      else if (count === 1) summary.textContent = '1 ' + noun + scope;
      else summary.textContent = count + ' ' + noun + 's' + scope;
    }
    if (window.TTMSContentDrafts && typeof window.TTMSContentDrafts.applyIndicators === 'function') {
      window.TTMSContentDrafts.applyIndicators(list);
    }
  }

  function refreshDraftIndicatorsSoft() {
    refreshCatalogUiAfterEdit();
    if (window.TTMSContentDrafts && typeof window.TTMSContentDrafts.refresh === 'function') {
      window.TTMSContentDrafts.refresh();
      return;
    }
    if (window.TTMSContentDrafts && typeof window.TTMSContentDrafts.applyIndicators === 'function') {
      window.TTMSContentDrafts.applyIndicators(document);
    }
  }


  function buildFocusPayload(menuRoot) {
    var kind = (menuRoot && menuRoot.getAttribute('data-actions-kind')) || 'menu-item';
    var payload = { type: 'ttms:embed-panel-refocus', kind: kind };
    if (kind === 'promotion') {
      var catalogIndex = menuRoot.getAttribute('data-promotion-catalog-index');
      var adId = menuRoot.getAttribute('data-ad-id') || '';
      var slide = menuRoot.closest('article.ads-reels-slide');
      if ((!catalogIndex || catalogIndex === '') && slide) {
        catalogIndex = slide.getAttribute('data-catalog-index') || '';
      }
      if (!adId && slide) {
        adId = slide.getAttribute('data-ad-id') || slide.id || '';
      }
      if (catalogIndex != null && catalogIndex !== '') payload.promoCatalogIndex = String(catalogIndex);
      if (adId) payload.promoId = adId;
      return payload;
    }
    if (kind === 'section-header') {
      var headerEl = menuRoot.closest('.menu-header');
      payload.sectionSlug =
        menuRoot.getAttribute('data-section-slug') ||
        (headerEl && headerEl.getAttribute('data-section-slug')) ||
        '';
      return payload;
    }
    payload.itemUrl =
      normalizeItemUrl(menuRoot.getAttribute('data-item-url')) ||
      normalizeItemUrl(
        (menuRoot.closest('.menu-item-card') &&
          menuRoot.closest('.menu-item-card').getAttribute('data-item-url')) ||
          ''
      );
    return payload;
  }

  function frameHasWarmEmbed(frame) {
    if (!frame) return false;
    var src = frame.getAttribute('src') || '';
    return !!embedPanelReady && src.indexOf('embed=panel') !== -1 && src !== 'about:blank';
  }

  function warmEmbedPanel() {
    if (embedWarmStarted) return;
    var frame = getFrame();
    if (!frame) return;
    if (frameHasWarmEmbed(frame)) {
      embedWarmStarted = true;
      return;
    }
    var src = frame.getAttribute('src') || '';
    if (src && src !== 'about:blank' && src.indexOf('embed=panel') !== -1) {
      embedWarmStarted = true;
      return;
    }
    embedWarmStarted = true;
    try {
      frame.setAttribute('src', EDIT_EMBED_PATH);
    } catch (e) {
      frame.src = EDIT_EMBED_PATH;
    }
  }

  function open(menuRoot) {
    if (!hasAdminSiteAccess()) {
      try {
        window.alert('Sign in with site access to edit this item.');
      } catch (e) { /* ignore */ }
      return false;
    }
    var modal = getModal();
    var frame = getFrame();
    if (!modal || !frame) {
      try {
        window.alert('Editor is still loading. Try again in a moment.');
      } catch (e) { /* ignore */ }
      return false;
    }

    hideDiscardPrompt();
    currentMenuRoot = menuRoot;
    currentContentPath = contentPathForMenuRoot(menuRoot);
    captureEditDomSnapshot(menuRoot);

    storeFocusKeys(menuRoot);
    setModalTitle(menuRoot);
    refreshDraftBadgeState();

    modal.classList.remove('is-closing');
    modal.hidden = false;
    modal.removeAttribute('hidden');
    modal.style.removeProperty('display');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('menu-item-edit-modal-open');
    requestAnimationFrame(function () {
      modal.classList.add('is-open');
      modal.style.removeProperty('display');
    });

    var focusPayload = buildFocusPayload(menuRoot);
    if (frameHasWarmEmbed(frame)) {
      pendingOpenRefocus = null;
      setModalLoading(true, 'Opening…');
      postToFrame(focusPayload);
      return true;
    }

    setModalLoading(true, 'Loading editor…');
    var currentSrc = frame.getAttribute('src') || '';
    // Warm iframe still booting: wait for form-ready, then refocus (do not reset src).
    if (currentSrc && currentSrc !== 'about:blank' && currentSrc.indexOf('embed=panel') !== -1) {
      pendingOpenRefocus = focusPayload;
      return true;
    }

    embedPanelReady = false;
    // Cold load: dashboard-edit reads sessionStorage focus keys on boot.
    pendingOpenRefocus = null;
    var embedSrc =
      EDIT_EMBED_PATH +
      (EDIT_EMBED_PATH.indexOf('?') >= 0 ? '&' : '?') +
      '_=' +
      Date.now();
    window.setTimeout(function () {
      try {
        frame.setAttribute('src', embedSrc);
      } catch (srcErr) {
        frame.src = embedSrc;
      }
    }, 0);

    return true;
  }

  function close(opts) {
    opts = opts || {};
    var modal = getModal();
    var frame = getFrame();
    if (!modal) return;

    if (
      !opts.skipPersist &&
      frame &&
      frame.contentWindow &&
      frame.getAttribute('src') &&
      frame.getAttribute('src') !== 'about:blank'
    ) {
      try {
        frame.contentWindow.postMessage({ type: 'ttms:embed-panel-close-request' }, window.location.origin);
        return;
      } catch (err) {
        /* ignore */
      }
    }

    closeImmediately();
  }

  function closeImmediately(opts) {
    opts = opts || {};
    var modal = getModal();
    var frame = getFrame();
    if (!modal) return;

    hideDiscardPrompt();
    modal.classList.remove('is-open');
    modal.classList.add('is-closing');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('menu-item-edit-modal-open');
    setModalLoading(false);

    var finishClose = function () {
      modal.classList.remove('is-closing');
      modal.hidden = true;
      modal.setAttribute('hidden', '');
      modal.style.removeProperty('display');
      // Keep the embed panel warm so the next Edit opens without a full reload.
    };
    var prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      finishClose();
    } else {
      window.setTimeout(finishClose, 320);
    }

    currentMenuRoot = null;
    currentContentPath = '';
    syncModalDraftBadge();

    if (opts.discarded) {
      // Undo live preview mutations / remove unsaved new cards without a full page reload.
      restoreEditDomSnapshot();
      window.setTimeout(refreshDraftIndicatorsSoft, prefersReduced ? 0 : 40);
      return;
    }

    clearEditDomSnapshot();
    if (opts.reload || opts.saved) {
      window.setTimeout(refreshDraftIndicatorsSoft, prefersReduced ? 0 : 40);
    }
  }

  function onDocumentClick(e) {
    if (e.target.closest('#' + DRAFT_BADGE_ID)) {
      e.preventDefault();
      loadCmsDraftIntoFrame();
      return;
    }
    if (e.target.closest('#menuItemEditModalSave')) {
      e.preventDefault();
      postToFrame({ type: 'ttms:embed-panel-click-save' });
      return;
    }
    if (e.target.closest('#menuItemEditModalDelete')) {
      e.preventDefault();
      postToFrame({ type: 'ttms:embed-panel-click-delete' });
      return;
    }
    if (e.target.closest('#menuItemEditDiscardConfirm')) {
      e.preventDefault();
      hideDiscardPrompt();
      close();
      return;
    }
    if (e.target.closest('[data-menu-item-edit-discard-cancel]')) {
      e.preventDefault();
      hideDiscardPrompt();
      return;
    }
    if (e.target.closest('[data-close-menu-item-edit-modal]')) {
      e.preventDefault();
      requestClose();
    }
  }

  function onDocumentKeydown(e) {
    if (e.key !== 'Escape') return;
    var modal = getModal();
    if (!modal || modal.hidden) return;
    var prompt = getDiscardPrompt();
    if (prompt && !prompt.hidden) {
      hideDiscardPrompt();
      return;
    }
    requestClose();
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
    if (!data || !data.type) return;
    if (data.type === 'ttms:embed-panel-save-state') {
      setSaveBusy(!!data.busy, data.message);
      return;
    }
    if (data.type !== 'ttms:close-menu-item-edit-modal') return;
    if (data.saved && data.title && currentMenuRoot) {
      var card = currentMenuRoot.closest('.dashboard-settings-location-card');
      var titleEl = card && card.querySelector('.dashboard-settings-location-card-title');
      var titleText = String(data.title).trim();
      if (titleEl && titleText) titleEl.textContent = titleText;
      var hiddenTitle = currentMenuRoot.querySelector('.menu-item-title');
      if (hiddenTitle && titleText) hiddenTitle.textContent = titleText;
      if (currentMenuRoot.classList && currentMenuRoot.classList.contains('menu-item-card')) {
        var actions = currentMenuRoot.querySelector('.menu-item-actions');
        if (actions && titleText) actions.setAttribute('data-item-title', titleText);
      }
    }
    if (data.saved) showSavedNotice(data.title);
    setSaveBusy(false);
    closeImmediately({ reload: data.reload, saved: !!data.saved });
  }

  function onEmbedCloseRequest(event) {
    if (!event || event.data == null) return;
    var data = event.data;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (err) {
        return;
      }
    }
    if (!data || data.type !== 'ttms:embed-panel-close-complete') return;
    closeImmediately({
      reload: !!data.reload,
      discarded: !!data.discarded,
      saved: !!data.saved,
    });
  }

  function onEmbedFormReady(event) {
    if (!event || event.data == null) return;
    var data = event.data;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (err) {
        return;
      }
    }
    if (!data || !data.type) return;
    if (data.type === 'ttms:embed-panel-chrome-state') {
      applyEmbedChromeState(data);
      return;
    }
    if (data.type !== 'ttms:embed-panel-form-ready') return;
    embedPanelReady = true;
    if (pendingOpenRefocus) {
      var pending = pendingOpenRefocus;
      pendingOpenRefocus = null;
      var modalOpen = getModal() && !getModal().hidden;
      if (modalOpen) {
        setModalLoading(true, 'Opening…');
        postToFrame(pending);
        return;
      }
    }
    setModalLoading(false);
  }

  function onEmbedFrameLoad() {
    var frame = getFrame();
    if (!frame || frame.getAttribute('src') === 'about:blank') return;
    if (!getModal() || getModal().hidden) return;
    syncModalDraftBadge();
  }

  function init() {
    document.removeEventListener('click', onDocumentClick, true);
    document.addEventListener('click', onDocumentClick, true);
    document.removeEventListener('keydown', onDocumentKeydown, true);
    document.addEventListener('keydown', onDocumentKeydown, true);
    window.removeEventListener('message', onMessage);
    window.addEventListener('message', onMessage);
    window.removeEventListener('message', onEmbedCloseRequest);
    window.addEventListener('message', onEmbedCloseRequest);
    window.removeEventListener('message', onEmbedFormReady);
    window.addEventListener('message', onEmbedFormReady);
    window.removeEventListener('ttms:content-drafts-ready', syncModalDraftBadge);
    window.addEventListener('ttms:content-drafts-ready', syncModalDraftBadge);

    var frame = getFrame();
    if (frame) {
      frame.removeEventListener('load', onEmbedFrameLoad);
      frame.addEventListener('load', onEmbedFrameLoad);
    }

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
    closeImmediately: closeImmediately,
    hasAccess: hasAdminSiteAccess,
    syncDraftBadge: syncModalDraftBadge,
  };
})();
