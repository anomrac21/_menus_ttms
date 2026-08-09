/**
 * Menu settings: Connect Loyverse, POS hugo.toml flags,
 * per-location store map + item variant map via CMS.
 */
(function () {
  'use strict';

  var cachedStores = [];
  var cachedLocations = [];
  var cachedLoyverseItems = [];
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

  function ensureAuth() {
    if (!window.AuthClient) return Promise.reject(new Error('AuthClient missing'));
    if (AuthClient.getAccessToken && AuthClient.getAccessToken()) {
      return Promise.resolve(AuthClient.getAccessToken());
    }
    if (AuthClient.ensureAuthenticated) {
      return AuthClient.ensureAuthenticated().then(function (r) {
        if (r && r.accessToken) return r.accessToken;
        if (AuthClient.getAccessToken) return AuthClient.getAccessToken();
        throw new Error('Sign in required');
      });
    }
    return Promise.reject(new Error('Sign in required'));
  }

  function authHeaders(token) {
    return {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    };
  }

  function parseCms(res) {
    return res.json().then(function (data) {
      if (!res.ok) {
        var msg = (data && (data.error || data.message)) || res.statusText || 'Request failed';
        throw new Error(msg);
      }
      return data;
    });
  }

  function setStatus(text, isError) {
    var el = $('posConnectStatus');
    if (!el) return;
    el.textContent = text;
    el.style.color = isError ? '#b42318' : '';
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

  function storeOptionHtml(selectedId) {
    var html = '<option value="">— Not mapped —</option>';
    cachedStores.forEach(function (s) {
      var id = s.id || '';
      var sel = id && id === selectedId ? ' selected' : '';
      html +=
        '<option value="' +
        escapeAttr(id) +
        '"' +
        sel +
        '>' +
        escapeHtml(s.name || id) +
        '</option>';
    });
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

  function renderLocationMap() {
    var list = $('posLocationMapList');
    var row = $('posLocationMapRow');
    if (!list || !row) return;
    if (!cachedStores.length || !cachedLocations.length) {
      row.hidden = true;
      return;
    }
    row.hidden = false;
    list.innerHTML = '';
    cachedLocations.forEach(function (loc, index) {
      var wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:0.5rem;align-items:center;';
      var label = document.createElement('span');
      label.style.cssText = 'min-width:10rem;font-size:0.9rem;';
      label.textContent = locationLabel(loc, index);
      if (loc.address && loc.city) {
        label.title = loc.address;
      }
      var sel = document.createElement('select');
      sel.className = 'dashboard-settings-input';
      sel.setAttribute('data-loc-index', String(index));
      sel.style.cssText = 'flex:1;min-width:12rem;';
      sel.innerHTML = storeOptionHtml(loc.loyverse_store_id || '');
      wrap.appendChild(label);
      wrap.appendChild(sel);
      list.appendChild(wrap);
    });
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
        var fb = $('posFallbackWhatsappCb');
        var ap = $('posAutoProcessCb');
        if (en) en.checked = !!d.enabled;
        if (fb) fb.checked = d.fallback_to_whatsapp !== false;
        if (ap) ap.checked = !!d.auto_process_orders;
        return d;
      })
      .catch(function (err) {
        var c = window.POS_CONFIG || {};
        var en = $('posEnabledCb');
        var fb = $('posFallbackWhatsappCb');
        var ap = $('posAutoProcessCb');
        if (en) en.checked = !!c.enabled;
        if (fb) fb.checked = c.fallbackToWhatsapp !== false;
        if (ap) ap.checked = !!c.autoProcessOrders;
        console.warn('[POS dashboard] load settings', err);
      });
  }

  function savePosSettings() {
    setSettingsStatus('Saving…');
    return ensureAuth()
      .then(function (token) {
        var c = window.POS_CONFIG || {};
        var body = {
          enabled: !!($('posEnabledCb') && $('posEnabledCb').checked),
          provider: 'loyverse',
          api_url: c.apiUrl || c.oauthUrl || 'https://loyverse-oauth.ttmenus.com',
          oauth_url: c.oauthUrl || c.apiUrl || 'https://loyverse-oauth.ttmenus.com',
          store_id: ($('posStoreSelect') && $('posStoreSelect').value) || c.storeId || '',
          sync_menu: !!c.syncMenu,
          auto_process_orders: !!($('posAutoProcessCb') && $('posAutoProcessCb').checked),
          fallback_to_whatsapp: !!($('posFallbackWhatsappCb') && $('posFallbackWhatsappCb').checked),
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
      })
      .catch(function (err) {
        setMapStatus(String(err.message || err), true);
      });
  }

  function refreshStatus() {
    setStatus('Checking…');
    return ensureAuth()
      .then(function () {
        if (!pos() || !pos().getStatus) throw new Error('POS client not loaded (enable POS settings + redeploy)');
        return pos().getStatus();
      })
      .then(function (d) {
        if (d.connected) {
          setStatus(
            'Connected' +
              (d.external_account_id ? ' (merchant ' + d.external_account_id + ')' : '') +
              (d.status ? ' — ' + d.status : '')
          );
          var loadStores = $('btnPosLoadStores');
          var loadItems = $('btnPosLoadItems');
          if (loadStores) loadStores.hidden = false;
          if (loadItems) loadItems.hidden = false;
        } else {
          setStatus('Not connected — click Connect Loyverse');
        }
        return d;
      })
      .catch(function (err) {
        setStatus(String(err.message || err), true);
      });
  }

  function connect() {
    setStatus('Starting OAuth…');
    return ensureAuth()
      .then(function () {
        if (!pos() || !pos().connect) throw new Error('POS client not loaded (enable POS + redeploy)');
        var returnTo = window.location.origin + '/menu-settings/?loyverse=connected';
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
        empty.textContent = '— Use location mapping / first store —';
        sel.appendChild(empty);
        cachedStores.forEach(function (s) {
          var opt = document.createElement('option');
          opt.value = s.id || '';
          opt.textContent = (s.name || s.id || 'store') + ' — ' + (s.id || '');
          sel.appendChild(opt);
        });
        var cfgStore = (window.POS_CONFIG && window.POS_CONFIG.storeId) || '';
        if (cfgStore) sel.value = cfgStore;
        row.hidden = cachedStores.length === 0;
        if (cachedStores.length) {
          setStatus('Loaded ' + cachedStores.length + ' store(s). Map them to locations below.');
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
        setStatus('Loaded ' + cachedLoyverseItems.length + ' Loyverse item(s).');
        setItemMapStatus(
          cachedLoyverseItems.length
            ? 'Ready — Auto-map, then Save item mapping.'
            : 'No items to map.'
        );
      })
      .catch(function (err) {
        setStatus(String(err.message || err), true);
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
      })
      .catch(function (err) {
        setItemMapStatus(String(err.message || err), true);
      });
  }

  function init() {
    if (!$('posIntegrationPanel')) return;
    var params = new URLSearchParams(window.location.search);
    if (params.get('loyverse') === 'connected') {
      setStatus('Loyverse connected. Refreshing status…');
    }
    if (params.get('loyverse_error')) {
      setStatus('Loyverse error: ' + params.get('loyverse_error'), true);
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
    if (c) c.addEventListener('click', connect);
    if (r) r.addEventListener('click', refreshStatus);
    if (s) s.addEventListener('click', loadStores);
    if (i) i.addEventListener('click', loadItems);
    if (saveSet) saveSet.addEventListener('click', savePosSettings);
    if (autoBtn) autoBtn.addEventListener('click', autoMatchByName);
    if (saveMap) saveMap.addEventListener('click', saveLocationMapping);
    if (autoItems) autoItems.addEventListener('click', autoMapItems);
    if (saveItems) saveItems.addEventListener('click', saveItemMapping);

    loadPosSettings();
    setTimeout(refreshStatus, 400);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
