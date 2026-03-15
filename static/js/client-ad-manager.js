// ClientAdManager - Only handles homepage-ads-container
// clientads.html is pure Hugo template (no JS needed)

class ClientAdManager {
  constructor() {
    this.ads = [];
    this.currentDay = null;
    this.currentTime = null; // { hour, minute } from WorldTimeAPI
    this.hasPopulated = false;
    console.log('ClientAdManager initialized for homepage only');
  }

  /** Fetch datetime from WorldTimeAPI (trusted source, not browser). */
  async fetchDateTimeFromAPI() {
    try {
      const res = await fetch('https://worldtimeapi.org/api/ip', { cache: 'no-store' });
      if (!res.ok) return null;
      const data = await res.json();
      const dayNum = data.day_of_week;
      const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      const day = days[dayNum - 1] || null;
      let hour = 0, minute = 0;
      if (data.datetime) {
        const m = data.datetime.match(/T(\d{1,2}):(\d{2})/);
        if (m) { hour = parseInt(m[1], 10); minute = parseInt(m[2], 10); }
      }
      return day ? { day, hour, minute } : null;
    } catch (_) { return null; }
  }

  _parseTime(str) {
    if (!str || typeof str !== 'string') return null;
    const m = String(str).trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = parseInt(m[1], 10), min = parseInt(m[2], 10);
    if (h < 0 || h > 23 || min < 0 || min > 59) return null;
    return h * 60 + min;
  }

  // Filter ads by day of week and optional time window
  filterAdsByDay() {
    const day = this.currentDay || new Date().toLocaleDateString('en-US', { weekday: 'long' });
    const nowMins = this.currentTime ? this.currentTime.hour * 60 + this.currentTime.minute : null;
    return this.ads.filter(ad => {
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

  // Load ads from JSON
  async loadAds() {
    try {
      const url = `/promotions/index.json?t=${Date.now()}`;
      console.log('Loading ads from:', url);
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      if (data && data.items) {
        this.ads = data.items;
        console.log('Loaded ads:', this.ads.length);
        console.log('Sample ad:', this.ads[0]);
        return true;
      }
      console.warn('No items in promotions data:', data);
      return false;
    } catch (error) {
      console.error('Failed to load ads:', error);
    return false;
  }
  }

  // Check if ad has at least one valid image
  hasValidImages(ad) {
    const imgs = ad.images || [];
    return imgs.some(img => {
      const path = typeof img === 'string' ? img : (img && (img.image || img));
      return path && String(path).trim() !== '';
    });
  }

  // Generate HTML for one ad
  generateAdHTML(ad) {
    if (!this.hasValidImages(ad)) return '';
    const finalUrl = ad.link || ad.url || `/promotions/${ad.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}/`;
    const adId = ad.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    
    const imagesHTML = (ad.images || []).map(img => {
      // Handle both object format {image: "path"} and string format
      let imagePath = typeof img === 'string' ? img : (img.image || img);
      if (!imagePath) return '';
      if (!/^\//.test(imagePath) && !/^https?:\/\//i.test(imagePath)) imagePath = '/' + imagePath;
      return `
      <li class="ad-panel">
          <a href="${finalUrl}" class="content-panel">
          <img src="${imagePath}" class="ad-portrait-bg">
          <img src="${imagePath}" class="ad-portrait">
            <div class="adbottomspacer"></div>
          </a>
        </li>
    `;
    }).filter(html => html).join('');

    return `
      <section id="menu-ad-${adId}" class="ads menu-ad sticky">
        <div class="scroll-progress-bar">
          <div class="scroll-progress-fill"></div>
        </div>
        <h2 class="center title clientad-heading">
          <a href="${finalUrl}">${ad.title}</a>
        </h2>
        <span data-aos="zoom-out-right">Promotion</span>
        <ul class="inner" data-aos="zoom-out-up" data-aos-duration="10" data-aos-offset="0" data-aos-easing="ease-in-sine">
          ${imagesHTML}
        </ul>
      </section>
    `;
  }

  // Populate homepage container only
  async populateHomepage(force = false) {
    const container = document.getElementById('homepage-ads-container');
    if (!container) {
      console.log('No homepage-ads-container found');
          return;
    }

    // Skip if already populated (unless forcing)
    if (this.hasPopulated && !force) {
      console.log('Homepage ads already populated, skipping...');
          return;
    }

    console.log('Found homepage-ads-container, populating...');

    // Remove loading indicator
    const loading = container.querySelector('.ads-loading');
    if (loading) {
      loading.remove();
    }

    // Load ads if not already loaded
    if (this.ads.length === 0) {
      const loaded = await this.loadAds();
      if (!loaded) {
        console.error('Failed to load promotions');
        container.innerHTML = '<p style="text-align: center; padding: 2em; color: red;">Failed to load promotions. Please refresh the page.</p>';
        return;
      }
      if (this.ads.length === 0) {
        console.warn('No promotions found in data');
        container.innerHTML = '<p style="text-align: center; padding: 2em;">No promotions available</p>';
        return;
      }
    }

    // Use WorldTimeAPI for datetime (fallback to browser if API fails)
    if (!this.currentDay) {
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

    // Filter by current day
    let filtered = this.filterAdsByDay();
    console.log(`Current day: ${this.currentDay}, Filtered: ${filtered.length}/${this.ads.length} ads`);

    // Fallback: show all ads if none match
    if (filtered.length === 0) {
      console.log('No ads match today, showing all as fallback');
      filtered = this.ads;
    }

    // Generate and display HTML (skip ads with no images)
    const html = filtered.filter(ad => this.hasValidImages(ad)).map(ad => this.generateAdHTML(ad)).filter(h => h).join('') + 
      '<section class="ads menu-ad sticky" style="height: 100vh; min-height: 0; background: none; border: none;"></section>';
    container.innerHTML = html;
    container.style.display = '';
    container.style.visibility = 'visible';

    console.log('Homepage ads populated!');
    this.hasPopulated = true;

    // Force layout reflow before updating progress bars
    void container.offsetHeight;

    // Refresh scroll progress bars immediately
    if (window.adScrollProgressManager) {
      console.log('Refreshing scroll progress bars for new ads...');
      window.adScrollProgressManager.refresh();
    }

    // AOS removed - no longer needed
    setTimeout(() => {
      // Remove any remaining AOS classes if present
      const aosElements = container.querySelectorAll('[data-aos]');
      aosElements.forEach(el => {
        el.classList.remove('aos-init', 'aos-animate');
      });
      
      // Refresh scroll progress again after animations settle
      if (window.adScrollProgressManager) {
        window.adScrollProgressManager.refresh();
      }
      
      // Trigger custom event for other scripts
      window.dispatchEvent(new CustomEvent('adsPopulated'));
    }, 150);
  }

  // Public API for barba.js compatibility
  async populateAds(forceRepopulate = false) {
    console.log('populateAds called, forceRepopulate:', forceRepopulate);
    
    // Reset state if forcing repopulate
    if (forceRepopulate) {
      this.hasPopulated = false;
    }
    
    await this.populateHomepage(forceRepopulate);
  }

  // Public API
  async init() {
    await this.populateHomepage();
  }
}

// Initialize on page load
let adManagerInstance = null;

function initAdManager() {
  // Only initialize if homepage-ads-container exists
  if (!document.getElementById('homepage-ads-container')) {
    console.log('No homepage-ads-container, skipping ClientAdManager');
    // Clear instance if container doesn't exist (e.g., navigated away from homepage)
    if (adManagerInstance) {
      adManagerInstance = null;
      window.adManager = null;
    }
    return;
  }

  // If instance exists, just re-populate (for Barba transitions)
  if (adManagerInstance) {
    console.log('AdManager exists, re-populating for Barba transition...');
    // Reset hasPopulated flag to allow re-population
    adManagerInstance.hasPopulated = false;
    adManagerInstance.init();
    return;
  }

  console.log('Initializing ClientAdManager...');
  adManagerInstance = new ClientAdManager();
  adManagerInstance.init();
  window.adManager = adManagerInstance;
}

// Run on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAdManager);
} else {
  initAdManager();
}

// Expose initAdManager globally for Barba.js integration
window.initAdManager = initAdManager;

// Re-initialize on Barba transitions
if (typeof window.barba !== 'undefined') {
  document.addEventListener('barba:after', function() {
    console.log('Barba transition complete, checking for ad container...');
    // Small delay to ensure DOM is ready
    setTimeout(() => {
      initAdManager();
    }, 100);
  });
}
