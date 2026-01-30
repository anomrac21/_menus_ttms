// Global flag to prevent multiple simultaneous ad loading attempts
let isAdsLoading = false;
let adManagerCheckCount = 0;
let maxLoaderTimeout = null;

// CRITICAL: Ensure loader is visible immediately, even before DOMContentLoaded
// This runs as soon as the script is parsed
(function() {
    // Set up early loader timeout that starts immediately
    maxLoaderTimeout = setTimeout(() => {
        console.log('Emergency loader timeout - forcing hide');
        const loader = document.getElementById('loader');
        if (loader) {
            loader.style.opacity = '0';
            loader.style.pointerEvents = 'none';
            setTimeout(() => loader.style.display = 'none', 500);
        }
    }, 4000); // 4 second emergency timeout
})();

// Function to ensure ads are loaded with retry mechanism
function ensureAdsLoaded() {
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
                const adContainers = document.querySelectorAll('#homepage-ads-container, #frontpage-ads-container');
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
            const adContainers = document.querySelectorAll('#homepage-ads-container, #frontpage-ads-container');
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
    
    // Clear emergency timeout and set up proper one now that DOM is ready
    if (maxLoaderTimeout) {
        clearTimeout(maxLoaderTimeout);
    }
    
    // Maximum timeout to hide loader (fallback in case page takes too long)
    maxLoaderTimeout = setTimeout(() => {
        console.log('Maximum loader timeout reached, force hiding loader...');
        hideLoader();
    }, 4000); // 4 seconds maximum
    
    let animations = [  'loader-hide-up',
                        'loader-hide-up-right',
                        'loader-hide-right',
                        'loader-hide-down-right',
                        'loader-hide-down',
                        'loader-hide-down-left',
                        'loader-hide-left',
                        'loader-hide-up-left',
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
                        'loader-hide-up-rotate-scale',
                        'loader-hide-up-right-rotate-scale',
                        'loader-hide-right-rotate-scale',
                        'loader-hide-down-right-rotate-scale',
                        'loader-hide-down-rotate-scale',
                        'loader-hide-down-left-rotate-scale',
                        'loader-hide-left-rotate-scale',
                        'loader-hide-up-left-rotate-scale'];
    let randomAnim = '';
    
    function showLoader() {
        // Remove all animation classes
        animations.forEach(anim => {
            loader.classList.remove(anim);
        });
        // console.log("Show loader");
    }
    
    function hideLoader() {
        // Clear the maximum timeout since we're hiding the loader normally
        if (maxLoaderTimeout) {
            clearTimeout(maxLoaderTimeout);
            maxLoaderTimeout = null;
        }
        
        randomAnim = animations[Math.floor(Math.random() * animations.length)];
        loader.classList.add(randomAnim);
        // AOS removed - no longer needed
        document.getElementById("footerBtns").classList.add("visible");
        
        // Note: Ad loading is now handled by barba transitions for better control
        // Removed ensureAdsLoaded() call to prevent race conditions
        
        // console.log("hide loader");
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
        const adContainers = document.querySelectorAll('#homepage-ads-container, #frontpage-ads-container');
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
        transitions: [{
            name: 'fade',
            async leave(data) {
                localStorage.setItem("headerScroll", document.getElementById("menublock").scrollLeft);
                
                showLoader();
                await new Promise(resolve => setTimeout(resolve, 366));
            },
            async enter(data) {
                // Reset scroll position immediately to prevent spacing issues
                window.scrollTo(0, 0);
                document.documentElement.scrollTop = 0;
                document.body.scrollTop = 0;
                
                document.getElementById('menublock').scrollTo(12, 0);
                closeCart();
                closeShop();
                await new Promise(resolve => setTimeout(resolve, 366));
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
                if (savedScroll !== null) {
                    requestAnimationFrame(() => { // Ensures DOM is ready before applying scroll
                        document.getElementById("menublock").scrollLeft = savedScroll;
                    });
                }

                // Wait for DOM to settle, then load ads
                setTimeout(() => {
                    console.log('=== Barba enter: Post-navigation setup ===');
                    
                    // Check if ad containers exist
                    const containers = ['homepage-ads-container', 'frontpage-ads-container'];
                    const foundContainers = containers.filter(id => document.getElementById(id));
                    console.log('Ad containers found:', foundContainers);
                    
                    // AOS removed - no longer needed
                    
                    // Force ad reload after barba navigation with fresh state
                    console.log('Barba enter: Forcing ad reload');
                    console.log('window.adManager exists:', !!window.adManager);
                    
                    // Re-initialize ad manager (will handle container check and re-population)
                    if (typeof initAdManager === 'function') {
                        console.log('Re-initializing AdManager...');
                        initAdManager();
                    }
                    
                    // Also try with existing instance if available
                    if (window.adManager) {
                        console.log('Calling populateAds with forceRepopulate=true');
                        // Directly call populateAds with force flag
                        window.adManager.populateAds(true);
                        
                        // Also try again after a delay in case DOM wasn't fully ready
                        setTimeout(() => {
                            console.log('Secondary ad population attempt...');
                            if (window.adManager) {
                                window.adManager.populateAds(true);
                            }
                            
                            // Refresh scroll progress bars
                            setTimeout(() => {
                                if (window.adScrollProgressManager) {
                                    window.adScrollProgressManager.refresh();
                                }
                            }, 500);
                        }, 500);
                    } else {
                        console.log('AdManager not yet available, will be initialized by barba:after event');
                    }
                }, 300);
                
                // Reload opening hours functionality after page transition
                setTimeout(() => {
                    if (typeof initOpeninghoursDisplay === 'function') {
                        initOpeninghoursDisplay();
                    }
                    if (typeof getOpenSigns === 'function') {
                        getOpenSigns();
                    }
                    if (typeof reloadAppJS === 'function') {
                        reloadAppJS();
                    }
                }, 400);
            },
            async once(data) {
                await new Promise(resolve => setTimeout(resolve, 3000));
                hideLoader();
                
                // Ensure ads are loaded after initial page load
                setTimeout(() => ensureAdsLoaded(), 500);
                
                // Reload opening hours functionality after initial page load
                setTimeout(() => {
                    if (typeof initOpeninghoursDisplay === 'function') {
                        initOpeninghoursDisplay();
                    }
                    if (typeof getOpenSigns === 'function') {
                        getOpenSigns();
                    }
                    if (typeof reloadAppJS === 'function') {
                        reloadAppJS();
                    }
                }, 600);
            }
        }]
    });
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

const header = document.querySelector(".header"); // Adjust selector as needed

window.addEventListener("beforeunload", () => {
    localStorage.setItem("headerScroll", header.scrollLeft);
});

// Listen for page refresh/reload events
window.addEventListener('load', () => {
    console.log('Page load event fired, attempting to load ads...');
    // Try immediately first
    ensureAdsLoaded();
    // Then try again after a delay to ensure AdManager is initialized
    setTimeout(() => ensureAdsLoaded(), 2000);
});

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

// Also listen for when the AdManager becomes available
const checkAdManager = setInterval(() => {
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
    if (!document.hidden) {
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
