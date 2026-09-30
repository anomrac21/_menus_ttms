/**
 * Admin-only yellow draft badges on editable menu surfaces + shared CMS preview cache.
 */
(function (global) {
  'use strict';

  var THEME_PATHS = ['static/css/colors.css'];
  var draftPaths = new Set();
  var previewsByPath = {};
  var refreshPromise = null;

  function tokenRoles() {
    if (!global.AuthClient || typeof global.AuthClient.getAccessToken !== 'function') return [];
    var token = global.AuthClient.getAccessToken();
    if (!token || typeof global.AuthClient.parseJWT !== 'function') return [];
    var claims = global.AuthClient.parseJWT(token);
    if (!claims) return [];
    var roles = claims.roles || claims.Roles || [];
    if (typeof roles === 'string') roles = roles.split(',');
    if (!roles || !roles.length) return [];
    return roles.map(function (role) {
      return String(role || '').trim().toLowerCase();
    });
  }

  function isMenuAdmin() {
    if (!global.AuthClient || !global.AuthClient.isAuthenticated()) return false;
    if (typeof global.AuthClient.isSuperadmin === 'function' && global.AuthClient.isSuperadmin()) return true;
    if (typeof global.AuthClient.isAdmin === 'function' && global.AuthClient.isAdmin()) return true;
    var roles = tokenRoles();
    return roles.indexOf('superadmin') !== -1 || roles.indexOf('admin') !== -1;
  }

  function hasAdminSiteAccess() {
    if (!isMenuAdmin()) return false;
    if (typeof global.AuthClient.isSuperadmin === 'function' && global.AuthClient.isSuperadmin()) return true;
    if (tokenRoles().indexOf('superadmin') !== -1) return true;
    return (
      global.AuthClientAccess &&
      typeof global.AuthClientAccess.hasClientAccess === 'function' &&
      global.AuthClientAccess.hasClientAccess()
    );
  }

  function normDraftPath(path) {
    return String(path || '').replace(/\\/g, '/').replace(/^\/+/, '');
  }

  function pageLocationSlug() {
    var root = document.getElementById('menu-reels-viewport') || document.getElementById('packery-container');
    return (root && root.getAttribute('data-location-slug')) || '';
  }

  function resolveDraftPath(path) {
    var key = normDraftPath(path);
    if (!key) return '';
    if (previewsByPath[key]) return key;
    var loc = pageLocationSlug();
    var rel = key.replace(/^content\//, '');
    var parts = rel.split('/').filter(Boolean);
    var candidates = [];
    if (loc && parts[0] === loc && parts.length > 1) {
      candidates.push('content/' + parts.slice(1).join('/'));
    }
    if (loc && parts[0] !== loc) {
      candidates.push('content/' + loc + '/' + rel);
    }
    var i;
    for (i = 0; i < candidates.length; i++) {
      if (previewsByPath[candidates[i]]) return candidates[i];
    }
    var hits = [];
    Object.keys(previewsByPath).forEach(function (stored) {
      var storedParts = normDraftPath(stored).split('/').filter(Boolean);
      var keyParts = key.split('/').filter(Boolean);
      if (storedParts.length < 2 || keyParts.length < 2) return;
      var shorter = storedParts.length <= keyParts.length ? storedParts : keyParts;
      var longer = storedParts.length > keyParts.length ? storedParts : keyParts;
      if (longer.slice(longer.length - shorter.length).join('/') === shorter.join('/')) hits.push(stored);
    });
    if (hits.length === 1) return hits[0];
    if (hits.length > 1 && loc) {
      var locHits = hits.filter(function (stored) {
        return normDraftPath(stored).split('/').indexOf(loc) !== -1;
      });
      if (locHits.length === 1) return locHits[0];
    }
    return '';
  }

  function urlsForDraftPath(path) {
    var norm = normDraftPath(path);
    if (!/\.md$/i.test(norm) || /_index\.md$/i.test(norm)) return [];
    var rel = norm.replace(/^content\//, '').replace(/\.md$/i, '');
    var parts = rel.split('/').filter(Boolean);
    if (parts.length < 2) return [];
    var urls = ['/' + parts.join('/') + '/'];
    var loc = pageLocationSlug();
    if (loc && parts[0] !== loc) urls.push('/' + loc + '/' + parts.join('/') + '/');
    return urls;
  }

  function itemUrls() {
    var urls = [];
    Object.keys(previewsByPath).forEach(function (path) {
      urlsForDraftPath(path).forEach(function (url) {
        urls.push(url);
      });
    });
    return urls;
  }

  function pinDraftItems() {
    if (typeof global.hydrateHomeMenuForUrls !== 'function') return;
    var urls = itemUrls();
    if (urls.length) global.hydrateHomeMenuForUrls(urls);
  }

  function cmsApiBase() {
    var base = (global.CMS_API_URL || global.CMS_SERVICE_URL || 'https://cms.ttmenus.com').replace(/\/+$/, '');
    if (base.endsWith('/api')) return base;
    return base + '/api';
  }

  function clientId() {
    return global.CLIENT_ID || global.SITE_CLIENT_ID || '_ttms_menu_demo';
  }

  function authHeaders() {
    var headers = { Accept: 'application/json' };
    var token =
      global.AuthClient && typeof global.AuthClient.getAccessToken === 'function'
        ? global.AuthClient.getAccessToken()
        : null;
    if (!token && typeof localStorage !== 'undefined') {
      token = localStorage.getItem('ttmenus_access_token');
    }
    if (token) headers.Authorization = 'Bearer ' + token;
    return headers;
  }

  function dedupePreviews(previews) {
    var best = {};
    if (!previews || !previews.length) return [];
    previews.forEach(function (p) {
      var payload = p.payload || p.Payload || {};
      var path = p.content_path || payload.contentPath || payload.content_path || '';
      if (!path) return;
      var cur = best[path];
      var t = new Date(p.updated_at || p.UpdatedAt || 0).getTime();
      if (!cur || t >= new Date(cur.updated_at || cur.UpdatedAt || 0).getTime()) {
        best[path] = p;
      }
    });
    return Object.keys(best).map(function (k) {
      return best[k];
    });
  }

  function promotionSlugFromLink(link) {
    var path = String(link || '').replace(/^https?:\/\/[^/]+/i, '').split('?')[0];
    var parts = path.split('/').filter(Boolean);
    if (parts[0] === 'promotions' && parts.length >= 2) return parts[1];
    if (parts.length) return parts[parts.length - 1];
    return '';
  }

  function promotionSlugFromElement(el) {
    if (!el) return '';
    var id = el.getAttribute('data-ad-id') || '';
    if (id.indexOf('menu-ad-') === 0) {
      var idSlug = id.replace(/^menu-ad-/, '').replace(/-\d+$/, '');
      if (idSlug) return idSlug;
    }
    var title = el.getAttribute('data-ad-title') || '';
    if (title) {
      var titleSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if (titleSlug) return titleSlug;
    }
    var url = el.getAttribute('data-ad-url') || el.getAttribute('data-ad-link') || '';
    return promotionSlugFromLink(url);
  }

  function contentPathForElement(el) {
    if (!el) return null;
    if (el.classList && el.classList.contains('menu-item-card')) {
      var itemUrl = el.getAttribute('data-item-url') || '';
      if (!itemUrl) return null;
      return 'content' + itemUrl.replace(/\/$/, '') + '.md';
    }
    if (el.classList && el.classList.contains('menu-header')) {
      var sectionSlug = el.getAttribute('data-section-slug') || '';
      return sectionSlug ? 'content/' + sectionSlug + '/_index.md' : null;
    }
    if (el.classList && el.classList.contains('ads-reels-slide')) {
      var slug = promotionSlugFromElement(el);
      return slug ? 'content/promotions/' + slug + '.md' : null;
    }
    if (el.tagName === 'LI' && el.classList && el.classList.contains('ad-panel')) {
      var panelSlug = promotionSlugFromElement(el);
      return panelSlug ? 'content/promotions/' + panelSlug + '.md' : null;
    }
    return null;
  }

  function isThemePath(path) {
    return THEME_PATHS.indexOf(path) >= 0;
  }

  function badgeMarkup(classExtra) {
    return (
      '<span class="menu-content-draft-badge ' +
      (classExtra || '') +
      '" title="Unpublished CMS draft: publish from dashboard" aria-label="Unpublished CMS draft">' +
      '<i class="fa fa-exclamation-circle" aria-hidden="true"></i></span>'
    );
  }

  function ensureTitleRowBadge(host, path) {
    if (!host || !path) return;
    var row = host.closest('.menu-item-title-row, .ads-reels-slide__title-row, .menu-header__title-row');
    if (!row) return;
    var actions = row.querySelector('.menu-item-actions');
    var trigger = actions && actions.querySelector('.menu-item-actions__trigger');
    var badge = row.querySelector('.menu-content-draft-badge--title-row');
    if (!badge) {
      var tmp = document.createElement('span');
      tmp.innerHTML = badgeMarkup('menu-content-draft-badge--title-row');
      badge = tmp.firstChild;
    }
    var stored = resolveDraftPath(path);
    if (actions && trigger && trigger.parentNode === actions) {
      if (badge.parentNode !== actions || badge.nextElementSibling !== trigger) {
        actions.insertBefore(badge, trigger);
      }
    } else if (actions && badge.parentNode !== actions) {
      actions.appendChild(badge);
    } else if (!actions && badge.parentNode !== row) {
      row.appendChild(badge);
    }
    badge.hidden = !stored;
    badge.setAttribute('data-content-path', stored || path);
  }

  function syncActionsMenuDraftState(actionsRoot, path) {
    if (!actionsRoot) return;
    var editBtn = actionsRoot.querySelector('.menu-item-actions__option--edit');
    if (!editBtn) return;
    var stored = path ? resolveDraftPath(path) : '';
    var hasDraft = !!stored;
    editBtn.classList.toggle('has-cms-draft', hasDraft);
    var inline = editBtn.querySelector('.menu-content-draft-badge--inline');
    if (!inline) {
      var wrap = document.createElement('span');
      wrap.innerHTML = badgeMarkup('menu-content-draft-badge--inline');
      inline = wrap.firstChild;
      editBtn.insertBefore(inline, editBtn.firstChild);
    } else if (inline.parentNode === editBtn && editBtn.firstChild !== inline) {
      editBtn.insertBefore(inline, editBtn.firstChild);
    }
    inline.hidden = !hasDraft;
    if (stored || path) editBtn.setAttribute('data-content-path', stored || path);
  }

  function applyIndicators(root) {
    if (!hasAdminSiteAccess()) return;
    var scope = root || document;

    scope.querySelectorAll('.menu-item-card[data-item-url]').forEach(function (card) {
      var path = contentPathForElement(card);
      if (!path || isThemePath(path)) return;
      ensureTitleRowBadge(card, path);
      var actions = card.querySelector('[data-menu-item-actions]');
      if (actions) syncActionsMenuDraftState(actions, path);
    });

    scope.querySelectorAll('.menu-header[data-section-slug]').forEach(function (header) {
      var path = contentPathForElement(header);
      if (!path) return;
      ensureTitleRowBadge(header, path);
      var actions = header.querySelector('[data-menu-item-actions]');
      if (actions) syncActionsMenuDraftState(actions, path);
    });

    scope.querySelectorAll('article.ads-reels-slide[data-ad-id], article.ads-reels-slide[data-ad-url]').forEach(function (slide) {
      if (slide.classList.contains('menu-ad-scroll-end')) return;
      var path = contentPathForElement(slide);
      if (!path) return;
      ensureTitleRowBadge(slide, path);
      var actions = slide.querySelector('[data-menu-item-actions]');
      if (actions) syncActionsMenuDraftState(actions, path);
    });
  }

  function ingestPreviews(list) {
    draftPaths = new Set();
    previewsByPath = {};
    list.forEach(function (p) {
      var payload = p.payload || p.Payload || {};
      var path = normDraftPath(p.content_path || payload.contentPath || payload.content_path || '');
      if (!path || isThemePath(path)) return;
      draftPaths.add(path);
      previewsByPath[path] = p;
    });
  }

  function refresh() {
    if (!hasAdminSiteAccess()) {
      ingestPreviews([]);
      applyIndicators(document);
      return Promise.resolve([]);
    }
    if (refreshPromise) return refreshPromise;
    var url = cmsApiBase() + '/clients/' + encodeURIComponent(clientId()) + '/content/previews';
    refreshPromise = fetch(url, { method: 'GET', credentials: 'include', headers: authHeaders() })
      .then(function (res) {
        return res.ok ? res.json() : { previews: [] };
      })
      .catch(function () {
        return { previews: [] };
      })
      .then(function (data) {
        var list = dedupePreviews(data && data.previews ? data.previews : []);
        ingestPreviews(list);
        applyIndicators(document);
        pinDraftItems();
        try {
          global.dispatchEvent(
            new CustomEvent('ttms:content-drafts-ready', { detail: { previews: list } })
          );
        } catch (evtErr) { /* ignore */ }
        return list;
      })
      .finally(function () {
        refreshPromise = null;
      });
    return refreshPromise;
  }

  function boot() {
    if (!hasAdminSiteAccess()) return;
    refresh();
  }

  function start() {
    if (global.AuthClient && typeof global.AuthClient.whenReady === 'function') {
      global.AuthClient.whenReady().then(boot);
      return;
    }
    boot();
  }

  global.addEventListener('ttms:auth-ready', boot);
  document.addEventListener('ttms:page-enter', function () {
    setTimeout(boot, 80);
  });
  global.addEventListener('adsPopulated', function () {
    setTimeout(function () {
      applyIndicators(document);
    }, 120);
  });
  global.addEventListener('menuReelsFlattened', function () {
    setTimeout(function () {
      applyIndicators(document);
      pinDraftItems();
    }, 120);
  });
  global.addEventListener('homeMenuItemsLoaded', function () {
    setTimeout(function () {
      applyIndicators(document);
      pinDraftItems();
    }, 40);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  global.TTMSContentDrafts = {
    refresh: refresh,
    has: function (path) {
      return !!resolveDraftPath(path);
    },
    getPreview: function (path) {
      var stored = resolveDraftPath(path);
      return stored ? previewsByPath[stored] || null : null;
    },
    itemUrls: itemUrls,
    contentPathForElement: contentPathForElement,
    promotionSlugFromElement: promotionSlugFromElement,
    applyIndicators: applyIndicators,
  };
})(typeof window !== 'undefined' ? window : this);
