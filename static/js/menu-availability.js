/**
 * Live sold-out overlay: guest poll + staff toggles (live menu and dashboard catalog).
 */
(function (global) {
  'use strict';

  var POLL_MS = 5000;
  var state = {
    items: {},
    autoClearEod: false,
    timezone: 'America/Port_of_Spain',
    timer: null,
    loading: false,
    staff: false
  };

  function cfg() {
    return global.ORDER_CONFIG && typeof global.ORDER_CONFIG === 'object' ? global.ORDER_CONFIG : {};
  }

  function apiBase() {
    var base = String(cfg().apiUrl || '').replace(/\/$/, '');
    if (!base) return '';
    if (!/\/api\/v1$/i.test(base)) base = base + '/api/v1';
    return base;
  }

  function clientId() {
    var id =
      (cfg().clientId ||
        global.SITE_CLIENT_ID ||
        global.CLIENT_ID ||
        (global.AuthClientAccess &&
          typeof global.AuthClientAccess.siteClientId === 'function' &&
          global.AuthClientAccess.siteClientId()) ||
        '') + '';
    return id.trim();
  }

  function normalizeItemKey(raw) {
    var s = String(raw || '').trim();
    if (!s) return '';
    var proto = s.indexOf('://');
    if (proto >= 0) {
      var rest = s.slice(proto + 3);
      var slash = rest.indexOf('/');
      s = slash >= 0 ? rest.slice(slash) : '';
    }
    if (!s) return '';
    if (s.charAt(0) !== '/') s = '/' + s;
    s = s.split('?')[0].split('#')[0];
    return s.replace(/\/+$/, '') + '/';
  }

  function isSoldOut(url) {
    var key = normalizeItemKey(url);
    return !!(key && state.items[key] && state.items[key].unavailable);
  }

  function hasStaffAccess() {
    try {
      if (!global.AuthClient || !AuthClient.isAuthenticated || !AuthClient.isAuthenticated()) return false;
      if (!AuthClient.isAdmin || !AuthClient.isAdmin()) return false;
      return !!(
        global.AuthClientAccess &&
        typeof AuthClientAccess.hasClientAccess === 'function' &&
        AuthClientAccess.hasClientAccess()
      );
    } catch (e) {
      return false;
    }
  }

  function authHeaders() {
    var headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
    var cid = clientId();
    if (cid) headers['X-TTMenus-Client-Id'] = cid;
    try {
      if (global.AuthClient && typeof AuthClient.getAccessToken === 'function') {
        var token = AuthClient.getAccessToken();
        if (token) headers.Authorization = 'Bearer ' + token;
      }
    } catch (e) {}
    return headers;
  }

  function titleHost(card) {
    return (
      card.querySelector('.menu-item-title-row .menu-item-title') ||
      card.querySelector('.menu-item-header-content .menu-item-title') ||
      card.querySelector('.menu-item-title')
    );
  }

  function placeBadgeInTitle(card, badge) {
    var title = titleHost(card);
    var titleText = title && title.querySelector('.menu-item-title-text');
    if (titleText && titleText.parentNode) {
      if (badge.parentNode !== titleText.parentNode || badge.previousSibling !== titleText) {
        titleText.parentNode.insertBefore(badge, titleText.nextSibling);
      }
      return;
    }
    if (title && badge.parentNode !== title) title.appendChild(badge);
  }

  function ensureBadge(card) {
    var badge = card.querySelector('.menu-item-sold-out-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'menu-item-sold-out-badge';
      badge.textContent = 'Sold out';
      badge.hidden = true;
    }
    placeBadgeInTitle(card, badge);
    return badge;
  }

  function applyCardSoldOut(card) {
    if (!card || !card.getAttribute) return;
    var url = card.getAttribute('data-item-url') || '';
    var soldOut = isSoldOut(url);
    card.setAttribute('data-sold-out', soldOut ? 'true' : 'false');
    card.classList.toggle('menu-item-sold-out', soldOut);
    var scheduleBlocked = card.getAttribute('data-availability-active') === 'false';
    var hasSchedule = !!card.getAttribute('data-availability');
    if (soldOut || (hasSchedule && scheduleBlocked)) {
      card.classList.add('menu-item-unavailable');
    } else if (!hasSchedule || card.getAttribute('data-availability-active') === 'true') {
      if (!soldOut) card.classList.remove('menu-item-unavailable');
    }
    var badge = ensureBadge(card);
    badge.hidden = !soldOut;
    syncStaffToggle(card);
  }

  function applyAllCards() {
    document.querySelectorAll('.menu-item-card[data-item-url]').forEach(applyCardSoldOut);
    document.querySelectorAll('.dashboard-settings-location-card[data-item-key]').forEach(function (card) {
      var key = card.getAttribute('data-item-key');
      var soldOut = isSoldOut(key);
      card.classList.toggle('is-sold-out', soldOut);
      var toggle = card.querySelector('[data-sold-out-toggle]');
      if (toggle) {
        toggle.checked = soldOut;
        toggle.setAttribute('aria-checked', soldOut ? 'true' : 'false');
      }
      var label = card.querySelector('[data-sold-out-label]');
      if (label) label.textContent = soldOut ? 'Sold out' : 'Available';
    });
    syncActionMenuLabels();
    syncEodToggle();
    try {
      global.dispatchEvent(new CustomEvent('ttms:menu-availability', { detail: { items: state.items } }));
    } catch (e) {}
  }

  function syncStaffToggle(card) {
    // Live menu uses the ⋮ "Mark sold out / Mark available" action.
    // Remove any leftover body checkbox from earlier builds.
    card.querySelectorAll('[data-live-sold-out-wrap]').forEach(function (el) {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
  }

  function syncActionMenuLabels() {
    document.querySelectorAll('[data-menu-item-actions][data-actions-kind="menu-item"]').forEach(function (root) {
      var btn = root.querySelector('.menu-item-actions__option--sold-out');
      if (!btn) return;
      btn.hidden = !state.staff;
      var url = root.getAttribute('data-item-url') || '';
      btn.textContent = isSoldOut(url) ? 'Mark available' : 'Mark sold out';
    });
  }

  function syncEodToggle() {
    var input = document.getElementById('menuAvailabilityAutoClearEod');
    if (!input) return;
    if (document.activeElement !== input) input.checked = !!state.autoClearEod;
  }

  function ingestSnapshot(data) {
    data = data || {};
    var next = {};
    var items = data.items || {};
    Object.keys(items).forEach(function (key) {
      var norm = normalizeItemKey(key);
      if (!norm) return;
      if (items[key] && items[key].unavailable) {
        next[norm] = { unavailable: true, updatedAt: items[key].updatedAt || null };
      }
    });
    state.items = next;
    state.autoClearEod = !!data.autoClearEod;
    if (data.timezone) state.timezone = data.timezone;
    applyAllCards();
  }

  function fetchSnapshot() {
    var base = apiBase();
    var cid = clientId();
    if (!base || !cid || state.loading) return Promise.resolve();
    state.loading = true;
    var url = base + '/client/menu-availability?client_id=' + encodeURIComponent(cid);
    return fetch(url, { method: 'GET', headers: { Accept: 'application/json' }, credentials: 'omit' })
      .then(function (res) {
        if (!res.ok) throw new Error('availability ' + res.status);
        return res.json();
      })
      .then(ingestSnapshot)
      .catch(function () {})
      .then(function () {
        state.loading = false;
      });
  }

  function setUnavailable(itemKey, unavailable) {
    var base = apiBase();
    var cid = clientId();
    var key = normalizeItemKey(itemKey);
    if (!base || !cid || !key) return Promise.reject(new Error('missing config'));

    var ready = Promise.resolve();
    if (global.AuthClient && typeof AuthClient.ensureAccessToken === 'function') {
      ready = Promise.resolve(AuthClient.ensureAccessToken()).catch(function () {});
    }
    return ready.then(function () {
      return fetch(base + '/client/menu-availability', {
        method: 'PUT',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ itemKey: key, unavailable: !!unavailable })
      }).then(function (res) {
        if (!res.ok) {
          return res.json().catch(function () { return {}; }).then(function (body) {
            throw new Error((body && body.error) || 'update failed');
          });
        }
        return res.json();
      }).then(ingestSnapshot);
    });
  }

  function setAutoClearEod(enabled) {
    var base = apiBase();
    var cid = clientId();
    if (!base || !cid) return Promise.reject(new Error('missing config'));
    var ready = Promise.resolve();
    if (global.AuthClient && typeof AuthClient.ensureAccessToken === 'function') {
      ready = Promise.resolve(AuthClient.ensureAccessToken()).catch(function () {});
    }
    return ready.then(function () {
      return fetch(base + '/client/menu-availability/settings', {
        method: 'PUT',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ autoClearEod: !!enabled })
      }).then(function (res) {
        if (!res.ok) throw new Error('settings failed');
        return res.json();
      }).then(function (data) {
        state.autoClearEod = !!data.autoClearEod;
        if (data.timezone) state.timezone = data.timezone;
        syncEodToggle();
        return data;
      });
    });
  }

  function enhanceDashboardCards() {
    if (!document.getElementById('menuCatalogList')) return;
    if (document.querySelector('[data-catalog-kind="items"]') == null &&
        !(document.getElementById('menuCatalogList') || {}).getAttribute) return;
    var list = document.getElementById('menuCatalogList');
    if (!list || list.getAttribute('data-catalog-kind') !== 'items') return;

    ensureEodSettingsRow();

    list.querySelectorAll('.dashboard-settings-location-card').forEach(function (card) {
      var hiddenItem = card.querySelector('.menu-item-card[data-item-url]');
      var url =
        (hiddenItem && hiddenItem.getAttribute('data-item-url')) ||
        card.getAttribute('data-item-key') ||
        '';
      if (!url) return;
      card.setAttribute('data-item-key', normalizeItemKey(url));
      var input = card.querySelector('[data-sold-out-toggle]');
      if (!input) {
        var actions = card.querySelector('.dashboard-settings-location-card-actions');
        if (!actions) return;
        var label = document.createElement('label');
        label.className = 'dashboard-sold-out-toggle dashboard-switch';
        label.title = 'Mark sold out without publishing';
        label.innerHTML =
          '<input type="checkbox" class="dashboard-switch-input" data-sold-out-toggle>' +
          '<span class="dashboard-switch-track" aria-hidden="true"></span>' +
          '<span data-sold-out-label>Available</span>';
        actions.appendChild(label);
        input = label.querySelector('input');
      } else {
        var wrap = input.closest('.dashboard-sold-out-toggle');
        if (wrap) {
          wrap.classList.add('dashboard-switch');
          if (!input.classList.contains('dashboard-switch-input')) {
            input.classList.add('dashboard-switch-input');
          }
          if (!wrap.querySelector('.dashboard-switch-track')) {
            var track = document.createElement('span');
            track.className = 'dashboard-switch-track';
            track.setAttribute('aria-hidden', 'true');
            input.insertAdjacentElement('afterend', track);
          }
        }
      }
      if (input.getAttribute('data-bound') === '1') return;
      input.setAttribute('data-bound', '1');
      input.addEventListener('change', function () {
        setUnavailable(url, !!input.checked).catch(function () {
          input.checked = isSoldOut(url);
          applyAllCards();
        });
      });
    });
    applyAllCards();
  }

  function ensureEodSettingsRow() {
    if (document.getElementById('menuAvailabilityAutoClearEod')) return;
    var wrap = document.querySelector('.dashboard-settings-locations-wrap');
    if (!wrap) return;
    var row = document.createElement('div');
    row.className = 'dashboard-sold-out-settings';
    row.innerHTML =
      '<label class="dashboard-sold-out-settings__label">' +
      '<input type="checkbox" id="menuAvailabilityAutoClearEod">' +
      '<span>Auto-clear sold out at end of day</span>' +
      '</label>' +
      '<p class="dashboard-settings-hint">When on, every sold-out dish becomes available again after local midnight.</p>';
    var hint = wrap.querySelector('.dashboard-settings-hint');
    if (hint && hint.parentNode) hint.parentNode.insertBefore(row, hint.nextSibling);
    else wrap.insertBefore(row, wrap.firstChild);
    row.querySelector('input').addEventListener('change', function (ev) {
      var on = !!ev.target.checked;
      setAutoClearEod(on).catch(function () {
        ev.target.checked = !!state.autoClearEod;
      });
    });
  }

  function onActionsClick(ev) {
    var btn = ev.target.closest && ev.target.closest('.menu-item-actions__option--sold-out');
    if (!btn) return;
    ev.preventDefault();
    ev.stopPropagation();
    var root = btn.closest('[data-menu-item-actions]');
    if (!root) return;
    var url = root.getAttribute('data-item-url') || '';
    setUnavailable(url, !isSoldOut(url)).catch(function () {});
  }

  function startPolling() {
    if (state.timer) clearInterval(state.timer);
    fetchSnapshot();
    state.timer = setInterval(fetchSnapshot, POLL_MS);
  }

  function boot() {
    state.staff = hasStaffAccess();
    if (!apiBase() || !clientId()) return;
    enhanceDashboardCards();
    document.addEventListener('click', onActionsClick, true);
    startPolling();
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) fetchSnapshot();
    });
    global.addEventListener('focus', function () {
      fetchSnapshot();
    });
    global.addEventListener('auth:login', function () {
      state.staff = hasStaffAccess();
      enhanceDashboardCards();
      applyAllCards();
      fetchSnapshot();
    });
    global.addEventListener('ttms:auth-ready', function () {
      state.staff = hasStaffAccess();
      enhanceDashboardCards();
      applyAllCards();
    });
  }

  global.MenuAvailability = {
    isSoldOut: isSoldOut,
    normalizeItemKey: normalizeItemKey,
    refresh: fetchSnapshot,
    setUnavailable: setUnavailable,
    apply: applyAllCards,
    enhance: enhanceDashboardCards
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
