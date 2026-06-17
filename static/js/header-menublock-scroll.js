/**
 * Hide TT Menus dashboard control when category nav (#menublock) is scrolled right;
 * keep venue logo visible and show signed-in badge on the logo (.account-badge--on-logo).
 */
(function () {
  'use strict';

  /** Hide only after ~1.5 category icons; show again when nearly back at start */
  var HIDE_AT_PX = 96;
  var SHOW_AT_PX = 40;
  var LOGO_SWIPE_THRESHOLD = 40;
  var LOGO_SWIPE_LOCK_PX = 12;
  var DASHBOARD_SLIDE_MS = 680;
  var scrollRaf = 0;

  function markDashboardSlideAnimating() {
    var btn = document.getElementById('dashboardBtn');
    if (!btn) {
      return;
    }
    btn.style.willChange = 'transform';
    if (btn._ttmsSlideClearTimer) {
      window.clearTimeout(btn._ttmsSlideClearTimer);
    }
    btn._ttmsSlideClearTimer = window.setTimeout(function () {
      btn.style.willChange = '';
      btn._ttmsSlideClearTimer = 0;
    }, DASHBOARD_SLIDE_MS);
  }

  function setMenublockScrolledRight(mainHeader, hidden) {
    var isHidden = mainHeader.classList.contains('menublock-scrolled-right');
    if (hidden === isHidden) {
      return;
    }
    if (hidden) {
      mainHeader.classList.add('menublock-scrolled-right');
    } else {
      mainHeader.classList.remove('menublock-scrolled-right');
    }
    markDashboardSlideAnimating();
  }

  function updateMenublockScrollHints() {
    var menublock = document.getElementById('menublock');
    var nav = menublock && menublock.closest('.header-nav');
    if (!menublock || !nav) {
      return;
    }
    var maxScroll = Math.max(0, menublock.scrollWidth - menublock.clientWidth);
    var scrollLeft = menublock.scrollLeft;
    nav.classList.toggle('menublock-can-scroll-left', scrollLeft > 4);
    nav.classList.toggle('menublock-can-scroll-right', scrollLeft < maxScroll - 4);
  }

  function updateHeaderMenublockScroll() {
    var menublock = document.getElementById('menublock');
    var mainHeader = document.querySelector('.main-header');
    if (!menublock || !mainHeader) {
      return;
    }
    var scrollLeft = menublock.scrollLeft;
    var isHidden = mainHeader.classList.contains('menublock-scrolled-right');
    if (isHidden) {
      if (scrollLeft <= SHOW_AT_PX) {
        setMenublockScrolledRight(mainHeader, false);
      }
    } else if (scrollLeft >= HIDE_AT_PX) {
      setMenublockScrolledRight(mainHeader, true);
    }
    updateMenublockScrollHints();
  }

  function scheduleHeaderMenublockScrollUpdate() {
    if (scrollRaf) {
      return;
    }
    scrollRaf = window.requestAnimationFrame(function () {
      scrollRaf = 0;
      updateHeaderMenublockScroll();
    });
  }

  function bindMenublockTouchNav() {
    var menublock = document.getElementById('menublock');
    if (!menublock || menublock._ttmsTouchNavBound) {
      return;
    }
    menublock._ttmsTouchNavBound = true;

    var startX = 0;
    var startY = 0;
    var tracking = false;
    var suppressClick = false;
    var MOVE_THRESHOLD = 10;

    menublock.addEventListener(
      'pointerdown',
      function (e) {
        if (e.button > 0) return;
        startX = e.clientX;
        startY = e.clientY;
        tracking = true;
        suppressClick = false;
      },
      { passive: true }
    );

    menublock.addEventListener(
      'pointermove',
      function (e) {
        if (!tracking) return;
        if (
          Math.abs(e.clientX - startX) >= MOVE_THRESHOLD ||
          Math.abs(e.clientY - startY) >= MOVE_THRESHOLD
        ) {
          suppressClick = true;
        }
      },
      { passive: true }
    );

    menublock.addEventListener(
      'click',
      function (e) {
        if (!suppressClick) return;
        var link = e.target.closest('.menublock-link');
        if (!link) return;
        e.preventDefault();
        e.stopPropagation();
        suppressClick = false;
      },
      true
    );

    function finishPointer() {
      tracking = false;
    }

    menublock.addEventListener('pointerup', finishPointer, { passive: true });
    menublock.addEventListener('pointercancel', finishPointer, { passive: true });
  }

  function bindMenublockScroll() {
    var menublock = document.getElementById('menublock');
    if (!menublock || menublock._ttmsMenublockScrollBound) {
      updateHeaderMenublockScroll();
      return;
    }
    menublock._ttmsMenublockScrollBound = true;
    menublock.addEventListener(
      'scroll',
      scheduleHeaderMenublockScrollUpdate,
      { passive: true }
    );
    updateHeaderMenublockScroll();
  }

  function scrollPageAndMenublockToTop() {
    if (typeof closeCart === 'function') {
      closeCart();
    }

    var menublock = document.getElementById('menublock');
    if (menublock) {
      if (menublock.scrollTo) {
        menublock.scrollTo({ left: 0, behavior: 'smooth' });
      } else {
        menublock.scrollLeft = 0;
      }
      updateHeaderMenublockScroll();
    }

    if (typeof window.scrollMenuReelsToTop === 'function' && document.getElementById('menu-reels-track')) {
      window.scrollMenuReelsToTop('smooth');
    } else {
      window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }

    if (window.location.hash) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }

  /** Home page venue logo — scroll page + category nav back to start */
  function headerLogoActivate(event) {
    if (event) {
      event.preventDefault();
    }
    scrollPageAndMenublockToTop();
    return false;
  }

  function scrollMenublockTo(left, smooth) {
    var menublock = document.getElementById('menublock');
    if (!menublock) return;
    var behavior = smooth ? 'smooth' : 'auto';
    if (menublock.scrollTo) {
      menublock.scrollTo({ left: left, behavior: behavior });
    } else {
      menublock.scrollLeft = left;
    }
    updateHeaderMenublockScroll();
  }

  function showDashboardControl(smooth) {
    var mainHeader = document.querySelector('.main-header');
    if (mainHeader) {
      setMenublockScrolledRight(mainHeader, false);
    }
    scrollMenublockTo(0, smooth);
  }

  function hideDashboardControl(smooth) {
    scrollMenublockTo(HIDE_AT_PX, smooth);
  }

  function isLogoSwipeSurface(target) {
    if (!target || !target.closest) return false;
    if (target.closest('#dashboardBtn')) return false;
    return !!target.closest('.header-leading .header-logo');
  }

  function bindHeaderLogoSwipe() {
    document.querySelectorAll('.header-leading a.header-logo').forEach(function (logo) {
      if (logo._ttmsHeaderLogoSwipeBound) return;
      logo._ttmsHeaderLogoSwipeBound = true;

      var startX = 0;
      var startY = 0;
      var tracking = false;
      var locked = false;
      var suppressClick = false;

      logo.addEventListener(
        'click',
        function (event) {
          if (!suppressClick) return;
          event.preventDefault();
          event.stopPropagation();
          suppressClick = false;
        },
        true
      );

      logo.addEventListener('pointerdown', function (e) {
        if (e.button > 0 || !isLogoSwipeSurface(e.target)) return;
        startX = e.clientX;
        startY = e.clientY;
        tracking = true;
        locked = false;
        suppressClick = false;
      });

      logo.addEventListener('pointermove', function (e) {
        if (!tracking) return;
        var dx = e.clientX - startX;
        var dy = e.clientY - startY;
        var absDx = Math.abs(dx);
        var absDy = Math.abs(dy);

        if (!locked) {
          if (absDy > absDx && absDy >= LOGO_SWIPE_LOCK_PX) {
            tracking = false;
            return;
          }
          if (absDx < LOGO_SWIPE_LOCK_PX && absDy < LOGO_SWIPE_LOCK_PX) {
            return;
          }
          if (absDx <= absDy) {
            tracking = false;
            return;
          }
          locked = true;
        }
      });

      function finishSwipe(e) {
        if (!tracking) return;
        tracking = false;
        if (!locked) return;

        var dx = e.clientX - startX;
        var mainHeader = document.querySelector('.main-header');
        if (!mainHeader) return;

        if (dx >= LOGO_SWIPE_THRESHOLD) {
          suppressClick = true;
          showDashboardControl(true);
          return;
        }
        if (dx <= -LOGO_SWIPE_THRESHOLD) {
          suppressClick = true;
          hideDashboardControl(true);
        }
      }

      logo.addEventListener('pointerup', finishSwipe);
      logo.addEventListener('pointercancel', finishSwipe);
    });
  }

  function bindHeaderLogoClick() {
    document.querySelectorAll('.header-leading a.header-logo[href="#"]').forEach(function (logo) {
      if (logo._ttmsHeaderLogoBound) {
        return;
      }
      logo._ttmsHeaderLogoBound = true;
      logo.addEventListener('click', function (event) {
        headerLogoActivate(event);
      });
    });
  }

  window.updateHeaderMenublockScroll = updateHeaderMenublockScroll;
  window.bindMenublockScroll = bindMenublockScroll;
  window.headerLogoActivate = headerLogoActivate;
  window.scrollPageAndMenublockToTop = scrollPageAndMenublockToTop;

  function scrollMenublockLinkIntoView(link) {
    if (!link || !link.scrollIntoView) return;
    var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var coarsePointer = window.matchMedia('(pointer: coarse)').matches;
    link.scrollIntoView({
      block: 'nearest',
      inline: 'center',
      behavior: reducedMotion || coarsePointer ? 'auto' : 'smooth'
    });
  }

  window.scrollMenublockLinkIntoView = scrollMenublockLinkIntoView;

  function initHeaderMenublock() {
    bindMenublockScroll();
    bindMenublockTouchNav();
    bindHeaderLogoClick();
    bindHeaderLogoSwipe();
    if (typeof window.bindDashboardTriggers === 'function') {
      window.bindDashboardTriggers();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHeaderMenublock);
  } else {
    initHeaderMenublock();
  }

  window.addEventListener(
    'resize',
    function () {
      updateMenublockScrollHints();
    },
    { passive: true }
  );

  function registerBarbaMenublockScroll() {
    if (window.TTMSBarba) {
      window.TTMSBarba.register(function () {
        var menublock = document.getElementById('menublock');
        if (menublock) {
          menublock._ttmsMenublockScrollBound = false;
          menublock._ttmsTouchNavBound = false;
        }
        bindMenublockScroll();
        bindMenublockTouchNav();
        bindHeaderLogoClick();
        bindHeaderLogoSwipe();
        if (typeof window.bindDashboardTriggers === 'function') {
          window.bindDashboardTriggers();
        }
      });
    }
  }

  if (window.TTMSBarba) {
    registerBarbaMenublockScroll();
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', registerBarbaMenublockScroll);
  } else {
    registerBarbaMenublockScroll();
  }
})();
