/**
 * TTMenus Notification Subscription
 * Handles subscription to push notifications via notify-service
 */

function resolveNotifyConfig() {
  let cfg = window.NOTIFY_CONFIG;
  if (typeof cfg === 'string') {
    try {
      cfg = JSON.parse(cfg);
    } catch (e) {
      cfg = null;
    }
  }
  if (cfg && typeof cfg === 'object') {
    window.NOTIFY_CONFIG = cfg;
    return cfg;
  }
  const site = window.SiteConfig || {};
  if (site.notifyServiceUrl) {
    const serviceUrl = String(site.notifyServiceUrl).replace(/\/+$/, '');
    const wsBase = serviceUrl.replace(/^http/i, 'ws');
    cfg = {
      enabled: true,
      serviceUrl: serviceUrl,
      apiUrl: serviceUrl + '/api/v1',
      websocketUrl: wsBase + '/api/v1/ws/connect',
      clientDomain: (window.location.hostname || '').replace(/^www\./i, ''),
    };
    window.NOTIFY_CONFIG = cfg;
    return cfg;
  }
  return window.NOTIFY_CONFIG || {};
}

function ttmsIsLocalDevHost() {
  if (typeof window === 'undefined' || !window.location) return false;
  const h = window.location.hostname || '';
  return h === 'localhost' || h === '127.0.0.1' || /\.local$/i.test(h);
}

/** True for localhost / loopback URLs: blocked on public sites (Chrome LNA prompt). */
function ttmsIsLoopbackUrl(url) {
  return /^(https?|wss?):\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?/i.test(String(url || ''));
}

const NotificationService = {
  VAPID_KEY_STORAGE: 'ttmenus_vapid_public_key',
  VAPID_RESYNC_STORAGE: 'ttmenus_vapid_resynced_for',
  PHOTO_REVIEW_ALERTS_STORAGE: 'ttmenus_photo_review_alerts',

  get notifyServiceUrl() {
    const cfg = resolveNotifyConfig();
    return cfg.serviceUrl || window.SiteConfig?.notifyServiceUrl || 'https://notify.ttmenus.com';
  },

  /** Domain registered in notify-service (not necessarily window.location.hostname on localhost). */
  getClientDomain() {
    const configured = (resolveNotifyConfig().clientDomain || '').trim();
    if (configured) {
      return configured.replace(/^www\./i, '');
    }
    return (window.location.hostname || '').replace(/^www\./i, '');
  },

  isHubClientDomain(domain) {
    const host = String(domain || '')
      .replace(/^www\./i, '')
      .toLowerCase();
    return host === 'ttmenus.com' || host === 'localhost' || host === '127.0.0.1';
  },

  notifyClientDisplayName() {
    const og = document.querySelector('meta[property="og:site_name"], meta[name="application-name"]');
    const site = window.SiteConfig || {};
    const raw =
      (og && og.getAttribute('content')) ||
      site.restaurantName ||
      site.siteName ||
      site.name ||
      document.title ||
      '';
    let name = String(raw)
      .replace(/\s*\|\s*Digital Menu & Online Ordering/gi, '')
      .replace(/^\|\s*/, '')
      .trim();
    if (!name || /^digital menu/i.test(name)) {
      name = this.getClientDomain();
    }
    return name;
  },

  getLocationKey(url) {
    let host = this.getClientDomain();
    let path = window.location.pathname || '';
    if (url) {
      try {
        const parsed = new URL(String(url), window.location.origin);
        host = (parsed.hostname || '').replace(/^www\./i, '');
        path = parsed.pathname || '';
      } catch (e) {
        /* keep current page */
      }
    }
    if (this.isHubClientDomain(host)) {
      return '';
    }
    if (!url) {
      try {
        if (typeof getCurrentLocationData === 'function') {
          const loc = getCurrentLocationData();
          const slug = loc && (loc.slug || loc.location_slug || loc.key);
          if (slug) {
            return String(slug).toLowerCase().trim().replace(/\s+/g, '-');
          }
        }
      } catch (e) {
        /* ignore */
      }
    }
    const first = String(path)
      .split('/')
      .filter(Boolean)[0] || '';
    const needle = first.toLowerCase();
    const slugs = (window.MENU_CONFIG && window.MENU_CONFIG.locationSlugs) || [];
    if (needle && slugs.some((s) => String(s).toLowerCase() === needle)) {
      return needle;
    }
    if (url && needle && !/^(menu|account|search|recipes|promotions|about|login)$/i.test(needle)) {
      return needle;
    }
    return '';
  },

  /** True when browser can receive push while site/app is closed (service worker + PushManager). */
  supportsBackgroundPush() {
    return (
      'serviceWorker' in navigator &&
      !!this.serviceWorkerRegistration &&
      !!this.serviceWorkerRegistration.pushManager
    );
  },

  isIOS() {
    return (
      /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    );
  },

  isStandalonePWA() {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    );
  },

  /** iOS only delivers Web Push to home-screen PWAs (iOS 16.4+). */
  getIOSPushRequirementMessage() {
    return (
      'On iPhone/iPad, background alerts require adding this menu to your Home Screen first ' +
      '(Safari Share → Add to Home Screen), then open it from that icon and tap Get menu alerts again.'
    );
  },

  subscriptionId: null,
  wsConnection: null,
  serviceWorkerRegistration: null,

  /**
   * Initialize notification service
   */
  async init() {
    // Check if notifications are enabled
    if (!resolveNotifyConfig().enabled) {
      console.log('Notification service is disabled');
      return;
    }

    this.setupServiceWorkerMessageHandler();
    this.checkSubscriptionStatus();
    this.loadSubscriptionFromStorage();
    this.bindSubscriptionManager();

    // Defer service worker / push / WebSocket until user has subscribed.
    // Avoids Local Network Access prompts on first visit (Chrome/Edge).
    if (!this.subscriptionId) {
      return;
    }

    await this.registerServiceWorker();

    // Verify push subscription is still valid and sync keys to server
    if (this.subscriptionId && this.serviceWorkerRegistration) {
      await this.verifyPushSubscription();
    }

    if (this.subscriptionId) {
      const userId = this.generateUserID();
      const stored = localStorage.getItem('ttmenus_notification_subscription');
      let linked = false;
      if (stored) {
        try {
          linked = JSON.parse(stored).user_id === userId;
        } catch (e) {
          linked = false;
        }
      }
      if (!linked && userId.startsWith('auth_')) {
        await this.relinkSubscriptionToAuthUser();
      }
    }
    
    // If user is subscribed, connect to WebSocket to receive notifications (when site is open)
    if (this.subscriptionId) {
      this.connectWebSocket();
    }
    this.syncNearbyClientWatcher();
  },

  /**
   * Verify and restore push subscription if needed
   */
  async verifyPushSubscription() {
    if (!this.serviceWorkerRegistration || !this.serviceWorkerRegistration.pushManager) {
      return;
    }

    if (!this.supportsBackgroundPush()) {
      if (this.isIOS() && !this.isStandalonePWA()) {
        this.updateSubscribeButton(!!this.subscriptionId, { backgroundPush: false });
      }
      return;
    }

    try {
      const stored = localStorage.getItem('ttmenus_notification_subscription');
      if (!stored) return;

      const apiUrl = resolveNotifyConfig().apiUrl || `${this.notifyServiceUrl}/api/v1`;
      const vapidPublicKey = await this.fetchVapidPublicKey(apiUrl, this.getClientDomain());
      const pushSubscription = await this.ensurePushSubscription(vapidPublicKey);

      if (pushSubscription) {
        await this.syncPushSubscriptionToServer(pushSubscription);
        this.updateSubscribeButton(true, { backgroundPush: true });
        console.log('✅ Background push subscription active and synced');
        return;
      }

      console.warn('⚠️ Background push subscription missing: repairing…');
      this.updateSubscribeButton(true, { backgroundPush: false });
      await this.repairBackgroundPush();
    } catch (error) {
      console.error('Error verifying push subscription:', error);
    }
  },

  /**
   * Re-create browser Push subscription when it was lost but server subscription exists.
   */
  async repairBackgroundPush() {
    if (!this.subscriptionId || !this.supportsBackgroundPush()) return;
    try {
      const apiUrl = resolveNotifyConfig().apiUrl || `${this.notifyServiceUrl}/api/v1`;
      const vapidPublicKey = await this.fetchVapidPublicKey(apiUrl, this.getClientDomain());
      const pushSubscription = await this.ensurePushSubscription(vapidPublicKey);
      if (pushSubscription) {
        await this.syncPushSubscriptionToServer(pushSubscription);
        this.updateSubscribeButton(true, { backgroundPush: true });
        console.log('✅ Background push subscription repaired');
      }
    } catch (err) {
      console.warn('Could not repair background push:', err && err.message ? err.message : err);
    }
  },

  /**
   * Keep server push endpoint/keys in sync with the browser (required for closed-app delivery).
   */
  async syncPushSubscriptionToServer(pushSubscription) {
    if (!this.subscriptionId) return;

    const pushManager =
      this.serviceWorkerRegistration && this.serviceWorkerRegistration.pushManager;
    if (!pushSubscription && pushManager) {
      pushSubscription = await pushManager.getSubscription();
    }
    if (!pushSubscription) {
      console.warn('⚠️ No browser push subscription to sync');
      return;
    }

    const apiUrl = resolveNotifyConfig().apiUrl || `${this.notifyServiceUrl}/api/v1`;
    const payload = {
      push_endpoint: pushSubscription.endpoint,
      push_keys: {
        p256dh: this.arrayBufferToBase64(pushSubscription.getKey('p256dh')),
        auth: this.arrayBufferToBase64(pushSubscription.getKey('auth')),
      },
      ws_connection_id: this.getWebSocketConnectionID(),
      preferences: this.buildPreferencesPayload(),
    };

    const authUserId = this.generateUserID();
    if (authUserId.startsWith('auth_')) {
      payload.user_id = authUserId;
    }

    try {
      const res = await fetch(`${apiUrl}/subscriptions/${encodeURIComponent(this.subscriptionId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.warn('Push sync failed (HTTP ' + res.status + '):', body);
        return;
      }
      const data = await res.json().catch(() => ({}));
      console.log(
        '✅ Push subscription synced to server',
        data.has_background_push ? '(background push ready)' : '(incomplete keys)'
      );
      if (data.user_id || data.preferences) {
        const stored = localStorage.getItem('ttmenus_notification_subscription');
        if (stored) {
          try {
            const sub = JSON.parse(stored);
            if (data.user_id) sub.user_id = data.user_id;
            if (data.preferences) sub.preferences = data.preferences;
            localStorage.setItem('ttmenus_notification_subscription', JSON.stringify(sub));
          } catch (e) {
            /* ignore */
          }
        }
      }
      this.notifyServiceWorkerSubscription(this.subscriptionId);
    } catch (err) {
      console.warn('Push sync error:', err && err.message ? err.message : err);
    }
  },

  /** Tell the service worker which subscription ID to use for confirm/click tracking. */
  notifyServiceWorkerSubscription(subscriptionId) {
    if (!subscriptionId || !navigator.serviceWorker) return;
    const payload = { type: 'SET_SUBSCRIPTION_ID', id: subscriptionId };
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage(payload);
    }
    navigator.serviceWorker.ready
      .then((reg) => {
        if (reg.active) reg.active.postMessage(payload);
      })
      .catch(() => {});
  },

  /**
   * Register service worker for background notifications
   */
  async registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const swPath = resolveNotifyConfig().serviceWorkerPath || '/sw.js';
        const registration = await navigator.serviceWorker.register(swPath, {
          scope: '/',
        });
        this.serviceWorkerRegistration = registration;
        console.log('✅ Service Worker registered:', registration.scope);
        this.configureServiceWorkerNotifyUrl(registration);
        
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
   * Pass notify-service URL to the service worker (supports local dev overrides).
   */
  configureServiceWorkerNotifyUrl(registration) {
    const serviceUrl =
      resolveNotifyConfig().serviceUrl ||
      window.SiteConfig?.notifyServiceUrl ||
      'https://notify.ttmenus.com';
    const payload = { type: 'SET_NOTIFY_CONFIG', serviceUrl };

    const send = (worker) => {
      if (worker) worker.postMessage(payload);
    };

    send(registration.active);
    send(registration.waiting);
    send(registration.installing);

    navigator.serviceWorker.ready
      .then((reg) => send(reg.active))
      .catch(() => {});
  },

  /**
   * Create or refresh browser Push API subscription (required for phone alerts when app is closed).
   */
  async ensurePushSubscription(vapidPublicKey) {
    const pushManager = this.serviceWorkerRegistration && this.serviceWorkerRegistration.pushManager;
    if (!pushManager) {
      return null;
    }

    const applicationServerKey = this.urlBase64ToUint8Array(vapidPublicKey);
    let pushSubscription = await pushManager.getSubscription();
    const storedVapid = localStorage.getItem(this.VAPID_KEY_STORAGE);
    const resyncedFor = localStorage.getItem(this.VAPID_RESYNC_STORAGE);
    const vapidChanged = !storedVapid || storedVapid !== vapidPublicKey;
    const needsResync = vapidChanged || resyncedFor !== vapidPublicKey;

    if (pushSubscription && needsResync) {
      console.warn('VAPID key changed or push subscription needs resync: recreating background push subscription');
      try {
        await pushSubscription.unsubscribe();
      } catch (unsubErr) {
        console.warn('Could not unsubscribe stale push subscription:', unsubErr);
      }
      pushSubscription = null;
    }

    if (pushSubscription) {
      try {
        if (!pushSubscription.getKey('p256dh') || !pushSubscription.getKey('auth')) {
          await pushSubscription.unsubscribe();
          pushSubscription = null;
        }
      } catch (e) {
        try {
          await pushSubscription.unsubscribe();
        } catch (unsubErr) {
          console.warn('Could not refresh push subscription:', unsubErr);
        }
        pushSubscription = null;
      }
    }

    if (!pushSubscription) {
      try {
        pushSubscription = await pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey,
        });
      } catch (subscribeErr) {
        const name = subscribeErr && subscribeErr.name ? subscribeErr.name : 'PushSubscribeError';
        const msg = subscribeErr && subscribeErr.message ? subscribeErr.message : '';
        throw new Error(
          msg
            ? `Browser push subscribe failed (${name}) - ${msg}`
            : `Browser push subscribe failed (${name}). Check VAPID public key on notify-service and try again.`
        );
      }
      console.log(
        '✅ Background push subscription created:',
        pushSubscription.endpoint.substring(0, 50) + '...'
      );
    } else {
      console.log('✅ Using existing background push subscription');
    }

    localStorage.setItem(this.VAPID_KEY_STORAGE, vapidPublicKey);
    localStorage.setItem(this.VAPID_RESYNC_STORAGE, vapidPublicKey);
    return pushSubscription;
  },

  /**
   * Fetch VAPID public key from notify-service.
   */
  async fetchVapidPublicKey(apiUrl, clientDomain) {
    const keyResponse = await fetch(
      `${apiUrl}/clients/${encodeURIComponent(clientDomain)}/vapid-key`
    );
    if (keyResponse.ok) {
      const keyData = await keyResponse.json();
      const key = keyData.publicKey || keyData.vapid_public_key;
      if (key) {
        if (key.length < 80) {
          throw new Error(
            'Invalid VAPID public key from server (too short). Notify-service VAPID_PUBLIC_KEY may be misconfigured.'
          );
        }
        console.log('✅ VAPID public key retrieved');
        return key;
      }
    }
    if (keyResponse.status === 503) {
      throw new Error(
        'Background push is not configured on the notification server (VAPID keys missing).'
      );
    }
    const body = await keyResponse.text().catch(() => '');
    throw new Error(
      'Could not load push configuration (HTTP ' + keyResponse.status + '): ' + body
    );
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
      // Not subscribed: ensure buttons show correctly
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
    if (typeof AuthClient !== 'undefined' && AuthClient.getCurrentUser) {
      const user = AuthClient.getCurrentUser();
      if (user && user.id != null && user.id !== '') {
        return 'auth_' + String(user.id);
      }
    }
    let userId = localStorage.getItem('ttmenus_user_id');
    if (!userId) {
      userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('ttmenus_user_id', userId);
    }
    return userId;
  },

  getPhotoReviewAlertsEnabled() {
    const stored = localStorage.getItem(this.PHOTO_REVIEW_ALERTS_STORAGE);
    return stored !== '0' && stored !== 'false';
  },

  setPhotoReviewAlertsEnabled(enabled) {
    localStorage.setItem(this.PHOTO_REVIEW_ALERTS_STORAGE, enabled ? '1' : '0');
  },

  readLocalAlertPrefs() {
    let prefs = {};
    try {
      if (typeof AuthClient !== 'undefined' && AuthClient.getCachedPreferences) {
        const cached = AuthClient.getCachedPreferences();
        if (cached && typeof cached === 'object') prefs = cached;
      }
    } catch (e) {
      /* ignore */
    }
    if ((!prefs.alert_topics || !prefs.alert_topics.length) && !prefs.alert_frequency) {
      try {
        const raw = localStorage.getItem('ttms_guest_taste_prefs');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') prefs = Object.assign({}, parsed, prefs);
        }
      } catch (e2) {
        /* ignore */
      }
    }
    return {
      alert_topics: Array.isArray(prefs.alert_topics) ? prefs.alert_topics.slice() : [],
      alert_frequency: String(prefs.alert_frequency || ''),
    };
  },

  buildPreferencesPayload() {
    const alerts = this.readLocalAlertPrefs();
    const payload = {
      enable_photo_review_alerts: this.getPhotoReviewAlertsEnabled(),
    };
    if (alerts.alert_topics.length) payload.alert_topics = alerts.alert_topics;
    if (alerts.alert_frequency) payload.alert_frequency = alerts.alert_frequency;
    return payload;
  },

  notifyAuthHeaders() {
    const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
    try {
      const token =
        typeof AuthClient !== 'undefined' && AuthClient.getAccessToken
          ? AuthClient.getAccessToken()
          : null;
      if (token) headers.Authorization = 'Bearer ' + token;
    } catch (e) {
      /* ignore */
    }
    return headers;
  },

  async ensureNotifyAccessToken() {
    try {
      if (typeof AuthClient !== 'undefined' && typeof AuthClient.ensureAccessToken === 'function') {
        await AuthClient.ensureAccessToken();
      }
    } catch (e) {
      /* ignore */
    }
  },

  notifyApiUrl() {
    return resolveNotifyConfig().apiUrl || `${this.notifyServiceUrl}/api/v1`;
  },

  isSignedInNotifyUser() {
    const userId = this.generateUserID();
    return typeof userId === 'string' && userId.indexOf('auth_') === 0;
  },

  async updatePhotoReviewPreference(enabled) {
    this.setPhotoReviewAlertsEnabled(enabled);
    if (!this.subscriptionId) {
      return { ok: false, reason: 'not_subscribed' };
    }

    const apiUrl = resolveNotifyConfig().apiUrl || `${this.notifyServiceUrl}/api/v1`;
    try {
      const res = await fetch(`${apiUrl}/subscriptions/${encodeURIComponent(this.subscriptionId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preferences: { enable_photo_review_alerts: !!enabled },
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.warn('Photo review preference sync failed:', body);
        return { ok: false, reason: body || res.statusText };
      }
      const data = await res.json().catch(() => ({}));
      if (data.preferences) {
        const stored = localStorage.getItem('ttmenus_notification_subscription');
        if (stored) {
          try {
            const sub = JSON.parse(stored);
            sub.preferences = data.preferences;
            localStorage.setItem('ttmenus_notification_subscription', JSON.stringify(sub));
          } catch (e) {
            /* ignore */
          }
        }
      }
      return { ok: true };
    } catch (err) {
      console.warn('Photo review preference sync error:', err && err.message ? err.message : err);
      return { ok: false, reason: err && err.message ? err.message : 'network_error' };
    }
  },

  isCurrentUserAdmin() {
    if (typeof AuthClient === 'undefined') return false;
    if (AuthClient.isSuperadmin && AuthClient.isSuperadmin()) return true;
    if (AuthClient.isAdmin && AuthClient.isAdmin()) return true;
    return false;
  },

  shouldDisplayNotification(notification) {
    var data = notification && notification.data;
    if (!data || data.admin_only !== true) return true;
    if (!this.isCurrentUserAdmin()) return false;
    var adminIds = data.admin_user_ids;
    if (!adminIds || !adminIds.length) return true;
    var userId = this.generateUserID();
    if (!userId || userId.indexOf('auth_') !== 0) return false;
    var numericId = userId.slice(5);
    for (var i = 0; i < adminIds.length; i++) {
      if (String(adminIds[i]) === numericId) return true;
    }
    return false;
  },

  /**
   * Link an existing push subscription to the signed-in admin account (required for photo approval alerts).
   */
  async relinkSubscriptionToAuthUser() {
    if (!this.subscriptionId) return { ok: false, reason: 'not_subscribed' };
    const userId = this.generateUserID();
    if (!userId.startsWith('auth_')) {
      return { ok: false, reason: 'not_signed_in' };
    }

    const pushManager =
      this.serviceWorkerRegistration && this.serviceWorkerRegistration.pushManager;
    let pushSubscription = pushManager ? await pushManager.getSubscription() : null;
    if (this.supportsBackgroundPush() && !pushSubscription) {
      try {
        const apiUrl = resolveNotifyConfig().apiUrl || `${this.notifyServiceUrl}/api/v1`;
        const vapidPublicKey = await this.fetchVapidPublicKey(apiUrl, this.getClientDomain());
        pushSubscription = await this.ensurePushSubscription(vapidPublicKey);
      } catch (err) {
        return { ok: false, reason: err && err.message ? err.message : 'push_unavailable' };
      }
    }

    await this.syncPushSubscriptionToServer(pushSubscription);
    return { ok: true, userId };
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
        'Notify service is unreachable (' +
          msg +
          '). If notify.ttmenus.com is down or not deployed, subscriptions cannot work. Check https://notify.ttmenus.com/health from your browser.'
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
    const authClientId =
      window.CLIENT_ID ||
      window.SITE_CLIENT_ID ||
      (window.SiteConfig && window.SiteConfig.contentManagement && window.SiteConfig.contentManagement.clientId) ||
      '';
    const registerUrl = `${this.notifyServiceUrl}/api/v1/clients/register`;
    let registerResponse;
    try {
      registerResponse = await fetch(registerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: clientDomain,
          client_name: this.notifyClientDisplayName() || clientDomain,
          service_group: 'ttmenus',
          auth_client_id: authClientId || undefined,
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

    // Set device type if not already set: use multiple methods for accuracy
    if (!demographics.device_type) {
      // Method 1 - Use screen width
      const screenWidth = demographics.screen_width || window.innerWidth || 0;
      if (screenWidth < 768) {
        demographics.device_type = 'mobile';
      } else if (screenWidth < 1024) {
        demographics.device_type = 'tablet';
      } else {
        demographics.device_type = 'desktop';
      }
      
      // Method 2 - Verify with user agent if available
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

      const apiUrl = resolveNotifyConfig().apiUrl || `${this.notifyServiceUrl}/api/v1`;

      if (this.isIOS() && !this.isStandalonePWA()) {
        throw new Error(this.getIOSPushRequirementMessage());
      }

      let pushSubscription = null;
      let deviceToken = this.getWebSocketConnectionID();

      if (this.supportsBackgroundPush()) {
        const vapidPublicKey = await this.fetchVapidPublicKey(apiUrl, clientDomain);
        pushSubscription = await this.ensurePushSubscription(vapidPublicKey);
        if (!pushSubscription) {
          throw new Error('Could not register for background push notifications.');
        }
        deviceToken = pushSubscription.endpoint;
      } else if ('serviceWorker' in navigator) {
        throw new Error(
          'This browser cannot receive alerts when closed. Try Chrome or Safari on your phone, or add the menu to your home screen.'
        );
      } else {
        throw new Error('Push notifications are not supported in this browser.');
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
        location_key: this.getLocationKey() || undefined,
      };

      // Add push subscription details (required for background delivery on phones)
      if (!pushSubscription) {
        throw new Error('Background push registration failed. Alerts cannot be delivered when the app is closed.');
      }
      subscriptionData.push_endpoint = pushSubscription.endpoint;
      subscriptionData.push_keys = {
        p256dh: this.arrayBufferToBase64(pushSubscription.getKey('p256dh')),
        auth: this.arrayBufferToBase64(pushSubscription.getKey('auth')),
      };
      subscriptionData.preferences = this.buildPreferencesPayload();

      // Subscribe via notify-service API
      const subscribeUrl = `${apiUrl}/subscriptions`;
      console.log('Subscription URL:', subscribeUrl);

      // Connect early so welcome notification can arrive via WebSocket while tab is open
      this.connectWebSocket({ allowWithoutSubscription: true });

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

      this.notifyServiceWorkerSubscription(subscription.id);

      // Connect to WebSocket for real-time notifications (when site is open)
      this.connectWebSocket();

      this.updateSubscribeButton(true, { backgroundPush: true });
      this.followCurrentVenueIfSignedIn();
      if (typeof this.renderNotificationFeed === 'function') {
        this.renderNotificationFeed();
      }
      if (typeof this.renderSubscriptionManager === 'function') {
        this.renderSubscriptionManager();
      }
      if (window.NotifyInbox && typeof window.NotifyInbox.refresh === 'function') {
        window.NotifyInbox.refresh();
      }
      this.showMessage(
        'Alerts enabled! You will receive push notifications on this device even when the menu is closed.',
        'success'
      );
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
      const apiUrl = resolveNotifyConfig().apiUrl || `${this.notifyServiceUrl}/api/v1`;
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
   * @param {{ allowWithoutSubscription?: boolean }} [options]
   */
  connectWebSocket(options) {
    options = options || {};
    if (this.wsConnection && this.wsConnection.readyState === WebSocket.OPEN) {
      console.log('✅ WebSocket already connected');
      return; // Already connected
    }
    
    if (!options.allowWithoutSubscription && !this.subscriptionId) {
      console.log('⚠️ Cannot connect WebSocket: No active subscription');
      return;
    }

    try {
      const wsUrl = resolveNotifyConfig().websocketUrl || this.notifyServiceUrl.replace('https://', 'wss://').replace('http://', 'ws://') + '/api/v1/ws/connect';
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

      if (!ttmsIsLocalDevHost() && ttmsIsLoopbackUrl(wsPath)) {
        console.warn('Skipping notification WebSocket: loopback URL on public site');
        return;
      }

      console.log('Connecting to WebSocket:', wsPath);
      this.wsConnection = new WebSocket(wsPath);

      this.wsConnection.onopen = () => {
        console.log('✅ WebSocket connected for notifications');
        console.log('🔌 Connection ID:', connectionId);
        console.log('📡 WebSocket readyState:', this.wsConnection.readyState);
        this.syncPushSubscriptionToServer();
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
    if (!this.shouldDisplayNotification(notification)) {
      console.log('Skipping admin-only notification for this user/device');
      return;
    }

    try {
      document.dispatchEvent(new CustomEvent('ttms:notify-received', { detail: notification }));
    } catch (e) {}
    if (window.NotifyInbox && typeof window.NotifyInbox.remember === 'function') {
      window.NotifyInbox.remember(notification);
    }

    if (Notification.permission !== 'granted') {
      console.warn('⚠️ Notification permission not granted');
      return;
    }

    var notificationId = notification && notification.id;
    if (notificationId) {
      var now = Date.now();
      if (!this._recentNotificationIds) this._recentNotificationIds = new Map();
      var lastShown = this._recentNotificationIds.get(notificationId);
      if (lastShown && now - lastShown < 15000) {
        console.log('Skipping duplicate in-tab notification:', notificationId);
        return;
      }
      this._recentNotificationIds.set(notificationId, now);
    }

    const defaultIcon = 'https://cdn.ttmenus.com/branding/ttmenus/ttmenus.gif';
    const iconUrl =
      (notification.data && (notification.data.icon || notification.data.image || notification.data.image_url)) ||
      notification.icon ||
      notification.image ||
      defaultIcon;
    const imageUrl =
      (notification.data && (notification.data.image || notification.data.image_url)) ||
      notification.image ||
      undefined;
    const badgeUrl = (notification.data && notification.data.badge) || iconUrl;
    const linkUrl = notification.data && (notification.data.url || notification.data.link);

    const notificationData = {
      title: notification.title || 'TTMenus',
      body: notification.message || notification.body || '',
      icon: iconUrl,
      badge: badgeUrl,
      image: imageUrl,
      id: notification.id,
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
      
      // Handle click event: navigate to link and track click
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
      const apiUrl = resolveNotifyConfig().apiUrl || `${this.notifyServiceUrl}/api/v1`;
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
      const apiUrl = resolveNotifyConfig().apiUrl || `${this.notifyServiceUrl}/api/v1`;
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
   * Apply subscribed/unsubscribed labels to one notify CTA.
   * @param {HTMLElement|null} btn
   * @param {HTMLElement|null} btnText
   * @param {HTMLElement|null} btnHint
   * @param {boolean} isSubscribed
   * @param {boolean} backgroundPush
   */
  applySubscribeButtonState(btn, btnText, btnHint, isSubscribed, backgroundPush) {
    if (!btn) return;

    if (isSubscribed) {
      btn.classList.add('subscribed');
      btn.setAttribute('aria-pressed', 'true');
      if (btn.getAttribute('data-opens') === 'notify-inbox') {
        btn.title = 'Menu alerts';
      } else if (btnText) {
        btnText.textContent = 'Alerts on';
      } else {
        btn.setAttribute(
          'aria-label',
          backgroundPush ? 'Alerts on: tap to turn off' : 'Alerts need setup: tap to re-enable'
        );
      }
      if (btn.getAttribute('data-opens') !== 'notify-inbox') {
        if (btnHint) {
          btnHint.textContent = backgroundPush
            ? 'Tap to turn off'
            : 'Tap to fix phone alerts';
        }
        btn.title = backgroundPush
          ? 'You receive menu alerts: tap to turn off'
          : 'Background alerts need setup: tap to re-enable';
      }
    } else {
      btn.classList.remove('subscribed');
      btn.setAttribute('aria-pressed', 'false');
      if (btn.getAttribute('data-opens') === 'notify-inbox') {
        btn.title = 'Menu alerts';
      } else if (btnText) {
        btnText.textContent = 'Get menu alerts';
      } else {
        btn.setAttribute('aria-label', 'Get menu alerts');
      }
      if (btn.getAttribute('data-opens') !== 'notify-inbox') {
        if (btnHint) btnHint.textContent = 'Free · specials & hours';
        btn.title = 'Get alerts for specials, hours, and menu updates';
      }
    }
  },

  /**
   * Update subscribe button state
   * @param {boolean} isSubscribed
   * @param {{ backgroundPush?: boolean }} [options]
   */
  updateSubscribeButton(isSubscribed, options) {
    options = options || {};
    const backgroundPush = options.backgroundPush !== false;

    this.applySubscribeButtonState(
      document.getElementById('subBtn'),
      document.getElementById('subBtnText'),
      document.getElementById('subBtnHint'),
      isSubscribed,
      backgroundPush
    );

    this.applySubscribeButtonState(
      document.getElementById('subBtnHeader'),
      document.getElementById('subBtnHeaderText'),
      document.getElementById('subBtnHeaderHint'),
      isSubscribed,
      backgroundPush
    );

    this.applySubscribeButtonState(
      document.getElementById('headerNotificationBtn'),
      document.getElementById('headerNotificationBtn') &&
        document.getElementById('headerNotificationBtn').querySelector('.notification-subscribe-btn__text'),
      null,
      isSubscribed,
      backgroundPush
    );

    if (window.NotifyInbox && typeof window.NotifyInbox.syncSubscribe === 'function') {
      window.NotifyInbox.syncSubscribe();
    }

    const btnHero = document.getElementById('subBtnHero');
    const btnHeroText = document.getElementById('subBtnHeroText');
    const btnHeroHint = document.getElementById('subBtnHeroHint');
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
    // Simple alert for now: can be enhanced with a toast notification
    if (type === 'error') {
      alert('Error: ' + message);
    } else if (type === 'success') {
      console.log('✅ ' + message);
      // Could show a toast notification here
    } else {
      console.log(message);
    }
  },

  domainFromMenuUrl(url) {
    try {
      const parsed = new URL(String(url || ''), window.location.origin);
      return (parsed.hostname || '').replace(/^www\./i, '');
    } catch (e) {
      return '';
    }
  },

  async followVenue(domain, locationKey) {
    domain = String(domain || '').replace(/^www\./i, '').trim();
    locationKey = String(locationKey || '').trim();
    if (!this.isSignedInNotifyUser() || !domain) return { ok: false };
    if (this.isHubClientDomain(domain)) {
      return { ok: false };
    }
    try {
      await this.ensureNotifyAccessToken();
      const body = { client_domain: domain };
      if (locationKey) body.location_key = locationKey;
      const res = await fetch(`${this.notifyApiUrl()}/me/follows`, {
        method: 'POST',
        headers: this.notifyAuthHeaders(),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { ok: false, reason: data.error || res.status };
      }
      if (typeof this.renderSubscriptionManager === 'function') {
        this.renderSubscriptionManager();
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: e && e.message ? e.message : 'network_error' };
    }
  },

  followVenueFromUrl(url) {
    const domain = this.domainFromMenuUrl(url);
    if (!domain) return;
    this.followVenue(domain, this.getLocationKey(url)).catch(function () {});
  },

  async followCurrentVenueIfSignedIn() {
    return this.followVenue(this.getClientDomain(), this.getLocationKey());
  },

  wantsNearbyClientAlerts() {
    const topics = this.readLocalAlertPrefs().alert_topics || [];
    return topics.indexOf('nearby_client') !== -1;
  },

  haversineMeters(lat1, lon1, lat2, lon2) {
    const toRad = (d) => (Number(d) * Math.PI) / 180;
    const r = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  },

  stopNearbyClientWatcher() {
    if (this._nearbyWatchId != null && navigator.geolocation) {
      try {
        navigator.geolocation.clearWatch(this._nearbyWatchId);
      } catch (e) {
        /* ignore */
      }
    }
    this._nearbyWatchId = null;
  },

  syncNearbyClientWatcher() {
    if (!this.subscriptionId || !this.wantsNearbyClientAlerts() || !navigator.geolocation) {
      this.stopNearbyClientWatcher();
      return;
    }
    if (this._nearbyWatchId != null) return;
    const self = this;
    this._nearbyWatchId = navigator.geolocation.watchPosition(
      function (pos) {
        self.handleNearbyPosition(pos);
      },
      function (err) {
        console.warn('Nearby restaurant alerts need location permission:', err && err.message);
      },
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 20000 }
    );
  },

  async handleNearbyPosition(pos) {
    if (!pos || !pos.coords) return;
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const venues = await this.loadNearbyVenueTargets();
    if (!venues.length) return;
    const radius = 250;
    const seen = this.readNearbyAlertSeen();
    const now = Date.now();
    const cooldown = 6 * 60 * 60 * 1000;
    venues.forEach((venue) => {
      if (!venue || !Number.isFinite(venue.lat) || !Number.isFinite(venue.lon)) return;
      const meters = this.haversineMeters(lat, lon, venue.lat, venue.lon);
      if (meters > radius) return;
      const key = venue.domain || venue.name;
      if (seen[key] && now - seen[key] < cooldown) return;
      seen[key] = now;
      this.showNearbyClientNotification(venue, Math.round(meters));
    });
    this.writeNearbyAlertSeen(seen);
  },

  readNearbyAlertSeen() {
    try {
      const raw = localStorage.getItem('ttmenus_nearby_alert_seen');
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};
    }
  },

  writeNearbyAlertSeen(seen) {
    try {
      localStorage.setItem('ttmenus_nearby_alert_seen', JSON.stringify(seen || {}));
    } catch (e) {
      /* ignore */
    }
  },

  async loadNearbyVenueTargets() {
    let menus = [];
    try {
      const res = await fetch('/locations/index.json', { headers: { Accept: 'application/json' } });
      if (!res.ok) return [];
      const data = await res.json();
      menus = Array.isArray(data && data.menus) ? data.menus : [];
    } catch (e) {
      return [];
    }

    const followSet = {};
    try {
      const mine = await this.fetchMySubscriptions();
      (mine.subscriptions || []).forEach((row) => {
        const domain = String((row && row.client_domain) || '').replace(/^www\./i, '');
        if (domain && domain !== 'ttmenus.com') followSet[domain] = true;
      });
    } catch (e) {
      /* ignore */
    }

    const out = [];
    const seen = {};
    menus.forEach((menu) => {
      const domain = this.domainFromMenuUrl(menu && menu.menu);
      if (!domain || seen[domain]) return;
      const locs = Array.isArray(menu.locations) ? menu.locations : [];
      locs.forEach((loc) => {
        let vLat = Number(loc && loc.lat);
        let vLon = Number(loc && loc.lon);
        if ((!Number.isFinite(vLat) || !Number.isFinite(vLon)) && loc && Array.isArray(loc.latlon)) {
          vLat = parseFloat(loc.latlon[0]);
          vLon = parseFloat(loc.latlon[1]);
        }
        if (!Number.isFinite(vLat) || !Number.isFinite(vLon)) return;
        if (Object.keys(followSet).length && !followSet[domain]) return;
        seen[domain] = true;
        out.push({
          domain: domain,
          name: String((menu && menu.name) || domain),
          lat: vLat,
          lon: vLon,
          url: menu.menu && String(menu.menu).indexOf('://') !== -1 ? menu.menu : 'https://' + domain + '/',
        });
      });
    });
    return out;
  },

  showNearbyClientNotification(venue, meters) {
    if (!venue) return;
    const title = venue.name || 'Restaurant nearby';
    const body =
      meters != null
        ? "You're about " + meters + ' meters away. Open the menu?'
        : "You're close by. Open the menu?";
    const payload = {
      title: title,
      body: body,
      data: { url: venue.url || '/', nearby_client: true },
    };
    if (this.serviceWorkerRegistration && this.serviceWorkerRegistration.active) {
      this.serviceWorkerRegistration.active.postMessage({
        type: 'SHOW_NOTIFICATION',
        title: title,
        options: {
          body: body,
          data: payload.data,
          tag: 'nearby-' + (venue.domain || 'venue'),
        },
      });
      return;
    }
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        const n = new Notification(title, { body: body, data: payload.data });
        n.onclick = function () {
          if (payload.data.url) window.open(payload.data.url, '_blank');
        };
      } catch (e) {
        /* ignore */
      }
    }
  },

  async syncUserAlertPreferences(prefs) {
    const src = prefs && typeof prefs === 'object' ? prefs : this.readLocalAlertPrefs();
    const topics = Array.isArray(src.alert_topics) ? src.alert_topics : [];
    const frequency = String(src.alert_frequency || '');
    const patch = { alert_topics: topics };
    if (frequency) patch.alert_frequency = frequency;

    if (this.subscriptionId) {
      try {
        await fetch(`${this.notifyApiUrl()}/subscriptions/${encodeURIComponent(this.subscriptionId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ preferences: patch }),
        });
      } catch (e) {
        console.warn('Local subscription preference sync failed:', e);
      }
    }

    if (!this.isSignedInNotifyUser()) {
      this.syncNearbyClientWatcher();
      return { ok: false, reason: 'not_signed_in' };
    }
    try {
      await this.ensureNotifyAccessToken();
      const res = await fetch(`${this.notifyApiUrl()}/me/preferences`, {
        method: 'PATCH',
        headers: this.notifyAuthHeaders(),
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        this.syncNearbyClientWatcher();
        return { ok: false, reason: 'http_' + res.status };
      }
      if (typeof this.renderSubscriptionManager === 'function') {
        this.renderSubscriptionManager();
      }
      this.syncNearbyClientWatcher();
      return { ok: true };
    } catch (err) {
      this.syncNearbyClientWatcher();
      return { ok: false, reason: err && err.message ? err.message : 'network_error' };
    }
  },

  async fetchMySubscriptions() {
    if (!this.isSignedInNotifyUser()) {
      return { success: false, subscriptions: [] };
    }
    try {
      await this.ensureNotifyAccessToken();
      const res = await fetch(`${this.notifyApiUrl()}/me/subscriptions`, {
        headers: this.notifyAuthHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { success: false, subscriptions: [], error: data.error };
      }
      return {
        success: true,
        subscriptions: Array.isArray(data.subscriptions) ? data.subscriptions : [],
      };
    } catch (err) {
      return { success: false, subscriptions: [], error: err && err.message };
    }
  },

  async fetchNotificationFeed(limit) {
    const lim = Math.min(Math.max(Number(limit) || 30, 1), 100);
    const seen = {};
    const notifications = [];
    const add = (list) => {
      (list || []).forEach((item) => {
        if (!item) return;
        const id = item.id || item.delivery_id || '';
        const key = id || String(item.title || '') + '|' + String(item.created_at || '');
        if (!key || seen[key]) return;
        seen[key] = true;
        notifications.push(item);
      });
    };

    await this.ensureNotifyAccessToken();
    if (this.isSignedInNotifyUser()) {
      try {
        const res = await fetch(`${this.notifyApiUrl()}/me/notifications?limit=${lim}`, {
          headers: this.notifyAuthHeaders(),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          add(data.notifications);
        }
      } catch (e) {
        /* still try the device feed */
      }
    }
    if (!this.subscriptionId) {
      this.loadSubscriptionFromStorage();
    }
    if (this.subscriptionId) {
      try {
        const response = await fetch(
          `${this.notifyApiUrl()}/subscriptions/${encodeURIComponent(this.subscriptionId)}/notifications?limit=${lim}`,
          { headers: { Accept: 'application/json' } }
        );
        const data = await response.json().catch(() => ({}));
        if (response.ok) {
          add(data.notifications);
        }
      } catch (err) {
        if (!notifications.length) {
          return {
            success: false,
            error: err && err.message ? err.message : 'Failed to load feed',
            notifications: [],
          };
        }
      }
    }
    if (!notifications.length && !this.subscriptionId && !this.isSignedInNotifyUser()) {
      return { success: false, error: 'not_subscribed', notifications: [] };
    }
    return {
      success: true,
      notifications: notifications,
      count: notifications.length,
    };
  },

  escapeFeedHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  formatFeedTime(raw) {
    if (!raw) return '';
    try {
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch (_) {
      return '';
    }
  },

  async renderNotificationFeed() {
    const list = document.getElementById('ttms-guest-notify-feed-list');
    const status = document.getElementById('ttms-guest-notify-feed-status');
    if (!list || !status) return;

    if (
      !this.subscriptionId &&
      !localStorage.getItem('ttmenus_notification_subscription') &&
      !this.isSignedInNotifyUser()
    ) {
      list.hidden = true;
      list.innerHTML = '';
      status.hidden = false;
      status.textContent = 'Subscribe to see notifications here.';
      return;
    }
    if (!this.subscriptionId) {
      this.loadSubscriptionFromStorage();
    }

    status.hidden = false;
    status.textContent = 'Loading…';
    list.hidden = true;

    const result = await this.fetchNotificationFeed(30);
    if (!result.success) {
      list.hidden = true;
      list.innerHTML = '';
      status.hidden = false;
      status.textContent =
        result.error === 'not_subscribed'
          ? 'Subscribe to see notifications here.'
          : 'Could not load notifications.';
      return;
    }

    const items = result.notifications || [];
    if (!items.length) {
      list.hidden = true;
      list.innerHTML = '';
      status.hidden = false;
      status.textContent = 'No notifications yet.';
      return;
    }

    status.hidden = true;
    status.textContent = '';
    list.hidden = false;
    list.innerHTML = items
      .map((item) => {
        const title = this.escapeFeedHtml(item.title || 'Notification');
        const message = this.escapeFeedHtml(item.message || '');
        const venue = this.escapeFeedHtml(item.client_name || '');
        const when = this.escapeFeedHtml(
          this.formatFeedTime(item.delivered_at || item.created_at)
        );
        const type = this.escapeFeedHtml(item.type || 'update');
        const url = typeof item.url === 'string' ? item.url.trim() : '';
        const safeUrl =
          url && /^(https?:\/\/|\/)/i.test(url) ? this.escapeFeedHtml(url) : '';
        const body = safeUrl
          ? `<a class="ttms-guest-notify-feed__link" href="${safeUrl}">${message || title}</a>`
          : `<p class="ttms-guest-notify-feed__message">${message}</p>`;
        return (
          `<li class="ttms-guest-notify-feed__item" data-notification-id="${this.escapeFeedHtml(item.id)}">` +
          `<div class="ttms-guest-notify-feed__meta">` +
          `<span class="ttms-guest-notify-feed__type">${venue || type}</span>` +
          (when ? `<time class="ttms-guest-notify-feed__time">${when}</time>` : '') +
          `</div>` +
          `<h4 class="ttms-guest-notify-feed__item-title">${title}</h4>` +
          body +
          `</li>`
        );
      })
      .join('');
  },

  displayPlaceName(row) {
    row = row || {};
    let name = String(row.client_name || row.client_domain || 'TTMenus');
    name = name.replace(/\s*\|\s*Digital Menu & Online Ordering/gi, '').replace(/^\|\s*/, '').trim();
    if (!name) {
      name = row.is_hub ? 'TTMenus' : row.client_domain || 'TTMenus';
    }
    const loc = row.location_name || row.location_key;
    if (loc) {
      name += ' · ' + loc;
    }
    return name;
  },

  collapseMySubscriptionRows(rows) {
    const map = new Map();
    (rows || []).forEach((row) => {
      if (!row) return;
      const domain = String(row.client_domain || '')
        .toLowerCase()
        .replace(/^www\./, '');
      const nameKey = String(row.client_name || '')
        .toLowerCase()
        .replace(/\s*\|\s*digital menu & online ordering/gi, '')
        .trim();
      const isHub =
        !!row.is_hub ||
        this.isHubClientDomain(domain) ||
        nameKey === 'ttmenus' ||
        nameKey === 'localhost';
      const kind = row.kind || 'device';
      const loc = kind === 'follow' ? String(row.location_key || '').toLowerCase() : '';
      const place = domain || nameKey || row.id || 'place';
      const key = isHub ? 'hub-device' : `${kind}|${place}|${loc}`;
      const id = row.id ? String(row.id) : '';
      const prev = map.get(key);
      if (!prev) {
        map.set(key, Object.assign({}, row, { is_hub: isHub || !!row.is_hub, _ids: id ? [id] : [] }));
        return;
      }
      const ids = prev._ids ? prev._ids.slice() : prev.id ? [String(prev.id)] : [];
      if (id && ids.indexOf(id) < 0) ids.push(id);
      const prevTime = Date.parse(prev.subscribed_at || '') || 0;
      const nextTime = Date.parse(row.subscribed_at || '') || 0;
      const keep = nextTime >= prevTime ? row : prev;
      map.set(key, Object.assign({}, keep, { is_hub: isHub || !!keep.is_hub, _ids: ids }));
    });
    const deviceDomains = new Set();
    map.forEach((row) => {
      if (!row || row.kind === 'follow' || row.is_hub) return;
      const domain = String(row.client_domain || '')
        .toLowerCase()
        .replace(/^www\./, '');
      if (domain) deviceDomains.add(domain);
    });
    return Array.from(map.values()).filter((row) => {
      if (!row || row.kind !== 'follow' || row.location_key) return true;
      const domain = String(row.client_domain || '')
        .toLowerCase()
        .replace(/^www\./, '');
      return !deviceDomains.has(domain);
    });
  },

  async renderSubscriptionManager() {
    const lists = document.querySelectorAll('[data-notify-venues-list]');
    if (!lists.length) return;
    const status = document.getElementById('ttms-guest-notify-venues-status') ||
      document.getElementById('ttms-account-notify-venues-status');

    const fillStatus = (msg) => {
      lists.forEach((el) => {
        el.innerHTML = '';
        delete el.dataset.notifyVenuesPainted;
      });
      if (status) {
        status.hidden = !msg;
        status.textContent = msg || '';
      }
    };

    if (!this.isSignedInNotifyUser()) {
      fillStatus('Sign in to see and edit every place you follow.');
      return;
    }

    if (status) {
      status.hidden = false;
      status.textContent = 'Loading your places…';
    }
    const result = await this.fetchMySubscriptions();
    if (!result.success) {
      fillStatus('Could not load your subscriptions.');
      return;
    }

    const rows = this.collapseMySubscriptionRows(result.subscriptions || []);
    if (!rows.length) {
      fillStatus('No venue alerts yet. Follow a restaurant or tap Notify me on a menu.');
      return;
    }

    if (status) {
      status.hidden = true;
      status.textContent = '';
    }
    const settled = Array.from(lists).some((el) => el.dataset.notifyVenuesPainted === '1');
    const html = rows
      .map((row, idx) => {
        const name = this.escapeFeedHtml(this.displayPlaceName(row));
        const domain = this.escapeFeedHtml(row.client_domain || '');
        const loc = this.escapeFeedHtml(row.location_key || '');
        const kind = row.kind === 'follow'
          ? (row.location_key ? 'Location alerts' : 'Following')
          : row.is_hub
            ? 'This device'
            : 'Menu alerts';
        const muted = !!row.muted;
        const ids = (row._ids && row._ids.length ? row._ids : row.id ? [row.id] : []).map(String);
        const idAttr = this.escapeFeedHtml(ids.join(','));
        const muteBtn =
          row.kind === 'device' && ids.length
            ? `<button type="button" class="ttms-guest-notify-venues__btn" data-notify-mute="${idAttr}" data-muted="${muted ? '1' : '0'}">${
                muted ? 'Unmute' : 'Mute'
              }</button>`
            : '';
        const removeBtn =
          row.kind === 'follow'
            ? `<button type="button" class="ttms-guest-notify-venues__btn ttms-guest-notify-venues__btn--danger" data-notify-unfollow="${domain}" data-notify-unfollow-location="${loc}">Unfollow</button>`
            : ids.length
              ? `<button type="button" class="ttms-guest-notify-venues__btn ttms-guest-notify-venues__btn--danger" data-notify-unsub="${idAttr}">Unsubscribe</button>`
              : '';
        const settledClass = settled ? ' is-settled' : '';
        return (
          `<li class="ttms-guest-notify-venues__item${settledClass}" style="--i:${idx}" data-kind="${this.escapeFeedHtml(row.kind || '')}">` +
          `<div class="ttms-guest-notify-venues__copy">` +
          `<strong class="ttms-guest-notify-venues__name">${name}</strong>` +
          `<span class="ttms-guest-notify-venues__meta">${kind}${muted ? ' · muted' : ''}</span>` +
          `</div>` +
          `<div class="ttms-guest-notify-venues__actions">${muteBtn}${removeBtn}</div>` +
          `</li>`
        );
      })
      .join('');
    lists.forEach((el) => {
      el.innerHTML = html;
      el.dataset.notifyVenuesPainted = '1';
    });
    this.bindSubscriptionManager();
  },

  playPlaceRowExit(item) {
    return new Promise((resolve) => {
      if (!item) {
        resolve();
        return;
      }
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce) {
        resolve();
        return;
      }
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      item.classList.add('is-leaving');
      item.addEventListener('animationend', finish, { once: true });
      setTimeout(finish, 380);
    });
  },

  reportPlaceActionError(err) {
    const status =
      document.getElementById('ttms-account-notify-venues-status') ||
      document.getElementById('ttms-guest-notify-venues-status');
    const msg = err && err.message ? err.message : 'Could not update this place.';
    if (status) {
      status.hidden = false;
      status.textContent = msg;
    }
    console.error('Place alerts action failed:', err);
  },

  bindSubscriptionManager() {
    if (this._venuesClickBound) return;
    this._venuesClickBound = true;
    const self = this;
    const clickEl = function (e) {
      const node = e.target;
      const el = node && node.nodeType === 1 ? node : node && node.parentElement;
      return el && typeof el.closest === 'function' ? el : null;
    };
    document.addEventListener(
      'click',
      function (e) {
        const el = clickEl(e);
        if (!el) return;
        const mute = el.closest('[data-notify-mute]');
        const unsub = el.closest('[data-notify-unsub]');
        const unfollow = el.closest('[data-notify-unfollow]');
        if (!mute && !unsub && !unfollow) return;
        e.preventDefault();
        e.stopPropagation();
        const item = el.closest('.ttms-guest-notify-venues__item');
        if (mute) {
          if (item) item.classList.add('is-updating');
          const ids = (mute.getAttribute('data-notify-mute') || '')
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean);
          const nextMuted = mute.getAttribute('data-muted') !== '1';
          Promise.all(ids.map((id) => self.patchMySubscription(id, { muted: nextMuted })))
            .then(() => self.renderSubscriptionManager())
            .catch((err) => {
              if (item) item.classList.remove('is-updating', 'is-busy');
              self.reportPlaceActionError(err);
            });
          return;
        }
        if (unsub) {
          if (!window.confirm('Unsubscribe this device from these alerts?')) return;
          if (item) item.classList.add('is-busy');
          const ids = (unsub.getAttribute('data-notify-unsub') || '')
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean);
          Promise.all(ids.map((id) => self.deleteMySubscription(id)))
            .then(() => self.playPlaceRowExit(item))
            .then(() => {
              self.renderSubscriptionManager();
              self.renderNotificationFeed();
            })
            .catch((err) => {
              if (item) item.classList.remove('is-busy');
              self.reportPlaceActionError(err);
            });
          return;
        }
        const loc = unfollow.getAttribute('data-notify-unfollow-location') || '';
        if (!window.confirm(loc ? 'Stop alerts for this location?' : 'Stop following this restaurant?')) return;
        if (item) item.classList.add('is-busy');
        self
          .unfollowVenue(unfollow.getAttribute('data-notify-unfollow'), loc)
          .then(() => self.playPlaceRowExit(item))
          .then(() => self.renderSubscriptionManager())
          .catch((err) => {
            if (item) item.classList.remove('is-busy');
            self.reportPlaceActionError(err);
          });
      },
      true
    );
  },

  async patchMySubscription(id, body) {
    await this.ensureNotifyAccessToken();
    const res = await fetch(`${this.notifyApiUrl()}/me/subscriptions/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: this.notifyAuthHeaders(),
      body: JSON.stringify(body || {}),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Could not update subscription');
    }
    return res.json();
  },

  async deleteMySubscription(id) {
    await this.ensureNotifyAccessToken();
    const res = await fetch(`${this.notifyApiUrl()}/me/subscriptions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: this.notifyAuthHeaders(),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Could not unsubscribe');
    }
    if (this.subscriptionId && String(this.subscriptionId) === String(id)) {
      this.subscriptionId = null;
      localStorage.removeItem('ttmenus_notification_subscription');
    }
    return res.json().catch(() => ({}));
  },

  async unfollowVenue(domain, locationKey) {
    await this.ensureNotifyAccessToken();
    let path = `${this.notifyApiUrl()}/me/follows/${encodeURIComponent(domain)}`;
    if (locationKey) {
      path += `?location=${encodeURIComponent(locationKey)}`;
    }
    const res = await fetch(path, { method: 'DELETE', headers: this.notifyAuthHeaders() });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Could not unfollow');
    }
    return res.json().catch(() => ({}));
  },

  /**
   * Toggle subscription (or re-register background push if it was lost)
   */
  toggle() {
    if (this.subscriptionId) {
      const pushManager =
        this.serviceWorkerRegistration && this.serviceWorkerRegistration.pushManager;
      if (pushManager) {
        pushManager
          .getSubscription()
          .then((pushSub) => {
            if (this.supportsBackgroundPush() && !pushSub) {
              return this.unsubscribe().then(() => this.subscribe());
            }
            return this.unsubscribe();
          })
          .catch(() => this.unsubscribe());
      } else {
        this.unsubscribe();
      }
    } else {
      this.subscribe();
    }
  },
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (resolveNotifyConfig().enabled) {
      NotificationService.init();
    }
  });
} else {
  if (resolveNotifyConfig().enabled) {
    NotificationService.init();
  }
}

window.addEventListener('auth:login', function () {
  if (!resolveNotifyConfig().enabled) return;
  if (NotificationService.subscriptionId) {
    NotificationService.relinkSubscriptionToAuthUser().catch(function (err) {
      console.warn('Could not relink push subscription to account:', err);
    });
    NotificationService.followCurrentVenueIfSignedIn();
  }
  if (typeof NotificationService.renderSubscriptionManager === 'function') {
    NotificationService.renderSubscriptionManager();
  }
});

// Export for global use
window.NotificationService = NotificationService;

// Toggle function for button onclick
function toggleNotificationSubscription() {
  NotificationService.toggle();
}

