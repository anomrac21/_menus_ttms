function initMenuCatalog() {
  var list = document.getElementById('menuCatalogList');
  var emptyEl = document.getElementById('menuCatalogEmpty');
  var addBtn = document.getElementById('btnMenuCatalogAdd');
  var summaryEl = document.getElementById('menuCatalogSummary');
  if (!list) return;

  var kind = list.getAttribute('data-catalog-kind') || 'sections';
  var addParam = list.getAttribute('data-catalog-add') || 'section';
  var noun = summaryEl ? (summaryEl.getAttribute('data-noun') || 'item') : 'item';
  var tabs = document.getElementById('menuCatalogLocationTabs');
  var sectionTabs = document.getElementById('menuCatalogSectionTabs');
  var activeSlug = '';
  var activeSection = '';

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function cards() {
    return list.querySelectorAll('.dashboard-settings-location-card');
  }

  function cardLocationOk(card) {
    var slug = card.getAttribute('data-location-slug') || '';
    return !activeSlug || !slug || slug === activeSlug;
  }

  function cardSectionOk(card) {
    if (!sectionTabs) return true;
    var key = card.getAttribute('data-section-key') || '';
    return !activeSection || !key || key === activeSection;
  }

  function visibleCards() {
    return Array.prototype.filter.call(cards(), function (card) {
      return cardLocationOk(card) && cardSectionOk(card);
    });
  }

  function scopeLabel() {
    var parts = [];
    var loc = activeLocation();
    if (loc.label) parts.push(loc.label);
    if (sectionTabs && activeSection) {
      var tab = sectionTabs.querySelector('.dashboard-orders-hub-tab.is-active');
      var label = tab ? String(tab.textContent || '').replace(/\s+/g, ' ').trim() : activeSection;
      if (label) parts.push(label);
    }
    return parts.join(' · ');
  }

  function updateSummary() {
    var count = visibleCards().length;
    var scope = scopeLabel();
    var where = scope ? (' in ' + scope) : '';
    if (emptyEl) emptyEl.classList.toggle('hidden', count > 0);
    if (!summaryEl) return;
    if (count === 0) summaryEl.textContent = 'No ' + noun + 's' + where;
    else if (count === 1) summaryEl.textContent = '1 ' + noun + where;
    else summaryEl.textContent = count + ' ' + noun + 's' + where;
  }

  function openEditor(card) {
    var root = card && card.querySelector('.menu-item-actions');
    if (!root || !window.TTMSMenuItemEditModal || typeof window.TTMSMenuItemEditModal.open !== 'function') return;
    window.TTMSMenuItemEditModal.open(root);
  }

  function activeLocation() {
    if (!tabs) return { slug: '', label: '' };
    var tab = tabs.querySelector('.dashboard-orders-hub-tab.is-active');
    if (!tab) return { slug: '', label: '' };
    return {
      slug: tab.getAttribute('data-location-slug') || '',
      label: tab.getAttribute('data-location-label') || ''
    };
  }

  function itemSectionPath(locationSlug, sectionKey) {
    if (!sectionKey) return '';
    if (locationSlug === '_shared') return '_shared/' + sectionKey;
    if (locationSlug) return 'locations/' + locationSlug + '/' + sectionKey;
    return sectionKey;
  }

  function syncTargets() {
    var loc = activeLocation();
    if (loc.slug) {
      var sectionParent = loc.slug === '_shared' ? '_shared' : ('locations/' + loc.slug);
      list.setAttribute('data-new-section-parent', sectionParent);
      if (loc.label) list.setAttribute('data-new-section-label', loc.label);
    } else if (tabs) {
      var tab = tabs.querySelector('.dashboard-orders-hub-tab.is-active');
      if (tab) {
        var parent = tab.getAttribute('data-section-parent') || '';
        var label = tab.getAttribute('data-location-label') || '';
        if (parent) list.setAttribute('data-new-section-parent', parent);
        if (label) list.setAttribute('data-new-section-label', label);
      }
    }
    if (sectionTabs && activeSection) {
      var path = itemSectionPath(activeSlug || loc.slug, activeSection);
      if (path) {
        list.setAttribute('data-new-item-section', path);
        list.setAttribute('data-new-item-prefix', '/' + path + '/');
      }
    }
  }

  function applyCardVisibility() {
    Array.prototype.forEach.call(cards(), function (card) {
      card.classList.toggle('hidden', !(cardLocationOk(card) && cardSectionOk(card)));
    });
    syncTargets();
    updateSummary();
  }

  function sectionsForLocation() {
    var seen = {};
    var sections = [];
    Array.prototype.forEach.call(cards(), function (card) {
      if (!cardLocationOk(card)) return;
      var key = card.getAttribute('data-section-key') || '';
      if (!key || seen[key]) return;
      seen[key] = true;
      var weight = parseInt(card.getAttribute('data-section-weight') || '0', 10);
      if (isNaN(weight)) weight = 0;
      sections.push({
        key: key,
        label: card.getAttribute('data-section-label') || key,
        weight: weight
      });
    });
    sections.sort(function (a, b) {
      if (a.weight !== b.weight) return a.weight - b.weight;
      return String(a.label).localeCompare(String(b.label));
    });
    return sections;
  }

  function renderSectionTabs(preferredKey) {
    if (!sectionTabs) return;
    var sections = sectionsForLocation();
    if (!sections.length) {
      sectionTabs.innerHTML = '';
      activeSection = '';
      return;
    }
    var key = preferredKey || '';
    var found = false;
    var i;
    for (i = 0; i < sections.length; i++) {
      if (sections[i].key === key) found = true;
    }
    if (!found) key = sections[0].key;
    activeSection = key;
    sectionTabs.innerHTML = sections.map(function (s) {
      var on = s.key === activeSection;
      return '<button type="button" class="dashboard-orders-hub-tab' + (on ? ' is-active' : '') + '" role="tab" data-section-key="' + esc(s.key) + '" aria-selected="' + (on ? 'true' : 'false') + '" aria-controls="menuCatalogList">' + esc(s.label) + '</button>';
    }).join('');
  }

  function applyLocation(slug) {
    activeSlug = slug || '';
    renderSectionTabs(activeSection);
    applyCardVisibility();
  }

  function appendCard(html) {
    var wrap = document.createElement('div');
    wrap.innerHTML = html;
    var card = wrap.firstElementChild;
    if (!card) return null;
    var loc = activeLocation();
    if (loc.slug) card.setAttribute('data-location-slug', loc.slug);
    list.appendChild(card);
    applyLocation(activeSlug);
    openEditor(card);
    return card;
  }

  function nextCount(selector) {
    return list.querySelectorAll(selector).length + 1;
  }

  function addSection() {
    var n = nextCount('[data-dashboard-edit-new-section]');
    var parent = list.getAttribute('data-new-section-parent') || '';
    var slug = (parent ? parent + '/' : '') + 'new-section-' + n;
    var title = 'New section ' + n;
    var meta = '';
    appendCard(
      '<div class="dashboard-settings-location-card">' +
      '<div class="dashboard-settings-location-card-main">' +
      '<h3 class="dashboard-settings-location-card-title">' + esc(title) + '</h3>' + meta +
      '</div>' +
      '<div class="dashboard-settings-location-card-actions">' +
      '<button type="button" class="btn-dash btn-dash-secondary btn-menu-catalog-edit"><i class="fa fa-pencil" aria-hidden="true"></i> Edit</button>' +
      '</div>' +
      '<div class="menu-header" hidden data-dashboard-edit-new-section="1" data-section-slug="' + esc(slug) + '">' +
      '<h2><a href="/' + esc(slug) + '/">' + esc(title) + '</a></h2>' +
      '<div class="menu-summary"></div>' +
      '<div class="menu-item-actions" data-actions-kind="section-header" data-section-slug="' + esc(slug) + '" data-item-title="' + esc(title) + '"></div>' +
      '</div></div>'
    );
  }

  function addItem() {
    var n = nextCount('[data-dashboard-edit-new-item]');
    var section = (list.getAttribute('data-new-item-section') || 'menu-items').replace(/^\/+|\/+$/g, '');
    var prefix = list.getAttribute('data-new-item-prefix') || ('/' + section + '/');
    if (prefix.charAt(0) !== '/') prefix = '/' + prefix;
    if (prefix.charAt(prefix.length - 1) !== '/') prefix += '/';
    var slug = 'new-item-' + n;
    var title = 'New item ' + n;
    var itemUrl = prefix + slug + '/';
    var sectionKey = activeSection || '';
    var sectionLabel = sectionKey;
    var sectionWeight = '0';
    if (sectionTabs) {
      var sectionTab = sectionTabs.querySelector('.dashboard-orders-hub-tab.is-active');
      if (sectionTab) {
        sectionKey = sectionTab.getAttribute('data-section-key') || sectionKey;
        sectionLabel = sectionTab.textContent || sectionKey;
      }
    }
    appendCard(
      '<div class="dashboard-settings-location-card" data-section-key="' + esc(sectionKey) + '" data-section-label="' + esc(sectionLabel) + '" data-section-weight="' + esc(sectionWeight) + '">' +
      '<div class="dashboard-settings-location-card-main">' +
      '<h3 class="dashboard-settings-location-card-title">' + esc(title) + '</h3>' +
      '</div>' +
      '<div class="dashboard-settings-location-card-actions">' +
      '<button type="button" class="btn-dash btn-dash-secondary btn-menu-catalog-edit"><i class="fa fa-pencil" aria-hidden="true"></i> Edit</button>' +
      '</div>' +
      '<div class="menu-item-card" hidden data-dashboard-edit-new-item="1" data-item-url="' + esc(itemUrl) + '" data-section-slug="' + esc(section) + '">' +
      '<span class="menu-item-title">' + esc(title) + '</span>' +
      '<p class="menu-item-description"></p>' +
      '<div class="menu-item-actions" data-actions-kind="menu-item" data-item-url="' + esc(itemUrl) + '" data-item-title="' + esc(title) + '" data-section-slug="' + esc(section) + '"></div>' +
      '</div></div>'
    );
  }

  function addPromotion() {
    var n = nextCount('[data-dashboard-edit-new-promotion]');
    var slug = 'newpromotion' + n;
    var title = 'New promotion ' + n;
    var adId = 'menu-ad-' + slug;
    var adUrl = '/promotions/' + slug + '/';
    var index = String(list.querySelectorAll('.ads-reels-slide').length);
    appendCard(
      '<div class="dashboard-settings-location-card">' +
      '<div class="dashboard-settings-location-card-main">' +
      '<h3 class="dashboard-settings-location-card-title">' + esc(title) + '</h3>' +
      '</div>' +
      '<div class="dashboard-settings-location-card-actions">' +
      '<button type="button" class="btn-dash btn-dash-secondary btn-menu-catalog-edit"><i class="fa fa-pencil" aria-hidden="true"></i> Edit</button>' +
      '</div>' +
      '<article class="ads-reels-slide" hidden data-dashboard-edit-new-promotion="1" data-catalog-index="' + esc(index) + '" data-ad-id="' + esc(adId) + '" data-ad-title="' + esc(title) + '" data-ad-url="' + esc(adUrl) + '">' +
      '<div class="menu-item-actions" data-actions-kind="promotion" data-promotion-catalog-index="' + esc(index) + '" data-ad-id="' + esc(adId) + '" data-item-title="' + esc(title) + '" data-item-url="' + esc(adUrl) + '"></div>' +
      '</article></div>'
    );
  }

  function addCurrent() {
    if (kind === 'items') addItem();
    else if (kind === 'promotions') addPromotion();
    else addSection();
  }

  list.addEventListener('click', function (ev) {
    var btn = ev.target.closest('.btn-menu-catalog-edit');
    if (!btn || !list.contains(btn)) return;
    openEditor(btn.closest('.dashboard-settings-location-card'));
  });
  if (addBtn) addBtn.addEventListener('click', addCurrent);
  if (tabs) {
    tabs.addEventListener('click', function (ev) {
      var tab = ev.target.closest('.dashboard-orders-hub-tab');
      if (!tab || !tabs.contains(tab)) return;
      Array.prototype.forEach.call(tabs.querySelectorAll('.dashboard-orders-hub-tab'), function (btn) {
        var on = btn === tab;
        btn.classList.toggle('is-active', on);
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      applyLocation(tab.getAttribute('data-location-slug') || '');
    });
    var current = tabs.querySelector('.dashboard-orders-hub-tab.is-active');
    if (sectionTabs) {
      var currentSec = sectionTabs.querySelector('.dashboard-orders-hub-tab.is-active');
      activeSection = currentSec ? (currentSec.getAttribute('data-section-key') || '') : '';
    }
    applyLocation(current ? (current.getAttribute('data-location-slug') || '') : '');
  } else if (sectionTabs) {
    var currentSec = sectionTabs.querySelector('.dashboard-orders-hub-tab.is-active');
    renderSectionTabs(currentSec ? (currentSec.getAttribute('data-section-key') || '') : '');
    applyCardVisibility();
  }
  if (sectionTabs) {
    sectionTabs.addEventListener('click', function (ev) {
      var tab = ev.target.closest('.dashboard-orders-hub-tab');
      if (!tab || !sectionTabs.contains(tab)) return;
      activeSection = tab.getAttribute('data-section-key') || '';
      Array.prototype.forEach.call(sectionTabs.querySelectorAll('.dashboard-orders-hub-tab'), function (btn) {
        var on = btn === tab;
        btn.classList.toggle('is-active', on);
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      applyCardVisibility();
    });
  }

  try {
    var params = new URLSearchParams(window.location.search);
    if (params.get('add') === addParam) {
      addCurrent();
      params.delete('add');
      var query = params.toString();
      history.replaceState(null, '', window.location.pathname + (query ? '?' + query : '') + window.location.hash);
    }
  } catch (err) { /* ignore */ }
}
