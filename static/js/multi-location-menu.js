/**
 * Per-location menus: keep URL slug, cart location, and Loyverse store_id in sync.
 * Intentional location changes filter menu items in real time.
 * Carousel scroll does not change the active menu (see location-picker source tags).
 */
(function () {
  'use strict';

  var navigating = false;
  var applyingFilter = false;
  var MENU_FILTER_SOURCES = { user: 1, nearby: 1, cart: 1 };

  function cfg() {
    return window.MENU_CONFIG || {};
  }

  function enabled() {
    return !!cfg().multiLocationMenus;
  }

  function knownSlugs() {
    var list = cfg().locationSlugs || [];
    return Array.isArray(list) ? list : [];
  }

  function slugFromPath(pathname) {
    var parts = String(pathname || '')
      .replace(/^\/+|\/+$/g, '')
      .split('/')
      .filter(Boolean);
    if (!parts.length) return '';
    var cand = parts[0];
    return knownSlugs().indexOf(cand) >= 0 ? cand : '';
  }

  function currentUrlSlug() {
    return slugFromPath(window.location.pathname);
  }

  function resolveSlugFromDetail(detail) {
    detail = detail || {};
    var slug = detail.slug || '';
    if (slug) return slug;
    if (!detail.address) return '';
    var sel = document.getElementById('locationSelect');
    if (!sel) return '';
    for (var i = 0; i < sel.options.length; i++) {
      if (sel.options[i].getAttribute('data-address') === detail.address) {
        return sel.options[i].getAttribute('data-slug') || '';
      }
    }
    return '';
  }

  function cartHasItems() {
    try {
      if (typeof window.order !== 'undefined' && Array.isArray(window.order) && window.order.length > 0) {
        return true;
      }
      var raw = localStorage.getItem('ttms_cart') || localStorage.getItem('order');
      if (!raw) return false;
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length > 0;
    } catch (e) {
      return false;
    }
  }

  function clearCartBestEffort() {
    try {
      if (typeof window.order !== 'undefined') window.order = [];
      if (typeof window.updateCart === 'function') window.updateCart();
      localStorage.removeItem('ttms_cart');
      localStorage.removeItem('order');
    } catch (e) {
      /* ignore */
    }
  }

  function selectCartOptionBySlug(slug) {
    if (!slug) return false;
    var sel = document.getElementById('locationSelect');
    if (!sel) return false;
    for (var i = 0; i < sel.options.length; i++) {
      if (sel.options[i].getAttribute('data-slug') === slug) {
        if (sel.selectedIndex !== i) {
          sel.selectedIndex = i;
        }
        var wa = sel.options[i].value;
        if (typeof window.selectLocation === 'function' && wa) {
          window.selectLocation(wa);
        } else if (typeof window.updateCartLocationDisplay === 'function') {
          window.updateCartLocationDisplay();
        }
        return true;
      }
    }
    return false;
  }

  function hasMenuReelsViewport() {
    return !!document.getElementById('menu-reels-viewport');
  }

  function confirmSwitchIfNeeded(nextSlug) {
    var current = currentUrlSlug();
    var viewport = document.getElementById('menu-reels-viewport');
    var currentFilter = (viewport && viewport.getAttribute('data-location-slug')) || current;
    if (!currentFilter || currentFilter === nextSlug) return true;
    if (!cartHasItems()) return true;
    var ok = window.confirm(
      'Switching locations clears your cart so items stay tied to the correct store. Continue?'
    );
    if (!ok) return false;
    clearCartBestEffort();
    return true;
  }

  /**
   * Prefer a full navigation to the location menu home.
   * pushState + in-place filter desyncs Barba/section URLs and broke category nav.
   */
  function goToLocationMenu(slug) {
    if (!slug || navigating) return;
    if (!confirmSwitchIfNeeded(slug)) {
      var revert = currentUrlSlug();
      var viewport = document.getElementById('menu-reels-viewport');
      if (!revert && viewport) revert = viewport.getAttribute('data-location-slug') || '';
      if (revert) selectCartOptionBySlug(revert);
      return;
    }
    selectCartOptionBySlug(slug);
    var target = '/' + slug + '/';
    var path = window.location.pathname || '/';
    if (path.replace(/\/+$/, '') === target.replace(/\/+$/, '')) {
      // Already on this location home — refresh filter only
      if (hasMenuReelsViewport() && typeof window.applyHomeMenuLocationFilter === 'function') {
        applyingFilter = true;
        Promise.resolve(window.applyHomeMenuLocationFilter(slug))
          .catch(function (err) {
            console.error('Location menu filter failed:', err);
          })
          .finally(function () {
            applyingFilter = false;
          });
      }
      return;
    }
    navigating = true;
    window.location.assign(target);
  }

  function applyLocation(slug, opts) {
    opts = opts || {};
    if (!slug || applyingFilter || navigating) return;
    goToLocationMenu(slug);
  }

  function syncFromUrl() {
    if (!enabled()) return;
    var slug = currentUrlSlug();
    if (!slug) return;
    selectCartOptionBySlug(slug);
    var viewport = document.getElementById('menu-reels-viewport');
    if (!viewport) return;
    var current = viewport.getAttribute('data-location-slug') || '';
    if (current !== slug && typeof window.applyHomeMenuLocationFilter === 'function') {
      window.applyHomeMenuLocationFilter(slug);
    }
  }

  function onLocationSelected(ev) {
    if (!enabled()) return;
    var detail = (ev && ev.detail) || {};
    var source = detail.source || '';
    // Ignore carousel scroll / init restore — those were wiping the menu mid-scroll.
    if (!MENU_FILTER_SOURCES[source]) return;
    var slug = resolveSlugFromDetail(detail);
    if (!slug) return;
    applyLocation(slug);
  }

  function onCartSelectChange() {
    if (!enabled()) return;
    var sel = document.getElementById('locationSelect');
    if (!sel || sel.selectedIndex < 0) return;
    var slug = sel.options[sel.selectedIndex].getAttribute('data-slug') || '';
    if (slug) applyLocation(slug, { source: 'cart' });
  }

  function bind() {
    if (!enabled()) return;
    syncFromUrl();
    document.addEventListener('ttms:location-selected', onLocationSelected);
    var sel = document.getElementById('locationSelect');
    if (sel) {
      sel.addEventListener('change', onCartSelectChange);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }

  document.addEventListener('barba:page', function () {
    navigating = false;
    applyingFilter = false;
    syncFromUrl();
  });

  window.TtmsMultiLocationMenu = {
    applyLocation: applyLocation,
    goToLocationMenu: goToLocationMenu,
    syncFromUrl: syncFromUrl,
    currentUrlSlug: currentUrlSlug,
  };
})();
