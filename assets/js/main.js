/**
 * TTMenus v2 - Basic UI Interactions
 * Essential JavaScript for theme functionality
 */

(function() {
    'use strict';

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        hideAllPanels();
        initializeFooter();
        initializeModals();
        initializeMenu();
        initializeFooterVisibility();
        // Packery removed - no initialization needed
    }

    /**
     * Hide all panels by default on page load
     */
    function hideAllPanels() {
        // Hide cart
        const cart = document.getElementById('cart');
        if (cart) {
            cart.classList.add('cart-hidden');
        }

        // Hide search
        const search = document.getElementById('search');
        if (search) {
            search.classList.add('hide-search');
        }

        // Hide settings/accessibility panel
        const settings = document.getElementById('footerSettings');
        if (settings) {
            settings.classList.add('hide');
        }

        // Hide TTMS modal
        const ttms = document.getElementById('ttmenusModal');
        if (ttms) {
            ttms.classList.add('cart-hidden');
        }

        // Hide order modal
        // Order modal removed - no longer needed

        // Hide dashboard
        const dashboard = document.getElementById('dashboard');
        if (dashboard) {
            dashboard.classList.add('loader-hide-left');
        }

        // Ensure body is not in modal-open state
        document.body.classList.remove('modal-open');
    }

    // ============================================
    // FOOTER INTERACTIONS
    // ============================================

    /**
     * Initialize footer visibility and interactions
     */
    function initializeFooter() {
        const footerBtns = document.getElementById('footerBtns');
        if (footerBtns) {
            // Show footer buttons after page load
            setTimeout(() => {
                footerBtns.classList.add('visible');
            }, 300);
        }
    }

    /**
     * Toggle cart visibility
     * @global
     */
    function toggleCart() {
        const cart = document.getElementById('cart');
        const footerBtns = document.getElementById('footerBtns');
        
        if (!cart || !footerBtns) return;

        if (cart.classList.contains('cart-hidden')) {
            cart.classList.remove('cart-hidden');
            footerBtns.classList.add('bigfont');
            footerBtns.classList.add('cartopen');
            footerBtns.classList.remove('smallfont');
            footerBtns.classList.add('grad1');
            footerBtns.classList.remove('grad2');
        } else {
            closeCart();
        }
    }

    /**
     * Close cart
     * @global
     */
    function closeCart() {
        const cart = document.getElementById('cart');
        const footerBtns = document.getElementById('footerBtns');
        
        if (!cart || !footerBtns) return;

        cart.classList.add('cart-hidden');
        footerBtns.classList.remove('cartopen');
        footerBtns.classList.add('grad2');
        footerBtns.classList.remove('grad1');
        footerBtns.classList.remove('bigfont');
        footerBtns.classList.add('smallfont');
    }

    /**
     * Toggle search visibility
     * @global
     */
    function toggleSearch() {
        const search = document.getElementById('search');
        
        if (!search) return;

        if (search.classList.contains('hide-search')) {
            search.classList.remove('hide-search');
        } else {
            search.classList.add('hide-search');
        }
    }

    /**
     * Toggle footer accessibility/settings panel
     * @global
     */
    function toggleFooterAccessibility() {
        const settings = document.getElementById('footerSettings');
        const footerBtns = document.getElementById('footerBtns');
        
        if (!settings || !footerBtns) return;

        if (settings.classList.contains('hide')) {
            settings.classList.remove('hide');
            footerBtns.classList.add('bigfont');
            footerBtns.classList.remove('smallfont');
            footerBtns.classList.add('grad1');
            footerBtns.classList.remove('grad2');
        } else {
            settings.classList.add('hide');
            footerBtns.classList.add('grad2');
            footerBtns.classList.remove('grad1');
            footerBtns.classList.remove('bigfont');
            footerBtns.classList.add('smallfont');
        }
    }

    /**
     * Toggle TTMS modal
     * @global
     */
    function toggleTTMS() {
        const ttms = document.getElementById('ttmenusModal');
        const footerBtns = document.getElementById('footerBtns');
        
        if (!ttms || !footerBtns) return;

        if (ttms.classList.contains('cart-hidden')) {
            ttms.classList.remove('cart-hidden');
            footerBtns.classList.add('bigfont');
            footerBtns.classList.remove('smallfont');
            footerBtns.classList.add('grad1');
            footerBtns.classList.remove('grad2');
        } else {
            closeTTMS();
        }
    }

    /**
     * Close TTMS modal
     * @global
     */
    function closeTTMS() {
        const ttms = document.getElementById('ttmenusModal');
        const footerBtns = document.getElementById('footerBtns');
        
        if (!ttms || !footerBtns) return;

        ttms.classList.add('cart-hidden');
        footerBtns.classList.add('grad2');
        footerBtns.classList.remove('grad1');
        footerBtns.classList.remove('bigfont');
        footerBtns.classList.add('smallfont');
    }

    /**
     * Hide footer when promotions/ads are visible in viewport
     */
    function initializeFooterVisibility() {
        const footer = document.getElementById('footer');
        if (!footer) return;

        let observer = null;
        let scrollTimeout = null;
        let isAdVisible = false;

        function checkAdVisibility() {
            // Selectors for all promotion/ad containers
            const adSelectors = [
                '#homepage-ads-container',
                '#client-ads-container',
                '#frontpage-ads-container',
                '.frontpageads'
            ];

            // Collect all ad/promotion elements
            const adElements = [];
            adSelectors.forEach(selector => {
                const elements = document.querySelectorAll(selector);
                elements.forEach(el => {
                    // Only include if element has visible content (not empty or loading)
                    const hasContent = el.children.length > 0 && 
                                     !el.textContent.includes('Loading') &&
                                     !el.textContent.includes('Loading promotions') &&
                                     el.offsetHeight > 0 &&
                                     el.offsetWidth > 0;
                    if (hasContent) {
                        adElements.push(el);
                    }
                });
            });

            // Check if any ad is visible in viewport
            let hasVisibleAd = false;
            adElements.forEach(el => {
                const rect = el.getBoundingClientRect();
                const isInViewport = rect.top < window.innerHeight && rect.bottom > 0;
                if (isInViewport && el.offsetHeight > 0 && el.offsetWidth > 0) {
                    hasVisibleAd = true;
                }
            });

            // Update footer visibility
            if (hasVisibleAd !== isAdVisible) {
                isAdVisible = hasVisibleAd;
                if (isAdVisible) {
                    footer.style.display = 'none';
                } else {
                    footer.style.display = '';
                }
            }

            // Re-setup observer if elements changed
            if (observer && adElements.length > 0) {
                adElements.forEach(el => {
                    try {
                        observer.observe(el);
                    } catch (e) {
                        // Element already observed
                    }
                });
            }
        }

        // Create Intersection Observer to detect when ads are in viewport
        const observerOptions = {
            root: null, // viewport
            rootMargin: '0px',
            threshold: 0.1 // Trigger when 10% of element is visible
        };

        observer = new IntersectionObserver((entries) => {
            checkAdVisibility();
        }, observerOptions);

        // Initial check
        checkAdVisibility();

        // Check on scroll for better performance
        window.addEventListener('scroll', () => {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(checkAdVisibility, 100);
        }, { passive: true });

        // Re-check when ads are loaded dynamically
        window.addEventListener('adsPopulated', () => {
            setTimeout(checkAdVisibility, 500);
        });

        // Re-check periodically for dynamically loaded content
        setInterval(checkAdVisibility, 2000);
    }

    // ============================================
    // MODAL INTERACTIONS
    // ============================================

    /**
     * Initialize modal interactions
     */
    function initializeModals() {
        // Close modals with ESC key (cart and TTMS only, order modal removed)
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeCart();
                closeTTMS();
            }
        });
    }

    /**
     * Close shop/order modal (deprecated - modal removed)
     * @global
     */
    function closeShop() {
        // Modal has been removed - function kept for backward compatibility
        console.log('closeShop called but modal is no longer used');
    }

    /**
     * Track menu item card click
     * @param {HTMLElement} element - The menu item card element
     * @param {string} url - Item URL
     */
    function trackMenuItemCardClick(element, url) {
        const itemName = element.querySelector('.menu-item-title')?.textContent?.trim() || 
                        element.querySelector('.menu-item-title a')?.textContent?.trim() || '';
        const itemPrice = element.querySelector('.menu-item-price')?.textContent?.trim() || '';
        
        // Store in session for tracking
        if (typeof sessionStorage !== 'undefined') {
            const clickData = {
                url: url,
                name: itemName,
                price: itemPrice,
                timestamp: new Date().toISOString(),
                action: 'card_click'
            };
            sessionStorage.setItem('lastMenuItemClick', JSON.stringify(clickData));
        }
        
        // Optional: Send to analytics
        if (typeof gtag !== 'undefined') {
            gtag('event', 'menu_item_card_click', {
                'item_name': itemName,
                'item_url': url,
                'item_price': itemPrice
            });
        }
        
        console.log('📊 Tracked menu item card click:', { itemName, url, price: itemPrice });
    }

    /**
     * Toggle item expansion (inline expansion instead of modal)
     * @global
     * @param {HTMLElement} element - The menu item card element
     * @param {string} url - Item URL
     * @param {Event} event - The click event (optional)
     */
    function toggleItemExpansion(element, url, event) {
        if (!element) {
            console.warn('Invalid element for toggleItemExpansion');
            return;
        }

        const isExpanded = element.classList.contains('expanded') || element.getAttribute('data-item-expanded') === 'true';

        // If event is provided, check if click was on an interactive element
        if (event) {
            const target = event.target;
            const isDragHandle = target.closest('.drag-handle');
            const isImageLink = target.closest('.menu-item-image-link');
            const isTitleLink = target.closest('.menu-item-title a');
            const isExpandedInteractive = target.closest('.expanded-item-controls a, .expanded-item-controls button, .btn-quantity, .expanded-add-cart');
            
            // If clicking on drag handle, don't expand - let drag handle handle it
            if (isDragHandle) {
                event.preventDefault();
                event.stopPropagation();
                return; // Don't expand, let drag handle work
            }
            
            // When expanded: allow image and title links to work normally
            if (isExpanded && (isImageLink || isTitleLink)) {
                // Let the link handle its own click - navigate to page
                return;
            }
            // When expanded: allow buttons in expanded content to work
            if (isExpanded && isExpandedInteractive) {
                // Let the button handle its own click
                return;
            }
            // When NOT expanded: prevent image and title links from navigating, just expand
            if (!isExpanded && (isImageLink || isTitleLink)) {
                event.preventDefault();
                event.stopPropagation();
                // Track the click
                trackMenuItemCardClick(element, url);
                // Continue to expansion logic below
            }
            // When NOT expanded and clicking on card background: track and expand
            else if (!isExpanded && !isImageLink && !isTitleLink && !isExpandedInteractive) {
                trackMenuItemCardClick(element, url);
                // Continue to expansion logic below
            }
        } else if (!isExpanded) {
            // If no event but not expanded, track anyway
            trackMenuItemCardClick(element, url);
        }

        const itemUrl = element?.dataset?.itemUrl || url;
        if (!itemUrl) {
            console.warn('No URL found for item');
            return;
        }
        const expandedContent = element.querySelector('.menu-item-expanded-content');
        
        if (!expandedContent) {
            console.warn('Expanded content container not found');
            return;
        }

        // If already expanded, collapse it
        // (Interactive elements were already handled above with early returns)
        if (isExpanded) {
            collapseItem(element);
            return;
        }

        // If we reach here, the card is NOT expanded and should be expanded
        // Collapse any other expanded items first
        const allCards = document.querySelectorAll('.menu-item-card[data-item-expanded="true"]');
        allCards.forEach(card => {
            if (card !== element) {
                collapseItem(card);
            }
        });

        // Expand this item
        expandItem(element, itemUrl);
    }

    /**
     * Expand a menu item card
     * @param {HTMLElement} element - The menu item card
     * @param {string} url - Item URL
     */
    async function expandItem(element, url) {
        const expandedContent = element.querySelector('.menu-item-expanded-content');
        const loadingDiv = expandedContent.querySelector('.menu-item-expanded-loading');
        const dataDiv = expandedContent.querySelector('.menu-item-expanded-data');
        
        if (!expandedContent || !loadingDiv || !dataDiv) return;

        // Show loading state
        expandedContent.style.display = 'block';
        loadingDiv.style.display = 'block';
        dataDiv.style.display = 'none';
        element.setAttribute('data-item-expanded', 'true');
        element.classList.add('expanded');

        try {
            // Use existing openItem function to get item data, but render inline
            if (typeof window.openItem === 'function' && window.openItem.length >= 2) {
                // Try to fetch JSON data first
                let itemData = null;
                let sizes = [];
                let flavours = [];
                let pricesArray = []; // Array of [size, flavour, price] tuples
                let sideCategories = []; // Array of side category objects
                let additions = []; // Array of [name, price] tuples
                let imagesArray = []; // Array of image paths
                
                try {
                    // Hugo serves JSON at /path/index.json
                    let jsonResponse = await fetch(url + '/index.json');
                    if (!jsonResponse.ok) {
                        // Fallback to .json format
                        jsonResponse = await fetch(url + '.json');
                    }
                    if (jsonResponse.ok) {
                        itemData = await jsonResponse.json();
                        console.log('📊 Full itemData loaded:', itemData);
                        if (itemData.sizes) {
                            sizes = itemData.sizes.filter(s => s && s !== '-' && s !== 'None');
                        }
                        if (itemData.flavours) {
                            flavours = itemData.flavours.filter(f => f && f !== '-' && f !== 'None');
                        }
                        // Build prices array from items (format: [size, flavour, price, size, flavour, price, ...])
                        if (itemData.items && Array.isArray(itemData.items)) {
                            pricesArray = itemData.items;
                            console.log('📊 Loaded prices array from JSON:', pricesArray);
                        }
                        // Get side categories
                        if (itemData.side_categories && Array.isArray(itemData.side_categories)) {
                            sideCategories = itemData.side_categories;
                            console.log('📊 Loaded side categories from JSON:', sideCategories);
                            console.log('📊 Side categories count:', sideCategories.length);
                            if (sideCategories.length > 0) {
                                console.log('📊 First category:', sideCategories[0]);
                                console.log('📊 First category items:', sideCategories[0].items);
                            }
                        } else {
                            console.log('⚠️ No side_categories found in JSON or not an array');
                            console.log('⚠️ itemData keys:', Object.keys(itemData || {}));
                            console.log('⚠️ itemData.side_categories:', itemData?.side_categories);
                        }
                        // Get additions
                        if (itemData.additions && Array.isArray(itemData.additions)) {
                            additions = itemData.additions;
                            console.log('📊 Loaded additions from JSON:', additions);
                        }
                        // Get images
                        if (itemData.images && Array.isArray(itemData.images)) {
                            imagesArray = itemData.images;
                            console.log('📊 Loaded images from JSON:', imagesArray);
                        }
                    }
                } catch (jsonError) {
                    console.log('JSON fetch failed, falling back to HTML:', jsonError);
                }
                
                // Fallback: Get data from card's data attributes if JSON failed
                if (!itemData || Object.keys(itemData).length === 0) {
                    const pricesArrayStr = element.getAttribute('data-prices-array');
                    if (pricesArrayStr) {
                        try {
                            pricesArray = JSON.parse(pricesArrayStr);
                            console.log('📊 Loaded prices array from data attribute:', pricesArray);
                        } catch (e) {
                            console.log('⚠️ Failed to parse data-prices-array:', e);
                        }
                    }
                    
                    const sideCategoriesStr = element.getAttribute('data-side-categories');
                    if (sideCategoriesStr) {
                        try {
                            sideCategories = JSON.parse(sideCategoriesStr);
                            console.log('📊 Loaded side categories from data attribute:', sideCategories);
                        } catch (e) {
                            console.log('⚠️ Failed to parse data-side-categories:', e);
                        }
                    }
                    
                    const additionsStr = element.getAttribute('data-additions');
                    if (additionsStr) {
                        try {
                            additions = JSON.parse(additionsStr);
                            console.log('📊 Loaded additions from data attribute:', additions);
                        } catch (e) {
                            console.log('⚠️ Failed to parse data-additions:', e);
                        }
                    }
                    
                    const imagesArrayStr = element.getAttribute('data-images-array');
                    if (imagesArrayStr) {
                        try {
                            imagesArray = JSON.parse(imagesArrayStr);
                            console.log('📊 Loaded images from data attribute:', imagesArray);
                        } catch (e) {
                            console.log('⚠️ Failed to parse data-images-array:', e);
                        }
                    }
                }
                
                // If JSON didn't provide sizes/flavours, try extracting from card element
                if (sizes.length === 0 && flavours.length === 0) {
                    const sizesList = element.querySelector('.menu-item-options .sizes');
                    const flavoursList = element.querySelector('.menu-item-options .flavours');
                    
                    if (sizesList && sizesList.children.length > 0) {
                        sizes = Array.from(sizesList.querySelectorAll('li')).map(li => li.textContent.trim()).filter(s => s && s !== '-' && s !== 'None');
                    }
                    
                    if (flavoursList && flavoursList.children.length > 0) {
                        flavours = Array.from(flavoursList.querySelectorAll('li')).map(li => li.textContent.trim()).filter(f => f && f !== '-' && f !== 'None');
                    }
                }
                
                // Fetch HTML for description
                const response = await fetch(url + '?format=json').catch(() => fetch(url));
                const html = await response.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                
                // Try to get item data from the page
                const itemName = element.querySelector('.menu-item-title')?.textContent || '';
                // Get description from card (summary) - try both with and without p tag
                const itemDescCard = element.querySelector('.menu-item-description')?.textContent?.trim() || 
                                     element.querySelector('.menu-item-description p')?.textContent?.trim() || '';
                
                // Try to get full description from fetched page or JSON
                const fullDescElement = doc.querySelector('.single-page-description');
                const itemDesc = (itemData && itemData.content) ? itemData.content.trim() : 
                                (fullDescElement ? fullDescElement.innerHTML.trim() : itemDescCard);
                
                const itemPriceText = element.querySelector('.menu-item-price')?.textContent || '';
                
                // Extract base price from card
                const priceMatch = itemPriceText.match(/\$?([\d.]+)/);
                const basePrice = priceMatch ? parseFloat(priceMatch[1]) : 0;
                
                // If prices array is empty but we have flavours, build prices array
                // Each flavour gets the same base price with size "-"
                if (pricesArray.length === 0 && flavours.length > 0 && basePrice > 0) {
                    flavours.forEach(flavour => {
                        pricesArray.push('-', flavour, basePrice);
                    });
                    console.log('📊 Built prices array from flavours:', pricesArray);
                }
                // If we have sizes but no flavours, build prices array
                if (pricesArray.length === 0 && sizes.length > 0 && basePrice > 0) {
                    sizes.forEach(size => {
                        pricesArray.push(size, '-', basePrice);
                    });
                    console.log('📊 Built prices array from sizes:', pricesArray);
                }
                // If we have both sizes and flavours but no prices array, build it
                if (pricesArray.length === 0 && sizes.length > 0 && flavours.length > 0 && basePrice > 0) {
                    sizes.forEach(size => {
                        flavours.forEach(flavour => {
                            pricesArray.push(size, flavour, basePrice);
                        });
                    });
                    console.log('📊 Built prices array from sizes and flavours:', pricesArray);
                }
                // If still empty but we have a base price, add a default entry
                if (pricesArray.length === 0 && basePrice > 0) {
                    pricesArray.push('-', '-', basePrice);
                    console.log('📊 Built default prices array:', pricesArray);
                }
                
                // Extract numeric price - use first available price as default
                let unitPrice = 0;
                if (pricesArray.length >= 3) {
                    // Find first valid price
                    for (let i = 2; i < pricesArray.length; i += 3) {
                        const price = parseFloat(pricesArray[i]);
                        if (!isNaN(price) && price > 0) {
                            unitPrice = price;
                            break;
                        }
                    }
                }
                if (unitPrice === 0) {
                    unitPrice = basePrice;
                }
                
                const initialQuantity = 1;
                const initialTotal = unitPrice * initialQuantity;
                
                // Determine default selected size and flavour
                const defaultSize = sizes.length > 0 ? sizes[0] : '-';
                const defaultFlavour = flavours.length > 0 ? flavours[0] : '-';
                
                // Build sizes and flavours HTML with click handlers
                let sizesHTML = '';
                let flavoursHTML = '';
                
                if (sizes.length > 0) {
                    sizesHTML = `
                        <ul class="sizes">
                            ${sizes.map((size, index) => `
                                <li class="expanded-option ${index === 0 ? 'selected' : ''}" 
                                    data-option-type="size" 
                                    data-option-value="${size}"
                                    onclick="selectExpandedOption(this, '${url}', event)">${size}</li>
                            `).join('')}
                        </ul>
                    `;
                }
                
                if (flavours.length > 0) {
                    flavoursHTML = `
                        <ul class="flavours">
                            ${flavours.map((flavour, index) => `
                                <li class="expanded-option ${index === 0 ? 'selected' : ''}" 
                                    data-option-type="flavour" 
                                    data-option-value="${flavour}"
                                    onclick="selectExpandedOption(this, '${url}', event)">${flavour}</li>
                            `).join('')}
                        </ul>
                    `;
                }
                
                // Build side categories HTML
                let sideCategoriesHTML = '';
                console.log('🔧 Building side categories HTML, count:', sideCategories.length);
                if (sideCategories && sideCategories.length > 0) {
                    sideCategories.forEach((category, catIndex) => {
                        const categoryName = category.category_name || `category_${catIndex}`;
                        const displayName = category.display_name || 'Choose Options';
                        const rawItems = category.items || [];
                        const configArray = category.config || [];
                        
                        console.log(`🔧 Processing category ${catIndex}: ${categoryName}, items:`, rawItems);
                        
                        // Convert config array to object
                        const config = {
                            all_max: configArray[0] || 0,
                            regular_max: configArray[3] || 0,
                            premium_max: configArray[6] || 0
                        };
                        
                        // Build items HTML
                        let itemsHTML = '';
                        if (rawItems && rawItems.length > 0) {
                            // Items come as flat array [name, type, price, name, type, price, ...]
                            for (let i = 0; i < rawItems.length; i += 3) {
                                if (i + 2 < rawItems.length) {
                                    const name = rawItems[i];
                                    const type = rawItems[i + 1];
                                    const price = parseFloat(rawItems[i + 2]) || 0;
                                    const priceDisplay = price > 0 ? ` (+$${price})` : '';
                                    const cssClass = type === 'Premium' ? 'premiumside' : 'regularside';
                                    const starIcon = type === 'Premium' ? ' <i class="fa fa-star"></i>' : '';
                                    
                                    itemsHTML += `
                                        <li class="expanded-side-option ${cssClass}" 
                                            data-category="${categoryName}"
                                            data-item-name="${name}"
                                            data-item-type="${type}"
                                            data-item-price="${price}"
                                            onclick="selectExpandedSide(this, '${url}', event)">
                                            ${name}${starIcon}${priceDisplay}
                                        </li>
                                    `;
                                }
                            }
                        }
                        
                        if (itemsHTML) {
                            sideCategoriesHTML += `
                                <div class="expanded-side-category" data-category-name="${categoryName}">
                                    <h4 class="expanded-side-category-title">${displayName}</h4>
                                    <ul class="expanded-side-items">
                                        ${itemsHTML}
                                    </ul>
                                </div>
                            `;
                        }
                    });
                    console.log('✅ Built side categories HTML:', sideCategoriesHTML ? 'Yes' : 'No');
                } else {
                    console.log('⚠️ No side categories to display');
                }
                
                // Build additions HTML
                let additionsHTML = '';
                if (additions && additions.length > 0) {
                    additionsHTML = `
                        <div class="expanded-additions">
                            <h4 class="expanded-additions-title">Additions</h4>
                            <ul class="expanded-addition-items">
                                ${additions.map((addition, index) => {
                                    if (index % 2 === 0 && index + 1 < additions.length) {
                                        const name = additions[index];
                                        const price = parseFloat(additions[index + 1]) || 0;
                                        return `
                                            <li class="expanded-addition-option" 
                                                data-addition-name="${name}" 
                                                data-addition-price="${price}"
                                                onclick="selectExpandedAddition(this, '${url}', event)">
                                                ${name} <span class="addition-price">+$${price.toFixed(2).replace(/\.00$/, '')}</span>
                                            </li>
                                        `;
                                    }
                                    return '';
                                }).filter(html => html).join('')}
                            </ul>
                        </div>
                    `;
                }
                
                // Store prices array, side categories, additions, and default selections in data attributes
                element.setAttribute('data-prices-array', JSON.stringify(pricesArray));
                element.setAttribute('data-selected-size', defaultSize);
                element.setAttribute('data-selected-flavour', defaultFlavour);
                element.setAttribute('data-side-categories', JSON.stringify(sideCategories));
                element.setAttribute('data-additions', JSON.stringify(additions));
                element.setAttribute('data-images-array', JSON.stringify(imagesArray));
                
                // Build image carousel HTML if images exist (even for single image)
                let imageCarouselHTML = '';
                if (imagesArray && imagesArray.length > 0) {
                    const itemName = element.querySelector('.menu-item-title')?.textContent?.trim() || '';
                    const showNavButtons = imagesArray.length > 1;
                    const showIndicators = imagesArray.length > 1;
                    imageCarouselHTML = `
                        <div class="expanded-image-carousel" data-current-image="0">
                            <div class="expanded-image-carousel-container">
                                ${imagesArray.map((img, index) => `
                                    <div class="expanded-image-slide ${index === 0 ? 'active' : ''}" data-image-index="${index}">
                                        <img src="/${img}" alt="${itemName} - Image ${index + 1}" loading="lazy" class="expanded-image-carousel-img">
                                    </div>
                                `).join('')}
                            </div>
                            ${showNavButtons ? `
                            <div class="expanded-image-nav-buttons">
                                <button class="expanded-image-nav expanded-image-nav-prev" onclick="navigateExpandedImage(this, -1, '${url}', event)" aria-label="Previous image">
                                    <i class="fa fa-chevron-left"></i>
                                </button>
                                <button class="expanded-image-nav expanded-image-nav-next" onclick="navigateExpandedImage(this, 1, '${url}', event)" aria-label="Next image">
                                    <i class="fa fa-chevron-right"></i>
                                </button>
                            </div>
                            ` : ''}
                            ${showIndicators ? `
                            <div class="expanded-image-indicators">
                                ${imagesArray.map((img, index) => `
                                    <span class="expanded-image-indicator ${index === 0 ? 'active' : ''}" data-indicator-index="${index}" onclick="goToExpandedImage(this, ${index}, '${url}', event)"></span>
                                `).join('')}
                            </div>
                            ` : ''}
                        </div>
                    `;
                }
                
                // Create expanded content HTML
                dataDiv.innerHTML = `
                    <div class="expanded-item-details">
                        ${imageCarouselHTML}
                        <div class="expanded-item-description">
                            <a href="${url}" style="color: inherit; text-decoration: none;">
                                ${itemDesc ? (fullDescElement ? itemDesc : `<p>${itemDesc}</p>`) : '<p>No description available</p>'}
                            </a>
                        </div>
                        ${sizesHTML || flavoursHTML ? `
                        <div class="menu-item-options">
                            ${sizesHTML}
                            ${flavoursHTML}
                        </div>
                        ` : ''}
                        ${sideCategoriesHTML ? `
                        <div class="expanded-side-categories">
                            ${sideCategoriesHTML}
                        </div>
                        ` : ''}
                        ${additionsHTML ? `
                        <div class="expanded-additions-section">
                            ${additionsHTML}
                        </div>
                        ` : ''}
                        <div class="expanded-item-controls">
                            <div class="expanded-quantity-control">
                                <button class="btn-quantity" onclick="adjustExpandedQuantity(this, -1)">
                                    <i class="fa fa-chevron-down"></i>
                                </button>
                                <span class="expanded-quantity">${initialQuantity}</span>
                                <button class="btn-quantity" onclick="adjustExpandedQuantity(this, 1)">
                                    <i class="fa fa-chevron-up"></i>
                                </button>
                                <span class="expanded-price" data-unit-price="${unitPrice}">${itemPriceText}</span>
                            </div>
                            <button class="expanded-add-cart" onclick="addExpandedItemToCart(this, '${url}')" data-unit-price="${unitPrice}" data-item-url="${url}">
                                <i class="fa fa-cart-plus"></i>
                                <span class="cart-button-text">Add to Cart</span>
                                <span class="cart-button-price">$${initialTotal.toFixed(2).replace(/\.00$/, '')}</span>
                            </button>
                        </div>
                    </div>
                `;
            } else {
                // Fallback: simple expansion
                dataDiv.innerHTML = `
                    <div class="expanded-item-details">
                        <div class="expanded-item-description">
                            <p>Click to view full details</p>
                        </div>
                        <div class="expanded-item-controls">
                            <button class="expanded-add-cart" onclick="window.location.href='${url}'">
                                <i class="fa fa-cart-plus"></i>
                                <span>View Details</span>
                            </button>
                        </div>
                    </div>
                `;
            }

            // Hide loading, show data
            loadingDiv.style.display = 'none';
            dataDiv.style.display = 'block';
            
            // Update price based on initial selections
            setTimeout(() => {
                updateExpandedItemPriceFromOptions(element);
            }, 50);

            // Scroll into view with 5em offset from top
            setTimeout(() => {
                // Calculate 5em in pixels (using root font size)
                const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
                const offset = rootFontSize * 5; // 5em
                
                const elementTop = element.getBoundingClientRect().top + window.pageYOffset;
                const targetPosition = elementTop - offset;
                
                window.scrollTo({
                    top: Math.max(0, targetPosition), // Ensure we don't scroll to negative position
                    behavior: 'smooth'
                });
            }, 100);

        } catch (error) {
            console.error('Error expanding item:', error);
            loadingDiv.innerHTML = `
                <div class="loading-spinner" style="border-top-color: #ff4444;"></div>
                <div class="loading-text">Error loading item details</div>
            `;
        }
    }

    /**
     * Collapse a menu item card
     * @param {HTMLElement} element - The menu item card
     */
    function collapseItem(element) {
        const expandedContent = element.querySelector('.menu-item-expanded-content');
        if (!expandedContent) return;

        expandedContent.style.display = 'none';
        element.setAttribute('data-item-expanded', 'false');
        element.classList.remove('expanded');
    }

    /**
     * Adjust quantity in expanded item
     * @global
     * @param {HTMLElement} button - The quantity button
     * @param {number} change - Amount to change (-1 or 1)
     */
    function adjustExpandedQuantity(button, change) {
        const card = button.closest('.menu-item-card');
        if (!card) return;

        const quantitySpan = card.querySelector('.expanded-quantity');
        if (!quantitySpan) return;

        let currentQty = parseInt(quantitySpan.textContent) || 1;
        currentQty = Math.max(1, currentQty + change);
        quantitySpan.textContent = currentQty;
        
        // Update price and cart button
        updateExpandedItemPrice(card, currentQty);
    }

    /**
     * Update price and cart button when quantity changes
     * @param {HTMLElement} card - The menu item card
     * @param {number} quantity - The new quantity
     */
    function updateExpandedItemPrice(card, quantity) {
        // Update price including sides
        updateExpandedItemPriceWithSides(card);
    }

    /**
     * Select an option (size or flavour) in expanded view
     * @global
     * @param {HTMLElement} optionElement - The clicked option element
     * @param {string} url - Item URL
     * @param {Event} event - The click event (optional)
     */
    function selectExpandedOption(optionElement, url, event) {
        // Prevent event from bubbling up to the card's onclick handler
        if (event) {
            event.stopPropagation();
        }
        
        const card = optionElement.closest('.menu-item-card');
        if (!card) return;
        
        const optionType = optionElement.getAttribute('data-option-type');
        const optionValue = optionElement.getAttribute('data-option-value');
        
        // Remove selected class from siblings
        const siblings = optionElement.parentElement.querySelectorAll('.expanded-option');
        siblings.forEach(sib => sib.classList.remove('selected'));
        
        // Add selected class to clicked element
        optionElement.classList.add('selected');
        
        // Update stored selection
        if (optionType === 'size') {
            card.setAttribute('data-selected-size', optionValue);
        } else if (optionType === 'flavour') {
            card.setAttribute('data-selected-flavour', optionValue);
        }
        
        // Update price based on selection (including sides)
        updateExpandedItemPriceWithSides(card);
    }
    
    /**
     * Select an addition in expanded view
     * @global
     * @param {HTMLElement} additionElement - The clicked addition element
     * @param {string} url - Item URL
     * @param {Event} event - The click event (optional)
     */
    function selectExpandedAddition(additionElement, url, event) {
        // Prevent event from bubbling up to the card's onclick handler
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        
        const card = additionElement.closest('.menu-item-card');
        if (!card) return;
        
        // Toggle selected class (additions can be multiple selections)
        additionElement.classList.toggle('selected');
        
        // Update price based on selection (including sides and additions)
        updateExpandedItemPriceWithSides(card);
    }
    
    /**
     * Select a side item in expanded view
     * @global
     * @param {HTMLElement} sideElement - The clicked side element
     * @param {string} url - Item URL
     * @param {Event} event - The click event (optional)
     */
    function selectExpandedSide(sideElement, url, event) {
        // Prevent event from bubbling up to the card's onclick handler
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        
        const card = sideElement.closest('.menu-item-card');
        if (!card) return;
        
        const categoryName = sideElement.getAttribute('data-category');
        const itemName = sideElement.getAttribute('data-item-name');
        const itemType = sideElement.getAttribute('data-item-type');
        const itemPrice = parseFloat(sideElement.getAttribute('data-item-price')) || 0;
        
        // Get side categories config
        const sideCategoriesStr = card.getAttribute('data-side-categories');
        if (!sideCategoriesStr) return;
        
        const sideCategories = JSON.parse(sideCategoriesStr);
        const category = sideCategories.find(cat => cat.category_name === categoryName);
        if (!category) return;
        
        const configArray = category.config || [];
        const maxSelections = configArray[3] || 1; // regular_max
        
        // Get currently selected sides for this category
        const categoryContainer = sideElement.closest('.expanded-side-category');
        const selectedSides = categoryContainer.querySelectorAll('.expanded-side-option.selected');
        
        // If max selections reached and this item is not already selected, don't allow selection
        if (selectedSides.length >= maxSelections && !sideElement.classList.contains('selected')) {
            // Optionally show a message or just return
            return;
        }
        
        // Toggle selection
        if (sideElement.classList.contains('selected')) {
            sideElement.classList.remove('selected');
        } else {
            // If single selection, remove other selections in this category
            if (maxSelections === 1) {
                categoryContainer.querySelectorAll('.expanded-side-option.selected').forEach(sel => {
                    sel.classList.remove('selected');
                });
            }
            sideElement.classList.add('selected');
        }
        
        // Update price based on selected sides
        updateExpandedItemPriceWithSides(card);
    }
    
    /**
     * Update price including selected sides
     * @param {HTMLElement} card - The menu item card
     */
    function updateExpandedItemPriceWithSides(card) {
        // First update base price from size/flavour
        updateExpandedItemPriceFromOptions(card);
        
        // Get base unit price
        const priceElement = card.querySelector('.expanded-price');
        const baseUnitPrice = parseFloat(priceElement?.getAttribute('data-unit-price')) || 0;
        
        // Calculate side prices
        let sidePrice = 0;
        const selectedSides = card.querySelectorAll('.expanded-side-option.selected');
        selectedSides.forEach(side => {
            const price = parseFloat(side.getAttribute('data-item-price')) || 0;
            sidePrice += price;
        });
        
        // Calculate addition prices
        let additionPrice = 0;
        const selectedAdditions = card.querySelectorAll('.expanded-addition-option.selected');
        selectedAdditions.forEach(addition => {
            const price = parseFloat(addition.getAttribute('data-addition-price')) || 0;
            additionPrice += price;
        });
        
        // Get quantity
        const quantitySpan = card.querySelector('.expanded-quantity');
        const quantity = parseInt(quantitySpan?.textContent) || 1;
        
        // Calculate total
        const totalPrice = (baseUnitPrice + sidePrice + additionPrice) * quantity;
        
        // Update price display
        const addCartButton = card.querySelector('.expanded-add-cart');
        const priceButton = addCartButton?.querySelector('.cart-button-price');
        
        if (priceButton) {
            priceButton.textContent = `$${totalPrice.toFixed(2).replace(/\.00$/, '')}`;
        }
    }
    
    /**
     * Update price based on selected size and flavour
     * @param {HTMLElement} card - The menu item card
     */
    function updateExpandedItemPriceFromOptions(card) {
        const pricesArrayStr = card.getAttribute('data-prices-array');
        if (!pricesArrayStr) return;
        
        const pricesArray = JSON.parse(pricesArrayStr);
        const selectedSize = card.getAttribute('data-selected-size') || '-';
        const selectedFlavour = card.getAttribute('data-selected-flavour') || '-';
        
        // Find matching price in prices array (format: [size, flavour, price, ...])
        let unitPrice = 0;
        
        // First try exact match
        for (let i = 0; i < pricesArray.length; i += 3) {
            if (i + 2 < pricesArray.length) {
                const size = pricesArray[i];
                const flavour = pricesArray[i + 1];
                const price = parseFloat(pricesArray[i + 2]);
                
                if (size === selectedSize && flavour === selectedFlavour && !isNaN(price) && price > 0) {
                    unitPrice = price;
                    break;
                }
            }
        }
        
        // If no exact match, try matching just flavour (when size is "-")
        if (unitPrice === 0 && selectedSize === '-') {
            for (let i = 0; i < pricesArray.length; i += 3) {
                if (i + 2 < pricesArray.length) {
                    const size = pricesArray[i];
                    const flavour = pricesArray[i + 1];
                    const price = parseFloat(pricesArray[i + 2]);
                    
                    if (size === '-' && flavour === selectedFlavour && !isNaN(price) && price > 0) {
                        unitPrice = price;
                        break;
                    }
                }
            }
        }
        
        // If still no match, try matching just size (when flavour is "-")
        if (unitPrice === 0 && selectedFlavour === '-') {
            for (let i = 0; i < pricesArray.length; i += 3) {
                if (i + 2 < pricesArray.length) {
                    const size = pricesArray[i];
                    const flavour = pricesArray[i + 1];
                    const price = parseFloat(pricesArray[i + 2]);
                    
                    if (size === selectedSize && flavour === '-' && !isNaN(price) && price > 0) {
                        unitPrice = price;
                        break;
                    }
                }
            }
        }
        
        // If still no match, try to find first available price
        if (unitPrice === 0) {
            for (let i = 2; i < pricesArray.length; i += 3) {
                const price = parseFloat(pricesArray[i]);
                if (!isNaN(price) && price > 0) {
                    unitPrice = price;
                    break;
                }
            }
        }
        
        // Update price display
        const quantitySpan = card.querySelector('.expanded-quantity');
        const quantity = parseInt(quantitySpan?.textContent) || 1;
        
        // Calculate side prices
        let sidePrice = 0;
        const selectedSides = card.querySelectorAll('.expanded-side-option.selected');
        selectedSides.forEach(side => {
            const price = parseFloat(side.getAttribute('data-item-price')) || 0;
            sidePrice += price;
        });
        
        const totalPrice = (unitPrice + sidePrice) * quantity;
        
        const priceElement = card.querySelector('.expanded-price');
        const addCartButton = card.querySelector('.expanded-add-cart');
        const priceButton = addCartButton?.querySelector('.cart-button-price');
        
        if (priceElement) {
            priceElement.textContent = `$${unitPrice.toFixed(2).replace(/\.00$/, '')}`;
            priceElement.setAttribute('data-unit-price', unitPrice.toString());
        }
        
        if (addCartButton) {
            addCartButton.setAttribute('data-unit-price', unitPrice.toString());
        }
        
        if (priceButton) {
            priceButton.textContent = `$${totalPrice.toFixed(2).replace(/\.00$/, '')}`;
        }
    }

    /**
     * Add expanded item to cart
     * @global
     * @param {HTMLElement} button - The add to cart button
     * @param {string} url - Item URL
     */
    function addExpandedItemToCart(button, url) {
        const card = button.closest('.menu-item-card');
        if (!card) {
            console.warn('Card not found for add to cart');
            return;
        }

        // Check if required side categories have selections
        const sideCategoriesStr = card.getAttribute('data-side-categories');
        if (sideCategoriesStr) {
            const sideCategories = JSON.parse(sideCategoriesStr);
            const missingSelections = [];
            
            sideCategories.forEach(category => {
                const categoryName = category.category_name;
                const displayName = category.display_name;
                const configArray = category.config || [];
                const requiredMax = configArray[3] || 0; // regular_max
                
                if (requiredMax > 0) {
                    const categoryContainer = card.querySelector(`.expanded-side-category[data-category-name="${categoryName}"]`);
                    if (categoryContainer) {
                        const selectedSides = categoryContainer.querySelectorAll('.expanded-side-option.selected');
                        if (selectedSides.length < requiredMax) {
                            missingSelections.push(displayName || categoryName);
                        }
                    }
                }
            });
            
            if (missingSelections.length > 0) {
                const message = `Please select ${missingSelections.length === 1 ? 'a' : ''} ${missingSelections.join(' and ')} before adding to cart.`;
                alert(message);
                return;
            }
        }

        // Get item details
        const quantitySpan = card.querySelector('.expanded-quantity');
        const quantity = parseInt(quantitySpan?.textContent) || 1;
        
        const titleElement = card.querySelector('.menu-item-title a') || card.querySelector('.menu-item-title');
        const itemName = titleElement?.textContent?.trim() || '';
        
        // Get selected size and flavour
        const selectedSize = card.getAttribute('data-selected-size') || '-';
        const selectedFlavour = card.getAttribute('data-selected-flavour') || '-';
        
        // Get price - try expanded price first, then regular price
        const priceElement = card.querySelector('.expanded-price') || card.querySelector('.menu-item-price');
        const priceText = priceElement?.textContent?.trim() || '';
        
        // Extract numeric price (remove $ and any other characters)
        const priceMatch = priceText.match(/\$?([\d.]+)/);
        const unitPrice = priceMatch ? parseFloat(priceMatch[1]) : parseFloat(button.getAttribute('data-unit-price')) || 0;
        const totalCost = unitPrice * quantity;

        if (!itemName || unitPrice === 0) {
            console.warn('Missing item name or price:', { itemName, unitPrice, priceText });
            // Fallback: open the item page to use the full modal
            if (typeof window.openItem === 'function') {
                window.openItem(card, url);
            }
            return;
        }

        // Call existing addItem function if available
        if (typeof addItem === 'function') {
            // addItem(item, size, sides, adds, mods, amt, cost)
            // Combine size and flavour for the size parameter (format: "size flavour")
            const size = selectedSize !== '-' && selectedFlavour !== '-' 
                ? `${selectedSize} ${selectedFlavour}`.trim()
                : selectedSize !== '-' ? selectedSize : '-';
            
            // Get selected sides
            const selectedSides = card.querySelectorAll('.expanded-side-option.selected');
            const sidesData = { items: [], categories: {} };
            
            selectedSides.forEach(side => {
                const categoryName = side.getAttribute('data-category');
                const sideName = side.getAttribute('data-item-name');
                const sideType = side.getAttribute('data-item-type');
                const sidePrice = parseFloat(side.getAttribute('data-item-price')) || 0;
                
                // Add to items array
                sidesData.items.push([sideName, sideType, sidePrice]);
                
                // Track by category
                if (!sidesData.categories[categoryName]) {
                    sidesData.categories[categoryName] = [];
                }
                sidesData.categories[categoryName].push({
                    name: sideName,
                    type: sideType,
                    price: sidePrice
                });
            });
            
            // Get selected additions
            const selectedAdditions = card.querySelectorAll('.expanded-addition-option.selected');
            const adds = [];
            selectedAdditions.forEach(addition => {
                const additionName = addition.getAttribute('data-addition-name');
                const additionPrice = parseFloat(addition.getAttribute('data-addition-price')) || 0;
                if (additionName) {
                    adds.push(additionName, additionPrice);
                }
            });
            
            const mods = []; // No modifications by default
            
            // Recalculate total cost including sides and additions
            let sidePrice = 0;
            selectedSides.forEach(side => {
                const price = parseFloat(side.getAttribute('data-item-price')) || 0;
                sidePrice += price;
            });
            
            let additionPrice = 0;
            selectedAdditions.forEach(addition => {
                const price = parseFloat(addition.getAttribute('data-addition-price')) || 0;
                additionPrice += price;
            });
            
            const finalTotalCost = (unitPrice + sidePrice + additionPrice) * quantity;
            
            console.log('📦 Adding to cart:', { 
                item: itemName, 
                size: size,
                sides: sidesData,
                additions: adds,
                quantity, 
                unitPrice, 
                sidePrice,
                additionPrice,
                totalCost: finalTotalCost,
                url 
            });
            
            addItem(itemName, size, sidesData, adds, mods, quantity.toString(), finalTotalCost);
            
            // Show visual feedback
            button.classList.add('adding');
            setTimeout(() => {
                button.classList.remove('adding');
            }, 500);
            
            // Optionally collapse the card after adding
            // collapseItem(card);
            
        } else {
            console.warn('addItem function not available, opening item page');
            // Fallback: open the item page to use the full modal
            if (typeof window.openItem === 'function') {
                window.openItem(card, url);
            } else {
                window.location.href = url;
            }
        }
    }

    /**
     * Open item modal (kept for backward compatibility, but redirects to expansion for menu cards)
     * @global
     * @param {HTMLElement|string} element - Element or URL
     * @param {string} url - Item URL (if element is not provided)
     */
    function openItem(element, url) {
        // If it's a menu item card, use expansion instead
        if (element && element.classList && element.classList.contains('menu-item-card')) {
            toggleItemExpansion(element, url);
            return;
        }
        
        // Navigate to item page if URL provided
        if (typeof element === 'string') {
            url = element;
            window.location.href = url;
            return;
        }

        // If element has data-item-url, navigate to it
        const itemUrl = element?.dataset?.itemUrl || url;
        if (itemUrl) {
            window.location.href = itemUrl;
        }
    }

    // ============================================
    // DASHBOARD INTERACTIONS
    // ============================================

    /**
     * Toggle dashboard visibility
     * @global
     */
    function toggleDashboard() {
        const dashboard = document.getElementById('dashboard');
        
        if (!dashboard) return;

        if (dashboard.classList.contains('loader-hide-left')) {
            dashboard.classList.remove('loader-hide-left');
            document.body.classList.add('modal-open');
        } else {
            closeDashboard();
        }
    }

    /**
     * Close dashboard
     * @global
     */
    function closeDashboard() {
        const dashboard = document.getElementById('dashboard');
        
        if (!dashboard) return;

        dashboard.classList.add('loader-hide-left');
        document.body.classList.remove('modal-open');
    }

    // ============================================
    // MENU INTERACTIONS
    // ============================================

    /**
     * Initialize menu interactions
     */
    function initializeMenu() {
        // Smooth scroll for menu anchors
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function(e) {
                const href = this.getAttribute('href');
                if (href === '#') return;
                
                const target = document.querySelector(href);
                if (target) {
                    e.preventDefault();
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                    
                    // Close cart when navigating
                    closeCart();
                }
            });
        });

        // Add click handlers for menu items with data-item-url
        document.querySelectorAll('[data-item-url]').forEach(item => {
            if (!item.onclick) {
                item.addEventListener('click', function(e) {
                    const url = this.dataset.itemUrl;
                    if (url) {
                        openItem(this, url);
                    }
                });
            }
        });
    }

    // ============================================
    // UTILITY FUNCTIONS
    // ============================================

    /**
     * Update cart count badge
     * @global
     * @param {number} change - Change in cart count (+1, -1, etc.)
     */
    function updateCart(change) {
        const cartCount = document.getElementById('cartcount');
        
        if (!cartCount) return;

        const currentCount = parseInt(cartCount.innerText) || 0;
        const newCount = Math.max(0, currentCount + change);
        
        cartCount.innerText = newCount;
        
        if (newCount <= 0) {
            cartCount.classList.add('hide');
        } else {
            cartCount.classList.remove('hide');
        }
    }

    /**
     * Update ad count badge
     * @global
     * @param {number} count - New ad count
     */
    function updateAdCount(count) {
        const adCount = document.getElementById('adcount');
        
        if (!adCount) return;

        adCount.innerText = count || 0;
        
        if (count <= 0) {
            adCount.classList.add('hide');
        } else {
            adCount.classList.remove('hide');
        }
    }

    // ============================================
    // EXPOSE GLOBAL FUNCTIONS
    // ============================================

    // Make functions globally available
    window.toggleCart = toggleCart;
    window.closeCart = closeCart;
    window.toggleSearch = toggleSearch;

    /**
     * Live search functionality for menu items
     * @global
     */
    function liveSearch() {
        const searchInput = document.getElementById('searchbox');
        
        if (!searchInput) return;
        
        const searchTerm = searchInput.value.trim().toLowerCase();
        
        // If no search term, show all items and sections
        if (searchTerm.length === 0) {
            const allCards = document.querySelectorAll('.menu-item-card');
            allCards.forEach(card => {
                card.style.display = '';
            });
            
            const menuSections = document.querySelectorAll('.main-menu-bg');
            menuSections.forEach(section => {
                section.style.display = '';
            });
            return;
        }
        
        // Search through menu items
        const menuItemCards = document.querySelectorAll('.menu-item-card');
        const sectionsWithMatches = new Set();
        
        menuItemCards.forEach(card => {
            const titleElement = card.querySelector('.menu-item-title a, .menu-item-title');
            const descriptionElement = card.querySelector('.menu-item-description');
            
            let titleText = '';
            let descriptionText = '';
            
            if (titleElement) {
                titleText = titleElement.textContent.trim().toLowerCase();
            }
            
            if (descriptionElement) {
                descriptionText = descriptionElement.textContent.trim().toLowerCase();
            }
            
            const matches = titleText.includes(searchTerm) || descriptionText.includes(searchTerm);
            
            if (matches) {
                card.style.display = '';
                
                // Track which sections have matches
                const menuSection = card.closest('.main-menu-bg');
                if (menuSection) {
                    sectionsWithMatches.add(menuSection);
                }
            } else {
                card.style.display = 'none';
            }
        });
        
        // Show/hide menu sections based on whether they have matches
        const menuSections = document.querySelectorAll('.main-menu-bg');
        menuSections.forEach(section => {
            if (sectionsWithMatches.has(section)) {
                section.style.display = '';
            } else {
                section.style.display = 'none';
            }
        });
    }
    
    window.liveSearch = liveSearch;
    window.toggleFooterAccessibility = toggleFooterAccessibility;
    window.toggleTTMS = toggleTTMS;
    window.closeTTMS = closeTTMS;
    window.closeShop = closeShop;
    window.openItem = openItem;
    window.toggleItemExpansion = toggleItemExpansion;
    window.adjustExpandedQuantity = adjustExpandedQuantity;
    window.addExpandedItemToCart = addExpandedItemToCart;
    window.selectExpandedOption = selectExpandedOption;
    window.selectExpandedSide = selectExpandedSide;
    window.selectExpandedAddition = selectExpandedAddition;
    
    /**
     * Navigate to previous/next image in expanded carousel
     * @global
     * @param {HTMLElement} button - The navigation button
     * @param {number} direction - -1 for previous, 1 for next
     * @param {string} url - Item URL (for compatibility)
     * @param {Event} event - The click event
     */
    function navigateExpandedImage(button, direction, url, event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        
        const carousel = button.closest('.expanded-image-carousel');
        if (!carousel) return;
        
        const slides = carousel.querySelectorAll('.expanded-image-slide');
        if (slides.length <= 1) return;
        
        const currentIndex = parseInt(carousel.getAttribute('data-current-image')) || 0;
        let newIndex = currentIndex + direction;
        
        // Wrap around
        if (newIndex < 0) {
            newIndex = slides.length - 1;
        } else if (newIndex >= slides.length) {
            newIndex = 0;
        }
        
        goToExpandedImageIndex(carousel, newIndex);
    }
    
    /**
     * Go to specific image by indicator click
     * @global
     * @param {HTMLElement} indicator - The indicator element
     * @param {number} index - The image index to go to
     * @param {string} url - Item URL (for compatibility)
     * @param {Event} event - The click event
     */
    function goToExpandedImage(indicator, index, url, event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        
        const carousel = indicator.closest('.expanded-image-carousel');
        if (!carousel) return;
        
        goToExpandedImageIndex(carousel, index);
    }
    
    /**
     * Go to specific image index in carousel
     * @param {HTMLElement} carousel - The carousel element
     * @param {number} index - The image index to show
     */
    function goToExpandedImageIndex(carousel, index) {
        const slides = carousel.querySelectorAll('.expanded-image-slide');
        const indicators = carousel.querySelectorAll('.expanded-image-indicator');
        
        if (index < 0 || index >= slides.length) return;
        
        // Update slides
        slides.forEach((slide, i) => {
            if (i === index) {
                slide.classList.add('active');
            } else {
                slide.classList.remove('active');
            }
        });
        
        // Update indicators
        indicators.forEach((indicator, i) => {
            if (i === index) {
                indicator.classList.add('active');
            } else {
                indicator.classList.remove('active');
            }
        });
        
        // Update current index
        carousel.setAttribute('data-current-image', index.toString());
    }
    
    window.navigateExpandedImage = navigateExpandedImage;
    window.goToExpandedImage = goToExpandedImage;
    
    /**
     * Navigate to previous/next image in single page carousel
     * @global
     * @param {HTMLElement} button - The navigation button
     * @param {number} direction - -1 for previous, 1 for next
     * @param {Event} event - The click event
     */
    function navigateSinglePageImage(button, direction, event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        
        const carousel = button.closest('.single-page-image-carousel');
        if (!carousel) return;
        
        const slides = carousel.querySelectorAll('.single-page-image-slide');
        if (slides.length <= 1) return;
        
        const currentIndex = parseInt(carousel.getAttribute('data-current-image')) || 0;
        let newIndex = currentIndex + direction;
        
        // Wrap around
        if (newIndex < 0) {
            newIndex = slides.length - 1;
        } else if (newIndex >= slides.length) {
            newIndex = 0;
        }
        
        goToSinglePageImageIndex(carousel, newIndex);
    }
    
    /**
     * Go to specific image by indicator click on single page
     * @global
     * @param {HTMLElement} indicator - The indicator element
     * @param {number} index - The image index to go to
     * @param {Event} event - The click event
     */
    function goToSinglePageImage(indicator, index, event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        
        const carousel = indicator.closest('.single-page-image-carousel');
        if (!carousel) return;
        
        goToSinglePageImageIndex(carousel, index);
    }
    
    /**
     * Go to specific image index in single page carousel
     * @param {HTMLElement} carousel - The carousel element
     * @param {number} index - The image index to show
     */
    function goToSinglePageImageIndex(carousel, index) {
        const slides = carousel.querySelectorAll('.single-page-image-slide');
        const indicators = carousel.querySelectorAll('.single-page-image-indicator');
        
        if (index < 0 || index >= slides.length) return;
        
        // Update slides
        slides.forEach((slide, i) => {
            if (i === index) {
                slide.classList.add('active');
            } else {
                slide.classList.remove('active');
            }
        });
        
        // Update indicators
        indicators.forEach((indicator, i) => {
            if (i === index) {
                indicator.classList.add('active');
            } else {
                indicator.classList.remove('active');
            }
        });
        
        // Update current index
        carousel.setAttribute('data-current-image', index.toString());
    }
    
    window.navigateSinglePageImage = navigateSinglePageImage;
    window.goToSinglePageImage = goToSinglePageImage;

    /**
     * Adjust quantity on single page
     * @global
     * @param {HTMLElement} button - The quantity button
     * @param {number} change - Amount to change (-1 or 1)
     */
    function adjustSinglePageQuantity(button, change) {
        const quantitySpan = document.querySelector('.single-page-quantity');
        if (!quantitySpan) return;

        let currentQty = parseInt(quantitySpan.textContent) || 1;
        currentQty = Math.max(1, currentQty + change);
        quantitySpan.textContent = currentQty;
        
        // Update price and cart button (includes all options)
        updateSinglePagePriceWithOptions();
    }

    /**
     * Update price and cart button on single page
     * @param {HTMLElement} quantitySpan - The quantity span element
     * @param {number} quantity - The new quantity
     */
    function updateSinglePagePrice(quantitySpan, quantity) {
        // Use the new function that includes options
        updateSinglePagePriceWithOptions();
    }

    /**
     * Add single page item to cart
     * @global
     * @param {HTMLElement} button - The add to cart button
     * @param {string} url - Item URL
     */
    function addSinglePageItemToCart(button, url) {
        const quantitySpan = document.querySelector('.single-page-quantity');
        const quantity = parseInt(quantitySpan?.textContent) || 1;
        
        // Get item name from the single page title (prioritize .single-page-title to avoid selecting wrong h1)
        const titleElement = document.querySelector('h1.single-page-title') || document.querySelector('.single-page-title') || document.querySelector('.single-page-content h1') || document.querySelector('h1');
        const itemName = titleElement?.textContent?.trim() || '';
        
        // Debug log to help identify issues
        if (!itemName || itemName === 'Results') {
            console.warn('⚠️ Item name issue detected:', {
                foundName: itemName,
                titleElement: titleElement,
                allH1s: Array.from(document.querySelectorAll('h1')).map(h => ({ text: h.textContent.trim(), classes: h.className }))
            });
        }
        
        const dataContainer = document.getElementById('single-page-item-data');
        if (!dataContainer) return;
        
        // Check if required side categories have selections
        const sideCategoriesStr = dataContainer.getAttribute('data-side-categories');
        if (sideCategoriesStr) {
            const sideCategories = JSON.parse(sideCategoriesStr);
            const missingSelections = [];
            
            sideCategories.forEach(category => {
                const categoryName = category.category_name;
                const displayName = category.display_name;
                const configArray = category.config || [];
                const requiredMax = configArray[3] || 0; // regular_max
                
                if (requiredMax > 0) {
                    const categoryContainer = document.querySelector(`.single-page-side-category[data-category-name="${categoryName}"]`);
                    if (categoryContainer) {
                        const selectedSides = categoryContainer.querySelectorAll('.single-page-side-option.selected');
                        if (selectedSides.length < requiredMax) {
                            missingSelections.push(displayName || categoryName);
                        }
                    }
                }
            });
            
            if (missingSelections.length > 0) {
                const message = `Please select ${missingSelections.length === 1 ? 'a' : ''} ${missingSelections.join(' and ')} before adding to cart.`;
                alert(message);
                return;
            }
        }
        
        // Calculate unit price from selected options
        const unitPrice = updateSinglePagePriceWithOptions();
        if (unitPrice === 0) {
            console.warn('Missing item name or price:', { itemName, unitPrice });
            return;
        }

        if (!itemName) {
            console.warn('Missing item name:', { itemName });
            return;
        }

        // Call existing addItem function if available
        if (typeof addItem === 'function') {
            // Get selected size and flavour
            const selectedSizeOption = document.querySelector('.single-page-option[data-option-type="size"].selected');
            const selectedFlavourOption = document.querySelector('.single-page-option[data-option-type="flavour"].selected');
            const selectedSize = selectedSizeOption?.getAttribute('data-option-value') || '-';
            const selectedFlavour = selectedFlavourOption?.getAttribute('data-option-value') || '-';
            
            // Determine the size value to use
            // Priority: flavour if available (since flavours often represent the actual selection like "Hard Shell" or "Soft Shell")
            // Otherwise use size, or '-' if neither is selected
            let size = '-';
            if (selectedFlavour !== '-') {
                size = selectedFlavour;
            } else if (selectedSize !== '-') {
                size = selectedSize;
            }
            
            // If both are selected, combine them (size first, then flavour)
            if (selectedSize !== '-' && selectedFlavour !== '-') {
                size = `${selectedSize} ${selectedFlavour}`.trim();
            }
            
            // Get selected sides
            const selectedSides = document.querySelectorAll('.single-page-side-option.selected');
            const sidesData = { items: [], categories: {} };
            
            selectedSides.forEach(side => {
                const categoryName = side.getAttribute('data-category');
                const sideName = side.getAttribute('data-item-name');
                const sideType = side.getAttribute('data-item-type');
                const sidePrice = parseFloat(side.getAttribute('data-item-price')) || 0;
                
                // Add to items array
                sidesData.items.push([sideName, sideType, sidePrice]);
                
                // Track by category
                if (!sidesData.categories[categoryName]) {
                    sidesData.categories[categoryName] = [];
                }
                sidesData.categories[categoryName].push({
                    name: sideName,
                    type: sideType,
                    price: sidePrice
                });
            });
            
            // Get selected additions
            const selectedAdditions = document.querySelectorAll('.single-page-addition-option.selected');
            const adds = [];
            selectedAdditions.forEach(addition => {
                const additionName = addition.getAttribute('data-addition-name');
                const additionPrice = parseFloat(addition.getAttribute('data-addition-price')) || 0;
                if (additionName) {
                    adds.push(additionName, additionPrice);
                }
            });
            
            const mods = []; // No modifications by default
            
            // Recalculate total cost including sides and additions
            let sidePrice = 0;
            selectedSides.forEach(side => {
                const price = parseFloat(side.getAttribute('data-item-price')) || 0;
                sidePrice += price;
            });
            
            let additionPrice = 0;
            selectedAdditions.forEach(addition => {
                const price = parseFloat(addition.getAttribute('data-addition-price')) || 0;
                additionPrice += price;
            });
            
            const finalTotalCost = (unitPrice + sidePrice + additionPrice) * quantity;
            
            console.log('📦 Adding to cart from single page:', { 
                item: itemName, 
                size: size,
                sides: sidesData,
                additions: adds,
                quantity, 
                unitPrice, 
                sidePrice,
                additionPrice,
                totalCost: finalTotalCost,
                url 
            });
            
            addItem(itemName, size, sidesData, adds, mods, quantity.toString(), finalTotalCost);
            
            // Show visual feedback
            button.classList.add('adding');
            setTimeout(() => {
                button.classList.remove('adding');
            }, 500);
            
        } else {
            console.warn('addItem function not available');
        }
    }

    /**
     * Select an option (size or flavour) on single page
     * @global
     * @param {HTMLElement} optionElement - The clicked option element
     * @param {Event} event - The click event
     */
    function selectSinglePageOption(optionElement, event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        
        const optionType = optionElement.getAttribute('data-option-type');
        const optionValue = optionElement.getAttribute('data-option-value');
        
        // Remove selected class from siblings
        const container = optionElement.closest('.single-page-options-group');
        if (container) {
            const siblings = container.querySelectorAll('.single-page-option');
            siblings.forEach(sib => sib.classList.remove('selected'));
        }
        
        // Add selected class to clicked element
        optionElement.classList.add('selected');
        
        // Update price
        updateSinglePagePriceWithOptions();
    }
    
    /**
     * Select a side item on single page
     * @global
     * @param {HTMLElement} sideElement - The clicked side element
     * @param {Event} event - The click event
     */
    function selectSinglePageSide(sideElement, event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        
        const categoryName = sideElement.getAttribute('data-category');
        const itemName = sideElement.getAttribute('data-item-name');
        const itemType = sideElement.getAttribute('data-item-type');
        const itemPrice = parseFloat(sideElement.getAttribute('data-item-price')) || 0;
        
        // Get data container
        const dataContainer = document.getElementById('single-page-item-data');
        if (!dataContainer) return;
        
        const sideCategoriesStr = dataContainer.getAttribute('data-side-categories');
        if (!sideCategoriesStr) return;
        
        const sideCategories = JSON.parse(sideCategoriesStr);
        const category = sideCategories.find(cat => cat.category_name === categoryName);
        if (!category) return;
        
        const configArray = category.config || [];
        const maxSelections = configArray[3] || 1; // regular_max
        
        // Get currently selected sides for this category
        const categoryContainer = sideElement.closest('.single-page-side-category');
        const selectedSides = categoryContainer.querySelectorAll('.single-page-side-option.selected');
        
        // If max selections reached and this item is not already selected, don't allow selection
        if (selectedSides.length >= maxSelections && !sideElement.classList.contains('selected')) {
            return;
        }
        
        // Toggle selection
        if (sideElement.classList.contains('selected')) {
            sideElement.classList.remove('selected');
        } else {
            // If single selection, remove other selections in this category
            if (maxSelections === 1) {
                categoryContainer.querySelectorAll('.single-page-side-option.selected').forEach(sel => {
                    sel.classList.remove('selected');
                });
            }
            sideElement.classList.add('selected');
        }
        
        // Update price
        updateSinglePagePriceWithOptions();
    }
    
    /**
     * Select an addition on single page
     * @global
     * @param {HTMLElement} additionElement - The clicked addition element
     * @param {Event} event - The click event
     */
    function selectSinglePageAddition(additionElement, event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        
        // Toggle selected class (additions can be multiple selections)
        additionElement.classList.toggle('selected');
        
        // Update price
        updateSinglePagePriceWithOptions();
    }
    
    /**
     * Update price on single page including all selected options
     */
    function updateSinglePagePriceWithOptions() {
        const quantitySpan = document.querySelector('.single-page-quantity');
        const quantity = parseInt(quantitySpan?.textContent) || 1;
        
        const dataContainer = document.getElementById('single-page-item-data');
        if (!dataContainer) return;
        
        const pricesArrayStr = dataContainer.getAttribute('data-prices-array');
        if (!pricesArrayStr) return;
        
        const pricesArray = JSON.parse(pricesArrayStr);
        
        // Get selected size and flavour
        const selectedSizeOption = document.querySelector('.single-page-option[data-option-type="size"].selected');
        const selectedFlavourOption = document.querySelector('.single-page-option[data-option-type="flavour"].selected');
        const selectedSize = selectedSizeOption?.getAttribute('data-option-value') || '-';
        const selectedFlavour = selectedFlavourOption?.getAttribute('data-option-value') || '-';
        
        // Find matching price
        let unitPrice = 0;
        for (let i = 0; i < pricesArray.length; i += 3) {
            if (i + 2 < pricesArray.length) {
                const size = pricesArray[i];
                const flavour = pricesArray[i + 1];
                const price = parseFloat(pricesArray[i + 2]);
                
                if (size === selectedSize && flavour === selectedFlavour && !isNaN(price) && price > 0) {
                    unitPrice = price;
                    break;
                }
            }
        }
        
        // If no exact match, try matching just flavour (when size is "-")
        if (unitPrice === 0 && selectedSize === '-') {
            for (let i = 0; i < pricesArray.length; i += 3) {
                if (i + 2 < pricesArray.length) {
                    const size = pricesArray[i];
                    const flavour = pricesArray[i + 1];
                    const price = parseFloat(pricesArray[i + 2]);
                    
                    if (size === '-' && flavour === selectedFlavour && !isNaN(price) && price > 0) {
                        unitPrice = price;
                        break;
                    }
                }
            }
        }
        
        // If still no match, try matching just size (when flavour is "-")
        if (unitPrice === 0 && selectedFlavour === '-') {
            for (let i = 0; i < pricesArray.length; i += 3) {
                if (i + 2 < pricesArray.length) {
                    const size = pricesArray[i];
                    const flavour = pricesArray[i + 1];
                    const price = parseFloat(pricesArray[i + 2]);
                    
                    if (size === selectedSize && flavour === '-' && !isNaN(price) && price > 0) {
                        unitPrice = price;
                        break;
                    }
                }
            }
        }
        
        // If still no match, use first available price
        if (unitPrice === 0) {
            for (let i = 2; i < pricesArray.length; i += 3) {
                const price = parseFloat(pricesArray[i]);
                if (!isNaN(price) && price > 0) {
                    unitPrice = price;
                    break;
                }
            }
        }
        
        // Calculate side prices
        let sidePrice = 0;
        const selectedSides = document.querySelectorAll('.single-page-side-option.selected');
        selectedSides.forEach(side => {
            const price = parseFloat(side.getAttribute('data-item-price')) || 0;
            sidePrice += price;
        });
        
        // Calculate addition prices
        let additionPrice = 0;
        const selectedAdditions = document.querySelectorAll('.single-page-addition-option.selected');
        selectedAdditions.forEach(addition => {
            const price = parseFloat(addition.getAttribute('data-addition-price')) || 0;
            additionPrice += price;
        });
        
        const totalPrice = (unitPrice + sidePrice + additionPrice) * quantity;
        
        // Update price display
        const addCartButton = document.querySelector('.single-page-add-cart-btn');
        const priceButton = addCartButton?.querySelector('.cart-button-price');
        
        if (priceButton) {
            priceButton.textContent = `$${totalPrice.toFixed(2).replace(/\.00$/, '')}`;
        }
        
        return unitPrice; // Return unit price for use in addSinglePageItemToCart
    }
    
    // Initialize single page price on load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            const quantitySpan = document.querySelector('.single-page-quantity');
            if (quantitySpan) {
                const quantity = parseInt(quantitySpan.textContent) || 1;
                updateSinglePagePriceWithOptions();
            }
        });
    } else {
        const quantitySpan = document.querySelector('.single-page-quantity');
        if (quantitySpan) {
            const quantity = parseInt(quantitySpan.textContent) || 1;
            updateSinglePagePriceWithOptions();
        }
    }

    window.adjustSinglePageQuantity = adjustSinglePageQuantity;
    window.addSinglePageItemToCart = addSinglePageItemToCart;
    window.selectSinglePageOption = selectSinglePageOption;
    window.selectSinglePageSide = selectSinglePageSide;
    window.selectSinglePageAddition = selectSinglePageAddition;
    window.toggleDashboard = toggleDashboard;
    window.closeDashboard = closeDashboard;
    window.updateCart = updateCart;
    window.updateAdCount = updateAdCount;

    // Packery.js removed - no longer needed

    /**
     * Scroll locations horizontally
     * @global
     * @param {string} direction - 'left' or 'right'
     */
    function scrollLocations(direction) {
        const locationsWrapper = document.querySelector('.locations-wrapper');
        if (!locationsWrapper) {
            console.warn('Locations wrapper not found');
            return;
        }

        const locations = locationsWrapper.querySelector('.locations');
        if (!locations) {
            console.warn('Locations container not found');
            return;
        }

        // Get scrollable element (might be locations or wrapper)
        const scrollableElement = locations.scrollWidth > locations.clientWidth ? locations : locationsWrapper;
        
        const scrollAmount = 300; // pixels to scroll
        const currentScroll = scrollableElement.scrollLeft;
        const maxScroll = scrollableElement.scrollWidth - scrollableElement.clientWidth;

        console.log('Scroll Debug:', {
            direction,
            currentScroll,
            maxScroll,
            scrollWidth: scrollableElement.scrollWidth,
            clientWidth: scrollableElement.clientWidth,
            element: scrollableElement.className
        });

        // Check if scrolling is needed
        if (maxScroll <= 0) {
            console.log('No scrolling needed - content fits');
            updateLocationNavButtons(scrollableElement, 0);
            return;
        }

        let scrollDelta;
        if (direction === 'left') {
            scrollDelta = -scrollAmount;
        } else if (direction === 'right') {
            scrollDelta = scrollAmount;
        } else {
            console.warn('Invalid scroll direction:', direction);
            return;
        }

        // Try scrollBy first (more reliable), fallback to scrollTo
        if (scrollableElement.scrollBy) {
            scrollableElement.scrollBy({
                left: scrollDelta,
                behavior: 'smooth'
            });
        } else {
            const newScroll = Math.max(0, Math.min(maxScroll, currentScroll + scrollDelta));
            if (scrollableElement.scrollTo) {
                scrollableElement.scrollTo({
                    left: newScroll,
                    behavior: 'smooth'
                });
            } else {
                scrollableElement.scrollLeft = newScroll;
            }
        }

        // Update button visibility after a short delay to account for smooth scroll
        setTimeout(() => {
            updateLocationNavButtons(scrollableElement, maxScroll);
        }, 100);
    }

    /**
     * Update location navigation button visibility
     * @param {HTMLElement} locations - The locations container
     * @param {number} maxScroll - Maximum scroll value
     */
    function updateLocationNavButtons(locations, maxScroll) {
        const leftBtn = document.getElementById('locationNavLeft');
        const rightBtn = document.getElementById('locationNavRight');

        if (!leftBtn || !rightBtn) return;

        const currentScroll = locations.scrollLeft;

        // Show/hide left button
        if (currentScroll <= 0) {
            leftBtn.style.opacity = '0.3';
            leftBtn.style.pointerEvents = 'none';
        } else {
            leftBtn.style.opacity = '1';
            leftBtn.style.pointerEvents = 'auto';
        }

        // Show/hide right button
        if (currentScroll >= maxScroll - 1) {
            rightBtn.style.opacity = '0.3';
            rightBtn.style.pointerEvents = 'none';
        } else {
            rightBtn.style.opacity = '1';
            rightBtn.style.pointerEvents = 'auto';
        }
    }

    /**
     * Initialize location navigation
     */
    function initializeLocationNavigation() {
        const locationsWrapper = document.querySelector('.locations-wrapper');
        if (!locationsWrapper) return;

        const locations = locationsWrapper.querySelector('.locations');
        if (!locations) return;

        // Get the scrollable element
        const scrollableElement = locations.scrollWidth > locations.clientWidth ? locations : locationsWrapper;
        
        const updateButtons = () => {
            const maxScroll = scrollableElement.scrollWidth - scrollableElement.clientWidth;
            updateLocationNavButtons(scrollableElement, maxScroll);
        };

        // Initial button state
        setTimeout(updateButtons, 100); // Wait for layout

        // Update buttons on scroll
        scrollableElement.addEventListener('scroll', () => {
            const maxScroll = scrollableElement.scrollWidth - scrollableElement.clientWidth;
            updateLocationNavButtons(scrollableElement, maxScroll);
        });

        // Update buttons on resize
        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                updateButtons();
            }, 250);
        });
    }

    // Initialize location navigation on page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeLocationNavigation);
    } else {
        initializeLocationNavigation();
    }

    // Reinitialize after Barba.js transitions
    document.addEventListener('barba:after', function() {
        setTimeout(initializeLocationNavigation, 100);
    });

    // Expose globally - ensure it overrides any placeholder functions
    window.scrollLocations = scrollLocations;
    
    // Force override after a short delay to ensure it runs after other scripts
    setTimeout(() => {
        window.scrollLocations = scrollLocations;
    }, 100);

    /**
     * Get current selected location index from cart
     * @returns {number} The index of the selected location, or 0 if none
     */
    function getSelectedLocationIndex() {
        const locationSelect = document.getElementById('locationSelect');
        if (!locationSelect || !locationSelect.value) {
            return 0; // Default to first location
        }
        
        // Find the location index by matching whatsapp number
        const selectedWhatsapp = locationSelect.value;
        const locationPanels = document.querySelectorAll('.opening-hours-location');
        
        for (let i = 0; i < locationPanels.length; i++) {
            const panel = locationPanels[i];
            const whatsapp = panel.getAttribute('data-whatsapp');
            if (whatsapp === selectedWhatsapp) {
                return parseInt(panel.getAttribute('data-location-index'), 10);
            }
        }
        
        return 0; // Default to first if not found
    }

    /**
     * Show specific location in opening hours
     * @param {number} index - The location index to show
     */
    function showOpeningHoursLocation(index) {
        const locationPanels = document.querySelectorAll('.opening-hours-location');
        if (locationPanels.length === 0) return;
        
        // Ensure index is within bounds
        const maxIndex = locationPanels.length - 1;
        const safeIndex = Math.max(0, Math.min(index, maxIndex));
        
        // Hide all locations
        locationPanels.forEach(panel => {
            panel.style.display = 'none';
        });
        
        // Show selected location
        const selectedPanel = Array.from(locationPanels).find(
            panel => parseInt(panel.getAttribute('data-location-index'), 10) === safeIndex
        );
        
        if (selectedPanel) {
            selectedPanel.style.display = 'block';
        }
        
        // Update navigation buttons
        updateOpeningHoursNavButtons(safeIndex, maxIndex);
    }

    /**
     * Navigate opening hours (previous/next location)
     * @global
     * @param {number} direction - -1 for previous, 1 for next
     */
    function navigateOpeningHours(direction) {
        const currentIndex = getSelectedLocationIndex();
        const locationPanels = document.querySelectorAll('.opening-hours-location');
        const maxIndex = locationPanels.length - 1;
        
        let newIndex = currentIndex + direction;
        
        // Wrap around
        if (newIndex < 0) {
            newIndex = maxIndex;
        } else if (newIndex > maxIndex) {
            newIndex = 0;
        }
        
        showOpeningHoursLocation(newIndex);
        
        // Sync with cart location select
        syncOpeningHoursToCart(newIndex);
    }

    /**
     * Sync opening hours display to cart location selection
     * @param {number} locationIndex - The location index to sync to
     */
    function syncOpeningHoursToCart(locationIndex) {
        const locationSelect = document.getElementById('locationSelect');
        if (!locationSelect) return;
        
        const locationPanels = document.querySelectorAll('.opening-hours-location');
        const targetPanel = Array.from(locationPanels).find(
            panel => parseInt(panel.getAttribute('data-location-index'), 10) === locationIndex
        );
        
        if (targetPanel) {
            const whatsapp = targetPanel.getAttribute('data-whatsapp');
            // Find and select the matching option in cart
            for (let i = 0; i < locationSelect.options.length; i++) {
                if (locationSelect.options[i].value === whatsapp) {
                    locationSelect.selectedIndex = i;
                    // Trigger change event to update cart
                    if (typeof selectLocation === 'function') {
                        selectLocation(whatsapp);
                    } else {
                        locationSelect.dispatchEvent(new Event('change'));
                    }
                    break;
                }
            }
        }
    }

    /**
     * Update opening hours navigation buttons visibility
     * @param {number} currentIndex - Current location index
     * @param {number} maxIndex - Maximum location index
     */
    function updateOpeningHoursNavButtons(currentIndex, maxIndex) {
        const leftBtn = document.querySelector('#client-openinghours .l-btn');
        const rightBtn = document.querySelector('#client-openinghours .r-btn');
        
        // Always show buttons if there's more than one location
        if (maxIndex > 0) {
            if (leftBtn) leftBtn.style.display = 'flex';
            if (rightBtn) rightBtn.style.display = 'flex';
        } else {
            if (leftBtn) leftBtn.style.display = 'none';
            if (rightBtn) rightBtn.style.display = 'none';
        }
    }

    /**
     * Initialize opening hours to sync with cart
     */
    function initializeOpeningHours() {
        // Show the location that matches the cart selection
        const selectedIndex = getSelectedLocationIndex();
        showOpeningHoursLocation(selectedIndex);
        
        // Listen for cart location changes
        const locationSelect = document.getElementById('locationSelect');
        if (locationSelect) {
            locationSelect.addEventListener('change', () => {
                const newIndex = getSelectedLocationIndex();
                showOpeningHoursLocation(newIndex);
            });
        }
    }

    // Initialize on page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(initializeOpeningHours, 100);
        });
    } else {
        setTimeout(initializeOpeningHours, 100);
    }

    // Re-initialize after Barba.js transitions
    if (typeof window.barba !== 'undefined') {
        document.addEventListener('barba:after', () => {
            setTimeout(initializeOpeningHours, 100);
        });
    }

    window.navigateOpeningHours = navigateOpeningHours;
    window.showOpeningHoursLocation = showOpeningHoursLocation;

})();

// ========================================
// LOCATION STATUS DISPLAY
// ========================================

(function() {
    'use strict';

    /**
     * Calculate and display open/closed status for location items
     */
    function updateLocationStatuses() {
        // Support both .location-item format (contact_info) and .location-card format (locations page)
        const locationItems = document.querySelectorAll('.location-item[data-location-index], .location-card[data-location-index]');
        if (locationItems.length === 0) return;

        // First, try to use data attributes (embedded in HTML)
        let allHaveData = true;
        locationItems.forEach(item => {
            const openingHoursData = item.getAttribute('data-opening-hours');
            if (openingHoursData) {
                try {
                    const openingHours = JSON.parse(openingHoursData);
                    const status = calculateLocationStatus(openingHours);
                    updateStatusBadge(item, status.type, status.text);
                } catch (e) {
                    console.error('Error parsing opening hours from data attribute:', e);
                    allHaveData = false;
                }
            } else {
                allHaveData = false;
            }
        });

        // If all items have data attributes, we're done
        if (allHaveData) return;

        // Otherwise, fetch from index.json as fallback
        fetch('/index.json')
            .then(response => response.json())
            .then(data => {
                // Handle both data.locations and data.locations.locations structures
                const locations = (data.locations && Array.isArray(data.locations)) 
                    ? data.locations 
                    : (data.locations && data.locations.locations && Array.isArray(data.locations.locations))
                        ? data.locations.locations
                        : [];
                
                locationItems.forEach(item => {
                    // Skip if already updated from data attribute
                    const openingHoursData = item.getAttribute('data-opening-hours');
                    if (openingHoursData) return;

                    const index = parseInt(item.getAttribute('data-location-index'), 10);
                    const location = locations[index];
                    if (!location || !location.opening_hours) {
                        updateStatusBadge(item, 'closed', 'Closed');
                        return;
                    }

                    const status = calculateLocationStatus(location.opening_hours);
                    updateStatusBadge(item, status.type, status.text);
                });
            })
            .catch(error => {
                console.error('Error fetching locations data:', error);
                // Set all to closed on error (only for items without data attributes)
                locationItems.forEach(item => {
                    const openingHoursData = item.getAttribute('data-opening-hours');
                    if (!openingHoursData) {
                        updateStatusBadge(item, 'closed', 'Closed');
                    }
                });
            });
    }

    /**
     * Calculate location status based on opening hours
     * @param {Object} openingHours - Opening hours data
     * @returns {Object} Status object with type and text
     */
    function calculateLocationStatus(openingHours) {
        const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
        const now = new Date();
        const todayIndex = now.getDay();
        const todayDay = days[todayIndex];
        const yesterdayIndex = (todayIndex - 1 + 7) % 7;
        const yesterdayDay = days[yesterdayIndex];

        function parseTime(timeStr) {
            if (!timeStr) return null;
            const [hours, minutes] = timeStr.split(':').map(Number);
            const date = new Date();
            date.setHours(hours, minutes, 0, 0);
            return date;
        }

        function getHoursForDay(day) {
            if (!openingHours[day] || !Array.isArray(openingHours[day])) return null;
            
            const entries = openingHours[day];
            let openTime = null;
            let closeTime = null;

            for (const entry of entries) {
                if (entry.type === 'Open') {
                    openTime = parseTime(entry.time);
                } else if (entry.type === 'Close') {
                    closeTime = parseTime(entry.time);
                }
            }

            return { openTime, closeTime };
        }

        // Check yesterday's overnight hours first
        const yesterdayHours = getHoursForDay(yesterdayDay);
        if (yesterdayHours && yesterdayHours.openTime && yesterdayHours.closeTime) {
            const yesterdayOpen = new Date(yesterdayHours.openTime);
            yesterdayOpen.setDate(yesterdayOpen.getDate() - 1);
            
            let yesterdayClose = new Date(yesterdayHours.closeTime);
            // If close time is before open time, it's overnight
            if (yesterdayClose <= yesterdayOpen) {
                yesterdayClose.setDate(yesterdayClose.getDate() + 1);
            }

            if (now >= yesterdayOpen && now < yesterdayClose) {
                const minsToClose = Math.floor((yesterdayClose - now) / 60000);
                if (minsToClose <= 30) {
                    return { type: 'soon-close', text: 'Closes Soon' };
                }
                return { type: 'open', text: 'Open' };
            }
        }

        // Check today's hours
        const todayHours = getHoursForDay(todayDay);
        if (todayHours && todayHours.openTime && todayHours.closeTime) {
            const todayOpen = new Date(todayHours.openTime);
            let todayClose = new Date(todayHours.closeTime);
            
            // If close time is before open time, it's overnight
            if (todayClose <= todayOpen) {
                todayClose.setDate(todayClose.getDate() + 1);
            }

            if (now >= todayOpen && now < todayClose) {
                const minsToClose = Math.floor((todayClose - now) / 60000);
                if (minsToClose <= 30) {
                    return { type: 'soon-close', text: 'Closes Soon' };
                }
                return { type: 'open', text: 'Open' };
            } else if (now < todayOpen) {
                const minsToOpen = Math.floor((todayOpen - now) / 60000);
                if (minsToOpen > 0 && minsToOpen <= 30) {
                    return { type: 'soon-open', text: 'Opens Soon' };
                }
            }
        }

        return { type: 'closed', text: 'Closed' };
    }

    /**
     * Update status badge for a location item
     * @param {HTMLElement} item - Location item element
     * @param {string} statusType - Status type (open, closed, soon-open, soon-close)
     * @param {string} statusText - Status text to display
     */
    function updateStatusBadge(item, statusType, statusText) {
        // Support both .location-item format (contact_info) and .location-card format (locations page)
        let statusElement = item.querySelector('.location-status-badge');
        if (!statusElement) {
            // Try locations page format
            statusElement = item.querySelector('.openstatus .status-badge');
        }
        if (!statusElement) return;

        // Remove all status classes
        statusElement.classList.remove('open', 'closed', 'soon-open', 'soon-close', 'hide');
        
        // Add current status class
        statusElement.classList.add(statusType);
        statusElement.textContent = statusText;
    }

    /**
     * Refresh status for a single location when button is clicked
     * @param {HTMLElement} button - The status button element
     */
    function refreshLocationStatus(button) {
        // Find the parent location-item or location-card (for locations page)
        const locationStatusDiv = button.closest('.location-status');
        const locationCard = button.closest('.location-card');
        
        // Support both contact_info format (.location-item) and locations page format (.location-card)
        const locationItem = locationStatusDiv ? locationStatusDiv.closest('.location-item') : locationCard;
        if (!locationItem && !locationCard) return;
        
        const targetElement = locationItem || locationCard;

        // Disable button and show throbber
        button.disabled = true;
        const originalText = button.textContent.trim();
        
        // Remove any existing throbber
        const existingThrobber = button.querySelector('.throbber');
        if (existingThrobber) {
            existingThrobber.remove();
        }
        
        // Create and show throbber
        const throbber = document.createElement('span');
        throbber.className = 'throbber';
        throbber.style.display = 'inline-block';
        
        // Set button content with throbber and text
        button.innerHTML = '';
        button.appendChild(throbber);
        button.appendChild(document.createTextNode(' ' + originalText));

        // Get opening hours from data attribute
        const openingHoursData = targetElement.getAttribute('data-opening-hours');
        
        // Function to update status and hide throbber
        const updateStatus = (statusType, statusText) => {
            // Update status badge (this will replace the button content)
            // Support both formats: .location-item (contact_info) and .location-card (locations page)
            if (locationItem) {
                updateStatusBadge(locationItem, statusType, statusText);
            } else if (locationCard) {
                // For locations page, update the button directly
                const statusButton = locationCard.querySelector('.openstatus .status-badge');
                if (statusButton) {
                    statusButton.classList.remove('open', 'closed', 'soon-open', 'soon-close', 'hide');
                    statusButton.classList.add(statusType);
                    statusButton.textContent = statusText;
                }
            }
            
            // Re-enable button after throbber animation completes
            setTimeout(() => {
                button.disabled = false;
            }, 100);
        };
        
        if (openingHoursData) {
            try {
                const openingHours = JSON.parse(openingHoursData);
                const status = calculateLocationStatus(openingHours);
                // Wait 1 second to show throbber feedback
                setTimeout(() => {
                    updateStatus(status.type, status.text);
                }, 1000);
            } catch (e) {
                console.error('Error parsing opening hours:', e);
                setTimeout(() => {
                    button.innerHTML = originalText;
                    button.disabled = false;
                }, 1000);
            }
        } else {
            // Fallback: fetch from index.json
            const indexDiv = locationStatusDiv || locationCard;
            const index = parseInt(indexDiv.getAttribute('data-location-index'), 10);
            fetch('/index.json')
                .then(response => response.json())
                .then(data => {
                    const locations = (data.locations && Array.isArray(data.locations)) 
                        ? data.locations 
                        : (data.locations && data.locations.locations && Array.isArray(data.locations.locations))
                            ? data.locations.locations
                            : [];
                    
                    const location = locations[index];
                    // Wait 1 second to show throbber feedback
                    setTimeout(() => {
                        if (!location || !location.opening_hours) {
                            updateStatus('closed', 'Closed');
                        } else {
                            const status = calculateLocationStatus(location.opening_hours);
                            updateStatus(status.type, status.text);
                        }
                    }, 1000);
                })
                .catch(error => {
                    console.error('Error fetching location data:', error);
                    setTimeout(() => {
                        button.innerHTML = originalText;
                        button.disabled = false;
                    }, 1000);
                });
        }
    }

    // Expose function globally
    window.refreshLocationStatus = refreshLocationStatus;

    /**
     * Initialize location status display
     */
    function initLocationStatuses() {
        updateLocationStatuses();
        // Update every minute
        setInterval(updateLocationStatuses, 60000);
    }

    // Initialize on page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(initLocationStatuses, 500);
        });
    } else {
        setTimeout(initLocationStatuses, 500);
    }

    // Re-initialize after Barba.js transitions
    if (typeof window.barba !== 'undefined') {
        document.addEventListener('barba:after', () => {
            setTimeout(initLocationStatuses, 500);
        });
    }

    // Expose function globally
    window.updateLocationStatuses = updateLocationStatuses;

})();
