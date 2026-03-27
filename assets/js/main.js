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
        applyDayBasedPromos();
        initializeFooterVisibility();
        // Packery removed - no initialization needed
    }

    /**
     * Fetch current weekday and time from trusted time API (not browser date).
     * Uses WorldTimeAPI; on failure, promos are not applied.
     * @returns {{ day: string, hour: number, minute: number }|null}
     */
    async function fetchDateTimeFromAPI() {
        try {
            const res = await fetch('https://worldtimeapi.org/api/ip', { cache: 'no-store' });
            if (!res.ok) return null;
            const data = await res.json();
            const dayNum = data.day_of_week; // 1=Monday .. 7=Sunday
            const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
            const day = days[dayNum - 1] || null;
            let hour = 0, minute = 0;
            if (data.datetime) {
                const m = data.datetime.match(/T(\d{1,2}):(\d{2})/);
                if (m) { hour = parseInt(m[1], 10); minute = parseInt(m[2], 10); }
            }
            return day ? { day, hour, minute } : null;
        } catch (_) { return null; }
    }

    /** Fallback when the time API is unavailable — still apply day-based promos using local clock. */
    function getLocalDateTime() {
        const d = new Date();
        const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        return { day: names[d.getDay()], hour: d.getHours(), minute: d.getMinutes() };
    }

    /** @param {string} timeStr "HH:mm" or "H:mm" 24h - returns minutes since midnight */
    function parseTimeToMinutes(timeStr) {
        if (!timeStr || typeof timeStr !== 'string') return null;
        const m = timeStr.trim().match(/^(\d{1,2}):(\d{2})$/);
        if (!m) return null;
        const h = parseInt(m[1], 10), min = parseInt(m[2], 10);
        if (h < 0 || h > 23 || min < 0 || min > 59) return null;
        return h * 60 + min;
    }

    function getActivePromoForDay(promotionsJson, today, timeInfo) {
        if (!promotionsJson || !today) return null;
        let promotions;
        try { promotions = typeof promotionsJson === 'string' ? JSON.parse(promotionsJson) : promotionsJson; } catch (_) { return null; }
        if (!Array.isArray(promotions)) return null;
        const nowMins = timeInfo ? timeInfo.hour * 60 + timeInfo.minute : null;
        return promotions.find(p => {
            if (!p.days || !Array.isArray(p.days) || !p.days.includes(today)) return false;
            if (p.time_start != null || p.time_finish != null) {
                const start = parseTimeToMinutes(String(p.time_start || '00:00'));
                const finish = parseTimeToMinutes(String(p.time_finish || '23:59'));
                if (start == null || finish == null || nowMins == null) return false;
                if (start <= finish) return nowMins >= start && nowMins <= finish;
                return nowMins >= start || nowMins <= finish;
            }
            return true;
        }) || null;
    }

    function getBasePriceFromPricesArray(pricesArray) {
        if (!pricesArray) return 0;
        const arr = typeof pricesArray === 'string' ? JSON.parse(pricesArray) : pricesArray;
        if (!Array.isArray(arr)) return 0;
        const prices = [];
        for (let i = 2; i < arr.length; i += 3) { const n = parseFloat(arr[i]); if (!isNaN(n) && n > 0) prices.push(n); }
        return prices.length ? (prices.length === 1 ? prices[0] : Math.min(...prices)) : 0;
    }

    function getPriceRangeFromPricesArray(pricesArray) {
        if (!pricesArray) return null;
        const arr = typeof pricesArray === 'string' ? JSON.parse(pricesArray) : pricesArray;
        if (!Array.isArray(arr)) return null;
        const prices = [];
        for (let i = 2; i < arr.length; i += 3) { const n = parseFloat(arr[i]); if (!isNaN(n) && n > 0) prices.push(n); }
        return prices.length >= 2 ? [Math.min(...prices), Math.max(...prices)] : prices.length === 1 ? [prices[0], prices[0]] : null;
    }

    function applyPromoToCard(card, today, timeInfo) {
        const promotions = card.getAttribute('data-promotions');
        const promo = getActivePromoForDay(promotions, today, timeInfo);
        const pct = promo && promo.type === 'percent_off' && promo.value ? parseInt(promo.value) : 0;
        card.setAttribute('data-active-promo-percent', String(pct));

        const pricesStr = card.getAttribute('data-prices-array');
        const basePrice = getBasePriceFromPricesArray(pricesStr);
        const displayPrice = pct > 0 ? basePrice * (100 - pct) / 100 : basePrice;

        const badge = card.querySelector('.menu-item-title .menu-item-promo-badge');
        if (badge) {
            if (promo && promo.label) {
                badge.innerHTML = '<span class="menu-item-promo-label">Promotion</span> <span class="menu-item-promo-value">' + promo.label + '</span>';
                badge.style.display = '';
            } else { badge.style.display = 'none'; }
        } else if (promo && promo.label) {
            const titleEl = card.querySelector('.menu-item-title');
            if (titleEl) {
                const span = document.createElement('span');
                span.className = 'menu-item-promo-badge';
                span.innerHTML = '<span class="menu-item-promo-label">Promotion</span> <span class="menu-item-promo-value">' + promo.label + '</span>';
                titleEl.appendChild(span);
            }
        }

        const priceEl = card.querySelector('.menu-item-price');
        if (priceEl) {
            const range = getPriceRangeFromPricesArray(pricesStr);
            const hasRange = range && range[0] !== range[1];
            if (hasRange) {
                const [p1, p2] = range;
                if (pct > 0) {
                    const d1 = p1 * (100 - pct) / 100, d2 = p2 * (100 - pct) / 100;
                    priceEl.innerHTML = `<span class="menu-item-price-original">$${p1.toFixed(2).replace(/\.00$/, '')} | $${p2.toFixed(2).replace(/\.00$/, '')}</span> <span class="menu-item-price-promo">$${d1.toFixed(2).replace(/\.00$/, '')} | $${d2.toFixed(2).replace(/\.00$/, '')}</span>`;
                } else priceEl.innerHTML = `$${p1.toFixed(2).replace(/\.00$/, '')} | $${p2.toFixed(2).replace(/\.00$/, '')}`;
            } else {
                if (pct > 0) priceEl.innerHTML = `<span class="menu-item-price-original">$${basePrice.toFixed(2).replace(/\.00$/, '')}</span> <span class="menu-item-price-promo">$${displayPrice.toFixed(2).replace(/\.00$/, '')}</span>`;
                else priceEl.textContent = `$${basePrice.toFixed(2).replace(/\.00$/, '')}`;
            }
        }

        /* Card keeps regular item image; promo image is not shown on the card */

        const expandedPrice = card.querySelector('.expanded-price');
        const addCartBtn = card.querySelector('.expanded-add-cart');
        if (expandedPrice) {
            if (pct > 0) {
                expandedPrice.innerHTML = `<span class="menu-item-price-original">$${basePrice.toFixed(2).replace(/\.00$/, '')}</span> <span class="menu-item-price-promo">$${displayPrice.toFixed(2).replace(/\.00$/, '')}</span>`;
                expandedPrice.setAttribute('data-unit-price', String(displayPrice));
                expandedPrice.setAttribute('data-original-unit-price', String(basePrice));
                expandedPrice.setAttribute('data-promo-percent', String(pct));
            } else {
                expandedPrice.textContent = `$${basePrice.toFixed(2).replace(/\.00$/, '')}`;
                expandedPrice.setAttribute('data-unit-price', String(basePrice));
                expandedPrice.setAttribute('data-original-unit-price', String(basePrice));
                expandedPrice.setAttribute('data-promo-percent', '0');
            }
        }
        if (addCartBtn) {
            addCartBtn.setAttribute('data-unit-price', String(displayPrice));
            const cartPrice = addCartBtn.querySelector('.cart-button-price');
            if (cartPrice) cartPrice.textContent = `$${displayPrice.toFixed(2).replace(/\.00$/, '')}`;
        }

        updateMenuItemCardImage(card, promo);
    }

    /**
     * Sync list/card thumbnail with the active promo for today vs item-only images (Hugo may embed build-time promo image).
     */
    function updateMenuItemCardImage(card, promo) {
        const imgLink = card.querySelector('.menu-item-image-link');
        if (!imgLink) return;
        const img = imgLink.querySelector('.menu-item-img');
        if (!img) return;
        const rawRegular = card.getAttribute('data-regular-images-array');
        if (rawRegular === null) {
            if (promo && promo.image) {
                img.src = '/' + String(promo.image).replace(/^\//, '');
                imgLink.style.display = '';
            }
            return;
        }
        let regular = [];
        try { regular = JSON.parse(rawRegular || '[]'); } catch (_) { regular = []; }
        if (!Array.isArray(regular)) regular = [];
        if (promo && promo.image) {
            img.src = '/' + String(promo.image).replace(/^\//, '');
            imgLink.style.display = '';
        } else if (regular.length > 0) {
            img.src = '/' + String(regular[0]).replace(/^\//, '');
            imgLink.style.display = '';
        } else {
            imgLink.style.display = 'none';
        }
    }

    function applyPromoToSinglePage(dataEl, today, timeInfo) {
        const promotions = dataEl.getAttribute('data-promotions');
        const promo = getActivePromoForDay(promotions, today, timeInfo);
        const pct = promo && promo.type === 'percent_off' && promo.value ? parseInt(promo.value) : 0;
        dataEl.setAttribute('data-active-promo-percent', String(pct));

        const badge = document.querySelector('.single-page-title .menu-item-promo-badge');
        if (badge) {
            if (promo && promo.label) {
                badge.innerHTML = '<span class="menu-item-promo-label">Promotion</span> <span class="menu-item-promo-value">' + promo.label + '</span>';
                badge.style.display = '';
            } else { badge.style.display = 'none'; }
        } else if (promo && promo.label) {
            const title = document.querySelector('.single-page-title');
            if (title) {
                const span = document.createElement('span');
                span.className = 'menu-item-promo-badge';
                span.innerHTML = '<span class="menu-item-promo-label">Promotion</span> <span class="menu-item-promo-value">' + promo.label + '</span>';
                title.appendChild(span);
            }
        }

        const priceItems = document.querySelectorAll('.single-page-prices-section .prices li');
        priceItems.forEach(li => {
            const orig = li.querySelector('.menu-item-price-original, b');
            if (!orig) return;
            const match = orig.textContent.match(/\$?([\d.]+)/);
            if (!match) return;
            const origPrice = parseFloat(match[1]);
            if (isNaN(origPrice) || origPrice <= 0) return;
            const disc = pct > 0 ? origPrice * (100 - pct) / 100 : origPrice;
            if (pct > 0) li.innerHTML = `<span class="menu-item-price-original"><b>$${origPrice.toFixed(2).replace(/\.00$/, '')}</b></span> <b class="menu-item-price-promo">$${disc.toFixed(2).replace(/\.00$/, '')}</b>`;
            else li.innerHTML = `<b>$${origPrice.toFixed(2).replace(/\.00$/, '')}</b>`;
        });

        if (typeof updateSinglePagePriceWithOptions === 'function') updateSinglePagePriceWithOptions();
    }

    function isWithinAvailability(availability, today, timeInfo) {
        if (!availability || !today) return true;
        let a;
        try { a = typeof availability === 'string' ? JSON.parse(availability) : availability; } catch (_) { return true; }
        if (a.days && Array.isArray(a.days) && a.days.length > 0) {
            if (!a.days.includes(today)) return false;
        }
        if (a.time_start != null || a.time_finish != null) {
            const start = parseTimeToMinutes(String(a.time_start || '00:00'));
            const finish = parseTimeToMinutes(String(a.time_finish || '23:59'));
            if (start == null || finish == null) return true;
            const nowMins = timeInfo ? timeInfo.hour * 60 + timeInfo.minute : null;
            if (nowMins == null) return false;
            if (start <= finish) return nowMins >= start && nowMins <= finish;
            return nowMins >= start || nowMins <= finish;
        }
        return true;
    }

    function applyAvailabilityToCard(card, today, timeInfo) {
        const avail = card.getAttribute('data-availability');
        if (!avail) return;
        const available = isWithinAvailability(avail, today, timeInfo);
        card.classList.toggle('menu-item-unavailable', !available);
        card.setAttribute('data-availability-active', available ? 'true' : 'false');
        const overlay = card.querySelector('.menu-item-unavailable-overlay');
        if (overlay) overlay.style.display = available ? 'none' : 'flex';
        else if (!available) {
            let msg = 'Available Mon–Fri 11AM–2PM';
            try {
                const a = typeof avail === 'string' ? JSON.parse(avail) : avail;
                if (a.days && a.time_start && a.time_finish) {
                    const daysStr = a.days.length === 5 && a.days.includes('Monday') && a.days.includes('Friday') ? 'Mon–Fri' : a.days.join(', ');
                    const fmt = t => { const [h, m] = t.split(':'); const hh = parseInt(h); return (hh > 12 ? hh - 12 : hh) + (m !== '00' ? ':' + m : '') + (hh >= 12 ? 'PM' : 'AM'); };
                    msg = `Available ${daysStr} ${fmt(a.time_start)}–${fmt(a.time_finish)}`;
                }
            } catch (_) {}
            const div = document.createElement('div');
            div.className = 'menu-item-unavailable-overlay';
            div.innerHTML = `<span>${msg}</span>`;
            card.style.position = 'relative';
            card.appendChild(div);
        }
    }

    function applyAvailabilityToSinglePage(dataEl, today, timeInfo) {
        const avail = dataEl.getAttribute('data-availability');
        if (!avail) return;
        const available = isWithinAvailability(avail, today, timeInfo);
        document.body.classList.toggle('single-page-unavailable', !available);
        let msg = 'Lunch available Monday–Friday, 11AM–2PM.';
        try {
            const a = typeof avail === 'string' ? JSON.parse(avail) : avail;
            if (a.days && a.time_start && a.time_finish) {
                const daysStr = a.days.length === 5 ? 'Mon–Fri' : (a.days || []).join(', ');
                const fmt = t => { const [h, m] = String(t).split(':'); const hh = parseInt(h, 10); return (hh > 12 ? hh - 12 : hh) + (m !== '00' ? ':' + m : '') + (hh >= 12 ? 'PM' : 'AM'); };
                msg = `Available ${daysStr} ${fmt(a.time_start)}–${fmt(a.time_finish)}.`;
            }
        } catch (_) {}
        const addCartSection = document.querySelector('.single-page-add-cart');
        if (addCartSection) {
            let notice = addCartSection.querySelector('.single-page-unavailable-notice');
            if (!available) {
                if (!notice) {
                    notice = document.createElement('p');
                    notice.className = 'single-page-unavailable-notice';
                    notice.style.cssText = 'margin:0 0 .5em;color:#e65100;font-size:.95em;';
                    addCartSection.insertBefore(notice, addCartSection.firstChild);
                }
                notice.textContent = msg;
                notice.style.display = '';
            } else if (notice) notice.style.display = 'none';
        }
        const addBtn = document.querySelector('.single-page-add-cart-btn');
        if (addBtn) addBtn.disabled = !available;
    }

    function applyPromosWithDay(dateTime) {
        if (!dateTime) return;
        const { day: today, hour, minute } = dateTime;
        const timeInfo = { hour, minute };
        document.querySelectorAll('.menu-item-card').forEach(card => applyPromoToCard(card, today, timeInfo));
        document.querySelectorAll('.menu-item-card[data-availability]').forEach(card => applyAvailabilityToCard(card, today, timeInfo));
        const singleData = document.getElementById('single-page-item-data');
        if (singleData) {
            applyPromoToSinglePage(singleData, today, timeInfo);
            applyAvailabilityToSinglePage(singleData, today, timeInfo);
        }
    }

    async function applyDayBasedPromos() {
        const dateTime = await fetchDateTimeFromAPI() || getLocalDateTime();
        applyPromosWithDay(dateTime);
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
                if (typeof closeDashboard === 'function') closeDashboard();
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
     * Normalize one entry from images[] (string path or { image: "path" }).
     */
    function normalizeMenuItemImagePath(entry) {
        if (entry == null) return '';
        if (typeof entry === 'object' && entry.image != null) return String(entry.image).trim();
        return String(entry).trim();
    }

    /**
     * In dashboard edit preview, draft-assets/* must load from CMS preview API; plain /draft-assets/* may 404 locally.
     */
    function resolveExpandedImageSrcForPreview(path) {
        const p = (path || '').trim().replace(/^\/+/, '');
        if (!p) return '';
        if (typeof window !== 'undefined' && window.__dashboardEditMode && p.indexOf('draft-assets/') === 0) {
            const base = (window.CMS_SERVICE_URL || 'https://cms.ttmenus.com').replace(/\/+$/, '');
            const cid = window.CMS_CLIENT_ID || window.CLIENT_ID || '_ttms_menu_demo';
            const name = p.replace(/^draft-assets\//, '');
            return base + '/api/clients/' + encodeURIComponent(cid) + '/preview/draft-assets/' + encodeURIComponent(name);
        }
        if (p.indexOf('http://') === 0 || p.indexOf('https://') === 0) return p;
        return '/' + p;
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
        const card = element.classList?.contains('menu-item-card') ? element : element.closest?.('.menu-item-card');
        if (card && card.classList.contains('menu-item-unavailable')) return;

        const isExpanded = element.classList.contains('expanded') || element.getAttribute('data-item-expanded') === 'true';

        // If event is provided, check if click was on an interactive element
        if (event) {
            const target = event.target;
            const isDragHandle = target.closest('.drag-handle');
            const isImageLink = target.closest('.menu-item-image-link');
            const isTitleLink = target.closest('.menu-item-title a');
            const isExpandedInteractive = target.closest('.expanded-item-controls a, .expanded-item-controls button, .btn-quantity, .expanded-add-cart');
            const isSideCategoryTitle = target.closest('.expanded-side-category-title');
            const isSideOption = target.closest('.expanded-side-option');
            
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
                return; // Let the button handle its own click
            }
            // When expanded: allow side category title to toggle collapse/expand
            if (isExpanded && isSideCategoryTitle) {
                return; // Let the toggle function handle it
            }
            // When expanded: allow side options to be selected
            if (isExpanded && isSideOption) {
                return; // Let the side selection function handle it
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
            else if (!isExpanded && !isImageLink && !isTitleLink && !isExpandedInteractive && !isSideCategoryTitle && !isSideOption) {
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

        const isDashboardNewPlaceholderUrl = typeof window !== 'undefined' && window.__dashboardEditMode &&
            typeof url === 'string' && url.indexOf('/__dashboard-new/') === 0;

        // Show loading state
        expandedContent.style.display = 'block';
        loadingDiv.style.display = 'block';
        dataDiv.style.display = 'none';
        element.setAttribute('data-item-expanded', 'true');
        element.classList.add('expanded');

        try {
            // Use existing openItem function to get item data, but render inline
            if (typeof window.openItem === 'function' && window.openItem.length >= 2) {
                // In dashboard edit mode, use only card DOM/data so the expanded view shows current edits
                const useCardDataOnly = !!window.__dashboardEditMode;
                let itemData = null;
                let variable1Values = [];
                let variable2Values = [];
                let pricesArray = []; // Array of [variable1, variable2, price] tuples
                let sideCategories = []; // Array of side category objects
                let modifications = []; // Array of [name, price] tuples (flat format)
                let additions = []; // Array of [name, price] tuples (flat format)
                let imagesArray = []; // Array of image paths
                
                if (!useCardDataOnly) {
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
                        if (itemData.variable1_values) {
                            variable1Values = itemData.variable1_values.filter(s => s && s !== '-' && s !== 'None');
                        }
                        if (itemData.variable2_values) {
                            variable2Values = itemData.variable2_values.filter(f => f && f !== '-' && f !== 'None');
                        }
                        // Build prices array from items (format: [variable1, variable2, price, ...])
                        if (itemData.items && Array.isArray(itemData.items)) {
                            pricesArray = Array.isArray(itemData.items[0]) ? itemData.items.flat() : itemData.items;
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
                        // Get modifications - handle both flat array format and nested array format
                        modifications = [];
                        if (itemData.modifications && Array.isArray(itemData.modifications)) {
                            // Check if it's a flat array [name, price, name, price, ...] or nested [[name, price], ...]
                            if (itemData.modifications.length > 0 && Array.isArray(itemData.modifications[0])) {
                                // Nested array format - convert to flat
                                itemData.modifications.forEach(mod => {
                                    if (Array.isArray(mod) && mod.length >= 2) {
                                        modifications.push(mod[0], mod[1]);
                                    }
                                });
                            } else {
                                // Already flat array format
                                modifications = itemData.modifications;
                            }
                            console.log('📊 Loaded modifications from JSON:', modifications);
                        }
                        
                        // Get additions - handle both flat array format and nested array format
                        additions = [];
                        if (itemData.additions && Array.isArray(itemData.additions)) {
                            // Check if it's a flat array [name, price, name, price, ...] or nested [[name, price], ...]
                            if (itemData.additions.length > 0 && Array.isArray(itemData.additions[0])) {
                                // Nested array format - convert to flat
                                itemData.additions.forEach(add => {
                                    if (Array.isArray(add) && add.length >= 2) {
                                        additions.push(add[0], add[1]);
                                    }
                                });
                            } else {
                                // Already flat array format
                                additions = itemData.additions;
                            }
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
                }
                
                // Fallback: Get data from card's data attributes if JSON failed (or always in edit mode)
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
                    
                    const modificationsStr = element.getAttribute('data-modifications');
                    if (modificationsStr) {
                        try {
                            modifications = JSON.parse(modificationsStr);
                            console.log('📊 Loaded modifications from data attribute:', modifications);
                        } catch (e) {
                            console.log('⚠️ Failed to parse data-modifications:', e);
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
                
                // If JSON didn't provide variable1/variable2 values, try extracting from card element
                if (variable1Values.length === 0 && variable2Values.length === 0) {
                    const variable1List = element.querySelector('.menu-item-options .sizes');
                    const variable2List = element.querySelector('.menu-item-options .flavours');
                    
                    if (variable1List && variable1List.children.length > 0) {
                        variable1Values = Array.from(variable1List.querySelectorAll('li')).map(li => li.textContent.trim()).filter(s => s && s !== '-' && s !== 'None');
                    }
                    
                    if (variable2List && variable2List.children.length > 0) {
                        variable2Values = Array.from(variable2List.querySelectorAll('li')).map(li => li.textContent.trim()).filter(f => f && f !== '-' && f !== 'None');
                    }
                }
                
                // Fetch HTML for description (skip in edit mode so expanded view shows current card state)
                let fullDescElement = null;
                if (!useCardDataOnly) {
                    const response = await fetch(url + '?format=json').catch(() => fetch(url));
                    const html = await response.text();
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(html, 'text/html');
                    fullDescElement = doc.querySelector('.single-page-description');
                }
                
                // Try to get item data from the page
                const itemName = element.querySelector('.menu-item-title')?.textContent?.trim() ||
                                element.querySelector('.menu-item-title a')?.textContent?.trim() || '';
                // Get description from card (summary) - try both with and without p tag
                const itemDescCard = element.querySelector('.menu-item-description')?.textContent?.trim() || 
                                     element.querySelector('.menu-item-description p')?.textContent?.trim() || '';
                
                // In edit mode use only card description; otherwise use JSON/fetched page or card
                const itemDesc = useCardDataOnly ? itemDescCard : ((itemData && itemData.content) ? itemData.content.trim() : 
                                (fullDescElement ? fullDescElement.innerHTML.trim() : itemDescCard));
                
                const itemPriceText = element.querySelector('.menu-item-price')?.textContent || '';
                
                // Extract base price from card
                const priceMatch = itemPriceText.match(/\$?([\d.]+)/);
                const basePrice = priceMatch ? parseFloat(priceMatch[1]) : 0;
                
                // If prices array is empty but we have variable2 values, build prices array
                if (pricesArray.length === 0 && variable2Values.length > 0 && basePrice > 0) {
                    variable2Values.forEach(v => {
                        pricesArray.push('-', v, basePrice);
                    });
                    console.log('📊 Built prices array from variable2:', pricesArray);
                }
                // If we have variable1 values but no variable2, build prices array
                if (pricesArray.length === 0 && variable1Values.length > 0 && basePrice > 0) {
                    variable1Values.forEach(v => {
                        pricesArray.push(v, '-', basePrice);
                    });
                    console.log('📊 Built prices array from variable1:', pricesArray);
                }
                // If we have both variable1 and variable2 but no prices array, build it
                if (pricesArray.length === 0 && variable1Values.length > 0 && variable2Values.length > 0 && basePrice > 0) {
                    variable1Values.forEach(v1 => {
                        variable2Values.forEach(v2 => {
                            pricesArray.push(v1, v2, basePrice);
                        });
                    });
                    console.log('📊 Built prices array from variable1 and variable2:', pricesArray);
                }
                // If still empty but we have a base price, add a default entry
                if (pricesArray.length === 0 && basePrice > 0) {
                    pricesArray.push('-', '-', basePrice);
                    console.log('📊 Built default prices array:', pricesArray);
                }

                // Derive variable1 / variable2 option lists from flat prices triples (edit mode & JSON fallback)
                if (variable1Values.length === 0 && variable2Values.length === 0 && pricesArray.length >= 3) {
                    const v1s = [];
                    const v2s = [];
                    const seen1 = new Set();
                    const seen2 = new Set();
                    for (let i = 0; i + 2 < pricesArray.length; i += 3) {
                        const a = pricesArray[i];
                        const b = pricesArray[i + 1];
                        const s1 = a != null ? String(a).trim() : '';
                        const s2 = b != null ? String(b).trim() : '';
                        if (s1 && s1 !== '-' && s1 !== 'None' && !seen1.has(s1)) {
                            seen1.add(s1);
                            v1s.push(s1);
                        }
                        if (s2 && s2 !== '-' && s2 !== 'None' && !seen2.has(s2)) {
                            seen2.add(s2);
                            v2s.push(s2);
                        }
                    }
                    variable1Values = v1s;
                    variable2Values = v2s;
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
                
                // Apply promotion discount if active
                const promoPercent = parseInt(element.getAttribute('data-active-promo-percent')) || 0;
                let displayUnitPrice = unitPrice;
                if (promoPercent > 0) {
                    displayUnitPrice = unitPrice * (100 - promoPercent) / 100;
                }
                
                const initialQuantity = 1;
                const initialTotal = displayUnitPrice * initialQuantity;
                
                // Determine default selected variable1 and variable2
                const defaultVariable1 = variable1Values.length > 0 ? variable1Values[0] : '-';
                const defaultVariable2 = variable2Values.length > 0 ? variable2Values[0] : '-';
                
                // Build variable1 and variable2 option HTML with click handlers
                let sizesHTML = '';
                let flavoursHTML = '';
                
                if (variable1Values.length > 0) {
                    sizesHTML = `
                        <ul class="sizes">
                            ${variable1Values.map((v, index) => `
                                <li class="expanded-option ${index === 0 ? 'selected' : ''}" 
                                    data-option-type="variable1" 
                                    data-option-value="${v}"
                                    onclick="selectExpandedOption(this, '${url}', event)">${v}</li>
                            `).join('')}
                        </ul>
                    `;
                }
                
                if (variable2Values.length > 0) {
                    flavoursHTML = `
                        <ul class="flavours">
                            ${variable2Values.map((v, index) => `
                                <li class="expanded-option ${index === 0 ? 'selected' : ''}" 
                                    data-option-type="variable2" 
                                    data-option-value="${v}"
                                    onclick="selectExpandedOption(this, '${url}', event)">${v}</li>
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
                        
                        console.log(`🔧 Processing category ${catIndex}: ${categoryName}, items:`, rawItems);
                        
                        let config = { all_max: 0, regular_max: 0, premium_max: 0 };
                        if (Array.isArray(category.config)) {
                            const configArray = category.config;
                            config = {
                                all_max: configArray[0] || 0,
                                regular_max: configArray[3] || 0,
                                premium_max: configArray[6] || 0
                            };
                        } else if (category.config && typeof category.config === 'object') {
                            const c = category.config;
                            config = {
                                all_max: c.maximum != null ? c.maximum : (c.all_max || 0),
                                regular_max: c.regular_max || 0,
                                premium_max: c.premium_max || 0
                            };
                        }
                        
                        // Build items HTML
                        let itemsHTML = '';
                        if (rawItems && rawItems.length > 0) {
                            // Support both flat array [name, type, price, ...] and object array [{name, type, price, image}, ...]
                            if (rawItems.length > 0 && typeof rawItems[0] === 'object' && rawItems[0].name) {
                                // Object array format (new format with image support)
                                rawItems.forEach(item => {
                                    const name = item.name || '';
                                    const type = item.type || 'Regular';
                                    const price = parseFloat(item.price) || 0;
                                    const image = item.image || null;
                                    const priceDisplay = price > 0 ? `<span class="addition-price">+$${price.toFixed(2).replace(/\.00$/, '')}</span>` : '';
                                    const cssClass = type === 'Premium' ? 'premiumside' : 'regularside';
                                    const starIcon = type === 'Premium' ? ' <i class="fa fa-star"></i>' : '';
                                    const imageHtml = image ? `<img src="${image}" alt="${name}" class="expanded-side-item-image" onerror="this.style.display='none';">` : '';
                                    
                                    itemsHTML += `
                                        <li class="expanded-side-option ${cssClass}" 
                                            data-category="${categoryName}"
                                            data-item-name="${name}"
                                            data-item-type="${type}"
                                            data-item-price="${price}"
                                            onclick="selectExpandedSide(this, '${url}', event)">
                                            ${imageHtml}
                                            <span class="expanded-side-item-content">
                                                ${name}${starIcon} ${priceDisplay}
                                            </span>
                                        </li>
                                    `;
                                });
                            } else {
                                // Flat array format (backward compatible)
                                for (let i = 0; i < rawItems.length; i += 3) {
                                    if (i + 2 < rawItems.length) {
                                        const name = rawItems[i];
                                        const type = rawItems[i + 1];
                                        const price = parseFloat(rawItems[i + 2]) || 0;
                                        const priceDisplay = price > 0 ? `<span class="addition-price">+$${price.toFixed(2).replace(/\.00$/, '')}</span>` : '';
                                        const cssClass = type === 'Premium' ? 'premiumside' : 'regularside';
                                        const starIcon = type === 'Premium' ? ' <i class="fa fa-star"></i>' : '';
                                        
                                        itemsHTML += `
                                            <li class="expanded-side-option ${cssClass}" 
                                                data-category="${categoryName}"
                                                data-item-name="${name}"
                                                data-item-type="${type}"
                                                data-item-price="${price}"
                                                onclick="selectExpandedSide(this, '${url}', event)">
                                                ${name}${starIcon} ${priceDisplay}
                                            </li>
                                        `;
                                    }
                                }
                            }
                        }
                        
                        if (itemsHTML) {
                            const itemCount = (rawItems.length > 0 && typeof rawItems[0] === 'object' && rawItems[0] != null && rawItems[0].name != null)
                                ? rawItems.length
                                : rawItems.length / 3;
                            const shouldCollapse = itemCount > 8;
                            const collapsedClass = shouldCollapse ? 'collapsed' : '';
                            const iconClass = shouldCollapse ? 'fa-chevron-down' : 'fa-chevron-up';
                            
                            sideCategoriesHTML += `
                                <div class="expanded-side-category ${collapsedClass}" data-category-name="${categoryName}">
                                    <h4 class="expanded-side-category-title" onclick="toggleExpandedSideCategory(this, event)">
                                        <span>${displayName} <span class="expanded-side-category-count" style="display: none;">(0)</span></span>
                                        <i class="fa ${iconClass} expanded-side-category-toggle"></i>
                                    </h4>
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
                
                // Build modifications HTML
                let modificationsHTML = '';
                if (modifications && modifications.length > 0) {
                    modificationsHTML = `
                        <div class="expanded-additions">
                            <h4 class="expanded-additions-title">Modifications</h4>
                            <ul class="expanded-addition-items">
                                ${modifications.map((mod, index) => {
                                    if (index % 2 === 0 && index + 1 < modifications.length) {
                                        const name = modifications[index];
                                        const price = parseFloat(modifications[index + 1]) || 0;
                                        return `<li class="expanded-addition-option" data-addition-type="modification" data-addition-name="${name}" data-addition-price="${price}" onclick="selectExpandedAddition(this, '${url}', event)">${name} <span class="addition-price">+$${price.toFixed(2).replace(/\.00$/, '')}</span></li>`;
                                    }
                                    return '';
                                }).filter(html => html).join('')}
                            </ul>
                        </div>
                    `;
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
                                        return `<li class="expanded-addition-option" data-addition-type="addition" data-addition-name="${name}" data-addition-price="${price}" onclick="selectExpandedAddition(this, '${url}', event)">${name} <span class="addition-price">+$${price.toFixed(2).replace(/\.00$/, '')}</span></li>`;
                                    }
                                    return '';
                                }).filter(html => html).join('')}
                            </ul>
                        </div>
                    `;
                }
                
                // Store prices array, side categories, modifications, additions, and default selections in data attributes
                element.setAttribute('data-prices-array', JSON.stringify(pricesArray));
                element.setAttribute('data-selected-variable1', defaultVariable1);
                element.setAttribute('data-selected-variable2', defaultVariable2);
                element.setAttribute('data-side-categories', JSON.stringify(sideCategories));
                element.setAttribute('data-modifications', JSON.stringify(modifications));
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
                                ${imagesArray.map((img, index) => {
                                    const pathStr = normalizeMenuItemImagePath(img);
                                    const src = resolveExpandedImageSrcForPreview(pathStr);
                                    return `
                                    <div class="expanded-image-slide ${index === 0 ? 'active' : ''}" data-image-index="${index}">
                                        <img src="${src}" alt="${itemName} - Image ${index + 1}" loading="lazy" class="expanded-image-carousel-img">
                                    </div>`;
                                }).join('')}
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
                const descLinkHref = isDashboardNewPlaceholderUrl ? '#' : url;
                const descLinkClass = isDashboardNewPlaceholderUrl ? ' class="dashboard-new-item-placeholder-link"' : '';
                const descLinkOnclick = isDashboardNewPlaceholderUrl ? ' onclick="return false;"' : '';
                dataDiv.innerHTML = `
                    <div class="expanded-item-details">
                        ${imageCarouselHTML}
                        ${itemDesc ? `
                        <div class="expanded-item-description">
                            <a href="${descLinkHref}"${descLinkClass}${descLinkOnclick} style="color: inherit; text-decoration: none;">
                                ${fullDescElement ? itemDesc : `<p>${itemDesc}</p>`}
                            </a>
                        </div>
                        ` : ''}
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
                        ${modificationsHTML ? `
                        <div class="expanded-additions-section">
                            ${modificationsHTML}
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
                                <span class="expanded-price" data-unit-price="${displayUnitPrice}" data-original-unit-price="${unitPrice}" data-promo-percent="${promoPercent}">${promoPercent > 0 ? `<span class="menu-item-price-original">$${unitPrice.toFixed(2).replace(/\.00$/, '')}</span> <span class="menu-item-price-promo">$${displayUnitPrice.toFixed(2).replace(/\.00$/, '')}</span>` : itemPriceText}</span>
                            </div>
                            <button class="expanded-add-cart" onclick="addExpandedItemToCart(this, '${url}')" data-unit-price="${displayUnitPrice}" data-item-url="${url}">
                                <i class="fa fa-cart-plus"></i>
                                <span class="cart-button-text">Add to Cart</span>
                                <span class="cart-button-price">$${initialTotal.toFixed(2).replace(/\.00$/, '')}</span>
                            </button>
                        </div>
                    </div>
                `;
            } else {
                // Fallback: simple expansion
                const fallbackNav = isDashboardNewPlaceholderUrl ? 'return false;' : ('window.location.href=' + JSON.stringify(url) + ';');
                dataDiv.innerHTML = `
                    <div class="expanded-item-details">
                        <div class="expanded-item-description">
                            <p>Click to view full details</p>
                        </div>
                        <div class="expanded-item-controls">
                            <button type="button" class="expanded-add-cart" onclick="${fallbackNav}">
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
            
            // Initialize category counters
            const categoryContainers = dataDiv.querySelectorAll('.expanded-side-category');
            categoryContainers.forEach(container => {
                updateExpandedSideCategoryCounter(container);
            });
            
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
        if (optionType === 'variable1') {
            card.setAttribute('data-selected-variable1', optionValue);
        } else if (optionType === 'variable2') {
            card.setAttribute('data-selected-variable2', optionValue);
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
        const itemPrice = parseFloat(sideElement.getAttribute('data-item-price')) || 0;
        const isSelected = sideElement.classList.contains('selected');
        
        // Get side categories config
        const sideCategoriesStr = card.getAttribute('data-side-categories');
        if (!sideCategoriesStr) return;
        
        const sideCategories = JSON.parse(sideCategoriesStr);
        const category = sideCategories.find(cat => cat.category_name === categoryName);
        if (!category) return;
        
        // Use new config format (minimum/maximum)
        const config = category.config || {};
        const maximum = config.maximum || 99;
        
        // Get currently selected sides for this category
        const categoryContainer = sideElement.closest('.expanded-side-category');
        const selectedSides = categoryContainer.querySelectorAll('.expanded-side-option.selected');
        
        // Calculate total quantity (each selected item counts as 1)
        const currentTotal = selectedSides.length;
        
        if (isSelected) {
            // Deselect
            sideElement.classList.remove('selected');
        } else {
            // Check if we can add more
            if (currentTotal >= maximum) {
                alert(`You can only select ${maximum} item(s) total. Currently selected: ${currentTotal}.`);
                return;
            }
            
            // Select
            sideElement.classList.add('selected');
        }
        
        // Update category counter
        updateExpandedSideCategoryCounter(categoryContainer);
        
        // Update price based on selected sides
        updateExpandedItemPriceWithSides(card);
    }
    
    /**
     * Toggle expanded side category collapse/expand
     * @global
     * @param {HTMLElement} titleElement - The category title element
     * @param {Event} event - Optional event object
     */
    function toggleExpandedSideCategory(titleElement, event) {
        // Prevent event from bubbling up to parent card's onclick
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        
        const category = titleElement.closest('.expanded-side-category');
        if (!category) return;
        
        const toggleIcon = titleElement.querySelector('.expanded-side-category-toggle');
        
        if (category.classList.contains('collapsed')) {
            category.classList.remove('collapsed');
            if (toggleIcon) {
                toggleIcon.classList.remove('fa-chevron-down');
                toggleIcon.classList.add('fa-chevron-up');
            }
        } else {
            category.classList.add('collapsed');
            if (toggleIcon) {
                toggleIcon.classList.remove('fa-chevron-up');
                toggleIcon.classList.add('fa-chevron-down');
            }
        }
    }
    
    // Make function globally available
    window.toggleExpandedSideCategory = toggleExpandedSideCategory;
    
    /**
     * Update the counter for expanded side category title
     * @param {HTMLElement} categoryContainer - The category container element
     */
    function updateExpandedSideCategoryCounter(categoryContainer) {
        if (!categoryContainer) return;
        
        const selectedSides = categoryContainer.querySelectorAll('.expanded-side-option.selected');
        const count = selectedSides.length;
        
        const titleElement = categoryContainer.querySelector('.expanded-side-category-title');
        if (!titleElement) return;
        
        let countElement = titleElement.querySelector('.expanded-side-category-count');
        if (!countElement) {
            // Create counter if it doesn't exist
            const spanElement = titleElement.querySelector('span');
            if (spanElement) {
                countElement = document.createElement('span');
                countElement.className = 'expanded-side-category-count';
                spanElement.appendChild(countElement);
            } else {
                return;
            }
        }
        
        // Update counter text and visibility
        if (count > 0) {
            countElement.textContent = `(${count})`;
            countElement.style.display = '';
        } else {
            countElement.textContent = '(0)';
            countElement.style.display = 'none';
        }
    }
    
    // Make function globally available
    window.updateExpandedSideCategoryCounter = updateExpandedSideCategoryCounter;
    
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
        
        // Calculate modification and addition prices
        let modificationPrice = 0;
        const selectedModifications = card.querySelectorAll('.expanded-addition-option.selected[data-addition-type="modification"]');
        selectedModifications.forEach(modification => {
            const price = parseFloat(modification.getAttribute('data-addition-price')) || 0;
            modificationPrice += price;
        });
        
        let additionPrice = 0;
        const selectedAdditions = card.querySelectorAll('.expanded-addition-option.selected[data-addition-type="addition"]');
        selectedAdditions.forEach(addition => {
            const price = parseFloat(addition.getAttribute('data-addition-price')) || 0;
            additionPrice += price;
        });
        
        const totalModAndAddPrice = modificationPrice + additionPrice;
        
        // Get quantity
        const quantitySpan = card.querySelector('.expanded-quantity');
        const quantity = parseInt(quantitySpan?.textContent) || 1;
        
        // Calculate total
        const totalPrice = (baseUnitPrice + sidePrice + totalModAndAddPrice) * quantity;
        
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
        const selectedVariable1 = card.getAttribute('data-selected-variable1') || '-';
        const selectedVariable2 = card.getAttribute('data-selected-variable2') || '-';
        
        // Find matching price in prices array (format: [variable1, variable2, price, ...])
        let unitPrice = 0;
        
        // First try exact match
        for (let i = 0; i < pricesArray.length; i += 3) {
            if (i + 2 < pricesArray.length) {
                const v1 = pricesArray[i];
                const v2 = pricesArray[i + 1];
                const price = parseFloat(pricesArray[i + 2]);
                
                if (v1 === selectedVariable1 && v2 === selectedVariable2 && !isNaN(price) && price > 0) {
                    unitPrice = price;
                    break;
                }
            }
        }
        
        // If no exact match, try matching just variable2 (when variable1 is "-")
        if (unitPrice === 0 && selectedVariable1 === '-') {
            for (let i = 0; i < pricesArray.length; i += 3) {
                if (i + 2 < pricesArray.length) {
                    const v1 = pricesArray[i];
                    const v2 = pricesArray[i + 1];
                    const price = parseFloat(pricesArray[i + 2]);
                    
                    if (v1 === '-' && v2 === selectedVariable2 && !isNaN(price) && price > 0) {
                        unitPrice = price;
                        break;
                    }
                }
            }
        }
        
        // If still no match, try matching just variable1 (when variable2 is "-")
        if (unitPrice === 0 && selectedVariable2 === '-') {
            for (let i = 0; i < pricesArray.length; i += 3) {
                if (i + 2 < pricesArray.length) {
                    const v1 = pricesArray[i];
                    const v2 = pricesArray[i + 1];
                    const price = parseFloat(pricesArray[i + 2]);
                    
                    if (v1 === selectedVariable1 && v2 === '-' && !isNaN(price) && price > 0) {
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
        
        // Apply promotion discount if active
        const promoPercent = parseInt(card.getAttribute('data-active-promo-percent')) || 0;
        let displayUnitPrice = unitPrice;
        if (promoPercent > 0) {
            displayUnitPrice = unitPrice * (100 - promoPercent) / 100;
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
        
        const totalPrice = (displayUnitPrice + sidePrice) * quantity;
        
        const priceElement = card.querySelector('.expanded-price');
        const addCartButton = card.querySelector('.expanded-add-cart');
        const priceButton = addCartButton?.querySelector('.cart-button-price');
        
        if (priceElement) {
            if (promoPercent > 0) {
                priceElement.innerHTML = `<span class="menu-item-price-original">$${unitPrice.toFixed(2).replace(/\.00$/, '')}</span> <span class="menu-item-price-promo">$${displayUnitPrice.toFixed(2).replace(/\.00$/, '')}</span>`;
            } else {
                priceElement.textContent = `$${unitPrice.toFixed(2).replace(/\.00$/, '')}`;
            }
            priceElement.setAttribute('data-unit-price', displayUnitPrice.toString());
            priceElement.setAttribute('data-original-unit-price', unitPrice.toString());
            priceElement.setAttribute('data-promo-percent', promoPercent.toString());
        }
        
        if (addCartButton) {
            addCartButton.setAttribute('data-unit-price', displayUnitPrice.toString());
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
        if (card.classList.contains('menu-item-unavailable')) {
            alert('This item is not currently available. Lunch items are available Monday–Friday, 11AM–2PM.');
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
                const config = category.config || {};
                const minimum = config.minimum || 0;
                
                if (minimum > 0) {
                    const categoryContainer = card.querySelector(`.expanded-side-category[data-category-name="${categoryName}"]`);
                    if (categoryContainer) {
                        const selectedSides = categoryContainer.querySelectorAll('.expanded-side-option.selected');
                        // In expanded view, each selected item counts as 1
                        const totalQuantity = selectedSides.length;
                        
                        if (totalQuantity < minimum) {
                            missingSelections.push({
                                name: displayName || categoryName,
                                required: minimum,
                                selected: totalQuantity
                            });
                        }
                    } else {
                        // Category container not found, assume no selections
                        missingSelections.push({
                            name: displayName || categoryName,
                            required: minimum,
                            selected: 0
                        });
                    }
                }
            });
            
            if (missingSelections.length > 0) {
                const messages = missingSelections.map(sel => 
                    `"${sel.name}": ${sel.selected} selected (minimum ${sel.required} required)`
                );
                alert(`Please select the required side categories before adding to cart:\n\n${messages.join('\n')}`);
                return;
            }
        }

        // Get item details
        const quantitySpan = card.querySelector('.expanded-quantity');
        const quantity = parseInt(quantitySpan?.textContent) || 1;
        
        const titleElement = card.querySelector('.menu-item-title a') || card.querySelector('.menu-item-title');
        const itemName = titleElement?.textContent?.trim() || '';
        
        // Get selected variable1 and variable2
        const selectedVariable1 = card.getAttribute('data-selected-variable1') || '-';
        const selectedVariable2 = card.getAttribute('data-selected-variable2') || '-';
        
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
            // Combine variable1 and variable2 for the size parameter (format: "variable1 variable2")
            const size = selectedVariable1 !== '-' && selectedVariable2 !== '-' 
                ? `${selectedVariable1} ${selectedVariable2}`.trim()
                : selectedVariable1 !== '-' ? selectedVariable1 : (selectedVariable2 !== '-' ? selectedVariable2 : '-');
            
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
            
            // Get selected modifications and additions separately
            const selectedModifications = card.querySelectorAll('.expanded-addition-option.selected[data-addition-type="modification"]');
            const selectedAdditions = card.querySelectorAll('.expanded-addition-option.selected[data-addition-type="addition"]');
            
            const mods = [];
            selectedModifications.forEach(modification => {
                const modName = modification.getAttribute('data-addition-name');
                const modPrice = parseFloat(modification.getAttribute('data-addition-price')) || 0;
                if (modName) {
                    mods.push(modName, modPrice);
                }
            });
            
            const adds = [];
            selectedAdditions.forEach(addition => {
                const additionName = addition.getAttribute('data-addition-name');
                const additionPrice = parseFloat(addition.getAttribute('data-addition-price')) || 0;
                if (additionName) {
                    adds.push(additionName, additionPrice);
                }
            });
            
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
            const sideAndAddTotal = (sidePrice + additionPrice) * quantity;
            const promotionsAttr = card.getAttribute('data-promotions');
            const pricesArrayAttr = card.getAttribute('data-prices-array');
            const availabilityAttr = card.getAttribute('data-availability');
            const promoData = (promotionsAttr || pricesArrayAttr || availabilityAttr) ? { promotions: promotionsAttr, pricesArray: pricesArrayAttr, sideAndAddTotal, availability: availabilityAttr } : undefined;
            
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
            
            addItem(itemName, size, sidesData, adds, mods, quantity.toString(), finalTotalCost, promoData);
            
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
        if (document.body.classList.contains('single-page-unavailable')) {
            alert('This item is not currently available. Lunch items are available Monday–Friday, 11AM–2PM.');
            return;
        }
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
                const config = category.config || {};
                const minimum = config.minimum || 0;
                
                if (minimum > 0) {
                    const categoryContainer = document.querySelector(`.single-page-side-category[data-category-name="${categoryName}"]`);
                    if (categoryContainer) {
                        const selectedSides = categoryContainer.querySelectorAll('.single-page-side-option.selected');
                        
                        // Calculate total quantity (handling quantity displays)
                        let totalQuantity = 0;
                        selectedSides.forEach(side => {
                            const qtyElement = side.closest('.single-page-side-item')?.querySelector('.single-page-side-quantity');
                            totalQuantity += qtyElement ? parseInt(qtyElement.textContent) || 1 : 1;
                        });
                        
                        if (totalQuantity < minimum) {
                            missingSelections.push({
                                name: displayName || categoryName,
                                required: minimum,
                                selected: totalQuantity
                            });
                        }
                    } else {
                        // Category container not found, assume no selections
                        missingSelections.push({
                            name: displayName || categoryName,
                            required: minimum,
                            selected: 0
                        });
                    }
                }
            });
            
            if (missingSelections.length > 0) {
                const messages = missingSelections.map(sel => 
                    `"${sel.name}": ${sel.selected} selected (minimum ${sel.required} required)`
                );
                alert(`Please select the required side categories before adding to cart:\n\n${messages.join('\n')}`);
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
            // Get selected variable1 and variable2
            const selectedVariable1Option = document.querySelector('.single-page-option[data-option-type="variable1"].selected');
            const selectedVariable2Option = document.querySelector('.single-page-option[data-option-type="variable2"].selected');
            const selectedVariable1 = selectedVariable1Option?.getAttribute('data-option-value') || '-';
            const selectedVariable2 = selectedVariable2Option?.getAttribute('data-option-value') || '-';
            
            // Combine variable1 and variable2 for the size parameter
            let size = '-';
            if (selectedVariable1 !== '-' && selectedVariable2 !== '-') {
                size = `${selectedVariable1} ${selectedVariable2}`.trim();
            } else if (selectedVariable1 !== '-') {
                size = selectedVariable1;
            } else if (selectedVariable2 !== '-') {
                size = selectedVariable2;
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
            
            // Get selected modifications and additions separately
            const selectedModifications = document.querySelectorAll('.single-page-addition-option.selected[data-addition-type="modification"]');
            const selectedAdditions = document.querySelectorAll('.single-page-addition-option.selected[data-addition-type="addition"]');
            
            const mods = [];
            selectedModifications.forEach(modification => {
                const modName = modification.getAttribute('data-addition-name');
                const modPrice = parseFloat(modification.getAttribute('data-addition-price')) || 0;
                if (modName) {
                    mods.push(modName, modPrice);
                }
            });
            
            const adds = [];
            selectedAdditions.forEach(addition => {
                const additionName = addition.getAttribute('data-addition-name');
                const additionPrice = parseFloat(addition.getAttribute('data-addition-price')) || 0;
                if (additionName) {
                    adds.push(additionName, additionPrice);
                }
            });
            
            // Recalculate total cost including sides, modifications, and additions
            let sidePrice = 0;
            selectedSides.forEach(side => {
                const price = parseFloat(side.getAttribute('data-item-price')) || 0;
                sidePrice += price;
            });
            
            let modificationPrice = 0;
            selectedModifications.forEach(modification => {
                const price = parseFloat(modification.getAttribute('data-addition-price')) || 0;
                modificationPrice += price;
            });
            
            let additionPrice = 0;
            selectedAdditions.forEach(addition => {
                const price = parseFloat(addition.getAttribute('data-addition-price')) || 0;
                additionPrice += price;
            });
            
            const totalModAndAddPrice = modificationPrice + additionPrice;
            const finalTotalCost = (unitPrice + sidePrice + totalModAndAddPrice) * quantity;
            const sideAndAddTotal = (sidePrice + totalModAndAddPrice) * quantity;
            const promotionsAttr = dataContainer.getAttribute('data-promotions');
            const pricesArrayAttr = dataContainer.getAttribute('data-prices-array');
            const availabilityAttr = dataContainer.getAttribute('data-availability');
            const promoData = (promotionsAttr || pricesArrayAttr || availabilityAttr) ? { promotions: promotionsAttr, pricesArray: pricesArrayAttr, sideAndAddTotal, availability: availabilityAttr } : undefined;
            
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
            
            addItem(itemName, size, sidesData, adds, mods, quantity.toString(), finalTotalCost, promoData);
            
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
        
        // Get selected variable1 and variable2
        const selectedVariable1Option = document.querySelector('.single-page-option[data-option-type="variable1"].selected');
        const selectedVariable2Option = document.querySelector('.single-page-option[data-option-type="variable2"].selected');
        const selectedVariable1 = selectedVariable1Option?.getAttribute('data-option-value') || '-';
        const selectedVariable2 = selectedVariable2Option?.getAttribute('data-option-value') || '-';
        
        // Find matching price
        let unitPrice = 0;
        for (let i = 0; i < pricesArray.length; i += 3) {
            if (i + 2 < pricesArray.length) {
                const v1 = pricesArray[i];
                const v2 = pricesArray[i + 1];
                const price = parseFloat(pricesArray[i + 2]);
                
                if (v1 === selectedVariable1 && v2 === selectedVariable2 && !isNaN(price) && price > 0) {
                    unitPrice = price;
                    break;
                }
            }
        }
        
        // If no exact match, try matching just variable2 (when variable1 is "-")
        if (unitPrice === 0 && selectedVariable1 === '-') {
            for (let i = 0; i < pricesArray.length; i += 3) {
                if (i + 2 < pricesArray.length) {
                    const v1 = pricesArray[i];
                    const v2 = pricesArray[i + 1];
                    const price = parseFloat(pricesArray[i + 2]);
                    
                    if (v1 === '-' && v2 === selectedVariable2 && !isNaN(price) && price > 0) {
                        unitPrice = price;
                        break;
                    }
                }
            }
        }
        
        // If still no match, try matching just variable1 (when variable2 is "-")
        if (unitPrice === 0 && selectedVariable2 === '-') {
            for (let i = 0; i < pricesArray.length; i += 3) {
                if (i + 2 < pricesArray.length) {
                    const v1 = pricesArray[i];
                    const v2 = pricesArray[i + 1];
                    const price = parseFloat(pricesArray[i + 2]);
                    
                    if (v1 === selectedVariable1 && v2 === '-' && !isNaN(price) && price > 0) {
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
        
        // Apply promotion discount if active
        const promoPercent = parseInt(dataContainer.getAttribute('data-active-promo-percent')) || 0;
        if (promoPercent > 0) {
            unitPrice = unitPrice * (100 - promoPercent) / 100;
        }
        
        // Calculate side prices
        let sidePrice = 0;
        const selectedSides = document.querySelectorAll('.single-page-side-option.selected');
        selectedSides.forEach(side => {
            const price = parseFloat(side.getAttribute('data-item-price')) || 0;
            sidePrice += price;
        });
        
        // Calculate modification and addition prices separately
        let modificationPrice = 0;
        const selectedModifications = document.querySelectorAll('.single-page-addition-option.selected[data-addition-type="modification"]');
        selectedModifications.forEach(modification => {
            const price = parseFloat(modification.getAttribute('data-addition-price')) || 0;
            modificationPrice += price;
        });
        
        let additionPrice = 0;
        const selectedAdditions = document.querySelectorAll('.single-page-addition-option.selected[data-addition-type="addition"]');
        selectedAdditions.forEach(addition => {
            const price = parseFloat(addition.getAttribute('data-addition-price')) || 0;
            additionPrice += price;
        });
        
        const totalModAndAddPrice = modificationPrice + additionPrice;
        const totalPrice = (unitPrice + sidePrice + totalModAndAddPrice) * quantity;
        
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

    /** Rebuild expanded menu panel from card data-* (used by dashboard edit after Apply). */
    window.expandMenuItemCard = expandItem;

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

        function parseTime(timeStr, baseDate) {
            if (!timeStr) return null;
            const [hours, minutes] = timeStr.split(':').map(Number);
            const date = new Date(baseDate || now);
            date.setHours(hours, minutes, 0, 0);
            return date;
        }

        function getHoursForDay(day, baseDate) {
            if (!openingHours[day] || !Array.isArray(openingHours[day])) return null;
            
            const entries = openingHours[day];
            let openTimeStr = null;
            let closeTimeStr = null;

            for (const entry of entries) {
                if (entry.type === 'Open') {
                    openTimeStr = entry.time;
                } else if (entry.type === 'Close') {
                    closeTimeStr = entry.time;
                }
            }

            if (!openTimeStr || !closeTimeStr) return null;

            return { 
                openTime: parseTime(openTimeStr, baseDate),
                closeTime: parseTime(closeTimeStr, baseDate),
                openTimeStr,
                closeTimeStr
            };
        }

        // Check yesterday's overnight hours first (for places that close after midnight)
        const yesterdayDate = new Date(now);
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const yesterdayHours = getHoursForDay(yesterdayDay, yesterdayDate);
        
        if (yesterdayHours && yesterdayHours.openTime && yesterdayHours.closeTime) {
            const yesterdayOpen = yesterdayHours.openTime;
            let yesterdayClose = new Date(yesterdayHours.closeTime);
            
            // Parse close time to check if it's overnight
            const [closeHours, closeMins] = yesterdayHours.closeTimeStr.split(':').map(Number);
            const [openHours, openMins] = yesterdayHours.openTimeStr.split(':').map(Number);
            
            // If close time is before open time, it's overnight (closes next day)
            if (closeHours < openHours || (closeHours === openHours && closeMins <= openMins)) {
                yesterdayClose.setDate(yesterdayClose.getDate() + 1);
            }

            if (now >= yesterdayOpen && now < yesterdayClose) {
                const minsToClose = Math.floor((yesterdayClose - now) / 60000);
                if (minsToClose <= 30 && minsToClose > 0) {
                    return { type: 'soon-close', text: 'Closes Soon' };
                }
                return { type: 'open', text: 'Open' };
            }
        }

        // Check today's hours
        const todayHours = getHoursForDay(todayDay, now);
        if (todayHours && todayHours.openTime && todayHours.closeTime) {
            const todayOpen = todayHours.openTime;
            let todayClose = new Date(todayHours.closeTime);
            
            // Parse close time to check if it's overnight
            const [closeHours, closeMins] = todayHours.closeTimeStr.split(':').map(Number);
            const [openHours, openMins] = todayHours.openTimeStr.split(':').map(Number);
            
            // If close time is before or equal to open time, it's overnight (closes next day)
            if (closeHours < openHours || (closeHours === openHours && closeMins <= openMins)) {
                todayClose.setDate(todayClose.getDate() + 1);
            }

            if (now >= todayOpen && now < todayClose) {
                const minsToClose = Math.floor((todayClose - now) / 60000);
                if (minsToClose <= 30 && minsToClose > 0) {
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
