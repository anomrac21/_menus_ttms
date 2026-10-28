/**
 * TTMenus Ads Client
 * Handles all ad loading operations with the ads-service backend
 */

// Prevent duplicate declarations (in case script is loaded multiple times)
(function() {
  'use strict';
  if (typeof window.AdsClient !== 'undefined') {
    console.warn('⚠️ AdsClient already exists, skipping re-initialization');
    return;
  }

  const AdsClient = {
  // Configuration
  config: {
    adsServiceUrl: 'https://ads.ttmenus.com',
    clientId: 'ttmenus',
  },

  isHomeSmoothNavMode() {
    return (
      document.documentElement.classList.contains('menu-nav-smooth') ||
      (document.body && document.body.classList.contains('menu-nav-smooth')) ||
      (typeof window.getMenuNavMode === 'function' && window.getMenuNavMode() === 'smooth')
    );
  },

  getHomeReelsScrollRoot() {
    if (this.isHomeSmoothNavMode()) return null;
    const track = document.getElementById('menu-reels-track');
    if (!track || !track.querySelector('#pageadscontainer')) return null;
    return track;
  },

  getHeaderScrollOffset() {
    const raw = (getComputedStyle(document.documentElement).getPropertyValue('--ttms-header-height') || '5em').trim();
    const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const emMatch = raw.match(/^([\d.]+)em$/);
    if (emMatch) return parseFloat(emMatch[1]) * rootPx;
    const pxMatch = raw.match(/^([\d.]+)px$/);
    if (pxMatch) return parseFloat(pxMatch[1]);
    return rootPx * 5;
  },

  // Get user's location if available
  userLocation: '',
  _displayGeneration: 0,
  _serviceFetchTimeoutMs: 6000,

  /**
   * Initialize ads client
   */
  init() {
    console.log('Ads Client initialized');
    this._watchAdsContainerEntrances();
    this.loadConfig();
    if (!document.getElementById('pageadscontainer')) return;
    if (document.getElementById('menu-reels-viewport')) {
      this.deferLoadUntilAdsSlideVisible();
      return;
    }
    this.loadAds();
  },

  deferLoadUntilAdsSlideVisible() {
    if (this._deferredAdsBound) return;
    this._deferredAdsBound = true;

    var self = this;
    var loaded = false;
    var run = function () {
      if (loaded) return;
      loaded = true;
      self.loadAds();
    };

    var slide = document.getElementById('menu-reels-sponsored-ads');
    var target = slide || document.getElementById('pageadscontainer');
    var scrollRoot = self.getHomeReelsScrollRoot();

    if (!target || typeof IntersectionObserver === 'undefined') {
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(run, { timeout: 12000 });
      } else {
        setTimeout(run, 8000);
      }
      return;
    }

    if (self.isHomeSmoothNavMode()) {
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(run, { timeout: 800 });
      } else {
        setTimeout(run, 200);
      }
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          observer.disconnect();
          run();
        });
      },
      scrollRoot
        ? { root: scrollRoot, rootMargin: '80% 0px', threshold: 0.01 }
        : { root: null, rootMargin: '100% 0px', threshold: 0.01 }
    );
    observer.observe(target);
  },

  /**
   * Load configuration from DOM data attributes
   */
  loadConfig() {
    const container = document.getElementById('pageadscontainer');
    if (!container) return;

    this.config.adsServiceUrl = container.getAttribute('data-ads-service-url') || 'https://ads.ttmenus.com';
    this.config.clientId = container.getAttribute('data-client-id') || 'ttmenus';
  },

  /**
   * Get config from data attributes: re-read on each call for Barba.js compatibility
   */
  getConfig() {
    const container = document.getElementById('pageadscontainer');
    if (!container) return null;
    
    const menuUrlAttr = container.getAttribute('data-menu-url');
    const menuUrl = menuUrlAttr || (window.location.origin + '/');

    return {
      container: container,
      clientId: container.getAttribute('data-client-id') || this.config.clientId,
      adsServiceUrl: container.getAttribute('data-ads-service-url') || this.config.adsServiceUrl,
      menuUrl: menuUrl,
      noCompetitorAds: container.getAttribute('data-no-competitor-ads') === 'true',
      currentDay: new Date().toLocaleDateString('en-US', { weekday: 'long' })
    };
  },

  resolveSiteOrigin() {
    return (typeof window !== 'undefined' && window.location && window.location.origin)
      ? window.location.origin
      : '';
  },

  resolveMenuBaseUrl(menuUrl) {
    const origin = this.resolveSiteOrigin();
    if (!menuUrl) return origin ? `${origin}/` : '/';
    let base = menuUrl;
    if (base.startsWith('//')) {
      base = `${window.location.protocol}${base}`;
    }
    return base.endsWith('/') ? base : `${base}/`;
  },

  absolutizeAssetUrl(url) {
    if (!url) return url;
    const origin = this.resolveSiteOrigin();
    // Fix stale localhost port baked in from a different Hugo dev port
    if (/^https?:\/\/(localhost|127\.0\.0\.1):\d+/i.test(url) && origin) {
      try {
        const parsed = new URL(url);
        return `${origin}${parsed.pathname}${parsed.search}`;
      } catch (_) { /* fall through */ }
    }
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('//')) return `${window.location.protocol}${url}`;
    if (url.startsWith('/')) return `${origin}${url}`;
    return `${origin}/${url}`;
  },

  /** Resolve image/link paths returned by ads-service (not the menu site). */
  resolveServiceAssetUrl(url, adsServiceUrl) {
    if (!url) return url;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('//')) return `${window.location.protocol}${url}`;
    const base = (adsServiceUrl || this.config.adsServiceUrl || '').replace(/\/$/, '');
    if (!base) return this.absolutizeAssetUrl(url);
    if (url.startsWith('/')) return `${base}${url}`;
    return `${base}/${url}`;
  },

  getServiceFetchTimeoutMs(adsServiceUrl) {
    const url = adsServiceUrl || '';
    if (/localhost|127\.0\.0\.1/.test(url)) return 15000;
    return 20000;
  },

  fetchWithTimeout(url, options = {}, timeoutMs) {
    const ms = timeoutMs || this._serviceFetchTimeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
  },

  _parseTime(str) {
    if (!str || typeof str !== 'string') return null;
    const m = String(str).trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (h < 0 || h > 23 || min < 0 || min > 59) return null;
    return h * 60 + min;
  },

  /** Prefer today's scheduled menu promos; fall back to full list if none match. */
  filterAdsByDay(ads) {
    if (!Array.isArray(ads) || ads.length === 0) return ads;
    const day = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
    const filtered = ads.filter((ad) => {
      if (!ad.daysofweek || ad.daysofweek.length === 0) return true;
      if (!ad.daysofweek.includes(day)) return false;
      if (ad.time_start != null || ad.time_finish != null) {
        const start = this._parseTime(String(ad.time_start || '00:00'));
        const finish = this._parseTime(String(ad.time_finish || '23:59'));
        if (start == null || finish == null) return false;
        if (start <= finish) return nowMins >= start && nowMins <= finish;
        return nowMins >= start || nowMins <= finish;
      }
      return true;
    });
    return filtered.length > 0 ? filtered : ads;
  },

  /** Normalize ads-service payload so reels display can read images/links. */
  normalizeServiceAds(ads, adsServiceUrl) {
    if (!Array.isArray(ads)) return [];
    const serviceBase = adsServiceUrl || this.config.adsServiceUrl;
    return ads.map((ad) => {
      const images = [];
      (ad.images || []).forEach((img) => {
        const raw = typeof img === 'string'
          ? img
          : (img.image_url || img.imageUrl || img.url || img.src || img.image);
        if (!raw) return;
        const url = this.resolveServiceAssetUrl(raw, serviceBase);
        images.push({
          image_url: url,
          imageUrl: url,
          url,
          image: url,
          alt_text: ad.title || 'Advertisement',
        });
      });
      let linkUrl = ad.link_url || ad.link || '#';
      if (linkUrl && linkUrl !== '#' && !linkUrl.startsWith('http')) {
        linkUrl = this.resolveServiceAssetUrl(
          linkUrl.startsWith('/') ? linkUrl : `/${linkUrl}`,
          serviceBase
        );
      }
      return {
        ...ad,
        images,
        link_url: linkUrl || '#',
        _source: 'service',
      };
    }).filter((ad) => ad.images.length > 0);
  },

  /**
   * Same order for the loader and the page ad section: a menu promotion, then an
   * ads-service clip, repeating. Each side is shuffled on its own first.
   */
  _interleaveReelAds(serviceAds, promoAds) {
    const promoFirst = this._shuffleArray([].concat(promoAds || []));
    const serviceFirst = this._shuffleArray([].concat(serviceAds || []));
    const raw = [];
    const mixCount = Math.max(promoFirst.length, serviceFirst.length);
    for (let i = 0; i < mixCount; i++) {
      if (i < promoFirst.length) raw.push(promoFirst[i]);
      if (i < serviceFirst.length) raw.push(serviceFirst[i]);
    }
    return raw;
  },

  /** Dedupe menu promotions and service clips, then interleave them. */
  mergeAdSources(menuAds, serviceAds, adsServiceUrl) {
    const seen = new Set();
    const promos = [];
    const service = [];
    const push = (list, ad) => {
      if (!ad || !ad.images || ad.images.length === 0) return;
      const key = ad.id || `${ad.title || ''}:${ad.link_url || ''}`;
      if (seen.has(key)) return;
      seen.add(key);
      list.push(ad);
    };
    (menuAds || []).forEach((ad) => push(promos, ad));
    this.normalizeServiceAds(serviceAds, adsServiceUrl).forEach((ad) => push(service, ad));
    return this._interleaveReelAds(service, promos);
  },

  /**
   * Fetch active ads from ads.ttmenus.com (ads-service).
   * clientId is optional: omit for network-wide ads.
   */
  async fetchServiceAds(adsServiceUrl, options = {}) {
    const { clientId, location, day } = options;
    const params = [];
    if (clientId) params.push(`client_id=${encodeURIComponent(clientId)}`);
    if (location) params.push(`location=${encodeURIComponent(location)}`);
    if (day) params.push(`day=${encodeURIComponent(day)}`);
    const qs = params.length ? `?${params.join('&')}` : '';
    const base = (adsServiceUrl || this.config.adsServiceUrl || '').replace(/\/$/, '');
    const url = `${base}/api/v1/active-ads${qs}`;
    const timeoutMs = this.getServiceFetchTimeoutMs(base);

    try {
      console.log('📡 Fetching ads-service:', url);
      const response = await this.fetchWithTimeout(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        mode: 'cors',
        credentials: 'omit',
      }, timeoutMs);
      if (!response.ok) {
        console.warn(`Ads service returned ${response.status} for ${url}`);
        return [];
      }
      const result = await response.json();
      const count = Array.isArray(result.data) ? result.data.length : (result.count || 0);
      if (result.success && Array.isArray(result.data)) {
        console.log(`✅ Ads-service returned ${count} ad(s) for ${clientId || 'network'}`);
        if (count === 0) {
          console.log('ℹ️ No active ads-service ads (check client_id, schedule/day, images in DB)');
        }
        return result.data;
      }
      console.warn('Ads service response missing data array:', result);
    } catch (error) {
      if (error && error.name === 'AbortError') {
        console.warn(`Ads service timed out (${timeoutMs}ms) - ${url}`);
      } else if (error && error.message === 'Failed to fetch') {
        console.warn(`Ads service unreachable at ${url}: is it running? (go run . in ads-service)`);
      } else {
        console.warn('Failed to fetch ads from service:', error);
      }
    }
    return [];
  },

  /**
   * Escape HTML
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  /**
   * Get device type
   */
  getDeviceType() {
    const width = window.innerWidth;
    if (width < 768) return 'mobile';
    if (width < 1024) return 'tablet';
    return 'desktop';
  },

  /** Ads-service persists impressions keyed by UUID; menu JSON placeholders (e.g. menu-ad-0-…) must not call tracking. */
  isUuid(adId) {
    if (!adId || typeof adId !== 'string') return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(adId);
  },

  /**
   * Track ad impression
   */
  async trackImpression(adId, adsServiceUrl, clientId) {
    try {
      if (!this.isUuid(adId)) {
        return;
      }
      await fetch(`${adsServiceUrl}/api/v1/tracking/impression`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ad_id: adId,
          client_id: clientId,
          device_type: this.getDeviceType(),
          location: this.userLocation || null,
          viewed_at: new Date().toISOString()
        }),
        mode: 'cors',
        credentials: 'omit',
        keepalive: true,
      });
    } catch (error) {
      if (!window.__ttmsImpressionTrackWarned) {
        window.__ttmsImpressionTrackWarned = true;
        console.debug('Ad impression tracking unavailable:', error);
      }
    }
  },

  /**
   * Track ad click
   */
  async trackClick(adId, adsServiceUrl) {
    try {
      if (!this.isUuid(adId)) {
        return;
      }
      await fetch(`${adsServiceUrl}/api/v1/tracking/click`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ad_id: adId,
          clicked_at: new Date().toISOString(),
          referrer: document.referrer || window.location.href,
          device_type: this.getDeviceType()
        })
      });
    } catch (error) {
      console.error('Error tracking click:', error);
    }
  },

  /** Homepage - 3-card preview; fullscreen vertical feed */
  REELS_PREVIEW_COUNT: 1,
  _reelsCatalog: null,
  _reelsConfig: null,
  _reelsAppendBase: 0,
  _reelsImpressionObserver: null,
  _reelsScrollHandler: null,
  _reelsKeyHandler: null,
  _slideImpressionTracked: null,
  /** After user unmutes once, new in-frame videos stay unmuted until they mute again */
  _reelsUserWantsSound: false,
  _previewScrollHandler: null,
  _reelsLastCatalogIndex: 0,
  _previewAutoTimer: null,
  _previewEndedHandler: null,
  _previewFullscreenScrollHandler: null,
  _reelsFullscreenOpenTriggered: false,
  _reelsAutoOpenSuppressed: false,
  _lastReelsPreviewScrollProgress: 0,
  _previewFullscreenScrollTicking: false,
  _previewFullscreenObserver: null,

  shouldUseReelsMode() {
    // Reels-style preview + fullscreen viewer is used on every page that
    // renders the dynamic ads container (homepage hero + client/location
    // pages all share #pageadscontainer.frontpageads).
    return !!document.querySelector('#pageadscontainer.frontpageads');
  },

  clearReelsPreviewClasses() {
    this.teardownReelsFullscreenAutoOpen();
    const adsList = document.getElementById('ads-list');
    if (adsList) {
      adsList.classList.remove('ads-list--preview');
    }
    document.querySelector('#pageadscontainer section.menu-ad--reels-preview')?.classList.remove('menu-ad--reels-preview');
  },

  isReelsPreviewFullscreen() {
    return this.getReelsPreviewScrollProgress() >= 98;
  },

  /**
   * Same progress model as ad-scroll-progress.js - 0% when section enters viewport,
   * 100% when its top reaches the viewport top (sticky fullscreen).
   */
  getReelsPreviewScrollProgress() {
    const section = document.querySelector('#pageadscontainer.frontpageads section.menu-ad--reels-preview');
    if (!section) return 0;

    const track = document.getElementById('menu-reels-track');
    if (track && track.contains(section) && !this.isHomeSmoothNavMode()) {
      const trackRect = track.getBoundingClientRect();
      const sectionRect = section.getBoundingClientRect();
      const vh = trackRect.height;
      if (!vh) return 0;
      if (sectionRect.top <= trackRect.top + 8) return 100;
      if (sectionRect.top >= trackRect.bottom) return 0;
      return ((trackRect.bottom - sectionRect.top) / vh) * 100;
    }

    const rect = section.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;
    if (!vh) return 0;
    const rootTop = this.isHomeSmoothNavMode() ? this.getHeaderScrollOffset() : 0;
    if (rect.top <= rootTop + 8) return 100;
    if (rect.top >= vh) return 0;
    return ((vh - rect.top) / (vh - rootTop)) * 100;
  },

  updateReelsPreviewScrollProgressBar() {
    const section = document.querySelector('#pageadscontainer.frontpageads section.menu-ad--reels-preview');
    const fill = section?.querySelector('.scroll-progress-fill');
    if (!fill) return;
    fill.style.width = `${this.getReelsPreviewScrollProgress().toFixed(2)}%`;
  },

  maybeOpenReelsFromPreviewScroll(forceProgress) {
    const overlay = document.getElementById('ads-reels-overlay');
    if (overlay && !overlay.hasAttribute('hidden')) return;

    const progress = typeof forceProgress === 'number'
      ? forceProgress
      : this.getReelsPreviewScrollProgress();

    this.updateReelsPreviewScrollProgressBar();

    if (this.isHomeSmoothNavMode()) {
      this._lastReelsPreviewScrollProgress = progress;
      return;
    }

    if (this.isHomeSmoothNavMode() && this._reelsAutoOpenSuppressed) {
      if (progress < 50) {
        this._reelsAutoOpenSuppressed = false;
      }
      return;
    }

    if (progress < 75) {
      if (!this.isHomeSmoothNavMode() || !this._reelsAutoOpenSuppressed) {
        this._reelsFullscreenOpenTriggered = false;
      }
      this._lastReelsPreviewScrollProgress = progress;
      return;
    }

    const crossedFullscreen =
      this._lastReelsPreviewScrollProgress < 98 && progress >= 98;
    this._lastReelsPreviewScrollProgress = progress;

    if (!crossedFullscreen && progress < 98) return;
    if (this._reelsFullscreenOpenTriggered) return;
    if (!this._reelsCatalog || !this._reelsCatalog.length) return;

    const idx = this.getCurrentReelsPreviewCatalogIndex();
    this.openReelsViewer(idx, { userActivatedSound: true, fromScrollAutoOpen: true });
    this._reelsFullscreenOpenTriggered = true;
  },

  getCurrentReelsPreviewCatalogIndex() {
    const panel = document.querySelector('#ads-list li.ad-panel--preview');
    const raw = panel?.dataset?.reelsPreviewIndex;
    if (raw != null && raw !== '') {
      const idx = parseInt(raw, 10);
      if (!Number.isNaN(idx)) return idx;
    }
    return this._reelsLastCatalogIndex || 0;
  },

  teardownReelsFullscreenAutoOpen() {
    const track = document.getElementById('menu-reels-track');
    if (this._previewFullscreenScrollHandler) {
      if (track) {
        track.removeEventListener('scroll', this._previewFullscreenScrollHandler);
      }
      window.removeEventListener('scroll', this._previewFullscreenScrollHandler, true);
      document.removeEventListener('scroll', this._previewFullscreenScrollHandler, true);
      window.removeEventListener('resize', this._previewFullscreenScrollHandler);
      this._previewFullscreenScrollHandler = null;
    }
    if (this._previewFullscreenObserver) {
      this._previewFullscreenObserver.disconnect();
      this._previewFullscreenObserver = null;
    }
    this._previewFullscreenScrollTicking = false;
    this._reelsFullscreenOpenTriggered = false;
    this._reelsAutoOpenSuppressed = false;
    this._lastReelsPreviewScrollProgress = 0;
  },

  /**
   * After closing fullscreen in smooth home scroll, nudge up so preview progress
   * is not locked at 100% (which re-triggers auto-open).
   */
  releaseSmoothPreviewScrollLock() {
    if (!this.isHomeSmoothNavMode()) return;
    this._reelsAutoOpenSuppressed = true;
    this._lastReelsPreviewScrollProgress = 0;
    this.updateReelsPreviewScrollProgressBar();
  },

  setupReelsFullscreenAutoOpen() {
    if (!this.shouldUseReelsMode()) return;
    this.teardownReelsFullscreenAutoOpen();

    const scrollRoot = this.getHomeReelsScrollRoot();

    this._previewFullscreenScrollHandler = () => {
      const progress = this.getReelsPreviewScrollProgress();
      const crossedFullscreen =
        this._lastReelsPreviewScrollProgress < 98 && progress >= 98;

      // Open on the scroll gesture (sync) so unmuted autoplay is allowed when possible.
      if (crossedFullscreen) {
        this.maybeOpenReelsFromPreviewScroll(progress);
        return;
      }

      if (this._previewFullscreenScrollTicking) return;
      this._previewFullscreenScrollTicking = true;
      requestAnimationFrame(() => {
        this._previewFullscreenScrollTicking = false;
        this.maybeOpenReelsFromPreviewScroll();
      });
    };

    if (scrollRoot) {
      scrollRoot.addEventListener('scroll', this._previewFullscreenScrollHandler, { passive: true });
    } else {
      window.addEventListener('scroll', this._previewFullscreenScrollHandler, { passive: true, capture: true });
      document.addEventListener('scroll', this._previewFullscreenScrollHandler, { passive: true, capture: true });
    }
    window.addEventListener('resize', this._previewFullscreenScrollHandler, { passive: true });

    const section = document.querySelector('#pageadscontainer.frontpageads section.menu-ad--reels-preview');
    if (section && typeof IntersectionObserver !== 'undefined') {
      const headerOffset = this.isHomeSmoothNavMode() ? this.getHeaderScrollOffset() : 0;
      this._previewFullscreenObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const top = entry.boundingClientRect.top;
            const rootTop = scrollRoot
              ? scrollRoot.getBoundingClientRect().top
              : headerOffset;
            if (entry.intersectionRatio >= 0.92 && top <= rootTop + 4) {
              this.maybeOpenReelsFromPreviewScroll(100);
            }
          }
        },
        scrollRoot
          ? { root: scrollRoot, threshold: [0, 0.5, 0.92, 1] }
          : { root: null, threshold: [0, 0.5, 0.92, 1], rootMargin: `-${headerOffset}px 0px 0px 0px` }
      );
      this._previewFullscreenObserver.observe(section);
    }

    requestAnimationFrame(() => {
      this.updateReelsPreviewScrollProgressBar();
      this.maybeOpenReelsFromPreviewScroll();
    });
  },

  prepareAdsForDisplay(ads, options) {
    // Randomize each load (Instagram/reels style). If you want weight bias later,
    // do a weighted shuffle here instead of a pure shuffle.
    // keepOrder preserves a promo/service mix that was already arranged.
    const sorted = options && options.keepOrder ? [...ads] : this._shuffleArray([...ads]);
    const items = [];
    for (const ad of sorted) {
      if (!ad.images || ad.images.length === 0) continue;
      const firstMedia = ad.images[0];
      const mediaUrl = firstMedia.image_url || firstMedia.imageUrl || firstMedia.url || firstMedia.src || firstMedia.image;
      if (!mediaUrl) continue;
      const isVideo = /\.(mp4|webm|ogg)$/i.test(mediaUrl);
      const linkUrl = ad.link_url || '#';
      items.push({ ad, firstMedia, mediaUrl, isVideo, linkUrl });
    }
    return items;
  },

  _shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  },

  /**
   * iOS Safari requires playsinline + webkit-playsinline and the playsInline property
   * for muted inline autoplay; attribute-only autoplay is unreliable.
   */
  configureInlineVideoEl(video) {
    if (!video || video.tagName !== 'VIDEO') return;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.playsInline = true;
    video.muted = true;
    video.defaultMuted = true;
    video.setAttribute('muted', '');
  },

  /** Muted autoplay retry chain for preview strip (iOS often needs delayed/canplay play()). */
  tryMutedPreviewPlay(video) {
    if (!video) return;
    this.configureInlineVideoEl(video);
    const attempt = () => {
      video.muted = true;
      const p = video.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => {});
      }
    };
    attempt();
    if (video.readyState < 2) {
      const oncePlay = () => attempt();
      video.addEventListener('loadedmetadata', oncePlay, { once: true });
      video.addEventListener('loadeddata', oncePlay, { once: true });
      video.addEventListener('canplay', oncePlay, { once: true });
      video.addEventListener('canplaythrough', oncePlay, { once: true });
    }
    setTimeout(attempt, 60);
    setTimeout(attempt, 320);
  },

  _unmuteIconSvgMuted() {
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M16.5 12C16.5 10.23 15.48 8.71 14 7.97V10.18L16.45 12.63C16.48 12.43 16.5 12.22 16.5 12ZM19 12C19 12.94 18.8 13.82 18.46 14.64L19.97 16.15C20.62 14.91 21 13.5 21 12C21 7.72 18.01 4.14 14 3.23V5.29C16.89 6.15 19 8.83 19 12ZM4.27 3L3 4.27L7.73 9H3V15H7L12 20V13.27L16.25 17.53C15.58 18.04 14.83 18.46 14 18.7V20.76C15.38 20.45 16.63 19.82 17.68 18.96L19.73 21L21 19.73L12 10.73L4.27 3ZM12 4L9.91 6.09L12 8.18V4Z" fill="currentColor"/>
          </svg>`;
  },

  _unmuteIconSvgUnmuted() {
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 9V15H7L12 20V4L7 9H3ZM16.5 12C16.5 10.23 15.48 8.71 14 7.97V16.03C15.48 15.29 16.5 13.77 16.5 12ZM14 3.23V5.29C16.89 6.15 19 8.83 19 12C19 15.17 16.89 17.85 14 18.71V20.77C18.01 19.86 21 16.28 21 12C21 7.72 18.01 4.14 14 3.23Z" fill="currentColor"/>
          </svg>`;
  },

  _resetUnmuteButtonUi(btn) {
    if (!btn) return;
    btn.innerHTML = this._unmuteIconSvgMuted();
    btn.setAttribute('aria-label', 'Unmute video');
    btn.setAttribute('title', 'Click to unmute video');
    btn.classList.remove('unmuted');
  },

  /**
   * Slide whose vertical center is closest to the reels viewport center (snapped “in frame” item).
   */
  _getDominantReelsSlide(track) {
    if (!track) return null;
    const tr = track.getBoundingClientRect();
    const midY = tr.top + tr.height / 2;
    let best = null;
    let bestDist = Infinity;
    track.querySelectorAll('.ads-reels-slide').forEach((slide) => {
      const sr = slide.getBoundingClientRect();
      if (sr.bottom <= tr.top || sr.top >= tr.bottom) return;
      const center = (sr.top + sr.bottom) / 2;
      const dist = Math.abs(center - midY);      if (dist < bestDist) {
        bestDist = dist;
        best = slide;
      }
    });
    return best;
  },

  _getDominantPreviewPanel(adsList) {
    if (!adsList) return null;
    const tr = adsList.getBoundingClientRect();
    let best = null;
    let bestRatio = 0;
    adsList.querySelectorAll('li.ad-panel').forEach((panel) => {
      const pr = panel.getBoundingClientRect();
      const visibleLeft = Math.max(pr.left, tr.left);
      const visibleRight = Math.min(pr.right, tr.right);
      const visible = Math.max(0, visibleRight - visibleLeft);      const total = Math.max(1, pr.right - pr.left);      const ratio = visible / total;
      if (ratio > bestRatio) {
        bestRatio = ratio;
        best = panel;
      }
    });
    return best;
  },

  _syncPreviewDominantMedia(adsList) {
    if (!adsList) return;
    const dom = this._getDominantPreviewPanel(adsList);
    adsList.querySelectorAll('li.ad-panel video.ad-video').forEach((v) => {
      const panel = v.closest('li.ad-panel');
      if (!panel) return;
      if (panel === dom) {
        this.tryMutedPreviewPlay(v);
      } else {
        v.muted = true;
        v.pause();
      }
    });
  },

  _reelCommentsOpen() {
    const sheet = this._reelCommentSheet;
    if (sheet && !sheet.hidden) return true;
    return document.body.classList.contains('menu-review-sheet-open');
  },

  _clearReelAutoAdvance() {
    if (this._reelAutoTimer) {
      clearTimeout(this._reelAutoTimer);
      this._reelAutoTimer = null;
    }
    if (this._reelAutoVideo && this._reelAutoEndedHandler) {
      this._reelAutoVideo.removeEventListener('ended', this._reelAutoEndedHandler);
    }
    this._reelAutoVideo = null;
    this._reelAutoEndedHandler = null;
    this._reelAutoSlide = null;
  },

  _advanceReelSlide(track, fromSlide) {
    if (this._reelCommentsOpen()) {
      this._reelAutoTimer = setTimeout(() => this._advanceReelSlide(track, fromSlide), 400);
      return;
    }
    const overlay = document.getElementById('ads-reels-overlay');
    if (!overlay || overlay.hasAttribute('hidden') || !track || !fromSlide) return;
    const current = this._getDominantReelsSlide(track);
    if (current && current !== fromSlide) return;
    const slides = Array.from(track.querySelectorAll('.ads-reels-slide'));
    const pos = slides.indexOf(fromSlide);
    if (pos < 0) return;
    let next = slides[pos + 1];
    if (!next) {
      this.appendMoreReelSlides(1);
      next = track.querySelectorAll('.ads-reels-slide')[pos + 1];
    }
    if (!next || next === fromSlide) return;
    this._clearReelAutoAdvance();
    let behavior = 'smooth';
    try {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) behavior = 'auto';
    } catch (err) { /* ignore */ }
    track.scrollTo({ top: next.offsetTop, behavior });
  },

  /**
   * Video ads advance when playback ends. Image ads advance after 10 seconds.
   */
  _armReelAutoAdvance(track, slide) {
    if (!track || !slide) {
      this._clearReelAutoAdvance();
      return;
    }
    const video = slide.querySelector('video.ad-video');
    const image = slide.querySelector('img.ad-portrait');
    if (!video && !image) return;
    if (this._reelAutoSlide === slide) return;
    if (this._reelCommentsOpen()) {
      if (!this._reelAutoTimer) {
        this._reelAutoTimer = setTimeout(() => {
          this._reelAutoTimer = null;
          this._armReelAutoAdvance(track, slide);
        }, 400);
      }
      return;
    }
    this._clearReelAutoAdvance();
    this._reelAutoSlide = slide;
    if (video) {
      video.loop = false;
      video.removeAttribute('loop');
      const go = () => this._advanceReelSlide(track, slide);
      if (video.ended) {
        this._reelAutoTimer = setTimeout(go, 400);
        return;
      }
      this._reelAutoVideo = video;
      this._reelAutoEndedHandler = go;
      video.addEventListener('ended', this._reelAutoEndedHandler);
      return;
    }
    const startImage = () => {
      if (this._reelAutoSlide !== slide) return;
      this._reelAutoTimer = setTimeout(() => this._advanceReelSlide(track, slide), 10000);
    };
    if (image.complete) {
      startImage();
      return;
    }
    image.addEventListener('load', startImage, { once: true });
    image.addEventListener('error', startImage, { once: true });
  },

  /**
   * Play/pause + mute only the in-frame (dominant) reel; keep in sync with scroll-snap.
   * IntersectionObserver is unreliable here with nested scroll + full-viewport slides.
   */
  _syncReelsDominantMedia(track) {
    if (!track) return;
    const overlay = document.getElementById('ads-reels-overlay');
    if (overlay?.hasAttribute('hidden')) return;

    const dom = this._getDominantReelsSlide(track);
    if (dom) {
      const idx = parseInt(dom.dataset.catalogIndex || '', 10);
      if (!Number.isNaN(idx)) this._reelsLastCatalogIndex = idx;
    }
    track.querySelectorAll('.ads-reels-slide').forEach((slide) => {
      const v = slide.querySelector('video.ad-video');
      if (!v) return;
      if (slide === dom) {
        if (this._reelsUserWantsSound) {
          v.setAttribute('playsinline', '');
          v.setAttribute('webkit-playsinline', '');
          v.playsInline = true;
          v.muted = false;
          v.defaultMuted = false;
          v.removeAttribute('muted');
        } else {
          this.configureInlineVideoEl(v);
          v.muted = true;
        }
        const p = v.play();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {
            if (this._reelsUserWantsSound) {
              v.muted = true;
              v.setAttribute('muted', '');
              this._reelsUserWantsSound = false;
              const btn = slide.querySelector('.ad-unmute-btn');
              this._resetUnmuteButtonUi(btn);
              v.play().catch(() => {});
            }
          });
        }
      } else {
        v.muted = true;
        v.pause();
      }
    });

    track.querySelectorAll('.ad-unmute-btn').forEach((btn) => this._resetUnmuteButtonUi(btn));
    if (dom && this._reelsUserWantsSound) {
      const v = dom.querySelector('video.ad-video');
      const btn = dom.querySelector('.ad-unmute-btn');
      if (v && !v.muted && btn) {
        btn.innerHTML = this._unmuteIconSvgUnmuted();
        btn.setAttribute('aria-label', 'Mute video');
        btn.setAttribute('title', 'Click to mute video');
        btn.classList.add('unmuted');
      }
    }
    this._cueReelActionEntrance(dom);
    this._armReelAutoAdvance(track, dom);
  },

  /**
   * Replay the chrome entrance once per ad that snaps into view.
   */
  _cueReelActionEntrance(slide) {
    if (!slide || slide.classList.contains('menu-ad-scroll-end')) return;
    const root = slide.closest('#ads-reels-track, #homepage-ads-container, #client-ads-container, #frontpage-ads-container, #pageadscontainer') || slide.parentElement;
    if (!this._reelActionSlides) this._reelActionSlides = new WeakMap();
    if (root && this._reelActionSlides.get(root) === slide && slide.classList.contains('is-in')) return;
    if (root) this._reelActionSlides.set(root, slide);
    slide.classList.remove('is-in');
    void slide.offsetWidth;
    slide.classList.add('is-in');
  },

  _dominantAdsChild(container) {
    if (!container) return null;
    const items = container.querySelectorAll('.ads-reels-slide:not(.menu-ad-scroll-end), .ad-panel');
    if (!items.length) return null;
    const scroller = container.closest('#menu-reels-track');
    const bounds = scroller ? scroller.getBoundingClientRect() : { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth };
    const midY = (bounds.top + bounds.bottom) / 2;
    const midX = (bounds.left + bounds.right) / 2;
    let best = null;
    let bestDist = Infinity;
    items.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.bottom <= bounds.top + 8 || r.top >= bounds.bottom - 8) return;
      if (r.right <= bounds.left + 8 || r.left >= bounds.right - 8) return;
      const dist = Math.abs((r.top + r.bottom) / 2 - midY) + Math.abs((r.left + r.right) / 2 - midX) * 0.2;
      if (dist < bestDist) {
        bestDist = dist;
        best = el;
      }
    });
    return best;
  },

  _watchAdsContainerEntrances() {
    if (this._adsEntranceWatch) return;
    this._adsEntranceWatch = true;
    const tick = () => {
      this._adsEntranceScheduled = false;
      const overlay = document.getElementById('ads-reels-overlay');
      if (overlay && !overlay.hasAttribute('hidden')) return;
      document.querySelectorAll('#homepage-ads-container, #client-ads-container, #frontpage-ads-container, #pageadscontainer').forEach((container) => {
        const slide = this._dominantAdsChild(container);
        if (slide) this._cueReelActionEntrance(slide);
      });
    };
    const schedule = () => {
      if (this._adsEntranceScheduled) return;
      this._adsEntranceScheduled = true;
      requestAnimationFrame(tick);
    };
    window.addEventListener('scroll', schedule, { passive: true });
    document.addEventListener('scroll', schedule, { passive: true, capture: true });
    schedule();
  },

  /**
   * Wire unmute: preview/location panels use this card’s video.
   * Fullscreen reels: scroll tapped slide into view, then sync audio for the in-frame clip.
   */
  attachVideoUnmute(container) {
    const unmuteBtn = container.querySelector('.ad-unmute-btn');
    if (!unmuteBtn) return;
    unmuteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const track = container.closest('#ads-reels-track');
      const videoPanel = container.matches?.('.ads-reels-slide')
        ? container
        : container.closest('.ads-reels-slide');

      if (track && videoPanel) {
        const vid = videoPanel.querySelector('video.ad-video');
        if (!vid) return;
        this._reelsUserWantsSound = !!vid.muted;
        videoPanel.scrollIntoView({ block: 'start', behavior: 'auto' });
        requestAnimationFrame(() => {
          requestAnimationFrame(() => this._syncReelsDominantMedia(track));
        });
        return;
      }

      const previewLi = container.closest('li.ad-panel--preview');
      const previewIdxRaw = previewLi?.dataset?.reelsPreviewIndex;
      if (previewLi != null && previewIdxRaw != null && previewIdxRaw !== '') {
        const idx = parseInt(previewIdxRaw, 10);
        if (!Number.isNaN(idx)) {
          this.openReelsViewer(idx, { userActivatedSound: true, userInitiated: true });
        }
        return;
      }

      const video = container.querySelector('video.ad-video');
      const btnForUi = container.querySelector('.ad-unmute-btn');
      if (!video || !btnForUi) return;

      if (video.muted) {
        video.muted = false;
        btnForUi.innerHTML = this._unmuteIconSvgUnmuted();
        btnForUi.setAttribute('aria-label', 'Mute video');
        btnForUi.setAttribute('title', 'Click to mute video');
        btnForUi.classList.add('unmuted');
        video.play().catch(() => {});
      } else {
        video.muted = true;
        this._resetUnmuteButtonUi(btnForUi);
      }
    });
  },

  _reelHost(url) {
    try {
      return new URL(String(url || ''), window.location.origin).hostname.replace(/^www\./i, '').toLowerCase();
    } catch (err) {
      return '';
    }
  },

  _reelFavoriteKey(ad) {
    return 'reel:' + String((ad && ad.id) || '');
  },

  async _ensureMenuClientIds() {
    if (this._menuClientIdsPromise) return this._menuClientIdsPromise;
    this._menuClientIdsPromise = (async () => {
      const map = {};
      try {
        const response = await fetch('/locations/index.json', { credentials: 'omit' });
        if (!response.ok) return map;
        const hub = await response.json();
        const menus = hub && Array.isArray(hub.menus) ? hub.menus : [];
        menus.forEach((menu) => {
          const host = this._reelHost(menu && menu.menu);
          const id = String((menu && (menu.client_id || menu.clientId)) || '').trim();
          if (host && id) map[host] = id;
        });
      } catch (err) { /* hub list is optional */ }
      return map;
    })();
    return this._menuClientIdsPromise;
  },

  async _reelClientId(linkUrl) {
    const site = String(window.SITE_CLIENT_ID || window.CLIENT_ID || '').trim();
    if (site) return site;
    const host = this._reelHost(linkUrl);
    const map = await this._ensureMenuClientIds();
    if (host && map[host]) return map[host];
    if (host.endsWith('.ttmenus.com')) {
      const sub = host.slice(0, -'.ttmenus.com'.length).split('.')[0];
      if (sub && sub !== 'www') return 'ttms_' + sub;
    }
    return '';
  },

  _reelReviewKey(clientId, ad) {
    const id = String(clientId || '').trim();
    const adId = String((ad && ad.id) || '').trim();
    if (!id || !adId) return '';
    return id + '|ad:' + adId;
  },

  _reviewsApiBase() {
    const cfg = window.REVIEWS_CONFIG || {};
    return String(cfg.apiUrl || 'https://reviews.ttmenus.com/api/v1').replace(/\/+$/, '');
  },

  _reelRailHtml(item) {
    const ad = item.ad || {};
    const title = ad.title || 'Promotion';
    const key = this._reelFavoriteKey(ad);
    const on = !!(this._reelFavoriteKeys && this._reelFavoriteKeys.has(key));
    const safeTitle = this.escapeHtml(title);
    return `
      <p class="ads-reel-caption">${safeTitle}</p>
      <div class="ads-reel-actions">
        <button type="button" class="ads-reel-action ads-reel-action--favorite${on ? ' is-on' : ''}" data-favorite-key="${this.escapeHtml(key)}" aria-pressed="${on ? 'true' : 'false'}" aria-label="Favorite ${safeTitle}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.7-4.35-9.33-8.1C.8 10.4 1.2 6.7 4.1 5.2 6.2 4.1 8.4 4.7 12 8.2 15.6 4.7 17.8 4.1 19.9 5.2c2.9 1.5 3.3 5.2 1.43 7.7C18.7 16.65 12 21 12 21z"/></svg>
        </button>
        <button type="button" class="ads-reel-action ads-reel-action--comment" aria-label="Comments on ${safeTitle}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-4 3v-3H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>
          <span class="ads-reel-action__count" data-reel-comment-count></span>
        </button>
        <button type="button" class="ads-reel-action ads-reel-action--share" aria-label="Share ${safeTitle}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5l6 6-6 6v-4c-4.2 0-7 1.4-9 5 1.2-5.2 4.2-8 9-8V5z"/></svg>
        </button>
      </div>`;
  },

  _reelToast(message) {
    let el = document.getElementById('ads-reel-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ads-reel-toast';
      el.className = 'ads-reel-toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add('is-visible');
    clearTimeout(this._reelToastTimer);
    this._reelToastTimer = setTimeout(() => el.classList.remove('is-visible'), 2200);
  },

  _promptReelLogin() {
    this._reelToast('Log in to do that.');
    if (typeof window.confirm === 'function' && window.confirm('Log in to save favorites and comment?')) {
      try {
        sessionStorage.setItem('ttmenus_redirect_after_login', window.location.pathname + window.location.search);
      } catch (err) { /* ignore */ }
      window.location.href = '/login/';
    }
  },

  async _authToken() {
    if (!window.AuthClient || typeof AuthClient.isAuthenticated !== 'function' || !AuthClient.isAuthenticated()) return '';
    try {
      if (typeof AuthClient.ensureAccessToken === 'function') {
        const ready = await AuthClient.ensureAccessToken();
        if (ready && ready.accessToken) return ready.accessToken;
      }
    } catch (err) { /* fall through */ }
    return (typeof AuthClient.getAccessToken === 'function' && AuthClient.getAccessToken()) || '';
  },

  async _hydrateReelFavorites() {
    if (this._reelFavoritesLoaded) return;
    this._reelFavoritesLoaded = true;
    this._reelFavoriteKeys = this._reelFavoriteKeys || new Set();
    if (!window.AuthClient || typeof AuthClient.getFavorites !== 'function') return;
    if (typeof AuthClient.isAuthenticated === 'function' && !AuthClient.isAuthenticated()) return;
    try {
      const result = await AuthClient.getFavorites('promotion');
      const list = result && result.success && result.data && result.data.favorites;
      if (Array.isArray(list)) {
        list.forEach((row) => {
          if (row && row.item_key) this._reelFavoriteKeys.add(String(row.item_key));
        });
      }
    } catch (err) { /* ignore */ }
    document.querySelectorAll('.ads-reel-action--favorite').forEach((btn) => {
      const on = this._reelFavoriteKeys.has(btn.getAttribute('data-favorite-key') || '');
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  },

  async _toggleReelFavorite(btn, item) {
    const ad = item.ad || {};
    const key = this._reelFavoriteKey(ad);
    if (!key || key === 'reel:') return;
    if (!window.AuthClient || typeof AuthClient.isAuthenticated !== 'function' || !AuthClient.isAuthenticated()) {
      this._promptReelLogin();
      return;
    }
    this._reelFavoriteKeys = this._reelFavoriteKeys || new Set();
    const saved = this._reelFavoriteKeys.has(key);
    btn.classList.toggle('is-on', !saved);
    btn.setAttribute('aria-pressed', saved ? 'false' : 'true');
    const image = item.mediaUrl && /^https?:\/\//i.test(item.mediaUrl) ? item.mediaUrl : '';
    let result;
    try {
      if (saved) result = await AuthClient.removeFavorite('promotion', key);
      else {
        result = await AuthClient.addFavorite({
          kind: 'promotion',
          item_key: key,
          title: ad.title || '',
          url: item.linkUrl || '',
          image_url: image,
          meta: { client_id: await this._reelClientId(item.linkUrl) },
        });
      }
    } catch (err) {
      result = { success: false, error: 'Could not update favorite.' };
    }
    if (!result || !result.success) {
      btn.classList.toggle('is-on', saved);
      btn.setAttribute('aria-pressed', saved ? 'true' : 'false');
      this._reelToast((result && result.error) || 'Could not update favorite.');
      return;
    }
    if (saved) this._reelFavoriteKeys.delete(key);
    else this._reelFavoriteKeys.add(key);
    document.querySelectorAll('.ads-reel-action--favorite').forEach((other) => {
      if ((other.getAttribute('data-favorite-key') || '') !== key) return;
      const on = this._reelFavoriteKeys.has(key);
      other.classList.toggle('is-on', on);
      other.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    this._reelToast(saved ? 'Removed from favorites.' : 'Saved to favorites.');
  },

  async _shareReel(item) {
    const url = item.linkUrl && item.linkUrl !== '#' ? item.linkUrl : window.location.href;
    const title = (item.ad && item.ad.title) || 'Promotion';
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      this._reelToast('Link copied.');
    } catch (err) {
      window.prompt('Copy this link', url);
    }
  },

  async _paintReelCommentCount(rootEl, item) {
    const countEl = rootEl.querySelector('[data-reel-comment-count]');
    if (!countEl) return;
    const clientId = await this._reelClientId(item.linkUrl);
    const key = this._reelReviewKey(clientId, item.ad);
    if (!key) return;
    try {
      const params = new URLSearchParams();
      params.set('client_id', clientId);
      params.set('targets', 'promotion:' + key);
      const response = await fetch(this._reviewsApiBase() + '/reviews/summaries?' + params.toString(), { credentials: 'omit' });
      if (!response.ok) return;
      const data = await response.json();
      const summary = (data.summaries || [])[0];
      const count = summary && Number(summary.count) > 0 ? Number(summary.count) : 0;
      countEl.textContent = count ? String(count) : '';
    } catch (err) { /* count is optional */ }
  },

  _ensureReelCommentSheet() {
    if (this._reelCommentSheet) return this._reelCommentSheet;
    const sheet = document.createElement('div');
    sheet.className = 'ads-reel-comments';
    sheet.hidden = true;
    sheet.innerHTML = `
      <div class="ads-reel-comments__backdrop" data-reel-comment-close></div>
      <div class="ads-reel-comments__panel" role="dialog" aria-modal="true" aria-labelledby="ads-reel-comments-title">
        <header class="ads-reel-comments__header">
          <h2 id="ads-reel-comments-title" class="ads-reel-comments__title">Comments</h2>
          <button type="button" class="ads-reel-comments__close" data-reel-comment-close aria-label="Close comments">×</button>
        </header>
        <ul class="ads-reel-comments__list"></ul>
        <form class="ads-reel-comments__form">
          <div class="ads-reel-comments__stars" role="radiogroup" aria-label="Rating">
            ${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-star="${n}" aria-label="${n} star${n === 1 ? '' : 's'}">★</button>`).join('')}
          </div>
          <textarea class="ads-reel-comments__body" maxlength="500" placeholder="Add a comment"></textarea>
          <button type="submit" class="ads-reel-comments__send">Post</button>
        </form>
      </div>`;
    sheet.addEventListener('click', (e) => {
      if (e.target.closest('[data-reel-comment-close]')) {
        e.preventDefault();
        this._closeReelComments();
        return;
      }
      const star = e.target.closest('[data-star]');
      if (star) {
        e.preventDefault();
        this._setReelCommentStars(Number(star.getAttribute('data-star')) || 0);
      }
    });
    sheet.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      this._submitReelComment();
    });
    document.body.appendChild(sheet);
    this._reelCommentSheet = sheet;
    this._reelCommentStars = 5;
    return sheet;
  },

  _setReelCommentStars(value) {
    this._reelCommentStars = value;
    const sheet = this._reelCommentSheet;
    if (!sheet) return;
    sheet.querySelectorAll('[data-star]').forEach((btn) => {
      btn.classList.toggle('is-on', Number(btn.getAttribute('data-star')) <= value);
    });
  },

  _closeReelComments() {
    if (!this._reelCommentSheet) return;
    this._reelCommentSheet.hidden = true;
    this._reelCommentTarget = null;
    const track = document.getElementById('ads-reels-track');
    if (track) this._syncReelsDominantMedia(track);
  },

  async _openReelComments(rootEl, item) {
    const siteId = String(window.SITE_CLIENT_ID || window.CLIENT_ID || '').trim();
    if (siteId && window.TTMSMenuReviews && typeof window.TTMSMenuReviews.open === 'function') {
      window.TTMSMenuReviews.open({
        kind: 'promotion',
        key: this._reelReviewKey(siteId, item.ad),
        title: (item.ad && item.ad.title) || 'Promotion',
      });
      return;
    }
    const clientId = await this._reelClientId(item.linkUrl);
    const key = this._reelReviewKey(clientId, item.ad);
    if (!key) {
      this._reelToast('Comments are not available for this post.');
      return;
    }
    const sheet = this._ensureReelCommentSheet();
    this._reelCommentTarget = { rootEl, item, clientId, key };
    sheet.querySelector('.ads-reel-comments__title').textContent = (item.ad && item.ad.title) || 'Comments';
    sheet.querySelector('.ads-reel-comments__body').value = '';
    sheet.querySelector('.ads-reel-comments__list').innerHTML = '<li class="ads-reel-comments__empty">Loading…</li>';
    this._setReelCommentStars(5);
    sheet.hidden = false;
    this._loadReelComments();
  },

  async _loadReelComments() {
    const target = this._reelCommentTarget;
    const sheet = this._reelCommentSheet;
    if (!target || !sheet) return;
    const params = new URLSearchParams();
    params.set('client_id', target.clientId);
    params.set('kind', 'promotion');
    params.set('target_key', target.key);
    const list = sheet.querySelector('.ads-reel-comments__list');
    try {
      const response = await fetch(this._reviewsApiBase() + '/reviews?' + params.toString(), { credentials: 'omit' });
      const data = await response.json();
      const reviews = (data && data.reviews) || [];
      const comments = reviews.filter((row) => String(row.body || '').trim());
      const countEl = target.rootEl && target.rootEl.querySelector('[data-reel-comment-count]');
      const count = data && data.summary && Number(data.summary.count) > 0 ? Number(data.summary.count) : comments.length;
      if (countEl) countEl.textContent = count ? String(count) : '';
      if (!comments.length) {
        list.innerHTML = '<li class="ads-reel-comments__empty">No comments yet.</li>';
        return;
      }
      list.innerHTML = comments.map((row) => {
        const who = this.escapeHtml(row.author || 'Guest');
        const body = this.escapeHtml(row.body || '');
        return `<li class="ads-reel-comments__item"><strong>${who}</strong><p>${body}</p></li>`;
      }).join('');
    } catch (err) {
      list.innerHTML = '<li class="ads-reel-comments__empty">Could not load comments.</li>';
    }
  },

  async _submitReelComment() {
    const target = this._reelCommentTarget;
    const sheet = this._reelCommentSheet;
    if (!target || !sheet) return;
    if (!window.AuthClient || typeof AuthClient.isAuthenticated !== 'function' || !AuthClient.isAuthenticated()) {
      this._promptReelLogin();
      return;
    }
    const body = sheet.querySelector('.ads-reel-comments__body').value || '';
    if (!String(body).trim()) {
      this._reelToast('Write a comment first.');
      return;
    }
    const token = await this._authToken();
    if (!token) {
      this._promptReelLogin();
      return;
    }
    const send = sheet.querySelector('.ads-reel-comments__send');
    send.disabled = true;
    try {
      const response = await fetch(this._reviewsApiBase() + '/reviews', {
        method: 'PUT',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({
          client_id: target.clientId,
          kind: 'promotion',
          target_key: target.key,
          rating: this._reelCommentStars || 5,
          body: body,
        }),
      });
      if (!response.ok) throw new Error('Could not post comment.');
      sheet.querySelector('.ads-reel-comments__body').value = '';
      await this._loadReelComments();
    } catch (err) {
      this._reelToast('Could not post comment.');
    } finally {
      send.disabled = false;
    }
  },

  _bindReelRail(rootEl, item) {
    const rail = rootEl.querySelector('.ads-reel-actions');
    if (!rail || rail.dataset.bound === '1') return;
    rail.dataset.bound = '1';
    rail.addEventListener('click', (e) => {
      const btn = e.target.closest('.ads-reel-action');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      if (btn.classList.contains('ads-reel-action--favorite')) this._toggleReelFavorite(btn, item);
      else if (btn.classList.contains('ads-reel-action--comment')) this._openReelComments(rootEl, item);
      else if (btn.classList.contains('ads-reel-action--share')) this._shareReel(item);
    });
    this._hydrateReelFavorites();
    this._paintReelCommentCount(rootEl, item);
  },

  _adThrobberHtml(label) {
    const safe = this.escapeHtml(label || 'Loading promotion');
    return `<div class="ad-preview-throbber" aria-busy="true" aria-label="${safe}"><span class="ad-preview-throbber__spin"></span></div>`;
  },

  _reelPendingThrobberHtml() {
    return '<div class="ad-preview-throbber is-slow" aria-busy="true" aria-label="Loading promotion"><span class="ad-preview-throbber__spin"></span></div>';
  },

  /**
   * Keep a spinner on the slide only when the image or video is still loading
   * after a short beat, so a cached ad does not flash a throbber.
   */
  _armAdThrobber(rootEl) {
    const throbber = rootEl && rootEl.querySelector('.ad-preview-throbber');
    const media = rootEl && rootEl.querySelector('video.ad-video, img.ad-portrait');
    if (!throbber) return;
    const hide = () => {
      throbber.classList.remove('is-slow');
      throbber.classList.add('ad-preview-throbber--hidden');
      throbber.setAttribute('aria-busy', 'false');
      if (rootEl) rootEl.classList.remove('is-media-waiting');
    };
    if (!media) {
      hide();
      return;
    }
    const ready = media.tagName === 'IMG'
      ? media.complete && media.naturalWidth > 0
      : media.readyState >= 2;
    if (ready) {
      hide();
      return;
    }
    const timer = window.setTimeout(() => {
      if (!throbber.classList.contains('ad-preview-throbber--hidden')) throbber.classList.add('is-slow');
    }, 320);
    const done = () => {
      window.clearTimeout(timer);
      hide();
    };
    if (media.tagName === 'IMG') {
      media.addEventListener('load', done, { once: true });
      media.addEventListener('error', done, { once: true });
    } else {
      media.addEventListener('loadeddata', done, { once: true });
      media.addEventListener('canplay', done, { once: true });
      media.addEventListener('playing', done, { once: true });
      media.addEventListener('error', done, { once: true });
    }
    window.setTimeout(done, 20000);
  },

  mountAdCreative(rootEl, item, config, opts) {
    const { ad, firstMedia, mediaUrl, isVideo, linkUrl } = item;
    const displayMediaUrl =
      !isVideo && typeof window !== 'undefined' && window.TtmsThumbor && window.TtmsThumbor.menuImageSrc
        ? window.TtmsThumbor.menuImageSrc(mediaUrl, 'ad')
        : mediaUrl;
    const {
      videoSuffix = '',
      trackImpressionNow = true,
      mode = 'panel',
      previewStrip = false,
      showTitleRow = false,
    } = opts;

    if (trackImpressionNow) {
      this.trackImpression(ad.id, config.adsServiceUrl, config.clientId);
    }

    const videoId = `video-ad-${ad.id}${videoSuffix}`;
    const safeAlt = this.escapeHtml(firstMedia.alt_text || ad.title || 'Advertisement');
    const ext = (mediaUrl.split('.').pop() || 'mp4').toLowerCase();

    let mediaHTML = '';
    if (isVideo) {
      const videoInner = `
        <video id="${videoId}" class="ad-portrait ad-video" autoplay muted ${mode === 'reel' ? '' : 'loop '}playsinline webkit-playsinline preload="none">
          <source src="${this.escapeHtml(mediaUrl)}" type="video/${ext}">
          Your browser does not support the video tag.
        </video>`;
      const unmuteBtn = `
        <button type="button" class="ad-unmute-btn" aria-label="Unmute video" title="Click to unmute video">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M16.5 12C16.5 10.23 15.48 8.71 14 7.97V10.18L16.45 12.63C16.48 12.43 16.5 12.22 16.5 12ZM19 12C19 12.94 18.8 13.82 18.46 14.64L19.97 16.15C20.62 14.91 21 13.5 21 12C21 7.72 18.01 4.14 14 3.23V5.29C16.89 6.15 19 8.83 19 12ZM4.27 3L3 4.27L7.73 9H3V15H7L12 20V13.27L16.25 17.53C15.58 18.04 14.83 18.46 14 18.7V20.76C15.38 20.45 16.63 19.82 17.68 18.96L19.73 21L21 19.73L12 10.73L4.27 3ZM12 4L9.91 6.09L12 8.18V4Z" fill="currentColor"/>
          </svg>
        </button>`;
      if (previewStrip || mode === 'reel') {
        mediaHTML = `
        <div class="ad-preview-media">
          ${this._adThrobberHtml(isVideo ? 'Loading video' : 'Loading promotion')}
          ${videoInner}
        </div>${unmuteBtn}`;
      } else {
        mediaHTML = `${videoInner}${unmuteBtn}`;
      }
    } else {
      const throbber = mode === 'reel' ? this._adThrobberHtml('Loading promotion') : '';
      mediaHTML = `
        ${throbber}
        <img src="${this.escapeHtml(displayMediaUrl)}" class="ad-portrait-bg" alt="${safeAlt}">
        <img src="${this.escapeHtml(displayMediaUrl)}" class="ad-portrait" alt="${safeAlt}">`;
    }

    if (mode === 'reel') {
      if (ad.title) rootEl.setAttribute('data-ad-title', ad.title);
      if (linkUrl) rootEl.setAttribute('data-ad-url', linkUrl);
      if (ad.id) rootEl.setAttribute('data-ad-id', ad.id);
    }

    var promoHeaderHTML = '';
    if (
      mode === 'reel' &&
      showTitleRow &&
      window.TTMSMenuItemActions &&
      typeof window.TTMSMenuItemActions.buildPromotionHeaderMarkup === 'function'
    ) {
      promoHeaderHTML = window.TTMSMenuItemActions.buildPromotionHeaderMarkup({
        title: ad.title || '',
        url: linkUrl || '',
        promoUrl:
          (ad.title &&
            '/promotions/' +
              String(ad.title)
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '') +
              '/') ||
          linkUrl ||
          '',
        catalogIndex: rootEl.getAttribute('data-catalog-index') || '',
        adId: ad.id || rootEl.getAttribute('data-ad-id') || '',
        image: String(mediaUrl || '')
          .replace(/^https?:\/\/[^/]+/i, '')
          .replace(/^\//, ''),
      });
    }

    const railHTML = mode === 'reel' ? this._reelRailHtml(item) : '';
    rootEl.innerHTML = promoHeaderHTML + `<span>Sponsored</span>${mediaHTML}${railHTML}`;
    if (mode === 'reel') {
      rootEl.classList.add('is-media-waiting');
      this._bindReelRail(rootEl, item);
      this._armAdThrobber(rootEl);
    }

    if (mode === 'reel' && linkUrl && linkUrl !== '#') {
      rootEl.addEventListener('click', (e) => {
        if (e.target.closest('.ad-unmute-btn, .menu-item-actions, .menu-favorite-btn, .ads-reels-slide__title-row, .ads-reel-actions, .ads-reel-comments')) return;
        const t = e.target;
        const onVideo = t.matches?.('video.ad-video');
        const onImg =
          t.tagName === 'IMG' &&
          (t.classList.contains('ad-portrait') || t.classList.contains('ad-portrait-bg'));
        if (!onVideo && !onImg) return;
        e.preventDefault();
        this.trackClick(ad.id, config.adsServiceUrl);
        window.open(linkUrl, '_blank');
      });
    }

    if (isVideo) {
      const vidEl = rootEl.querySelector('video.ad-video');
      if (vidEl) {
        this.configureInlineVideoEl(vidEl);
      }
      if (previewStrip && mode !== 'reel' && vidEl) {
        const throbber = rootEl.querySelector('.ad-preview-throbber');
        const hideThrobber = () => {
          if (throbber) {
            throbber.classList.add('ad-preview-throbber--hidden');
            throbber.setAttribute('aria-busy', 'false');
          }
        };
        vidEl.addEventListener('loadeddata', hideThrobber, { once: true });
        vidEl.addEventListener('canplay', hideThrobber, { once: true });
        vidEl.addEventListener('playing', hideThrobber, { once: true });
        vidEl.addEventListener('error', hideThrobber, { once: true });
        setTimeout(hideThrobber, 12000);
      }
      this.attachVideoUnmute(rootEl);
    }
  },

  buildAdPanelLi(item, config, options = {}) {
    const {
      primaryClick = null,
      videoSuffix = '',
      trackImpressionNow = true,
      reelsPreviewIndex = null,
      previewStrip = false,
    } = options;
    const { linkUrl, ad } = item;
    const li = document.createElement('li');
    li.className = 'ad-panel';
    li.setAttribute('data-ad-id', item.ad.id);
    if (ad.title) li.setAttribute('data-ad-title', ad.title);
    if (linkUrl && linkUrl !== '#') {
      li.setAttribute('data-ad-url', linkUrl);
      li.setAttribute('data-ad-link', linkUrl);
    }
    if (reelsPreviewIndex != null) {
      li.setAttribute('data-reels-preview-index', String(reelsPreviewIndex));
    }
    this.mountAdCreative(li, item, config, {
      videoSuffix,
      trackImpressionNow,
      mode: 'panel',
      previewStrip,
    });
    li.onclick = (e) => {
      if (e.target.closest('.ad-unmute-btn')) return;
      if (primaryClick) {
        primaryClick(e);
        return;
      }
      this.trackClick(ad.id, config.adsServiceUrl);
      if (linkUrl && linkUrl !== '#') {
        window.open(linkUrl, '_blank');
      }
    };
    return li;
  },

  ensureReelsOverlay() {
    let el = document.getElementById('ads-reels-overlay');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'ads-reels-overlay';
    el.className = 'ads-reels-overlay';
    el.setAttribute('hidden', '');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Featured promotions');
    el.innerHTML = `
      <button type="button" class="ads-reels-close ttms-icon-btn ttms-icon-btn--on-dark" aria-label="Close promotions"><img class="dashboard-header-close-img" src="https://cdn.ttmenus.com/icons/ui/close.svg" alt="" width="28" height="28" decoding="async"></button>
      <div class="ads-reels-track" id="ads-reels-track"></div>`;
    document.body.appendChild(el);
    el.querySelector('.ads-reels-close').addEventListener('click', () => this.closeReelsViewer());
    return el;
  },

  observeReelSlide(slide) {
    const track = slide.closest('#ads-reels-track');
    if (!track) return;

    if (!this._reelsImpressionObserver) {
      this._slideImpressionTracked = this._slideImpressionTracked || new WeakSet();
      this._reelsImpressionObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const slideEl = entry.target;
            const ratio = entry.intersectionRatio;
            if (ratio >= 0.5 && !this._slideImpressionTracked.has(slideEl)) {
              this._slideImpressionTracked.add(slideEl);
              const id = slideEl.dataset.adId;
              const cfg = this._reelsConfig;
              if (id && cfg) {
                this.trackImpression(id, cfg.adsServiceUrl, cfg.clientId);
              }
            }
          }
        },
        {
          root: track,
          rootMargin: '0px',
          threshold: [0, 0.35, 0.5, 0.65, 1],
        }
      );
    }
    this._reelsImpressionObserver.observe(slide);
  },

  _reelSlideShell(item, catalogIndex) {
    const slide = document.createElement('article');
    slide.className = 'ads-reels-slide';
    slide.dataset.adId = item.ad.id;
    slide.dataset.catalogIndex = String(catalogIndex);
    slide.dataset.mediaState = 'empty';
    if (item.ad.title) slide.dataset.adTitle = item.ad.title;
    if (item.linkUrl && item.linkUrl !== '#') slide.dataset.adUrl = item.linkUrl;
    slide.innerHTML = this._reelPendingThrobberHtml();
    return slide;
  },

  _mountReelSlideMedia(slide) {
    if (!slide || slide.dataset.mediaState === 'ready') return;
    const catalog = this._reelsCatalog;
    const config = this._reelsConfig;
    if (!catalog || !catalog.length || !config) return;
    const i = parseInt(slide.dataset.catalogIndex || '', 10);
    if (Number.isNaN(i)) return;
    const item = catalog[((i % catalog.length) + catalog.length) % catalog.length];
    if (!item) return;
    this._reelsMediaSeq = (this._reelsMediaSeq || 0) + 1;
    slide.innerHTML = '';
    this.mountAdCreative(slide, item, config, {
      mode: 'reel',
      videoSuffix: `-reel-win-${i}-${this._reelsMediaSeq}`,
      trackImpressionNow: false,
    });
    slide.dataset.mediaState = 'ready';
    this.observeReelSlide(slide);
  },

  _unloadReelSlideMedia(slide) {
    if (!slide || slide.dataset.mediaState !== 'ready') return;
    slide.querySelectorAll('video').forEach((video) => {
      video.pause();
      video.removeAttribute('src');
      video.querySelectorAll('source').forEach((source) => source.removeAttribute('src'));
      try { video.load(); } catch (err) { /* ignore */ }
    });
    slide.innerHTML = this._reelPendingThrobberHtml();
    slide.dataset.mediaState = 'empty';
  },

  /**
   * Keep network use on the slide in view and the next 3 slots.
   * Shells stay in the track so scroll position does not jump.
   */
  _syncReelMediaWindow(track, forcedPos) {
    if (!track) return;
    const slides = Array.from(track.children);
    if (!slides.length) return;
    let domPos = Number.isInteger(forcedPos) ? forcedPos : -1;
    if (domPos < 0) {
      const dom = this._getDominantReelsSlide(track);
      domPos = dom ? slides.indexOf(dom) : 0;
    }
    if (domPos < 0) domPos = 0;
    const ahead = 3;
    slides.forEach((slide, pos) => {
      const delta = pos - domPos;
      if (delta >= 0 && delta <= ahead) this._mountReelSlideMedia(slide);
      else this._unloadReelSlideMedia(slide);
    });
  },

  appendMoreReelSlides(n) {
    const track = document.getElementById('ads-reels-track');
    const catalog = this._reelsCatalog;
    if (!track || !catalog || !catalog.length) return;
    const maxDom = 80;
    if (track.children.length >= maxDom) return;

    for (let i = 0; i < n; i++) {
      if (track.children.length >= maxDom) break;
      const ci = this._reelsAppendBase % catalog.length;
      const item = catalog[ci];
      track.appendChild(this._reelSlideShell(item, ci));
      this._reelsAppendBase++;
    }
    this._syncReelMediaWindow(track);
    this._syncReelsDominantMedia(track);
  },

  openReelsViewer(startIndex, options = {}) {
    const userActivatedSound = !!options.userActivatedSound;
    const catalog = this._reelsCatalog;
    const config = this._reelsConfig;
    if (!catalog || !catalog.length || !config) return;

    if (options.userInitiated) {
      this._reelsAutoOpenSuppressed = false;
    }

    const overlay = this.ensureReelsOverlay();
    const track = document.getElementById('ads-reels-track');
    if (!track) return;

    if (this._reelsImpressionObserver) {
      this._reelsImpressionObserver.disconnect();
      this._reelsImpressionObserver = null;
    }
    this._slideImpressionTracked = new WeakSet();
    this._reelsUserWantsSound = userActivatedSound;
    this._reelsLastCatalogIndex = Math.max(0, Math.min(startIndex, catalog.length - 1));

    track.innerHTML = '';
    this._reelsAppendBase = 0;

    catalog.forEach((item, i) => {
      track.appendChild(this._reelSlideShell(item, i));
      this._reelsAppendBase++;
    });
    this._syncReelMediaWindow(track, Math.max(0, Math.min(startIndex, catalog.length - 1)));

    overlay.removeAttribute('hidden');
    overlay.classList.toggle('ads-reels-overlay--on-loader', !!options.onLoader);
    document.body.classList.add('ads-reels-open');

    if (this._reelsScrollHandler) {
      track.removeEventListener('scroll', this._reelsScrollHandler);
    }
    this._reelsScrollHandler = () => {
      if (!track || overlay.hasAttribute('hidden')) return;
      this._syncReelMediaWindow(track);
      this._syncReelsDominantMedia(track);
      const slideH = track.clientHeight || window.innerHeight;
      const remaining = track.scrollHeight - track.scrollTop - track.clientHeight;
      if (track.scrollHeight > track.clientHeight && remaining < slideH * 3) {
        this.appendMoreReelSlides(3);
      }
    };
    track.addEventListener('scroll', this._reelsScrollHandler, { passive: true });

    if (this._reelsKeyHandler) {
      document.removeEventListener('keydown', this._reelsKeyHandler);
    }
    this._reelsKeyHandler = (e) => {
      if (e.key === 'Escape') this.closeReelsViewer();
    };
    document.addEventListener('keydown', this._reelsKeyHandler);

    requestAnimationFrame(() => {
      const target = track.children[Math.min(startIndex, track.children.length - 1)];
      if (target) {
        target.scrollIntoView({ block: 'start' });
      }
      this._syncReelMediaWindow(track);
      this._reelsScrollHandler();
      requestAnimationFrame(() => {
        this._syncReelMediaWindow(track);
        this._syncReelsDominantMedia(track);
      });
    });
  },

  closeReelsViewer() {
    this._clearReelAutoAdvance();
    const overlay = document.getElementById('ads-reels-overlay');
    const track = document.getElementById('ads-reels-track');
    if (this._reelsImpressionObserver) {
      this._reelsImpressionObserver.disconnect();
      this._reelsImpressionObserver = null;
    }
    if (track) {
      track.querySelectorAll('video').forEach((v) => v.pause());
      if (this._reelsScrollHandler) {
        track.removeEventListener('scroll', this._reelsScrollHandler);
        this._reelsScrollHandler = null;
      }
    }
    if (this._reelsKeyHandler) {
      document.removeEventListener('keydown', this._reelsKeyHandler);
      this._reelsKeyHandler = null;
    }
    var wasLoaderReel = !!(overlay && overlay.classList.contains('ads-reels-overlay--on-loader'));
    if (overlay) overlay.classList.remove('ads-reels-overlay--on-loader');
    overlay?.setAttribute('hidden', '');
    document.body.classList.remove('ads-reels-open');
    if (wasLoaderReel) {
      this._loaderReelsOpen = false;
      if (this._loaderReelsRestore) {
        this._reelsCatalog = this._loaderReelsRestore.catalog;
        this._reelsConfig = this._loaderReelsRestore.config;
        this._loaderReelsRestore = null;
      }
      try {
        document.dispatchEvent(new CustomEvent('ttms:loader-reels-closed'));
      } catch (err) { /* ignore */ }
    }
    this._reelsFullscreenOpenTriggered = true;
    this._reelActionSlide = null;

    if (this.isHomeSmoothNavMode()) {
      this._reelsAutoOpenSuppressed = true;
      this._lastReelsPreviewScrollProgress = 0;
    }

    // After closing reels, update the homepage preview to show the last viewed ad.
    // Loader reels keep the preview strip that loaded underneath.
    if (!wasLoaderReel && this.shouldUseReelsMode()) {
      this.updateReelsPreviewToCatalogIndex(this._reelsLastCatalogIndex);
    }

    if (this.isHomeSmoothNavMode()) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.releaseSmoothPreviewScrollLock();
        });
      });
    }
  },

  updateReelsPreviewToCatalogIndex(catalogIndex) {
    const adsList = document.getElementById('ads-list');
    const items = this._reelsCatalog;
    const config = this._reelsConfig;
    if (!adsList || !items || !items.length || !config) return;
    const idx = ((catalogIndex % items.length) + items.length) % items.length;
    adsList.innerHTML = '';
    const item = items[idx];
    const li = this.buildAdPanelLi(item, config, {
      primaryClick: (e) => {
        e.preventDefault();
        this.openReelsViewer(idx, { userActivatedSound: true, userInitiated: true });
      },
      videoSuffix: `-pv-${idx}`,
      reelsPreviewIndex: idx,
      previewStrip: true,
    });
    li.classList.add('ad-panel--preview');
    li.setAttribute('role', 'button');
    li.setAttribute('tabindex', '0');
    li.setAttribute('aria-label', `Open promotions, starting at ad ${idx + 1}`);
    li.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        this.openReelsViewer(idx, { userActivatedSound: true, userInitiated: true });
      }
    });
    adsList.appendChild(li);
    this._syncPreviewDominantMedia(adsList);
    this._startPreviewAutoplay(idx);
  },

  _clearPreviewAutoplay() {
    if (this._previewAutoTimer) {
      clearTimeout(this._previewAutoTimer);
      this._previewAutoTimer = null;
    }
    const adsList = document.getElementById('ads-list');
    if (adsList && this._previewEndedHandler) {
      adsList.querySelectorAll('video.ad-video').forEach((v) => {
        v.removeEventListener('ended', this._previewEndedHandler);
      });
    }
    this._previewEndedHandler = null;
  },

  _startPreviewAutoplay(currentIndex) {
    this._clearPreviewAutoplay();
    const adsList = document.getElementById('ads-list');
    const items = this._reelsCatalog;
    if (!adsList || !items || !items.length) return;
    const nextIndex = (currentIndex + 1) % items.length;
    const panel = adsList.querySelector('li.ad-panel--preview');
    const v = panel?.querySelector('video.ad-video');
    const img = panel?.querySelector('img.ad-portrait');

    if (v) {
      // In preview we want "when finished -> next", so disable looping.
      v.loop = false;
      this.configureInlineVideoEl(v);
      this._previewEndedHandler = () => this.updateReelsPreviewToCatalogIndex(nextIndex);
      v.addEventListener('ended', this._previewEndedHandler, { once: true });
      this.tryMutedPreviewPlay(v);
      return;
    }

    if (img) {
      this._previewAutoTimer = setTimeout(() => {
        this.updateReelsPreviewToCatalogIndex(nextIndex);
      }, 30000);
    }
  },

  displayAdsReelsMode(ads, config, options) {
    try {
      const adsList = document.getElementById('ads-list');
      if (!adsList) {
        console.error('❌ Ads list container not found!');
        return;
      }
      this.clearReelsPreviewClasses();
      adsList.innerHTML = '';
      adsList.classList.add('ads-list--preview');
      const section = adsList.closest('section.ads') || adsList.closest('section');
      if (section) {
        section.classList.add('menu-ad--reels-preview');
        if (!section.querySelector('.scroll-progress-bar')) {
          const bar = document.createElement('div');
          bar.className = 'scroll-progress-bar';
          bar.setAttribute('aria-hidden', 'true');
          bar.innerHTML = '<div class="scroll-progress-fill"></div>';
          section.insertBefore(bar, section.firstChild);
        }
      }

      const items = this.prepareAdsForDisplay(ads, options);
      if (items.length === 0) {
        console.log('ℹ️ No displayable ads for reels preview');
        return;
      }

      if (this._loaderReelsOpen && this._loaderReelsRestore) {
        this._loaderReelsRestore.catalog = items;
        this._loaderReelsRestore.config = config;
      } else {
        this._reelsCatalog = items;
        this._reelsConfig = config;
      }

      const start = Math.max(0, Math.min(this._reelsLastCatalogIndex, items.length - 1));
      const n = Math.min(this.REELS_PREVIEW_COUNT, items.length);
      for (let i = 0; i < n; i++) {
        const catalogIndex = (start + i) % items.length;
        const item = items[catalogIndex];
        const li = this.buildAdPanelLi(item, config, {
          primaryClick: (e) => {
            e.preventDefault();
            this.openReelsViewer(catalogIndex, { userActivatedSound: true, userInitiated: true });
          },
          videoSuffix: `-pv-${catalogIndex}`,
          reelsPreviewIndex: catalogIndex,
          previewStrip: true,
        });
        li.classList.add('ad-panel--preview');
        li.setAttribute('role', 'button');
        li.setAttribute('tabindex', '0');
        li.setAttribute('aria-label', `Open promotions, starting at ad ${catalogIndex + 1}`);
        li.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            this.openReelsViewer(catalogIndex, { userActivatedSound: true, userInitiated: true });
          }
        });
        adsList.appendChild(li);
      }

      // Preview strip: only play the card that's in-frame (centered) to avoid multiple autoplaying videos.
      if (this._previewScrollHandler) {
        adsList.removeEventListener('scroll', this._previewScrollHandler);
        window.removeEventListener('resize', this._previewScrollHandler);
      }
      this._previewScrollHandler = () => {
        this._syncPreviewDominantMedia(adsList);
      };
      adsList.addEventListener('scroll', this._previewScrollHandler, { passive: true });
      window.addEventListener('resize', this._previewScrollHandler, { passive: true });
      requestAnimationFrame(() => {
        this._syncPreviewDominantMedia(adsList);
        // Retry shortly after load in case AOS/layout shift changes widths.
        setTimeout(() => this._syncPreviewDominantMedia(adsList), 150);
      });

      // Single preview card: auto-advance (video end or 30s for images)
      this._startPreviewAutoplay(start);

      console.log(`✅ Reels preview: ${n} of ${items.length} ad(s)`);
      if (typeof window.initMenuReels === 'function') {
        window.initMenuReels();
      }
      this.setupReelsFullscreenAutoOpen();
    } catch (error) {
      console.error('Error displaying reels ads:', error);
    }
  },

  /**
   * Display ads in the list
   */
  displayAds(ads, config, options) {
    try {
      const adsList = document.getElementById('ads-list');
      if (!adsList) {
        console.error('❌ Ads list container not found!');
        return;
      }

      this.clearReelsPreviewClasses();

      if (this.shouldUseReelsMode()) {
        this.displayAdsReelsMode(ads, config, options);
        return;
      }

      adsList.innerHTML = '';
      console.log('🎨 Displaying ads:', ads);

      const items = this.prepareAdsForDisplay(ads);
      let skippedCount = ads.length - items.length;
      items.forEach((item) => {
        const li = this.buildAdPanelLi(item, config, {});
        adsList.appendChild(li);
      });

      console.log(`✅ Displayed ${items.length} ad(s) out of ${ads.length} total`);
      if (skippedCount > 0) {
        console.warn(`⚠️ Skipped ${skippedCount} ad(s) due to missing images`);
      }
    } catch (error) {
      console.error('Error displaying ads:', error);
    }
  },

  /**
   * Fetch active ads (client_id is optional: if not provided, returns all active ads)
   */
  async loadActiveAds() {
    try {
      const config = this.getConfig();
      if (!config) {
        console.warn('⚠️ Ads container not found, skipping ad load');
        return;
      }
      
      const { clientId, adsServiceUrl } = config;

      let url = `${adsServiceUrl}/api/v1/active-ads`;
      const params = [];

      if (clientId) {
        params.push(`client_id=${encodeURIComponent(clientId)}`);
      }
      if (this.userLocation) {
        params.push(`location=${encodeURIComponent(this.userLocation)}`);
      }

      if (params.length > 0) {
        url += '?' + params.join('&');
      }
      
      console.log('📡 Fetching ads from:', url);
      
      const response = await this.fetchWithTimeout(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        mode: 'cors',
        credentials: 'omit'
      });
      
      if (!response.ok) {
        let errorText = '';
        let errorData = null;
        try {
          errorText = await response.text();
          try {
            errorData = JSON.parse(errorText);
          } catch (e) {
            // Not JSON, use text as-is
          }
        } catch (e) {
          errorText = 'Could not read error response';
        }
        console.error('Failed to fetch ads:', response.status, response.statusText, errorText);
        
        // Show error message in the ads list if it's a server error
        const adsList = document.getElementById('ads-list');
        if (adsList && response.status >= 500) {
          const errorMsg = errorData?.details || errorData?.error || errorText || 'Server error';
          adsList.innerHTML = `<li class="ad-panel" style="padding: 2rem; text-align: center; color: var(--scheme-ink-muted);">
            <p>⚠️ Unable to load ads at this time.</p>
            <p style="font-size: 0.9em; margin-top: 0.5rem;">Error: ${this.escapeHtml(errorMsg)}</p>
            <p style="font-size: 0.8em; margin-top: 0.5rem; color: var(--scheme-ink-muted);">Please try refreshing the page.</p>
          </li>`;
        }
        return;
      }
      
      const result = await response.json();
      console.log('Ads response:', result);
      
      if (result.success && result.data && result.data.length > 0) {
        console.log(`✅ Found ${result.data.length} active ad(s)`);
        this.displayAds(result.data, config);
      } else {
        console.log('ℹ️ No active ads found');
      }
    } catch (error) {
      // Handle network errors (CORS, connection refused, etc.)
      if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
        const config = this.getConfig();
        const adsServiceUrl = config ? config.adsServiceUrl : this.config.adsServiceUrl;
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const isProductionAdsService = adsServiceUrl.includes('https://ads.ttmenus.com');
        
        if (isLocalhost && isProductionAdsService) {
          console.warn('⚠️ Local development detected: Trying to fetch from production ads-service');
        } else {
          console.warn('Failed to fetch ads: this may be a CORS issue or the ads service is not available.');
        }
      } else {
        console.error('Error loading ads:', error);
      }
    }
  },

  /**
   * Shared promo copy stores section links at the site root (`/alcoholic/`).
   * Multi-location menus publish that section under the location
   * (`/san-fernando/alcoholic/`). The promotion permalink carries the location.
   */
  scopePromoLink(link, promoUrl, locationSlug, menuBase) {
    const raw = String(link || '').trim();
    if (!raw || raw === '#') return raw;
    let path = raw;
    let origin = '';
    let promoPath = String(promoUrl || '').trim();
    let promoOrigin = '';
    if (/^https?:\/\//i.test(promoPath)) {
      try {
        const parsedPromo = new URL(promoPath);
        promoPath = parsedPromo.pathname || '';
        promoOrigin = parsedPromo.origin;
      } catch (err) {
        promoPath = '';
      }
    }
    let menuOrigin = '';
    if (menuBase && /^https?:\/\//i.test(String(menuBase))) {
      try { menuOrigin = new URL(menuBase).origin; } catch (err) { menuOrigin = ''; }
    }
    if (/^https?:\/\//i.test(raw)) {
      try {
        const parsed = new URL(raw);
        const sameMenu = (promoOrigin && parsed.origin === promoOrigin)
          || (menuOrigin && parsed.origin === menuOrigin)
          || (!promoOrigin && !menuOrigin && typeof window !== 'undefined' && parsed.origin === window.location.origin);
        if (!sameMenu) return raw;
        path = parsed.pathname || '/';
        origin = parsed.origin;
      } catch (err) {
        return raw;
      }
    } else if (raw.startsWith('//')) {
      return raw;
    }
    if (!path.startsWith('/')) path = `/${path}`;
    if (path.startsWith('/locations/')) return origin ? `${origin}${path}` : path;

    let slug = String(locationSlug || '').trim();
    if (!slug) {
      const match = promoPath.match(/^\/([^/]+)\/promotions(?:\/|$)/i);
      if (match && match[1] && match[1].toLowerCase() !== 'promotions') slug = match[1];
    }
    if (slug && path !== `/${slug}` && !path.startsWith(`/${slug}/`)) {
      path = `/${slug}${path}`;
    }
    if (!path.endsWith('/')) path += '/';
    const base = origin || promoOrigin || menuOrigin;
    return base ? `${base}${path}` : path;
  },

  /**
   * Transform menu JSON ad format to ads-client format
   */
  transformMenuAds(menuAds, menuBaseUrl = '') {
    if (!Array.isArray(menuAds)) {
      return [];
    }
    
    return menuAds.map((ad, index) => {
      // Transform images array
      const images = [];
      if (ad.images && Array.isArray(ad.images)) {
        ad.images.forEach(img => {
          const imageUrl = typeof img === 'string' ? img : (img.image || img.url || img.src || img.image_url);
          if (imageUrl) {
            // Store URL as-is, will be made absolute later with menu base URL
            images.push({
              image_url: imageUrl,
              imageUrl: imageUrl,
              url: imageUrl,
              image: imageUrl,
              alt_text: ad.title || 'Advertisement'
            });
          }
        });
      }
      
      // Generate ID if not present
      const adId = ad.id || `menu-ad-${index}-${(ad.title || '').toLowerCase().replace(/\s+/g, '-')}`;
      
      // link is the menu section; url is the promotion page and carries the location.
      let linkUrl = this.scopePromoLink(ad.link || '', ad.url || '', '', menuBaseUrl) || ad.url || '';
      if (!linkUrl || linkUrl === '#') {
        linkUrl = '#';
      } else if (!/^https?:\/\//i.test(linkUrl)) {
        linkUrl = this.absolutizeAssetUrl(linkUrl.startsWith('/') ? linkUrl : `/${linkUrl}`);
      }
      
      return {
        id: adId,
        title: ad.title || '',
        images: images,
        link_url: linkUrl,
        weight: ad.weight || 0,
        body: ad.body || '',
        daysofweek: ad.daysofweek || [],
        time_start: ad.time_start,
        time_finish: ad.time_finish,
      };
    });
  },

  _slugifyPlace(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  },

  /**
   * Load promotions from menu site's promotions/index.json.
   * Multi-location menus publish /{slug}/promotions/index.json instead of /promotions/index.json.
   */
  async loadMenuAds(menuUrl) {
    try {
      const origin = this.resolveSiteOrigin();
      const menuBase = menuUrl ? this.resolveMenuBaseUrl(menuUrl).replace(/\/+$/, '') : '';
      const root = (origin || menuBase || '').replace(/\/+$/, '');
      let slugs = [];
      if (root) {
        try {
          const idxRes = await fetch(`${root}/index.json`, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            mode: 'cors',
            credentials: 'omit',
          });
          if (idxRes.ok) {
            const idx = await idxRes.json();
            const locs = Array.isArray(idx.locations) ? idx.locations : [];
            const seenSlug = new Set();
            locs.forEach((loc) => {
              const slug = this._slugifyPlace(loc && (loc.slug || loc.city));
              if (!slug || seenSlug.has(slug)) return;
              seenSlug.add(slug);
              slugs.push(slug);
            });
          }
        } catch (err) { /* fall through to the site-wide feed */ }
      }

      const urls = [];
      if (slugs.length > 1 && root) {
        slugs.forEach((slug) => urls.push(`${root}/${encodeURIComponent(slug)}/promotions/index.json`));
      } else if (root) {
        urls.push(`${root}/promotions/index.json`);
      }

      let allAds = [];
      let lastStatus = 0;
      let anyOk = false;
      for (const url of urls) {
        try {
          const response = await fetch(url, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            mode: 'cors',
            credentials: 'omit',
            cache: 'no-store',
          });
          if (!response.ok) {
            lastStatus = response.status;
            continue;
          }
          anyOk = true;
          const adsData = await response.json();
          let items = [];
          if (Array.isArray(adsData)) items = adsData;
          else if (adsData && typeof adsData === 'object') {
            items = adsData.items || adsData.promotions || adsData.ads || adsData.data || [];
          }
          allAds = allAds.concat(items);
        } catch (err) {
          if (!window.__ttmsPromotionsFetchWarned) {
            console.debug('Promotions JSON unavailable:', url, err);
          }
        }
      }

      if (!anyOk) {
        if (!window.__ttmsPromotionsFetchWarned) {
          window.__ttmsPromotionsFetchWarned = true;
          if (lastStatus === 404) {
            console.info('ℹ️ No promotions/index.json on this site yet: using ads-service only');
          } else if (lastStatus) {
            console.warn(`⚠️ Promotions fetch failed: ${lastStatus}`);
          }
        }
        return [];
      }
      
      const seenOffer = new Set();
      allAds = allAds.filter((ad) => {
        const imgs = ad && Array.isArray(ad.images) ? ad.images : [];
        const hasImage = imgs.some((img) => {
          if (!img) return false;
          if (typeof img === 'string') return !!img.trim();
          return !!(img.image || img.image_url || img.url || img.src);
        });
        if (!hasImage) return false;
        const key = `${ad && ad.title ? ad.title : ''}|${typeof imgs[0] === 'string' ? imgs[0] : ((imgs[0] && (imgs[0].image || imgs[0].image_url)) || '')}`;
        if (seenOffer.has(key)) return false;
        seenOffer.add(key);
        return true;
      });

      console.log(`✅ Found ${allAds.length} promotion(s) with images`);

      const transformedAds = this.transformMenuAds(allAds);
      
      transformedAds.forEach((ad) => {
        ad.images.forEach((img) => {
          if (!img.image_url) return;
          const absolute = this.absolutizeAssetUrl(img.image_url);
          const display =
            typeof window !== 'undefined' && window.TtmsThumbor && window.TtmsThumbor.menuImageSrc
              ? window.TtmsThumbor.menuImageSrc(absolute, 'ad')
              : absolute;
          img.image_url = display;
          img.imageUrl = display;
          img.url = display;
          img.image = display;
        });
      });
      
      return transformedAds.filter((ad) => ad.images && ad.images.length);
    } catch (error) {
      console.error('Error loading menu ads:', error);
      return [];
    }
  },

  /**
   * Show the shared promo/service mix. If the page reel is already open, rebuild
   * it in place and keep the slide the viewer is on. The loader reel is left alone.
   */
  _displayReelAds(ads, config) {
    const items = this.prepareAdsForDisplay(ads, { keepOrder: true });
    if (!items.length) return false;
    const overlay = document.getElementById('ads-reels-overlay');
    const viewerOpen = !!(overlay && !overlay.hasAttribute('hidden') && !overlay.classList.contains('ads-reels-overlay--on-loader'));
    let keepId = '';
    if (viewerOpen) {
      const track = document.getElementById('ads-reels-track');
      const dom = track && this._getDominantReelsSlide(track);
      keepId = (dom && dom.dataset.adId) || '';
    }
    this.displayAds(ads, config, { keepOrder: true });
    if (viewerOpen) {
      const idx = items.findIndex((item) => item.ad && item.ad.id === keepId);
      this.openReelsViewer(idx >= 0 ? idx : 0, { userActivatedSound: !!this._reelsUserWantsSound });
    }
    return true;
  },

  /**
   * Load client-specific ads (menu JSON + ads-service), mixed in reels catalog.
   */
  async loadClientAds(clientId) {
    return this._loadClientAdsImpl(clientId);
  },

  async _loadClientAdsImpl(clientId) {
    const displayGen = ++this._displayGeneration;

    try {
      const config = this.getConfig();
      if (!config) {
        console.log('⚠️ Ads container not found, skipping client ad load');
        return;
      }

      const adsServiceUrl = config.adsServiceUrl || this.config.adsServiceUrl;
      const location = this.userLocation || '';
      const resolvedClientId = clientId || config.clientId;

      console.log('📡 Loading ads for client:', resolvedClientId);

      // Start ads-service fetch immediately (non-blocking for menu promos)
      const clientServicePromise = this.fetchServiceAds(adsServiceUrl, {
        clientId: resolvedClientId,
        location,
      });

      // Menu promotions from same-origin /promotions/index.json (fast)
      const menuAdsRaw = await this.loadMenuAds(config.menuUrl || null);
      const menuAds = this.filterAdsByDay(menuAdsRaw);

      if (displayGen !== this._displayGeneration) return;

      if (menuAds.length > 0) {
        console.log(`✅ Showing ${menuAds.length} menu promotion(s) while ads-service loads…`);
        if (config.container) {
          config.container.style.display = '';
          config.container.style.visibility = 'visible';
        }
        this._displayReelAds(this.mergeAdSources(menuAds, [], adsServiceUrl), config);
      }

      let serviceAds = await clientServicePromise;

      if (displayGen !== this._displayGeneration) return;

      if (serviceAds.length === 0 && !config.noCompetitorAds) {
        console.log('ℹ️ No client ads from service: trying network ads');
        serviceAds = await this.fetchServiceAds(adsServiceUrl, { location });
      }

      if (displayGen !== this._displayGeneration) return;

      const normalizedService = this.normalizeServiceAds(serviceAds, adsServiceUrl);
      const allAds = this.mergeAdSources(menuAds, serviceAds, adsServiceUrl);

      if (allAds.length > 0) {
        console.log(
          `✅ Mixed reels catalog: ${allAds.length} ad(s) (${menuAds.length} menu, ${normalizedService.length} service)`
        );
        if (config.container) {
          config.container.style.display = '';
          config.container.style.visibility = 'visible';
        }
        this._displayReelAds(allAds, config);
        window.dispatchEvent(new CustomEvent('adsPopulated'));
      } else if (menuAds.length === 0) {
        console.log(`ℹ️ No ads found for client ${resolvedClientId}`);
      }
    } catch (error) {
      console.error('Error loading client ads:', error);
    }
  },

  /**
   * Load ads function: exposed globally for Barba.js
   * This function re-reads the DOM each time to work with Barba.js
   */
  loadAds() {
    try {
      const config = this.getConfig();
      if (!config) {
        console.log('⚠️ Ads container not found, skipping ad load');
        return;
      }

      if (config.clientId) {
        return this.loadClientAds(config.clientId);
      }

      this.clearReelsPreviewClasses();
      const adsList = document.getElementById('ads-list');
      if (adsList) {
        adsList.innerHTML = '';
      }

      this.loadActiveAds();
    } catch (error) {
      console.error('Error loading ads:', error);
    }
  },

  clientIsPaid() {
    var loader = document.getElementById('loader');
    if (loader && loader.getAttribute('data-paid') === 'true') return true;
    var tier = 'free';
    if (window.SiteConfig && window.SiteConfig.tier) tier = window.SiteConfig.tier;
    else if (window.SITE_TIER) tier = window.SITE_TIER;
    tier = String(tier).toLowerCase();
    return tier === 'tier1' || tier === 'tier1_4mo' || tier === 'tier2';
  },

  /**
   * Open the loader reel as soon as any ads exist, then append later arrivals
   * without jumping the slide the viewer is on.
   */
  _presentLoaderReel(raw, config) {
    var items = this.prepareAdsForDisplay(raw, { keepOrder: true });
    if (!items.length) return false;
    var overlay = document.getElementById('ads-reels-overlay');
    var already = !!(
      this._loaderReelsOpen &&
      overlay &&
      !overlay.hasAttribute('hidden') &&
      overlay.classList.contains('ads-reels-overlay--on-loader')
    );
    if (already) {
      this._mergeLoaderReelItems(items);
      return true;
    }
    this._loaderReelsRestore = {
      catalog: this._reelsCatalog,
      config: this._reelsConfig
    };
    this._reelsCatalog = items;
    this._reelsConfig = config;
    this._loaderReelsOpen = true;
    this.openReelsViewer(0, { onLoader: true });
    var live = document.getElementById('ads-reels-overlay');
    var open = !!(live && !live.hasAttribute('hidden'));
    if (!open) {
      this._reelsCatalog = this._loaderReelsRestore.catalog;
      this._reelsConfig = this._loaderReelsRestore.config;
      this._loaderReelsRestore = null;
      this._loaderReelsOpen = false;
    }
    return open;
  },

  _mergeLoaderReelItems(items) {
    var track = document.getElementById('ads-reels-track');
    var prev = this._reelsCatalog || [];
    if (!track) return;
    var seen = new Set(prev.map(function (item) { return item && item.ad && item.ad.id; }).filter(Boolean));
    var self = this;
    items.forEach(function (item) {
      if (!item || !item.ad || !item.ad.id || seen.has(item.ad.id)) return;
      seen.add(item.ad.id);
      var ci = prev.length;
      prev.push(item);
      track.appendChild(self._reelSlideShell(item, ci));
    });
    this._reelsCatalog = prev;
    this._reelsAppendBase = Math.max(this._reelsAppendBase || 0, track.children.length);
    this._syncReelMediaWindow(track);
  },

  /**
   * Open the promotions reel over the loader.
   * Own menu promotions show as soon as they arrive. Paid menus do not pull
   * other restaurants' network ads. Each slide keeps a throbber until its
   * image or video is ready.
   */
  async showReelsOnLoader() {
    if (this._loaderReelsOpen && document.body.classList.contains('ads-reels-open')) return true;
    var paid = this.clientIsPaid();
    var config = this.getConfig();
    var serviceUrl = (config && config.adsServiceUrl) || this.config.adsServiceUrl || 'https://ads.ttmenus.com';
    var location = this.userLocation || '';
    var clientId = (config && config.clientId) || window.SITE_CLIENT_ID || '';
    var noCompetitor = !!(config && config.noCompetitorAds) || paid;
    if (!config) {
      config = {
        adsServiceUrl: serviceUrl,
        clientId: window.SITE_CLIENT_ID || '',
        menuUrl: (window.location && window.location.origin ? window.location.origin : '') + '/',
        noCompetitorAds: noCompetitor
      };
    }
    var menuAdsRaw = [];
    var serviceAds = [];
    var self = this;
    var present = function () {
      var menuAds = self.filterAdsByDay(menuAdsRaw);
      var raw = self.mergeAdSources(menuAds, serviceAds, serviceUrl);
      return self._presentLoaderReel(raw, config);
    };
    var menuPromise = this.loadMenuAds(config && config.menuUrl ? config.menuUrl : null).catch(function () { return []; }).then(function (raw) {
      menuAdsRaw = raw || [];
      present();
      return menuAdsRaw;
    });
    var servicePromise = (async function () {
      var ads = [];
      if (clientId) {
        ads = await self.fetchServiceAds(serviceUrl, { clientId: clientId, location: location }).catch(function () { return []; });
      }
      if ((!ads || !ads.length) && !noCompetitor) {
        ads = await self.fetchServiceAds(serviceUrl, { location: location }).catch(function () { return []; });
      }
      return ads || [];
    })().then(function (ads) {
      serviceAds = ads || [];
      present();
      return serviceAds;
    });
    await Promise.all([menuPromise, servicePromise]);
    var overlay = document.getElementById('ads-reels-overlay');
    return !!(this._loaderReelsOpen && overlay && !overlay.hasAttribute('hidden'));
  },
};

  // Initialize ads client when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => AdsClient.init());
  } else {
    AdsClient.init();
  }

  // Export for use in other scripts
  window.AdsClient = AdsClient;
  window.loadFrontPageAds = () => AdsClient.loadAds();
  window.loadClientPageAds = () => {
    const container = document.getElementById('pageadscontainer');
    if (container) {
      const clientId = container.getAttribute('data-client-id') || 'ttmenus';
      AdsClient.loadClientAds(clientId);
    }
  };

  // Barba transitions re-load ads after navigation
  function loadClientPageAdsIfPresent() {
    const container = document.getElementById('pageadscontainer');
    if (!container) return;
    if (typeof window.syncMenuReelsDocumentMode === 'function') {
      window.syncMenuReelsDocumentMode();
    }
    if (document.getElementById('menu-reels-viewport')) return;
    AdsClient._deferredAdsBound = false;
    if (typeof window.AdsClient !== 'undefined' && typeof window.AdsClient.loadAds === 'function') {
      window.AdsClient.loadAds();
    } else {
      window.loadClientPageAds();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadClientPageAdsIfPresent);
  } else {
    loadClientPageAdsIfPresent();
  }

  function registerBarbaAdsClient() {
    if (window.TTMSBarba) {
      window.TTMSBarba.register(loadClientPageAdsIfPresent);
    }
  }

  if (window.TTMSBarba) {
    registerBarbaAdsClient();
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', registerBarbaAdsClient);
  } else {
    registerBarbaAdsClient();
  }

  window.addEventListener('ttms:nav-mode-change', function () {
    if (typeof AdsClient.setupReelsFullscreenAutoOpen === 'function') {
      AdsClient.setupReelsFullscreenAutoOpen();
    }
  });
})();

