/**
 * Lightweight menu rearrange page — section + item list (no live menu iframe).
 */
(function (global) {
  'use strict';

  var CMS_CLIENT_ID = '';
  var CMS_SERVICE_URL = '';
  var CMS_API_URL = '';
  var MIN_ITEM_WEIGHT = 2;
  var PINNED_SECTION_SLUGS = ['promotions'];
  var PINNED_SECTION_WEIGHT = 1;
  var MIN_MOVABLE_SECTION_WEIGHT = 2;
  var sections = [];
  var dirty = false;
  var reordered = false;
  var saveTimer = null;
  var saving = false;

  function cmsApiBase() {
    var api = (CMS_API_URL || global.CMS_API_URL || '').replace(/\/+$/, '');
    if (api) return api;
    var svc = (CMS_SERVICE_URL || global.CMS_SERVICE_URL || 'https://cms.ttmenus.com').replace(/\/+$/, '');
    return /\/api$/i.test(svc) ? svc : svc + '/api';
  }

  function cmsClientPath(suffix) {
    return (
      cmsApiBase() +
      '/clients/' +
      encodeURIComponent(CMS_CLIENT_ID) +
      (suffix.charAt(0) === '/' ? suffix : '/' + suffix)
    );
  }

  function getAccessToken() {
    if (global.AuthClient && typeof global.AuthClient.getAccessToken === 'function') {
      var t = global.AuthClient.getAccessToken();
      if (t) return t;
    }
    try {
      return localStorage.getItem('ttmenus_access_token') || localStorage.getItem('auth_token');
    } catch (e) {
      return null;
    }
  }

  function authHeaders(json) {
    var h = { Accept: 'application/json' };
    if (json) h['Content-Type'] = 'application/json';
    var token = getAccessToken();
    if (token) h.Authorization = 'Bearer ' + token;
    return h;
  }

  function ensureAccessToken() {
    if (getAccessToken()) return Promise.resolve(getAccessToken());
    if (global.AuthClient && typeof global.AuthClient.ensureAccessToken === 'function') {
      return global.AuthClient.ensureAccessToken().then(function () {
        return getAccessToken();
      });
    }
    return Promise.resolve(null);
  }

  function cmsGet(path) {
    return fetch(cmsApiBase() + path, {
      method: 'GET',
      credentials: 'include',
      headers: authHeaders(),
    }).then(function (res) {
      if (!res.ok) throw new Error('CMS ' + res.status);
      return res.json();
    });
  }

  function cmsPost(path, body) {
    return fetch(cmsApiBase() + path, {
      method: 'POST',
      credentials: 'include',
      headers: authHeaders(true),
      body: JSON.stringify(body),
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (t) {
          throw new Error(t || 'CMS ' + res.status);
        });
      }
      return res.json().catch(function () {
        return {};
      });
    });
  }

  function normalizeUrl(url) {
    var u = String(url || '').trim();
    if (!u) return '';
    if (u.charAt(0) !== '/') u = '/' + u;
    return u.replace(/\/+$/, '') + '/';
  }

  function slugFromUrl(url) {
    var parts = normalizeUrl(url).split('/').filter(Boolean);
    return parts[0] || '';
  }

  function itemContentPath(url) {
    return 'content' + normalizeUrl(url).replace(/\/$/, '') + '.md';
  }

  function hasAdminAccess() {
    if (!global.AuthClient || !global.AuthClient.isAuthenticated() || !global.AuthClient.isAdmin()) {
      return false;
    }
    return (
      global.AuthClientAccess &&
      typeof global.AuthClientAccess.hasClientAccess === 'function' &&
      global.AuthClientAccess.hasClientAccess()
    );
  }

  function setStatus(msg, kind) {
    var el = document.getElementById('dashboardRearrangeStatus');
    if (!el) return;
    el.textContent = msg || '';
    el.className =
      'dashboard-rearrange-status' +
      (kind === 'error' ? ' dashboard-rearrange-status--error' : '') +
      (kind === 'success' ? ' dashboard-rearrange-status--success' : '') +
      (kind === 'loading' ? ' dashboard-rearrange-status--loading' : '');
  }

  function isPinnedSection(sec) {
    return !!(sec && sec.slug && PINNED_SECTION_SLUGS.indexOf(sec.slug) >= 0);
  }

  function ensurePinnedSectionOrder(list) {
    var pinned = [];
    var movable = [];
    list.forEach(function (sec) {
      if (isPinnedSection(sec)) pinned.push(sec);
      else movable.push(sec);
    });
    pinned.sort(function (a, b) {
      if (a.slug === 'promotions') return -1;
      if (b.slug === 'promotions') return 1;
      return (a.weight || 0) - (b.weight || 0);
    });
    movable.sort(function (a, b) {
      return (a.weight || 0) - (b.weight || 0) || a.title.localeCompare(b.title);
    });
    return pinned.concat(movable);
  }

  function hugoItemToState(raw, weightHint) {
    var url = normalizeUrl(raw.url || raw.RelPermalink);
    var title = String(raw.name || raw.title || raw.linkTitle || 'Untitled').trim();
    return {
      id: raw.id || url,
      title: title,
      url: url,
      weight: typeof raw.weight === 'number' ? raw.weight : weightHint,
      raw: raw,
    };
  }

  function buildSectionsFromSources(cmsMenu, hugoApi, previews) {
    var cmsCats = (cmsMenu && cmsMenu.categories) || [];
    var cmsItems = (cmsMenu && cmsMenu.menuItems) || [];
    var hugoItems = (hugoApi && hugoApi.menu_items) || [];
    var cmsItemByUrl = {};
    cmsItems.forEach(function (mi) {
      if (mi && mi.url) cmsItemByUrl[normalizeUrl(mi.url)] = mi;
    });

    var grouped = {};
    hugoItems.forEach(function (raw, idx) {
      var slug = String(raw.section || slugFromUrl(raw.categoryUrl || raw.url) || '').trim();
      if (!slug) return;
      if (!grouped[slug]) {
        grouped[slug] = {
          slug: slug,
          title: String(raw.category || slug).trim(),
          url: normalizeUrl(raw.categoryUrl || '/' + slug + '/'),
          summary: '',
          image: '',
          weight: Object.keys(grouped).length,
          items: [],
        };
      }
      var url = normalizeUrl(raw.url);
      var cms = cmsItemByUrl[url];
      var w =
        cms && typeof cms.weight === 'number'
          ? cms.weight
          : typeof raw.weight === 'number'
            ? raw.weight
            : MIN_ITEM_WEIGHT + grouped[slug].items.length;
      grouped[slug].items.push(hugoItemToState(raw, w));
    });

    var out = [];
    if (cmsCats.length) {
      cmsCats.slice().sort(function (a, b) {
        return (a.weight || 0) - (b.weight || 0);
      });
      cmsCats.forEach(function (cat, i) {
        var slug = slugFromUrl(cat.url);
        var base = grouped[slug] || {
          slug: slug,
          title: cat.title || slug,
          url: normalizeUrl(cat.url || '/' + slug + '/'),
          summary: cat.summary || '',
          image: cat.image || '',
          weight: cat.weight != null ? cat.weight : i,
          items: [],
        };
        base.title = cat.title || base.title;
        base.url = normalizeUrl(cat.url || base.url);
        base.weight = cat.weight != null ? cat.weight : i;
        base.summary = cat.summary || base.summary;
        base.image = cat.image || base.image;
        var params = cat.params || {};
        var paramImages = params.images || {};
        base.icon = params.icon || base.icon || '';
        base.imageTop =
          paramImages.top || cat.image || base.imageTop || base.image || '';
        base.imageBottom = paramImages.bottom || base.imageBottom || '';
        if (!base.items.length && grouped[slug]) base.items = grouped[slug].items.slice();
        out.push(base);
        delete grouped[slug];
      });
      Object.keys(grouped).forEach(function (slug) {
        out.push(grouped[slug]);
      });
    } else {
      out = Object.keys(grouped).map(function (k) {
        return grouped[k];
      });
      out.sort(function (a, b) {
        return (a.weight || 0) - (b.weight || 0) || a.title.localeCompare(b.title);
      });
    }

    out.forEach(function (sec) {
      sec.items.sort(function (a, b) {
        return (a.weight || 0) - (b.weight || 0) || a.title.localeCompare(b.title);
      });
      sec.items.forEach(function (item, idx) {
        if (item.weight == null || item.weight < MIN_ITEM_WEIGHT) {
          item.weight = MIN_ITEM_WEIGHT + idx;
        }
      });
    });

    mergePreviewWeights(out, previews);
    out = ensurePinnedSectionOrder(out);
    reindexWeights(out);
    return out;
  }

  function mergePreviewWeights(list, previews) {
    if (!previews || !previews.length) return;
    var secByPath = {};
    var itemByPath = {};
    list.forEach(function (sec) {
      secByPath['content/' + sec.slug + '/_index.md'] = sec;
      sec.items.forEach(function (item) {
        itemByPath[itemContentPath(item.url)] = item;
      });
    });
    previews.forEach(function (p) {
      var payload = p.payload || p.Payload || {};
      var fm = payload.frontMatter || payload.front_matter || {};
      var cp =
        p.content_path ||
        payload.contentPath ||
        payload.content_path ||
        '';
      if (!cp) return;
      if (cp.indexOf('/_index.md') !== -1 && secByPath[cp]) {
        if (isPinnedSection(secByPath[cp])) {
          secByPath[cp].weight = PINNED_SECTION_WEIGHT;
        } else if (fm.weight != null) {
          var sw = parseInt(fm.weight, 10);
          if (isNaN(sw) || sw <= PINNED_SECTION_WEIGHT) sw = MIN_MOVABLE_SECTION_WEIGHT;
          secByPath[cp].weight = sw;
        }
      }
      if (itemByPath[cp] && fm.weight != null) {
        itemByPath[cp].weight = parseInt(fm.weight, 10);
      }
      if (itemByPath[cp] && fm.title != null) {
        itemByPath[cp].title = String(fm.title);
      }
    });
    list.forEach(function (sec) {
      sec.items.sort(function (a, b) {
        return (a.weight || 0) - (b.weight || 0);
      });
    });
  }

  function reindexWeights(list) {
    var ordered = ensurePinnedSectionOrder(list);
    list.length = 0;
    ordered.forEach(function (sec) {
      list.push(sec);
    });
    var nextMovableWeight = MIN_MOVABLE_SECTION_WEIGHT;
    list.forEach(function (sec) {
      if (isPinnedSection(sec)) {
        sec.weight = PINNED_SECTION_WEIGHT;
      } else {
        sec.weight = nextMovableWeight;
        nextMovableWeight += 1;
      }
      sec.items.forEach(function (item, ii) {
        item.weight = MIN_ITEM_WEIGHT + ii;
      });
    });
  }

  function loadStructure() {
    setStatus('Loading menu structure…', 'loading');
    return ensureAccessToken()
      .then(function () {
        return Promise.all([
          cmsGet('/clients/' + encodeURIComponent(CMS_CLIENT_ID) + '/menu').catch(function () {
            return {};
          }),
          fetch('/api/menu-items.json', { credentials: 'same-origin' })
            .then(function (r) {
              return r.ok ? r.json() : { menu_items: [] };
            })
            .catch(function () {
              return { menu_items: [] };
            }),
          cmsGet('/clients/' + encodeURIComponent(CMS_CLIENT_ID) + '/content/previews').catch(
            function () {
              return { previews: [] };
            }
          ),
        ]);
      })
      .then(function (results) {
        var previews = (results[2] && results[2].previews) || [];
        sections = buildSectionsFromSources(results[0], results[1], previews);
        if (!sections.length) {
          setStatus('No menu sections found. Add menu content first, then return here.', 'error');
        } else {
          setStatus(
            sections.length +
              ' section' +
              (sections.length === 1 ? '' : 's') +
              ' · drag order with the arrows. Drafts save automatically.',
            'success'
          );
        }
        renderList();
      })
      .catch(function (err) {
        console.error(err);
        setStatus('Could not load menu: ' + (err.message || err), 'error');
      });
  }

  function flatPricesFromRaw(raw) {
    var prices = [];
    var src = (raw && raw.prices) || [];
    if (!Array.isArray(src)) return prices;
    src.forEach(function (row) {
      if (!Array.isArray(row) || row.length < 3) return;
      prices.push({
        variable1: row[0] != null ? String(row[0]) : '-',
        variable2: row[1] != null ? String(row[1]) : '-',
        price: typeof row[2] === 'number' ? row[2] : parseFloat(row[2]) || 0,
      });
    });
    return prices;
  }

  function sectionPayload(sec) {
    var fm = {
      title: sec.title,
      weight: sec.weight,
    };
    if (sec.icon) fm.icon = sec.icon;
    var top = sec.imageTop || sec.image || '';
    var bottom = sec.imageBottom || '';
    if (top || bottom) {
      fm.images = {};
      if (top) fm.images.top = top;
      if (bottom) fm.images.bottom = bottom;
    }
    return {
      payload: {
        kind: 'section',
        clientId: CMS_CLIENT_ID,
        contentPath: 'content/' + sec.slug + '/_index.md',
        siteConfigPath: CMS_CLIENT_ID + '/hugo.toml',
        frontMatter: fm,
        body: sec.summary || '',
      },
    };
  }

  function itemPayload(item) {
    var raw = item.raw || {};
    var fm = {
      title: item.title,
      weight: item.weight,
    };
    var images = Array.isArray(raw.images)
      ? raw.images.map(function (p) {
          if (p && typeof p === 'object' && p.image) return { image: p.image };
          return { image: p };
        })
      : [];
    if (images.length) fm.images = images;
    return {
      payload: {
        kind: 'menu-item',
        clientId: CMS_CLIENT_ID,
        contentPath: itemContentPath(item.url),
        siteConfigPath: CMS_CLIENT_ID + '/hugo.toml',
        frontMatter: fm,
        body: '',
      },
    };
  }

  function persistDrafts() {
    if (saving || !sections.length) return Promise.resolve();
    saving = true;
    setStatus('Saving order drafts…', 'loading');
    var path = '/clients/' + encodeURIComponent(CMS_CLIENT_ID) + '/content/previews';
    var chain = Promise.resolve();
    sections.forEach(function (sec) {
      chain = chain.then(function () {
        return cmsPost(path, sectionPayload(sec));
      });
      sec.items.forEach(function (item) {
        chain = chain.then(function () {
          return cmsPost(path, itemPayload(item));
        });
      });
    });
    return chain
      .then(function () {
        dirty = false;
        setStatus('Order saved as CMS drafts. Publish from the dashboard when ready.', 'success');
      })
      .catch(function (err) {
        console.error(err);
        setStatus('Could not save drafts: ' + (err.message || err), 'error');
      })
      .finally(function () {
        saving = false;
      });
  }

  function schedulePersist() {
    dirty = true;
    reordered = true;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = null;
      persistDrafts();
    }, 900);
  }

  function moveInArray(arr, index, action) {
    if (index < 0 || index >= arr.length) return false;
    if (action === 'top') {
      if (index === 0) return false;
      arr.unshift(arr.splice(index, 1)[0]);
      return true;
    }
    if (action === 'up') {
      if (index <= 0) return false;
      var tmp = arr[index - 1];
      arr[index - 1] = arr[index];
      arr[index] = tmp;
      return true;
    }
    if (action === 'down') {
      if (index >= arr.length - 1) return false;
      var tmp2 = arr[index + 1];
      arr[index + 1] = arr[index];
      arr[index] = tmp2;
      return true;
    }
    if (action === 'bottom') {
      if (index >= arr.length - 1) return false;
      arr.push(arr.splice(index, 1)[0]);
      return true;
    }
    return false;
  }

  function onSectionMove(secIndex, action) {
    var sec = sections[secIndex];
    if (!sec || isPinnedSection(sec)) return;
    var movableIndices = [];
    sections.forEach(function (s, i) {
      if (!isPinnedSection(s)) movableIndices.push(i);
    });
    var posInMovable = movableIndices.indexOf(secIndex);
    if (posInMovable < 0) return;
    var movableSecs = movableIndices.map(function (i) {
      return sections[i];
    });
    if (!moveInArray(movableSecs, posInMovable, action)) return;
    var rebuilt = [];
    sections.forEach(function (s) {
      if (isPinnedSection(s)) rebuilt.push(s);
    });
    movableSecs.forEach(function (s) {
      rebuilt.push(s);
    });
    sections.length = 0;
    rebuilt.forEach(function (s) {
      sections.push(s);
    });
    reindexWeights(sections);
    renderList();
    schedulePersist();
  }

  function onItemMove(secIndex, itemIndex, action) {
    var sec = sections[secIndex];
    if (!sec || !sec.items) return;
    if (moveInArray(sec.items, itemIndex, action)) {
      reindexWeights(sections);
      renderList();
      schedulePersist();
    }
  }

  function createMoveButtons(kind, secIndex, itemIndex) {
    var wrap = document.createElement('div');
    wrap.className = 'dashboard-rearrange-move';
    if (kind === 'section' && isPinnedSection(sections[secIndex])) {
      return wrap;
    }
    var specs = [
      { action: 'top', icon: 'fa-angle-double-up', label: 'Move to top' },
      { action: 'up', icon: 'fa-angle-up', label: 'Move up' },
      { action: 'down', icon: 'fa-angle-down', label: 'Move down' },
      { action: 'bottom', icon: 'fa-angle-double-down', label: 'Move to bottom' },
    ];
    specs.forEach(function (spec) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dashboard-rearrange-move-btn';
      btn.setAttribute('aria-label', spec.label);
      btn.title = spec.label;
      btn.innerHTML = '<i class="fa ' + spec.icon + '" aria-hidden="true"></i>';
      btn.addEventListener('click', function () {
        if (kind === 'section') onSectionMove(secIndex, spec.action);
        else onItemMove(secIndex, itemIndex, spec.action);
      });
      wrap.appendChild(btn);
    });
    return wrap;
  }

  function renderList() {
    var root = document.getElementById('dashboardRearrangeList');
    if (!root) return;
    root.textContent = '';
    if (!sections.length) return;

    sections.forEach(function (sec, si) {
      var block = document.createElement('section');
      block.className = 'dashboard-rearrange-section';
      if (isPinnedSection(sec)) {
        block.classList.add('dashboard-rearrange-section--pinned');
      }
      var head = document.createElement('div');
      head.className = 'dashboard-rearrange-section-head';
      var title = document.createElement('h2');
      title.className = 'dashboard-rearrange-section-title';
      title.textContent = sec.title;
      var meta = document.createElement('span');
      meta.className = 'dashboard-rearrange-section-meta';
      var metaParts = [
        sec.items.length + ' item' + (sec.items.length === 1 ? '' : 's'),
        sec.slug,
      ];
      if (isPinnedSection(sec)) {
        metaParts.push('pinned · weight ' + PINNED_SECTION_WEIGHT);
      }
      meta.textContent = metaParts.join(' · ');
      head.appendChild(title);
      head.appendChild(meta);
      if (!isPinnedSection(sec)) {
        head.appendChild(createMoveButtons('section', si, -1));
      } else {
        var pinNote = document.createElement('span');
        pinNote.className = 'dashboard-rearrange-section-pin-note';
        pinNote.textContent = 'Fixed order';
        head.appendChild(pinNote);
      }
      block.appendChild(head);

      var list = document.createElement('ul');
      list.className = 'dashboard-rearrange-items';
      sec.items.forEach(function (item, ii) {
        var li = document.createElement('li');
        li.className = 'dashboard-rearrange-item';
        var label = document.createElement('span');
        label.className = 'dashboard-rearrange-item-label';
        label.textContent = item.title;
        var path = document.createElement('span');
        path.className = 'dashboard-rearrange-item-path';
        path.textContent = item.url.replace(/^\//, '');
        li.appendChild(label);
        li.appendChild(path);
        li.appendChild(createMoveButtons('item', si, ii));
        list.appendChild(li);
      });
      block.appendChild(list);
      root.appendChild(block);
    });
  }

  function buildMenuDataSnapshot() {
    var categories = sections.map(function (sec) {
      return {
        title: sec.title,
        url: sec.url,
        weight: sec.weight,
        summary: sec.summary || '',
        image: sec.image || '',
      };
    });
    var menuItems = [];
    sections.forEach(function (sec) {
      sec.items.forEach(function (item, idx) {
        menuItems.push({
          id: item.id || item.url,
          title: item.title,
          url: item.url,
          category: sec.title,
          categoryUrl: sec.url,
          weight: item.weight,
        });
      });
    });
    return {
      version: '1.0.0',
      exportDate: new Date().toISOString(),
      metadata: { siteTitle: '', baseURL: '' },
      categories: categories,
      menuItems: menuItems,
      locations: [],
    };
  }

  function saveSnapshotOnLeave() {
    var now = new Date();
    var name =
      'Rearrange · ' +
      now.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    return cmsPost('/clients/' + encodeURIComponent(CMS_CLIENT_ID) + '/menu-versions', {
      name: name,
      description: 'Automatic snapshot when leaving the rearrange menu page.',
      menu_data: buildMenuDataSnapshot(),
    }).catch(function (err) {
      console.warn('snapshot failed', err);
      return null;
    });
  }

  function init() {
    CMS_CLIENT_ID = global.CLIENT_ID || global.SITE_CLIENT_ID || '_ttms_menu_demo';
    CMS_SERVICE_URL = (global.CMS_SERVICE_URL || 'https://cms.ttmenus.com').replace(/\/+$/, '');
    CMS_API_URL = (global.CMS_API_URL || '').replace(/\/+$/, '');

    if (!hasAdminAccess()) {
      setStatus('Admin access required.', 'error');
      return;
    }

    var backBtn = document.getElementById('btnDashboardBack');
    if (backBtn) {
      backBtn.addEventListener('click', function (ev) {
        if (!reordered && !dirty && !saveTimer) return;
        ev.preventDefault();
        backBtn.classList.add('dashboard-edit-header-back--saving');
        backBtn.setAttribute('aria-busy', 'true');
        var chain = saveTimer ? persistDrafts() : dirty ? persistDrafts() : Promise.resolve();
        chain
          .then(function () {
            if (reordered) return saveSnapshotOnLeave();
          })
          .finally(function () {
            global.location.href = '/dashboard/';
          });
      });
    }

    loadStructure();
  }

  function start() {
    if (global.AuthClient && typeof global.AuthClient.whenReady === 'function') {
      global.AuthClient.whenReady().then(init);
      return;
    }
    init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})(typeof window !== 'undefined' ? window : this);
