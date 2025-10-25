# CDN Integration for _menus_ttms

## 🎯 Overview

This theme is now integrated with the TT Menus CDN Icon API, providing access to **239 icons** organized across 7 categories.

---

## 🚀 Quick Setup

### Step 1: Add CDN Config to Your Layout

In your Hugo layout file (e.g., `layouts/_default/baseof.html`):

```html
<head>
  <!-- Other head content -->
  
  <!-- TT Menus CDN Configuration - Add this -->
  <script src="{{ "js/cdn-config.js" | relURL }}"></script>
</head>

<body>
  <!-- Your content -->
  
  <!-- Update UI - Already exists, just make sure it loads after cdn-config -->
  <script src="{{ "js/update-ui.js" | relURL }}"></script>
</body>
```

### Step 2: Verify in Browser

Open your site and check the console:

```
✅ TT Menus CDN configured: https://cdn.ttmenus.com
📍 Icons API: https://cdn.ttmenus.com/api/list-icons/
```

### Step 3: Test Icon Gallery

1. Edit any menu category
2. Expand "📚 Choose from icon gallery"
3. See 239 icons loading from the CDN
4. Search, filter, and select icons

**That's it! 🎉**

---

## 📦 What's Included

### New File: `static/js/cdn-config.js`

This configuration script:
- Sets `window.UPDATE_API_URL` to the CDN base URL
- Provides helper methods for accessing CDN resources
- Automatically connects the icon gallery to the CDN API
- No changes needed to existing `update-ui.js`

### Existing File: `static/js/update-ui.js`

Already compatible! The icon gallery system in `update-ui.js` automatically:
- Fetches icons from `${window.UPDATE_API_URL}/api/list-icons`
- Falls back to static icons if CDN unavailable
- Supports 239 icons with search and filtering

---

## 🎨 Icon Categories

### Available Icons

| Category | Count | Examples |
|----------|-------|----------|
| 🍔 Food | 98 | burger, pizza, sushi, pasta, etc. |
| 🥤 Drink | 0 | (empty - ready for future use) |
| ⚪ White | 85 | light-themed icon variants |
| ⚫ Black | 18 | dark-themed icon variants |
| 🎮 Activities | 1 | joystick |
| 🛠️ Utilities | 32 | cart, search, home, settings, etc. |
| 📱 Social Media | 5 | Facebook, Instagram, TikTok, WhatsApp, YouTube |

**Total: 239 icons**

---

## 🔍 Using CDN Resources

### Access Icons Programmatically

```javascript
// Get icon API URL
const apiUrl = window.CDN_CONFIG.getIconsApiUrl();
// Returns: "https://cdn.ttmenus.com/api/list-icons/"

// Get specific icon URL
const burgerIcon = window.CDN_CONFIG.getIconUrl('food', 'icon-burger.webp');
// Returns: "https://cdn.ttmenus.com/icons/food/icon-burger.webp"

// Get any CDN resource
const cssFile = window.CDN_CONFIG.getResourceUrl('css', 'style.css');
// Returns: "https://cdn.ttmenus.com/css/style.css"
```

### Direct Icon URLs

```html
<!-- Food Icons -->
<img src="https://cdn.ttmenus.com/icons/food/icon-burger.webp" width="48">
<img src="https://cdn.ttmenus.com/icons/food/icon-pizza.webp" width="48">

<!-- Utility Icons (SVG) -->
<img src="https://cdn.ttmenus.com/icons/utilities/cart0.svg" width="32">
<img src="https://cdn.ttmenus.com/icons/utilities/search.svg" width="32">

<!-- Social Media Icons (SVG) -->
<img src="https://cdn.ttmenus.com/icons/socialmedia/ig.svg" width="24">
<img src="https://cdn.ttmenus.com/icons/socialmedia/fb.svg" width="24">
```

---

## ✅ Features

### Icon Gallery Features

✅ **239 icons** available  
✅ **Category filtering** (Food, Utilities, Social, etc.)  
✅ **Search functionality** with debounce  
✅ **Lazy loading** for performance  
✅ **Automatic fallback** if CDN unavailable  
✅ **Keyboard navigation** (ESC to close)  

### CDN Features

✅ **CORS enabled** - works from any domain  
✅ **Optimized caching** - 1 year for icons  
✅ **Security headers** - XSS protection, CSP  
✅ **Fast loading** - optimized WebP & SVG formats  
✅ **Auto-updates** - new icons available instantly  

---

## 🧪 Testing

### Test 1: Check CDN Config

Open browser console:

```javascript
console.log(window.CDN_CONFIG);
console.log(window.UPDATE_API_URL);
// Should show CDN configuration
```

### Test 2: Fetch Icons

```javascript
fetch(window.CDN_CONFIG.getIconsApiUrl())
  .then(r => r.json())
  .then(d => console.log(`✅ ${d.count} icons loaded`));
// Expected: "✅ 239 icons loaded"
```

### Test 3: Network Tab

1. Open DevTools → Network tab
2. Open icon gallery
3. Verify request to `cdn.ttmenus.com/api/list-icons/`
4. Check response: should have 239 icons

---

## 📊 Performance

### Before CDN Integration
- Manual icon management
- Limited icon selection
- No caching strategy

### After CDN Integration
- ✅ **239 icons** available instantly
- ✅ **1-year caching** for optimal performance
- ✅ **Lazy loading** for better UX
- ✅ **Category organization** for easy browsing
- ✅ **Search & filter** for quick access
- ✅ **Automatic updates** when CDN updated

---

## 🆘 Troubleshooting

### Icons Not Loading

**Problem**: Icon gallery shows no icons or uses fallback

**Solutions**:
1. Check if `cdn-config.js` is loaded before `update-ui.js`
2. Verify `window.UPDATE_API_URL` in console
3. Test API: `curl https://cdn.ttmenus.com/api/list-icons/`
4. Check Network tab for CORS errors

### CDN Config Not Found

**Problem**: Console shows `window.CDN_CONFIG` is undefined

**Solutions**:
1. Ensure `cdn-config.js` is included in your layout
2. Check script path is correct: `{{ "js/cdn-config.js" | relURL }}`
3. Verify file exists in `static/js/cdn-config.js`

### Using Static Fallback

**Problem**: Console shows "⚠️ Using static fallback"

**Solutions**:
- This is normal if CDN is unreachable
- Check internet connection
- Verify CDN URL is correct
- Static fallback provides 60+ icons automatically

---

## 🔄 Local Development

### Test with Local CDN

```bash
# Run CDN locally
cd _ttms_cdn
hugo server
# Access at http://localhost:1313
```

Update `cdn-config.js` temporarily:

```javascript
const CDN_CONFIG = {
  baseUrl: 'http://localhost:1313',  // Local CDN
  // ... rest of config
};
```

**Remember to change back before deploying!**

---

## 📚 Related Documentation

### CDN Documentation (_ttms_cdn)
- **ICON_API_GUIDE.md** - Complete API reference
- **ICON_QUICK_REFERENCE.md** - Quick reference card
- **CDN_INTEGRATION_GUIDE.md** - Integration instructions
- **ICON_API_SETUP_COMPLETE.md** - Setup summary

### Theme Documentation
- **ICON_GALLERY_README.md** - Icon gallery system
- **README.md** - Theme overview

---

## 🎯 Benefits

### For You (Developer)
✅ No icon management - centralized CDN  
✅ No theme changes - works with existing code  
✅ Easy integration - one script tag  
✅ Helper methods - access any CDN resource  

### For Users
✅ 239 icons - large selection  
✅ Fast loading - optimized caching  
✅ Easy to use - search & filter  
✅ Well organized - 7 categories  

### For Performance
✅ 1-year caching - aggressive optimization  
✅ WebP format - smaller file sizes  
✅ SVG support - infinitely scalable  
✅ Lazy loading - load as you scroll  

---

## 💡 Best Practices

### 1. Always Load cdn-config.js First

```html
<!-- ✅ Correct -->
<script src="/js/cdn-config.js"></script>
<script src="/js/update-ui.js"></script>

<!-- ❌ Wrong -->
<script src="/js/update-ui.js"></script>
<script src="/js/cdn-config.js"></script>
```

### 2. Use Helper Methods

```javascript
// ✅ Good
const icon = window.CDN_CONFIG.getIconUrl('food', 'icon-burger.webp');

// ❌ Bad (hardcoded)
const icon = 'https://cdn.ttmenus.com/icons/food/icon-burger.webp';
```

### 3. Check Console on Load

Always verify CDN connection in browser console:
```
✅ TT Menus CDN configured: https://cdn.ttmenus.com
```

---

## 🎉 Summary

### Setup Steps
1. ✅ Add `cdn-config.js` to your layout
2. ✅ Ensure it loads before `update-ui.js`
3. ✅ Test icon gallery
4. ✅ Verify in console

### What You Get
- 📦 **239 icons** across 7 categories
- ⚡ **Fast performance** with 1-year caching
- 🎯 **Easy to use** search & filter
- 🔄 **Auto-updates** when CDN updates
- 🛡️ **Reliable** with automatic fallback

**You're all set! Enjoy the icon gallery! 🚀**

---

**For detailed integration guide, see**: `_ttms_cdn/CDN_INTEGRATION_GUIDE.md`

