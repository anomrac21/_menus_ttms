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

  function cartSnapshot() {
    try {
      if (typeof getCartItems === 'function') return getCartItems();
      if (window.cartItems) return window.cartItems;
      var raw = localStorage.getItem('cart') || localStorage.getItem('ttms_cart');
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function cartSubtotal() {
    if (typeof totalPrice === 'number') return totalPrice;
    if (typeof calculateTotal === 'function') return Number(calculateTotal()) || 0;
    var items = cartSnapshot();
    var sum = 0;
    (items || []).forEach(function (it) {
      var p = Number(it.price || it.itemPrice || 0);
      var q = Number(it.quantity || it.qty || 1);
      sum += p * q;
    });
    return Math.round(sum * 100) / 100;
  }

  async function placeDeliveryOrder(dropoff) {
    if (!window.DeliveryClient) throw new Error('Delivery client missing');
    if (!window.AuthClient || !AuthClient.isAuthenticated()) {
      throw new Error('Please sign in to place a delivery order');
    }
    var cfg = window.DELIVERY_CONFIG || {};
    var order = await DeliveryClient.createOrder({
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
      cart_json: JSON.stringify(cartSnapshot()),
      notes: dropoff.notes || '',
      currency: cfg.currency || 'TTD',
      subtotal: cartSubtotal(),
      delivery_fee: cfg.deliveryFee || 0,
    });
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

  function openCheckoutForm() {
    show(
      '<form id="ttms-delivery-form" class="ttms-delivery-form">' +
        '<label>Name<input name="name" required /></label>' +
        '<label>Phone<input name="phone" required /></label>' +
        '<label>Address<input name="address" required /></label>' +
        '<label>Latitude<input name="lat" type="number" step="any" required /></label>' +
        '<label>Longitude<input name="lng" type="number" step="any" required /></label>' +
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
      try {
        var order = await placeDeliveryOrder({
          name: form.name.value,
          phone: form.phone.value,
          address: form.address.value,
          lat: Number(form.lat.value),
          lng: Number(form.lng.value),
          notes: form.notes.value,
        });
        await showDriverOffers(order.id);
      } catch (err) {
        alert(err.message || String(err));
      }
    };
  }

  function injectCartButton() {
    if (!deliveryEnabled()) return;
    var cart = document.querySelector('.cart, #cart, .order-modal, #orderModal');
    var host = document.querySelector('.cart-actions, .order-actions, #confirmOrder, .confirm-order') || cart;
    if (!host || document.getElementById('ttms-delivery-checkout-btn')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'ttms-delivery-checkout-btn';
    btn.className = 'btn btn-primary ttms-delivery-checkout-btn';
    btn.textContent = 'Deliver with TTMenus';
    btn.addEventListener('click', function () {
      openCheckoutForm();
    });
    host.appendChild(btn);
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
