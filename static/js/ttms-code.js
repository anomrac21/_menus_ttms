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

  function finderBox(video) {
    var vw = video.videoWidth;
    var vh = video.videoHeight;
    var box = video.parentNode;
    var dw = box ? box.clientWidth : vw;
    var dh = box ? box.clientHeight : vh;
    if (!vw || !vh || !dw || !dh) return null;
    var cover = Math.max(dw / vw, dh / vh);
    var offX = (vw * cover - dw) / 2;
    var offY = (vh * cover - dh) / 2;
    var finder = box.querySelector('.ttms-code-scan__finder, .ttms-driver-scan__finder');
    var fx;
    var fy;
    var fw;
    var fh;
    if (finder) {
      var fr = finder.getBoundingClientRect();
      var br = box.getBoundingClientRect();
      fx = fr.left - br.left;
      fy = fr.top - br.top;
      fw = fr.width;
      fh = fr.height;
    } else {
      fw = Math.min(dw, dh) * 0.72;
      fh = fw;
      fx = (dw - fw) / 2;
      fy = (dh - fh) / 2 - 88;
    }
    var pad = Math.min(fw, fh) * 0.16;
    fx -= pad;
    fy -= pad;
    fw += pad * 2;
    fh += pad * 2;
    var sx = (fx + offX) / cover;
    var sy = (fy + offY) / cover;
    var sw = fw / cover;
    var sh = fh / cover;
    if (sx < 0) { sw += sx; sx = 0; }
    if (sy < 0) { sh += sy; sy = 0; }
    if (sx + sw > vw) sw = vw - sx;
    if (sy + sh > vh) sh = vh - sy;
    if (sw < 8 || sh < 8) return { sx: 0, sy: 0, sw: vw, sh: vh };
    return { sx: sx, sy: sy, sw: sw, sh: sh };
  }

  function stretchContrast(image) {
    var data = image.data;
    var min = 255;
    var max = 0;
    var i;
    var y;
    for (i = 0; i < data.length; i += 16) {
      y = (data[i] * 3 + data[i + 1] * 6 + data[i + 2]) / 10;
      if (y < min) min = y;
      if (y > max) max = y;
    }
    if (max - min < 28) return;
    var scale = 255 / (max - min);
    for (i = 0; i < data.length; i += 4) {
      y = (data[i] - min) * scale;
      data[i] = data[i + 1] = data[i + 2] = y < 0 ? 0 : (y > 255 ? 255 : y);
    }
  }

  function watch(video, onCode) {
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d', { willReadFrequently: true }) || canvas.getContext('2d');
    var stopped = false;
    var detecting = false;
    var detectorDead = false;
    var last = '';
    var lastAt = 0;
    var pass = 0;
    var timer = 0;
    var frame = 0;
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

    function readFrame() {
      var region = finderBox(video);
      if (!region || !ctx) return;
      var maxEdge = 520;
      var fit = Math.min(1, maxEdge / Math.max(region.sw, region.sh));
      var w = Math.max(1, Math.round(region.sw * fit));
      var h = Math.max(1, Math.round(region.sh * fit));
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      ctx.drawImage(video, region.sx, region.sy, region.sw, region.sh, 0, 0, w, h);
      pass += 1;
      if (detector && !detecting && !detectorDead) {
        detecting = true;
        var settled = false;
        function finish() {
          if (settled) return;
          settled = true;
          detecting = false;
        }
        var hung = global.setTimeout(function () {
          detectorDead = true;
          finish();
        }, 700);
        var shot = global.createImageBitmap ? global.createImageBitmap(canvas) : Promise.resolve(canvas);
        shot.then(function (bmp) {
          return detector.detect(bmp).then(function (codes) {
            if (bmp && bmp.close) bmp.close();
            if (codes && codes[0] && codes[0].rawValue) emit(codes[0].rawValue);
          });
        }).catch(function () {}).then(function () {
          global.clearTimeout(hung);
          finish();
        }, function () {
          global.clearTimeout(hung);
          finish();
        });
      }
      if (typeof global.jsQR !== 'function') return;
      var image = ctx.getImageData(0, 0, w, h);
      if (pass % 3 === 0) stretchContrast(image);
      var code = global.jsQR(image.data, w, h, {
        inversionAttempts: pass % 3 === 0 ? 'attemptBoth' : 'dontInvert',
      });
      if (code && code.data) emit(code.data);
    }

    var lastScan = 0;
    function scanNow() {
      if (stopped || !video || video.readyState < 2 || !video.videoWidth) return;
      var now = Date.now();
      if (now - lastScan < 180) return;
      lastScan = now;
      try {
        readFrame();
      } catch (e) {}
    }

    function wake() {
      if (stopped) return;
      if (video && video.srcObject && !video.videoWidth && video.paused) {
        var retry = video.play();
        if (retry && retry.catch) retry.catch(function () {});
      }
      scanNow();
      timer = global.setTimeout(wake, 220);
    }

    if (video.requestVideoFrameCallback) {
      frame = video.requestVideoFrameCallback(function loop() {
        if (stopped) return;
        scanNow();
        frame = video.requestVideoFrameCallback(loop);
      });
    }
    timer = global.setTimeout(wake, 220);
    return function stop() {
      stopped = true;
      if (timer) global.clearTimeout(timer);
      if (frame && video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(frame);
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
    kick();
    video.addEventListener('loadedmetadata', kick, { once: true });
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
