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

  var OrderClient = {
    unwrapValue: unwrapCfgValue,
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
      var raw = order && (order.cart_json || order.cartJson || order.cart || order.lines);
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
    },
    create: function (payload) {
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
