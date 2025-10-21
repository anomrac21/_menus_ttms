# 🚀 Social Media Share Buttons - Integration Guide

## Quick Start

### Step 1: Basic Integration (Copy & Paste)

Add this to any Hugo template where you want share buttons:

```go
{{ partial "socialmedia/social-share-all.html" . }}
```

That's it! You now have all four social media share buttons.

---

## 📍 Common Integration Locations

### 1. Footer Integration

**File:** `layouts/partials/layout/footer.html`

```go
<footer>
  <div class="footer-content">
    <!-- Your existing footer content -->
    
    <!-- Add social share buttons -->
    <div class="footer-share">
      {{ partial "socialmedia/social-share-all.html" (dict 
        "instagram_username" "yourrestaurant"
        "tiktok_username" "@yourrestaurant"
        "layout" "horizontal"
        "Page" .Page
      ) }}
    </div>
  </div>
</footer>
```

### 2. Blog Post / Article Pages

**File:** `layouts/_default/single.html`

Add at the end of your article content:

```go
<article>
  <h1>{{ .Title }}</h1>
  <div class="content">
    {{ .Content }}
  </div>
  
  <!-- Add share buttons after content -->
  <div class="article-share">
    <h3>Share this article</h3>
    {{ partial "socialmedia/social-share-all.html" . }}
  </div>
</article>
```

### 3. Menu Item Pages

**File:** `layouts/_default/single.html` or menu item template

```go
<div class="menu-item-detail">
  <h1>{{ .Title }}</h1>
  <img src="{{ .Params.image }}" alt="{{ .Title }}">
  <p class="price">{{ .Params.price }}</p>
  <div class="description">{{ .Content }}</div>
  
  <!-- Share this specific menu item -->
  <div class="share-dish">
    <p>Love this dish? Share it!</p>
    {{ partial "socialmedia/whatsapp-share.html" (dict 
      "text" (printf "Check out %s! 😋" .Title)
      "url" .Permalink
      "Page" .Page
    ) }}
    {{ partial "socialmedia/facebook-share.html" . }}
  </div>
</div>
```

### 4. Homepage Hero Section

**File:** `layouts/index.html` or `layouts/partials/layout/hero.html`

```go
<section class="hero">
  <h1>{{ .Title }}</h1>
  <p>{{ .Description }}</p>
  
  <!-- Social media links/shares -->
  <div class="hero-social">
    {{ partial "socialmedia/instagram-share.html" (dict "username" .Site.Params.instagram "Page" .Page) }}
    {{ partial "socialmedia/tiktok-share.html" (dict "username" .Site.Params.tiktok "Page" .Page) }}
    {{ partial "socialmedia/whatsapp-share.html" . }}
  </div>
</section>
```

### 5. Contact Page

**File:** `layouts/contact/single.html` or contact template

```go
<div class="contact-page">
  <h1>Contact Us</h1>
  
  <div class="contact-info">
    <p>Phone: {{ .Site.Params.phone }}</p>
    <p>Email: {{ .Site.Params.email }}</p>
  </div>
  
  <!-- Social media links -->
  <div class="social-links">
    <h2>Connect With Us</h2>
    {{ partial "socialmedia/social-share-all.html" (dict 
      "instagram_username" .Site.Params.instagram
      "tiktok_username" .Site.Params.tiktok
      "Page" .Page
    ) }}
  </div>
</div>
```

### 6. Sidebar Integration

**File:** `layouts/partials/sidebar.html`

```go
<aside class="sidebar">
  <div class="sidebar-section">
    <h3>Follow Us</h3>
    {{ partial "socialmedia/social-share-all.html" (dict 
      "layout" "vertical"
      "instagram_username" .Site.Params.instagram
      "tiktok_username" .Site.Params.tiktok
      "Page" .Page
    ) }}
  </div>
  
  <!-- Other sidebar content -->
</aside>
```

---

## ⚙️ Configuration in Hugo Config

Add these parameters to your `hugo.toml` or `config.toml`:

```toml
[params]
  # Social Media Handles
  instagram = "yourrestaurant"
  tiktok = "@yourrestaurant"
  facebook = "yourrestaurant"
  whatsapp = "18687060349"  # Phone number for WhatsApp
```

Then use them in templates:

```go
{{ partial "socialmedia/instagram-share.html" (dict "username" .Site.Params.instagram "Page" .Page) }}
{{ partial "socialmedia/tiktok-share.html" (dict "username" .Site.Params.tiktok "Page" .Page) }}
```

---

## 🎨 Custom Styling

### Option 1: Include Global CSS

Add to your `layouts/partials/head.html` or `head/css.html`:

```html
<link rel="stylesheet" href="{{ "src/css/social-share.css" | relURL }}">
```

### Option 2: Override Individual Styles

Create custom styles in your main CSS file:

```css
/* Custom WhatsApp button */
.whatsapp-share-btn {
  background-color: #your-brand-color !important;
  border-radius: 20px !important;
}

/* Larger buttons */
.social-share-btn {
  padding: 1rem 1.5rem !important;
  font-size: 1.125rem !important;
}

/* Icon-only on mobile */
@media (max-width: 768px) {
  .social-share-btn .share-text {
    display: none;
  }
}
```

---

## 🔧 Advanced Usage Examples

### Example 1: Floating Share Bar (Sticky on Desktop)

```go
<div class="social-share-floating">
  <h4 style="margin: 0 0 1rem; font-size: 0.9rem; text-align: center;">Share</h4>
  {{ partial "socialmedia/whatsapp-share.html" . }}
  {{ partial "socialmedia/facebook-share.html" . }}
  {{ partial "socialmedia/instagram-share.html" (dict "Page" .Page) }}
  {{ partial "socialmedia/tiktok-share.html" (dict "Page" .Page) }}
</div>

<style>
.social-share-floating {
  position: fixed;
  left: 20px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 1000;
  background: white;
  padding: 1rem;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.social-share-floating .social-share-btn {
  width: 48px;
  height: 48px;
  padding: 0.75rem;
  margin-bottom: 0.75rem;
  justify-content: center;
}

.social-share-floating .share-text {
  display: none;
}

@media (max-width: 768px) {
  .social-share-floating {
    display: none;
  }
}
</style>
```

### Example 2: Sticky Footer Bar (Mobile)

```go
<div class="social-share-sticky-footer">
  <p style="margin: 0 0 0.5rem; text-align: center; font-size: 0.9rem;">Share our menu</p>
  <div style="display: flex; gap: 0.75rem; justify-content: center;">
    {{ partial "socialmedia/whatsapp-share.html" . }}
    {{ partial "socialmedia/facebook-share.html" . }}
  </div>
</div>

<style>
.social-share-sticky-footer {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: white;
  padding: 1rem;
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1);
  z-index: 1000;
}

@media (min-width: 769px) {
  .social-share-sticky-footer {
    display: none;
  }
}
</style>
```

### Example 3: Icon-Only Buttons

```go
<div class="social-share-container icons-only">
  <div class="social-share-buttons">
    {{ partial "socialmedia/whatsapp-share.html" . }}
    {{ partial "socialmedia/facebook-share.html" . }}
    {{ partial "socialmedia/instagram-share.html" (dict "username" "yourrestaurant" "Page" .Page) }}
    {{ partial "socialmedia/tiktok-share.html" (dict "username" "@yourrestaurant" "Page" .Page) }}
  </div>
</div>
```

### Example 4: Promotion/Campaign Share

```go
{{/* Special promotion page */}}
{{ $promoText := printf "🎉 %s - Limited Time Offer! Get 20%% off. " .Title }}
{{ $promoUrl := .Permalink }}

<div class="promo-share">
  <h2>Share this amazing deal!</h2>
  <p>Help us spread the word and get exclusive rewards!</p>
  
  {{ partial "socialmedia/social-share-all.html" (dict 
    "text" $promoText
    "url" $promoUrl
    "instagram_username" .Site.Params.instagram
    "tiktok_username" .Site.Params.tiktok
    "Page" .Page
  ) }}
</div>
```

### Example 5: Per-Category Share Buttons

```go
{{/* On a category/section page */}}
{{ $shareText := printf "Check out our %s menu at %s!" .Title .Site.Title }}

<div class="category-header">
  <h1>{{ .Title }}</h1>
  <p>{{ .Description }}</p>
  
  <div class="category-share">
    {{ partial "socialmedia/whatsapp-share.html" (dict 
      "text" $shareText
      "url" .Permalink
      "Page" .Page
    ) }}
    {{ partial "socialmedia/facebook-share.html" (dict "url" .Permalink "Page" .Page) }}
  </div>
</div>
```

---

## 📱 Mobile-Specific Considerations

### Auto-Hide on Mobile

```html
<div class="social-share-desktop-only">
  {{ partial "socialmedia/social-share-all.html" . }}
</div>

<style>
@media (max-width: 768px) {
  .social-share-desktop-only {
    display: none;
  }
}
</style>
```

### Show Different Buttons on Mobile

```go
<!-- Desktop: All buttons -->
<div class="desktop-share">
  {{ partial "socialmedia/social-share-all.html" . }}
</div>

<!-- Mobile: WhatsApp only -->
<div class="mobile-share">
  {{ partial "socialmedia/whatsapp-share.html" . }}
</div>

<style>
.mobile-share { display: none; }

@media (max-width: 768px) {
  .desktop-share { display: none; }
  .mobile-share { display: block; }
}
</style>
```

---

## 🐛 Troubleshooting

### Issue: Buttons not showing

**Check:**
1. Ensure the partial path is correct: `socialmedia/` not `social-media/`
2. Verify you're passing `.Page` in the dict: `(dict "Page" .Page)`
3. Check that the file exists in your theme directory

### Issue: Icons not loading

**Solution:** Icons are loaded from CDN (`https://ct.ttmenus.com/icons/socialmedia/`). Ensure:
- Internet connection is available
- CDN is accessible
- Icon files exist: `whatsapp.svg`, `facebook.svg`, `instagram.svg`, `tiktok.svg`

### Issue: Styling conflicts

**Solution:**
- Social share buttons use specific class names: `.whatsapp-share-btn`, `.facebook-share-btn`, etc.
- Check for CSS conflicts in your theme
- Use `!important` to override if needed
- Or add custom classes and style those instead

### Issue: Instagram/TikTok not sharing properly

**Expected Behavior:** These platforms don't support direct web sharing:
- On mobile: Uses Web Share API (opens native share sheet)
- On desktop: Copies URL to clipboard with instructions
- With username: Links directly to your profile

This is by design and not a bug.

---

## 📊 Analytics Tracking

### Track Share Button Clicks

Add this JavaScript to track clicks:

```javascript
document.addEventListener('DOMContentLoaded', function() {
  // Track all social share button clicks
  document.querySelectorAll('.social-share-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      var platform = this.classList.contains('whatsapp-share-btn') ? 'WhatsApp' :
                     this.classList.contains('facebook-share-btn') ? 'Facebook' :
                     this.classList.contains('instagram-share-btn') ? 'Instagram' :
                     this.classList.contains('tiktok-share-btn') ? 'TikTok' : 'Unknown';
      
      // Send to analytics (Google Analytics example)
      if (typeof gtag !== 'undefined') {
        gtag('event', 'share', {
          'method': platform,
          'content_type': 'page',
          'item_id': window.location.pathname
        });
      }
      
      // Or use Matomo
      if (typeof _paq !== 'undefined') {
        _paq.push(['trackEvent', 'Social Share', platform, window.location.pathname]);
      }
      
      console.log('Share clicked:', platform, window.location.href);
    });
  });
});
```

Add this script to your `layouts/partials/head/js.html` or footer.

---

## ✅ Testing Checklist

After integration, test the following:

- [ ] Buttons appear correctly on the page
- [ ] Icons load properly (not broken images)
- [ ] WhatsApp share opens with correct text and URL
- [ ] Facebook share opens dialog with correct URL
- [ ] Instagram button works (profile link or share mode)
- [ ] TikTok button works (profile link or share mode)
- [ ] Buttons are responsive on mobile devices
- [ ] Buttons are keyboard accessible (Tab navigation)
- [ ] Hover effects work correctly
- [ ] Touch interactions work on mobile
- [ ] No console errors
- [ ] Styling matches your theme

---

## 🆘 Need Help?

### Resources:
- **Main Documentation:** See `README.md` in the socialmedia folder
- **Examples:** See `example-usage.html` for live examples
- **CSS Reference:** See `static/src/css/social-share.css`

### Common Questions:

**Q: Can I change the button colors?**
A: Yes! Override the CSS classes or edit the inline styles in each partial.

**Q: Do I need to include external JavaScript?**
A: No! WhatsApp and Facebook work without JavaScript. Instagram and TikTok include minimal inline JavaScript for the share functionality.

**Q: Can I use these with non-Hugo sites?**
A: The concept can be adapted, but these partials are specifically designed for Hugo's template system.

**Q: Are these buttons GDPR compliant?**
A: Yes, they only create direct links to social platforms. No tracking or cookies are set by the buttons themselves.

---

## 📝 Version History

- **v1.0** (October 2025): Initial release with WhatsApp, Facebook, Instagram, and TikTok support

---

**Happy Sharing! 🎉**

