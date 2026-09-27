/**
 * Dashboard light/dark - same storage key and data-theme contract as ttms_app.
 */
(function () {
  'use strict';

  function storageGet() {
    try {
      if (window.TTMSStorage && typeof window.TTMSStorage.getTheme === 'function') {
        return window.TTMSStorage.getTheme();
      }
      return localStorage.getItem('theme');
    } catch (e) {
      return '';
    }
  }

  function storageSet(theme) {
    try {
      if (window.TTMSStorage && typeof window.TTMSStorage.setTheme === 'function') {
        window.TTMSStorage.setTheme(theme);
        return;
      }
      localStorage.setItem('theme', theme);
    } catch (e2) { /* ignore */ }
  }

  function applyTheme(theme) {
    var next = theme === 'dark' ? 'dark' : 'light';
    var root = document.documentElement;
    if (next === 'dark') {
      root.setAttribute('data-theme', 'dark');
    } else {
      root.removeAttribute('data-theme');
    }
    storageSet(next);
    var nightBtn = document.getElementById('night-mode');
    var lightBtn = document.getElementById('light-mode');
    if (nightBtn && lightBtn) {
      nightBtn.classList.toggle('hide', next === 'dark');
      lightBtn.classList.toggle('hide', next !== 'dark');
    }
    var themeBtn = document.getElementById('dashboardHeaderTheme');
    if (themeBtn) {
      var toDark = next !== 'dark';
      themeBtn.setAttribute('aria-label', toDark ? 'Use dark theme' : 'Use light theme');
      themeBtn.setAttribute('title', toDark ? 'Dark mode' : 'Light mode');
    }
    if (isDashboardChrome()) {
      var meta = document.querySelector('meta[name="theme-color"]');
      var ink = resolvedDashBackground(root);
      if (ink) {
        root.style.backgroundColor = ink;
        if (document.body) document.body.style.backgroundColor = ink;
        if (meta) meta.setAttribute('content', ink);
      }
    }
    try {
      window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: next } }));
    } catch (e3) { /* ignore */ }
  }

  function isDashboardChrome() {
    if (!document.body) return false;
    if (document.documentElement.classList.contains('dashboard-edit-embed-panel')) return true;
    if (document.body.classList.contains('dashboard-edit-theme-only')) return true;
    if (document.body.classList.contains('dashboard-edit-rearrange-only')) return true;
    return !!document.querySelector(
      '.dashboard-control-room, .dashboard-analytics-page, .dashboard-notify-page, .dashboard-edit-page, .dashboard-settings-page, .dashboard-edit-options, .auth-container'
    );
  }

  function resolvedDashBackground(root) {
    var probe = document.createElement('span');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;background:var(--dash-bg,#090a13);';
    root.appendChild(probe);
    var color = '';
    try {
      color = getComputedStyle(probe).backgroundColor;
    } catch (e) {
      color = '';
    }
    probe.remove();
    if (!color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)' || color.indexOf('var(') !== -1) {
      return root.getAttribute('data-theme') === 'dark' ? 'rgb(9, 10, 19)' : 'rgb(244, 244, 244)';
    }
    return color;
  }

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function init() {
    var saved = storageGet();
    if (!saved && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      saved = 'dark';
    }
    applyTheme(saved === 'dark' ? 'dark' : 'light');
  }

  window.toggleTheme = function (theme) {
    applyTheme(theme === 'dark' ? 'dark' : 'light');
  };

  window.TtmsDashboardTheme = {
    apply: applyTheme,
    current: currentTheme,
    init: init
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
