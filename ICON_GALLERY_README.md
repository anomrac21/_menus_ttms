# 📚 Dynamic Icon Gallery System

## Overview

The icon gallery system now features dynamic loading, lazy loading, category filtering, and search functionality for better performance and user experience.

## Features

### ✨ Key Features

1. **Dynamic Icon Loading**
   - Automatically fetches icons from the content-service API
   - Falls back to a comprehensive static icon list if API is unavailable
   - Loads 30 icons at a time for optimal performance

2. **Lazy Loading**
   - Uses Intersection Observer API for efficient loading
   - Loads more icons as you scroll down
   - Shows loading indicators during fetch operations

3. **Category Filtering**
   - 8 categories: All, Food, Drink, White, Black, Activities, Utilities, Social Media
   - Visual active state for selected category
   - Smooth transitions and hover effects

4. **Search Functionality**
   - Real-time search with 300ms debounce
   - Searches by icon name and category
   - Clears automatically when switching categories

5. **Keyboard Navigation**
   - Press `ESC` to close the icon gallery
   - Works in both search input and gallery

6. **Smart Image Handling**
   - Automatically hides broken/missing images
   - Uses lazy loading attribute for native browser optimization
   - Shows icon names below each image

## Usage

### For Users

1. **Opening the Gallery**
   - When editing a category, expand the "📚 Choose from icon gallery" section
   - Icons will automatically load

2. **Browsing Icons**
   - Scroll down to load more icons automatically
   - Click any icon to select it
   - Hover over icons to see hover effects

3. **Filtering by Category**
   - Click any category tab (Food, Drink, etc.)
   - Gallery will refresh with filtered results
   - Active category is highlighted in blue

4. **Searching**
   - Type in the search box at the top
   - Results update after 300ms of typing
   - Works across all categories

5. **Keyboard Shortcuts**
   - `ESC` - Close the icon gallery

### For Developers

#### Backend API Endpoint

Create an API endpoint at `${UPDATE_API_URL}/api/list-icons` that returns:

```json
{
  "icons": [
    {
      "url": "https://ct.ttmenus.com/icons/food/icon-burger.webp",
      "category": "food",
      "name": "Burger"
    },
    {
      "url": "https://ct.ttmenus.com/icons/drink/icon-beer.webp",
      "category": "drink",
      "name": "Beer"
    }
  ]
}
```

**Supported Categories:**
- `food` - Food items (🍕)
- `drink` - Beverages (🍹)
- `white` - White/light icons (⚪)
- `black` - Black/dark icons (⚫)
- `activities` - Activity icons (🎮)
- `utilities` - Utility icons (🔧)
- `socialmedia` - Social media icons (📱)

#### Static Fallback

If the API is unavailable, the system uses a comprehensive static icon list with 60+ icons across all categories.

#### JavaScript API

```javascript
// Access the icon gallery manager
iconGalleryManager.loadAllIcons()           // Load all icons
iconGalleryManager.setCategory('food')      // Filter by category
iconGalleryManager.setSearch('burger')      // Search icons
iconGalleryManager.disconnect()             // Clean up observers

// Functions
populateIconGallery()                       // Load and display icons
filterIconsByCategory('food')               // Filter by category
searchIcons('burger')                       // Search with debounce
```

## Technical Details

### Performance Optimizations

1. **Batch Loading**: Loads 30 icons at a time
2. **Intersection Observer**: Efficient scroll detection with 100px margin
3. **Debounced Search**: 300ms delay to reduce unnecessary renders
4. **Lazy Image Loading**: Native browser lazy loading
5. **Observer Cleanup**: Disconnects observers when gallery closes

### Browser Compatibility

- Modern browsers with Intersection Observer support
- Falls back gracefully for older browsers (loads all icons at once)
- Native lazy loading for supported browsers

### Icon Sources

Icons are loaded from:
1. **Primary**: `https://ct.ttmenus.com/icons/`
2. **Local**: Icons folder in the clienttools directory

### Categories Organization

```
icons/
├── food/           # Food icons (burger, pizza, sushi, etc.)
├── drink/          # Beverage icons (beer, wine, coffee, etc.)
├── white/          # Light-themed icons
├── black/          # Dark-themed icons
├── activities/     # Activity icons (music, sports, etc.)
├── utilities/      # Utility icons (star, heart, clock, etc.)
└── socialmedia/    # Social media icons (facebook, instagram, etc.)
```

## Customization

### Styling

Modify the CSS in `update-ui.html`:

```css
.icon-category-tab {
  /* Tab button styles */
}

.icon-card {
  /* Individual icon card styles */
}

#iconGallery::-webkit-scrollbar {
  /* Scrollbar customization */
}
```

### Batch Size

Change the number of icons loaded at once:

```javascript
iconGalleryManager.batchSize = 50; // Load 50 icons at a time
```

### Observer Settings

Adjust the intersection observer:

```javascript
rootMargin: '200px',  // Load when 200px away from viewport
threshold: 0.1,       // Trigger at 10% visibility
```

## Troubleshooting

### Icons Not Loading
- Check browser console for API errors
- Verify `UPDATE_API_URL` is configured correctly
- System will fall back to static icons automatically

### Slow Performance
- Reduce `batchSize` for slower devices
- Check network conditions
- Clear browser cache

### Broken Images
- Icons with broken URLs are automatically hidden
- Check icon URLs in the API response
- Verify CORS settings for icon server

## Future Enhancements

Potential improvements:
- [ ] Icon upload functionality
- [ ] Custom icon categories
- [ ] Drag-and-drop icon selection
- [ ] Icon preview in different sizes
- [ ] Recently used icons section
- [ ] Favorite/starred icons
- [ ] Icon color variations

## Support

For issues or questions:
1. Check browser console for errors
2. Verify API endpoint configuration
3. Review network requests in DevTools
4. Check icon URL accessibility

---

**Version**: 1.0.0  
**Last Updated**: October 2025  
**Compatible with**: Chrome, Firefox, Safari, Edge (latest versions)



