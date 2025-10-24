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
    draftHomePage: 'ttmenus_draft_homepage',
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
    
    // Inject preview button styles
    this.injectPreviewButtonStyles();
    
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
   * Inject preview button styles
   */
  injectPreviewButtonStyles() {
    if (document.getElementById('previewButtonStyles')) return;
    
    const style = document.createElement('style');
    style.id = 'previewButtonStyles';
    style.textContent = `
      .preview-toggle-btn {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 9998;
        padding: 12px 24px;
        background: linear-gradient(135deg, #5a6996 0%, #2b3140 100%);
        color: white;
        border: none;
        border-radius: 50px;
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 4px 16px rgba(102, 126, 234, 0.4);
        display: none;
        align-items: center;
        gap: 8px;
        transition: all 0.3s ease;
      }
      
      .preview-toggle-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(102, 126, 234, 0.5);
      }
      
      .preview-toggle-btn:active {
        transform: translateY(0);
      }
    `;
    document.head.appendChild(style);
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
    
    // Show/hide preview button based on tab
    if (tabName === 'colors') {
      // Button will be shown when loadColors renders
    } else {
      this.hidePreviewToggleButton();
    }
    
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
    
    // Load menu items first (categories are discovered from them)
    await this.loadMenuItems();
    
    // Then load categories (fetches icons from category _index.md files)
    await this.loadCategories();
    
    // Load locations in background (not critical for menu tab)
    this.loadLocations().catch(err => console.log('Locations load failed:', err));
    
    console.log('All data loaded');
  },

  /**
   * Load categories from category _index.md files
   */
  async loadCategories() {
    console.log('🔍 Loading categories from category pages...');
    
    // Discover categories from menu items first
    const categoryNames = [...new Set(this.state.menuItems.map(item => item.category))].filter(Boolean);
    
    console.log(`Found ${categoryNames.length} categories from menu items:`, categoryNames);
    
    // Fetch each category's JSON to get icon, weight, etc.
    const categoryPromises = categoryNames.map(async (name) => {
      const categoryPath = name.toLowerCase();
      const possiblePaths = [
        `/${categoryPath}/index.json`,
        `/api/${categoryPath}/index.json`
      ];
      
      for (const path of possiblePaths) {
        try {
          const response = await fetch(path);
          if (response.ok) {
            const data = await response.json();
            console.log(`  ✅ Loaded ${name}:`, { icon: data.icon, weight: data.weight });
            return {
              name: data.title || name,
              icon: data.icon || null,
              weight: parseInt(data.weight) || 0,
            };
          }
        } catch (error) {
          console.log(`  Failed to load ${path}:`, error.message);
        }
      }
      
      // Fallback if no JSON found
      console.warn(`  ⚠️ No JSON found for ${name}, using defaults`);
      return {
        name: name,
        icon: null,
        weight: 999,
      };
    });
    
    this.state.categories = await Promise.all(categoryPromises);
    console.log('✅ Loaded', this.state.categories.length, 'categories with icons:', this.state.categories);
    
    // Clean up legacy menudata drafts if any exist
    this.cleanupLegacyDrafts();
    
    // Re-render menu now that we have icons
    this.renderMenuByCategory();
    
        this.renderCategories();
        this.updateCategorySelects();
  },

  /**
   * Auto-discover categories from existing menu items (DEPRECATED)
   * Categories are now loaded from their _index.md files via loadCategories()
   */
  autoDiscoverCategories() {
    console.log('⚠️ autoDiscoverCategories called - this should not happen anymore');
    console.log('Categories should load from category _index.md files');
    
    // Fallback: create basic structure from menu items
    if (this.state.menuItems && this.state.menuItems.length > 0) {
      const categorySet = new Set();
      this.state.menuItems.forEach(item => {
        if (item.category) {
          categorySet.add(item.category);
        }
      });
      
      this.state.categories = Array.from(categorySet).map(name => ({
        name: name,
        icon: null,
        weight: 999,
      }));
      
      console.log('⚠️ Fallback: Auto-discovered', this.state.categories.length, 'categories (no icons)');
      } else {
      console.log('❌ No menu items yet, categories will be empty');
        this.state.categories = [];
      }
  },

  /**
   * Clean up legacy menudata drafts (icons now stored in category _index.md)
   */
  cleanupLegacyDrafts() {
    const draftMenudata = localStorage.getItem('ttmenus_draft_menudata');
    if (draftMenudata) {
      console.log('🧹 Cleaning up legacy menudata draft from old system');
      localStorage.removeItem('ttmenus_draft_menudata');
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
        const loadedItems = (data.menu_items || []).map(item => {
          // Keep image paths as-is (without prepending /) for storage
          // The / will be added only when displaying in DOM
          let images = [];
          if (item.images && item.images.length > 0) {
            images = item.images.map(img => {
              const path = typeof img === 'object' && img.image ? img.image : img;
              // Remove leading / if present (normalize to no leading slash for storage)
              return path.startsWith('/') ? path.substring(1) : path;
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
            weight: item.weight,  // Keep original weight (might be undefined/null)
            _isDraft: false,
          };
        });
        
        // Assign sequential weights within each category for items without weights
        const itemsByCategory = {};
        loadedItems.forEach(item => {
          if (!itemsByCategory[item.category]) {
            itemsByCategory[item.category] = [];
          }
          itemsByCategory[item.category].push(item);
        });
        
        // For each category, assign sequential weights if items don't have them
        Object.keys(itemsByCategory).forEach(category => {
          const categoryItems = itemsByCategory[category];
          categoryItems.forEach((item, index) => {
            if (item.weight === undefined || item.weight === null) {
              item.weight = index;  // Assign sequential weight based on original order
            }
          });
        });
        
        this.state.menuItems = loadedItems;
        
        // Merge with draft changes from localStorage
        this.mergeDraftItems();
        
        console.log('✅ Menu items loaded. Categories will load next with icons.');
        
        // Don't render yet - wait for categories to load with icons
        // renderMenuByCategory() will be called by loadCategories()
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
    
    // this.showSuccess('Draft saved locally');
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
    
    // Pending indicator removed - changes tracked via pending tab count only
  },

  /**
   * Clear pending changes flag
   */
  clearPendingChanges() {
    this.state.hasPendingChanges = false;
    localStorage.removeItem(this.storageKeys.pendingChanges);
    // Pending indicator removed - changes tracked via pending tab count only
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
      localStorage.getItem(this.storageKeys.draftManifest) !== null ||
      localStorage.getItem(this.storageKeys.draftHomePage) !== null;
    
    this.state.hasPendingChanges = hasDrafts;
    // Pending indicator removed - changes tracked via pending tab count only
    
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
    
    // Home Page
    const discardHomePage = document.getElementById('discardHomePage');
    if (discardHomePage) {
      const hasDraftHomePage = localStorage.getItem(this.storageKeys.draftHomePage) !== null;
      discardHomePage.style.display = hasDraftHomePage ? 'inline-block' : 'none';
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
  // Pending indicator removed - functionality replaced by pending tab count badge

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
    // this.showSuccess('Advertisement draft saved locally');
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
    console.log('💾 Saving draft location:', locationData);
    console.log('   Opening hours:', locationData.opening_hours);
    
    const draftsJson = localStorage.getItem(this.storageKeys.draftLocations) || '{}';
    const drafts = JSON.parse(draftsJson);
    
    // Use index as the key
    const key = locationData._index;
    drafts[key] = {
      ...locationData,
      _draftSavedAt: new Date().toISOString(),
    };
    
    console.log('   Storage key:', this.storageKeys.draftLocations);
    console.log('   Saving to localStorage:', drafts);
    
    localStorage.setItem(this.storageKeys.draftLocations, JSON.stringify(drafts));
    
    // Verify it was saved
    const verification = localStorage.getItem(this.storageKeys.draftLocations);
    console.log('   ✅ Verified localStorage content:', verification);
    
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
    
    // Check if ad is collapsed
    const isCollapsed = this.isAdCollapsed(ad.id);
    const position = index + 1;
    
    return `
      <div class="${cardClasses.join(' ')}" data-ad-id="${this.escapeHtml(ad.id)}">
        
        <div class="menu-item-header" onclick="UpdateUI.toggleAd('${this.escapeHtml(ad.id)}')" style="cursor: pointer;">
          <h3 class="menu-item-title ${ad._isDeleted ? 'deleted' : ''}">${this.escapeHtml(ad.title)}${draftBadge}${newBadge}${deletedBadge}</h3>
          <span class="menu-item-position" style="display: flex; align-items: center; gap: 6px;">
            ${!ad._isDeleted ? `
              <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); UpdateUI.moveAdUp('${this.escapeHtml(ad.id)}')" title="Move up" style="padding: 0.25rem 0.5rem; font-size: 0.875rem; min-width: 32px;">↑</button>
              <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); UpdateUI.moveAdDown('${this.escapeHtml(ad.id)}')" title="Move down" style="padding: 0.25rem 0.5rem; font-size: 0.875rem; min-width: 32px;">↓</button>
            ` : ''}
            <span style="color: #6b7280; font-size: 0.875rem;">#${position}</span>
            <button class="btn-collapse-ad" onclick="event.stopPropagation(); UpdateUI.toggleAd('${this.escapeHtml(ad.id)}')" style="background: none; border: none; font-size: 0.875rem; cursor: pointer; padding: 0 4px; color: #6b7280; min-width: 20px;">
              ${isCollapsed ? '►' : '▼'}
            </button>
          </span>
        </div>
        
        <div class="ad-details" style="display: ${isCollapsed ? 'none' : 'block'};">
          ${ad.image ? `<img src="${this.getDisplayImagePath(ad.image)}" alt="${this.escapeHtml(ad.title)}" class="menu-item-image ${ad._isDeleted ? 'deleted' : ''}">` : ''}
        
        ${ad.description ? `<p class="menu-item-description">${this.escapeHtml(ad.description).substring(0, 100)}</p>` : ''}
        
        ${locationText}
        ${daysText}
        
        <div class="menu-item-actions">
          ${ad._isDeleted ? `
            <button class="btn btn-sm btn-success" onclick="event.stopPropagation(); UpdateUI.restoreAd('${this.escapeHtml(ad.id)}')">Restore</button>
            <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); UpdateUI.publishAd('${this.escapeHtml(ad.id)}')">Confirm Delete</button>
          ` : `
            <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); UpdateUI.editAd('${this.escapeHtml(ad.id)}')">Edit</button>
            ${ad._isDraft && !ad._isNew ? `<button class="btn btn-sm btn-discard" onclick="event.stopPropagation(); UpdateUI.discardAdDraft('${this.escapeHtml(ad.id)}')">Discard</button>` : ''}
            ${ad._isDraft ? `<button class="btn btn-sm btn-success" onclick="event.stopPropagation(); UpdateUI.publishAd('${this.escapeHtml(ad.id)}')">Publish</button>` : ''}
            <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); UpdateUI.deleteAd('${this.escapeHtml(ad.id)}')">Delete</button>
          `}
          </div>
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
    console.log('📝 editAd called with:', adId);
    try {
      openAdModal(adId);
    } catch (error) {
      console.error('❌ Error in editAd:', error);
      this.showError(`Failed to open advertisement editor: ${error.message}`);
    }
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
            
            const typeInfo = this.getBrandingType(filename);
            this.state.brandingImages.push({
              id: filename,
              filename: filename,
              path: `/branding/${filename}`,
              size: sizeKB,
              type: typeInfo.type,
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
   * Get branding image type/category with description
   */
  getBrandingType(filename) {
    if (filename === 'favicon-400x200.webp') {
      return {
        type: 'Fallback Images',
        description: 'Menu item fallback image - displayed when a menu item does not contain an image.',
        icon: '🖼️'
      };
    }
    if (filename.includes('favicon')) {
      return {
        type: 'Favicon',
        description: 'Browser tab icons & home screen icons - displayed when users bookmark your site or add it to their home screen. Multiple sizes for different devices.',
        icon: '🔖'
      };
    }
    if (filename.includes('screenshot')) {
      return {
        type: 'Screenshots',
        description: 'PWA installation screenshots - shown in app stores and when users install your menu as a Progressive Web App.',
        icon: '📱'
      };
    }
    if (filename.includes('mappin')) {
      return {
        type: 'Map Icons',
        description: 'Location markers - displayed on maps to show your restaurant locations.',
        icon: '📍'
      };
    }
    if (filename.includes('logo') || filename.includes('ttmenus')) {
      return {
        type: 'Logo',
        description: 'Main branding logo - displayed throughout the site and app.',
        icon: '🎨'
      };
    }
    if (filename.includes('server')) {
      return {
        type: 'UI Elements',
        description: 'Interface graphics - images used in the user interface.',
        icon: '🖼️'
      };
    }
    return {
      type: 'Other',
      description: 'Miscellaneous branding assets.',
      icon: '📄'
    };
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
    const typeInfo = {};
    
    this.state.brandingImages.forEach(img => {
      const info = this.getBrandingType(img.filename);
      const typeName = info.type;
      
      if (!grouped[typeName]) {
        grouped[typeName] = [];
        typeInfo[typeName] = info;
      }
      grouped[typeName].push(img);
    });
    
    let html = '';
    
    for (const [typeName, images] of Object.entries(grouped)) {
      const info = typeInfo[typeName];
      const isCollapsed = this.isBrandingTypeCollapsed(typeName);
      
      html += `
        <div class="branding-section category-section" data-branding-type="${this.escapeHtml(typeName)}" style="margin-bottom: 2rem;">
          <div class="category-header branding-section-header" onclick="UpdateUI.toggleBrandingType('${this.escapeHtml(typeName)}')" style="cursor: pointer; background: linear-gradient(135deg, #1e293b 0%, #334155 100%) !important;">
            <div class="category-header-left">
              <span class="category-icon" style="font-size: 2rem;">${info.icon}</span>
              <div>
                <h3 class="category-title">${typeName}</h3>
                <p class="category-info">
                  ${images.length} file${images.length !== 1 ? 's' : ''}
                </p>
                <p style="font-size: 0.875rem; color: rgba(255, 255, 255, 0.8); margin: 0.25rem 0 0 0; line-height: 1.4;">
                  ${info.description}
                </p>
              </div>
            </div>
            <div class="category-actions" onclick="event.stopPropagation();">
              <button class="btn-collapse" onclick="event.stopPropagation(); UpdateUI.toggleBrandingType('${this.escapeHtml(typeName)}')" style="background: rgba(255, 255, 255, 0.2); border: 1px solid rgba(255, 255, 255, 0.3); font-size: 0.875rem; cursor: pointer; padding: 0.375rem 0.75rem; border-radius: 4px; color: white; min-width: 36px;">
                ${isCollapsed ? '►' : '▼'}
              </button>
            </div>
          </div>
          
          <div class="branding-section-content" style="display: ${isCollapsed ? 'none' : 'block'}; padding-top: 1rem;">
          <div class="grid-auto-sm">
            ${images.map(img => this.renderBrandingImageCard(img)).join('')}
            </div>
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
    
    // Get detailed info for this file
    const fileDescriptions = {
      'favicon.ico': 'Legacy favicon - 16x16px icon for older browsers',
      'favicon.png': 'Standard PNG favicon - 32x32px',
      'favicon16.webp': '16x16px WebP favicon',
      'favicon144.webp': '144x144px - Windows tile icon',
      'favicon152.webp': '152x152px - iOS home screen icon',
      'favicon192.webp': '192x192px - Android home screen icon',
      'favicon196.webp': '196x196px - Chrome for Android',
      'favicon512.webp': '512x512px - High-res app icon',
      'favicon-400x200.webp': '400x200px - Menu item fallback image',
      'mappin.webp': 'Map marker icon for location pins',
      'richscreenshot1.webp': 'PWA install screenshot #1',
      'richscreenshot2.webp': 'PWA install screenshot #2',
    };
    
    const fileDescription = fileDescriptions[img.filename] || 'Branding asset';
    
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
        <p style="font-size: 0.75rem; color: #6b7280; margin: 0.5rem 0;">${fileDescription}</p>
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
              ${cat.icon ? `<img src="${this.getDisplayImagePath(cat.icon)}" alt="" style="width: 24px; height: 24px; vertical-align: middle; margin-right: 8px;">` : ''}
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

    // Get category order (from category _index.md files, loaded via loadCategories)
    let categoryOrder = this.state.categories.map((cat, index) => ({
      name: cat.name,
      icon: cat.icon,
      weight: cat.weight || index,
    }));

    // If no categories defined, auto-discover from items
    if (categoryOrder.length === 0) {
      console.log('No categories loaded, discovering from items...');
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

      // Check if category is collapsed (from localStorage)
      const isCollapsed = this.isCategoryCollapsed(category.name);

      const html = `
        <div class="category-section" data-category="${this.escapeHtml(category.name)}">
          <div class="category-header" onclick="UpdateUI.toggleCategory('${this.escapeHtml(category.name)}')" style="cursor: pointer;">
            <div class="category-header-left">
              ${category.icon ? `<img src="${this.getDisplayImagePath(category.icon)}" alt="" class="category-icon">` : ''}
              <div>
                <h3 class="category-title">${this.escapeHtml(category.name)}</h3>
                <p class="category-info">
                  ${itemCount} item${itemCount !== 1 ? 's' : ''}
                  ${draftCount > 0 ? `<span class="draft-count">${draftCount} draft${draftCount !== 1 ? 's' : ''}</span>` : ''}
                </p>
              </div>
            </div>
            <div class="category-actions" onclick="event.stopPropagation();">
              <button class="btn btn-sm category-btn" onclick="event.stopPropagation(); UpdateUI.moveCategoryUp('${this.escapeHtml(category.name)}')" title="Move category up" style="padding: 0.25rem 0.5rem; font-size: 0.875rem; min-width: 32px;">
                ↑
              </button>
              <button class="btn btn-sm category-btn" onclick="event.stopPropagation(); UpdateUI.moveCategoryDown('${this.escapeHtml(category.name)}')" title="Move category down" style="padding: 0.25rem 0.5rem; font-size: 0.875rem; min-width: 32px;">
                ↓
              </button>
              <button class="btn btn-sm category-btn" onclick="event.stopPropagation(); UpdateUI.editCategory('${this.escapeHtml(category.name)}')">
                Edit
              </button>
              <button class="btn-collapse" onclick="event.stopPropagation(); UpdateUI.toggleCategory('${this.escapeHtml(category.name)}')" style="background: rgba(255, 255, 255, 0.2); border: 1px solid rgba(255, 255, 255, 0.3); font-size: 0.875rem; cursor: pointer; padding: 0.375rem 0.75rem; border-radius: 4px; color: white; min-width: 36px;">
                ${isCollapsed ? '►' : '▼'}
              </button>
            </div>
          </div>

          <div class="category-items" style="display: ${isCollapsed ? 'none' : 'grid'};">
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

    // Add collapse/expand all controls at the top
    const controlsHTML = `
      <div style="display: flex; justify-content: flex-end; gap: 8px; margin-bottom: 1rem; padding: 0.5rem; background: #f9fafb; border-radius: 6px;">
        <button class="btn btn-sm btn-secondary" onclick="UpdateUI.expandAllCategories()" style="font-size: 0.875rem;">
          ▼ Expand All Categories
        </button>
        <button class="btn btn-sm btn-secondary" onclick="UpdateUI.collapseAllCategories()" style="font-size: 0.875rem;">
          ► Collapse All Categories
        </button>
      </div>
    `;

    // Set the HTML
    container.innerHTML = controlsHTML + categoryHTML.join('');
    
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
    
    // Check for pending image upload
    const hasPendingUpload = sessionStorage.getItem(`pending_uploads_${item.id}`) !== null;
    const pendingBadge = hasPendingUpload ? '<span class="badge badge-warning" style="position: absolute; top: 5px; right: 5px; z-index: 1;">📸 Upload Pending</span>' : '';
    
    // Check if item is collapsed
    const isCollapsed = this.isMenuItemCollapsed(item.id);
    
    return `
      <div class="${cardClasses.join(' ')}" data-item-id="${this.escapeHtml(item.id)}" draggable="${!item._isDeleted}" ondragstart="UpdateUI.handleDragStart(event, '${this.escapeHtml(item.id)}')" ondragover="UpdateUI.handleDragOver(event)" ondrop="UpdateUI.handleDrop(event, '${this.escapeHtml(item.id)}')">
        ${pendingBadge}
        
        <div class="menu-item-header" onclick="UpdateUI.toggleMenuItem('${this.escapeHtml(item.id)}')" style="cursor: pointer;">
          <h3 class="menu-item-title ${item._isDeleted ? 'deleted' : ''}">${this.escapeHtml(item.title)}${draftBadge}${newBadge}${deletedBadge}</h3>
          <span class="menu-item-position" style="display: flex; align-items: center; gap: 6px;">
            ${!item._isDeleted ? `
              <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); UpdateUI.moveMenuItemUp('${this.escapeHtml(item.id)}', '${this.escapeHtml(item.category)}')" title="Move up" style="padding: 0.25rem 0.5rem; font-size: 0.875rem; min-width: 32px;">↑</button>
              <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); UpdateUI.moveMenuItemDown('${this.escapeHtml(item.id)}', '${this.escapeHtml(item.category)}')" title="Move down" style="padding: 0.25rem 0.5rem; font-size: 0.875rem; min-width: 32px;">↓</button>
            ` : ''}
            <span style="color: #6b7280; font-size: 0.875rem;">#${position}</span>
            <button class="btn-collapse-item" onclick="event.stopPropagation(); UpdateUI.toggleMenuItem('${this.escapeHtml(item.id)}')" style="background: none; border: none; font-size: 0.875rem; cursor: pointer; padding: 0 4px; color: #6b7280; min-width: 20px;">
              ${isCollapsed ? '►' : '▼'}
            </button>
          </span>
        </div>
        
        <div class="menu-item-details" style="display: ${isCollapsed ? 'none' : 'block'};">
          ${item.image ? `<img src="${this.getDisplayImagePath(item.image, item.id)}" alt="${this.escapeHtml(item.title)}" class="menu-item-image ${item._isDeleted ? 'deleted' : ''}" onerror="console.error('Image load failed:', '${this.escapeHtml(item.image)}', 'itemId:', '${this.escapeHtml(item.id)}')">` : ''}
        
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
        </div>
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
   * Edit category (opens modal)
   */
  editCategory(categoryName) {
    console.log('📝 editCategory called with:', categoryName);
    try {
      openCategoryModal(categoryName);
    } catch (error) {
      console.error('❌ Error in editCategory:', error);
      this.showError(`Failed to open category editor: ${error.message}`);
    }
  },

  /**
   * Check if category is collapsed
   */
  isCategoryCollapsed(categoryName) {
    const collapsedCategories = JSON.parse(localStorage.getItem('ttmenus_collapsed_categories') || '[]');
    return collapsedCategories.includes(categoryName);
  },

  /**
   * Toggle category collapse state
   */
  toggleCategory(categoryName) {
    const collapsedCategories = JSON.parse(localStorage.getItem('ttmenus_collapsed_categories') || '[]');
    const index = collapsedCategories.indexOf(categoryName);
    
    if (index > -1) {
      // Currently collapsed, expand it
      collapsedCategories.splice(index, 1);
    } else {
      // Currently expanded, collapse it
      collapsedCategories.push(categoryName);
    }
    
    localStorage.setItem('ttmenus_collapsed_categories', JSON.stringify(collapsedCategories));
    
    // Update UI - find the category section and toggle its items
    const categorySection = document.querySelector(`.category-section[data-category="${this.escapeHtml(categoryName)}"]`);
    if (categorySection) {
      const itemsContainer = categorySection.querySelector('.category-items');
      const collapseBtn = categorySection.querySelector('.btn-collapse');
      
      if (itemsContainer) {
        const isNowCollapsed = itemsContainer.style.display === 'none';
        itemsContainer.style.display = isNowCollapsed ? 'grid' : 'none';
        if (collapseBtn) {
          collapseBtn.textContent = isNowCollapsed ? '▼' : '►';
        }
      }
    }
  },

  /**
   * Collapse all categories
   */
  collapseAllCategories() {
    const allCategories = this.state.categories.map(c => c.name);
    localStorage.setItem('ttmenus_collapsed_categories', JSON.stringify(allCategories));
    
    // Update UI - collapse all
    document.querySelectorAll('.category-section').forEach(section => {
      const itemsContainer = section.querySelector('.category-items');
      const collapseBtn = section.querySelector('.btn-collapse');
      
      if (itemsContainer) {
        itemsContainer.style.display = 'none';
      }
      if (collapseBtn) {
        collapseBtn.textContent = '►';
      }
    });
    
    this.showSuccess('All categories collapsed');
  },

  /**
   * Expand all categories
   */
  expandAllCategories() {
    localStorage.setItem('ttmenus_collapsed_categories', JSON.stringify([]));
    
    // Update UI - expand all
    document.querySelectorAll('.category-section').forEach(section => {
      const itemsContainer = section.querySelector('.category-items');
      const collapseBtn = section.querySelector('.btn-collapse');
      
      if (itemsContainer) {
        itemsContainer.style.display = 'grid';
      }
      if (collapseBtn) {
        collapseBtn.textContent = '▼';
      }
    });
    
    this.showSuccess('All categories expanded');
  },

  /**
   * Check if menu item is collapsed
   */
  isMenuItemCollapsed(itemId) {
    const collapsedItems = JSON.parse(localStorage.getItem('ttmenus_collapsed_items') || '[]');
    return collapsedItems.includes(itemId);
  },

  /**
   * Toggle menu item collapse state
   */
  toggleMenuItem(itemId) {
    const collapsedItems = JSON.parse(localStorage.getItem('ttmenus_collapsed_items') || '[]');
    const index = collapsedItems.indexOf(itemId);
    
    if (index > -1) {
      collapsedItems.splice(index, 1);
    } else {
      collapsedItems.push(itemId);
    }
    
    localStorage.setItem('ttmenus_collapsed_items', JSON.stringify(collapsedItems));
    
    // Update UI
    const itemCard = document.querySelector(`.menu-item-card[data-item-id="${this.escapeHtml(itemId)}"]`);
    if (itemCard) {
      const detailsDiv = itemCard.querySelector('.menu-item-details');
      const collapseBtn = itemCard.querySelector('.btn-collapse-item');
      
      if (detailsDiv) {
        const isNowCollapsed = detailsDiv.style.display === 'none';
        detailsDiv.style.display = isNowCollapsed ? 'block' : 'none';
        if (collapseBtn) {
          collapseBtn.textContent = isNowCollapsed ? '▼' : '►';
        }
      }
    }
  },

  /**
   * Check if branding type is collapsed
   */
  isBrandingTypeCollapsed(typeName) {
    const collapsedTypes = JSON.parse(localStorage.getItem('ttmenus_collapsed_branding') || '[]');
    return collapsedTypes.includes(typeName);
  },

  /**
   * Toggle branding type collapse state
   */
  toggleBrandingType(typeName) {
    const collapsedTypes = JSON.parse(localStorage.getItem('ttmenus_collapsed_branding') || '[]');
    const index = collapsedTypes.indexOf(typeName);
    
    if (index > -1) {
      collapsedTypes.splice(index, 1);
    } else {
      collapsedTypes.push(typeName);
    }
    
    localStorage.setItem('ttmenus_collapsed_branding', JSON.stringify(collapsedTypes));
    
    // Update UI
    const brandingSection = document.querySelector(`.branding-section[data-branding-type="${this.escapeHtml(typeName)}"]`);
    if (brandingSection) {
      const contentDiv = brandingSection.querySelector('.branding-section-content');
      const collapseBtn = brandingSection.querySelector('.btn-collapse');
      
      if (contentDiv) {
        const isNowCollapsed = contentDiv.style.display === 'none';
        contentDiv.style.display = isNowCollapsed ? 'block' : 'none';
        if (collapseBtn) {
          collapseBtn.textContent = isNowCollapsed ? '▼' : '►';
        }
      }
    }
  },

  /**
   * Check if location is collapsed
   */
  isLocationCollapsed(locationIndex) {
    const collapsedLocations = JSON.parse(localStorage.getItem('ttmenus_collapsed_locations') || '[]');
    return collapsedLocations.includes(locationIndex);
  },

  /**
   * Toggle location collapse state
   */
  toggleLocation(locationIndex) {
    const collapsedLocations = JSON.parse(localStorage.getItem('ttmenus_collapsed_locations') || '[]');
    const index = collapsedLocations.indexOf(locationIndex);
    
    if (index > -1) {
      collapsedLocations.splice(index, 1);
    } else {
      collapsedLocations.push(locationIndex);
    }
    
    localStorage.setItem('ttmenus_collapsed_locations', JSON.stringify(collapsedLocations));
    
    // Update UI
    const locationCard = document.querySelector(`.location-card[data-location-index="${locationIndex}"]`);
    if (locationCard) {
      const detailsDiv = locationCard.querySelector('.location-details');
      const collapseBtn = locationCard.querySelector('.btn-collapse-location');
      
      if (detailsDiv) {
        const isNowCollapsed = detailsDiv.style.display === 'none';
        detailsDiv.style.display = isNowCollapsed ? 'block' : 'none';
        if (collapseBtn) {
          collapseBtn.textContent = isNowCollapsed ? '▼' : '►';
        }
      }
    }
  },

  /**
   * Check if ad is collapsed
   */
  isAdCollapsed(adId) {
    const collapsedAds = JSON.parse(localStorage.getItem('ttmenus_collapsed_ads') || '[]');
    return collapsedAds.includes(adId);
  },

  /**
   * Toggle ad collapse state
   */
  toggleAd(adId) {
    const collapsedAds = JSON.parse(localStorage.getItem('ttmenus_collapsed_ads') || '[]');
    const index = collapsedAds.indexOf(adId);
    
    if (index > -1) {
      collapsedAds.splice(index, 1);
    } else {
      collapsedAds.push(adId);
    }
    
    localStorage.setItem('ttmenus_collapsed_ads', JSON.stringify(collapsedAds));
    
    // Update UI
    const adCard = document.querySelector(`.menu-item-card[data-ad-id="${this.escapeHtml(adId)}"]`);
    if (adCard) {
      const detailsDiv = adCard.querySelector('.ad-details');
      const collapseBtn = adCard.querySelector('.btn-collapse-ad');
      
      if (detailsDiv) {
        const isNowCollapsed = detailsDiv.style.display === 'none';
        detailsDiv.style.display = isNowCollapsed ? 'block' : 'none';
        if (collapseBtn) {
          collapseBtn.textContent = isNowCollapsed ? '▼' : '►';
        }
      }
    }
  },

  /**
   * Move ad up in order
   */
  async moveAdUp(adId) {
    const sorted = [...this.state.advertisements]
      .filter(a => !a._isDeleted)
      .sort((a, b) => (a.weight || 0) - (b.weight || 0));
    
    const currentIndex = sorted.findIndex(a => a.id === adId);
    
    if (currentIndex <= 0) {
      this.showError('Advertisement is already first');
      return;
    }
    
    const currentAd = sorted[currentIndex];
    const previousAd = sorted[currentIndex - 1];
    
    // Swap weights
    const tempWeight = currentAd.weight || 0;
    currentAd.weight = previousAd.weight || 0;
    previousAd.weight = tempWeight;
    
    // Save both as drafts
    this.saveDraftAd({ ...currentAd, weight: currentAd.weight });
    this.saveDraftAd({ ...previousAd, weight: previousAd.weight });
    
    // Re-render
    await this.loadAdvertisements();
    this.renderPendingSummary();
    this.showSuccess(`Moved "${currentAd.title}" up. Publish to save.`);
  },

  /**
   * Move ad down in order
   */
  async moveAdDown(adId) {
    const sorted = [...this.state.advertisements]
      .filter(a => !a._isDeleted)
      .sort((a, b) => (a.weight || 0) - (b.weight || 0));
    
    const currentIndex = sorted.findIndex(a => a.id === adId);
    
    if (currentIndex >= sorted.length - 1) {
      this.showError('Advertisement is already last');
      return;
    }
    
    const currentAd = sorted[currentIndex];
    const nextAd = sorted[currentIndex + 1];
    
    // Swap weights
    const tempWeight = currentAd.weight || 0;
    currentAd.weight = nextAd.weight || 0;
    nextAd.weight = tempWeight;
    
    // Save both as drafts
    this.saveDraftAd({ ...currentAd, weight: currentAd.weight });
    this.saveDraftAd({ ...nextAd, weight: nextAd.weight });
    
    // Re-render
    await this.loadAdvertisements();
    this.renderPendingSummary();
    this.showSuccess(`Moved "${currentAd.title}" down. Publish to save.`);
  },

  /**
   * Move menu item up within its category
   */
  async moveMenuItemUp(itemId, categoryName) {
    // Get all items in this category, sorted by weight
    const categoryItems = this.state.menuItems
      .filter(i => i.category === categoryName && !i._isDeleted)
      .sort((a, b) => (a.weight || 0) - (b.weight || 0));
    
    const currentIndex = categoryItems.findIndex(i => i.id === itemId);
    
    if (currentIndex <= 0) {
      this.showError('Item is already first in category');
      return;
    }
    
    const currentItem = categoryItems[currentIndex];
    const previousItem = categoryItems[currentIndex - 1];
    
    // Swap weights directly in state (these are references to state objects)
    const tempWeight = currentItem.weight || 0;
    currentItem.weight = previousItem.weight || 0;
    previousItem.weight = tempWeight;
    
    console.log(`Swapped weights: ${currentItem.title} (${currentItem.weight}) ↔ ${previousItem.title} (${previousItem.weight})`);
    
    // Save both items as drafts WITH the new weights
    this.saveDraft({ ...currentItem, weight: currentItem.weight });
    this.saveDraft({ ...previousItem, weight: previousItem.weight });
    
    // Re-render to show the change
    this.renderMenuByCategory();
    this.showSuccess(`Moved "${currentItem.title}" up. Publish to save.`);
  },

  /**
   * Move menu item down within its category
   */
  async moveMenuItemDown(itemId, categoryName) {
    // Get all items in this category, sorted by weight
    const categoryItems = this.state.menuItems
      .filter(i => i.category === categoryName && !i._isDeleted)
      .sort((a, b) => (a.weight || 0) - (b.weight || 0));
    
    const currentIndex = categoryItems.findIndex(i => i.id === itemId);
    
    if (currentIndex >= categoryItems.length - 1) {
      this.showError('Item is already last in category');
      return;
    }
    
    const currentItem = categoryItems[currentIndex];
    const nextItem = categoryItems[currentIndex + 1];
    
    // Swap weights directly in state (these are references to state objects)
    const tempWeight = currentItem.weight || 0;
    currentItem.weight = nextItem.weight || 0;
    nextItem.weight = tempWeight;
    
    console.log(`Swapped weights: ${currentItem.title} (${currentItem.weight}) ↔ ${nextItem.title} (${nextItem.weight})`);
    
    // Save both items as drafts WITH the new weights
    this.saveDraft({ ...currentItem, weight: currentItem.weight });
    this.saveDraft({ ...nextItem, weight: nextItem.weight });
    
    // Re-render to show the change
    this.renderMenuByCategory();
    this.showSuccess(`Moved "${currentItem.title}" down. Publish to save.`);
  },

  /**
   * Move category up in order (decrease weight)
   */
  async moveCategoryUp(categoryName) {
    // Sort categories by weight
    const sorted = [...this.state.categories].sort((a, b) => a.weight - b.weight);
    const currentIndex = sorted.findIndex(c => c.name === categoryName);
    
    if (currentIndex <= 0) {
      this.showError(`"${categoryName}" is already first`);
      return;
    }
    
    const currentCat = sorted[currentIndex];
    const previousCat = sorted[currentIndex - 1];
    
    // Swap weights
    const tempWeight = currentCat.weight;
    currentCat.weight = previousCat.weight;
    previousCat.weight = tempWeight;
    
    // Save both categories as drafts
    await this.saveCategoryWeight(currentCat.name, currentCat.weight);
    await this.saveCategoryWeight(previousCat.name, previousCat.weight);
    
    // Re-render
    this.renderMenuByCategory();
    this.showSuccess(`Moved "${categoryName}" up. Publish to save order.`);
  },

  /**
   * Move category down in order (increase weight)
   */
  async moveCategoryDown(categoryName) {
    // Sort categories by weight
    const sorted = [...this.state.categories].sort((a, b) => a.weight - b.weight);
    const currentIndex = sorted.findIndex(c => c.name === categoryName);
    
    if (currentIndex >= sorted.length - 1) {
      this.showError(`"${categoryName}" is already last`);
      return;
    }
    
    const currentCat = sorted[currentIndex];
    const nextCat = sorted[currentIndex + 1];
    
    // Swap weights
    const tempWeight = currentCat.weight;
    currentCat.weight = nextCat.weight;
    nextCat.weight = tempWeight;
    
    // Save both categories as drafts
    await this.saveCategoryWeight(currentCat.name, currentCat.weight);
    await this.saveCategoryWeight(nextCat.name, nextCat.weight);
    
    // Re-render
    this.renderMenuByCategory();
    this.showSuccess(`Moved "${categoryName}" down. Publish to save order.`);
  },

  /**
   * Save category weight to draft
   */
  async saveCategoryWeight(categoryName, newWeight) {
    // Load existing category data
    const categoryPath = categoryName.toLowerCase();
    const possiblePaths = [
      `/${categoryPath}/index.json`,
      `/api/${categoryPath}/index.json`
    ];
    
    let existingData = {
      title: categoryName,
      icon: '',
      image: '',
      weight: newWeight,
      slidein: {},
      body: ''
    };
    
    // Try to fetch existing data
    for (const path of possiblePaths) {
      try {
        const response = await fetch(path);
        if (response.ok) {
          const data = await response.json();
          existingData = {
            title: data.title || categoryName,
            icon: data.icon || '',
            image: data.image || '',
            weight: newWeight, // Update weight
            slidein: data.slidein || {},
            body: data.body || ''
          };
          break;
        }
      } catch (error) {
        console.log(`Could not load ${path}`);
      }
    }
    
    // Save to draft
    const categoryData = {
      frontmatter: {
        title: existingData.title,
        weight: newWeight,
        icon: existingData.icon,
        image: existingData.image,
      },
      body: existingData.body
    };
    
    if (existingData.slidein && (existingData.slidein.slideinimage || existingData.slidein.direction)) {
      categoryData.frontmatter.slidein = existingData.slidein;
    }
    
    const draftKey = `ttmenus_draft_category_${categoryName}`;
    localStorage.setItem(draftKey, JSON.stringify(categoryData));
    this.markPendingChanges();
    
    console.log(`✅ Saved weight ${newWeight} for "${categoryName}"`);
  },

  /**
   * Discard all category changes (kept for compatibility, but now handled by discardCategoryLandingPage)
   */
  async discardCategoryChanges() {
    const confirmed = confirm('Discard all category changes?\n\nThis will discard all pending category edits.');
    if (!confirmed) return;
    
    // Remove all category drafts
    const categoryLandingDrafts = Object.keys(localStorage).filter(key => key.startsWith('ttmenus_draft_category_'));
    categoryLandingDrafts.forEach(key => localStorage.removeItem(key));
    
    // Clean up legacy menudata drafts
    localStorage.removeItem('ttmenus_draft_menudata');
    
    // Reload categories from published data
    await this.loadCategories();
    
    // Re-render menu
    this.renderMenuByCategory();
    
    // Update pending summary
    this.renderPendingSummary();
    this.checkPendingChanges();
    
    this.showSuccess('All category changes discarded');
  },

  /**
   * Discard category landing page changes
   */
  discardCategoryLandingPage(categoryName) {
    const confirmed = confirm(`Discard landing page changes for "${categoryName}"?`);
    if (!confirmed) return;
    
    const draftKey = `ttmenus_draft_category_${categoryName}`;
    localStorage.removeItem(draftKey);
    
    // Update pending summary
    this.renderPendingSummary();
    this.checkPendingChanges();
    
    this.showSuccess(`Landing page changes discarded for "${categoryName}"`);
  },

  /**
   * Save category changes to draft
   * Updates state only - all data saved to category _index.md
   */
  saveCategoryDraft(originalName, newName, iconUrl, weight = 0) {
    // Find and update the category in state
    const category = this.state.categories.find(c => c.name === originalName);
    if (!category) return;
    
    // Update category in state
    category.name = newName;
    category.icon = iconUrl;
    category.weight = weight;
    
    // If name changed, update all menu items with this category
    if (originalName !== newName) {
      this.state.menuItems.forEach(item => {
        if (item.category === originalName) {
          item.category = newName;
          // Mark item as draft to preserve the change
          this.saveDraft({
            ...item,
            category: newName
          });
        }
      });
    }
    
    // Re-render
    this.renderMenuByCategory();
    
    console.log(`✅ Category "${newName}" updated in state (icon will be saved with landing page)`);
  },

  /**
   * Save category landing page (_index.md) to draft
   * Includes icon, hero image, slide-in, weight, and body
   */
  async saveCategoryLandingPage(categoryName, landingData) {
    console.log(`Saving landing page for category: ${categoryName}`);
    
    // Build data structure for _index.md (frontmatter + body)
    const categoryData = {
      frontmatter: {
        title: categoryName,
        weight: landingData.weight || 0,
        icon: landingData.icon || '',  // Icon is now part of _index.md
        image: landingData.image || '',
      },
      body: landingData.body || ''
    };
    
    // Add slidein if provided
    if (landingData.slideImage || landingData.slideDirection) {
      categoryData.frontmatter.slidein = {};
      if (landingData.slideImage) {
        categoryData.frontmatter.slidein.slideinimage = landingData.slideImage;
      }
      if (landingData.slideDirection) {
        categoryData.frontmatter.slidein.direction = landingData.slideDirection;
      }
    }
    
    // Save to localStorage as draft
    const draftKey = `ttmenus_draft_category_${categoryName}`;
    localStorage.setItem(draftKey, JSON.stringify(categoryData));
    this.markPendingChanges();
    
    console.log('✅ Category landing page (with icon) saved to draft');
    this.showSuccess(`Category "${categoryName}" saved as draft. Publish to update.`);
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
      
      // Check if location is collapsed
      const isCollapsed = this.isLocationCollapsed(index);
      const position = index + 1;
      
      // Build opening hours timeline
      let hoursTimeline = '';
      if (loc.opening_hours && loc.opening_hours.mode) {
        if (loc.opening_hours.mode === 'AlwaysOpen') {
          hoursTimeline = `
            <div style="margin-top: 0.75rem; padding: 0.75rem; background: #f0fdf4; border-radius: 6px; border-left: 3px solid #22c55e;">
              <div style="font-size: 0.75rem; font-weight: 600; color: #374151; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.5px;">🕐 Opening Hours</div>
              <div style="font-size: 0.8rem; color: #16a34a; font-weight: 500;">24/7 Open</div>
            </div>
          `;
        } else if (loc.opening_hours.mode === 'AlwaysClosed') {
          hoursTimeline = `
            <div style="margin-top: 0.75rem; padding: 0.75rem; background: #fef2f2; border-radius: 6px; border-left: 3px solid #ef4444;">
              <div style="font-size: 0.75rem; font-weight: 600; color: #374151; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.5px;">🕐 Opening Hours</div>
              <div style="font-size: 0.8rem; color: #dc2626; font-weight: 500;">Closed</div>
            </div>
          `;
        } else {
          // Show hours for each day in visual timeline format
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
          const timelineRows = [];
          
          // First pass: detect cross-day blocks and store them
          const crossDayBlocks = {}; // day -> { openTime, closeTime }
          const nextDayContinuations = {}; // nextDay -> { closeTime } (for the overflow portion)
          
          console.log(`🔍 Checking for cross-day blocks in location "${loc.name}":`);
          days.forEach((day, dayIndex) => {
            const hours = loc.opening_hours[day];
            console.log(`  ${day}:`, hours);
            
            if (hours && hours.length > 0) {
              const sortedHours = [...hours].sort((a, b) => a.time.localeCompare(b.time));
              const lastEntry = sortedHours[sortedHours.length - 1];
              
              console.log(`    Last entry: ${lastEntry.type} ${lastEntry.time}`);
              
              // Check if this day ends with unpaired Open
              if (lastEntry.type === 'Open') {
                const nextDayIndex = (dayIndex + 1) % 7;
                const nextDay = days[nextDayIndex];
                const nextDayHours = loc.opening_hours[nextDay];
                
                console.log(`    Checking next day (${nextDay}):`, nextDayHours);
                
                if (nextDayHours && nextDayHours.length > 0) {
                  const nextSorted = [...nextDayHours].sort((a, b) => a.time.localeCompare(b.time));
                  console.log(`    Next day first entry: ${nextSorted[0].type} ${nextSorted[0].time}`);
                  
                  if (nextSorted[0].type === 'Close') {
                    // This is a cross-day block!
                    crossDayBlocks[day] = {
                      openTime: lastEntry.time,
                      closeTime: nextSorted[0].time
                    };
                    nextDayContinuations[nextDay] = {
                      closeTime: nextSorted[0].time
                    };
                    console.log(`    ✅ Cross-day block detected: ${day} ${lastEntry.time} → ${nextDay} ${nextSorted[0].time}`);
                  }
                }
              }
            }
          });
          
          // Second pass: render the timeline
          days.forEach((day, dayIndex) => {
            const hours = loc.opening_hours[day];
            console.log(`📋 Rendering ${day}:`, hours);
            
            // Pair up Open/Close times and create visual bars
            const bars = [];
            
            // Check if this day is a continuation from previous day (starts at midnight)
            if (nextDayContinuations[day]) {
              console.log(`  Has continuation from previous day:`, nextDayContinuations[day]);
              const continuation = nextDayContinuations[day];
              const [closeHour, closeMin] = continuation.closeTime.split(':').map(Number);
              
              const endDecimal = closeHour + (closeMin / 60);
              const width = (endDecimal / 24) * 100;
              
              const closeTime = this.formatTimeShort(continuation.closeTime);
              
              bars.push({
                left: 0,
                width: width,
                label: `12am-${closeTime}`,
                isContinuation: true
              });
            }
            
            if (hours && hours.length > 0) {
              // Sort hours by time chronologically
              const sortedHours = [...hours].sort((a, b) => a.time.localeCompare(b.time));
              
              // Check if this day has a cross-day block (ends with unpaired Open)
              if (crossDayBlocks[day]) {
                console.log(`  Has cross-day block:`, crossDayBlocks[day]);
                const cross = crossDayBlocks[day];
                const [openHour, openMin] = cross.openTime.split(':').map(Number);
                const [closeHour, closeMin] = cross.closeTime.split(':').map(Number);
                
                const startDecimal = openHour + (openMin / 60);
                const endDecimal = 24; // Cap at midnight on this day's row
                
                const left = (startDecimal / 24) * 100;
                const width = ((endDecimal - startDecimal) / 24) * 100;
                
                const openTime = this.formatTimeShort(cross.openTime);
                const closeTime = this.formatTimeShort(cross.closeTime);
                
                bars.push({
                  left: left,
                  width: width,
                  label: `${openTime}-${closeTime}`
                });
              }
              
              // Check if first entry is a Close (continuation from previous day) - skip it
              const skipFirstEntry = sortedHours[0].type === 'Close';
              console.log(`  Skip first entry: ${skipFirstEntry}, startIndex: ${skipFirstEntry ? 1 : 0}`);
              const startIndex = skipFirstEntry ? 1 : 0; // Skip first Close if it's a continuation
              
              for (let i = startIndex; i < sortedHours.length; i += 2) {
                if (i + 1 < sortedHours.length) {
                  const open = sortedHours[i];
                  const close = sortedHours[i + 1];
                  
                  if (open.type === 'Open' && close.type === 'Close') {
                    // Parse times to get decimal hours
                    const [openHour, openMin] = open.time.split(':').map(Number);
                    const [closeHour, closeMin] = close.time.split(':').map(Number);
                    
                    let startDecimal = openHour + (openMin / 60);
                    let endDecimal = closeHour + (closeMin / 60);
                    
                    // Handle next-day times (early morning hours after midnight)
                    if (endDecimal < startDecimal && closeHour < 12) {
                      endDecimal += 24;
                    }
                    
                    // Calculate position and width as percentage of 24 hours
                    const left = (startDecimal / 24) * 100;
                    const width = Math.min(((endDecimal - startDecimal) / 24) * 100, 100 - left); // Cap at 100%
                    
                    // Convert to readable format
                    const openTime = this.formatTimeShort(open.time);
                    const closeTime = this.formatTimeShort(close.time);
                    
                    bars.push({
                      left: left,
                      width: width,
                      label: `${openTime}-${closeTime}`
                    });
                  }
                }
              }
              
              console.log(`  Total bars for ${day}: ${bars.length}`, bars);
              
              if (bars.length > 0) {
                const barHtml = bars.map(bar => {
                  const gradient = bar.isContinuation 
                    ? 'linear-gradient(90deg, #60a5fa, #93c5fd)' // Lighter for continuation
                    : 'linear-gradient(90deg, #3b82f6, #60a5fa)'; // Normal
                  return `<div style="position: absolute; left: ${bar.left}%; width: ${bar.width}%; height: 100%; background: ${gradient}; border-radius: 3px;" title="${bar.label}"></div>`;
                }).join('');
                
                // Only show labels for non-continuation bars
                const labelHtml = bars.filter(bar => !bar.isContinuation).map(bar => bar.label).join(', ');
                
                timelineRows.push(`
                  <div style="display: grid; grid-template-columns: 45px 1fr 120px; gap: 8px; align-items: center; margin-bottom: 6px;">
                    <span style="font-weight: 600; color: #374151; font-size: 0.75rem;">${dayNames[day]}</span>
                    <div style="position: relative; height: 20px; background: #e5e7eb; border-radius: 3px;">
                      ${barHtml}
                    </div>
                    <span style="font-size: 0.7rem; color: #6b7280; text-align: right;">${labelHtml}</span>
                  </div>
                `);
                console.log(`  ✅ Added timeline row for ${day}`);
              } else {
                console.log(`  ⚠️ Skipping ${day} - no bars to display`);
              }
            }
          });
          
          if (timelineRows.length > 0) {
            hoursTimeline = `
              <div style="margin-top: 0.75rem; padding: 0.75rem; background: #f8fafc; border-radius: 6px; border-left: 3px solid #3b82f6;">
                <div style="font-size: 0.75rem; font-weight: 600; color: #374151; margin-bottom: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px;">🕐 Opening Hours</div>
                ${timelineRows.join('')}
              </div>
            `;
          }
        }
      }
      
      // Build delivery links
      const deliveryLinks = [];
      if (loc.delivery?.fooddrop) {
        deliveryLinks.push('🚚 FoodDrop');
      }
      
      return `
        <div class="${cardClasses.join(' ')}" data-location-index="${index}">
          <div class="menu-item-header" onclick="UpdateUI.toggleLocation(${index})" style="cursor: pointer;">
            <h3 class="menu-item-title ${loc._isDeleted ? 'deleted' : ''}">${this.escapeHtml(loc.city)}${draftBadge}${newBadge}${deletedBadge}</h3>
            <span class="menu-item-position" style="display: flex; align-items: center; gap: 6px;">
              <span style="color: #6b7280; font-size: 0.875rem;">#${position}</span>
              <button class="btn-collapse-location" onclick="event.stopPropagation(); UpdateUI.toggleLocation(${index})" style="background: none; border: none; font-size: 0.875rem; cursor: pointer; padding: 0 4px; color: #6b7280; min-width: 20px;">
                ${isCollapsed ? '►' : '▼'}
              </button>
            </span>
          </div>
          
          <div class="location-details" style="display: ${isCollapsed ? 'none' : 'block'};">
          <p class="menu-item-description">
            📍 ${this.escapeHtml(loc.address)}, ${this.escapeHtml(loc.island)}
          </p>
          
          <div class="menu-item-price-row">
            ${loc.phone ? `<span style="font-size: 0.875rem;">📞 ${this.escapeHtml(loc.phone)}</span>` : ''}
              ${loc.whatsapp ? `<span style="font-size: 0.875rem; margin-left: 1rem;">💬 ${this.escapeHtml(loc.whatsapp)}</span>` : ''}
          </div>
          
          <div class="menu-item-tags">
            ${loc.subcategories?.map(cat => `<span class="badge badge-primary">${this.escapeHtml(cat)}</span>`).join('') || ''}
            ${loc.orderingtables?.map(table => `<span class="badge badge-info">${this.escapeHtml(table)}</span>`).join('') || ''}
            ${deliveryLinks.length > 0 ? `<span class="badge badge-warning">${deliveryLinks.join(' ')}</span>` : ''}
          </div>
          
          ${hoursTimeline}
          
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

    // Show the floating preview button
    this.showPreviewToggleButton();

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

    const colorGroupsHTML = Object.entries(grouped)
      .filter(([_, items]) => items.length > 0)
      .map(([category, items]) => {
        const isCollapsed = this.isColorSectionCollapsed(category);
        const categoryId = category.replace(/\s+/g, '-').toLowerCase();
        
        return `
          <div class="color-section category-section" data-color-section="${this.escapeHtml(category)}" style="margin-bottom: 2rem;">
            <div class="category-header" onclick="UpdateUI.toggleColorSection('${this.escapeHtml(category)}')" style="cursor: pointer;">
              <div class="category-header-left">
                <div>
                  <h3 class="category-title">${category}</h3>
                  <p class="category-info">
                    ${items.length} color${items.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <div class="category-actions" onclick="event.stopPropagation();">
                <button class="btn-collapse" onclick="event.stopPropagation(); UpdateUI.toggleColorSection('${this.escapeHtml(category)}')" style="background: rgba(255, 255, 255, 0.2); border: 1px solid rgba(255, 255, 255, 0.3); font-size: 0.875rem; cursor: pointer; padding: 0.375rem 0.75rem; border-radius: 4px; color: white; min-width: 36px;">
                  ${isCollapsed ? '►' : '▼'}
                </button>
              </div>
            </div>
            
            <div class="color-section-content" style="display: ${isCollapsed ? 'none' : 'block'}; padding-top: 1rem;">
              ${items.join('')}
            </div>
          </div>
        `;
      }).join('');
    
    container.innerHTML = colorGroupsHTML;
  },
  
  /**
   * Check if color section is collapsed
   */
  isColorSectionCollapsed(sectionName) {
    const collapsedSections = JSON.parse(localStorage.getItem('ttmenus_collapsed_color_sections') || '[]');
    return collapsedSections.includes(sectionName);
  },
  
  /**
   * Toggle color section collapse state
   */
  toggleColorSection(sectionName) {
    const collapsedSections = JSON.parse(localStorage.getItem('ttmenus_collapsed_color_sections') || '[]');
    const index = collapsedSections.indexOf(sectionName);
    
    if (index > -1) {
      collapsedSections.splice(index, 1);
    } else {
      collapsedSections.push(sectionName);
    }
    
    localStorage.setItem('ttmenus_collapsed_color_sections', JSON.stringify(collapsedSections));
    
    // Update UI
    const colorSection = document.querySelector(`.color-section[data-color-section="${this.escapeHtml(sectionName)}"]`);
    if (colorSection) {
      const contentDiv = colorSection.querySelector('.color-section-content');
      const collapseBtn = colorSection.querySelector('.btn-collapse');
      
      if (contentDiv) {
        const isNowCollapsed = contentDiv.style.display === 'none';
        contentDiv.style.display = isNowCollapsed ? 'block' : 'none';
        if (collapseBtn) {
          collapseBtn.textContent = isNowCollapsed ? '▼' : '►';
        }
      }
    }
  },
  
  /**
   * Show/hide preview toggle button
   */
  showPreviewToggleButton() {
    let button = document.getElementById('previewToggleBtn');
    
    if (!button) {
      button = document.createElement('button');
      button.id = 'previewToggleBtn';
      button.innerHTML = '👁️ Preview';
      button.className = 'preview-toggle-btn';
      button.onclick = () => this.togglePreviewOverlay();
      document.body.appendChild(button);
    }
    
    button.style.display = 'flex';
  },
  
  /**
   * Hide preview toggle button
   */
  hidePreviewToggleButton() {
    const button = document.getElementById('previewToggleBtn');
    if (button) {
      button.style.display = 'none';
    }
  },
  
  /**
   * Toggle preview overlay
   */
  togglePreviewOverlay() {
    let overlay = document.getElementById('previewOverlay');
    
    if (!overlay) {
      this.createPreviewOverlay();
      overlay = document.getElementById('previewOverlay');
    }
    
    const isVisible = overlay.style.display !== 'none';
    
    if (isVisible) {
      overlay.style.display = 'none';
      const button = document.getElementById('previewToggleBtn');
      if (button) button.innerHTML = '👁️ Preview';
    } else {
      overlay.style.display = 'flex';
      const button = document.getElementById('previewToggleBtn');
      if (button) button.innerHTML = '✖️ Close';
      
      // Setup iframe if not already done
      setTimeout(() => {
        this.setupColorPreview();
      }, 100);
    }
  },
  
  /**
   * Create preview overlay
   */
  createPreviewOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'previewOverlay';
    overlay.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      width: calc(-40px + 100vw);
      height: calc(-40px + 100dvh);
      background: white;
      border-radius: 12px;
      box-shadow: rgba(0, 0, 0, 0.3) 0px 8px 32px;
      z-index: 9999;
      display: none;
      flex-direction: column;
      overflow: hidden; 
    `;
    
    overlay.innerHTML = `
      <div style="padding: .4rem; background: linear-gradient(135deg, #5a6996 0%, #2b3140 100%); color: white; display: flex; justify-content: space-between; align-items: center;">
        <h3 style="margin: 0; font-size: 1rem; font-weight: 600;">🎨 Live Preview</h3>
        <div style="display: flex; gap: 0.5rem;">
          <button onclick="UpdateUI.refreshPreview()" style="background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); color: white; padding: 0.25rem 0.5rem; border-radius: 4px; cursor: pointer; font-size: 0.875rem;">🔄</button>
          <button onclick="UpdateUI.openPreviewFullscreen()" style="background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); color: white; padding: 0.25rem 0.5rem; border-radius: 4px; cursor: pointer; font-size: 0.875rem;">⛶</button>
          <button onclick="UpdateUI.togglePreviewOverlay()" style="background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); color: white; padding: 0.25rem 0.5rem; border-radius: 4px; cursor: pointer; font-size: 0.875rem;">✖️</button>
        </div>
      </div>
      <div style="flex: 1; overflow: hidden; background: #f3f4f6;">
        <iframe id="colorPreviewFrame" src="/" style="width: 100%; height: 100%; border: none; display: block;"></iframe>
      </div>
      <div style="padding: 0.75rem; background: #f9fafb; border-top: 1px solid #e5e7eb; font-size: 0.75rem; color: #6b7280;">
        💡 Changes update in real-time. Drag to reposition.
      </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Make it draggable
    this.makePreviewDraggable(overlay);
  },
  
  /**
   * Make preview overlay draggable
   */
  makePreviewDraggable(overlay) {
    const header = overlay.querySelector('div');
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    
    header.style.cursor = 'move';
    
    header.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      
      isDragging = true;
      initialX = e.clientX - overlay.offsetLeft;
      initialY = e.clientY - overlay.offsetTop;
    });
    
    document.addEventListener('mousemove', (e) => {
      if (isDragging) {
        e.preventDefault();
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;
        
        overlay.style.left = currentX + 'px';
        overlay.style.top = currentY + 'px';
        overlay.style.right = 'auto';
      }
    });
    
    document.addEventListener('mouseup', () => {
      isDragging = false;
    });
  },
  
  /**
   * Setup color preview iframe
   */
  setupColorPreview() {
    const iframe = document.getElementById('colorPreviewFrame');
    if (!iframe) return;
    
    iframe.onload = () => {
      this.updatePreviewColors();
    };
  },
  
  /**
   * Update preview iframe colors
   */
  updatePreviewColors() {
    const iframe = document.getElementById('colorPreviewFrame');
    if (!iframe || !iframe.contentDocument) return;
    
    try {
      const iframeDoc = iframe.contentDocument;
      let styleTag = iframeDoc.getElementById('dashboard-color-override');
      
      if (!styleTag) {
        styleTag = iframeDoc.createElement('style');
        styleTag.id = 'dashboard-color-override';
        iframeDoc.head.appendChild(styleTag);
      }
      
      // Build CSS from current colors
      const colorVars = Object.entries(this.state.colors)
        .map(([key, value]) => `${key}: ${value};`)
        .join('\n  ');
      
      styleTag.textContent = `:root {\n  ${colorVars}\n}`;
      
      console.log('✅ Preview colors updated');
    } catch (error) {
      console.error('Failed to update preview colors:', error);
    }
  },
  
  /**
   * Refresh preview iframe
   */
  refreshPreview() {
    const iframe = document.getElementById('colorPreviewFrame');
    if (iframe) {
      iframe.src = iframe.src;
      this.showSuccess('Preview refreshed');
    }
  },
  
  /**
   * Open preview in fullscreen
   */
  openPreviewFullscreen() {
    window.open('/', '_blank');
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
    
    // Save to state
    this.state.colors[varName] = finalColor;
    
    // Save draft
    this.saveDraftColor(varName, finalColor);
    
    // Update preview in real-time
    this.updatePreviewColors();
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
    
    // Save to state
    this.state.colors[varName] = value;
    
    // Save draft
    this.saveDraftColor(varName, value);
    
    // Update preview in real-time
    this.updatePreviewColors();
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
    
    const confirmed = confirm(`Discard ALL ${totalCount} pending changes?\n\nThis will:\n- Remove all draft menu items and categories\n- Remove all draft advertisements\n- Remove all draft locations\n- Reset home page and site settings\n- Reset all colors, config, and manifest changes\n- Reset all branding changes\n- Clear all collapsed states\n\nThis action cannot be undone!`);
    
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
      localStorage.removeItem(this.storageKeys.draftHomePage);
      
      // Clear category landing page drafts
      const categoryLandingDrafts = Object.keys(localStorage).filter(key => key.startsWith('ttmenus_draft_category_'));
      categoryLandingDrafts.forEach(key => localStorage.removeItem(key));
      
      // Clear any legacy menudata drafts
      localStorage.removeItem('ttmenus_draft_menudata');
      
      // Clear collapsed states
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('ttmenus_collapsed_')) {
          localStorage.removeItem(key);
        }
      });
      
      this.showSuccess('All pending changes discarded');
      
      // Reload all data
      await this.loadMenuItems();
      await this.loadAdvertisements();
      await this.loadLocations();
      await this.loadBrandingImages();
      await this.loadColors();
      
      // Reload manifest, config, and homepage if needed
      if (typeof HomePageManager !== 'undefined') {
        if (HomePageManager.loadManifestSettings) {
          await HomePageManager.loadManifestSettings();
          HomePageManager.populateManifestForm();
        }
        if (HomePageManager.loadCurrentSettings) {
          await HomePageManager.loadCurrentSettings();
          await HomePageManager.loadSiteSettings();
          HomePageManager.populateForm();
          HomePageManager.populateSiteSettingsForm();
        }
      }
      
      // Recheck pending changes
      this.checkPendingChanges();
      
      // Re-render pending summary
      this.renderPendingSummary();
      
      // Update all tab action buttons
      this.updateTabActionButtons();
      
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
    
    // Category Landing Pages (now includes icons + all category data)
    const categoryLandingDrafts = Object.keys(localStorage).filter(key => key.startsWith('ttmenus_draft_category_'));
    if (categoryLandingDrafts.length > 0) {
      html += `
        <div class="detail-section">
          <h3 class="detail-section-title">📂 Categories (${categoryLandingDrafts.length})</h3>
          <div class="pending-changes-grid">
            ${categoryLandingDrafts.map(draftKey => {
              const categoryName = draftKey.replace('ttmenus_draft_category_', '');
              const data = JSON.parse(localStorage.getItem(draftKey));
              
              // Support both old format (just frontmatter) and new format (frontmatter + body)
              const frontmatter = data.frontmatter || data;
              const body = data.body || '';
              
              return `
                <div class="pending-change-card">
                  <div class="pending-change-info">
                    <strong>${this.escapeHtml(categoryName)}</strong>
                    <div class="pending-change-status">
                      <span class="status-edited">MODIFIED</span>
                    </div>
                    <div style="font-size: 0.75rem; color: #6b7280; margin-top: 4px;">
                      ${frontmatter.weight !== undefined ? `📊 Order: #${frontmatter.weight}` : ''}
                      ${frontmatter.icon ? `<br>🎨 Icon updated` : ''}
                      ${frontmatter.image ? `<br>🖼️ Hero: ${frontmatter.image.split('/').pop()}` : ''}
                      ${frontmatter.slidein?.slideinimage ? `<br>✨ Slide: ${frontmatter.slidein.slideinimage.split('/').pop()}` : ''}
                      ${body ? `<br>📝 Description (${body.length} chars)` : ''}
                    </div>
                  </div>
                  <button class="btn btn-sm btn-secondary" onclick="UpdateUI.discardCategoryLandingPage('${this.escapeHtml(categoryName)}')">Discard</button>
                </div>
              `;
            }).join('')}
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
    
    // Home Page
    const draftHomePage = localStorage.getItem(this.storageKeys.draftHomePage);
    if (draftHomePage) {
      try {
        const homeData = JSON.parse(draftHomePage);
        html += `
          <div class="detail-section">
            <h3 class="detail-section-title">🏠 Home Page & Site Settings</h3>
            <div class="pending-change-card">
              <div class="pending-change-info">
                <strong>Home Page Updates</strong>
                <div class="pending-change-status">
                  Hero image, galleries, and site settings modified
                </div>
                <div style="font-size: 0.75rem; color: #6b7280; margin-top: 0.25rem;">
                  Last updated: ${new Date(homeData.timestamp).toLocaleString()}
                </div>
              </div>
              <button class="btn btn-sm btn-secondary" onclick="discardHomePageDraft()">Discard</button>
            </div>
          </div>
        `;
      } catch (e) {
        console.error('Error parsing home page draft:', e);
      }
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
    
    // Count homepage (count as 1 if any homepage changes)
    const draftHomePage = localStorage.getItem(this.storageKeys.draftHomePage);
    if (draftHomePage) {
      count += 1;
    }
    
    // Count category landing pages (includes icons, images, and all category data)
    const categoryLandingDrafts = Object.keys(localStorage).filter(key => key.startsWith('ttmenus_draft_category_'));
    count += categoryLandingDrafts.length;
    
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
      // Generate session ID for batch operations
      const sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      console.log(`📦 Starting batch publish with session: ${sessionId}`);
      
      let successCount = 0;
      let failCount = 0;
      let successItems = [];
      let failedItems = [];
      
      // Publish menu items (batch mode - no individual alerts)
      const draftItems = this.getDrafts();
      for (const item of Object.values(draftItems)) {
        try {
          await this.publishItemSilent(item.id, false, sessionId); // Pass sessionId
          successCount++;
          const action = item._isDeleted ? '🗑️' : (item._isNew ? '➕' : '📝');
          
          // Check if item has pending image uploads
          const hasPendingImages = sessionStorage.getItem(`pending_uploads_${item.id}`);
          const imageIcon = hasPendingImages ? ' 📸' : '';
          
          successItems.push(`${action} ${item.title}${imageIcon}`);
        } catch (error) {
          failCount++;
          failedItems.push(`❌ ${item.title}: ${error.message}`);
          console.error('Failed to publish item:', item.id, error);
        }
      }
      
      // Publish ads
      const draftAdsJson = localStorage.getItem(this.storageKeys.draftAds);
      if (draftAdsJson) {
        const draftAds = JSON.parse(draftAdsJson);
        for (const ad of Object.values(draftAds)) {
          try {
            await this.publishAdSilent(ad.id, false);
            successCount++;
            const action = ad._isDeleted ? '🗑️' : (ad._isNew ? '➕' : '📝');
            successItems.push(`${action} Ad: ${ad.title}`);
          } catch (error) {
            failCount++;
            failedItems.push(`❌ Ad: ${ad.title}: ${error.message}`);
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
            await this.publishLocationSilent(loc._index, false);
            successCount++;
            const action = loc._isDeleted ? '🗑️' : (loc._isNew ? '➕' : '📝');
            successItems.push(`${action} Location: ${loc.city}`);
          } catch (error) {
            failCount++;
            failedItems.push(`❌ Location: ${loc.city}: ${error.message}`);
            console.error('Failed to publish location:', loc._index, error);
          }
        }
      }
      
      // Publish home page and site settings
      const draftHomePageJson = localStorage.getItem(this.storageKeys.draftHomePage);
      if (draftHomePageJson) {
        try {
          const success = await HomePageManager.publishDraft();
          if (success) {
            successCount++;
            successItems.push('🏠 Home Page & Site Settings');
          } else {
            failCount++;
            failedItems.push('❌ Home Page: Failed to publish');
          }
        } catch (error) {
          failCount++;
          failedItems.push(`❌ Home Page: ${error.message}`);
          console.error('Failed to publish home page:', error);
        }
      }
      
      // Publish category landing pages
      const categoryLandingDrafts = Object.keys(localStorage).filter(key => key.startsWith('ttmenus_draft_category_'));
      for (const draftKey of categoryLandingDrafts) {
        const categoryName = draftKey.replace('ttmenus_draft_category_', '');
        const categoryData = JSON.parse(localStorage.getItem(draftKey));
        
        console.log(`⚠️ Category "${categoryName}" landing page draft found - API endpoint not yet implemented`);
        console.log(`ℹ️ Category data (for manual update to content/${categoryName}/_index.md):`, categoryData);
        
        // Generate the actual file content for manual copy
        const frontmatter = categoryData.frontmatter || {};
        const body = categoryData.body || '';
        
        const fileContent = `---
title: "${categoryName}"
weight: ${frontmatter.weight || 0}
icon: "${frontmatter.icon || ''}"
image: "${frontmatter.image || ''}"${frontmatter.slidein ? `
slidein:
  slideinimage: "${frontmatter.slidein.slideinimage || ''}"
  direction: "${frontmatter.slidein.direction || ''}"` : ''}
---

${body}`;
        
        console.log(`📄 File content for content/${categoryName}/_index.md:\n`, fileContent);
        
        // Mark as "published" locally (remove from drafts)
        localStorage.removeItem(draftKey);
        successCount++;
        successItems.push(`📄 Category "${categoryName}" (stored locally - run 'hugo' to apply)`);
      }
      
      // Now trigger single git push for all changes with sessionId
      if (successCount > 0) {
        try {
          const user = AuthClient.getCurrentUser();
          const username = user?.email || user?.username || 'Unknown User';
          
          await this.triggerBatchCommit(username, successCount, sessionId);
        } catch (error) {
          console.error('Git push failed:', error);
          // Don't fail the whole operation, changes are saved
        }
      }
      
      // Check if we published any category landing pages
      const hasCategoryDrafts = categoryLandingDrafts.length > 0;
      
      // Show single summary alert
      if (successCount > 0 && failCount === 0) {
        let message = `🎉 Successfully published ${successCount} change${successCount !== 1 ? 's' : ''}!\n\n` +
          `${successItems.slice(0, 5).join('\n')}${successItems.length > 5 ? `\n... and ${successItems.length - 5} more` : ''}`;
        
        if (hasCategoryDrafts) {
          message += `\n\n📝 Note: Category changes are stored locally.\nTo apply them, manually update the category _index.md files\nor run 'hugo' to rebuild the site.`;
        } else {
          message += `\n\n🚀 Changes pushed to GitHub. Netlify will rebuild in ~2 minutes.`;
        }
        
        this.showSuccess(message);
      } else if (successCount > 0 && failCount > 0) {
        this.showSuccess(
          `⚠️ Published ${successCount} of ${totalCount} changes\n\n` +
          `Success:\n${successItems.slice(0, 3).join('\n')}\n\n` +
          `Failed:\n${failedItems.slice(0, 3).join('\n')}`
        );
      } else if (failCount > 0) {
        this.showError(
          `❌ Failed to publish all ${failCount} change${failCount !== 1 ? 's' : ''}\n\n` +
          `${failedItems.slice(0, 5).join('\n')}`
        );
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
   * Trigger batch git commit after all changes
   */
  async triggerBatchCommit(username, changeCount, sessionId) {
    try {
      console.log(`📦 Triggering batch commit for session: ${sessionId}`);
      
      const response = await this.authenticatedFetch(
        `${this.apiConfig.getClientUrl()}/git/commit`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `Published ${changeCount} change${changeCount !== 1 ? 's' : ''} by ${username}`,
            author: username,
            sessionId: sessionId  // Pass sessionId to backend
          }),
        }
      );
      
      if (response.ok) {
        const result = await response.json();
        console.log('✅ Batch git commit successful:', result);
        return result;
      } else {
        const errorText = await response.text();
        console.error('Batch commit failed:', errorText);
        throw new Error('Git commit failed');
      }
    } catch (error) {
      console.error('Batch commit error:', error);
      throw error;
    }
  },

  /**
   * Publish item without showing alert (for batch operations)
   */
  async publishItemSilent(itemId, pushGit = true, sessionId = null) {
    const drafts = this.getDrafts();
    const item = drafts[itemId];
    
    if (!item) {
      throw new Error('Draft not found');
    }

    // Handle deletions separately
    if (item._isDeleted) {
      // Build the proper itemId for deletion
      let apiItemId = itemId;
      
      if (item.url) {
        // Has URL - convert it
        apiItemId = this.convertUrlToItemId(item.url, item.category);
        console.log(`🗑️ DELETE: Converting URL "${item.url}" → "${apiItemId}"`);
      } else if (item.category && item.title) {
        // No URL but has category/title - build it manually
        // Convert title to filename format
        const filename = item.title.toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '');
        apiItemId = `${item.category}/${filename}`;
        console.log(`🗑️ DELETE: Built ID from category+title → "${apiItemId}"`);
      } else {
        console.error('❌ DELETE: Cannot determine item ID. Item data:', item);
        throw new Error(`Cannot delete: missing URL and category/title information`);
      }
      
      // Build URL with sessionId if provided
      const sessionParam = sessionId ? `&sessionId=${encodeURIComponent(sessionId)}` : '';
      const url = `${this.apiConfig.getClientUrl()}${this.apiConfig.endpoints.content}?itemId=${encodeURIComponent(apiItemId)}&batch=true&pushGit=${pushGit}${sessionParam}`;
      
      console.log(`🗑️ DELETE request to: ${url}`);
      
      const response = await this.authenticatedFetch(url, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        this.clearDraft(itemId);
        // Clean up any pending uploads
        sessionStorage.removeItem(`pending_uploads_${itemId}`);
        sessionStorage.removeItem(`image_previews_${itemId}`);
        await this.loadMenuItems();
        return await response.json();
      } else {
        const text = await response.text();
        let errorMessage = 'Failed to delete item';
        try {
          const errorData = JSON.parse(text);
          errorMessage = errorData.error || errorMessage;
        } catch (parseErr) {
          errorMessage = `Server error (${response.status})`;
        }
        console.error(`❌ DELETE failed for "${item.title}":`, errorMessage);
        throw new Error(errorMessage);
      }
    }

    // Check for pending image uploads
    const pendingUploadsJson = sessionStorage.getItem(`pending_uploads_${itemId}`);
    const imagePreviewsJson = sessionStorage.getItem(`image_previews_${itemId}`);
    
    if (pendingUploadsJson && imagePreviewsJson) {
      try {
        const pendingPaths = JSON.parse(pendingUploadsJson);
        const imagePreviews = JSON.parse(imagePreviewsJson);
        
        // Upload images first with batch=true&pushGit=false (don't push yet!)
        for (const imagePath of pendingPaths) {
          const dataUrl = imagePreviews[imagePath];
          if (dataUrl) {
            console.log(`📤 Uploading image (batch mode, session: ${sessionId}): ${imagePath}`);
            await this.uploadImageFromDataUrl(dataUrl, imagePath, false, sessionId); // Pass sessionId
          }
        }
        
        // Clean up after successful upload
        sessionStorage.removeItem(`pending_uploads_${itemId}`);
        sessionStorage.removeItem(`image_previews_${itemId}`);
      } catch (uploadError) {
        console.error('Image upload failed:', uploadError);
        // Continue with item creation even if image upload fails
      }
    }

    // Handle create/update
    const method = item._isNew ? 'POST' : 'PUT';
    
    let apiItemId = itemId;
    if (!item._isNew && item.url) {
      apiItemId = this.convertUrlToItemId(item.url, item.category);
    }
    
    // Build URL with sessionId if provided
    const sessionParam = sessionId ? `&sessionId=${encodeURIComponent(sessionId)}` : '';
    const url = item._isNew
      ? `${this.apiConfig.getClientUrl()}${this.apiConfig.endpoints.content}?batch=true&pushGit=${pushGit}${sessionParam}`
      : `${this.apiConfig.getClientUrl()}${this.apiConfig.endpoints.content}?itemId=${encodeURIComponent(apiItemId)}&batch=true&pushGit=${pushGit}${sessionParam}`;

    const response = await this.authenticatedFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });

    if (response.ok) {
      this.clearDraft(itemId);
      await this.loadMenuItems();
      return await response.json();
    } else {
      const text = await response.text();
      let errorMessage = 'Failed to publish item';
      try {
        const errorData = JSON.parse(text);
        errorMessage = errorData.error || errorMessage;
      } catch (parseErr) {
        errorMessage = `Server error (${response.status})`;
      }
      throw new Error(errorMessage);
    }
  },

  /**
   * Upload image from data URL to server
   * @param {string} dataUrl - Base64 data URL of the image
   * @param {string} targetPath - Destination path (e.g., "images/icon.webp")
   * @param {boolean} pushGit - Whether to push to git immediately (false for batch)
   * @param {string} sessionId - Batch session ID (for combining commits)
   */
  async uploadImageFromDataUrl(dataUrl, targetPath, pushGit = true, sessionId = null) {
    // Convert data URL to blob
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    
    // Create FormData for upload
    const formData = new FormData();
    const filename = targetPath.split('/').pop();
    formData.append('file', blob, filename);
    formData.append('path', targetPath);
    
    // Upload to branding/upload endpoint with batch mode and sessionId support
    const sessionParam = sessionId ? `&sessionId=${encodeURIComponent(sessionId)}` : '';
    const url = pushGit 
      ? `${this.apiConfig.getClientUrl()}${this.apiConfig.endpoints.branding}`
      : `${this.apiConfig.getClientUrl()}${this.apiConfig.endpoints.branding}?batch=true&pushGit=false${sessionParam}`;
    
    console.log(`📤 Uploading to: ${url}, pushGit=${pushGit}, sessionId=${sessionId}`);
    
    const uploadResponse = await this.authenticatedFetch(url, {
      method: 'POST',
      body: formData,
    });
    
    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error(`Upload failed for ${filename}:`, errorText);
      throw new Error(`Failed to upload ${filename}`);
    }
    
    return await uploadResponse.json();
  },

  /**
   * Publish ad without showing alert (for batch operations)
   */
  async publishAdSilent(adId, pushGit = true) {
    const draftsJson = localStorage.getItem(this.storageKeys.draftAds) || '{}';
    const drafts = JSON.parse(draftsJson);
    const ad = drafts[adId];
    
    if (!ad) {
      throw new Error('Draft not found');
    }
    
    // Handle deletions separately
    if (ad._isDeleted) {
      const url = `${this.apiConfig.getClientUrl()}/advertisements/${adId}?batch=true&pushGit=${pushGit}`;
      
      const response = await this.authenticatedFetch(url, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (response.ok) {
        this.clearDraftAd(adId);
        await this.loadAdvertisements();
        return await response.json();
      } else {
        throw new Error('Failed to delete ad');
      }
    }
    
    // Handle create/update
    const method = ad._isNew ? 'POST' : 'PUT';
    const url = ad._isNew
      ? `${this.apiConfig.getClientUrl()}/advertisements?batch=true&pushGit=${pushGit}`
      : `${this.apiConfig.getClientUrl()}/advertisements/${adId}?batch=true&pushGit=${pushGit}`;
    
    const response = await this.authenticatedFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ad),
    });
    
    if (response.ok) {
      this.clearDraftAd(adId);
      await this.loadAdvertisements();
      return await response.json();
    } else {
      throw new Error('Failed to publish ad');
    }
  },

  /**
   * Publish location without showing alert (for batch operations)
   */
  async publishLocationSilent(index, pushGit = true) {
    const loc = this.state.locations[index];
    if (!loc) {
      throw new Error('Location not found');
    }
    
    // Handle deletions separately
    if (loc._isDeleted) {
      const response = await this.authenticatedFetch(
        `${this.apiConfig.getClientUrl()}${this.apiConfig.endpoints.locations}/${index}?batch=true&pushGit=${pushGit}`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
        }
      );
      
      if (response.ok) {
        this.clearDraftLocation(index);
        await this.loadLocations();
        return await response.json();
      } else {
        throw new Error('Failed to delete location');
      }
    }
    
    // Handle create/update
    const response = await this.authenticatedFetch(
      `${this.apiConfig.getClientUrl()}${this.apiConfig.endpoints.locations}?batch=true&pushGit=${pushGit}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loc),
      }
    );
    
    if (response.ok) {
      this.clearDraftLocation(index);
      await this.loadLocations();
      return await response.json();
    } else {
      throw new Error('Failed to publish location');
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
  
  // Format HH:MM time to readable 12-hour format
  formatTimeShort(time) {
    if (!time) return '';
    
    const [hourStr, minStr] = time.split(':');
    const hour = parseInt(hourStr);
    const min = parseInt(minStr) || 0;
    
    let displayHour = hour;
    let period = 'am';
    
    if (hour === 0) {
      displayHour = 12;
    } else if (hour === 12) {
      displayHour = 12;
      period = 'pm';
    } else if (hour > 12) {
      displayHour = hour - 12;
      period = 'pm';
    }
    
    // Only show minutes if not :00
    if (min === 0) {
      return `${displayHour}${period}`;
    } else {
      return `${displayHour}:${String(min).padStart(2, '0')}${period}`;
    }
  },

  /**
   * Helper: Normalize image path for display (add leading / if needed)
   * Also checks for pending image uploads stored in sessionStorage
   */
  getDisplayImagePath(path, itemId = null) {
    if (!path) return '';
    
    // Check if this is a pending upload (has data URL in sessionStorage)
    if (itemId) {
      // Try to get the preview data URL
      const previewsJson = sessionStorage.getItem(`image_previews_${itemId}`);
      console.log(`Checking image previews for ${itemId}, path: ${path}`);
      console.log(`Session key: image_previews_${itemId}`, previewsJson ? 'FOUND' : 'NOT FOUND');
      
      if (previewsJson) {
        try {
          const previews = JSON.parse(previewsJson);
          console.log('Image previews object:', previews);
          
          if (previews[path]) {
            console.log(`✅ Using data URL preview for: ${path}`);
            return previews[path]; // Return data URL for preview
          }
        } catch (e) {
          console.error('Error parsing image previews:', e);
        }
      }
    }
    
    // Normal path handling
    // Check if it's already an absolute URL (http:// or https://)
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path; // Return as-is for external URLs
    }
    
    // Add leading slash for local paths
    const finalPath = path.startsWith('/') ? path : '/' + path;
    console.log(`Using normal path: ${finalPath}`);
    return finalPath;
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
    // Set duration FIRST (before using it)
    const duration = 6000; // 6 seconds for all messages
    
    // Get or create notification container (stacked toasts)
    let notificationContainer = document.getElementById('notification-container');
    if (!notificationContainer) {
      notificationContainer = document.createElement('div');
      notificationContainer.id = 'notification-container';
      notificationContainer.style.cssText = `
        position: fixed;
        top: 4rem;
        right: 10px;
        left: 10px;
        z-index: 9999;
        max-width: 500px;
        margin-left: auto;
        display: flex;
        flex-direction: column;
        gap: 10px;
      `;
      document.body.appendChild(notificationContainer);
    }

    // Map type to colors (Bootstrap-like but custom)
    const typeColors = {
      success: { bg: '#d1e7dd', border: '#badbcc', text: '#0f5132' },
      error: { bg: '#f8d7da', border: '#f5c2c7', text: '#842029' },
      danger: { bg: '#f8d7da', border: '#f5c2c7', text: '#842029' },
      warning: { bg: '#fff3cd', border: '#ffecb5', text: '#664d03' },
      info: { bg: '#cff4fc', border: '#b6effb', text: '#055160' }
    };
    const colors = typeColors[type] || typeColors.info;

    // Create notification toast (NO Bootstrap JS interference)
    const notification = document.createElement('div');
    notification.style.cssText = `
      margin: 0;
      padding: 12px 45px 12px 15px;
      border: 1px solid ${colors.border};
      border-radius: 4px;
      background-color: ${colors.bg};
      color: ${colors.text};
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      animation: slideInRight 0.3s ease-out;
      position: relative;
      min-width: 250px;
    `;
    
    // Support multi-line messages
    const formattedMessage = message.replace(/\n/g, '<br>');
    
    // Close button (custom, no Bootstrap)
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;';
    closeBtn.style.cssText = `
      position: absolute;
      top: 8px;
      right: 10px;
      background: transparent;
      border: none;
      font-size: 24px;
      line-height: 1;
      color: ${colors.text};
      cursor: pointer;
      padding: 0;
      width: 24px;
      height: 24px;
      opacity: 0.5;
    `;
    closeBtn.onmouseover = () => closeBtn.style.opacity = '1';
    closeBtn.onmouseout = () => closeBtn.style.opacity = '0.5';
    
    const messageDiv = document.createElement('div');
    messageDiv.style.cssText = 'white-space: pre-wrap; padding-right: 10px; font-weight: 500;';
    messageDiv.innerHTML = formattedMessage;
    
    // Add countdown timer display
    const timerDiv = document.createElement('div');
    timerDiv.style.cssText = 'font-size: 10px; opacity: 0.6; margin-top: 5px; font-weight: normal;';
    const seconds = Math.ceil(duration / 1000);
    timerDiv.textContent = `Auto-dismiss in ${seconds}s`;
    messageDiv.appendChild(timerDiv);
    
    // Update countdown every second
    let remainingTime = seconds;
    const countdownInterval = setInterval(() => {
      remainingTime--;
      if (remainingTime > 0) {
        timerDiv.textContent = `Auto-dismiss in ${remainingTime}s`;
      } else {
        clearInterval(countdownInterval);
      }
    }, 1000);
    
    notification.appendChild(messageDiv);
    notification.appendChild(closeBtn);
    
    // Add to container (stacks vertically)
    notificationContainer.appendChild(notification);
    
    // Define removal function
    const removeNotification = () => {
      clearInterval(countdownInterval);
      notification.style.animation = 'slideOutRight 0.3s ease-in';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.remove();
        }
      }, 300);
    };
    
    // Auto-remove after duration
    const autoRemoveTimer = setTimeout(removeNotification, duration);
    
    // Manual close
    closeBtn.addEventListener('click', () => {
      clearTimeout(autoRemoveTimer);
      removeNotification();
    });
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
  const imageDataUrls = {}; // Store data URLs for preview
  
  document.querySelectorAll('.image-entry').forEach(entry => {
    const imagePath = entry.querySelector('.image-path').value.trim();
    const fileInput = entry.querySelector('.image-file');
    
    if (imagePath) {
      // Store as flat array of strings (matching Hugo JSON format)
      images.push(imagePath);
      
      // Check if there's a pending file upload
      if (fileInput && fileInput.files && fileInput.files[0]) {
        // Get the data URL that was stored when file was selected
        const storedDataUrl = sessionStorage.getItem(`image_preview_${itemId}_${imagePath}`);
        if (storedDataUrl) {
          imageDataUrls[imagePath] = storedDataUrl;
        }
        
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
    // Store file paths that need uploading
    sessionStorage.setItem(`pending_uploads_${itemId}`, JSON.stringify(pendingUploads.map(u => u.path)));
  }
  
  // Store image preview data URLs
  if (Object.keys(imageDataUrls).length > 0) {
    sessionStorage.setItem(`image_previews_${itemId}`, JSON.stringify(imageDataUrls));
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
  
  // Clear time blocks WITHOUT confirmation and ensure all containers exist with correct Loop 2 offsets
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const weekHeight = 5292; // One full week (7 days × 756px)
  
  days.forEach((day, dayIndex) => {
    let container = document.getElementById(`timeBlocks_${day}`);
    if (container) {
      // Clear existing blocks
      container.innerHTML = '';
      // Ensure offset is correct for Loop 2 (middle loop)
      container.dataset.offset = weekHeight + (dayIndex * 756);
      console.log(`✅ Ensured ${day} container has Loop 2 offset: ${container.dataset.offset}`);
    } else {
      // Create container if it doesn't exist
      container = document.createElement('div');
      container.id = `timeBlocks_${day}`;
      container.className = 'day-blocks';
      container.dataset.day = day;
      container.dataset.offset = weekHeight + (dayIndex * 756); // Loop 2 offset
      
      const allContainer = document.getElementById('timeBlocks_all');
      if (allContainer) {
        allContainer.appendChild(container);
        console.log(`✅ Created ${day} container with Loop 2 offset: ${container.dataset.offset}`);
      }
    }
  });
  
  // Initialize timeline styles
  initTimelineStyles();
  
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
      
      // Load opening hours into timeline UI
      if (loc.opening_hours) {
        document.getElementById('locationHoursMode').value = loc.opening_hours.mode || 'Auto';
        
        console.log('📅 Loading opening hours:', loc.opening_hours);
        
        const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
        days.forEach((day, dayIdx) => {
          const hours = loc.opening_hours[day];
          if (hours && hours.length > 0) {
            console.log(`  Loading ${day}:`, hours);
            
            // Check if first entry is an unpaired Close (continuation from previous day)
            let startIdx = 0;
            if (hours[0].type === 'Close') {
              // This is a continuation from previous day - find the matching Open on prev day
              const prevDayIdx = (dayIdx - 1 + 7) % 7;
              const prevDay = days[prevDayIdx];
              const prevDayHours = loc.opening_hours[prevDay];
              
              if (prevDayHours && prevDayHours.length > 0) {
                // Find last unpaired Open on previous day
                const lastEntry = prevDayHours[prevDayHours.length - 1];
                if (lastEntry.type === 'Open') {
                  // Merge: previous day's open extends to this day's close
                  const [openHourStr, openMinStr] = lastEntry.time.split(':');
                  const openHour = parseInt(openHourStr);
                  const openMin = parseInt(openMinStr) || 0;
                  const startTime = openHour + (openMin / 60);
                  
                  const [closeHourStr, closeMinStr] = hours[0].time.split(':');
                  const closeHour = parseInt(closeHourStr);
                  const closeMin = parseInt(closeMinStr) || 0;
                  const endTime = 24 + closeHour + (closeMin / 60); // Add 24 for next day
                  
                  console.log(`    Detected cross-day block from ${prevDay}: ${lastEntry.time} - ${hours[0].time} (+1d) → ${startTime} - ${endTime}`);
                  
                  // Add merged block to PREVIOUS day
                  addTimeBlock(prevDay, startTime, endTime);
                }
              }
              
              startIdx = 1; // Skip the Close entry we just processed
            }
            
            // Convert remaining Open/Close pairs to time blocks
            const remainingHours = hours.slice(startIdx);
            const openTimes = remainingHours.filter(h => h.type === 'Open').map(h => h.time);
            const closeTimes = remainingHours.filter(h => h.type === 'Close').map(h => h.time);
            
            // Pair up opens and closes
            for (let i = 0; i < Math.min(openTimes.length, closeTimes.length); i++) {
              const [openHourStr, openMinStr] = openTimes[i].split(':');
              const [closeHourStr, closeMinStr] = closeTimes[i].split(':');
              
              const openHour = parseInt(openHourStr);
              const openMin = parseInt(openMinStr) || 0;
              const closeHour = parseInt(closeHourStr);
              const closeMin = parseInt(closeMinStr) || 0;
              
              // Convert to decimal hours (e.g., 11:30 = 11.5)
              let startTime = openHour + (openMin / 60);
              let endTime = closeHour + (closeMin / 60);
              
              console.log(`    Adding block: ${openTimes[i]} - ${closeTimes[i]} (${startTime} - ${endTime})`);
              addTimeBlock(day, startTime, endTime);
            }
            
            // Check if last entry is an unpaired Open (continues to next day)
            if (remainingHours.length > 0 && remainingHours[remainingHours.length - 1].type === 'Open') {
              // This will be handled when we process the next day (which should start with Close)
              console.log(`    Note: ${day} ends with unpaired Open - continues to next day`);
            }
          }
          // Don't add default blocks - leave days empty if no hours
        });
      }
      // Don't add defaults for new locations either - let user add their own schedule
      
      // Show delete button for existing locations
      deleteBtn.style.display = 'inline-block';
    }
  } else {
    title.textContent = 'Add Location';
    document.getElementById('locationForm').reset();
    document.getElementById('locationIndex').value = '';
    deleteBtn.style.display = 'none';
    // No default blocks - user adds their own schedule
  }
  
  modal.classList.add('active');
  
  // Initialize infinite scroll for timeline
  setTimeout(() => {
    setupInfiniteScroll();
    
    // Add visual debug markers
    const weekTrack = document.querySelector('.week-track');
    if (weekTrack) {
      // Add marker at Loop 2 Mon start (5292px)
      const marker = document.createElement('div');
      marker.style.cssText = `
        position: absolute;
        left: 0;
        right: 0;
        top: 5292px;
        height: 3px;
        background: linear-gradient(90deg, lime, yellow, lime);
        z-index: 5;
        pointer-events: none;
      `;
      marker.title = 'Loop 2 Mon start (5292px)';
      weekTrack.appendChild(marker);
      
      // Add marker at Mon 11am (where first block should be)
      const marker2 = document.createElement('div');
      marker2.style.cssText = `
        position: absolute;
        left: 0;
        right: 0;
        top: 5658px;
        height: 2px;
        background: cyan;
        z-index: 5;
        pointer-events: none;
      `;
      marker2.title = 'Mon 11am (5658px)';
      weekTrack.appendChild(marker2);
    }
    
    // Run diagnostics to verify positions
    setTimeout(() => {
      verifyBlockPositions();
    }, 200);
  }, 100);
}

// Setup infinite scroll for the weekly timeline
function setupInfiniteScroll() {
  const timeline = document.getElementById('openingHoursTimeline');
  if (!timeline) return;
  
  const weekHeight = 5292; // One week (7 days × 756px)
  let isScrolling = false;
  
  // Start at the middle loop to allow scrolling both directions
  timeline.scrollTop = weekHeight;
  
  timeline.addEventListener('scroll', function() {
    if (isScrolling) return;
    
    const scrollTop = timeline.scrollTop;
    const buffer = 200; // Trigger very early - just 200px before leaving Loop 2
    
    // Scrolled up into Loop 1 (before 5292px)
    if (scrollTop < weekHeight - buffer) {
      isScrolling = true;
      // Jump to same position in loop 2
      timeline.scrollTop = scrollTop + weekHeight;
      setTimeout(() => { isScrolling = false; }, 50);
      console.log(`🔄 Infinite scroll UP: Jumped from ${scrollTop}px to ${scrollTop + weekHeight}px`);
    }
    
    // Scrolled down into Loop 3 (after 10584px)
    else if (scrollTop > weekHeight * 2 + buffer) {
      isScrolling = true;
      // Jump back to same position in loop 2
      timeline.scrollTop = scrollTop - weekHeight;
      setTimeout(() => { isScrolling = false; }, 50);
      console.log(`🔄 Infinite scroll DOWN: Jumped from ${scrollTop}px to ${scrollTop - weekHeight}px`);
    }
  });
  
  console.log('✅ Infinite scroll initialized - starting at middle loop (5292px)');
}

// Diagnostic function to verify all block positions
function verifyBlockPositions() {
  console.log('🔍 DIAGNOSTIC: Verifying all block positions...\n');
  
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const expectedOffsets = {
    'mon': 5292,  // Loop 2
    'tue': 6048,
    'wed': 6804,
    'thu': 7560,
    'fri': 8316,
    'sat': 9072,
    'sun': 9828
  };
  
  days.forEach((day, idx) => {
    const container = document.getElementById(`timeBlocks_${day}`);
    if (!container) {
      console.error(`❌ ${day.toUpperCase()}: Container not found!`);
      return;
    }
    
    const actualOffset = parseInt(container.dataset.offset);
    const expectedOffset = expectedOffsets[day];
    const offsetOK = actualOffset === expectedOffset ? '✅' : '❌';
    
    console.log(`${offsetOK} ${day.toUpperCase()}: Container offset = ${actualOffset}px (expected ${expectedOffset}px)`);
    
    // Check blocks
    const blocks = container.querySelectorAll('.time-block:not(.loop-duplicate)');
    blocks.forEach(block => {
      const start = parseFloat(block.dataset.start);
      const end = parseFloat(block.dataset.end);
      const actualTop = parseInt(block.style.top);
      const headerHeight = 36;
      const expectedTop = start < 0 
        ? (actualOffset - 756 + headerHeight + (start + 24) * 30)
        : (actualOffset + headerHeight + start * 30);
      const topOK = Math.abs(actualTop - expectedTop) < 1 ? '✅' : '❌';
      
      console.log(`  ${topOK} Block ${block.id}: ${start}h-${end}h, top=${actualTop}px (expected ${expectedTop}px)`);
    });
  });
  
  console.log('\n📊 Summary:');
  console.log(`Total containers: ${days.length}`);
  console.log(`Each day = 36px header + 720px hours (24×30px) = 756px total`);
  console.log(`Loop 1 range: 0-5292px (duplicates only)`);
  console.log(`Loop 2 range: 5292-10584px (interactive blocks) ← YOU ARE HERE`);
  console.log(`Loop 3 range: 10584-15876px (duplicates only)`);
  
  // Check actual DOM rendered positions
  console.log('\n🔬 DOM POSITION CHECK:');
  const dayLabelsColumn = document.querySelector('.day-labels-column');
  const weekTrack = document.querySelector('.week-track');
  
  if (dayLabelsColumn && weekTrack) {
    const labelsRect = dayLabelsColumn.getBoundingClientRect();
    const trackRect = weekTrack.getBoundingClientRect();
    console.log(`Left column top: ${labelsRect.top}px, Right column top: ${trackRect.top}px`);
    console.log(`Vertical offset between columns: ${Math.abs(labelsRect.top - trackRect.top)}px ${labelsRect.top === trackRect.top ? '✅' : '❌'}`);
    
    // Check first Mon header position in Loop 2
    const dayHeaders = dayLabelsColumn.querySelectorAll('.day-header');
    if (dayHeaders.length > 7) {
      const loop2MonHeader = dayHeaders[7]; // 8th header (Loop 2 Mon)
      const headerRect = loop2MonHeader.getBoundingClientRect();
      const relativeTop = headerRect.top - labelsRect.top + dayLabelsColumn.scrollTop;
      console.log(`Loop 2 Mon header actual position: ${relativeTop}px (expected ~5292px) ${Math.abs(relativeTop - 5292) < 50 ? '✅' : '❌'}`);
    }
  }
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
  console.log('🔍 Attempting to open ad modal for:', adId);
  console.log('📄 Document ready state:', document.readyState);
  
  const modal = document.getElementById('adModal');
  
  if (!modal) {
    console.error('❌ Ad modal element not found in DOM');
    console.log('📍 Current URL:', window.location.href);
    console.log('📍 Current pathname:', window.location.pathname);
    console.log('Available modal IDs:', 
      Array.from(document.querySelectorAll('[id*="Modal"]')).map(el => el.id)
    );
    
    // Check if we're on the update-ui page
    const currentPath = window.location.pathname;
    if (!currentPath.includes('/update-ui')) {
      alert('⚠️ Wrong Page!\n\nYou are not on the Dashboard page.\n\nPlease navigate to:\n/update-ui/\n\nCurrent page: ' + currentPath);
      return;
    }
    
    alert('Error: Advertisement modal not found in the page.\n\nPossible causes:\n1. Page not fully loaded - try refreshing\n2. Wrong page template\n3. Modal HTML missing from layout\n\nCurrent URL: ' + currentPath + '\n\nCheck browser console (F12) for details.');
    return;
  }
  
  console.log('✅ Modal found, proceeding to open...');
  
  // Get all required form elements (match actual HTML IDs)
  const title = document.getElementById('adModalTitle');
  const adIdInput = document.getElementById('adId');
  const adTitleInput = document.getElementById('adTitle');
  const adDescriptionInput = document.getElementById('adDescription');
  const adLinkInput = document.getElementById('adLink');
  const adWeightInput = document.getElementById('adWeight');
  const adRecurringInput = document.getElementById('adRecurring');
  const adLocationsContainer = document.getElementById('adLocationsContainer'); // Container for location checkboxes
  const adDaysContainer = document.getElementById('adDaysOfWeekContainer'); // Container for day checkboxes
  const adImageInput = document.getElementById('adImage'); // File input
  const adFormElement = document.getElementById('adForm');
  
  // Check for required form elements
  const requiredElements = {
    'adModalTitle': title,
    'adId': adIdInput,
    'adTitle': adTitleInput,
    'adDescription': adDescriptionInput,
    'adLink': adLinkInput,
    'adWeight': adWeightInput,
    'adRecurring': adRecurringInput,
    'adLocationsContainer': adLocationsContainer,
    'adDaysOfWeekContainer': adDaysContainer,
    'adImage': adImageInput,
    'adForm': adFormElement,
  };
  
  const missingElements = [];
  for (const [name, element] of Object.entries(requiredElements)) {
    if (!element) {
      missingElements.push(name);
    }
  }
  
  if (missingElements.length > 0) {
    console.error('❌ Missing form elements:', missingElements);
    alert(`Error: Advertisement form is incomplete.\n\nMissing elements:\n${missingElements.join('\n')}\n\nThe page may not be fully loaded or the template is missing elements.\n\nPlease refresh the page and try again.`);
    return;
  }
  
  // Populate location checkboxes from published locations
  adLocationsContainer.innerHTML = '';
  
  // Get published locations (not drafts or deleted)
  const publishedLocations = UpdateUI.state.locations.filter(loc => !loc._isDraft && !loc._isDeleted);
  
  if (publishedLocations.length > 0) {
    publishedLocations.forEach(loc => {
      const locationName = loc.city || loc.address;
      const label = document.createElement('label');
      label.className = 'checkbox-label';
      label.style.margin = '0';
      label.innerHTML = `
        <input type="checkbox" name="adLocations" value="${UpdateUI.escapeHtml(locationName)}">
        <span>${UpdateUI.escapeHtml(locationName)}</span>
      `;
      adLocationsContainer.appendChild(label);
    });
  } else {
    adLocationsContainer.innerHTML = '<p style="color: #6b7280; font-size: 0.875rem; margin: 0;">No locations available. Add locations first.</p>';
  }
  
  if (adId) {
    title.textContent = 'Edit Advertisement';
    const ad = UpdateUI.state.advertisements.find(a => a.id === adId);
    if (ad) {
      adIdInput.value = ad.id;
      adTitleInput.value = ad.title;
      adDescriptionInput.value = ad.description || '';
      adLinkInput.value = ad.link || '';
      adWeightInput.value = ad.weight || 1;
      adRecurringInput.checked = ad.recurring || false;
      
      // Check appropriate days of week checkboxes
      const daysCheckboxes = document.querySelectorAll('input[name="adDaysOfWeek"]');
      daysCheckboxes.forEach(checkbox => {
        checkbox.checked = ad.daysOfWeek && ad.daysOfWeek.includes(checkbox.value);
      });
      
      // Check appropriate location checkboxes
      const locationsCheckboxes = document.querySelectorAll('input[name="adLocations"]');
      locationsCheckboxes.forEach(checkbox => {
        checkbox.checked = ad.locations && ad.locations.includes(checkbox.value);
      });
      
      // Store and preview current image
      if (ad.image) {
        // Store in hidden field
        const adImageCurrent = document.getElementById('adImageCurrent');
        if (adImageCurrent) {
          adImageCurrent.value = ad.image;
        }
        
        // Create hidden field for backward compatibility if it doesn't exist
        let currentImageInput = document.getElementById('adCurrentImage');
        if (!currentImageInput) {
          currentImageInput = document.createElement('input');
          currentImageInput.type = 'hidden';
          currentImageInput.id = 'adCurrentImage';
          adFormElement.appendChild(currentImageInput);
        }
        currentImageInput.value = ad.image;
        
        // Show preview
        const preview = document.getElementById('adImagePreview');
        const previewImg = document.getElementById('adImagePreviewImg');
        const imagePath = document.getElementById('adImagePath');
        
        if (preview && previewImg && imagePath) {
          const imgSrc = ad.image.startsWith('http') ? ad.image : (ad.image.startsWith('/') ? ad.image : `/${ad.image}`);
          previewImg.src = imgSrc;
          imagePath.textContent = ad.image;
          preview.style.display = 'block';
        }
      } else {
        // Hide preview if no image
        const preview = document.getElementById('adImagePreview');
        if (preview) {
          preview.style.display = 'none';
        }
      }
      
      console.log('✅ Advertisement data populated:', {
        title: ad.title,
        days: ad.daysOfWeek,
        locations: ad.locations,
        image: ad.image
      });
    } else {
      console.warn('⚠️ Advertisement not found:', adId);
    }
  } else {
    title.textContent = 'Add Advertisement';
    adFormElement.reset();
    adIdInput.value = 'new_ad_' + Date.now();
    
    // Uncheck all checkboxes for new ad
    document.querySelectorAll('input[name="adDaysOfWeek"]').forEach(cb => cb.checked = false);
    document.querySelectorAll('input[name="adLocations"]').forEach(cb => cb.checked = false);
    
    // Hide image preview for new ads
    const preview = document.getElementById('adImagePreview');
    if (preview) {
      preview.style.display = 'none';
    }
    
    // Clear hidden fields
    const currentImageInput = document.getElementById('adCurrentImage');
    if (currentImageInput) {
      currentImageInput.value = '';
    }
    const adImageCurrent = document.getElementById('adImageCurrent');
    if (adImageCurrent) {
      adImageCurrent.value = '';
    }
  }
  
  // Setup file input change handler for preview
  const fileInput = document.getElementById('adImage');
  if (fileInput) {
    fileInput.onchange = function() {
      if (this.files && this.files[0]) {
        const file = this.files[0];
        const preview = document.getElementById('adImagePreview');
        const previewImg = document.getElementById('adImagePreviewImg');
        const imagePath = document.getElementById('adImagePath');
        
        if (preview && previewImg && imagePath) {
          // Show preview of new upload
          const reader = new FileReader();
          reader.onload = function(e) {
            previewImg.src = e.target.result;
            imagePath.textContent = `New upload: ${file.name}`;
            preview.style.display = 'block';
          };
          reader.readAsDataURL(file);
        }
      }
    };
  }
  
  modal.classList.add('active');
  
  // Scroll modal to top
  modal.scrollTop = 0;
}

function closeAdModal() {
  const modal = document.getElementById('adModal');
  if (modal) {
    modal.classList.remove('active');
  }
  
  // Clear file input to prevent issues on next open
  const fileInput = document.getElementById('adImage');
  if (fileInput) {
    fileInput.value = '';
  }
  
  // Hide preview
  const preview = document.getElementById('adImagePreview');
  if (preview) {
    preview.style.display = 'none';
  }
}

function selectAdImageFromLibrary() {
  // Open the image library modal (reuse HomePageManager's modal)
  const modal = document.getElementById('imageLibraryModal');
  if (modal) {
    modal.style.display = 'flex';
    
    // Load images if not already loaded
    if (HomePageManager && HomePageManager.availableImages.length > 0) {
      renderAdImageLibrary();
    } else if (window.hugoStaticImages) {
      HomePageManager.availableImages = window.hugoStaticImages;
      renderAdImageLibrary();
    }
  }
}

function renderAdImageLibrary() {
  const grid = document.getElementById('imageLibraryGrid');
  const searchInput = document.getElementById('imageSearchInput');
  
  // Clear and setup
  grid.innerHTML = '';
  const images = HomePageManager.availableImages;
  
  // Render images as clickable cards
  images.forEach(imagePath => {
    const filename = imagePath.split('/').pop();
    const card = document.createElement('div');
    card.className = 'image-select-card';
    card.style.cssText = 'border: 2px solid #e5e7eb; border-radius: 8px; overflow: hidden; cursor: pointer; transition: all 0.2s; background: white; display: flex; flex-direction: column; height: fit-content;';
    card.innerHTML = `
      <img src="/${imagePath}" alt="${filename}" style="width: 100%; height: 140px; object-fit: cover;">
      <div style="padding: 0.5rem; background: white;">
        <p style="font-size: 0.8rem; color: #111827; font-weight: 600; line-height: 1.4; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${filename}</p>
      </div>
    `;
    
    card.onclick = () => {
      selectAdImageFromCard(imagePath);
    };
    
    grid.appendChild(card);
  });
  
  // Setup search
  if (searchInput) {
    searchInput.oninput = (e) => {
      const search = e.target.value.toLowerCase();
      const cards = grid.querySelectorAll('.image-select-card');
      cards.forEach(card => {
        const text = card.textContent.toLowerCase();
        card.style.display = text.includes(search) ? '' : 'none';
      });
    };
  }
  
  // Update count
  const countEl = document.getElementById('imageCount');
  if (countEl) countEl.textContent = images.length;
}

function selectAdImageFromCard(imagePath) {
  // Update the hidden input
  document.getElementById('adImageCurrent').value = imagePath;
  
  // Update preview
  const preview = document.getElementById('adImagePreview');
  const previewImg = document.getElementById('adImagePreviewImg');
  const pathText = document.getElementById('adImagePath');
  
  if (preview && previewImg && pathText) {
    previewImg.src = imagePath.startsWith('/') ? imagePath : '/' + imagePath;
    pathText.textContent = imagePath;
    preview.style.display = 'block';
  }
  
  // Close modal
  document.getElementById('imageLibraryModal').style.display = 'none';
}

async function saveAd(event) {
  event.preventDefault();
  
  const adId = document.getElementById('adId').value;
  const isNew = adId.startsWith('new_ad_');
  
  // Collect checked days of week from checkboxes
  const daysOfWeek = Array.from(document.querySelectorAll('input[name="adDaysOfWeek"]:checked'))
    .map(checkbox => checkbox.value);
  
  // Collect checked locations from checkboxes
  const locations = Array.from(document.querySelectorAll('input[name="adLocations"]:checked'))
    .map(checkbox => checkbox.value);
  
  const adData = {
    id: adId,
    title: document.getElementById('adTitle').value,
    description: document.getElementById('adDescription').value,
    link: document.getElementById('adLink').value,
    weight: parseInt(document.getElementById('adWeight').value) || 1,
    recurring: document.getElementById('adRecurring').checked,
    daysOfWeek: daysOfWeek,
    locations: locations,
    _isNew: isNew,
  };
  
  // Handle image upload
  const imageInput = document.getElementById('adImage');
  const adImageCurrent = document.getElementById('adImageCurrent');
  
  if (imageInput && imageInput.files && imageInput.files[0]) {
    // New image uploaded - will be handled on publish
    const file = imageInput.files[0];
    adData.image = `images/ads/${file.name}`;
    adData._imagePending = true;
    
    // Store file in sessionStorage for upload on publish
    const reader = new FileReader();
    reader.onload = function(e) {
      sessionStorage.setItem(`ad_image_${adId}`, e.target.result);
    };
    reader.readAsDataURL(file);
  } else if (adImageCurrent && adImageCurrent.value) {
    // Preserve existing image from hidden field
    adData.image = adImageCurrent.value;
  } else if (adData._isNew) {
    // New ad without image
    adData.image = '';
  } else {
    // Editing existing ad - get image from state
    const existingAd = UpdateUI.state.advertisements.find(a => a.id === adId);
    if (existingAd && existingAd.image) {
      adData.image = existingAd.image;
    }
  }
  
  console.log('💾 Saving ad draft:', adData);
  
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
      <div class="empty-preview">📸 Choose an image from library or upload a new one</div>
      <input type="file" class="form-input image-file" id="file_${entryId}" accept="image/jpeg,image/jpg,image/png,image/webp,image/gif" style="display: none;">
      <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
        <button type="button" class="btn btn-sm btn-secondary" onclick="selectMenuItemImageFromLibrary('${entryId}')" style="flex: 1;">📁 Choose from Library</button>
        <button type="button" class="btn btn-sm btn-primary" onclick="document.getElementById('file_${entryId}').click()" style="flex: 1;">📤 Upload New Image</button>
      </div>
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
  
  // Show preview and store data URL for draft preview
  const reader = new FileReader();
  reader.onload = function(e) {
    const dataUrl = e.target.result;
      const fileName = `images/${file.name}`;
    
    if (preview) {
      preview.innerHTML = `<img src="${dataUrl}" alt="Preview"><div class="card-filename">${fileName}</div>`;
      preview.classList.add('has-image');
      preview.style.display = '';
    }
    
    // Store data URL in sessionStorage so it can be displayed in the draft card
    // We'll retrieve this when rendering menu items
    const itemId = document.getElementById('itemId')?.value;
    if (itemId) {
      sessionStorage.setItem(`image_preview_${itemId}_${fileName}`, dataUrl);
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

function selectMenuItemImageFromLibrary(entryId) {
  // Store the entry ID in a global variable for later use
  window.currentMenuItemImageEntryId = entryId;
  
  // Open the image library modal (reuse HomePageManager's modal)
  const modal = document.getElementById('imageLibraryModal');
  if (modal) {
    modal.style.display = 'flex';
    
    // Load images if not already loaded
    if (HomePageManager && HomePageManager.availableImages.length > 0) {
      renderMenuItemImageLibrary();
    } else if (window.hugoStaticImages) {
      HomePageManager.availableImages = window.hugoStaticImages;
      renderMenuItemImageLibrary();
    }
  }
}

function renderMenuItemImageLibrary() {
  const grid = document.getElementById('imageLibraryGrid');
  const searchInput = document.getElementById('imageSearchInput');
  
  // Clear and setup
  grid.innerHTML = '';
  const images = HomePageManager.availableImages;
  
  // Render images as clickable cards
  images.forEach(imagePath => {
    const filename = imagePath.split('/').pop();
    const card = document.createElement('div');
    card.className = 'image-select-card';
    card.style.cssText = 'border: 2px solid #e5e7eb; border-radius: 8px; overflow: hidden; cursor: pointer; transition: all 0.2s; background: white; display: flex; flex-direction: column; height: fit-content;';
    card.innerHTML = `
      <img src="/${imagePath}" alt="${filename}" style="width: 100%; height: 140px; object-fit: cover;">
      <div style="padding: 0.5rem; background: white;">
        <p style="font-size: 0.8rem; color: #111827; font-weight: 600; line-height: 1.4; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${filename}</p>
      </div>
    `;
    
    card.onclick = () => {
      selectMenuItemImageFromCard(imagePath);
    };
    
    grid.appendChild(card);
  });
  
  // Setup search
  if (searchInput) {
    searchInput.oninput = (e) => {
      const search = e.target.value.toLowerCase();
      const cards = grid.querySelectorAll('.image-select-card');
      cards.forEach(card => {
        const text = card.textContent.toLowerCase();
        card.style.display = text.includes(search) ? '' : 'none';
      });
    };
  }
  
  // Update count
  const countEl = document.getElementById('imageCount');
  if (countEl) countEl.textContent = images.length;
}

function selectMenuItemImageFromCard(imagePath) {
  const entryId = window.currentMenuItemImageEntryId;
  if (!entryId) return;
  
  const preview = document.getElementById(`preview_${entryId}`);
  const fileGroup = document.getElementById(`filegroup_${entryId}`);
  const hiddenInput = preview.closest('.image-entry').querySelector('.image-path');
  
  // Update preview
  preview.innerHTML = `
    <img src="${imagePath.startsWith('/') ? imagePath : '/' + imagePath}" alt="Preview">
    <div class="card-filename">${imagePath}</div>
  `;
  preview.style.display = 'block';
  preview.classList.add('has-image');
  fileGroup.style.display = 'none';
  
  // Update hidden input
  hiddenInput.value = imagePath;
  
  // Close modal
  document.getElementById('imageLibraryModal').style.display = 'none';
  window.currentMenuItemImageEntryId = null;
}

// Opening Hours Management Functions
// ========================================
// TIMELINE-BASED OPENING HOURS UI
// ========================================

// Initialize timeline styles
function initTimelineStyles() {
  if (document.getElementById('timelineStyles')) return;
  
  const style = document.createElement('style');
  style.id = 'timelineStyles';
  style.textContent = `
    .weekly-timeline {
      background: white;
    }
    
    .timeline-actions .btn {
      font-size: 0.75rem;
    }
    
    .day-header {
      height: 36px;
      min-height: 36px;
      max-height: 36px;
      position: sticky;
      top: 0;
      z-index: 5;
      flex-shrink: 0;
    }
    
    .day-hours {
      height: 720px;
      min-height: 720px;
      max-height: 720px;
      flex-shrink: 0;
    }
    
    .hour-label {
      height: 30px;
      min-height: 30px;
      max-height: 30px;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding-right: 0.5rem;
      font-size: 0.625rem;
      color: #6b7280;
      font-weight: 500;
      border-bottom: 1px solid #e5e7eb;
      flex-shrink: 0;
    }
    
    .hour-label:nth-child(even) {
      background: rgba(0,0,0,0.02);
    }
    
    .week-track {
      position: relative;
      background: white;
      cursor: crosshair;
    }
    
    .week-track:hover {
      background: #fafafa;
    }
    
    /* Visual debug grid - shows day boundaries */
    .week-track::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-image: repeating-linear-gradient(
        to bottom,
        transparent 0px,
        transparent 36px,          /* Header */
        rgba(255, 0, 0, 0.05) 36px,  /* Hour section start (light red) */
        rgba(255, 0, 0, 0.05) 756px, /* Day end */
        rgba(0, 0, 255, 0.1) 756px,  /* Next header (blue) */
        rgba(0, 0, 255, 0.1) 792px   /* Next day */
      );
      pointer-events: none;
      z-index: 1;
    }
    
    .time-blocks-container {
      position: relative;
    }
    
    .day-blocks {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      pointer-events: none;
    }
    
    .time-block {
      position: absolute;
      left: 8px;
      right: 8px;
      border-radius: 6px;
      cursor: grab;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 0.7rem;
      font-weight: 600;
      min-height: 30px;
      transition: all 0.2s ease;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      padding: 0.25rem 0.5rem;
      border: 2px solid rgba(255,255,255,0.3);
      pointer-events: all;
      touch-action: none;
      user-select: none;
      z-index: 10; /* Above debug grid */
    }
    
    .time-block:active {
      cursor: grabbing;
    }
    
    .time-block:hover {
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      z-index: 100;
      transform: translateX(-2px);
      border-color: rgba(255,255,255,0.8);
    }
    
    .time-block-label {
      pointer-events: none;
      text-align: center;
      line-height: 1.3;
      text-shadow: 0 1px 2px rgba(0,0,0,0.5);
      font-weight: 600;
    }
    
    .time-block-day-badge {
      display: none;
    }
    
    .time-block-remove {
      position: absolute;
      top: -8px;
      right: -8px;
      width: 22px;
      height: 22px;
      background: #dc2626;
      border: 2px solid white;
      border-radius: 50%;
      display: none;
      align-items: center;
      justify-content: center;
      font-size: 0.875rem;
      color: white;
      cursor: pointer;
      box-shadow: 0 2px 6px rgba(0,0,0,0.5);
      z-index: 200;
      font-weight: bold;
    }
    
    .time-block:hover .time-block-remove {
      display: flex;
    }
    
    /* Resize handles */
    .time-block-resize-handle {
      position: absolute;
      left: 0;
      right: 0;
      height: 16px;
      cursor: ns-resize;
      z-index: 50;
      display: flex;
      align-items: center;
      justify-content: center;
      touch-action: none;
      pointer-events: all;
    }
    
    .time-block-resize-handle::before {
      content: '';
      width: 40px;
      height: 4px;
      background: rgba(255,255,255,0.7);
      border-radius: 2px;
      transition: all 0.2s;
      box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    }
    
    .time-block-resize-handle:hover::before,
    .time-block-resize-handle:active::before {
      background: rgba(255,255,255,1);
      width: 50px;
      height: 5px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.5);
    }
    
    .time-block-resize-top {
      top: -2px;
    }
    
    .time-block-resize-bottom {
      bottom: -2px;
    }
    
    .time-block.resizing {
      opacity: 0.8;
      box-shadow: 0 6px 16px rgba(0,0,0,0.5);
      z-index: 150;
    }
    
    /* Day-specific colors for continuous timeline */
    [data-day="mon"] .time-block { background: #ef4444; }
    [data-day="tue"] .time-block { background: #f97316; }
    [data-day="wed"] .time-block { background: #f59e0b; }
    [data-day="thu"] .time-block { background: #10b981; }
    [data-day="fri"] .time-block { background: #3b82f6; }
    [data-day="sat"] .time-block { background: #8b5cf6; }
    [data-day="sun"] .time-block { background: #ec4899; }
    
    @media (max-width: 768px) {
      .continuous-week-grid {
        grid-template-columns: 60px 1fr;
      }
      
      .hour-label {
        font-size: 0.55rem;
        padding-right: 0.3rem;
        height: 25px;
      }
      
      .time-block {
        font-size: 0.65rem;
      }
      
      .time-block-resize-handle {
        height: 20px;
      }
      
      .timeline-actions {
        flex-direction: column;
      }
      
      .timeline-actions .btn {
        width: 100%;
      }
    }
  `;
  document.head.appendChild(style);
}

// Add a new time block to a day (continuous weekly timeline)
function addTimeBlock(day, startHour = 11, endHour = 22) {
  initTimelineStyles();
  
  let container = document.getElementById(`timeBlocks_${day}`);
  
  // Ensure container exists with correct Loop 2 offset
  if (!container) {
    const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    const dayIndex = days.indexOf(day);
    const weekHeight = 5292; // One full week
    
    container = document.createElement('div');
    container.id = `timeBlocks_${day}`;
    container.className = 'day-blocks';
    container.dataset.day = day;
    container.dataset.offset = weekHeight + (dayIndex * 756); // Loop 2 offset
    
    const allContainer = document.getElementById('timeBlocks_all');
    if (allContainer) {
      allContainer.appendChild(container);
      console.log(`✅ Created ${day} container on-demand with Loop 2 offset: ${container.dataset.offset}`);
    } else {
      console.error(`❌ Cannot create container: timeBlocks_all not found`);
      return;
    }
  }
  
  // Get day offset from container
  const dayOffset = parseInt(container.dataset.offset) || 0;
  
  const pixelsPerHour = 30; // Each hour is 30px tall (supports 15-min intervals: 7.5px per 15min)
  const headerHeight = 36; // Each day has a 36px header
  
  // Round to nearest 15-minute interval (0.25 hour)
  const startRounded = Math.round(startHour * 4) / 4;
  const endRounded = Math.round(endHour * 4) / 4;
  
  // Position relative to the entire week timeline (handle negative start times)
  // IMPORTANT: Add headerHeight to account for day header above the hours
  const topPosition = startRounded < 0 
    ? (dayOffset - 756 + headerHeight + (startRounded + 24) * pixelsPerHour)
    : (dayOffset + headerHeight + (startRounded * pixelsPerHour));
  
  // Calculate height - account for day header if block extends past midnight
  let heightPixels = (endRounded - startRounded) * pixelsPerHour;
  if (endRounded > 24) {
    // Block extends to next day - add day header height
    heightPixels += headerHeight;
  }
  
  const dayNames = {
    'mon': 'MON',
    'tue': 'TUE',
    'wed': 'WED',
    'thu': 'THU',
    'fri': 'FRI',
    'sat': 'SAT',
    'sun': 'SUN'
  };
  
  // Check for overlaps BEFORE creating the element
  const hasOverlap = checkOverlap(day, startRounded, endRounded);
  if (hasOverlap) {
    console.warn(`⚠️ Overlap detected for ${day} ${startRounded}-${endRounded}`);
    alert(`⚠️ Overlap detected! This time conflicts with an existing block on ${day.toUpperCase()}.`);
    return;
  }
  console.log(`✅ No overlap detected for ${day} ${startRounded}-${endRounded}`);
  
  // Generate unique ID after passing overlap check
  const blockId = `block_${day}_${Date.now()}`;
  console.log(`🔨 Creating block ${blockId}: ${startRounded}h-${endRounded}h`);
  
  const block = document.createElement('div');
  block.className = 'time-block';
  block.id = blockId;
  block.dataset.start = startRounded;
  block.dataset.end = endRounded;
  block.dataset.day = day;
  block.style.top = `${topPosition}px`;
  block.style.height = `${heightPixels}px`;
  
  // Format labels with cross-day indicators
  const startLabel = startRounded < 0 ? `${formatHour(startRounded + 24)} (-1d)` : formatHour(startRounded);
  const endLabel = endRounded > 24 ? formatHour(endRounded) : formatHour(endRounded); // formatHour handles (+1d)
  
  block.innerHTML = `
    <div class="time-block-resize-handle time-block-resize-top" data-handle="top"></div>
    <span class="time-block-label">${startLabel} - ${endLabel}</span>
    <span class="time-block-day-badge">${dayNames[day]}</span>
    <button class="time-block-remove" onclick="event.stopPropagation(); removeTimeBlock('${blockId}')" title="Remove">✕</button>
    <div class="time-block-resize-handle time-block-resize-bottom" data-handle="bottom"></div>
  `;
  
  // Add double-click to edit
  block.ondblclick = function(e) {
    if (e.target.classList.contains('time-block-resize-handle')) return;
    e.stopPropagation();
    editTimeBlock(blockId, day);
  };
  
  // Append to DOM first
  container.appendChild(block);
  console.log(`✅ Block appended to DOM: ${blockId}`);
  
  // Then add resize functionality (needs to be in DOM for event listeners)
  setupBlockResize(block, blockId, day);
  
  // Add right-click to change day
  setupBlockDrag(block, blockId, day);
  
  // Create duplicate blocks for loops before and after (infinite feel)
  createLoopDuplicates(block, day, startRounded, endRounded, dayOffset);
  
  console.log(`🎉 Block creation complete: ${blockId}`);
  
  console.log(`✅ Added time block for ${day}: ${formatHour(startRounded)} - ${formatHour(endRounded)}`);
  console.log(`   Day offset: ${dayOffset}px, Block top: ${topPosition}px, Height: ${heightPixels}px`);
}

// Create duplicate blocks for the looping timeline
function createLoopDuplicates(originalBlock, day, startTime, endTime, dayOffset) {
  const pixelsPerHour = 30;
  const headerHeight = 36; // Day header height
  const weekHeight = 5292; // 7 days × 756px
  
  // Create duplicates for loops before (-1) and after (+1)
  for (let loop = -1; loop <= 1; loop += 2) {
    if (loop === 0) continue; // Skip the original
    
    const duplicateBlock = originalBlock.cloneNode(true);
    duplicateBlock.id = `${originalBlock.id}_loop${loop}`;
    duplicateBlock.classList.add('loop-duplicate');
    
    // Position in the previous or next loop (handle negative start times)
    const loopOffset = loop * weekHeight;
    const actualTop = startTime < 0 
      ? (dayOffset - 756 + headerHeight + (startTime + 24) * pixelsPerHour + loopOffset)
      : (dayOffset + headerHeight + (startTime * pixelsPerHour) + loopOffset);
    
    duplicateBlock.style.top = `${actualTop}px`;
    
    // Make duplicates non-interactive (visual only)
    duplicateBlock.style.pointerEvents = 'none';
    duplicateBlock.style.opacity = '0.4';
    
    // Add to same container
    originalBlock.parentElement.appendChild(duplicateBlock);
  }
}

// Setup sync between duplicate blocks and original
function setupBlockSync(duplicateBlock, originalBlock, day, startTime, endTime, dayOffset) {
  const pixelsPerHour = 30;
  const headerHeight = 36;
  const weekHeight = 5292;
  
  // Get the loop number from duplicate ID
  const loopMatch = duplicateBlock.id.match(/_loop(-?\d+)$/);
  const loop = loopMatch ? parseInt(loopMatch[1]) : 0;
  
  // Add resize functionality to duplicate
  setupBlockResize(duplicateBlock, duplicateBlock.id, day);
  
  // Add drag functionality to duplicate  
  setupBlockDrag(duplicateBlock, duplicateBlock.id, day);
  
  // Override duplicate's event handlers to sync with original
  duplicateBlock.addEventListener('mousedown', function(e) {
    if (e.target.classList.contains('time-block-resize-handle')) return;
    e.preventDefault();
    e.stopPropagation();
    
    // Sync this interaction to the original block
    syncInteractionToOriginal(duplicateBlock, originalBlock, 'mousedown', e);
  });
  
  duplicateBlock.addEventListener('touchstart', function(e) {
    if (e.target.classList.contains('time-block-resize-handle')) return;
    e.preventDefault();
    e.stopPropagation();
    
    // Sync this interaction to the original block
    syncInteractionToOriginal(duplicateBlock, originalBlock, 'touchstart', e);
  });
  
  // Override remove button
  const removeBtn = duplicateBlock.querySelector('.time-block-remove');
  if (removeBtn) {
    removeBtn.onclick = function(e) {
      e.stopPropagation();
      removeTimeBlock(originalBlock.id); // Remove original, which will remove all duplicates
    };
  }
}

// Sync interaction from duplicate to original block
function syncInteractionToOriginal(duplicateBlock, originalBlock, eventType, event) {
  // Calculate the offset between duplicate and original
  const duplicateRect = duplicateBlock.getBoundingClientRect();
  const originalRect = originalBlock.getBoundingClientRect();
  const offsetY = duplicateRect.top - originalRect.top;
  
  // Create a new event at the original's position
  const newEvent = new MouseEvent(eventType, {
    clientX: event.clientX,
    clientY: event.clientY - offsetY,
    bubbles: true,
    cancelable: true
  });
  
  // Dispatch to original block
  originalBlock.dispatchEvent(newEvent);
}

// Check if a new time block would overlap with existing ones (including cross-day blocks)
function checkOverlap(day, startHour, endHour, excludeBlockId = null) {
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const dayIndex = days.indexOf(day);
  
  // If block starts in previous day, check previous day
  if (startHour < 0) {
    const prevDayIndex = (dayIndex - 1 + 7) % 7;
    const prevDay = days[prevDayIndex];
    const prevDayContainer = document.getElementById(`timeBlocks_${prevDay}`);
    
    if (prevDayContainer) {
      const prevDayBlocks = prevDayContainer.querySelectorAll('.time-block:not(.loop-duplicate)');
      const prevStart = startHour + 24; // Convert to previous day's time
      const prevEnd = 24; // Goes until midnight
      
      for (let block of prevDayBlocks) {
        if (excludeBlockId && block.id === excludeBlockId) continue;
        
        const blockStart = parseFloat(block.dataset.start);
        const blockEnd = parseFloat(block.dataset.end);
        
        // Check if portion in previous day overlaps
        if (prevStart < blockEnd && prevEnd > blockStart) {
          console.log(`⚠️ Previous-day overlap: ${day} start ${formatHour(startHour + 24)} conflicts with ${prevDay} block`);
          return true;
        }
      }
    }
  }
  
  // Check current day portion
  const container = document.getElementById(`timeBlocks_${day}`);
  if (container) {
    const existingBlocks = container.querySelectorAll('.time-block:not(.loop-duplicate)');
    
    // Normalize start/end to current day range
    const checkStart = Math.max(0, startHour);
    const checkEnd = Math.min(24, endHour);
    
    for (let block of existingBlocks) {
      if (excludeBlockId && block.id === excludeBlockId) continue;
      
      const blockStart = parseFloat(block.dataset.start);
      const blockEnd = parseFloat(block.dataset.end);
      
      // Normalize block to current day range
      const blockCheckStart = Math.max(0, blockStart);
      const blockCheckEnd = Math.min(24, blockEnd);
      
      // Check if ranges overlap
      if (checkStart < blockCheckEnd && checkEnd > blockCheckStart) {
        return true; // Overlap detected
      }
    }
  }
  
  // If block extends past midnight, check next day too
  if (endHour > 24) {
    const nextDayIndex = (dayIndex + 1) % 7;
    const nextDay = days[nextDayIndex];
    const nextDayContainer = document.getElementById(`timeBlocks_${nextDay}`);
    
    if (nextDayContainer) {
      const nextDayBlocks = nextDayContainer.querySelectorAll('.time-block:not(.loop-duplicate)');
      const overflowStart = 0;
      const overflowEnd = endHour - 24;
      
      for (let block of nextDayBlocks) {
        if (excludeBlockId && block.id === excludeBlockId) continue;
        
        const blockStart = parseFloat(block.dataset.start);
        const blockEnd = parseFloat(block.dataset.end);
        
        // Check if overflow portion overlaps with next day's blocks
        if (overflowStart < blockEnd && overflowEnd > blockStart) {
          // Cross-day blocks are allowed - the save logic will split them properly
          // Don't block this, just log it
          console.log(`ℹ️ Cross-day block: ${day} extends to ${nextDay} ${formatHour(endHour - 24)}`);
          // Allow it - return false instead of true
        }
      }
    }
  }
  
  return false; // No overlap
}

// Setup drag functionality to move blocks between days
function setupBlockDrag(block, blockId, currentDay) {
  // Add right-click context menu to change day
  block.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    
    const newDay = prompt(
      `Change day for this block?\n\nCurrent: ${currentDay.toUpperCase()}\n\nEnter new day (mon, tue, wed, thu, fri, sat, sun):`,
      currentDay
    );
    
    if (!newDay || newDay.toLowerCase() === currentDay) return;
    
    const day = newDay.toLowerCase().trim();
    const validDays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    
    if (!validDays.includes(day)) {
      alert('Invalid day. Use: mon, tue, wed, thu, fri, sat, sun');
      return;
    }
    
    // Check for overlaps on target day
    const start = parseInt(block.dataset.start);
    const end = parseInt(block.dataset.end);
    
    if (checkOverlap(day, start, end)) {
      alert(`⚠️ Cannot move: This time conflicts with an existing block on ${day.toUpperCase()}.`);
      return;
    }
    
    // Move block to new day
    const newContainer = document.getElementById(`timeBlocks_${day}`);
    if (newContainer) {
      // Remove old duplicates first (before and after)
      for (let loop = -1; loop <= 1; loop += 2) {
        const oldDuplicate = document.getElementById(`${block.id}_loop${loop}`);
        if (oldDuplicate) {
          oldDuplicate.remove();
        }
      }
      
      // Update block's day
      block.dataset.day = day;
      currentDay = day;
      
      // Recalculate position based on new day offset
      const newDayOffset = parseInt(newContainer.dataset.offset) || 0;
      const pixelsPerHour = 30;
      const headerHeight = 36; // Day header height
      const newTop = start < 0 
        ? (newDayOffset - 756 + headerHeight + (start + 24) * pixelsPerHour)
        : (newDayOffset + headerHeight + (start * pixelsPerHour));
      block.style.top = `${newTop}px`;
      
      // Move to new container
      newContainer.appendChild(block);
      
      // Create new duplicates for the new day
      createLoopDuplicates(block, day, start, end, newDayOffset);
      
      console.log(`✅ Moved block to ${day}: ${formatHour(start)} - ${formatHour(end)} at ${newTop}px`);
      UpdateUI.showSuccess(`Moved to ${day.toUpperCase()}`);
    }
  });
}

// Setup resize functionality for a time block (mouse + touch support)
function setupBlockResize(block, blockId, day) {
  const handles = block.querySelectorAll('.time-block-resize-handle');
  const pixelsPerHour = 30;
  const headerHeight = 36; // Day header height
  
  console.log(`🔧 Setting up resize for ${blockId}, found ${handles.length} handles`);
  
  handles.forEach(handle => {
    const handleType = handle.dataset.handle;
    console.log(`  📌 Attaching listeners to ${handleType} handle`);
    // Mouse events
    handle.addEventListener('mousedown', function(e) {
      startResize(e, e.clientY);
    });
    
    // Touch events for mobile
    handle.addEventListener('touchstart', function(e) {
      const touch = e.touches[0];
      startResize(e, touch.clientY);
    }, { passive: false });
    
    function startResize(e, startY) {
      e.stopPropagation();
      e.preventDefault();
      
      const isTop = handle.dataset.handle === 'top';
      const originalStart = parseInt(block.dataset.start);
      const originalEnd = parseInt(block.dataset.end);
      const originalTop = parseInt(block.style.top);
      const originalHeight = parseInt(block.style.height);
      
      // Get day offset for continuous timeline positioning
      const container = document.getElementById(`timeBlocks_${day}`);
      const dayOffset = parseInt(container?.dataset.offset) || 0;
      
      console.log(`🎯 Starting resize: ${isTop ? 'TOP' : 'BOTTOM'} handle, current time: ${formatHour(originalStart)} - ${formatHour(originalEnd)}`);
      
      block.classList.add('resizing');
      
      function onMove(moveE) {
        // Get Y position from mouse or touch
        const currentY = moveE.type.startsWith('touch') 
          ? moveE.touches[0].clientY 
          : moveE.clientY;
        
        const deltaY = currentY - startY;
        // Snap to 15-minute intervals (0.25 hour)
        const deltaHours = Math.round((deltaY / pixelsPerHour) * 4) / 4;
        
        if (isTop) {
          // Resizing from top (changing start time - can extend into previous day!)
          let newStart = originalStart + deltaHours;
          // Snap to 15-minute intervals and ensure minimum 15-min duration
          newStart = Math.round(newStart * 4) / 4;
          newStart = Math.max(-24, Math.min(newStart, originalEnd - 0.25)); // Allow previous day!
          
          block.dataset.start = newStart;
          
          // Calculate position (can be negative for previous day) - INCLUDE headerHeight!
          const actualTop = newStart < 0 
            ? (dayOffset - 756 + headerHeight + (newStart + 24) * pixelsPerHour) 
            : (dayOffset + headerHeight + (newStart * pixelsPerHour));
          block.style.top = `${actualTop}px`;
          
          // Calculate height - add header if block extends past midnight
          let blockHeight = (originalEnd - newStart) * pixelsPerHour;
          if (originalEnd > 24) blockHeight += headerHeight;
          block.style.height = `${blockHeight}px`;
          
          // Update label (formatHour handles negative hours)
          const startLabel = newStart < 0 ? `${formatHour(newStart + 24)} (-1d)` : formatHour(newStart);
          block.querySelector('.time-block-label').textContent = `${startLabel} - ${formatHour(originalEnd)}`;
          
          // Update loop duplicates
          updateLoopDuplicates(block, newStart, originalEnd, dayOffset);
        } else {
          // Resizing from bottom (changing end time - can extend past midnight!)
          let newEnd = originalEnd + deltaHours;
          // Snap to 15-minute intervals and ensure minimum 15-min duration
          newEnd = Math.round(newEnd * 4) / 4;
          newEnd = Math.max(originalStart + 0.25, newEnd); // Remove 24-hour limit!
          
          // Limit to next day's midnight (48 hours max)
          newEnd = Math.min(newEnd, 48);
          
          block.dataset.end = newEnd;
          
          // Calculate height - add header if block extends past midnight
          let blockHeight = (newEnd - originalStart) * pixelsPerHour;
          if (newEnd > 24) blockHeight += headerHeight;
          block.style.height = `${blockHeight}px`;
          
          // Update label (formatHour handles (+1d) automatically)
          block.querySelector('.time-block-label').textContent = `${formatHour(originalStart)} - ${formatHour(newEnd)}`;
          
          // Update loop duplicates
          updateLoopDuplicates(block, originalStart, newEnd, dayOffset);
        }
      }

      
      function onEnd() {
        block.classList.remove('resizing');
        
        // Remove mouse listeners
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onEnd);
        
        // Remove touch listeners
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onEnd);
        document.removeEventListener('touchcancel', onEnd);
        
        const newStart = parseFloat(block.dataset.start);
        const newEnd = parseFloat(block.dataset.end);
        
        // Check for overlaps after resize
        if (checkOverlap(day, newStart, newEnd, blockId)) {
          alert(`⚠️ Overlap detected! Reverting to original size.`);
          // Revert to original size
          block.dataset.start = originalStart;
          block.dataset.end = originalEnd;
          block.style.top = `${originalTop}px`;
          block.style.height = `${originalHeight}px`;
          block.querySelector('.time-block-label').textContent = `${formatHour(originalStart)} - ${formatHour(originalEnd)}`;
          
          // Revert duplicates too
          updateLoopDuplicates(block, originalStart, originalEnd, dayOffset);
        } else {
          console.log(`✅ Resized block for ${day}: ${formatHour(newStart)} - ${formatHour(newEnd)}`);
        }
      }
      
      // Add both mouse and touch listeners
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onEnd);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onEnd);
      document.addEventListener('touchcancel', onEnd);
    }
  });
}

// Update loop duplicate blocks when original changes
function updateLoopDuplicates(originalBlock, startTime, endTime, dayOffset) {
  const pixelsPerHour = 30;
  const headerHeight = 36; // Day header height
  const weekHeight = 5292;
  
  // Update duplicates before (-1) and after (+1)
  for (let loop = -1; loop <= 1; loop += 2) {
    const duplicate = document.getElementById(`${originalBlock.id}_loop${loop}`);
    if (duplicate) {
      duplicate.dataset.start = startTime;
      duplicate.dataset.end = endTime;
      
      const loopOffset = loop * weekHeight;
      
      // Calculate top position (handle negative start times)
      const actualTop = startTime < 0 
        ? (dayOffset - 756 + headerHeight + (startTime + 24) * pixelsPerHour + loopOffset)
        : (dayOffset + headerHeight + (startTime * pixelsPerHour) + loopOffset);
      
      duplicate.style.top = `${actualTop}px`;
      
      // Calculate height - add header if block extends past midnight
      let blockHeight = (endTime - startTime) * pixelsPerHour;
      if (endTime > 24) blockHeight += headerHeight;
      duplicate.style.height = `${blockHeight}px`;
      
      const label = duplicate.querySelector('.time-block-label');
      if (label) {
        const startLabel = startTime < 0 ? `${formatHour(startTime + 24)} (-1d)` : formatHour(startTime);
        label.textContent = `${startLabel} - ${formatHour(endTime)}`;
      }
      
      // Update day badge if it exists
      const badge = duplicate.querySelector('.time-block-day-badge');
      if (badge) {
        const dayNames = {
          'mon': 'MON', 'tue': 'TUE', 'wed': 'WED', 'thu': 'THU',
          'fri': 'FRI', 'sat': 'SAT', 'sun': 'SUN'
        };
        const day = duplicate.dataset.day;
        badge.textContent = dayNames[day] || day.toUpperCase();
      }
    }
  }
}

// Format hour as 12-hour time with minutes (handles cross-day times)
function formatHour(decimalHour) {
  // Handle hours > 24 (next day)
  let hour = Math.floor(decimalHour);
  const minutes = Math.round((decimalHour - hour) * 60);
  
  // Normalize to 0-23 range
  const normalizedHour = hour % 24;
  
  let displayHour = normalizedHour;
  let period = 'am';
  
  if (normalizedHour === 0) {
    displayHour = 12;
  } else if (normalizedHour === 12) {
    displayHour = 12;
    period = 'pm';
  } else if (normalizedHour > 12) {
    displayHour = normalizedHour - 12;
    period = 'pm';
  }
  
  const timeStr = minutes === 0 
    ? `${displayHour}${period}` 
    : `${displayHour}:${minutes.toString().padStart(2, '0')}${period}`;
  
  // Add +1d indicator for next day times
  return hour >= 24 ? `${timeStr} (+1d)` : timeStr;
}

// Edit a time block (prompt for new times) - vertical timeline
function editTimeBlock(blockId, day) {
  const block = document.getElementById(blockId);
  if (!block) return;
  
  const currentStart = parseInt(block.dataset.start);
  const currentEnd = parseInt(block.dataset.end);
  
  const dayNames = {
    'mon': 'Monday',
    'tue': 'Tuesday',
    'wed': 'Wednesday',
    'thu': 'Thursday',
    'fri': 'Friday',
    'sat': 'Saturday',
    'sun': 'Sunday'
  };
  
  const newStart = prompt(`${dayNames[day]} - Start hour (0-23):\nCurrent: ${formatHour(currentStart)}`, currentStart);
  if (newStart === null) return;
  
  const newEnd = prompt(`${dayNames[day]} - End hour (1-24):\nCurrent: ${formatHour(currentEnd)}`, currentEnd);
  if (newEnd === null) return;
  
  const start = parseInt(newStart);
  const end = parseInt(newEnd);
  
  if (isNaN(start) || isNaN(end) || start < 0 || start > 23 || end < 1 || end > 24) {
    alert('Invalid hours. Please enter 0-23 for start and 1-24 for end.');
    return;
  }
  
  if (start >= end) {
    alert('End time must be after start time.');
    return;
  }
  
  // Update block (vertical positioning)
  const pixelsPerHour = 30;
  const dayBadge = day.toUpperCase().substring(0, 3);
  block.dataset.start = start;
  block.dataset.end = end;
  block.style.top = `${start * pixelsPerHour}px`;
  block.style.height = `${(end - start) * pixelsPerHour}px`;
  block.querySelector('.time-block-label').textContent = `${formatHour(start)} - ${formatHour(end)}`;
  
  // Update or add day badge if it doesn't exist
  let badge = block.querySelector('.time-block-day-badge');
  if (badge) {
    badge.textContent = dayBadge;
  }
}

// Remove a time block and its loop duplicates
function removeTimeBlock(blockId) {
  console.log('🗑️ removeTimeBlock called for:', blockId);
  const block = document.getElementById(blockId);
  if (block) {
    console.log('✅ Found block, removing:', block);
    block.remove();
    
    // Also remove loop duplicates (before and after)
    for (let loop = -1; loop <= 1; loop += 2) {
      const duplicate = document.getElementById(`${blockId}_loop${loop}`);
      if (duplicate) {
        console.log('✅ Found duplicate, removing:', duplicate.id);
        duplicate.remove();
      }
    }
  } else {
    console.log('❌ Block not found:', blockId);
  }
}

// Copy time blocks from one day to another
function copyTimeBlocks(fromDay, toDay) {
  const fromContainer = document.getElementById(`timeBlocks_${fromDay}`);
  const toContainer = document.getElementById(`timeBlocks_${toDay}`);
  
  if (!fromContainer || !toContainer) return;
  
  const fromBlocks = fromContainer.querySelectorAll('.time-block');
  
  if (fromBlocks.length === 0) {
    UpdateUI.showError(`${fromDay.toUpperCase()} has no time blocks to copy.`);
    return;
  }
  
  // Clear target day
  toContainer.innerHTML = '';
  
  // Copy blocks
  fromBlocks.forEach(block => {
    const start = parseInt(block.dataset.start);
    const end = parseInt(block.dataset.end);
    addTimeBlock(toDay, start, end);
  });
  
  UpdateUI.showSuccess(`Copied ${fromBlocks.length} time block(s) to ${toDay.toUpperCase()}`);
}

// Clear all time blocks for all days
function clearAllTimeBlocks() {
  if (!confirm('Clear all opening hours for all days?')) return;
  
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  days.forEach(day => {
    const container = document.getElementById(`timeBlocks_${day}`);
    if (container) {
      container.innerHTML = '';
    }
  });
  
  UpdateUI.showSuccess('All opening hours cleared');
}

// Add time block by clicking on continuous weekly timeline
function addTimeBlockAtClick(event) {
  console.log('🎯 addTimeBlockAtClick called', event.target);
  
  // Don't add if clicking on an existing block
  if (event.target.classList.contains('time-block') || event.target.closest('.time-block')) {
    console.log('❌ Clicked on existing block, ignoring');
    return;
  }
  
  // Calculate which day and hour was clicked
  const track = event.currentTarget;
  const rect = track.getBoundingClientRect();
  const clickY = event.clientY - rect.top + track.parentElement.scrollTop;
  
  const pixelsPerHour = 30;
  const pixelsPerDay = 720; // 24 hours × 30px
  const headerHeight = 36; // Day header height
  const weekHeight = 5292; // One week (7 days × 756px)
  
  // Map clickY to Loop 2 (middle loop where interactive blocks are)
  // Loop 2 starts at 5292px and ends at 10584px
  let normalizedY = clickY;
  
  // If clicked in Loop 1 (0-5292px) or Loop 3 (10584-15876px), map to Loop 2
  if (clickY < weekHeight) {
    // Loop 1 - map to Loop 2
    normalizedY = clickY + weekHeight;
  } else if (clickY >= weekHeight * 2) {
    // Loop 3 - map to Loop 2
    normalizedY = clickY - weekHeight;
  }
  
  // Now calculate day within Loop 2 range (5292-10584px)
  const relativeY = normalizedY - weekHeight; // Subtract Loop 2 start offset
  
  // Calculate day and hour
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const dayIndex = Math.floor(relativeY / (pixelsPerDay + headerHeight));
  const day = days[Math.max(0, Math.min(dayIndex, 6))]; // Clamp to 0-6
  
  // Calculate hour within the day (accounting for header)
  const dayStartPixel = dayIndex * (pixelsPerDay + headerHeight);
  const pixelWithinDay = relativeY - dayStartPixel - headerHeight;
  const clickedHourDecimal = pixelWithinDay / pixelsPerHour;
  
  // Snap to 15-minute intervals (0.25 hour)
  const clickedHour = Math.round(clickedHourDecimal * 4) / 4;
  
  // Add a 2-hour block starting at clicked hour
  const startHour = Math.max(0, Math.min(clickedHour, 22));
  const endHour = Math.min(startHour + 2, 24);
  
  console.log(`📍 Clicked: day=${day}, hour=${clickedHour}, adding block ${formatHour(startHour)}-${formatHour(endHour)}`);
  console.log(`📍 Click details: clickY=${clickY}, normalizedY=${normalizedY}, relativeY=${relativeY}, dayIndex=${dayIndex}, pixelWithinDay=${pixelWithinDay}`);
  
  addTimeBlock(day, startHour, endHour);
}

// Apply Monday's schedule to all days
function applyToAllDays() {
  const fromBlocks = document.getElementById('timeBlocks_mon').querySelectorAll('.time-block');
  
  if (fromBlocks.length === 0) {
    UpdateUI.showError('Monday has no time blocks to copy.');
    return;
  }
  
  if (!confirm(`Copy Monday's schedule to all other days?`)) return;
  
  const days = ['tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  days.forEach(day => {
    const container = document.getElementById(`timeBlocks_${day}`);
    if (container) {
      container.innerHTML = '';
      fromBlocks.forEach(block => {
        const start = parseInt(block.dataset.start);
        const end = parseInt(block.dataset.end);
        addTimeBlock(day, start, end);
      });
    }
  });
  
  UpdateUI.showSuccess(`Applied Monday's schedule to all days`);
}

// Apply to weekdays (Mon-Fri)
function applyToWeekdays() {
  const fromBlocks = document.getElementById('timeBlocks_mon').querySelectorAll('.time-block');
  
  if (fromBlocks.length === 0) {
    UpdateUI.showError('Monday has no time blocks to copy.');
    return;
  }
  
  if (!confirm(`Copy Monday's schedule to Tuesday-Friday?`)) return;
  
  const days = ['tue', 'wed', 'thu', 'fri'];
  days.forEach(day => {
    const container = document.getElementById(`timeBlocks_${day}`);
    if (container) {
      container.innerHTML = '';
      fromBlocks.forEach(block => {
        const start = parseInt(block.dataset.start);
        const end = parseInt(block.dataset.end);
        addTimeBlock(day, start, end);
      });
    }
  });
  
  UpdateUI.showSuccess(`Applied Monday's schedule to weekdays`);
}

// Apply to weekends (Sat-Sun)
function applyToWeekends() {
  const fromBlocks = document.getElementById('timeBlocks_sat').querySelectorAll('.time-block');
  
  if (fromBlocks.length === 0) {
    UpdateUI.showError('Saturday has no time blocks to copy.');
    return;
  }
  
  if (!confirm(`Copy Saturday's schedule to Sunday?`)) return;
  
  const container = document.getElementById('timeBlocks_sun');
  if (container) {
    container.innerHTML = '';
    fromBlocks.forEach(block => {
      const start = parseInt(block.dataset.start);
      const end = parseInt(block.dataset.end);
      addTimeBlock('sun', start, end);
    });
  }
  
  UpdateUI.showSuccess(`Applied Saturday's schedule to Sunday`);
}

// ========================================
// LEGACY OPENING HOURS FUNCTIONS
// ========================================

function addHoursEntry(day, type = 'Open', time = '11:00') {
  const container = document.getElementById(`hoursEntries_${day}`);
  if (!container) {
    // Try new timeline UI instead
    const [hourStr] = time.split(':');
    const hour = parseInt(hourStr);
    if (type === 'Open') {
      addTimeBlock(day, hour, Math.min(hour + 11, 23));
    }
    return;
  }
  
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
    // Try new timeline UI first
    const timelineContainer = document.getElementById(`timeBlocks_${day}`);
    if (timelineContainer) {
      const blocks = timelineContainer.querySelectorAll('.time-block');
      const entries = [];
      
      blocks.forEach(block => {
        // Skip loop duplicates
        if (block.classList.contains('loop-duplicate')) return;
        
        const start = parseFloat(block.dataset.start);
        const end = parseFloat(block.dataset.end);
        
        // Handle blocks that start in previous day
        if (start < 0) {
          // Block starts in previous day
          const prevDayIndex = (days.indexOf(day) - 1 + 7) % 7;
          const prevDay = days[prevDayIndex];
          
          const prevStartTime = start + 24; // Convert to previous day time
          const prevStartHour = Math.floor(prevStartTime);
          const prevStartMin = Math.round((prevStartTime - prevStartHour) * 60);
          const prevTimeStr = `${String(prevStartHour).padStart(2, '0')}:${String(prevStartMin).padStart(2, '0')}`;
          
          // Add to previous day
          if (!opening_hours[prevDay]) {
            opening_hours[prevDay] = [];
          }
          opening_hours[prevDay].push({ type: 'Open', time: prevTimeStr });
          opening_hours[prevDay].push({ type: 'Close', time: '23:59' });
          
          // Current day starts at midnight
          const endHour = Math.floor(end);
          const endMin = Math.round((end - endHour) * 60);
          const endTime = `${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`;
          
          entries.push({ type: 'Open', time: '00:00' });
          entries.push({ type: 'Close', time: endTime });
        } else if (start >= 0 && end <= 24) {
          // Normal block within same day
          const startHour = Math.floor(start);
          const startMin = Math.round((start - startHour) * 60);
          const endHour = Math.floor(end);
          const endMin = Math.round((end - endHour) * 60);
          
          const startTime = `${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}`;
          const endTime = `${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`;
          
          entries.push({ type: 'Open', time: startTime });
          entries.push({ type: 'Close', time: endTime });
        } else if (end > 24) {
          // Cross-day block (extends past midnight)
          const startHour = Math.floor(start);
          const startMin = Math.round((start - startHour) * 60);
          const startTime = `${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}`;
          
          // Open on current day (no close - continues to next day)
          entries.push({ type: 'Open', time: startTime });
          
          // Add continuation close to next day (without open)
          const nextDayIndex = (days.indexOf(day) + 1) % 7;
          const nextDay = days[nextDayIndex];
          
          const overflowEnd = end - 24;
          const endHour = Math.floor(overflowEnd);
          const endMin = Math.round((overflowEnd - endHour) * 60);
          const endTime = `${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`;
          
          // Store close for next day (without open)
          if (!opening_hours[nextDay]) {
            opening_hours[nextDay] = [];
          }
          opening_hours[nextDay].unshift({ type: 'Close', time: endTime }); // Add at beginning
        }
      });
      
      // Sort by time
      entries.sort((a, b) => a.time.localeCompare(b.time));
      
      if (entries.length > 0) {
        // Merge with any existing entries (e.g., Close from previous day's cross-day block)
        if (opening_hours[day] && opening_hours[day].length > 0) {
          // Prepend existing entries (which should be Close from prev day) before new entries
          opening_hours[day] = [...opening_hours[day], ...entries];
        } else {
          opening_hours[day] = entries;
        }
      }
    } else {
      // Fallback to old format (legacy)
      const container = document.getElementById(`hoursEntries_${day}`);
      if (container) {
        const entries = [];
        container.querySelectorAll('.hours-entry').forEach(entry => {
          const type = entry.querySelector('.hours-type').value;
          const time = entry.querySelector('.hours-time').value;
          entries.push({ type, time });
        });
        
        entries.sort((a, b) => a.time.localeCompare(b.time));
        
        if (entries.length > 0) {
          opening_hours[day] = entries;
        }
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
  
  // Try to get from categories state first
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

// Category modal functions
const ICON_LIBRARY = [
  // Food icons
  { url: 'https://ct.ttmenus.com/icons/food/icon-sashimi.webp', category: 'food', name: 'Sashimi' },
  { url: 'https://ct.ttmenus.com/icons/food/icon-salads.webp', category: 'food', name: 'Salads' },
  { url: 'https://ct.ttmenus.com/icons/food/icon-molca.webp', category: 'food', name: 'Savoury' },
  { url: 'https://ct.ttmenus.com/icons/food/icon-Bento.webp', category: 'food', name: 'Bento' },
  { url: 'https://ct.ttmenus.com/icons/food/icon-burger.webp', category: 'food', name: 'Burger' },
  { url: 'https://ct.ttmenus.com/icons/food/icon-chicken.webp', category: 'food', name: 'Chicken' },
  { url: 'https://ct.ttmenus.com/icons/food/icon-dessert.webp', category: 'food', name: 'Dessert' },
  { url: 'https://ct.ttmenus.com/icons/food/icon-drinks.webp', category: 'food', name: 'Drinks' },
  { url: 'https://ct.ttmenus.com/icons/food/icon-fish.webp', category: 'food', name: 'Fish' },
  { url: 'https://ct.ttmenus.com/icons/food/icon-pizza.webp', category: 'food', name: 'Pizza' },
  { url: 'https://ct.ttmenus.com/icons/food/icon-steak.webp', category: 'food', name: 'Steak' },
  
  // White icons
  { url: 'https://ct.ttmenus.com/icons/white/icon-lunchspecial.webp', category: 'white', name: 'Lunch Special' },
  { url: 'https://ct.ttmenus.com/icons/white/icon-sushi.webp', category: 'white', name: 'Sushi' },
  { url: 'https://ct.ttmenus.com/icons/white/icon-rice.webp', category: 'white', name: 'Rice' },
  { url: 'https://ct.ttmenus.com/icons/white/icon-appetizer.webp', category: 'white', name: 'Appetizer' },
  { url: 'https://ct.ttmenus.com/icons/white/icon-cocktail.webp', category: 'white', name: 'Cocktail' },
  { url: 'https://ct.ttmenus.com/icons/white/icon-soup.webp', category: 'white', name: 'Soup' },
  
  // Utilities
  { url: 'https://ct.ttmenus.com/icons/utilities/advertising.svg', category: 'utilities', name: 'Advertising' },
  { url: 'https://ct.ttmenus.com/icons/utilities/star.svg', category: 'utilities', name: 'Star' },
];

let currentIconFilter = '';

async function openCategoryModal(categoryName) {
  console.log('🔍 Attempting to open category modal for:', categoryName);
  console.log('📄 Document ready state:', document.readyState);
  
  const modal = document.getElementById('categoryModal');
  
  if (!modal) {
    console.error('❌ Category modal element not found in DOM');
    console.log('📍 Current URL:', window.location.href);
    console.log('📍 Current pathname:', window.location.pathname);
    console.log('Available modal IDs:', 
      Array.from(document.querySelectorAll('[id*="Modal"]')).map(el => el.id)
    );
    console.log('All elements with class "modal":', 
      document.querySelectorAll('.modal').length
    );
    
    // Check if we're on the update-ui page
    const currentPath = window.location.pathname;
    if (!currentPath.includes('/update-ui')) {
      alert('⚠️ Wrong Page!\n\nYou are not on the Dashboard page.\n\nPlease navigate to:\n/update-ui/\n\nCurrent page: ' + currentPath);
      return;
    }
    
    alert('Error: Category modal not found in the page.\n\nPossible causes:\n1. Page not fully loaded - try refreshing\n2. Wrong page template\n3. Modal HTML missing from layout\n\nCurrent URL: ' + currentPath + '\n\nCheck browser console (F12) for details.');
    return;
  }
  
  console.log('✅ Modal found, proceeding to open...');
  
  if (!UpdateUI.state.categories || UpdateUI.state.categories.length === 0) {
    console.error('❌ Categories not loaded in state. Check console for details.');
    console.log('State:', UpdateUI.state);
    console.log('Menu items count:', UpdateUI.state.menuItems ? UpdateUI.state.menuItems.length : 0);
    
    alert('Error: Categories not loaded.\n\nPossible causes:\n1. No menu items exist\n2. Category _index.md files missing\n3. Data not initialized yet\n\nCheck browser console (F12) for details, then refresh the page.');
    return;
  }
  
  const category = UpdateUI.state.categories.find(c => c.name === categoryName);
  
  if (!category) {
    console.error(`Category "${categoryName}" not found in state. Available:`, UpdateUI.state.categories.map(c => c.name));
    alert(`Error: Category "${categoryName}" not found.`);
    return;
  }
  
  // Debug: Log category data
  console.log('📝 Opening modal for category:', categoryName);
  console.log('Category data:', category);
  
  // Set navigation fields
  document.getElementById('categoryOriginalName').value = categoryName;
  document.getElementById('categoryName').value = categoryName;
  document.getElementById('categoryIconUrl').value = category.icon || '';
  document.getElementById('categoryWeight').value = category.weight !== undefined ? category.weight : 0;
  
  console.log('✅ Set form values:', {
    name: categoryName,
    icon: category.icon || '(empty)',
    weight: category.weight !== undefined ? category.weight : 0
  });
  
  // Show icon preview if icon exists, otherwise show placeholder
  updateIconPreview(category.icon);
  
  if (!category.icon) {
    console.warn('⚠️ No icon found for category. Add icon to category _index.md file.');
  }
  
  // Populate icon gallery
  populateIconGallery();
  
  // Load landing page data from content/_index.md
  // Hugo generates URLs in lowercase, so convert category name
  const categoryPath = categoryName.toLowerCase();
  
  // Try multiple possible paths
  const possiblePaths = [
    `/${categoryPath}/index.json`,      // Hugo default (lowercase)
    `/api/${categoryPath}/index.json`,  // API folder (lowercase)
    `/api/${categoryName}/index.json`   // API folder (original case)
  ];
  
  let landingPageLoaded = false;
  
  for (const path of possiblePaths) {
    try {
      console.log(`  🔍 Trying landing page at: ${path}`);
      const response = await fetch(path);
      
      if (response.ok) {
        const data = await response.json();
        console.log(`  ✅ Found landing page at: ${path}`, data);
        
        // Populate navigation fields from JSON (icon might be here if already saved)
        if (data.icon && !category.icon) {
          document.getElementById('categoryIconUrl').value = data.icon;
          updateIconPreview(data.icon);
        }
        
        // Populate landing page fields
        const heroImage = data.image || '';
        const slideImage = data.slidein?.slideinimage || '';
        
      document.getElementById('categoryHeroImage').value = heroImage;
      document.getElementById('categorySlideImage').value = slideImage;
      document.getElementById('categorySlideDirection').value = data.slidein?.direction || '';
      document.getElementById('categoryBody').value = data.body || '';
        
        // Show hero image preview
        if (heroImage) {
          document.getElementById('categoryHeroImageCurrent').value = heroImage;
          const heroPath = heroImage.startsWith('/') ? heroImage : `/${heroImage}`;
          document.getElementById('categoryHeroPreviewImg').src = heroPath;
          document.getElementById('categoryHeroPath').textContent = heroImage;
          document.getElementById('categoryHeroPreview').style.display = 'block';
        } else {
          document.getElementById('categoryHeroImageCurrent').value = '';
          document.getElementById('categoryHeroPreview').style.display = 'none';
        }
        
        // Show slide image preview
        if (slideImage) {
          document.getElementById('categorySlideImageCurrent').value = slideImage;
          const slidePath = slideImage.startsWith('/') ? slideImage : `/${slideImage}`;
          document.getElementById('categorySlidePreviewImg').src = slidePath;
          document.getElementById('categorySlidePath').textContent = slideImage;
          document.getElementById('categorySlidePreview').style.display = 'block';
        } else {
          document.getElementById('categorySlideImageCurrent').value = '';
          document.getElementById('categorySlidePreview').style.display = 'none';
        }
        
        landingPageLoaded = true;
        console.log('✅ Loaded landing page data for', categoryName);
        break; // Success! Exit loop
      } else {
        console.log(`  ❌ ${path} returned ${response.status}`);
      }
    } catch (error) {
      console.log(`  ❌ ${path} failed:`, error.message);
    }
  }
  
  // If no landing page found after trying all paths
  if (!landingPageLoaded) {
    console.warn('⚠️ No landing page found for', categoryName, 'in any location');
    // Clear landing page fields
      document.getElementById('categoryHeroImage').value = '';
      document.getElementById('categorySlideImage').value = '';
      document.getElementById('categorySlideDirection').value = '';
      document.getElementById('categoryBody').value = '';
      document.getElementById('categoryHeroImageCurrent').value = '';
      document.getElementById('categorySlideImageCurrent').value = '';
      document.getElementById('categoryHeroPreview').style.display = 'none';
      document.getElementById('categorySlidePreview').style.display = 'none';
  }
  
  // Setup file input change handlers
  const heroFileInput = document.getElementById('categoryHeroImageFile');
  const slideFileInput = document.getElementById('categorySlideImageFile');
  
  heroFileInput.onchange = function() {
    if (this.files && this.files[0]) {
      const file = this.files[0];
      document.getElementById('categoryHeroImage').value = `images/${file.name}`;
      
      // Show preview
      const reader = new FileReader();
      reader.onload = function(e) {
        document.getElementById('categoryHeroPreviewImg').src = e.target.result;
        document.getElementById('categoryHeroPath').textContent = `📎 New file: ${file.name}`;
        document.getElementById('categoryHeroPreview').style.display = 'block';
      };
      reader.readAsDataURL(file);
    }
  };
  
  slideFileInput.onchange = function() {
    if (this.files && this.files[0]) {
      const file = this.files[0];
      document.getElementById('categorySlideImage').value = `images/${file.name}`;
      
      // Show preview
      const reader = new FileReader();
      reader.onload = function(e) {
        document.getElementById('categorySlidePreviewImg').src = e.target.result;
        document.getElementById('categorySlidePath').textContent = `📎 New file: ${file.name}`;
        document.getElementById('categorySlidePreview').style.display = 'block';
      };
      reader.readAsDataURL(file);
    }
  };
  
  // Setup icon URL input listener for live preview (remove old listeners first)
  const iconUrlInput = document.getElementById('categoryIconUrl');
  const newInput = iconUrlInput.cloneNode(true);
  iconUrlInput.parentNode.replaceChild(newInput, iconUrlInput);
  
  newInput.addEventListener('input', function() {
    updateIconPreview(this.value);
  });
  
  modal.classList.add('active');
  modal.scrollTop = 0;
}

function closeCategoryModal() {
  document.getElementById('categoryModal').classList.remove('active');
}

function updateIconPreview(iconUrl) {
  // Use correct element IDs from the HTML
  const preview = document.getElementById('iconPreview');
  const placeholder = document.getElementById('iconPreviewPlaceholder');
  const img = document.getElementById('iconPreviewImg');
  
  console.log('🖼️ Updating icon preview:', { iconUrl, preview: !!preview, img: !!img, placeholder: !!placeholder });
  
  if (!img) {
    console.error('❌ Icon preview img element not found!');
    return;
  }
  
  if (iconUrl && iconUrl.trim() !== '') {
    img.src = iconUrl;
    img.style.display = 'block';
    
    if (preview) {
      preview.style.display = 'flex'; // Use flex to maintain centering
    }
    if (placeholder) {
      placeholder.style.display = 'none';
    }
    
    // Handle image load error
    img.onerror = function() {
      console.warn('⚠️ Failed to load icon:', iconUrl);
      img.style.display = 'none';
      if (placeholder) {
        placeholder.style.display = 'block';
        placeholder.textContent = 'Failed to load icon';
      }
    };
    
    // Handle image load success
    img.onload = function() {
      console.log('✅ Icon loaded successfully');
    };
  } else {
    img.style.display = 'none';
    if (preview) {
      preview.style.display = 'flex'; // Keep flex layout even with placeholder
    }
    if (placeholder) {
      placeholder.style.display = 'block';
      placeholder.textContent = 'No icon selected';
    }
  }
}

function populateIconGallery(filter = '') {
  const gallery = document.getElementById('iconGallery');
  const icons = filter ? ICON_LIBRARY.filter(icon => icon.category === filter) : ICON_LIBRARY;
  
  gallery.innerHTML = icons.map(icon => `
    <div onclick="selectIcon('${icon.url}')" style="cursor: pointer; padding: 10px; background: #1f2937; border-radius: 6px; border: 2px solid #374151; transition: all 0.2s; text-align: center;" onmouseover="this.style.borderColor='#3b82f6'; this.style.background='#374151';" onmouseout="this.style.borderColor='#374151'; this.style.background='#1f2937';">
      <img src="${icon.url}" alt="${icon.name}" style="width: 100%; height: 60px; object-fit: contain;" title="${icon.name}">
    </div>
  `).join('');
}

function filterIconsByCategory() {
  const filter = document.getElementById('iconCategoryFilter').value;
  currentIconFilter = filter;
  populateIconGallery(filter);
}

function selectIcon(iconUrl) {
  const iconUrlInput = document.getElementById('categoryIconUrl');
  iconUrlInput.value = iconUrl;
  
  // Update preview to show selected icon
  updateIconPreview(iconUrl);
  
  // Visual feedback - briefly highlight the selected icon
  console.log('✅ Icon selected:', iconUrl);
}

async function saveCategory(event) {
  event.preventDefault();
  
  const originalName = document.getElementById('categoryOriginalName').value;
  const newName = document.getElementById('categoryName').value.trim();
  const iconUrl = document.getElementById('categoryIconUrl').value.trim();
  const weight = parseInt(document.getElementById('categoryWeight').value) || 0;
  
  // Landing page fields
  let heroImage = document.getElementById('categoryHeroImage').value.trim();
  let slideImage = document.getElementById('categorySlideImage').value.trim();
  const slideDirection = document.getElementById('categorySlideDirection').value;
  const body = document.getElementById('categoryBody').value.trim();
  
  // Check for file uploads
  const heroFileInput = document.getElementById('categoryHeroImageFile');
  const slideFileInput = document.getElementById('categorySlideImageFile');
  
  let hasPendingUploads = false;
  const pendingUploads = [];
  
  if (heroFileInput.files && heroFileInput.files[0]) {
    pendingUploads.push({
      file: heroFileInput.files[0],
      type: 'hero',
      name: heroFileInput.files[0].name
    });
    heroImage = `images/${heroFileInput.files[0].name}`;
    hasPendingUploads = true;
  } else if (!heroImage) {
    // Keep current image if no new upload and no path entered
    heroImage = document.getElementById('categoryHeroImageCurrent').value;
  }
  
  if (slideFileInput.files && slideFileInput.files[0]) {
    pendingUploads.push({
      file: slideFileInput.files[0],
      type: 'slide',
      name: slideFileInput.files[0].name
    });
    slideImage = `images/${slideFileInput.files[0].name}`;
    hasPendingUploads = true;
  } else if (!slideImage) {
    // Keep current image if no new upload and no path entered
    slideImage = document.getElementById('categorySlideImageCurrent').value;
  }
  
  if (!newName || !iconUrl) {
    alert('Please fill in all required fields (Name and Icon)');
    return;
  }
  
  // Check if name changed and new name already exists
  if (originalName !== newName) {
    const exists = UpdateUI.state.categories.find(c => c.name === newName && c.name !== originalName);
    if (exists) {
      alert(`Category "${newName}" already exists. Please choose a different name.`);
      return;
    }
  }
  
  // Store pending uploads in sessionStorage (images will be uploaded on publish)
  if (hasPendingUploads) {
    const storageKey = `pending_category_uploads_${newName}`;
    sessionStorage.setItem(storageKey, JSON.stringify({
      uploads: pendingUploads.map(u => ({ type: u.type, name: u.name })),
      timestamp: Date.now()
    }));
    console.log(`📸 Stored ${pendingUploads.length} pending image(s) for category "${newName}"`);
  }
  
  // Update category in state
  UpdateUI.saveCategoryDraft(originalName, newName, iconUrl, weight);
  
  // Save all category data to _index.md (including icon)
  try {
    await UpdateUI.saveCategoryLandingPage(newName, {
      icon: iconUrl,          // Icon is now part of _index.md
      image: heroImage,
      slideImage: slideImage,
      slideDirection: slideDirection,
      weight: weight,
      body: body
    });
      
    // Show success message with upload info
    if (hasPendingUploads) {
      UpdateUI.showSuccess(`Category "${newName}" saved! ${pendingUploads.length} image(s) will upload when published.`);
    }
  } catch (error) {
    console.error('Error saving category landing page:', error);
    UpdateUI.showError(`Category save failed: ${error.message}`);
  }
  
  // Close modal
  closeCategoryModal();
  
  // Update pending summary
  UpdateUI.renderPendingSummary();
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
window.openCategoryModal = openCategoryModal;
window.closeCategoryModal = closeCategoryModal;
window.saveCategory = saveCategory;
window.filterIconsByCategory = filterIconsByCategory;
window.selectIcon = selectIcon;
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
// Legacy hours functions
window.addHoursEntry = addHoursEntry;
window.removeHoursEntry = removeHoursEntry;
window.sortHoursEntries = sortHoursEntries;
window.clearAllHoursEntries = clearAllHoursEntries;
window.getHoursData = getHoursData;
window.copyFromPreviousDay = copyFromPreviousDay;

// Timeline UI functions
window.addTimeBlock = addTimeBlock;
window.removeTimeBlock = removeTimeBlock;
window.copyTimeBlocks = copyTimeBlocks;
window.editTimeBlock = editTimeBlock;
window.formatHour = formatHour;
window.initTimelineStyles = initTimelineStyles;
window.addTimeBlockAtClick = addTimeBlockAtClick;
window.setupBlockResize = setupBlockResize;
window.setupBlockDrag = setupBlockDrag;
window.checkOverlap = checkOverlap;
window.createLoopDuplicates = createLoopDuplicates;
window.updateLoopDuplicates = updateLoopDuplicates;
window.setupInfiniteScroll = setupInfiniteScroll;
window.clearAllTimeBlocks = clearAllTimeBlocks;
window.verifyBlockPositions = verifyBlockPositions;
window.setupBlockSync = setupBlockSync;
window.syncInteractionToOriginal = syncInteractionToOriginal;

// Branding upload modal function (placeholder)
window.openBrandingUploadModal = function() {
  alert('Image Upload Feature\n\nTo add new branding images:\n1. Upload files to themes/_menus_ttms/static/branding/\n2. Rebuild Hugo\n3. Refresh this page\n\nSupported formats: ICO, PNG, WEBP, GIF, JPG');
};

// Get current location using browser Geolocation API
function getCurrentLocation() {
  if (!navigator.geolocation) {
    alert('Geolocation is not supported by your browser');
    return;
  }

  // Show loading state
  const latInput = document.getElementById('locationLat');
  const lonInput = document.getElementById('locationLon');
  
  if (!latInput || !lonInput) {
    alert('Location input fields not found');
    return;
  }

  // Disable inputs while fetching
  latInput.disabled = true;
  lonInput.disabled = true;
  latInput.placeholder = 'Getting location...';
  lonInput.placeholder = 'Getting location...';

  navigator.geolocation.getCurrentPosition(
    function(position) {
      // Success callback
      latInput.value = position.coords.latitude;
      lonInput.value = position.coords.longitude;
      
      // Re-enable inputs
      latInput.disabled = false;
      lonInput.disabled = false;
      latInput.placeholder = '';
      lonInput.placeholder = '';
      
      UpdateUI.showSuccess('Location retrieved successfully!');
    },
    function(error) {
      // Error callback
      let errorMessage = 'Unable to retrieve your location';
      
      switch(error.code) {
        case error.PERMISSION_DENIED:
          errorMessage = 'Location access denied. Please allow location access in your browser settings.';
          break;
        case error.POSITION_UNAVAILABLE:
          errorMessage = 'Location information unavailable.';
          break;
        case error.TIMEOUT:
          errorMessage = 'Location request timed out.';
          break;
      }
      
      // Re-enable inputs
      latInput.disabled = false;
      lonInput.disabled = false;
      latInput.placeholder = '';
      lonInput.placeholder = '';
      
      UpdateUI.showError(errorMessage);
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    }
  );
}

window.getCurrentLocation = getCurrentLocation;

// =============================================================================
// COLLAPSIBLE SECTIONS
// =============================================================================

function toggleSection(headerElement) {
  const section = headerElement.closest('.collapsible-section');
  const content = section.querySelector('.collapsible-content');
  const icon = section.querySelector('.collapse-icon');
  
  if (content.style.display === 'none') {
    content.style.display = 'block';
    icon.textContent = '▼';
    section.classList.remove('collapsed');
  } else {
    content.style.display = 'none';
    icon.textContent = '▶';
    section.classList.add('collapsed');
  }
}

window.toggleSection = toggleSection;

// =============================================================================
// HOUSEKEEPING / IMAGE MANAGEMENT
// =============================================================================

// Helper functions for image scanning
const normalizeImagePath = (path) => {
  if (!path) return '';
  let normalized = String(path).trim();
  normalized = normalized.replace(/^\/+/, '');
  normalized = normalized.replace(/\\/g, '/');
  return normalized;
};

const addUsedImageToManager = (manager, imagePath, location) => {
  const normalized = normalizeImagePath(imagePath);
  if (!normalized) return;
  
  manager.usedImages.add(normalized);
  if (!manager.imageUsageMap.has(normalized)) {
    manager.imageUsageMap.set(normalized, []);
  }
  manager.imageUsageMap.get(normalized).push(location);
  console.log(`Adding ${location}:`, normalized);
};

const HousekeepingManager = {
  allImages: [],
  usedImages: new Set(),
  unusedImages: [],
  selectedForDeletion: new Set(),
  imageUsageMap: new Map(), // Track WHERE each image is used

  async scanImages() {
    try {
      UpdateUI.showSuccess('Scanning image library...');
      
      // Get all available images and normalize
      this.allImages = (window.hugoStaticImages || []).map(normalizeImagePath);
      
      // Reset tracking
      this.usedImages = new Set();
      this.unusedImages = [];
      this.selectedForDeletion = new Set();
      this.imageUsageMap = new Map();
      
      // Ensure HomePageManager is initialized with fresh data
      await HomePageManager.loadCurrentSettings();
      
      console.log('HomePageManager data:', HomePageManager.currentSettings);
      
      // Scan homepage images
      if (HomePageManager.currentSettings) {
        // Hero image
        if (HomePageManager.currentSettings.image) {
          addUsedImageToManager(this, HomePageManager.currentSettings.image, 'Homepage Hero');
        }
        
        // Featured images
        if (HomePageManager.currentSettings.images && Array.isArray(HomePageManager.currentSettings.images)) {
          HomePageManager.currentSettings.images.forEach((img, idx) => {
            if (img && img.image) {
              addUsedImageToManager(this, img.image, `Featured Gallery #${idx + 1}`);
            }
          });
        }
        
        // Tour images
        if (HomePageManager.currentSettings.clienttourimages && Array.isArray(HomePageManager.currentSettings.clienttourimages)) {
          HomePageManager.currentSettings.clienttourimages.forEach((img, idx) => {
            if (img && img.image) {
              addUsedImageToManager(this, img.image, `Tour Gallery #${idx + 1}`);
            }
          });
        }
      }
      
      // Scan Hugo content files directly
      await this.scanHugoContentFiles();
      
      // Scan advertisements from Hugo content
      try {
        const adsResponse = await fetch('/advertisments/index.json');
        if (adsResponse.ok) {
          const adsData = await adsResponse.json();
          console.log('Advertisments data:', adsData);
          
          if (adsData.items && Array.isArray(adsData.items)) {
            adsData.items.forEach(ad => {
              const adTitle = ad.title || 'Untitled Ad';
              
              // Ad images can be an array of objects with .image property or simple strings
              if (ad.images && Array.isArray(ad.images)) {
                ad.images.forEach(img => {
                  if (img) {
                    const imagePath = typeof img === 'string' ? img : (img.image || null);
                    if (imagePath) {
                      addUsedImageToManager(this, imagePath, `Advertisement: ${adTitle}`);
                    }
                  }
                });
              }
            });
          }
        } else {
          console.log('Could not fetch advertisments/index.json');
        }
      } catch (adsError) {
        console.log('Error fetching advertisements:', adsError);
      }
      
      // Also check API endpoint for ads
      try {
        const apiAdsResponse = await fetch(`${UpdateUI.apiConfig.getClientUrl()}/ads`);
        if (apiAdsResponse.ok) {
          const apiAdsData = await apiAdsResponse.json();
          if (apiAdsData.ads && Array.isArray(apiAdsData.ads)) {
            apiAdsData.ads.forEach(ad => {
              if (ad.image) {
                const adTitle = ad.title || 'Untitled Ad';
                addUsedImageToManager(this, ad.image, `Advertisement: ${adTitle}`);
              }
            });
          }
        }
      } catch (apiError) {
        console.log('Could not fetch ads from API:', apiError);
      }
      
      // Determine unused images
      this.unusedImages = this.allImages.filter(img => !this.usedImages.has(img));
      
      console.log('Scan Results:', {
        total: this.allImages.length,
        used: this.usedImages.size,
        unused: this.unusedImages.length,
        usedImagesList: Array.from(this.usedImages),
        unusedImagesList: this.unusedImages
      });
      
      // Display results
      this.displayResults();
      
      UpdateUI.showSuccess(`Scan complete! Found ${this.unusedImages.length} unused images.`);
    } catch (error) {
      console.error('Error scanning images:', error);
      UpdateUI.showError('Error scanning images: ' + error.message);
    }
  },

  async scanHugoContentFiles() {
    try {
      console.log('Scanning Hugo content files from individual category JSON files...');
      
      // List of content directories to scan
      const contentDirs = ['rolls', 'bento', 'specials', 'savoury', 'sashimi', 'bowls', 'salad'];
      
      // Use Promise.allSettled for parallel fetching with error handling
      const fetchPromises = contentDirs.map(async (dir) => {
        try {
          const response = await fetch(`/${dir}/index.json`);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          return { dir, data: await response.json() };
        } catch (error) {
          console.log(`Could not fetch /${dir}/index.json:`, error.message);
          return { dir, error: error.message };
        }
      });
      
      const results = await Promise.allSettled(fetchPromises);
      
      results.forEach((result) => {
        if (result.status === 'fulfilled' && result.value.data) {
          const { dir, data: categoryData } = result.value;
          console.log(`Scanned ${dir}:`, categoryData);
          
          const catName = categoryData.title || dir;
          
          // Category-level image
          if (categoryData.image) {
            addUsedImageToManager(this, categoryData.image, `Category: ${catName}`);
          }
          
          // Category slide-in image
          if (categoryData.slidein && categoryData.slidein.slideinimage) {
            addUsedImageToManager(this, categoryData.slidein.slideinimage, `Category Slide: ${catName}`);
          }
          
          // Scan items in this category
          if (categoryData.items && Array.isArray(categoryData.items)) {
            categoryData.items.forEach(item => {
              const itemName = item.title || 'Unknown Item';
              
              // Item images (can be array of objects with .image property or strings)
              if (item.images && Array.isArray(item.images)) {
                item.images.forEach(img => {
                  if (img) {
                    const imagePath = typeof img === 'string' ? img : (img.image || null);
                    if (imagePath) {
                      addUsedImageToManager(this, imagePath, `Menu Item: ${itemName} (${catName})`);
                    }
                  }
                });
              }
            });
          }
        }
      });
      
      console.log('Hugo content files scan complete');
    } catch (error) {
      console.error('Error scanning Hugo content files:', error);
    }
  },

  displayResults() {
    // Hide initial message, show results
    document.getElementById('housekeepingContent').style.display = 'none';
    document.getElementById('imageUsageResults').style.display = 'block';
    
    // Update statistics
    document.getElementById('totalImagesCount').textContent = this.allImages.length;
    document.getElementById('unusedImagesCount').textContent = this.unusedImages.length;
    document.getElementById('unusedCount').textContent = this.unusedImages.length;
    document.getElementById('usedCount').textContent = this.usedImages.size;
    
    // Render unused images
    this.renderUnusedImages();
    
    // Render used images
    this.renderUsedImages();
  },

  renderUnusedImages() {
    const grid = document.getElementById('unusedImagesGrid');
    
    if (this.unusedImages.length === 0) {
      grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 2rem; color: #6b7280;"><p style="font-size: 1.125rem; margin: 0;">✨ No unused images found!</p><p style="margin: 0.5rem 0 0 0; font-size: 0.875rem;">All images are being used.</p></div>';
      // Reset select all checkbox
      const selectAll = document.getElementById('selectAllUnused');
      if (selectAll) selectAll.checked = false;
      return;
    }
    
    // Sort alphabetically
    const sortedUnused = [...this.unusedImages].sort();
    
    // Use DocumentFragment for better performance
    const fragment = document.createDocumentFragment();
    
    sortedUnused.forEach(imagePath => {
      const filename = imagePath.split('/').pop();
      const card = document.createElement('div');
      card.className = 'housekeeping-image-card';
      card.style.cssText = 'border: 2px solid #fee; border-radius: 8px; overflow: hidden; background: white; position: relative;';
      
      const isSelected = this.selectedForDeletion.has(imagePath);
      
      card.innerHTML = `
        <div style="position: relative;">
          <img src="/${imagePath}" alt="${filename}" style="width: 100%; height: 140px; object-fit: cover;">
          <div style="position: absolute; top: 0.5rem; right: 0.5rem;">
            <input type="checkbox" 
              class="unused-image-checkbox" 
              data-image-path="${imagePath}" 
              ${isSelected ? 'checked' : ''}
              style="width: 20px; height: 20px; cursor: pointer;">
          </div>
        </div>
        <div style="padding: 0.5rem; background: #fff5f5;">
          <p style="font-size: 0.75rem; color: #dc2626; font-weight: 600; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${filename}</p>
          <p style="font-size: 0.7rem; color: #6b7280; margin: 0.25rem 0 0 0;">Not in use</p>
        </div>
      `;
      
      // Add checkbox change handler
      const checkbox = card.querySelector('.unused-image-checkbox');
      checkbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          this.selectedForDeletion.add(imagePath);
        } else {
          this.selectedForDeletion.delete(imagePath);
        }
        this.updateDeleteButton();
      });
      
      fragment.appendChild(card);
    });
    
    // Single DOM update
    grid.innerHTML = '';
    grid.appendChild(fragment);
  },

  renderUsedImages() {
    const grid = document.getElementById('usedImagesGrid');
    
    const usedImagesArray = Array.from(this.usedImages).sort();
    
    if (usedImagesArray.length === 0) {
      grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 2rem; color: #6b7280;">No images are currently in use.</div>';
      return;
    }
    
    // Use DocumentFragment for better performance
    const fragment = document.createDocumentFragment();
    
    usedImagesArray.forEach(imagePath => {
      const filename = imagePath.split('/').pop();
      const usageLocations = this.imageUsageMap.get(imagePath) || [];
      const usageCount = usageLocations.length;
      
      const card = document.createElement('div');
      card.style.cssText = 'border: 2px solid #d1fae5; border-radius: 8px; overflow: hidden; background: white;';
      
      // Generate usage summary
      let usageSummary = '✓ In use';
      if (usageCount > 0) {
        usageSummary = `Used in ${usageCount} ${usageCount === 1 ? 'location' : 'locations'}`;
      }
      
      // Generate detailed usage tooltip
      const usageDetails = usageLocations.length > 0 ? usageLocations.join('\n• ') : 'Unknown location';
      
      card.innerHTML = `
        <img src="/${imagePath}" alt="${filename}" style="width: 100%; height: 140px; object-fit: cover;">
        <div style="padding: 0.5rem; background: #f0fdf4;">
          <p style="font-size: 0.75rem; color: #16a34a; font-weight: 600; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${filename}">${filename}</p>
          <p style="font-size: 0.7rem; color: #6b7280; margin: 0.25rem 0 0 0;" title="• ${usageDetails}">${usageSummary}</p>
        </div>
      `;
      
      fragment.appendChild(card);
    });
    
    // Single DOM update
    grid.innerHTML = '';
    grid.appendChild(fragment);
  },

  updateDeleteButton() {
    const deleteBtn = document.getElementById('deleteSelectedBtn');
    if (this.selectedForDeletion.size > 0) {
      deleteBtn.style.display = 'block';
      deleteBtn.textContent = `🗑️ Delete Selected (${this.selectedForDeletion.size})`;
    } else {
      deleteBtn.style.display = 'none';
    }
  },

  async deleteSelected() {
    if (this.selectedForDeletion.size === 0) {
      UpdateUI.showError('No images selected for deletion');
      return;
    }
    
    const confirmMsg = `Are you sure you want to delete ${this.selectedForDeletion.size} image(s)? This action cannot be undone.`;
    if (!confirm(confirmMsg)) {
      return;
    }
    
    try {
      const imagesToDelete = Array.from(this.selectedForDeletion);
      
      // Send delete request to API
      const response = await fetch(`${UpdateUI.apiConfig.getClientUrl()}/images/delete`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken') || ''}`
        },
        body: JSON.stringify({
          images: imagesToDelete
        })
      });
      
      if (response.ok) {
        UpdateUI.showSuccess(`Successfully deleted ${imagesToDelete.length} image(s)!`);
        
        // Refresh the scan
        await this.scanImages();
        
        // Reload available images for other sections
        if (HomePageManager) {
          await HomePageManager.loadAvailableImages();
        }
      } else {
        throw new Error('Failed to delete images');
      }
    } catch (error) {
      console.error('Error deleting images:', error);
      UpdateUI.showError('Failed to delete images: ' + error.message);
    }
  }
};

// Global functions
function scanImageUsage() {
  HousekeepingManager.scanImages();
}

function toggleSelectAllUnused() {
  const checkbox = document.getElementById('selectAllUnused');
  const allCheckboxes = document.querySelectorAll('.unused-image-checkbox');
  
  if (checkbox.checked) {
    allCheckboxes.forEach(cb => {
      cb.checked = true;
      const imagePath = cb.getAttribute('data-image-path');
      HousekeepingManager.selectedForDeletion.add(imagePath);
    });
  } else {
    allCheckboxes.forEach(cb => {
      cb.checked = false;
    });
    HousekeepingManager.selectedForDeletion.clear();
  }
  
  HousekeepingManager.updateDeleteButton();
}

function deleteSelectedImages() {
  HousekeepingManager.deleteSelected();
}

// =============================================================================
// HOME PAGE SETTINGS
// =============================================================================

const HomePageManager = {
  availableImages: [],
  currentSettings: {
    image: '',
    images: [],
    clienttourimages: [],
    content: ''
  },
  manifestSettings: {
    name: '',
    short_name: '',
    description: '',
    theme_color: '#667eea',
    background_color: '#ffffff',
    start_url: '.',
    display: 'standalone',
    orientation: 'any',
    icons: [],
    screenshots: []
  },
  siteSettings: {
    title: '',
    social: {
      facebook: '',
      instagram: '',
      tiktok: '',
      youtube: '',
      email: '',
      phone: ''
    },
    orderingsystem: {
      whatsapp: ''
    }
  },
  currentSelectionTarget: null, // Track what we're selecting for
  currentSelectionIndex: null,  // Track which gallery item
  selectedImages: new Set(),     // Track multiple selected images

  async init() {
    await this.loadAvailableImages();
    await this.loadCurrentSettings();
    await this.loadManifestSettings();
    await this.loadSiteSettings();
    this.populateForm();
    this.setupUploadHandlers();
    this.setupManifestColorSync();
  },

  async loadAvailableImages() {
    try {
      // Fetch the list of images from the static/images directory
      const response = await fetch('/images/');
      const html = await response.text();
      
      // Parse image files from directory listing
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const links = doc.querySelectorAll('a');
      
      this.availableImages = [];
      links.forEach(link => {
        const href = link.getAttribute('href');
        if (href && (href.endsWith('.jpg') || href.endsWith('.jpeg') || href.endsWith('.png') || 
                     href.endsWith('.webp') || href.endsWith('.gif') || href.endsWith('.PNG'))) {
          this.availableImages.push('images/' + href);
        }
      });

      // Fallback: use Hugo's data if directory listing is disabled
      if (this.availableImages.length === 0 && window.hugoStaticImages) {
        this.availableImages = window.hugoStaticImages;
      }

      console.log('Available images:', this.availableImages);
    } catch (error) {
      console.error('Error loading images:', error);
      UpdateUI.showError('Failed to load available images');
    }
  },

  async loadCurrentSettings() {
    try {
      // Load from Hugo's home.json (generated by home.json.json template)
      const response = await fetch('/index.json');
      if (response.ok) {
        const data = await response.json();
        this.currentSettings = {
          image: data.hero_background_image || data.image || '',
          images: data.featured_images || data.images || [],
          clienttourimages: data.client_tour_images || data.clienttourimages || [],
          content: data.content || ''
        };
        console.log('Loaded home page settings:', this.currentSettings);
      }
    } catch (error) {
      console.log('Using default settings:', error);
    }
  },

  async loadManifestSettings() {
    try {
      const response = await fetch('/manifest.json');
      if (response.ok) {
        const data = await response.json();
        this.manifestSettings = {
          name: data.name || '',
          short_name: data.short_name || '',
          description: data.description || '',
          theme_color: data.theme_color || '#667eea',
          background_color: data.background_color || '#ffffff',
          start_url: data.start_url || '.',
          display: data.display || 'standalone',
          orientation: data.orientation || 'any',
          icons: data.icons || [],
          screenshots: data.screenshots || []
        };
        console.log('Loaded manifest settings:', this.manifestSettings);
      }
    } catch (error) {
      console.log('Using default manifest settings:', error);
    }
  },

  async loadSiteSettings() {
    try {
      // Load Hugo site config from window object (injected by Hugo template)
      if (window.hugoSiteConfig) {
        const data = window.hugoSiteConfig;
        
        // Helper function to clean empty or quoted strings
        const cleanValue = (val) => {
          if (!val || val === '""' || val === "''") return '';
          let cleaned = String(val);
          // Remove surrounding quotes if present
          if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || 
              (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
            cleaned = cleaned.slice(1, -1);
          }
          return cleaned;
        };
        
        this.siteSettings = {
          title: cleanValue(data.title),
          social: {
            facebook: cleanValue(data.params?.social?.facebook),
            instagram: cleanValue(data.params?.social?.instagram),
            tiktok: cleanValue(data.params?.social?.tiktok),
            youtube: cleanValue(data.params?.social?.youtube),
            email: cleanValue(data.params?.social?.email),
            phone: cleanValue(data.params?.social?.phone)
          },
          orderingsystem: {
            whatsapp: cleanValue(data.params?.orderingsystem?.whatsapp)
          }
        };
        console.log('Loaded site settings:', this.siteSettings);
      } else {
        console.log('No Hugo site config found, using defaults');
      }
    } catch (error) {
      console.log('Error loading site settings:', error);
    }
  },

  populateForm() {
    // Render hero image
    this.renderHeroImage();

    // Populate featured images
    this.renderFeaturedImages();

    // Populate tour images
    this.renderTourImages();

    // Populate manifest fields
    this.populateManifestForm();

    // Populate site settings fields
    this.populateSiteSettingsForm();

    // Populate page content
    const contentTextarea = document.getElementById('homePageContent');
    if (contentTextarea) {
      contentTextarea.value = this.currentSettings.content || '';
    }
  },

  populateManifestForm() {
    const fields = {
      manifestName: this.manifestSettings.name,
      manifestShortName: this.manifestSettings.short_name,
      manifestDescription: this.manifestSettings.description,
      manifestThemeColor: this.manifestSettings.theme_color,
      manifestThemeColorText: this.manifestSettings.theme_color,
      manifestBgColor: this.manifestSettings.background_color,
      manifestBgColorText: this.manifestSettings.background_color,
      manifestStartUrl: this.manifestSettings.start_url,
      manifestDisplay: this.manifestSettings.display,
      manifestOrientation: this.manifestSettings.orientation
    };

    Object.entries(fields).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element && value) {
        element.value = value;
      }
    });
  },

  populateSiteSettingsForm() {
    const fields = {
      siteTitle: this.siteSettings.title,
      socialFacebook: this.siteSettings.social.facebook,
      socialInstagram: this.siteSettings.social.instagram,
      socialTiktok: this.siteSettings.social.tiktok,
      socialYoutube: this.siteSettings.social.youtube,
      socialEmail: this.siteSettings.social.email,
      socialPhone: this.siteSettings.social.phone,
      orderingWhatsapp: this.siteSettings.orderingsystem.whatsapp
    };

    Object.entries(fields).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) {
        // Filter out empty strings, null, undefined, and literal '""' strings
        let cleanValue = '';
        if (value && value !== '""' && value !== "''") {
          cleanValue = String(value);
          // Remove surrounding quotes if present
          if ((cleanValue.startsWith('"') && cleanValue.endsWith('"')) || 
              (cleanValue.startsWith("'") && cleanValue.endsWith("'"))) {
            cleanValue = cleanValue.slice(1, -1);
          }
        }
        element.value = cleanValue;
      }
    });
  },

  setupManifestColorSync() {
    // Sync color picker with text input for theme color
    const themeColorPicker = document.getElementById('manifestThemeColor');
    const themeColorText = document.getElementById('manifestThemeColorText');
    
    if (themeColorPicker && themeColorText) {
      themeColorPicker.addEventListener('input', (e) => {
        themeColorText.value = e.target.value;
      });
      
      themeColorText.addEventListener('input', (e) => {
        if (/^#[0-9A-F]{6}$/i.test(e.target.value)) {
          themeColorPicker.value = e.target.value;
        }
      });
    }

    // Sync color picker with text input for background color
    const bgColorPicker = document.getElementById('manifestBgColor');
    const bgColorText = document.getElementById('manifestBgColorText');
    
    if (bgColorPicker && bgColorText) {
      bgColorPicker.addEventListener('input', (e) => {
        bgColorText.value = e.target.value;
      });
      
      bgColorText.addEventListener('input', (e) => {
        if (/^#[0-9A-F]{6}$/i.test(e.target.value)) {
          bgColorPicker.value = e.target.value;
        }
      });
    }
  },

  renderHeroImage() {
    const preview = document.getElementById('heroImagePreview');
    if (!preview) return;

    if (this.currentSettings.image) {
      preview.innerHTML = `
        <div style="position: relative;">
          <img src="/${this.currentSettings.image}" alt="Hero Image" style="max-width: 100%; max-height: 250px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <button onclick="HomePageManager.removeHeroImage()" style="position: absolute; top: 8px; right: 8px; background: #ef4444; color: white; border: none; border-radius: 50%; width: 32px; height: 32px; cursor: pointer; font-size: 1.2rem; line-height: 1;">×</button>
        </div>
        <p style="font-size: 0.875rem; color: #6b7280; margin-top: 0.5rem; text-align: center;">${this.currentSettings.image.replace('images/', '')}</p>
      `;
    } else {
      preview.innerHTML = '<span style="color: #9ca3af;">No image selected</span>';
    }
  },

  removeHeroImage() {
    this.currentSettings.image = '';
    this.renderHeroImage();
  },

  renderFeaturedImages() {
    const container = document.getElementById('featuredImagesGrid');
    if (!container) return;

    container.innerHTML = '';
    this.currentSettings.images.forEach((imgObj, index) => {
      const card = document.createElement('div');
      card.style.cssText = 'border: 2px solid #e5e7eb; border-radius: 8px; overflow: hidden; background: white; position: relative;';
      
      if (imgObj.image) {
        card.innerHTML = `
          <img src="/${imgObj.image}" alt="Featured Image" style="width: 100%; height: 150px; object-fit: cover;">
          <div style="padding: 0.5rem;">
            <p style="font-size: 0.75rem; color: #6b7280; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${imgObj.image.replace('images/', '')}</p>
            <div style="display: flex; gap: 0.25rem; margin-top: 0.5rem;">
              <button onclick="HomePageManager.selectFeaturedImage(${index})" class="btn btn-sm btn-secondary" style="flex: 1; font-size: 0.75rem;">Change</button>
              <button onclick="HomePageManager.removeFeaturedImage(${index})" class="btn btn-sm btn-danger" style="font-size: 0.75rem;">🗑️</button>
            </div>
          </div>
        `;
      } else {
        card.innerHTML = `
          <div style="height: 150px; display: flex; align-items: center; justify-content: center; background: #f3f4f6; color: #9ca3af;">
            No Image
          </div>
          <div style="padding: 0.5rem;">
            <button onclick="HomePageManager.selectFeaturedImage(${index})" class="btn btn-sm btn-primary" style="width: 100%; font-size: 0.75rem;">📁 Select</button>
          </div>
        `;
      }
      
      container.appendChild(card);
    });
  },

  renderTourImages() {
    const container = document.getElementById('tourImagesGrid');
    if (!container) return;

    container.innerHTML = '';
    this.currentSettings.clienttourimages.forEach((imgObj, index) => {
      const card = document.createElement('div');
      card.style.cssText = 'border: 2px solid #e5e7eb; border-radius: 8px; overflow: hidden; background: white; position: relative;';
      
      if (imgObj.image) {
        card.innerHTML = `
          <img src="/${imgObj.image}" alt="Tour Image" style="width: 100%; height: 150px; object-fit: cover;">
          <div style="padding: 0.5rem;">
            <p style="font-size: 0.75rem; color: #6b7280; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${imgObj.image.replace('images/', '')}</p>
            <div style="display: flex; gap: 0.25rem; margin-top: 0.5rem;">
              <button onclick="HomePageManager.selectTourImage(${index})" class="btn btn-sm btn-secondary" style="flex: 1; font-size: 0.75rem;">Change</button>
              <button onclick="HomePageManager.removeTourImage(${index})" class="btn btn-sm btn-danger" style="font-size: 0.75rem;">🗑️</button>
            </div>
          </div>
        `;
      } else {
        card.innerHTML = `
          <div style="height: 150px; display: flex; align-items: center; justify-content: center; background: #f3f4f6; color: #9ca3af;">
            No Image
          </div>
          <div style="padding: 0.5rem;">
            <button onclick="HomePageManager.selectTourImage(${index})" class="btn btn-sm btn-primary" style="width: 100%; font-size: 0.75rem;">📁 Select</button>
          </div>
        `;
      }
      
      container.appendChild(card);
    });
  },

  selectFeaturedImage(index) {
    this.currentSelectionTarget = 'featured';
    this.currentSelectionIndex = index;
    this.openImageLibraryModal();
  },

  selectTourImage(index) {
    this.currentSelectionTarget = 'tour';
    this.currentSelectionIndex = index;
    this.openImageLibraryModal();
  },

  addFeaturedImage() {
    this.currentSelectionTarget = 'featured';
    this.currentSelectionIndex = null; // null means add multiple
    this.openImageLibraryModal();
  },

  removeFeaturedImage(index) {
    this.currentSettings.images.splice(index, 1);
    this.renderFeaturedImages();
  },

  addTourImage() {
    this.currentSelectionTarget = 'tour';
    this.currentSelectionIndex = null; // null means add multiple
    this.openImageLibraryModal();
  },

  removeTourImage(index) {
    this.currentSettings.clienttourimages.splice(index, 1);
    this.renderTourImages();
  },

  // Image Library Modal
  openImageLibraryModal() {
    const modal = document.getElementById('imageLibraryModal');
    const grid = document.getElementById('imageLibraryGrid');
    
    if (!modal || !grid) return;

    // Clear previous selections
    this.selectedImages.clear();

    // Populate grid with images
    grid.innerHTML = '';
    this.availableImages.forEach(imagePath => {
      const card = document.createElement('div');
      card.className = 'image-select-card';
      card.dataset.imagePath = imagePath;
      card.style.cssText = 'position: relative; border: 3px solid #e5e7eb; border-radius: 8px; overflow: hidden; cursor: pointer; transition: all 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.1); height: fit-content; display: flex; flex-direction: column;';
      
      const filename = imagePath.replace('images/', '');
      card.innerHTML = `
        <div style="position: absolute; top: 8px; right: 8px; z-index: 10; background: white; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,0.2);">
          <input type="checkbox" style="width: 20px; height: 20px; cursor: pointer; margin: 0;" onclick="event.stopPropagation();">
        </div>
        <img src="/${imagePath}" alt="${filename}" style="width: 100%; height: 140px; object-fit: cover; background: #f3f4f6; pointer-events: none;">
        <div style="padding: 0.75rem; background: white; min-height: 60px; display: flex; align-items: center; justify-content: center;">
          <p style="font-size: 0.875rem; color: #111827; margin: 0; text-align: center; line-height: 1.4; word-break: break-word; font-weight: 600; pointer-events: none;">${filename}</p>
        </div>
      `;
      
      const checkbox = card.querySelector('input[type="checkbox"]');
      
      // Toggle selection on card click
      card.addEventListener('click', () => {
        checkbox.checked = !checkbox.checked;
        this.toggleImageSelection(imagePath, card, checkbox.checked);
      });
      
      // Also handle checkbox click directly
      checkbox.addEventListener('change', (e) => {
        this.toggleImageSelection(imagePath, card, e.target.checked);
      });
      
      card.title = filename; // Tooltip on hover
      
      grid.appendChild(card);
    });

    // Update image count
    const imageCountEl = document.getElementById('imageCount');
    if (imageCountEl) {
      imageCountEl.textContent = this.availableImages.length;
    }
    
    // Update selected count
    this.updateSelectedCount();

    // Setup search
    const searchInput = document.getElementById('imageSearchInput');
    if (searchInput) {
      searchInput.value = '';
      searchInput.oninput = (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const cards = grid.children;
        for (let card of cards) {
          const text = card.textContent.toLowerCase();
          card.style.display = text.includes(searchTerm) ? 'block' : 'none';
        }
      };
    }

    modal.style.display = 'flex';
  },

  toggleImageSelection(imagePath, card, isSelected) {
    if (isSelected) {
      this.selectedImages.add(imagePath);
      card.style.borderColor = '#3b82f6';
      card.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.3)';
      card.style.transform = 'scale(0.98)';
    } else {
      this.selectedImages.delete(imagePath);
      card.style.borderColor = '#e5e7eb';
      card.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
      card.style.transform = 'scale(1)';
    }
    
    this.updateSelectedCount();
  },

  updateSelectedCount() {
    const countEl = document.getElementById('selectedImageCount');
    if (countEl) {
      const count = this.selectedImages.size;
      countEl.textContent = count > 0 ? `${count} selected` : '0 selected';
      
      // Enable/disable select button
      const selectBtn = document.getElementById('selectImagesBtn');
      if (selectBtn) {
        selectBtn.disabled = count === 0;
        selectBtn.style.opacity = count === 0 ? '0.5' : '1';
        selectBtn.style.cursor = count === 0 ? 'not-allowed' : 'pointer';
      }
    }
  },

  closeImageLibraryModal() {
    const modal = document.getElementById('imageLibraryModal');
    if (modal) {
      modal.style.display = 'none';
      this.selectedImages.clear();
    }
  },

  selectImageFromLibrary() {
    const selectedArray = Array.from(this.selectedImages);
    
    if (selectedArray.length === 0) {
      return;
    }

    if (this.currentSelectionTarget === 'hero') {
      // For hero, use first selected image
      this.currentSettings.image = selectedArray[0];
      this.renderHeroImage();
    } else if (this.currentSelectionTarget === 'featured') {
      if (this.currentSelectionIndex !== null) {
        // Replace specific item
        this.currentSettings.images[this.currentSelectionIndex].image = selectedArray[0];
      } else {
        // Add all selected images
        selectedArray.forEach(imagePath => {
          this.currentSettings.images.push({ image: imagePath });
        });
      }
      this.renderFeaturedImages();
    } else if (this.currentSelectionTarget === 'tour') {
      if (this.currentSelectionIndex !== null) {
        // Replace specific item
        this.currentSettings.clienttourimages[this.currentSelectionIndex].image = selectedArray[0];
      } else {
        // Add all selected images
        selectedArray.forEach(imagePath => {
          this.currentSettings.clienttourimages.push({ image: imagePath });
        });
      }
      this.renderTourImages();
    }
    
    this.closeImageLibraryModal();
  },

  // Upload Handlers
  setupUploadHandlers() {
    const heroInput = document.getElementById('heroImageUploadInput');
    const galleryInput = document.getElementById('galleryImageUploadInput');
    const tourInput = document.getElementById('tourImageUploadInput');

    if (heroInput) {
      heroInput.onchange = (e) => this.handleImageUpload(e, 'hero');
    }

    if (galleryInput) {
      galleryInput.onchange = (e) => this.handleImageUpload(e, 'gallery');
    }

    if (tourInput) {
      tourInput.onchange = (e) => this.handleImageUpload(e, 'tour');
    }
  },

  async handleImageUpload(event, target) {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      UpdateUI.showError('Please select an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      UpdateUI.showError('Image size must be less than 5MB');
      return;
    }

    try {
      // Create FormData
      const formData = new FormData();
      formData.append('image', file);
      formData.append('folder', 'images');

      // Upload to server
      UpdateUI.showSuccess('Uploading image...');
      
      const response = await fetch(`${UpdateUI.apiConfig.getClientUrl()}/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken') || ''}`
        },
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        const imagePath = data.path || `images/${file.name}`;
        
        // Add to available images
        this.availableImages.push(imagePath);
        
        // Set the image
        if (target === 'hero') {
          this.currentSettings.image = imagePath;
          this.renderHeroImage();
        } else if (target === 'gallery') {
          // Check if we're changing an existing image or adding new
          if (this.currentSelectionIndex !== null) {
            // Changing existing image
            if (this.currentSelectionTarget === 'featured') {
              this.currentSettings.images[this.currentSelectionIndex].image = imagePath;
            } else if (this.currentSelectionTarget === 'tour') {
              this.currentSettings.clienttourimages[this.currentSelectionIndex].image = imagePath;
            }
          } else {
            // Adding new image
            this.currentSettings.images.push({ image: imagePath });
          }
          this.renderFeaturedImages();
        } else if (target === 'tour') {
          // Check if we're changing an existing image or adding new
          if (this.currentSelectionIndex !== null) {
            // Changing existing image
            this.currentSettings.clienttourimages[this.currentSelectionIndex].image = imagePath;
          } else {
            // Adding new image
            this.currentSettings.clienttourimages.push({ image: imagePath });
          }
          this.renderTourImages();
        }
        
        // Reset selection tracking
        this.currentSelectionTarget = null;
        this.currentSelectionIndex = null;
        
        UpdateUI.showSuccess('Image uploaded successfully!');
      } else {
        throw new Error('Upload failed');
      }
    } catch (error) {
      console.error('Upload error:', error);
      UpdateUI.showError('Failed to upload image: ' + error.message);
    }

    // Reset input
    event.target.value = '';
  },

  saveDraft() {
    try {
      // Get page content
      const pageContent = document.getElementById('homePageContent').value || '';

      // Prepare homepage data (matching HomePage model)
      const homepageData = {
        image: this.currentSettings.image,
        images: this.currentSettings.images.filter(img => img.image),
        clienttourimages: this.currentSettings.clienttourimages.filter(img => img.image),
        content: pageContent
      };

      // Collect site settings
      const siteConfigData = {
        title: document.getElementById('siteTitle').value,
        params: {
          social: {
            facebook: document.getElementById('socialFacebook').value,
            instagram: document.getElementById('socialInstagram').value,
            tiktok: document.getElementById('socialTiktok').value,
            youtube: document.getElementById('socialYoutube').value,
            email: document.getElementById('socialEmail').value,
            phone: document.getElementById('socialPhone').value
          },
          orderingsystem: {
            whatsapp: document.getElementById('orderingWhatsapp').value
          }
        }
      };

      // Save to localStorage as draft
      const draftData = {
        homepage: homepageData,
        config: siteConfigData,
        timestamp: new Date().toISOString()
      };

      localStorage.setItem(UpdateUI.storageKeys.draftHomePage, JSON.stringify(draftData));
      
      console.log('Homepage draft saved:', draftData);
      
      UpdateUI.showSuccess('Home page settings saved as draft!');
      UpdateUI.checkPendingChanges();
      UpdateUI.renderPendingSummary();
      
    } catch (error) {
      console.error('Error saving draft:', error);
      UpdateUI.showError('Failed to save draft: ' + error.message);
    }
  },

  getDraft() {
    const draft = localStorage.getItem(UpdateUI.storageKeys.draftHomePage);
    return draft ? JSON.parse(draft) : null;
  },

  async publishDraft() {
    try {
      const draft = this.getDraft();
      if (!draft) {
        throw new Error('No draft to publish');
      }

      console.log('Publishing homepage draft:', draft);

      // Save homepage
      const homepageResponse = await fetch(`${UpdateUI.apiConfig.getClientUrl()}/homepage`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken') || ''}`
        },
        body: JSON.stringify(draft.homepage)
      });

      if (!homepageResponse.ok) {
        const errorData = await homepageResponse.json().catch(() => ({}));
        throw new Error(`Homepage save failed: ${errorData.error || homepageResponse.statusText}`);
      }

      // Save config
      const configResponse = await fetch(`${UpdateUI.apiConfig.getClientUrl()}/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken') || ''}`
        },
        body: JSON.stringify(draft.config)
      });

      if (!configResponse.ok) {
        const errorData = await configResponse.json().catch(() => ({}));
        throw new Error(`Config save failed: ${errorData.error || configResponse.statusText}`);
      }

      // Clear draft after successful publish
      localStorage.removeItem(UpdateUI.storageKeys.draftHomePage);
      
      UpdateUI.showSuccess('Home page settings published successfully!');
      await this.loadCurrentSettings();
      await this.loadSiteSettings();
      UpdateUI.checkPendingChanges();
      UpdateUI.renderPendingSummary();
      
      return true;
      
    } catch (error) {
      console.error('Error publishing homepage:', error);
      UpdateUI.showError('Failed to publish homepage: ' + error.message);
      return false;
    }
  },

  discardDraft() {
    localStorage.removeItem(UpdateUI.storageKeys.draftHomePage);
    this.loadCurrentSettings();
    this.loadSiteSettings();
    this.populateForm();
    this.populateSiteSettingsForm();
    UpdateUI.showSuccess('Home page draft discarded');
    UpdateUI.checkPendingChanges();
    UpdateUI.renderPendingSummary();
  }
};

// Global functions for onclick handlers
function addFeaturedImage() {
  HomePageManager.addFeaturedImage();
}

function addTourImage() {
  HomePageManager.addTourImage();
}

function saveHomePageSettings() {
  HomePageManager.saveDraft();
}

async function saveManifestSettings() {
  try {
    // Collect manifest settings (preserve icons and screenshots)
    const manifestData = {
      name: document.getElementById('manifestName').value,
      short_name: document.getElementById('manifestShortName').value,
      description: document.getElementById('manifestDescription').value,
      theme_color: document.getElementById('manifestThemeColorText').value,
      background_color: document.getElementById('manifestBgColorText').value,
      start_url: document.getElementById('manifestStartUrl').value,
      display: document.getElementById('manifestDisplay').value,
      orientation: document.getElementById('manifestOrientation').value,
      icons: HomePageManager.manifestSettings.icons || [],
      screenshots: HomePageManager.manifestSettings.screenshots || []
    };

    // Save manifest
    const manifestResponse = await fetch(`${UpdateUI.apiConfig.getClientUrl()}/manifest`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('authToken') || ''}`
      },
      body: JSON.stringify(manifestData)
    });

    if (manifestResponse.ok) {
      UpdateUI.showSuccess('PWA manifest saved successfully!');
      await HomePageManager.loadManifestSettings();
    } else {
      throw new Error('Failed to save manifest');
    }
  } catch (error) {
    console.error('Error saving manifest:', error);
    UpdateUI.showError('Failed to save manifest: ' + error.message);
  }
}

function selectHeroImage() {
  HomePageManager.currentSelectionTarget = 'hero';
  HomePageManager.openImageLibraryModal();
}

function uploadHeroImage() {
  HomePageManager.currentSelectionTarget = 'hero';
  document.getElementById('heroImageUploadInput').click();
}

function uploadFeaturedImage() {
  HomePageManager.currentSelectionTarget = 'gallery';
  document.getElementById('galleryImageUploadInput').click();
}

function uploadTourImage() {
  HomePageManager.currentSelectionTarget = 'tour';
  document.getElementById('tourImageUploadInput').click();
}

function uploadGalleryImage(target, index) {
  HomePageManager.currentSelectionTarget = target;
  HomePageManager.currentSelectionIndex = index;
  document.getElementById('galleryImageUploadInput').click();
}

function closeImageLibraryModal() {
  HomePageManager.closeImageLibraryModal();
}

function discardHomePageDraft() {
  if (confirm('Discard all home page changes?\n\nThis will reset to the published version.')) {
    HomePageManager.discardDraft();
  }
}

window.HomePageManager = HomePageManager;
window.addFeaturedImage = addFeaturedImage;
window.addTourImage = addTourImage;
window.saveHomePageSettings = saveHomePageSettings;
window.selectHeroImage = selectHeroImage;
window.uploadHeroImage = uploadHeroImage;
window.uploadGalleryImage = uploadGalleryImage;
window.closeImageLibraryModal = closeImageLibraryModal;

// Initialize when homepage tab is opened
document.addEventListener('DOMContentLoaded', () => {
  const homeTab = document.querySelector('[data-tab="homepage"]');
  if (homeTab) {
    homeTab.addEventListener('click', () => {
      if (HomePageManager.availableImages.length === 0) {
        HomePageManager.init();
      }
    });
  }
});

// Export drag and drop handlers
window.handleDragStart = (e, id) => UpdateUI.handleDragStart(e, id);
window.handleDragOver = (e) => UpdateUI.handleDragOver(e);
window.handleDrop = (e, id) => UpdateUI.handleDrop(e, id);
