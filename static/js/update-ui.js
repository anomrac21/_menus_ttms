/**
 * TTMenus Update UI Manager
 * Loads data from Hugo files, saves drafts in localStorage, only uses API for commits
 */

const UpdateUI = {
  // API Configuration - only used for POST/PUT/DELETE operations
  apiConfig: {
    baseUrl: window.UPDATE_API_URL || 'http://localhost:8083/api',
    clientId: window.CLIENT_ID || '_ttms_menudemo',
    getClientUrl: function() {
      return `${this.baseUrl}/clients/${this.clientId}`;
    },
    endpoints: {
      content: '/content',
      categories: '/categories',
      locations: '/locations',
      menudata: '/menudata',
      config: '/config',
      manifest: '/manifest',
      colors: '/colors',
      branding: '/branding/upload',
    }
  },

  // LocalStorage keys
  storageKeys: {
    draftItems: 'ttmenus_draft_items',
    draftAds: 'ttmenus_draft_ads',
    draftLocations: 'ttmenus_draft_locations',
    draftBranding: 'ttmenus_draft_branding',
    draftColors: 'ttmenus_draft_colors',
    draftConfig: 'ttmenus_draft_config',
    draftManifest: 'ttmenus_draft_manifest',
    pendingChanges: 'ttmenus_pending_changes',
  },

  // State
  state: {
    categories: [],
    menuItems: [],
    advertisements: [],
    locations: [],
    brandingImages: [],
    colors: {},
    currentFilter: '',
    editingItem: null,
    hasPendingChanges: false,
  },

  /**
   * Initialize the Update UI
   */
  async init() {
    console.log('Initializing Update UI (Hugo + localStorage mode)...');
    
    // Setup tab navigation FIRST (so active tab is ready)
    this.setupTabNavigation();
    
    // Setup search and filters
    this.setupSearchAndFilters();
    
    // Show initial loading state
    this.showLoadingState();
    
    // Load initial data from Hugo files
    try {
      await this.loadAllData();
      await this.loadAdvertisements();
    } catch (error) {
      console.error('Failed to load data:', error);
      this.showError('Failed to initialize. Check console for details.');
    }
    
    // Check for pending changes
    this.checkPendingChanges();
    
    // Render pending summary immediately (since it's the first/default tab)
    this.renderPendingSummary();
    
    // Setup auto-save
    this.setupAutoSave();
    
    console.log('✅ Update UI initialized and ready!');
  },

  /**
   * Show initial loading state
   */
  showLoadingState() {
    const container = document.getElementById('menuItemsList');
    if (container) {
      container.innerHTML = `
        <div class="loading" style="text-align: center; padding: 3rem; color: #6b7280;">
          <div style="font-size: 2rem; margin-bottom: 1rem;">⏳</div>
          <p style="font-size: 1.125rem; font-weight: 500;">Loading complete menu...</p>
          <p style="font-size: 0.875rem; margin-top: 0.5rem;">Please wait while we load your menu from Hugo...</p>
        </div>
      `;
    }
  },

  /**
   * Setup tab navigation
   */
  setupTabNavigation() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tabName = btn.getAttribute('data-tab');
        
        // Update active states
        tabButtons.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        
        btn.classList.add('active');
        const content = document.querySelector(`[data-tab-content="${tabName}"]`);
        if (content) {
          content.classList.add('active');
          
          // Load tab-specific data when tab is activated
          this.onTabActivated(tabName);
        }
      });
    });
  },

  /**
   * Handle tab activation
   */
  async onTabActivated(tabName) {
    console.log('Tab activated:', tabName);
    
    // Don't reload menu-items if already loaded (happens on init)
    if (tabName === 'menu-items' && this.state.menuItems.length > 0) {
      console.log('Menu items already loaded, skipping reload');
      return;
    }
    
    switch (tabName) {
      case 'menu-items':
        await this.loadMenuItems();
        break;
      case 'categories':
        // Categories are shown in menu-items tab now
        this.showAlert('Categories are managed in the Menu Items tab', 'info');
        break;
      case 'locations':
        await this.loadLocations();
        break;
      case 'branding':
        await this.loadBrandingImages();
        break;
      case 'colors':
        await this.loadColors();
        break;
      case 'config':
        await this.loadConfig();
        break;
      case 'manifest':
        await this.loadManifest();
        break;
      case 'pending':
        this.renderPendingSummary();
        break;
    }
  },

  /**
   * Setup search and filters
   */
  setupSearchAndFilters() {
    const searchInput = document.getElementById('searchItems');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.handleSearch(e.target.value);
      });
    }
  },

  /**
   * Handle search input changes
   */
  handleSearch(searchValue) {
    const searchTerm = (searchValue || '').trim();
    
    if (searchTerm === '') {
      // Empty search - show full categorized menu
      this.renderMenuByCategory();
    } else {
      // Has search term - show filtered results
      this.filterMenuItems(searchTerm);
    }
  },

  /**
   * Load all initial data from Hugo files
   */
  async loadAllData() {
    console.log('Loading all data...');
    
    // Load categories first (needed for rendering)
    await this.loadCategories();
    
    // Then load menu items
    await this.loadMenuItems();
    
    // Load locations in background (not critical for menu tab)
    this.loadLocations().catch(err => console.log('Locations load failed:', err));
    
    console.log('All data loaded');
  },

  /**
   * Load categories from menudata.json (Hugo data file)
   */
  async loadCategories() {
    console.log('Loading categories from /data/menudata.json...');
    try {
      // Load directly from Hugo's data file (no API needed!)
      const menuDataResponse = await fetch('/data/menudata.json');
      console.log('Categories fetch response:', menuDataResponse.status);
      
      if (menuDataResponse.ok) {
        const menuData = await menuDataResponse.json();
        console.log('Categories data:', menuData);
        this.state.categories = menuData.menu || [];
        console.log('Loaded', this.state.categories.length, 'categories');
        this.renderCategories();
        this.updateCategorySelects();
      } else {
        // 404 - menudata.json doesn't exist, that's okay
        // We'll auto-discover categories from items
        console.log('menudata.json not found (404), will auto-discover from items');
        this.state.categories = [];
      }
    } catch (error) {
      console.error('Error loading categories:', error);
      // Don't throw - allow init to continue
      this.state.categories = [];
    }
  },

  /**
   * Load menu items from Hugo's menu-items.json
   */
  async loadMenuItems() {
    console.log('Loading menu items from /api/menu-items.json...');
    try {
      // Load from Hugo's generated menu-items.json (no API!)
      const response = await fetch('/api/menu-items.json');
      console.log('Menu items fetch response:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Raw menu data:', data);
        console.log('Menu items count:', data.menu_items?.length || 0);
        
        // Convert Hugo's format to our format
        this.state.menuItems = (data.menu_items || []).map(item => {
          // Fix image paths - ensure they start with /
          let images = [];
          if (item.images && item.images.length > 0) {
            images = item.images.map(img => {
              return img.startsWith('/') ? img : '/' + img;
            });
          }
          
          // Get first image for backward compatibility with card display
          let imagePath = images.length > 0 ? images[0] : null;
          
          // Extract price from prices array
          // From your console: raw_prices: (3) ['-', '-', 70]
          // So it's a FLAT array: [size, flavour, price]
          let price = 0;
          
          if (item.prices && Array.isArray(item.prices)) {
            if (Array.isArray(item.prices[0])) {
              // Nested format: [[size, flavour, price], ...]
              price = parseFloat(item.prices[0][2]) || 0;
            } else if (item.prices.length >= 3) {
              // FLAT format: [size, flavour, price]
              // This is what your data has!
              price = parseFloat(item.prices[2]) || 0;
            } else if (typeof item.prices[0] === 'number') {
              // Just a single number
              price = item.prices[0];
            }
          }
          
          // Clean description - remove HTML tags and decode entities
          let description = item.summary || '';
          // Remove HTML tags
          description = description.replace(/<[^>]*>/g, '');
          // Decode HTML entities
          const textarea = document.createElement('textarea');
          textarea.innerHTML = description;
          description = textarea.value;
          
          return {
            id: item.id,
            title: item.name,
            description: description,
            category: item.category,
            price: price,
            size: item.sizes && item.sizes.length > 0 ? item.sizes[0] : '-',
            flavour: item.flavours && item.flavours.length > 0 ? item.flavours[0] : '-',
            tags: item.tags || [],
            ingredients: item.ingredients || [],
            cookingMethods: item.cookingmethods || [],
            types: item.types || [],
            image: imagePath,
            images: images,
            prices: item.prices || [],
            side_categories: item.side_categories || [],
            url: item.url,
            weight: item.weight || 0,
            _isDraft: false,
          };
        });
        
        // Merge with draft changes from localStorage
        this.mergeDraftItems();
        
        console.log('Menu items loaded, rendering by category...');
        
        // Render grouped by category - THIS SHOULD SHOW ALL ITEMS!
        this.renderMenuByCategory();
      } else {
        throw new Error('Failed to load menu-items.json');
      }
    } catch (error) {
      console.error('Error loading menu items:', error);
      this.showError('Failed to load menu items from Hugo. Ensure Hugo has built the site.');
      
      const container = document.getElementById('menuItemsList');
      if (container) {
        container.innerHTML = `
          <div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: #6b7280;">
            <p style="font-size: 1.125rem; font-weight: 500; margin-bottom: 0.5rem;">No menu items found</p>
            <p style="font-size: 0.875rem;">Run 'hugo' to build the site and generate menu-items.json</p>
          </div>
        `;
      }
    }
  },

  /**
   * Merge draft items from localStorage
   */
  mergeDraftItems() {
    const draftsJson = localStorage.getItem(this.storageKeys.draftItems);
    if (!draftsJson) return;
    
    try {
      const drafts = JSON.parse(draftsJson);
      
      // Add draft items to the list
      Object.values(drafts).forEach(draft => {
        // Normalize images format (convert old object format to flat array)
        if (draft.images && Array.isArray(draft.images)) {
          draft.images = draft.images.map(img => 
            typeof img === 'object' && img.image ? img.image : img
          );
        }
        
        // Ensure image property is set for card display
        if (!draft.image && draft.images && draft.images.length > 0) {
          draft.image = draft.images[0];
        }
        
        // Ensure price property is set for card display
        if (!draft.price && draft.prices && draft.prices.length > 0) {
          const firstPrice = draft.prices[0];
          draft.price = typeof firstPrice === 'object' ? parseFloat(firstPrice.price) || 0 : 0;
        }
        
        // Normalize property names to match API format (camelCase)
        if (draft.cookingmethods && !draft.cookingMethods) {
          draft.cookingMethods = draft.cookingmethods;
        }
        
        // Check if item exists
        const existingIndex = this.state.menuItems.findIndex(item => item.id === draft.id);
        
        if (existingIndex >= 0) {
          // Update existing item with draft
          this.state.menuItems[existingIndex] = { ...draft, _isDraft: true };
        } else {
          // Add new draft item
          this.state.menuItems.push({ ...draft, _isDraft: true, _isNew: true });
        }
      });
    } catch (error) {
      console.error('Error merging drafts:', error);
    }
  },

  /**
   * Save item draft to localStorage
   */
  saveDraft(itemData) {
    const draftsJson = localStorage.getItem(this.storageKeys.draftItems) || '{}';
    const drafts = JSON.parse(draftsJson);
    
    // Save draft
    drafts[itemData.id] = {
      ...itemData,
      _draftSavedAt: new Date().toISOString(),
    };
    
    localStorage.setItem(this.storageKeys.draftItems, JSON.stringify(drafts));
    
    // Mark as having pending changes
    this.markPendingChanges();
    
    // Update action buttons
    this.updateTabActionButtons();
    
    this.showSuccess('Draft saved locally');
  },

  /**
   * Get all draft items
   */
  getDrafts() {
    const draftsJson = localStorage.getItem(this.storageKeys.draftItems) || '{}';
    return JSON.parse(draftsJson);
  },

  /**
   * Clear a specific draft
   */
  clearDraft(itemId) {
    const drafts = this.getDrafts();
    delete drafts[itemId];
    localStorage.setItem(this.storageKeys.draftItems, JSON.stringify(drafts));
    
    // Check if any drafts remain
    if (Object.keys(drafts).length === 0) {
      this.clearPendingChanges();
    }
    
    // Update action buttons
    this.updateTabActionButtons();
  },

  /**
   * Mark that there are pending changes
   */
  markPendingChanges() {
    this.state.hasPendingChanges = true;
    localStorage.setItem(this.storageKeys.pendingChanges, 'true');
    
    // Update UI indicator
    this.updatePendingIndicator();
  },

  /**
   * Clear pending changes flag
   */
  clearPendingChanges() {
    this.state.hasPendingChanges = false;
    localStorage.removeItem(this.storageKeys.pendingChanges);
    this.updatePendingIndicator();
  },

  /**
   * Check for pending changes on load
   */
  checkPendingChanges() {
    // Check all possible draft storage keys
    const hasDrafts = 
      localStorage.getItem(this.storageKeys.draftItems) !== null ||
      localStorage.getItem(this.storageKeys.draftAds) !== null ||
      localStorage.getItem(this.storageKeys.draftLocations) !== null ||
      localStorage.getItem(this.storageKeys.draftBranding) !== null ||
      localStorage.getItem(this.storageKeys.draftColors) !== null ||
      localStorage.getItem(this.storageKeys.draftConfig) !== null ||
      localStorage.getItem(this.storageKeys.draftManifest) !== null;
    
    this.state.hasPendingChanges = hasDrafts;
    this.updatePendingIndicator();
    
    // Update pending tab count
    const totalCount = this.getPendingChangesCount();
    const countBadge = document.getElementById('pendingTabCount');
    if (countBadge) {
      countBadge.textContent = totalCount;
      if (totalCount > 0) {
        countBadge.classList.add('visible');
      } else {
        countBadge.classList.remove('visible');
      }
    }
    
    // Update all tab action buttons
    this.updateTabActionButtons();
  },

  /**
   * Update visibility of tab action buttons based on draft state
   */
  updateTabActionButtons() {
    // Menu Items
    const discardMenuItems = document.getElementById('discardMenuItems');
    if (discardMenuItems) {
      const hasDraftItems = localStorage.getItem(this.storageKeys.draftItems) !== null;
      discardMenuItems.style.display = hasDraftItems ? 'inline-block' : 'none';
    }
    
    // Advertisements
    const discardAds = document.getElementById('discardAdvertisements');
    if (discardAds) {
      const hasDraftAds = localStorage.getItem(this.storageKeys.draftAds) !== null;
      discardAds.style.display = hasDraftAds ? 'inline-block' : 'none';
    }
    
    // Locations
    const discardLocations = document.getElementById('discardLocations');
    if (discardLocations) {
      const hasDraftLocations = localStorage.getItem(this.storageKeys.draftLocations) !== null;
      discardLocations.style.display = hasDraftLocations ? 'inline-block' : 'none';
    }
    
    // Colors
    const discardColors = document.getElementById('discardColors');
    if (discardColors) {
      const hasDraftColors = localStorage.getItem(this.storageKeys.draftColors) !== null;
      discardColors.style.display = hasDraftColors ? 'inline-block' : 'none';
    }
    
    // Config
    const discardConfig = document.getElementById('discardConfig');
    if (discardConfig) {
      const hasDraftConfig = localStorage.getItem(this.storageKeys.draftConfig) !== null;
      discardConfig.style.display = hasDraftConfig ? 'inline-block' : 'none';
    }
    
    // Branding
    const discardBranding = document.getElementById('discardBranding');
    const publishBranding = document.getElementById('publishBranding');
    if (discardBranding || publishBranding) {
      const hasDraftBranding = localStorage.getItem(this.storageKeys.draftBranding) !== null;
      if (discardBranding) discardBranding.style.display = hasDraftBranding ? 'inline-block' : 'none';
      if (publishBranding) publishBranding.style.display = hasDraftBranding ? 'inline-block' : 'none';
    }
    
    // Manifest
    const discardManifest = document.getElementById('discardManifest');
    if (discardManifest) {
      const hasDraftManifest = localStorage.getItem(this.storageKeys.draftManifest) !== null;
      discardManifest.style.display = hasDraftManifest ? 'inline-block' : 'none';
    }
    
    // Pending tab actions
    const pendingActions = document.getElementById('pendingActions');
    if (pendingActions) {
      const totalCount = this.getPendingChangesCount();
      pendingActions.style.display = totalCount > 0 ? 'flex' : 'none';
    }
    
    // Color tab actions (publish button)
    const colorActions = document.getElementById('colorActions');
    if (colorActions) {
      const hasDraftColors = localStorage.getItem(this.storageKeys.draftColors) !== null;
      colorActions.style.display = hasDraftColors ? 'flex' : 'none';
    }
  },

  /**
   * Update pending changes indicator in UI
   */
  updatePendingIndicator() {
    // Add indicator to dashboard header
    let indicator = document.getElementById('pendingIndicator');
    
    if (this.state.hasPendingChanges) {
      if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'pendingIndicator';
        indicator.style.cssText = 'background: #f59e0b; color: white; padding: 0.5rem 1rem; border-radius: 6px; font-size: 0.875rem; font-weight: 500;';
        indicator.innerHTML = `
          ⚠️ Unsaved drafts
          <button onclick="UpdateUI.showPublishDialog()" style="background: white; color: #f59e0b; border: none; padding: 0.25rem 0.75rem; border-radius: 4px; margin-left: 0.5rem; cursor: pointer; font-weight: 600;">
            Publish Now
          </button>
        `;
        
        const dashboardUser = document.querySelector('.dashboard-header');
        if (dashboardUser) {
          dashboardUser.insertBefore(indicator, dashboardUser.firstChild);
        }
      }
    } else {
      if (indicator) {
        indicator.remove();
      }
    }
  },

  /**
   * Setup auto-save for form inputs
   */
  setupAutoSave() {
    // Auto-save drafts when typing (debounced)
    let autoSaveTimeout;
    document.addEventListener('input', (e) => {
      if (e.target.closest('#menuItemForm, #locationForm')) {
        clearTimeout(autoSaveTimeout);
        autoSaveTimeout = setTimeout(() => {
          console.log('Auto-saving draft...');
        }, 1000);
      }
    });
  },

  /**
   * Load locations from Hugo's data file
   */
  async loadLocations() {
    try {
      console.log('Loading locations from index.json...');
      
      // Load from Hugo's index.json (home page) which includes locations from locations.yaml
      const response = await fetch('/index.json');
      
      if (!response.ok) {
        throw new Error('Failed to load locations');
      }
      
      const data = await response.json();
      
      // Extract locations array
      this.state.locations = (data.locations || []).map((loc, index) => ({
        id: `location-${index}`,
        address: loc.address,
        city: loc.city,
        island: loc.island,
        phone: loc.phone,
        whatsapp: loc.whatsapp,
        latlon: loc.latlon || [],
        subcategories: loc.subcategories || [],
        orderingtables: loc.orderingtables || [],
        delivery: loc.delivery || {},
        opening_hours: loc.opening_hours || {},
        _index: index
      }));
      
      console.log(`✅ Loaded ${this.state.locations.length} locations`);
      
      // Merge with drafts from localStorage
      this.mergeDraftLocations();
      
      // Render locations
      this.renderLocations();
      
    } catch (error) {
      console.error('Error loading locations:', error);
      const container = document.getElementById('locationsList');
      if (container) {
        container.innerHTML = `
          <p style="color: #dc2626;">Failed to load locations</p>
          <p style="color: #6b7280; font-size: 0.875rem;">${this.escapeHtml(error.message)}</p>
        `;
      }
    }
  },

  /**
   * Load advertisements from Hugo JSON
   */
  async loadAdvertisements() {
    try {
      console.log('Loading advertisements from advertisments/index.json...');
      
      // Load from Hugo's index.json for Advertisments section
      const response = await fetch('/advertisments/index.json');
      
      if (!response.ok) {
        throw new Error('Failed to load advertisements');
      }
      
      const data = await response.json();
      
      // Transform to our ad format
      this.state.advertisements = (data.items || []).map(ad => {
        // Extract location names for display
        const locationNames = ad.locations 
          ? ad.locations.map(loc => loc.city || loc.address).filter(Boolean)
          : [];
        
        // Get image path
        let imagePath = null;
        if (ad.images && ad.images.length > 0) {
          const img = ad.images[0].image || ad.images[0];
          imagePath = img.startsWith('/') ? img : `/${img}`;
        }
        
        return {
          id: ad.title.toLowerCase().replace(/\s+/g, '-') + '-' + ad.weight, // Generate ID from title+weight
          title: ad.title,
          description: ad.body || '',
          link: ad.link || '',
          weight: ad.weight || 0,
          locations: locationNames, // Extract just the names
          locationsData: ad.locations || [], // Keep full location objects for editing
          recurring: ad.recurring || false,
          daysOfWeek: ad.daysofweek || [],
          eventDates: ad.eventdates || [],
          youtube: ad.youtube || [],
          date: ad.date,
          tags: ad.tags || [],
          categories: ad.categories || [],
          image: imagePath,
        };
      });
      
      console.log(`✅ Loaded ${this.state.advertisements.length} advertisements`);
      
      // Merge with drafts from localStorage
      this.mergeDraftAds();
      
      // Render
      this.renderAdvertisements();
      
      // Setup search for ads
      const searchInput = document.getElementById('searchAds');
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          const search = e.target.value.trim();
          if (search) {
            this.filterAdvertisements(search);
          } else {
            this.renderAdvertisements();
          }
        });
      }
      
    } catch (error) {
      console.error('Error loading advertisements:', error);
      const container = document.getElementById('advertisementsList');
      if (container) {
        container.innerHTML = `
          <p style="color: #dc2626;">Failed to load advertisements</p>
          <p style="color: #6b7280; font-size: 0.875rem;">${this.escapeHtml(error.message)}</p>
        `;
      }
    }
  },

  /**
   * Merge draft advertisements from localStorage
   */
  mergeDraftAds() {
    try {
      const draftsJson = localStorage.getItem(this.storageKeys.draftAds);
      if (!draftsJson) return;
      
      const drafts = JSON.parse(draftsJson);
      
      Object.values(drafts).forEach(draft => {
        const existingIndex = this.state.advertisements.findIndex(a => a.id === draft.id);
        
        if (existingIndex >= 0) {
          // Update existing ad with draft changes
          this.state.advertisements[existingIndex] = { ...draft, _isDraft: true };
        } else {
          // New draft ad
          this.state.advertisements.push({ ...draft, _isDraft: true, _isNew: true });
        }
      });
    } catch (error) {
      console.error('Error merging draft ads:', error);
    }
  },

  /**
   * Save ad draft to localStorage
   */
  saveDraftAd(adData) {
    const draftsJson = localStorage.getItem(this.storageKeys.draftAds) || '{}';
    const drafts = JSON.parse(draftsJson);
    
    drafts[adData.id] = {
      ...adData,
      _draftSavedAt: new Date().toISOString(),
    };
    
    localStorage.setItem(this.storageKeys.draftAds, JSON.stringify(drafts));
    this.markPendingChanges();
    this.updateTabActionButtons();
    this.showSuccess('Advertisement draft saved locally');
  },

  /**
   * Clear ad draft
   */
  clearDraftAd(adId) {
    const draftsJson = localStorage.getItem(this.storageKeys.draftAds) || '{}';
    const drafts = JSON.parse(draftsJson);
    delete drafts[adId];
    localStorage.setItem(this.storageKeys.draftAds, JSON.stringify(drafts));
    
    if (Object.keys(drafts).length === 0) {
      this.clearPendingChanges();
    }
  },

  /**
   * Save location draft to localStorage
   */
  saveDraftLocation(locationData) {
    const draftsJson = localStorage.getItem(this.storageKeys.draftLocations) || '{}';
    const drafts = JSON.parse(draftsJson);
    
    // Use index as the key
    const key = locationData._index;
    drafts[key] = {
      ...locationData,
      _draftSavedAt: new Date().toISOString(),
    };
    
    localStorage.setItem(this.storageKeys.draftLocations, JSON.stringify(drafts));
    this.markPendingChanges();
    this.updateTabActionButtons();
  },

  /**
   * Clear location draft
   */
  clearDraftLocation(index) {
    const draftsJson = localStorage.getItem(this.storageKeys.draftLocations) || '{}';
    const drafts = JSON.parse(draftsJson);
    delete drafts[index];
    localStorage.setItem(this.storageKeys.draftLocations, JSON.stringify(drafts));
    
    if (Object.keys(drafts).length === 0) {
      this.clearPendingChanges();
    }
    
    this.updateTabActionButtons();
  },

  /**
   * Merge draft locations from localStorage
   */
  mergeDraftLocations() {
    const draftsJson = localStorage.getItem(this.storageKeys.draftLocations);
    if (!draftsJson) return;
    
    try {
      const drafts = JSON.parse(draftsJson);
      
      Object.values(drafts).forEach(draft => {
        const index = draft._index;
        
        if (index !== undefined && index < this.state.locations.length && !draft._isNew) {
          // Update existing location (preserve all draft properties)
          this.state.locations[index] = { 
            ...this.state.locations[index], 
            ...draft, 
            _isDraft: true,
            _index: index
          };
        } else {
          // Add new location (ensure it's marked as new)
          this.state.locations.push({ 
            ...draft, 
            _isDraft: true, 
            _isNew: true,
            _index: draft._index !== undefined ? draft._index : this.state.locations.length
          });
        }
      });
    } catch (error) {
      console.error('Error merging location drafts:', error);
    }
  },

  /**
   * Render advertisements list
   */
  renderAdvertisements() {
    const container = document.getElementById('advertisementsList');
    if (!container) return;
    
    if (this.state.advertisements.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 3rem; color: #6b7280;">
          <p style="font-size: 1.125rem; font-weight: 500;">No advertisements found</p>
          <p style="font-size: 0.875rem; margin-top: 0.5rem;">Click "+ Add Advertisement" to create one</p>
        </div>
      `;
      return;
    }
    
    // Sort by weight
    const sorted = [...this.state.advertisements].sort((a, b) => (a.weight || 0) - (b.weight || 0));
    
    container.innerHTML = `
      <div class="grid-auto">
        ${sorted.map((ad, idx) => this.renderAdCard(ad, idx)).join('')}
      </div>
    `;
  },

  /**
   * Render a single ad card
   */
  renderAdCard(ad, index) {
    const draftBadge = ad._isDraft ? '<span class="badge badge-draft">DRAFT</span>' : '';
    const newBadge = ad._isNew ? '<span class="badge badge-new">NEW</span>' : '';
    const deletedBadge = ad._isDeleted ? '<span class="badge badge-deleted">DELETED</span>' : '';
    
    const cardClasses = ['menu-item-card'];
    if (ad._isDraft) cardClasses.push('draft');
    if (ad._isDeleted) cardClasses.push('deleted');
    
    const locationText = ad.locations && ad.locations.length > 0 
      ? `<div class="location-details">📍 ${this.escapeHtml(ad.locations.join(', '))}</div>`
      : '';
    
    const daysText = ad.daysOfWeek && ad.daysOfWeek.length > 0
      ? `<span class="badge badge-primary">${ad.daysOfWeek.join(', ')}</span>`
      : '';
    
    return `
      <div class="${cardClasses.join(' ')}">
        ${ad.image ? `<img src="${this.escapeHtml(ad.image)}" alt="${this.escapeHtml(ad.title)}" class="menu-item-image ${ad._isDeleted ? 'deleted' : ''}">` : ''}
        
        <div class="menu-item-header">
          <h3 class="menu-item-title ${ad._isDeleted ? 'deleted' : ''}">${this.escapeHtml(ad.title)}${draftBadge}${newBadge}${deletedBadge}</h3>
          <span class="menu-item-position">#${index + 1}</span>
        </div>
        
        ${ad.description ? `<p class="menu-item-description">${this.escapeHtml(ad.description).substring(0, 100)}</p>` : ''}
        
        ${locationText}
        ${daysText}
        
        <div class="menu-item-actions">
          ${ad._isDeleted ? `
            <button class="btn btn-sm btn-success" onclick="UpdateUI.restoreAd('${this.escapeHtml(ad.id)}')">Restore</button>
            <button class="btn btn-sm btn-danger" onclick="UpdateUI.publishAd('${this.escapeHtml(ad.id)}')">Confirm Delete</button>
          ` : `
            <button class="btn btn-sm btn-secondary" onclick="UpdateUI.editAd('${this.escapeHtml(ad.id)}')">Edit</button>
            ${ad._isDraft && !ad._isNew ? `<button class="btn btn-sm btn-discard" onclick="UpdateUI.discardAdDraft('${this.escapeHtml(ad.id)}')">Discard</button>` : ''}
            ${ad._isDraft ? `<button class="btn btn-sm btn-success" onclick="UpdateUI.publishAd('${this.escapeHtml(ad.id)}')">Publish</button>` : ''}
            <button class="btn btn-sm btn-danger" onclick="UpdateUI.deleteAd('${this.escapeHtml(ad.id)}')">Delete</button>
          `}
        </div>
      </div>
    `;
  },

  /**
   * Filter advertisements by search term
   */
  filterAdvertisements(searchTerm) {
    const search = (searchTerm || '').trim().toLowerCase();
    
    const filtered = this.state.advertisements.filter(ad => 
      ad.title.toLowerCase().includes(search) ||
      (ad.description && ad.description.toLowerCase().includes(search)) ||
      (ad.daysOfWeek && ad.daysOfWeek.some(day => day.toLowerCase().includes(search)))
    );
    
    const container = document.getElementById('advertisementsList');
    if (!container) return;
    
    if (filtered.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 3rem; color: #6b7280;">
          <p style="font-size: 1.125rem; font-weight: 500;">No ads match "${this.escapeHtml(search)}"</p>
        </div>
      `;
      return;
    }
    
    container.innerHTML = `
      <div class="alert alert-success" style="margin-bottom: 1rem;">
        <strong>${filtered.length}</strong> result(s) for "<strong>${this.escapeHtml(search)}</strong>"
      </div>
      <div class="grid-auto">
        ${filtered.map((ad, idx) => this.renderAdCard(ad, idx)).join('')}
      </div>
    `;
  },

  /**
   * Edit an advertisement
   */
  editAd(adId) {
    openAdModal(adId);
  },

  /**
   * Delete an advertisement
   */
  async deleteAd(adId) {
    const ad = this.state.advertisements.find(a => a.id === adId);
    if (!ad) return;
    
    const confirmed = confirm(`Delete "${ad.title}"?\n\nThis will ${ad._isDraft ? 'remove the draft' : 'mark for deletion'}.`);
    if (!confirmed) return;
    
    if (ad._isDraft && ad._isNew) {
      this.clearDraftAd(adId);
      await this.loadAdvertisements();
      this.renderPendingSummary();
      this.showSuccess('Draft deleted');
    } else if (ad._isDraft) {
      this.clearDraftAd(adId);
      await this.loadAdvertisements();
      this.renderPendingSummary();
      this.showSuccess('Draft changes discarded');
    } else {
      ad._isDeleted = true;
      this.saveDraftAd(ad);
      await this.loadAdvertisements();
      this.renderPendingSummary();
      this.showSuccess(`"${ad.title}" marked for deletion`);
    }
  },

  /**
   * Discard draft changes for an ad
   */
  async discardAdDraft(adId) {
    const ad = this.state.advertisements.find(a => a.id === adId);
    if (!ad) return;
    
    const confirmed = confirm(`Discard draft changes to "${ad.title}"?`);
    if (!confirmed) return;
    
    this.clearDraftAd(adId);
    await this.loadAdvertisements();
    this.renderPendingSummary();
    this.showSuccess(`Draft changes discarded for "${ad.title}"`);
  },

  /**
   * Wrapper for discarding ad draft from Pending Changes tab
   */
  discardAdDraftFromPending(adId) {
    this.discardAdDraft(adId).catch(error => {
      console.error('Error discarding ad draft:', error);
      this.showError('Failed to discard ad draft');
    });
  },

  /**
   * Restore deleted ad
   */
  async restoreAd(adId) {
    const ad = this.state.advertisements.find(a => a.id === adId);
    if (!ad) return;
    
    this.clearDraftAd(adId);
    await this.loadAdvertisements();
    this.renderPendingSummary();
    this.showSuccess(`"${ad.title}" restored`);
  },

  /**
   * Publish an advertisement
   */
  async publishAd(adId) {
    const draftsJson = localStorage.getItem(this.storageKeys.draftAds) || '{}';
    const drafts = JSON.parse(draftsJson);
    const ad = drafts[adId];
    
    if (!ad) {
      this.showError('Draft not found');
      return;
    }
    
    const confirmed = confirm(`Publish "${ad.title}" to the live site?`);
    if (!confirmed) return;
    
    try {
      const method = ad._isNew ? 'POST' : 'PUT';
      const url = ad._isNew
        ? `${this.apiConfig.getClientUrl()}/advertisements`
        : `${this.apiConfig.getClientUrl()}/advertisements/${adId}`;
      
      const response = await this.authenticatedFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ad),
      });
      
      if (response.ok) {
        this.showSuccess(`"${ad.title}" published successfully!`);
        this.clearDraftAd(adId);
        await this.loadAdvertisements();
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to publish ad');
      }
    } catch (error) {
      console.error('Error publishing ad:', error);
      this.showError(`Failed to publish: ${error.message}`);
    }
  },

  /**
   * Load branding images from /branding/ directory
   */
  async loadBrandingImages() {
    try {
      console.log('Loading branding images from /branding/...');
      
      // Define editable branding images (exclude system files like logo/UI elements)
      const brandingFiles = [
        'favicon.ico',
        'favicon.png',
        'favicon16.webp',
        'favicon144.webp',
        'favicon152.webp',
        'favicon192.webp',
        'favicon196.webp',
        'favicon512.webp',
        'favicon-400x200.webp',
        'mappin.webp',
        'richscreenshot1.webp',
        'richscreenshot2.webp',
      ];
      
      // Check which images exist and get their info
      this.state.brandingImages = [];
      
      for (const filename of brandingFiles) {
        try {
          const response = await fetch(`/branding/${filename}`, { method: 'HEAD' });
          if (response.ok) {
            // Get file size from headers
            const size = response.headers.get('content-length');
            const sizeKB = size ? Math.round(size / 1024) : null;
            
            this.state.brandingImages.push({
              id: filename,
              filename: filename,
              path: `/branding/${filename}`,
              size: sizeKB,
              type: this.getBrandingType(filename),
            });
          }
        } catch (err) {
          // Image doesn't exist, skip
          console.log(`Skipping ${filename} - not found`);
        }
      }
      
      console.log(`✅ Loaded ${this.state.brandingImages.length} branding images`);
      
      // Render branding images
      this.renderBrandingImages();
      
    } catch (error) {
      console.error('Error loading branding images:', error);
      const container = document.getElementById('brandingImagesList');
      if (container) {
        container.innerHTML = `
          <p style="color: #dc2626;">Failed to load branding images</p>
          <p style="color: #6b7280; font-size: 0.875rem;">${this.escapeHtml(error.message)}</p>
        `;
      }
    }
  },

  /**
   * Get branding image type/category
   */
  getBrandingType(filename) {
    if (filename.includes('favicon')) return 'Favicon';
    if (filename.includes('screenshot')) return 'Screenshot';
    if (filename.includes('logo') || filename.includes('ttmenus')) return 'Logo';
    if (filename.includes('server')) return 'UI Element';
    if (filename.includes('mappin')) return 'Map Icon';
    return 'Other';
  },

  /**
   * Render branding images grid
   */
  renderBrandingImages() {
    const container = document.getElementById('brandingImagesList');
    if (!container) return;
    
    if (this.state.brandingImages.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 3rem; color: #6b7280;">
          <p style="font-size: 1.125rem; font-weight: 500;">No branding images found</p>
          <p style="font-size: 0.875rem; margin-top: 0.5rem;">Upload images to /branding/ directory</p>
        </div>
      `;
      return;
    }
    
    // Group by type
    const grouped = {};
    this.state.brandingImages.forEach(img => {
      if (!grouped[img.type]) {
        grouped[img.type] = [];
      }
      grouped[img.type].push(img);
    });
    
    let html = '';
    
    for (const [type, images] of Object.entries(grouped)) {
      html += `
        <div class="detail-section">
          <h3 class="detail-section-title">${type}</h3>
          <div class="grid-auto-sm">
            ${images.map(img => this.renderBrandingImageCard(img)).join('')}
          </div>
        </div>
      `;
    }
    
    container.innerHTML = html;
  },

  /**
   * Render a single branding image card
   */
  renderBrandingImageCard(img) {
    const sizeText = img.size ? `${img.size} KB` : 'Unknown size';
    const isIcon = img.filename.includes('favicon') && (img.filename.endsWith('.ico') || img.filename.endsWith('.png'));
    
    // Check if there's a draft replacement for this image
    const drafts = this.getBrandingDrafts();
    const hasDraft = drafts[img.filename];
    const displayPath = hasDraft ? hasDraft.previewUrl : img.path;
    const draftBadge = hasDraft ? '<span class="badge badge-draft">DRAFT</span>' : '';
    const cardClasses = hasDraft ? 'menu-item-card draft' : 'menu-item-card';
    
    return `
      <div class="${cardClasses}" style="cursor: pointer;" onclick="UpdateUI.viewBrandingImage('${this.escapeHtml(displayPath)}', '${this.escapeHtml(img.filename)}')">
        <div class="image-preview-container">
          ${!isIcon ? `<img src="${this.escapeHtml(displayPath)}" alt="${this.escapeHtml(img.filename)}">` : `<div class="file-icon">📄<br><small>${this.escapeHtml(img.filename)}</small></div>`}
        </div>
        <h4 class="card-filename">${this.escapeHtml(img.filename)}${draftBadge}</h4>
        <p class="card-filesize">${sizeText}</p>
        <div class="card-actions">
          <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); UpdateUI.downloadBrandingImage('${this.escapeHtml(displayPath)}', '${this.escapeHtml(img.filename)}')">Download</button>
          <button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); UpdateUI.replaceBrandingImage('${this.escapeHtml(img.filename)}')">Replace</button>
          ${hasDraft ? `<button class="btn btn-sm" style="background: #6b7280; color: white;" onclick="event.stopPropagation(); UpdateUI.discardBrandingDraft('${this.escapeHtml(img.filename)}')">Discard</button>` : ''}
        </div>
      </div>
    `;
  },

  /**
   * View branding image in modal/new tab
   */
  viewBrandingImage(path, filename) {
    window.open(path, '_blank');
  },

  /**
   * Download branding image
   */
  downloadBrandingImage(path, filename) {
    const a = document.createElement('a');
    a.href = path;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  },

  /**
   * Replace branding image
   */
  replaceBrandingImage(filename) {
    // Create a hidden file input
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.ico';
    
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      // Validate file type
      const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/x-icon', 'image/vnd.microsoft.icon'];
      if (!validTypes.includes(file.type)) {
        this.showError('Invalid file type. Please select an image file (JPEG, PNG, WEBP, GIF, ICO).');
        return;
      }
      
      // Create preview URL
      const reader = new FileReader();
      reader.onload = (event) => {
        const previewUrl = event.target.result;
        
        // Save to drafts
        this.saveBrandingDraft(filename, file, previewUrl);
        
        // Re-render branding images
        this.renderBrandingImages();
        
        this.showSuccess(`Draft replacement saved for "${filename}". Click "Publish" to upload.`);
      };
      reader.readAsDataURL(file);
    };
    
    input.click();
  },

  /**
   * Get branding drafts from localStorage
   */
  getBrandingDrafts() {
    const draftsJson = localStorage.getItem(this.storageKeys.draftBranding) || '{}';
    try {
      return JSON.parse(draftsJson);
    } catch (e) {
      return {};
    }
  },

  /**
   * Save branding draft
   */
  saveBrandingDraft(filename, file, previewUrl) {
    const drafts = this.getBrandingDrafts();
    
    // Store file info (actual file object can't be stored in localStorage)
    drafts[filename] = {
      filename: filename,
      originalName: file.name,
      type: file.type,
      size: file.size,
      previewUrl: previewUrl,
      _draftSavedAt: new Date().toISOString(),
    };
    
    // Store file in sessionStorage for upload on publish (limited storage, but works for images)
    sessionStorage.setItem(`branding_file_${filename}`, previewUrl);
    
    localStorage.setItem(this.storageKeys.draftBranding, JSON.stringify(drafts));
    this.markPendingChanges();
    this.updateTabActionButtons();
  },

  /**
   * Discard branding draft
   */
  async discardBrandingDraft(filename) {
    const confirmed = confirm(`Discard replacement for "${filename}"?\n\nThis will restore the original image.`);
    if (!confirmed) return;
    
    const drafts = this.getBrandingDrafts();
    delete drafts[filename];
    localStorage.setItem(this.storageKeys.draftBranding, JSON.stringify(drafts));
    
    // Remove from sessionStorage
    sessionStorage.removeItem(`branding_file_${filename}`);
    
    if (Object.keys(drafts).length === 0) {
      this.clearPendingChanges();
    }
    
    this.updateTabActionButtons();
    await this.loadBrandingImages();
    this.renderPendingSummary();
    this.showSuccess(`Draft replacement discarded for "${filename}"`);
  },

  /**
   * Publish branding changes
   */
  async publishBrandingImages() {
    const drafts = this.getBrandingDrafts();
    const draftCount = Object.keys(drafts).length;
    
    if (draftCount === 0) {
      this.showError('No branding image changes to publish');
      return;
    }
    
    const confirmed = confirm(`Publish ${draftCount} branding image replacement${draftCount !== 1 ? 's' : ''}?\n\nThis will upload the new images to the server.`);
    if (!confirmed) return;
    
    try {
      // TODO: Upload files to server via content-service API
      for (const [filename, draft] of Object.entries(drafts)) {
        const fileData = sessionStorage.getItem(`branding_file_${filename}`);
        if (!fileData) continue;
        
        // In a real implementation, this would upload to the server
        console.log(`Would upload ${filename}:`, draft);
        
        // For now, just simulate success
        // await this.authenticatedFetch(...upload API...)
      }
      
      // Clear drafts
      localStorage.removeItem(this.storageKeys.draftBranding);
      
      // Clear session storage
      Object.keys(drafts).forEach(filename => {
        sessionStorage.removeItem(`branding_file_${filename}`);
      });
      
      this.clearPendingChanges();
      this.updateTabActionButtons();
      await this.loadBrandingImages();
      this.renderPendingSummary();
      this.showSuccess(`${draftCount} branding image${draftCount !== 1 ? 's' : ''} published! (Simulated - requires content-service)`);
      
    } catch (error) {
      console.error('Publish failed:', error);
      this.showError(`Failed to publish branding images: ${error.message}`);
    }
  },

  /**
   * Load colors from colors.css
   */
  async loadColors() {
    try {
      // Load CSS file directly
      const response = await fetch('/css/colors.css');
      
      if (response.ok) {
        const cssText = await response.text();
        this.state.colors = this.parseCSSColors(cssText);
        
        // Merge with draft changes
        const draftsJson = localStorage.getItem(this.storageKeys.draftColors);
        if (draftsJson) {
          const draftColors = JSON.parse(draftsJson);
          this.state.colors = { ...this.state.colors, ...draftColors };
        }
        
        this.renderColorInputs(this.state.colors);
      } else {
        throw new Error('Failed to load colors.css');
      }
    } catch (error) {
      console.error('Error loading colors:', error);
      this.showError('Failed to load color settings');
    }
  },

  /**
   * Parse CSS color variables
   */
  parseCSSColors(cssText) {
    const colors = {};
    const regex = /--([^:]+):\s*([^;]+);/g;
    let match;
    
    while ((match = regex.exec(cssText)) !== null) {
      colors[`--${match[1].trim()}`] = match[2].trim();
    }
    
    return colors;
  },

  /**
   * Load Hugo configuration (requires API or manual editing)
   */
  async loadConfig() {
    const container = document.getElementById('configForm');
    if (!container) return;
    
    container.innerHTML = `
      <div class="alert alert-info">
        <strong>Note:</strong> Configuration editing requires the content-service to be running.
        Current config is in <code>hugo.toml</code>
      </div>
      <p style="color: #6b7280;">Start content-service to enable Hugo configuration editing.</p>
    `;
  },

  /**
   * Load PWA manifest (requires API or manual editing)
   */
  async loadManifest() {
    try {
      const response = await fetch('/manifest.json');
      if (response.ok) {
        const manifest = await response.json();
        
        // Check for drafts
        const draftsJson = localStorage.getItem(this.storageKeys.draftManifest);
        if (draftsJson) {
          const draftManifest = JSON.parse(draftsJson);
          Object.assign(manifest, draftManifest);
        }
        
        this.renderManifestForm(manifest);
      }
    } catch (error) {
      console.error('Error loading manifest:', error);
    }
  },

  /**
   * Render categories list
   */
  renderCategories() {
    const container = document.getElementById('categoriesList');
    if (!container) return;

    if (this.state.categories.length === 0) {
      container.innerHTML = '<p style="color: #6b7280;">No categories found.</p>';
      return;
    }

    container.innerHTML = this.state.categories.map((cat, index) => `
      <div class="location-card">
        <div class="location-header">
          <div>
            <h3 class="location-name">${this.escapeHtml(cat.name)}</h3>
            <p class="location-address">
              ${cat.icon ? `<img src="${this.escapeHtml(cat.icon)}" alt="" style="width: 24px; height: 24px; vertical-align: middle; margin-right: 8px;">` : ''}
              Icon: ${this.escapeHtml(cat.icon || 'Not set')}
            </p>
          </div>
          <div style="display: flex; gap: 0.5rem;">
            <button class="btn btn-sm btn-secondary" onclick="UpdateUI.editCategory(${index})">Edit Icon</button>
          </div>
        </div>
      </div>
    `).join('');
  },

  /**
   * Update category dropdown selects
   */
  updateCategorySelects() {
    const select = document.getElementById('itemCategorySelect');
    if (!select) return;
    
    const currentValue = select.value;
    
    select.innerHTML = '<option value="">Select Category</option>';
    
    this.state.categories.forEach(cat => {
      const option = document.createElement('option');
      option.value = cat.name;
      option.textContent = cat.name;
      select.appendChild(option);
    });
    
    // Restore previous selection if it still exists
    if (currentValue) {
      select.value = currentValue;
    }
  },

  /**
   * Render complete menu grouped by categories with weight ordering
   */
  renderMenuByCategory() {
    console.log('Rendering menu by category...', this.state.menuItems.length, 'items');
    
    const container = document.getElementById('menuItemsList');
    if (!container) {
      console.error('menuItemsList container not found!');
      return;
    }

    if (this.state.menuItems.length === 0) {
      console.log('No menu items to display');
      container.innerHTML = `
        <div style="text-align: center; padding: 3rem; color: #6b7280;">
          <p style="font-size: 1.125rem; font-weight: 500; margin-bottom: 0.5rem;">No menu items found</p>
          <p style="font-size: 0.875rem;">Add your first menu item to get started, or run 'hugo' to generate menu-items.json</p>
        </div>
      `;
      return;
    }

    console.log('Grouping items by category...');

    // Group items by category
    const itemsByCategory = {};
    this.state.menuItems.forEach(item => {
      if (!itemsByCategory[item.category]) {
        itemsByCategory[item.category] = [];
      }
      itemsByCategory[item.category].push(item);
    });

    // Get category order from menudata.json (with weights)
    let categoryOrder = this.state.categories.map((cat, index) => ({
      name: cat.name,
      icon: cat.icon,
      weight: cat.weight || index,
    }));

    // If no categories defined, auto-discover from items
    if (categoryOrder.length === 0) {
      console.log('No categories in menudata.json, discovering from items...');
      const uniqueCategories = [...new Set(this.state.menuItems.map(item => item.category))];
      categoryOrder = uniqueCategories.map((name, index) => ({
        name: name,
        icon: null,
        weight: index,
      }));
      console.log('Auto-discovered', categoryOrder.length, 'categories');
    }

    // Sort categories by weight
    categoryOrder.sort((a, b) => a.weight - b.weight);

    console.log('Rendering', categoryOrder.length, 'categories with items');

    // Build HTML for each category with its items
    const categoryHTML = [];
    
    categoryOrder.forEach(category => {
      const items = itemsByCategory[category.name] || [];
      
      console.log(`Category "${category.name}": ${items.length} items`);
      
      // Sort items within category by weight (or title if no weight)
      items.sort((a, b) => {
        if (a.weight !== undefined && b.weight !== undefined) {
          return a.weight - b.weight;
        }
        return a.title.localeCompare(b.title);
      });

      const itemCount = items.length;
      const draftCount = items.filter(i => i._isDraft).length;

      const html = `
        <div class="category-section">
          <div class="category-header">
            <div class="category-header-left">
              ${category.icon ? `<img src="${this.escapeHtml(category.icon)}" alt="" class="category-icon">` : ''}
              <div>
                <h3 class="category-title">${this.escapeHtml(category.name)}</h3>
                <p class="category-info">
                  ${itemCount} item${itemCount !== 1 ? 's' : ''}
                  ${draftCount > 0 ? `<span class="draft-count">${draftCount} draft${draftCount !== 1 ? 's' : ''}</span>` : ''}
                </p>
              </div>
            </div>
            <div class="category-actions">
              <button class="btn btn-sm category-btn" onclick="UpdateUI.reorderCategory('${this.escapeHtml(category.name)}')">
                ↕️ Reorder
              </button>
              <button class="btn btn-sm category-btn" onclick="UpdateUI.editCategoryIcon('${this.escapeHtml(category.name)}')">
                🎨 Edit Icon
              </button>
            </div>
          </div>

          <div class="category-items">
            ${items.map((item, idx) => this.renderMenuItem(item, idx)).join('')}
            
            <div class="add-item-card" onclick="openMenuItemModal(null, '${this.escapeHtml(category.name)}')">
              <div class="add-item-content">
                <div class="add-item-icon">➕</div>
                <p class="add-item-text">Add Item</p>
              </div>
            </div>
          </div>
        </div>
      `;
      
      categoryHTML.push(html);
    });

    // Set the HTML
    container.innerHTML = categoryHTML.join('');
    
    console.log('Menu rendering complete!');
  },

  /**
   * Render a single menu item card
   */
  renderMenuItem(item, itemIndex) {
    const draftBadge = item._isDraft ? '<span class="badge badge-draft">DRAFT</span>' : '';
    const newBadge = item._isNew ? '<span class="badge badge-new">NEW</span>' : '';
    const deletedBadge = item._isDeleted ? '<span class="badge badge-deleted">DELETED</span>' : '';
    
    // Card classes
    const cardClasses = ['menu-item-card'];
    if (item._isDraft) cardClasses.push('draft');
    if (item._isDeleted) cardClasses.push('deleted');
    
    // Position number
    const position = itemIndex + 1;
    
    // Clean description
    const cleanDesc = this.escapeHtml(item.description || '').substring(0, 100);
    const descriptionText = cleanDesc + (item.description && item.description.length > 100 ? '...' : '');
    
    // Format price
    const priceDisplay = item.price ? item.price.toFixed(0) : '0';
    
    return `
      <div class="${cardClasses.join(' ')}" draggable="${!item._isDeleted}" ondragstart="UpdateUI.handleDragStart(event, '${this.escapeHtml(item.id)}')" ondragover="UpdateUI.handleDragOver(event)" ondrop="UpdateUI.handleDrop(event, '${this.escapeHtml(item.id)}')">
        ${item.image ? `<img src="${this.escapeHtml(item.image)}" alt="${this.escapeHtml(item.title)}" class="menu-item-image ${item._isDeleted ? 'deleted' : ''}">` : ''}
        
        <div class="menu-item-header">
          <h3 class="menu-item-title ${item._isDeleted ? 'deleted' : ''}">${this.escapeHtml(item.title)}${draftBadge}${newBadge}${deletedBadge}</h3>
          <span class="menu-item-position">#${position}</span>
        </div>
        
        <p class="menu-item-description">
          ${descriptionText}
        </p>
        
        <div class="menu-item-price-row">
          <span class="menu-item-price">$${priceDisplay}</span>
        </div>
        
        ${(() => {
          const tags = item.tags || [];
          const ingredients = item.ingredients || [];
          const cookingMethods = item.cookingMethods || item.cookingmethods || [];
          const types = item.types || [];
          const hasAnyTags = tags.length > 0 || ingredients.length > 0 || cookingMethods.length > 0 || types.length > 0;
          
          if (!hasAnyTags) return '';
          
          return `
            <div class="menu-item-tags">
              ${tags.map(tag => `<span class="badge badge-primary">${this.escapeHtml(tag)}</span>`).join('')}
              ${ingredients.map(ing => `<span class="badge badge-info">${this.escapeHtml(ing)}</span>`).join('')}
              ${cookingMethods.map(method => `<span class="badge badge-warning">${this.escapeHtml(method)}</span>`).join('')}
              ${types.map(type => `<span class="badge badge-secondary">${this.escapeHtml(type)}</span>`).join('')}
            </div>
          `;
        })()}
        
        <div class="menu-item-actions">
          ${item._isDeleted ? `
            <button class="btn btn-sm btn-success" onclick="UpdateUI.restoreItem('${this.escapeHtml(item.id)}')">Restore</button>
            <button class="btn btn-sm btn-danger" onclick="UpdateUI.publishItem('${this.escapeHtml(item.id)}')">Confirm Delete</button>
          ` : `
            <button class="btn btn-sm btn-secondary" onclick="UpdateUI.editMenuItem('${this.escapeHtml(item.id)}')">Edit</button>
            ${item._isDraft && !item._isNew ? `<button class="btn btn-sm" style="background: #6b7280; color: white;" onclick="UpdateUI.discardDraft('${this.escapeHtml(item.id)}')">Discard</button>` : ''}
            ${item._isDraft ? `<button class="btn btn-sm btn-success" onclick="UpdateUI.publishItem('${this.escapeHtml(item.id)}')">Publish</button>` : ''}
            <button class="btn btn-sm btn-danger" onclick="UpdateUI.deleteMenuItem('${this.escapeHtml(item.id)}')">Delete</button>
          `}
        </div>
        
        ${!item._isDeleted ? `<div class="menu-item-drag-handle">⋮⋮ Drag to reorder</div>` : ''}
      </div>
    `;
  },

  /**
   * Handle drag start for reordering
   */
  handleDragStart(event, itemId) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', itemId);
    event.target.style.opacity = '0.5';
  },

  /**
   * Handle drag over
   */
  handleDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    return false;
  },

  /**
   * Handle drop for reordering
   */
  handleDrop(event, targetItemId) {
    event.preventDefault();
    event.stopPropagation();
    
    const draggedItemId = event.dataTransfer.getData('text/plain');
    
    if (draggedItemId === targetItemId) return;
    
    // Find items
    const draggedItem = this.state.menuItems.find(i => i.id === draggedItemId);
    const targetItem = this.state.menuItems.find(i => i.id === targetItemId);
    
    if (!draggedItem || !targetItem) return;
    
    // Only allow reordering within same category
    if (draggedItem.category !== targetItem.category) {
      this.showError('Cannot move items between categories. Delete and recreate in new category instead.');
      event.target.style.opacity = '1';
      return;
    }
    
    // Get all items in this category, sorted by current weight
    const categoryItems = this.state.menuItems
      .filter(i => i.category === draggedItem.category)
      .sort((a, b) => (a.weight || 0) - (b.weight || 0));
    
    // Find positions
    const draggedIndex = categoryItems.findIndex(i => i.id === draggedItemId);
    const targetIndex = categoryItems.findIndex(i => i.id === targetItemId);
    
    // Reorder array
    const [removed] = categoryItems.splice(draggedIndex, 1);
    categoryItems.splice(targetIndex, 0, removed);
    
    // Reassign weights
    categoryItems.forEach((item, index) => {
      item.weight = index;
      this.saveDraft(item);
    });
    
    // Re-render
    this.renderMenuByCategory();
    
    // Reset opacity
    document.querySelectorAll('.menu-item-card').forEach(card => {
      card.style.opacity = '1';
    });
    
    this.showSuccess('Order updated. Publish to save permanently.');
  },

  /**
   * Filter menu by search term (only called when search has value)
   */
  filterMenuItems(searchTerm) {
    const search = (searchTerm || '').trim();
    
    console.log('Filtering items with search term:', search);

    // Filter items by search term
    const filtered = this.state.menuItems.filter(item => 
      item.title.toLowerCase().includes(search.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(search.toLowerCase())) ||
      (item.category && item.category.toLowerCase().includes(search.toLowerCase())) ||
      (item.tags && item.tags.some(tag => tag.toLowerCase().includes(search.toLowerCase())))
    );

    // Render search results (not grouped by category)
    const container = document.getElementById('menuItemsList');
    if (!container) return;
    
    if (filtered.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 3rem; color: #6b7280;">
          <p style="font-size: 1.125rem; font-weight: 500;">No items match "${this.escapeHtml(search)}"</p>
          <p style="font-size: 0.875rem; margin-top: 0.5rem;">Clear search to see all items</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div style="margin-bottom: 1rem; padding: 1rem; background: #f0fdf4; border-left: 4px solid #10b981; border-radius: 4px;">
        <p style="margin: 0; color: #065f46;"><strong>${filtered.length}</strong> result${filtered.length !== 1 ? 's' : ''} for "<strong>${this.escapeHtml(search)}</strong>"</p>
      </div>
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem;">
        ${filtered.map((item, idx) => this.renderMenuItem(item, idx)).join('')}
      </div>
    `;
  },

  /**
   * Reorder category (move up/down in menu)
   */
  reorderCategory(categoryName) {
    // Show dialog or implement drag-and-drop for categories
    alert(`Reorder category "${categoryName}" - Feature coming soon!\n\nYou can manually edit the order in menudata.json for now.`);
  },

  /**
   * Edit category icon
   */
  editCategoryIcon(categoryName) {
    const category = this.state.categories.find(c => c.name === categoryName);
    if (!category) return;
    
    const newIcon = prompt(`Enter icon URL for "${categoryName}":`, category.icon || '');
    if (newIcon === null) return; // Cancelled
    
    // Update in state
    category.icon = newIcon;
    
    // Save to draft menudata
    const menuData = {
      payments: false,
      delivery: false,
      notifications: true,
      menu: this.state.categories.map(cat => ({
        name: cat.name,
        icon: cat.icon,
      })),
    };
    
    localStorage.setItem('ttmenus_draft_menudata', JSON.stringify(menuData));
    this.markPendingChanges();
    
    // Re-render
    this.renderMenuByCategory();
    
    this.showSuccess(`Icon updated for "${categoryName}". Publish to save permanently.`);
  },

  /**
   * Delete menu item
   */
  async deleteMenuItem(itemId) {
    const item = this.state.menuItems.find(i => i.id === itemId);
    if (!item) return;
    
    const confirmed = confirm(`Delete "${item.title}"?\n\nThis will ${item._isDraft ? 'remove the draft' : 'mark for deletion'}. ${!item._isDraft ? 'You must publish to permanently delete from the live site.' : ''}`);
    if (!confirmed) return;
    
    if (item._isDraft && item._isNew) {
      // New draft that was never published - just remove
      this.clearDraft(itemId);
      await this.loadMenuItems();
      this.renderPendingSummary();
      this.showSuccess('Draft deleted');
    } else if (item._isDraft) {
      // Existing item with draft changes - discard draft and restore original
      this.clearDraft(itemId);
      await this.loadMenuItems();
      this.renderPendingSummary();
      this.showSuccess('Draft changes discarded - item restored to original');
    } else {
      // Mark published item as deleted (will be sent to API on publish)
      item._isDeleted = true;
      this.saveDraft(item);
      await this.loadMenuItems();
      this.renderPendingSummary();
      this.showSuccess(`"${item.title}" marked for deletion. Publish to permanently delete.`);
    }
  },

  /**
   * Discard draft changes for an item (restore to published version)
   */
  async discardDraft(itemId) {
    const item = this.state.menuItems.find(i => i.id === itemId);
    if (!item) return;
    
    const confirmed = confirm(`Discard draft changes to "${item.title}"?\n\nThis will restore the item to its published version.`);
    if (!confirmed) return;
    
    // Remove from drafts
    this.clearDraft(itemId);
    
    // Reload to show original version
    await this.loadMenuItems();
    
    // Update pending summary
    this.renderPendingSummary();
    
    this.showSuccess(`Draft changes discarded for "${item.title}"`);
  },

  /**
   * Wrapper for discarding from Pending Changes tab (handles async properly)
   */
  discardDraftFromPending(itemId) {
    this.discardDraft(itemId).catch(error => {
      console.error('Error discarding draft:', error);
      this.showError('Failed to discard draft');
    });
  },

  /**
   * Restore item that was marked for deletion
   */
  async restoreItem(itemId) {
    const item = this.state.menuItems.find(i => i.id === itemId);
    if (!item) return;
    
    // Remove deleted flag and clear draft
    this.clearDraft(itemId);
    
    // Reload to show original version
    await this.loadMenuItems();
    
    // Update pending summary
    this.renderPendingSummary();
    
    this.showSuccess(`"${item.title}" restored - deletion cancelled`);
  },

  /**
   * Render locations
   */
  renderLocations() {
    const container = document.getElementById('locationsList');
    if (!container) return;

    if (this.state.locations.length === 0) {
      container.innerHTML = '<p style="color: #6b7280;">No locations found.</p>';
      return;
    }

    container.innerHTML = this.state.locations.map((loc, index) => {
      // Build badges
      const draftBadge = loc._isDraft ? '<span class="badge badge-draft">DRAFT</span>' : '';
      const newBadge = loc._isNew ? '<span class="badge badge-new">NEW</span>' : '';
      const deletedBadge = loc._isDeleted ? '<span class="badge badge-deleted">DELETED</span>' : '';
      
      // Build card classes
      const cardClasses = ['menu-item-card', 'location-card'];
      if (loc._isDraft) cardClasses.push('draft');
      if (loc._isDeleted) cardClasses.push('deleted');
      
      // Build opening hours badges
      const hoursBadges = [];
      if (loc.opening_hours && loc.opening_hours.mode) {
        if (loc.opening_hours.mode === 'AlwaysOpen') {
          hoursBadges.push('<span class="badge badge-secondary">🕐 24/7 Open</span>');
        } else if (loc.opening_hours.mode === 'AlwaysClosed') {
          hoursBadges.push('<span class="badge badge-secondary">🕐 Closed</span>');
        } else {
          // Show hours for each day
          const dayNames = {
            mon: 'Mon',
            tue: 'Tue',
            wed: 'Wed',
            thu: 'Thu',
            fri: 'Fri',
            sat: 'Sat',
            sun: 'Sun'
          };
          
          const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
          days.forEach(day => {
            const hours = loc.opening_hours[day];
            if (hours && hours.length > 0) {
              // Sort hours by time chronologically
              const sortedHours = [...hours].sort((a, b) => a.time.localeCompare(b.time));
              const times = sortedHours.map(h => `${h.type === 'Open' ? '🟢' : '🔴'}${h.time}`).join(' ');
              hoursBadges.push(`<span class="badge badge-secondary">${dayNames[day]}: ${times}</span>`);
            }
          });
        }
      }
      
      // Build delivery links
      const deliveryLinks = [];
      if (loc.delivery?.fooddrop) {
        deliveryLinks.push('🚚 FoodDrop');
      }
      
      return `
        <div class="${cardClasses.join(' ')}">
          <div class="menu-item-header">
            <h3 class="menu-item-title ${loc._isDeleted ? 'deleted' : ''}">${this.escapeHtml(loc.city)}${draftBadge}${newBadge}${deletedBadge}</h3>
            <span class="menu-item-position">#${index + 1}</span>
          </div>
          
          <p class="menu-item-description">
            📍 ${this.escapeHtml(loc.address)}, ${this.escapeHtml(loc.island)}
          </p>
          
          <div class="menu-item-price-row">
            ${loc.phone ? `<span style="font-size: 0.875rem;">📞 ${this.escapeHtml(loc.phone)}</span>` : ''}
          </div>
          
          <div class="menu-item-tags">
            ${loc.subcategories?.map(cat => `<span class="badge badge-primary">${this.escapeHtml(cat)}</span>`).join('') || ''}
            ${loc.orderingtables?.map(table => `<span class="badge badge-info">${this.escapeHtml(table)}</span>`).join('') || ''}
            ${deliveryLinks.length > 0 ? `<span class="badge badge-warning">${deliveryLinks.join(' ')}</span>` : ''}
            ${hoursBadges.join('')}
          </div>
          
          <div class="menu-item-actions">
            ${loc._isDeleted ? `
              <button class="btn btn-sm btn-success" onclick="UpdateUI.restoreLocation(${index})">Restore</button>
              <button class="btn btn-sm btn-danger" onclick="UpdateUI.publishLocation(${index})">Confirm Delete</button>
            ` : `
              <button class="btn btn-sm btn-secondary" onclick="UpdateUI.editLocation(${index})">Edit</button>
              ${loc._isDraft && !loc._isNew ? `<button class="btn btn-sm" style="background: #6b7280; color: white;" onclick="UpdateUI.discardLocationDraft(${index})">Discard</button>` : ''}
              ${loc._isDraft ? `<button class="btn btn-sm btn-success" onclick="UpdateUI.publishLocation(${index})">Publish</button>` : ''}
              <button class="btn btn-sm btn-danger" onclick="UpdateUI.deleteLocation(${index})">Delete</button>
            `}
          </div>
        </div>
      `;
    }).join('');
  },

  /**
   * Edit location (opens modal)
   */
  editLocation(index) {
    openLocationModal(index);
  },

  /**
   * Discard location draft
   */
  async discardLocationDraft(index) {
    const loc = this.state.locations[index];
    if (!loc) return;
    
    const confirmed = confirm(`Discard draft changes to "${loc.city}"?\n\nThis will restore the location to its published version.`);
    if (!confirmed) return;
    
    this.clearDraftLocation(index);
    await this.loadLocations();
    this.renderPendingSummary();
    this.showSuccess(`Draft changes discarded for "${loc.city}"`);
  },

  /**
   * Wrapper for discarding location draft from Pending Changes tab
   */
  discardLocationDraftFromPending(index) {
    this.discardLocationDraft(index).catch(error => {
      console.error('Error discarding location draft:', error);
      this.showError('Failed to discard location draft');
    });
  },

  /**
   * Restore deleted location
   */
  async restoreLocation(index) {
    const loc = this.state.locations[index];
    if (!loc) return;
    
    this.clearDraftLocation(index);
    await this.loadLocations();
    this.renderPendingSummary();
    this.showSuccess(`Location "${loc.city}" restored - deletion cancelled`);
  },

  /**
   * Publish location changes
   */
  async publishLocation(index) {
    const loc = this.state.locations[index];
    if (!loc) return;
    
    const confirmed = confirm(`Publish changes to "${loc.city}"?\n\nThis will update the live location data.`);
    if (!confirmed) return;
    
    try {
      // TODO: Send to content-service API
      const response = await this.authenticatedFetch(
        `${this.apiConfig.getClientUrl()}${this.apiConfig.endpoints.locations}`,
        {
          method: 'PUT',
          body: JSON.stringify(loc),
        }
      );
      
      if (response.ok) {
        this.clearDraftLocation(index);
        await this.loadLocations();
        this.renderPendingSummary();
        this.showSuccess(`Location "${loc.city}" published successfully!`);
      } else {
        throw new Error('API returned non-OK response');
      }
    } catch (error) {
      console.error('Publish failed:', error);
      this.showError(`Publish failed. Changes saved as draft. Error: ${error.message}`);
    }
  },

  /**
   * Render color inputs
   */
  renderColorInputs(colors) {
    const container = document.getElementById('colorInputs');
    if (!container) return;

    // Group colors by category
    const grouped = {
      'Header': [],
      'Hero': [],
      'Main': [],
      'Menu': [],
      'Button': [],
      'Selected Button': [],
      'Footer': [],
    };

    Object.entries(colors).forEach(([key, value]) => {
      const label = this.formatColorLabel(key);
      
      // Extract RGB and alpha from hex value
      let rgbHex = value;
      let alphaHex = 'ff';
      
      // Handle 8-digit hex (#rrggbbaa)
      if (value.length === 9 && value.startsWith('#')) {
        rgbHex = value.substring(0, 7); // #rrggbb
        alphaHex = value.substring(7, 9); // aa
      }
      
      // Convert alpha hex to decimal (0-255)
      const alphaValue = parseInt(alphaHex, 16);
      const alphaPercent = Math.round((alphaValue / 255) * 100);
      
      const colorInputId = `color_${key.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const alphaInputId = `alpha_${key.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const textInputId = `text_${key.replace(/[^a-zA-Z0-9]/g, '_')}`;
      
      const colorInput = `
        <div class="form-group">
          <label class="form-label">${label}</label>
          <div class="color-picker-with-alpha">
            <div class="color-picker-grid">
              <input type="color" id="${colorInputId}" value="${this.escapeHtml(rgbHex)}" onchange="UpdateUI.updateColorWithAlpha('${key}', '${colorInputId}', '${alphaInputId}', '${textInputId}')">
              <input type="text" class="form-input" id="${textInputId}" data-color-var="${this.escapeHtml(key)}" value="${this.escapeHtml(value)}" onchange="UpdateUI.updateColorFromText('${key}', '${colorInputId}', '${alphaInputId}', '${textInputId}')">
            </div>
            <div class="alpha-slider">
              <label class="form-label" style="font-size: 0.75rem; margin-bottom: 0.25rem;">Opacity: <span id="${alphaInputId}_display">${alphaPercent}%</span></label>
              <input type="range" id="${alphaInputId}" min="0" max="100" value="${alphaPercent}" class="opacity-range" oninput="UpdateUI.updateColorWithAlpha('${key}', '${colorInputId}', '${alphaInputId}', '${textInputId}')">
            </div>
          </div>
        </div>
      `;
      
      // Categorize
      if (key.includes('header')) grouped['Header'].push(colorInput);
      else if (key.includes('hero')) grouped['Hero'].push(colorInput);
      else if (key.includes('main')) grouped['Main'].push(colorInput);
      else if (key.includes('menu')) grouped['Menu'].push(colorInput);
      else if (key.includes('selected')) grouped['Selected Button'].push(colorInput);
      else if (key.includes('button')) grouped['Button'].push(colorInput);
      else if (key.includes('footer') || key.includes('modal')) grouped['Footer'].push(colorInput);
      else grouped['Main'].push(colorInput);
    });

    container.innerHTML = Object.entries(grouped)
      .filter(([_, items]) => items.length > 0)
      .map(([category, items]) => `
        <h3 style="font-size: 1.125rem; font-weight: 600; margin: 1.5rem 0 1rem; color: #1e293b;">${category}</h3>
        ${items.join('')}
      `).join('');
  },

  /**
   * Update color with alpha from color picker and opacity slider
   */
  updateColorWithAlpha(varName, colorInputId, alphaInputId, textInputId) {
    const colorInput = document.getElementById(colorInputId);
    const alphaInput = document.getElementById(alphaInputId);
    const textInput = document.getElementById(textInputId);
    const alphaDisplay = document.getElementById(`${alphaInputId}_display`);
    
    if (!colorInput || !alphaInput || !textInput) return;
    
    // Get RGB from color picker (e.g., #222731)
    const rgb = colorInput.value;
    
    // Get alpha from slider (0-100)
    const alphaPercent = parseInt(alphaInput.value);
    
    // Convert alpha percent to hex (00-ff)
    const alphaValue = Math.round((alphaPercent / 100) * 255);
    const alphaHex = alphaValue.toString(16).padStart(2, '0');
    
    // Combine RGB + alpha
    const finalColor = `${rgb}${alphaHex}`;
    
    // Update text input and display
    textInput.value = finalColor;
    if (alphaDisplay) {
      alphaDisplay.textContent = `${alphaPercent}%`;
    }
    
    // Save draft
    this.saveDraftColor(varName, finalColor);
  },

  /**
   * Update color from text input
   */
  updateColorFromText(varName, colorInputId, alphaInputId, textInputId) {
    const colorInput = document.getElementById(colorInputId);
    const alphaInput = document.getElementById(alphaInputId);
    const textInput = document.getElementById(textInputId);
    const alphaDisplay = document.getElementById(`${alphaInputId}_display`);
    
    if (!colorInput || !alphaInput || !textInput) return;
    
    const value = textInput.value.trim();
    
    // Extract RGB and alpha
    let rgbHex = value;
    let alphaHex = 'ff';
    
    if (value.length === 9 && value.startsWith('#')) {
      rgbHex = value.substring(0, 7);
      alphaHex = value.substring(7, 9);
    } else if (value.length === 7 && value.startsWith('#')) {
      rgbHex = value;
      alphaHex = 'ff';
    }
    
    // Update color picker
    colorInput.value = rgbHex;
    
    // Update alpha slider
    const alphaValue = parseInt(alphaHex, 16);
    const alphaPercent = Math.round((alphaValue / 255) * 100);
    alphaInput.value = alphaPercent;
    
    if (alphaDisplay) {
      alphaDisplay.textContent = `${alphaPercent}%`;
    }
    
    // Save draft
    this.saveDraftColor(varName, value);
  },

  /**
   * Save draft color change
   */
  saveDraftColor(varName, value) {
    const draftsJson = localStorage.getItem(this.storageKeys.draftColors) || '{}';
    const draftColors = JSON.parse(draftsJson);
    
    draftColors[varName] = value;
    localStorage.setItem(this.storageKeys.draftColors, JSON.stringify(draftColors));
    
    this.markPendingChanges();
    this.updateTabActionButtons();
  },

  /**
   * Publish all color changes to content-service
   */
  async publishColors() {
    const draftsJson = localStorage.getItem(this.storageKeys.draftColors);
    if (!draftsJson) {
      this.showError('No draft color changes to publish');
      return;
    }

    const draftColors = JSON.parse(draftsJson);
    
    try {
      const response = await this.authenticatedFetch(
        `${this.apiConfig.getClientUrl()}${this.apiConfig.endpoints.colors}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ colors: { ...this.state.colors, ...draftColors } }),
        }
      );

      if (response.ok) {
        this.showSuccess('Colors published successfully! Rebuild Hugo to see changes.');
        localStorage.removeItem(this.storageKeys.draftColors);
        this.checkPendingChanges();
      } else {
        throw new Error('Failed to publish colors');
      }
    } catch (error) {
      console.error('Error publishing colors:', error);
      this.showError('Failed to publish colors. Changes saved as draft.');
    }
  },

  /**
   * Render manifest form
   */
  renderManifestForm(manifest) {
    const container = document.getElementById('manifestForm');
    if (!container) return;

    container.innerHTML = `
      <div class="form-group">
        <label class="form-label">App Name</label>
        <input type="text" class="form-input" id="manifestName" value="${this.escapeHtml(manifest.name || '')}" onchange="UpdateUI.saveDraftManifest()">
      </div>
      
      <div class="form-group">
        <label class="form-label">Short Name</label>
        <input type="text" class="form-input" id="manifestShortName" value="${this.escapeHtml(manifest.short_name || '')}" onchange="UpdateUI.saveDraftManifest()">
      </div>
      
      <div class="form-group">
        <label class="form-label">Description</label>
        <textarea class="form-textarea" id="manifestDescription" onchange="UpdateUI.saveDraftManifest()">${this.escapeHtml(manifest.description || '')}</textarea>
      </div>
      
      <div class="grid-2">
        <div class="form-group">
          <label class="form-label">Theme Color</label>
          <div class="color-picker-grid">
            <input type="color" value="${this.escapeHtml(manifest.theme_color || '#000000')}" onchange="document.getElementById('manifestThemeColor').value = this.value; UpdateUI.saveDraftManifest()">
            <input type="text" class="form-input" id="manifestThemeColor" value="${this.escapeHtml(manifest.theme_color || '')}" onchange="UpdateUI.saveDraftManifest()">
          </div>
        </div>
        
        <div class="form-group">
          <label class="form-label">Background Color</label>
          <div class="color-picker-grid">
            <input type="color" value="${this.escapeHtml(manifest.background_color || '#000000')}" onchange="document.getElementById('manifestBackgroundColor').value = this.value; UpdateUI.saveDraftManifest()">
            <input type="text" class="form-input" id="manifestBackgroundColor" value="${this.escapeHtml(manifest.background_color || '')}" onchange="UpdateUI.saveDraftManifest()">
          </div>
        </div>
      </div>
      
      <div style="margin-top: 1.5rem;">
        <button class="btn btn-success" onclick="UpdateUI.publishManifest()">Publish Changes</button>
        <button class="btn btn-secondary" onclick="UpdateUI.discardDraftManifest()">Discard Draft</button>
      </div>
    `;
  },

  /**
   * Save manifest draft
   */
  saveDraftManifest() {
    const manifest = {
      name: document.getElementById('manifestName').value,
      short_name: document.getElementById('manifestShortName').value,
      description: document.getElementById('manifestDescription').value,
      theme_color: document.getElementById('manifestThemeColor').value,
      background_color: document.getElementById('manifestBackgroundColor').value,
      display: 'standalone', // Always set to standalone
    };

    localStorage.setItem(this.storageKeys.draftManifest, JSON.stringify(manifest));
    this.markPendingChanges();
    this.updateTabActionButtons();
    this.showSuccess('Manifest draft saved');
  },

  /**
   * Publish manifest changes
   */
  async publishManifest() {
    const draftsJson = localStorage.getItem(this.storageKeys.draftManifest);
    if (!draftsJson) {
      this.showError('No draft manifest changes to publish');
      return;
    }

    const draftManifest = JSON.parse(draftsJson);

    try {
      const response = await this.authenticatedFetch(
        `${this.apiConfig.getClientUrl()}${this.apiConfig.endpoints.manifest}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(draftManifest),
        }
      );

      if (response.ok) {
        this.showSuccess('Manifest published successfully!');
        localStorage.removeItem(this.storageKeys.draftManifest);
        this.checkPendingChanges();
      } else {
        throw new Error('Failed to publish manifest');
      }
    } catch (error) {
      console.error('Error publishing manifest:', error);
      this.showError('Failed to publish manifest. Changes saved as draft.');
    }
  },

  /**
   * Discard manifest draft
   */
  discardDraftManifest() {
    if (confirm('Discard all draft manifest changes?')) {
      localStorage.removeItem(this.storageKeys.draftManifest);
      this.checkPendingChanges();
      this.loadManifest();
      this.showSuccess('Draft discarded');
    }
  },

  /**
   * Discard all drafts for a specific tab
   */
  async discardAllDrafts(tabName) {
    const confirmMessages = {
      menuItems: 'Discard all draft menu item changes?\n\nThis will:\n- Remove all new items\n- Restore all edited items to published version\n- Restore all deleted items\n\nThis action cannot be undone.',
      advertisements: 'Discard all draft advertisement changes?\n\nThis will restore all ads to their published version.\n\nThis action cannot be undone.',
      locations: 'Discard all draft location changes?\n\nThis will restore all locations to their published version.\n\nThis action cannot be undone.',
      branding: 'Reload all branding images?',
      colors: 'Discard all draft color changes?\n\nThis will restore all colors to the published version.\n\nThis action cannot be undone.',
      config: 'Discard all draft config changes?\n\nThis will restore configuration to the published version.\n\nThis action cannot be undone.',
      manifest: 'Discard all draft manifest changes?\n\nThis will restore manifest to the published version.\n\nThis action cannot be undone.',
    };
    
    const message = confirmMessages[tabName] || 'Discard all draft changes?';
    
    if (!confirm(message)) {
      return;
    }
    
    try {
      switch (tabName) {
        case 'menuItems':
          // Clear all menu item drafts
          localStorage.removeItem(this.storageKeys.draftItems);
          this.showSuccess('All menu item drafts discarded');
          await this.loadMenuItems();
          break;
          
        case 'advertisements':
          // Clear all ad drafts
          localStorage.removeItem(this.storageKeys.draftAds);
          this.showSuccess('All advertisement drafts discarded');
          await this.loadAdvertisements();
          break;
          
        case 'locations':
          // Clear all location drafts
          localStorage.removeItem(this.storageKeys.draftLocations);
          this.showSuccess('All location drafts discarded');
          await this.loadLocations();
          break;
          
        case 'branding':
          // Clear all branding drafts
          const brandingDrafts = this.getBrandingDrafts();
          Object.keys(brandingDrafts).forEach(filename => {
            sessionStorage.removeItem(`branding_file_${filename}`);
          });
          localStorage.removeItem(this.storageKeys.draftBranding);
          this.showSuccess('All branding image drafts discarded');
          await this.loadBrandingImages();
          break;
          
        case 'colors':
          // Clear color drafts
          localStorage.removeItem(this.storageKeys.draftColors);
          this.showSuccess('All color drafts discarded');
          await this.loadColors();
          break;
          
        case 'config':
          // Clear config drafts
          localStorage.removeItem(this.storageKeys.draftConfig);
          this.showSuccess('All config drafts discarded');
          await this.loadConfig();
          break;
          
        case 'manifest':
          // Clear manifest drafts
          localStorage.removeItem(this.storageKeys.draftManifest);
          this.showSuccess('All manifest drafts discarded');
          await this.loadManifest();
          break;
          
        default:
          this.showError(`Unknown tab: ${tabName}`);
          return;
      }
      
      // Recheck pending changes
      this.checkPendingChanges();
      
    } catch (error) {
      console.error('Error discarding drafts:', error);
      this.showError(`Failed to discard drafts: ${error.message}`);
    }
  },

  /**
   * Discard all drafts globally (from all tabs)
   */
  async discardAllDraftsGlobal() {
    const totalCount = this.getPendingChangesCount();
    
    if (totalCount === 0) {
      this.showError('No pending changes to discard');
      return;
    }
    
    const confirmed = confirm(`Discard ALL ${totalCount} pending changes?\n\nThis will:\n- Remove all draft menu items\n- Remove all draft advertisements\n- Reset all colors, config, and manifest changes\n\nThis action cannot be undone!`);
    
    if (!confirmed) return;
    
    try {
      // Clear branding drafts from session storage
      const brandingDrafts = this.getBrandingDrafts();
      Object.keys(brandingDrafts).forEach(filename => {
        sessionStorage.removeItem(`branding_file_${filename}`);
      });
      
      // Clear all draft storage
      localStorage.removeItem(this.storageKeys.draftItems);
      localStorage.removeItem(this.storageKeys.draftAds);
      localStorage.removeItem(this.storageKeys.draftLocations);
      localStorage.removeItem(this.storageKeys.draftBranding);
      localStorage.removeItem(this.storageKeys.draftColors);
      localStorage.removeItem(this.storageKeys.draftConfig);
      localStorage.removeItem(this.storageKeys.draftManifest);
      
      this.showSuccess('All pending changes discarded');
      
      // Reload all data
      await this.loadMenuItems();
      await this.loadAdvertisements();
      await this.loadLocations();
      await this.loadBrandingImages();
      
      // Recheck pending changes
      this.checkPendingChanges();
      
      // Re-render pending summary
      this.renderPendingSummary();
      
    } catch (error) {
      console.error('Error discarding all drafts:', error);
      this.showError(`Failed to discard all drafts: ${error.message}`);
    }
  },

  /**
   * Render pending changes summary
   */
  renderPendingSummary() {
    const container = document.getElementById('pendingSummary');
    if (!container) return;
    
    const totalCount = this.getPendingChangesCount();
    
    // Update the pending tab badge to match
    const countBadge = document.getElementById('pendingTabCount');
    if (countBadge) {
      countBadge.textContent = totalCount;
      if (totalCount > 0) {
        countBadge.classList.add('visible');
      } else {
        countBadge.classList.remove('visible');
      }
    }
    
    if (totalCount === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">✅</div>
          <p class="empty-state-title">No Pending Changes</p>
          <p class="empty-state-text">All changes have been published or discarded.</p>
        </div>
      `;
      return;
    }
    
    let html = `
      <div class="warning-box">
        <p class="warning-title">⚠️ You have ${totalCount} pending change${totalCount !== 1 ? 's' : ''}</p>
        <p class="warning-text">Review the changes below and publish them to make them live on your site.</p>
      </div>
    `;
    
    // Menu Items
    const draftItems = localStorage.getItem(this.storageKeys.draftItems);
    if (draftItems) {
      const items = JSON.parse(draftItems);
      const itemCount = Object.keys(items).length;
      html += `
        <div class="detail-section">
          <h3 class="detail-section-title">🍽️ Menu Items (${itemCount})</h3>
          <div class="pending-changes-grid">
            ${Object.values(items).map(item => `
              <div class="pending-change-card ${item._isDeleted ? 'deleted' : ''}">
                <div class="pending-change-info">
                  <strong>${this.escapeHtml(item.title)}</strong>
                  <div class="pending-change-status">
                    ${item._isNew ? '<span class="status-new">NEW</span>' : ''}
                    ${item._isDeleted ? '<span class="status-deleted">DELETED</span>' : ''}
                    ${item._isDraft && !item._isNew && !item._isDeleted ? '<span class="status-edited">EDITED</span>' : ''}
                  </div>
                </div>
                <button class="btn btn-sm btn-secondary" onclick="UpdateUI.discardDraftFromPending('${this.escapeHtml(item.id)}')">Discard</button>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }
    
    // Advertisements
    const draftAds = localStorage.getItem(this.storageKeys.draftAds);
    if (draftAds) {
      const ads = JSON.parse(draftAds);
      const adCount = Object.keys(ads).length;
      html += `
        <div class="detail-section">
          <h3 class="detail-section-title">📢 Advertisements (${adCount})</h3>
          <div class="pending-changes-grid">
            ${Object.values(ads).map(ad => `
              <div class="pending-change-card ${ad._isDeleted ? 'deleted' : ''}">
                <div class="pending-change-info">
                  <strong>${this.escapeHtml(ad.title)}</strong>
                  <div class="pending-change-status">
                    ${ad._isNew ? '<span class="status-new">NEW</span>' : ''}
                    ${ad._isDeleted ? '<span class="status-deleted">DELETED</span>' : ''}
                    ${ad._isDraft && !ad._isNew && !ad._isDeleted ? '<span class="status-edited">EDITED</span>' : ''}
                  </div>
                </div>
                <button class="btn btn-sm btn-secondary" onclick="UpdateUI.discardAdDraftFromPending('${this.escapeHtml(ad.id)}')">Discard</button>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }
    
    // Locations
    const draftLocations = localStorage.getItem(this.storageKeys.draftLocations);
    if (draftLocations) {
      const locations = JSON.parse(draftLocations);
      const locCount = Object.keys(locations).length;
      html += `
        <div class="detail-section">
          <h3 class="detail-section-title">📍 Locations (${locCount})</h3>
          <div class="pending-changes-grid">
            ${Object.values(locations).map(loc => `
              <div class="pending-change-card ${loc._isDeleted ? 'deleted' : ''}">
                <div class="pending-change-info">
                  <strong>${this.escapeHtml(loc.city)} - ${this.escapeHtml(loc.address)}</strong>
                  <div class="pending-change-status">
                    ${loc._isNew ? '<span class="status-new">NEW</span>' : ''}
                    ${loc._isDeleted ? '<span class="status-deleted">DELETED</span>' : ''}
                    ${loc._isDraft && !loc._isNew && !loc._isDeleted ? '<span class="status-edited">EDITED</span>' : ''}
                  </div>
                </div>
                <button class="btn btn-sm btn-secondary" onclick="UpdateUI.discardLocationDraftFromPending(${loc._index})">Discard</button>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }
    
    // Branding Images
    const draftBranding = localStorage.getItem(this.storageKeys.draftBranding);
    if (draftBranding) {
      const branding = JSON.parse(draftBranding);
      const brandingCount = Object.keys(branding).length;
      html += `
        <div class="detail-section">
          <h3 class="detail-section-title">🖼️ Branding Images (${brandingCount})</h3>
          <div class="pending-changes-grid">
            ${Object.values(branding).map(img => `
              <div class="pending-change-card">
                <div class="pending-change-info">
                  <strong>${this.escapeHtml(img.filename)}</strong>
                  <div class="pending-change-status">
                    <span class="status-edited">REPLACEMENT</span>
                  </div>
                </div>
                <button class="btn btn-sm btn-secondary" onclick="UpdateUI.discardBrandingDraft('${this.escapeHtml(img.filename)}')">Discard</button>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }
    
    // Colors
    const draftColors = localStorage.getItem(this.storageKeys.draftColors);
    if (draftColors) {
      const colors = JSON.parse(draftColors);
      const colorCount = Object.keys(colors).length;
      html += `
        <div class="detail-section">
          <h3 class="detail-section-title">🎨 Colors (${colorCount} variables)</h3>
          <div class="pending-change-card">
            <div class="pending-change-info">
              <strong>Color Theme Changes</strong>
              <div class="pending-change-status">
                ${colorCount} color variable${colorCount !== 1 ? 's' : ''} modified
              </div>
            </div>
            <button class="btn btn-sm btn-secondary" onclick="UpdateUI.discardAllDrafts('colors')">Discard</button>
          </div>
        </div>
      `;
    }
    
    // Config
    const draftConfig = localStorage.getItem(this.storageKeys.draftConfig);
    if (draftConfig) {
      html += `
        <div class="detail-section">
          <h3 class="detail-section-title">⚙️ Configuration</h3>
          <div class="pending-change-card">
            <div class="pending-change-info">
              <strong>Hugo Configuration Changes</strong>
              <div class="pending-change-status">Site settings modified</div>
            </div>
            <button class="btn btn-sm btn-secondary" onclick="UpdateUI.discardAllDrafts('config')">Discard</button>
          </div>
        </div>
      `;
    }
    
    // Manifest
    const draftManifest = localStorage.getItem(this.storageKeys.draftManifest);
    if (draftManifest) {
      html += `
        <div class="detail-section">
          <h3 class="detail-section-title">📱 PWA Manifest</h3>
          <div class="pending-change-card">
            <div class="pending-change-info">
              <strong>Progressive Web App Settings</strong>
              <div class="pending-change-status">Manifest modified</div>
            </div>
            <button class="btn btn-sm btn-secondary" onclick="UpdateUI.discardAllDrafts('manifest')">Discard</button>
          </div>
        </div>
      `;
    }
    
    container.innerHTML = html;
    
    // Update action buttons after rendering
    this.updateTabActionButtons();
  },

  /**
   * Get total count of pending changes
   */
  getPendingChangesCount() {
    let count = 0;
    
    // Count menu items
    const draftItems = localStorage.getItem(this.storageKeys.draftItems);
    if (draftItems) {
      try {
        count += Object.keys(JSON.parse(draftItems)).length;
      } catch (e) {
        console.error('Error parsing draft items:', e);
      }
    }
    
    // Count ads
    const draftAds = localStorage.getItem(this.storageKeys.draftAds);
    if (draftAds) {
      try {
        count += Object.keys(JSON.parse(draftAds)).length;
      } catch (e) {
        console.error('Error parsing draft ads:', e);
      }
    }
    
    // Count locations
    const draftLocations = localStorage.getItem(this.storageKeys.draftLocations);
    if (draftLocations) {
      try {
        count += Object.keys(JSON.parse(draftLocations)).length;
      } catch (e) {
        console.error('Error parsing draft locations:', e);
      }
    }
    
    // Count branding images
    const draftBranding = localStorage.getItem(this.storageKeys.draftBranding);
    if (draftBranding) {
      try {
        count += Object.keys(JSON.parse(draftBranding)).length;
      } catch (e) {
        console.error('Error parsing draft branding:', e);
      }
    }
    
    // Count colors (count as 1 if any color changes)
    const draftColors = localStorage.getItem(this.storageKeys.draftColors);
    if (draftColors) {
      count += 1;
    }
    
    // Count config (count as 1 if any config changes)
    const draftConfig = localStorage.getItem(this.storageKeys.draftConfig);
    if (draftConfig) {
      count += 1;
    }
    
    // Count manifest (count as 1 if any manifest changes)
    const draftManifest = localStorage.getItem(this.storageKeys.draftManifest);
    if (draftManifest) {
      count += 1;
    }
    
    return count;
  },

  /**
   * Publish all pending changes
   */
  async publishAllChanges() {
    const totalCount = this.getPendingChangesCount();
    
    if (totalCount === 0) {
      this.showError('No pending changes to publish');
      return;
    }
    
    const confirmed = confirm(`Publish ALL ${totalCount} pending changes to the live site?\n\nThis action will publish all drafts to your production site.`);
    
    if (!confirmed) return;
    
    try {
      let successCount = 0;
      let failCount = 0;
      
      // Publish menu items
      const draftItems = this.getDrafts();
      for (const item of Object.values(draftItems)) {
        try {
          await this.publishItem(item.id);
          successCount++;
        } catch (error) {
          failCount++;
          console.error('Failed to publish item:', item.id, error);
        }
      }
      
      // Publish ads
      const draftAdsJson = localStorage.getItem(this.storageKeys.draftAds);
      if (draftAdsJson) {
        const draftAds = JSON.parse(draftAdsJson);
        for (const ad of Object.values(draftAds)) {
          try {
            await this.publishAd(ad.id);
            successCount++;
          } catch (error) {
            failCount++;
            console.error('Failed to publish ad:', ad.id, error);
          }
        }
      }
      
      // Publish locations
      const draftLocationsJson = localStorage.getItem(this.storageKeys.draftLocations);
      if (draftLocationsJson) {
        const draftLocations = JSON.parse(draftLocationsJson);
        for (const loc of Object.values(draftLocations)) {
          try {
            await this.publishLocation(loc._index);
            successCount++;
          } catch (error) {
            failCount++;
            console.error('Failed to publish location:', loc._index, error);
          }
        }
      }
      
      // Publish branding images
      if (localStorage.getItem(this.storageKeys.draftBranding)) {
        try {
          await this.publishBrandingImages();
          // Don't double count - publishBrandingImages already shows success
        } catch (error) {
          failCount++;
          console.error('Failed to publish branding:', error);
        }
      }
      
      // Publish colors
      if (localStorage.getItem(this.storageKeys.draftColors)) {
        try {
          await this.publishColors();
          successCount++;
        } catch (error) {
          failCount++;
        }
      }
      
      // Publish manifest
      if (localStorage.getItem(this.storageKeys.draftManifest)) {
        try {
          await this.publishManifest();
          successCount++;
        } catch (error) {
          failCount++;
        }
      }
      
      // Show results
      if (successCount > 0) {
        this.showSuccess(`Successfully published ${successCount} change${successCount !== 1 ? 's' : ''}!`);
      }
      if (failCount > 0) {
        this.showError(`Failed to publish ${failCount} change${failCount !== 1 ? 's' : ''}`);
      }
      
      // Refresh pending summary
      this.renderPendingSummary();
      this.checkPendingChanges();
      
    } catch (error) {
      console.error('Error publishing all changes:', error);
      this.showError(`Failed to publish changes: ${error.message}`);
    }
  },

  /**
   * Edit menu item - opens modal with item data
   */
  editMenuItem(itemId) {
    openMenuItemModal(itemId);
  },

  /**
   * Publish a single item to content-service
   */
  async publishItem(itemId) {
    const drafts = this.getDrafts();
    const item = drafts[itemId];
    
    if (!item) {
      this.showError('Draft not found');
      return;
    }

    const confirmed = confirm(`Publish "${item.title}" to the live site?`);
    if (!confirmed) return;

    try {
      const method = item._isNew ? 'POST' : 'PUT';
      
      // Convert item ID to content-service format (category/filename)
      // Hugo uses hash IDs, but content-service expects "Category/filename"
      let apiItemId = itemId;
      if (!item._isNew && item.url) {
        // Extract from URL: /category/filename/ → Category/filename
        apiItemId = this.convertUrlToItemId(item.url, item.category);
        console.log('Converted ID:', itemId, '→', apiItemId);
      }
      
      // Use query parameter instead of path to avoid slash encoding issues
      const url = item._isNew
        ? `${this.apiConfig.getClientUrl()}${this.apiConfig.endpoints.content}`
        : `${this.apiConfig.getClientUrl()}${this.apiConfig.endpoints.content}?itemId=${encodeURIComponent(apiItemId)}`;

      console.log('Publishing to:', url);

      const response = await this.authenticatedFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      });

      if (response.ok) {
        // Parse response to check if git push succeeded
        const result = await response.json();
        
        if (result.git && result.git.status === 'pushed') {
          // Git push succeeded - Netlify will auto-rebuild
          this.showSuccess(
            `✅ "${item.title}" published and pushed to GitHub!\n` +
            `🚀 Netlify is rebuilding now. Changes will be live in ~2 minutes.\n` +
            `Commit: ${result.git.commit || 'latest'}`
          );
        } else {
          // Standard success (no git or git not configured)
          this.showSuccess(`"${item.title}" published successfully! Rebuild Hugo to see changes.`);
        }
        
        this.clearDraft(itemId);
        await this.loadMenuItems();
      } else {
        // Get response as text first, then try to parse as JSON
        const text = await response.text();
        let errorMessage = 'Failed to publish item';
        
        try {
          const errorData = JSON.parse(text);
          errorMessage = errorData.error || errorMessage;
        } catch (parseErr) {
          // Response wasn't JSON
          console.error('Non-JSON response:', text);
          errorMessage = `Server error (${response.status}): ${text.substring(0, 100)}`;
        }
        
        throw new Error(errorMessage);
      }
    } catch (error) {
      console.error('Error publishing item:', error);
      this.showError(`Failed to publish: ${error.message}`);
    }
  },

  /**
   * Show publish all dialog
   */
  showPublishDialog() {
    const drafts = this.getDrafts();
    const draftCount = Object.keys(drafts).length;
    
    if (draftCount === 0) {
      this.showError('No drafts to publish');
      return;
    }

    const confirmed = confirm(`Publish all ${draftCount} draft changes to the live site?`);
    if (!confirmed) return;

    this.publishAllDrafts();
  },

  /**
   * Publish all drafts
   */
  async publishAllDrafts() {
    const drafts = this.getDrafts();
    const items = Object.values(drafts);
    
    let successCount = 0;
    let failCount = 0;

    for (const item of items) {
      try {
        const method = item._isNew ? 'POST' : 'PUT';
        
        // Convert item ID to content-service format
        let apiItemId = item.id;
        if (!item._isNew && item.url) {
          apiItemId = this.convertUrlToItemId(item.url, item.category);
          console.log('Converting ID:', item.id, '→', apiItemId);
        }
        
        // Use query parameter instead of path to avoid slash encoding issues
        const url = item._isNew
          ? `${this.apiConfig.getClientUrl()}${this.apiConfig.endpoints.content}`
          : `${this.apiConfig.getClientUrl()}${this.apiConfig.endpoints.content}?itemId=${encodeURIComponent(apiItemId)}`;

        const response = await this.authenticatedFetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item),
        });

        if (response.ok) {
          successCount++;
          this.clearDraft(item.id);
        } else {
          failCount++;
        }
      } catch (error) {
        failCount++;
        console.error('Error publishing item:', error);
      }
    }

    if (successCount > 0) {
      this.showSuccess(`Published ${successCount} items successfully!`);
    }
    if (failCount > 0) {
      this.showError(`Failed to publish ${failCount} items`);
    }

    await this.loadMenuItems();
  },

  /**
   * Authenticated fetch wrapper
   */
  async authenticatedFetch(url, options = {}) {
    const token = AuthClient.getAccessToken();
    
    const headers = {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
    };

    return fetch(url, {
      ...options,
      headers,
    });
  },

  /**
   * Helper: Format color label from CSS variable name
   */
  formatColorLabel(varName) {
    return varName
      .replace(/^--/, '')
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  },

  /**
   * Helper: Convert Hugo URL to content-service item ID format
   * Hugo URL: /category/filename/ → Category/filename
   * Slash is OK in query parameters (no router issues)
   */
  convertUrlToItemId(url, category) {
    if (!url) return null;
    
    // Remove leading/trailing slashes: /category/filename/ → category/filename
    const cleaned = url.replace(/^\/+|\/+$/g, '');
    
    // Split into parts: category/filename
    const parts = cleaned.split('/');
    if (parts.length >= 2) {
      // Capitalize category to match folder structure
      const categoryPart = category || (parts[0].charAt(0).toUpperCase() + parts[0].slice(1));
      const filenamePart = parts[1];
      // Return with slash - it's fine in query parameters
      return `${categoryPart}/${filenamePart}`;
    }
    
    return cleaned;
  },

  /**
   * Helper: Escape HTML
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  /**
   * Show success message
   */
  showSuccess(message) {
    this.showAlert(message, 'success');
  },

  /**
   * Show error message
   */
  showError(message) {
    this.showAlert(message, 'error');
  },

  /**
   * Show alert message
   */
  showAlert(message, type = 'info') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.textContent = message;
    alertDiv.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 9999; min-width: 300px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);';

    document.body.appendChild(alertDiv);

    setTimeout(() => {
      alertDiv.style.opacity = '0';
      alertDiv.style.transition = 'opacity 0.3s';
      setTimeout(() => alertDiv.remove(), 300);
    }, 3000);
  },
};

// Modal functions (global scope for onclick handlers)
function openMenuItemModal(itemId = null, categoryName = null) {
  const modal = document.getElementById('menuItemModal');
  const title = document.getElementById('menuItemModalTitle');
  
  // Reset form
  document.getElementById('menuItemForm').reset();
  
  // Clear dynamic containers
  document.getElementById('pricesContainer').innerHTML = '';
  document.getElementById('imagesContainer').innerHTML = '';
  document.getElementById('sideCategoriesContainer').innerHTML = '';
  document.getElementById('tagsContainer').innerHTML = '';
  document.getElementById('ingredientsContainer').innerHTML = '';
  document.getElementById('cookingMethodsContainer').innerHTML = '';
  document.getElementById('typesContainer').innerHTML = '';
  
  // Populate category dropdown
  populateCategoryDropdown();
  
  if (itemId) {
    title.textContent = 'Edit Menu Item';
    // Load item data (from state, which includes drafts)
    const item = UpdateUI.state.menuItems.find(i => i.id === itemId);
    if (item) {
      document.getElementById('itemId').value = item.id;
      document.getElementById('itemTitle').value = item.title;
      document.getElementById('itemDescription').value = item.description || '';
      document.getElementById('itemCategorySelect').value = item.category;
      document.getElementById('itemWeight').value = item.weight || 0;
      
      // Load tags
      loadTags('tags', item.tags || []);
      loadTags('ingredients', item.ingredients || []);
      loadTags('cookingmethods', item.cookingmethods || []);
      loadTags('types', item.types || []);
      
      // Load prices - handle multiple formats
      if (item.prices && item.prices.length > 0) {
        // Check if prices is array of objects or flat array
        const firstPrice = item.prices[0];
        
        if (typeof firstPrice === 'object' && firstPrice.size !== undefined) {
          // Format: [{size, flavour, price}, ...]
          item.prices.forEach((price, index) => {
            addPriceEntry();
            const entries = document.querySelectorAll('.price-entry');
            const entry = entries[entries.length - 1];
            entry.querySelector('.price-size').value = price.size || '-';
            entry.querySelector('.price-flavour').value = price.flavour || '-';
            entry.querySelector('.price-amount').value = price.price || 0;
          });
        } else if (Array.isArray(firstPrice)) {
          // Format: [[size, flavour, price], ...]
          item.prices.forEach((price, index) => {
            addPriceEntry();
            const entries = document.querySelectorAll('.price-entry');
            const entry = entries[entries.length - 1];
            entry.querySelector('.price-size').value = price[0] || '-';
            entry.querySelector('.price-flavour').value = price[1] || '-';
            entry.querySelector('.price-amount').value = price[2] || 0;
          });
        } else if (item.prices.length === 3 && !Array.isArray(firstPrice)) {
          // Format: [size, flavour, price] - FLAT array (your current format)
          addPriceEntry();
          const entry = document.querySelector('.price-entry');
          entry.querySelector('.price-size').value = item.prices[0] || '-';
          entry.querySelector('.price-flavour').value = item.prices[1] || '-';
          entry.querySelector('.price-amount').value = item.prices[2] || 0;
        } else {
          // Fallback
          addPriceEntry();
        }
      } else if (item.price) {
        // Single price field (simplified format)
        addPriceEntry();
        const entry = document.querySelector('.price-entry');
        entry.querySelector('.price-size').value = '-';
        entry.querySelector('.price-flavour').value = '-';
        entry.querySelector('.price-amount').value = item.price;
      } else {
        // No price data, add empty entry
        addPriceEntry();
      }
      
      // Load images (flat array of strings, with backwards compatibility for old object format)
      if (item.images && item.images.length > 0) {
        item.images.forEach((img) => {
          // Handle old object format {image: "path"} for backwards compatibility
          const imagePath = typeof img === 'object' && img.image ? img.image : img;
          addImageEntry(imagePath);
        });
      } else {
        addImageEntry();
      }
      
      // Load side categories
      if (item.side_categories && item.side_categories.length > 0) {
        item.side_categories.forEach(cat => {
          addSideCategory();
          const entries = document.querySelectorAll('.side-category-entry');
          const catEntry = entries[entries.length - 1];
          const catId = catEntry.getAttribute('data-category-id');
          
          catEntry.querySelector('.side-cat-name').value = cat.category_name || '';
          catEntry.querySelector('.side-cat-display').value = cat.display_name || '';
          
          // Clear auto-added item and add actual items
          const itemsContainer = catEntry.querySelector(`.side-items-container[data-cat="${catId}"]`);
          if (itemsContainer) {
            itemsContainer.innerHTML = '';
            (cat.items || []).forEach(item => {
              addSideItem(catId);
              const itemEntries = itemsContainer.querySelectorAll('.side-item-entry');
              const itemEntry = itemEntries[itemEntries.length - 1];
              
              // Handle both array format [name, type, price] and object format {name, type, price}
              if (Array.isArray(item)) {
                itemEntry.querySelector('.side-item-name').value = item[0] || '';
                itemEntry.querySelector('.side-item-type').value = item[1] || 'Regular';
                itemEntry.querySelector('.side-item-price').value = item[2] || 0;
              } else {
                itemEntry.querySelector('.side-item-name').value = item.name || '';
                itemEntry.querySelector('.side-item-type').value = item.type || 'Regular';
                itemEntry.querySelector('.side-item-price').value = item.price || 0;
              }
            });
          }
          
          // Load config - handle both array format and object format
          if (cat.config) {
            if (Array.isArray(cat.config)) {
              // Array format: [all_max, all_valuecount, all_value, regular_max, regular_valuecount, regular_value, premium_max, premium_valuecount, premium_value]
              catEntry.querySelector('.side-config-max').value = cat.config[0] || 0;
              catEntry.querySelector('.side-config-valuecount').value = cat.config[1] || 0;
              catEntry.querySelector('.side-config-value').value = cat.config[2] || 0;
            } else {
              // Object format
              catEntry.querySelector('.side-config-max').value = cat.config.all_max || 0;
              catEntry.querySelector('.side-config-valuecount').value = cat.config.all_valuecount || 0;
              catEntry.querySelector('.side-config-value').value = cat.config.all_value || 0;
            }
          }
        });
      }
    }
  } else {
    title.textContent = 'Add Menu Item';
    document.getElementById('itemId').value = 'new_' + Date.now();
    
    // Set category if provided
    if (categoryName) {
      document.getElementById('itemCategorySelect').value = categoryName;
    }
    
    // Add default entries
    addPriceEntry();
    addImageEntry();
  }
  
  modal.classList.add('active');
  
  // Scroll modal to top
  modal.scrollTop = 0;
}

function closeMenuItemModal() {
  document.getElementById('menuItemModal').classList.remove('active');
}

async function saveMenuItem(event) {
  event.preventDefault();
  
  const itemId = document.getElementById('itemId').value;
  const isNew = itemId.startsWith('new_');
  
  // Collect prices
  const prices = [];
  document.querySelectorAll('.price-entry').forEach(entry => {
    const size = entry.querySelector('.price-size').value;
    const flavour = entry.querySelector('.price-flavour').value;
    const price = parseFloat(entry.querySelector('.price-amount').value);
    prices.push({ size, flavour, price });
  });
  
  // Collect images
  const images = [];
  const pendingUploads = [];
  
  document.querySelectorAll('.image-entry').forEach(entry => {
    const imagePath = entry.querySelector('.image-path').value.trim();
    const fileInput = entry.querySelector('.image-file');
    
    if (imagePath) {
      // Store as flat array of strings (matching Hugo JSON format)
      images.push(imagePath);
      
      // Check if there's a pending file upload
      if (fileInput && fileInput.files && fileInput.files[0]) {
        pendingUploads.push({
          file: fileInput.files[0],
          path: imagePath,
        });
      }
    }
  });
  
  // Store pending uploads for later (when publishing)
  if (pendingUploads.length > 0) {
    console.log('📸 Pending image uploads:', pendingUploads.map(u => u.file.name));
    // Store file references for upload on publish
    sessionStorage.setItem(`pending_uploads_${itemId}`, JSON.stringify(pendingUploads.map(u => u.path)));
  }
  
  // Collect side categories
  const sideCategories = [];
  document.querySelectorAll('.side-category-entry').forEach(catEntry => {
    const categoryName = catEntry.querySelector('.side-cat-name').value.trim();
    const displayName = catEntry.querySelector('.side-cat-display').value.trim();
    
    if (!categoryName) return;
    
    // Collect items for this category
    const categoryId = catEntry.getAttribute('data-category-id');
    const items = [];
    const itemsContainer = catEntry.querySelector(`.side-items-container[data-cat="${categoryId}"]`);
    if (itemsContainer) {
      itemsContainer.querySelectorAll('.side-item-entry').forEach(itemEntry => {
        const name = itemEntry.querySelector('.side-item-name').value.trim();
        const type = itemEntry.querySelector('.side-item-type').value.trim();
        const price = parseFloat(itemEntry.querySelector('.side-item-price').value) || 0;
        if (name) {
          items.push({ name, type, price });
        }
      });
    }
    
    // Collect config
    const config = {
      all_max: parseInt(catEntry.querySelector('.side-config-max').value) || 0,
      all_valuecount: parseInt(catEntry.querySelector('.side-config-valuecount').value) || 0,
      all_value: parseInt(catEntry.querySelector('.side-config-value').value) || 0,
      regular_max: parseInt(catEntry.querySelector('.side-config-max').value) || 0,
      regular_valuecount: parseInt(catEntry.querySelector('.side-config-valuecount').value) || 0,
      regular_value: parseInt(catEntry.querySelector('.side-config-value').value) || 0,
      premium_max: 0,
      premium_valuecount: 0,
      premium_value: 0,
    };
    
    sideCategories.push({
      category_name: categoryName,
      display_name: displayName,
      items,
      config,
    });
  });
  
  // Extract first price for card display
  let displayPrice = 0;
  if (prices.length > 0) {
    displayPrice = parseFloat(prices[0].price) || 0;
  }
  
  // Extract first image path for card display (images is now a flat array of strings)
  let displayImage = null;
  if (images.length > 0) {
    displayImage = images[0];
  }
  
  // Get the original item to preserve URL (needed for content-service API)
  const originalItem = UpdateUI.state.menuItems.find(i => i.id === itemId);
  
  const itemData = {
    id: itemId,
    title: document.getElementById('itemTitle').value,
    description: document.getElementById('itemDescription').value,
    category: document.getElementById('itemCategorySelect').value,
    weight: parseInt(document.getElementById('itemWeight').value) || 0,
    price: displayPrice,
    image: displayImage,
    prices: prices,
    images: images,
    side_categories: sideCategories,
    tags: getTagValues('tags'),
    ingredients: getTagValues('ingredients'),
    cookingmethods: getTagValues('cookingmethods'),
    types: getTagValues('types'),
    url: originalItem?.url || null, // Preserve URL for API conversion
    _isNew: isNew,
  };

  // Save as draft in localStorage
  UpdateUI.saveDraft(itemData);
  
  closeMenuItemModal();
  
  // Reload to show the draft
  await UpdateUI.loadMenuItems();
  
  // Update pending summary
  UpdateUI.renderPendingSummary();
  
  // Show appropriate message
  if (pendingUploads.length > 0) {
    UpdateUI.showSuccess(`"${itemData.title}" saved as draft. ${pendingUploads.length} image(s) will be uploaded when you publish.`);
  } else {
    UpdateUI.showSuccess(`"${itemData.title}" saved as draft. Click "Publish" to commit to the live site.`);
  }
}

function openLocationModal(index = null) {
  const modal = document.getElementById('locationModal');
  const title = document.getElementById('locationModalTitle');
  const deleteBtn = document.getElementById('deleteLocationBtn');
  
  // Clear all hours entries first
  clearAllHoursEntries();
  
  if (index !== null) {
    title.textContent = 'Edit Location';
    const loc = UpdateUI.state.locations[index];
    if (loc) {
      document.getElementById('locationIndex').value = index;
      document.getElementById('locationAddress').value = loc.address;
      document.getElementById('locationCity').value = loc.city;
      document.getElementById('locationIsland').value = loc.island;
      document.getElementById('locationPhone').value = loc.phone || '';
      document.getElementById('locationWhatsapp').value = loc.whatsapp || '';
      document.getElementById('locationLat').value = loc.latlon ? loc.latlon[0] : '';
      document.getElementById('locationLon').value = loc.latlon ? loc.latlon[1] : '';
      document.getElementById('locationSubcategories').value = loc.subcategories ? loc.subcategories.join(', ') : '';
      document.getElementById('locationOrderingTables').value = loc.orderingtables ? loc.orderingtables.join(', ') : '';
      document.getElementById('locationFoodDrop').value = loc.delivery?.fooddrop || '';
      
      // Load opening hours
      if (loc.opening_hours) {
        document.getElementById('locationHoursMode').value = loc.opening_hours.mode || 'Auto';
        
        const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
        days.forEach(day => {
          const hours = loc.opening_hours[day];
          if (hours && hours.length > 0) {
            hours.forEach(entry => {
              addHoursEntry(day, entry.type, entry.time);
            });
          } else {
            // Add default Open and Close entries for days with no data
            addHoursEntry(day, 'Open', '11:00');
            addHoursEntry(day, 'Close', '22:00');
          }
        });
      } else {
        // No hours data, add defaults
        const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
        days.forEach(day => {
          addHoursEntry(day, 'Open', '11:00');
          addHoursEntry(day, 'Close', '22:00');
        });
      }
      
      // Show delete button for existing locations
      deleteBtn.style.display = 'inline-block';
    }
  } else {
    title.textContent = 'Add Location';
    document.getElementById('locationForm').reset();
    document.getElementById('locationIndex').value = '';
    deleteBtn.style.display = 'none';
    
    // Add default hours for all days
    const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    days.forEach(day => {
      addHoursEntry(day, 'Open', '11:00');
      addHoursEntry(day, 'Close', '22:00');
    });
  }
  
  modal.classList.add('active');
  
  // Scroll modal to top
  modal.scrollTop = 0;
}

function closeLocationModal() {
  document.getElementById('locationModal').classList.remove('active');
}

async function saveLocation(event) {
  event.preventDefault();
  
  const indexValue = document.getElementById('locationIndex').value;
  const isNew = indexValue === '';
  const index = isNew ? UpdateUI.state.locations.length : parseInt(indexValue);
  
  // Get base data from existing location if editing
  const baseData = !isNew && UpdateUI.state.locations[index] 
    ? { id: UpdateUI.state.locations[index].id } 
    : { id: `location-${index}` };
  
  const locationData = {
    ...baseData,
    address: document.getElementById('locationAddress').value,
    city: document.getElementById('locationCity').value,
    island: document.getElementById('locationIsland').value,
    phone: document.getElementById('locationPhone').value,
    whatsapp: document.getElementById('locationWhatsapp').value,
    latlon: [
      parseFloat(document.getElementById('locationLat').value) || 0,
      parseFloat(document.getElementById('locationLon').value) || 0
    ],
    subcategories: document.getElementById('locationSubcategories').value.split(',').map(s => s.trim()).filter(Boolean),
    orderingtables: document.getElementById('locationOrderingTables').value.split(',').map(s => s.trim()).filter(Boolean),
    delivery: {
      fooddrop: document.getElementById('locationFoodDrop').value
    },
    opening_hours: getHoursData(),
    _index: index,
    _isNew: isNew
  };
  
  // Save as draft in localStorage
  UpdateUI.saveDraftLocation(locationData);
  
  closeLocationModal();
  await UpdateUI.loadLocations();
  UpdateUI.renderPendingSummary();
  UpdateUI.showSuccess(`Location "${locationData.city}" saved as draft. Click "Publish" to commit changes.`);
}

async function deleteLocation(index = null) {
  // If called from modal (delete button), get index from hidden field
  if (index === null) {
    const indexValue = document.getElementById('locationIndex').value;
    if (indexValue === '') return;
    index = parseInt(indexValue);
  }
  
  const loc = UpdateUI.state.locations[index];
  if (!loc) return;
  
  const confirmed = confirm(`Delete location "${loc.city} - ${loc.address}"?\n\nThis will mark the location for deletion. You must publish to permanently delete.`);
  if (!confirmed) return;
  
  // Mark location as deleted
  const locationData = {
    ...loc,
    _index: index,
    _isDeleted: true
  };
  
  UpdateUI.saveDraftLocation(locationData);
  
  // Close modal if it's open
  const modal = document.getElementById('locationModal');
  if (modal && modal.classList.contains('active')) {
    closeLocationModal();
  }
  
  await UpdateUI.loadLocations();
  UpdateUI.renderPendingSummary();
  UpdateUI.showSuccess(`Location "${loc.city}" marked for deletion. Publish to permanently delete.`);
}

// Save colors function (called from onclick in HTML)
async function saveColors() {
  await UpdateUI.publishColors();
}

async function resetColors() {
  if (confirm('Discard all draft color changes and reload from CSS?')) {
    localStorage.removeItem(UpdateUI.storageKeys.draftColors);
    UpdateUI.checkPendingChanges();
    await UpdateUI.loadColors();
    UpdateUI.showSuccess('Draft changes discarded');
  }
}

// Initialize when DOM is ready and user is authenticated
document.addEventListener('DOMContentLoaded', async () => {
  // Protect this page - require authentication
  const isProtected = AuthMiddleware.protectPage({
    redirectUrl: '/login/',
    requireAdmin: false,
  });

  if (!isProtected) {
    return;
  }

  // Initialize Update UI
  await UpdateUI.init();
});

// Ad modal functions (global scope for onclick handlers)
function openAdModal(adId = null) {
  const modal = document.getElementById('adModal');
  const title = document.getElementById('adModalTitle');
  
  if (adId) {
    title.textContent = 'Edit Advertisement';
    const ad = UpdateUI.state.advertisements.find(a => a.id === adId);
    if (ad) {
      document.getElementById('adId').value = ad.id;
      document.getElementById('adTitle').value = ad.title;
      document.getElementById('adDescription').value = ad.description || '';
      document.getElementById('adLink').value = ad.link || '';
      document.getElementById('adWeight').value = ad.weight || 1;
      document.getElementById('adRecurring').checked = ad.recurring || false;
      document.getElementById('adDaysOfWeek').value = ad.daysOfWeek ? ad.daysOfWeek.join(', ') : '';
      document.getElementById('adLocations').value = ad.locations ? ad.locations.join(', ') : '';
    }
  } else {
    title.textContent = 'Add Advertisement';
    document.getElementById('adForm').reset();
    document.getElementById('adId').value = 'new_ad_' + Date.now();
  }
  
  modal.classList.add('active');
  
  // Scroll modal to top
  modal.scrollTop = 0;
}

function closeAdModal() {
  document.getElementById('adModal').classList.remove('active');
}

async function saveAd(event) {
  event.preventDefault();
  
  const adId = document.getElementById('adId').value;
  const isNew = adId.startsWith('new_ad_');
  
  const adData = {
    id: adId,
    title: document.getElementById('adTitle').value,
    description: document.getElementById('adDescription').value,
    link: document.getElementById('adLink').value,
    weight: parseInt(document.getElementById('adWeight').value) || 1,
    recurring: document.getElementById('adRecurring').checked,
    daysOfWeek: document.getElementById('adDaysOfWeek').value.split(',').map(d => d.trim()).filter(Boolean),
    locations: document.getElementById('adLocations').value.split(',').map(l => l.trim()).filter(Boolean),
    _isNew: isNew,
  };
  
  // Handle image upload if provided
  const imageInput = document.getElementById('adImage');
  if (imageInput && imageInput.files && imageInput.files[0]) {
    // For now, just store the file name - actual upload happens on publish
    adData.imagePending = imageInput.files[0].name;
  }
  
  UpdateUI.saveDraftAd(adData);
  closeAdModal();
  await UpdateUI.loadAdvertisements();
  UpdateUI.renderPendingSummary();
  UpdateUI.showSuccess(`"${adData.title}" saved as draft`);
}

// Dynamic form field functions
function addPriceEntry() {
  const container = document.getElementById('pricesContainer');
  const entry = document.createElement('div');
  entry.className = 'price-entry';
  entry.innerHTML = `
    <div class="grid-3">
      <div class="form-group">
        <label class="form-label">Size</label>
        <input type="text" class="form-input price-size" placeholder="Regular" value="-">
      </div>
      <div class="form-group">
        <label class="form-label">Flavour</label>
        <input type="text" class="form-input price-flavour" placeholder="Original" value="-">
      </div>
      <div class="form-group">
        <label class="form-label">Price ($) *</label>
        <input type="number" class="form-input price-amount" step="0.01" min="0" required>
      </div>
    </div>
    <button type="button" class="btn btn-sm btn-danger entry-remove-btn" onclick="removePriceEntry(this)">Remove Price</button>
  `;
  container.appendChild(entry);
}

function removePriceEntry(button) {
  const entry = button.closest('.price-entry');
  const container = document.getElementById('pricesContainer');
  // Keep at least one price entry
  if (container.querySelectorAll('.price-entry').length > 1) {
    entry.remove();
  } else {
    alert('At least one price is required');
  }
}

function addImageEntry(imagePath = '') {
  const container = document.getElementById('imagesContainer');
  const entryId = 'img_' + Date.now();
  const entry = document.createElement('div');
  entry.className = 'image-entry';
  
  const hasImage = imagePath && imagePath.trim() !== '';
  
  entry.innerHTML = `
    <div class="image-preview-box ${hasImage ? 'has-image' : ''}" id="preview_${entryId}" style="${hasImage ? '' : 'display: none;'}">
      ${hasImage ? `<img src="${imagePath.startsWith('/') ? imagePath : '/' + imagePath}" alt="Preview"><div class="card-filename">${imagePath}</div>` : ''}
    </div>
    <div class="form-group" id="filegroup_${entryId}" style="${hasImage ? 'display: none;' : ''}">
      <div class="empty-preview">📸 Click "Choose File" to select an image</div>
      <input type="file" class="form-input image-file" id="file_${entryId}" accept="image/jpeg,image/jpg,image/png,image/webp,image/gif">
      <small class="form-helper">Accepts: JPEG, PNG, WEBP, GIF</small>
    </div>
    <input type="hidden" class="image-path" value="${imagePath}">
    <button type="button" class="btn btn-sm btn-danger entry-remove-btn" onclick="removeImageEntry(this)">Remove Image</button>
  `;
  container.appendChild(entry);
  
  // Add change handler to file input
  const fileInput = entry.querySelector('.image-file');
  fileInput.addEventListener('change', () => {
    handleImageFileSelect(fileInput, `preview_${entryId}`);
  });
}

function handleImageFileSelect(fileInput, previewId) {
  const preview = document.getElementById(previewId);
  const entry = fileInput.closest('.image-entry');
  const hiddenInput = entry.querySelector('.image-path');
  const fileGroupId = previewId.replace('preview_', 'filegroup_');
  const fileGroup = document.getElementById(fileGroupId);
  
  if (!fileInput.files || !fileInput.files[0]) {
    return;
  }
  
  const file = fileInput.files[0];
  
  // Validate file type
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
  if (!validTypes.includes(file.type)) {
    alert('Invalid file type. Please select a JPEG, PNG, WEBP, or GIF image.');
    fileInput.value = '';
    return;
  }
  
  // Show preview
  const reader = new FileReader();
  reader.onload = function(e) {
    if (preview) {
      const fileName = `images/${file.name}`;
      preview.innerHTML = `<img src="${e.target.result}" alt="Preview"><div class="card-filename">${fileName}</div>`;
      preview.classList.add('has-image');
      preview.style.display = '';
    }
  };
  reader.readAsDataURL(file);
  
  // Store file name in hidden input (will be uploaded on save)
  const fileName = `images/${file.name}`;
  hiddenInput.value = fileName;
  
  // Hide the file input group after selection
  if (fileGroup) {
    fileGroup.style.display = 'none';
  }
  
  // Mark that this is a pending upload
  fileInput.setAttribute('data-pending-upload', 'true');
}

function removeImageEntry(button) {
  const entry = button.closest('.image-entry');
  entry.remove();
}

// Opening Hours Management Functions
function addHoursEntry(day, type = 'Open', time = '11:00') {
  const container = document.getElementById(`hoursEntries_${day}`);
  if (!container) return;
  
  const entry = document.createElement('div');
  entry.className = 'hours-entry';
  entry.innerHTML = `
    <select class="form-select hours-type">
      <option value="Open" ${type === 'Open' ? 'selected' : ''}>Open</option>
      <option value="Close" ${type === 'Close' ? 'selected' : ''}>Close</option>
    </select>
    <input type="time" class="form-input hours-time" value="${time}" onchange="sortHoursEntries('${day}')">
    <button type="button" class="btn btn-sm btn-danger hours-entry-remove-btn" onclick="removeHoursEntry(this)">×</button>
  `;
  container.appendChild(entry);
  
  // Sort entries by time after adding
  sortHoursEntries(day);
}

function sortHoursEntries(day) {
  const container = document.getElementById(`hoursEntries_${day}`);
  if (!container) return;
  
  // Get all entries
  const entries = Array.from(container.querySelectorAll('.hours-entry'));
  
  // Sort by time
  entries.sort((a, b) => {
    const timeA = a.querySelector('.hours-time').value;
    const timeB = b.querySelector('.hours-time').value;
    return timeA.localeCompare(timeB);
  });
  
  // Re-append in sorted order
  container.innerHTML = '';
  entries.forEach(entry => container.appendChild(entry));
}

function removeHoursEntry(button) {
  const entry = button.closest('.hours-entry');
  entry.remove();
}

function clearAllHoursEntries() {
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  days.forEach(day => {
    const container = document.getElementById(`hoursEntries_${day}`);
    if (container) {
      container.innerHTML = '';
    }
  });
}

function copyFromPreviousDay(toDay, fromDay) {
  const fromContainer = document.getElementById(`hoursEntries_${fromDay}`);
  const toContainer = document.getElementById(`hoursEntries_${toDay}`);
  
  if (!fromContainer || !toContainer) return;
  
  // Get entries from source day
  const fromEntries = [];
  fromContainer.querySelectorAll('.hours-entry').forEach(entry => {
    fromEntries.push({
      type: entry.querySelector('.hours-type').value,
      time: entry.querySelector('.hours-time').value
    });
  });
  
  if (fromEntries.length === 0) {
    alert(`${fromDay.toUpperCase()} has no entries to copy.`);
    return;
  }
  
  // Clear target day
  toContainer.innerHTML = '';
  
  // Copy entries
  fromEntries.forEach(entry => {
    addHoursEntry(toDay, entry.type, entry.time);
  });
  
  UpdateUI.showSuccess(`Copied ${fromEntries.length} entries from ${fromDay.toUpperCase()} to ${toDay.toUpperCase()}`);
}

function getHoursData() {
  const mode = document.getElementById('locationHoursMode').value;
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const opening_hours = { mode };
  
  days.forEach(day => {
    const container = document.getElementById(`hoursEntries_${day}`);
    if (container) {
      const entries = [];
      container.querySelectorAll('.hours-entry').forEach(entry => {
        const type = entry.querySelector('.hours-type').value;
        const time = entry.querySelector('.hours-time').value;
        entries.push({ type, time });
      });
      
      // Sort entries by time chronologically
      entries.sort((a, b) => a.time.localeCompare(b.time));
      
      if (entries.length > 0) {
        opening_hours[day] = entries;
      }
    }
  });
  
  return opening_hours;
}

// Tag Management Functions
function addTag(type) {
  const inputMap = {
    'tags': 'tagInput',
    'ingredients': 'ingredientInput',
    'cookingmethods': 'cookingMethodInput',
    'types': 'typeInput'
  };
  
  const containerMap = {
    'tags': 'tagsContainer',
    'ingredients': 'ingredientsContainer',
    'cookingmethods': 'cookingMethodsContainer',
    'types': 'typesContainer'
  };
  
  const inputId = inputMap[type];
  const containerId = containerMap[type];
  
  const input = document.getElementById(inputId);
  const container = document.getElementById(containerId);
  
  if (!input || !container) return;
  
  const value = input.value.trim();
  if (!value) {
    alert('Please enter a value');
    return;
  }
  
  // Check for duplicates (case-insensitive)
  const existingTags = Array.from(container.querySelectorAll('.tag-item'))
    .map(tag => tag.getAttribute('data-value').toLowerCase());
  
  if (existingTags.includes(value.toLowerCase())) {
    alert('This tag already exists');
    input.value = '';
    return;
  }
  
  // Create tag element
  const tagEl = document.createElement('span');
  tagEl.className = 'tag-item';
  tagEl.setAttribute('data-value', value);
  tagEl.innerHTML = `
    ${value}
    <span class="tag-remove" onclick="removeTag('${type}', '${value.replace(/'/g, "\\'")}')">×</span>
  `;
  
  container.appendChild(tagEl);
  input.value = '';
  input.focus();
}

function removeTag(type, value) {
  const containerMap = {
    'tags': 'tagsContainer',
    'ingredients': 'ingredientsContainer',
    'cookingmethods': 'cookingMethodsContainer',
    'types': 'typesContainer'
  };
  
  const containerId = containerMap[type];
  const container = document.getElementById(containerId);
  
  if (!container) return;
  
  // Find and remove the tag
  const tags = container.querySelectorAll('.tag-item');
  tags.forEach(tag => {
    if (tag.getAttribute('data-value') === value) {
      tag.remove();
    }
  });
}

function loadTags(type, tags) {
  const containerMap = {
    'tags': 'tagsContainer',
    'ingredients': 'ingredientsContainer',
    'cookingmethods': 'cookingMethodsContainer',
    'types': 'typesContainer'
  };
  
  const containerId = containerMap[type];
  const container = document.getElementById(containerId);
  
  if (!container) return;
  
  // Clear existing tags
  container.innerHTML = '';
  
  // Add each tag
  (tags || []).forEach(value => {
    if (value && value.trim()) {
      const tagEl = document.createElement('span');
      tagEl.className = 'tag-item';
      tagEl.setAttribute('data-value', value);
      tagEl.innerHTML = `
        ${value}
        <span class="tag-remove" onclick="removeTag('${type}', '${value.replace(/'/g, "\\'")}')">×</span>
      `;
      container.appendChild(tagEl);
    }
  });
}

function getTagValues(type) {
  const containerMap = {
    'tags': 'tagsContainer',
    'ingredients': 'ingredientsContainer',
    'cookingmethods': 'cookingMethodsContainer',
    'types': 'typesContainer'
  };
  
  const containerId = containerMap[type];
  const container = document.getElementById(containerId);
  
  if (!container) return [];
  
  return Array.from(container.querySelectorAll('.tag-item'))
    .map(tag => tag.getAttribute('data-value'));
}

function addSideCategory() {
  const container = document.getElementById('sideCategoriesContainer');
  const categoryId = 'sidecat_' + Date.now();
  const entry = document.createElement('div');
  entry.className = 'side-category-entry';
  entry.setAttribute('data-category-id', categoryId);
  entry.innerHTML = `
    <div class="grid-2">
      <div class="form-group">
        <label class="form-label">Category Name *</label>
        <input type="text" class="form-input side-cat-name" placeholder="rolls" required>
      </div>
      <div class="form-group">
        <label class="form-label">Display Name *</label>
        <input type="text" class="form-input side-cat-display" placeholder="Choose Your 3 Rolls" required>
      </div>
    </div>
    
    <h5 class="form-subsection-title">Items</h5>
    <div class="side-items-container" data-cat="${categoryId}"></div>
    <button type="button" class="btn btn-sm btn-secondary entry-add-margin" onclick="addSideItem('${categoryId}')">+ Add Item</button>
    
    <h5 class="form-subsection-title">Configuration</h5>
    <div class="grid-3">
      <div class="form-group">
        <label class="form-label">Max Items</label>
        <input type="number" class="form-input side-config-max" min="0" value="3">
      </div>
      <div class="form-group">
        <label class="form-label">Value Count</label>
        <input type="number" class="form-input side-config-valuecount" min="0" value="3">
      </div>
      <div class="form-group">
        <label class="form-label">Value</label>
        <input type="number" class="form-input side-config-value" min="0" value="0">
      </div>
    </div>
    
    <button type="button" class="btn btn-sm btn-danger" onclick="removeSideCategory(this)">Remove Category</button>
  `;
  container.appendChild(entry);
  
  // Add initial item
  addSideItem(categoryId);
}

function removeSideCategory(button) {
  const entry = button.closest('.side-category-entry');
  entry.remove();
}

function addSideItem(categoryId) {
  const container = document.querySelector(`.side-items-container[data-cat="${categoryId}"]`);
  if (!container) return;
  
  const entry = document.createElement('div');
  entry.className = 'side-item-entry';
  entry.innerHTML = `
    <div class="grid-3">
      <div class="form-group">
        <label class="form-label">Name *</label>
        <input type="text" class="form-input side-item-name" placeholder="California" required>
      </div>
      <div class="form-group">
        <label class="form-label">Type</label>
        <input type="text" class="form-input side-item-type" placeholder="Regular" value="Regular">
      </div>
      <div class="form-group">
        <label class="form-label">Price ($)</label>
        <input type="number" class="form-input side-item-price" step="0.01" value="0">
      </div>
    </div>
    <button type="button" class="btn btn-sm btn-danger side-item-remove-btn" onclick="removeSideItem(this)">Remove</button>
  `;
  container.appendChild(entry);
}

function removeSideItem(button) {
  const entry = button.closest('.side-item-entry');
  entry.remove();
}

// Populate category dropdown
function populateCategoryDropdown() {
  const select = document.getElementById('itemCategorySelect');
  if (!select) return;
  
  // Get unique categories from state
  let categories = [];
  
  // Try to get from menudata first
  if (UpdateUI.state.categories && UpdateUI.state.categories.length > 0) {
    categories = UpdateUI.state.categories.map(cat => cat.name);
  } else {
    // Auto-discover from menu items
    const categorySet = new Set();
    UpdateUI.state.menuItems.forEach(item => {
      if (item.category) {
        categorySet.add(item.category);
      }
    });
    categories = Array.from(categorySet).sort();
  }
  
  // Build options HTML
  let optionsHtml = '<option value="">-- Select Category --</option>';
  categories.forEach(cat => {
    optionsHtml += `<option value="${UpdateUI.escapeHtml(cat)}">${UpdateUI.escapeHtml(cat)}</option>`;
  });
  
  // Add "Other" option for new categories
  optionsHtml += '<option value="__new__">+ Add New Category</option>';
  
  select.innerHTML = optionsHtml;
  
  // Add event listener for new category
  select.addEventListener('change', function() {
    if (this.value === '__new__') {
      const newCategory = prompt('Enter new category name:');
      if (newCategory) {
        const option = document.createElement('option');
        option.value = newCategory;
        option.textContent = newCategory;
        option.selected = true;
        this.insertBefore(option, this.lastElementChild);
      } else {
        this.value = '';
      }
    }
  });
}

// Export to window
window.UpdateUI = UpdateUI;
window.openMenuItemModal = openMenuItemModal;
window.closeMenuItemModal = closeMenuItemModal;
window.saveMenuItem = saveMenuItem;
window.openLocationModal = openLocationModal;
window.closeLocationModal = closeLocationModal;
window.saveLocation = saveLocation;
window.deleteLocation = deleteLocation;
window.openAdModal = openAdModal;
window.closeAdModal = closeAdModal;
window.saveAd = saveAd;
window.saveColors = saveColors;
window.resetColors = resetColors;
window.addPriceEntry = addPriceEntry;
window.removePriceEntry = removePriceEntry;
window.addImageEntry = addImageEntry;
window.removeImageEntry = removeImageEntry;
window.addSideCategory = addSideCategory;
window.removeSideCategory = removeSideCategory;
window.addSideItem = addSideItem;
window.removeSideItem = removeSideItem;
window.handleImageFileSelect = handleImageFileSelect;
window.populateCategoryDropdown = populateCategoryDropdown;
window.addTag = addTag;
window.removeTag = removeTag;
window.loadTags = loadTags;
window.getTagValues = getTagValues;
window.addHoursEntry = addHoursEntry;
window.removeHoursEntry = removeHoursEntry;
window.sortHoursEntries = sortHoursEntries;
window.clearAllHoursEntries = clearAllHoursEntries;
window.getHoursData = getHoursData;
window.copyFromPreviousDay = copyFromPreviousDay;

// Branding upload modal function (placeholder)
window.openBrandingUploadModal = function() {
  alert('Image Upload Feature\n\nTo add new branding images:\n1. Upload files to themes/_menus_ttms/static/branding/\n2. Rebuild Hugo\n3. Refresh this page\n\nSupported formats: ICO, PNG, WEBP, GIF, JPG');
};

// Export drag and drop handlers
window.handleDragStart = (e, id) => UpdateUI.handleDragStart(e, id);
window.handleDragOver = (e) => UpdateUI.handleDragOver(e);
window.handleDrop = (e, id) => UpdateUI.handleDrop(e, id);
