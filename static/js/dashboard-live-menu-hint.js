/**
 * Shows a one-time hint on the live menu when opened from the dashboard “Edit menu content” action.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'editMenuLiveMode';
  var PARAM_KEY = 'edit';

  function shouldShowContentHint() {
    try {
      if (new URLSearchParams(window.location.search).get(PARAM_KEY) === 'content') return true;
      if (sessionStorage.getItem(STORAGE_KEY) === 'content') return true;
    } catch (e) { /* ignore */ }
    return false;
  }

  function clearContentHintFlag() {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (e) { /* ignore */ }
  }

  function hasAdminSiteAccess() {
    if (!window.AuthClient || !AuthClient.isAuthenticated() || !AuthClient.isAdmin()) return false;
    return (
      window.AuthClientAccess &&
      typeof AuthClientAccess.hasClientAccess === 'function' &&
      AuthClientAccess.hasClientAccess()
    );
  }

  function mountBanner() {
    if (!shouldShowContentHint()) return;
    if (document.querySelector('.dashboard-live-menu-hint')) return;
    clearContentHintFlag();

    var banner = document.createElement('div');
    banner.className = 'dashboard-live-menu-hint';
    banner.setAttribute('role', 'status');
    banner.innerHTML =
      '<div class="dashboard-live-menu-hint__inner">' +
      '<p class="dashboard-live-menu-hint__text">' +
      '<strong>Edit menu content</strong> — tap <span class="dashboard-live-menu-hint__icon" aria-hidden="true"><i class="fa fa-ellipsis-v"></i></span> ' +
      'on any <strong>menu item</strong>, <strong>section heading</strong>, or <strong>promotion</strong>, then choose <strong>Edit</strong>. ' +
      'Finish with <strong>Save</strong> on the last step of the editor panel (or close the panel to save your draft). Publish drafts from the dashboard <strong>Publish</strong> button.' +
      '</p>' +
      '<button type="button" class="dashboard-live-menu-hint__close" aria-label="Dismiss">' +
      '<i class="fa fa-times" aria-hidden="true"></i></button>' +
      '</div>';

    var closeBtn = banner.querySelector('.dashboard-live-menu-hint__close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        banner.remove();
      });
    }

    var mount = document.body;
    if (mount.firstChild) mount.insertBefore(banner, mount.firstChild);
    else mount.appendChild(banner);
  }

  function boot() {
    if (!shouldShowContentHint()) return;
    if (window.AuthClient && typeof AuthClient.whenReady === 'function') {
      AuthClient.whenReady().then(function () {
        if (hasAdminSiteAccess()) mountBanner();
        else clearContentHintFlag();
      });
      return;
    }
    if (hasAdminSiteAccess()) mountBanner();
    else clearContentHintFlag();
  }

  window.addEventListener('ttms:auth-ready', boot);
  document.addEventListener('ttms:page-enter', boot);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
