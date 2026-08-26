/**
 * TTMenus Delivery API client — platform fleet flow.
 * Expects AuthClient.getAccessToken() and window.DELIVERY_CONFIG.
 */
(function (global) {
  'use strict';

  function unwrapUrl(value, fallback) {
    var s = value == null ? '' : String(value).trim();
    while (
      s.length >= 2 &&
      ((s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') ||
        (s.charAt(0) === "'" && s.charAt(s.length - 1) === "'"))
    ) {
      s = s.slice(1, -1).trim();
    }
    return (s || fallback || '').replace(/\/$/, '');
  }

  function cfg() {
    return global.DELIVERY_CONFIG || {};
  }

  function apiBase() {
    return unwrapUrl(cfg().apiUrl, 'https://delivery.ttmenus.com/api/v1');
  }

  function wsBase() {
    var u = unwrapUrl(cfg().wsUrl, '');
    if (u) return u;
    var http = apiBase().replace(/\/api\/v1$/, '');
    return http.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:') + '/api/v1';
  }

  function getToken() {
    if (global.AuthClient && global.AuthClient.getAccessToken) {
      return global.AuthClient.getAccessToken();
    }
    try {
      return localStorage.getItem('ttmenus_access_token');
    } catch (e) {
      return null;
    }
  }

  function unwrapCfgValue(value) {
    var s = String(value == null ? '' : value).trim();
    while (
      s.length >= 2 &&
      ((s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') ||
        (s.charAt(0) === "'" && s.charAt(s.length - 1) === "'"))
    ) {
      try {
        s = JSON.parse(s);
      } catch (e) {
        s = s.slice(1, -1);
      }
      if (typeof s !== 'string') return String(s);
      s = s.trim();
    }
    return s;
  }

  function siteClientId() {
    return unwrapCfgValue(
      cfg().clientId ||
        global.SITE_CLIENT_ID ||
        global.CLIENT_ID ||
        (global.ORDER_CONFIG && global.ORDER_CONFIG.clientId) ||
        ''
    );
  }

  function withClientId(path) {
    var cid = siteClientId();
    if (!cid || String(path).indexOf('client_id=') !== -1) return path;
    return path + (String(path).indexOf('?') >= 0 ? '&' : '?') + 'client_id=' + encodeURIComponent(cid);
  }

  async function ensureToken() {
    var token = getToken();
    if (token) return token;
    if (global.AuthClient && typeof global.AuthClient.ensureAccessToken === 'function') {
      try {
        await global.AuthClient.ensureAccessToken();
      } catch (e) {
        /* fall through */
      }
    }
    return getToken();
  }

  async function request(method, path, body) {
    var token = await ensureToken();
    if (!token) {
      throw new Error('Sign in required for delivery');
    }
    var opts = {
      method: method,
      credentials: 'omit',
      mode: 'cors',
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/json',
      },
    };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    var url = apiBase() + withClientId(path);
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
    } catch (e) {
      data = null;
    }
    if (!res.ok) {
      var msg = (data && (data.error || data.message)) || res.statusText || 'Request failed';
      throw new Error(msg);
    }
    return data;
  }

  var DeliveryClient = {
    enabled: function () {
      // DELIVERY_CONFIG is only emitted when features.delivery AND deliveryService.enabled.
      return !!cfg().enabled;
    },
    applyDriver: function (payload) {
      return request('POST', '/drivers/apply', payload || {});
    },
    getDriverProfile: function () {
      return request('GET', '/drivers/me');
    },
    setOnline: function (online, lat, lng, heading) {
      return request('POST', '/drivers/online', {
        online: !!online,
        lat: lat || 0,
        lng: lng || 0,
        heading: heading || 0,
      });
    },
    postLocation: function (lat, lng, heading, orderId) {
      return request('POST', '/drivers/location', {
        lat: lat,
        lng: lng,
        heading: heading || 0,
        order_id: orderId || '',
      });
    },
    listDriverOffers: function () {
      return request('GET', '/drivers/offers');
    },
    listDriverJobs: function () {
      return request('GET', '/drivers/jobs');
    },
    requestJob: function (orderId) {
      return request('POST', '/orders/' + encodeURIComponent(orderId) + '/request', {});
    },
    createOrder: function (payload) {
      return request('POST', '/orders', payload);
    },
    getOrder: function (orderId) {
      return request('GET', '/orders/' + encodeURIComponent(orderId));
    },
    listMyOrders: function () {
      return request('GET', '/orders/mine');
    },
    listOffers: function (orderId) {
      return request('GET', '/orders/' + encodeURIComponent(orderId) + '/offers');
    },
    acceptDriver: function (orderId, driverId) {
      return request('POST', '/orders/' + encodeURIComponent(orderId) + '/accept-driver', {
        driver_id: driverId,
      });
    },
    listClientOrders: function (status) {
      var q = status ? '?status=' + encodeURIComponent(status) : '';
      return request('GET', '/client/orders' + q);
    },
    clientAccept: function (orderId, accept, reason) {
      return request('POST', '/orders/' + encodeURIComponent(orderId) + '/client-accept', {
        accept: accept !== false,
        reason: reason || '',
      });
    },
    clientReject: function (orderId, reason) {
      return request('POST', '/orders/' + encodeURIComponent(orderId) + '/client-reject', {
        reason: reason || '',
      });
    },
    markReady: function (orderId) {
      return request('POST', '/orders/' + encodeURIComponent(orderId) + '/ready', {});
    },
    scanPickup: function (token) {
      return request('POST', '/orders/scan-pickup', { token: token });
    },
    scanDelivery: function (token) {
      return request('POST', '/orders/scan-delivery', { token: token });
    },
    getPickupQR: function (orderId) {
      return request('GET', '/orders/' + encodeURIComponent(orderId) + '/pickup-qr');
    },
    getDeliveryQR: function (orderId) {
      return request('GET', '/orders/' + encodeURIComponent(orderId) + '/delivery-qr');
    },
    track: function (orderId) {
      return request('GET', '/orders/' + encodeURIComponent(orderId) + '/track');
    },
    connectTrackWS: function (orderId, onMessage) {
      var url = wsBase() + '/orders/' + encodeURIComponent(orderId) + '/ws';
      var ws = new WebSocket(url);
      ws.onmessage = function (ev) {
        try {
          onMessage(JSON.parse(ev.data));
        } catch (e) {
          onMessage(ev.data);
        }
      };
      return ws;
    },
  };

  global.DeliveryClient = DeliveryClient;
})(typeof window !== 'undefined' ? window : this);
