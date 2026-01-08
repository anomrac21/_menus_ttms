/**
 * Service Worker for TTMenus Notifications
 * Handles background notification delivery and WebSocket connection management
 */

const CACHE_NAME = 'ttmenus-notifications-v1';
const NOTIFY_SERVICE_URL = 'https://notify.ttmenus.com';

// Install event - cache resources
self.addEventListener('install', (event) => {
  console.log('[SW] Service Worker installing...');
  self.skipWaiting(); // Activate immediately
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Service Worker activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  return self.clients.claim(); // Take control of all pages immediately
});

// Handle push notifications
self.addEventListener('push', (event) => {
  console.log('[SW] Push event received:', event);
  
  let notificationData = {
    title: 'TTMenus',
    body: 'You have a new notification',
    icon: 'https://ct.ttmenus.com/branding/ttmenus/ttmenus.gif',
    badge: 'https://ct.ttmenus.com/branding/ttmenus/ttmenus.gif',
    tag: 'ttmenus-notification',
    data: {},
  };

  // Parse push data
  if (event.data) {
    try {
      const data = event.data.json();
      if (data.notification) {
        notificationData = {
          title: data.notification.title || notificationData.title,
          body: data.notification.body || data.notification.message || notificationData.body,
          icon: data.notification.icon || data.notification.image || notificationData.icon,
          badge: data.notification.badge || notificationData.badge,
          image: data.notification.image,
          tag: data.notification.tag || data.notification.id || notificationData.tag,
          data: {
            ...data.notification.data,
            notificationId: data.notification.id,
            linkUrl: data.notification.data?.url || data.notification.data?.link,
          },
        };
      } else if (data.title || data.message) {
        // Direct notification object
        notificationData = {
          title: data.title || notificationData.title,
          body: data.message || data.body || notificationData.body,
          icon: data.icon || data.image || notificationData.icon,
          badge: data.badge || notificationData.badge,
          image: data.image,
          tag: data.tag || data.id || notificationData.tag,
          data: {
            ...data.data,
            notificationId: data.id,
            linkUrl: data.data?.url || data.data?.link,
          },
        };
      }
    } catch (e) {
      console.error('[SW] Failed to parse push data:', e);
      if (event.data.text) {
        notificationData.body = event.data.text();
      }
    }
  }

  event.waitUntil(
    self.registration.showNotification(notificationData.title, {
      body: notificationData.body,
      icon: notificationData.icon,
      badge: notificationData.badge,
      image: notificationData.image,
      tag: notificationData.tag,
      data: notificationData.data,
      requireInteraction: false,
      vibrate: [200, 100, 200],
    }).then(() => {
      // Track confirmation
      if (notificationData.data?.notificationId) {
        trackNotificationConfirmation(notificationData.data.notificationId);
      }
    })
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event);
  
  event.notification.close();

  const notificationData = event.notification.data || {};
  const linkUrl = notificationData.linkUrl;

  // Track click
  if (notificationData.notificationId) {
    trackNotificationClick(notificationData.notificationId);
  }

  // Open or focus the page
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if there's already a window/tab open
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url && 'focus' in client) {
          // If link URL provided, navigate to it
          if (linkUrl) {
            return client.navigate(linkUrl).then(() => client.focus());
          }
          return client.focus();
        }
      }
      
      // If no window is open, open a new one
      if (clients.openWindow) {
        const urlToOpen = linkUrl || '/';
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// Handle messages from the main thread
self.addEventListener('message', (event) => {
  console.log('[SW] Message received from client:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  // Handle notification display requests from main thread
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { notification } = event.data;
    self.registration.showNotification(notification.title || 'TTMenus', {
      body: notification.message || notification.body || '',
      icon: notification.icon || notification.image || 'https://ct.ttmenus.com/branding/ttmenus/ttmenus.gif',
      badge: notification.badge || 'https://ct.ttmenus.com/branding/ttmenus/ttmenus.gif',
      image: notification.image,
      tag: notification.tag || notification.id,
      data: {
        ...notification.data,
        notificationId: notification.id,
        linkUrl: notification.data?.url || notification.data?.link,
      },
    }).then(() => {
      // Track confirmation
      if (notification.id) {
        trackNotificationConfirmation(notification.id);
      }
      // Send confirmation back to client
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ success: true });
      }
    });
  }

  // Handle GET_SUBSCRIPTION request
  if (event.data && event.data.type === 'GET_SUBSCRIPTION') {
    // Get subscription from client's storage
    const subscription = event.data.subscription || null;
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage(subscription);
    }
  }
});

// Track notification confirmation
async function trackNotificationConfirmation(notificationId) {
  try {
    const subscription = await getStoredSubscription();
    if (!subscription || !subscription.id) {
      console.warn('[SW] No subscription found for tracking confirmation');
      return;
    }

    const response = await fetch(
      `${NOTIFY_SERVICE_URL}/api/v1/notifications/${notificationId}/confirm?subscription_id=${subscription.id}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.ok) {
      console.log('[SW] ✅ Notification confirmation tracked:', notificationId);
    } else {
      console.warn('[SW] ⚠️ Failed to track confirmation:', response.status);
    }
  } catch (error) {
    console.error('[SW] ❌ Error tracking confirmation:', error);
  }
}

// Track notification click
async function trackNotificationClick(notificationId) {
  try {
    const subscription = await getStoredSubscription();
    if (!subscription || !subscription.id) {
      console.warn('[SW] No subscription found for tracking click');
      return;
    }

    const response = await fetch(
      `${NOTIFY_SERVICE_URL}/api/v1/notifications/${notificationId}/click?subscription_id=${subscription.id}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.ok) {
      console.log('[SW] ✅ Notification click tracked:', notificationId);
    } else {
      console.warn('[SW] ⚠️ Failed to track click:', response.status);
    }
  } catch (error) {
    console.error('[SW] ❌ Error tracking click:', error);
  }
}

// Get stored subscription from client via message passing
async function getStoredSubscription() {
  return new Promise((resolve) => {
    // Send message to all clients to get subscription
    clients.matchAll({ includeUncontrolled: true, type: 'window' }).then((clientList) => {
      if (clientList.length > 0) {
        const channel = new MessageChannel();
        let resolved = false;
        
        channel.port1.onmessage = (event) => {
          if (!resolved) {
            resolved = true;
            resolve(event.data);
          }
        };
        
        // Set timeout in case client doesn't respond
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            resolve(null);
          }
        }, 1000);
        
        clientList[0].postMessage({ type: 'GET_SUBSCRIPTION' }, [channel.port2]);
      } else {
        resolve(null);
      }
    });
  });
}

// Sync event (for background sync if needed)
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);
  if (event.tag === 'sync-notifications') {
    event.waitUntil(syncNotifications());
  }
});

async function syncNotifications() {
  // Sync pending notifications or other background tasks
  console.log('[SW] Syncing notifications...');
}

