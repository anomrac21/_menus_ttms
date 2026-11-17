/**
 * Draw an order code and read one from the phone camera.
 * Requires vendor/qrcode.js and vendor/jsQR.js.
 */
(function (global) {
  'use strict';

  function draw(text) {
    if (typeof global.qrcode !== 'function' || !text) return '';
    var qr = global.qrcode(0, 'Q');
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

  function capture(deviceId) {
    var video = {
      width: { ideal: 1280 },
      height: { ideal: 720 },
    };
    if (deviceId) video.deviceId = { exact: deviceId };
    else video.facingMode = { ideal: 'environment' };
    return global.navigator.mediaDevices.getUserMedia({ audio: false, video: video }).catch(function (err) {
      if (!deviceId) throw err;
      return global.navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { deviceId: { ideal: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } },
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

  function watch(video, onCode) {
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d', { willReadFrequently: true }) || canvas.getContext('2d');
    var stopped = false;
    var last = '';
    var lastAt = 0;
    var pass = 0;
    var timer = 0;
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
      if (text === last && now - lastAt < 1200) return;
      last = text;
      lastAt = now;
      onCode(text);
    }

    function sample(sx, sy, sw, sh) {
      if (!ctx || typeof global.jsQR !== 'function' || !sw || !sh) return false;
      var maxEdge = 800;
      var scale = Math.min(1, maxEdge / Math.max(sw, sh));
      var w = Math.max(1, Math.round(sw * scale));
      var h = Math.max(1, Math.round(sh * scale));
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);
      var image = ctx.getImageData(0, 0, w, h);
      var code = global.jsQR(image.data, w, h, { inversionAttempts: 'attemptBoth' });
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
      if (pass % 2 === 0) {
        sample(0, 0, vw, vh);
        return;
      }
      var cw = Math.round(vw * 0.72);
      var ch = Math.round(vh * 0.72);
      sample(Math.round((vw - cw) / 2), Math.round((vh - ch) / 2), cw, ch);
    }

    function step() {
      if (stopped) return;
      if (!video || video.readyState < 2 || !video.videoWidth) {
        timer = global.setTimeout(step, 200);
        return;
      }
      function finish() {
        if (!stopped) timer = global.setTimeout(step, 90);
      }
      try {
        if (detector) {
          detector.detect(video).then(function (codes) {
            if (codes && codes[0] && codes[0].rawValue) emit(codes[0].rawValue);
            else decodeCanvas();
          }).catch(function () {
            try { decodeCanvas(); } catch (e) {}
          }).then(finish, finish);
          return;
        }
        decodeCanvas();
      } catch (e) {}
      finish();
    }

    timer = global.setTimeout(step, 120);
    return function stop() {
      stopped = true;
      if (timer) global.clearTimeout(timer);
    };
  }

  function attach(video, stream) {
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.srcObject = stream;
    var play = video.play();
    if (play && play.catch) play.catch(function () {});
    var track = stream.getVideoTracks()[0];
    if (track && typeof track.applyConstraints === 'function') {
      track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(function () {});
    }
    var settings = track && track.getSettings ? track.getSettings() : null;
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
      if (stream) {
        stream.getTracks().forEach(function (track) { track.stop(); });
        stream = null;
      }
    }

    return {
      deviceId: function () { return currentId; },
      stop: function () {
        stopped = true;
        stopTracks();
        if (options.video) options.video.srcObject = null;
      },
      open: function (deviceId) {
        stopTracks();
        return capture(deviceId).then(function (next) {
          if (stopped) {
            next.getTracks().forEach(function (track) { track.stop(); });
            return [];
          }
          stream = next;
          currentId = attach(options.video, next) || deviceId || '';
          stopWatch = watch(options.video, options.onCode);
          return cameras();
        });
      },
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
