/**
 * Menu settings: Connect Loyverse, POS hugo.toml flags, per-location store map via CMS.
 */
(function () {
  'use strict';

  var cachedStores = [];
  var cachedLocations = [];

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
    return ensureAuth().then(function (token) {
      var url =
        cmsApiBase() +
        '/clients/' +
        encodeURIComponent(clientId()) +
        '/config/hugo-posintegration';
      return fetch(url, { credentials: 'include', headers: authHeaders(token) }).then(parseCms);
    }).then(function (d) {
      var en = $('posEnabledCb');
      var fb = $('posFallbackWhatsappCb');
      var ap = $('posAutoProcessCb');
      if (en) en.checked = !!d.enabled;
      if (fb) fb.checked = d.fallback_to_whatsapp !== false;
      if (ap) ap.checked = !!d.auto_process_orders;
      return d;
    }).catch(function (err) {
      // Fallback to in-page POS_CONFIG if CMS endpoint not deployed yet
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
    return ensureAuth().then(function (token) {
      var url =
        cmsApiBase() +
        '/clients/' +
        encodeURIComponent(clientId()) +
        '/config/data-locations';
      return fetch(url, { credentials: 'include', headers: authHeaders(token) }).then(parseCms);
    }).then(function (d) {
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
        // Keep default store in sync with first mapped / selected default
        var def = $('posStoreSelect');
        if (def && def.value) {
          // optional: also persist default store_id via POS settings without forcing enabled toggle
        }
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

  function loadItems() {
    var preview = $('posItemsPreview');
    return ensureAuth()
      .then(function () {
        return pos().listItems();
      })
      .then(function (d) {
        var items = (d && d.items) || [];
        var lines = [];
        items.forEach(function (it) {
          var name = it.item_name || it.name || '';
          (it.variants || []).forEach(function (v) {
            lines.push(name + (v.option1_value ? '|' + v.option1_value : '') + ' => ' + (v.variant_id || v.id || ''));
          });
        });
        if (preview) {
          preview.hidden = false;
          preview.textContent = lines.length ? lines.join('\n') : JSON.stringify(d, null, 2).slice(0, 4000);
        }
        setStatus('Loaded Loyverse items — copy variant ids into front matter or pos-mapping.yaml');
      })
      .catch(function (err) {
        setStatus(String(err.message || err), true);
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
    if (c) c.addEventListener('click', connect);
    if (r) r.addEventListener('click', refreshStatus);
    if (s) s.addEventListener('click', loadStores);
    if (i) i.addEventListener('click', loadItems);
    if (saveSet) saveSet.addEventListener('click', savePosSettings);
    if (autoBtn) autoBtn.addEventListener('click', autoMatchByName);
    if (saveMap) saveMap.addEventListener('click', saveLocationMapping);

    loadPosSettings();
    setTimeout(refreshStatus, 400);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
