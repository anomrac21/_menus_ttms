function initMenuCatalog() {
  var list = document.getElementById('menuCatalogList');
  var emptyEl = document.getElementById('menuCatalogEmpty');
  var addBtn = document.getElementById('btnMenuCatalogAdd');
  var summaryEl = document.getElementById('menuCatalogSummary');
  if (!list) return;

  var kind = list.getAttribute('data-catalog-kind') || 'sections';
  var addParam = list.getAttribute('data-catalog-add') || 'section';
  var refreshOrderFeedback = function () {};
  var arrangeVisibleOrder = function () {};
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
    arrangeVisibleOrder();
    updateSummary();
    refreshOrderFeedback();
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
      '<button type="button" class="dashboard-catalog-drag" aria-label="Drag to reorder ' + esc(title) + '"><i class="fa fa-bars" aria-hidden="true"></i></button>' +
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
      '<button type="button" class="dashboard-catalog-drag" aria-label="Drag to reorder ' + esc(title) + '"><i class="fa fa-bars" aria-hidden="true"></i></button>' +
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
    var loc = activeLocation();
    var contentPath = 'content/_shared/promotions/' + slug + '.md';
    var adUrl = '/promotions/' + slug + '/';
    if (loc.slug && loc.slug !== '_shared') {
      contentPath = 'content/locations/' + loc.slug + '/promotions/' + slug + '.md';
      adUrl = '/locations/' + loc.slug + '/promotions/' + slug + '/';
    }
    var adId = 'menu-ad-' + slug;
    var index = String(list.querySelectorAll('.ads-reels-slide').length);
    appendCard(
      '<div class="dashboard-settings-location-card">' +
      '<button type="button" class="dashboard-catalog-drag" aria-label="Drag to reorder ' + esc(title) + '"><i class="fa fa-bars" aria-hidden="true"></i></button>' +
      '<div class="dashboard-settings-location-card-main">' +
      '<h3 class="dashboard-settings-location-card-title">' + esc(title) + '</h3>' +
      '</div>' +
      '<div class="dashboard-settings-location-card-actions">' +
      '<button type="button" class="btn-dash btn-dash-secondary btn-menu-catalog-edit"><i class="fa fa-pencil" aria-hidden="true"></i> Edit</button>' +
      '</div>' +
      '<article class="ads-reels-slide" hidden data-dashboard-edit-new-promotion="1" data-catalog-index="' + esc(index) + '" data-ad-id="' + esc(adId) + '" data-ad-title="' + esc(title) + '" data-ad-url="' + esc(adUrl) + '" data-content-path="' + esc(contentPath) + '">' +
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

  enableSectionReorder();

  function sectionSlugOf(card) {
    var el = card && card.querySelector('[data-section-slug]');
    return el ? String(el.getAttribute('data-section-slug') || '').replace(/^\/+|\/+$/g, '') : '';
  }

  function itemContentPathOf(card) {
    var el = card && card.querySelector('[data-item-url]');
    var url = el ? String(el.getAttribute('data-item-url') || '').split('?')[0].replace(/\\/g, '/') : '';
    if (!url) return '';
    if (url.charAt(0) !== '/') url = '/' + url;
    url = url.replace(/\/+$/, '');
    if (!url) return '';
    return 'content' + url + '.md';
  }

  function promotionContentPathOf(card) {
    var stored = card && card.querySelector('[data-content-path]');
    var path = stored ? String(stored.getAttribute('data-content-path') || '').replace(/\\/g, '/') : '';
    if (path) return path;
    var idEl = card && card.querySelector('[data-ad-id]');
    var id = idEl ? String(idEl.getAttribute('data-ad-id') || '') : '';
    var slug = '';
    if (id.indexOf('menu-ad-') === 0) slug = id.replace(/^menu-ad-/, '').replace(/-\d+$/, '');
    if (!slug) {
      var ad = card && card.querySelector('[data-ad-url]');
      var url = ad ? String(ad.getAttribute('data-ad-url') || '').split('?')[0] : '';
      var parts = url.split('/').filter(Boolean);
      slug = parts.length ? parts[parts.length - 1] : '';
    }
    if (!slug) return '';
    return 'content/promotions/' + slug + '.md';
  }

  function orderKey(card) {
    if (kind === 'items') return itemContentPathOf(card);
    if (kind === 'promotions') return promotionContentPathOf(card);
    return sectionSlugOf(card);
  }

  function contentPathForKey(key) {
    if (!key) return '';
    if (kind === 'items' || kind === 'promotions') return key;
    return 'content/' + key + '/_index.md';
  }

  function groupId(card) {
    if (kind === 'items') {
      return (card.getAttribute('data-location-slug') || '') + '\0' + (card.getAttribute('data-section-key') || '');
    }
    return card.getAttribute('data-location-slug') || '';
  }

  function isNewOrderKey(key) {
    if (!key) return true;
    if (kind === 'items') return key.indexOf('/new-item-') !== -1;
    if (kind === 'promotions') return key.indexOf('/newpromotion') !== -1;
    return key.indexOf('new-section-') !== -1;
  }

  var effectiveWeight = {};
  var liveWeight = {};

  function cmsApiBase() {
    var api = String(window.CMS_API_URL || '').replace(/\/+$/, '');
    if (api) return api;
    var svc = String(window.CMS_SERVICE_URL || 'https://cms.ttmenus.com').replace(/\/+$/, '');
    return /\/api$/i.test(svc) ? svc : svc + '/api';
  }

  function cmsHeaders() {
    var headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
    var token = '';
    if (window.AuthClient && typeof window.AuthClient.getAccessToken === 'function') {
      token = window.AuthClient.getAccessToken() || '';
    }
    if (!token) {
      try { token = localStorage.getItem('ttmenus_access_token') || ''; } catch (e) { token = ''; }
    }
    if (token) headers.Authorization = 'Bearer ' + token;
    return headers;
  }

  function setReorderStatus(message, isError) {
    var el = document.getElementById('menuCatalogReorderStatus');
    if (!el) return;
    el.textContent = message || '';
    el.classList.toggle('is-error', !!isError);
  }

  function weightForCard(card) {
    var key = orderKey(card);
    if (key && effectiveWeight[key] != null) return effectiveWeight[key];
    if (key && liveWeight[key] != null) return liveWeight[key];
    return null;
  }

  function slotVisibleByWeight() {
    var slots = visibleCards();
    if (slots.length < 2) return;
    var ranked = slots.map(function (card, index) { return { card: card, index: index }; });
    if (!ranked.some(function (row) { return weightForCard(row.card) != null; })) return;
    ranked.sort(function (a, b) {
      var wa = weightForCard(a.card);
      var wb = weightForCard(b.card);
      if (wa == null) wa = 100000 + a.index;
      if (wb == null) wb = 100000 + b.index;
      if (wa !== wb) return wa - wb;
      return a.index - b.index;
    });
    var marks = slots.map(function (card) {
      var mark = document.createComment('');
      card.parentNode.insertBefore(mark, card);
      return mark;
    });
    ranked.forEach(function (row, index) {
      marks[index].parentNode.insertBefore(row.card, marks[index]);
    });
    marks.forEach(function (mark) { if (mark.parentNode) mark.parentNode.removeChild(mark); });
  }

  function syncSectionOrder() {
    var order = [];
    var seen = {};
    visibleCards().forEach(function (card) {
      var key = orderKey(card);
      if (!key || seen[key]) return;
      seen[key] = true;
      order.push(key);
    });
    var baseWeight = kind === 'promotions' ? 0 : (kind === 'items' ? 1 : 2);
    var placed = 0;
    order.forEach(function (key) {
      if (isNewOrderKey(key)) return;
      effectiveWeight[key] = baseWeight + placed;
      placed += 1;
    });
    order.forEach(function (key, index) {
      if (!isNewOrderKey(key)) return;
      var prev = null;
      var next = null;
      var i;
      for (i = index - 1; i >= 0; i--) {
        if (!isNewOrderKey(order[i]) && effectiveWeight[order[i]] != null) {
          prev = effectiveWeight[order[i]];
          break;
        }
      }
      for (i = index + 1; i < order.length; i++) {
        if (!isNewOrderKey(order[i]) && effectiveWeight[order[i]] != null) {
          next = effectiveWeight[order[i]];
          break;
        }
      }
      if (prev != null && next != null) effectiveWeight[key] = (prev + next) / 2;
      else if (prev != null) effectiveWeight[key] = prev + 0.5;
      else if (next != null) effectiveWeight[key] = next - 0.5;
      else effectiveWeight[key] = baseWeight;
    });
    var touched = {};
    order.forEach(function (key) { touched[key] = true; });
    if (kind === 'promotions') {
      slotVisibleByWeight();
      return order;
    }
    var groupOrder = [];
    var groups = {};
    var original = [];
    Array.prototype.forEach.call(cards(), function (card, index) {
      original.push(card);
      var id = groupId(card);
      if (!groups[id]) {
        groups[id] = [];
        groupOrder.push(id);
      }
      groups[id].push(card);
    });
    var frag = document.createDocumentFragment();
    groupOrder.forEach(function (id) {
      var group = groups[id];
      var affects = group.some(function (card) { return touched[orderKey(card)]; });
      if (affects) {
        group.sort(function (a, b) {
          var ka = orderKey(a);
          var kb = orderKey(b);
          var wa = effectiveWeight[ka];
          var wb = effectiveWeight[kb];
          if (wa == null && liveWeight[ka] != null) wa = liveWeight[ka];
          if (wb == null && liveWeight[kb] != null) wb = liveWeight[kb];
          if (wa == null) wa = 100000 + original.indexOf(a);
          if (wb == null) wb = 100000 + original.indexOf(b);
          if (wa !== wb) return wa - wb;
          return original.indexOf(a) - original.indexOf(b);
        });
      }
      group.forEach(function (card) { frag.appendChild(card); });
    });
    list.appendChild(frag);
    return order;
  }

  function cardAtPoint(x, y, ignore) {
    ignore.style.pointerEvents = 'none';
    var el = document.elementFromPoint(x, y);
    ignore.style.pointerEvents = '';
    if (!el || !el.closest) return null;
    var card = el.closest('.dashboard-settings-location-card');
    if (!card || !list.contains(card) || card.classList.contains('hidden') || card === ignore) return null;
    return card;
  }

  function cardTitle(card) {
    var el = card && card.querySelector('.dashboard-settings-location-card-title');
    return el ? String(el.textContent || '').replace(/\s+/g, ' ').trim() : 'Section';
  }

  function clearDropMarks() {
    Array.prototype.forEach.call(cards(), function (card) {
      card.classList.remove('is-drop-before', 'is-drop-after');
    });
  }

  function setOrderFlag(card, on, label) {
    var meta = card.querySelector('.dashboard-settings-location-card-meta');
    var flag = card.querySelector('.dashboard-catalog-order-flag');
    if (!on) {
      if (flag) flag.remove();
      return;
    }
    if (!meta) {
      meta = document.createElement('p');
      meta.className = 'dashboard-settings-location-card-meta';
      var main = card.querySelector('.dashboard-settings-location-card-main');
      if (main) main.appendChild(meta);
    }
    if (!flag) {
      flag = document.createElement('span');
      flag.className = 'dashboard-catalog-order-flag';
      meta.appendChild(flag);
    }
    flag.textContent = 'Not live';
    flag.title = label || 'Order differs from the live menu';
  }

  function enableSectionReorder() {
    if (kind !== 'sections' && kind !== 'items' && kind !== 'promotions') return;
    var drag = null;
    var saveChain = Promise.resolve();
    var reorderPhase = 'idle';
    var publishedWeight = {};
    var liveReady = false;
    var liveDomIndex = {};

    function captureLiveDom() {
      var counters = {};
      Array.prototype.forEach.call(cards(), function (card) {
        var key = orderKey(card);
        if (!key || isNewOrderKey(key)) return;
        var id = groupId(card);
        var token = id + '\0' + key;
        if (liveDomIndex[token] != null) return;
        if (counters[id] == null) counters[id] = 0;
        liveDomIndex[token] = counters[id];
        counters[id] += 1;
      });
    }

    function visibleSlugOrder() {
      var order = [];
      var seen = {};
      visibleCards().forEach(function (card) {
        var key = orderKey(card);
        if (!key || seen[key]) return;
        seen[key] = true;
        order.push(key);
      });
      return order;
    }

    function differLabel(count) {
      var noun = kind === 'items'
        ? (count === 1 ? 'menu item' : 'menu items')
        : kind === 'promotions'
          ? (count === 1 ? 'promotion' : 'promotions')
          : (count === 1 ? 'section' : 'sections');
      return count + ' ' + noun + (count === 1 ? ' differs' : ' differ') + ' from the live menu.';
    }

    function weightsDiscriminate(keys) {
      var seen = {};
      var i;
      for (i = 0; i < keys.length; i++) {
        var weight = publishedWeight[keys[i]];
        if (weight == null || seen[weight]) return false;
        seen[weight] = true;
      }
      return keys.length > 0;
    }

    function markChangedFromLive(announceMatch) {
      var current = visibleSlugOrder().filter(function (key) { return !isNewOrderKey(key); });
      var groupToken = '';
      var visible = visibleCards();
      if (visible.length) groupToken = groupId(visible[0]);
      var liveIndex = {};
      var ranked = current.slice();
      if (weightsDiscriminate(current)) {
        ranked.sort(function (a, b) { return publishedWeight[a] - publishedWeight[b]; });
      } else {
        ranked.sort(function (a, b) {
          var ra = liveDomIndex[groupToken + '\0' + a];
          var rb = liveDomIndex[groupToken + '\0' + b];
          if (ra == null) ra = 999999;
          if (rb == null) rb = 999999;
          return ra - rb;
        });
      }
      ranked.forEach(function (slug, index) { liveIndex[slug] = index; });
      var currentIndex = {};
      current.forEach(function (slug, index) { currentIndex[slug] = index; });
      var changed = 0;
      Array.prototype.forEach.call(cards(), function (card) {
        var slug = orderKey(card);
        var now = currentIndex[slug];
        var live = liveIndex[slug];
        var moved = liveReady && now != null && live != null && now !== live;
        card.classList.toggle('is-order-changed', moved);
        if (!moved) {
          setOrderFlag(card, false);
          return;
        }
        if (card.classList.contains('hidden')) {
          setOrderFlag(card, true, 'Order differs from the live menu');
          return;
        }
        setOrderFlag(card, true, 'Live position ' + (live + 1) + ', now ' + (now + 1));
      });
      current.forEach(function (slug) {
        if (liveIndex[slug] != null && liveIndex[slug] !== currentIndex[slug]) changed += 1;
      });
      if (reorderPhase !== 'idle') return changed;
      if (!liveReady) return changed;
      var detail = '';
      if (changed > 0) detail = differLabel(changed);
      if (changed === 0) setReorderStatus(announceMatch ? 'Order matches the live menu.' : '');
      else setReorderStatus(announceMatch ? 'Order saved. ' + detail : detail);
      return changed;
    }

    refreshOrderFeedback = function () {
      if (reorderPhase === 'idle') markChangedFromLive(false);
    };

    arrangeVisibleOrder = function () {
      if (kind !== 'promotions' || reorderPhase !== 'idle') return;
      slotVisibleByWeight();
    };

    function pickCard(card) {
      clearDropMarks();
      Array.prototype.forEach.call(cards(), function (other) {
        other.classList.remove('is-reorder-selected', 'is-reorder-moving');
      });
      card.classList.add('is-reorder-selected');
      reorderPhase = 'selected';
      setReorderStatus(cardTitle(card) + ' selected');
    }

    list.addEventListener('pointerdown', function (ev) {
      var handle = ev.target.closest && ev.target.closest('.dashboard-catalog-drag');
      if (!handle || !list.contains(handle)) return;
      if (ev.button != null && ev.button !== 0) return;
      var card = handle.closest('.dashboard-settings-location-card');
      if (!card || card.classList.contains('hidden')) return;
      ev.preventDefault();
      drag = { card: card, pointerId: ev.pointerId, startY: ev.clientY, moved: false };
      try { handle.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
      pickCard(card);
    });

    list.addEventListener('pointermove', function (ev) {
      if (!drag || ev.pointerId !== drag.pointerId) return;
      if (!drag.moved && Math.abs(ev.clientY - drag.startY) > 3) {
        drag.moved = true;
        drag.card.classList.add('is-reorder-moving');
        reorderPhase = 'moving';
        setReorderStatus('Moving ' + cardTitle(drag.card));
      }
      if (!drag.moved) return;
      if (ev.clientY < 72) window.scrollBy(0, -14);
      else if (ev.clientY > window.innerHeight - 72) window.scrollBy(0, 14);
      var over = cardAtPoint(ev.clientX, ev.clientY, drag.card);
      clearDropMarks();
      if (!over) return;
      var rect = over.getBoundingClientRect();
      var placeAfter = ev.clientY > rect.top + rect.height / 2;
      over.classList.add(placeAfter ? 'is-drop-after' : 'is-drop-before');
      if (placeAfter) {
        if (over.nextElementSibling !== drag.card) over.after(drag.card);
      } else if (over.previousElementSibling !== drag.card) {
        list.insertBefore(drag.card, over);
      }
    });

    function finishDrag(ev) {
      if (!drag || (ev && ev.pointerId !== drag.pointerId)) return;
      var card = drag.card;
      var moved = drag.moved;
      drag = null;
      clearDropMarks();
      card.classList.remove('is-reorder-selected', 'is-reorder-moving');
      reorderPhase = 'idle';
      if (!moved) {
        markChangedFromLive(false);
        return;
      }
      queueSave(syncSectionOrder());
    }

    list.addEventListener('pointerup', finishDrag);
    list.addEventListener('pointercancel', finishDrag);

    list.addEventListener('focusin', function (ev) {
      if (drag) return;
      var handle = ev.target.closest && ev.target.closest('.dashboard-catalog-drag');
      if (!handle || !list.contains(handle)) return;
      var card = handle.closest('.dashboard-settings-location-card');
      if (!card || card.classList.contains('hidden')) return;
      pickCard(card);
    });

    list.addEventListener('focusout', function (ev) {
      if (drag) return;
      var handle = ev.target.closest && ev.target.closest('.dashboard-catalog-drag');
      if (!handle || !list.contains(handle)) return;
      var next = ev.relatedTarget && ev.relatedTarget.closest && ev.relatedTarget.closest('.dashboard-catalog-drag');
      if (next && list.contains(next)) return;
      var card = handle.closest('.dashboard-settings-location-card');
      if (card) card.classList.remove('is-reorder-selected', 'is-reorder-moving');
      reorderPhase = 'idle';
      markChangedFromLive(false);
    });

    list.addEventListener('keydown', function (ev) {
      var handle = ev.target.closest && ev.target.closest('.dashboard-catalog-drag');
      if (!handle || !list.contains(handle)) return;
      if (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown') return;
      var card = handle.closest('.dashboard-settings-location-card');
      if (!card || card.classList.contains('hidden')) return;
      var vis = visibleCards();
      var index = vis.indexOf(card);
      if (index < 0) return;
      ev.preventDefault();
      pickCard(card);
      reorderPhase = 'moving';
      card.classList.add('is-reorder-moving');
      setReorderStatus('Moving ' + cardTitle(card));
      if (ev.key === 'ArrowUp' && index > 0) list.insertBefore(card, vis[index - 1]);
      else if (ev.key === 'ArrowDown' && index < vis.length - 1) vis[index + 1].after(card);
      else {
        card.classList.remove('is-reorder-moving');
        reorderPhase = 'selected';
        setReorderStatus(cardTitle(card) + ' selected');
        return;
      }
      card.classList.remove('is-reorder-moving');
      reorderPhase = 'idle';
      handle.focus();
      queueSave(syncSectionOrder());
    });

    function queueSave(slugOrder) {
      var clientId = window.CLIENT_ID || window.SITE_CLIENT_ID || '';
      if (!clientId || !slugOrder.length) {
        markChangedFromLive(true);
        return;
      }
      reorderPhase = 'saving';
      setReorderStatus('Saving order…');
      saveChain = saveChain.then(function () {
        return persistSectionOrder(clientId, slugOrder);
      }).then(function () {
        reorderPhase = 'idle';
        markChangedFromLive(true);
      }).catch(function (err) {
        console.error(err);
        reorderPhase = 'idle';
        setReorderStatus('Could not save the new order.', true);
      });
    }

    function reorderGroups(weightOf) {
      var groupOrder = [];
      var groups = {};
      Array.prototype.forEach.call(cards(), function (card) {
        var id = groupId(card);
        if (!groups[id]) {
          groups[id] = [];
          groupOrder.push(id);
        }
        groups[id].push(card);
      });
      var frag = document.createDocumentFragment();
      groupOrder.forEach(function (id) {
        groups[id].sort(function (a, b) {
          var wa = weightOf(orderKey(a));
          var wb = weightOf(orderKey(b));
          if (wa == null) wa = 9999;
          if (wb == null) wb = 9999;
          if (wa !== wb) return wa - wb;
          return orderKey(a).localeCompare(orderKey(b));
        });
        groups[id].forEach(function (card) { frag.appendChild(card); });
      });
      list.appendChild(frag);
    }

    function loadLiveOrder() {
      var clientId = window.CLIENT_ID || window.SITE_CLIENT_ID || '';
      var slugs = [];
      var seen = {};
      Array.prototype.forEach.call(cards(), function (card) {
        var slug = orderKey(card);
        if (!slug || seen[slug] || isNewOrderKey(slug)) return;
        seen[slug] = true;
        slugs.push(slug);
      });
      if (!clientId || !slugs.length) {
        liveReady = true;
        return;
      }
      var headers = cmsHeaders();
      var base = cmsApiBase();
      var paths = slugs.map(contentPathForKey);
      fetch(base + '/clients/' + encodeURIComponent(clientId) + '/content/files/batch', {
        method: 'POST',
        credentials: 'include',
        headers: headers,
        body: JSON.stringify({ paths: paths })
      }).then(function (res) {
        if (!res.ok) return {};
        return res.json();
      }).catch(function () { return {}; }).then(function (fileData) {
        return fetch(base + '/clients/' + encodeURIComponent(clientId) + '/content/previews', {
          method: 'GET',
          credentials: 'include',
          headers: headers
        }).then(function (res) {
          if (!res.ok) return [];
          return res.json().then(previewRows);
        }).catch(function () { return []; }).then(function (previews) {
          var files = (fileData && (fileData.files || fileData.Files)) || {};
          var draftWeight = {};
          var hasDraft = false;
          slugs.forEach(function (slug) {
            var path = contentPathForKey(slug);
            var file = files[path] || {};
            var published = fmWeight(file.frontMatter || file.FrontMatter || {});
            publishedWeight[slug] = published;
            liveWeight[slug] = published;
            draftWeight[slug] = published;
          });
          previews.forEach(function (row) {
            var path = previewContentPath(row);
            var payload = row.payload || row.Payload || {};
            var fm = payload.frontMatter || payload.FrontMatter || {};
            var weight = fmWeight(fm);
            slugs.forEach(function (slug) {
              if (path !== contentPathForKey(slug) || weight == null) return;
              draftWeight[slug] = weight;
              if (weight !== publishedWeight[slug]) hasDraft = true;
            });
          });
          liveReady = true;
          slugs.forEach(function (slug) {
            if (effectiveWeight[slug] == null && draftWeight[slug] != null) effectiveWeight[slug] = draftWeight[slug];
          });
          if (reorderPhase === 'idle') {
            if (kind === 'promotions') slotVisibleByWeight();
            else if (hasDraft) reorderGroups(function (slug) { return draftWeight[slug]; });
          }
          markChangedFromLive(false);
        });
      });
    }

    captureLiveDom();
    loadLiveOrder();
  }

  function previewRows(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.previews)) return data.previews;
    if (data && Array.isArray(data.Previews)) return data.Previews;
    return [];
  }

  function previewContentPath(row) {
    if (!row) return '';
    var payload = row.payload || row.Payload || {};
    return String(row.contentPath || row.ContentPath || payload.contentPath || payload.ContentPath || '').replace(/\\/g, '/');
  }

  function fmWeight(fm) {
    if (!fm) return null;
    var w = fm.weight != null ? fm.weight : fm.Weight;
    if (w == null || w === '') return null;
    var n = Number(w);
    return isNaN(n) ? null : n;
  }

  function stableValue(value) {
    if (Array.isArray(value)) return '[' + value.map(stableValue).join(',') + ']';
    if (value && typeof value === 'object') {
      return '{' + Object.keys(value).sort().map(function (key) {
        return JSON.stringify(key) + ':' + stableValue(value[key]);
      }).join(',') + '}';
    }
    return JSON.stringify(value);
  }

  function sameFrontMatter(a, b) {
    var left = Object.assign({}, a || {});
    var right = Object.assign({}, b || {});
    if (fmWeight(left) != null) left.weight = fmWeight(left);
    if (fmWeight(right) != null) right.weight = fmWeight(right);
    return stableValue(left) === stableValue(right);
  }

  function persistSectionOrder(clientId, slugOrder) {
    var base = cmsApiBase();
    var jobs = [];
    var seen = {};
    var weightStart = kind === 'promotions' ? 0 : (kind === 'items' ? 1 : 2);
    slugOrder.forEach(function (slug) {
      if (!slug || seen[slug] || isNewOrderKey(slug)) return;
      seen[slug] = true;
      jobs.push({
        slug: slug,
        path: contentPathForKey(slug),
        weight: weightStart + jobs.length
      });
    });
    if (!jobs.length) return Promise.resolve();
    var headers = cmsHeaders();
    return fetch(base + '/clients/' + encodeURIComponent(clientId) + '/content/files/batch', {
      method: 'POST',
      credentials: 'include',
      headers: headers,
      body: JSON.stringify({ paths: jobs.map(function (job) { return job.path; }) })
    }).then(function (res) {
      if (!res.ok) return {};
      return res.json();
    }).catch(function () {
      return {};
    }).then(function (fileData) {
      return fetch(base + '/clients/' + encodeURIComponent(clientId) + '/content/previews', {
        method: 'GET',
        credentials: 'include',
        headers: headers
      }).then(function (res) {
        if (!res.ok) return [];
        return res.json().then(previewRows);
      }).catch(function () {
        return [];
      }).then(function (previews) {
        var files = (fileData && (fileData.files || fileData.Files)) || {};
        var chain = Promise.resolve();
        jobs.forEach(function (job) {
          chain = chain.then(function () {
            return writeSectionWeight(base, clientId, headers, job, files, previews);
          });
        });
        return chain;
      });
    });
  }

  function writeSectionWeight(base, clientId, headers, job, files, previews) {
    var file = files[job.path] || {};
    var published = file.frontMatter || file.FrontMatter || {};
    var existing = null;
    previews.forEach(function (row) {
      if (previewContentPath(row) === job.path) existing = row;
    });
    var payload = existing && (existing.payload || existing.Payload);
    var fm = Object.assign({}, published, payload && (payload.frontMatter || payload.FrontMatter) || {});
    var title = fm.title || fm.Title || String(job.slug || '').split('/').pop().replace(/\.md$/, '');
    fm.title = title;
    fm.weight = job.weight;
    var publishedWeight = fmWeight(published);
    var previewId = existing && (existing.id || existing.ID);
    if (publishedWeight === job.weight && (!payload || sameFrontMatter(published, fm))) {
      if (!previewId) return Promise.resolve();
      return fetch(base + '/clients/' + encodeURIComponent(clientId) + '/content/previews/' + encodeURIComponent(previewId), {
        method: 'DELETE',
        credentials: 'include',
        headers: headers
      }).then(function (res) {
        if (!res.ok && res.status !== 204) throw new Error('CMS ' + res.status);
      });
    }
    var body = {
      payload: {
        kind: kind === 'items' ? 'menu-item' : (kind === 'promotions' ? 'promotion' : 'section'),
        clientId: clientId,
        contentPath: job.path,
        siteConfigPath: clientId + '/hugo.toml',
        frontMatter: fm,
        body: (payload && (payload.body || payload.Body)) || ''
      }
    };
    return fetch(base + '/clients/' + encodeURIComponent(clientId) + '/content/previews', {
      method: 'POST',
      credentials: 'include',
      headers: headers,
      body: JSON.stringify(body)
    }).then(function (res) {
      if (!res.ok) return res.text().then(function (text) { throw new Error(text || ('CMS ' + res.status)); });
    });
  }
}
