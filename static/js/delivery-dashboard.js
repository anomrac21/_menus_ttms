/**
 * Client dashboard — delivery order inbox, accept, ready, pickup QR scan, live track.
 */
(function () {
  'use strict';

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function el(tag, attrs, html) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    if (html != null) node.innerHTML = html;
    return node;
  }

  async function refresh(listEl) {
    if (!window.DeliveryClient) return;
    listEl.innerHTML = '<p>Loading orders…</p>';
    try {
      var res = await DeliveryClient.listClientOrders();
      var orders = res.orders || [];
      if (!orders.length) {
        listEl.innerHTML = '<p>No delivery orders yet.</p>';
        return;
      }
      listEl.innerHTML = '';
      orders.forEach(function (o) {
        var card = el('article', { class: 'ttms-delivery-order-card', 'data-id': o.id });
        card.innerHTML =
          '<header><strong>' +
          (o.customer_name || o.customer_email || 'Customer') +
          '</strong> · <code>' +
          o.status +
          '</code></header>' +
          '<p>' +
          (o.dropoff_address || '') +
          ' · ' +
          o.total +
          ' ' +
          o.currency +
          '</p>' +
          '<div class="ttms-delivery-order-actions"></div>' +
          '<div class="ttms-delivery-order-track" hidden></div>';
        var actions = $('.ttms-delivery-order-actions', card);
        if (o.status === 'awaiting_client') {
          actions.appendChild(actionBtn('Accept', async function () {
            await DeliveryClient.clientAccept(o.id, true);
            refresh(listEl);
          }));
          actions.appendChild(actionBtn('Reject', async function () {
            await DeliveryClient.clientReject(o.id, 'Declined by restaurant');
            refresh(listEl);
          }));
        }
        if (o.status === 'preparing' || o.status === 'paid') {
          actions.appendChild(actionBtn('Mark ready', async function () {
            await DeliveryClient.markReady(o.id);
            refresh(listEl);
          }));
        }
        if (o.status === 'ready') {
          actions.appendChild(actionBtn('Scan pickup QR', async function () {
            var token = prompt('Scan or paste driver order QR token');
            if (!token) return;
            await DeliveryClient.scanPickup(token.trim());
            refresh(listEl);
          }));
        }
        if (['awaiting_client', 'preparing', 'ready', 'delivering', 'picked_up', 'payment_pending'].indexOf(o.status) >= 0) {
          actions.appendChild(actionBtn('Track driver', function () {
            var track = $('.ttms-delivery-order-track', card);
            track.hidden = false;
            track.textContent = 'Connecting…';
            DeliveryClient.track(o.id).then(function (t) {
              var loc = t.location;
              track.textContent = loc
                ? 'Driver @ ' + loc.lat.toFixed(5) + ', ' + loc.lng.toFixed(5)
                : 'No location yet';
            });
            DeliveryClient.connectTrackWS(o.id, function (msg) {
              if (msg && msg.location) {
                track.textContent = 'Driver @ ' + msg.location.lat.toFixed(5) + ', ' + msg.location.lng.toFixed(5);
              } else if (msg && msg.type === 'driver_location' && msg.location) {
                track.textContent = 'Driver @ ' + msg.location.lat.toFixed(5) + ', ' + msg.location.lng.toFixed(5);
              }
            });
          }));
        }
        listEl.appendChild(card);
      });
    } catch (e) {
      listEl.innerHTML = '<p class="error">' + (e.message || e) + '</p>';
    }
  }

  function actionBtn(label, fn) {
    var b = el('button', { type: 'button', class: 'btn-dash btn-dash-secondary' }, label);
    b.addEventListener('click', function () {
      Promise.resolve(fn()).catch(function (err) {
        alert(err.message || String(err));
      });
    });
    return b;
  }

  document.addEventListener('DOMContentLoaded', function () {
    var root = document.getElementById('ttms-delivery-orders');
    if (!root || !window.DELIVERY_CONFIG || !window.DELIVERY_CONFIG.enabled) return;
    var list = el('div', { id: 'ttms-delivery-orders-list', class: 'ttms-delivery-orders-list' });
    var refreshBtn = el('button', { type: 'button', class: 'btn-dash btn-dash-primary' }, 'Refresh');
    refreshBtn.addEventListener('click', function () { refresh(list); });
    root.appendChild(refreshBtn);
    root.appendChild(list);
    refresh(list);
    setInterval(function () { refresh(list); }, 30000);
  });
})();
