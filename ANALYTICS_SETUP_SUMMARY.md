# Analytics Tracking Setup - Complete ✅

## 🎉 What's Been Implemented

Your TTMS menu system now has **comprehensive analytics tracking** integrated with your existing Matomo instance at `analytics.ttmenus.com`.

## 📦 Files Created/Modified

### New Files Created:
1. **`static/js/analytics-tracking.js`** (452 lines)
   - Core analytics tracking module
   - TTMSAnalytics class with all tracking methods
   - Automatic error tracking
   - Session management

2. **`static/js/analytics-integrations.js`** (265 lines)
   - Integrates tracking with existing functionality
   - Hooks into menu items, cart, ads, dashboard
   - Auto-detects and tracks social media clicks
   - PWA installation tracking

3. **`ANALYTICS_TRACKING_GUIDE.md`**
   - Complete documentation of all tracking features
   - How to use analytics data
   - Custom tracking examples
   - Troubleshooting guide

4. **`ANALYTICS_QUICK_REFERENCE.md`**
   - Quick lookup for tracked events
   - Common checks and reports
   - Daily/weekly workflow suggestions
   - Debugging tips

### Modified Files:
1. **`layouts/partials/head.html`**
   - Added analytics-tracking.js script reference

2. **`layouts/_default/baseof.html`**
   - Added analytics-integrations.js script reference

3. **`layouts/partials/features/whatsapp_ordering_system.html`**
   - Added tracking to `addItem()` function
   - Added tracking to `removeItem()` function
   - Added tracking to `confirmSendOrder()` function

4. **`static/js/client-ad-manager.js`**
   - Added data attributes to generated ads for better tracking
   - Enhanced ad HTML for impression tracking

## 🎯 Tracking Capabilities

### Automatic Tracking (No Code Required):
- ✅ Page views (already working)
- ✅ Menu item clicks/views
- ✅ Add to cart events
- ✅ Remove from cart events
- ✅ Order submissions
- ✅ Advertisement impressions (when 50% visible)
- ✅ Advertisement clicks
- ✅ Location selection
- ✅ PWA installation prompts and outcomes
- ✅ Scroll depth (25%, 50%, 75%, 100%)
- ✅ Time on page
- ✅ Social media link clicks
- ✅ Dashboard interactions
- ✅ Outbound link clicks
- ✅ JavaScript errors

### Available for Custom Use:
- 🔧 Custom event tracking
- 🔧 Search tracking (hook it to your search)
- 🔧 Custom goal tracking
- 🔧 Error tracking

## 🧪 How to Test

### 1. Check Console Logs
Open your menu site in a browser, open DevTools (F12), and check the Console. You should see:

```
🎯 TTMS Analytics initialized
✅ TTMS Analytics ready
🔌 Initializing analytics integrations...
📝 Menu item tracking hooked
📢 Ad click tracking hooked
📍 Location tracking hooked
📱 PWA tracking hooked
📊 Dashboard tracking hooked
📱 Social media tracking hooked
✅ Analytics integrations initialized
```

### 2. Test Menu Item View
1. Click on any menu item
2. Check console for: `👁️ Menu item view tracked: {...}`
3. Check Network tab for request to `analytics.ttmenus.com/matomo.php`

### 3. Test Add to Cart
1. Add an item to your cart
2. Check console for: `🛒 Add to cart tracked: {...}`
3. Verify ecommerce data in network request

### 4. Test Location Selection
1. Change the location dropdown
2. Check console for: `📍 Location selection tracked: {...}`

### 5. Test Ad Tracking
1. Scroll to view an advertisement
2. Check console for: `👁️ Ad impression tracked: {...}`
3. Click on an ad
4. Check console for: `🖱️ Ad click tracked: {...}`

### 6. Test Order Submission
1. Add items to cart
2. Submit order (open WhatsApp)
3. Check console for: `📦 Order tracked: {...}`

### 7. Verify in Matomo
1. Go to https://analytics.ttmenus.com
2. Navigate to **Visitors → Real-time**
3. Perform actions on your site
4. See events appear in real-time visitor log

## 📊 View Your Data

### Immediate (Real-time):
```
Matomo → Visitors → Real-time
Matomo → Visitors → Visitor Log (last 100 visitors)
```

### Events:
```
Matomo → Behavior → Events
- Filter by category: Menu, Cart, Order, Advertisement, etc.
```

### Ecommerce:
```
Matomo → Ecommerce → Overview
Matomo → Ecommerce → Products (menu items)
```

### Custom Dimensions:
```
Matomo → Visitors → Custom Variables
- SessionID
- DeviceType  
- IsPWA
- SelectedLocation
```

## 🔧 Customization Examples

### Track a Custom Promotion Click
```javascript
// In your HTML or JS
document.getElementById('promo-banner').addEventListener('click', function() {
  window.ttmsAnalytics.trackEvent('Promotion', 'Click', 'Summer Special Banner');
});
```

### Track When User Opens Menu Section
```javascript
function openMenuSection(sectionName) {
  window.ttmsAnalytics.trackEvent('Menu', 'Section Open', sectionName);
  // ... your existing code
}
```

### Track Video Plays
```javascript
document.querySelector('video').addEventListener('play', function() {
  window.ttmsAnalytics.trackEvent('Media', 'Video Play', 'Restaurant Tour');
});
```

## 🎯 Recommended Goals Setup

Login to Matomo and create these goals:

### Goal 1: Order Completed
- **Match Type**: Event
- **Event Category**: `Order`
- **Event Action**: `Submit`
- **Allow Multiple Conversions**: Yes
- **Revenue**: Track from event value

### Goal 2: PWA Installation
- **Match Type**: Event
- **Event Category**: `PWA`
- **Event Action**: `Install Prompt`
- **Event Name**: `accepted`
- **Allow Multiple Conversions**: No

### Goal 3: High Engagement
- **Match Type**: Visit Criteria
- **Condition**: Number of Events > 10
- **Allow Multiple Conversions**: No

### Goal 4: Location Selected
- **Match Type**: Event
- **Event Category**: `Location`
- **Event Action**: `Select`
- **Allow Multiple Conversions**: No

## 📈 Custom Reports to Create

### 1. Menu Performance Report
- **Dimensions**: Event Name (menu items)
- **Metrics**: Unique Events, Total Events, Avg Event Value
- **Filter**: Event Category = "Menu", Event Action = "Item View"

### 2. Ad Effectiveness Report
- **Dimensions**: Event Name (ad titles)
- **Metrics**: Impressions, Clicks, Click-through Rate
- **Segments**: Compare impressions vs clicks

### 3. Location Analysis Report
- **Dimensions**: Custom Variable 5 (SelectedLocation)
- **Metrics**: Goals (orders), Revenue, Conversion Rate
- **Period**: Last 30 days

## 🚨 Important Notes

### Privacy & GDPR
- ✅ No personally identifiable information (PII) is tracked
- ✅ IP addresses are anonymized in Matomo settings (verify this)
- ✅ Respects Do Not Track headers (configure in Matomo)
- ⚠️ Add a privacy policy mentioning analytics if required

### Performance
- ✅ Scripts load asynchronously (no blocking)
- ✅ Events are batched and sent efficiently
- ✅ Minimal impact on page load times

### Browser Compatibility
- ✅ Works on all modern browsers
- ✅ Gracefully degrades if analytics blocked
- ✅ Mobile-friendly

## 🐛 Troubleshooting

### Analytics Not Working?

**1. Check if scripts are loaded:**
```javascript
// In browser console
console.log(typeof _paq); // Should be "object"
console.log(window.ttmsAnalytics); // Should be defined
```

**2. Check for ad blockers:**
- Ad blockers may block Matomo
- Test in incognito mode without extensions

**3. Verify Matomo configuration:**
- Ensure your site ID (`analyticsid`) is correct in `hugo.toml`
- Check Matomo website settings include your domain

**4. Check browser console for errors:**
- Red errors may indicate script loading issues

### Events Not Appearing?

**1. Wait a few minutes** - some processing delay is normal

**2. Check event format:**
```javascript
// Test event manually
window.ttmsAnalytics.trackEvent('Test', 'Action', 'Name', 123);
```

**3. Verify in real-time:**
- Go to Matomo → Visitors → Real-time
- Should see activity immediately

## 📞 Next Steps

1. **Test All Functionality** (15 minutes)
   - Go through test steps above
   - Verify in Matomo real-time

2. **Set Up Goals** (10 minutes)
   - Create 4 recommended goals in Matomo

3. **Create Custom Dashboard** (10 minutes)
   - Add key widgets for daily monitoring

4. **Review Guide** (as needed)
   - Read `ANALYTICS_TRACKING_GUIDE.md` for detailed info
   - Keep `ANALYTICS_QUICK_REFERENCE.md` handy

5. **Monitor for a Week** (ongoing)
   - Check daily for anomalies
   - Adjust tracking as needed

## 🎓 Learning Resources

- **This Setup**: `ANALYTICS_TRACKING_GUIDE.md` (comprehensive)
- **Quick Lookup**: `ANALYTICS_QUICK_REFERENCE.md` (cheat sheet)
- **Matomo Docs**: https://matomo.org/docs/
- **Your Analytics**: https://analytics.ttmenus.com

## ✅ Success Criteria

You'll know everything is working when:

1. ✅ Console shows initialization messages
2. ✅ Real-time visitor log shows your activity
3. ✅ Events appear under Behavior → Events
4. ✅ Ecommerce orders tracked when submitted
5. ✅ Custom variables populated (SessionID, DeviceType, etc.)

## 🚀 You're All Set!

Your analytics tracking is now live and comprehensive. Start using the data to:
- Optimize your menu
- Improve ad performance
- Enhance user experience
- Increase orders

**Questions?** Check the troubleshooting sections in the guides or review Matomo's documentation.

---

**Last Updated**: October 10, 2025  
**Analytics Version**: 1.0  
**Matomo Instance**: analytics.ttmenus.com

