/**
 * Live Pause/Resume for menu promotions (Ads overview + promotions catalog).
 * Uses MenuAvailability overlay keyed by promotion URLs; no Hugo publish.
 */
(function (global) {
  'use strict';

  function normalize(url) {
    if (global.MenuAvailability && typeof global.MenuAvailability.normalizeItemKey === 'function') {
      return global.MenuAvailability.normalizeItemKey(url);
    }
    var s = String(url || '').trim();
    if (!s) return '';
    if (s.charAt(0) !== '/') s = '/' + s;
    return s.replace(/\/+$/, '') + '/';
  }

  function isPaused(url) {
    if (global.MenuAvailability && typeof global.MenuAvailability.isPromoPaused === 'function') {
      return global.MenuAvailability.isPromoPaused(url);
    }
    if (global.MenuAvailability && typeof global.MenuAvailability.isSoldOut === 'function') {
      return global.MenuAvailability.isSoldOut(url);
    }
    return false;
  }

  function parseOutletUrls(card) {
    if (!card) return [];
    var urls = [];
    var raw = card.getAttribute('data-promo-outlet-urls') || '';
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) urls = parsed.slice();
      } catch (e) { /* ignore */ }
    }
    if (!urls.length) {
      card.querySelectorAll('.dashboard-ads-promo-stack-flow a[href], a.dashboard-ads-promo-link[href]').forEach(function (a) {
        var href = a.getAttribute('href') || '';
        if (href && href.indexOf('/promotions/') !== -1) urls.push(href);
      });
    }
    var primary = card.getAttribute('data-promo-url') || '';
    if (primary) urls.push(primary);
    var slide = card.querySelector('article.ads-reels-slide[data-ad-url], article.ads-reels-slide[data-item-url]');
    if (slide) {
      urls.push(slide.getAttribute('data-ad-url') || slide.getAttribute('data-item-url') || '');
    }
    var seen = {};
    var out = [];
    urls.forEach(function (u) {
      var key = normalize(u);
      if (!key || key.indexOf('/promotions/') === -1 || seen[key]) return;
      seen[key] = true;
      out.push(key);
    });
    return out;
  }

  function cardPaused(card) {
    var urls = parseOutletUrls(card);
    if (!urls.length) return false;
    // Any paused outlet → show paused (Resume clears all).
    return urls.some(function (url) {
      return isPaused(url);
    });
  }

  function kindBaseLabel(card) {
    var el = card.querySelector('[data-promo-kind-label]');
    var text = el ? String(el.getAttribute('data-promo-kind-base') || el.textContent || '') : '';
    text = text.replace(/\s·\s*paused\s*$/i, '').trim();
    if (!text) text = 'Promotion';
    if (el && !el.getAttribute('data-promo-kind-base')) {
      el.setAttribute('data-promo-kind-base', text);
    }
    return text;
  }

  function syncCard(card) {
    if (!card) return;
    var paused = cardPaused(card);
    card.classList.toggle('is-promo-paused', paused);
    card.setAttribute('data-promo-paused', paused ? 'true' : 'false');
    var kind = card.querySelector('[data-promo-kind-label]');
    if (kind) {
      var base = kindBaseLabel(card);
      kind.textContent = paused ? base + ' · paused' : base;
    }
    var btn = card.querySelector('[data-promo-pause]');
    if (btn) {
      btn.disabled = false;
      btn.setAttribute('aria-pressed', paused ? 'true' : 'false');
      btn.textContent = paused ? 'Resume' : 'Pause';
      btn.title = paused
        ? 'Show this promotion on the menu again'
        : 'Hide this promotion from the menu without publishing';
    }
    var toggle = card.querySelector('[data-promo-pause-toggle]');
    if (toggle) {
      toggle.checked = paused;
      toggle.setAttribute('aria-checked', paused ? 'true' : 'false');
    }
    var label = card.querySelector('[data-promo-pause-label]');
    if (label) label.textContent = paused ? 'Paused' : 'Live';
  }

  function syncAll() {
    document
      .querySelectorAll(
        '.dashboard-ads-promo-card[data-promo-kind="promotion"], .dashboard-settings-location-card[data-catalog-promo="1"]'
      )
      .forEach(syncCard);
  }

  function setPaused(card, paused) {
    var urls = parseOutletUrls(card);
    if (!urls.length) return Promise.reject(new Error('No promotion URLs'));
    if (!global.MenuAvailability) return Promise.reject(new Error('Availability unavailable'));
    var setMany =
      typeof global.MenuAvailability.setUnavailableMany === 'function'
        ? global.MenuAvailability.setUnavailableMany.bind(global.MenuAvailability)
        : null;
    var setOne =
      typeof global.MenuAvailability.setUnavailable === 'function'
        ? global.MenuAvailability.setUnavailable.bind(global.MenuAvailability)
        : null;
    if (!setMany && !setOne) return Promise.reject(new Error('Availability API missing'));

    card.classList.add('is-promo-pause-busy');
    var btn = card.querySelector('[data-promo-pause]');
    if (btn) btn.disabled = true;

    var run = setMany
      ? setMany(urls, !!paused)
      : urls.reduce(function (chain, url) {
          return chain.then(function () {
            return setOne(url, !!paused);
          });
        }, Promise.resolve());

    return run
      .then(function () {
        syncCard(card);
      })
      .catch(function (err) {
        syncCard(card);
        throw err;
      })
      .finally(function () {
        card.classList.remove('is-promo-pause-busy');
        if (btn) btn.disabled = false;
      });
  }

  function onClick(ev) {
    var btn = ev.target.closest && ev.target.closest('[data-promo-pause]');
    if (!btn) return;
    var card =
      btn.closest('.dashboard-ads-promo-card[data-promo-kind="promotion"]') ||
      btn.closest('.dashboard-settings-location-card[data-catalog-promo="1"]');
    if (!card) return;
    ev.preventDefault();
    var next = !cardPaused(card);
    setPaused(card, next).catch(function () {});
  }

  function onToggle(ev) {
    var input = ev.target;
    if (!input || !input.matches || !input.matches('[data-promo-pause-toggle]')) return;
    var card = input.closest('.dashboard-settings-location-card[data-catalog-promo="1"]');
    if (!card) return;
    setPaused(card, !!input.checked).catch(function () {
      syncCard(card);
    });
  }

  function contentBaseName(card) {
    if (!card) return '';
    var path =
      card.getAttribute('data-content-path') ||
      (card.querySelector('[data-content-path]') &&
        card.querySelector('[data-content-path]').getAttribute('data-content-path')) ||
      '';
    var match = String(path).replace(/\\/g, '/').match(/\/([^/]+)\.md$/i);
    if (match) return match[1].toLowerCase();
    var url = card.getAttribute('data-promo-url') || '';
    var parts = normalize(url).split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1].toLowerCase() : '';
  }

  function enhanceCatalogCards() {
    var list = document.getElementById('menuCatalogList');
    if (!list || list.getAttribute('data-catalog-kind') !== 'promotions') return;
    list.querySelectorAll('.dashboard-settings-location-card').forEach(function (card) {
      card.setAttribute('data-catalog-promo', '1');
      var slide = card.querySelector('article.ads-reels-slide');
      var url =
        (slide && (slide.getAttribute('data-ad-url') || slide.getAttribute('data-item-url'))) ||
        card.getAttribute('data-promo-url') ||
        '';
      if (url) card.setAttribute('data-promo-url', url);
      var sharedSlug = card.getAttribute('data-location-slug') || '';
      var base = contentBaseName(card);
      var urls = [];
      if (url) urls.push(url);
      if (sharedSlug === '_shared' && base) {
        list.querySelectorAll('.dashboard-settings-location-card').forEach(function (other) {
          if (contentBaseName(other) !== base) return;
          var otherSlide = other.querySelector('article.ads-reels-slide');
          var otherUrl =
            (otherSlide &&
              (otherSlide.getAttribute('data-ad-url') || otherSlide.getAttribute('data-item-url'))) ||
            other.getAttribute('data-promo-url') ||
            '';
          if (otherUrl) urls.push(otherUrl);
        });
      }
      card.setAttribute('data-promo-outlet-urls', JSON.stringify(urls.map(normalize).filter(Boolean)));
      var actions = card.querySelector('.dashboard-settings-location-card-actions');
      if (!actions) return;
      if (!actions.querySelector('[data-promo-pause-toggle]')) {
        var label = document.createElement('label');
        label.className = 'dashboard-sold-out-toggle dashboard-switch dashboard-promo-pause-toggle';
        label.title = 'Pause promotion on the live menu without publishing';
        label.innerHTML =
          '<input type="checkbox" class="dashboard-switch-input" data-promo-pause-toggle aria-label="Pause promotion">' +
          '<span class="dashboard-switch-track" aria-hidden="true"></span>' +
          '<span data-promo-pause-label>Live</span>';
        actions.appendChild(label);
      }
      syncCard(card);
    });
  }

  function boot() {
    document.addEventListener('click', onClick, true);
    document.addEventListener('change', onToggle, true);
    global.addEventListener('ttms:menu-availability', syncAll);
    var tabs = document.getElementById('menuCatalogLocationTabs');
    if (tabs) {
      tabs.addEventListener('click', function () {
        window.setTimeout(function () {
          enhanceCatalogCards();
          syncAll();
        }, 40);
      });
    }
    enhanceCatalogCards();
    syncAll();
    if (global.MenuAvailability && typeof global.MenuAvailability.refresh === 'function') {
      global.MenuAvailability.refresh();
    }
  }

  global.MenuPromoPause = {
    sync: syncAll,
    enhanceCatalog: enhanceCatalogCards,
    setPaused: setPaused,
    parseOutletUrls: parseOutletUrls
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : this);
