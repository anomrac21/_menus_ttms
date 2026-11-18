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

  var listSig = '';
  var settledExpired = {};

  function ordersSig(orders) {
    return (orders || [])
      .map(function (o) {
        return [o && o.id, o && o.status, o && o.total, o && o.dropoff_address, o && o.customer_name].join('|');
      })
      .join('~');
  }

  function afterPickup(status) {
    return status === 'picked_up' || status === 'delivering';
  }

  function settlePayments(listEl, orders) {
    if (!window.DeliveryClient || typeof DeliveryClient.syncClientPayment !== 'function') return;
    var waiting = (orders || []).filter(function (o) {
      if (!o || !o.id) return false;
      if (o.status === 'payment_pending') return true;
      return o.status === 'expired' && !settledExpired[o.id];
    });
    if (!waiting.length) return;
    waiting.forEach(function (o) {
      if (o.status === 'expired') settledExpired[o.id] = 1;
    });
    var chain = Promise.resolve(false);
    waiting.forEach(function (order) {
      chain = chain.then(function (changed) {
        return DeliveryClient.syncClientPayment(order.id)
          .then(function (updated) {
            return changed || !!(updated && updated.status && updated.status !== order.status);
          })
          .catch(function () {
            if (order.status === 'payment_pending') delete settledExpired[order.id];
            return changed;
          });
      });
    });
    chain.then(function (changed) {
      if (changed) refresh(listEl, true);
    });
  }

  async function refresh(listEl, synced) {
    if (!window.DeliveryClient) return;
    var hasCards = !!listEl.querySelector('.ttms-delivery-order-card, .dashboard-delivery-empty');
    if (!hasCards) listEl.innerHTML = '<p class="dashboard-delivery-empty">Loading orders…</p>';
    try {
      var res = await DeliveryClient.listClientOrders();
      var orders = res.orders || [];
      var sig = ordersSig(orders);
      if (!synced) settlePayments(listEl, orders);
      if (sig === listSig && listEl.querySelector('.ttms-delivery-order-card, .dashboard-delivery-empty')) return;
      listSig = sig;
      if (window.TTMSDeliveryMap && typeof TTMSDeliveryMap.destroy === 'function') {
        listEl.querySelectorAll('.ttms-delivery-order-track[id]').forEach(function (track) {
          TTMSDeliveryMap.destroy(track.id);
        });
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
            showCode('Your restaurant code', res && (res.code || res.token), res && (res.code || res.token));
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
                afterPickup: afterPickup(o.status),
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
        '<video id="ttms-code-scan-video" class="ttms-scan-source" playsinline webkit-playsinline autoplay muted></video>' +
        '<canvas class="ttms-scan-preview" aria-hidden="true"></canvas>' +
        '<div class="ttms-code-scan__finder" aria-hidden="true"></div>' +
        '<div class="ttms-code-scan__bar"><p id="ttms-code-scan-status">Point the camera at the code</p>' +
        '<label class="ttms-code-scan__cam">Camera<select id="ttms-code-scan-camera"></select></label>' +
        '<label class="ttms-code-scan__type">Their code<input id="ttms-code-type" maxlength="8" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="K7M2P4"></label>' +
        '<button type="button" class="btn-dash btn-dash-primary" id="ttms-code-use">Use their code</button>' +
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
        '<p id="ttms-code-show-code" class="ttms-handoff-code"></p>' +
        '<p>This is your code. The driver enters it. You enter theirs.</p>' +
        '<div class="ttms-code-show__frame"><img id="ttms-code-show-img" alt="Pickup code" width="240" height="240"></div>' +
        '<button type="button" class="btn-dash btn-dash-secondary" id="ttms-code-show-close">Hide code</button></div>';
      document.body.appendChild(show);
      document.getElementById('ttms-code-show-close').onclick = function () { show.hidden = true; };
    }
    return scan;
  }

  var codeSession = null;
  var scanTitle = 'Point the camera at the code';

  function stopCodeScan() {
    if (codeSession) {
      codeSession.stop();
      codeSession = null;
    }
    var box = document.getElementById('ttms-code-scan');
    if (box) box.hidden = true;
  }

  function showCode(title, token, code) {
    ensureCodeUI();
    stopCodeScan();
    var box = document.getElementById('ttms-code-show');
    var img = document.getElementById('ttms-code-show-img');
    var heading = document.getElementById('ttms-code-show-title');
    var codeEl = document.getElementById('ttms-code-show-code');
    var shown = String(code || token || '').toUpperCase();
    if (heading) heading.textContent = title || 'Code';
    if (codeEl) codeEl.textContent = shown;
    if (img) img.src = window.TTMSCode && shown ? TTMSCode.draw(shown) : '';
    if (box) box.hidden = false;
  }

  function openCodeScan(title, onToken) {
    ensureCodeUI();
    var box = document.getElementById('ttms-code-scan');
    var video = document.getElementById('ttms-code-scan-video');
    var status = document.getElementById('ttms-code-scan-status');
    var close = document.getElementById('ttms-code-scan-close');
    var select = document.getElementById('ttms-code-scan-camera');
    stopCodeScan();
    scanTitle = title || 'Point the camera at the code';
    if (box.parentNode !== document.body) document.body.appendChild(box);
    box.hidden = false;
    if (status) status.textContent = scanTitle;
    if (close) close.onclick = stopCodeScan;
    if (select && !select.getAttribute('data-bound')) {
      select.setAttribute('data-bound', '1');
      select.addEventListener('change', function () {
        if (!codeSession || select.dataset.filling) return;
        if (status) status.textContent = 'Switching camera…';
        codeSession.open(select.value).then(function (cams) {
          TTMSCode.fillSelect(select, cams, codeSession && codeSession.deviceId());
          if (status) status.textContent = scanTitle;
        }).catch(function () {
          if (status) status.textContent = 'That camera did not open';
        });
      });
    }
    return new Promise(function (resolve) {
      var reading = false;
      function take(token, pendingText) {
        if (reading) return;
        reading = true;
        if (status) status.textContent = pendingText || 'Checking code';
        Promise.resolve(onToken(token))
          .then(function (result) {
            stopCodeScan();
            resolve(result);
          })
          .catch(function (err) {
            reading = false;
            if (status) status.textContent = (err && err.message) || 'That code did not match';
          });
      }
      var use = document.getElementById('ttms-code-use');
      var typed = document.getElementById('ttms-code-type');
      if (typed) typed.value = '';
      function submitTyped() {
        var code = typed && typed.value ? typed.value.trim() : '';
        if (!code) {
          if (status) status.textContent = 'Type their 6 character code';
          return;
        }
        take(code, 'Checking code');
      }
      if (use) use.onclick = submitTyped;
      if (!video || !navigator.mediaDevices || !window.TTMSCode || !TTMSCode.session) {
        if (status) status.textContent = 'Type their 6 character code';
        return;
      }
      codeSession = TTMSCode.session({
        video: video,
        onCode: function (token) { take(token, 'Code read'); },
      });
      codeSession.open('').then(function (cams) {
        TTMSCode.fillSelect(select, cams, codeSession && codeSession.deviceId());
      }).catch(function () {
        if (codeSession) {
          codeSession.stop();
          codeSession = null;
        }
        if (status) status.textContent = 'Camera is off. Type their code.';
      });
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
