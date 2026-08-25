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
    var m = cfg().itemMapping || global.POS_ITEM_MAPPING || {};
    if (typeof m === 'string') {
      try {
        m = JSON.parse(m);
      } catch (_) {
        m = {};
      }
    }
    return m && typeof m === 'object' ? m : {};
  }

  function isBlankSize(size) {
    var s = String(size || '').trim();
    return !s || s === '-' || s === '—' || s === '–';
  }

  function lookupMapValue(keyed) {
    if (!keyed) return '';
    if (typeof keyed === 'string') return keyed;
    if (keyed.variant_id) return String(keyed.variant_id);
    return '';
  }

  /**
   * Resolve Loyverse variant_id from cart line + mapping / front-matter fields.
   * Mapping keys: exact item title, or "Title|size" (and optional "Title|size|opt2").
   * Dash / empty size falls back to bare title key.
   */
  function resolveVariantId(line) {
    if (line && line.variant_id) return String(line.variant_id).trim();
    if (line && line.loyverse_variant_id) return String(line.loyverse_variant_id).trim();
    var map = mapping();
    var item = String((line && (line.item || line.name)) || '').trim();
    var size = String((line && line.size) || '').trim();
    if (!item) return '';

    var candidates = [];
    if (!isBlankSize(size)) {
      candidates.push(item + '|' + size);
    }
    candidates.push(item);
    candidates.push(item + '|-');

    for (var i = 0; i < candidates.length; i++) {
      var keyed = map[candidates[i]];
      var direct = lookupMapValue(keyed);
      if (direct) return direct;
      if (keyed && keyed.variants) {
        if (!isBlankSize(size) && keyed.variants[size]) {
          return String(keyed.variants[size]);
        }
        if (keyed.variants['-']) return String(keyed.variants['-']);
        if (keyed.variants['']) return String(keyed.variants['']);
      }
    }
    return lookupFromMenuCatalog(item, size, line && line.url);
  }

  function variantFromPriceMeta(metas, size) {
    if (!Array.isArray(metas) || !metas.length) return '';
    var sz = String(size || '-').trim();
    for (var i = 0; i < metas.length; i++) {
      var pm = metas[i];
      if (!pm || !pm.loyverse_variant_id) continue;
      var v1 = String(pm.variable1 || '-').trim();
      if (sz === v1 || (isBlankSize(sz) && isBlankSize(v1))) return String(pm.loyverse_variant_id).trim();
    }
    if (metas.length === 1 && metas[0].loyverse_variant_id) {
      return String(metas[0].loyverse_variant_id).trim();
    }
    return '';
  }

  function lookupFromMenuCatalog(itemName, size, url) {
    var items = global.menuItemsCache;
    if (!Array.isArray(items) || !items.length) return '';
    var name = String(itemName || '').trim().toLowerCase();
    if (!name) return '';
    var matches = items.filter(function (it) {
      return String((it && (it.linkTitle || it.name || it.title)) || '')
        .trim()
        .toLowerCase() === name;
    });
    if (!matches.length) return '';
    var pick = matches[0];
    if (url) {
      var u = String(url).replace(/\/+$/, '');
      var byUrl = matches.filter(function (it) {
        return String(it.url || '').replace(/\/+$/, '') === u;
      })[0];
      if (byUrl) pick = byUrl;
    } else if (matches.length > 1) {
      var slug = '';
      try {
        if (typeof global.getCurrentLocationData === 'function') {
          var loc = global.getCurrentLocationData();
          slug = (loc && loc.slug) || '';
        }
      } catch (_) {}
      if (slug) {
        var byLoc = matches.filter(function (it) {
          return (
            it.location_slug === slug ||
            (it.url && String(it.url).indexOf('/' + slug + '/') !== -1)
          );
        })[0];
        if (byLoc) pick = byLoc;
      }
    }
    if (pick.loyverse_variant_id) return String(pick.loyverse_variant_id).trim();
    return variantFromPriceMeta(pick.price_meta, size);
  }

  function lineNote(line) {
    var parts = [];
    if (line.mods && line.mods.length) parts.push('Mods: ' + line.mods.join(', '));
    if (line.adds && line.adds.length) parts.push('Adds: ' + line.adds.join(', '));
    if (line.sides) {
      if (typeof line.sides === 'object' && line.sides.categories) {
        Object.keys(line.sides.categories).forEach(function (cat) {
          var items = line.sides.categories[cat] || [];
          var names = items
            .map(function (it) {
              return typeof it === 'object' && it ? it.name || '' : String(it);
            })
            .filter(Boolean);
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
    return headers;
  }

  function resolveStoreId(opts) {
    opts = opts || {};
    if (opts.storeId) return String(opts.storeId).trim();
    try {
      if (typeof global.getCurrentLocationData === 'function') {
        var loc = global.getCurrentLocationData();
        if (loc && loc.loyverse_store_id) return String(loc.loyverse_store_id).trim();
      }
    } catch (_) {}
    return String(cfg().storeId || '').trim();
  }

  function mappingIsEmpty() {
    var m = mapping();
    return !m || !Object.keys(m).length;
  }

  function ensureItemMapping() {
    if (!mappingIsEmpty()) return Promise.resolve(mapping());
    return fetch('/pos-item-mapping.json', { credentials: 'same-origin' })
      .then(function (res) {
        if (!res.ok) throw new Error('pos-mapping ' + res.status);
        return res.json();
      })
      .then(function (data) {
        var items = (data && data.loyverse && data.loyverse.items) || data.items || data || {};
        if (!global.POS_CONFIG) global.POS_CONFIG = {};
        global.POS_CONFIG.itemMapping = items;
        return items;
      })
      .catch(function () {
        return mapping();
      });
  }

  function ensureMenuCatalog() {
    if (Array.isArray(global.menuItemsCache) && global.menuItemsCache.length) {
      return Promise.resolve(global.menuItemsCache);
    }
    return fetch('/api/menu-items.json', { credentials: 'same-origin' })
      .then(function (res) {
        if (!res.ok) throw new Error('menu-items ' + res.status);
        return res.json();
      })
      .then(function (data) {
        global.menuItemsCache = (data && data.menu_items) || [];
        return global.menuItemsCache;
      })
      .catch(function () {
        return global.menuItemsCache || [];
      });
  }

  var posIntegration = {
    get isPOSEnabled() {
      var c = cfg();
      return !!(c.enabled && (c.provider || '').toLowerCase() === 'loyverse' && apiBase());
    },

    processOrderWithPOS: function (opts) {
      if (!this.isPOSEnabled) return Promise.resolve({ skipped: true });
      opts = opts || {};
      var orderArr = opts.order || global.order;
      if (!Array.isArray(orderArr) || !orderArr.length) {
        return Promise.resolve({ skipped: true, reason: 'empty_cart' });
      }
      return Promise.all([ensureMenuCatalog(), ensureItemMapping()]).then(function () {
        var lines = buildLinesFromOrder(orderArr);
        var missing = lines.filter(function (l) {
          return !l.variant_id;
        });
        if (missing.length) {
          console.warn(
            '[POS] ' +
              missing.length +
              ' cart line(s) missing variant_id — map items in menu-settings or set loyverse_variant_id',
            missing.map(function (l) {
              return (l.item || '') + (l.size ? '|' + l.size : '');
            })
          );
        }
        var body = {
          client_id: clientId(),
          store_id: resolveStoreId(opts),
          order_ref: 'TTM-' + Date.now(),
          note: 'TTmenus web order',
          lines: lines,
        };
        if (!body.client_id) {
          console.warn('[POS] missing client_id');
          return { ok: false, error: 'missing_client_id' };
        }
        if (!body.store_id) {
          console.warn('[POS] no store_id on location or POS_CONFIG — Loyverse may use first store');
        }
        return fetch(apiBase() + '/api/v1/loyverse/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(body),
        }).then(function (res) {
          return res.json().then(function (data) {
            if (!res.ok) {
              console.warn('[POS] order failed', res.status, data);
              return { ok: false, status: res.status, data: data };
            }
            console.log('[POS] receipt created', data);
            return { ok: true, data: data };
          });
        });
      }).catch(function (err) {
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

    listCategories: function (cursor) {
      var token = getAuthToken();
      if (!token) return Promise.reject(new Error('not authenticated'));
      var path = '/api/v1/loyverse/categories';
      if (cursor) path += '?cursor=' + encodeURIComponent(cursor);
      path = withClientQuery(path);
      return fetch(apiBase() + path, {
        headers: authHeaders(),
      }).then(function (r) {
        return r.json().then(function (d) {
          if (!r.ok) throw new Error((d && d.error) || 'categories failed');
          return d;
        });
      });
    },

    resolveVariantId: resolveVariantId,
    buildLinesFromOrder: buildLinesFromOrder,
  };

  global.posIntegration = posIntegration;
})(typeof window !== 'undefined' ? window : this);
