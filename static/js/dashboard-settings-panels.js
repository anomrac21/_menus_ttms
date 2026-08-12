/**
 * Collapsible menu-settings panels — persists open/closed in sessionStorage.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'ttmsMenuSettingsPanels';
  var root = document.getElementById('dashboardMenuSettingsPage');
  if (!root) return;

  function readState() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function writeState(state) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) { /* ignore */ }
  }

  function panelKey(panel) {
    return panel.getAttribute('data-settings-panel') || panel.id || '';
  }

  function setCollapsed(panel, collapsed) {
    var toggle = panel.querySelector(':scope > [data-settings-panel-toggle]');
    panel.classList.toggle('is-collapsed', !!collapsed);
    if (toggle) toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    var key = panelKey(panel);
    if (!key) return;
    var state = readState();
    state[key] = !!collapsed;
    writeState(state);
  }

  function expandPanelForHash() {
    var hash = (window.location.hash || '').replace(/^#/, '');
    if (!hash) return;
    var target = document.getElementById(hash);
    if (!target) return;
    var panel = target.closest('.dashboard-settings-panel');
    if (!panel || !root.contains(panel)) return;
    setCollapsed(panel, false);
    window.requestAnimationFrame(function () {
      try {
        target.scrollIntoView({ block: 'start', behavior: 'smooth' });
      } catch (e) {
        target.scrollIntoView(true);
      }
    });
  }

  var stored = readState();
  root.querySelectorAll('.dashboard-settings-panel[data-settings-panel]').forEach(function (panel) {
    var key = panelKey(panel);
    var toggle = panel.querySelector(':scope > [data-settings-panel-toggle]');
    if (!toggle) return;

    var collapsed = Object.prototype.hasOwnProperty.call(stored, key)
      ? !!stored[key]
      : panel.classList.contains('is-collapsed');
    setCollapsed(panel, collapsed);

    toggle.addEventListener('click', function () {
      setCollapsed(panel, !panel.classList.contains('is-collapsed'));
    });
  });

  expandPanelForHash();
  window.addEventListener('hashchange', expandPanelForHash);

  root.addEventListener('click', function (ev) {
    var link = ev.target && ev.target.closest ? ev.target.closest('a[href^="#"]') : null;
    if (!link || !root.contains(link)) return;
    var href = link.getAttribute('href') || '';
    if (href.length < 2) return;
    window.setTimeout(expandPanelForHash, 0);
  });
})();
