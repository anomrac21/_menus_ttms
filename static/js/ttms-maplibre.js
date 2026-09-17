/**
 * TTMS MapLibre runtime — native MapLibre GL (no Leaflet).
 * Exposes window.TTMSMap for map page logic in mapjscode.html.
 */
(function (global) {
  'use strict';

  if (global.TTMSMap && global.TTMSMap.createMap) return;

  if (!global.maplibregl) {
    if (global.__ttmsMaplibreWaiting) return;
    global.__ttmsMaplibreWaiting = true;
    var src = (document.currentScript && document.currentScript.src) || '/js/ttms-maplibre.js';
    var tries = 0;
    var wait = global.setInterval(function () {
      tries += 1;
      if (global.maplibregl) {
        global.clearInterval(wait);
        global.__ttmsMaplibreWaiting = false;
        var rerun = document.createElement('script');
        rerun.src = src;
        document.head.appendChild(rerun);
      } else if (tries > 80) {
        global.clearInterval(wait);
        global.__ttmsMaplibreWaiting = false;
        console.error('maplibregl must load before ttms-maplibre.js');
      }
    }, 100);
    return;
  }

  const EARTH_R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;

  function distanceMeters(a, b) {
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_R * Math.asin(Math.sqrt(h));
  }

  function asLatLng(input, lng) {
    if (input == null) return null;
    if (typeof input === 'number' && typeof lng === 'number') {
      return { lat: input, lng: lng, distanceTo: bindDistance };
    }
    if (Array.isArray(input)) {
      return { lat: Number(input[0]), lng: Number(input[1]), distanceTo: bindDistance };
    }
    if (typeof input === 'object') {
      const lat = Number(input.lat);
      const lon = Number(input.lng != null ? input.lng : input.lon);
      return { lat, lng: lon, distanceTo: bindDistance };
    }
    return null;
  }

  function bindDistance(other) {
    return distanceMeters(this, asLatLng(other));
  }

  /** Compass bearing in degrees (0 = north, clockwise) from a → b. */
  function bearingBetween(a, b) {
    const from = asLatLng(a);
    const to = asLatLng(b);
    if (!from || !to) return 0;
    const lat1 = toRad(from.lat);
    const lat2 = toRad(to.lat);
    const dLon = toRad(to.lng - from.lng);
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x =
      Math.cos(lat1) * Math.sin(lat2) -
      Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  }

  function projectOnSegment(p, a, b) {
    const x = p.lng;
    const y = p.lat;
    const x1 = a.lng;
    const y1 = a.lat;
    const dx = b.lng - x1;
    const dy = b.lat - y1;
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : ((x - x1) * dx + (y - y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return asLatLng(y1 + t * dy, x1 + t * dx);
  }

  /**
   * Nearest point on a route polyline to `latlng`.
   * `coordinates` may be LatLng objects or [lat, lng] / GeoJSON [lng, lat] via asLatLng.
   */
  function nearestOnRoute(latlng, coordinates) {
    if (!coordinates || coordinates.length < 2) return null;
    const p = asLatLng(latlng);
    if (!p) return null;
    let best = null;
    for (let i = 0; i < coordinates.length - 1; i++) {
      const a = asLatLng(coordinates[i]);
      const b = asLatLng(coordinates[i + 1]);
      if (!a || !b) continue;
      const proj = projectOnSegment(p, a, b);
      const d = distanceMeters(p, proj);
      if (!best || d < best.distance) {
        best = {
          point: proj,
          distance: d,
          index: i,
          bearing: bearingBetween(a, b),
        };
      }
    }
    return best;
  }

  const mapCfg = global.TTMS_MAP_CONFIG || global.DELIVERY_CONFIG || {};
  const mapServiceUrl = String(mapCfg.mapServiceUrl || 'https://maps.ttmenus.com').replace(/\/$/, '');
  const STYLES = {
    day: mapCfg.dayStyle || '/src/map/styles/ttmenus-day.json',
    dark: mapCfg.nightStyle || '/src/map/styles/ttmenus-dark.json',
    fallbackDay: '/src/map/styles/ttmenus-day.json',
    fallbackDark: '/src/map/styles/ttmenus-dark.json',
    mapServiceUrl: mapServiceUrl,
    dataSource: mapCfg.dataSource || 'trinidad-tobago',
  };

  // [SW, NE] as [lng, lat] — padded around Trinidad & Tobago
  const TT_BOUNDS = [
    [-63.0, 9.2],
    [-59.5, 12.2],
  ];

  let idSeq = 0;
  function uid(prefix) {
    return prefix + '-' + ++idSeq;
  }

  function styleIsReady(map) {
    try {
      return !!(map && typeof map.isStyleLoaded === 'function' && map.isStyleLoaded() && map.getStyle());
    } catch (_) {
      return false;
    }
  }

  function whenStyleReady(map, fn, attempt) {
    if (!map || typeof fn !== 'function') return;
    const n = attempt || 0;
    if (n > 12) {
      console.warn('whenStyleReady: style never settled');
      try {
        fn();
      } catch (e) {
        console.error(e);
      }
      return;
    }
    if (styleIsReady(map)) {
      try {
        fn();
      } catch (e) {
        const msg = String((e && e.message) || e || '');
        if (n < 12 && /not done loading|unloaded|does not exist|missing/i.test(msg)) {
          map.once('idle', function () {
            whenStyleReady(map, fn, n + 1);
          });
          return;
        }
        console.error('whenStyleReady callback failed:', e);
      }
      return;
    }
    const ev = n < 3 ? 'style.load' : 'idle';
    map.once(ev, function () {
      whenStyleReady(map, fn, n + 1);
    });
  }

  function normalizeLineCoords(coordinates) {
    return (coordinates || []).map(function (c) {
      if (Array.isArray(c) && c.length >= 2) {
        const a = Number(c[0]);
        const b = Number(c[1]);
        if (Math.abs(a) <= 90 && Math.abs(b) <= 90) {
          const aLooksLng = a < -30 || a > 30;
          const bLooksLng = b < -30 || b > 30;
          if (aLooksLng && !bLooksLng) return [a, b];
          if (bLooksLng && !aLooksLng) return [b, a];
          return [a, b];
        }
        if (Math.abs(a) > 90) return [a, b];
        return [b, a];
      }
      const ll = asLatLng(c);
      return [ll.lng, ll.lat];
    });
  }

  // ---------- Marker (0×0 tip anchor; pin + label absolutely positioned) ----------
  class Marker {
    constructor(latlng, options) {
      this.options = Object.assign({ title: '', opacity: 1, zIndexOffset: 0 }, options || {});
      this._ll = asLatLng(latlng);
      this._map = null;
      this._ml = null;
      this._el = null;
      this._labelHost = null;
      this._tooltip = null;
      this._tooltipEl = null;
      this._pin = this.options.pin || null;
      this._opacity = this.options.opacity;
      this._bearing = Number.isFinite(this.options.bearing) ? this.options.bearing : null;
      this._handlers = {};
      this.id = uid('m');
      // App metadata (filters / panel)
      this.menuData = null;
      this.locationData = null;
      this.actualLatLng = this._ll;
      this.subcategories = null;
      this.locationType = null;
      this.locationAddress = null;
      this.isOpen = false;
    }

    getLatLng() {
      return this._ll;
    }

    setLatLng(ll) {
      this._ll = asLatLng(ll);
      this.actualLatLng = this._ll;
      if (this._ml) this._ml.setLngLat([this._ll.lng, this._ll.lat]);
      return this;
    }

    setPin(pin) {
      this._pin = pin;
      if (!this._map || !this._el) {
        if (this._map) {
          this._detach({ animated: false });
          this._attach();
        }
        return this;
      }
      // In-place update — avoid full detach/attach (keeps clusters smooth)
      const pinEl = this._el.querySelector('.ttms-ml-marker-pin');
      if (pinEl) {
        const size = this._pinSize();
        pinEl.style.width = size[0] + 'px';
        pinEl.style.height = size[1] + 'px';
        pinEl.style.left = -Math.round(size[0] / 2) + 'px';
        pinEl.style.bottom = this._pinAnchorBottom(size);
        pinEl.innerHTML = (this._pin && this._pin.html) || '';
        if (this._labelHost) {
          const labelLift = this._pin && this._pin.anchor === 'center'
            ? Math.round(size[1] / 2) + 2
            : size[1] + 2;
          this._labelHost.style.bottom = labelLift + 'px';
        }
        this._applyBearing();
      } else {
        const tipOpen = this.isTooltipOpen();
        this._detach({ animated: false });
        this._attach();
        if (tipOpen) this.openTooltip();
      }
      return this;
    }

    /** Update nav-car aspect from compass bearing (0=north). */
    setBearing(deg) {
      if (!Number.isFinite(deg)) return this;
      this._bearing = ((deg % 360) + 360) % 360;
      this._applyBearing();
      return this;
    }

    _applyBearing() {
      if (!this._el) return;
      const bearing = this._bearing == null ? 0 : this._bearing;
      if (typeof window.TTMSApplyNavCarBearing === 'function' &&
          this._el.querySelector('.ttms-map-pin--car')) {
        window.TTMSApplyNavCarBearing(this._el, bearing);
        return;
      }
      if (this._bearing == null) return;
      const target = this._el.querySelector('.ttms-map-pin--car');
      if (target) {
        target.style.transform = 'rotate(' + this._bearing + 'deg)';
      }
    }

    setOpacity(o) {
      this._opacity = o;
      if (this._el) this._el.style.opacity = String(o);
      return this;
    }

    on(type, fn) {
      (this._handlers[type] = this._handlers[type] || []).push(fn);
      return this;
    }

    fire(type, data) {
      (this._handlers[type] || []).forEach((fn) => {
        try {
          fn(Object.assign({ type, target: this }, data || {}));
        } catch (e) {
          console.warn(e);
        }
      });
      return this;
    }

    _pinSize() {
      return (this._pin && this._pin.size) || [48, 60];
    }

    _pinAnchorBottom(size) {
      // Centered markers (nav car) sit on the lat/lng; teardrop pins tip at bottom.
      if (this._pin && this._pin.anchor === 'center') {
        return -Math.round(size[1] / 2) + 'px';
      }
      return '0';
    }

    _buildEl() {
      const size = this._pinSize();
      // CRITICAL: root is a 0×0 point at the geographic tip.
      // MapLibre transforms this point; pin/label are absolute children and
      // cannot change the anchor box (fixes pan/zoom drift).
      const root = document.createElement('div');
      root.className = 'ttms-ml-marker-root';
      root.style.width = '0';
      root.style.height = '0';
      root.style.opacity = String(this._opacity);
      if (this.options.title) root.title = this.options.title;

      const pin = document.createElement('div');
      pin.className = 'ttms-ml-marker-pin ttms-map-pin__wrap';
      pin.style.width = size[0] + 'px';
      pin.style.height = size[1] + 'px';
      pin.style.left = -Math.round(size[0] / 2) + 'px';
      pin.style.bottom = this._pinAnchorBottom(size);
      pin.innerHTML = (this._pin && this._pin.html) || '';
      root.appendChild(pin);
      this._el = root;
      this._applyBearing();

      const labelHost = document.createElement('div');
      labelHost.className = 'ttms-ml-label-host';
      labelHost.style.left = '0';
      const labelLift = this._pin && this._pin.anchor === 'center'
        ? Math.round(size[1] / 2) + 2
        : size[1] + 2;
      labelHost.style.bottom = labelLift + 'px';
      root.appendChild(labelHost);
      this._labelHost = labelHost;

      root.addEventListener('click', (e) => {
        e.stopPropagation();
        this.fire('click', { originalEvent: e });
      });
      // Hover labels (permanent labels are opened in _attach when zoom is high)
      root.addEventListener('mouseenter', () => {
        if (this._tooltip && !this._tooltip.permanent) this.openTooltip();
      });
      root.addEventListener('mouseleave', () => {
        if (this._tooltip && !this._tooltip.permanent) this.closeTooltip();
      });
      return root;
    }

    _attach() {
      if (!this._map) return;
      // Cancel an in-progress exit and play enter again
      if (this._ml && this._el) {
        this._cancelExit();
        this._playEnter();
        return;
      }
      if (this._ml) return;
      const el = this._buildEl();
      // Anchor the 0×0 tip point exactly on the lat/lng
      this._ml = new maplibregl.Marker({
        element: el,
        anchor: 'center',
        offset: [0, 0],
        draggable: !!this.options.draggable,
      })
        .setLngLat([this._ll.lng, this._ll.lat])
        .addTo(this._map);
      if (this.options.draggable && this._ml && typeof this._ml.on === 'function') {
        this._ml.on('dragend', () => {
          const ll = this._ml.getLngLat();
          this._ll = asLatLng(ll.lat, ll.lng);
          this.actualLatLng = this._ll;
          this.fire('dragend', { latlng: this._ll });
        });
      }
      this._applyZIndex();
      if (this._tooltip && this._tooltip.permanent) this.openTooltip();
      this._playEnter();
    }

    _playEnter() {
      if (!this._el) return;
      this._el.classList.remove('ttms-marker-exit');
      this._el.classList.remove('ttms-marker-enter');
      const j = ttmsApplyMarkerAnimJitter(this._el, 'in');
      // Restart CSS animation
      void this._el.offsetWidth;
      this._el.classList.add('ttms-marker-enter');
      const el = this._el;
      const clear = () => {
        if (this._el === el) {
          el.classList.remove('ttms-marker-enter');
          el.style.removeProperty('--ttms-marker-anim-delay');
          el.style.removeProperty('--ttms-marker-anim-dur');
        }
      };
      el.addEventListener('animationend', clear, { once: true });
      setTimeout(clear, j.totalMs);
    }

    _cancelExit() {
      if (this._exitTimer) {
        clearTimeout(this._exitTimer);
        this._exitTimer = null;
      }
      if (this._el) this._el.classList.remove('ttms-marker-exit');
    }

    _applyZIndex() {
      const z = 200 + (Number(this.options.zIndexOffset) || 0);
      const el = this._ml && this._ml.getElement ? this._ml.getElement() : this._el;
      if (el) {
        el.style.zIndex = String(z);
        el.classList.toggle('ttms-ml-marker--raised', z >= 500);
      }
      return this;
    }

    setZIndexOffset(offset) {
      this.options.zIndexOffset = offset || 0;
      return this._applyZIndex();
    }

    /** @param {{ animated?: boolean }} [opts] */
    _detach(opts) {
      const animated = !opts || opts.animated !== false;
      this.closeTooltip();
      if (!this._ml) {
        this._el = null;
        this._labelHost = null;
        return;
      }
      const reduceMotion =
        typeof matchMedia === 'function' &&
        matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!animated || !this._el || reduceMotion) {
        this._forceDetach();
        return;
      }
      if (this._exitTimer) return;
      const j = ttmsApplyMarkerAnimJitter(this._el, 'out');
      this._el.classList.remove('ttms-marker-enter');
      this._el.classList.add('ttms-marker-exit');
      this._exitTimer = setTimeout(() => {
        this._exitTimer = null;
        this._forceDetach();
      }, j.totalMs);
    }

    _forceDetach() {
      this._cancelExit();
      this.closeTooltip();
      if (this._ml) {
        this._ml.remove();
        this._ml = null;
      }
      this._el = null;
      this._labelHost = null;
    }

    addTo(map) {
      this._map = map;
      this._attach();
      return this;
    }

    remove() {
      this._detach({ animated: false });
      this._map = null;
      return this;
    }

    bindTooltip(html, opts) {
      this._tooltip = Object.assign({ permanent: false }, opts || {}, {
        content: html,
      });
      return this;
    }

    getTooltip() {
      if (!this._tooltip) return null;
      const marker = this;
      return {
        options: this._tooltip,
        setContent: (html) => {
          if (!marker._tooltip) return this;
          marker._tooltip.content = html;
          if (marker._tooltipEl) marker._tooltipEl.innerHTML = html;
          return this;
        },
        update: () => {
          if (marker._tooltipEl && marker._tooltip) {
            marker._tooltipEl.innerHTML = marker._tooltip.content;
          }
        },
      };
    }

    isTooltipOpen() {
      return !!this._tooltipEl;
    }

    openTooltip() {
      if (!this._tooltip) return this;
      if (!this._el && this._map) this._attach();
      if (!this._labelHost) return this;
      if (!this._tooltipEl) {
        const el = document.createElement('div');
        el.className = 'ttms-ml-tooltip';
        el.innerHTML = this._tooltip.content;
        this._labelHost.appendChild(el);
        this._tooltipEl = el;
      } else {
        this._tooltipEl.innerHTML = this._tooltip.content;
        if (this._tooltipEl.parentNode !== this._labelHost) {
          this._labelHost.appendChild(this._tooltipEl);
        }
      }
      return this;
    }

    closeTooltip() {
      if (this._tooltipEl && this._tooltipEl.parentNode) {
        this._tooltipEl.parentNode.removeChild(this._tooltipEl);
      }
      this._tooltipEl = null;
      return this;
    }

    _positionTooltip() {
      // Label is a child of the 0×0 tip root — moves with MapLibre transform
    }

    openPopup() {
      this.fire('click');
      return this;
    }
  }

  // ---------- Circle (GeoJSON) ----------
  class Circle {
    constructor(latlng, options) {
      this._ll = asLatLng(latlng);
      this.options = Object.assign(
        { radius: 100, color: '#6fa1ec', fillColor: '#6fa1ec', fillOpacity: 0.2, weight: 2 },
        options || {}
      );
      this._map = null;
      this.id = uid('circle');
    }

    setLatLng(ll) {
      this._ll = asLatLng(ll);
      this._paint();
      return this;
    }

    setRadius(r) {
      this.options.radius = r;
      this._paint();
      return this;
    }

    addTo(map) {
      this._map = map;
      this._paint();
      map.on('zoom', this._onZoom);
      return this;
    }

    remove() {
      if (this._map) {
        this._map.off('zoom', this._onZoom);
        if (this._map.getLayer(this.id)) this._map.removeLayer(this.id);
        if (this._map.getSource(this.id)) this._map.removeSource(this.id);
      }
      this._map = null;
      return this;
    }

    _onZoom = () => {
      if (this._map && this._map.getLayer(this.id)) {
        this._map.setPaintProperty(this.id, 'circle-radius', this._pxRadius());
      }
    };

    _pxRadius() {
      if (!this._map) return 10;
      const lat = this._ll.lat;
      const zoom = this._map.getZoom();
      const mpp =
        (40075016.686 * Math.abs(Math.cos((lat * Math.PI) / 180))) / Math.pow(2, zoom + 8);
      return Math.max(2, this.options.radius / mpp);
    }

    _paint() {
      if (!this._map) return;
      const geo = {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [this._ll.lng, this._ll.lat] },
      };
      if (this._map.getSource(this.id)) {
        this._map.getSource(this.id).setData(geo);
        this._map.setPaintProperty(this.id, 'circle-radius', this._pxRadius());
      } else {
        const add = () => {
          if (this._map.getSource(this.id)) return;
          this._map.addSource(this.id, { type: 'geojson', data: geo });
          this._map.addLayer({
            id: this.id,
            type: 'circle',
            source: this.id,
            paint: {
              'circle-radius': this._pxRadius(),
              'circle-color': this.options.fillColor || this.options.color,
              'circle-opacity': this.options.fillOpacity,
              'circle-stroke-color': this.options.color,
              'circle-stroke-width': this.options.weight || 2,
              'circle-stroke-opacity': 0.55,
            },
          });
        };
        if (this._map.isStyleLoaded()) add();
        else this._map.once('idle', add);
      }
    }
  }

  // ---------- Route line ----------
  class RouteLine {
    constructor(coordinates, options) {
      this._coords = normalizeLineCoords(coordinates);
      this.options = Object.assign(
        { color: '#3943e7', weight: 6, opacity: 0.8, dashed: false },
        options || {}
      );
      this._map = null;
      this.id = uid('route');
    }

    addTo(map) {
      this._map = map;
      this._paint();
      return this;
    }

    setCoordinates(coordinates) {
      this._coords = normalizeLineCoords(coordinates);
      return this._paint();
    }

    setStyle(style) {
      Object.assign(this.options, style || {});
      if (this._map && this._map.getLayer(this.id)) {
        this._map.setPaintProperty(this.id, 'line-color', this.options.color);
        this._map.setPaintProperty(this.id, 'line-width', this.options.weight);
        this._map.setPaintProperty(this.id, 'line-opacity', this.options.opacity);
        try {
          this._map.setPaintProperty(
            this.id,
            'line-dasharray',
            this.options.dashed ? [1.6, 1.4] : [1, 0]
          );
        } catch (_) {}
        return this;
      }
      this._paint();
      return this;
    }

    remove() {
      if (this._map) {
        try {
          if (this._map.getLayer(this.id)) this._map.removeLayer(this.id);
          if (this._map.getSource(this.id)) this._map.removeSource(this.id);
        } catch (e) {
          console.warn('RouteLine.remove:', e);
        }
      }
      this._map = null;
      return this;
    }

    _applyLayer(map, geo) {
      if (map.getSource(this.id)) {
        map.getSource(this.id).setData(geo);
      } else {
        map.addSource(this.id, { type: 'geojson', data: geo });
      }
      const paint = {
        'line-color': this.options.color,
        'line-width': this.options.weight,
        'line-opacity': this.options.opacity,
      };
      if (this.options.dashed) paint['line-dasharray'] = [1.6, 1.4];
      if (!map.getLayer(this.id)) {
        map.addLayer({
          id: this.id,
          type: 'line',
          source: this.id,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: paint,
        });
      } else {
        map.setPaintProperty(this.id, 'line-color', this.options.color);
        map.setPaintProperty(this.id, 'line-width', this.options.weight);
        map.setPaintProperty(this.id, 'line-opacity', this.options.opacity);
        try {
          map.setPaintProperty(
            this.id,
            'line-dasharray',
            this.options.dashed ? [1.6, 1.4] : undefined
          );
        } catch (_) {}
      }
      if (!map.getLayer(this.id)) throw new Error('route layer missing');
    }

    _paint() {
      const map = this._map;
      if (!map) return Promise.resolve(false);
      if (!this._coords || this._coords.length < 2) {
        console.warn('RouteLine: not enough coordinates', this._coords && this._coords.length);
        return Promise.resolve(false);
      }
      const geo = {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: this._coords },
      };
      return new Promise((resolve) => {
        whenStyleReady(map, () => {
          if (this._map !== map) {
            resolve(false);
            return;
          }
          this._applyLayer(map, geo);
          resolve(true);
        });
      });
    }
  }

  // ---------- Cluster group (Supercluster + HTML markers) ----------
  function ttmsMarkerAnimJitter(kind) {
    // Slight random stagger so pins/clusters don't bounce in lockstep
    const enter = kind !== 'out';
    const delayMs = enter
      ? Math.floor(Math.random() * 140) // 0–140ms
      : Math.floor(Math.random() * 70);
    const durMs = enter
      ? 380 + Math.floor(Math.random() * 100) // 380–480ms
      : 180 + Math.floor(Math.random() * 60);
    return {
      delayMs,
      durMs,
      totalMs: delayMs + durMs + 40,
      delay: (delayMs / 1000).toFixed(3) + 's',
      dur: (durMs / 1000).toFixed(3) + 's',
    };
  }

  function ttmsApplyMarkerAnimJitter(el, kind) {
    if (!el) return ttmsMarkerAnimJitter(kind);
    const j = ttmsMarkerAnimJitter(kind);
    el.style.setProperty('--ttms-marker-anim-delay', j.delay);
    el.style.setProperty('--ttms-marker-anim-dur', j.dur);
    return j;
  }

  function ttmsClusterSizeClass(count) {
    const n = Number(count) || 0;
    if (n < 5) return 'tiny';
    if (n < 10) return 'small';
    if (n < 25) return 'medium';
    if (n < 50) return 'large';
    return 'xl';
  }

  function ttmsSyncClusterEl(el, count) {
    if (!el) return;
    const size = ttmsClusterSizeClass(count);
    // Preserve MapLibre anchor classes — wiping them breaks lat/lng placement
    const keep = [];
    el.classList.forEach((c) => {
      if (c.indexOf('maplibregl-') === 0 || c.indexOf('ttms-marker-') === 0) keep.push(c);
    });
    el.className = ['marker-cluster', 'marker-cluster-' + size].concat(keep).join(' ');
    const span = el.querySelector('span');
    if (span) span.textContent = String(count);
  }

  class ClusterGroup {
    constructor(options) {
      this.options = Object.assign({ maxClusterRadius: 44 }, options || {});
      this._markers = [];
      this._map = null;
      this._index = null;
      this._indexDirty = true;
      this._clusterMarkers = new Map(); // cluster_id -> maplibregl.Marker
      this._visibleIds = new Set(); // currently shown venue marker ids
      this._layers = {};
      this._handlers = {};
      this._raf = null;
      this._moveTimer = null;
      this._lastRefreshKey = '';
      this._onMove = () => {
        // Debounce pan/zoom cluster updates — RAF alone still fires too often during inertia
        if (this._moveTimer) clearTimeout(this._moveTimer);
        this._moveTimer = setTimeout(() => {
          this._moveTimer = null;
          this.refresh();
        }, 64);
      };
    }

    on(type, fn) {
      (this._handlers[type] = this._handlers[type] || []).push(fn);
      return this;
    }

    fire(type, data) {
      (this._handlers[type] || []).forEach((fn) => fn(Object.assign({ type }, data || {})));
      return this;
    }

    addLayer(marker) {
      return this.addLayers([marker]);
    }

    /** Batch-add markers with a single Supercluster rebuild (critical for load perf). */
    addLayers(markerList) {
      const list = markerList || [];
      let added = 0;
      list.forEach((marker) => {
        if (!marker || this._markers.indexOf(marker) !== -1) return;
        this._markers.push(marker);
        this._layers[marker.id] = marker;
        added++;
      });
      if (added) {
        this._indexDirty = true;
        this._scheduleRefresh();
      }
      return this;
    }

    removeLayer(marker) {
      const i = this._markers.indexOf(marker);
      if (i !== -1) this._markers.splice(i, 1);
      if (marker) {
        delete this._layers[marker.id];
        this._visibleIds.delete(marker.id);
        if (marker._ml) marker._detach({ animated: false });
        else marker.remove();
      }
      this._indexDirty = true;
      this._scheduleRefresh();
      return this;
    }

    /**
     * Swap the active marker set without destroying Marker instances.
     * Used by filters — O(n) index rebuild once, no DOM thrash of pin HTML.
     */
    setMarkers(markerList) {
      const next = (markerList || []).filter(Boolean);
      const nextSet = new Set(next);
      // Detach markers leaving the active set
      this._markers.forEach((m) => {
        if (!nextSet.has(m) && m._ml) m._detach({ animated: false });
      });
      this._markers = next.slice();
      this._layers = {};
      next.forEach((m) => {
        this._layers[m.id] = m;
      });
      this._visibleIds.clear();
      this._clearClusterBubbles(false);
      this._indexDirty = true;
      this._scheduleRefresh();
      return this;
    }

    clearLayers() {
      this._clearAllVisuals(false);
      this._markers.forEach((m) => {
        if (m && m._ml) m._detach({ animated: false });
      });
      this._markers = [];
      this._layers = {};
      this._indexDirty = true;
      return this;
    }

    hasLayer(marker) {
      return this._markers.indexOf(marker) !== -1;
    }

    eachLayer(fn) {
      this._markers.forEach(fn);
      return this;
    }

    getLayers() {
      return this._markers.slice();
    }

    refreshClusters() {
      this._indexDirty = true;
      return this.refresh();
    }

    addTo(map) {
      this._map = map;
      map._ttmsClusterGroup = this;
      map.on('moveend', this._onMove);
      // zoomend also fires moveend in MapLibre — avoid double refresh
      this.refresh();
      return this;
    }

    remove() {
      this._clearAllVisuals(false);
      if (this._map) {
        this._map.off('moveend', this._onMove);
        if (this._map._ttmsClusterGroup === this) this._map._ttmsClusterGroup = null;
      }
      this._map = null;
      return this;
    }

    _scheduleRefresh() {
      if (this._raf) cancelAnimationFrame(this._raf);
      this._raf = requestAnimationFrame(() => {
        this._raf = null;
        this.refresh();
      });
    }

    /** @param {boolean} [animated] */
    _clearClusterBubbles(animated) {
      if (animated) {
        this._clusterMarkers.forEach((mlm, cid) => {
          this._removeClusterAnimated(cid, mlm);
        });
        return;
      }
      this._clusterMarkers.forEach((mlm) => mlm.remove());
      this._clusterMarkers.clear();
    }

    /** @param {boolean} [animated] */
    _clearAllVisuals(animated) {
      this._clearClusterBubbles(!!animated);
      this._markers.forEach((m) => {
        if (m && m._ml) m._detach({ animated: !!animated });
      });
      this._visibleIds.clear();
    }

    _playClusterEnter(el) {
      if (!el) return;
      el.classList.remove('ttms-marker-exit');
      el.classList.remove('ttms-marker-enter');
      const j = ttmsApplyMarkerAnimJitter(el, 'in');
      void el.offsetWidth;
      el.classList.add('ttms-marker-enter');
      const clear = () => {
        el.classList.remove('ttms-marker-enter');
        el.style.removeProperty('--ttms-marker-anim-delay');
        el.style.removeProperty('--ttms-marker-anim-dur');
      };
      el.addEventListener('animationend', clear, { once: true });
      setTimeout(clear, j.totalMs);
    }

    _removeClusterAnimated(cid, mlm) {
      const el = mlm && mlm.getElement ? mlm.getElement() : null;
      const reduceMotion =
        typeof matchMedia === 'function' &&
        matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!el || reduceMotion) {
        if (mlm) mlm.remove();
        this._clusterMarkers.delete(cid);
        return;
      }
      if (el.classList.contains('ttms-marker-exit')) return;
      const j = ttmsApplyMarkerAnimJitter(el, 'out');
      el.classList.remove('ttms-marker-enter');
      el.classList.add('ttms-marker-exit');
      setTimeout(() => {
        if (this._clusterMarkers.get(cid) !== mlm) return;
        // Still exiting (was not revived by a later refresh)
        if (el.classList.contains('ttms-marker-exit')) {
          mlm.remove();
          if (this._clusterMarkers.get(cid) === mlm) this._clusterMarkers.delete(cid);
        }
      }, j.totalMs);
    }

    _ensureIndex() {
      if (!this._indexDirty && this._index) return;
      const features = this._markers.map((m, index) => {
        const ll = m.getLatLng();
        return {
          type: 'Feature',
          properties: { index, id: m.id },
          geometry: { type: 'Point', coordinates: [ll.lng, ll.lat] },
        };
      });
      if (typeof Supercluster === 'undefined') {
        this._index = null;
        this._indexDirty = false;
        return;
      }
      this._index = new Supercluster({
        // ~pin width: merge when markers visually touch / overlap
        radius: this.options.maxClusterRadius || 44,
        // Keep clustered through mid zoom; individual pins appear later
        maxZoom: this.options.clusterMaxZoom != null ? this.options.clusterMaxZoom : 15,
        minPoints: 2,
      });
      this._index.load(features);
      this._indexDirty = false;
    }

    refresh() {
      if (!this._map) return this;

      const b = this._map.getBounds();
      // Floor keeps clusters together a bit longer while zooming in
      const zoom = Math.max(0, Math.floor(this._map.getZoom() + 1e-6));
      const refreshKey =
        zoom +
        ':' +
        b.getWest().toFixed(3) +
        ':' +
        b.getSouth().toFixed(3) +
        ':' +
        b.getEast().toFixed(3) +
        ':' +
        b.getNorth().toFixed(3) +
        ':' +
        this._markers.length;
      // Skip no-op refreshes (same viewport + same marker set)
      if (!this._indexDirty && refreshKey === this._lastRefreshKey) return this;

      this._ensureIndex();
      this._lastRefreshKey = refreshKey;

      // No Supercluster: show all markers once
      if (!this._index) {
        this._markers.forEach((m) => {
          if (!m._ml) m.addTo(this._map);
          this._visibleIds.add(m.id);
        });
        return this;
      }

      const pad = 0.08;
      const west = b.getWest() - (b.getEast() - b.getWest()) * pad;
      const east = b.getEast() + (b.getEast() - b.getWest()) * pad;
      const south = b.getSouth() - (b.getNorth() - b.getSouth()) * pad;
      const north = b.getNorth() + (b.getNorth() - b.getSouth()) * pad;

      const clusters = this._index.getClusters([west, south, east, north], zoom);

      const nextVenueIds = new Set();
      const nextClusterIds = new Set();

      clusters.forEach((c) => {
        if (c.properties.cluster) {
          const cid = String(c.properties.cluster_id);
          nextClusterIds.add(cid);
          let mlm = this._clusterMarkers.get(cid);
          if (!mlm) {
            const count = c.properties.point_count;
            const el = document.createElement('div');
            el.innerHTML =
              '<div class="marker-cluster__visual"><div><span>' + count + '</span></div></div>';
            ttmsSyncClusterEl(el, count);
            el.dataset.clusterId = cid;
            mlm = new maplibregl.Marker({ element: el, anchor: 'center' })
              .setLngLat(c.geometry.coordinates)
              .addTo(this._map);
            // Clusters stay under individual / selected pins
            const clusterEl = mlm.getElement ? mlm.getElement() : el;
            if (clusterEl) clusterEl.style.zIndex = '2';
            el.addEventListener('click', (e) => {
              e.stopPropagation();
              if (!this._index || !this._map) return;
              const liveId = Number(el.dataset.clusterId);
              if (!Number.isFinite(liveId)) return;
              let z = 18;
              try {
                z = Math.min(this._index.getClusterExpansionZoom(liveId), 18);
              } catch (_) {
                z = Math.min((this._map.getZoom() || 0) + 2, 18);
              }
              const ll = mlm.getLngLat();
              this._map.easeTo({
                center: [ll.lng, ll.lat],
                zoom: z,
                duration: 380,
                easing: (t) => 1 - Math.pow(1 - t, 2.2),
              });
              this.fire('clusterclick');
            });
            this._clusterMarkers.set(cid, mlm);
            this._playClusterEnter(el);
          } else {
            const el = mlm.getElement ? mlm.getElement() : null;
            if (el) {
              el.dataset.clusterId = cid;
              const wasExiting = el.classList.contains('ttms-marker-exit');
              ttmsSyncClusterEl(el, c.properties.point_count);
              if (wasExiting) this._playClusterEnter(el);
            }
            // Re-apply after size/class sync so MapLibre recalculates anchor box
            mlm.setLngLat(c.geometry.coordinates);
          }
        } else {
          const marker = this._markers[c.properties.index];
          if (!marker) return;
          nextVenueIds.add(marker.id);
          if (!marker._ml) {
            marker.addTo(this._map);
          } else if (marker._el && marker._el.classList.contains('ttms-marker-exit')) {
            marker._attach();
          }
        }
      });

      // Hide ANY painted venue that Supercluster folded into a cluster (or left the view).
      // Must sweep all layers — not only ids that were previously in _visibleIds —
      // otherwise orphan pins stay stacked on top of / beside cluster bubbles.
      this._markers.forEach((m) => {
        if (!m || !m._ml) return;
        if (!nextVenueIds.has(m.id)) m._detach({ animated: false });
      });
      this._visibleIds = nextVenueIds;

      // Remove cluster bubbles that are gone (instant — bounce is enter-only)
      this._clusterMarkers.forEach((mlm, cid) => {
        if (!nextClusterIds.has(cid)) {
          mlm.remove();
          this._clusterMarkers.delete(cid);
        }
      });

      return this;
    }
  }

  // ---------- OSRM routing ----------
  function formatManeuver(step) {
    const m = step.maneuver || {};
    const modRaw = (m.modifier || '').replace(/_/g, ' ').trim().toLowerCase();
    const type = (m.type || '').replace(/_/g, ' ').trim().toLowerCase();
    const road = (step.name || '').trim();
    const onto = road ? ' onto ' + road : '';
    const on = road ? ' on ' + road : '';

    if (type === 'depart') {
      const dir = modRaw || 'forward';
      return 'Head ' + dir + on;
    }
    if (type === 'arrive') return 'You have arrived at your destination';
    if (type === 'roundabout' || type === 'rotary') {
      const exit = m.exit != null ? ' and take exit ' + m.exit : '';
      return 'Enter the traffic circle' + exit + onto;
    }
    if (type === 'merge') return 'Merge' + onto;
    if (type === 'fork') {
      if (modRaw) return 'Keep ' + modRaw + ' at the fork' + onto;
      return 'Keep going at the fork' + onto;
    }
    if (type === 'end of road') {
      if (modRaw) return 'Turn ' + modRaw + ' at the end of the road' + onto;
      return 'Continue at the end of the road' + onto;
    }
    if (type === 'new name') return 'Continue' + onto;
    if (type === 'notification') return road ? 'Continue on ' + road : 'Continue';
    if (type === 'on ramp' || type === 'off ramp') {
      if (modRaw) return 'Take the ramp and turn ' + modRaw + onto;
      return 'Take the ramp' + onto;
    }

    if (modRaw === 'uturn' || modRaw === 'u turn') {
      return 'Make a U-turn' + onto;
    }
    if (modRaw === 'straight') {
      return 'Continue straight' + onto;
    }
    if (modRaw) {
      // left | right | slight left | slight right | sharp left | sharp right
      return 'Turn ' + modRaw + onto;
    }

    if (type === 'continue' || type === 'turn') {
      return 'Continue' + onto;
    }
    if (type) {
      return type.charAt(0).toUpperCase() + type.slice(1) + onto;
    }
    return 'Continue' + onto;
  }

  class Router {
    constructor(map, options) {
      this._map = map;
      this.options = Object.assign(
        {
          serviceUrl:
            (global.TTMS_MAP_CONFIG && global.TTMS_MAP_CONFIG.osrmUrl) ||
            (global.DELIVERY_CONFIG && global.DELIVERY_CONFIG.osrmUrl) ||
            'https://osrm.ttmenus.com/route/v1',
          profile: 'driving',
          lineColor: '#3943e7',
          lineWeight: 6,
          lineOpacity: 0.8,
        },
        options || {}
      );
      this._line = null;
      this._markers = [];
      this._waypoints = [];
      this._handlers = {};
      this._routes = [];
    }

    on(type, fn) {
      (this._handlers[type] = this._handlers[type] || []).push(fn);
      return this;
    }

    fire(type, data) {
      (this._handlers[type] || []).forEach((fn) => fn(Object.assign({ type, target: this }, data || {})));
      return this;
    }

    getWaypoints() {
      return this._waypoints.map((ll) => ({ latLng: ll }));
    }

    setWaypoints(start, end) {
      if (Array.isArray(start) && end == null) {
        // Legacy: array of waypoint objects
        this._waypoints = start.map((w) => asLatLng(w.latLng || w));
      } else {
        this._waypoints = [asLatLng(start), asLatLng(end)];
      }
      return this;
    }

    _straightCoords() {
      const a = this._waypoints[0];
      const b = this._waypoints[1];
      if (!a || !b) return [];
      return [
        [a.lng, a.lat],
        [b.lng, b.lat],
      ];
    }

    _showLine(coordinates, opts) {
      const o = opts || {};
      if (!this._map || !coordinates || coordinates.length < 2) return Promise.resolve(false);
      this._lastCoords = coordinates;
      this._map._ttmsActiveRoute = this;
      const style = {
        color: this.options.lineColor,
        weight: this.options.lineWeight,
        opacity: o.fallback ? 0.75 : this.options.lineOpacity,
        dashed: !!o.fallback,
      };
      if (this._line) {
        this._line._map = this._map;
        Object.assign(this._line.options, style);
        return this._line.setCoordinates(coordinates);
      }
      this._line = new RouteLine(coordinates, style);
      this._line._map = this._map;
      return this._line._paint();
    }

    async route() {
      if (!this._map || this._waypoints.length < 2) return this;
      const requestMap = this._map;
      const requestId = (this._routeRequestId = (this._routeRequestId || 0) + 1);
      this.fire('routingstart', { waypoints: this.getWaypoints() });
      if (!this._line) this._showLine(this._straightCoords(), { fallback: true });
      const base = this.options.serviceUrl.replace(/\/$/, '');
      const coords = this._waypoints.map((w) => w.lng + ',' + w.lat).join(';');
      const url =
        base +
        '/' +
        this.options.profile +
        '/' +
        coords +
        '?overview=full&geometries=geojson&steps=true';

      const stillCurrent = () =>
        this._map && this._map === requestMap && this._routeRequestId === requestId;

      try {
        const res = await fetch(url);
        if (!stillCurrent()) return this;
        if (!res.ok) throw new Error('HTTP request failed status: ' + res.status);
        const data = await res.json();
        if (!stillCurrent()) return this;
        if (!data.routes || !data.routes.length) throw new Error('No routes found');

        const osrm = data.routes[0];
        const coordinates = (osrm.geometry && osrm.geometry.coordinates) || [];
        if (coordinates.length < 2) throw new Error('Route geometry missing');

        await this._showLine(coordinates);
        if (!stillCurrent()) return this;

        this._markers.forEach((m) => m.remove && m.remove());
        this._markers = [];
        if (typeof this.options.createMarker === 'function') {
          this._waypoints.forEach((wp, i) => {
            const m = this.options.createMarker(i, { latLng: wp });
            if (m) {
              m.addTo(this._map);
              this._markers.push(m);
            }
          });
        }

        const instructions = [];
        (osrm.legs || []).forEach((leg) => {
          (leg.steps || []).forEach((step) => {
            const loc = step.maneuver && step.maneuver.location;
            instructions.push({
              text: formatManeuver(step),
              distance: step.distance,
              time: step.duration,
              latLng: loc ? asLatLng(loc[1], loc[0]) : null,
              type: (step.maneuver && step.maneuver.type) || '',
              modifier: (step.maneuver && step.maneuver.modifier) || '',
            });
          });
        });

        this._routes = [
          {
            summary: { totalDistance: osrm.distance, totalTime: osrm.duration },
            coordinates: coordinates.map((c) => asLatLng(c[1], c[0])),
            instructions,
          },
        ];
        this.fire('routesfound', { routes: this._routes });
      } catch (err) {
        if (!stillCurrent()) return this;
        console.error('Routing error', err);
        await this._showLine(this._straightCoords(), { fallback: true });
        this.fire('routingerror', {
          error: { message: err.message || String(err), status: -1, url },
        });
      }
      return this;
    }

    clearVisuals() {
      if (this._line) {
        this._line.remove();
        this._line = null;
      }
      this._markers.forEach((m) => m.remove && m.remove());
      this._markers = [];
    }

    /** Re-add GeoJSON line after map.setStyle() wipes custom layers */
    repaint() {
      if (!this._map) return this;
      const coords =
        (this._line && this._line._coords) || this._lastCoords || this._straightCoords();
      if (coords && coords.length >= 2) this._showLine(coords);
      return this;
    }

    remove() {
      this._routeRequestId = (this._routeRequestId || 0) + 1;
      this.clearVisuals();
      if (this._map && this._map._ttmsActiveRoute === this) {
        this._map._ttmsActiveRoute = null;
      }
      this._map = null;
      return this;
    }

    get _lineRef() {
      return this._line;
    }
  }

  // ---------- Map factory ----------
  function createMap(containerId, options) {
    const opts = options || {};
    const el = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
    if (!el) throw new Error('Map container #' + containerId + ' not found');

    Array.prototype.slice.call(el.querySelectorAll('canvas')).forEach(function (c) {
      try {
        var gl = c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl');
        var ext = gl && gl.getExtension && gl.getExtension('WEBGL_lose_context');
        if (ext) ext.loseContext();
      } catch (_) {}
    });
    el.innerHTML = '';

    el.style.position = el.style.position || 'relative';
    const tipPane = document.createElement('div');
    tipPane.className = 'ttms-ml-tooltip-pane';
    el.appendChild(tipPane);

    const styleUrl = opts.style || STYLES.day;

    const map = new maplibregl.Map({
      container: el,
      style: styleUrl,
      center: opts.center || [-61.2287, 10.6677],
      zoom: opts.zoom != null ? opts.zoom : 9,
      minZoom: opts.minZoom != null ? opts.minZoom : 7,
      maxBounds: opts.maxBounds || TT_BOUNDS,
      attributionControl: false,
      logo: false,
      canvasContextAttributes: {
        antialias: false,
        preserveDrawingBuffer: false,
        failIfMajorPerformanceCaveat: false,
        powerPreference: 'low-power',
      },
    });

    map._ttmsTooltipPane = tipPane;
    map._ttmsStyleUrl = styleUrl;
    map.whenStyleReady = function (fn) {
      whenStyleReady(map, fn);
    };
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');

    // Mount +/- into footer stack (same row as locate; above journey when route is shown)
    const mountZoomControls = () => {
      try {
        const slot = document.getElementById('mapZoomSlot');
        const group = el.querySelector('.maplibregl-ctrl-top-left .maplibregl-ctrl-group');
        if (!slot || !group) return;
        if (group.parentElement !== slot) slot.appendChild(group);
        const topLeft = el.querySelector('.maplibregl-ctrl-top-left');
        if (topLeft) topLeft.classList.add('ttms-zoom-relocated');
      } catch (e) {}
    };
    mountZoomControls();
    map.once('load', mountZoomControls);

    // Slightly snappier scroll / trackpad zoom (MapLibre defaults: 1/100, 1/450)
    try {
      if (map.scrollZoom) {
        if (typeof map.scrollZoom.setZoomRate === 'function') map.scrollZoom.setZoomRate(1 / 75);
        if (typeof map.scrollZoom.setWheelZoomRate === 'function') map.scrollZoom.setWheelZoomRate(1 / 340);
      }
    } catch (e) {}

    // +/- control ease a bit quicker
    const _zoomIn = map.zoomIn.bind(map);
    const _zoomOut = map.zoomOut.bind(map);
    map.zoomIn = function (options) {
      return _zoomIn(Object.assign({ duration: 220 }, options || {}));
    };
    map.zoomOut = function (options) {
      return _zoomOut(Object.assign({ duration: 220 }, options || {}));
    };

    map.on('error', (e) => {
      const err = e && e.error ? e.error : e;
      console.error('MapLibre error:', err);
      const failed = String((err && (err.url || err.message)) || map._ttmsStyleUrl || '');
      if (map._ttmsStyleFellBack) return;
      if (/\/styles\/.+\/style\.json/i.test(failed) || /maps\.ttmenus\.com\/styles\//i.test(failed)) {
        map._ttmsStyleFellBack = true;
        const night = /dark|night/i.test(failed);
        const fallback = night ? STYLES.fallbackDark : STYLES.fallbackDay;
        if (typeof map.setTtmsStyle === 'function') map.setTtmsStyle(fallback);
        else if (typeof map.setStyle === 'function') map.setStyle(fallback);
      }
    });
    map.on('style.load', () => {
      const layers = (map.getStyle() && map.getStyle().layers) || [];
      console.log('✅ MapLibre style loaded:', layers.length, 'layers', layers.map((l) => l.id).join(', '));
      const active = map._ttmsActiveRoute;
      if (active && typeof active.repaint === 'function') {
        whenStyleReady(map, () => active.repaint());
      }
      map.fire('ttms:styleload');
    });

    const refreshTips = () => {
      // Cluster group / markers reposition their own tooltips on move
    };
    map.on('move', refreshTips);

    // Convenience helpers used by mapjscode
    map.setView = function (center, zoom, animOpts) {
      const ll = asLatLng(center);
      const cam = { center: [ll.lng, ll.lat], zoom: zoom != null ? zoom : map.getZoom() };
      if (animOpts && animOpts.animate === false) map.jumpTo(cam);
      else map.easeTo(Object.assign(cam, { duration: (animOpts && animOpts.duration) || 600 }));
      return map;
    };

    /**
     * Fit points into the visible map band.
     * Zoom is calculated each time via cameraForBounds(padding).
     * If padding is too large (MapLibre cannot-fit), padding is reduced until it works.
     */
    map.fitLatLngBounds = function (points, fitOpts) {
      const o = fitOpts || {};
      const bounds = new maplibregl.LngLatBounds();
      let count = 0;
      (points || []).forEach((p) => {
        const ll = asLatLng(p);
        if (!ll || !Number.isFinite(ll.lat) || !Number.isFinite(ll.lng)) return;
        bounds.extend([ll.lng, ll.lat]);
        count++;
      });
      if (!count) {
        console.warn('fitLatLngBounds: no valid points');
        return map;
      }

      const el = map.getContainer && map.getContainer();
      const h = (el && el.clientHeight) || 640;
      const w = (el && el.clientWidth) || 360;

      const clampPad = (padIn, maxFrac) => {
        // Allow up to ~58% chrome so filters+tray free-band fits are accurate
        const frac = maxFrac != null ? maxFrac : 0.58;
        let pad =
          padIn == null
            ? { top: 88, bottom: 100, left: 28, right: 28 }
            : typeof padIn === 'number'
              ? { top: padIn, bottom: padIn, left: padIn, right: padIn }
              : {
                  top: Number(padIn.top) || 64,
                  bottom: Number(padIn.bottom) || 64,
                  left: Number(padIn.left) || 24,
                  right: Number(padIn.right) || 24,
                };
        // Leave enough free canvas — oversized padding causes cannot-fit
        const maxTB = Math.min(h * frac, h - 150);
        if (pad.top + pad.bottom > maxTB) {
          const s = maxTB / (pad.top + pad.bottom);
          pad.top = Math.max(40, Math.round(pad.top * s));
          pad.bottom = Math.max(48, Math.round(pad.bottom * s));
        }
        const maxLR = w * 0.4;
        if (pad.left + pad.right > maxLR) {
          const s = maxLR / (pad.left + pad.right);
          pad.left = Math.max(14, Math.round(pad.left * s));
          pad.right = Math.max(14, Math.round(pad.right * s));
        }
        return pad;
      };

      if (count === 1 || bounds.getNorth() === bounds.getSouth() || bounds.getEast() === bounds.getWest()) {
        const c = bounds.getCenter();
        const d = o.pointPad != null ? o.pointPad : 0.01;
        bounds.extend([c.lng - d, c.lat - d]);
        bounds.extend([c.lng + d, c.lat + d]);
      }

      const maxZoom = o.maxZoom != null ? o.maxZoom : 16;
      const durationMs =
        o.animate === false ? 0 : (o.duration != null ? o.duration : 0.85) * 1000;

      try {
        if (typeof map.stop === 'function') map.stop();
      } catch (e) {}
      try {
        if (map.dragPan && map.dragPan.isEnabled && !map.dragPan.isEnabled()) map.dragPan.enable();
        if (map.scrollZoom && map.scrollZoom.isEnabled && !map.scrollZoom.isEnabled()) map.scrollZoom.enable();
      } catch (e) {}

      const toCenter = (center) => {
        if (!center) return null;
        if (Array.isArray(center)) return [Number(center[0]), Number(center[1])];
        const lng = Number(center.lng != null ? center.lng : center[0]);
        const lat = Number(center.lat != null ? center.lat : center[1]);
        return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
      };

      /** Returns true only when a valid camera was applied. */
      const tryFit = (pad, mz, dur, maxFrac) => {
        const padding = clampPad(pad, maxFrac);
        try {
          if (typeof map.cameraForBounds !== 'function') return false;
          const cam = map.cameraForBounds(bounds, { padding: padding, maxZoom: mz });
          const center = toCenter(cam && cam.center);
          // MapLibre warns cannot-fit and returns undefined / invalid zoom
          if (!center || !cam || !Number.isFinite(cam.zoom) || cam.zoom < 0) {
            return false;
          }
          const zoom = Math.min(cam.zoom, mz);
          if (!Number.isFinite(zoom) || zoom < 1) return false;
          const opts = {
            center: center,
            zoom: zoom,
            bearing: 0,
            pitch: 0,
            duration: dur,
            essential: true,
          };
          console.log('fitLatLngBounds camera', { zoom: zoom, padding: padding, mz: mz });
          if (dur <= 0 && typeof map.jumpTo === 'function') map.jumpTo(opts);
          else if (typeof map.easeTo === 'function') map.easeTo(opts);
          else map.fitBounds(bounds, { padding: padding, maxZoom: mz, duration: dur });
          return true;
        } catch (e) {
          console.warn('cameraForBounds failed', e);
          return false;
        }
      };

      const pad0 = o.padding || { top: 88, bottom: 100, left: 28, right: 28 };
      const startFrac = o.maxPadFrac != null ? o.maxPadFrac : 0.58;
      // Prefer real chrome first; shrink only if MapLibre cannot-fit
      const attempts = [
        [pad0, startFrac],
        [pad0, Math.min(startFrac, 0.5)],
        [
          {
            top: Math.round((pad0.top || 88) * 0.85),
            bottom: Math.round((pad0.bottom || 100) * 0.85),
            left: Math.round((pad0.left || 28) * 0.85),
            right: Math.round((pad0.right || 28) * 0.85),
          },
          0.45,
        ],
        [{ top: 72, bottom: 88, left: 24, right: 24 }, 0.38],
        [{ top: 48, bottom: 64, left: 16, right: 16 }, 0.32],
        [{ top: 28, bottom: 36, left: 12, right: 12 }, 0.28],
      ];
      for (let i = 0; i < attempts.length; i++) {
        if (tryFit(attempts[i][0], maxZoom, durationMs, attempts[i][1])) return map;
      }
      // Last resort: center on bounds mid zoom
      try {
        const c = bounds.getCenter();
        const z = Math.min(maxZoom, 11);
        console.warn('fitLatLngBounds fallback easeTo', { z: z });
        map.easeTo({ center: [c.lng, c.lat], zoom: z, duration: durationMs || 0, essential: true });
      } catch (e3) {}
      return map;
    };

    map.setTtmsStyle = function (url) {
      const prev = map._ttmsStyleUrl;
      if (prev === url) return map;
      map._ttmsStyleUrl = url;
      map.setStyle(url);
      return map;
    };

    return map;
  }

  function createPin(html, size, opts) {
    const o = opts || {};
    return {
      html: html,
      size: size || [48, 60],
      anchor: o.anchor || 'bottom',
    };
  }

  global.TTMSMap = {
    STYLES,
    TT_BOUNDS,
    latLng: asLatLng,
    distance: distanceMeters,
    bearingBetween,
    nearestOnRoute,
    createMap,
    Marker,
    Circle,
    RouteLine,
    ClusterGroup,
    Router,
    whenStyleReady,
    createPin,
    isMarker: (obj) => obj instanceof Marker,
    isRouteLine: (obj) => obj instanceof RouteLine,
  };
})(typeof window !== 'undefined' ? window : globalThis);
