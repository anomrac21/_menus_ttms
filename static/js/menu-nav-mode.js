/**
 * Home navigation is smooth only. Snap was removed from settings.
 * The class is applied in the head so the first paint is already smooth.
 */
(function () {
  'use strict';

  var PREF_KEY = 'homeNavMode';

  function writeSmoothPreference() {
    try {
      if (window.LocalStorageManager && LocalStorageManager.preferences) {
        LocalStorageManager.preferences.update(PREF_KEY, 'smooth');
        return;
      }
      var prefs = {};
      try {
        var raw = localStorage.getItem('userPreferences');
        if (raw) prefs = JSON.parse(raw) || {};
      } catch (e2) { /* ignore */ }
      if (prefs[PREF_KEY] === 'smooth') return;
      prefs[PREF_KEY] = 'smooth';
      localStorage.setItem('userPreferences', JSON.stringify(prefs));
    } catch (e) { /* ignore */ }
  }

  function applySmooth() {
    document.documentElement.classList.add('menu-nav-smooth');
    if (document.body) document.body.classList.add('menu-nav-smooth');
  }

  function setMenuNavMode() {
    writeSmoothPreference();
    applySmooth();
    if (typeof window.refreshMenuNavScrollBindings === 'function') {
      window.refreshMenuNavScrollBindings();
    }
  }

  function getMenuNavMode() {
    return 'smooth';
  }

  function initMenuNavMode() {
    applySmooth();
    writeSmoothPreference();
  }

  window.getMenuNavMode = getMenuNavMode;
  window.setMenuNavMode = setMenuNavMode;
  window.initMenuNavMode = initMenuNavMode;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMenuNavMode);
  } else {
    initMenuNavMode();
  }

  if (window.TTMSBarba) {
    window.TTMSBarba.register(initMenuNavMode);
  } else {
    document.addEventListener('DOMContentLoaded', function () {
      if (window.TTMSBarba) window.TTMSBarba.register(initMenuNavMode);
    });
  }
})();
