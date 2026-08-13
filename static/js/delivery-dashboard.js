/**
 * Client dashboard — delivery order inbox, accept, ready, pickup QR scan, live track.
 */
(function (global) {
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

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function statusLabel(status) {
    return String(status || 'unknown').replace(/_/g, ' ');
  }

  async function refresh(listEl) {
    if (!window.DeliveryClient) return;
    listEl.innerHTML = '<p class="dashboard-delivery-empty">Loading orders…</p>';
    try {
      var res = await DeliveryClient.listClientOrders();
      var orders = res.orders || [];
      if (!orders.length) {
        listEl.innerHTML = '<p class="dashboard-delivery-empty">No delivery orders yet.</p>';
        return;
      }
      listEl.innerHTML = '';
      orders.forEach(function (o) {
        var card = el('article', { class: 'ttms-delivery-order-card', 'data-id': o.id });
        var name = escapeHtml(o.customer_name || o.customer_email || 'Customer');
        var status = escapeHtml(o.status || '');
        var address = escapeHtml(o.dropoff_address || '');
        var total = escapeHtml(o.total == null ? '' : o.total);
        var currency = escapeHtml(o.currency || '');
        card.innerHTML =
          '<header class="ttms-delivery-order-card__head">' +
          '<strong>' + name + '</strong>' +
          '<span class="dashboard-delivery-status dashboard-delivery-status--' + status + '">' +
          escapeHtml(statusLabel(o.status)) +
          '</span>' +
          '</header>' +
          '<p class="ttms-delivery-order-card__meta">' +
          (address ? address + ' · ' : '') +
          total +
          (currency ? ' ' + currency : '') +
          '</p>' +
          '<div class="ttms-delivery-order-actions"></div>' +
          '<div class="ttms-delivery-order-track" hidden></div>';
        var actions = $('.ttms-delivery-order-actions', card);
        if (o.status === 'awaiting_client') {
          actions.appendChild(actionBtn('Accept', 'btn-dash btn-dash-primary', async function () {
            await DeliveryClient.clientAccept(o.id, true);
            refresh(listEl);
          }));
          actions.appendChild(actionBtn('Reject', 'btn-dash btn-dash-secondary', async function () {
            await DeliveryClient.clientReject(o.id, 'Declined by restaurant');
            refresh(listEl);
          }));
        }
        if (o.status === 'preparing' || o.status === 'paid') {
          actions.appendChild(actionBtn('Mark ready', 'btn-dash btn-dash-primary', async function () {
            await DeliveryClient.markReady(o.id);
            refresh(listEl);
          }));
        }
        if (o.status === 'ready') {
          actions.appendChild(actionBtn('Scan pickup QR', 'btn-dash btn-dash-primary', async function () {
            var token = prompt('Scan or paste driver order QR token');
            if (!token) return;
            await DeliveryClient.scanPickup(token.trim());
            refresh(listEl);
          }));
        }
        if (['awaiting_client', 'preparing', 'ready', 'delivering', 'picked_up', 'payment_pending'].indexOf(o.status) >= 0) {
          actions.appendChild(actionBtn('Track driver', 'btn-dash btn-dash-secondary', function () {
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
      listEl.innerHTML = '<p class="dashboard-notify-banner dashboard-notify-banner-warn" role="alert">' +
        escapeHtml(e.message || e) +
        '</p>';
    }
  }

  function actionBtn(label, className, fn) {
    var b = el('button', { type: 'button', class: className }, label);
    b.addEventListener('click', function () {
      Promise.resolve(fn()).catch(function (err) {
        alert(err.message || String(err));
      });
    });
    return b;
  }

  function init() {
    var root = document.getElementById('ttms-delivery-orders');
    if (!root || !window.DELIVERY_CONFIG || !window.DELIVERY_CONFIG.enabled) return;
    var list = document.getElementById('ttms-delivery-orders-list') ||
      el('div', { id: 'ttms-delivery-orders-list', class: 'ttms-delivery-orders-list' });
    if (!list.parentNode) root.appendChild(list);
    var refreshBtn = document.getElementById('ttms-delivery-refresh');
    if (refreshBtn && !refreshBtn.getAttribute('data-bound')) {
      refreshBtn.setAttribute('data-bound', '1');
      refreshBtn.addEventListener('click', function () { refresh(list); });
    }
    refresh(list);
    if (!root.getAttribute('data-poll')) {
      root.setAttribute('data-poll', '1');
      setInterval(function () { refresh(list); }, 30000);
    }
  }

  global.DeliveryDashboard = { init: init, refresh: refresh };
})(window);
