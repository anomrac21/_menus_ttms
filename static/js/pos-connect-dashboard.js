/**
 * Menu settings: Connect Loyverse, POS hugo.toml flags,
 * per-location store map + item variant map via CMS.
 */
(function () {
  'use strict';

  var cachedStores = [];
  var cachedLocations = [];
  var cachedLoyverseItems = [];
  var cachedMenuItems = [];
  var proposedItemMapping = {};
  var menuTitleHints = [];

  function $(id) {
    return document.getElementById(id);
  }

  function clientId() {
    return (
      window.CLIENT_ID ||
      window.SITE_CLIENT_ID ||
      (window.POS_CONFIG && window.POS_CONFIG.clientId) ||
      '_ttms_menu_demo'
    );
  }

  function cmsApiBase() {
    var base = (window.CMS_API_URL || '').replace(/\/+$/, '');
    if (base) return base;
    var svc = (window.CMS_SERVICE_URL || 'https://cms.ttmenus.com').replace(/\/+$/, '');
    return svc + '/api';
  }

  function whenAuthReady() {
    if (window.AuthClient && typeof AuthClient.whenReady === 'function') {
      return Promise.resolve(AuthClient.whenReady()).catch(function () {
        return null;
      });
    }
    return Promise.resolve();
  }

  function ensureAuth() {
    return whenAuthReady().then(function () {
      if (!window.AuthClient) return Promise.reject(new Error('AuthClient missing'));
      if (AuthClient.getAccessToken && AuthClient.getAccessToken()) {
        return AuthClient.getAccessToken();
      }
      if (typeof AuthClient.ensureAccessToken === 'function') {
        return Promise.resolve(AuthClient.ensureAccessToken()).then(function (r) {
          var token =
            (r && r.accessToken) ||
            (AuthClient.getAccessToken && AuthClient.getAccessToken()) ||
            '';
          if (token) return token;
          throw new Error('Sign in required');
        });
      }
      if (AuthClient.ensureAuthenticated) {
        return AuthClient.ensureAuthenticated().then(function (r) {
          if (r && r.accessToken) return r.accessToken;
          if (AuthClient.getAccessToken) return AuthClient.getAccessToken();
          throw new Error('Sign in required');
        });
      }
      throw new Error('Sign in required');
    });
  }

  function authHeaders(token) {
    return {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    };
  }

  function parseCms(res) {
    return res.text().then(function (text) {
      var data = null;
      var raw = String(text || '').trim();
      if (raw) {
        try {
          data = JSON.parse(raw);
        } catch (e) {
          if (!res.ok) {
            // Gin often returns plain "404 page not found" for missing routes.
            throw new Error(
              'CMS HTTP ' +
                res.status +
                (raw.length < 160 ? ': ' + raw : '') +
                (res.status === 404
                  ? ' — redeploy content-management-service if replace-catalog is missing'
                  : '')
            );
          }
          throw new Error('CMS returned non-JSON (' + res.status + ')');
        }
      }
      if (!res.ok) {
        var msg = (data && (data.error || data.message)) || res.statusText || 'Request failed';
        throw new Error(msg);
      }
      return data || {};
    });
  }

  function setAccountState(state, text) {
    var banner = $('posAccountBanner');
    var el = $('posConnectStatus');
    var badge = $('posCardTitleBadge');
    var connectBtn = $('btnPosConnectLoyverse');
    var prevState = banner ? banner.getAttribute('data-state') : '';
    if (banner) banner.setAttribute('data-state', state);
    if (el) {
      el.textContent = text;
      el.style.color = '';
    }
    if (connectBtn) {
      var connected = state === 'connected';
      connectBtn.textContent = connected ? 'Reconnect' : 'Connect Loyverse';
      connectBtn.className = connected ? 'btn-dash btn-dash-secondary' : 'btn-dash btn-dash-primary';
    }
    if (badge) {
      badge.setAttribute('data-state', state === 'error' ? 'disconnected' : state);
      if (state === 'connected') {
        updateLocationSummary();
      } else if (state === 'checking') {
        badge.textContent = 'Checking…';
      } else if (state === 'error') {
        badge.textContent = /sign in/i.test(text || '') ? 'Sign in' : 'Error';
      } else {
        badge.textContent = 'Not connected';
      }
    }
    if (state === 'connected' && prevState !== 'connected') {
      [banner, badge, $('posIntegrationPanel')].forEach(function (node) {
        if (!node) return;
        node.classList.remove('is-just-connected');
        void node.offsetWidth;
        node.classList.add('is-just-connected');
      });
    } else if (state !== 'connected') {
      [banner, badge, $('posIntegrationPanel')].forEach(function (node) {
        if (node) node.classList.remove('is-just-connected');
      });
    }
    if (state === 'disconnected' || state === 'error') {
      setPosEmbedCollapsed(false, false);
    }
    if (state !== 'connected') {
      renderSetupStatus();
    }
    if (typeof window.syncOrderingDashboardVisibility === 'function') {
      window.syncOrderingDashboardVisibility();
    }
  }

  function setStatus(text, isError) {
    setAccountState(isError ? 'error' : 'checking', text);
  }

  function setMapStatus(text, isError) {
    var el = $('posLocationMapStatus');
    if (!el) return;
    el.textContent = text || '';
    el.style.color = isError ? '#b42318' : '';
  }

  function setSettingsStatus(text, isError) {
    var el = $('posSettingsSaveStatus');
    if (!el) return;
    el.textContent = text || '';
    el.style.color = isError ? '#b42318' : '';
  }

  function setItemMapStatus(text, isError) {
    var el = $('posItemMapStatus');
    if (!el) return;
    el.textContent = text || '';
    el.style.color = isError ? '#b42318' : '';
  }

  function showItemMapButtons(show) {
    var a = $('btnPosAutoMapItems');
    var s = $('btnPosSaveItemMapping');
    if (a) a.hidden = !show;
    if (s) s.hidden = !show;
  }

  function pos() {
    return window.posIntegration;
  }

  function normalizeName(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function storeById(id) {
    if (!id) return null;
    for (var i = 0; i < cachedStores.length; i += 1) {
      if (String(cachedStores[i].id || '') === String(id)) return cachedStores[i];
    }
    return null;
  }

  function storeOptionHtml(selectedId) {
    var html = '<option value="">— Choose a till —</option>';
    var found = false;
    cachedStores.forEach(function (s) {
      var id = s.id || '';
      var sel = id && id === selectedId ? ' selected' : '';
      if (sel) found = true;
      html +=
        '<option value="' +
        escapeAttr(id) +
        '"' +
        sel +
        '>' +
        escapeHtml(s.name || id) +
        '</option>';
    });
    if (selectedId && !found) {
      html +=
        '<option value="' +
        escapeAttr(selectedId) +
        '" selected>Connected store (reload stores for name)</option>';
    }
    return html;
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, '&#39;');
  }

  function locationLabel(loc, index) {
    return loc.city || loc.address || 'Location ' + (index + 1);
  }

  function itemMappingMap() {
    return (window.POS_CONFIG && window.POS_CONFIG.itemMapping) || {};
  }

  function mappingValue(keyed) {
    if (!keyed) return '';
    if (typeof keyed === 'string') return keyed;
    if (keyed.variant_id) return String(keyed.variant_id);
    return '';
  }

  function mappingHas(title, size) {
    var map = itemMappingMap();
    var item = String(title || '').trim();
    if (!item) return false;
    var sizeKey = String(size || '').trim();
    if (sizeKey && sizeKey !== '-' && sizeKey !== '—' && sizeKey !== '–') {
      if (mappingValue(map[item + '|' + sizeKey])) return true;
    }
    return !!mappingValue(map[item]);
  }

  function itemIsMatched(item) {
    if (!item) return false;
    if (item.loyverse_variant_id || item.loyverse_item_id) return true;
    var title = String(item.name || item.linkTitle || item.title || '').trim();
    var metas = item.price_meta || [];
    var sizes = [];
    var priceMapped = 0;
    metas.forEach(function (m) {
      if (m && m.loyverse_variant_id) priceMapped += 1;
      var s = String((m && (m.variable1 || m.size)) || '').trim();
      if (s && s !== '-' && s !== '—' && s !== '–') sizes.push(s);
    });
    if (priceMapped && priceMapped === metas.length) return true;
    if (!sizes.length) return mappingHas(title, '');
    return sizes.every(function (s) {
      return mappingHas(title, s);
    });
  }

  function itemsForLocation(slug) {
    var key = String(slug || '').trim();
    var locItems = cachedMenuItems.filter(function (it) {
      return String(it.location_slug || it.ttms_location || '').trim() === key;
    });
    if (locItems.length) return locItems;
    if (!key) return cachedMenuItems;
    return cachedMenuItems.filter(function (it) {
      return !String(it.location_slug || it.ttms_location || '').trim();
    });
  }

  function locationItemStats(slug) {
    var items = itemsForLocation(slug);
    var unmatched = [];
    var matched = 0;
    items.forEach(function (it) {
      if (itemIsMatched(it)) {
        matched += 1;
        return;
      }
      unmatched.push(String(it.name || it.linkTitle || 'Untitled').trim());
    });
    var total = items.length;
    var state = 'unknown';
    if (!total) state = 'empty';
    else if (matched === total) state = 'full';
    else if (matched > 0) state = 'partial';
    else state = 'none';
    return {
      total: total,
      matched: matched,
      unmatched: unmatched,
      state: state,
    };
  }

  function itemMatchRowHtml(stats) {
    var count = 'Checking matches…';
    var extra = '';
    if (stats.state === 'empty') {
      count = 'No sellable items on this location menu';
    } else if (stats.state !== 'unknown') {
      count = stats.matched + ' of ' + stats.total + ' items matched';
      if (stats.unmatched.length) {
        var shown = stats.unmatched.slice(0, 3);
        var more = stats.unmatched.length - shown.length;
          extra =
          '<p class="dashboard-pos-item-match-unmapped">Won’t print: ' +
          escapeHtml(shown.join(', ')) +
          (more > 0 ? ' +' + more + ' more' : '') +
          '</p>';
      }
    }
    return (
      '<span class="dashboard-pos-item-match-label">Menu items</span>' +
      '<span class="dashboard-pos-item-match-count">' +
      escapeHtml(count) +
      '</span>' +
      extra
    );
  }

  function paintLocationItemMatches() {
    var list = $('posLocationMapList');
    if (!list) return;
    list.querySelectorAll('.dashboard-pos-location-card').forEach(function (card) {
      var idx = parseInt(card.getAttribute('data-loc-index'), 10);
      var loc = !isNaN(idx) ? cachedLocations[idx] || {} : {};
      var slug = loc.slug || card.getAttribute('data-loc-slug') || '';
      var stats = locationItemStats(slug);
      var row = card.querySelector('.dashboard-pos-item-match');
      if (!row) {
        row = document.createElement('div');
        row.className = 'dashboard-pos-item-match';
        card.appendChild(row);
      }
      row.setAttribute('data-state', stats.state);
      row.innerHTML = itemMatchRowHtml(stats);
    });
    var overview = $('posItemMatchByLocation');
    if (overview) {
      if (!cachedLocations.length) {
        overview.hidden = true;
        overview.innerHTML = '';
      } else {
        overview.hidden = false;
        overview.innerHTML = cachedLocations
          .map(function (loc, index) {
            var stats = locationItemStats(loc.slug || '');
            return (
              '<div class="dashboard-pos-item-match" data-state="' +
              stats.state +
              '">' +
              '<span class="dashboard-pos-item-match-label">' +
              escapeHtml(locationLabel(loc, index)) +
              '</span>' +
              '<span class="dashboard-pos-item-match-count">' +
              escapeHtml(
                stats.total
                  ? stats.matched + ' of ' + stats.total + ' items matched'
                  : 'No items'
              ) +
              '</span></div>'
            );
          })
          .join('');
      }
    }
    updateLocationSummary();
  }

  function loadMenuCatalog() {
    return fetch('/api/menu-items.json', { credentials: 'same-origin' })
      .then(function (r) {
        if (r.ok) return r.json();
        return fetch('/menu-items.json', { credentials: 'same-origin' }).then(function (r2) {
          return r2.ok ? r2.json() : null;
        });
      })
      .then(function (data) {
        var items = (data && (data.menu_items || data.items)) || [];
        cachedMenuItems = Array.isArray(items) ? items : [];
        var titles = [];
        cachedMenuItems.forEach(function (it) {
          if (it && it.name) titles.push(String(it.name));
          if (it && it.linkTitle) titles.push(String(it.linkTitle));
        });
        if (titles.length) menuTitleHints = Array.from(new Set(titles.filter(Boolean)));
        paintLocationItemMatches();
        return cachedMenuItems;
      })
      .catch(function () {
        cachedMenuItems = [];
        return cachedMenuItems;
      });
  }

  function loadLatestItemMapping() {
    return ensureAuth()
      .then(function (token) {
        var url =
          cmsApiBase() +
          '/clients/' +
          encodeURIComponent(clientId()) +
          '/config/data-pos-mapping';
        return fetch(url, { credentials: 'include', headers: authHeaders(token) }).then(parseCms);
      })
      .then(function (d) {
        var items = (d && d.loyverse && d.loyverse.items) || d.items || {};
        if (items && typeof items === 'object') {
          window.POS_CONFIG = window.POS_CONFIG || {};
          window.POS_CONFIG.itemMapping = items;
        }
        paintLocationItemMatches();
        return items;
      })
      .catch(function () {
        paintLocationItemMatches();
      });
  }

  function connectedStoreLabel(storeId) {
    var store = storeById(storeId);
    if (store && store.name) return 'Till: ' + store.name;
    if (storeId) return 'Till selected';
    return 'Choose a till';
  }

  function collectPosSetup() {
    var banner = $('posAccountBanner');
    var accountState = banner ? banner.getAttribute('data-state') || 'checking' : 'checking';
    var total = cachedLocations.length;
    var mapped = 0;
    cachedLocations.forEach(function (loc) {
      if (loc && loc.loyverse_store_id) mapped += 1;
    });
    var itemsReady = cachedMenuItems.length > 0;
    var itemMatched = 0;
    var itemTotal = 0;
    var unmatched = [];
    var seen = {};
    cachedLocations.forEach(function (loc) {
      var stats = locationItemStats(loc.slug || '');
      itemMatched += stats.matched;
      itemTotal += stats.total;
      (stats.unmatched || []).forEach(function (name) {
        if (!name || seen[name]) return;
        seen[name] = true;
        unmatched.push(name);
      });
    });
    return {
      accountState: accountState,
      total: total,
      mapped: mapped,
      storesDone: total > 0 && mapped === total,
      itemsReady: itemsReady,
      itemMatched: itemMatched,
      itemTotal: itemTotal,
      itemsDone: itemsReady && itemTotal > 0 && itemMatched === itemTotal,
      unmatched: unmatched,
    };
  }

  var applyingStepOpen = false;

  function rememberStepToggle(el) {
    if (!el || el.getAttribute('data-collapse-bound') === '1') return;
    el.setAttribute('data-collapse-bound', '1');
    el.addEventListener('toggle', function () {
      if (applyingStepOpen) return;
      el.setAttribute('data-user-toggled', '1');
    });
  }

  function applyStepOpen(el, shouldOpen) {
    if (!el) return;
    rememberStepToggle(el);
    if (el.getAttribute('data-user-toggled') === '1') return;
    if (!!el.open === !!shouldOpen) return;
    applyingStepOpen = true;
    el.open = !!shouldOpen;
    applyingStepOpen = false;
  }

  function setStepPill(id, state, text) {
    var el = $(id);
    if (!el) return;
    el.setAttribute('data-state', state);
    el.textContent = text;
  }

  function openPosStep(key) {
    var ids = {
      account: 'posStepConnect',
      locations: 'posLocationMapRow',
      items: 'posMatchItemsPanel',
      orders: 'posStepOrders',
    };
    if (!key || !ids[key]) return;
    var el = $(ids[key]);
    if (!el) return;
    el.hidden = false;
    el.setAttribute('data-user-toggled', '1');
    el.open = true;
    if (el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function syncPosSteps(setup) {
    var linked = setup.accountState === 'connected';
    var checking = setup.accountState === 'checking';
    var needAccount = !linked;
    var needLocations = linked && !setup.storesDone;
    var needItems = linked && setup.storesDone && setup.unmatched.length > 0;

    applyStepOpen($('posStepConnect'), needAccount || checking);
    applyStepOpen($('posLocationMapRow'), needLocations);
    applyStepOpen($('posStepOrders'), false);
    applyStepOpen($('posMatchItemsPanel'), needItems);
    applyStepOpen($('posReplaceCatalogRow'), false);

    if (checking) setStepPill('posStepConnectPill', 'checking', 'Checking…');
    else if (linked) setStepPill('posStepConnectPill', 'ready', 'Linked');
    else setStepPill('posStepConnectPill', 'attention', 'Not linked');

    if (!linked) setStepPill('posStepLocationsPill', 'pending', 'Waiting…');
    else if (!setup.total) setStepPill('posStepLocationsPill', 'attention', 'No locations');
    else if (setup.storesDone) setStepPill('posStepLocationsPill', 'ready', 'All ' + setup.total + ' ready');
    else {
      var left = setup.total - setup.mapped;
      setStepPill('posStepLocationsPill', 'attention', left === 1 ? '1 left' : left + ' left');
    }

    setStepPill('posStepOrdersPill', 'ready', 'Optional');
  }

  function setSetupRow(key, state, detail) {
    var board = $('posSetupBoard');
    if (!board) return;
    var row = board.querySelector('[data-setup="' + key + '"]');
    if (!row) return;
    row.setAttribute('data-state', state);
    var el = $('posSetup' + key.charAt(0).toUpperCase() + key.slice(1) + 'Detail');
    if (el && detail) el.textContent = detail;
  }

  function renderSetupStatus() {
    var board = $('posSetupBoard');
    var next = $('posSetupNext');
    var badge = $('posCardTitleBadge');
    var setup = collectPosSetup();
    var linked = setup.accountState === 'connected';

    if (setup.accountState === 'checking') {
      setSetupRow('account', 'checking', 'Checking your link…');
    } else if (linked) {
      setSetupRow('account', 'ready', 'Linked. Receipts can go to your tills.');
    } else if (setup.accountState === 'error') {
      setSetupRow('account', 'error', 'Couldn’t check the link. Sign in and tap Refresh.');
    } else {
      setSetupRow('account', 'attention', 'Not linked yet. Tap Connect Loyverse.');
    }

    if (!linked) {
      setSetupRow('locations', 'pending', 'Waiting until Loyverse is linked.');
      setSetupRow('items', 'pending', 'Waiting until Loyverse is linked.');
    } else if (!setup.total) {
      setSetupRow('locations', 'attention', 'No locations on this menu yet. Add them in Settings.');
      setSetupRow('items', 'pending', 'Add locations first.');
    } else if (!setup.storesDone) {
      setSetupRow(
        'locations',
        'attention',
        setup.mapped + ' of ' + setup.total + ' locations have a till. Choose one for each, then save.'
      );
      setSetupRow(
        'items',
        setup.itemsReady ? (setup.itemsDone ? 'ready' : 'attention') : 'checking',
        setup.itemsReady
          ? setup.itemsDone
            ? 'Every dish matches a Loyverse item.'
            : setup.itemMatched + ' of ' + setup.itemTotal + ' dishes match a Loyverse item.'
          : 'Checking dishes…'
      );
    } else {
      setSetupRow('locations', 'ready', 'All ' + setup.total + ' locations have a till.');
      if (!setup.itemsReady) {
        setSetupRow('items', 'checking', 'Checking which dishes match Loyverse…');
      } else if (!setup.itemTotal) {
        setSetupRow('items', 'pending', 'No sellable dishes found on this menu.');
      } else if (setup.itemsDone) {
        setSetupRow('items', 'ready', 'All ' + setup.itemTotal + ' dishes match Loyverse.');
      } else {
        var shown = setup.unmatched.slice(0, 3);
        var more = setup.unmatched.length - shown.length;
        setSetupRow(
          'items',
          'attention',
          setup.itemMatched +
            ' of ' +
            setup.itemTotal +
            ' dishes match. Missing: ' +
            shown.join(', ') +
            (more > 0 ? ' +' + more + ' more' : '') +
            '.'
        );
      }
    }

    var nextText = 'Checking Loyverse…';
    var nextReady = false;
    var nextAction = '';
    if (setup.accountState === 'checking') {
      nextText = 'Checking whether this menu is linked to Loyverse…';
    } else if (setup.accountState === 'error') {
      nextText = 'Sign in, then tap Refresh so we can see your Loyverse account.';
      nextAction = 'account';
    } else if (!linked) {
      nextText = 'Tap Connect Loyverse and sign in. One login covers every location.';
      nextAction = 'account';
    } else if (!setup.total) {
      nextText = 'Add menu locations in Settings, then come back to pick a till for each.';
    } else if (!setup.storesDone) {
      nextText =
        'Pick a Loyverse till for each location, then tap Save location connections.';
      nextAction = 'locations';
    } else if (!setup.itemsReady) {
      nextText = 'Locations are set. Checking which dishes will print on the till…';
    } else if (setup.unmatched.length) {
      var names = setup.unmatched.slice(0, 3).join(', ');
      var extra = setup.unmatched.length > 3 ? ' +' + (setup.unmatched.length - 3) + ' more' : '';
      nextText =
        setup.unmatched.length === 1
          ? names + ' will not print on the till. Tap here to map it, or rename it to match a Loyverse item.'
          : names +
            extra +
            ' will not print on the till. Tap here to map them, or rename them to match Loyverse.';
      nextAction = 'items';
    } else if (setup.itemsDone) {
      nextText = 'You’re set. Guest orders go to the till you picked for that location.';
      nextReady = true;
    } else {
      nextText = 'Locations are linked. Guest orders can go to Loyverse.';
      nextReady = true;
    }
    if (next) {
      next.textContent = nextText;
      next.setAttribute('data-ready', nextReady ? 'true' : 'false');
      next.setAttribute('data-action', nextAction);
    }

    var matchPanel = $('posMatchItemsPanel');
    if (matchPanel) {
      matchPanel.classList.toggle('is-needed', !!(linked && setup.unmatched.length));
    }
    syncPosSteps(setup);

    if (badge && linked) {
      if (setup.unmatched.length) {
        badge.setAttribute('data-state', 'attention');
        badge.textContent =
          setup.unmatched.length === 1 ? '1 dish to match' : setup.unmatched.length + ' dishes to match';
      } else if (!setup.storesDone && setup.total) {
        var left = setup.total - setup.mapped;
        badge.setAttribute('data-state', 'attention');
        badge.textContent = left === 1 ? '1 location left' : left + ' locations left';
      } else {
        badge.setAttribute('data-state', 'connected');
        badge.textContent = 'Ready';
      }
    }
    if (board) board.hidden = false;
  }

  function updateLocationCardState(card, storeId) {
    if (!card) return;
    var mapped = !!storeId;
    card.classList.toggle('is-connected', mapped);
    card.classList.toggle('is-unmapped', !mapped);
    var badge = card.querySelector('.dashboard-pos-location-badge');
    if (badge) {
      badge.setAttribute('data-connected', mapped ? 'true' : 'false');
      badge.textContent = connectedStoreLabel(storeId);
    }
  }

  function updateLocationSummary() {
    var summary = $('posLocationSummary');
    var setup = collectPosSetup();
    if (summary) {
      summary.setAttribute('data-complete', setup.storesDone && setup.itemsDone ? 'true' : 'false');
      if (!setup.total) {
        summary.textContent = 'No locations on this menu yet. Add them in Settings.';
      } else if (setup.storesDone) {
        summary.textContent = 'All ' + setup.total + ' locations have a till.';
      } else {
        summary.textContent =
          setup.mapped +
          ' of ' +
          setup.total +
          ' locations have a till. Choose one for each, then save.';
      }
    }
    renderSetupStatus();
  }

  function renderLocationMap() {
    var list = $('posLocationMapList');
    if (!list) return;
    list.innerHTML = '';
    if (!cachedLocations.length) {
      updateLocationSummary();
      return;
    }
    cachedLocations.forEach(function (loc, index) {
      var storeId = loc.loyverse_store_id || '';
      var card = document.createElement('article');
      card.className =
        'dashboard-pos-location-card' + (storeId ? ' is-connected' : ' is-unmapped');
      card.setAttribute('data-loc-index', String(index));
      if (loc.slug) card.setAttribute('data-loc-slug', loc.slug);
      var meta = '';
      if (loc.address && loc.city) meta = loc.address;
      else if (loc.island) meta = loc.island;
      var stats = locationItemStats(loc.slug || '');
      card.innerHTML =
        '<div class="dashboard-pos-location-card-head">' +
        '<div class="dashboard-pos-location-card-copy">' +
        '<h5 class="dashboard-pos-location-name">' +
        escapeHtml(locationLabel(loc, index)) +
        '</h5>' +
        (meta ? '<p class="dashboard-pos-location-meta">' + escapeHtml(meta) + '</p>' : '') +
          '</div>' +
        '<span class="dashboard-pos-location-badge" data-connected="' +
        (storeId ? 'true' : 'false') +
        '">' +
        escapeHtml(connectedStoreLabel(storeId)) +
        '</span></div>' +
        '<label class="dashboard-pos-location-store-label"><span>Till for this location</span>' +
        '<select class="dashboard-settings-input" data-loc-index="' +
        index +
        '">' +
        storeOptionHtml(storeId) +
        '</select></label>' +
        '<div class="dashboard-pos-item-match" data-state="' +
        stats.state +
        '">' +
        itemMatchRowHtml(stats) +
        '</div>';
      var sel = card.querySelector('select[data-loc-index]');
      if (sel) {
        sel.addEventListener('change', function () {
          var v = (sel.value || '').trim();
          if (v) cachedLocations[index].loyverse_store_id = v;
          else delete cachedLocations[index].loyverse_store_id;
          updateLocationCardState(card, v);
          updateLocationSummary();
        });
      }
      list.appendChild(card);
    });
    updateLocationSummary();
  }

  function seedLocationsFromDom() {
    var list = $('posLocationMapList');
    if (!list || cachedLocations.length) return;
    var cards = list.querySelectorAll('.dashboard-pos-location-card');
    if (!cards.length) return;
    cachedLocations = [];
    cards.forEach(function (card, index) {
      var sel = card.querySelector('select[data-loc-index]');
      var nameEl = card.querySelector('.dashboard-pos-location-name');
      var loc = {
        city: nameEl ? String(nameEl.textContent || '').trim() : 'Location ' + (index + 1),
        slug: card.getAttribute('data-loc-slug') || '',
      };
      var storeId = sel && sel.value ? String(sel.value).trim() : '';
      if (storeId) loc.loyverse_store_id = storeId;
      cachedLocations.push(loc);
      if (sel) {
        sel.addEventListener('change', function () {
          var v = (sel.value || '').trim();
          if (v) cachedLocations[index].loyverse_store_id = v;
          else delete cachedLocations[index].loyverse_store_id;
          updateLocationCardState(card, v);
          updateLocationSummary();
        });
      }
    });
    updateLocationSummary();
  }

  function applySelectionsToLocations() {
    var list = $('posLocationMapList');
    if (!list) return cachedLocations;
    list.querySelectorAll('select[data-loc-index]').forEach(function (sel) {
      var idx = parseInt(sel.getAttribute('data-loc-index'), 10);
      if (isNaN(idx) || !cachedLocations[idx]) return;
      var v = (sel.value || '').trim();
      if (v) cachedLocations[idx].loyverse_store_id = v;
      else delete cachedLocations[idx].loyverse_store_id;
    });
    return cachedLocations;
  }

  function autoMatchByName() {
    applySelectionsToLocations();
    var used = {};
    cachedLocations.forEach(function (loc) {
      if (loc.loyverse_store_id) used[loc.loyverse_store_id] = true;
    });
    cachedLocations.forEach(function (loc) {
      if (loc.loyverse_store_id) return;
      var candidates = [loc.city, loc.address, loc.island]
        .map(normalizeName)
        .filter(Boolean);
      var best = null;
      var bestScore = 0;
      cachedStores.forEach(function (s) {
        if (!s.id || used[s.id]) return;
        var sn = normalizeName(s.name);
        if (!sn) return;
        candidates.forEach(function (c) {
          if (!c) return;
          var score = 0;
          if (sn === c) score = 100;
          else if (sn.indexOf(c) >= 0 || c.indexOf(sn) >= 0) score = 70;
          else {
            var parts = c.split(' ');
            var hits = parts.filter(function (p) {
              return p.length > 2 && sn.indexOf(p) >= 0;
            }).length;
            score = hits * 20;
          }
          if (score > bestScore) {
            bestScore = score;
            best = s;
          }
        });
      });
      if (best && bestScore >= 40) {
        loc.loyverse_store_id = best.id;
        used[best.id] = true;
      }
    });
    renderLocationMap();
    setMapStatus('Auto-matched where names looked similar — review and Save.');
  }

  function receiptModeFromData(d) {
    var mode = String((d && d.loyverse_receipt_mode) || '').toLowerCase();
    if (mode === 'on_payment' || mode === 'direct' || mode === 'off') return mode;
    if (d && d.auto_process_orders === true) return 'direct';
    return 'on_payment';
  }

  function applyReceiptMode(mode) {
    var sel = $('posReceiptModeSelect');
    var ap = $('posAutoProcessCb');
    if (sel) sel.value = mode;
    if (ap) ap.checked = mode === 'direct';
    if (window.POS_CONFIG) {
      window.POS_CONFIG.loyverseReceiptMode = mode;
      window.POS_CONFIG.autoProcessOrders = mode === 'direct';
    }
    if (window.ORDER_CONFIG) window.ORDER_CONFIG.loyverseReceiptMode = mode;
  }

  function loadPosSettings() {
    return ensureAuth()
      .then(function (token) {
        var url =
          cmsApiBase() +
          '/clients/' +
          encodeURIComponent(clientId()) +
          '/config/hugo-posintegration';
        return fetch(url, { credentials: 'include', headers: authHeaders(token) }).then(parseCms);
      })
      .then(function (d) {
        var en = $('posEnabledCb');
        var ap = $('posAutoProcessCb');
        if (en) en.checked = !!d.enabled;
        if (ap) ap.checked = !!d.auto_process_orders;
        applyReceiptMode(receiptModeFromData(d));
        if (typeof window.syncOrderingDashboardVisibility === 'function') {
          window.syncOrderingDashboardVisibility();
        }
        return d;
      })
      .catch(function (err) {
        var c = window.POS_CONFIG || {};
        var en = $('posEnabledCb');
        var ap = $('posAutoProcessCb');
        if (en) en.checked = !!c.enabled;
        if (ap) ap.checked = !!c.autoProcessOrders;
        applyReceiptMode(receiptModeFromData({
          loyverse_receipt_mode: c.loyverseReceiptMode,
          auto_process_orders: c.autoProcessOrders,
        }));
        if (typeof window.syncOrderingDashboardVisibility === 'function') {
          window.syncOrderingDashboardVisibility();
        }
        console.warn('[POS dashboard] load settings', err);
      });
  }

  function savePosSettings() {
    setSettingsStatus('Saving…');
    return ensureAuth()
      .then(function (token) {
        var c = window.POS_CONFIG || {};
        var mode = ($('posReceiptModeSelect') && $('posReceiptModeSelect').value) || 'on_payment';
        applyReceiptMode(mode);
        var body = {
          enabled: !!($('posEnabledCb') && $('posEnabledCb').checked),
          provider: 'loyverse',
          api_url: c.apiUrl || c.oauthUrl || 'https://loyverse-oauth.ttmenus.com',
          oauth_url: c.oauthUrl || c.apiUrl || 'https://loyverse-oauth.ttmenus.com',
          store_id: ($('posStoreSelect') && $('posStoreSelect').value) || c.storeId || '',
          sync_menu: !!c.syncMenu,
          auto_process_orders: mode === 'direct',
          loyverse_receipt_mode: mode,
          fallback_to_whatsapp: false,
        };
        var url =
          cmsApiBase() +
          '/clients/' +
          encodeURIComponent(clientId()) +
          '/config/hugo-posintegration';
        return fetch(url, {
          method: 'POST',
          credentials: 'include',
          headers: authHeaders(token),
          body: JSON.stringify(body),
        }).then(parseCms);
      })
      .then(function (data) {
        var h = data && data.commit && data.commit.hash ? String(data.commit.hash).slice(0, 7) : '';
        setSettingsStatus(h ? 'Saved · commit ' + h + ' (redeploy to apply)' : 'Saved.');
        if (window.POS_CONFIG) window.POS_CONFIG.fallbackToWhatsapp = false;
        if (typeof window.syncOrderingDashboardVisibility === 'function') {
          window.syncOrderingDashboardVisibility();
        }
      })
      .catch(function (err) {
        setSettingsStatus(String(err.message || err), true);
      });
  }

  function fetchLocations() {
    return ensureAuth()
      .then(function (token) {
        var url =
          cmsApiBase() +
          '/clients/' +
          encodeURIComponent(clientId()) +
          '/config/data-locations';
        return fetch(url, { credentials: 'include', headers: authHeaders(token) }).then(parseCms);
      })
      .then(function (d) {
        cachedLocations = Array.isArray(d.locations) ? d.locations : [];
        return cachedLocations;
      });
  }

  function saveLocationMapping() {
    setMapStatus('Saving…');
    applySelectionsToLocations();
    return ensureAuth()
      .then(function (token) {
        var url =
          cmsApiBase() +
          '/clients/' +
          encodeURIComponent(clientId()) +
          '/config/data-locations';
        return fetch(url, {
          method: 'POST',
          credentials: 'include',
          headers: authHeaders(token),
          body: JSON.stringify({ locations: cachedLocations }),
        }).then(parseCms);
      })
      .then(function (data) {
        var h = data && data.commit && data.commit.hash ? String(data.commit.hash).slice(0, 7) : '';
        setMapStatus(h ? 'Saved · commit ' + h + ' (redeploy menu to apply)' : 'Saved.');
        updateLocationSummary();
      })
      .catch(function (err) {
        setMapStatus(String(err.message || err), true);
      });
  }

  var posStatusRefreshInFlight = false;

  function needsPosStatusRetry() {
    var banner = $('posAccountBanner');
    var text = $('posConnectStatus');
    var state = banner && banner.getAttribute('data-state');
    var copy = ((text && text.textContent) || '').toLowerCase();
    return state === 'error' || state === 'checking' || /sign in/i.test(copy);
  }

  function refreshStatusWhenReady() {
    if (posStatusRefreshInFlight) return posStatusRefreshInFlight;
    posStatusRefreshInFlight = whenAuthReady()
      .then(function () {
        return refreshStatus();
      })
      .then(function (d) {
        if (d && d.connected) loadStores();
        return d;
      })
      .finally(function () {
        posStatusRefreshInFlight = false;
      });
    return posStatusRefreshInFlight;
  }

  function refreshStatus() {
    setAccountState('checking', 'Checking Loyverse connection…');
    return ensureAuth()
      .then(function () {
        if (!pos() || !pos().getStatus) throw new Error('POS client not loaded (enable POS settings + redeploy)');
        return pos().getStatus();
      })
      .then(function (d) {
        if (d.connected) {
          var statusNote =
            d.status && d.status !== 'active' ? ' Loyverse reports: ' + d.status + '.' : '';
          setAccountState(
            'connected',
            'Linked. Guest orders can go to your Loyverse tills.' + statusNote
          );
          var loadStores = $('btnPosLoadStores');
          var loadItems = $('btnPosLoadItems');
          if (loadStores) loadStores.hidden = false;
          if (loadItems) loadItems.hidden = false;
        } else {
          setAccountState('disconnected', 'Not linked yet. Tap Connect Loyverse and sign in.');
        }
        return d;
      })
      .catch(function (err) {
        var msg = String(err.message || err);
        if (/sign in required/i.test(msg)) {
          setAccountState('error', 'Sign in to see whether Loyverse is linked.');
        } else {
          setAccountState('error', msg);
        }
      });
  }

  function connect() {
    setStatus('Starting OAuth…');
    return ensureAuth()
      .then(function () {
        if (!pos() || !pos().connect) throw new Error('POS client not loaded (enable POS + redeploy)');
        var returnTo = window.location.origin + '/dashboard/?loyverse=connected';
        return pos().connect(returnTo);
      })
      .then(function (d) {
        if (d && d.authorization_url) {
          window.location.href = d.authorization_url;
          return;
        }
        throw new Error('No authorization_url');
      })
      .catch(function (err) {
        setStatus(String(err.message || err), true);
      });
  }

  function loadStores() {
    return ensureAuth()
      .then(function () {
        return pos().listStores();
      })
      .then(function (d) {
        var row = $('posStoresRow');
        var sel = $('posStoreSelect');
        if (!row || !sel) return;
        sel.innerHTML = '';
        cachedStores = (d && d.stores) || [];
        var empty = document.createElement('option');
        empty.value = '';
        empty.textContent = '— First store if a location has none —';
        sel.appendChild(empty);
        cachedStores.forEach(function (s) {
          var opt = document.createElement('option');
          opt.value = s.id || '';
          opt.textContent = s.name || 'Unnamed store';
          sel.appendChild(opt);
        });
        var cfgStore = (window.POS_CONFIG && window.POS_CONFIG.storeId) || '';
        if (cfgStore) sel.value = cfgStore;
        row.hidden = cachedStores.length === 0;
        if (cachedStores.length) {
          setMapStatus(cachedStores.length + ' Loyverse store(s) found. Pick a till for each location.');
        } else {
          setMapStatus('No Loyverse stores found on this account.', true);
        }
        return fetchLocations().then(function () {
          renderLocationMap();
        });
      })
      .catch(function (err) {
        setStatus(String(err.message || err), true);
      });
  }

  function listAllLoyverseItems() {
    var all = [];
    var guard = 0;
    function page(cursor) {
      guard += 1;
      if (guard > 40) return Promise.resolve(all);
      return pos().listItems(cursor).then(function (d) {
        var items = (d && d.items) || [];
        all = all.concat(items);
        var next = (d && (d.cursor || d.next_cursor)) || '';
        if (next && items.length) return page(next);
        return all;
      });
    }
    return page('');
  }

  function loadMenuTitleHints() {
    return fetch('/menu-items.json', { credentials: 'same-origin' })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (data) {
        var titles = [];
        function walk(node) {
          if (!node) return;
          if (Array.isArray(node)) {
            node.forEach(walk);
            return;
          }
          if (typeof node !== 'object') return;
          if (node.title) titles.push(String(node.title));
          if (node.name) titles.push(String(node.name));
          Object.keys(node).forEach(function (k) {
            if (k === 'title' || k === 'name') return;
            walk(node[k]);
          });
        }
        walk(data);
        menuTitleHints = Array.from(new Set(titles.filter(Boolean)));
        return menuTitleHints;
      })
      .catch(function () {
        menuTitleHints = [];
        return menuTitleHints;
      });
  }

  function bestMenuTitleMatch(loyverseName) {
    var n = normalizeName(loyverseName);
    if (!n) return '';
    var best = '';
    var bestScore = 0;
    var pool = menuTitleHints.slice();
    var existingMap = (window.POS_CONFIG && window.POS_CONFIG.itemMapping) || {};
    Object.keys(existingMap).forEach(function (k) {
      pool.push(k.split('|')[0]);
    });
    pool = Array.from(new Set(pool));
    pool.forEach(function (title) {
      var tn = normalizeName(title);
      if (!tn) return;
      var score = 0;
      if (tn === n) score = 100;
      else if (tn.indexOf(n) >= 0 || n.indexOf(tn) >= 0) score = 75;
      else {
        var parts = n.split(' ');
        var hits = parts.filter(function (p) {
          return p.length > 2 && tn.indexOf(p) >= 0;
        }).length;
        score = hits * 18;
      }
      if (score > bestScore) {
        bestScore = score;
        best = title;
      }
    });
    return bestScore >= 60 ? best : loyverseName;
  }

  function buildProposedMapping(items) {
    var map = {};
    (items || []).forEach(function (it) {
      var name = String(it.item_name || it.name || '').trim();
      if (!name) return;
      var hugoTitle = bestMenuTitleMatch(name);
      var variants = it.variants || [];
      if (!variants.length) return;
      var multi = variants.length > 1;
      variants.forEach(function (v) {
        var vid = String(v.variant_id || v.id || '').trim();
        if (!vid) return;
        var o1 = String(v.option1_value || '').trim();
        var o2 = String(v.option2_value || '').trim();
        var key = hugoTitle;
        if (multi || o1) {
          key = hugoTitle;
          if (o1) key += '|' + o1;
          if (o2) key += '|' + o2;
        }
        map[key] = { variant_id: vid };
        // Also map bare title when single default variant
        if (!multi && !o1 && !o2) {
          map[hugoTitle] = { variant_id: vid };
        }
      });
      // Single-variant with empty option: also expose bare title
      if (variants.length === 1) {
        var only = variants[0];
        var onlyId = String(only.variant_id || only.id || '').trim();
        if (onlyId) map[hugoTitle] = { variant_id: onlyId };
      }
    });
    return map;
  }

  function renderItemMapPreview(map) {
    var el = $('posItemMapPreview');
    if (!el) return;
    var keys = Object.keys(map || {}).sort();
    if (!keys.length) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    var rows = keys
      .map(function (k) {
        var v = map[k];
        var id = typeof v === 'string' ? v : (v && v.variant_id) || '';
        return (
          '<div style="display:flex;gap:0.5rem;flex-wrap:wrap;border-bottom:1px solid rgba(0,0,0,0.08);padding:0.25rem 0;">' +
          '<code style="flex:1;min-width:10rem;">' +
          escapeHtml(k) +
          '</code>' +
          '<span style="opacity:0.8;">' +
          escapeHtml(id) +
          '</span></div>'
        );
      })
      .join('');
    el.innerHTML = rows;
    el.hidden = false;
  }

  function loadItems() {
    var preview = $('posItemsPreview');
    setItemMapStatus('Loading items…');
    return ensureAuth()
      .then(function () {
        return Promise.all([listAllLoyverseItems(), loadMenuTitleHints()]);
      })
      .then(function (results) {
        cachedLoyverseItems = results[0] || [];
        var lines = [];
        cachedLoyverseItems.forEach(function (it) {
          var name = it.item_name || it.name || '';
          (it.variants || []).forEach(function (v) {
            var opt = '';
            if (v.option1_value) opt += '|' + v.option1_value;
            if (v.option2_value) opt += '|' + v.option2_value;
            lines.push(name + opt + ' => ' + (v.variant_id || v.id || ''));
          });
        });
        if (preview) {
          preview.hidden = false;
          preview.textContent = lines.length
            ? lines.join('\n')
            : 'No Loyverse items found.';
        }
        showItemMapButtons(cachedLoyverseItems.length > 0);
        setItemMapStatus(
          cachedLoyverseItems.length
            ? 'Loaded ' + cachedLoyverseItems.length + ' Loyverse item(s). Auto-map, then save.'
            : 'No items to map.'
        );
      })
      .catch(function (err) {
        setItemMapStatus(String(err.message || err), true);
      });
  }

  function autoMapItems() {
    if (!cachedLoyverseItems.length) {
      setItemMapStatus('Load Loyverse items first.', true);
      return;
    }
    proposedItemMapping = buildProposedMapping(cachedLoyverseItems);
    renderItemMapPreview(proposedItemMapping);
    var n = Object.keys(proposedItemMapping).length;
    setItemMapStatus(n ? 'Proposed ' + n + ' mapping key(s) — review and Save.' : 'No mappings produced.', !n);
  }

  function saveItemMapping() {
    if (!Object.keys(proposedItemMapping).length) {
      setItemMapStatus('Auto-map items first (or load + auto-map).', true);
      return;
    }
    setItemMapStatus('Saving…');
    return ensureAuth()
      .then(function (token) {
        var url =
          cmsApiBase() +
          '/clients/' +
          encodeURIComponent(clientId()) +
          '/config/data-pos-mapping';
        return fetch(url, {
          method: 'POST',
          credentials: 'include',
          headers: authHeaders(token),
          body: JSON.stringify({ loyverse_items: proposedItemMapping }),
        }).then(parseCms);
      })
      .then(function (data) {
        var h = data && data.commit && data.commit.hash ? String(data.commit.hash).slice(0, 7) : '';
        setItemMapStatus(h ? 'Saved · commit ' + h + ' (redeploy menu to apply)' : 'Saved.');
        if (window.POS_CONFIG) {
          window.POS_CONFIG.itemMapping = Object.assign(
            {},
            window.POS_CONFIG.itemMapping || {},
            proposedItemMapping
          );
        }
        paintLocationItemMatches();
        updateLocationSummary();
      })
      .catch(function (err) {
        setItemMapStatus(String(err.message || err), true);
      });
  }

  function setReplaceStatus(text, isError) {
    var el = $('posReplaceCatalogStatus');
    if (!el) return;
    el.textContent = text || '';
    el.style.color = isError ? '#b42318' : '';
  }

  function clientNameForConfirm() {
    return String(clientId() || '')
      .trim()
      .replace(/^_?ttms_/i, '')
      .replace(/^_+/, '');
  }

  function typedClientMatches(typed) {
    var want = clientNameForConfirm().toLowerCase();
    var got = String(typed || '')
      .trim()
      .replace(/^_?ttms_/i, '')
      .replace(/^_+/, '')
      .toLowerCase();
    return !!want && !!got && got === want;
  }

  function promptReplaceCatalogConfirm() {
    var name = clientNameForConfirm();
    if (!name) return null;
    var typed = window.prompt(
      'Delete shared dishes on the menu and import Loyverse catalog.\nType ' + name + ' to confirm.',
      ''
    );
    return typed == null ? null : typed;
  }

  function listAllLoyverseCategories() {
    if (!pos() || !pos().listCategories) {
      return Promise.resolve([]);
    }
    var all = [];
    var guard = 0;
    function page(cursor) {
      guard += 1;
      if (guard > 40) return Promise.resolve(all);
      return pos().listCategories(cursor).then(function (d) {
        var cats = (d && d.categories) || [];
        all = all.concat(cats);
        var next = (d && (d.cursor || d.next_cursor)) || '';
        if (next && cats.length) return page(next);
        return all;
      });
    }
    return page('').catch(function () {
      return [];
    });
  }

  function replaceCatalogFromLoyverse() {
    var typed = promptReplaceCatalogConfirm();
    if (typed == null) return;
    var name = clientNameForConfirm();
    if (!typedClientMatches(typed)) {
      setReplaceStatus('Type ' + name + ' to confirm.', true);
      var status = $('posReplaceCatalogStatus');
      if (status) {
        status.innerHTML = 'Type <strong>' + escapeHtml(name) + '</strong> to confirm.';
      }
      return;
    }
    var btn = $('btnPosReplaceCatalog');
    if (btn) btn.disabled = true;
    setReplaceStatus('Loading Loyverse catalog…');
    return ensureAuth()
      .then(function () {
        if (!pos() || !pos().listItems) throw new Error('POS client not loaded');
        return Promise.all([listAllLoyverseItems(), listAllLoyverseCategories()]);
      })
      .then(function (results) {
        var items = results[0] || [];
        var categories = results[1] || [];
        if (!items.length) throw new Error('No Loyverse items found');
        setReplaceStatus('Importing ' + items.length + ' item(s)…');
        return ensureAuth().then(function (token) {
          var url =
            cmsApiBase() +
            '/clients/' +
            encodeURIComponent(clientId()) +
            '/loyverse/replace-catalog';
          return fetch(url, {
            method: 'POST',
            credentials: 'include',
            headers: authHeaders(token),
            body: JSON.stringify({
              confirm: 'REPLACE',
              categories: categories.map(function (c) {
                return { id: c.id || '', name: c.name || c.category_name || '' };
              }),
              items: items,
            }),
          }).then(parseCms);
        });
      })
      .then(function (data) {
        var h = data && data.commit && data.commit.hash ? String(data.commit.hash).slice(0, 7) : '';
        var n = data && data.items_written != null ? data.items_written : '?';
        var m = data && data.categories_written != null ? data.categories_written : '?';
        setReplaceStatus(
          (h ? 'Imported ' + n + ' items / ' + m + ' categories · commit ' + h : 'Imported.') +
            ' Redeploy menu to apply.'
        );
        if (btn) btn.disabled = false;
      })
      .catch(function (err) {
        setReplaceStatus(String(err.message || err), true);
        if (btn) btn.disabled = false;
      });
  }

  var POS_EMBED_COLLAPSE_KEY = 'ttms-pos-embed-collapsed';

  function setPosEmbedCollapsed(collapsed, persist) {
    var panel = $('posIntegrationPanel');
    var toggle = $('posEmbedToggle');
    if (!panel) return;
    panel.classList.toggle('is-collapsed', !!collapsed);
    if (toggle) toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    if (persist !== false) {
      try {
        localStorage.setItem(POS_EMBED_COLLAPSE_KEY, collapsed ? '1' : '0');
      } catch (e) {}
    }
  }

  function initPosEmbedCollapse() {
    var toggle = $('posEmbedToggle');
    var panel = $('posIntegrationPanel');
    if (!toggle || !panel) return;
    var collapsed = true;
    try {
      var stored = localStorage.getItem(POS_EMBED_COLLAPSE_KEY);
      if (stored === '0') collapsed = false;
      else if (stored === '1') collapsed = true;
    } catch (e) {}
    setPosEmbedCollapsed(collapsed, false);
    toggle.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      setPosEmbedCollapsed(!panel.classList.contains('is-collapsed'));
    });
  }

  function init() {
    if (!$('posIntegrationPanel')) return;
    initPosEmbedCollapse();
    var panel = $('posIntegrationPanel');
    if (panel) {
      panel.addEventListener('keydown', function (ev) {
        if (ev.key !== 'Enter') return;
        var tag = ev.target && ev.target.tagName;
        if (tag === 'TEXTAREA' || tag === 'BUTTON') return;
        ev.preventDefault();
      });
    }
    var params = new URLSearchParams(window.location.search);
    if (params.get('loyverse') === 'connected') {
      setPosEmbedCollapsed(false);
      setAccountState('checking', 'Loyverse connected. Refreshing status…');
      var ordering = $('orderingSystemPanel');
      if (ordering && ordering.classList.contains('is-collapsed')) {
        var toggle = ordering.querySelector('[data-dashboard-card-toggle]');
        if (toggle) toggle.click();
      }
      if (panel && panel.scrollIntoView) {
        setTimeout(function () {
          panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
      }
    }
    if (params.get('loyverse_error')) {
      setAccountState('error', 'Loyverse error: ' + params.get('loyverse_error'));
    }
    var c = $('btnPosConnectLoyverse');
    var r = $('btnPosRefreshStatus');
    var s = $('btnPosLoadStores');
    var i = $('btnPosLoadItems');
    var saveSet = $('btnPosSaveSettings');
    var autoBtn = $('btnPosAutoAssignStores');
    var saveMap = $('btnPosSaveLocationStores');
    var autoItems = $('btnPosAutoMapItems');
    var saveItems = $('btnPosSaveItemMapping');
    var replaceBtn = $('btnPosReplaceCatalog');
    if (c) c.addEventListener('click', connect);
    if (r) r.addEventListener('click', refreshStatus);
    if (s) s.addEventListener('click', loadStores);
    if (i) i.addEventListener('click', loadItems);
    if (saveSet) saveSet.addEventListener('click', savePosSettings);
    if (autoBtn) autoBtn.addEventListener('click', autoMatchByName);
    if (saveMap) saveMap.addEventListener('click', saveLocationMapping);
    if (autoItems) autoItems.addEventListener('click', autoMapItems);
    if (saveItems) saveItems.addEventListener('click', saveItemMapping);
    if (replaceBtn) replaceBtn.addEventListener('click', replaceCatalogFromLoyverse);
    var confirmName = $('posReplaceConfirmName');
    if (confirmName && clientNameForConfirm()) confirmName.textContent = clientNameForConfirm();

    var setupBoard = $('posSetupBoard');
    if (setupBoard) {
      setupBoard.querySelectorAll('[data-setup]').forEach(function (row) {
        row.addEventListener('click', function () {
          openPosStep(row.getAttribute('data-setup') || '');
        });
      });
    }
    var setupNext = $('posSetupNext');
    if (setupNext) {
      setupNext.addEventListener('click', function () {
        openPosStep(setupNext.getAttribute('data-action') || '');
      });
    }

    seedLocationsFromDom();
    loadPosSettings();
    loadMenuCatalog();
    loadLatestItemMapping();
    fetchLocations()
      .then(function () {
        renderLocationMap();
        paintLocationItemMatches();
      })
      .catch(function () {
        paintLocationItemMatches();
      });
    refreshStatusWhenReady();
    window.addEventListener('ttms:auth-ready', function () {
      if (needsPosStatusRetry()) refreshStatusWhenReady();
    });
    window.addEventListener('auth:login', function () {
      refreshStatusWhenReady();
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) return;
      if (needsPosStatusRetry()) refreshStatusWhenReady();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
