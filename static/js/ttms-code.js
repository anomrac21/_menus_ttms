/**
 * Draw an order code and read one from the camera.
 * Requires vendor/qrcode.js and vendor/jsQR.js.
 */
(function (global) {
  'use strict';

  function draw(text) {
    if (typeof global.qrcode !== 'function' || !text) return '';
    var qr = global.qrcode(0, 'M');
    qr.addData(String(text));
    qr.make();
    return qr.createDataURL(8, 12);
  }

  function watch(video, onCode) {
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    var stopped = false;
    var last = '';
    var raf = 0;
    function frame() {
      if (stopped) return;
      if (video && video.readyState >= 2 && video.videoWidth && typeof global.jsQR === 'function' && ctx) {
        var w = video.videoWidth;
        var h = video.videoHeight;
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(video, 0, 0, w, h);
        var image = ctx.getImageData(0, 0, w, h);
        var code = global.jsQR(image.data, w, h, { inversionAttempts: 'attemptBoth' });
        if (code && code.data && code.data !== last) {
          last = code.data;
          onCode(code.data);
        }
      }
      raf = global.requestAnimationFrame(frame);
    }
    raf = global.requestAnimationFrame(frame);
    return function stop() {
      stopped = true;
      if (raf) global.cancelAnimationFrame(raf);
    };
  }

  global.TTMSCode = { draw: draw, watch: watch };
})(window);
