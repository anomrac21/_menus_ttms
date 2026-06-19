/**
 * Menu reels — same scroll model as #ads-reels-track (dedicated snap container, header visible).
 */
(function () {
  'use strict';

  var observer = null;
  var scrollHandler = null;
  var scrollSyncPending = false;
  var RATIO_THRESHOLD = 0.45;

  function getTrack() {
    return document.getElementById('menu-reels-track');
  }

  function isVisibleReelSlide(slide) {
    if (!slide || slide.hidden) return false;
    if (slide.classList.contains('ads-loading') || slide.classList.contains('ads-reels-slide--hidden')) {
      return false;
    }
    return true;
  }

  function getSlides(track) {
    if (!track) return [];
    return Array.from(
      track.querySelectorAll('.menu-reels-slide, .ads-reels-slide:not(.ads-loading)')
    ).filter(isVisibleReelSlide);
  }

  function getDominantSlide(track) {
    if (!track) return null;
    var tr = track.getBoundingClientRect();
    var midY = tr.top + tr.height / 2;
    var best = null;
    var bestDist = Infinity;
    getSlides(track).forEach(function (slide) {
      var sr = slide.getBoundingClientRect();
      if (sr.bottom <= tr.top || sr.top >= tr.bottom) return;
      var center = (sr.top + sr.bottom) / 2;
      var dist = Math.abs(center - midY);
      if (dist < bestDist) {
        bestDist = dist;
        best = slide;
      }
    });
    return best;
  }

  function normalizeMenublockSectionId(value) {
    if (value == null || value === '') return '';
    try {
      return decodeURIComponent(String(value).replace(/\+/g, ' '));
    } catch (_) {
      return String(value);
    }
  }

  function menublockSectionIdFromHref(href) {
    if (!href || href.charAt(0) !== '#') return '';
    return normalizeMenublockSectionId(href.slice(1));
  }

  function sectionIdFromSlide(slide) {
    if (!slide) return null;
    if (slide.classList.contains('ads-reels-slide')) return 'Promotions';
    var explicit = slide.getAttribute('data-reel-section');
    if (explicit) return explicit;
    var anchor = slide.querySelector('.menu-anchor[id]');
    return anchor ? anchor.id : null;
  }

  function resolveSectionIdForSlide(slide, slides) {
    if (!slide) return null;
    var id = sectionIdFromSlide(slide);
    if (id) return id;
    if (!slides || !slides.length) return null;
    var idx = slides.indexOf(slide);
    if (idx < 0) return null;
    for (var i = idx; i >= 0; i--) {
      id = sectionIdFromSlide(slides[i]);
      if (id) return id;
    }
    return null;
  }

  function setMenublockActive(sectionId) {
    var menublock = document.getElementById('menublock');
    if (!menublock) return;

    var targetId = normalizeMenublockSectionId(sectionId);

    menublock.querySelectorAll('.menublock-item').forEach(function (li) {
      if (li.classList.contains('menublock-item--search') || li.classList.contains('menublock-item--tags')) return;
      var link = li.querySelector('.menublock-link');
      if (!link) return;
      var href = link.getAttribute('href') || '';
      var isMatch = !!(targetId && menublockSectionIdFromHref(href) === targetId);
      li.classList.toggle('active', isMatch);
      if (isMatch) {
        link.classList.add('is-active');
        link.setAttribute('aria-current', 'location');
        if (typeof window.scrollMenublockLinkIntoView === 'function') {
          window.scrollMenublockLinkIntoView(link);
        } else {
          link.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'auto' });
        }
      } else {
        link.classList.remove('is-active');
        link.removeAttribute('aria-current');
      }
    });
  }

  function syncFooterFromTrack() {
    var track = getTrack();
    if (!track) {
      document.body.classList.remove('menu-reels-intro-active');
      document.body.classList.remove('menu-reels-contact-active');
      return;
    }
    var dom = getDominantSlide(track);
    var onIntro = !!(dom && dom.classList.contains('menu-reels-slide--intro'));
    var onContact = !!(dom && dom.classList.contains('menu-reels-slide--contact'));
    document.body.classList.toggle('menu-reels-intro-active', onIntro);
    document.body.classList.toggle('menu-reels-contact-active', onContact);
  }

  function syncMenublockFromTrack() {
    var track = getTrack();
    if (!track) return;
    var slides = getSlides(track);
    var dom = getDominantSlide(track);
    syncFooterFromTrack();
    if (!dom) {
      if (track.scrollTop < 40) setMenublockActive(null);
      return;
    }
    var id = resolveSectionIdForSlide(dom, slides);
    if (id === 'Sponsored') return;
    if (id && typeof window.loadHomeMenuForSectionId === 'function') {
      window.loadHomeMenuForSectionId(id);
    }
    if (id) setMenublockActive(id);
  }

  function findSlideForSectionId(id) {
    var track = getTrack();
    if (!track || !id) return null;
    var targetId = normalizeMenublockSectionId(id);
    var anchor = document.getElementById(targetId);
    if (anchor) {
      var fromAnchor = anchor.closest('.menu-reels-slide, .menu-header.menu-reels-slide, .ads-reels-slide');
      if (fromAnchor) return fromAnchor;
    }
    var slides = getSlides(track);
    for (var i = 0; i < slides.length; i++) {
      if (normalizeMenublockSectionId(sectionIdFromSlide(slides[i])) === targetId) {
        return slides[i];
      }
      if (normalizeMenublockSectionId(resolveSectionIdForSlide(slides[i], slides)) === targetId) {
        return slides[i];
      }
    }
    return null;
  }

  function slideScrollTop(track, slide) {
    var tr = track.getBoundingClientRect();
    var sr = slide.getBoundingClientRect();
    return track.scrollTop + (sr.top - tr.top);
  }

  function scrollToSlide(slide, behavior) {
    var track = getTrack();
    if (!track || !slide) return;
    track.scrollTo({
      top: slideScrollTop(track, slide),
      left: 0,
      behavior: behavior || 'smooth'
    });
    window.setTimeout(syncMenublockFromTrack, behavior === 'auto' ? 50 : 400);
  }

  function compareDocumentOrder(a, b) {
    if (a === b) return 0;
    var pos = a.compareDocumentPosition(b);
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  }

  function sectionSlugFromItemCard(card) {
    if (!card) return '';
    var slug = card.getAttribute('data-section-slug');
    if (slug) return slug;
    var btn = card.querySelector('.menu-favorite-btn[data-favorite-section]');
    if (btn) return btn.getAttribute('data-favorite-section') || '';
    var url = card.getAttribute('data-item-url') || '';
    var match = url.match(/^\/([^/]+)\//);
    return match ? match[1] : '';
  }

  function getItemsForSection(track, slug) {
    if (!slug) return [];
    return Array.from(track.querySelectorAll('.menu-item-card.menu-reels-slide')).filter(function (card) {
      return sectionSlugFromItemCard(card) === slug;
    }).sort(compareDocumentOrder);
  }

  function dedupeAdSlides(track) {
    var byId = {};
    track.querySelectorAll('.ads-reels-slide').forEach(function (slide) {
      var id = slide.getAttribute('data-ad-id') || slide.id;
      if (!id) return;
      if (!byId[id]) {
        byId[id] = slide;
        return;
      }
      var keep = byId[id];
      var keepIdx = parseInt(keep.getAttribute('data-catalog-index'), 10) || 0;
      var slideIdx = parseInt(slide.getAttribute('data-catalog-index'), 10) || 0;
      if (slideIdx < keepIdx) {
        keep.remove();
        byId[id] = slide;
      } else {
        slide.remove();
      }
    });
  }

  function collectSlidesInReelOrder(track) {
    dedupeAdSlides(track);

    var ordered = [];
    var seen = new Set();
    var push = function (el) {
      if (!el || seen.has(el)) return;
      seen.add(el);
      ordered.push(el);
    };

    push(track.querySelector('.menu-reels-slide--hero'));
    push(track.querySelector('.menu-reels-slide--contact'));
    push(track.querySelector('.menu-reels-slide--intro'));

    track.querySelectorAll('.menu-reels-slide--section-title').forEach(function (el) {
      push(el);
    });

    Array.from(track.querySelectorAll('.ads-reels-slide'))
      .filter(isVisibleReelSlide)
      .sort(function (a, b) {
        return (
          (parseInt(a.getAttribute('data-catalog-index'), 10) || 0) -
          (parseInt(b.getAttribute('data-catalog-index'), 10) || 0)
        );
      })
      .forEach(push);

    Array.from(track.querySelectorAll('.menu-header.menu-reels-slide'))
      .sort(function (a, b) {
        return (
          (parseInt(a.getAttribute('data-weight'), 10) || 999) -
          (parseInt(b.getAttribute('data-weight'), 10) || 999)
        );
      })
      .forEach(function (header) {
        push(header);
        var slug = header.getAttribute('data-section-slug') || '';
        getItemsForSection(track, slug).forEach(push);
      });

    track.querySelectorAll('.menu-reels-slide, .ads-reels-slide').forEach(function (slide) {
      if (!isVisibleReelSlide(slide)) return;
      if (slide.classList.contains('menu-reels-slide--bottom-ads')) return;
      push(slide);
    });

    push(track.querySelector('.menu-reels-slide--bottom-ads'));

    return ordered;
  }

  function cleanupTrackShells(track) {
    var adsContainer = track.querySelector('#homepage-ads-container');
    if (adsContainer) {
      adsContainer.querySelectorAll('.ads-loading').forEach(function (el) {
        el.remove();
      });
    }
    ['#packery-container', '.main-body'].forEach(function (sel) {
      var el = track.querySelector(sel);
      if (!el) return;
      if (!el.querySelector('.menu-reels-slide, .ads-reels-slide')) el.remove();
    });
    if (adsContainer && !adsContainer.querySelector('.menu-reels-slide, .ads-reels-slide')) {
      if (!adsContainer.querySelector('.ads-loading') && !adsContainer.textContent.trim()) {
        adsContainer.remove();
      }
    }
    track.querySelectorAll('.main-menu-bg').forEach(function (bg) {
      if (!bg.querySelector('.menu-reels-slide, .ads-reels-slide')) bg.remove();
    });
    track.querySelectorAll('a.menu-anchor#ads-section').forEach(function (anchor) {
      if (!anchor.classList.contains('menu-reels-slide')) anchor.remove();
    });
  }

  function insertAdsPlaceholderAfterPromotions(track, placeholder) {
    if (!track || !placeholder) return;
    var promo = track.querySelector(
      '.menu-reels-slide--section-title[data-reel-section="Promotions"]'
    );
    if (promo && promo.nextSibling !== placeholder) {
      track.insertBefore(placeholder, promo.nextSibling);
      return;
    }
    if (!promo && !track.contains(placeholder)) {
      track.appendChild(placeholder);
    }
  }

  /** Move .bottomads / #pageadscontainer into the reels track as the final snap slide. */
  function mountBottomAdsInTrack(track) {
    if (!track) return null;

    var existingSlide = track.querySelector('.menu-reels-slide--bottom-ads');
    if (existingSlide) {
      if (existingSlide !== track.lastElementChild) {
        track.appendChild(existingSlide);
      }
      var existingWrap = existingSlide.querySelector('.bottomads');
      if (existingWrap) {
        existingWrap.classList.add('menu-reels-bottom-ads-in-track');
      }
      return existingSlide;
    }

    var container = document.getElementById('pageadscontainer');
    if (!container) return null;

    if (track.contains(container)) {
      var slideFromContainer = container.closest('.menu-reels-slide--bottom-ads');
      if (slideFromContainer) return slideFromContainer;
    }

    var bottomads = document.querySelector('.bottomads');
    if (!bottomads || !bottomads.contains(container)) {
      bottomads = container.parentElement;
      if (
        !bottomads ||
        bottomads === track ||
        bottomads.classList.contains('menu-reels-slide--bottom-ads')
      ) {
        bottomads = document.createElement('div');
        bottomads.className = 'bottomads';
        if (container.parentElement) {
          container.parentElement.insertBefore(bottomads, container);
        }
        bottomads.appendChild(container);
      }
    }

    var slide = document.createElement('section');
    slide.className = 'menu-reels-slide menu-reels-slide--bottom-ads';
    slide.setAttribute('data-reel-section', 'Sponsored');
    slide.id = 'menu-reels-sponsored-ads';

    if (bottomads.parentElement) {
      bottomads.parentElement.removeChild(bottomads);
    }

    slide.appendChild(bottomads);
    track.appendChild(slide);
    bottomads.classList.add('menu-reels-bottom-ads-in-track');
    bottomads.dataset.mountedInReelsTrack = '1';
    return slide;
  }

  /** Move every reel slide to direct children of the track in canonical order. */
  function flattenReelsTrack(track) {
    var bottomAdsSlide = track.querySelector('.menu-reels-slide--bottom-ads');
    if (bottomAdsSlide && bottomAdsSlide.parentElement === track) {
      bottomAdsSlide.parentElement.removeChild(bottomAdsSlide);
    }

    var slides = collectSlidesInReelOrder(track);
    if (bottomAdsSlide && slides.indexOf(bottomAdsSlide) === -1) {
      slides.push(bottomAdsSlide);
    }
    var adsPlaceholder = track.querySelector('#homepage-ads-container');
    var keepAdsPlaceholder =
      adsPlaceholder && !adsPlaceholder.querySelector('.ads-reels-slide');

    while (track.firstChild) {
      track.removeChild(track.firstChild);
    }

    var insertedAdsPlaceholder = false;
    slides.forEach(function (slide) {
      track.appendChild(slide);
      if (
        keepAdsPlaceholder &&
        !insertedAdsPlaceholder &&
        slide.classList.contains('menu-reels-slide--section-title') &&
        slide.getAttribute('data-reel-section') === 'Promotions'
      ) {
        track.appendChild(adsPlaceholder);
        insertedAdsPlaceholder = true;
      }
    });

    if (keepAdsPlaceholder && !insertedAdsPlaceholder) {
      insertAdsPlaceholderAfterPromotions(track, adsPlaceholder);
    }

    cleanupTrackShells(track);

    mountBottomAdsInTrack(track);

    try {
      var win = track.ownerDocument && track.ownerDocument.defaultView;
      if (win) win.dispatchEvent(new CustomEvent('menuReelsFlattened'));
    } catch (e) { /* ignore */ }
  }

  function scrollToSectionId(id) {
    if (typeof window.loadHomeMenuForSectionId === 'function') {
      window.loadHomeMenuForSectionId(id);
    }
    scrollToSlide(findSlideForSectionId(id), 'smooth');
  }

  function scrollTrackToTop(behavior) {
    var track = getTrack();
    if (!track) return;
    track.scrollTo({ top: 0, left: 0, behavior: behavior || 'smooth' });
    setMenublockActive(null);
  }

  function bindMenublockReelsNav() {
    if (document.documentElement._ttmsReelsNavBound) {
      return;
    }
    document.documentElement._ttmsReelsNavBound = true;

    document.addEventListener('click', function (e) {
      var link = e.target.closest('#menublock .menublock-link[href^="#"]');
      if (!link) return;
      var hash = link.getAttribute('href');
      if (!hash || hash === '#') return;
      var id = decodeURIComponent(hash.slice(1));
      if (!findSlideForSectionId(id)) return;
      if (e.cancelable) {
        e.preventDefault();
      }
      e.stopPropagation();
      if (typeof closeCart === 'function') closeCart();
      if (typeof window.closeMenublockDropdown === 'function') {
        window.closeMenublockDropdown();
      }
      if (typeof window.loadHomeMenuForSectionId === 'function') {
        window.loadHomeMenuForSectionId(id);
      }
      scrollToSectionId(id);
      history.replaceState(null, '', window.location.pathname + window.location.search + '#' + id);
    });
  }

  function isInnerScrollSlide(slide) {
    if (!slide) return false;
    if (document.body.classList.contains('menu-reels-item-modal-open')) return false;
    return (
      slide.classList.contains('menu-item-card') &&
      slide.getAttribute('data-item-expanded') === 'true'
    );
  }

  function lockReelsTrackScroll() {
    var track = getTrack();
    if (!track) return;
    track._ttmsLockedScrollTop = track.scrollTop;
    track.classList.add('menu-reels-track--locked');
  }

  function unlockReelsTrackScroll() {
    var track = getTrack();
    if (!track) return;
    if (typeof track._ttmsLockedScrollTop === 'number') {
      track.scrollTop = track._ttmsLockedScrollTop;
    }
    delete track._ttmsLockedScrollTop;
    track.classList.remove('menu-reels-track--locked');
  }

  function scrollToAdjacentSlide(track, slide, delta) {
    var slides = getSlides(track);
    var idx = slides.indexOf(slide);
    if (idx < 0) return false;
    var next = delta > 0 ? slides[idx + 1] : slides[idx - 1];
    if (!next) return false;
    scrollToSlide(next, 'smooth');
    return true;
  }

  function getInnerScrollSlide(target, track) {
    if (!target || !target.closest) return null;
    var slide = target.closest(
      '.contactinfobg.menu-reels-slide, .hero-content.menu-reels-slide, .menu-item-card.menu-reels-slide'
    );
    if (!slide || !track.contains(slide) || !isInnerScrollSlide(slide)) return null;
    return slide;
  }

  function shouldChainScrollToTrack(slide, delta) {
    if (!delta) return false;
    var canScrollInside = slide.scrollHeight > slide.clientHeight + 2;
    if (!canScrollInside) return true;
    var atTop = slide.scrollTop <= 1;
    var atBottom = slide.scrollTop + slide.clientHeight >= slide.scrollHeight - 2;
    return (delta < 0 && atTop) || (delta > 0 && atBottom);
  }

  function bindTrackScroll() {
    var track = getTrack();
    if (!track || track._ttmsReelsTrackBound) return;
    track._ttmsReelsTrackBound = true;

    if (scrollHandler) track.removeEventListener('scroll', scrollHandler);
    scrollHandler = function () {
      if (scrollSyncPending) return;
      scrollSyncPending = true;
      requestAnimationFrame(function () {
        scrollSyncPending = false;
        syncMenublockFromTrack();
      });
    };
    track.addEventListener('scroll', scrollHandler, { passive: true });

    track.addEventListener(
      'wheel',
      function (e) {
        if (document.body.classList.contains('menu-reels-item-modal-open')) {
          e.preventDefault();
          return;
        }
        var slide = getInnerScrollSlide(e.target, track);
        if (!slide || !shouldChainScrollToTrack(slide, e.deltaY)) return;
        e.preventDefault();
        if (!scrollToAdjacentSlide(track, slide, e.deltaY)) {
          track.scrollTop += e.deltaY;
        }
      },
      { passive: false, capture: true }
    );

    var touchState = { slide: null, lastY: 0 };
    track.addEventListener(
      'touchstart',
      function (e) {
        touchState.slide = getInnerScrollSlide(e.target, track);
        touchState.lastY = e.touches[0] ? e.touches[0].clientY : 0;
      },
      { passive: true }
    );
    track.addEventListener(
      'touchmove',
      function (e) {
        if (window.TTMS_PTR_PULLING) return;
        if (document.body.classList.contains('menu-reels-item-modal-open')) {
          e.preventDefault();
          return;
        }
        if (!touchState.slide || !e.touches[0]) return;
        var y = e.touches[0].clientY;
        var delta = touchState.lastY - y;
        touchState.lastY = y;
        if (!shouldChainScrollToTrack(touchState.slide, delta)) return;
        e.preventDefault();
        if (!scrollToAdjacentSlide(track, touchState.slide, delta)) {
          track.scrollTop += delta;
        }
      },
      { passive: false, capture: true }
    );
    track.addEventListener(
      'touchend',
      function () {
        touchState.slide = null;
      },
      { passive: true }
    );

    if (!track._ttmsItemClickScrollGuard) {
      track._ttmsItemClickScrollGuard = true;
      track.addEventListener(
        'click',
        function (e) {
          var card = e.target.closest('.menu-item-card.menu-reels-slide');
          if (!card || e.target.closest('.menu-favorite-btn')) return;
          var savedTop = track.scrollTop;
          window.requestAnimationFrame(function () {
            window.requestAnimationFrame(function () {
              if (document.body.classList.contains('menu-reels-item-modal-open')) {
                if (typeof track._ttmsLockedScrollTop === 'number') {
                  track.scrollTop = track._ttmsLockedScrollTop;
                }
                return;
              }
              if (Math.abs(track.scrollTop - savedTop) > 8) {
                track.scrollTop = savedTop;
              }
            });
          });
        },
        true
      );
    }

  }

  function shouldOpenMenuItemOrderFromEvent(e) {
    if (!e || !e.target || !e.target.closest) return false;

    if (
      e.target.closest(
        '.menu-favorite-btn, .menu-add-photo-btn, .menu-image-add-btn, .menu-image-actions, [data-smash-action], .menu-smash-pass-card__counts, .menu-smash-pass-card__title-link'
      )
    ) {
      return false;
    }

    if (e.target.closest('.menu-item-row-top')) {
      return true;
    }

    if (e.target.closest('.menu-smash-pass-card.is-local, .menu-smash-pass-card--add-photo, .menu-smash-pass__empty-state')) {
      return true;
    }

    if (e.target.closest('.menu-smash-pass-card:not(.is-local)')) {
      return !!e.target.closest('.menu-item-card.menu-reels-slide .menu-item-smash-pass');
    }

    return !!e.target.closest('.menu-item-card.menu-reels-slide');
  }

  function openReelsMenuItemOrder(card, url, event) {
    if (!card || !url) return;

    var root = document.documentElement;
    if (
      root._ttmsMenuItemOrderLast &&
      root._ttmsMenuItemOrderLast.card === card &&
      Date.now() - root._ttmsMenuItemOrderLast.at < 450
    ) {
      return;
    }
    root._ttmsMenuItemOrderLast = { card: card, at: Date.now() };

    if (typeof window.toggleItemExpansion === 'function') {
      window.toggleItemExpansion(card, url, event);
      return;
    }

    console.error('[menu-reels] toggleItemExpansion is not available — main.js may have failed to load');

    if (typeof window.openMenuReelsItemModal === 'function') {
      window.openMenuReelsItemModal(card);
    }
  }

  function bindMenuItemReelsClicks() {
    var root = document.documentElement;
    if (root._ttmsMenuItemReelsClickBound) return;
    root._ttmsMenuItemReelsClickBound = true;

    document.addEventListener(
      'click',
      function (e) {
        var track = getTrack();
        if (!track) return;
        if (!shouldOpenMenuItemOrderFromEvent(e)) return;

        var card = e.target.closest('.menu-item-card.menu-reels-slide');
        if (!card || !track.contains(card)) return;

        var url = card.getAttribute('data-item-url');
        if (!url) return;

        openReelsMenuItemOrder(card, url, e);
      },
      false
    );
  }

  function observeSections(track) {
    if (observer) observer.disconnect();
    var slides = getSlides(track).filter(function (slide) {
      if (slide.classList.contains('menu-item-card')) return false;
      return !!sectionIdFromSlide(slide);
    });
    if (!slides.length) return;

    observer = new IntersectionObserver(
      function () {
        syncMenublockFromTrack();
      },
      { root: track, rootMargin: '0px', threshold: [0, 0.35, 0.55, 0.75, 1] }
    );
    slides.forEach(function (slide) {
      observer.observe(slide);
    });
  }

  function initMenuReels() {
    var track = getTrack();
    if (!track) {
      document.documentElement.classList.remove('menu-reels-mode');
      document.body.classList.remove('menu-reels-mode');
      document.body.classList.remove('menu-reels-intro-active');
      document.body.classList.remove('menu-reels-contact-active');
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      return;
    }

    mountBottomAdsInTrack(track);

    document.documentElement.classList.add('menu-reels-mode');
    document.body.classList.add('menu-reels-mode');

    bindMenuItemReelsClicks();

    var ssrAdsPending =
      track.querySelector('#homepage-ads-container .ads-reels-slide') &&
      !track.querySelector(':scope > .ads-reels-slide');
    if (
      ssrAdsPending &&
      window.adManager &&
      typeof window.adManager.populateHomepage === 'function' &&
      !window.adManager.hasPopulatedHome
    ) {
      window.adManager.populateHomepage();
    }

    flattenReelsTrack(track);
    bindMenublockReelsNav();
    bindTrackScroll();
    observeSections(track);
    syncMenublockFromTrack();

    if (window.location.hash) {
      var hashId = decodeURIComponent(window.location.hash.replace(/^#/, ''));
      var hashSlide = findSlideForSectionId(hashId);
      if (hashSlide) {
        requestAnimationFrame(function () {
          scrollToSlide(hashSlide, 'auto');
        });
      }
    } else if (!track._ttmsReelsScrolledToStart) {
      track._ttmsReelsScrolledToStart = true;
      requestAnimationFrame(function () {
        track.scrollTop = 0;
        setMenublockActive(null);
      });
    }
  }

  function registerLifecycle() {
    if (window.TTMSBarba) {
      window.TTMSBarba.register(function () {
        var menublock = document.getElementById('menublock');
        if (menublock) menublock._ttmsReelsNavBound = false;
        var track = getTrack();
        if (track) {
          track._ttmsReelsTrackBound = false;
          track._ttmsReelsScrolledToStart = false;
        }
        initMenuReels();
        bindMenuReelsItemModal();
      });
    }
  }

  var activeReelsItemCard = null;

  function getMenuReelsItemModal() {
    return document.getElementById('menu-reels-item-modal');
  }

  function isActiveReelsCardLive(card) {
    card = card || activeReelsItemCard;
    return !!(card && card.isConnected && card.closest && card.closest('#menu-reels-track'));
  }

  function resetReelsItemCardState(card) {
    if (!card || !card.isConnected) return;
    card.setAttribute('aria-expanded', 'false');
    card.classList.remove('expanded');
    var expandedContent = card.querySelector('.menu-item-expanded-content');
    if (expandedContent) expandedContent.style.display = 'none';
  }

  function forceCloseMenuReelsItemModal() {
    var modal = getMenuReelsItemModal();
    if (activeReelsItemCard) {
      resetReelsItemCardState(activeReelsItemCard);
    }
    activeReelsItemCard = null;

    if (!modal) return;

    var data = modal.querySelector('.menu-reels-item-modal__data');
    var loading = modal.querySelector('.menu-reels-item-modal__loading');
    if (data) {
      data.innerHTML = '';
      data.style.display = 'none';
    }
    if (loading) loading.style.display = 'none';

    var favSlot = modal.querySelector('#menuReelsItemModalFavoriteSlot');
    if (favSlot) favSlot.innerHTML = '';

    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    modal.classList.remove('is-open');
    document.body.classList.remove('menu-reels-item-modal-open');
    unlockReelsTrackScroll();
  }

  function navigateFromMenuReelsItemModal(href) {
    if (!href) return;
    if (typeof window.closeAllPanelsBeforeNavigation === 'function') {
      window.closeAllPanelsBeforeNavigation();
    } else {
      forceCloseMenuReelsItemModal();
    }
    if (window.TTMSBarba && typeof window.TTMSBarba.navigate === 'function') {
      window.TTMSBarba.navigate(href);
      return;
    }
    if (typeof window.barba !== 'undefined' && typeof window.barba.go === 'function') {
      try {
        var url = new URL(href, window.location.href);
        window.barba.go(url.pathname + url.search + url.hash);
        return;
      } catch (err) { /* fall through */ }
    }
    window.location.assign(href);
  }

  function syncMenuReelsModalFavoriteButton(card, modal) {
    if (!card || !modal) return;
    var slot = modal.querySelector('#menuReelsItemModalFavoriteSlot');
    if (!slot) return;
    slot.innerHTML = '';
    var cardBtn = card.querySelector('.menu-item-title-row .menu-favorite-btn, .menu-favorite-btn');
    if (!cardBtn) return;
    var btn = cardBtn.cloneNode(true);
    btn.classList.remove('is-busy');
    slot.appendChild(btn);
    if (window.TTMSMenuFavorites && typeof window.TTMSMenuFavorites.refresh === 'function') {
      window.TTMSMenuFavorites.refresh();
    }
  }

  function openMenuReelsItemModal(card) {
    var modal = getMenuReelsItemModal();
    if (!modal || !card) return;

    lockReelsTrackScroll();
    activeReelsItemCard = card;
    card.setAttribute('aria-expanded', 'true');

    var titleEl = modal.querySelector('.menu-reels-item-modal__title');
    var titleLinkEl = modal.querySelector('.menu-reels-item-modal__title-link');
    var itemUrl = card.getAttribute('data-item-url') || '';
    var titleText = '';
    var cardTitleText = card.querySelector('.menu-item-title-text');
    var cardTitleLink = card.querySelector('.menu-item-title a');
    if (cardTitleText) {
      titleText = cardTitleText.textContent.trim();
    } else if (cardTitleLink) {
      titleText = cardTitleLink.textContent.trim();
    } else {
      var titleNode = card.querySelector('.menu-item-title');
      if (titleNode) titleText = titleNode.textContent.trim();
    }
    if (titleLinkEl) {
      titleLinkEl.textContent = titleText;
      if (itemUrl) {
        titleLinkEl.href = itemUrl;
        titleLinkEl.removeAttribute('aria-hidden');
      } else {
        titleLinkEl.removeAttribute('href');
        titleLinkEl.setAttribute('aria-hidden', 'true');
      }
    }

    syncMenuReelsModalFavoriteButton(card, modal);

    var loading = modal.querySelector('.menu-reels-item-modal__loading');
    var data = modal.querySelector('.menu-reels-item-modal__data');
    if (loading) loading.style.display = '';
    if (data) {
      data.style.display = 'none';
      data.innerHTML = '';
    }

    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    modal.classList.add('is-open');
    document.body.classList.add('menu-reels-item-modal-open');

    var closeBtn = modal.querySelector('.menu-reels-item-modal__close');
    if (closeBtn) closeBtn.focus();
  }

  function closeMenuReelsItemModal(card) {
    if (card && activeReelsItemCard && card !== activeReelsItemCard) return;
    forceCloseMenuReelsItemModal();
  }

  function getMenuReelsModalActiveCard() {
    return activeReelsItemCard;
  }

  function getMenuReelsItemModalTargets() {
    var modal = getMenuReelsItemModal();
    if (!modal) {
      return { container: null, loading: null, data: null };
    }
    return {
      container: modal.querySelector('.menu-reels-item-modal__body'),
      loading: modal.querySelector('.menu-reels-item-modal__loading'),
      data: modal.querySelector('.menu-reels-item-modal__data'),
    };
  }

  function getMenuReelsItemModalDataRoot() {
    var modal = getMenuReelsItemModal();
    return modal ? modal.querySelector('.menu-reels-item-modal__data') : null;
  }

  function closeActiveReelsItemModalFromUI() {
    if (isActiveReelsCardLive() && typeof window.collapseMenuItemCard === 'function') {
      window.collapseMenuItemCard(activeReelsItemCard);
      var modal = getMenuReelsItemModal();
      if (modal && !modal.classList.contains('is-open')) return;
    }
    forceCloseMenuReelsItemModal();
  }

  function ensureMenuReelsItemModalClosed() {
    var modal = getMenuReelsItemModal();
    if (!modal || !modal.classList.contains('is-open')) {
      if (!isActiveReelsCardLive()) activeReelsItemCard = null;
      return;
    }
    closeActiveReelsItemModalFromUI();
  }

  function closeAllUiPanels(options) {
    options = options || {};

    if (!options.skipReelsModal) {
      forceCloseMenuReelsItemModal();
    }

    if (!options.keepCart && typeof window.closeCart === 'function') {
      window.closeCart();
    }
    if (!options.keepDashboard && typeof window.closeDashboard === 'function') {
      window.closeDashboard();
    }
    if (!options.keepAccountDashboard && typeof window.closeAccountDashboard === 'function') {
      window.closeAccountDashboard();
    }
    if (!options.keepSearch) {
      if (typeof window.closeSearch === 'function') {
        window.closeSearch();
      } else if (typeof window.toggleSearch === 'function') {
        var search = document.getElementById('search');
        if (search && !search.classList.contains('hide-search')) {
          window.toggleSearch();
        }
      }
    }
    if (!options.keepSettings && typeof window.closeFooterSettings === 'function') {
      window.closeFooterSettings();
    }
    if (!options.keepMenublock) {
      if (typeof window.closeMenublockDropdown === 'function') {
        window.closeMenublockDropdown();
      } else {
        document.body.classList.remove('menublock-dropdown-open');
        var mainHeader = document.querySelector('.main-header');
        if (mainHeader) {
          mainHeader.classList.remove('menublock-dropdown-open');
        }
      }
    }

    if (!options.keepDashboard && !options.keepAccountDashboard) {
      document.body.classList.remove('modal-open');
    }
    if (!options.keepAccountDashboard) {
      document.body.classList.remove('account-dashboard-open');
    }
    if (!options.skipReelsModal) {
      document.body.classList.remove('menu-reels-item-modal-open');
    }
  }

  function closeAllPanelsBeforeNavigation(options) {
    closeAllUiPanels(Object.assign({ skipReelsModal: false }, options || {}));
  }

  function isSameOriginNavigationHref(href) {
    if (!href || href.charAt(0) === '#') return false;
    if (/^(javascript:|mailto:|tel:)/i.test(href)) return false;
    try {
      return new URL(href, window.location.href).origin === window.location.origin;
    } catch (e) {
      return false;
    }
  }

  function bindMenuReelsItemModal() {
    var modal = getMenuReelsItemModal();
    if (!modal || modal._ttmsReelsItemModalBound) return;
    modal._ttmsReelsItemModalBound = true;

    modal.querySelectorAll('[data-close-reels-item-modal]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        closeActiveReelsItemModalFromUI();
      });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (!modal.classList.contains('is-open')) return;
      e.preventDefault();
      closeActiveReelsItemModalFromUI();
    });

    modal.addEventListener('click', function (e) {
      if (!modal.classList.contains('is-open')) return;
      var link = e.target.closest && e.target.closest('a[href]');
      if (!link || link.hasAttribute('data-close-reels-item-modal')) return;
      if (link.classList.contains('dashboard-new-item-placeholder-link')) return;
      if (!isSameOriginNavigationHref(link.getAttribute('href'))) return;
      e.preventDefault();
      e.stopPropagation();
      navigateFromMenuReelsItemModal(link.getAttribute('href'));
    }, true);
  }

  function scrollToSponsoredAds(behavior) {
    var slide =
      document.getElementById('menu-reels-sponsored-ads') ||
      document.querySelector('.menu-reels-slide--bottom-ads');
    scrollToSlide(slide, behavior || 'smooth');
  }

  function scrollToMenuReelsCard(card, behavior) {
    scrollToSlide(card, behavior || 'smooth');
  }

  window.scrollToMenuReelsCard = scrollToMenuReelsCard;
  window.openReelsMenuItemOrder = openReelsMenuItemOrder;
  window.getMenuReelsTrack = getTrack;
  window.scrollMenuReelTo = scrollToSectionId;
  window.scrollToSponsoredAds = scrollToSponsoredAds;
  window.scrollMenuReelsToTop = scrollTrackToTop;
  window.initMenuReels = initMenuReels;
  window.mountBottomAdsInTrack = mountBottomAdsInTrack;
  window.shouldOpenMenuItemOrderFromEvent = shouldOpenMenuItemOrderFromEvent;
  window.openMenuReelsItemModal = openMenuReelsItemModal;
  window.closeMenuReelsItemModal = closeMenuReelsItemModal;
  window.ensureMenuReelsItemModalClosed = ensureMenuReelsItemModalClosed;
  window.closeAllUiPanels = closeAllUiPanels;
  window.closeAllPanelsBeforeNavigation = closeAllPanelsBeforeNavigation;
  window.getMenuReelsModalActiveCard = getMenuReelsModalActiveCard;
  window.getMenuReelsItemModalTargets = getMenuReelsItemModalTargets;
  window.getMenuReelsItemModalDataRoot = getMenuReelsItemModalDataRoot;

  window.addEventListener('adsPopulated', function () {
    initMenuReels();
  });

  window.addEventListener('adManagerReady', function () {
    initMenuReels();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initMenuReels();
      bindMenuReelsItemModal();
      registerLifecycle();
    });
  } else {
    initMenuReels();
    bindMenuReelsItemModal();
    registerLifecycle();
  }
})();
