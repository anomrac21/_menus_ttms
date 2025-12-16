# Notification Service Integration

The `_menus_ttms` theme now includes built-in support for the TTMenus Notification Service.

## What's Included

### Files Added

1. **`static/js/notify-client.js`**
   - Complete notification client implementation
   - WebSocket connection management
   - Auto-subscription for authenticated users
   - Notification display and handling

2. **`layouts/partials/features/notifications.html`**
   - Hugo partial template for notifications
   - Includes configuration and notification container

### Files Modified

1. **`static/css/notifications.css`**
   - Enhanced with full notification styling
   - Type-specific and priority-based styles
   - Mobile responsive

2. **`layouts/_default/baseof.html`**
   - Added notifications partial inclusion

3. **`layouts/partials/head.html`**
   - Added conditional notification CSS loading

## Configuration

To enable notifications in your menu site, add to your `hugo.toml`:

```toml
[params.notifications]
enabled = 'true'
apiUrl = 'https://notify.ttmenus.com/api/v1'
websocketUrl = 'wss://notify.ttmenus.com/api/v1/ws/connect'
```

## How It Works

1. **Auto-Initialization**: Notification client initializes automatically when enabled
2. **User Subscription**: Automatically subscribes authenticated users
3. **WebSocket Connection**: Establishes real-time connection for notifications
4. **Notification Display**: Automatically displays received notifications
5. **Auto-Reconnect**: Handles connection drops gracefully

## Features

- ✅ Auto-subscription for authenticated users
- ✅ Real-time WebSocket notifications
- ✅ Beautiful notification UI with animations
- ✅ Support for all notification types (menu_update, promotion, order, system, general)
- ✅ Priority-based styling (urgent, high, normal, low)
- ✅ Mobile responsive
- ✅ Auto-reconnect on connection loss
- ✅ Click handlers for actionable notifications

## Usage

### For Site Owners

Just add the configuration to `hugo.toml` and notifications will work automatically.

### For Developers

The notification client is available globally as `window.NotifyClient`:

```javascript
// Check connection status
NotifyClient.isConnected()

// Check subscription status
NotifyClient.isSubscribed()

// Send notification (requires admin token)
NotifyClient.sendNotification({
  clientDomain: 'yoursite.ttmenus.com',
  isBroadcast: false,
  title: 'Menu Update',
  message: 'New items added!',
  type: 'menu_update',
  priority: 'normal'
}, authToken)

// Listen for notification events
document.addEventListener('notification-received', (event) => {
  const notification = event.detail;
  // Handle notification
})
```

## Notification Types

- `menu_update` - Menu changes (purple gradient)
- `promotion` - Promotions and offers (pink gradient)
- `order` - Order updates (blue gradient)
- `system` - System announcements (yellow gradient)
- `general` - General notifications (default)

## Notification Priorities

- `urgent` - Red border, 10s display
- `high` - Orange border, 8s display
- `normal` - Blue border, 5s display
- `low` - Gray border, 3s display

## Customization

### Styling

Edit `static/css/notifications.css` to customize notification appearance.

### Behavior

Edit `static/js/notify-client.js` to customize notification behavior.

## Requirements

- Auth service integration (for user authentication)
- Notification service deployed and accessible
- Client registered in notification service

## Testing

1. Enable notifications in `hugo.toml`
2. Build your site: `hugo`
3. Log in as a user
4. Check browser console for "User subscribed to notifications"
5. Send a test notification (requires admin token)

## Support

For detailed integration documentation, see the notification service documentation in your menu demo or notify-service repository.


