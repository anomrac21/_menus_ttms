/**
 * TTMenus Notification Subscription
 * Handles subscription to push notifications via notify-service
 */

const NotificationService = {
  notifyServiceUrl: window.NOTIFY_CONFIG?.serviceUrl || window.SiteConfig?.notifyServiceUrl || 'https://notify.ttmenus.com',

  /** Domain registered in notify-service (not necessarily window.location.hostname on localhost). */
  getClientDomain() {
    const configured = (window.NOTIFY_CONFIG?.clientDomain || '').trim();
    if (configured) {
      return configured.replace(/^www\./i, '');
    }
    return (window.location.hostname || '').replace(/^www\./i, '');
  },
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
    
    // Verify push subscription is still valid
    if (this.subscriptionId && this.serviceWorkerRegistration) {
      await this.verifyPushSubscription();
    }
    
    // If user is subscribed, connect to WebSocket to receive notifications (when site is open)
    if (this.subscriptionId) {
      this.connectWebSocket();
    }
  },

  /**
   * Verify and restore push subscription if needed
   */
  async verifyPushSubscription() {
    if (!this.serviceWorkerRegistration || !this.serviceWorkerRegistration.pushManager) {
      return;
    }

    try {
      const stored = localStorage.getItem('ttmenus_notification_subscription');
      if (!stored) return;

      const subscription = JSON.parse(stored);
      const currentPushSubscription = await this.serviceWorkerRegistration.pushManager.getSubscription();

      // If we have a stored push subscription but no current one, try to restore
      if (subscription.pushSubscription && !currentPushSubscription) {
        console.log('⚠️ Push subscription lost, attempting to restore...');
        // The push subscription cannot be restored directly - user needs to resubscribe
        // But we can continue with WebSocket for now
        console.log('ℹ️ Push subscription cannot be auto-restored. WebSocket notifications will still work when site is open.');
      } else if (currentPushSubscription) {
        console.log('✅ Push subscription verified and active');
      }
    } catch (error) {
      console.error('Error verifying push subscription:', error);
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
    const checkUrl = `${this.notifyServiceUrl}/api/v1/clients/${encodeURIComponent(clientDomain)}/api-key`;

    let checkResponse;
    try {
      checkResponse = await fetch(checkUrl);
    } catch (error) {
      const msg = error && error.message ? error.message : String(error);
      throw new Error(
        'Cannot reach notify service (' + msg + '). Check network or CORS from ' + window.location.origin
      );
    }

    if (checkResponse.ok) {
      console.log('✅ Notify client registered:', clientDomain);
      return;
    }

    if (checkResponse.status !== 404) {
      const body = await checkResponse.text().catch(() => '');
      throw new Error('Notify client check failed (HTTP ' + checkResponse.status + '): ' + body);
    }

    console.log('Registering notify client:', clientDomain);
    const registerUrl = `${this.notifyServiceUrl}/api/v1/clients/register`;
    let registerResponse;
    try {
      registerResponse = await fetch(registerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: clientDomain,
          client_name: document.title || clientDomain,
          service_group: 'ttmenus',
        }),
      });
    } catch (error) {
      const msg = error && error.message ? error.message : String(error);
      throw new Error('Client registration request failed: ' + msg);
    }

    if (registerResponse.ok || registerResponse.status === 409) {
      console.log('✅ Notify client ready:', clientDomain);
      return;
    }

    const error = await registerResponse.json().catch(() => ({ error: registerResponse.statusText }));
    throw new Error(error.error || error.details || 'Failed to register client in notify-service');
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
      const platform = 'web';
      
      // Check if browser supports notifications
      if (!('Notification' in window)) {
        alert('This browser does not support notifications.');
        return;
      }

      // Check if service worker is registered
      if (!this.serviceWorkerRegistration) {
        await this.registerServiceWorker();
      }

      if (!this.serviceWorkerRegistration) {
        throw new Error('Service Worker registration failed. Push notifications require a service worker.');
      }

      // Request permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        alert('Notification permission denied. Please enable notifications in your browser settings.');
        return;
      }

      const userId = this.generateUserID();
      
      // Collect demographic information
      const demographics = this.collectDemographics();
      
      const clientDomain = this.getClientDomain();

      await this.ensureClientRegistered(clientDomain);

      const apiUrl = window.NOTIFY_CONFIG?.apiUrl || `${this.notifyServiceUrl}/api/v1`;
      let vapidPublicKey = null;

      try {
        const keyResponse = await fetch(`${apiUrl}/clients/${encodeURIComponent(clientDomain)}/vapid-key`);
        if (keyResponse.ok) {
          const keyData = await keyResponse.json();
          vapidPublicKey = keyData.publicKey || keyData.vapid_public_key;
          console.log('✅ VAPID public key retrieved');
        } else if (keyResponse.status === 503) {
          console.warn('⚠️ Web Push (VAPID) not configured on notify-service — alerts work while this tab is open only');
        } else {
          console.warn('⚠️ VAPID key request failed:', keyResponse.status, await keyResponse.text().catch(() => ''));
        }
      } catch (e) {
        const msg = e && e.message ? e.message : String(e);
        console.warn('⚠️ Could not fetch VAPID key:', msg);
      }

      let pushSubscription = null;
      let deviceToken = this.getWebSocketConnectionID();

      try {
        if (this.serviceWorkerRegistration.pushManager && vapidPublicKey) {
          let existingSubscription = await this.serviceWorkerRegistration.pushManager.getSubscription();

          if (!existingSubscription) {
            pushSubscription = await this.serviceWorkerRegistration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: this.urlBase64ToUint8Array(vapidPublicKey),
            });
            console.log('✅ Push API subscription created:', pushSubscription.endpoint.substring(0, 50) + '...');
          } else {
            pushSubscription = existingSubscription;
            console.log('✅ Using existing Push API subscription');
          }

          if (pushSubscription) {
            deviceToken = pushSubscription.endpoint;
          }
        } else if (this.serviceWorkerRegistration.pushManager && !vapidPublicKey) {
          console.warn('⚠️ Skipping Push API subscribe until VAPID is configured on notify-service');
        } else {
          console.warn('⚠️ PushManager not available, using WebSocket only');
        }
      } catch (pushError) {
        const msg = pushError && pushError.message ? pushError.message : String(pushError);
        console.warn('⚠️ Push API subscription failed, using WebSocket only:', msg);
      }

      console.log('Subscribing to notifications:', {
        notifyServiceUrl: this.notifyServiceUrl,
        clientDomain: clientDomain,
        userId: userId,
        platform: platform,
        hasPushSubscription: !!pushSubscription,
        deviceToken: deviceToken.substring(0, 50) + '...',
        demographics: demographics
      });

      const wsConnectionId = this.getWebSocketConnectionID();

      // Prepare subscription data
      const subscriptionData = {
        client_domain: clientDomain,
        user_id: userId,
        device_token: deviceToken,
        platform: platform,
        demographics: demographics,
        ws_connection_id: wsConnectionId,
      };

      // Add push subscription details if available
      if (pushSubscription) {
        subscriptionData.push_endpoint = pushSubscription.endpoint;
        subscriptionData.push_keys = {
          p256dh: this.arrayBufferToBase64(pushSubscription.getKey('p256dh')),
          auth: this.arrayBufferToBase64(pushSubscription.getKey('auth')),
        };
      }

      // Subscribe via notify-service API
      const subscribeUrl = `${apiUrl}/subscriptions`;
      console.log('Subscription URL:', subscribeUrl);

      const response = await fetch(subscribeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(subscriptionData),
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

      // Store subscription with push subscription details
      const subscriptionToStore = {
        ...subscription,
        ws_connection_id: wsConnectionId,
        pushSubscription: pushSubscription ? {
          endpoint: pushSubscription.endpoint,
          keys: {
            p256dh: this.arrayBufferToBase64(pushSubscription.getKey('p256dh')),
            auth: this.arrayBufferToBase64(pushSubscription.getKey('auth')),
          },
        } : null,
      };
      localStorage.setItem('ttmenus_notification_subscription', JSON.stringify(subscriptionToStore));

      // Connect to WebSocket for real-time notifications (when site is open)
      this.connectWebSocket();

      this.updateSubscribeButton(true);
      this.showMessage('Successfully subscribed to notifications! You will receive notifications even when the site is closed.', 'success');
    } catch (error) {
      console.error('Subscription error:', error);
      let errorMessage = (error && error.message) ? error.message : String(error);
      if (!errorMessage || errorMessage === 'Failed to fetch') {
        errorMessage =
          'Unable to connect to notify.ttmenus.com. Check that clientDomain is set (e.g. menudemo.ttmenus.com in hugo.toml), not localhost.';
      }
      this.showMessage('Failed to subscribe: ' + errorMessage, 'error');
    }
  },

  /**
   * Convert VAPID key from URL-safe base64 to Uint8Array
   */
  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  },

  /**
   * Convert ArrayBuffer to base64 string
   */
  arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
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

      // Unsubscribe from Push API
      if (this.serviceWorkerRegistration && this.serviceWorkerRegistration.pushManager) {
        try {
          const pushSubscription = await this.serviceWorkerRegistration.pushManager.getSubscription();
          if (pushSubscription) {
            await pushSubscription.unsubscribe();
            console.log('✅ Push API subscription removed');
          }
        } catch (pushError) {
          console.warn('⚠️ Failed to unsubscribe from Push API:', pushError);
        }
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
      const clientDomain = this.getClientDomain();

      let connectionId = this.getWebSocketConnectionID();
      const stored = localStorage.getItem('ttmenus_notification_subscription');
      if (stored) {
        try {
          const subscription = JSON.parse(stored);
          if (subscription.ws_connection_id) {
            connectionId = subscription.ws_connection_id;
          } else if (
            subscription.device_token &&
            !String(subscription.device_token).startsWith('https://')
          ) {
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
    const btnHint = document.getElementById('subBtnHint');
    const btnHero = document.getElementById('subBtnHero');
    const btnHeroText = document.getElementById('subBtnHeroText');
    const btnHeroHint = document.getElementById('subBtnHeroHint');

    if (btn && btnText) {
      if (isSubscribed) {
        btn.classList.add('subscribed');
        btn.setAttribute('aria-pressed', 'true');
        btnText.textContent = 'Alerts on';
        if (btnHint) btnHint.textContent = 'Tap to turn off';
        btn.title = 'You receive menu alerts — tap to turn off';
      } else {
        btn.classList.remove('subscribed');
        btn.setAttribute('aria-pressed', 'false');
        btnText.textContent = 'Get menu alerts';
        if (btnHint) btnHint.textContent = 'Free · specials & hours';
        btn.title = 'Get alerts for specials, hours, and menu updates';
      }
    }

    // Update hero subscribe button (if exists)
    if (btnHero && btnHeroText) {
      if (isSubscribed) {
        btnHero.classList.add('hide');
      } else {
        btnHero.classList.remove('hide');
        btnHeroText.textContent = 'Get menu alerts';
        if (btnHeroHint) btnHeroHint.textContent = 'Free · specials & hours';
        btnHero.title = 'Get alerts for specials, hours, and menu updates';
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

