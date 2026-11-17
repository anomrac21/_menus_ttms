/**
 * Client dashboard: delivery order inbox, accept, ready, pickup QR scan, live track.
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

  async function refresh(listEl, synced) {
    if (!window.DeliveryClient) return;
    if (window.TTMSDeliveryMap && typeof TTMSDeliveryMap.destroyAll === 'function') {
      TTMSDeliveryMap.destroyAll();
    }
    listEl.innerHTML = '<p class="dashboard-delivery-empty">Loading orders…</p>';
    try {
      var res = await DeliveryClient.listClientOrders();
      var orders = res.orders || [];
      if (!synced && typeof DeliveryClient.syncClientPayment === 'function') {
        var changed = false;
        var waiting = orders.filter(function (o) {
          return o.status === 'payment_pending' || o.status === 'expired';
        });
        for (var i = 0; i < waiting.length; i++) {
          try {
            var updated = await DeliveryClient.syncClientPayment(waiting[i].id);
            if (updated && updated.status && updated.status !== waiting[i].status) changed = true;
          } catch (err) {}
        }
        if (changed) return refresh(listEl, true);
      }
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
          actions.appendChild(actionBtn('Scan driver code', 'btn-dash btn-dash-primary', function () {
            return openCodeScan('Point the camera at the driver’s pickup code', function (token) {
              return DeliveryClient.scanPickup(token);
            }).then(function () {
              refresh(listEl);
            });
          }));
          actions.appendChild(actionBtn('Show pickup code', 'btn-dash btn-dash-secondary', async function () {
            var res = await DeliveryClient.getClientPickupQR(o.id);
            showCode('Show this to the driver', res && res.token);
          }));
        }
        if (['awaiting_client', 'preparing', 'ready', 'delivering', 'picked_up', 'payment_pending'].indexOf(o.status) >= 0) {
          actions.appendChild(actionBtn('Track driver', 'btn-dash btn-dash-secondary', function () {
            var track = $('.ttms-delivery-order-track', card);
            var mapId = 'ttms-dash-track-' + o.id;
            track.hidden = false;
            track.id = mapId;
            track.classList.add('ttms-delivery-map');
            track.textContent = 'Connecting…';
            function applyLoc(loc) {
              if (!loc) {
                if (!track.querySelector('.maplibregl-map')) {
                  track.textContent = 'No location yet';
                }
                return;
              }
              if (!window.TTMSDeliveryMap) {
                track.textContent = 'Driver @ ' + loc.lat.toFixed(5) + ', ' + loc.lng.toFixed(5);
                return;
              }
              TTMSDeliveryMap.setDriver(mapId, loc.lat, loc.lng, 'Driver');
            }
            if (window.TTMSDeliveryMap) {
              TTMSDeliveryMap.mountTrack({
                containerId: mapId,
                restaurantLat: o.restaurant_lat,
                restaurantLng: o.restaurant_lng,
                restaurantLabel: o.restaurant_name || '',
                dropoffLat: o.dropoff_lat,
                dropoffLng: o.dropoff_lng,
                dropoffLabel: o.dropoff_address || 'Drop-off',
              }).catch(function () {
                track.textContent = 'Map unavailable';
              });
            }
            DeliveryClient.track(o.id).then(function (t) {
              applyLoc(t && t.location);
            });
            DeliveryClient.connectTrackWS(o.id, function (msg) {
              if (msg && msg.location) applyLoc(msg.location);
              else if (msg && msg.type === 'driver_location' && msg.location) applyLoc(msg.location);
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

  function ensureCodeUI() {
    var scan = document.getElementById('ttms-code-scan');
    if (!scan) {
      scan = document.createElement('div');
      scan.id = 'ttms-code-scan';
      scan.className = 'ttms-code-scan';
      scan.hidden = true;
      scan.innerHTML =
        '<video id="ttms-code-scan-video" playsinline autoplay muted></video>' +
        '<div class="ttms-code-scan__bar"><p id="ttms-code-scan-status">Point the camera at the code</p>' +
        '<button type="button" class="btn-dash btn-dash-secondary" id="ttms-code-scan-close">Close camera</button></div>';
      document.body.appendChild(scan);
    }
    var show = document.getElementById('ttms-code-show');
    if (!show) {
      show = document.createElement('div');
      show.id = 'ttms-code-show';
      show.className = 'ttms-code-show';
      show.hidden = true;
      show.innerHTML =
        '<div class="ttms-code-show__card" role="dialog" aria-modal="true">' +
        '<h3 id="ttms-code-show-title">Pickup code</h3>' +
        '<img id="ttms-code-show-img" alt="Pickup code" width="240" height="240">' +
        '<button type="button" class="btn-dash btn-dash-secondary" id="ttms-code-show-close">Hide code</button></div>';
      document.body.appendChild(show);
      document.getElementById('ttms-code-show-close').onclick = function () { show.hidden = true; };
    }
    return scan;
  }

  var codeScanStop = null;
  var codeScanStream = null;

  function stopCodeScan() {
    if (codeScanStop) codeScanStop();
    codeScanStop = null;
    if (codeScanStream) {
      codeScanStream.getTracks().forEach(function (track) { track.stop(); });
      codeScanStream = null;
    }
    var video = document.getElementById('ttms-code-scan-video');
    if (video) video.srcObject = null;
    var box = document.getElementById('ttms-code-scan');
    if (box) box.hidden = true;
  }

  function showCode(title, token) {
    ensureCodeUI();
    stopCodeScan();
    var box = document.getElementById('ttms-code-show');
    var img = document.getElementById('ttms-code-show-img');
    var heading = document.getElementById('ttms-code-show-title');
    if (heading) heading.textContent = title || 'Code';
    if (img) img.src = window.TTMSCode && token ? TTMSCode.draw(token) : '';
    if (box) box.hidden = false;
  }

  function openCodeScan(title, onToken) {
    ensureCodeUI();
    var box = document.getElementById('ttms-code-scan');
    var video = document.getElementById('ttms-code-scan-video');
    var status = document.getElementById('ttms-code-scan-status');
    var close = document.getElementById('ttms-code-scan-close');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.TTMSCode) {
      return Promise.reject(new Error('This browser needs a camera to scan the code.'));
    }
    stopCodeScan();
    box.hidden = false;
    if (status) status.textContent = title || 'Point the camera at the code';
    if (close) close.onclick = stopCodeScan;
    return navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' } },
    }).then(function (stream) {
      codeScanStream = stream;
      video.srcObject = stream;
      var play = video.play();
      if (play && play.catch) play.catch(function () {});
      return new Promise(function (resolve) {
        var reading = false;
        codeScanStop = TTMSCode.watch(video, function (token) {
          if (reading) return;
          reading = true;
          if (status) status.textContent = 'Code read';
          Promise.resolve(onToken(token))
            .then(function (result) {
              stopCodeScan();
              resolve(result);
            })
            .catch(function (err) {
              reading = false;
              if (status) status.textContent = (err && err.message) || 'That code did not match';
            });
        });
      });
    }).catch(function (err) {
      stopCodeScan();
      throw err;
    });
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

  function bindAutoAccept() {
    var box = document.getElementById('ttms-delivery-auto-accept');
    if (!box || box.getAttribute('data-bound') || !window.DeliveryClient) return;
    box.setAttribute('data-bound', '1');
    DeliveryClient.getClientSettings()
      .then(function (st) {
        box.checked = !!(st && st.auto_accept);
      })
      .catch(function () {});
    box.addEventListener('change', function () {
      box.disabled = true;
      DeliveryClient.updateClientSettings(box.checked)
        .catch(function (err) {
          alert((err && err.message) || String(err));
          box.checked = !box.checked;
        })
        .then(function () {
          box.disabled = false;
        });
    });
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
    bindAutoAccept();
    refresh(list);
    if (!root.getAttribute('data-poll')) {
      root.setAttribute('data-poll', '1');
      setInterval(function () { refresh(list); }, 30000);
    }
  }

  global.DeliveryDashboard = { init: init, refresh: refresh };
})(window);
