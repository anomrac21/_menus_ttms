# 🚀 Social Media Share Buttons - Quick Reference Card

## 📋 At a Glance

| Platform | File | Status | Share Method | Works Everywhere? |
|----------|------|--------|--------------|-------------------|
| WhatsApp | `whatsapp-share.html` | ✅ Full | Direct link | ✅ Yes |
| Facebook | `facebook-share.html` | ✅ Full | Share API | ✅ Yes |
| Instagram | `instagram-share.html` | ⚠️ Limited | Profile/Web Share | Mobile only |
| TikTok | `tiktok-share.html` | ⚠️ Limited | Profile/Web Share | Mobile only |
| All Combined | `social-share-all.html` | ✅ Full | Combined | ✅ Yes |

---

## 💨 Quick Copy-Paste

### All Platforms (Most Common)
```go
{{ partial "socialmedia/social-share-all.html" . }}
```

### All Platforms + Your Social Handles
```go
{{ partial "socialmedia/social-share-all.html" (dict 
  "instagram_username" "yourhandle"
  "tiktok_username" "@yourhandle"
  "Page" .Page
) }}
```

### WhatsApp Only
```go
{{ partial "socialmedia/whatsapp-share.html" . }}
```

### Facebook Only
```go
{{ partial "socialmedia/facebook-share.html" . }}
```

### Instagram (Profile Link)
```go
{{ partial "socialmedia/instagram-share.html" (dict "username" "yourhandle" "Page" .Page) }}
```

### TikTok (Profile Link)
```go
{{ partial "socialmedia/tiktok-share.html" (dict "username" "@yourhandle" "Page" .Page) }}
```

### Custom Message
```go
{{ partial "socialmedia/whatsapp-share.html" (dict 
  "text" "Check out our special menu! 🍕"
  "url" .Permalink
  "Page" .Page
) }}
```

### Vertical Layout
```go
{{ partial "socialmedia/social-share-all.html" (dict 
  "layout" "vertical"
  "Page" .Page
) }}
```

---

## 🎨 Quick Styling

### Icon-Only Buttons
```html
<div class="social-share-container icons-only">
  {{ partial "socialmedia/social-share-all.html" . }}
</div>
```

### Compact Size
```html
<div class="social-share-container compact">
  {{ partial "socialmedia/social-share-all.html" . }}
</div>
```

### Custom Colors
```css
.whatsapp-share-btn { background-color: #25D366 !important; }
.facebook-share-btn { background-color: #1877F2 !important; }
```

---

## 📍 Common Locations

### Footer
```go
<!-- In layouts/partials/layout/footer.html -->
{{ partial "socialmedia/social-share-all.html" (dict 
  "instagram_username" "yourhandle"
  "tiktok_username" "@yourhandle"
  "Page" .Page
) }}
```

### After Content
```go
<!-- In layouts/_default/single.html after {{ .Content }} -->
<div class="article-share">
  {{ partial "socialmedia/social-share-all.html" . }}
</div>
```

### Sidebar
```go
<!-- In sidebar partial -->
<div class="sidebar-social">
  {{ partial "socialmedia/social-share-all.html" (dict 
    "layout" "vertical"
    "Page" .Page
  ) }}
</div>
```

---

## ⚙️ Parameters Reference

### `social-share-all.html`
```go
(dict 
  "text" "Custom share message"          // Optional
  "url" .Permalink                        // Optional (defaults to current page)
  "instagram_username" "handle"           // Optional
  "tiktok_username" "@handle"             // Optional
  "layout" "horizontal"                   // Optional: "horizontal" or "vertical"
  "Page" .Page                            // Required
)
```

### `whatsapp-share.html`
```go
(dict 
  "text" "Message"                        // Optional (defaults to page title)
  "url" .Permalink                        // Optional (defaults to current page)
  "Page" .Page                            // Required
)
```

### `facebook-share.html`
```go
(dict 
  "url" .Permalink                        // Optional (defaults to current page)
  "Page" .Page                            // Required
)
```

### `instagram-share.html`
```go
(dict 
  "username" "yourhandle"                 // Optional (profile link if provided)
  "message" "Custom message"              // Optional
  "Page" .Page                            // Required
)
```

### `tiktok-share.html`
```go
(dict 
  "username" "@yourhandle"                // Optional (profile link if provided)
  "message" "Custom message"              // Optional
  "Page" .Page                            // Required
)
```

---

## 🎯 Use Cases

### Restaurant Menu
```go
{{ partial "socialmedia/whatsapp-share.html" (dict 
  "text" "Check out this amazing menu!"
  "Page" .Page
) }}
```

### Special Offer
```go
{{ partial "socialmedia/whatsapp-share.html" (dict 
  "text" "🎉 50% OFF Today!"
  "url" .Permalink
  "Page" .Page
) }}
```

### Menu Item
```go
{{ partial "socialmedia/whatsapp-share.html" (dict 
  "text" (printf "I love the %s!" .Title)
  "Page" .Page
) }}
```

### Social Follow
```go
{{ partial "socialmedia/instagram-share.html" (dict 
  "username" "yourrestaurant"
  "Page" .Page
) }}
```

---

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| Buttons not showing | Check partial path: `socialmedia/` not `social-media/` |
| Icons not loading | Verify CDN: `https://ct.ttmenus.com/icons/socialmedia/` |
| Instagram not sharing | Expected - use profile link or Web Share API (mobile only) |
| TikTok not sharing | Expected - use profile link or Web Share API (mobile only) |
| Styling conflicts | Use `!important` or check CSS specificity |
| Missing `.Page` error | Always pass `"Page" .Page` in dict |

---

## 📱 Platform Details

### WhatsApp ✅
- **Works:** Everywhere (desktop opens web.whatsapp.com, mobile opens app)
- **Shares:** Text + URL combined
- **Best for:** Direct person-to-person sharing

### Facebook ✅
- **Works:** Everywhere (opens share dialog)
- **Shares:** URL (Facebook scrapes meta tags)
- **Best for:** Public sharing and reaching wider audience

### Instagram ⚠️
- **Works:** Profile links always work, sharing limited to mobile
- **Shares:** Via Web Share API (mobile) or clipboard (desktop)
- **Best for:** Linking to your profile
- **Note:** Instagram doesn't support direct web sharing

### TikTok ⚠️
- **Works:** Profile links always work, sharing limited to mobile
- **Shares:** Via Web Share API (mobile) or clipboard (desktop)
- **Best for:** Linking to your profile
- **Note:** TikTok doesn't support direct web sharing

---

## 📚 Full Documentation

For complete details, see:
- **README.md** - Feature documentation
- **INTEGRATION_GUIDE.md** - Step-by-step guide
- **example-usage.html** - Live examples
- **SOCIAL_MEDIA_SHARE_SETUP_COMPLETE.md** - Setup summary

---

## 🎨 CSS Classes

### Button Classes
- `.social-share-btn` - Base class for all buttons
- `.whatsapp-share-btn` - WhatsApp specific
- `.facebook-share-btn` - Facebook specific
- `.instagram-share-btn` - Instagram specific
- `.tiktok-share-btn` - TikTok specific

### Container Classes
- `.social-share-container` - Main container
- `.social-share-horizontal` - Horizontal layout
- `.social-share-vertical` - Vertical layout
- `.icons-only` - Hide text, show icons only
- `.compact` - Smaller size

### Element Classes
- `.social-icon` - Icon image
- `.share-text` - Button text
- `.social-share-buttons` - Buttons wrapper
- `.social-share-heading` - Container heading

---

## ✅ Testing Checklist

Quick tests to run:
- [ ] WhatsApp opens with correct text
- [ ] Facebook opens share dialog
- [ ] Instagram/TikTok links work
- [ ] Icons load (not broken)
- [ ] Responsive on mobile
- [ ] Keyboard accessible (Tab key)
- [ ] No console errors

---

## 📞 File Locations

```
_ttms_menu_demo/
└── themes/
    └── _menus_ttms/
        ├── layouts/
        │   └── partials/
        │       └── socialmedia/          ← Your new partials
        │           ├── whatsapp-share.html
        │           ├── facebook-share.html
        │           ├── instagram-share.html
        │           ├── tiktok-share.html
        │           ├── social-share-all.html
        │           ├── example-usage.html
        │           ├── README.md
        │           ├── INTEGRATION_GUIDE.md
        │           └── QUICK_REFERENCE.md  ← You are here
        └── static/
            └── src/
                └── css/
                    └── social-share.css   ← Optional global styles
```

---

## 🎉 You're Ready!

**Start using now:** Just add `{{ partial "socialmedia/social-share-all.html" . }}` to any template!

**Questions?** Check the full documentation files listed above.

---

*TTMS Social Media Share Buttons v1.0 | October 2025*

