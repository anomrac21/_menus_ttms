(function () {
  'use strict';

  var ALERT_LABELS = {
    deals: 'Deals',
    new_menu: 'New menu items',
    followed: 'Places you follow',
    new_near: 'New restaurants near you',
    nearby_client: 'When you are close to a restaurant',
    order_ready: 'When the kitchen has your order ready',
  };
  var FREQ_LABELS = {
    big_only: 'Only the big stuff',
    few_times_week: 'A few times a week',
    whenever: 'Whenever it matches',
  };
  var CUISINE_LABELS = {
    chinese: 'Chinese',
    indian: 'Indian',
    creole: 'Creole',
    italian: 'Italian',
    fast_food: 'Fast food',
    pizza: 'Pizza',
    burgers: 'Burgers',
    wings: 'Wings',
    seafood: 'Seafood',
    desserts: 'Desserts',
    drinks: 'Drinks',
    other: 'Other',
  };

  function esc(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function authBase() {
    var raw = '';
    if (window.AUTH_SERVICE_URL) raw = String(window.AUTH_SERVICE_URL);
    else if (window.APP_CONFIG && window.APP_CONFIG.authServiceUrl) raw = String(window.APP_CONFIG.authServiceUrl);
    raw = raw.trim().replace(/\/+$/, '');
    if (!raw) raw = 'https://auth.ttmenus.com/api/v1';
    if (!/\/api\/v1$/i.test(raw)) raw += '/api/v1';
    return raw;
  }

  function signedIn() {
    var ac = window.AuthClient;
    return !!(ac && typeof ac.isAuthenticated === 'function' && ac.isAuthenticated());
  }

  function currentUser() {
    var ac = window.AuthClient;
    if (!ac || typeof ac.getCurrentUser !== 'function') return null;
    return ac.getCurrentUser();
  }

  async function loadPreferences(user) {
    var ac = window.AuthClient;
    if (ac && typeof ac.getPreferences === 'function') {
      try {
        var result = await ac.getPreferences();
        if (result && result.preferences) return result.preferences;
      } catch (_) {
        /* fall through */
      }
    }
    if (user && user.preferences) return user.preferences;
    try {
      var headers = { Accept: 'application/json' };
      var token = ac && typeof ac.getAccessToken === 'function' ? ac.getAccessToken() : '';
      if (token) headers.Authorization = 'Bearer ' + token;
      var res = await fetch(authBase() + '/me/preferences', {
        method: 'GET',
        credentials: 'include',
        headers: headers,
      });
      if (!res.ok) return {};
      var data = await res.json();
      return data.preferences || {};
    } catch (_) {
      return {};
    }
  }

  function tasteLabels(prefs) {
    var seen = {};
    var out = [];
    function add(label) {
      var text = String(label || '').trim();
      if (text.length < 2) return;
      var key = text.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      out.push(text);
    }
    String((prefs && prefs.cuisine_notes) || '')
      .split(',')
      .forEach(add);
    (Array.isArray(prefs && prefs.cuisines) ? prefs.cuisines : []).forEach(function (key) {
      add(CUISINE_LABELS[key] || String(key || '').replace(/_/g, ' '));
    });
    return out;
  }

  function chips(labels) {
    if (!labels.length) return '<p class="dashboard-dine-account__empty">None saved yet.</p>';
    return (
      '<ul class="dashboard-dine-account__chips">' +
      labels
        .map(function (label) {
          return '<li>' + esc(label) + '</li>';
        })
        .join('') +
      '</ul>'
    );
  }

  function row(label, value) {
    var text = String(value || '').trim();
    if (!text) return '';
    return '<div><dt>' + esc(label) + '</dt><dd>' + esc(text) + '</dd></div>';
  }

  function render(user, prefs) {
    var box = document.getElementById('dashboard-dine-account');
    if (!box) return;
    prefs = prefs || {};
    user = user || {};
    var name = prefs.delivery_name || user.username || '';
    var alerts = (Array.isArray(prefs.alert_topics) ? prefs.alert_topics : [])
      .map(function (key) {
        return ALERT_LABELS[key] || '';
      })
      .filter(Boolean);
    if (prefs.alert_frequency && FREQ_LABELS[prefs.alert_frequency]) {
      alerts.push(FREQ_LABELS[prefs.alert_frequency]);
    }
    var verified =
      user.is_email_verified === false
        ? '<p class="dashboard-dine-account__note">Check your email to set a password and verify this account.</p>'
        : '';
    box.innerHTML =
      '<p class="dashboard-lead__lede">Your TT Menus account</p>' +
      verified +
      '<section class="dashboard-dine-account__block"><h3>Account</h3><dl>' +
      row('Name', name) +
      row('Email', user.email) +
      row('Phone', prefs.delivery_phone) +
      row('Area', prefs.dine_area) +
      '</dl></section>' +
      '<section class="dashboard-dine-account__block"><h3>Tastes</h3>' +
      chips(tasteLabels(prefs)) +
      '</section>' +
      '<section class="dashboard-dine-account__block"><h3>Notifications</h3>' +
      chips(alerts) +
      '</section>';
  }

  var inflight = 0;

  async function sync() {
    var section = document.getElementById('dashboard-dine');
    var box = document.getElementById('dashboard-dine-account');
    if (!section || !box) return;
    if (!signedIn()) {
      section.classList.remove('is-account');
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    var ticket = ++inflight;
    var user = currentUser() || {};
    var prefs = await loadPreferences(user);
    if (ticket !== inflight || !signedIn()) return;
    user = currentUser() || user;
    render(user, prefs);
    section.classList.add('is-account');
    box.hidden = false;
  }

  function boot() {
    sync();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  window.addEventListener('ttms:auth-ready', sync);
  window.addEventListener('auth:login', sync);
  window.addEventListener('auth:logout', sync);
})();
