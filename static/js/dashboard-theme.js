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
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      var ink = getComputedStyle(root).getPropertyValue('--dash-bg').trim();
      if (ink) meta.setAttribute('content', ink);
    }
    try {
      window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: next } }));
    } catch (e3) { /* ignore */ }
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
