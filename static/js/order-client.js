/**
 * TTMenus order-service client. Signed-in customers create tickets; staff manage inbox/print.
 * Expects window.ORDER_CONFIG and AuthClient.getAccessToken().
 */
(function (global) {
  'use strict';

  function unwrapCfgValue(value) {
    if (typeof value !== 'string') return value;
    var s = value.trim();
    while (
      s.length >= 2 &&
      ((s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') ||
        (s.charAt(0) === "'" && s.charAt(s.length - 1) === "'"))
    ) {
      try {
        s = JSON.parse(s);
      } catch (_) {
        s = s.slice(1, -1);
      }
      if (typeof s !== 'string') return s;
      s = s.trim();
    }
    return s;
  }

  function cfg() {
    return global.ORDER_CONFIG || {};
  }

  function apiBase() {
    var raw = unwrapCfgValue(cfg().apiUrl);
    var url = String(raw || 'https://orders.ttmenus.com/api/v1').replace(/\/$/, '');
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://orders.ttmenus.com/api/v1';
    }
    if (!/\/api\/v1$/i.test(url)) {
      url = url.replace(/\/$/, '') + '/api/v1';
    }
    return url;
  }

  function getToken() {
    try {
      if (global.AuthClient && typeof global.AuthClient.getAccessToken === 'function') {
        return global.AuthClient.getAccessToken() || '';
      }
    } catch (_) {}
    try {
      return localStorage.getItem('ttmenus_access_token') || '';
    } catch (_) {
      return '';
    }
  }

  function clientId() {
    return unwrapCfgValue(
      cfg().clientId ||
        global.SITE_CLIENT_ID ||
        (global.POS_CONFIG && global.POS_CONFIG.clientId) ||
        (global.SiteConfig && global.SiteConfig.clientId) ||
        ''
    ) || '';
  }

  async function request(method, path, body) {
    var token = getToken();
    if (!token && global.AuthClient && typeof global.AuthClient.ensureAccessToken === 'function') {
      try {
        await global.AuthClient.ensureAccessToken();
      } catch (_) {}
      token = getToken();
    }
    if (!token) {
      throw new Error('Sign in required to order');
    }
    var opts = {
      method: method,
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/json',
      },
    };
    var cid = clientId();
    if (cid) opts.headers['X-TTMenus-Client-Id'] = cid;
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    var qs = path.indexOf('?') >= 0 ? '&' : '?';
    var url = apiBase() + path;
    if (cid && url.indexOf('client_id=') === -1) url += qs + 'client_id=' + encodeURIComponent(cid);
    var res;
    try {
      res = await fetch(url, opts);
    } catch (e) {
      var why = e && e.message ? e.message : String(e);
      throw new Error('Cannot reach ' + url + ' (' + why + ')');
    }
    var data = null;
    try {
      data = await res.json();
    } catch (_) {
      data = null;
    }
    if (!res.ok) {
      var msg = (data && (data.error || data.message || data.detail)) || res.statusText || 'Request failed';
      if (res.status === 404 && (!data || !data.error)) {
        msg = 'Order service route not found. Check ORDER_CONFIG.apiUrl (' + apiBase() + ').';
      }
      var err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function catalogLocations() {
    var menu = global.MENU_CONFIG || {};
    var list = menu.locations;
    if (typeof list === 'string') {
      try {
        list = JSON.parse(list);
      } catch (_) {
        list = [];
      }
    }
    return Array.isArray(list) ? list : [];
  }

  function catalogSlugs() {
    var menu = global.MENU_CONFIG || {};
    var list = menu.locationSlugs;
    if (typeof list === 'string') {
      try {
        list = JSON.parse(list);
      } catch (_) {
        list = [];
      }
    }
    if (Array.isArray(list) && list.length) return list.map(String);
    return catalogLocations()
      .map(function (loc) {
        return loc && loc.slug ? String(loc.slug) : '';
      })
      .filter(Boolean);
  }

  function matchCatalog(hint) {
    var list = catalogLocations();
    var slug = String((hint && hint.slug) || '').trim();
    var addr = String((hint && hint.address) || '').trim().toLowerCase();
    var city = String((hint && hint.city) || '').trim().toLowerCase();
    var i;
    if (slug) {
      for (i = 0; i < list.length; i++) {
        if (list[i] && String(list[i].slug || '') === slug) return list[i];
      }
    }
    if (addr) {
      for (i = 0; i < list.length; i++) {
        if (list[i] && String(list[i].address || '').trim().toLowerCase() === addr) return list[i];
      }
    }
    if (city) {
      for (i = 0; i < list.length; i++) {
        if (list[i] && String(list[i].city || '').trim().toLowerCase() === city) return list[i];
      }
    }
    return null;
  }

  function slugFromPath() {
    var slugs = catalogSlugs();
    var parts = String((global.location && global.location.pathname) || '')
      .replace(/^\/+|\/+$/g, '')
      .split('/')
      .filter(Boolean);
    if (!parts.length) return '';
    return slugs.indexOf(parts[0]) >= 0 ? parts[0] : '';
  }

  function slugFromCartInput(cart) {
    var lines = parseCartInput(cart);
    var slugs = catalogSlugs();
    var i;
    for (i = 0; i < lines.length; i++) {
      var line = lines[i] || {};
      var s = String(line.location_slug || line.ttms_location || '').trim();
      if (s && slugs.indexOf(s) >= 0) return s;
      var url = String(line.url || line.path || line.permalink || '').trim();
      if (!url) continue;
      var path = url.replace(/^https?:\/\/[^/]+/i, '');
      var parts = path.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
      if (parts[0] && slugs.indexOf(parts[0]) >= 0) return parts[0];
    }
    return '';
  }

  function parseCartInput(order) {
    var raw = order;
    if (order && typeof order === 'object' && !Array.isArray(order)) {
      raw = order.cart_json || order.cartJson || order.cart || order.lines || order;
    }
    var n = 0;
    while (typeof raw === 'string' && n < 4) {
      var s = raw.trim();
      if (!s) return [];
      try {
        raw = JSON.parse(s);
      } catch (_) {
        return [];
      }
      n += 1;
    }
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === 'object') {
      if (Array.isArray(raw.lines)) return raw.lines;
      if (Array.isArray(raw.items)) return raw.items;
      if (Array.isArray(raw.cart)) return raw.cart;
      if (Array.isArray(raw.order)) return raw.order;
    }
    return [];
  }

  function locationFromPicker() {
    var cur = global.currentOrderLocation || {};
    var found = matchCatalog({
      slug: cur.slug,
      address: cur.address,
      city: cur.city,
    });
    if (found) return found;
    if (typeof global.getCurrentLocationData === 'function') {
      try {
        var d = global.getCurrentLocationData();
        if (d) {
          found = matchCatalog({
            slug: d.slug,
            address: d.address,
            city: d.city,
          });
          if (found) return found;
        }
      } catch (_) {}
    }
    var sel = global.document && global.document.getElementById('locationSelect');
    if (sel && sel.selectedIndex >= 0) {
      var opt = sel.options[sel.selectedIndex];
      if (opt) {
        found = matchCatalog({
          slug: opt.getAttribute('data-slug'),
          address: opt.getAttribute('data-address'),
          city: opt.getAttribute('data-city'),
        });
        if (found) return found;
      }
    }
    return null;
  }

  function toLocationResult(loc, slugFallback) {
    var slug = String((loc && loc.slug) || slugFallback || '').trim();
    var latlon = loc && Array.isArray(loc.latlon) ? loc.latlon : [];
    return {
      slug: slug,
      storeId: (loc && (loc.loyverse_store_id || loc.loyverseStoreId)) || '',
      city: (loc && loc.city) || '',
      address: (loc && loc.address) || '',
      lat: latlon.length ? Number(latlon[0]) : Number((loc && loc.lat) || 0) || 0,
      lng: latlon.length > 1 ? Number(latlon[1]) : Number((loc && loc.lng) || 0) || 0,
    };
  }

  function inferLocationSlug(order) {
    var slug = String((order && order.location_slug) || '').trim();
    if (slug) return slug;
    return slugFromCartInput(order);
  }

  function resolveLocation(cart) {
    var picked = locationFromPicker();
    if (picked && picked.slug) return toLocationResult(picked, picked.slug);
    var pathSlug = slugFromPath();
    if (pathSlug) return toLocationResult(matchCatalog({ slug: pathSlug }), pathSlug);
    var cartSlug = slugFromCartInput(cart);
    if (cartSlug) return toLocationResult(matchCatalog({ slug: cartSlug }), cartSlug);
    var catalog = catalogLocations();
    if (catalog.length === 1 && catalog[0] && catalog[0].slug) {
      return toLocationResult(catalog[0], catalog[0].slug);
    }
    return toLocationResult(null, '');
  }

  function stampCartLocation(cart, slug) {
    if (!slug) return cart;
    var lines = parseCartInput(cart);
    if (!lines.length) return cart;
    return lines.map(function (line) {
      if (!line || typeof line !== 'object') return line;
      if (line.location_slug) return line;
      var copy = {};
      Object.keys(line).forEach(function (k) {
        copy[k] = line[k];
      });
      copy.location_slug = slug;
      return copy;
    });
  }

  var OrderClient = {
    unwrapValue: unwrapCfgValue,
    catalogLocations: catalogLocations,
    inferLocationSlug: inferLocationSlug,
    resolveLocation: resolveLocation,
    formatMoney: function (currency, total) {
      var cur = unwrapCfgValue(currency);
      if (cur == null) cur = '';
      cur = String(cur).trim();
      var n = Number(total);
      var amt = isFinite(n) ? n.toFixed(2) : '0.00';
      return (cur ? cur + ' ' : '') + amt;
    },
    enabled: function () {
      return cfg().enabled !== false && !!apiBase();
    },
    isSignedIn: function () {
      return !!getToken();
    },
    parseCart: function (order) {
      return parseCartInput(order);
    },
    create: function (payload) {
      payload = payload || {};
      if (payload.client_id) payload.client_id = unwrapCfgValue(payload.client_id) || payload.client_id;
      if (payload.currency) payload.currency = unwrapCfgValue(payload.currency) || payload.currency;
      if (!payload.currency) payload.currency = 'TTD';
      var loc = resolveLocation(payload.cart_json || payload.cart || payload.lines || payload);
      var slug = String(payload.location_slug || loc.slug || '').trim();
      if (!slug) {
        return Promise.reject(new Error('Pick a location before ordering'));
      }
      payload.location_slug = slug;
      if (!payload.store_id && loc.storeId) payload.store_id = loc.storeId;
      if (!(Number(payload.restaurant_lat) > 0) && loc.lat) payload.restaurant_lat = loc.lat;
      if (!(Number(payload.restaurant_lng) > 0) && loc.lng) payload.restaurant_lng = loc.lng;
      var stamped = stampCartLocation(payload.cart_json || payload.cart || payload.lines, slug);
      if (Array.isArray(stamped) && stamped.length) payload.cart_json = stamped;
      return request('POST', '/orders', payload);
    },
    mine: function () {
      return request('GET', '/orders/mine');
    },
    get: function (id) {
      return request('GET', '/orders/' + encodeURIComponent(id));
    },
    listClient: function (opts) {
      opts = opts || {};
      var q = [];
      if (opts.status) q.push('status=' + encodeURIComponent(opts.status));
      if (opts.printStatus) q.push('print_status=' + encodeURIComponent(opts.printStatus));
      if (opts.location) q.push('location=' + encodeURIComponent(opts.location));
      return request('GET', '/client/orders' + (q.length ? '?' + q.join('&') : ''));
    },
    kitchenPending: function (location) {
      var path = '/client/kitchen/pending';
      if (location) path += '?location=' + encodeURIComponent(location);
      return request('GET', path);
    },
    ready: function (id) {
      return request('POST', '/orders/' + encodeURIComponent(id) + '/ready', {});
    },
    charge: function (id) {
      return request('POST', '/orders/' + encodeURIComponent(id) + '/charge', {});
    },
    cancel: function (id, reason) {
      return request('POST', '/orders/' + encodeURIComponent(id) + '/cancel', { reason: reason || '' });
    },
    ackPrint: function (id, status, error) {
      return request('POST', '/orders/' + encodeURIComponent(id) + '/print', {
        status: status,
        error: error || '',
      });
    },
    reprint: function (id) {
      return request('POST', '/orders/' + encodeURIComponent(id) + '/reprint', {});
    },
    resendLoyverse: function (id) {
      return request('POST', '/orders/' + encodeURIComponent(id) + '/loyverse-resend', {});
    },
    requireSignIn: function () {
      if (this.isSignedIn()) return true;
      try {
        sessionStorage.setItem('ttmenus_redirect_after_login', window.location.pathname + window.location.search);
      } catch (_) {}
      window.location.href = '/login/';
      return false;
    },
  };

  global.OrderClient = OrderClient;
})(typeof window !== 'undefined' ? window : this);
