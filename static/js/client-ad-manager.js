// ClientAdManager — homepage-ads-container + frontpage-ads-container
// Loads from ads.ttmenus.com API when available, else /promotions/index.json (Hugo content)

class ClientAdManager {
  constructor() {
    this.ads = [];
    this.currentDay = null;
    this.currentTime = null;
    this.hasPopulatedHome = false;
    this.hasPopulatedFront = false;
    this.sessionId = this.getSessionId();
    console.log('ClientAdManager initialized');
  }

  getSessionId() {
    try {
      let id = sessionStorage.getItem('ttmenus_session_id');
      if (!id) {
        id = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
        sessionStorage.setItem('ttmenus_session_id', id);
      }
      return id;
    } catch (_) {
      return 'sess_anon';
    }
  }

  async fetchDateTimeFromAPI() {
    try {
      const res = await fetch('https://worldtimeapi.org/api/ip', { cache: 'no-store' });
      if (!res.ok) return null;
      const data = await res.json();
      const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      const day = days[(data.day_of_week || 1) - 1] || null;
      let hour = 0;
      let minute = 0;
      if (data.datetime) {
        const m = data.datetime.match(/T(\d{1,2}):(\d{2})/);
        if (m) {
          hour = parseInt(m[1], 10);
          minute = parseInt(m[2], 10);
        }
      }
      return day ? { day, hour, minute } : null;
    } catch (_) {
      return null;
    }
  }

  async ensureDateTime() {
    if (this.currentDay) return;
    const dt = await this.fetchDateTimeFromAPI();
    const now = new Date();
    if (dt) {
      this.currentDay = dt.day;
      this.currentTime = { hour: dt.hour, minute: dt.minute };
    } else {
      this.currentDay = now.toLocaleDateString('en-US', { weekday: 'long' });
      this.currentTime = { hour: now.getHours(), minute: now.getMinutes() };
    }
  }

  _parseTime(str) {
    if (!str || typeof str !== 'string') return null;
    const m = String(str).trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (h < 0 || h > 23 || min < 0 || min > 59) return null;
    return h * 60 + min;
  }

  filterAdsByDay(ads) {
    const day = this.currentDay || new Date().toLocaleDateString('en-US', { weekday: 'long' });
    const nowMins = this.currentTime ? this.currentTime.hour * 60 + this.currentTime.minute : null;
    return ads.filter((ad) => {
      if (!ad.daysofweek || ad.daysofweek.length === 0) return true;
      if (!ad.daysofweek.includes(day)) return false;
      if (ad.time_start != null || ad.time_finish != null) {
        const start = this._parseTime(String(ad.time_start || '00:00'));
        const finish = this._parseTime(String(ad.time_finish || '23:59'));
        if (start == null || finish == null || nowMins == null) return false;
        if (start <= finish) return nowMins >= start && nowMins <= finish;
        return nowMins >= start || nowMins <= finish;
      }
      return true;
    });
  }

  async loadPromotionsJson() {
    try {
      const url = `/promotions/index.json?t=${Date.now()}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data && data.items) {
        this.ads = data.items;
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to load promotions JSON:', error);
      return false;
    }
  }

  hasValidImages(ad) {
    const imgs = ad.images || [];
    return imgs.some((img) => {
      const path = this.resolveImageUrl(img);
      return path && String(path).trim() !== '';
    });
  }

  resolveImageUrl(img) {
    if (!img) return '';
    if (typeof img === 'string') return img;
    return img.image_url || img.imageUrl || img.url || img.src || img.image || '';
  }

  normalizeImagePath(path) {
    if (!path) return '';
    if (/^\//.test(path) || /^https?:\/\//i.test(path)) return path;
    return '/' + path;
  }

  cssImageVar(path) {
    const safe = String(path).replace(/\\/g, '/').replace(/"/g, '%22');
    return `url("${safe}")`;
  }

  async fetchActiveAdsFromService(container) {
    if (!container) return [];
    const apiUrl = container.getAttribute('data-ads-api');
    const clientId = container.getAttribute('data-client-id');
    if (!apiUrl || !clientId) return [];

    try {
      await this.ensureDateTime();
      const day = encodeURIComponent(this.currentDay);
      const url = `${apiUrl.replace(/\/$/, '')}/active-ads?client_id=${encodeURIComponent(clientId)}&day=${day}`;
      const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      if (result.success && Array.isArray(result.data) && result.data.length > 0) {
        console.log('Ads API returned', result.data.length, 'ads');
        return result.data;
      }
    } catch (error) {
      console.warn('Ads API unavailable, using promotions fallback:', error);
    }
    return [];
  }

  async getAdsForDisplay(frontpageContainer) {
    await this.ensureDateTime();

    const apiAds = await this.fetchActiveAdsFromService(frontpageContainer);
    if (apiAds.length > 0) {
      return {
        ads: apiAds.filter((ad) => this.hasValidImages(ad)),
        fromApi: true,
      };
    }

    if (this.ads.length === 0) {
      await this.loadPromotionsJson();
    }
    if (this.ads.length === 0) return { ads: [], fromApi: false };

    let filtered = this.filterAdsByDay(this.ads);
    if (filtered.length === 0) filtered = this.ads;
    return {
      ads: filtered.filter((ad) => this.hasValidImages(ad)),
      fromApi: false,
    };
  }

  trackImpression(ad, container) {
    const apiUrl = container && container.getAttribute('data-ads-api');
    const clientId = container && container.getAttribute('data-client-id');
    if (!apiUrl || !ad.id) return;
    fetch(`${apiUrl.replace(/\/$/, '')}/tracking/impression`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ad_id: ad.id,
        client_id: clientId,
        session_id: this.sessionId,
        device_type: this.getDeviceType(),
        viewed_at: new Date().toISOString(),
      }),
    }).catch(() => {});
  }

  trackClick(ad, container) {
    const apiUrl = container && container.getAttribute('data-ads-api');
    if (!apiUrl || !ad.id) return;
    fetch(`${apiUrl.replace(/\/$/, '')}/tracking/click`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ad_id: ad.id,
        clicked_at: new Date().toISOString(),
        device_type: this.getDeviceType(),
        referrer: window.location.href,
      }),
    }).catch(() => {});
  }

  getDeviceType() {
    const ua = navigator.userAgent;
    if (/mobile/i.test(ua)) return 'mobile';
    if (/tablet/i.test(ua)) return 'tablet';
    return 'desktop';
  }

  createFrontpageAdPanel(ad, container, fromApi) {
    const li = document.createElement('li');
    li.className = 'ad-panel';
    if (ad.id) li.dataset.adId = ad.id;

    const linkUrl = fromApi
      ? ad.link_url
      : ad.link || ad.url || (ad.title ? `/promotions/${String(ad.title).toLowerCase().replace(/[^a-z0-9]+/g, '-')}/` : '');

    if (linkUrl) {
      li.style.cursor = 'pointer';
      li.addEventListener('click', (e) => {
        if (e.target.closest('a')) return;
        if (fromApi && ad.id) this.trackClick(ad, container);
        window.open(linkUrl, '_blank', 'noopener,noreferrer');
      });
    }

    const sponsored = document.createElement('span');
    sponsored.className = 'menu-ad-promo-label';
    sponsored.textContent = 'Sponsored';
    li.appendChild(sponsored);

    let hasMedia = false;
    (ad.images || []).forEach((img) => {
      const imageUrl = this.normalizeImagePath(this.resolveImageUrl(img));
      if (!imageUrl) return;
      const alt = (typeof img === 'object' && (img.alt_text || img.alt)) || ad.title || 'Sponsored advertisement';

      if (/\.(mp4|webm|ogg)$/i.test(imageUrl)) {
        const video = document.createElement('video');
        video.className = 'ad-portrait ad-video';
        video.autoplay = true;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        const source = document.createElement('source');
        source.src = imageUrl;
        source.type = 'video/mp4';
        video.appendChild(source);
        li.appendChild(video);
        hasMedia = true;
      } else {
        const fgImg = document.createElement('img');
        fgImg.src = imageUrl;
        fgImg.className = 'ad-portrait';
        fgImg.alt = alt;
        fgImg.loading = 'lazy';
        fgImg.decoding = 'async';
        li.appendChild(fgImg);
        hasMedia = true;
      }
    });

    return hasMedia ? li : null;
  }

  generateHomepageAdHTML(ad, adIndex) {
    if (!this.hasValidImages(ad)) return '';
    const finalUrl = ad.link || ad.url || `/promotions/${ad.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}/`;
    const adId = ad.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const eager = adIndex < 2;

    const imagesHTML = (ad.images || [])
      .map((img) => {
        const imagePath = this.normalizeImagePath(this.resolveImageUrl(img));
        if (!imagePath) return '';
        const loading = eager ? 'eager' : 'lazy';
        const fetchAttr = eager ? ' fetchpriority="high"' : '';
        return `
      <li class="ad-panel">
          <a href="${finalUrl}" class="content-panel" style="--ad-image:${this.cssImageVar(imagePath)}">
          <img src="${imagePath}" class="ad-portrait" alt="" loading="${loading}" decoding="async"${fetchAttr}>
            <div class="adbottomspacer"></div>
          </a>
        </li>`;
      })
      .filter(Boolean)
      .join('');

    return `
      <section id="menu-ad-${adId}" class="ads menu-ad sticky">
        <h2 class="center title clientad-heading">
          <a href="${finalUrl}">${ad.title}</a>
        </h2>
        <span class="menu-ad-promo-label">Promotion</span>
        <ul class="inner">
          ${imagesHTML}
        </ul>
      </section>`;
  }

  refreshAfterAdsPopulated() {
    requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent('adsPopulated'));
    });
  }

  hideContainer(container) {
    if (container) container.style.display = 'none';
  }

  async populateFrontpage(force = false) {
    // Frontpage ads handled by ads-client.js (reels preview + fullscreen viewer)
    if (document.getElementById('pageadscontainer')) return;

    const container = document.getElementById('frontpage-ads-container');
    if (!container) return;

    if (this.hasPopulatedFront && !force) return;

    const ul = container.querySelector('#frontpage-ad-sponsored ul.inner, section.ads ul.inner');
    if (!ul) {
      console.warn('frontpage-ads-container: missing ul.inner');
      return;
    }

    const { ads, fromApi } = await this.getAdsForDisplay(container);
    if (!ads.length) {
      console.log('No ads for frontpage — hiding container');
      this.hideContainer(container);
      this.hasPopulatedFront = true;
      return;
    }

    ul.innerHTML = '';
    ads.forEach((ad, index) => {
      const panel = this.createFrontpageAdPanel(ad, container, fromApi);
      if (panel) {
        ul.appendChild(panel);
        if (fromApi && ad.id) {
          setTimeout(() => this.trackImpression(ad, container), 500 + index * 100);
        }
      }
    });

    if (!ul.children.length) {
      this.hideContainer(container);
    } else {
      container.style.display = '';
      container.style.visibility = 'visible';
    }

    this.hasPopulatedFront = true;
    console.log('Frontpage ads populated:', ul.children.length);
    this.refreshAfterAdsPopulated();
  }

  async populateHomepage(force = false) {
    const container = document.getElementById('homepage-ads-container');
    if (!container) return;

    if (this.hasPopulatedHome && !force) return;

    const loading = container.querySelector('.ads-loading');
    if (loading) loading.remove();

    const { ads } = await this.getAdsForDisplay(null);
    if (ads.length === 0) {
      container.innerHTML = '<p style="text-align: center; padding: 2em;">No promotions available</p>';
      this.hasPopulatedHome = true;
      return;
    }

    const html =
      ads.map((ad, index) => this.generateHomepageAdHTML(ad, index)).filter(Boolean).join('') +
      '<section class="ads menu-ad sticky menu-ad-scroll-end" aria-hidden="true"></section>';

    container.innerHTML = html;
    container.style.display = '';
    container.style.visibility = 'visible';
    this.hasPopulatedHome = true;
    console.log('Homepage ads populated');
    this.refreshAfterAdsPopulated();
  }

  async populateAds(forceRepopulate = false) {
    if (forceRepopulate) {
      this.hasPopulatedHome = false;
      this.hasPopulatedFront = false;
      this.ads = [];
      this.currentDay = null;
    }
    await Promise.all([this.populateHomepage(forceRepopulate), this.populateFrontpage(forceRepopulate)]);
  }

  async init() {
    await this.populateAds(false);
    window.dispatchEvent(
      new CustomEvent('adManagerReady', { detail: { populateAds: (f) => this.populateAds(f) } })
    );
  }
}

let adManagerInstance = null;

function initAdManager() {
  const hasHome = !!document.getElementById('homepage-ads-container');
  const hasFront = !!document.getElementById('frontpage-ads-container') && !document.getElementById('pageadscontainer');

  if (!hasHome && !hasFront) {
    if (adManagerInstance) {
      adManagerInstance = null;
      window.adManager = null;
    }
    return;
  }

  if (adManagerInstance) {
    adManagerInstance.hasPopulatedHome = false;
    adManagerInstance.hasPopulatedFront = false;
    adManagerInstance.ads = [];
    adManagerInstance.currentDay = null;
    adManagerInstance.init();
    return;
  }

  adManagerInstance = new ClientAdManager();
  window.adManager = adManagerInstance;
  adManagerInstance.init();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAdManager);
} else {
  initAdManager();
}

window.initAdManager = initAdManager;

function registerBarbaAdManager() {
  if (window.TTMSBarba) {
    window.TTMSBarba.register(function () {
      setTimeout(initAdManager, 100);
    });
  }
}

if (window.TTMSBarba) {
  registerBarbaAdManager();
} else if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', registerBarbaAdManager);
} else {
  registerBarbaAdManager();
}
