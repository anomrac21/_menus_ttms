/**
 * Horizontal location list navigation (non-picker locations pages).
 */
(function () {
  'use strict';

  if (window.__ttmsLocationNavigationLoaded) return;
  window.__ttmsLocationNavigationLoaded = true;

  function scrollLocations(direction) {
    var locationsWrapper = document.querySelector('.locations-wrapper');
    if (!locationsWrapper) return;

    var locations = locationsWrapper.querySelector('.locations');
    if (!locations) return;

    var scrollableElement = locations.scrollWidth > locations.clientWidth ? locations : locationsWrapper;
    var scrollAmount = 300;
    var currentScroll = scrollableElement.scrollLeft;
    var maxScroll = scrollableElement.scrollWidth - scrollableElement.clientWidth;

    if (maxScroll <= 0) {
      updateLocationNavButtons(scrollableElement, 0);
      return;
    }

    var scrollDelta;
    if (direction === 'left') {
      scrollDelta = -scrollAmount;
    } else if (direction === 'right') {
      scrollDelta = scrollAmount;
    } else {
      return;
    }

    if (scrollableElement.scrollBy) {
      scrollableElement.scrollBy({
        left: scrollDelta,
        behavior: 'smooth',
      });
    } else {
      var newScroll = Math.max(0, Math.min(maxScroll, currentScroll + scrollDelta));
      if (scrollableElement.scrollTo) {
        scrollableElement.scrollTo({
          left: newScroll,
          behavior: 'smooth',
        });
      } else {
        scrollableElement.scrollLeft = newScroll;
      }
    }

    setTimeout(function () {
      updateLocationNavButtons(scrollableElement, maxScroll);
    }, 100);
  }

  function updateLocationNavButtons(locations, maxScroll) {
    var leftBtn = document.getElementById('locationNavLeft');
    var rightBtn = document.getElementById('locationNavRight');
    if (!leftBtn || !rightBtn) return;

    if (locations.closest('.location-picker')) return;

    var currentScroll = locations.scrollLeft;

    if (currentScroll <= 0) {
      leftBtn.style.opacity = '0.3';
      leftBtn.style.pointerEvents = 'none';
    } else {
      leftBtn.style.opacity = '1';
      leftBtn.style.pointerEvents = 'auto';
    }

    if (currentScroll >= maxScroll - 1) {
      rightBtn.style.opacity = '0.3';
      rightBtn.style.pointerEvents = 'none';
    } else {
      rightBtn.style.opacity = '1';
      rightBtn.style.pointerEvents = 'auto';
    }
  }

  var locationNavState = null;

  function initializeLocationNavigation() {
    if (locationNavState) {
      if (locationNavState.scrollableElement && locationNavState.onScroll) {
        locationNavState.scrollableElement.removeEventListener('scroll', locationNavState.onScroll);
      }
      if (locationNavState.onResize) {
        window.removeEventListener('resize', locationNavState.onResize);
      }
      locationNavState = null;
    }

    var locationsWrapper = document.querySelector('.locations-wrapper');
    if (!locationsWrapper) return;
    if (locationsWrapper.closest('.location-picker')) return;

    var locations = locationsWrapper.querySelector('.locations');
    if (!locations) return;

    var scrollableElement = locations.scrollWidth > locations.clientWidth ? locations : locationsWrapper;

    var updateButtons = function () {
      var maxScroll = scrollableElement.scrollWidth - scrollableElement.clientWidth;
      updateLocationNavButtons(scrollableElement, maxScroll);
    };

    setTimeout(updateButtons, 100);

    function onScroll() {
      var maxScroll = scrollableElement.scrollWidth - scrollableElement.clientWidth;
      updateLocationNavButtons(scrollableElement, maxScroll);
    }

    var resizeTimer;
    function onResize() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(updateButtons, 250);
    }

    scrollableElement.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    locationNavState = { scrollableElement: scrollableElement, onScroll: onScroll, onResize: onResize };
  }

  window.scrollLocations = scrollLocations;
  window.initializeLocationNavigation = initializeLocationNavigation;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeLocationNavigation);
  } else {
    initializeLocationNavigation();
  }
})();
