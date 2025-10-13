# _menus_ttms
The menu theme for all TTMenus Client menus

## Features

### 🎯 Comprehensive Analytics Tracking (New!)
Integrated with Matomo analytics platform for complete business insights.

**What's Tracked:**
- Menu item views and interactions
- Cart actions (add, remove, orders)
- Advertisement impressions and clicks
- Location selections
- PWA installations
- User engagement metrics
- Social media interactions
- And much more!

**Documentation:**
- 📖 **[Complete Guide](ANALYTICS_TRACKING_GUIDE.md)** - Full documentation
- 📋 **[Quick Reference](ANALYTICS_QUICK_REFERENCE.md)** - Cheat sheet
- 📝 **[Setup Summary](ANALYTICS_SETUP_SUMMARY.md)** - Implementation details

**Testing:**
- Access `/test-analytics.html` on your site to test all tracking features
- View real-time data at https://analytics.ttmenus.com

### 📱 Progressive Web App (PWA)
- Installable on mobile and desktop
- Offline support
- Push notifications via OneSignal

### 🛒 WhatsApp Ordering System
- Multi-location support
- Table ordering
- Cart management with localStorage
- VAT and service charge calculations

### 🎨 Dynamic Advertisement System
- Time-based ad scheduling
- Day-of-week filtering
- Auto-loading from JSON endpoints
- Scroll progress tracking

### 🗺️ Location Management
- Multi-location support
- Location-specific WhatsApp numbers
- Table management per location
- Saved location preferences

### 🔍 Search Functionality
- Real-time menu search
- Category filtering
- Mobile-optimized

## Analytics Setup

The theme comes with analytics pre-configured. Just ensure your `hugo.toml` has:

```toml
[params.services]
  analyticsid = YOUR_MATOMO_SITE_ID
```

All tracking happens automatically! See [ANALYTICS_SETUP_SUMMARY.md](ANALYTICS_SETUP_SUMMARY.md) for details.

## Quick Start

1. **Deploy the theme** to your Hugo site
2. **Configure** your `hugo.toml` with site parameters
3. **Test analytics** by visiting `/test-analytics.html`
4. **View data** at https://analytics.ttmenus.com

## Support

- Analytics Issues: Check [ANALYTICS_TRACKING_GUIDE.md](ANALYTICS_TRACKING_GUIDE.md)
- Matomo Dashboard: https://analytics.ttmenus.com
- Theme Docs: See individual feature documentation