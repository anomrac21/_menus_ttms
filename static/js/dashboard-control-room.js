/**
 * Dashboard control room — header + collapsible cards.
 */
(function (global) {
  'use strict';

  function cleanSiteName(s) {
    s = String(s || '').trim();
    s = s.replace(/^["']+|["']+$/g, '');
    return s.trim();
  }

  function isJunkSiteName(s) {
    s = cleanSiteName(s);
    if (!s || s === '—') return true;
    if (/^dashboard(\s*\|\s*)?$/i.test(s)) return true;
    if (/^dashboard\s*\|\s*$/i.test(s)) return true;
    return false;
  }

  function formatClientIdFallback() {
    var id = global.SITE_CLIENT_ID || global.CLIENT_ID || '';
    if (!id) return 'Your menu';
    return String(id)
      .replace(/^_/, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, function (c) {
        return c.toUpperCase();
      });
  }

  function resolveSiteDisplayName() {
    var candidates = [];
    if (global.SITE_DISPLAY_NAME) candidates.push(String(global.SITE_DISPLAY_NAME).trim());
    var userEl = document.getElementById('dashboardUserInfo');
    if (userEl) {
      candidates.push((userEl.getAttribute('data-business-name') || '').trim());
    }
    var siteNameEl = document.getElementById('dashboardHeaderSiteName');
    if (siteNameEl) candidates.push((siteNameEl.textContent || '').trim());
    var t = (document.title || '').trim();
    var pipe = t.match(/Dashboard\s*\|\s*(.+)/i);
    if (pipe && pipe[1]) candidates.push(pipe[1].trim());
    var stripped = t.replace(/^Dashboard\s*\|\s*/i, '').trim();
    if (stripped) candidates.push(stripped);
    candidates.push(formatClientIdFallback());
    for (var i = 0; i < candidates.length; i++) {
      candidates[i] = cleanSiteName(candidates[i]);
      if (!isJunkSiteName(candidates[i])) return candidates[i];
    }
    return 'Your menu';
  }

  function applyHeaderSiteName() {
    var siteName = resolveSiteDisplayName();
    var siteEl = document.getElementById('dashboardHeaderSiteName');
    if (siteEl) siteEl.textContent = siteName;
    var logoLink = document.getElementById('dashboardLogoLink');
    if (logoLink) {
      logoLink.setAttribute('title', 'View ' + siteName + ' menu site');
      logoLink.setAttribute('aria-label', siteName + ' — view live menu');
    }
    return siteName;
  }

  function hubAccountUrl() {
    var base = String(global.HUB_ACCOUNT_URL || 'https://ttmenus.com/account/').replace(/\/+$/, '');
    var id = global.SITE_CLIENT_ID || global.CLIENT_ID || '';
    if (id && id.indexOf('ttms_') !== 0) {
      id = 'ttms_' + String(id).replace(/^_ttms_/, '').replace(/^_/, '');
    }
    return id ? base + '/?client_id=' + encodeURIComponent(id) : base + '/';
  }

  function applyHeaderAccountLink() {
    var linkEl = document.getElementById('dashboardHeaderAccountLink');
    if (linkEl) linkEl.href = hubAccountUrl();
  }

  function applyHeaderUser() {
    var accountEl = document.getElementById('dashboardHeaderUserName');
    var trayUserEl = document.getElementById('dashboardHeaderTrayUserName');
    var user =
      global.AuthClient && global.AuthClient.getCurrentUser
        ? global.AuthClient.getCurrentUser()
        : null;
    if (!user) {
      if (accountEl) {
        accountEl.textContent = '—';
        accountEl.removeAttribute('title');
      }
      if (trayUserEl) trayUserEl.textContent = '—';
      applyHeaderAccountLink();
      return;
    }
    var username =
      user.username ||
      (user.first_name && user.last_name
        ? user.first_name + ' ' + user.last_name
        : null) ||
      user.email ||
      '—';
    if (accountEl) {
      accountEl.textContent = username;
      if (user.email && user.email !== username) {
        accountEl.setAttribute('title', user.email);
      } else {
        accountEl.setAttribute('title', username);
      }
    }
    if (trayUserEl) {
      trayUserEl.textContent = user.email || username;
    }
    var linkEl = document.getElementById('dashboardHeaderAccountLink');
    if (linkEl) {
      linkEl.setAttribute('title', 'Open your TT Menus account');
      linkEl.setAttribute('aria-label', username + ' — open account');
    }
    var trayAccount = document.getElementById('dashboardHeaderTrayAccount');
    if (trayAccount) {
      trayAccount.setAttribute('aria-label', username + ' — open account');
    }
    applyHeaderAccountLink();
  }

  function confirmSignOut() {
    return global.confirm('Sign out of the menu control room?');
  }

  function doSignOut() {
    if (!confirmSignOut()) return;
    if (global.AuthClient && typeof global.AuthClient.logout === 'function') {
      global.AuthClient.logout({ redirect: true, redirectUrl: '/' });
    }
  }

  function setAccountTrayOpen(open) {
    var bar = document.getElementById('dashboardHeaderBar');
    var btn = document.getElementById('dashboardHeaderAccountBtn');
    var tray = document.getElementById('dashboardHeaderTray');
    if (!bar || !btn || !tray) return;
    bar.classList.toggle('is-account-open', !!open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      tray.removeAttribute('hidden');
    } else {
      tray.setAttribute('hidden', '');
    }
  }

  function initAccountTray() {
    var btn = document.getElementById('dashboardHeaderAccountBtn');
    var tray = document.getElementById('dashboardHeaderTray');
    var bar = document.getElementById('dashboardHeaderBar');
    if (!btn || !tray || !bar || btn.getAttribute('data-tray-bound')) return;
    btn.setAttribute('data-tray-bound', '1');
    btn.addEventListener('click', function () {
      setAccountTrayOpen(!bar.classList.contains('is-account-open'));
    });
    document.addEventListener('click', function (ev) {
      if (!bar.classList.contains('is-account-open')) return;
      if (bar.contains(ev.target)) return;
      setAccountTrayOpen(false);
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') setAccountTrayOpen(false);
    });
  }

  function cardCollapseStorageKey() {
    var id = global.SITE_CLIENT_ID || global.CLIENT_ID || 'site';
    return 'ttms.dashboard.cardCollapsed.' + String(id);
  }

  function readCardCollapsedMap() {
    try {
      var raw = localStorage.getItem(cardCollapseStorageKey());
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function writeCardCollapsedMap(map) {
    try {
      localStorage.setItem(cardCollapseStorageKey(), JSON.stringify(map || {}));
    } catch (e) {
      /* ignore */
    }
  }

  function cardKeyFromEl(card, index) {
    var existing = card.getAttribute('data-dashboard-card');
    if (existing) return existing;
    if (card.id) return card.id;
    var cls = Array.prototype.slice.call(card.classList || []).filter(function (c) {
      return c && c !== 'card' && c !== 'is-collapsed';
    });
    if (cls.length) return cls[0];
    return 'card-' + index;
  }

  function directChildBySelector(card, selector) {
    var children = card.children || [];
    for (var i = 0; i < children.length; i++) {
      if (children[i].matches && children[i].matches(selector)) return children[i];
    }
    return null;
  }

  function ensureCardCollapseMarkup(card, key) {
    card.setAttribute('data-dashboard-card', key);

    var toggle =
      directChildBySelector(card, '.dashboard-card-toggle') ||
      directChildBySelector(card, '[data-dashboard-card-toggle]');
    var body = directChildBySelector(card, '.dashboard-card-body');
    if (toggle && body) {
      if (!toggle.getAttribute('data-dashboard-card-toggle')) {
        toggle.setAttribute('data-dashboard-card-toggle', key);
      }
      if (!body.id) body.id = 'dashboardCardBody-' + key;
      toggle.setAttribute('aria-controls', body.id);
      return toggle;
    }

    var title =
      directChildBySelector(card, '.dashboard-card-title') ||
      directChildBySelector(card, 'h3');
    if (!title) return null;

    // Prefer wrapping into toggle+body when possible; keep title clickable either way.
    try {
      body = document.createElement('div');
      body.className = 'dashboard-card-body';
      body.id = 'dashboardCardBody-' + key;

      var move = [];
      var child = card.firstChild;
      while (child) {
        var next = child.nextSibling;
        if (child !== title) move.push(child);
        child = next;
      }
      for (var m = 0; m < move.length; m++) {
        body.appendChild(move[m]);
      }

      toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'dashboard-card-toggle';
      toggle.setAttribute('data-dashboard-card-toggle', key);
      toggle.setAttribute('aria-controls', body.id);
      toggle.setAttribute('aria-expanded', 'false');

      var chevron = document.createElement('span');
      chevron.className = 'dashboard-card-toggle-chevron';
      chevron.setAttribute('aria-hidden', 'true');
      chevron.innerHTML = '<i class="fa fa-chevron-down"></i>';

      card.insertBefore(toggle, title);
      toggle.appendChild(title);
      toggle.appendChild(chevron);
      card.appendChild(body);
      card.classList.add('is-collapsed');
      return toggle;
    } catch (err) {
      title.setAttribute('data-dashboard-card-toggle', key);
      title.setAttribute('role', 'button');
      title.setAttribute('tabindex', '0');
      title.setAttribute('aria-expanded', 'false');
      card.classList.add('is-collapsed');
      return title;
    }
  }

  function setCardCollapsed(card, collapsed) {
    if (!card) return;
    var key = card.getAttribute('data-dashboard-card');
    card.classList.toggle('is-collapsed', !!collapsed);
    var toggle = card.querySelector('[data-dashboard-card-toggle]');
    if (toggle) {
      toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    }
    if (!key) return;
    var map = readCardCollapsedMap();
    map[key] = !!collapsed;
    writeCardCollapsedMap(map);
  }

  function bindCardToggle(toggle) {
    if (!toggle || toggle.getAttribute('data-card-collapse-bound')) return;
    toggle.setAttribute('data-card-collapse-bound', '1');
    function onActivate(ev) {
      if (ev.type === 'keydown' && ev.key !== 'Enter' && ev.key !== ' ') return;
      ev.preventDefault();
      var parent = toggle.closest('[data-dashboard-card]') || toggle.closest('.card');
      if (!parent) return;
      setCardCollapsed(parent, !parent.classList.contains('is-collapsed'));
    }
    toggle.addEventListener('click', onActivate);
    toggle.addEventListener('keydown', onActivate);
  }

  function initCardCollapse() {
    var room = document.getElementById('dashboardControlRoom');
    if (!room) return;
    var map = readCardCollapsedMap();
    var cards = room.querySelectorAll('.cards > .card');
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var key = cardKeyFromEl(card, i);
      var toggle = ensureCardCollapseMarkup(card, key);
      if (!toggle) {
        // Absolute fallback: clickable title, hide siblings via CSS.
        var title =
          directChildBySelector(card, '.dashboard-card-title') ||
          directChildBySelector(card, 'h3');
        if (!title) continue;
        card.setAttribute('data-dashboard-card', key);
        title.setAttribute('data-dashboard-card-toggle', key);
        title.setAttribute('role', 'button');
        title.setAttribute('tabindex', '0');
        toggle = title;
      }
      // Default collapsed; only expand when user previously saved expanded (false).
      var collapsed = map[key] !== false;
      card.classList.toggle('is-collapsed', !!collapsed);
      toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      bindCardToggle(toggle);
    }

    if (!room.getAttribute('data-card-collapse-delegated')) {
      room.setAttribute('data-card-collapse-delegated', '1');
      room.addEventListener('click', function (ev) {
        var hit = ev.target.closest(
          '.dashboard-card-toggle, [data-dashboard-card-toggle], .cards > .card > .dashboard-card-title, .cards > .card > h3.dashboard-card-title'
        );
        if (!hit || !room.contains(hit)) return;
        // Avoid double-toggle when button handler already bound.
        if (hit.getAttribute('data-card-collapse-bound')) return;
        var parent = hit.closest('[data-dashboard-card]') || hit.closest('.card');
        if (!parent || !room.contains(parent)) return;
        ev.preventDefault();
        setCardCollapsed(parent, !parent.classList.contains('is-collapsed'));
      });
    }
  }

  function init() {
    applyHeaderSiteName();
    applyHeaderAccountLink();
    applyHeaderUser();
    initAccountTray();
    initCardCollapse();
    var logoutBtn = document.getElementById('btnLogout');
    if (logoutBtn && !logoutBtn.getAttribute('data-logout-bound')) {
      logoutBtn.setAttribute('data-logout-bound', '1');
      logoutBtn.addEventListener('click', function (ev) {
        ev.preventDefault();
        doSignOut();
      });
    }
    var logoutMobile = document.getElementById('btnLogoutMobile');
    if (logoutMobile && !logoutMobile.getAttribute('data-logout-bound')) {
      logoutMobile.setAttribute('data-logout-bound', '1');
      logoutMobile.addEventListener('click', function (ev) {
        ev.preventDefault();
        doSignOut();
      });
    }
  }

  global.DashboardControlRoom = {
    init: init,
    resolveSiteDisplayName: resolveSiteDisplayName,
    initCardCollapse: initCardCollapse,
  };

  // Run collapse ASAP — do not wait for auth gate in the page script.
  function bootCollapse() {
    try {
      initCardCollapse();
    } catch (e) {
      /* ignore */
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootCollapse);
  } else {
    bootCollapse();
  }
})(typeof window !== 'undefined' ? window : this);
