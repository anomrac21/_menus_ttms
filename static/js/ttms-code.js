/**
 * Draw an order code and read one from the phone camera.
 * Requires vendor/qrcode.js and vendor/jsQR.js.
 */
(function (global) {
  'use strict';

  function draw(text) {
    if (typeof global.qrcode !== 'function' || !text) return '';
    var qr = global.qrcode(0, 'M');
    qr.addData(String(text));
    qr.make();
    return qr.createDataURL(8, 32);
  }

  function cameras() {
    if (!global.navigator.mediaDevices || !global.navigator.mediaDevices.enumerateDevices) {
      return Promise.resolve([]);
    }
    return global.navigator.mediaDevices.enumerateDevices().then(function (devices) {
      var list = [];
      devices.forEach(function (device) {
        if (device.kind !== 'videoinput') return;
        list.push({
          id: device.deviceId,
          label: device.label || ('Camera ' + (list.length + 1)),
        });
      });
      return list;
    }).catch(function () { return []; });
  }

  function scoreCamera(cam) {
    var label = String((cam && cam.label) || '').toLowerCase();
    var score = 0;
    if (/front|user|face|facetime|truedepth/.test(label)) score -= 80;
    if (/tele|zoom|ultra|depth|lidar/.test(label)) score -= 40;
    if (/back|rear|environment/.test(label)) score += 30;
    if (/wide/.test(label) && !/ultra/.test(label)) score += 25;
    if (label === 'back camera') score += 50;
    return score;
  }

  function preferredId(list) {
    if (!list || !list.length) return '';
    var best = list[0];
    var bestScore = scoreCamera(best);
    list.forEach(function (cam) {
      var score = scoreCamera(cam);
      if (score > bestScore) {
        best = cam;
        bestScore = score;
      }
    });
    return best.id || '';
  }

  function isiOS() {
    var nav = global.navigator || {};
    var ua = nav.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  }

  function capture(deviceId) {
    var video = {};
    if (deviceId) video.deviceId = { exact: deviceId };
    else video.facingMode = isiOS() ? 'environment' : { ideal: 'environment' };
    if (!isiOS()) {
      video.width = { ideal: 1280 };
      video.height = { ideal: 720 };
    }
    return global.navigator.mediaDevices.getUserMedia({ audio: false, video: video }).catch(function (err) {
      var fallback = deviceId ? { deviceId: { ideal: deviceId } } : { facingMode: 'environment' };
      if (!deviceId && err && err.name === 'OverconstrainedError') fallback = true;
      return global.navigator.mediaDevices.getUserMedia({ audio: false, video: fallback }).catch(function () {
        if (!deviceId) throw err;
        return global.navigator.mediaDevices.getUserMedia({ audio: false, video: true });
      });
    });
  }

  function fillSelect(select, list, currentId) {
    if (!select) return;
    select.dataset.filling = '1';
    while (select.firstChild) select.removeChild(select.firstChild);
    if (!list || !list.length) {
      var empty = document.createElement('option');
      empty.value = '';
      empty.textContent = 'Default camera';
      select.appendChild(empty);
    } else {
      list.forEach(function (cam) {
        var opt = document.createElement('option');
        opt.value = cam.id;
        opt.textContent = cam.label;
        select.appendChild(opt);
      });
    }
    if (currentId) select.value = currentId;
    select.dataset.filling = '';
  }

  function prepareVideo(video) {
    video.muted = true;
    video.defaultMuted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.controls = false;
    video.setAttribute('muted', '');
    video.setAttribute('autoplay', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.removeAttribute('controls');
    video.disablePictureInPicture = true;
  }

  function previewCanvas(video) {
    var box = video && video.parentNode;
    if (!box) return null;
    var canvas = box.querySelector('canvas.ttms-scan-preview');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.className = 'ttms-scan-preview';
      box.insertBefore(canvas, video.nextSibling);
    }
    return canvas;
  }

  function watch(video, onCode) {
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d', { willReadFrequently: true }) || canvas.getContext('2d');
    var stopped = false;
    var detecting = false;
    var last = '';
    var lastAt = 0;
    var pass = 0;
    var timer = 0;
    var raf = 0;
    var view = previewCanvas(video);
    var viewCtx = view ? view.getContext('2d') : null;
    var detector = null;
    if (typeof global.BarcodeDetector === 'function') {
      try {
        detector = new global.BarcodeDetector({ formats: ['qr_code'] });
      } catch (e) {
        detector = null;
      }
    }

    function emit(text) {
      if (stopped) return;
      text = String(text || '').trim();
      if (!text) return;
      var now = Date.now();
      if (text === last && now - lastAt < 900) return;
      last = text;
      lastAt = now;
      onCode(text);
    }

    function sample(sx, sy, sw, sh) {
      if (!ctx || typeof global.jsQR !== 'function' || sw < 8 || sh < 8) return false;
      var maxEdge = 520;
      var scale = Math.min(1, maxEdge / Math.max(sw, sh));
      var w = Math.max(1, Math.round(sw * scale));
      var h = Math.max(1, Math.round(sh * scale));
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);
      var image = ctx.getImageData(0, 0, w, h);
      var mode = pass % 3 === 0 ? 'attemptBoth' : 'dontInvert';
      var code = global.jsQR(image.data, w, h, { inversionAttempts: mode });
      if (code && code.data) {
        emit(code.data);
        return true;
      }
      return false;
    }

    function decodeCanvas() {
      var vw = video.videoWidth;
      var vh = video.videoHeight;
      if (!vw || !vh) return;
      pass += 1;
      if (pass % 4 === 0) {
        sample(0, 0, vw, vh);
        return;
      }
      var side = Math.round(Math.min(vw, vh) * 0.7);
      var sx = Math.round((vw - side) / 2);
      var sy = Math.max(0, Math.round((vh - side) / 2 - vh * 0.08));
      if (sy + side > vh) sy = Math.max(0, vh - side);
      sample(sx, sy, side, side);
    }

    function step() {
      if (stopped) return;
      if (!video || video.readyState < 2 || !video.videoWidth) {
        if (video && video.srcObject && video.paused) {
          var retry = video.play();
          if (retry && retry.catch) retry.catch(function () {});
        }
        timer = global.setTimeout(step, 250);
        return;
      }
      try {
        decodeCanvas();
      } catch (e) {}
      if (detector && !detecting) {
        detecting = true;
        var detect = detector.detect(video);
        if (detect && detect.then) {
          detect.then(function (codes) {
            if (codes && codes[0] && codes[0].rawValue) emit(codes[0].rawValue);
          }).catch(function () {}).then(function () { detecting = false; }, function () { detecting = false; });
        } else {
          detecting = false;
        }
      }
      timer = global.setTimeout(step, 180);
    }

    function paint() {
      if (stopped) return;
      var vw = video.videoWidth;
      var vh = video.videoHeight;
      if (view && viewCtx && vw && vh) {
        var box = view.parentNode;
        var dw = Math.max(1, Math.round(box.clientWidth || global.innerWidth));
        var dh = Math.max(1, Math.round(box.clientHeight || global.innerHeight));
        if (view.width !== dw) view.width = dw;
        if (view.height !== dh) view.height = dh;
        var scale = Math.max(dw / vw, dh / vh);
        var sw = dw / scale;
        var sh = dh / scale;
        viewCtx.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, dw, dh);
      }
      raf = global.requestAnimationFrame(paint);
    }

    raf = global.requestAnimationFrame(paint);
    timer = global.setTimeout(step, 200);
    return function stop() {
      stopped = true;
      if (timer) global.clearTimeout(timer);
      if (raf) global.cancelAnimationFrame(raf);
    };
  }

  function attach(video, stream) {
    prepareVideo(video);
    if (video.srcObject && video.srcObject !== stream) video.srcObject = null;
    video.srcObject = stream;
    var track = stream.getVideoTracks()[0];
    var settings = track && track.getSettings ? track.getSettings() : null;
    if (track && typeof track.applyConstraints === 'function') {
      track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(function () {});
    }
    function kick() {
      var play = video.play();
      if (play && play.catch) play.catch(function () {});
    }
    if (video.readyState >= 1) kick();
    else video.addEventListener('loadedmetadata', kick, { once: true });
    return (settings && settings.deviceId) || '';
  }

  function session(options) {
    var stream = null;
    var stopWatch = null;
    var stopped = false;
    var currentId = '';

    function stopTracks() {
      if (stopWatch) stopWatch();
      stopWatch = null;
      if (options.video && options.video.srcObject) options.video.srcObject = null;
      if (stream) {
        stream.getTracks().forEach(function (track) { track.stop(); });
        stream = null;
      }
    }

    function open(deviceId) {
      var replacing = !!stream;
      stopTracks();
      var ready = replacing ? new Promise(function (resolve) { global.setTimeout(resolve, 200); }) : Promise.resolve();
      return ready.then(function () {
        return capture(deviceId);
      }).then(function (next) {
        if (stopped) {
          next.getTracks().forEach(function (track) { track.stop(); });
          return [];
        }
        stream = next;
        currentId = attach(options.video, next) || deviceId || '';
        return cameras().then(function (list) {
          if (stopped) return list;
          if (!deviceId) {
            var active = null;
            list.forEach(function (cam) {
              if (cam.id === currentId) active = cam;
            });
            var label = active ? active.label : '';
            var best = preferredId(list);
            if (best && best !== currentId && /tele|ultra|front|face|zoom/i.test(label)) return open(best);
          }
          if (!stopWatch) stopWatch = watch(options.video, options.onCode);
          return list;
        });
      });
    }

    return {
      deviceId: function () { return currentId; },
      stop: function () {
        stopped = true;
        stopTracks();
        if (options.video) options.video.srcObject = null;
      },
      open: open,
    };
  }

  global.TTMSCode = {
    draw: draw,
    watch: watch,
    cameras: cameras,
    fillSelect: fillSelect,
    session: session,
  };
})(window);
