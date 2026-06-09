/**
 * Menu search — toggle bar + live filter (reels homepage + classic list pages).
 */
(function () {
    'use strict';

    function isMenuReelsSearchContext() {
        return !!document.getElementById('menu-reels-track');
    }

    function parseMenuSearchJsonAttr(el, name) {
        if (!el) return '';
        try {
            var v = JSON.parse(el.getAttribute(name) || '[]');
            if (!Array.isArray(v)) return String(v || '').toLowerCase();
            return v.map(function (item) {
                if (item == null) return '';
                if (typeof item === 'object') {
                    return Object.values(item).join(' ');
                }
                return String(item);
            }).join(' ').toLowerCase();
        } catch (_) {
            return '';
        }
    }

    function menuItemMatchesSearch(card, searchTerm) {
        if (!card || !searchTerm) return false;

        var titleLink = card.querySelector('.menu-item-title a');
        var titleElement = titleLink || card.querySelector('.menu-item-title');
        var descriptionElement = card.querySelector('.menu-item-description');
        var titleText = titleElement ? titleElement.textContent.trim().toLowerCase() : '';
        var descriptionText = descriptionElement ? descriptionElement.textContent.trim().toLowerCase() : '';
        var optionsText = Array.from(card.querySelectorAll('.menu-item-options li'))
            .map(function (li) { return li.textContent.trim().toLowerCase(); })
            .join(' ');
        var sectionText = String(
            card.getAttribute('data-reel-section') ||
            card.getAttribute('data-section-slug') ||
            ''
        ).toLowerCase();
        var metaText = [
            parseMenuSearchJsonAttr(card, 'data-tags'),
            parseMenuSearchJsonAttr(card, 'data-ingredients'),
            parseMenuSearchJsonAttr(card, 'data-types'),
            parseMenuSearchJsonAttr(card, 'data-cookingmethods'),
            parseMenuSearchJsonAttr(card, 'data-events'),
        ].join(' ');
        var haystack = [titleText, descriptionText, optionsText, sectionText, metaText].join(' ');

        return haystack.indexOf(searchTerm) !== -1;
    }

    function clearMenuSearchFilters() {
        document.body.classList.remove('menu-search-active');

        document.querySelectorAll('.menu-item-card').forEach(function (card) {
            card.hidden = false;
            card.style.display = '';
            card.removeAttribute('data-menu-search-hidden');
        });

        document.querySelectorAll('.main-menu-bg').forEach(function (section) {
            section.style.display = '';
            section.hidden = false;
        });

        var track = document.getElementById('menu-reels-track');
        if (track) {
            track.querySelectorAll('.menu-reels-slide, .ads-reels-slide').forEach(function (slide) {
                slide.hidden = false;
                slide.removeAttribute('data-menu-search-hidden');
            });
        }

        var header = document.getElementById('searchresultheader');
        if (header) header.classList.add('is-hidden');
    }

    function applyMenuReelsSearch(searchTerm) {
        var track = document.getElementById('menu-reels-track');
        if (!track) return false;

        var cards = track.querySelectorAll('.menu-item-card.menu-reels-slide');
        var matchingSections = new Set();

        cards.forEach(function (card) {
            var matches = menuItemMatchesSearch(card, searchTerm);
            card.hidden = !matches;
            card.style.display = matches ? '' : 'none';
            if (matches) {
                var sectionName = card.getAttribute('data-reel-section');
                var sectionSlug = card.getAttribute('data-section-slug');
                if (sectionName) matchingSections.add(sectionName);
                if (sectionSlug) matchingSections.add(sectionSlug);
            }
        });

        track.querySelectorAll('.menu-reels-slide, .ads-reels-slide').forEach(function (slide) {
            if (slide.classList.contains('menu-item-card')) return;

            if (
                slide.classList.contains('menu-reels-slide--hero') ||
                slide.classList.contains('menu-reels-slide--contact') ||
                slide.classList.contains('menu-reels-slide--intro') ||
                slide.classList.contains('ads-reels-slide')
            ) {
                slide.hidden = true;
                return;
            }

            if (slide.classList.contains('menu-reels-slide--section-title')) {
                var sectionTitle = slide.getAttribute('data-reel-section') || '';
                slide.hidden = !matchingSections.has(sectionTitle);
                return;
            }

            if (slide.classList.contains('menu-header')) {
                var reelSection = slide.getAttribute('data-reel-section') || '';
                var reelSlug = slide.getAttribute('data-section-slug') || '';
                slide.hidden = !(matchingSections.has(reelSection) || matchingSections.has(reelSlug));
                return;
            }

            slide.hidden = true;
        });

        var firstMatch = track.querySelector('.menu-item-card.menu-reels-slide:not([hidden])');
        if (firstMatch) {
            firstMatch.scrollIntoView({ block: 'start', behavior: 'auto' });
        }

        return true;
    }

    function applyClassicMenuSearch(searchTerm) {
        var menuItemCards = document.querySelectorAll('.menu-item-card:not(.menu-reels-slide)');
        var sectionsWithMatches = new Set();

        menuItemCards.forEach(function (card) {
            var matches = menuItemMatchesSearch(card, searchTerm);
            card.style.display = matches ? '' : 'none';
            card.hidden = !matches;

            if (matches) {
                var menuSection = card.closest('.main-menu-bg');
                if (menuSection) sectionsWithMatches.add(menuSection);
            }
        });

        document.querySelectorAll('.main-menu-bg').forEach(function (section) {
            if (sectionsWithMatches.size === 0) {
                section.style.display = '';
                return;
            }
            section.style.display = sectionsWithMatches.has(section) ? '' : 'none';
        });
    }

    function liveSearch() {
        var searchInput = document.getElementById('searchbox');
        if (!searchInput) return;

        var searchTerm = searchInput.value.trim().toLowerCase();
        var header = document.getElementById('searchresultheader');

        if (searchTerm.length === 0) {
            clearMenuSearchFilters();
            return;
        }

        if (header) header.classList.remove('is-hidden');

        document.body.classList.add('menu-search-active');

        if (isMenuReelsSearchContext()) {
            applyMenuReelsSearch(searchTerm);
            return;
        }

        applyClassicMenuSearch(searchTerm);
    }

    function setSearchBarOpen(isOpen) {
        document.body.classList.toggle('menu-search-bar-open', !!isOpen);
    }

    function syncSearchBarOpenState() {
        var search = document.getElementById('search');
        setSearchBarOpen(search && !search.classList.contains('hide-search'));
    }

    function toggleSearch() {
        var search = document.getElementById('search');
        var searchInput = document.getElementById('searchbox');
        if (!search) return;

        if (search.classList.contains('hide-search')) {
            search.classList.remove('hide-search');
            setSearchBarOpen(true);
            if (searchInput) {
                try {
                    searchInput.focus({ preventScroll: true });
                } catch (_) {
                    searchInput.focus();
                }
            }
        } else {
            search.classList.add('hide-search');
            setSearchBarOpen(false);
            if (searchInput) {
                searchInput.value = '';
            }
            liveSearch();
        }
    }

    window.toggleSearch = toggleSearch;
    window.liveSearch = liveSearch;
    window.clearMenuSearchFilters = clearMenuSearchFilters;

    document.addEventListener('menuReelsFlattened', function () {
        var searchInput = document.getElementById('searchbox');
        if (searchInput && searchInput.value.trim()) {
            liveSearch();
        }
    });

    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        var search = document.getElementById('search');
        if (!search || search.classList.contains('hide-search')) return;
        toggleSearch();
    });

    var searchRoot = document.getElementById('search');
    if (searchRoot && typeof MutationObserver !== 'undefined') {
        new MutationObserver(syncSearchBarOpenState).observe(searchRoot, {
            attributes: true,
            attributeFilter: ['class'],
        });
    }
    syncSearchBarOpenState();
})();
