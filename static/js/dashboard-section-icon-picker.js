/**
 * Section icon picker — icon list and images load from cdn.ttmenus.com only.
 */
(function (global) {
  'use strict';

  var ICON_CDN_BASE = 'https://cdn.ttmenus.com/icons';
  function iconManifestUrl() {
    if (global.CDN_CONFIG && typeof global.CDN_CONFIG.getIconsApiUrl === 'function') {
      return global.CDN_CONFIG.getIconsApiUrl();
    }
    return 'https://cdn.ttmenus.com/api/list-icons/index.json';
  }
  var ICON_CATEGORY_ORDER = ['activities', 'business', 'drink', 'food', 'socialmedia', 'ui', 'white'];
  var SEARCH_DEBOUNCE_MS = 160;
  var ICONS_PAGE_SIZE = 24;
  var manifestSource = '';

  var iconsAll = [];
  var iconsFiltered = [];
  var iconsPage = [];
  var categories = ICON_CATEGORY_ORDER.slice();
  var activeCategory = ICON_CATEGORY_ORDER[0];
  var iconPageIndex = 0;
  var loadPromise = null;
  var loadFailed = false;
  var searchTimer = null;

  var inputUrl;
  var inputSearch;
  var tabsEl;
  var gridEl;
  var pagerEl;
  var pagerPrev;
  var pagerNext;
  var pagerLabel;
  var statusEl;
  var previewWrap;
  var previewImg;
  var selectedLabel;

  function normalizeUrl(url) {
    return String(url || '').trim();
  }

  /** Legacy menus used ct.ttmenus.com; all picker assets use cdn.ttmenus.com. */
  function normalizeIconCdnUrl(url) {
    var u = normalizeUrl(url);
    if (!u) return u;
    return u
      .replace(/^https?:\/\/ct\.ttmenus\.com\/icons\//i, ICON_CDN_BASE + '/')
      .replace(/^\/\/ct\.ttmenus\.com\/icons\//i, ICON_CDN_BASE + '/');
  }

  function normalizeManifestIcon(icon) {
    if (!icon || typeof icon !== 'object') return icon;
    var copy = {
      url: normalizeIconCdnUrl(icon.url),
      category: icon.category,
      name: icon.name,
      filename: icon.filename,
      format: icon.format,
    };
    return copy;
  }

  function normalizeManifest(data) {
    if (!data || !Array.isArray(data.icons)) return data;
    return {
      success: data.success,
      count: data.count,
      categories: data.categories,
      baseUrl: data.baseUrl || ICON_CDN_BASE,
      icons: data.icons.map(normalizeManifestIcon),
    };
  }

  function iconFilename(url) {
    var u = normalizeUrl(url);
    if (!u) return '';
    var parts = u.split('/');
    return (parts[parts.length - 1] || '').toLowerCase();
  }

  function iconUrlsMatch(a, b) {
    a = normalizeUrl(a);
    b = normalizeUrl(b);
    if (!a && !b) return true;
    if (!a || !b) return false;
    if (a === b) return true;
    var fa = iconFilename(a);
    var fb = iconFilename(b);
    return !!(fa && fb && fa === fb);
  }

  function findIconByUrl(url) {
    var u = normalizeUrl(url);
    if (!u) return null;
    for (var i = 0; i < iconsAll.length; i++) {
      if (iconUrlsMatch(iconsAll[i].url, u)) return iconsAll[i];
    }
    return null;
  }

  function findAlternateIconUrl(filename, failedUrl) {
    var fn = String(filename || iconFilename(failedUrl)).toLowerCase();
    if (!fn) return '';
    var failed = normalizeUrl(failedUrl);
    for (var i = 0; i < iconsAll.length; i++) {
      var icon = iconsAll[i];
      var iconFn = String(icon.filename || iconFilename(icon.url)).toLowerCase();
      if (iconFn !== fn || normalizeUrl(icon.url) === failed) continue;
      return icon.url;
    }
    return '';
  }

  function wireIconImage(img, url, filename, onResolved) {
    if (!img) return;
    var tried = [];
    function tryUrl(nextUrl) {
      var u = normalizeUrl(nextUrl);
      if (!u || tried.indexOf(u) >= 0) {
        if (typeof onResolved === 'function') onResolved(null);
        return;
      }
      tried.push(u);
      img.onload = function () {
        img.onerror = null;
        if (typeof onResolved === 'function') onResolved(u);
      };
      img.onerror = function () {
        var alt = findAlternateIconUrl(filename, u);
        if (alt) tryUrl(alt);
        else if (typeof onResolved === 'function') onResolved(null);
      };
      img.src = u;
    }
    tryUrl(url);
  }

  function hideBrokenGridOption(btn) {
    if (!btn || btn.classList.contains('dashboard-section-icon-option--broken')) return;
    btn.classList.add('dashboard-section-icon-option--broken');
    btn.setAttribute('hidden', 'hidden');
    btn.setAttribute('aria-hidden', 'true');
    updateGridStatus();
  }

  function iconsExcludingSelected(icons, selectedUrl) {
    if (!selectedUrl) return icons.slice();
    return icons.filter(function (icon) {
      return !iconUrlsMatch(icon.url, selectedUrl);
    });
  }

  function getTotalPages(count) {
    if (!count) return 0;
    return Math.ceil(count / ICONS_PAGE_SIZE);
  }

  function setIconPage(index, scrollGrid) {
    var total = getTotalPages(iconsFiltered.length);
    if (!total) {
      iconPageIndex = 0;
    } else {
      iconPageIndex = Math.max(0, Math.min(index, total - 1));
    }
    var start = iconPageIndex * ICONS_PAGE_SIZE;
    iconsPage = iconsFiltered.slice(start, start + ICONS_PAGE_SIZE);
    renderGridPage(scrollGrid);
    renderPager();
  }

  function updateGridStatus() {
    if (!statusEl) return;
    var total = iconsFiltered.length;
    var pages = getTotalPages(total);
    var visible = gridEl
      ? gridEl.querySelectorAll('.dashboard-section-icon-option:not(.dashboard-section-icon-option--broken):not([hidden])').length
      : iconsPage.length;
    var current = normalizeUrl(inputUrl ? inputUrl.value : '');
    var selectedNote = current && findIconByUrl(current) ? ' · selected shown above' : '';
    if (!total) {
      setStatus('0 icons');
      return;
    }
    if (pages > 1) {
      setStatus(
        visible +
          ' on page ' +
          (iconPageIndex + 1) +
          ' of ' +
          pages +
          ' · ' +
          total +
          ' in ' +
          capitalizeCategory(activeCategory) +
          selectedNote
      );
      return;
    }
    setStatus(total + ' in ' + capitalizeCategory(activeCategory) + selectedNote);
  }

  function renderPager() {
    if (!pagerEl) return;
    var total = iconsFiltered.length;
    var pages = getTotalPages(total);
    if (pages <= 1) {
      pagerEl.classList.add('hidden');
      return;
    }
    pagerEl.classList.remove('hidden');
    if (pagerLabel) pagerLabel.textContent = 'Page ' + (iconPageIndex + 1) + ' of ' + pages;
    if (pagerPrev) pagerPrev.disabled = iconPageIndex <= 0;
    if (pagerNext) pagerNext.disabled = iconPageIndex >= pages - 1;
  }

  function wireGridImages() {
    if (!gridEl) return;
    var buttons = gridEl.querySelectorAll('.dashboard-section-icon-option');
    for (var i = 0; i < buttons.length; i++) {
      (function (btn) {
        var img = btn.querySelector('img');
        if (!img) return;
        var url = btn.getAttribute('data-icon-url') || img.getAttribute('src') || '';
        var filename = iconFilename(url);
        wireIconImage(img, url, filename, function (resolved) {
          if (!resolved) {
            hideBrokenGridOption(btn);
            return;
          }
          if (resolved !== url) {
            btn.setAttribute('data-icon-url', resolved);
            img.src = resolved;
            var current = normalizeUrl(inputUrl ? inputUrl.value : '');
            if (current && iconUrlsMatch(url, current)) {
              inputUrl.value = resolved;
              dispatchUrlInput();
            }
          }
        });
      })(buttons[i]);
    }
  }

  function resolveDisplayUrl(url) {
    var match = findIconByUrl(url);
    return match ? match.url : normalizeIconCdnUrl(normalizeUrl(url));
  }

  function iconSearchHaystack(icon) {
    return [icon.name, icon.filename, icon.category, icon.url].join(' ').toLowerCase();
  }

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text || '';
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, '&#39;');
  }

  function showCdnUnavailableMessage() {
    var url = iconManifestUrl();
    if (gridEl) {
      gridEl.innerHTML =
        '<p class="dashboard-section-icon-grid-empty">The icon library is unavailable from the CDN. Check your connection and try again later.<br><a href="' +
        escapeAttr(url) +
        '" target="_blank" rel="noopener">cdn.ttmenus.com</a></p>';
    }
    setStatus('Icon library unavailable');
    if (pagerEl) pagerEl.classList.add('hidden');
  }

  function updateSelectedUi() {
    bind();
    var url = normalizeUrl(inputUrl ? inputUrl.value : '');
    var has = !!url;
    var displayUrl = has ? resolveDisplayUrl(url) : '';
    if (previewWrap) {
      previewWrap.classList.toggle('dashboard-section-icon-selected-preview--empty', !has);
      previewWrap.setAttribute('aria-hidden', has ? 'false' : 'true');
    }
    if (previewImg) {
      if (has && displayUrl) {
        previewImg.alt = '';
        wireIconImage(previewImg, displayUrl, iconFilename(url), function (resolved) {
          if (!resolved) {
            previewImg.removeAttribute('src');
            if (selectedLabel) selectedLabel.textContent = 'Icon unavailable on CDN';
          }
        });
      } else {
        previewImg.removeAttribute('src');
        previewImg.alt = '';
      }
    }
    if (selectedLabel) {
      if (!has) {
        selectedLabel.textContent = 'Select an icon below';
      } else if (selectedLabel.textContent !== 'Icon unavailable on CDN') {
        var match = findIconByUrl(url);
        selectedLabel.textContent = match
          ? match.name + ' (' + match.category + ')'
          : displayUrl.replace(/^https?:\/\//, '');
      }
    }
    if (gridEl && iconsAll.length) {
      var buttons = gridEl.querySelectorAll('.dashboard-section-icon-option');
      for (var b = 0; b < buttons.length; b++) {
        var btn = buttons[b];
        var btnUrl = btn.getAttribute('data-icon-url') || '';
        var on = has && iconUrlsMatch(btnUrl, url);
        btn.classList.toggle('dashboard-section-icon-option--selected', on);
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
      }
    }
    if (window.DashboardEditFieldPrompts && typeof window.DashboardEditFieldPrompts.refresh === 'function') {
      window.DashboardEditFieldPrompts.refresh();
    }
  }

  function dispatchUrlInput() {
    if (!inputUrl) return;
    inputUrl.dispatchEvent(new Event('input', { bubbles: true }));
    inputUrl.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function selectIcon(url) {
    if (!inputUrl) return;
    var normalized = normalizeIconCdnUrl(normalizeUrl(url));
    var match = findIconByUrl(normalized);
    inputUrl.value = match ? match.url : normalized;
    if (match && match.category) {
      activeCategory = match.category;
      renderCategoryTabs();
    }
    updateSelectedUi();
    applyFilters(true);
    dispatchUrlInput();
  }

  function syncFromInput() {
    bind();
    var raw = normalizeIconCdnUrl(normalizeUrl(inputUrl ? inputUrl.value : ''));
    if (raw && inputUrl) {
      if (raw !== inputUrl.value) inputUrl.value = raw;
      var match = findIconByUrl(raw);
      if (match) {
        if (match.url !== raw) inputUrl.value = match.url;
        activeCategory = match.category || activeCategory;
      } else if (raw.indexOf('/icons/') >= 0) {
        var parts = raw.split('/icons/');
        if (parts[1]) activeCategory = parts[1].split('/')[0] || activeCategory;
      }
      renderCategoryTabs();
    }
    updateSelectedUi();
    if (iconsAll.length) applyFilters(true);
  }

  function capitalizeCategory(c) {
    if (!c) return c;
    return c.charAt(0).toUpperCase() + c.slice(1);
  }

  function sortCategories(list) {
    var out = [];
    for (var i = 0; i < ICON_CATEGORY_ORDER.length; i++) {
      if (list.indexOf(ICON_CATEGORY_ORDER[i]) >= 0) out.push(ICON_CATEGORY_ORDER[i]);
    }
    for (var j = 0; j < list.length; j++) {
      if (out.indexOf(list[j]) < 0) out.push(list[j]);
    }
    return out;
  }

  function renderCategoryTabs() {
    if (!tabsEl) return;
    var cats = categories.length ? categories : ICON_CATEGORY_ORDER.slice();
    var html = '';
    for (var i = 0; i < cats.length; i++) {
      var cat = cats[i];
      var count = 0;
      for (var k = 0; k < iconsAll.length; k++) {
        if (iconsAll[k].category === cat) count++;
      }
      var on = cat === activeCategory;
      html +=
        '<button type="button" class="dashboard-section-icon-category-tab' +
        (on ? ' dashboard-section-icon-category-tab-active' : '') +
        '" role="tab" data-icon-category="' +
        escapeAttr(cat) +
        '" aria-selected="' +
        (on ? 'true' : 'false') +
        '" aria-controls="dashboardSectionIconGrid">' +
        escapeHtml(capitalizeCategory(cat)) +
        (iconsAll.length ? ' <span class="dashboard-section-icon-category-count">' + count + '</span>' : '') +
        '</button>';
    }
    tabsEl.innerHTML = html;
  }

  function applyFilters(scrollToSelected) {
    var q = inputSearch ? String(inputSearch.value || '').trim().toLowerCase() : '';
    var cat = activeCategory || '';
    var matched = iconsAll.filter(function (icon) {
      if (cat && icon.category !== cat) return false;
      if (q && iconSearchHaystack(icon).indexOf(q) === -1) return false;
      return true;
    });
    var current = normalizeUrl(inputUrl ? inputUrl.value : '');
    iconsFiltered = iconsExcludingSelected(matched, current);
    setIconPage(0, scrollToSelected);
  }

  function renderGridPage(scrollToTop) {
    if (!gridEl) return;
    if (!iconsAll.length) {
      if (loadFailed) {
        showCdnUnavailableMessage();
      } else {
        gridEl.innerHTML = '<p class="dashboard-section-icon-grid-empty">Loading icons from CDN…</p>';
      }
      if (pagerEl) pagerEl.classList.add('hidden');
      return;
    }
    if (!iconsFiltered.length) {
      var current = normalizeUrl(inputUrl ? inputUrl.value : '');
      if (current && findIconByUrl(current)) {
        gridEl.innerHTML =
          '<p class="dashboard-section-icon-grid-empty">Selected icon is shown above. No other icons match' +
          (inputSearch && inputSearch.value.trim() ? ' your search' : '') +
          ' in this category.</p>';
      } else {
        gridEl.innerHTML =
          '<p class="dashboard-section-icon-grid-empty">No icons in this category' +
          (inputSearch && inputSearch.value.trim() ? ' match your search' : '') +
          '.</p>';
      }
      if (pagerEl) pagerEl.classList.add('hidden');
      updateGridStatus();
      return;
    }
    var html = '';
    var selectedUrl = normalizeUrl(inputUrl ? inputUrl.value : '');
    for (var i = 0; i < iconsPage.length; i++) {
      var icon = iconsPage[i];
      var isSelected = selectedUrl && iconUrlsMatch(icon.url, selectedUrl);
      html +=
        '<button type="button" class="dashboard-section-icon-option' +
        (isSelected ? ' dashboard-section-icon-option--selected' : '') +
        '" role="option" data-icon-url="' +
        escapeAttr(icon.url) +
        '" aria-selected="' +
        (isSelected ? 'true' : 'false') +
        '" title="' +
        escapeAttr(icon.name + ' · ' + icon.category) +
        '">' +
        '<img src="' +
        escapeAttr(icon.url) +
        '" alt="" width="40" height="40" loading="lazy" decoding="async">' +
        '<span class="dashboard-section-icon-option-name">' +
        escapeHtml(icon.name) +
        '</span>' +
        '</button>';
    }
    gridEl.innerHTML = html;
    wireGridImages();
    updateGridStatus();
    if (scrollToTop) gridEl.scrollTop = 0;
  }

  function renderGrid(scrollToSelected) {
    setIconPage(iconPageIndex, scrollToSelected);
  }

  function applyManifest(data, source) {
    loadFailed = false;
    manifestSource = source || manifestSource;
    data = normalizeManifest(data);
    var list = data && Array.isArray(data.icons) ? data.icons : [];
    iconsAll = list.filter(function (icon) { return icon && icon.url; }).slice().sort(function (a, b) {
      return ((a.category || '') + (a.name || '')).localeCompare((b.category || '') + (b.name || ''));
    });
    var cats = data && Array.isArray(data.categories) ? data.categories.slice() : [];
    if (!cats.length) {
      var seen = {};
      iconsAll.forEach(function (icon) {
        if (icon.category && !seen[icon.category]) {
          seen[icon.category] = true;
          cats.push(icon.category);
        }
      });
    }
    categories = sortCategories(cats.length ? cats : ICON_CATEGORY_ORDER.slice());
    if (categories.indexOf(activeCategory) < 0) {
      activeCategory = categories[0] || ICON_CATEGORY_ORDER[0];
    }
    renderCategoryTabs();
    applyFilters(true);
    syncFromInput();
    if (manifestSource) {
      setStatus(iconsFiltered.length + ' in ' + capitalizeCategory(activeCategory) + ' · ' + iconsAll.length + ' total (' + manifestSource + ')');
    }
  }

  function fetchManifestFrom(url) {
    return fetch(url, { credentials: 'omit', cache: 'default' }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  function loadIcons(force) {
    if (loadPromise && !force) return loadPromise;
    bind();
    renderCategoryTabs();
    updateSelectedUi();

    setStatus('Loading icons from CDN…');
    if (gridEl) {
      gridEl.innerHTML =
        '<p class="dashboard-section-icon-grid-empty">Loading icons from <a href="https://cdn.ttmenus.com/api/list-icons/index.json" target="_blank" rel="noopener">cdn.ttmenus.com</a>…</p>';
    }

    loadPromise = fetchManifestFrom(iconManifestUrl())
      .then(function (data) {
        if (!data || !Array.isArray(data.icons) || !data.icons.length) {
          throw new Error('empty CDN manifest');
        }
        applyManifest(data, 'cdn.ttmenus.com');
      })
      .catch(function (err) {
        loadFailed = true;
        iconsAll = [];
        iconsFiltered = [];
        iconsPage = [];
        iconPageIndex = 0;
        loadPromise = null;
        renderCategoryTabs();
        updateSelectedUi();
        showCdnUnavailableMessage();
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[Section icon picker] CDN unavailable', err);
        }
      });
    return loadPromise;
  }

  function scheduleFilter() {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      searchTimer = null;
      applyFilters(false);
    }, SEARCH_DEBOUNCE_MS);
  }

  var eventsBound = false;

  function bindEvents() {
    if (eventsBound) return;
    eventsBound = true;
    if (tabsEl) {
      tabsEl.addEventListener('click', function (e) {
        var tab = e.target && e.target.closest ? e.target.closest('[data-icon-category]') : null;
        if (!tab) return;
        activeCategory = tab.getAttribute('data-icon-category') || activeCategory;
        renderCategoryTabs();
        applyFilters(true);
      });
    }
    if (gridEl) {
      gridEl.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('.dashboard-section-icon-option') : null;
        if (!btn) return;
        selectIcon(btn.getAttribute('data-icon-url') || '');
      });
    }
    if (inputSearch) {
      inputSearch.addEventListener('input', scheduleFilter);
    }
    if (pagerPrev) {
      pagerPrev.addEventListener('click', function () {
        setIconPage(iconPageIndex - 1, true);
      });
    }
    if (pagerNext) {
      pagerNext.addEventListener('click', function () {
        setIconPage(iconPageIndex + 1, true);
      });
    }
  }

  function bind() {
    inputUrl = document.getElementById('dashboardEditSectionIcon');
    inputSearch = document.getElementById('dashboardSectionIconSearch');
    tabsEl = document.getElementById('dashboardSectionIconCategoryTabs');
    gridEl = document.getElementById('dashboardSectionIconGrid');
    pagerEl = document.getElementById('dashboardSectionIconPager');
    pagerPrev = document.getElementById('dashboardSectionIconPagerPrev');
    pagerNext = document.getElementById('dashboardSectionIconPagerNext');
    pagerLabel = document.getElementById('dashboardSectionIconPagerLabel');
    statusEl = document.getElementById('dashboardSectionIconStatus');
    previewWrap = document.getElementById('dashboardSectionIconSelectedPreview');
    previewImg = document.getElementById('dashboardSectionIconPreviewImg');
    selectedLabel = document.getElementById('dashboardSectionIconSelectedLabel');
    if (!tabsEl && !gridEl) return false;
    bindEvents();
    if (!categories.length) categories = ICON_CATEGORY_ORDER.slice();
    if (tabsEl && !tabsEl.childElementCount) renderCategoryTabs();
    return true;
  }

  function init() {
    try {
      bind();
      loadIcons(false);
    } catch (err) {
      loadFailed = true;
      bind();
      showCdnUnavailableMessage();
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[Section icon picker] init failed', err);
      }
    }
  }

  function ensureLoaded() {
    bind();
    if (iconsAll.length) {
      renderCategoryTabs();
      applyFilters(false);
      syncFromInput();
      return Promise.resolve();
    }
    return loadIcons(loadFailed);
  }

  global.DashboardSectionIconPicker = {
    init: init,
    ensureLoaded: ensureLoaded,
    syncFromInput: syncFromInput,
    loadIcons: function () {
      return loadIcons(true);
    },
    ICON_CDN_BASE: ICON_CDN_BASE,
    ICON_CATEGORY_ORDER: ICON_CATEGORY_ORDER,
  };

  function scheduleInit() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  scheduleInit();
})(typeof window !== 'undefined' ? window : this);
