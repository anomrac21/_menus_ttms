/**
 * TTMenus v2 - Basic UI Interactions
 * Essential JavaScript for theme functionality
 */

(function() {
    'use strict';

    function init() {
        hideAllPanels();
        hydrateAllDraftMenuCardImages();
        initializeFooter();
        initializeModals();
        bindMenuInteractions();
        applyDayBasedPromos();
        initializeFooterVisibility();
        if (typeof window.initSinglePageFeatures === 'function') {
            window.initSinglePageFeatures();
        }
        // Packery removed - no initialization needed
    }

    /**
     * Fetch current weekday and time from trusted time API (not browser date).
     * Uses WorldTimeAPI; on failure, promos are not applied.
     * @returns {{ day: string, hour: number, minute: number }|null}
     */
    async function fetchDateTimeFromAPI() {
        try {
            const cachedRaw = sessionStorage.getItem('ttms_datetime_cache');
            if (cachedRaw) {
                const cached = JSON.parse(cachedRaw);
                if (cached && cached.expires > Date.now() && cached.data && cached.data.day) {
                    return cached.data;
                }
            }

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
            const result = day ? { day, hour, minute } : null;
            if (result) {
                sessionStorage.setItem('ttms_datetime_cache', JSON.stringify({
                    data: result,
                    expires: Date.now() + (5 * 60 * 1000)
                }));
            }
            return result;
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

    /** Promo image for today (ignores time windows — art shows all day on promo days). */
    function getPromoImageForDay(promotionsJson, today) {
        if (!promotionsJson || !today) return '';
        let promotions;
        try { promotions = typeof promotionsJson === 'string' ? JSON.parse(promotionsJson) : promotionsJson; } catch (_) { return ''; }
        if (!Array.isArray(promotions)) return '';
        for (let i = 0; i < promotions.length; i++) {
            const p = promotions[i];
            if (p && p.image && p.days && Array.isArray(p.days) && p.days.includes(today)) {
                return String(p.image);
            }
        }
        return '';
    }

    function getBasePriceFromPricesArray(pricesArray) {
        if (!pricesArray) return 0;
        let arr;
        try {
            arr = typeof pricesArray === 'string' ? JSON.parse(pricesArray) : pricesArray;
        } catch (_) {
            return 0;
        }
        if (!Array.isArray(arr)) return 0;
        const prices = [];
        for (let i = 2; i < arr.length; i += 3) { const n = parseFloat(arr[i]); if (!isNaN(n) && n > 0) prices.push(n); }
        return prices.length ? (prices.length === 1 ? prices[0] : Math.min(...prices)) : 0;
    }

    function getPriceRangeFromPricesArray(pricesArray) {
        if (!pricesArray) return null;
        let arr;
        try {
            arr = typeof pricesArray === 'string' ? JSON.parse(pricesArray) : pricesArray;
        } catch (_) {
            return null;
        }
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

        updateMenuItemCardImage(card, promo, today);
    }

    function parseJsonAttr(el, name) {
        try {
            const v = JSON.parse(el.getAttribute(name) || '[]');
            return Array.isArray(v) ? v : [];
        } catch (_) {
            return [];
        }
    }

    function menuCardImageSrc(path) {
        const p = String(path || '').replace(/^\//, '');
        if (!p) return '';
        if (p.indexOf('draft-assets/') === 0) {
            return resolveCmsDraftAssetPreviewUrl(p);
        }
        return (typeof window !== 'undefined' && window.TtmsThumbor && window.TtmsThumbor.menuImageSrc)
            ? window.TtmsThumbor.menuImageSrc(p, 'card')
            : '/' + p;
    }

    function isReelsSmashPassCard(card) {
        return !!(
            card &&
            card.classList.contains('menu-reels-slide') &&
            typeof window.MENU_IMAGE_CONFIG !== 'undefined' &&
            window.MENU_IMAGE_CONFIG.enabled
        );
    }

    function ensureCardImageLink(card) {
        if (isReelsSmashPassCard(card)) return null;
        let imgLink = card.querySelector('.menu-item-image-link');
        if (imgLink) return imgLink;
        const allImages = parseJsonAttr(card, 'data-images-array');
        if (!allImages.length) return null;
        const rowTop = card.querySelector('.menu-item-row-top');
        const itemUrl = card.getAttribute('data-item-url');
        if (!rowTop || !itemUrl) return null;
        imgLink = document.createElement('a');
        imgLink.href = itemUrl;
        imgLink.className = 'menu-item-image-link';
        const wrap = document.createElement('div');
        wrap.className = 'menu-item-image';
        const img = document.createElement('img');
        img.className = 'menu-item-img';
        img.loading = 'lazy';
        img.alt = (card.querySelector('.menu-item-title') && card.querySelector('.menu-item-title').textContent.trim()) || '';
        const initialPath = selectMenuCardImagePath({
            dayPromoImage: '',
            regular: parseJsonAttr(card, 'data-regular-images-array'),
            allImages: allImages,
            promotionsJson: card.getAttribute('data-promotions') || '',
        }) || normalizeMenuItemImagePath(allImages[0]);
        img.setAttribute('data-src-path', initialPath);
        if (!isDraftAssetPath(initialPath)) {
            const initialSrc = menuCardImageSrc(initialPath);
            if (initialSrc) img.src = initialSrc;
        }
        img.onerror = function () {
            const fallback = resolvePublicMenuImageFallback(this);
            if (fallback) {
                applyMenuCardImagePath(this, fallback);
                return;
            }
            const p = this.getAttribute('data-src-path') || '';
            if (isDraftAssetPath(p)) return;
            if (window.TtmsThumbor && window.TtmsThumbor.fallbackImg) window.TtmsThumbor.fallbackImg(this);
        };
        wrap.appendChild(img);
        imgLink.appendChild(wrap);
        rowTop.insertBefore(imgLink, rowTop.firstChild);
        card.classList.add('menu-item-card--has-image');
        return imgLink;
    }

    /**
     * Card thumbnail: promo art for today (any time) → item photos → data-images-array. Never hide if a path exists.
     */
    function updateMenuItemCardImage(card, promo, today) {
        if (isReelsSmashPassCard(card)) {
            const staleLink = card.querySelector('.menu-item-image-link');
            if (staleLink) staleLink.remove();
            return;
        }
        ensureCardImageLink(card);
        const imgLink = card.querySelector('.menu-item-image-link');
        if (!imgLink) return;
        const img = imgLink.querySelector('.menu-item-img');
        if (!img) return;

        const regular = parseJsonAttr(card, 'data-regular-images-array');
        const allImages = parseJsonAttr(card, 'data-images-array');
        const promotionsJson = card.getAttribute('data-promotions');
        const dayPromoImage = today ? getPromoImageForDay(promotionsJson, today) : '';

        const path = selectMenuCardImagePath({
            dayPromoImage: dayPromoImage,
            regular: regular,
            allImages: allImages,
            promotionsJson: promotionsJson,
        });

        if (path) {
            const isDraft = path.indexOf('draft-assets/') === 0;
            const nextSrc = menuCardImageSrc(path);
            img.setAttribute('data-src-path', path);
            if (isDraft) {
                delete img.dataset.draftAssetHydrated;
                delete img.dataset.fellback;
                img.removeAttribute('src');
                if (path) img.setAttribute('data-draft-pending', '1');
            } else if (nextSrc && img.src !== nextSrc) {
                delete img.dataset.draftAssetHydrated;
                img.removeAttribute('data-draft-pending');
                img.src = nextSrc;
            }
            hydrateAuthenticatedDraftAssetImg(img);
            imgLink.style.display = '';
        } else if (img.getAttribute('src')) {
            imgLink.style.display = '';
        } else if (allImages.length > 0) {
            imgLink.style.display = '';
        }
    }

    function applyPromoToSinglePage(dataEl, today, timeInfo) {
        const promotions = dataEl.getAttribute('data-promotions');
        const promo = getActivePromoForDay(promotions, today, timeInfo);
        const pct = promo && promo.type === 'percent_off' && promo.value ? parseInt(promo.value) : 0;
        dataEl.setAttribute('data-active-promo-percent', String(pct));

        const badge = document.querySelector('.single-page-title .menu-item-promo-badge, h3.menu-item-title.single-page-title .menu-item-promo-badge');
        if (badge) {
            if (promo && promo.label) {
                badge.innerHTML = '<span class="menu-item-promo-label">Promotion</span> <span class="menu-item-promo-value">' + promo.label + '</span>';
                badge.style.display = '';
            } else { badge.style.display = 'none'; }
        } else if (promo && promo.label) {
            const title = document.querySelector('.single-page-title, h3.menu-item-title.single-page-title');
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
        const addCartSection = document.querySelector('.single-page-add-cart, .single-page-item-card .expanded-item-controls');
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
        const addBtn = document.querySelector('.single-page-add-cart-btn, .single-page-item-card .expanded-add-cart');
        if (addBtn) addBtn.disabled = !available;
    }

    /**
     * Images for expanded carousel: API/images attr, then promo, regular, card thumbnail.
     * @param {HTMLElement} card
     * @param {string[]} imagesFromApi
     * @returns {string[]}
     */
    function resolveExpandedImagesForCarousel(card, imagesFromApi) {
        const seen = new Set();
        const out = [];
        function add(path) {
            if (!path) return;
            const p = String(path).replace(/^\//, '');
            if (!p || seen.has(p)) return;
            seen.add(p);
            out.push(p);
        }

        if (Array.isArray(imagesFromApi)) {
            imagesFromApi.forEach(add);
        }
        if (out.length) return out;

        const cardAttr = card.getAttribute('data-images-array');
        if (cardAttr) {
            try {
                JSON.parse(cardAttr).forEach(add);
            } catch (_) { /* ignore */ }
        }
        if (out.length) return out;

        const dt = window.__ttmsDateTime || getLocalDateTime();
        const promo = getActivePromoForDay(
            card.getAttribute('data-promotions'),
            dt.day,
            { hour: dt.hour, minute: dt.minute }
        );
        if (promo && promo.image) add(promo.image);

        const regularAttr = card.getAttribute('data-regular-images-array');
        if (regularAttr) {
            try {
                JSON.parse(regularAttr).forEach(add);
            } catch (_) { /* ignore */ }
        }

        const thumb = card.querySelector('.menu-item-img');
        if (thumb && thumb.src) {
            try {
                const u = new URL(thumb.src, window.location.origin);
                if (u.pathname && u.pathname !== '/') {
                    add(u.pathname);
                }
            } catch (_) { /* ignore */ }
        }

        return out;
    }

    function applyPromosWithDay(dateTime) {
        if (!dateTime) return;
        window.__ttmsDateTime = dateTime;
        const { day: today, hour, minute } = dateTime;
        const timeInfo = { hour, minute };
        document.querySelectorAll('.menu-item-card:not(.single-page-item-card)').forEach(card => {
            try {
                applyPromoToCard(card, today, timeInfo);
            } catch (err) {
                console.warn('[TTMS main] applyPromoToCard failed:', err);
            }
        });
        document.querySelectorAll('.menu-item-card[data-availability]').forEach(card => {
            try {
                applyAvailabilityToCard(card, today, timeInfo);
            } catch (err) {
                console.warn('[TTMS main] applyAvailabilityToCard failed:', err);
            }
        });
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
            cart.setAttribute('aria-hidden', 'true');
        }
        document.body.classList.remove('cart-open');

        // Hide search
        const search = document.getElementById('search');
        if (search) {
            search.classList.add('hide-search');
        }

        // Hide settings/accessibility panel
        const settings = document.getElementById('footerSettings');
        if (settings) {
            settings.classList.add('hide');
            settings.setAttribute('aria-hidden', 'true');
        }

        // Hide order modal
        // Order modal removed - no longer needed

        // Hide dashboard
        if (typeof window.closeDashboard === 'function') {
            window.closeDashboard();
        } else {
            const dashboard = document.getElementById('dashboard');
            if (dashboard) {
                dashboard.classList.add('loader-hide-left');
                dashboard.setAttribute('aria-hidden', 'true');
            }
            document.body.classList.remove('modal-open');
        }
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

    function setCartModalOpen(isOpen) {
        const cart = document.getElementById('cart');
        if (cart) {
            cart.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
        }
        document.body.classList.toggle('cart-open', isOpen);
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
            setCartModalOpen(true);
            footerBtns.classList.add('bigfont');
            footerBtns.classList.add('cartopen');
            footerBtns.classList.remove('smallfont');
            footerBtns.classList.add('grad1');
            footerBtns.classList.remove('grad2');
            if (typeof window.updateCartLocationDisplay === 'function') {
                window.updateCartLocationDisplay();
            }
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
        setCartModalOpen(false);
        footerBtns.classList.remove('cartopen');
        footerBtns.classList.add('grad2');
        footerBtns.classList.remove('grad1');
        footerBtns.classList.remove('bigfont');
        footerBtns.classList.add('smallfont');
    }

    /**
     * Toggle footer accessibility/settings panel
     * @global
     */
    function toggleFooterAccessibility() {
        const settings = document.getElementById('footerSettings');
        const footerBtns = document.getElementById('footerBtns');
        const settingsToggle = footerBtns && footerBtns.querySelector('.footer-dock__action--settings');
        
        if (!settings || !footerBtns) return;

        if (settings.classList.contains('hide')) {
            settings.classList.remove('hide');
            settings.setAttribute('aria-hidden', 'false');
            footerBtns.classList.add('bigfont');
            footerBtns.classList.remove('smallfont');
            footerBtns.classList.add('grad1');
            footerBtns.classList.remove('grad2');
            if (settingsToggle) {
                settingsToggle.setAttribute('aria-expanded', 'true');
            }
        } else {
            settings.classList.add('hide');
            settings.setAttribute('aria-hidden', 'true');
            footerBtns.classList.add('grad2');
            footerBtns.classList.remove('grad1');
            footerBtns.classList.remove('bigfont');
            footerBtns.classList.add('smallfont');
            if (settingsToggle) {
                settingsToggle.setAttribute('aria-expanded', 'false');
            }
        }
    }

    let footerVisibilityCleanup = null;

    /**
     * Hide footer when promotions/ads are visible in viewport
     */
    function initializeFooterVisibility() {
        if (footerVisibilityCleanup) {
            footerVisibilityCleanup();
            footerVisibilityCleanup = null;
        }

        const footer = document.getElementById('footer');
        if (!footer) return;

        const adSelectors = [
            '#homepage-ads-container',
            '#client-ads-container',
            '#pageadscontainer',
            '#frontpage-ads-container',
            '.frontpageads'
        ];

        let visibleAdCount = 0;
        const trackedElements = new WeakSet();

        function hasRealAdContent(el) {
            return el.children.length > 0 &&
                !el.textContent.includes('Loading') &&
                !el.textContent.includes('Loading promotions') &&
                el.offsetHeight > 0 &&
                el.offsetWidth > 0;
        }

        function syncFooterDisplay() {
            footer.style.display = visibleAdCount > 0 ? 'none' : '';
        }

        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!hasRealAdContent(entry.target)) {
                    return;
                }

                if (entry.isIntersecting) {
                    if (!entry.target._ttmsAdVisible) {
                        entry.target._ttmsAdVisible = true;
                        visibleAdCount += 1;
                    }
                } else if (entry.target._ttmsAdVisible) {
                    entry.target._ttmsAdVisible = false;
                    visibleAdCount = Math.max(0, visibleAdCount - 1);
                }
            });
            syncFooterDisplay();
        }, {
            root: null,
            rootMargin: '0px',
            threshold: 0.1
        });

        function observeAdElements() {
            adSelectors.forEach((selector) => {
                document.querySelectorAll(selector).forEach((el) => {
                    if (trackedElements.has(el) || !hasRealAdContent(el)) {
                        return;
                    }
                    trackedElements.add(el);
                    observer.observe(el);
                });
            });
        }

        function onAdsPopulated() {
            observeAdElements();
        }

        observeAdElements();
        syncFooterDisplay();
        window.addEventListener('adsPopulated', onAdsPopulated);

        footerVisibilityCleanup = function () {
            observer.disconnect();
            window.removeEventListener('adsPopulated', onAdsPopulated);
        };
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
                if (typeof window.closeDashboard === 'function') {
                    window.closeDashboard();
                }
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

    function isDraftAssetPath(path) {
        return String(path || '').replace(/^\/+/, '').indexOf('draft-assets/') === 0;
    }

    function firstPublicImageFromList(list) {
        for (let i = 0; i < list.length; i++) {
            const p = normalizeMenuItemImagePath(list[i]);
            if (p && !isDraftAssetPath(p)) return p;
        }
        return '';
    }

    function promoImagesFromCard(promotionsJson) {
        const out = [];
        try {
            const promos = JSON.parse(promotionsJson || '[]');
            if (Array.isArray(promos)) {
                promos.forEach(function (p) {
                    if (p && p.image) out.push(p.image);
                });
            }
        } catch (_) { /* ignore */ }
        return out;
    }

    function selectMenuCardImagePath(opts) {
        const dayPromoImage = opts.dayPromoImage || '';
        const regular = opts.regular || [];
        const allImages = opts.allImages || [];
        const promotionsJson = opts.promotionsJson || '';

        if (dayPromoImage) return dayPromoImage;

        const fromRegular = firstPublicImageFromList(regular);
        if (fromRegular) return fromRegular;

        const fromAll = firstPublicImageFromList(allImages);
        if (fromAll) return fromAll;

        const fromPromos = firstPublicImageFromList(promoImagesFromCard(promotionsJson));
        if (fromPromos) return fromPromos;

        if (regular.length > 0) return normalizeMenuItemImagePath(regular[0]);
        if (allImages.length > 0) return normalizeMenuItemImagePath(allImages[0]);
        return '';
    }

    function resolvePublicMenuImageFallback(img) {
        if (!img) return '';
        const card = img.closest('.menu-item-card');
        if (!card) return '';

        const regular = parseJsonAttr(card, 'data-regular-images-array');
        const allImages = parseJsonAttr(card, 'data-images-array');
        const promotionsJson = card.getAttribute('data-promotions') || '';
        const current = (img.getAttribute('data-src-path') || '').replace(/^\/+/, '');

        const candidates = []
            .concat(promoImagesFromCard(promotionsJson))
            .concat(regular)
            .concat(allImages);

        for (let i = 0; i < candidates.length; i++) {
            const p = normalizeMenuItemImagePath(candidates[i]);
            if (!p || isDraftAssetPath(p) || p === current) continue;
            return p;
        }
        return '';
    }

    function applyMenuCardImagePath(img, path) {
        if (!img || !path) return;
        const isDraft = isDraftAssetPath(path);
        const nextSrc = menuCardImageSrc(path);
        img.setAttribute('data-src-path', path);
        delete img.dataset.draftAssetHydrated;
        delete img.dataset.fellback;
        if (isDraft) {
            img.removeAttribute('src');
            img.setAttribute('data-draft-pending', '1');
            hydrateAuthenticatedDraftAssetImg(img);
            return;
        }
        img.removeAttribute('data-draft-pending');
        if (nextSrc) img.src = nextSrc;
    }

    /**
     * draft-assets/* are served by CMS preview API (auth required). Static /draft-assets/* 404 until publish.
     */
    function resolveCmsDraftAssetPreviewUrl(path) {
        const p = (path || '').trim().replace(/^\/+/, '');
        if (!p || p.indexOf('draft-assets/') !== 0) return '';
        const base = (window.CMS_SERVICE_URL || 'https://cms.ttmenus.com').replace(/\/+$/, '');
        const cid = window.CMS_CLIENT_ID || window.CLIENT_ID || '_ttms_menu_demo';
        const name = p.replace(/^draft-assets\//, '');
        return base + '/api/clients/' + encodeURIComponent(cid) + '/preview/draft-assets/' + encodeURIComponent(name);
    }

    function cmsAuthHeadersForDraftImage() {
        const h = {};
        const token =
            typeof AuthClient !== 'undefined' && AuthClient.getAccessToken
                ? AuthClient.getAccessToken()
                : typeof localStorage !== 'undefined'
                  ? localStorage.getItem('ttmenus_access_token')
                  : null;
        if (token) h['Authorization'] = 'Bearer ' + token;
        return h;
    }

    function isCmsDraftAssetPreviewUrl(url) {
        return /\/api\/clients\/[^/]+\/preview\/draft-assets\//i.test(String(url || ''));
    }

    /**
     * CMS draft preview URLs require Bearer/cookies; plain <img src> gets 401. Fetch → blob like dashboard thumbs.
     */
    function hydrateAuthenticatedDraftAssetImg(img) {
        if (!img || img.dataset.draftAssetHydrated === '1') return;
        const dataPath = (img.getAttribute('data-src-path') || '').replace(/^\/+/, '');
        let url = img.getAttribute('src') || '';
        if (!isCmsDraftAssetPreviewUrl(url)) {
            if (dataPath.indexOf('draft-assets/') !== 0) return;
            url = resolveCmsDraftAssetPreviewUrl(dataPath);
            if (!url) return;
        }
        if (isCmsDraftAssetPreviewUrl(img.getAttribute('src') || '')) {
            img.removeAttribute('src');
        }
        fetch(url, { credentials: 'include', headers: cmsAuthHeadersForDraftImage() })
            .then(function (res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.blob();
            })
            .then(function (blob) {
                const prev = img.dataset.draftBlobUrl;
                if (prev) {
                    try {
                        URL.revokeObjectURL(prev);
                    } catch (e) {}
                }
                const blobUrl = URL.createObjectURL(blob);
                img.dataset.draftBlobUrl = blobUrl;
                img.dataset.draftAssetHydrated = '1';
                img.removeAttribute('data-draft-pending');
                img.src = blobUrl;
            })
            .catch(function () {
                delete img.dataset.draftAssetHydrated;
                const fallback = resolvePublicMenuImageFallback(img);
                if (fallback) {
                    applyMenuCardImagePath(img, fallback);
                    return;
                }
                if (!isDraftAssetPath(dataPath) && dataPath && window.TtmsThumbor && typeof window.TtmsThumbor.fallbackImg === 'function') {
                    img.setAttribute('data-src-path', dataPath);
                    window.TtmsThumbor.fallbackImg(img);
                }
            });
    }

    function hydrateAllDraftMenuCardImages(root) {
        const scope = root || document;
        scope.querySelectorAll('.menu-item-img, .expanded-image-carousel-img').forEach(function (img) {
            const path = (img.getAttribute('data-src-path') || '').replace(/^\/+/, '');
            if (path.indexOf('draft-assets/') !== 0) return;
            const src = img.getAttribute('src') || '';
            if (src && !isCmsDraftAssetPreviewUrl(src) && img.dataset.draftBlobUrl) return;
            delete img.dataset.fellback;
            delete img.dataset.draftAssetHydrated;
            if (!src || isCmsDraftAssetPreviewUrl(src) || src.indexOf('/draft-assets/') !== -1) {
                img.removeAttribute('src');
            }
            hydrateAuthenticatedDraftAssetImg(img);
        });
    }

    function resolveExpandedImageSrcForPreview(path) {
        const p = (path || '').trim().replace(/^\/+/, '');
        if (!p) return '';
        if (p.indexOf('draft-assets/') === 0) {
            return resolveCmsDraftAssetPreviewUrl(p);
        }
        if (typeof window !== 'undefined' && window.TtmsThumbor && typeof window.TtmsThumbor.menuImageSrc === 'function') {
            return window.TtmsThumbor.menuImageSrc(p, 'carousel');
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

    function isReelsMenuItemCard(element) {
        const track = document.getElementById('menu-reels-track');
        return !!(track && element && track.contains(element) && element.classList.contains('menu-reels-slide'));
    }

    function isMenuItemExpanded(element) {
        if (!element) return false;
        if (isReelsMenuItemCard(element)) {
            const modal = document.getElementById('menu-reels-item-modal');
            if (modal && modal.classList.contains('is-open') &&
                typeof window.getMenuReelsModalActiveCard === 'function' &&
                window.getMenuReelsModalActiveCard() === element) {
                return true;
            }
            return false;
        }
        return element.classList.contains('expanded') || element.getAttribute('data-item-expanded') === 'true';
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
        if (card && card.classList.contains('single-page-item-card')) return;

        if (event && event.target?.closest?.('.menu-favorite-btn')) {
            return;
        }

        if (event && event.target?.closest?.('.menu-image-add-btn, .menu-add-photo-btn, .menu-image-actions')) {
            return;
        }

        if (event && event.target?.closest?.('.menu-smash-pass-card__title-link')) {
            return;
        }

        if (
            event &&
            isReelsMenuItemCard(element) &&
            !isMenuItemExpanded(element) &&
            typeof window.shouldOpenMenuItemOrderFromEvent === 'function' &&
            !window.shouldOpenMenuItemOrderFromEvent(event)
        ) {
            return;
        }

        const isExpanded = isMenuItemExpanded(element);
        const isReelsItem = isReelsMenuItemCard(element);

        // If event is provided, check if click was on an interactive element
        if (event) {
            const target = event.target;
            const isDragHandle = target.closest('.drag-handle, .dashboard-edit-drag-handle');
            const isImageLink = target.closest('.menu-item-image-link');
            const isTitleLink = target.closest('.menu-item-title a');
            const isExpandedInteractive = target.closest(
                '.expanded-item-controls a, .expanded-item-controls button, .btn-quantity, .expanded-add-cart, ' +
                '.menu-favorite-btn, .menu-add-photo-btn, .menu-image-add-btn, .menu-image-actions, ' +
                '.expanded-image-nav, .expanded-image-indicator, .menu-item-slideshow'
            );
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
        const useReelsModal = isReelsItem && !!document.getElementById('menu-reels-item-modal');
        const expandedContent = element.querySelector('.menu-item-expanded-content');

        if (!useReelsModal && !expandedContent) {
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
        if (typeof window.getMenuReelsModalActiveCard === 'function') {
            const activeReelsCard = window.getMenuReelsModalActiveCard();
            if (activeReelsCard && activeReelsCard !== element) {
                collapseItem(activeReelsCard);
            }
        }
        const allCards = document.querySelectorAll('.menu-item-card[data-item-expanded="true"]');
        allCards.forEach(card => {
            if (card !== element) {
                collapseItem(card);
            }
        });

        // Expand this item
        if (event && isReelsItem && !isExpanded) {
            event.preventDefault();
        }
        expandItem(element, itemUrl);
    }

    function resolveMenuItemCard(contextEl) {
        if (contextEl && typeof window.getMenuReelsModalActiveCard === 'function') {
            const active = window.getMenuReelsModalActiveCard();
            if (active && contextEl.closest?.('.menu-reels-item-modal')) {
                return active;
            }
        }
        return contextEl?.closest?.('.menu-item-card') || null;
    }

    function getExpandedViewRoot(card) {
        if (!card) return null;
        if (isReelsMenuItemCard(card) && typeof window.getMenuReelsItemModalDataRoot === 'function') {
            const modalRoot = window.getMenuReelsItemModalDataRoot();
            if (modalRoot) return modalRoot;
        }
        return card;
    }

    async function expandItem(element, url) {
        const isReelsItem = isReelsMenuItemCard(element);
        const useReelsModal = isReelsItem && !!document.getElementById('menu-reels-item-modal');

        let expandedContent;
        let loadingDiv;
        let dataDiv;

        if (useReelsModal) {
            if (typeof window.openMenuReelsItemModal === 'function') {
                window.openMenuReelsItemModal(element);
            }
            const targets = typeof window.getMenuReelsItemModalTargets === 'function'
                ? window.getMenuReelsItemModalTargets()
                : { container: null, loading: null, data: null };
            expandedContent = targets.container;
            loadingDiv = targets.loading;
            dataDiv = targets.data;
        } else {
            expandedContent = element.querySelector('.menu-item-expanded-content');
            loadingDiv = expandedContent?.querySelector('.menu-item-expanded-loading');
            dataDiv = expandedContent?.querySelector('.menu-item-expanded-data');
        }

        if (!expandedContent || !loadingDiv || !dataDiv) return;

        const isDashboardNewPlaceholderUrl = typeof window !== 'undefined' && window.__dashboardEditMode &&
            element && element.hasAttribute('data-dashboard-edit-new-item');

        // Show loading state
        expandedContent.style.display = 'block';
        loadingDiv.style.display = 'block';
        dataDiv.style.display = 'none';
        if (useReelsModal) {
            dataDiv.innerHTML = '';
            const inlineExpanded = element.querySelector('.menu-item-expanded-content');
            if (inlineExpanded) inlineExpanded.style.display = 'none';
        } else {
            element.setAttribute('data-item-expanded', 'true');
            element.setAttribute('aria-expanded', 'true');
            element.classList.add('expanded');
        }

        try {
            // Use existing openItem function to get item data, but render inline
            if (typeof window.openItem === 'function') {
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
                imagesArray = resolveExpandedImagesForCarousel(element, imagesArray);
                element.setAttribute('data-images-array', JSON.stringify(imagesArray));

                const menuImageCfg = typeof window !== 'undefined' && window.MENU_IMAGE_CONFIG;
                const menuImageEnabled = menuImageCfg && menuImageCfg.enabled;
                const menuImageClientId = (menuImageCfg && menuImageCfg.clientId) ||
                    (typeof window.SITE_CLIENT_ID !== 'undefined' && window.SITE_CLIENT_ID) ||
                    '_ttms_menu_demo';
                const useSmashPassMedia = menuImageEnabled && useReelsModal;
                
                // Build smash-or-pass (reels modal) or image carousel HTML
                let smashPassHTML = '';
                let imageCarouselHTML = '';
                const hasExpandedCarousel = imagesArray && imagesArray.length > 0;
                if (useSmashPassMedia) {
                    if (typeof window.buildMenuSmashPassMarkup === 'function') {
                        smashPassHTML = window.buildMenuSmashPassMarkup({
                            clientId: menuImageClientId,
                            menuItemPath: url,
                            modal: true,
                        });
                    }
                } else if (hasExpandedCarousel) {
                    const itemName = element.querySelector('.menu-item-title')?.textContent?.trim() || '';
                    const showNavButtons = imagesArray.length > 1;
                    const showIndicators = imagesArray.length > 1;
                    imageCarouselHTML = `
                        <div class="expanded-image-carousel menu-item-slideshow" data-current-image="0">
                            <div class="expanded-image-carousel-view">
                                <div class="expanded-image-carousel-container menu-item-slideshow-track" role="region" aria-label="${itemName} images" tabindex="0">
                                    ${imagesArray.map((img, index) => {
                                    const pathStr = normalizeMenuItemImagePath(img);
                                    const src = resolveExpandedImageSrcForPreview(pathStr);
                                    const loadingAttr = index === 0 ? 'eager' : 'lazy';
                                    const fetchAttr = index === 0 ? ' fetchpriority="high"' : '';
                                    const cssUrl = cssImageVarForPath(src);
                                    const pathAttr = pathStr ? ` data-src-path="${pathStr.replace(/"/g, '&quot;')}"` : '';
                                    return `
                                    <div class="expanded-image-slide menu-item-slideshow-slide ${index === 0 ? 'active' : ''}" data-image-index="${index}">
                                        <div class="content-panel" style="--ad-image: ${cssUrl}">
                                            <img src="${src}"${pathAttr} alt="${itemName} - Image ${index + 1}" loading="${loadingAttr}" decoding="async"${fetchAttr} class="ad-portrait expanded-image-carousel-img">
                                        </div>
                                    </div>`;
                                }).join('')}
                                </div>
                                ${showNavButtons ? `
                                <div class="expanded-image-nav-buttons">
                                    <button type="button" class="expanded-image-nav expanded-image-nav-prev" onclick="navigateExpandedImage(this, -1, '${url}', event)" aria-label="Previous image">
                                        <i class="fa fa-chevron-left" aria-hidden="true"></i>
                                    </button>
                                    <button type="button" class="expanded-image-nav expanded-image-nav-next" onclick="navigateExpandedImage(this, 1, '${url}', event)" aria-label="Next image">
                                        <i class="fa fa-chevron-right" aria-hidden="true"></i>
                                    </button>
                                </div>
                                ` : ''}
                            </div>
                            ${showIndicators ? `
                            <div class="expanded-image-indicators" role="tablist" aria-label="Item images">
                                ${imagesArray.map((img, index) => `
                                    <button type="button" class="expanded-image-indicator ${index === 0 ? 'active' : ''}" role="tab" aria-label="Image ${index + 1}" aria-selected="${index === 0 ? 'true' : 'false'}" data-indicator-index="${index}" onclick="goToExpandedImage(this, ${index}, '${url}', event)"></button>
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
                const menuImagePathAttr = String(url || '').replace(/"/g, '&quot;');
                const menuImageDataAttrs = menuImageEnabled
                    ? ` data-menu-image-client-id="${menuImageClientId}" data-menu-item-path="${menuImagePathAttr}"`
                    : '';
                const menuImageNoCarouselClass = menuImageEnabled && !hasExpandedCarousel && !useSmashPassMedia
                    ? ' expanded-item-details--no-carousel'
                    : '';
                const menuImageAddBtnHTML = `
                            <button type="button" class="menu-image-add-btn" style="display:none;" title="Add a photo for this menu item" aria-label="Add a photo for this menu item"><i class="fa fa-camera" aria-hidden="true"></i><span class="menu-image-add-btn__label">Add photo</span></button>`;
                let menuImageActionsHTML = '';
                if (menuImageEnabled) {
                    if (useSmashPassMedia) {
                        menuImageActionsHTML = '';
                    } else if (hasExpandedCarousel) {
                        menuImageActionsHTML = `
                        <div class="menu-image-actions">
                            ${menuImageAddBtnHTML}
                        </div>`;
                    } else {
                        menuImageActionsHTML = `
                        <div class="expanded-media-placeholder" role="region" aria-label="Item photo">
                            <div class="menu-image-actions menu-image-actions--standalone">
                                ${menuImageAddBtnHTML}
                            </div>
                            <p class="expanded-media-placeholder__hint">No photo yet — be the first to add one</p>
                        </div>`;
                    }
                }
                dataDiv.innerHTML = `
                    <div class="expanded-item-details${menuImageNoCarouselClass}"${menuImageDataAttrs}>
                        ${smashPassHTML}
                        ${imageCarouselHTML}
                        ${menuImageActionsHTML}
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

            const modalSmashPass = dataDiv.querySelector('.menu-smash-pass--modal');
            if (!modalSmashPass) {
                dataDiv.querySelectorAll('.expanded-image-carousel').forEach(bindExpandedCarouselImages);
            }

            const menuImageHost = dataDiv.querySelector('.expanded-item-details[data-menu-item-path]');
            if (menuImageHost) {
                if (typeof window.initMenuImageIntegration === 'function') {
                    window.initMenuImageIntegration(menuImageHost);
                }
                if (typeof window.scheduleMenuImageLoadForHost === 'function') {
                    window.scheduleMenuImageLoadForHost(menuImageHost);
                }
            }

            if (modalSmashPass && typeof window.initMenuSmashPass === 'function') {
                window.initMenuSmashPass();
            }
            
            // Initialize category counters
            const categoryContainers = dataDiv.querySelectorAll('.expanded-side-category');
            categoryContainers.forEach(container => {
                updateExpandedSideCategoryCounter(container);
            });
            
            // Update price based on initial selections
            setTimeout(() => {
                updateExpandedItemPriceFromOptions(element);
            }, 50);

            // Scroll into view (menu reels track on home, else window + header offset)
            setTimeout(() => {
                if (isReelsItem) return;
                const track = document.getElementById('menu-reels-track');
                if (track) {
                    const tr = track.getBoundingClientRect();
                    const sr = element.getBoundingClientRect();
                    track.scrollTo({
                        top: track.scrollTop + (sr.top - tr.top),
                        left: 0,
                        behavior: 'smooth',
                    });
                    return;
                }
                const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
                const offset = rootFontSize * 5;
                const elementTop = element.getBoundingClientRect().top + window.pageYOffset;
                const targetPosition = elementTop - offset;
                window.scrollTo({
                    top: Math.max(0, targetPosition),
                    behavior: 'smooth',
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
        const isReelsItem = isReelsMenuItemCard(element);

        if (isReelsItem && isMenuItemExpanded(element) &&
            typeof window.closeMenuReelsItemModal === 'function') {
            window.closeMenuReelsItemModal(element);
        }

        const expandedContent = element.querySelector('.menu-item-expanded-content');
        if (expandedContent) {
            expandedContent.style.display = 'none';
        }

        if (!isReelsItem) {
            element.setAttribute('data-item-expanded', 'false');
        }
        element.setAttribute('aria-expanded', 'false');
        element.classList.remove('expanded');
    }

    /**
     * Adjust quantity in expanded item
     * @global
     * @param {HTMLElement} button - The quantity button
     * @param {number} change - Amount to change (-1 or 1)
     */
    function adjustExpandedQuantity(button, change) {
        const card = resolveMenuItemCard(button);
        if (!card) return;

        const root = getExpandedViewRoot(card);
        const quantitySpan = root.querySelector('.expanded-quantity');
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
        
        const card = resolveMenuItemCard(optionElement);
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
        
        const card = resolveMenuItemCard(additionElement);
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
        
        const card = resolveMenuItemCard(sideElement);
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

        const root = getExpandedViewRoot(card);
        
        // Get base unit price
        const priceElement = root.querySelector('.expanded-price');
        const baseUnitPrice = parseFloat(priceElement?.getAttribute('data-unit-price')) || 0;
        
        // Calculate side prices
        let sidePrice = 0;
        const selectedSides = root.querySelectorAll('.expanded-side-option.selected');
        selectedSides.forEach(side => {
            const price = parseFloat(side.getAttribute('data-item-price')) || 0;
            sidePrice += price;
        });
        
        // Calculate modification and addition prices
        let modificationPrice = 0;
        const selectedModifications = root.querySelectorAll('.expanded-addition-option.selected[data-addition-type="modification"]');
        selectedModifications.forEach(modification => {
            const price = parseFloat(modification.getAttribute('data-addition-price')) || 0;
            modificationPrice += price;
        });
        
        let additionPrice = 0;
        const selectedAdditions = root.querySelectorAll('.expanded-addition-option.selected[data-addition-type="addition"]');
        selectedAdditions.forEach(addition => {
            const price = parseFloat(addition.getAttribute('data-addition-price')) || 0;
            additionPrice += price;
        });
        
        const totalModAndAddPrice = modificationPrice + additionPrice;
        
        // Get quantity
        const quantitySpan = root.querySelector('.expanded-quantity');
        const quantity = parseInt(quantitySpan?.textContent) || 1;
        
        // Calculate total
        const totalPrice = (baseUnitPrice + sidePrice + totalModAndAddPrice) * quantity;
        
        // Update price display
        const addCartButton = root.querySelector('.expanded-add-cart');
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
        
        const root = getExpandedViewRoot(card);

        // Update price display
        const quantitySpan = root.querySelector('.expanded-quantity');
        const quantity = parseInt(quantitySpan?.textContent) || 1;
        
        // Calculate side prices
        let sidePrice = 0;
        const selectedSides = root.querySelectorAll('.expanded-side-option.selected');
        selectedSides.forEach(side => {
            const price = parseFloat(side.getAttribute('data-item-price')) || 0;
            sidePrice += price;
        });
        
        const totalPrice = (displayUnitPrice + sidePrice) * quantity;
        
        const priceElement = root.querySelector('.expanded-price');
        const addCartButton = root.querySelector('.expanded-add-cart');
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
        const card = resolveMenuItemCard(button);
        if (!card) {
            console.warn('Card not found for add to cart');
            return;
        }
        const root = getExpandedViewRoot(card);
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
                    const categoryContainer = root.querySelector(`.expanded-side-category[data-category-name="${categoryName}"]`);
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
        const quantitySpan = root.querySelector('.expanded-quantity');
        const quantity = parseInt(quantitySpan?.textContent) || 1;
        
        const titleElement = card.querySelector('.menu-item-title a') || card.querySelector('.menu-item-title');
        const itemName = titleElement?.textContent?.trim() || '';
        
        // Get selected variable1 and variable2
        const selectedVariable1 = card.getAttribute('data-selected-variable1') || '-';
        const selectedVariable2 = card.getAttribute('data-selected-variable2') || '-';
        
        // Get price - try expanded price first, then regular price
        const priceElement = root.querySelector('.expanded-price') || card.querySelector('.menu-item-price');
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
            const selectedSides = root.querySelectorAll('.expanded-side-option.selected');
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
            const selectedModifications = root.querySelectorAll('.expanded-addition-option.selected[data-addition-type="modification"]');
            const selectedAdditions = root.querySelectorAll('.expanded-addition-option.selected[data-addition-type="addition"]');
            
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

            collapseItem(card);
            
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
        if (element && element.classList && element.classList.contains('single-page-item-card')) {
            return;
        }
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
    // MENU INTERACTIONS
    // ============================================

    /** Fixed header clearance for in-page hash links (e.g. #Promotions on home). */
    function getHeaderScrollOffset() {
        const raw = (getComputedStyle(document.documentElement).getPropertyValue('--ttms-header-height') || '5em').trim();
        const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
        const emMatch = raw.match(/^([\d.]+)em$/);
        if (emMatch) return parseFloat(emMatch[1]) * rootPx;
        const pxMatch = raw.match(/^([\d.]+)px$/);
        if (pxMatch) return parseFloat(pxMatch[1]);
        return rootPx * 5;
    }

    function scrollToHashTarget(target, behavior) {
        const track = document.getElementById('menu-reels-track');
        if (track && target) {
            const slide = target.closest('.menu-reels-slide, .ads-reels-slide');
            if (slide) {
                const tr = track.getBoundingClientRect();
                const sr = slide.getBoundingClientRect();
                track.scrollTo({
                    top: track.scrollTop + (sr.top - tr.top),
                    left: 0,
                    behavior: behavior || 'smooth',
                });
                return;
            }
            if (target.id && typeof window.scrollMenuReelTo === 'function') {
                window.scrollMenuReelTo(target.id);
                return;
            }
        }
        const offset = getHeaderScrollOffset();
        const top = target.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({
            top: Math.max(0, top),
            behavior: behavior || 'smooth',
        });
    }

    /**
     * Bind menu interactions once via delegation (Barba-safe).
     */
    function bindMenuInteractions() {
        if (document.documentElement.dataset.ttmsMenuBound === '1') {
            return;
        }
        document.documentElement.dataset.ttmsMenuBound = '1';

        document.addEventListener('click', function (e) {
            const anchor = e.target.closest('a[href^="#"]');
            if (anchor) {
                const href = anchor.getAttribute('href');
                if (href && href !== '#') {
                    const hashId = decodeURIComponent(href.slice(1));
                    const target = hashId ? document.getElementById(hashId) : null;
                    if (target) {
                        e.preventDefault();
                        scrollToHashTarget(target, 'smooth');
                        if (history.replaceState) {
                            history.replaceState(null, '', href);
                        } else {
                            window.location.hash = href.slice(1);
                        }
                        closeCart();
                    }
                }
            }

            if (e.target.closest(
                '.menu-favorite-btn, .menu-add-photo-btn, .menu-image-add-btn, .menu-image-actions, ' +
                '.expanded-image-nav, .expanded-image-indicator, .menu-item-slideshow, ' +
                '.dashboard-edit-drag-handle, .dashboard-edit-card-btn-wrap, .dashboard-edit-header-btn-wrap, ' +
                '.dashboard-edit-btn, [data-dashboard-edit="1"]'
            )) {
                return;
            }

            const item = e.target.closest('[data-item-url]');
            if (item && !item.onclick) {
                if (item.classList.contains('menu-reels-slide') && document.getElementById('menu-reels-track')) {
                    return;
                }
                const url = item.dataset.itemUrl;
                if (url) {
                    openItem(item, url);
                }
            }
        });

        document.addEventListener('keydown', function (e) {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            const card = e.target.closest('.menu-item-card[role="button"]');
            if (!card || card.classList.contains('menu-item-unavailable')) return;
            if (e.target.closest(
                '.menu-favorite-btn, .menu-add-photo-btn, .menu-image-add-btn, .menu-image-actions, ' +
                '.expanded-item-controls, .btn-quantity, .expanded-image-nav, .expanded-image-indicator'
            )) return;
            if (
                card.classList.contains('menu-reels-slide') &&
                document.getElementById('menu-reels-track') &&
                typeof window.shouldOpenMenuItemOrderFromEvent === 'function' &&
                !window.shouldOpenMenuItemOrderFromEvent(e)
            ) {
                return;
            }
            e.preventDefault();
            const url = card.dataset.itemUrl;
            if (url) toggleItemExpansion(card, url, e);
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
    window.toggleFooterAccessibility = toggleFooterAccessibility;
    window.closeShop = closeShop;
    window.openItem = openItem;
    window.toggleItemExpansion = toggleItemExpansion;
    window.collapseMenuItemCard = collapseItem;
    window.adjustExpandedQuantity = adjustExpandedQuantity;
    window.addExpandedItemToCart = addExpandedItemToCart;
    window.selectExpandedOption = selectExpandedOption;
    window.selectExpandedSide = selectExpandedSide;
    window.selectExpandedAddition = selectExpandedAddition;
    
    /**
     * Safe CSS url() for --ad-image (single-quoted — avoids breaking style="...").
     * @param {string} src
     * @returns {string}
     */
    function cssImageVarForPath(src) {
        const safe = String(src || '').replace(/\\/g, '/').replace(/'/g, '%27');
        return `url('${safe}')`;
    }

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
        const track = carousel.querySelector('.menu-item-slideshow-track');

        if (index < 0 || index >= slides.length) return;

        slides.forEach((slide, i) => {
            slide.classList.toggle('active', i === index);
        });

        if (track) {
            const slide = slides[index];
            if (slide) {
                track.scrollTo({ left: slide.offsetLeft, behavior: 'smooth' });
            }
        }

        indicators.forEach((indicator, i) => {
            const isActive = i === index;
            indicator.classList.toggle('active', isActive);
            indicator.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });

        carousel.setAttribute('data-current-image', index.toString());
        refreshExpandedCarousel(carousel);
    }

    /**
     * Size carousel to the active image (slideshow track + fade mode).
     * @param {HTMLElement} carousel
     */
    function refreshExpandedCarousel(carousel) {
        if (!carousel) return;

        const track = carousel.querySelector('.menu-item-slideshow-track');
        const view = carousel.querySelector('.expanded-image-carousel-view');
        const slides = carousel.querySelectorAll('.expanded-image-slide');
        const slideIndex = parseInt(carousel.getAttribute('data-current-image'), 10) || 0;
        const activeSlide =
            slides[slideIndex] ||
            carousel.querySelector('.expanded-image-slide.active') ||
            slides[0];
        const activeImg = activeSlide && activeSlide.querySelector('.expanded-image-carousel-img');
        const container = carousel.querySelector('.expanded-image-carousel-container');

        if (!activeImg) {
            return;
        }

        const applyHeight = function () {
            if (!activeImg.naturalWidth || !activeImg.naturalHeight) {
                return;
            }

            const maxHeight = Math.min(
                window.innerHeight * 0.72,
                window.innerHeight - 80
            );
            const minHeight = 200;
            const width = track ? track.clientWidth : carousel.clientWidth;
            if (!width) {
                return;
            }

            let height = Math.round((activeImg.naturalHeight / activeImg.naturalWidth) * width);
            height = Math.max(minHeight, Math.min(height, maxHeight));

            carousel.classList.add('is-height-synced');
            if (track) {
                track.style.setProperty('height', height + 'px', 'important');
            }
            if (view) {
                view.style.setProperty('min-height', height + 'px', 'important');
            }
            if (container && !track) {
                container.style.setProperty('height', height + 'px', 'important');
                container.style.setProperty('min-height', height + 'px', 'important');
            }
        };

        if (activeImg.complete && activeImg.naturalHeight > 0) {
            requestAnimationFrame(applyHeight);
        } else {
            activeImg.addEventListener(
                'load',
                function () {
                    requestAnimationFrame(applyHeight);
                },
                { once: true }
            );
        }
    }

    function bindScrollSnapCarousel(carousel) {
        const track = carousel && carousel.querySelector('.menu-item-slideshow-track');
        if (!track || track.dataset.scrollSnapBound) return;
        track.dataset.scrollSnapBound = '1';
        let scrollTimeout;
        track.addEventListener('scroll', function () {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(function () {
                const slides = carousel.querySelectorAll('.expanded-image-slide');
                const scrollLeft = track.scrollLeft;
                let bestIndex = 0;
                let minDistance = Infinity;
                slides.forEach(function (slide, i) {
                    const distance = Math.abs(slide.offsetLeft - scrollLeft);
                    if (distance < minDistance) {
                        minDistance = distance;
                        bestIndex = i;
                    }
                });
                const current = parseInt(carousel.getAttribute('data-current-image'), 10) || 0;
                if (current === bestIndex) return;
                carousel.setAttribute('data-current-image', String(bestIndex));
                slides.forEach(function (slide, i) {
                    slide.classList.toggle('active', i === bestIndex);
                });
                carousel.querySelectorAll('.expanded-image-indicator').forEach(function (indicator, i) {
                    const isActive = i === bestIndex;
                    indicator.classList.toggle('active', isActive);
                    indicator.setAttribute('aria-selected', isActive ? 'true' : 'false');
                });
                refreshExpandedCarousel(carousel);
            }, 80);
        }, { passive: true });

        window.addEventListener(
            'resize',
            function () {
                refreshExpandedCarousel(carousel);
            },
            { passive: true }
        );
    }

    function bindExpandedCarouselImages(carousel) {
        if (!carousel) return;
        bindScrollSnapCarousel(carousel);
        carousel.querySelectorAll('.expanded-image-carousel-img').forEach(function (img) {
            if (img.dataset.carouselImgBound) return;
            img.dataset.carouselImgBound = '1';
            hydrateAuthenticatedDraftAssetImg(img);
            img.addEventListener('load', function () {
                if (img.closest('.expanded-image-slide.active')) {
                    refreshExpandedCarousel(carousel);
                }
            });
            img.addEventListener('error', function () {
                if (img.dataset.draftAssetHydrated === '1') return;
                const path = img.getAttribute('data-src-path') || '';
                if (path && window.TtmsThumbor && typeof window.TtmsThumbor.fallbackImg === 'function') {
                    window.TtmsThumbor.fallbackImg(img);
                }
            });
        });
        refreshExpandedCarousel(carousel);
    }
    
    window.navigateExpandedImage = navigateExpandedImage;
    window.goToExpandedImage = goToExpandedImage;
    window.bindExpandedCarouselImages = bindExpandedCarouselImages;
    
    /**
     * Navigate to previous/next image in single page carousel
     * @global
     * @param {HTMLElement} button - The navigation button
     * @param {number} direction - -1 for previous, 1 for next
     * @param {Event} event - The click event
     */
    function navigateSinglePageImage(button, direction, event) {
        if (button && button.closest('.expanded-image-carousel')) {
            return navigateExpandedImage(button, direction, '', event);
        }
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
        if (indicator && indicator.closest('.expanded-image-carousel')) {
            return goToExpandedImage(indicator, index, '', event);
        }
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
        const track = carousel.querySelector('.single-page-image-carousel-container');

        if (index < 0 || index >= slides.length) return;

        if (track) {
            const slide = slides[index];
            if (slide) {
                track.scrollTo({ left: slide.offsetLeft, behavior: 'smooth' });
            }
        } else {
            slides.forEach((slide, i) => {
                slide.classList.toggle('active', i === index);
            });
        }

        indicators.forEach((indicator, i) => {
            indicator.classList.toggle('active', i === index);
        });

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
        const quantitySpan = document.querySelector('.single-page-quantity, .single-page-item-card .expanded-quantity');
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
        const quantitySpan = document.querySelector('.single-page-quantity, .single-page-item-card .expanded-quantity');
        const quantity = parseInt(quantitySpan?.textContent) || 1;
        
        const titleTextEl = document.querySelector('h3.menu-item-title.single-page-title .menu-item-title-text');
        const titleElement = titleTextEl || document.querySelector('h3.menu-item-title.single-page-title') || document.querySelector('.single-page-title');
        const itemName = (titleTextEl ? titleTextEl.textContent : titleElement?.textContent)?.trim() || '';
        
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
        const quantitySpan = document.querySelector('.single-page-quantity, .single-page-item-card .expanded-quantity');
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
        const displayUnit = unitPrice + sidePrice + totalModAndAddPrice;
        const origUnit = promoPercent > 0 && unitPrice > 0
            ? unitPrice / ((100 - promoPercent) / 100)
            : unitPrice;

        const addCartButton = document.querySelector('.single-page-add-cart-btn, .single-page-item-card .expanded-add-cart');
        const priceButton = addCartButton?.querySelector('.cart-button-price');
        const expandedPrice = document.querySelector('.single-page-item-card .expanded-price, .single-page-price');

        if (priceButton) {
            priceButton.textContent = `$${totalPrice.toFixed(2).replace(/\.00$/, '')}`;
        }
        if (addCartButton) {
            addCartButton.setAttribute('data-unit-price', String(displayUnit));
        }
        if (expandedPrice) {
            if (promoPercent > 0 && origUnit > 0) {
                expandedPrice.innerHTML =
                    `<span class="menu-item-price-original">$${origUnit.toFixed(2).replace(/\.00$/, '')}</span> ` +
                    `<span class="menu-item-price-promo">$${displayUnit.toFixed(2).replace(/\.00$/, '')}</span>`;
                expandedPrice.setAttribute('data-unit-price', String(displayUnit));
                expandedPrice.setAttribute('data-original-unit-price', String(origUnit));
            } else {
                expandedPrice.textContent = `$${displayUnit.toFixed(2).replace(/\.00$/, '')}`;
                expandedPrice.setAttribute('data-unit-price', String(displayUnit));
                expandedPrice.setAttribute('data-original-unit-price', String(displayUnit));
            }
            expandedPrice.setAttribute('data-promo-percent', String(promoPercent));
        }

        return unitPrice;
    }
    
    function initSinglePageCarousel() {
        document.querySelectorAll('.single-page-item-card .expanded-image-carousel, .single-page-item-card .single-page-image-carousel').forEach(bindExpandedCarouselImages);
    }
    
    function reinitSinglePagePrice() {
        initSinglePageCarousel();
        const quantitySpan = document.querySelector('.single-page-quantity, .single-page-item-card .expanded-quantity');
        if (quantitySpan) {
            updateSinglePagePriceWithOptions();
        }
    }

    window.reinitSinglePagePrice = reinitSinglePagePrice;

    window.adjustSinglePageQuantity = adjustSinglePageQuantity;
    window.addSinglePageItemToCart = addSinglePageItemToCart;
    window.selectSinglePageOption = selectSinglePageOption;
    window.selectSinglePageSide = selectSinglePageSide;
    window.selectSinglePageAddition = selectSinglePageAddition;
    window.updateCart = updateCart;
    window.updateAdCount = updateAdCount;

    /** Rebuild expanded menu panel from card data-* (used by dashboard edit after Apply). */
    window.expandMenuItemCard = expandItem;

    window.applyDayBasedPromos = applyDayBasedPromos;
    window.initializeFooterVisibility = initializeFooterVisibility;
    window.hydrateAuthenticatedDraftAssetImg = hydrateAuthenticatedDraftAssetImg;
    window.hydrateAllDraftMenuCardImages = hydrateAllDraftMenuCardImages;

    document.addEventListener('menuReelsFlattened', function () {
        hydrateAllDraftMenuCardImages();
    });

    function bootstrapMain() {
        try {
            init();
        } catch (err) {
            console.error('[TTMS main] init failed:', err);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrapMain);
    } else {
        bootstrapMain();
    }

})();

// LOCATION STATUS — assets/js/location-status.js
// PAGE REINIT — assets/js/page-reinit.js (body)
// LOCATION NAV — assets/js/location-navigation.js
