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

  var closeTimer = null;
  var bodyFreshTimer = null;

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function setPanelCopy(title, sub) {
    ensurePanel();
    var h = $('ttms-delivery-title');
    var s = $('ttms-delivery-sub');
    if (h) h.textContent = title || 'Deliver with TTMenus';
    if (s) s.textContent = sub || '';
  }

  function tearDownMaps() {
    if (window.TTMSDeliveryMap && typeof TTMSDeliveryMap.destroyAll === 'function') {
      TTMSDeliveryMap.destroyAll();
    }
  }

  function restaurantFromContext() {
    var loc = window.currentOrderLocation || {};
    var cfg = window.DELIVERY_CONFIG || {};
    var point =
      window.TTMSDeliveryMap && typeof TTMSDeliveryMap.restaurantPoint === 'function'
        ? TTMSDeliveryMap.restaurantPoint()
        : null;
    return {
      name: loc.address || cfg.restaurantName || document.title,
      lat: point ? point.lat : Number(cfg.restaurantLat) || 0,
      lng: point ? point.lng : Number(cfg.restaurantLng) || 0,
    };
  }

  function closePanel() {
    var panel = $('ttms-delivery-panel');
    if (!panel || panel.hidden) return;
    tearDownMaps();
    if (closeTimer) {
      window.clearTimeout(closeTimer);
      closeTimer = null;
    }
    panel.classList.remove('is-opening', 'is-map-step', 'is-checkout');
    document.body.classList.remove('ttms-delivery-open');
    if (prefersReducedMotion()) {
      panel.hidden = true;
      panel.classList.remove('is-open', 'is-closing');
      return;
    }
    panel.classList.add('is-closing');
    closeTimer = window.setTimeout(function () {
      panel.hidden = true;
      panel.classList.remove('is-closing', 'is-open');
      closeTimer = null;
    }, 300);
  }

  function openPanel() {
    var panel = ensurePanel();
    if (closeTimer) {
      window.clearTimeout(closeTimer);
      closeTimer = null;
    }
    var alreadyOpen = !panel.hidden && panel.classList.contains('is-open') && !panel.classList.contains('is-closing');
    panel.classList.remove('is-closing');
    panel.hidden = false;
    panel.classList.add('is-open');
    document.body.classList.add('ttms-delivery-open');
    if (alreadyOpen || prefersReducedMotion()) return;
    panel.classList.remove('is-opening');
    void panel.offsetWidth;
    panel.classList.add('is-opening');
    window.setTimeout(function () {
      panel.classList.remove('is-opening');
    }, 520);
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
      '<div class="ttms-delivery-panel__brand">' +
      '<span class="ttms-delivery-panel__logo-wrap" aria-hidden="true">' +
      '<img class="ttms-delivery-panel__logo" src="/branding/favicon192.webp" alt="" width="32" height="32">' +
      '</span>' +
      '<div>' +
      '<h2 id="ttms-delivery-title">Deliver with TTMenus</h2>' +
      '<p class="ttms-delivery-panel__sub" id="ttms-delivery-sub">Drop-off for nearby drivers</p>' +
      '</div></div>' +
      '<button type="button" class="ttms-delivery-panel__close" data-close="1" aria-label="Close">' +
      '<i class="fa fa-times" aria-hidden="true"></i></button>' +
      '</header>' +
      '<div class="ttms-delivery-panel__body" id="ttms-delivery-body"></div>' +
      '</div>';
    document.body.appendChild(el);
    el.addEventListener('click', function (e) {
      if (e.target && e.target.closest('[data-close]')) {
        closePanel();
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && el.classList.contains('is-open') && !el.hidden) {
        closePanel();
      }
    });
    return el;
  }

  function setCheckout(on) {
    var panel = $('ttms-delivery-panel');
    if (panel) panel.classList.toggle('is-checkout', !!on);
  }

  function setMapStep(on) {
    var panel = $('ttms-delivery-panel');
    if (panel) panel.classList.toggle('is-map-step', !!on);
  }

  function show(html) {
    tearDownMaps();
    var panel = ensurePanel();
    panel.classList.remove('is-map-step', 'is-checkout');
    var body = $('ttms-delivery-body');
    if (bodyFreshTimer) {
      window.clearTimeout(bodyFreshTimer);
      bodyFreshTimer = null;
    }
    body.classList.remove('is-fresh');
    body.innerHTML = html;
    openPanel();
    void body.offsetWidth;
    body.classList.add('is-fresh');
    bodyFreshTimer = window.setTimeout(function () {
      body.classList.remove('is-fresh');
      bodyFreshTimer = null;
    }, 700);
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

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function statusLabel(status) {
    var map = {
      requested: 'Finding drivers',
      offered: 'Drivers available',
      awaiting_drivers: 'Finding drivers',
      driver_offers: 'Drivers available',
      driver_selected: 'Driver selected',
      accepted: 'Driver accepted',
      awaiting_client: 'Restaurant reviewing',
      payment_pending: 'Payment needed',
      paid: 'Paid',
      preparing: 'Kitchen preparing',
      ready: 'Ready for pickup',
      picked_up: 'Picked up',
      delivering: 'On the way',
      delivered: 'Delivered',
      completed: 'Completed',
      cancelled: 'Cancelled',
      expired: 'Expired',
    };
    var key = String(status || '');
    return map[key] || key.replace(/_/g, ' ') || 'Updating';
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

  function isUnreachable(err) {
    var msg = err && err.message ? String(err.message) : String(err || '');
    return /Failed to fetch|Cannot reach|NetworkError|Load failed|ERR_NAME_NOT_RESOLVED/i.test(msg);
  }

  async function createFleetOrder(dropoff, items, subtotal, cfg) {
    var shop = restaurantFromContext();
    return DeliveryClient.createOrder({
      client_id: cfg.clientId,
      client_domain: cfg.clientDomain,
      restaurant_name: shop.name,
      restaurant_lat: shop.lat,
      restaurant_lng: shop.lng,
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

  async function placeDeliveryOrder(dropoff) {
    if (!window.DeliveryClient) throw new Error('Delivery client missing');
    if (window.AuthClient && typeof AuthClient.ensureAccessToken === 'function') {
      try {
        await AuthClient.ensureAccessToken();
      } catch (_) {}
    }
    if (!window.AuthClient || !AuthClient.isAuthenticated()) {
      throw new Error('Please sign in to place a delivery order');
    }
    var cfg = window.DELIVERY_CONFIG || {};
    var items = cartSnapshot();
    var subtotal = cartSubtotal();
    if (!items.length || !(subtotal > 0)) {
      throw new Error('Add items to your cart before requesting delivery');
    }
    if (window.OrderClient && window.OrderClient.enabled()) {
      var oc = window.ORDER_CONFIG || {};
      var shop = restaurantFromContext();
      try {
        var created = await window.OrderClient.create({
          client_id: cfg.clientId || oc.clientId,
          client_domain: cfg.clientDomain,
          restaurant_name: shop.name,
          restaurant_lat: shop.lat,
          restaurant_lng: shop.lng,
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
          return DeliveryClient.getOrder(created.delivery_order_id);
        }
        throw new Error(created.delivery_error || 'Delivery job did not start');
      } catch (err) {
        if (!isUnreachable(err)) throw err;
      }
    }
    return createFleetOrder(dropoff, items, subtotal, cfg);
  }

  async function showDriverOffers(orderId) {
    setPanelCopy('Nearby drivers', 'Choose a driver to start your delivery');
    show(
      '<div class="ttms-delivery-status">' +
        '<span class="ttms-delivery-status__pulse" aria-hidden="true"></span>' +
        '<div><strong>Listening for nearby drivers</strong>' +
        '<p>Offers appear as drivers accept the request.</p></div></div>' +
        '<ul id="ttms-driver-offers" class="ttms-driver-offers"></ul>' +
        '<div class="ttms-delivery-actions">' +
        '<button type="button" class="ttms-delivery-cta ttms-delivery-cta--ghost" id="ttms-refresh-offers">' +
        '<i class="fa fa-refresh" aria-hidden="true"></i> Refresh</button></div>' +
        '<div id="ttms-offers-map" class="ttms-delivery-map" aria-label="Drop-off map"></div>' +
        '<div id="ttms-delivery-track-slot"></div>'
    );
    var lastOffers = [];
    function plotOffers() {
      if (window.TTMSDeliveryMap && typeof TTMSDeliveryMap.setOfferMarkers === 'function') {
        TTMSDeliveryMap.setOfferMarkers('ttms-offers-map', lastOffers);
      }
    }
    if (window.DeliveryClient && window.TTMSDeliveryMap) {
      DeliveryClient.getOrder(orderId)
        .then(function (order) {
          if (!order || !$('ttms-offers-map')) return;
          return TTMSDeliveryMap.mountTrack({
            containerId: 'ttms-offers-map',
            restaurantLat: order.restaurant_lat,
            restaurantLng: order.restaurant_lng,
            restaurantLabel: order.restaurant_name || restaurantFromContext().name,
            dropoffLat: order.dropoff_lat,
            dropoffLng: order.dropoff_lng,
            dropoffLabel: order.dropoff_address || 'Drop-off',
          });
        })
        .then(function () {
          plotOffers();
        })
        .catch(function () {});
    }
    async function refresh() {
      var res = await DeliveryClient.listOffers(orderId);
      lastOffers = res.offers || [];
      var ul = $('ttms-driver-offers');
      ul.innerHTML = '';
      (res.offers || []).forEach(function (o) {
        var d = o.driver || {};
        var name = d.display_name || d.email || 'Driver #' + o.driver_id;
        var dist = o.distance_m ? (o.distance_m / 1000).toFixed(1) + ' km away' : 'Nearby';
        var li = document.createElement('li');
        li.innerHTML =
          '<div class="ttms-driver-offer__copy"><strong>' +
          escapeHtml(name) +
          '</strong><div class="ttms-driver-offer__meta">' +
          escapeHtml(dist) +
          '</div></div>' +
          '<button type="button" data-driver="' +
          o.driver_id +
          '">Accept</button>';
        ul.appendChild(li);
      });
      plotOffers();
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
    setPanelCopy(statusLabel(order.status), 'Order ' + order.id);
    var pay = '';
    if (order.status === 'payment_pending' && order.payment_url) {
      pay =
        '<div class="ttms-delivery-actions"><a class="ttms-delivery-cta ttms-delivery-cta--primary" href="' +
        escapeAttr(order.payment_url) +
        '" target="_blank" rel="noopener">Pay now · ' +
        escapeHtml(order.total) +
        ' ' +
        escapeHtml(order.currency) +
        '</a></div>';
    }
    var scan = '';
    if (order.status === 'delivering' || order.status === 'picked_up') {
      scan =
        '<div class="ttms-delivery-scan">' +
        '<label for="ttms-delivery-qr-input">Scan driver QR to confirm receipt</label>' +
        '<input type="text" id="ttms-delivery-qr-input" placeholder="Paste or scan QR token" autocomplete="off" />' +
        '<button type="button" class="ttms-delivery-cta ttms-delivery-cta--primary" id="ttms-confirm-delivery">Confirm received</button>' +
        '</div>';
    }
    show(
      '<div class="ttms-delivery-status ttms-delivery-status-card">' +
        '<span class="ttms-delivery-status__pulse" aria-hidden="true"></span>' +
        '<div><strong>' +
        escapeHtml(statusLabel(order.status)) +
        '</strong><p>Order <code>' +
        escapeHtml(order.id) +
        '</code></p></div></div>' +
        pay +
        '<div id="ttms-live-map" class="ttms-live-map ttms-delivery-map" aria-live="polite">Waiting for driver location…</div>' +
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
    startLiveTrack(order);
  }

  function startLiveTrack(order) {
    var orderId = order && order.id;
    var slot = $('ttms-live-map');
    if (!slot || !orderId) return;

    function applyLocation(loc) {
      if (!loc || !window.TTMSDeliveryMap) return;
      TTMSDeliveryMap.setDriver('ttms-live-map', loc.lat, loc.lng, 'Driver');
    }

    if (window.TTMSDeliveryMap) {
      TTMSDeliveryMap.mountTrack({
        containerId: 'ttms-live-map',
        restaurantLat: order.restaurant_lat,
        restaurantLng: order.restaurant_lng,
        restaurantLabel: order.restaurant_name || restaurantFromContext().name,
        dropoffLat: order.dropoff_lat,
        dropoffLng: order.dropoff_lng,
        dropoffLabel: order.dropoff_address || 'Drop-off',
      }).catch(function () {
        slot.textContent = 'Waiting for driver location…';
      });
    }

    DeliveryClient.track(orderId)
      .then(function (t) {
        applyLocation(t && t.location);
      })
      .catch(function () {});
    DeliveryClient.connectTrackWS(orderId, function (msg) {
      if (msg && msg.type === 'driver_location') applyLocation(msg.location);
      else if (msg && msg.location) applyLocation(msg.location);
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
    setPanelCopy('Deliver with TTMenus', 'Where should we send this order?');
    show(
      '<form id="ttms-delivery-form" class="ttms-delivery-form" data-step="1">' +
        '<ol class="ttms-delivery-stepper" aria-label="Delivery steps">' +
        '<li class="is-active" data-step-dot="1">Details</li>' +
        '<li data-step-dot="2">Drop-off pin</li></ol>' +
        '<div class="ttms-delivery-step" data-step-panel="1">' +
        '<p class="ttms-delivery-lede">Share a drop-off so nearby drivers can bid. Your pin is only used for this delivery.</p>' +
        '<div class="ttms-delivery-grid">' +
        '<label class="ttms-delivery-field"><span>Name</span>' +
        '<input name="name" required value="' +
        escapeAttr(saved.name) +
        '" autocomplete="name" /></label>' +
        '<label class="ttms-delivery-field"><span>Phone</span>' +
        '<input name="phone" required value="' +
        escapeAttr(saved.phone) +
        '" autocomplete="tel" inputmode="tel" /></label>' +
        '<label class="ttms-delivery-field ttms-delivery-field--wide"><span>Address</span>' +
        '<input name="address" required value="' +
        escapeAttr(saved.address) +
        '" autocomplete="street-address" /></label>' +
        '<label class="ttms-delivery-field ttms-delivery-field--wide"><span>Notes for the driver</span>' +
        '<textarea name="notes" placeholder="Gate code, landmark, or floor"></textarea></label>' +
        '</div>' +
        '<div class="ttms-delivery-actions">' +
        '<button type="button" class="ttms-delivery-cta ttms-delivery-cta--primary" id="ttms-delivery-next">' +
        'Next · pin drop-off</button></div></div>' +
        '<div class="ttms-delivery-step ttms-delivery-step--map" data-step-panel="2" hidden>' +
        '<div class="ttms-delivery-map-stage">' +
        '<div class="ttms-delivery-pin">' +
        '<div id="ttms-delivery-pin-map" class="ttms-delivery-map" role="application" aria-label="Drop-off map"></div>' +
        '<p class="ttms-delivery-pin__hint" id="ttms-delivery-pin-hint">Tap the map to set drop-off</p>' +
        '<input name="lat" type="hidden" value="' +
        escapeAttr(saved.lat) +
        '">' +
        '<input name="lng" type="hidden" value="' +
        escapeAttr(saved.lng) +
        '"></div>' +
        '<div class="ttms-delivery-map-dock">' +
        '<div class="ttms-delivery-pin__head"><strong>Drop-off pin</strong>' +
        '<button type="button" class="ttms-delivery-pin__locate" id="ttms-locate-address">Find address</button></div>' +
        '<div class="ttms-delivery-actions">' +
        '<button type="button" class="ttms-delivery-cta ttms-delivery-cta--ghost" id="ttms-delivery-back">Back</button>' +
        '<button type="submit" class="ttms-delivery-cta ttms-delivery-cta--primary" id="ttms-find-drivers">' +
        'Find drivers</button></div></div></div></div>' +
        '</form>'
    );
    setCheckout(true);
    var form = $('ttms-delivery-form');
    var locateBtn = $('ttms-locate-address');
    var nextBtn = $('ttms-delivery-next');
    var backBtn = $('ttms-delivery-back');
    var mapReady = false;

    function applyPin(lat, lng, fillAddress) {
      if (!form) return;
      form.lat.value = lat;
      form.lng.value = lng;
      if (window.TTMSDeliveryMap) {
        TTMSDeliveryMap.movePicker('ttms-delivery-pin-map', lat, lng);
      }
      if (
        fillAddress &&
        form.address &&
        !String(form.address.value || '').trim() &&
        window.TTMSDeliveryMap
      ) {
        TTMSDeliveryMap.reverseGeocode(lat, lng)
          .then(function (label) {
            if (label && form.address && !String(form.address.value || '').trim()) {
              form.address.value = label;
            }
          })
          .catch(function () {});
      }
    }

    function goToStep(step) {
      var next = Number(step) === 2 ? 2 : 1;
      form.setAttribute('data-step', String(next));
      form.querySelectorAll('[data-step-panel]').forEach(function (panel) {
        panel.hidden = Number(panel.getAttribute('data-step-panel')) !== next;
      });
      form.querySelectorAll('[data-step-dot]').forEach(function (dot) {
        var active = Number(dot.getAttribute('data-step-dot')) === next;
        dot.classList.toggle('is-active', active);
        dot.classList.toggle('is-done', Number(dot.getAttribute('data-step-dot')) < next);
      });
      setMapStep(next === 2);
      if (next === 2) {
        setPanelCopy('Drop-off pin', 'Confirm where drivers should deliver');
        ensureMap();
        window.requestAnimationFrame(function () {
          if (window.TTMSDeliveryMap && typeof TTMSDeliveryMap.resize === 'function') {
            TTMSDeliveryMap.resize('ttms-delivery-pin-map');
          }
        });
      } else {
        setPanelCopy('Deliver with TTMenus', 'Where should we send this order?');
      }
    }

    function ensureMap() {
      if (!window.TTMSDeliveryMap || typeof TTMSDeliveryMap.mountPicker !== 'function') {
        var hint = $('ttms-delivery-pin-hint');
        if (hint) hint.textContent = 'Loading map…';
        window.setTimeout(ensureMap, 200);
        return;
      }
      var boot = mapReady
        ? Promise.resolve()
        : TTMSDeliveryMap.mountPicker({
            containerId: 'ttms-delivery-pin-map',
            form: form,
            hintEl: $('ttms-delivery-pin-hint'),
            lat: saved.lat,
            lng: saved.lng,
          })
            .then(function () {
              mapReady = true;
            })
            .catch(function (err) {
              console.error('Delivery map failed to mount', err);
              var hint = $('ttms-delivery-pin-hint');
              var webgl = err && /webgl|BindToCurrentSequence/i.test(String(err.message || err));
              if (hint) {
                hint.textContent = webgl
                  ? 'Map graphics blocked — turn off Chrome device toolbar, then reload.'
                  : 'Map unavailable — tap the map or go back to edit the address.';
              }
            });
      boot.then(function () {
        if (window.TTMSDeliveryMap && TTMSDeliveryMap.movePicker) {
          var havePin =
            typeof TTMSDeliveryMap.validPoint === 'function' &&
            TTMSDeliveryMap.validPoint(form.lat.value, form.lng.value);
          if (!havePin && form.address && String(form.address.value || '').trim()) {
            locateBtn.click();
          }
        }
      });
    }

    if (nextBtn) {
      nextBtn.onclick = function () {
        if (!form.name.value.trim() || !form.phone.value.trim() || !form.address.value.trim()) {
          if (typeof form.reportValidity === 'function') form.reportValidity();
          else alert('Add your name, phone, and address first');
          return;
        }
        goToStep(2);
      };
    }
    if (backBtn) {
      backBtn.onclick = function () {
        goToStep(1);
      };
    }

    if (locateBtn) {
      locateBtn.onclick = function () {
        var query = form && form.address ? form.address.value : '';
        if (!String(query || '').trim()) {
          alert('Enter an address first');
          return;
        }
        if (!window.TTMSDeliveryMap) return;
        locateBtn.disabled = true;
        locateBtn.textContent = 'Finding…';
        TTMSDeliveryMap.geocodeAddress(query)
          .then(function (pt) {
            locateBtn.disabled = false;
            locateBtn.textContent = 'Find address';
            if (!pt) {
              alert('Could not find that address on the map');
              return;
            }
            applyPin(pt.lat, pt.lng, false);
          })
          .catch(function () {
            locateBtn.disabled = false;
            locateBtn.textContent = 'Find address';
            alert('Could not find that address on the map');
          });
      };
    }

    form.onsubmit = async function (e) {
      e.preventDefault();
      if (form.getAttribute('data-step') !== '2') {
        if (nextBtn) nextBtn.click();
        return;
      }
      var submitBtn = $('ttms-find-drivers');
      var pin =
        window.TTMSDeliveryMap && typeof TTMSDeliveryMap.validPoint === 'function'
          ? TTMSDeliveryMap.validPoint(form.lat.value, form.lng.value)
          : null;
      if (!pin) {
        var lat = Number(form.lat.value);
        var lng = Number(form.lng.value);
        if (isFinite(lat) && isFinite(lng) && !(lat === 0 && lng === 0)) {
          pin = { lat: lat, lng: lng };
        }
      }
      if (!pin) {
        alert('Drop a pin on the map so drivers can see the distance');
        return;
      }
      var dropoff = {
        name: form.name.value,
        phone: form.phone.value,
        address: form.address.value,
        lat: pin.lat,
        lng: pin.lng,
        notes: form.notes.value,
      };
      if (submitBtn) submitBtn.classList.add('is-busy');
      try {
        await saveDeliveryContact(dropoff);
        var order = await placeDeliveryOrder(dropoff);
        await showDriverOffers(order.id);
      } catch (err) {
        if (submitBtn) submitBtn.classList.remove('is-busy');
        alert(err.message || String(err));
      }
    };
    var nameInput = document.querySelector('#ttms-delivery-form input[name="name"]');
    if (nameInput && nameInput.focus) {
      window.setTimeout(function () {
        nameInput.focus();
      }, 280);
    }
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
