class ClientAdManager {
  constructor() {
    this.ads = [];
    this.currentDay = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    this.currentDate = new Date();
    this.hasPopulated = false; // Flag to prevent multiple population
    this.populateRetries = 0; // Track retry attempts
    this.maxRetries = 10; // Maximum retry attempts
    this.lastPopulateTime = 0; // Track when ads were last populated
  }

  // Check if ad should be shown based on recurring and daysofweek
  shouldShowByDay(ad) {
    // recurring: true → respect daysofweek
    // recurring: false → ignore daysofweek
    const result = !ad.recurring || !ad.daysofweek || ad.daysofweek.length === 0 || ad.daysofweek.includes(this.currentDay);
    console.log(`${ad.title} - shouldShowByDay:`, result, `(recurring: ${ad.recurring}, daysofweek: ${JSON.stringify(ad.daysofweek)}, currentDay: ${this.currentDay})`);
    return result;
  }

  // Check if ad should be shown based on event dates
  shouldShowByDate(ad) {
    // recurring: true → ignore eventdates
    // recurring: false → respect eventdates
    if (ad.recurring) {
      console.log(`${ad.title} - shouldShowByDate: true (recurring: true, ignoring eventdates)`);
      return true;
    }
    if (!ad.eventdates || ad.eventdates.length === 0) {
      console.log(`${ad.title} - shouldShowByDate: true (no eventdates)`);
      return true;
    }
    
    for (const event of ad.eventdates) {
      const endDate = new Date(event.end);
      const result = this.currentDate <= endDate;
      console.log(`${ad.title} - shouldShowByDate: ${result} (currentDate: ${this.currentDate}, endDate: ${endDate})`);
      if (result) {
        return true;
      }
    }
    console.log(`${ad.title} - shouldShowByDate: false (past all event dates)`);
    return false;
  }

  // Filter ads based on current conditions
  filterAds() {
    return this.ads.filter(ad => 
      this.shouldShowByDay(ad) && this.shouldShowByDate(ad)
    );
  }

  // Generate HTML for an ad - consistent with clientads.html structure
  generateAdHTML(ad) {
    const images = ad.images || [];
    console.log('Generating HTML for ad:', ad.title, 'with images:', images);
    
    const imageHTML = images.map(img => {
      // Fix image path - remove leading slash if present and ensure correct path
      let imagePath = img.image;
      console.log('Original image path:', imagePath);
      
      if (imagePath.startsWith('/')) {
        imagePath = imagePath.substring(1);
      }
      if (imagePath.startsWith('images/')) {
        imagePath = imagePath; // Keep as is
      } else if (imagePath.startsWith('advertisments/')) {
        imagePath = imagePath.replace('advertisments/', ''); // Remove advertisments/ prefix
      }
      
      const finalPath = `/${imagePath}`;
      console.log('Final image path:', finalPath);
      
      return `
        <li class="ad-panel">
          <a href="${ad.url}" class="content-panel">
            <img src="${finalPath}" class="ad-portrait-bg">
            <img src="${finalPath}" class="ad-portrait">
            <div class="adbottomspacer"></div>
          </a>
        </li>
      `;
    }).join('');

    return `
      <h2 class="center title clientad-heading" data-aos="zoom-out" data-aos-offset="10">
        <a href="${ad.url}">${ad.title}</a>
      </h2>
      <section id="clientad">
        <span data-aos="zoom-out-right">Promotion</span>
        <ul class="inner" data-aos="zoom-out-up" data-aos-duration="10" data-aos-offset="0" data-aos-easing="ease-in-sine">
          ${imageHTML}
        </ul>
      </section>
    `;
  }

  // Load ads from your JSON endpoints
  async loadAds() {
    try {
      const timestamp = new Date().getTime();
      const cacheBusting = `?t=${timestamp}`;
      
      // Load ads from individual advertisement JSON endpoints
      const adEndpoints = [
        '/advertisments/karaoke-tuesday/index.json',
        '/advertisments/all-fours-wednesday/index.json'
      ];
      
      const adPromises = adEndpoints.map(endpoint => 
        fetch(`${endpoint}${cacheBusting}`, {
          method: 'GET',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        }).then(response => response.json()).catch(() => null)
      );
      
      const adResults = await Promise.all(adPromises);
      const validAds = adResults.filter(ad => ad !== null);
      
      if (validAds.length > 0) {
        this.ads = validAds;
        console.log('Successfully loaded ads from JSON endpoints:', this.ads);
      } else {
        console.log('No ads loaded from JSON endpoints, using fallback data for testing');
        // Fallback data for testing when JSON endpoints fail
        this.ads = [
          {
            title: "Karaoke Tuesday",
            url: "/advertisments/karaoke-tuesday/",
            recurring: true,
            daysofweek: ["Tuesday"],
            images: [
              { image: "images/karaoke-tuesday.jpg" }
            ]
          },
          {
            title: "All Fours Wednesday",
            url: "/advertisments/all-fours-wednesday/",
            recurring: true,
            daysofweek: ["Wednesday"],
            images: [
              { image: "images/allfours.gif" }
            ]
          }
        ];
      }
      
    } catch (error) {
      console.error('Error loading ads:', error);
      console.log('Using fallback data for testing');
      // Fallback data for testing when JSON endpoints fail
      this.ads = [
        {
          title: "Karaoke Tuesday",
          url: "/advertisments/karaoke-tuesday/",
          recurring: true,
          daysofweek: ["Tuesday"],
          images: [
            { image: "images/karaoke-tuesday.jpg" }
          ]
        },
        {
          title: "All Fours Wednesday",
          url: "/advertisments/all-fours-wednesday/",
          recurring: true,
          daysofweek: ["Wednesday"],
          images: [
            { image: "images/allfours.gif" }
          ]
        }
      ];
    }
    
    // Don't call populateAds here - let init() handle it
  }

  // Initialize the ad manager
  async init() {
    await this.loadAds();
    // Populate ads once after loading
    this.populateAds();
  }

  // Method to manually apply ScrollMagic effects to ads
  applyScrollMagicEffects() {
    if (typeof initFrontPageAdsScrollEffects === 'function') {
      console.log('Manually applying ScrollMagic effects to ads...');
      try {
        // Check if the required elements exist before calling ScrollMagic
        const requiredElements = document.querySelectorAll('.clientad, .ad-panel, .frontpageads');
        if (requiredElements.length > 0) {
          initFrontPageAdsScrollEffects();
        } else {
          console.log('Required elements not found for ScrollMagic, skipping...');
        }
      } catch (error) {
        console.warn('Error applying ScrollMagic effects:', error);
      }
    } else {
      console.log('ScrollMagic function not available');
    }
  }

  // Method to show all ads (for debugging/management)
  showAllAds(containerType = null) {
    console.log('Showing all ads regardless of day/date conditions...');
    
    // Get the appropriate container
    let container = null;
    if (containerType) {
      container = document.getElementById(`${containerType}-ads-container`);
    } else {
      // Fallback to finding any available container
      container = document.getElementById('homepage-ads-container') || 
                  document.getElementById('client-ads-container') || 
                  document.getElementById('frontpage-ads-container') || 
                  document.getElementById('pageadscontainer');
    }
    
    if (!container) {
      console.log('No container found for showAllAds');
      return;
    }

    if (this.ads.length === 0) {
      container.innerHTML = '<p>No ads available</p>';
      return;
    }

    // Sort ads by event date order for better presentation
    const sortedAds = this.sortAdsByEventDate();
    const adsHTML = sortedAds.map(ad => this.generateAdHTML(ad)).join('');
    container.innerHTML = adsHTML;



    // Apply animations and effects
    if (typeof AOS !== 'undefined') {
      AOS.refresh();
    }
    if (typeof initFrontPageAdsScrollEffects === 'function') {
      setTimeout(() => {
        try {
          // Check if the required elements exist before calling ScrollMagic
          const requiredElements = container.querySelectorAll('.clientad, .ad-panel, .frontpageads');
          if (requiredElements.length > 0) {
            initFrontPageAdsScrollEffects();
          } else {
            console.log('Required elements not found for ScrollMagic, skipping...');
          }
        } catch (error) {
          console.warn('Error applying ScrollMagic effects:', error);
        }
      }, 100);
    }
  }



  // Method to get all ads with their current status
  getAllAdsStatus() {
    return this.ads.map(ad => ({
      ...ad,
      currentStatus: {
        shouldShowByDay: this.shouldShowByDay(ad),
        shouldShowByDate: this.shouldShowByDate(ad),
        isCurrentlyVisible: this.shouldShowByDay(ad) && this.shouldShowByDate(ad),
        currentDay: this.currentDay,
        currentDate: this.currentDate
      }
    }));
  }



  // Method to calculate next occurrence date for recurring events
  getNextOccurrenceDate(ad) {
    if (!ad.recurring || !ad.daysofweek || ad.daysofweek.length === 0) {
      return null;
    }
    
    const today = new Date();
    const currentDay = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    // Find the next occurrence of this recurring event
    for (let i = 0; i < 7; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(today.getDate() + i);
      const checkDay = dayNames[checkDate.getDay()];
      
      if (ad.daysofweek.includes(checkDay)) {
        return checkDate;
      }
    }
    
    // If no match found in next 7 days, return null (will be sorted alphabetically)
    return null;
  }

  // Method to sort ads by event date order
  sortAdsByEventDate() {
    return [...this.ads].sort((a, b) => {
      // Get next occurrence dates for recurring events
      const aNextDate = this.getNextOccurrenceDate(a);
      const bNextDate = this.getNextOccurrenceDate(b);
      
      // If both have next occurrence dates, sort by them
      if (aNextDate && bNextDate) {
        return aNextDate - bNextDate;
      }
      
      // If only one has a next occurrence date, prioritize it
      if (aNextDate) return -1;
      if (bNextDate) return 1;
      
      // If both have event dates (non-recurring), sort by start date
      if (a.eventdates && a.eventdates.length > 0 && b.eventdates && b.eventdates.length > 0) {
        const aStart = new Date(a.eventdates[0].start);
        const bStart = new Date(b.eventdates[0].start);
        return aStart - bStart;
      }
      
      // If only one has event dates, prioritize the one with dates
      if (a.eventdates && a.eventdates.length > 0) return -1;
      if (b.eventdates && b.eventdates.length > 0) return 1;
      
      // If neither has event dates or next occurrence dates, sort alphabetically by title
      return a.title.localeCompare(b.title);
    });
  }

  // Method to refresh ads data from endpoints
  async refreshAds() {
    console.log('Refreshing ads from endpoints...');
    await this.loadAds();
  }





  // Override populateAds to respect the showAllAds flag
  populateAds() {
    // Prevent multiple population of the same container
    if (this.hasPopulated) {
      console.log('Ads already populated, skipping...');
      return;
    }
    
    // Check if ads are loaded
    if (!this.ads || this.ads.length === 0) {
      if (this.populateRetries < this.maxRetries) {
        this.populateRetries++;
        console.log(`No ads loaded yet, retrying... (${this.populateRetries}/${this.maxRetries})`);
        // Try again in a moment if ads aren't loaded
        setTimeout(() => this.populateAds(), 100);
        return;
      } else {
        console.log('Max retries reached, ads not loaded');
        return;
      }
    }
    
    // Determine which container to populate based on page context
    let container = null;
    let containerType = '';
    
    // Check for different ad containers in order of priority
    if (document.getElementById('homepage-ads-container')) {
      container = document.getElementById('homepage-ads-container');
      containerType = 'homepage';
      console.log('Found homepage-ads-container:', container);
    } else if (document.getElementById('client-ads-container')) {
      container = document.getElementById('client-ads-container');
      containerType = 'client';
      console.log('Found client-ads-container:', container);
    } else if (document.getElementById('frontpage-ads-container')) {
      container = document.getElementById('frontpage-ads-container');
      containerType = 'frontpage';
      console.log('Found frontpage-ads-container:', container);
    } else if (document.getElementById('pageadscontainer')) {
      // Fallback to old ID for backward compatibility
      container = document.getElementById('pageadscontainer');
      containerType = 'legacy';
      console.log('Found legacy pageadscontainer:', container);
    }
    
    if (!container) {
      console.log('No ad container found on this page');
      return;
    }
    
    console.log(`Populating ${containerType} ads container:`, container.id);

    // Special handling for client-ads-container - show all ads regardless of filtering
    if (containerType === 'client') {
      console.log('Client ads container detected - showing all ads without filtering');
      this.showAllAds(containerType);
      this.hasPopulated = true; // Mark as populated
      return;
    }

    // For homepage and other containers, show filtered ads but fallback to all ads if none match
    let filteredAds = this.filterAds();
    
    console.log('Current day:', this.currentDay);
    console.log('Current date:', this.currentDate);
    console.log('All ads:', this.ads);
    console.log('Filtered ads:', filteredAds);
    
    // If no filtered ads, show all ads as fallback for homepage
    if (filteredAds.length === 0 && containerType === 'homepage') {
      console.log('No filtered ads for homepage, showing all ads as fallback');
      filteredAds = this.ads;
    }
    
    if (filteredAds.length === 0) {
      // Don't show any content when no ads are available
      container.innerHTML = '';
      return;
    }

    // Sort filtered ads by event date order for better presentation
    const sortedFilteredAds = filteredAds.sort((a, b) => {
      // Get next occurrence dates for recurring events
      const aNextDate = this.getNextOccurrenceDate(a);
      const bNextDate = this.getNextOccurrenceDate(b);
      
      // If both have next occurrence dates, sort by them
      if (aNextDate && bNextDate) {
        return aNextDate - bNextDate;
      }
      
      // If only one has a next occurrence date, prioritize it
      if (aNextDate) return -1;
      if (bNextDate) return 1;
      
      // If both have event dates (non-recurring), sort by start date
      if (a.eventdates && a.eventdates.length > 0 && b.eventdates && b.eventdates.length > 0) {
        const aStart = new Date(a.eventdates[0].start);
        const bStart = new Date(b.eventdates[0].start);
        return aStart - bStart;
      }
      
      // If only one has event dates, prioritize the one with dates
      if (a.eventdates && a.eventdates.length > 0) return -1;
      if (b.eventdates && b.eventdates.length > 0) return 1;
      
      // If neither has event dates or next occurrence dates, sort alphabetically by title
      return a.title.localeCompare(b.title);
    });
    
    const adsHTML = sortedFilteredAds.map(ad => this.generateAdHTML(ad)).join('');
    console.log(`Setting container ${container.id} HTML:`, adsHTML.substring(0, 200) + '...');
    container.innerHTML = adsHTML;
    console.log(`Container ${container.id} HTML after setting:`, container.innerHTML.substring(0, 200) + '...');

    // Mark as populated and track time
    this.hasPopulated = true;
    this.lastPopulateTime = Date.now();

    // Reinitialize AOS animations if they exist
    if (typeof AOS !== 'undefined') {
      AOS.refresh();
    }

    // Apply ScrollMagic effects to the newly generated ads
    if (typeof initFrontPageAdsScrollEffects === 'function') {
      console.log('Applying ScrollMagic effects to generated ads...');
      setTimeout(() => {
        try {
          // Check if the required elements exist before calling ScrollMagic
          const requiredElements = container.querySelectorAll('.clientad, .ad-panel, .frontpageads');
          if (requiredElements.length > 0) {
            initFrontPageAdsScrollEffects();
          } else {
            console.log('Required elements not found for ScrollMagic, skipping...');
          }
        } catch (error) {
          console.warn('Error applying ScrollMagic effects:', error);
        }
      }, 100); // Small delay to ensure DOM is ready
    } else {
      console.log('initFrontPageAdsScrollEffects function not available');
    }
  }
}

// Prevent multiple initializations
let adManagerInitialized = false;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  if (adManagerInitialized) {
    console.log('ClientAdManager: Already initialized, skipping...');
    return;
  }
  
  try {
    console.log('ClientAdManager: DOMContentLoaded fired, creating instance...');
    const adManager = new ClientAdManager();
    adManager.init();
    
    // Explicitly assign to window.adManager
    window.adManager = adManager;
    adManagerInitialized = true;
    console.log('ClientAdManager: Instance created and assigned to window.adManager:', window.adManager);
    
    // Also trigger a custom event to notify other scripts
    window.dispatchEvent(new CustomEvent('adManagerReady', { detail: adManager }));
    
  } catch (error) {
    console.error('ClientAdManager: Error creating instance:', error);
  }
});

// Also try to initialize immediately if DOM is already ready
if (document.readyState === 'loading') {
  console.log('ClientAdManager: DOM still loading, waiting for DOMContentLoaded...');
} else if (!adManagerInitialized) {
  console.log('ClientAdManager: DOM already ready, creating instance immediately...');
  try {
    const adManager = new ClientAdManager();
    adManager.init();
    window.adManager = adManager;
    adManagerInitialized = true;
    console.log('ClientAdManager: Instance created immediately:', window.adManager);
    window.dispatchEvent(new CustomEvent('adManagerReady', { detail: adManager }));
  } catch (error) {
    console.error('ClientAdManager: Error creating instance immediately:', error);
  }
}


