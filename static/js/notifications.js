/**
 * TTMenus Notification Subscription
 * Handles subscription to push notifications via notify-service
 */

const NotificationService = {
  notifyServiceUrl: window.NOTIFY_CONFIG?.serviceUrl || window.SiteConfig?.notifyServiceUrl || 'https://notify.ttmenus.com',
  clientDomain: window.NOTIFY_CONFIG?.clientDomain || window.location.hostname,
  subscriptionId: null,
  wsConnection: null,
  serviceWorkerRegistration: null,

  /**
   * Initialize notification service
   */
  async init() {
    // Check if notifications are enabled
    if (!window.NOTIFY_CONFIG?.enabled) {
      console.log('Notification service is disabled');
      return;
    }

    // Register service worker first
    await this.registerServiceWorker();
    
    // Setup service worker message handler
    this.setupServiceWorkerMessageHandler();
    
    this.checkSubscriptionStatus();
    this.loadSubscriptionFromStorage();
    
    // If user is subscribed, connect to WebSocket to receive notifications
    if (this.subscriptionId) {
      this.connectWebSocket();
    }
  },

  /**
   * Register service worker for background notifications
   */
  async registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const swPath = window.NOTIFY_CONFIG?.serviceWorkerPath || '/sw.js';
        const registration = await navigator.serviceWorker.register(swPath, {
          scope: '/',
        });
        this.serviceWorkerRegistration = registration;
        console.log('✅ Service Worker registered:', registration.scope);
        
        // Check for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('🔄 New service worker available. Reload to update.');
            }
          });
        });
      } catch (error) {
        console.error('❌ Service Worker registration failed:', error);
      }
    } else {
      console.warn('⚠️ Service Workers are not supported in this browser');
    }
  },

  /**
   * Check if user has subscribed
   */
  checkSubscriptionStatus() {
    const stored = localStorage.getItem('ttmenus_notification_subscription');
    if (stored) {
      try {
        const subscription = JSON.parse(stored);
        this.subscriptionId = subscription.id;
        this.updateSubscribeButton(true);
      } catch (e) {
        console.error('Failed to parse subscription:', e);
        this.updateSubscribeButton(false);
      }
    } else {
      // Not subscribed - ensure buttons show correctly
      this.updateSubscribeButton(false);
    }
  },

  /**
   * Load subscription from storage
   */
  loadSubscriptionFromStorage() {
    const stored = localStorage.getItem('ttmenus_notification_subscription');
    if (stored) {
      try {
        const subscription = JSON.parse(stored);
        this.subscriptionId = subscription.id;
      } catch (e) {
        console.error('Failed to load subscription:', e);
      }
    }
  },

  /**
   * Generate a unique user ID
   */
  generateUserID() {
    let userId = localStorage.getItem('ttmenus_user_id');
    if (!userId) {
      userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('ttmenus_user_id', userId);
    }
    return userId;
  },

  /**
   * Ensure client is registered in notify-service
   */
  async ensureClientRegistered(clientDomain) {
    try {
      // Try to get client API key (this will fail if client doesn't exist)
      const checkUrl = `${this.notifyServiceUrl}/api/v1/clients/${clientDomain}/api-key`;
      const checkResponse = await fetch(checkUrl);
      
      if (checkResponse.ok) {
        console.log('Client already registered:', clientDomain);
        return; // Client exists
      }

      // Client doesn't exist, try to register it
      console.log('Client not found, attempting to register:', clientDomain);
      const registerUrl = `${this.notifyServiceUrl}/api/v1/clients/register`;
      
      const registerResponse = await fetch(registerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          domain: clientDomain,
          client_name: document.title || 'TTMenus',
          service_group: 'ttmenus',
        }),
      });

      if (registerResponse.ok) {
        const result = await registerResponse.json();
        console.log('Client registered successfully:', result);
      } else if (registerResponse.status === 409) {
        // Client already exists (race condition)
        console.log('Client already exists (409 conflict)');
      } else {
        const error = await registerResponse.json().catch(() => ({ error: 'Unknown error' }));
        console.warn('Failed to register client (subscription may still work):', error);
        // Don't throw - subscription might still work if client was just created
      }
    } catch (error) {
      console.warn('Error checking/registering client:', error);
      // Don't throw - subscription might still work
    }
  },

  /**
   * Get or create WebSocket connection ID
   */
  getWebSocketConnectionID() {
    let wsId = sessionStorage.getItem('ttmenus_ws_connection_id');
    if (!wsId) {
      wsId = 'ws_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      sessionStorage.setItem('ttmenus_ws_connection_id', wsId);
    }
    return wsId;
  },

  /**
   * Collect demographic information about the user's device and browser
   */
  collectDemographics() {
    const ua = navigator.userAgent || '';
    const demographics = {
      user_agent: ua,
      screen_width: window.screen ? window.screen.width : 0,
      screen_height: window.screen ? window.screen.height : 0,
      language: navigator.language || navigator.userLanguage || '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    };

    // Parse browser information
    if (ua.includes('Chrome') && !ua.includes('Edg') && !ua.includes('OPR')) {
      demographics.browser = 'Chrome';
      const match = ua.match(/Chrome\/(\d+)/);
      demographics.browser_version = match ? match[1] : '';
    } else if (ua.includes('Safari') && !ua.includes('Chrome')) {
      demographics.browser = 'Safari';
      const match = ua.match(/Version\/(\d+)/);
      demographics.browser_version = match ? match[1] : '';
    } else if (ua.includes('Firefox')) {
      demographics.browser = 'Firefox';
      const match = ua.match(/Firefox\/(\d+)/);
      demographics.browser_version = match ? match[1] : '';
    } else if (ua.includes('Edg')) {
      demographics.browser = 'Edge';
      const match = ua.match(/Edg\/(\d+)/);
      demographics.browser_version = match ? match[1] : '';
    } else if (ua.includes('OPR')) {
      demographics.browser = 'Opera';
      const match = ua.match(/OPR\/(\d+)/);
      demographics.browser_version = match ? match[1] : '';
    }

    // Parse OS information
    if (ua.includes('Windows')) {
      demographics.os = 'Windows';
      if (ua.includes('Windows NT 10.0')) demographics.os_version = '10/11';
      else if (ua.includes('Windows NT 6.3')) demographics.os_version = '8.1';
      else if (ua.includes('Windows NT 6.2')) demographics.os_version = '8';
      else if (ua.includes('Windows NT 6.1')) demographics.os_version = '7';
    } else if (ua.includes('Mac OS X') || ua.includes('Macintosh')) {
      demographics.os = 'macOS';
      const match = ua.match(/Mac OS X (\d+[._]\d+)/);
      demographics.os_version = match ? match[1].replace('_', '.') : '';
    } else if (ua.includes('iPhone') || ua.includes('iPad') || ua.includes('iPod')) {
      demographics.os = 'iOS';
      const match = ua.match(/OS (\d+[._]\d+)/);
      demographics.os_version = match ? match[1].replace('_', '.') : '';
      if (ua.includes('iPhone')) {
        demographics.device_type = 'mobile';
        const match = ua.match(/iPhone(\d+,\d+)/);
        if (match) {
          const model = match[1];
          demographics.device_model = `iPhone ${model.replace(',', '.')}`;
        }
      } else if (ua.includes('iPad')) {
        demographics.device_type = 'tablet';
        demographics.device_model = 'iPad';
      }
    } else if (ua.includes('Android')) {
      demographics.os = 'Android';
      const match = ua.match(/Android (\d+[.\d]*)/);
      demographics.os_version = match ? match[1] : '';
      
      // Detect device type
      if (ua.includes('Mobile')) {
        demographics.device_type = 'mobile';
      } else {
        demographics.device_type = 'tablet';
      }
      
      // Try to detect device model
      const modelMatch = ua.match(/Android.*?;\s*([^)]+)\)/);
      if (modelMatch) {
        demographics.device_model = modelMatch[1].trim();
      }
    } else if (ua.includes('Linux')) {
      demographics.os = 'Linux';
    } else {
      demographics.os = 'Unknown';
    }

    // Set device type if not already set - use multiple methods for accuracy
    if (!demographics.device_type) {
      // Method 1: Use screen width
      const screenWidth = demographics.screen_width || window.innerWidth || 0;
      if (screenWidth < 768) {
        demographics.device_type = 'mobile';
      } else if (screenWidth < 1024) {
        demographics.device_type = 'tablet';
      } else {
        demographics.device_type = 'desktop';
      }
      
      // Method 2: Verify with user agent if available
      if (ua.includes('Mobile') && !ua.includes('Tablet') && !ua.includes('iPad')) {
        demographics.device_type = 'mobile';
      } else if (ua.includes('Tablet') || ua.includes('iPad')) {
        demographics.device_type = 'tablet';
      } else if (screenWidth >= 1024 && (ua.includes('Windows') || ua.includes('Mac') || ua.includes('Linux'))) {
        demographics.device_type = 'desktop';
      }
    }
    
    // Ensure device_type is always set
    if (!demographics.device_type) {
      // Final fallback based on screen size
      const screenWidth = demographics.screen_width || window.innerWidth || 0;
      if (screenWidth === 0) {
        demographics.device_type = 'unknown';
      } else if (screenWidth < 768) {
        demographics.device_type = 'mobile';
      } else if (screenWidth < 1024) {
        demographics.device_type = 'tablet';
      } else {
        demographics.device_type = 'desktop';
      }
    }

    console.log('📊 Collected demographics:', {
      device_type: demographics.device_type,
      os: demographics.os,
      browser: demographics.browser,
      screen_width: demographics.screen_width,
      screen_height: demographics.screen_height
    });

    return demographics;
  },

  /**
   * Subscribe to notifications
   */
  async subscribe() {
    try {
      // Always use 'web' platform for web push notifications (WebSocket)
      // This applies to all devices (desktop, mobile browsers) since we're using web push, not native apps
      const platform = 'web';
      
      // Check if browser supports notifications
      if (!('Notification' in window)) {
        alert('This browser does not support notifications.');
        return;
      }

      // Request permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        alert('Notification permission denied. Please enable notifications in your browser settings.');
        return;
      }

      const userId = this.generateUserID();
      const deviceToken = this.getWebSocketConnectionID();
      
      // Collect demographic information
      const demographics = this.collectDemographics();
      
      // Use the main domain (remove www. prefix if present)
      const clientDomain = this.clientDomain.replace('www.', '');

      console.log('Subscribing to notifications:', {
        notifyServiceUrl: this.notifyServiceUrl,
        clientDomain: clientDomain,
        userId: userId,
        platform: platform,
        deviceToken: deviceToken.substring(0, 20) + '...',
        demographics: demographics
      });

      // First, ensure the client is registered
      await this.ensureClientRegistered(clientDomain);

      // Subscribe via notify-service API
      const apiUrl = window.NOTIFY_CONFIG?.apiUrl || `${this.notifyServiceUrl}/api/v1`;
      const subscribeUrl = `${apiUrl}/subscriptions`;
      console.log('Subscription URL:', subscribeUrl);

      const response = await fetch(subscribeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_domain: clientDomain,
          user_id: userId,
          device_token: deviceToken,
          platform: platform,
          demographics: demographics,
        }),
      });

      console.log('Subscription response status:', response.status, response.statusText);

      if (!response.ok) {
        let errorMessage = 'Failed to subscribe';
        try {
          const error = await response.json();
          errorMessage = error.error || error.details || errorMessage;
          console.error('Subscription error response:', error);
        } catch (e) {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
          console.error('Failed to parse error response:', e);
        }
        throw new Error(errorMessage);
      }

      const subscription = await response.json();
      console.log('Subscription successful:', subscription);
      this.subscriptionId = subscription.id;

      // Store subscription
      localStorage.setItem('ttmenus_notification_subscription', JSON.stringify(subscription));

      // Connect to WebSocket for real-time notifications
      this.connectWebSocket();

      this.updateSubscribeButton(true);
      this.showMessage('Successfully subscribed to notifications!', 'success');
    } catch (error) {
      console.error('Subscription error:', error);
      let errorMessage = error.message;
      if (error.message === 'Failed to fetch') {
        errorMessage = 'Unable to connect to notification service. The service may be unavailable or the client domain may not be registered.';
      }
      this.showMessage('Failed to subscribe: ' + errorMessage, 'error');
    }
  },

  /**
   * Unsubscribe from notifications
   */
  async unsubscribe() {
    if (!this.subscriptionId) {
      this.showMessage('Not subscribed to notifications.', 'info');
      return;
    }

    try {
      const apiUrl = window.NOTIFY_CONFIG?.apiUrl || `${this.notifyServiceUrl}/api/v1`;
      const response = await fetch(`${apiUrl}/subscriptions/${this.subscriptionId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to unsubscribe');
      }

      // Clear subscription
      this.subscriptionId = null;
      localStorage.removeItem('ttmenus_notification_subscription');
      
      // Close WebSocket connection
      if (this.wsConnection) {
        this.wsConnection.close();
        this.wsConnection = null;
      }

      this.updateSubscribeButton(false);
      this.showMessage('Successfully unsubscribed from notifications.', 'success');
    } catch (error) {
      console.error('Unsubscribe error:', error);
      this.showMessage('Failed to unsubscribe: ' + error.message, 'error');
    }
  },

  /**
   * Connect to WebSocket for real-time notifications
   */
  connectWebSocket() {
    if (this.wsConnection && this.wsConnection.readyState === WebSocket.OPEN) {
      console.log('✅ WebSocket already connected');
      return; // Already connected
    }
    
    if (!this.subscriptionId) {
      console.log('⚠️ Cannot connect WebSocket: No active subscription');
      return;
    }

    try {
      const wsUrl = window.NOTIFY_CONFIG?.websocketUrl || this.notifyServiceUrl.replace('https://', 'wss://').replace('http://', 'ws://') + '/api/v1/ws/connect';
      // WebSocket handler requires client_domain query parameter
      const clientDomain = this.clientDomain.replace('www.', '');
      
      // Get the connection ID (DeviceToken) from subscription or generate one
      let connectionId = this.getWebSocketConnectionID();
      const stored = localStorage.getItem('ttmenus_notification_subscription');
      if (stored) {
        try {
          const subscription = JSON.parse(stored);
          if (subscription.device_token) {
            connectionId = subscription.device_token;
          }
        } catch (e) {
          console.error('Failed to parse subscription for connection ID:', e);
        }
      }
      
      const wsPath = `${wsUrl}?client_domain=${encodeURIComponent(clientDomain)}&connection_id=${encodeURIComponent(connectionId)}`;
      
      console.log('Connecting to WebSocket:', wsPath);
      this.wsConnection = new WebSocket(wsPath);

      this.wsConnection.onopen = () => {
        console.log('✅ WebSocket connected for notifications');
        console.log('🔌 Connection ID:', connectionId);
        console.log('📡 WebSocket readyState:', this.wsConnection.readyState);
      };

      this.wsConnection.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('WebSocket message received:', message);
          
          // Handle WebSocketMessage wrapper
          if (message.type === 'notification' && message.data) {
            // Extract notification from WebSocketMessage wrapper
            const notification = message.data;
            console.log('Notification extracted:', notification);
            this.showNotification(notification);
          } else if (message.title || message.message) {
            // Direct notification object (fallback)
            this.showNotification(message);
          } else {
            console.log('Unknown WebSocket message type:', message);
          }
        } catch (e) {
          console.error('Failed to parse notification:', e, event.data);
        }
      };

      this.wsConnection.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      this.wsConnection.onclose = () => {
        console.log('WebSocket disconnected');
        // Attempt to reconnect after 5 seconds
        setTimeout(() => {
          if (this.subscriptionId) {
            this.connectWebSocket();
          }
        }, 5000);
      };
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
    }
  },

  /**
   * Show browser notification
   * Uses service worker if available, otherwise falls back to direct Notification API
   */
  async showNotification(notification) {
    if (Notification.permission !== 'granted') {
      console.warn('⚠️ Notification permission not granted');
      return;
    }

    // Get image URL from notification data, or use default
    const imageUrl = (notification.data && (notification.data.image || notification.data.image_url)) 
      || (notification.image || notification.icon)
      || 'https://cdn.ttmenus.com/branding/ttmenus/ttmenus.gif';
    
    // Get link URL from notification data
    const linkUrl = notification.data && (notification.data.url || notification.data.link);

    const notificationData = {
      title: notification.title || 'TTMenus',
      body: notification.message || notification.body || '',
      icon: imageUrl,
      badge: imageUrl,
      image: imageUrl,
      tag: notification.id,
      data: {
        ...(notification.data || {}),
        notificationId: notification.id,
        linkUrl: linkUrl,
      },
    };

    // Prefer service worker for background notifications
    if (this.serviceWorkerRegistration && this.serviceWorkerRegistration.active) {
      try {
        // Send notification to service worker
        const channel = new MessageChannel();
        channel.port1.onmessage = (event) => {
          if (event.data.success) {
            console.log('✅ Notification shown via service worker');
          }
        };
        
        this.serviceWorkerRegistration.active.postMessage(
          {
            type: 'SHOW_NOTIFICATION',
            notification: notificationData,
          },
          [channel.port2]
        );
        return;
      } catch (error) {
        console.warn('⚠️ Failed to show notification via service worker, falling back:', error);
      }
    }

    // Fallback to direct Notification API (works when page is open)
    try {
      const notificationObj = new Notification(notificationData.title, {
        body: notificationData.body,
        icon: notificationData.icon,
        badge: notificationData.badge,
        image: notificationData.image,
        tag: notificationData.tag,
        data: notificationData.data,
      });
      
      // Track confirmation when notification is displayed
      this.trackNotificationConfirmation(notification.id);
      
      // Handle click event - navigate to link and track click
      notificationObj.onclick = (event) => {
        event.preventDefault();
        
        // Track click via API
        this.trackNotificationClick(notification.id);
        
        // Navigate to link if provided
        if (linkUrl) {
          window.focus(); // Focus the window first
          window.open(linkUrl, '_blank');
        } else {
          // If no link, just focus the window
          window.focus();
        }
        
        // Close the notification
        notificationObj.close();
      };
    } catch (error) {
      console.error('❌ Failed to show notification:', error);
    }
  },
  
  /**
   * Track notification confirmation (when notification is displayed/seen)
   */
  async trackNotificationConfirmation(notificationId) {
    if (!this.subscriptionId) {
      console.warn('Cannot track confirmation: No subscription ID');
      return;
    }
    
    try {
      const apiUrl = window.NOTIFY_CONFIG?.apiUrl || `${this.notifyServiceUrl}/api/v1`;
      const trackUrl = `${apiUrl}/notifications/${notificationId}/confirm?subscription_id=${this.subscriptionId}`;
      const response = await fetch(trackUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        console.log('✅ Notification confirmation tracked:', notificationId);
      } else {
        console.warn('⚠️ Failed to track notification confirmation:', response.status);
      }
    } catch (error) {
      console.error('❌ Error tracking notification confirmation:', error);
    }
  },

  /**
   * Handle messages from service worker
   */
  setupServiceWorkerMessageHandler() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        console.log('📨 Message from service worker:', event.data);
        
        if (event.data && event.data.type === 'GET_SUBSCRIPTION') {
          // Send subscription info to service worker
          const stored = localStorage.getItem('ttmenus_notification_subscription');
          if (stored) {
            try {
              const subscription = JSON.parse(stored);
              if (event.ports && event.ports[0]) {
                event.ports[0].postMessage(subscription);
              }
            } catch (e) {
              console.error('Failed to parse subscription for service worker:', e);
              if (event.ports && event.ports[0]) {
                event.ports[0].postMessage(null);
              }
            }
          } else {
            if (event.ports && event.ports[0]) {
              event.ports[0].postMessage(null);
            }
          }
        }
      });
    }
  },

  /**
   * Track notification click
   */
  async trackNotificationClick(notificationId) {
    if (!this.subscriptionId) {
      console.warn('Cannot track click: No subscription ID');
      return;
    }
    
    try {
      const apiUrl = window.NOTIFY_CONFIG?.apiUrl || `${this.notifyServiceUrl}/api/v1`;
      const trackUrl = `${apiUrl}/notifications/${notificationId}/click?subscription_id=${this.subscriptionId}`;
      const response = await fetch(trackUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        console.log('✅ Notification click tracked:', notificationId);
      } else {
        console.warn('⚠️ Failed to track notification click:', response.status);
      }
    } catch (error) {
      console.error('❌ Error tracking notification click:', error);
    }
  },

  /**
   * Update subscribe button state
   */
  updateSubscribeButton(isSubscribed) {
    const btn = document.getElementById('subBtn');
    const btnText = document.getElementById('subBtnText');
    const btnHero = document.getElementById('subBtnHero');
    const btnHeroText = document.getElementById('subBtnHeroText');
    
    if (btn && btnText) {
      if (isSubscribed) {
        btn.classList.add('subscribed');
        btnText.textContent = 'Subscribed';
        btn.title = 'Unsubscribe from notifications';
      } else {
        btn.classList.remove('subscribed');
        btnText.textContent = 'Subscribe';
        btn.title = 'Subscribe to notifications';
      }
    }
    
    // Update hero subscribe button (if exists)
    if (btnHero && btnHeroText) {
      if (isSubscribed) {
        // Hide hero button when subscribed
        btnHero.classList.add('hide');
      } else {
        // Show hero button when not subscribed
        btnHero.classList.remove('hide');
        btnHeroText.textContent = 'Subscribe';
        btnHero.title = 'Subscribe to notifications';
      }
    }
  },

  /**
   * Show message to user
   */
  showMessage(message, type = 'info') {
    // Simple alert for now - can be enhanced with a toast notification
    if (type === 'error') {
      alert('Error: ' + message);
    } else if (type === 'success') {
      console.log('✅ ' + message);
      // Could show a toast notification here
    } else {
      console.log(message);
    }
  },

  /**
   * Toggle subscription
   */
  toggle() {
    if (this.subscriptionId) {
      this.unsubscribe();
    } else {
      this.subscribe();
    }
  },
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (window.NOTIFY_CONFIG?.enabled) {
      NotificationService.init();
    }
  });
} else {
  if (window.NOTIFY_CONFIG?.enabled) {
    NotificationService.init();
  }
}

// Export for global use
window.NotificationService = NotificationService;

// Toggle function for button onclick
function toggleNotificationSubscription() {
  NotificationService.toggle();
}

