# Social Media Share Buttons

A collection of beautiful, modern social media share button partials for WhatsApp, Facebook, Instagram, and TikTok.

## 📱 Available Platforms

### 1. WhatsApp Share (`whatsapp-share.html`)
Allows users to share content directly via WhatsApp with a single click.

**Usage:**
```go
{{/* Basic usage */}}
{{ partial "socialmedia/whatsapp-share.html" . }}

{{/* With custom text and URL */}}
{{ partial "socialmedia/whatsapp-share.html" (dict "text" "Check out our amazing menu!" "url" .Permalink "Page" .Page) }}
```

**Parameters:**
- `text` (optional): The message text to share. Defaults to page title.
- `url` (optional): The URL to share. Defaults to current page permalink.

---

### 2. Facebook Share (`facebook-share.html`)
Opens Facebook's share dialog to share content on Facebook.

**Usage:**
```go
{{/* Basic usage */}}
{{ partial "socialmedia/facebook-share.html" . }}

{{/* With custom URL */}}
{{ partial "socialmedia/facebook-share.html" (dict "url" .Permalink "Page" .Page) }}
```

**Parameters:**
- `url` (optional): The URL to share. Defaults to current page permalink.

---

### 3. Instagram Share (`instagram-share.html`)
Instagram sharing with two modes:
- **Profile Link Mode**: Links to your Instagram profile
- **Share Mode**: Uses Web Share API on mobile or copies URL to clipboard

**Usage:**
```go
{{/* Link to Instagram profile */}}
{{ partial "socialmedia/instagram-share.html" (dict "username" "yourhandle" "Page" .Page) }}

{{/* Share mode (copies URL to clipboard) */}}
{{ partial "socialmedia/instagram-share.html" (dict "message" "Check out our menu!" "Page" .Page) }}
```

**Parameters:**
- `username` (optional): Your Instagram username. If provided, creates a profile link.
- `message` (optional): Custom message for share prompt. Defaults to "Share on Instagram".

**Note:** Instagram doesn't support direct web sharing like other platforms. The share mode uses the Web Share API on mobile devices or copies the URL to clipboard for users to paste manually.

---

### 4. TikTok Share (`tiktok-share.html`)
TikTok sharing with two modes:
- **Profile Link Mode**: Links to your TikTok profile
- **Share Mode**: Uses Web Share API on mobile or copies URL to clipboard

**Usage:**
```go
{{/* Link to TikTok profile */}}
{{ partial "socialmedia/tiktok-share.html" (dict "username" "@yourhandle" "Page" .Page) }}

{{/* Share mode (copies URL to clipboard) */}}
{{ partial "socialmedia/tiktok-share.html" (dict "message" "Check this out!" "Page" .Page) }}
```

**Parameters:**
- `username` (optional): Your TikTok username (e.g., "@yourhandle"). If provided, creates a profile link.
- `message` (optional): Custom message for share prompt. Defaults to "Share on TikTok".

**Note:** TikTok doesn't have a direct web share API. The share mode uses the Web Share API on mobile devices or copies the URL to clipboard.

---

### 5. All Platforms Combined (`social-share-all.html`)
Display all social share buttons together in a beautiful container.

**Usage:**
```go
{{/* Basic usage - shows all buttons */}}
{{ partial "socialmedia/social-share-all.html" . }}

{{/* With custom parameters */}}
{{ partial "socialmedia/social-share-all.html" (dict 
  "text" "Check out our amazing restaurant!" 
  "url" .Permalink 
  "instagram_username" "yourrestaurant"
  "tiktok_username" "@yourrestaurant"
  "layout" "horizontal"
  "Page" .Page
) }}
```

**Parameters:**
- `text` (optional): Text to share. Defaults to page title.
- `url` (optional): URL to share. Defaults to current page.
- `instagram_username` (optional): Instagram handle for profile link.
- `tiktok_username` (optional): TikTok handle for profile link.
- `layout` (optional): "horizontal" or "vertical". Defaults to "horizontal".

---

## 🎨 Styling

Each button comes with its own built-in styles featuring:
- Platform-specific brand colors
- Smooth hover animations
- Shadow effects
- Responsive design for mobile devices
- Accessibility features (ARIA labels)

### Platform Colors:
- **WhatsApp**: `#25D366` (Green)
- **Facebook**: `#1877F2` (Blue)
- **Instagram**: Gradient (`#f09433` → `#bc1888`)
- **TikTok**: `#000000` (Black with animated effect)

---

## 🔧 Customization

### Icon-Only Mode
To show only icons without text, add the `icons-only` class to the container:

```html
<div class="social-share-container icons-only">
  {{ partial "socialmedia/whatsapp-share.html" . }}
  {{ partial "socialmedia/facebook-share.html" . }}
</div>
```

### Custom Styling
Override the default styles by adding your own CSS:

```css
.whatsapp-share-btn {
  /* Your custom styles */
  background-color: #custom-color;
}
```

---

## 📖 Examples

### Example 1: Share Buttons in Footer
```go
{{/* In your footer.html */}}
<footer>
  <div class="share-section">
    <h3>Share Our Menu</h3>
    {{ partial "socialmedia/social-share-all.html" (dict 
      "instagram_username" "yourrestaurant"
      "tiktok_username" "@yourrestaurant"
      "Page" .Page
    ) }}
  </div>
</footer>
```

### Example 2: Individual Buttons in Sidebar
```go
<aside>
  <h3>Connect With Us</h3>
  {{ partial "socialmedia/instagram-share.html" (dict "username" "yourrestaurant" "Page" .Page) }}
  {{ partial "socialmedia/tiktok-share.html" (dict "username" "@yourrestaurant" "Page" .Page) }}
</aside>
```

### Example 3: Share a Specific Menu Item
```go
{{/* On a menu item page */}}
<div class="menu-item-share">
  <h4>Share this dish:</h4>
  {{ partial "socialmedia/whatsapp-share.html" (dict 
    "text" (printf "Check out %s at our restaurant!" .Title)
    "url" .Permalink
    "Page" .Page
  ) }}
  {{ partial "socialmedia/facebook-share.html" (dict "url" .Permalink "Page" .Page) }}
</div>
```

### Example 4: Vertical Layout for Mobile
```go
{{ partial "socialmedia/social-share-all.html" (dict 
  "layout" "vertical"
  "instagram_username" "yourrestaurant"
  "tiktok_username" "@yourrestaurant"
  "Page" .Page
) }}
```

---

## 🌐 Browser Support

- ✅ Modern browsers (Chrome, Firefox, Safari, Edge)
- ✅ Mobile devices (iOS, Android)
- ✅ Progressive enhancement (falls back gracefully on older browsers)

### Web Share API Support:
The Instagram and TikTok share buttons use the Web Share API on mobile devices, which is supported on:
- iOS Safari 12.2+
- Chrome for Android 61+
- Samsung Internet 8.0+

On desktop or unsupported browsers, it falls back to copying the URL to clipboard.

---

## ♿ Accessibility

All buttons include:
- ARIA labels for screen readers
- Keyboard navigation support
- Semantic HTML structure
- Alt text for images
- Focus indicators

---

## 🚀 Performance

- Lazy loading for social icons
- Minimal JavaScript (only for Instagram/TikTok share functionality)
- CSS-only animations
- Optimized SVG icons from CDN

---

## 📝 Notes

### WhatsApp & Facebook
These platforms have official share APIs that work seamlessly across web and mobile.

### Instagram & TikTok
These platforms don't offer direct web sharing APIs for external content:
- On **mobile devices**: Uses the Web Share API to open the native share sheet
- On **desktop**: Copies the URL to clipboard with instructions
- With **username parameter**: Creates a direct link to your profile page

---

## 🛠️ Troubleshooting

### Issue: Buttons not displaying
**Solution:** Ensure icons are accessible at `https://ct.ttmenus.com/icons/socialmedia/`

### Issue: Instagram/TikTok share not working
**Solution:** These platforms require manual sharing. The buttons will copy the URL to clipboard and show instructions.

### Issue: Styling conflicts
**Solution:** All styles are scoped to specific class names. Check for CSS conflicts in your theme.

---

## 📞 Support

For issues or questions about these partials, refer to the main TTMS documentation or contact support.

---

**Version:** 1.0  
**Last Updated:** October 2025  
**Author:** TTMS Development Team

