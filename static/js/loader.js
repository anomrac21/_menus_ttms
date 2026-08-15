// Global flag to prevent multiple simultaneous ad loading attempts
let isAdsLoading = false;
let adManagerCheckCount = 0;
let maxLoaderTimeout = null;
let globalLoaderKillTimeout = null;
let hideFinishTimer = null;
let hideForceTimer = null;
let loaderGeneration = 0;
let loaderHasHiddenOnce = false;
/** Minimum time loader stays visible so morph, chips, and logo pop can play. */
var LOADER_MIN_VISIBLE_MS = 4200;
var loaderShownAt = 0;

function forceHideLoaderElement(loader) {
    if (!loader) return;
    loader.classList.add('loader-force-hidden');
    loader.style.pointerEvents = 'none';
    loader.style.visibility = 'hidden';
    loader.style.opacity = '0';
    loader.style.display = 'none';
}

function clearLoaderHideTimers() {
    if (hideFinishTimer) {
        clearTimeout(hideFinishTimer);
        hideFinishTimer = null;
    }
    if (hideForceTimer) {
        clearTimeout(hideForceTimer);
        hideForceTimer = null;
    }
}

function syncMenuReelsDocumentMode() {
    var hasReels = !!document.getElementById('menu-reels-viewport');
    document.documentElement.classList.toggle('menu-reels-mode', hasReels);
    if (document.body) {
        document.body.classList.toggle('menu-reels-mode', hasReels);
    }
    if (!hasReels) return;
    if (document.querySelector('link[href*="menu-reels.css"]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = typeof window.ttmsAssetUrl === 'function' ? window.ttmsAssetUrl('/css/menu-reels.css') : '/css/menu-reels.css';
    document.head.appendChild(link);
}

function recoverStuckUiState() {
    if (typeof window.forceClearNavigationUiState === 'function') {
        window.forceClearNavigationUiState();
        return;
    }
    if (typeof window.closeAllPanelsBeforeNavigation === 'function') {
        window.closeAllPanelsBeforeNavigation();
    }
    if (window.TTMSViewport && typeof window.TTMSViewport.forceClearScrollLock === 'function') {
        window.TTMSViewport.forceClearScrollLock();
    }
}

// Fallback hide if Barba never initializes (very slow networks)
(function () {
    maxLoaderTimeout = setTimeout(function () {
        if (typeof window.hideLoader === 'function') {
            window.hideLoader();
        }
        forceHideLoaderElement(document.getElementById('loader'));
        recoverStuckUiState();
    }, 12000);
})();

// Function to ensure ads are loaded with retry mechanism
function ensureAdsLoaded() {
    // Reels homepage uses AdsClient, not client-ad-manager
    if (document.getElementById('pageadscontainer')) {
        if (typeof window.AdsClient !== 'undefined' && typeof window.AdsClient.loadAds === 'function') {
            window.AdsClient.loadAds();
        }
        return;
    }

    // Prevent multiple simultaneous attempts
    if (isAdsLoading) {
        console.log('Ads already loading, skipping...');
        return;
    }
    
    isAdsLoading = true;
    let retryCount = 0;
    const maxRetries = 5;
    
    const tryLoadAds = () => {
        console.log(`Attempt ${retryCount + 1}: Checking AdManager...`);
        console.log('window.adManager:', window.adManager);
        console.log('typeof window.adManager.populateAds:', typeof window.adManager?.populateAds);
        
        if (window.adManager && typeof window.adManager.populateAds === 'function') {
            console.log('AdManager found! Checking if ads need refreshing...');
            try {
                // Check if ads are actually visible in containers
                const adContainers = document.querySelectorAll('#homepage-ads-container, #pageadscontainer');
                let needsRefresh = false;
                
                adContainers.forEach(container => {
                    if (container && (container.innerHTML.includes('Loading ads...') || container.innerHTML.includes('Ads loading...') || container.innerHTML.trim() === '')) {
                        needsRefresh = true;
                        console.log(`Container ${container.id} needs refresh - current content:`, container.innerHTML.substring(0, 100));
                    }
                });
                
                if (needsRefresh || !window.adManager.hasPopulated) {
                    console.log('Ads need refreshing, calling populateAds...');
                    // Reset the flag to allow fresh population
                    if (window.adManager.hasPopulated) {
                        window.adManager.hasPopulated = false;
                        console.log('Reset hasPopulated flag for fresh ad population');
                    }
                    window.adManager.populateAds();
                    console.log('Ads refreshed successfully');
                } else {
                    console.log('Ads already populated and visible, skipping refresh...');
                }
                isAdsLoading = false;
            } catch (error) {
                console.error('Error calling populateAds:', error);
                isAdsLoading = false;
            }
        } else if (retryCount < maxRetries) {
            retryCount++;
            console.log(`AdManager not ready, retrying... (${retryCount}/${maxRetries})`);
            setTimeout(tryLoadAds, 1000); // Increased delay to 1 second
        } else {
            console.log('AdManager not available after maximum retries');
            console.log('Final check - window.adManager:', window.adManager);
            
            // Fallback: try to refresh any existing ads manually
            const adContainers = document.querySelectorAll('#homepage-ads-container, #pageadscontainer');
            adContainers.forEach(container => {
                if (container.innerHTML.includes('Loading ads...')) {
                    container.innerHTML = '<p>Ads loading...</p>';
                }
            });
            
            isAdsLoading = false;
        }
    };
    
    tryLoadAds();
}

document.addEventListener('DOMContentLoaded', function() {
    const loader = document.getElementById('loader');
    const loaderImage = document.getElementById('loaderImage');
    const menuImage = document.getElementById('menuImage');

    if (!loader) {
        return;
    }

    // Markup starts visible; start the min-visible clock immediately.
    if (!loaderShownAt) {
        loaderShownAt = Date.now();
    }

    var ANIM_SLIDE = [
        'loader-hide-up',
        'loader-hide-up-right',
        'loader-hide-right',
        'loader-hide-down-right',
        'loader-hide-down',
        'loader-hide-down-left',
        'loader-hide-left',
        'loader-hide-up-left',
    ];
    var ANIM_ROTATE = [
        'loader-hide-up-rotate-left',
        'loader-hide-up-right-rotate-left',
        'loader-hide-right-rotate-left',
        'loader-hide-down-right-rotate-left',
        'loader-hide-down-rotate-left',
        'loader-hide-down-left-rotate-left',
        'loader-hide-left-rotate-left',
        'loader-hide-up-left-rotate-left',
        'loader-hide-up-rotate-right',
        'loader-hide-up-right-rotate-right',
        'loader-hide-right-rotate-right',
        'loader-hide-down-right-rotate-right',
        'loader-hide-down-rotate-right',
        'loader-hide-down-left-rotate-right',
        'loader-hide-left-rotate-right',
        'loader-hide-up-left-rotate-right',
    ];
    var ANIM_SCALE = [
        'loader-hide-up-rotate-scale',
        'loader-hide-up-right-rotate-scale',
        'loader-hide-right-rotate-scale',
        'loader-hide-down-right-rotate-scale',
        'loader-hide-down-rotate-scale',
        'loader-hide-down-left-rotate-scale',
        'loader-hide-left-rotate-scale',
        'loader-hide-up-left-rotate-scale',
    ];
    var animations = ANIM_SLIDE.concat(ANIM_ROTATE, ANIM_SCALE);
    var morphTimer = null;

    function loaderTier() {
        var t =
            (loader && loader.getAttribute('data-tier')) ||
            (window.SiteConfig && window.SiteConfig.tier) ||
            window.SITE_TIER ||
            'free';
        return String(t).toLowerCase();
    }

    function loaderIsVerified() {
        if (loader && loader.getAttribute('data-verified') === 'true') return true;
        if (window.SiteConfig && window.SiteConfig.verified === true) return true;
        if (window.SITE_VERIFIED === true) return true;
        var t = loaderTier();
        return t !== 'free' && t !== '';
    }

    function animationsForTier(tier) {
        tier = String(tier || 'free').toLowerCase();
        if (tier === 'tier2') {
            return ANIM_SCALE.concat(ANIM_ROTATE);
        }
        if (tier === 'tier1' || tier === 'tier1_4mo') {
            return ANIM_ROTATE.concat(ANIM_SLIDE.slice(0, 4));
        }
        if (tier === 'free_verified') {
            return ANIM_SLIDE.concat(ANIM_ROTATE.slice(0, 6));
        }
        // free unverified — simple exits only
        return ANIM_SLIDE.slice();
    }

    function isLoaderHomePath(pathname) {
        var path = pathname || window.location.pathname || '/';
        try {
            path = String(path).split('?')[0].split('#')[0];
        } catch (e) { /* ignore */ }
        if (!path || path === '/') return true;
        // Trailing-slash home only
        return path.replace(/\/+$/, '') === '';
    }

    function loaderLocationCount() {
        var n = 0;
        if (loader) {
            n = parseInt(loader.getAttribute('data-location-count') || '0', 10) || 0;
        }
        if (!n && window.SiteConfig && window.SiteConfig.locationCount != null) {
            n = parseInt(window.SiteConfig.locationCount, 10) || 0;
        }
        if (!n && window.MENU_CONFIG && Array.isArray(window.MENU_CONFIG.locationSlugs)) {
            n = window.MENU_CONFIG.locationSlugs.length;
        }
        return n;
    }

    function updateLoaderLocationStatus() {
        var valueEl = document.getElementById('loaderLocationValue');
        var locRow = document.getElementById('loaderLocation');
        var labelEl =
            document.getElementById('loaderLocationLabelText') ||
            document.getElementById('loaderLocationLabel');
        if (!valueEl) return;

        var onHome = isLoaderHomePath();
        if (loader) {
            loader.setAttribute('data-home', onHome ? 'true' : 'false');
        }

        // Home: show location count only — never the selected address/name.
        if (onHome) {
            var count = loaderLocationCount();
            if (labelEl) labelEl.textContent = 'Locations';
            valueEl.textContent = count === 1 ? '1 location' : count + ' locations';
            if (locRow) locRow.classList.add('is-ready');
            return;
        }

        if (labelEl) labelEl.textContent = 'Location';
        var label = '';
        try {
            if (window.currentOrderLocation) {
                var cur = window.currentOrderLocation;
                label = cur.address || cur.name || cur.city || cur.slug || '';
            }
            if (!label) {
                label = localStorage.getItem('ttmenus_location_picker_address') || '';
            }
        } catch (e) { /* ignore */ }
        if (label) {
            valueEl.textContent = label;
            if (locRow) locRow.classList.add('is-ready');
        } else {
            valueEl.textContent = 'Selecting…';
            if (locRow) locRow.classList.remove('is-ready');
        }
    }

    var revealTimer = null;
    var featureRevealTimers = [];

    function clearFeatureRevealTimers() {
        featureRevealTimers.forEach(function (id) {
            clearTimeout(id);
        });
        featureRevealTimers = [];
        var chips = loader.querySelectorAll('.loader-feature.is-in');
        for (var i = 0; i < chips.length; i++) {
            chips[i].classList.remove('is-in');
        }
    }

    function clearLoaderMorph() {
        if (morphTimer) {
            clearTimeout(morphTimer);
            morphTimer = null;
        }
        if (revealTimer) {
            clearTimeout(revealTimer);
            revealTimer = null;
        }
        clearFeatureRevealTimers();
        loader.classList.remove('loader-morph', 'loader-ready');
        if (menuImage) menuImage.classList.remove('is-popping');
    }

    function staggerLoaderFeatures() {
        var chips = loader.querySelectorAll('.loader-features .loader-feature');
        var gapMs = 260;
        for (var i = 0; i < chips.length; i++) {
            (function (chip, index) {
                var id = setTimeout(function () {
                    chip.classList.add('is-in');
                }, index * gapMs);
                featureRevealTimers.push(id);
            })(chips[i], i);
        }
    }

    function startLoaderMorph() {
        clearLoaderMorph();
        // Location fanfare first, then each feature chip one-by-one.
        revealTimer = setTimeout(function () {
            loader.classList.add('loader-ready');
            var featuresDelay = setTimeout(staggerLoaderFeatures, 420);
            featureRevealTimers.push(featuresDelay);
        }, 480);
        if (!loaderIsVerified()) return;
        // Hold full TTMenus mark, then hand the stage to the client logo.
        morphTimer = setTimeout(function () {
            if (menuImage) {
                menuImage.classList.remove('is-popping');
                void menuImage.offsetWidth;
                menuImage.classList.add('is-popping');
            }
            loader.classList.add('loader-morph');
        }, 720);
    }

    if (typeof barba === 'undefined') {
        console.error('Barba.js not loaded. Hiding loader without transitions.');
        updateLoaderLocationStatus();
        startLoaderMorph();
        var noBarbaWait = loaderShownAt
            ? Math.max(0, LOADER_MIN_VISIBLE_MS - (Date.now() - loaderShownAt))
            : LOADER_MIN_VISIBLE_MS;
        setTimeout(function () {
            loader.classList.add('loader-hide-down');
            try {
                document.dispatchEvent(new CustomEvent('ttms:loader-hidden', { detail: { source: 'noBarba' } }));
            } catch (err) { /* ignore */ }
            var footerBtns = document.getElementById('footerBtns');
            if (footerBtns) footerBtns.classList.add('visible');
            setTimeout(function () {
                forceHideLoaderElement(loader);
            }, 820);
        }, noBarbaWait);
        return;
    }

    if (maxLoaderTimeout) {
        clearTimeout(maxLoaderTimeout);
    }

    let isHidingLoader = false;
    let randomAnim = '';

    function restartLoaderMedia(opts) {
        var playEnter = opts && opts.enter === true;
        if (loaderImage) {
            var base =
                loaderImage.getAttribute('data-loader-src') ||
                String(loaderImage.getAttribute('src') || '').split('?')[0];
            if (base) {
                loaderImage.setAttribute('data-loader-src', base);
                // Keep the current frame until the replay URL is assigned — never blank the src.
                loaderImage.src = base + (base.indexOf('?') >= 0 ? '&' : '?') + 'replay=' + Date.now();
            }
            loaderImage.style.display = 'block';
        }
        if (menuImage) {
            menuImage.classList.remove('is-popping');
            void menuImage.offsetWidth;
            menuImage.style.display = 'block';
        }
        var stage = document.getElementById('loaderBrandStage');
        if (playEnter && stage) {
            stage.classList.remove('is-entering');
            void stage.offsetWidth;
            stage.classList.add('is-entering');
        }
    }

    function resetLoaderVisible() {
        loaderGeneration += 1;
        clearLoaderHideTimers();
        isHidingLoader = false;
        animations.forEach(function (anim) {
            loader.classList.remove(anim);
        });
        clearLoaderMorph();
        restartLoaderMedia({ enter: true });
        loader.classList.remove('loader-force-hidden');
        loader.style.display = 'flex';
        loader.style.opacity = '';
        loader.style.visibility = '';
        loader.style.pointerEvents = '';
        updateLoaderLocationStatus();
        loaderShownAt = Date.now();
        startLoaderMorph();
    }

    function showLoader() {
        if (!loader) return;
        isHidingLoader = false;
        loaderHasHiddenOnce = false;
        resetLoaderVisible();
        scheduleLoaderFallback();
    }

    function msUntilMinVisible() {
        if (!loaderShownAt) return LOADER_MIN_VISIBLE_MS;
        var elapsed = Date.now() - loaderShownAt;
        return Math.max(0, LOADER_MIN_VISIBLE_MS - elapsed);
    }

    function finishHideLoader() {
        if (!loader) return;
        var gen = loaderGeneration;
        animations.forEach(function (anim) {
            loader.classList.remove(anim);
        });

        var pool = animationsForTier(loaderTier());
        randomAnim = pool[Math.floor(Math.random() * pool.length)];
        loader.classList.add(randomAnim);

        // Let hero chips show titles as soon as the loader starts exiting.
        try {
            document.dispatchEvent(new CustomEvent('ttms:loader-hidden', { detail: { source: 'finishHideLoader' } }));
        } catch (err) { /* ignore */ }

        // Android Chrome can keep a composited overlay that still blocks taps
        // even after opacity:0 — force display:none after the hide animation.
        hideForceTimer = setTimeout(function () {
            hideForceTimer = null;
            if (gen !== loaderGeneration) return;
            forceHideLoaderElement(loader);
            isHidingLoader = false;
        }, 820);

        const footerBtns = document.getElementById('footerBtns');
        if (footerBtns) {
            footerBtns.classList.add('visible');
        }
    }

    function hideLoader() {
        if (!loader) return;
        var alreadyGone = loader.classList.contains('loader-force-hidden');
        if (alreadyGone && !isHidingLoader) return;
        if (isHidingLoader) return;
        isHidingLoader = true;
        loaderHasHiddenOnce = true;

        if (maxLoaderTimeout) {
            clearTimeout(maxLoaderTimeout);
            maxLoaderTimeout = null;
        }
        if (globalLoaderKillTimeout) {
            clearTimeout(globalLoaderKillTimeout);
            globalLoaderKillTimeout = null;
        }

        var wait = msUntilMinVisible();
        if (wait > 0) {
            hideFinishTimer = setTimeout(function () {
                hideFinishTimer = null;
                finishHideLoader();
            }, wait);
        } else {
            finishHideLoader();
        }
    }

    window.showLoader = showLoader;
    window.hideLoader = hideLoader;
    window.allowLoaderHide = hideLoader;
    window.forceHideLoader = function () {
        loaderGeneration += 1;
        clearLoaderHideTimers();
        forceHideLoaderElement(loader || document.getElementById('loader'));
        recoverStuckUiState();
    };
    window.updateLoaderLocationStatus = updateLoaderLocationStatus;

    updateLoaderLocationStatus();
    startLoaderMorph();
    document.addEventListener('ttms:location-selected', function () {
        updateLoaderLocationStatus();
    });

    function scheduleLoaderFallback() {
        if (maxLoaderTimeout) {
            clearTimeout(maxLoaderTimeout);
        }
        maxLoaderTimeout = setTimeout(function () {
            console.log('Maximum loader timeout reached, force hiding loader...');
            hideLoader();
            forceHideLoaderElement(loader);
            recoverStuckUiState();
        }, 8000);

        if (globalLoaderKillTimeout) {
            clearTimeout(globalLoaderKillTimeout);
        }
        globalLoaderKillTimeout = setTimeout(function () {
            forceHideLoaderElement(loader || document.getElementById('loader'));
            recoverStuckUiState();
        }, 15000);
    }

    function waitMs(ms) {
        return new Promise(function (resolve) {
            setTimeout(resolve, ms);
        });
    }

    async function waitForInitialPageReady(isReelsHome) {
        // First paint already started the show; don't restart mid-sequence.

        if (isReelsHome) {
            var bootstrap = Promise.resolve();
            if (typeof window.waitForHomeMenuBootstrap === 'function') {
                bootstrap = window.waitForHomeMenuBootstrap().catch(function () {
                    return null;
                });
            } else {
                var viewport = document.getElementById('menu-reels-viewport');
                var apiUrl =
                    viewport &&
                    (viewport.getAttribute('data-home-menu-api') || '/api/menu-items.json');
                if (apiUrl) {
                    bootstrap = fetch(apiUrl, { credentials: 'same-origin' })
                        .then(function (r) {
                            return r.ok ? r.json() : null;
                        })
                        .catch(function () {
                            return null;
                        });
                }
            }

            await Promise.all([waitMs(LOADER_MIN_VISIBLE_MS), bootstrap]);
            return;
        }

        await Promise.all([
            Promise.race([
                new Promise(function (resolve) {
                    if (document.readyState === 'complete') resolve();
                    else window.addEventListener('load', resolve, { once: true });
                }),
                waitMs(1200),
            ]),
            waitMs(LOADER_MIN_VISIBLE_MS),
        ]);
    }

    function getAd() {
        randomAd = animations[Math.floor(Math.random() * animations.length)];
        if (loaderImage) {
            loaderImage.setAttribute('src', randomAd);
        }
        // console.log("get ad");
    }

    // Function to refresh ads using available ad manager
    function refreshAds() {
        // Try to use the AdManager if available
        if (window.adManager && typeof window.adManager.populateAds === 'function') {
            window.adManager.populateAds();
        }
        
        // Force a refresh of any ad containers
        const adContainers = document.querySelectorAll('#homepage-ads-container, #pageadscontainer');
        adContainers.forEach(container => {
            if (container.innerHTML.includes('Loading ads...') || container.innerHTML.includes('Ads loading...')) {
                console.log(`Container ${container.id} still shows loading text, triggering refresh...`);
                // If ads are still loading, trigger a refresh
                setTimeout(() => {
                    if (window.adManager && typeof window.adManager.populateAds === 'function') {
                        console.log(`Refreshing ads for container ${container.id}...`);
                        window.adManager.populateAds();
                    }
                }, 1000);
            }
        });
    }

    barba.init({
        cacheIgnore: true,
        prevent: function (ctx) {
            var el = ctx && ctx.el;
            var href = (ctx && ctx.href) || (el && el.getAttribute && el.getAttribute('href'));
            if (el && el.getAttribute && el.getAttribute('data-barba') === 'prevent') {
                return true;
            }
            if (typeof window.TTMSBarbaShouldPrevent === 'function') {
                return window.TTMSBarbaShouldPrevent(href, el);
            }
            // Fallback if barba-lifecycle has not loaded yet
            if (!href || href === '#' || href === '' || (typeof href === 'string' && href.charAt(0) === '#')) {
                return true;
            }
            if (el) {
                if (el.getAttribute('role') === 'button') return true;
                if (el.hasAttribute('data-dashboard-toggle')) return true;
            }
            return false;
        },
        transitions: [{
            name: 'fade',
            async leave(data) {
                scheduleLoaderFallback();
                const menublock = document.getElementById("menublock");
                if (menublock) {
                    localStorage.setItem("headerScroll", menublock.scrollLeft);
                }

                if (window.APP && APP.slideshow && typeof APP.slideshow.destroy === 'function') {
                    APP.slideshow.destroy();
                }
                if (typeof window.destroyLocationPicker === 'function') {
                    window.destroyLocationPicker();
                }
                if (typeof window.destroyMenuSmashPass === 'function') {
                    window.destroyMenuSmashPass();
                }
                if (typeof window.closeAllPanelsBeforeNavigation === 'function') {
                    window.closeAllPanelsBeforeNavigation();
                } else if (typeof window.ensureMenuReelsItemModalClosed === 'function') {
                    window.ensureMenuReelsItemModalClosed();
                }

                showLoader();
                await new Promise(resolve => setTimeout(resolve, 500));
            },
            async enter(data) {
                scheduleLoaderFallback();
                syncMenuReelsDocumentMode();
                // Reset scroll position immediately to prevent spacing issues
                window.scrollTo(0, 0);
                document.documentElement.scrollTop = 0;
                document.body.scrollTop = 0;
                
                const menublockEl = document.getElementById('menublock');
                if (menublockEl) {
                    menublockEl.scrollTo(0, 0);
                }
                if (typeof window.scheduleReinitHeaderMenublock === 'function') {
                    window.scheduleReinitHeaderMenublock('barba-enter');
                } else if (typeof window.reinitHeaderMenublock === 'function') {
                    window.reinitHeaderMenublock();
                } else if (typeof window.bindMenublockScroll === 'function') {
                    window.bindMenublockScroll();
                }
                if (typeof closeCart === 'function') {
                    closeCart();
                }
                if (typeof closeDashboard === 'function') {
                    closeDashboard();
                }
                if (typeof closeShop === 'function') {
                    closeShop();
                }
                if (typeof window.closeAllPanelsBeforeNavigation === 'function') {
                    window.closeAllPanelsBeforeNavigation();
                } else if (typeof window.ensureMenuReelsItemModalClosed === 'function') {
                    window.ensureMenuReelsItemModalClosed();
                }
                await waitMs(msUntilMinVisible());
                hideLoader();
                
                // Ensure main element padding is correct (reset any inherited styles)
                requestAnimationFrame(() => {
                    const mainElement = document.getElementById('main');
                    if (mainElement) {
                        mainElement.style.paddingTop = '';
                        mainElement.style.paddingBlockStart = '';
                        mainElement.style.marginTop = '';
                    }
                    
                    // Force scroll to top
                    window.scrollTo(0, 0);
                    document.documentElement.scrollTop = 0;
                    document.body.scrollTop = 0;
                });
                
                const savedScroll = localStorage.getItem("headerScroll");
                const restoreMenublockScroll =
                    savedScroll !== null &&
                    !(window.matchMedia && window.matchMedia('(max-width: 768px)').matches);
                if (restoreMenublockScroll) {
                    requestAnimationFrame(() => {
                        const menublock = document.getElementById("menublock");
                        if (menublock) {
                            menublock.scrollLeft = savedScroll;
                        }
                        if (typeof window.scheduleReinitHeaderMenublock === 'function') {
                            window.scheduleReinitHeaderMenublock('barba-enter-scroll');
                        } else if (typeof window.reinitHeaderMenublock === 'function') {
                            window.reinitHeaderMenublock();
                        } else if (typeof window.bindMenublockScroll === 'function') {
                            window.bindMenublockScroll();
                        }
                        if (typeof window.updateHeaderMenublockScroll === 'function') {
                            window.updateHeaderMenublockScroll();
                        }
                    });
                } else if (typeof window.scheduleReinitHeaderMenublock === 'function') {
                    window.scheduleReinitHeaderMenublock('barba-enter-fallback');
                } else if (typeof window.reinitHeaderMenublock === 'function') {
                    window.reinitHeaderMenublock();
                } else if (typeof window.bindMenublockScroll === 'function') {
                    window.bindMenublockScroll();
                }

                // Wait for DOM to settle, then load ads
                setTimeout(() => {
                    console.log('=== Barba enter: Post-navigation setup ===');
                    
                    // Check if ad containers exist
                    const containers = ['homepage-ads-container', 'pageadscontainer'];
                    const foundContainers = containers.filter(id => document.getElementById(id));
                    console.log('Ad containers found:', foundContainers);

                    // Reels frontpage ads (pageadscontainer) — same as ttms_app
                    setTimeout(() => {
                        if (typeof window.AdsClient !== 'undefined' && typeof window.AdsClient.loadAds === 'function') {
                            window.AdsClient.loadAds();
                        } else if (typeof window.loadClientPageAds === 'function' && document.getElementById('pageadscontainer')) {
                            window.loadClientPageAds();
                        }
                    }, 500);

                    // Homepage ad manager (only when pageadscontainer is absent)
                    if (!document.getElementById('pageadscontainer')) {
                        if (typeof initAdManager === 'function') {
                            initAdManager();
                        }
                        if (window.adManager && typeof window.adManager.populateAds === 'function') {
                            window.adManager.populateAds(true);
                        }
                    }

                    if (window.TTMSBarba && typeof window.TTMSBarba.runNow === 'function') {
                        window.TTMSBarba.runNow('barba-enter');
                    }

                    setTimeout(function () {
                        if (typeof window.initLocationPicker === 'function') {
                            window.initLocationPicker();
                        }
                    }, 350);
                }, 300);
            },
            async once(data) {
                var isReelsHome = !!document.getElementById('menu-reels-viewport');
                scheduleLoaderFallback();
                syncMenuReelsDocumentMode();

                // Reels home defers video ads until the sponsored slide is near viewport
                if (!isReelsHome) {
                    setTimeout(() => {
                        if (document.getElementById('pageadscontainer')) {
                            if (typeof window.AdsClient !== 'undefined' && typeof window.AdsClient.loadAds === 'function') {
                                window.AdsClient.loadAds();
                            }
                        }
                    }, 300);
                }

                await waitForInitialPageReady(isReelsHome);
                hideLoader();
                
                setTimeout(() => {
                    if (!document.getElementById('pageadscontainer')) {
                        ensureAdsLoaded();
                    }
                }, 500);
                
                // Reload opening hours functionality after initial page load
                setTimeout(() => {
                    if (typeof reloadAppJS === 'function') {
                        reloadAppJS();
                    }
                    if (typeof reinitOpeningHours === 'function') {
                        reinitOpeningHours();
                    } else {
                        if (typeof initOpeninghoursDisplay === 'function') {
                            initOpeninghoursDisplay();
                        }
                        if (typeof getOpenSigns === 'function') {
                            getOpenSigns();
                        }
                    }
                    if (window.TTMSBarba && typeof window.TTMSBarba.runNow === 'function') {
                        window.TTMSBarba.runNow('barba-once');
                    }
                }, 600);
            }
        }]
    });

    if (window.barba && window.barba.hooks && typeof window.barba.hooks.before === 'function') {
        window.barba.hooks.before(function () {
            if (typeof window.closeAllPanelsBeforeNavigation === 'function') {
                window.closeAllPanelsBeforeNavigation();
            } else if (typeof window.ensureMenuReelsItemModalClosed === 'function') {
                window.ensureMenuReelsItemModalClosed();
            }
        });
    }
});

// Function to load content dynamically
function lazyLoadContent(container) {
    container.querySelectorAll("[data-lazy-load]").forEach(async (element) => {
        const url = element.getAttribute("data-barba");
        if (!url) return;

        try {
            const response = await fetch(url);
            const content = await response.text();
            element.innerHTML = content; // Insert the loaded content
        } catch (error) {
            console.error("Failed to load content:", error);
        }
    });
}

const header = document.querySelector(".header") || document.getElementById("menublock");

window.addEventListener("beforeunload", () => {
    if (header) {
        localStorage.setItem("headerScroll", header.scrollLeft);
    }
});

// Listen for page refresh/reload events
window.addEventListener('load', () => {
    if (!shouldUseAdManager()) return;
    console.log('Page load event fired, attempting to load ads...');
    ensureAdsLoaded();
    setTimeout(() => ensureAdsLoaded(), 2000);
});

function shouldUseAdManager() {
    return !document.getElementById('pageadscontainer');
}

// Also try to load ads as soon as possible
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('DOMContentLoaded fired, checking ads...');
        setTimeout(() => ensureAdsLoaded(), 1000);
    });
} else {
    // DOM is already loaded
    console.log('DOM already loaded, checking ads immediately...');
    setTimeout(() => ensureAdsLoaded(), 500);
}

// Also listen for when the AdManager becomes available (homepage only)
const checkAdManager = setInterval(() => {
    if (!shouldUseAdManager()) {
        clearInterval(checkAdManager);
        return;
    }

    adManagerCheckCount++;
    
    if (window.adManager && typeof window.adManager.populateAds === 'function') {
        clearInterval(checkAdManager);
        console.log('AdManager detected via interval check, refreshing ads...');
        ensureAdsLoaded();
    }
    
    // Stop checking after 20 attempts (10 seconds)
    if (adManagerCheckCount >= 20) {
        clearInterval(checkAdManager);
        console.log('AdManager check interval cleared after 20 attempts');
        
        if (!window.adManager) {
            console.error('AdManager never became available. Please check the console for AdManager initialization messages.');
        }
    }
}, 500);

// Additional check: try to refresh ads when the page becomes visible
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && shouldUseAdManager()) {
        console.log('Page became visible, checking ads...');
        setTimeout(() => ensureAdsLoaded(), 500);
    }
});

// Listen for the custom event when AdManager is ready
window.addEventListener('adManagerReady', (event) => {
    console.log('AdManager ready event received:', event.detail);
    if (event.detail && typeof event.detail.populateAds === 'function') {
        console.log('AdManager is ready via event, refreshing ads...');
        setTimeout(() => ensureAdsLoaded(), 100);
    }
});
