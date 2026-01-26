# Partials Organization

This directory contains all Hugo partial templates organized into logical folders for better maintainability.

## Folder Structure

### `ads/`
Advertisement-related partials:
- `adsnavbtn.html` - Navigation button for ads
- `clientads.html` - Client advertisement display
- `frontpageads.html` - Front page advertisements
- `homepageclientads.html` - Homepage client ads

### `client/`
Client-specific customizations:
- `clienttourimages.html` - Client tour images gallery
- `opening-hours.html` - Opening hours display

### `components/`
Reusable UI components:
- `accessibility.html` - Accessibility settings
- `adbanner.html` - Ad banner component
- `audio_effects.html` - Audio effects management
- `cart.html` - Shopping cart component
- `contact_info.html` - Contact information display
- `dinemode.html` - Dining mode selector
- `menu.html` - Menu navigation component
- `search.html` - Search functionality

### `features/`
Large feature modules:
- `askofserver.html` - Server request feature
- `whatsapp_ordering_system.html` - WhatsApp ordering integration (76KB)

### `head/`
HTML head section partials:
- `css.html` - CSS includes
- `js.html` - JavaScript includes

### `layout/`
Core layout components:
- `body.html` - Body content wrapper
- `footer.html` - Site footer
- `header.html` - Site header
- `hero.html` - Hero section
- `loader.html` - Page loader

### `modals/`
Modal dialog components:
- `apple_instructions.html` - Apple iOS installation instructions
- `order_modal.html` - Order placement modal
- `table_select_modal.html` - Table selection modal
- `ttmenus_modal.html` - TTMenus information modal

### `ttms-dashboard/`
Dashboard-related components:
- `button.html` - Dashboard button
- `dashboard.html` - Main dashboard

### `utilities/`
Helper/utility partials:
- `terms.html` - Taxonomy terms renderer

## Usage

Reference partials using their folder path:

```go
{{ partial "layout/header.html" . }}
{{ partial "components/cart.html" . }}
{{ partial "modals/order_modal.html" . }}
{{ partial "features/whatsapp_ordering_system.html" . }}
{{ partial "utilities/terms.html" (dict "taxonomy" "tags" "page" .) }}
```

## Benefits

- **Better Organization**: Related files are grouped together
- **Easier Navigation**: Find files by their purpose
- **Clearer Intent**: Folder names indicate component type
- **Maintainability**: Easier to manage as the project grows

