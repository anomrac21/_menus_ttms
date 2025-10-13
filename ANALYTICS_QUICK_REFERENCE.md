# Analytics Quick Reference

## 📊 What's Being Tracked

| Action | Category | When Tracked |
|--------|----------|--------------|
| View menu item | `Menu` → `Item View` | User clicks/opens menu item |
| Add to cart | `Cart` → `Add Item` | Item added to order |
| Remove from cart | `Cart` → `Remove Item` | Item removed from order |
| Submit order | `Order` → `Submit` | WhatsApp order sent |
| View ad | `Advertisement` → `Impression` | Ad 50%+ visible |
| Click ad | `Advertisement` → `Click` | User clicks advertisement |
| Select location | `Location` → `Select` | Location dropdown changed |
| Install PWA | `PWA` → `Install Prompt` | App installation |
| Scroll page | `Engagement` → `Scroll Depth` | 25%, 50%, 75%, 100% |
| Click social link | `Social` → `[Network] - Click` | Social media link clicked |
| Use dashboard | `Dashboard` → `Open/Close` | Dashboard interaction |
| Search | Site Search | Search performed |
| External link | `Navigation` → `Outbound Link` | Click external link |

## 🔍 Quick Checks

### See Live Visitors
```
Matomo Dashboard → Visitors → Real-time
```

### Check Today's Orders
```
Matomo Dashboard → Ecommerce → Overview
```

### Most Popular Items
```
Matomo Dashboard → Ecommerce → Products
Sort by: Views or Orders
```

### Ad Performance
```
Matomo Dashboard → Behavior → Events
Category: Advertisement
Compare Impressions vs Clicks
```

### Location Analysis
```
Matomo Dashboard → Visitors → Custom Variables
Look for: SelectedLocation
```

### Device Breakdown
```
Matomo Dashboard → Visitors → Devices
```

## 🎯 Goals Setup (Recommended)

Login to Matomo → Goals → Add a new goal

### Goal 1: Order Placement
- **Trigger**: Event
- **Category**: `Order`
- **Action**: `Submit`
- **Revenue**: Track order value

### Goal 2: PWA Installation
- **Trigger**: Event  
- **Category**: `PWA`
- **Action**: `Install Prompt`
- **Name**: `accepted`

### Goal 3: Menu Exploration
- **Trigger**: Visit criteria
- **Condition**: Number of events > 5
- **Category**: `Menu`

## 📈 Custom Reports Ideas

### 1. Menu Funnel
```
Step 1: Menu Item View (Menu → Item View)
Step 2: Add to Cart (Cart → Add Item)  
Step 3: Order Submission (Order → Submit)
```

### 2. Ad ROI
```
Impressions: Advertisement → Impression
Clicks: Advertisement → Click
Orders: Cross-reference with Order → Submit (same session)
```

### 3. Location Performance
```
Segment by: Custom Variable "SelectedLocation"
Metrics: Orders, Revenue, Avg Order Value
```

## 🐛 Debugging

### Check if Analytics is Working
Open browser console (F12) and look for:
```
✅ "🎯 TTMS Analytics initialized"
✅ "✅ TTMS Analytics ready"
✅ "🔌 Initializing analytics integrations..."
```

### Test Event Tracking
In browser console:
```javascript
// Test a custom event
window.ttmsAnalytics.trackEvent('Test', 'Debug', 'Test Event', 100);

// Check if enabled
console.log(window.ttmsAnalytics.enabled); // Should be true

// View current session ID
console.log(window.ttmsAnalytics.sessionId);
```

### Check Network Requests
1. Open DevTools → Network tab
2. Filter: `matomo.php`
3. Interact with site (view item, add to cart)
4. Should see tracking requests

## 🔔 Common Issues

### "No events showing up"
- ✅ Check browser console for errors
- ✅ Verify Matomo tracking code is loaded
- ✅ Check ad blocker isn't blocking analytics
- ✅ Wait 5 minutes (some events are batched)

### "Ecommerce data not showing"
- ✅ Ensure ecommerce is enabled in Matomo settings
- ✅ Check order submission includes all required fields
- ✅ Verify `trackEcommerceOrder` is being called

### "Custom dimensions not appearing"
- ✅ Configure custom dimensions in Matomo admin
- ✅ Match dimension IDs in code with Matomo config
- ✅ Re-track after configuration

## 📱 Key Metrics Dashboard

Create a custom dashboard in Matomo with these widgets:

1. **Today's Revenue** (Ecommerce → Overview)
2. **Orders Count** (Ecommerce → Overview)  
3. **Top 10 Menu Items** (Ecommerce → Products)
4. **Real-time Visitors** (Visitors → Real-time)
5. **Device Types** (Visitors → Devices)
6. **Top Locations** (Custom Variables → SelectedLocation)
7. **Ad Performance** (Events → Advertisement)
8. **Conversion Funnel** (Goals → Overview)

## 🚀 Daily Workflow

### Morning Check (5 minutes)
1. Login to analytics.ttmenus.com
2. Review yesterday's orders and revenue
3. Check top-performing menu items
4. Review any active promotions/ads performance

### Weekly Review (15 minutes)
1. Compare week-over-week trends
2. Identify underperforming menu items
3. Review cart abandonment rate
4. Check location performance
5. Plan upcoming promotions based on data

### Monthly Analysis (30 minutes)
1. Month-over-month comparison
2. Device/PWA adoption trends
3. Customer behavior patterns
4. Menu optimization opportunities
5. Strategic decisions for next month

## 📞 Quick Links

- **Analytics Dashboard**: https://analytics.ttmenus.com
- **Full Guide**: See `ANALYTICS_TRACKING_GUIDE.md`
- **Matomo Docs**: https://matomo.org/docs/
- **Report Builder**: Matomo → Customization → Custom Reports

---

**Pro Tip**: Set up email reports in Matomo to get daily/weekly summaries automatically!

