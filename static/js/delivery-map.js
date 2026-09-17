/**
 * Delivery maps on the same MapLibre runtime as ttms_app.
 * Tiles + styles: maps.ttmenus.com (cluster map-service). Routes: osrm.ttmenus.com.
 */
(function (global) {
  'use strict';

  function mapConfig() {
    return global.TTMS_MAP_CONFIG || global.DELIVERY_CONFIG || {};
  }

  function mapServiceUrl() {
    return String(mapConfig().mapServiceUrl || 'https://maps.ttmenus.com').replace(/\/$/, '');
  }

  function mapDataSource() {
    return mapConfig().dataSource || 'trinidad-tobago';
  }
  var MODE_KEY = 'ttms_map_mode';
  var TT_CENTER = { lat: 10.66, lng: -61.52 };
  var instances = {};
  var loadPromise = null;
  var modeWatch = false;
  var currentMode = 'day';
  var mapServiceOk = null;

  function $(id) {
    return document.getElementById(id);
  }

  function parseCoord(value) {
    var n = Number(value);
    return isFinite(n) ? n : null;
  }

  function validPoint(lat, lng) {
    var a = parseCoord(lat);
    var b = parseCoord(lng);
    if (a == null || b == null) return null;
    if (a === 0 && b === 0) return null;
    if (Math.abs(a) > 90 || Math.abs(b) > 180) return null;
    return { lat: a, lng: b };
  }

  function pointFromLoc(loc) {
    if (!loc) return null;
    return (
      validPoint(loc.lat, loc.lng) ||
      validPoint(loc.latitude, loc.longitude) ||
      (Array.isArray(loc.latlon) ? validPoint(loc.latlon[0], loc.latlon[1]) : null)
    );
  }

  function attrPoint(el) {
    if (!el) return null;
    return validPoint(el.getAttribute('data-lat'), el.getAttribute('data-lng'));
  }

  function restaurantPoint() {
    var loc = global.currentOrderLocation || {};
    var cfg = global.DELIVERY_CONFIG || {};
    var selected =
      document.querySelector('.location-picker-card--selected') ||
      document.querySelector('.location-picker-card.active-location');
    var cart = document.querySelector('#locationSelect option:checked') ||
      document.querySelector('#locationSelect option[selected]');
    var slug = (location.pathname || '').replace(/\/+$/, '').split('/').pop();
    var bySlug = slug
      ? document.querySelector('.location-picker-card[data-slug="' + slug + '"]')
      : null;
    return (
      pointFromLoc(loc) ||
      validPoint(cfg.restaurantLat, cfg.restaurantLng) ||
      attrPoint(selected) ||
      attrPoint(cart) ||
      attrPoint(bySlug)
    );
  }

  function restaurantLabel() {
    var loc = global.currentOrderLocation || {};
    var cfg = global.DELIVERY_CONFIG || {};
    var selected =
      document.querySelector('.location-picker-card--selected') ||
      document.querySelector('.location-picker-card.active-location');
    var cart = document.querySelector('#locationSelect option:checked');
    return (
      loc.address ||
      (selected && selected.getAttribute('data-address')) ||
      (cart && cart.getAttribute('data-address')) ||
      cfg.restaurantName ||
      ''
    );
  }

  function defaultCenter() {
    return restaurantPoint() || TT_CENTER;
  }

  function osrmBase() {
    var cfg = mapConfig();
    return String(cfg.osrmUrl || 'https://osrm.ttmenus.com/route/v1').replace(/\/$/, '');
  }

  function localStyle(url, fallback) {
    var s = String(url || '');
    if (!s || /maps\.ttmenus\.com\/styles\//i.test(s)) return fallback;
    return s;
  }

  function styles() {
    var cfg = mapConfig();
    var hub = (global.TTMSMap && global.TTMSMap.STYLES) || {};
    return {
      day: localStyle(cfg.dayStyle || hub.day, '/src/map/styles/ttmenus-day.json'),
      dark: localStyle(cfg.nightStyle || hub.dark, '/src/map/styles/ttmenus-dark.json'),
      fallbackDay: '/src/map/styles/ttmenus-day.json',
      fallbackDark: '/src/map/styles/ttmenus-dark.json',
    };
  }

  function isNightTime() {
    var hour = new Date().getHours();
    return hour >= 18 || hour < 6;
  }

  function readForcedMode() {
    try {
      var stored = localStorage.getItem(MODE_KEY);
      if (stored === 'night' || stored === 'day') return stored;
    } catch (_) {}
    return '';
  }

  function resolveMode() {
    var forced = readForcedMode();
    if (forced) return forced;
    if (document.documentElement.getAttribute('data-theme') === 'dark') return 'night';
    return isNightTime() ? 'night' : 'day';
  }

  function styleUrlFor(mode) {
    var s = styles();
    var night = mode === 'night';
    if (mapServiceOk === false) return night ? s.fallbackDark : s.fallbackDay;
    return night ? s.dark : s.day;
  }

  function routeColor(mode) {
    return mode === 'night' ? '#8b93ff' : '#3943e7';
  }

  function checkMapService() {
    if (mapServiceOk != null) return Promise.resolve(mapServiceOk);
    return fetch(mapServiceUrl() + '/data/' + mapDataSource() + '.json')
      .then(function (res) {
        mapServiceOk = !!res.ok;
        return mapServiceOk;
      })
      .catch(function () {
        mapServiceOk = false;
        return false;
      });
  }

  var MAPLIBRE_JS = [
    'https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.min.js',
    versioned('/js/maplibre-gl.js'),
    'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.js',
    'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js',
  ];
  var MAPLIBRE_CSS = [
    'https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.min.css',
    versioned('/css/maplibre-gl.css'),
  ];

  function versioned(path) {
    var token = global.TTMS_ASSET_V ? '?v=' + global.TTMS_ASSET_V : '';
    return path + token;
  }

  function loadCss(href) {
    if (!href) return;
    if (document.querySelector('link[href="' + href + '"]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (!src) {
        reject(new Error('Missing script src'));
        return;
      }
      if (
        (src.indexOf('maplibre-gl') >= 0 && global.maplibregl) ||
        (src.indexOf('ttms-maplibre') >= 0 && global.TTMSMap && global.TTMSMap.createMap)
      ) {
        resolve();
        return;
      }
      var script = document.createElement('script');
      script.src = src;
      script.onload = function () {
        resolve();
      };
      script.onerror = function () {
        reject(new Error('Could not load ' + src));
      };
      document.head.appendChild(script);
    });
  }

  function loadFirst(urls, loader) {
    var chain = Promise.reject(new Error('No sources'));
    urls.forEach(function (url) {
      chain = chain.catch(function () {
        return loader(url);
      });
    });
    return chain;
  }

  function loadMapLibre() {
    if (global.maplibregl && global.TTMSMap && global.TTMSMap.createMap) {
      return Promise.resolve(global.TTMSMap);
    }
    if (loadPromise) return loadPromise;
    MAPLIBRE_CSS.forEach(loadCss);
    loadPromise = (global.maplibregl ? Promise.resolve() : loadFirst(MAPLIBRE_JS, loadScript))
      .then(function () {
        if (!global.maplibregl) throw new Error('MapLibre failed to load');
        if (global.TTMSMap && global.TTMSMap.createMap) return global.TTMSMap;
        return loadScript(versioned('/js/ttms-maplibre.js')).then(function () {
          if (global.TTMSMap && global.TTMSMap.createMap) return global.TTMSMap;
          throw new Error('Map runtime missing');
        });
      });
    return loadPromise;
  }

  function escapeAttr(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  function pinTheme() {
    var cfg = (global.DELIVERY_CONFIG && global.DELIVERY_CONFIG.mappin) || {};
    var width = cfg.borderWidth != null ? cfg.borderWidth : cfg.border_width;
    return {
      url: cfg.url || '/branding/mappin.webp',
      fill: cfg.fill || '#000000',
      border: cfg.border || '#ffffff',
      borderWidth: width != null && width !== '' ? String(width) : '2',
    };
  }

  function shopPin() {
    var t = pinTheme();
    var w = 40;
    var h = 50;
    var style =
      '--ttms-map-pin-color:' +
      escapeAttr(t.fill) +
      ';--ttms-map-pin-border-color:' +
      escapeAttr(t.border) +
      ';--ttms-map-pin-border-width:' +
      escapeAttr(t.borderWidth) +
      'px;color:' +
      escapeAttr(t.fill);
    var html =
      '<span class="ttms-map-pin ttms-map-pin--shop" style="' +
      style +
      '">' +
      '<svg class="ttms-map-pin__bg" viewBox="0 0 64 64" aria-hidden="true" focusable="false">' +
      '<path fill="currentColor" stroke="var(--ttms-map-pin-border-color, #ffffff)" ' +
      'stroke-width="var(--ttms-map-pin-border-width, 2)" vector-effect="non-scaling-stroke" ' +
      'd="M32 2c-11.6 0-21 9.4-21 21 0 15.8 18.1 36.9 19 38.0 1 1.1 2.9 1.1 3.9 0 .9-1.1 19-22.2 19-38C53 11.4 43.6 2 32 2Z"></path>' +
      '</svg>' +
      '<img class="ttms-map-pin__icon" alt="" src="' +
      escapeAttr(t.url) +
      '" width="' +
      w +
      '" height="' +
      h +
      '" onerror="this.onerror=null;this.src=\'/branding/favicon192.webp\'">' +
      '</span>';
    return global.TTMSMap.createPin(html, [w, h]);
  }

  function simplePin(kind, symbol) {
    var html =
      '<span class="ttms-map-marker ttms-map-marker--' +
      kind +
      '"><span class="ttms-map-marker__pin" aria-hidden="true"><i class="fa ' +
      symbol +
      '"></i></span></span>';
    return global.TTMSMap.createPin(html, [32, 40]);
  }

  function formatDuration(sec) {
    var m = Math.max(1, Math.round(Number(sec) / 60));
    if (m < 60) return m + ' min';
    var h = Math.floor(m / 60);
    var rm = m % 60;
    return rm ? h + ' hr ' + rm + ' min' : h + ' hr';
  }

  function formatDistance(meters) {
    var m = Number(meters);
    if (!isFinite(m) || m < 0) return '';
    if (m < 1000) return Math.round(m) + ' m';
    return (m / 1000).toFixed(m >= 10000 ? 0 : 1) + ' km';
  }

  function formatEta(durationSec, distanceM) {
    var time = formatDuration(durationSec);
    var dist = formatDistance(distanceM);
    return dist ? 'About ' + time + ' · ' + dist : 'About ' + time;
  }

  function formatCoord(lat, lng) {
    return lat.toFixed(5) + ', ' + lng.toFixed(5);
  }

  function setHint(el, text) {
    if (el) el.textContent = text;
  }

  function nominatim(url) {
    return fetch(url, { headers: { Accept: 'application/json' } }).then(function (res) {
      if (!res.ok) throw new Error('Lookup failed');
      return res.json();
    });
  }

  function geocodeAddress(query) {
    var q = String(query || '').trim();
    if (q.length < 3) return Promise.resolve(null);
    var url =
      'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=tt&q=' +
      encodeURIComponent(q);
    return nominatim(url).then(function (rows) {
      if (!rows || !rows.length) return null;
      return validPoint(rows[0].lat, rows[0].lon);
    });
  }

  function reverseGeocode(lat, lng) {
    var pt = validPoint(lat, lng);
    if (!pt) return Promise.resolve('');
    var url =
      'https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=' +
      encodeURIComponent(pt.lat) +
      '&lon=' +
      encodeURIComponent(pt.lng);
    return nominatim(url).then(function (row) {
      return (row && (row.display_name || (row.address && row.address.road))) || '';
    });
  }

  function writeInputs(form, lat, lng) {
    if (!form) return;
    if (form.lat) form.lat.value = String(lat);
    if (form.lng) form.lng.value = String(lng);
  }

  function haversineMeters(a, b) {
    var toRad = function (deg) {
      return (deg * Math.PI) / 180;
    };
    var dLat = toRad(b.lat - a.lat);
    var dLng = toRad(b.lng - a.lng);
    var lat1 = toRad(a.lat);
    var lat2 = toRad(b.lat);
    var h =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * 6371000 * Math.asin(Math.sqrt(h));
  }

  function ensureEta(inst) {
    if (inst.etaEl) return inst.etaEl;
    var el = document.createElement('div');
    el.className = 'ttms-delivery-eta';
    el.setAttribute('aria-live', 'polite');
    inst.etaEl = el;
    if (inst.hud) inst.hud.appendChild(el);
    return el;
  }

  function showEta(inst, durationSec, distanceM, source) {
    var el = ensureEta(inst);
    var label = formatEta(durationSec, distanceM);
    if (source === 'estimate') label += ' (est.)';
    el.textContent = label;
    el.hidden = false;
    if (inst.hint) setHint(inst.hint, 'Pickup to drop-off · ' + label);
    inst.eta = { duration: durationSec, distance: distanceM, label: label };
  }

  var FIT_DELAY_MS = 2600;
  var PIN_FOCUS_ZOOM = 16;

  function fitPadding() {
    return { top: 120, bottom: 220, left: 36, right: 36 };
  }

  function fitPoints(map, points) {
    if (!map || typeof map.fitLatLngBounds !== 'function') return;
    var pts = (points || []).filter(Boolean);
    if (!pts.length) return;
    map.fitLatLngBounds(pts, {
      padding: fitPadding(),
      maxZoom: 15,
      duration: 0.9,
      animate: true,
    });
  }

  function focusPoint(map, pt, zoom) {
    if (!map || !pt || typeof map.setView !== 'function') return;
    map.setView(pt, zoom || PIN_FOCUS_ZOOM, { duration: 450 });
  }

  function cancelFit(inst) {
    if (inst && inst.fitTimer) {
      window.clearTimeout(inst.fitTimer);
      inst.fitTimer = null;
    }
  }

  function scheduleFitPins(inst, delay) {
    if (!inst || !inst.map) return;
    cancelFit(inst);
    var wait = delay == null ? FIT_DELAY_MS : delay;
    var run = function () {
      inst.fitTimer = null;
      fitPoints(inst.map, [inst.shop, inst.dropoff, inst.driver].filter(Boolean));
    };
    if (wait <= 0) {
      run();
      return;
    }
    inst.fitTimer = window.setTimeout(run, wait);
  }

  function resizeMap(map) {
    if (!map || typeof map.resize !== 'function') return;
    [40, 180, 420].forEach(function (ms) {
      window.setTimeout(function () {
        try {
          map.resize();
        } catch (_) {}
      }, ms);
    });
  }

  function addModeToggle(inst) {
    var map = inst.map;
    if (!map || !map.addControl) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ttms-delivery-map-mode';
    btn.innerHTML =
      '<span class="ttms-delivery-map-mode__sun" aria-hidden="true"><i class="fa fa-sun-o"></i></span>' +
      '<span class="ttms-delivery-map-mode__moon" aria-hidden="true"><i class="fa fa-moon-o"></i></span>';
    inst.modeBtn = btn;
    inst.hud = document.createElement('div');
    inst.hud.className = 'ttms-delivery-map-hud-ctrl';
    inst.hud.appendChild(btn);
    var ctrl = {
      onAdd: function () {
        return inst.hud;
      },
      onRemove: function () {},
    };
    map.addControl(ctrl, 'top-right');
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      setForcedMode(currentMode === 'night' ? 'day' : 'night');
    });
    updateModeToggle(inst, currentMode);
  }

  function updateModeToggle(inst, mode) {
    if (!inst || !inst.modeBtn) return;
    var night = mode === 'night';
    inst.modeBtn.setAttribute('aria-pressed', night ? 'true' : 'false');
    inst.modeBtn.setAttribute('aria-label', night ? 'Switch to day map' : 'Switch to night map');
    inst.modeBtn.title = night ? 'Day style' : 'Night style';
    inst.modeBtn.classList.toggle('is-night', night);
  }

  function applyStyle(inst, mode) {
    if (!inst || !inst.map) return;
    var url = styleUrlFor(mode);
    inst.map._ttmsStyleUrl = inst.map._ttmsStyleUrl || '';
    if (typeof inst.map.setTtmsStyle === 'function') inst.map.setTtmsStyle(url);
    else if (typeof inst.map.setStyle === 'function') inst.map.setStyle(url);
    if (inst.router) {
      inst.router.options.lineColor = routeColor(mode);
      if (inst.router._line && typeof inst.router._line.setStyle === 'function') {
        inst.router._line.setStyle({ color: routeColor(mode) });
      }
    }
    var el = inst.map.getContainer && inst.map.getContainer();
    if (el) {
      el.setAttribute('data-map-mode', mode);
      el.classList.toggle('is-night', mode === 'night');
    }
    try {
      document.documentElement.setAttribute('data-map-mode', mode);
    } catch (_) {}
    updateModeToggle(inst, mode);
  }

  function applyModeToAll(mode) {
    currentMode = mode === 'night' ? 'night' : 'day';
    Object.keys(instances).forEach(function (id) {
      applyStyle(instances[id], currentMode);
    });
  }

  function setForcedMode(mode) {
    var next = mode === 'night' ? 'night' : 'day';
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch (_) {}
    applyModeToAll(next);
  }

  function watchModeChanges() {
    if (modeWatch) return;
    modeWatch = true;
    window.addEventListener('themeChanged', function () {
      if (readForcedMode()) return;
      applyModeToAll(resolveMode());
    });
    window.setInterval(function () {
      if (readForcedMode()) return;
      var next = resolveMode();
      if (next !== currentMode) applyModeToAll(next);
    }, 5 * 60 * 1000);
  }

  function paintRoute(inst) {
    if (!inst || !inst.map || !inst.shop || !inst.dropoff || !global.TTMSMap) return;
    if (!inst.router || inst.router._map !== inst.map) {
      if (inst.router && typeof inst.router.remove === 'function') inst.router.remove();
      inst.router = new global.TTMSMap.Router(inst.map, {
        serviceUrl: osrmBase(),
        profile: 'driving',
        lineColor: routeColor(currentMode),
        lineWeight: 6,
        lineOpacity: 0.9,
        createMarker: function () {
          return null;
        },
      });
      inst.router.on('routesfound', function (e) {
        var route = e.routes && e.routes[0];
        var summary = route && route.summary;
        if (summary) showEta(inst, summary.totalTime, summary.totalDistance);
        if (inst.kind !== 'picker') fitPoints(inst.map, [inst.shop, inst.dropoff]);
      });
      inst.router.on('routingerror', function () {
        var meters = haversineMeters(inst.shop, inst.dropoff);
        showEta(inst, (meters / 1000) * 120, meters, 'estimate');
        if (inst.kind !== 'picker') fitPoints(inst.map, [inst.shop, inst.dropoff]);
      });
    } else {
      inst.router.options.serviceUrl = osrmBase();
      inst.router.options.lineColor = routeColor(currentMode);
    }
    inst.router.setWaypoints(inst.shop, inst.dropoff);
    var run = function () {
      if (!inst.router || !inst.shop || !inst.dropoff) return;
      inst.router.setWaypoints(inst.shop, inst.dropoff);
      inst.router.route();
    };
    if (typeof inst.map.whenStyleReady === 'function') inst.map.whenStyleReady(run);
    else run();
  }

  function refreshRoute(inst, immediate) {
    if (!inst) return;
    if (inst.routeTimer) window.clearTimeout(inst.routeTimer);
    if (immediate) {
      paintRoute(inst);
      return;
    }
    inst.routeTimer = window.setTimeout(function () {
      inst.routeTimer = null;
      paintRoute(inst);
    }, 280);
  }

  function loseMapGl(map) {
    try {
      var canvas = map && map.getCanvas && map.getCanvas();
      if (!canvas) return;
      var gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      var ext = gl && gl.getExtension && gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    } catch (_) {}
  }

  function purgeContainer(el) {
    if (!el) return;
    Array.prototype.slice.call(el.querySelectorAll('canvas')).forEach(function (c) {
      try {
        var gl = c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl');
        var ext = gl && gl.getExtension && gl.getExtension('WEBGL_lose_context');
        if (ext) ext.loseContext();
      } catch (_) {}
    });
    el.innerHTML = '';
  }

  function destroy(id) {
    if (!id) {
      Object.keys(instances).forEach(destroy);
      return;
    }
    var inst = instances[id];
    if (!inst) {
      purgeContainer($(id));
      return;
    }
    if (inst.routeTimer) window.clearTimeout(inst.routeTimer);
    cancelFit(inst);
    if (inst.router && inst.router.remove) inst.router.remove();
    ['shopMarker', 'dropoffMarker', 'driverMarker'].forEach(function (key) {
      if (inst[key] && inst[key].remove) inst[key].remove();
    });
    (inst.offerMarkers || []).forEach(function (m) {
      if (m && m.remove) m.remove();
    });
    try {
      loseMapGl(inst.map);
      if (inst.map && inst.map.remove) inst.map.remove();
    } catch (_) {}
    purgeContainer($(id));
    delete instances[id];
  }

  function createBaseMap(id, center, zoom) {
    currentMode = resolveMode();
    var el = $(id);
    if (el && (!el.offsetWidth || !el.offsetHeight)) {
      el.style.minHeight = el.style.minHeight || '16rem';
    }
    var map;
    try {
      map = global.TTMSMap.createMap(id, {
        style: styleUrlFor(currentMode),
        center: [center.lng, center.lat],
        zoom: zoom || 14,
        minZoom: 7,
      });
    } catch (err) {
      console.error('TTMSMap.createMap failed', err);
      purgeContainer(el);
      throw err;
    }
    var canvas = map.getContainer && map.getContainer();
    if (canvas) {
      canvas.setAttribute('data-map-mode', currentMode);
      canvas.classList.toggle('is-night', currentMode === 'night');
    }
    try {
      document.documentElement.setAttribute('data-map-mode', currentMode);
    } catch (_) {}
    watchModeChanges();
    resizeMap(map);
    return map;
  }

  function addShopMarker(map, shop, label) {
    if (!shop) return null;
    var marker = new global.TTMSMap.Marker(shop, {
      pin: shopPin(),
      title: label || '',
      zIndexOffset: 400,
    }).addTo(map);
    if (label) marker.bindTooltip(label, { direction: 'top' });
    return marker;
  }

  function mountPicker(opts) {
    opts = opts || {};
    var id = opts.containerId || 'ttms-delivery-pin-map';
    var el = $(id);
    var form = opts.form || $('ttms-delivery-form');
    var hint = opts.hintEl || $('ttms-delivery-pin-hint');
    if (!el) return Promise.resolve(null);

    return loadMapLibre()
      .then(function () {
        return checkMapService();
      })
      .then(function () {
        destroy(id);
        var dropoff =
          validPoint(opts.lat, opts.lng) ||
          (form && validPoint(form.lat && form.lat.value, form.lng && form.lng.value));
        var shop = restaurantPoint();
        var center = dropoff || shop || defaultCenter();
        var map = createBaseMap(id, center, dropoff ? 16 : 13);
        var inst = {
          id: id,
          kind: 'picker',
          map: map,
          shop: shop,
          dropoff: dropoff,
          hint: hint,
          form: form,
        };
        addModeToggle(inst);
        inst.shopMarker = addShopMarker(map, shop, restaurantLabel() || 'Pickup');

        function placePin(lat, lng, source) {
          var pt = validPoint(lat, lng);
          if (!pt) return;
          writeInputs(form, pt.lat, pt.lng);
          inst.dropoff = pt;
          if (!inst.dropoffMarker) {
            inst.dropoffMarker = new global.TTMSMap.Marker(pt, {
              pin: simplePin('dropoff', 'fa-home'),
              draggable: true,
              zIndexOffset: 500,
            }).addTo(map);
            inst.dropoffMarker.on('dragstart', function () {
              cancelFit(inst);
            });
            inst.dropoffMarker.on('dragend', function (ev) {
              var ll = (ev && ev.latlng) || inst.dropoffMarker.getLatLng();
              writeInputs(form, ll.lat, ll.lng);
              inst.dropoff = { lat: ll.lat, lng: ll.lng };
              setHint(hint, inst.shop ? 'Routing pickup to drop-off…' : 'Pin set · ' + formatCoord(ll.lat, ll.lng));
              refreshRoute(inst, true);
              scheduleFitPins(inst);
              if (typeof opts.onChange === 'function') opts.onChange(ll.lat, ll.lng, { source: 'drag' });
            });
          } else if (inst.dropoffMarker.setLatLng) {
            inst.dropoffMarker.setLatLng(pt);
          }
          setHint(hint, inst.shop ? 'Routing pickup to drop-off…' : 'Pin set · ' + formatCoord(pt.lat, pt.lng));
          if (source !== 'drag') focusPoint(map, pt, PIN_FOCUS_ZOOM);
          if (inst.shop) scheduleFitPins(inst);
          refreshRoute(inst, true);
          if (typeof opts.onChange === 'function') opts.onChange(pt.lat, pt.lng, { source: source || 'move' });
        }

        inst.placePin = placePin;
        instances[id] = inst;
        map.on('click', function (e) {
          if (!e || !e.lngLat) return;
          placePin(e.lngLat.lat, e.lngLat.lng);
        });
        if (dropoff) placePin(dropoff.lat, dropoff.lng);
        else {
          setHint(hint, 'Tap the map to set drop-off');
          if (shop) map.setView(shop, 13);
        }
        resizeMap(map);
        return inst;
      });
  }

  function movePicker(id, lat, lng) {
    var inst = instances[id || 'ttms-delivery-pin-map'];
    if (inst && typeof inst.placePin === 'function') {
      inst.placePin(lat, lng);
      return Promise.resolve(inst);
    }
    return mountPicker({ containerId: id, lat: lat, lng: lng });
  }

  function setOfferMarkers(id, offers) {
    var inst = instances[id];
    if (!inst || !inst.map) return;
    (inst.offerMarkers || []).forEach(function (m) {
      if (m && m.remove) m.remove();
    });
    inst.offerMarkers = [];
    var points = [inst.shop, inst.dropoff].filter(Boolean);
    (offers || []).forEach(function (offer) {
      var driver = (offer && offer.driver) || {};
      var pt = validPoint(driver.lat, driver.lng);
      if (!pt) return;
      var marker = new global.TTMSMap.Marker(pt, {
        pin: simplePin('driver', 'fa-motorcycle'),
        title: driver.display_name || 'Driver',
      }).addTo(inst.map);
      var name = driver.display_name || driver.email || 'Driver';
      var dist = offer.distance_m ? (offer.distance_m / 1000).toFixed(1) + ' km away' : 'Nearby';
      marker.bindTooltip(name + ' · ' + dist);
      inst.offerMarkers.push(marker);
      points.push(pt);
    });
    fitPoints(inst.map, points);
  }

  function setDriver(id, lat, lng, label) {
    var inst = instances[id];
    var pt = validPoint(lat, lng);
    if (!inst || !pt) return;
    if (!inst.driverMarker) {
      inst.driverMarker = new global.TTMSMap.Marker(pt, {
        pin: simplePin('driver', 'fa-motorcycle'),
        title: label || 'Driver',
      }).addTo(inst.map);
    } else {
      inst.driverMarker.setLatLng(pt);
    }
    if (label) inst.driverMarker.bindTooltip(label);
    fitPoints(inst.map, [inst.shop, inst.dropoff, pt]);
  }

  function mountTrack(opts) {
    opts = opts || {};
    var id = opts.containerId;
    var el = $(id);
    if (!el || !id) return Promise.resolve(null);
    return loadMapLibre()
      .then(function () {
        return checkMapService();
      })
      .then(function () {
        destroy(id);
        el.textContent = '';
        el.classList.add('ttms-delivery-map');
        var shop = validPoint(opts.restaurantLat, opts.restaurantLng) || restaurantPoint();
        var dropoff = validPoint(opts.dropoffLat, opts.dropoffLng);
        var driver = validPoint(opts.driverLat, opts.driverLng);
        var center = driver || dropoff || shop || defaultCenter();
        var map = createBaseMap(id, center, 14);
        var inst = {
          id: id,
          kind: 'track',
          map: map,
          shop: shop,
          dropoff: dropoff,
        };
        addModeToggle(inst);
        inst.shopMarker = addShopMarker(map, shop, opts.restaurantLabel || restaurantLabel());
        if (dropoff) {
          inst.dropoffMarker = new global.TTMSMap.Marker(dropoff, {
            pin: simplePin('dropoff', 'fa-home'),
            title: opts.dropoffLabel || 'Drop-off',
          }).addTo(map);
          if (opts.dropoffLabel) inst.dropoffMarker.bindTooltip(opts.dropoffLabel);
        }
        instances[id] = inst;
        if (shop && dropoff) refreshRoute(inst, true);
        else fitPoints(map, [shop, dropoff]);
        if (driver) setDriver(id, driver.lat, driver.lng, opts.driverLabel || 'Driver');
        resizeMap(map);
        return inst;
      });
  }

  global.TTMSDeliveryMap = {
    ready: loadMapLibre,
    destroy: destroy,
    destroyAll: function () {
      destroy();
    },
    mountPicker: mountPicker,
    movePicker: movePicker,
    mountTrack: mountTrack,
    setDriver: setDriver,
    setOfferMarkers: setOfferMarkers,
    geocodeAddress: geocodeAddress,
    reverseGeocode: reverseGeocode,
    restaurantPoint: restaurantPoint,
    restaurantLabel: restaurantLabel,
    validPoint: validPoint,
    resize: function (id) {
      var inst = instances[id || 'ttms-delivery-pin-map'];
      if (inst && inst.map) resizeMap(inst.map);
    },
  };
})(window);
