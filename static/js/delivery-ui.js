/**
 * Customer delivery checkout + driver offer picker + live track + delivery QR scan.
 * Loaded when params.features.delivery is true.
 */
(function () {
  'use strict';

  function $(id) {
    return document.getElementById(id);
  }

  function deliveryEnabled() {
    return !!(window.DELIVERY_CONFIG && window.DELIVERY_CONFIG.enabled);
  }

  function ensurePanel() {
    var existing = $('ttms-delivery-panel');
    if (existing) return existing;
    var el = document.createElement('div');
    el.id = 'ttms-delivery-panel';
    el.className = 'ttms-delivery-panel';
    el.hidden = true;
    el.innerHTML =
      '<div class="ttms-delivery-panel__backdrop" data-close="1"></div>' +
      '<div class="ttms-delivery-panel__sheet" role="dialog" aria-modal="true" aria-labelledby="ttms-delivery-title">' +
      '<header class="ttms-delivery-panel__header">' +
      '<h2 id="ttms-delivery-title">Delivery</h2>' +
      '<button type="button" class="ttms-delivery-panel__close" data-close="1" aria-label="Close">&times;</button>' +
      '</header>' +
      '<div class="ttms-delivery-panel__body" id="ttms-delivery-body"></div>' +
      '</div>';
    document.body.appendChild(el);
    el.addEventListener('click', function (e) {
      if (e.target && e.target.getAttribute('data-close')) {
        el.hidden = true;
      }
    });
    return el;
  }

  function show(html) {
    var panel = ensurePanel();
    $('ttms-delivery-body').innerHTML = html;
    panel.hidden = false;
  }

  var CONTACT_KEY = 'ttms_delivery_contact';

  function liveCart() {
    if (Array.isArray(window.order) && window.order.length) return window.order;
    if (typeof getCartItems === 'function') {
      try {
        var live = getCartItems();
        if (Array.isArray(live) && live.length) return live;
      } catch (_) {}
    }
    if (Array.isArray(window.cartItems) && window.cartItems.length) return window.cartItems;
    try {
      var raw = localStorage.getItem('cart') || localStorage.getItem('ttms_cart');
      var parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) return parsed;
    } catch (_) {}
    return [];
  }

  function cartSnapshot() {
    return liveCart();
  }

  function lineAmount(it) {
    if (!it || typeof it !== 'object') return 0;
    var cost = Number(it.cost);
    if (isFinite(cost) && cost > 0) return cost;
    var p = Number(it.price || it.itemPrice || 0);
    var q = Number(it.quantity || it.amt || it.qty || 1);
    var n = p * q;
    return isFinite(n) ? n : 0;
  }

  function cartSubtotal() {
    var sum = 0;
    liveCart().forEach(function (it) {
      sum += lineAmount(it);
    });
    return Math.round(sum * 100) / 100;
  }

  function escapeAttr(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  function readLocalContact() {
    try {
      var raw = localStorage.getItem(CONTACT_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  }

  function contactFromAccount() {
    var user = {};
    try {
      if (window.AuthClient && typeof AuthClient.getCurrentUser === 'function') {
        user = AuthClient.getCurrentUser() || {};
      }
    } catch (_) {}
    var prefs = user.preferences || {};
    var local = readLocalContact();
    return {
      name: prefs.delivery_name || user.username || local.delivery_name || '',
      phone: prefs.delivery_phone || local.delivery_phone || '',
      address: prefs.delivery_address || local.delivery_address || '',
      lat: prefs.delivery_lat || local.delivery_lat || '',
      lng: prefs.delivery_lng || local.delivery_lng || '',
    };
  }

  async function saveDeliveryContact(dropoff) {
    var payload = {
      delivery_name: String(dropoff.name || '').trim(),
      delivery_phone: String(dropoff.phone || '').trim(),
      delivery_address: String(dropoff.address || '').trim(),
      delivery_lat: Number(dropoff.lat) || 0,
      delivery_lng: Number(dropoff.lng) || 0,
    };
    try {
      localStorage.setItem(CONTACT_KEY, JSON.stringify(payload));
    } catch (_) {}
    if (!window.AuthClient) return;
    try {
      if (typeof AuthClient.updatePreferences === 'function') {
        await AuthClient.updatePreferences(payload);
      }
    } catch (_) {}
    try {
      var user = typeof AuthClient.getCurrentUser === 'function' ? AuthClient.getCurrentUser() || {} : {};
      if (payload.delivery_name && typeof AuthClient.updateProfile === 'function') {
        if (user.username !== payload.delivery_name) {
          await AuthClient.updateProfile({ username: payload.delivery_name });
        }
      }
    } catch (_) {}
  }

  async function placeDeliveryOrder(dropoff) {
    if (!window.DeliveryClient) throw new Error('Delivery client missing');
    if (!window.AuthClient || !AuthClient.isAuthenticated()) {
      throw new Error('Please sign in to place a delivery order');
    }
    var cfg = window.DELIVERY_CONFIG || {};
    var items = cartSnapshot();
    var subtotal = cartSubtotal();
    if (!items.length || !(subtotal > 0)) {
      throw new Error('Add items to your cart before requesting delivery');
    }
    var order;
    if (window.OrderClient && window.OrderClient.enabled()) {
      var oc = window.ORDER_CONFIG || {};
      var created = await window.OrderClient.create({
        client_id: cfg.clientId || oc.clientId,
        client_domain: cfg.clientDomain,
        restaurant_name: cfg.restaurantName || document.title,
        restaurant_lat: cfg.restaurantLat || 0,
        restaurant_lng: cfg.restaurantLng || 0,
        customer_name: dropoff.name || '',
        customer_phone: dropoff.phone || '',
        fulfillment: 'delivery',
        notes: dropoff.notes || '',
        cart_json: items,
        currency: cfg.currency || 'TTD',
        subtotal: subtotal,
        total: subtotal + (cfg.deliveryFee || 0),
        loyverse_receipt_mode: (oc.loyverseReceiptMode || 'on_payment'),
        kitchen_print: oc.kitchenPrint !== false,
        delivery: {
          address: dropoff.address || '',
          lat: dropoff.lat,
          lng: dropoff.lng,
          fee: cfg.deliveryFee || 0,
        },
      });
      if (created && created.delivery_order_id) {
        order = await DeliveryClient.getOrder(created.delivery_order_id);
      } else {
        throw new Error(created.delivery_error || 'Delivery job did not start');
      }
    } else {
      order = await DeliveryClient.createOrder({
      client_id: cfg.clientId,
      client_domain: cfg.clientDomain,
      restaurant_name: cfg.restaurantName || document.title,
      restaurant_lat: cfg.restaurantLat || 0,
      restaurant_lng: cfg.restaurantLng || 0,
      customer_name: dropoff.name || '',
      customer_phone: dropoff.phone || '',
      dropoff_address: dropoff.address || '',
      dropoff_lat: dropoff.lat,
      dropoff_lng: dropoff.lng,
      cart_json: JSON.stringify(items),
      notes: dropoff.notes || '',
      currency: cfg.currency || 'TTD',
      subtotal: subtotal,
      delivery_fee: cfg.deliveryFee || 0,
    });
    }
    return order;
  }

  async function showDriverOffers(orderId) {
    show(
      '<p class="ttms-delivery-status">Waiting for nearby drivers…</p>' +
        '<ul id="ttms-driver-offers" class="ttms-driver-offers"></ul>' +
        '<p><button type="button" class="btn" id="ttms-refresh-offers">Refresh</button></p>' +
        '<div id="ttms-delivery-track-slot"></div>'
    );
    async function refresh() {
      var res = await DeliveryClient.listOffers(orderId);
      var ul = $('ttms-driver-offers');
      ul.innerHTML = '';
      (res.offers || []).forEach(function (o) {
        var d = o.driver || {};
        var li = document.createElement('li');
        li.innerHTML =
          '<strong>' +
          (d.display_name || d.email || 'Driver #' + o.driver_id) +
          '</strong>' +
          ' · ' +
          (o.distance_m ? (o.distance_m / 1000).toFixed(1) + ' km' : '') +
          ' <button type="button" data-driver="' +
          o.driver_id +
          '">Accept</button>';
        ul.appendChild(li);
      });
      ul.querySelectorAll('button[data-driver]').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          btn.disabled = true;
          try {
            var order = await DeliveryClient.acceptDriver(orderId, Number(btn.getAttribute('data-driver')));
            showOrderStatus(order);
          } catch (err) {
            alert(err.message || String(err));
            btn.disabled = false;
          }
        });
      });
    }
    $('ttms-refresh-offers').onclick = function () {
      refresh().catch(function (e) {
        alert(e.message);
      });
    };
    await refresh();
    DeliveryClient.connectTrackWS(orderId, function (msg) {
      if (msg && msg.type === 'driver_offer') refresh();
      if (msg && msg.type === 'status') {
        DeliveryClient.getOrder(orderId).then(showOrderStatus).catch(function () {});
      }
    });
  }

  function showOrderStatus(order) {
    if (!order) return;
    var pay = '';
    if (order.status === 'payment_pending' && order.payment_url) {
      pay =
        '<p><a class="btn" href="' +
        order.payment_url +
        '" target="_blank" rel="noopener">Pay now (' +
        order.total +
        ' ' +
        order.currency +
        ')</a></p>';
    }
    var scan = '';
    if (order.status === 'delivering' || order.status === 'picked_up') {
      scan =
        '<div class="ttms-delivery-scan">' +
        '<label>Scan driver QR to confirm receipt</label>' +
        '<input type="text" id="ttms-delivery-qr-input" placeholder="Paste or scan QR token" />' +
        '<button type="button" class="btn" id="ttms-confirm-delivery">Confirm received</button>' +
        '</div>';
    }
    show(
      '<p><strong>Status:</strong> ' +
        order.status +
        '</p>' +
        '<p>Order <code>' +
        order.id +
        '</code></p>' +
        pay +
        '<div id="ttms-live-map" class="ttms-live-map" aria-live="polite">Tracking driver…</div>' +
        scan
    );
    if (scan) {
      $('ttms-confirm-delivery').onclick = async function () {
        try {
          var token = $('ttms-delivery-qr-input').value.trim();
          var updated = await DeliveryClient.scanDelivery(token);
          showOrderStatus(updated);
        } catch (e) {
          alert(e.message || String(e));
        }
      };
    }
    startLiveTrack(order.id);
  }

  function startLiveTrack(orderId) {
    var slot = $('ttms-live-map');
    if (!slot) return;
    function render(loc) {
      if (!loc) {
        slot.textContent = 'Waiting for driver location…';
        return;
      }
      slot.textContent = 'Driver at ' + loc.lat.toFixed(5) + ', ' + loc.lng.toFixed(5);
    }
    DeliveryClient.track(orderId)
      .then(function (t) {
        render(t.location);
      })
      .catch(function () {});
    DeliveryClient.connectTrackWS(orderId, function (msg) {
      if (msg && msg.type === 'driver_location') render(msg.location);
      if (msg && msg.type === 'status') {
        DeliveryClient.getOrder(orderId).then(showOrderStatus).catch(function () {});
      }
    });
  }

  async function openCheckoutForm() {
    var saved = contactFromAccount();
    if (window.AuthClient && typeof AuthClient.getProfile === 'function') {
      try {
        var profile = await AuthClient.getProfile();
        if (profile && profile.success) saved = contactFromAccount();
      } catch (_) {}
    }
    show(
      '<form id="ttms-delivery-form" class="ttms-delivery-form">' +
        '<label>Name<input name="name" required value="' +
        escapeAttr(saved.name) +
        '" autocomplete="name" /></label>' +
        '<label>Phone<input name="phone" required value="' +
        escapeAttr(saved.phone) +
        '" autocomplete="tel" /></label>' +
        '<label>Address<input name="address" required value="' +
        escapeAttr(saved.address) +
        '" autocomplete="street-address" /></label>' +
        '<label>Latitude<input name="lat" type="number" step="any" required value="' +
        escapeAttr(saved.lat) +
        '" /></label>' +
        '<label>Longitude<input name="lng" type="number" step="any" required value="' +
        escapeAttr(saved.lng) +
        '" /></label>' +
        '<label>Notes<textarea name="notes"></textarea></label>' +
        '<button type="button" class="btn" id="ttms-use-gps">Use my location</button>' +
        '<button type="submit" class="btn btn-primary">Find drivers</button>' +
        '</form>'
    );
    $('ttms-use-gps').onclick = function () {
      if (!navigator.geolocation) return alert('Geolocation unavailable');
      navigator.geolocation.getCurrentPosition(function (pos) {
        var form = $('ttms-delivery-form');
        form.lat.value = pos.coords.latitude;
        form.lng.value = pos.coords.longitude;
      });
    };
    $('ttms-delivery-form').onsubmit = async function (e) {
      e.preventDefault();
      var form = e.target;
      var dropoff = {
        name: form.name.value,
        phone: form.phone.value,
        address: form.address.value,
        lat: Number(form.lat.value),
        lng: Number(form.lng.value),
        notes: form.notes.value,
      };
      try {
        await saveDeliveryContact(dropoff);
        var order = await placeDeliveryOrder(dropoff);
        await showDriverOffers(order.id);
      } catch (err) {
        alert(err.message || String(err));
      }
    };
  }

  function injectCartButton() {
    return;
  }

  // Deep-link track: ?delivery_order=...
  function bootFromQuery() {
    var params = new URLSearchParams(location.search);
    var oid = params.get('delivery_order') || params.get('order');
    if (!oid || !window.DeliveryClient) return;
    DeliveryClient.getOrder(oid).then(showOrderStatus).catch(function () {});
  }

  document.addEventListener('DOMContentLoaded', function () {
    injectCartButton();
    bootFromQuery();
  });

  window.TTMSDeliveryUI = {
    openCheckout: openCheckoutForm,
    showOrder: showOrderStatus,
    showOffers: showDriverOffers,
  };
})();
