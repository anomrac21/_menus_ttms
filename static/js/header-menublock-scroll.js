/**
 * Hide TT Menus dashboard control when category nav (#menublock) is scrolled right;
 * keep venue logo visible and show signed-in badge on the logo (.account-badge--on-logo).
 */
(function () {
  'use strict';

  /** Hide only after ~1.5 category icons; show again when nearly back at start */
  var HIDE_AT_PX = 96;
  var SHOW_AT_PX = 40;

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
        mainHeader.classList.remove('menublock-scrolled-right');
      }
    } else if (scrollLeft >= HIDE_AT_PX) {
      mainHeader.classList.add('menublock-scrolled-right');
    }
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
      function () {
        updateHeaderMenublockScroll();
      },
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

    window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

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

  function initHeaderMenublock() {
    bindMenublockScroll();
    bindHeaderLogoClick();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHeaderMenublock);
  } else {
    initHeaderMenublock();
  }

  function registerBarbaMenublockScroll() {
    if (window.TTMSBarba) {
      window.TTMSBarba.register(function () {
        var menublock = document.getElementById('menublock');
        if (menublock) {
          menublock._ttmsMenublockScrollBound = false;
        }
        bindMenublockScroll();
        bindHeaderLogoClick();
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
