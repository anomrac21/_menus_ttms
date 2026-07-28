/**
 * Thin POS client for TTmenus menus.
 * Posts mapped cart lines to loyverse-oauth-service; never holds Loyverse tokens.
 * Expects window.POS_CONFIG from head.html when posintegration.enabled.
 */
(function (global) {
  'use strict';

  function cfg() {
    return global.POS_CONFIG || {};
  }

  function apiBase() {
    var c = cfg();
    return String(c.apiUrl || c.oauthUrl || 'https://loyverse-oauth.ttmenus.com').replace(/\/$/, '');
  }

  function clientId() {
    var c = cfg();
    return (
      c.clientId ||
      global.SITE_CLIENT_ID ||
      (global.SiteConfig && global.SiteConfig.clientId) ||
      (global.MENU_IMAGE_CONFIG && global.MENU_IMAGE_CONFIG.clientId) ||
      ''
    );
  }

  function getAuthToken() {
    try {
      if (global.AuthClient && typeof global.AuthClient.getAccessToken === 'function') {
        return global.AuthClient.getAccessToken() || '';
      }
    } catch (_) {}
    return '';
  }

  function mapping() {
    return cfg().itemMapping || global.POS_ITEM_MAPPING || {};
  }

  /**
   * Resolve Loyverse variant_id from cart line + mapping / front-matter fields.
   * Mapping keys: exact item title, or "Title|size".
   */
  function resolveVariantId(line) {
    if (line && line.variant_id) return String(line.variant_id).trim();
    if (line && line.loyverse_variant_id) return String(line.loyverse_variant_id).trim();
    var map = mapping();
    var item = String((line && (line.item || line.name)) || '').trim();
    var size = String((line && line.size) || '').trim();
    if (!item) return '';
    var keyed = map[item + '|' + size] || map[item];
    if (!keyed) return '';
    if (typeof keyed === 'string') return keyed;
    if (keyed.variant_id) return String(keyed.variant_id);
    if (keyed.variants && size && keyed.variants[size]) return String(keyed.variants[size]);
    if (keyed.variants && keyed.variants['-']) return String(keyed.variants['-']);
    if (keyed.variants && keyed.variants['']) return String(keyed.variants['']);
    return '';
  }

  function lineNote(line) {
    var parts = [];
    if (line.mods && line.mods.length) parts.push('Mods: ' + line.mods.join(', '));
    if (line.adds && line.adds.length) parts.push('Adds: ' + line.adds.join(', '));
    if (line.sides) {
      if (typeof line.sides === 'object' && line.sides.categories) {
        Object.keys(line.sides.categories).forEach(function (cat) {
          var items = line.sides.categories[cat] || [];
          var names = items.map(function (it) {
            return typeof it === 'object' && it ? it.name || '' : String(it);
          }).filter(Boolean);
          if (names.length) parts.push(cat + ': ' + names.join(', '));
        });
      } else if (Array.isArray(line.sides) && line.sides.length) {
        parts.push('Sides: ' + line.sides.join(', '));
      }
    }
    return parts.join(' | ');
  }

  function buildLinesFromOrder(orderArr) {
    var lines = [];
    (orderArr || []).forEach(function (o) {
      var qty = Number(o.amt) || 1;
      var price = Number(o.cost);
      var unit = qty > 0 ? price / qty : price;
      var variantId = resolveVariantId(o);
      lines.push({
        variant_id: variantId,
        item: o.item,
        size: o.size || '',
        quantity: qty,
        price: isFinite(unit) ? unit : undefined,
        note: lineNote(o),
        loyverse_variant_id: o.loyverse_variant_id || '',
      });
    });
    return lines;
  }

  function withClientQuery(path) {
    var id = clientId();
    if (!id) return path;
    var sep = path.indexOf('?') >= 0 ? '&' : '?';
    return path + sep + 'client_id=' + encodeURIComponent(id);
  }

  function authHeaders() {
    var headers = { Accept: 'application/json' };
    var token = getAuthToken();
    if (token) headers.Authorization = 'Bearer ' + token;
    var id = clientId();
    if (id) headers['X-TTMenus-Client-Id'] = id;
    return headers;
  }

  var posIntegration = {
    get isPOSEnabled() {
      var c = cfg();
      return !!(c.enabled && (c.provider || '').toLowerCase() === 'loyverse' && apiBase());
    },

    processOrderWithPOS: function () {
      if (!this.isPOSEnabled) return Promise.resolve({ skipped: true });
      var orderArr = global.order;
      if (!Array.isArray(orderArr) || !orderArr.length) {
        return Promise.resolve({ skipped: true, reason: 'empty_cart' });
      }
      var lines = buildLinesFromOrder(orderArr);
      var body = {
        client_id: clientId(),
        store_id: cfg().storeId || '',
        order_ref: 'TTM-' + Date.now(),
        note: 'TTmenus web order',
        lines: lines,
      };
      if (!body.client_id) {
        console.warn('[POS] missing client_id');
        return Promise.resolve({ ok: false, error: 'missing_client_id' });
      }
      return fetch(apiBase() + '/api/v1/loyverse/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      })
        .then(function (res) {
          return res.json().then(function (data) {
            if (!res.ok) {
              console.warn('[POS] order failed', res.status, data);
              return { ok: false, status: res.status, data: data };
            }
            console.log('[POS] receipt created', data);
            return { ok: true, data: data };
          });
        })
        .catch(function (err) {
          console.warn('[POS] order error', err);
          return { ok: false, error: String(err) };
        });
    },

    getStatus: function () {
      var token = getAuthToken();
      if (!token) return Promise.reject(new Error('not authenticated'));
      return fetch(apiBase() + withClientQuery('/api/v1/loyverse/status'), {
        headers: authHeaders(),
      }).then(function (r) {
        return r.json().then(function (d) {
          if (!r.ok) throw new Error((d && d.error) || 'status failed');
          return d;
        });
      });
    },

    connect: function (returnTo) {
      var token = getAuthToken();
      if (!token) return Promise.reject(new Error('not authenticated'));
      var path = '/api/v1/loyverse/connect';
      if (returnTo) path += '?return_to=' + encodeURIComponent(returnTo);
      path = withClientQuery(path);
      return fetch(apiBase() + path, {
        headers: authHeaders(),
      }).then(function (r) {
        return r.json().then(function (d) {
          if (!r.ok) throw new Error((d && d.error) || 'connect failed');
          return d;
        });
      });
    },

    listStores: function () {
      var token = getAuthToken();
      if (!token) return Promise.reject(new Error('not authenticated'));
      return fetch(apiBase() + withClientQuery('/api/v1/loyverse/stores'), {
        headers: authHeaders(),
      }).then(function (r) {
        return r.json().then(function (d) {
          if (!r.ok) throw new Error((d && d.error) || 'stores failed');
          return d;
        });
      });
    },

    listItems: function (cursor) {
      var token = getAuthToken();
      if (!token) return Promise.reject(new Error('not authenticated'));
      var path = '/api/v1/loyverse/items';
      if (cursor) path += '?cursor=' + encodeURIComponent(cursor);
      path = withClientQuery(path);
      return fetch(apiBase() + path, {
        headers: authHeaders(),
      }).then(function (r) {
        return r.json().then(function (d) {
          if (!r.ok) throw new Error((d && d.error) || 'items failed');
          return d;
        });
      });
    },

    resolveVariantId: resolveVariantId,
  };

  global.posIntegration = posIntegration;
})(typeof window !== 'undefined' ? window : this);
