# TTMS Analytics Tracking Guide

## Overview

Your TTMS menu system now has comprehensive analytics tracking integrated with **Matomo** (analytics.ttmenus.com). This document explains what's being tracked and how to view and use your analytics data.

## 🎯 What's Being Tracked

### 1. **Menu Item Views**
- Tracks when users click/view menu items
- Captures: Item name, category, price, URL
- **Event Category**: `Menu`
- **Event Action**: `Item View`
- **Event Name**: Item name
- **Event Value**: Item price

### 2. **Cart Actions**

#### Add to Cart
- Tracks every item added to cart
- Captures: Item details, quantity, total price
- **Event Category**: `Cart`
- **Event Action**: `Add Item`
- **Ecommerce**: Yes (tracks cart updates)

#### Remove from Cart
- Tracks items removed from cart
- Updates cart total value
- **Event Category**: `Cart`
- **Event Action**: `Remove Item`

### 3. **Order Submissions**
- Tracks completed orders sent via WhatsApp
- Captures:
  - Total order value
  - Order mode (takeaway/dine-in/table)
  - Location selected
  - Table number (if applicable)
  - All items in order
- **Event Category**: `Order`
- **Event Action**: `Submit`
- **Ecommerce Order**: Yes

### 4. **Advertisement Tracking**

#### Ad Impressions (Views)
- Automatically tracks when ads become visible (50%+ in viewport)
- Tracks each ad impression once per session
- **Event Category**: `Advertisement`
- **Event Action**: `Impression`

#### Ad Clicks
- Tracks when users click on advertisements
- Captures: Ad title, destination URL
- **Event Category**: `Advertisement`
- **Event Action**: `Click`

### 5. **Location Selection**
- Tracks when users select a restaurant location
- Captures: Location name, WhatsApp number, address
- **Event Category**: `Location`
- **Event Action**: `Select`
- **Custom Variable**: Saved for entire visit

### 6. **PWA Installation**
- Tracks Progressive Web App installation events
- **Event Category**: `PWA`
- **Event Action**: `Install Prompt`, `Install Prompt Shown`
- **Goal Tracking**: Goal ID 1 for successful installs

### 7. **User Engagement**

#### Scroll Depth
- Tracks how far users scroll: 25%, 50%, 75%, 100%
- **Event Category**: `Engagement`
- **Event Action**: `Scroll Depth`

#### Time on Page
- Tracks total time spent on each page
- Sends heartbeat every 30 seconds (user still active)

### 8. **Social Media Interactions**
- Tracks clicks on social media links
- Detects: Facebook, Instagram, TikTok, YouTube, Twitter, WhatsApp
- **Event Category**: `Social`
- **Event Action**: `[Network] - Click`

### 9. **Dashboard Interactions**
- Tracks when users open/close the dashboard
- Tracks menu item clicks in dashboard
- **Event Category**: `Dashboard`
- **Event Action**: `Open`, `Close`, `Menu Click`

### 10. **Search Tracking**
- Tracks search queries and results
- **Site Search**: Yes
- Captures: Search term, number of results

### 11. **Outbound Links**
- Tracks all external link clicks
- **Event Category**: `Navigation`
- **Event Action**: `Outbound Link`

### 12. **JavaScript Errors**
- Automatically tracks JavaScript errors
- **Event Category**: `Error`
- **Event Action**: Error location
- **Event Name**: Error message

## 🔧 Custom Dimensions & Variables

Your analytics tracks these custom dimensions for better segmentation:

| ID | Name | Scope | Description |
|----|------|-------|-------------|
| 1 | SessionID | Visit | Unique session identifier |
| 2 | DeviceType | Visit | Desktop, Mobile, or Tablet |
| 3 | IsPWA | Visit | Whether user is using PWA |
| 4 | OrderMode | Page | Takeaway, dine-in, or table service |
| 5 | SelectedLocation | Visit | User's selected restaurant location |
| 6 | TableNumber | Page | Table number (if applicable) |

## 📊 Accessing Your Analytics

### 1. Login to Matomo
- URL: https://analytics.ttmenus.com
- Your site appears with your configured `analyticsid`

### 2. Key Reports to Check

#### **Ecommerce Reports**
- **Ecommerce → Overview**: Total orders, revenue, conversion rate
- **Ecommerce → Products**: Most popular menu items
- **Ecommerce → Abandoned Carts**: Items added but not ordered

#### **Event Reports**
- **Behavior → Events**: All tracked events by category
- **Menu Item Views**: See which items get the most views
- **Advertisement Performance**: Impressions vs clicks
- **Cart Actions**: Add/remove patterns

#### **Custom Reports** (You can create these)
1. **Menu Performance**: Menu views → Add to cart → Orders
2. **Location Analysis**: Orders by location
3. **Ad ROI**: Ad impressions → clicks → orders
4. **Device Performance**: Orders by device type
5. **PWA Adoption**: PWA users vs regular users

#### **Goals** (Recommended Setup)
In Matomo, configure these goals:

| Goal ID | Name | Trigger |
|---------|------|---------|
| 1 | PWA Installation | Event: PWA - Install Prompt - accepted |
| 2 | Order Submission | Event: Order - Submit |
| 3 | High-Value Order | Order value > $50 (adjust as needed) |
| 4 | Menu Exploration | 5+ menu item views |

### 3. Real-Time Tracking
- **Visitors → Real-time**: See current visitors
- **Visitors → Visitor Log**: Detailed visitor journey

## 🎨 Custom Tracking (For Developers)

### Track Custom Events

```javascript
// Basic event
window.ttmsAnalytics.trackEvent('Category', 'Action', 'Name', value);

// Examples:
window.ttmsAnalytics.trackEvent('Promotion', 'Banner Click', 'Summer Sale');
window.ttmsAnalytics.trackEvent('Video', 'Play', 'About Us Video', 60);
```

### Track Custom Goals

```javascript
// Goal with revenue
window.ttmsAnalytics.trackGoal(goalId, revenue);

// Example:
window.ttmsAnalytics.trackGoal(3, 75.50); // High-value order
```

### Track Search

```javascript
window.trackSearch('pizza', 15); // Search term, results count
```

### Track Errors

```javascript
window.ttmsAnalytics.trackError('Failed to load menu', 'Menu API');
```

## 📈 Using Analytics Data

### 1. **Optimize Menu**
- Identify top-viewed but rarely ordered items → May need better descriptions or photos
- Find popular items → Feature them more prominently
- Track category performance → Reorganize menu structure

### 2. **Improve Advertising**
- Compare ad impressions vs clicks → Optimize ad creative
- Track which ads lead to orders → Focus on high-performing promotions
- Monitor ad view duration → Adjust placement

### 3. **Enhance User Experience**
- Check scroll depth → Optimize content length
- Monitor cart abandonments → Simplify checkout
- Track PWA adoption → Promote installation

### 4. **Location Performance**
- Compare orders by location
- Identify busy times per location
- Optimize location-specific promotions

### 5. **Device Optimization**
- Track conversion by device type
- Identify device-specific issues
- Optimize for mobile if it's primary traffic

## 🔍 Troubleshooting

### Events Not Showing Up?

1. **Check Browser Console**
   ```javascript
   // Should show initialization
   "🎯 TTMS Analytics initialized"
   "✅ TTMS Analytics ready"
   ```

2. **Verify Matomo is Loaded**
   ```javascript
   console.log(typeof _paq); // Should be "object"
   console.log(window.ttmsAnalytics); // Should be defined
   ```

3. **Check Network Tab**
   - Look for requests to `analytics.ttmenus.com/matomo.php`
   - Should see tracking requests on page views and events

### Debug Mode

Open browser console and run:
```javascript
// Enable verbose logging
window.ttmsAnalytics.debug = true;

// Check if analytics is enabled
console.log(window.ttmsAnalytics.enabled);

// Test event tracking
window.ttmsAnalytics.trackEvent('Test', 'Debug', 'Testing Analytics');
```

## 🚀 Best Practices

1. **Regular Review**: Check analytics weekly to spot trends
2. **Set Goals**: Configure Matomo goals for key actions
3. **Create Segments**: Segment users by device, location, PWA usage
4. **Custom Reports**: Build reports for your specific KPIs
5. **Data-Driven Decisions**: Use data to guide menu changes, promotions
6. **Privacy**: Analytics respects user privacy (no PII tracked)

## 📱 Key Metrics to Monitor

### Daily
- Total orders
- Order value
- Most viewed items
- Active promotions performance

### Weekly  
- Conversion rate (views → orders)
- Cart abandonment rate
- Popular categories
- Peak ordering times

### Monthly
- Revenue trends
- Menu item performance
- Location comparison
- Device/PWA adoption
- Returning vs new visitors

## 🎯 Analytics Maturity Path

### Phase 1: Basic Tracking (Current)
✅ Page views  
✅ Events tracking  
✅ Ecommerce tracking  
✅ Custom dimensions

### Phase 2: Advanced Analysis (Next Steps)
- Create custom segments
- Set up automated reports
- Configure conversion funnels
- A/B test menu layouts

### Phase 3: Optimization (Future)
- Predictive analytics
- Personalized recommendations
- Dynamic pricing insights
- Customer lifetime value

## 📞 Support

- **Analytics Platform**: https://analytics.ttmenus.com
- **Matomo Documentation**: https://matomo.org/docs/
- **Integration Issues**: Check browser console for errors

---

**Remember**: Analytics are only valuable when you act on insights! Regularly review your data and make informed decisions to improve your menu performance.

