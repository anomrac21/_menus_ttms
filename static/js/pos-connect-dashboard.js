/**
 * Menu settings: Connect Loyverse + status / stores / items helpers.
 */
(function () {
  'use strict';

  function $(id) {
    return document.getElementById(id);
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

  function setStatus(text, isError) {
    var el = $('posConnectStatus');
    if (!el) return;
    el.textContent = text;
    el.style.color = isError ? '#b42318' : '';
  }

  function pos() {
    return window.posIntegration;
  }

  function refreshStatus() {
    setStatus('Checking…');
    return ensureAuth()
      .then(function () {
        if (!pos() || !pos().getStatus) throw new Error('POS client not loaded (enable posintegration)');
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
        var stores = (d && d.stores) || [];
        stores.forEach(function (s) {
          var opt = document.createElement('option');
          opt.value = s.id || '';
          opt.textContent = (s.name || s.id || 'store') + ' — ' + (s.id || '');
          sel.appendChild(opt);
        });
        row.hidden = stores.length === 0;
        if (stores.length) setStatus('Loaded ' + stores.length + ' store(s). Copy id into hugo.toml store_id if needed.');
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
    if (c) c.addEventListener('click', connect);
    if (r) r.addEventListener('click', refreshStatus);
    if (s) s.addEventListener('click', loadStores);
    if (i) i.addEventListener('click', loadItems);

    // POS_CONFIG / pos-integration.js may load deferred — retry status shortly.
    setTimeout(refreshStatus, 400);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
