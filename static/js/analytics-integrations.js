/**
 * TTMS Analytics Integrations
 * Connects existing functionality with analytics tracking
 */

(function() {
  'use strict';

  // Wait for analytics to be ready
  function waitForAnalytics(callback) {
    if (window.ttmsAnalytics && window.ttmsAnalytics.enabled) {
      callback();
    } else {
      setTimeout(() => waitForAnalytics(callback), 100);
    }
  }

  // Initialize all tracking integrations
  function initIntegrations() {
    console.log('🔌 Initializing analytics integrations...');
    
    // Track menu item clicks
    setupMenuItemTracking();
    
    // Track ad clicks
    setupAdClickTracking();
    
    // Track location changes
    setupLocationTracking();
    
    // Track PWA installation
    setupPWATracking();
    
    // Track dashboard interactions
    setupDashboardTracking();
    
    // Track social media clicks
    setupSocialMediaTracking();
    
    console.log('✅ Analytics integrations initialized');
  }

  /**
   * Track menu item clicks
   */
  function setupMenuItemTracking() {
    // Override the global openItem function if it exists
    if (typeof window.openItem === 'function') {
      const originalOpenItem = window.openItem;
      
      window.openItem = function(element, permalink) {
        // Extract item data
        const itemData = {
          url: permalink,
          title: element.querySelector('h3, .title')?.textContent || 'Unknown Item',
          category: element.closest('section')?.id || 'Unknown Category',
          price: parseFloat(element.querySelector('.price, [class*="price"]')?.textContent?.replace(/[^0-9.]/g, '')) || 0
        };
        
        // Track the view
        if (window.ttmsAnalytics) {
          window.ttmsAnalytics.trackMenuItemView(itemData);
        }
        
        // Call original function
        return originalOpenItem.apply(this, arguments);
      };
      
      console.log('📝 Menu item tracking hooked');
    }
    
    // Also track clicks on menu item elements
    document.addEventListener('click', function(e) {
      const menuItem = e.target.closest('[onclick*="openItem"]');
      if (menuItem) {
        const onclickAttr = menuItem.getAttribute('onclick');
        const urlMatch = onclickAttr?.match(/['"]([^'"]+)['"]/);
        
        if (urlMatch && window.ttmsAnalytics) {
          const itemData = {
            url: urlMatch[1],
            title: menuItem.querySelector('h3, .title')?.textContent || 'Unknown Item',
            category: menuItem.closest('section')?.id || 'Unknown Category',
            price: parseFloat(menuItem.querySelector('.price')?.textContent?.replace(/[^0-9.]/g, '')) || 0
          };
          
          window.ttmsAnalytics.trackMenuItemView(itemData);
        }
      }
    });
  }

  /**
   * Track add to cart (integrated with WhatsApp ordering system)
   */
  window.trackAddToCart = function(itemData, quantity, totalPrice) {
    if (window.ttmsAnalytics) {
      window.ttmsAnalytics.trackAddToCart(itemData, quantity, totalPrice);
    }
  };

  /**
   * Track cart removal
   */
  window.trackRemoveFromCart = function(itemData, totalCartValue) {
    if (window.ttmsAnalytics) {
      window.ttmsAnalytics.trackRemoveFromCart(itemData, totalCartValue);
    }
  };

  /**
   * Track order submission
   */
  window.trackOrderSubmission = function(orderData) {
    if (window.ttmsAnalytics) {
      window.ttmsAnalytics.trackOrderSubmission(orderData);
    }
  };

  /**
   * Track advertisement clicks
   */
  function setupAdClickTracking() {
    document.addEventListener('click', function(e) {
      const adElement = e.target.closest('.ad-panel, #clientad a, [class*="ad-"]');
      
      if (adElement) {
        const adData = {
          title: window.ttmsAnalytics.extractAdTitle(adElement.closest('section, .ad-panel') || adElement),
          url: adElement.href || window.ttmsAnalytics.extractAdUrl(adElement)
        };
        
        if (window.ttmsAnalytics && adData.title) {
          window.ttmsAnalytics.trackAdClick(adData);
        }
      }
    });
    
    console.log('📢 Ad click tracking hooked');
  }

  /**
   * Track location selection
   */
  function setupLocationTracking() {
    // Hook into location select if it exists
    const locationSelect = document.getElementById('locationSelect');
    
    if (locationSelect) {
      locationSelect.addEventListener('change', function() {
        const selectedOption = this.options[this.selectedIndex];
        
        if (selectedOption && selectedOption.value) {
          const locationData = {
            name: selectedOption.text,
            address: selectedOption.getAttribute('data-address') || '',
            whatsapp: selectedOption.value,
            lat: selectedOption.getAttribute('data-lat'),
            lng: selectedOption.getAttribute('data-lng')
          };
          
          if (window.ttmsAnalytics) {
            window.ttmsAnalytics.trackLocationSelection(locationData);
          }
        }
      });
      
      console.log('📍 Location tracking hooked');
    } else {
      // Retry if location select not yet loaded
      setTimeout(setupLocationTracking, 1000);
    }
  }

  /**
   * Track PWA installation
   */
  function setupPWATracking() {
    // Track install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      if (window.ttmsAnalytics) {
        window.ttmsAnalytics.trackEvent('PWA', 'Install Prompt Shown');
      }
    });
    
    // Track successful install
    window.addEventListener('appinstalled', (e) => {
      if (window.ttmsAnalytics) {
        window.ttmsAnalytics.trackPWAInstall('accepted');
        window.ttmsAnalytics.trackGoal(1); // Goal 1: PWA Installation
      }
    });
    
    // Override install button click if APP.startChromeInstall exists
    if (window.APP && typeof window.APP.startChromeInstall === 'function') {
      const originalInstall = window.APP.startChromeInstall;
      
      window.APP.startChromeInstall = function() {
        if (window.APP.deferredInstall) {
          window.APP.deferredInstall.userChoice.then((choice) => {
            if (window.ttmsAnalytics) {
              window.ttmsAnalytics.trackPWAInstall(choice.outcome);
            }
          });
        }
        
        return originalInstall.apply(this, arguments);
      };
    }
    
    console.log('📱 PWA tracking hooked');
  }

  /**
   * Track dashboard interactions
   */
  function setupDashboardTracking() {
    // Hook toggleDashboard
    if (typeof window.toggleDashboard === 'function') {
      const originalToggle = window.toggleDashboard;
      
      window.toggleDashboard = function() {
        const dashboard = document.getElementById('dashboard');
        const isOpening = dashboard?.classList.contains('loader-hide-left');
        
        if (window.ttmsAnalytics) {
          window.ttmsAnalytics.trackDashboardAction(isOpening ? 'Open' : 'Close');
        }
        
        return originalToggle.apply(this, arguments);
      };
    }
    
    // Track dashboard menu clicks
    document.addEventListener('click', function(e) {
      const dashboardItem = e.target.closest('#dashboard li');
      
      if (dashboardItem) {
        const itemText = dashboardItem.textContent.trim();
        
        if (window.ttmsAnalytics) {
          window.ttmsAnalytics.trackDashboardAction('Menu Click', itemText);
        }
      }
    });
    
    console.log('📊 Dashboard tracking hooked');
  }

  /**
   * Track social media clicks
   */
  function setupSocialMediaTracking() {
    document.addEventListener('click', function(e) {
      const link = e.target.closest('a');
      
      if (link && link.href) {
        const url = link.href.toLowerCase();
        
        // Detect social media links
        let network = null;
        if (url.includes('facebook.com')) network = 'Facebook';
        else if (url.includes('instagram.com')) network = 'Instagram';
        else if (url.includes('tiktok.com')) network = 'TikTok';
        else if (url.includes('youtube.com')) network = 'YouTube';
        else if (url.includes('twitter.com') || url.includes('x.com')) network = 'Twitter';
        else if (url.includes('whatsapp.com') || url.includes('wa.me')) network = 'WhatsApp';
        
        if (network && window.ttmsAnalytics) {
          window.ttmsAnalytics.trackSocialInteraction(network, 'Click', link.href);
        }
        
        // Track external links
        if (link.hostname && link.hostname !== window.location.hostname && window.ttmsAnalytics) {
          window.ttmsAnalytics.trackOutboundLink(link.href, link.textContent.trim());
        }
      }
    });
    
    console.log('📱 Social media tracking hooked');
  }

  /**
   * Track search functionality
   */
  window.trackSearch = function(searchTerm, resultsCount) {
    if (window.ttmsAnalytics) {
      window.ttmsAnalytics.trackSearch(searchTerm, resultsCount);
    }
  };

  /**
   * Enhanced function to track when ads are populated
   */
  window.addEventListener('adsPopulated', function() {
    console.log('📢 Ads populated event received, re-initializing ad tracking...');
    
    // Re-run ad impression observer
    if (window.ttmsAnalytics) {
      window.ttmsAnalytics.observeAdImpressions();
    }
  });

  // Initialize when analytics is ready
  waitForAnalytics(initIntegrations);

})();

