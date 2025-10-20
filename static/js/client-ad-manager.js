// ClientAdManager - Only handles homepage-ads-container
// clientads.html is pure Hugo template (no JS needed)

class ClientAdManager {
  constructor() {
    this.ads = [];
    this.currentDay = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    this.currentDate = new Date();
    this.hasPopulated = false;
    console.log('ClientAdManager initialized for homepage only');
  }

  // Filter ads by day of week
  filterAdsByDay() {
    return this.ads.filter(ad => {
      // If no daysofweek specified, show ad
      if (!ad.daysofweek || ad.daysofweek.length === 0) {
        return true;
      }
      // Check if current day matches
      return ad.daysofweek.includes(this.currentDay);
    });
  }

  // Load ads from JSON
  async loadAds() {
    try {
      const url = `/advertisments/index.json?t=${Date.now()}`;
      console.log('Loading ads from:', url);
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      if (data && data.items) {
        this.ads = data.items;
        console.log('Loaded ads:', this.ads.length);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to load ads:', error);
    return false;
  }
  }

  // Generate HTML for one ad
  generateAdHTML(ad) {
    const finalUrl = ad.link || ad.url || `/advertisments/${ad.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}/`;
    const adId = ad.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    
    const imagesHTML = (ad.images || []).map(img => `
      <li class="ad-panel">
          <a href="${finalUrl}" class="content-panel">
          <img src="/${img.image}" class="ad-portrait-bg">
          <img src="/${img.image}" class="ad-portrait">
            <div class="adbottomspacer"></div>
          </a>
        </li>
    `).join('');

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
      if (!loaded || this.ads.length === 0) {
        container.innerHTML = '<p style="text-align: center; padding: 2em;">No promotions available</p>';
        return;
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

    // Generate and display HTML
    const html = filtered.map(ad => this.generateAdHTML(ad)).join('');
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

    // Force AOS to reinitialize for new elements
    setTimeout(() => {
      if (typeof AOS !== 'undefined') {
        console.log('Reinitializing AOS for ads...');
        
        // Remove AOS classes to reset
        const aosElements = container.querySelectorAll('[data-aos]');
        aosElements.forEach(el => {
          el.classList.remove('aos-init', 'aos-animate');
        });
        
        // Refresh AOS to detect new elements
        AOS.refresh();
        
        // Force hard refresh after a moment
        setTimeout(() => {
          AOS.refreshHard();
          console.log('AOS refreshed for ads');
        }, 50);
      }
      
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
  if (adManagerInstance) {
    console.log('AdManager already exists');
      return;
    }
    
  // Only initialize if homepage-ads-container exists
  if (!document.getElementById('homepage-ads-container')) {
    console.log('No homepage-ads-container, skipping ClientAdManager');
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
