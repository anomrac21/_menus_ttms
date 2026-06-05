/**
 * Dashboard Edit menu card — menu snapshots (CMS menu-versions), content drafts, publish.
 */
(function (global) {
  'use strict';

  var CMS_SERVICE_URL = '';
  var CMS_API_URL = '';
  var CMS_CLIENT_ID = '';
  var cachedPreviews = [];
  var cachedVersions = [];
  var snapshotLoadState = 'idle';
  var draftLoadState = 'idle';
  var snapshotLoadError = '';
  var draftLoadError = '';
  var refreshInFlight = null;

  /** API root (single /api segment) — avoids double /api when serviceUrl already ends with /api. */
  function cmsApiBase() {
    var api = (CMS_API_URL || global.CMS_API_URL || '').replace(/\/+$/, '');
    if (api) return api;
    var svc = (CMS_SERVICE_URL || global.CMS_SERVICE_URL || 'https://cms.ttmenus.com').replace(
      /\/+$/,
      ''
    );
    if (/\/api$/i.test(svc)) return svc;
    return svc + '/api';
  }

  function cmsClientPath(suffix) {
    return (
      cmsApiBase() +
      '/clients/' +
      encodeURIComponent(CMS_CLIENT_ID) +
      (suffix.charAt(0) === '/' ? suffix : '/' + suffix)
    );
  }

  function getAccessTokenForCms() {
    var ac = global.AuthClient;
    if (ac && ac.getAccessToken) {
      var t = ac.getAccessToken();
      if (ac._tokenLooksValid && typeof ac._tokenLooksValid === 'function') {
        if (ac._tokenLooksValid(t)) return t;
      } else if (t) {
        return t;
      }
    }
    var keys = ['auth_token', 'ttmenus_access_token'];
    var i;
    var v;
    for (i = 0; i < keys.length; i++) {
      if (typeof localStorage !== 'undefined' && localStorage.getItem) {
        v = localStorage.getItem(keys[i]);
        if (v && String(v).trim()) {
          if (ac && ac._tokenLooksValid && !ac._tokenLooksValid(v)) continue;
          return v;
        }
      }
      if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem) {
        v = sessionStorage.getItem(keys[i]);
        if (v && String(v).trim()) {
          if (ac && ac._tokenLooksValid && !ac._tokenLooksValid(v)) continue;
          return v;
        }
      }
    }
    return null;
  }

  function getAuthHeaders() {
    var token = getAccessTokenForCms();
    var h = { Accept: 'application/json' };
    if (token) h.Authorization = 'Bearer ' + token;
    return h;
  }

  /** Hub cookie sessions may lack a stored JWT until sync/refresh — obtain one for CMS Bearer auth. */
  function ensureAccessTokenForCms() {
    var existing = getAccessTokenForCms();
    if (existing) return Promise.resolve(existing);
    var ac = global.AuthClient;
    if (!ac) return Promise.resolve(null);
    var chain = Promise.resolve();
    if (typeof ac.syncHubSession === 'function') {
      chain = chain.then(function () {
        return ac.syncHubSession();
      });
    }
    return chain.then(function () {
      var token = getAccessTokenForCms();
      if (token) return token;
      if (typeof ac.refreshToken !== 'function') return null;
      return ac.refreshToken().then(function () {
        return getAccessTokenForCms();
      });
    });
  }

  function redirectToLoginIfUnauthenticated() {
    if (
      global.AuthClient &&
      global.AuthClient.isAuthenticated &&
      !global.AuthClient.isAuthenticated()
    ) {
      try {
        sessionStorage.setItem('ttmenus_redirect_after_login', global.location.pathname);
      } catch (e) {}
      global.location.href = '/login/';
      return true;
    }
    return false;
  }

  function cmsAuthFailureMessage(res) {
    if (res.status === 401 || res.status === 403) {
      if (redirectToLoginIfUnauthenticated()) return '';
      return 'CMS session expired. Sign out and sign in again to reload snapshots and drafts.';
    }
    return cmsErrorMessage(res.status, res.data, 'Request failed');
  }

  function lastPublishStorageKey() {
    return 'ttmenus_last_publish_' + CMS_CLIENT_ID;
  }

  function truncateMiddle(str, maxLen) {
    str = String(str || '');
    if (str.length <= maxLen) return str;
    return str.slice(0, Math.max(8, maxLen - 14)) + '…' + str.slice(-10);
  }

  function persistLastPublishRecord(obj) {
    try {
      localStorage.setItem(lastPublishStorageKey(), JSON.stringify(obj));
    } catch (e) {}
  }

  function previewSummaryLabel(p) {
    var payload = p.payload || p.Payload || {};
    var kind = payload.kind || p.kind || 'content';
    var path = payload.contentPath || p.content_path || '';
    var fm = payload.frontMatter || payload.front_matter || {};
    var title =
      fm.title != null && fm.title !== ''
        ? String(fm.title)
        : path
          ? path.replace(/^content\//, '').replace(/\.md$/, '')
          : '';
    if (kind === 'theme-css') {
      return 'Theme colors (' + (path || 'static/css/colors.css') + ')';
    }
    var kindLabel =
      kind === 'menu-item'
        ? 'Menu item'
        : kind === 'section-header'
          ? 'Section'
          : kind === 'promotion'
            ? 'Promotion'
            : kind === 'home'
              ? 'Home'
              : kind === 'slideshow'
                ? 'Slideshow'
                : kind;
    if (!path) return title ? kindLabel + ': ' + title : kindLabel;
    var pathSlug = path.replace(/^content\//, '').replace(/\.md$/, '');
    if (!title || title === path || title === pathSlug) {
      return kindLabel + ' (' + path + ')';
    }
    return kindLabel + ': ' + title + ' (' + path + ')';
  }

  function normalizeStoredFileLabel(label) {
    label = String(label || '');
    var themeDup = /^Theme colors:\s*(.+?)\s*\(\1\)$/i;
    var m = label.match(themeDup);
    if (m) return 'Theme colors (' + m[1].trim() + ')';
    return label.replace(/\s*\(([^)]+)\)\s*\(\1\)\s*$/, ' ($1)');
  }

  function normalizePreviewsPayload(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (data.previews && Array.isArray(data.previews)) return data.previews;
    if (data.Previews && Array.isArray(data.Previews)) return data.Previews;
    if (data.data && Array.isArray(data.data)) return data.data;
    return [];
  }

  function dedupePreviewsByContentPath(previews) {
    if (!previews || !previews.length) return [];
    var best = {};
    previews.forEach(function (p) {
      var payload = p.payload || p.Payload || {};
      var path =
        p.content_path ||
        p.contentPath ||
        payload.contentPath ||
        payload.content_path ||
        payload.siteConfigPath ||
        '';
      var key = path || (p.id ? 'id:' + p.id : '');
      if (!key) return;
      var cur = best[key];
      var t = new Date(p.updated_at || p.UpdatedAt || 0).getTime();
      if (!cur || t >= new Date(cur.updated_at || cur.UpdatedAt || 0).getTime()) {
        best[key] = p;
      }
    });
    return Object.keys(best).map(function (k) {
      return best[k];
    });
  }

  function cmsGetJson(url) {
    return fetch(url, { method: 'GET', credentials: 'include', headers: getAuthHeaders() }).then(
      function (res) {
        return res.text().then(function (text) {
          var data = null;
          try {
            data = text ? JSON.parse(text) : null;
          } catch (e) {
            if (!res.ok) {
              throw new Error(
                (res.status ? res.status + ' ' : '') + (text || '').slice(0, 120) || res.statusText
              );
            }
          }
          return { ok: res.ok, status: res.status, data: data, text: text };
        });
      }
    );
  }

  function cmsGetJsonWithAuth(url) {
    return ensureAccessTokenForCms().then(function () {
      return cmsGetJson(url);
    }).then(function (res) {
      if (res.ok || (res.status !== 401 && res.status !== 403)) return res;
      var ac = global.AuthClient;
      if (!ac || typeof ac.refreshToken !== 'function') return res;
      return ac.refreshToken().then(function (rr) {
        if (!rr || !rr.success) return res;
        return cmsGetJson(url);
      });
    });
  }

  function cmsErrorMessage(status, data, fallback) {
    return (
      (data && (data.error || data.message)) ||
      fallback ||
      (status ? 'Request failed (' + status + ')' : 'Request failed')
    );
  }

  function normalizeVersionsPayload(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (data.versions && Array.isArray(data.versions)) return data.versions;
    if (data.data && Array.isArray(data.data)) return data.data;
    if (data.menu_versions && Array.isArray(data.menu_versions)) return data.menu_versions;
    if (data.MenuVersions && Array.isArray(data.MenuVersions)) return data.MenuVersions;
    return [];
  }

  function versionIdFromRecord(v) {
    if (v == null || typeof v !== 'object') return '';
    var id =
      v.id ||
      v.ID ||
      v.version_id ||
      v.VersionId ||
      v.menu_version_id ||
      v.MenuVersionId ||
      v.uuid ||
      v.UUID ||
      v.snapshot_id ||
      v.SnapshotId;
    return id != null ? String(id).trim() : '';
  }

  function versionNameFromRecord(v) {
    if (v == null || typeof v !== 'object') return '';
    var n = v.name || v.label || v.title || v.Name || v.Label;
    return n != null ? String(n).trim() : '';
  }

  function versionSortKey(v) {
    var u = v.updated_at || v.updatedAt || v.UpdatedAt;
    var c = v.created_at || v.createdAt || v.CreatedAt;
    var t = u || c;
    return t ? new Date(t).getTime() : 0;
  }

  function formatVersionWhen(v) {
    var t =
      v.updated_at ||
      v.updatedAt ||
      v.UpdatedAt ||
      v.created_at ||
      v.createdAt ||
      v.CreatedAt;
    if (!t) return '';
    try {
      return new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    } catch (e) {
      return String(t);
    }
  }

  function snapshotDisplayParts(v) {
    var name = versionNameFromRecord(v) || 'Menu snapshot';
    var when = formatVersionWhen(v);
    var split = name.match(/^(.+?)\s*·\s*(.+)$/);
    if (split) {
      var title = split[1].trim();
      var embedded = split[2].trim();
      return { title: title, when: when || embedded };
    }
    return { title: name, when: when || '' };
  }

  function createStatusStatPill(count, singular, plural) {
    var pill = document.createElement('span');
    pill.className = 'dashboard-menu-status-stat';
    var n = document.createElement('span');
    n.className = 'dashboard-menu-status-stat-num';
    n.textContent = String(count);
    pill.appendChild(n);
    pill.appendChild(document.createTextNode(' ' + (count === 1 ? singular : plural)));
    return pill;
  }

  function appendStatusRows(container, items, max) {
    var list = document.createElement('ul');
    list.className = 'dashboard-menu-status-rows';
    var cap = Math.min(max || 4, items.length);
    for (var i = 0; i < cap; i++) {
      list.appendChild(items[i]);
    }
    if (items.length > cap) {
      var more = document.createElement('li');
      more.className = 'dashboard-menu-status-row dashboard-menu-status-row--more';
      if (typeof arguments[3] === 'function') {
        var moreBtn = document.createElement('button');
        moreBtn.type = 'button';
        moreBtn.className = 'dashboard-menu-status-more-btn';
        moreBtn.textContent =
          arguments[4] || 'View all ' + items.length + ' snapshots…';
        moreBtn.addEventListener('click', arguments[3]);
        more.appendChild(moreBtn);
      } else {
        more.textContent =
          '… and ' + (items.length - cap) + ' more';
      }
      list.appendChild(more);
    }
    container.appendChild(list);
  }

  function navigateEditDraftsWithVersion(versionId) {
    sessionStorage.setItem('editPreviewMode', 'drafts');
    if (versionId) {
      sessionStorage.setItem('editMenuVersionId', versionId);
      global.location.href =
        '/edit-menu/?load=drafts&menu_version=' + encodeURIComponent(versionId);
    } else {
      sessionStorage.removeItem('editMenuVersionId');
      global.location.href = '/edit-menu/?load=drafts';
    }
  }

  function navigateEditLive() {
    sessionStorage.setItem('editPreviewMode', 'live');
    sessionStorage.removeItem('editMenuVersionId');
    global.location.href = '/edit-menu/';
  }

  function init(cfg) {
    cfg = cfg || {};
    CMS_SERVICE_URL = (cfg.cmsUrl || global.CMS_SERVICE_URL || 'https://cms.ttmenus.com').replace(
      /\/+$/,
      ''
    );
    CMS_API_URL = (cfg.cmsApiUrl || global.CMS_API_URL || '').replace(/\/+$/, '');
    CMS_CLIENT_ID = cfg.clientId || global.CLIENT_ID || global.SITE_CLIENT_ID || '_ttms_menu_demo';

    var editLink = document.getElementById('cardEditMenu');
    var publishBtn = document.getElementById('cardPublishDrafts');
    var snapshotStatusEl = document.getElementById('dashboardSnapshotStatusSummary');
    var draftStatusEl = document.getElementById('dashboardDraftStatusSummary');
    var lastPublishEl = document.getElementById('dashboardLastPublishSummary');
    var publishFlashEl = document.getElementById('dashboardPublishFlash');

    var SNAPSHOT_LIST_CAP = 4;
    var snapshotListExpanded = false;

    function showPublishFlashMessage(msg) {
      if (!publishFlashEl) return;
      publishFlashEl.textContent = msg;
      publishFlashEl.classList.remove('hidden');
      if (global.__ttmsPublishFlashTimer) clearTimeout(global.__ttmsPublishFlashTimer);
      global.__ttmsPublishFlashTimer = setTimeout(function () {
        publishFlashEl.classList.add('hidden');
      }, 9000);
    }

    function renderSnapshotStatusSummary() {
      if (!snapshotStatusEl) return;
      snapshotStatusEl.textContent = '';
      if (snapshotLoadState === 'loading' || snapshotLoadState === 'idle') {
        var pLoad = document.createElement('p');
        pLoad.className = 'dashboard-menu-status-muted dashboard-menu-status-loading';
        pLoad.textContent = 'Loading menu snapshots…';
        snapshotStatusEl.appendChild(pLoad);
        return;
      }
      if (snapshotLoadState === 'auth') {
        var pAuth = document.createElement('p');
        pAuth.className = 'dashboard-menu-status-error';
        pAuth.textContent =
          snapshotLoadError || 'Could not load menu snapshots. Sign out and sign in again.';
        snapshotStatusEl.appendChild(pAuth);
        return;
      }
      if (snapshotLoadState === 'error') {
        var pErr = document.createElement('p');
        pErr.className = 'dashboard-menu-status-error';
        pErr.textContent =
          snapshotLoadError || 'Could not load menu snapshots. Refresh the page or try again.';
        snapshotStatusEl.appendChild(pErr);
        return;
      }
      var n = cachedVersions.length;
      if (n === 0) {
        var p0 = document.createElement('p');
        p0.className = 'dashboard-menu-status-muted';
        p0.textContent =
          'No saved menu snapshots on the CMS. In the editor, use Save → Save snapshot (CMS only), or leave the editor to auto-save one.';
        snapshotStatusEl.appendChild(p0);
        return;
      }
      var intro = document.createElement('p');
      intro.className = 'dashboard-menu-status-intro';
      intro.appendChild(createStatusStatPill(n, 'snapshot', 'snapshots'));
      intro.appendChild(
        document.createTextNode(' saved on the CMS — layout, items, and theme colors.')
      );
      snapshotStatusEl.appendChild(intro);
      var hint = document.createElement('p');
      hint.className = 'dashboard-menu-status-muted';
      hint.textContent =
        'Open editor loads the live menu. Pick a snapshot below to restore layout and theme with your drafts.';
      snapshotStatusEl.appendChild(hint);
      var rows = [];
      for (var si = 0; si < n; si++) {
        var parts = snapshotDisplayParts(cachedVersions[si]);
        var vid = versionIdFromRecord(cachedVersions[si]);
        var li = document.createElement('li');
        li.className = 'dashboard-menu-status-row';
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'dashboard-menu-status-snapshot-item';
        var titleSpan = document.createElement('span');
        titleSpan.className = 'dashboard-menu-status-snapshot-item-title';
        titleSpan.textContent = truncateMiddle(parts.title, 48);
        btn.appendChild(titleSpan);
        if (parts.when) {
          var whenSpan = document.createElement('span');
          whenSpan.className = 'dashboard-menu-status-snapshot-item-when';
          whenSpan.textContent = parts.when;
          btn.appendChild(whenSpan);
        }
        if (vid) {
          btn.addEventListener('click', function (id) {
            return function () {
              navigateEditDraftsWithVersion(id);
            };
          }(vid));
        }
        li.appendChild(btn);
        rows.push(li);
      }
      var cap = snapshotListExpanded ? n : SNAPSHOT_LIST_CAP;
      if (n > SNAPSHOT_LIST_CAP) {
        appendStatusRows(
          snapshotStatusEl,
          rows,
          cap,
          function () {
            snapshotListExpanded = !snapshotListExpanded;
            renderSnapshotStatusSummary();
          },
          snapshotListExpanded ? 'Show fewer snapshots' : 'View all ' + n + ' snapshots…'
        );
      } else {
        appendStatusRows(snapshotStatusEl, rows, cap);
      }
    }

    function renderDraftStatusSummary() {
      if (!draftStatusEl) return;
      draftStatusEl.textContent = '';
      if (draftLoadState === 'loading' || draftLoadState === 'idle') {
        var pLoadD = document.createElement('p');
        pLoadD.className = 'dashboard-menu-status-muted dashboard-menu-status-loading';
        pLoadD.textContent = 'Loading content drafts…';
        draftStatusEl.appendChild(pLoadD);
        return;
      }
      if (draftLoadState === 'auth') {
        var pAuthD = document.createElement('p');
        pAuthD.className = 'dashboard-menu-status-error';
        pAuthD.textContent =
          draftLoadError || 'Could not load content drafts. Sign out and sign in again.';
        draftStatusEl.appendChild(pAuthD);
        return;
      }
      if (draftLoadState === 'error') {
        var pErrD = document.createElement('p');
        pErrD.className = 'dashboard-menu-status-error';
        pErrD.textContent =
          draftLoadError || 'Could not load content drafts. Refresh the page or try again.';
        draftStatusEl.appendChild(pErrD);
        return;
      }
      var n = cachedPreviews.length;
      if (n === 0) {
        var p0 = document.createElement('p');
        p0.className = 'dashboard-menu-status-muted';
        p0.textContent =
          'No unpublished content drafts. Edits to menu items, sections, promotions, and theme CSS files appear here after you save in the editor.';
        draftStatusEl.appendChild(p0);
        return;
      }
      var introD = document.createElement('p');
      introD.className = 'dashboard-menu-status-intro';
      introD.appendChild(createStatusStatPill(n, 'draft', 'drafts'));
      introD.appendChild(document.createTextNode(' ready to publish to Git.'));
      draftStatusEl.appendChild(introD);
      var hintD = document.createElement('p');
      hintD.className = 'dashboard-menu-status-muted';
      hintD.textContent = 'Use Publish below when you are ready to commit these files.';
      draftStatusEl.appendChild(hintD);
      var rowsD = [];
      for (var di = 0; di < n; di++) {
        var liD = document.createElement('li');
        liD.className = 'dashboard-menu-status-row';
        var chip = document.createElement('span');
        chip.className = 'dashboard-menu-status-draft-chip';
        chip.textContent = truncateMiddle(previewSummaryLabel(cachedPreviews[di]), 88);
        liD.appendChild(chip);
        rowsD.push(liD);
      }
      appendStatusRows(draftStatusEl, rowsD, 4);
    }

    function renderLastPublishSummary() {
      if (!lastPublishEl) return;
      lastPublishEl.textContent = '';
      var raw = null;
      try {
        raw = localStorage.getItem(lastPublishStorageKey());
      } catch (e) {}
      if (!raw) {
        var ph = document.createElement('p');
        ph.className = 'dashboard-menu-status-muted';
        ph.textContent =
          'When you publish content drafts, this shows the time, file count, what changed, and the Git commit when the server returns it.';
        lastPublishEl.appendChild(ph);
        return;
      }
      var data;
      try {
        data = JSON.parse(raw);
      } catch (e) {
        data = null;
      }
      if (!data || !data.at) {
        var pb = document.createElement('p');
        pb.className = 'dashboard-menu-status-muted';
        pb.textContent = 'No publish record found.';
        lastPublishEl.appendChild(pb);
        return;
      }
      var when = data.at;
      try {
        when = new Date(data.at).toLocaleString(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        });
      } catch (e2) {}
      var ok = data.ok !== false;
      var line1 = document.createElement('p');
      line1.className = ok ? 'dashboard-menu-status-success' : 'dashboard-menu-status-error';
      line1.textContent = (ok ? 'Publish succeeded' : 'Publish failed') + ' · ' + when;
      lastPublishEl.appendChild(line1);
      var metaParts = [];
      if (data.count != null) metaParts.push(data.count + ' file' + (data.count === 1 ? '' : 's'));
      if (data.commitHash) metaParts.push('Git ' + String(data.commitHash).slice(0, 7));
      if (metaParts.length) {
        var line2 = document.createElement('p');
        line2.className = 'dashboard-menu-status-muted';
        line2.textContent = metaParts.join(' · ');
        lastPublishEl.appendChild(line2);
      }
      if (data.fileLabels && data.fileLabels.length) {
        var publishRows = [];
        var maxL = 5;
        for (var j = 0; j < Math.min(maxL, data.fileLabels.length); j++) {
          var liP = document.createElement('li');
          liP.className = 'dashboard-menu-status-row';
          var chipP = document.createElement('span');
          chipP.className = 'dashboard-menu-status-publish-chip';
          chipP.textContent = truncateMiddle(normalizeStoredFileLabel(data.fileLabels[j]), 88);
          liP.appendChild(chipP);
          publishRows.push(liP);
        }
        if (data.fileLabels.length > maxL) {
          var liMoreP = document.createElement('li');
          liMoreP.className = 'dashboard-menu-status-row dashboard-menu-status-row--more';
          liMoreP.textContent = '… and ' + (data.fileLabels.length - maxL) + ' more';
          publishRows.push(liMoreP);
        }
        appendStatusRows(lastPublishEl, publishRows, maxL + 1);
      }
    }

    function syncPublishButton() {
      if (!publishBtn) return;
      if (cachedPreviews.length > 0) {
        publishBtn.classList.remove('hidden');
        publishBtn.classList.add('btn-dash-publish');
        var label = publishBtn.querySelector('.card-publish-btn-label');
        var countText =
          'Publish' + (cachedPreviews.length > 1 ? ' (' + cachedPreviews.length + ')' : '');
        if (label) label.textContent = countText;
        else publishBtn.textContent = countText;
      } else {
        publishBtn.classList.add('hidden');
      }
    }

    function fetchMenuVersions() {
      snapshotLoadState = 'loading';
      snapshotLoadError = '';
      renderSnapshotStatusSummary();
      return cmsGetJsonWithAuth(cmsClientPath('/menu-versions'))
        .then(function (res) {
          if (!res.ok) {
            snapshotLoadState = res.status === 401 || res.status === 403 ? 'auth' : 'error';
            snapshotLoadError = cmsAuthFailureMessage(res);
            if (snapshotLoadError === '') return [];
            cachedVersions = [];
            renderSnapshotStatusSummary();
            return [];
          }
          var raw = normalizeVersionsPayload(res.data);
          cachedVersions = raw.slice().sort(function (a, b) {
            return versionSortKey(b) - versionSortKey(a);
          });
          snapshotLoadState = 'ok';
          snapshotLoadError = '';
          renderSnapshotStatusSummary();
          return cachedVersions;
        })
        .catch(function (err) {
          snapshotLoadState = 'error';
          snapshotLoadError = (err && err.message) || 'Network error loading snapshots';
          cachedVersions = [];
          renderSnapshotStatusSummary();
          return [];
        });
    }

    function fetchPreviews() {
      draftLoadState = 'loading';
      draftLoadError = '';
      renderDraftStatusSummary();
      return cmsGetJsonWithAuth(cmsClientPath('/content/previews'))
        .then(function (res) {
          if (!res.ok) {
            draftLoadState = res.status === 401 || res.status === 403 ? 'auth' : 'error';
            draftLoadError = cmsAuthFailureMessage(res);
            if (draftLoadError === '') return [];
            cachedPreviews = [];
            syncPublishButton();
            renderDraftStatusSummary();
            return [];
          }
          var raw = normalizePreviewsPayload(res.data);
          cachedPreviews = dedupePreviewsByContentPath(raw);
          draftLoadState = 'ok';
          draftLoadError = '';
          syncPublishButton();
          renderDraftStatusSummary();
          return cachedPreviews;
        })
        .catch(function (err) {
          draftLoadState = 'error';
          draftLoadError = (err && err.message) || 'Network error loading drafts';
          cachedPreviews = [];
          syncPublishButton();
          renderDraftStatusSummary();
          return [];
        });
    }

    function refreshMenuCard() {
      if (refreshInFlight) return refreshInFlight;
      if (redirectToLoginIfUnauthenticated()) {
        return Promise.resolve();
      }
      snapshotLoadState = 'loading';
      draftLoadState = 'loading';
      renderSnapshotStatusSummary();
      renderDraftStatusSummary();
      refreshInFlight = ensureAccessTokenForCms()
        .then(function () {
          if (redirectToLoginIfUnauthenticated()) return;
          return Promise.all([fetchMenuVersions(), fetchPreviews()]);
        })
        .finally(function () {
          refreshInFlight = null;
        });
      return refreshInFlight;
    }

    if (editLink) {
      editLink.addEventListener('click', function (ev) {
        ev.preventDefault();
        navigateEditLive();
      });
    }

    var publishSummaryModal = document.getElementById('dashboardPublishSummaryModal');
    var publishSummaryList = document.getElementById('dashboardPublishSummaryList');
    var publishSummaryCount = document.getElementById('dashboardPublishSummaryCount');
    var publishSummaryCancel = document.getElementById('dashboardPublishSummaryCancel');
    var publishSummaryConfirm = document.getElementById('dashboardPublishSummaryConfirm');

    function closePublishSummaryModal() {
      if (!publishSummaryModal) return;
      publishSummaryModal.classList.add('hidden');
      publishSummaryModal.setAttribute('aria-hidden', 'true');
    }

    if (publishSummaryModal) {
      var publishSummaryBackdrop = publishSummaryModal.querySelector(
        '.dashboard-publish-summary-backdrop'
      );
      if (publishSummaryBackdrop) {
        publishSummaryBackdrop.addEventListener('click', closePublishSummaryModal);
      }
      document.addEventListener('keydown', function (ev) {
        if (ev.key !== 'Escape') return;
        if (publishSummaryModal.classList.contains('hidden')) return;
        closePublishSummaryModal();
        ev.preventDefault();
      });
    }

    if (publishBtn) {
      publishBtn.addEventListener('click', function () {
        if (cachedPreviews.length === 0) return;
        var pending = dedupePreviewsByContentPath(cachedPreviews.slice());
        function renderSummary() {
          if (!publishSummaryList || !publishSummaryCount) return;
          publishSummaryList.innerHTML = '';
          publishSummaryCount.textContent =
            pending.length === 0
              ? 'No files selected'
              : pending.length === 1
                ? '1 file ready to publish to Git'
                : pending.length + ' files ready to publish to Git';
          if (publishSummaryConfirm) {
            publishSummaryConfirm.disabled = pending.length === 0;
            if (pending.length === 0) {
              publishSummaryConfirm.textContent = 'Nothing to publish';
            } else {
              publishSummaryConfirm.innerHTML =
                '<i class="fa fa-cloud-upload" aria-hidden="true"></i> Publish';
            }
          }
          pending.forEach(function (p) {
            var rowId = p.id || '';
            var li = document.createElement('li');
            li.className = 'dashboard-publish-summary-item';
            var label = document.createElement('span');
            label.className = 'dashboard-publish-summary-label';
            label.textContent = previewSummaryLabel(p);
            var removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'dashboard-publish-summary-revert';
            removeBtn.innerHTML = '<i class="fa fa-times" aria-hidden="true"></i>';
            removeBtn.setAttribute('aria-label', 'Remove draft from publish list');
            removeBtn.addEventListener('click', function () {
              var idx = pending.findIndex(function (x) {
                return (x.id || '') === rowId;
              });
              if (idx === -1) return;
              var previewId = pending[idx].id;
              function removeFromList() {
                pending.splice(idx, 1);
                renderSummary();
                fetchPreviews();
                if (pending.length === 0) closePublishSummaryModal();
              }
              if (previewId) {
                var delUrl = cmsClientPath('/content/previews/' + encodeURIComponent(previewId));
                fetch(delUrl, {
                  method: 'DELETE',
                  credentials: 'include',
                  headers: getAuthHeaders(),
                })
                  .then(function (res) {
                    if (!res.ok && res.status !== 204)
                      return res.text().then(function (t) {
                        throw new Error(t);
                      });
                    removeFromList();
                  })
                  .catch(function (err) {
                    console.error('Delete draft failed', err);
                    alert('Could not delete saved change: ' + (err.message || err));
                  });
              } else {
                removeFromList();
              }
            });
            li.appendChild(label);
            li.appendChild(removeBtn);
            publishSummaryList.appendChild(li);
          });
        }
        renderSummary();
        if (publishSummaryModal) {
          publishSummaryModal.classList.remove('hidden');
          publishSummaryModal.setAttribute('aria-hidden', 'false');
        }
        if (publishSummaryCancel) {
          publishSummaryCancel.onclick = closePublishSummaryModal;
        }
        if (publishSummaryConfirm) {
          publishSummaryConfirm.onclick = function () {
            if (pending.length === 0) return;
            publishSummaryConfirm.disabled = true;
            ensureAccessTokenForCms().then(function (token) {
              if (!token) {
                alert('CMS session expired. Sign out and sign in again.');
                publishSummaryConfirm.disabled = false;
                return;
              }
            var changes = pending.map(function (p) {
              var o = { payload: p.payload || p.Payload || {} };
              if (p.id) o.previewId = p.id;
              return o;
            });
            var body = {
              changes: changes,
              commitMessage: 'Publish ' + pending.length + ' change(s)',
            };
            var applyUrl = cmsClientPath('/content/apply-batch');
            var headers = getAuthHeaders();
            headers['Content-Type'] = 'application/json';
            fetch(applyUrl, {
              method: 'POST',
              credentials: 'include',
              headers: headers,
              body: JSON.stringify(body),
            })
              .then(function (res) {
                if (!res.ok)
                  return res.text().then(function (t) {
                    throw new Error(t);
                  });
                return res.json();
              })
              .then(function (resp) {
                var hash = resp && resp.commit && resp.commit.hash ? String(resp.commit.hash) : '';
                var labels = pending.map(previewSummaryLabel);
                persistLastPublishRecord({
                  at: new Date().toISOString(),
                  ok: true,
                  count: pending.length,
                  commitHash: hash,
                  fileLabels: labels.slice(0, 24),
                });
                renderLastPublishSummary();
                var flashMsg =
                  'Success — ' +
                  pending.length +
                  ' file' +
                  (pending.length === 1 ? '' : 's') +
                  ' published to your live site.';
                if (hash) flashMsg += ' Git commit ' + hash.slice(0, 7) + '.';
                showPublishFlashMessage(flashMsg);
                closePublishSummaryModal();
                publishSummaryConfirm.disabled = false;
                publishSummaryConfirm.innerHTML =
                  '<i class="fa fa-cloud-upload" aria-hidden="true"></i> Publish';
                return refreshMenuCard();
              })
              .catch(function (err) {
                console.error('Publish failed', err);
                alert('Publish failed: ' + (err.message || err));
                publishSummaryConfirm.disabled = false;
              });
            });
          };
        }
      });
    }

    var refreshScheduleTimer = null;
    function scheduleRefreshMenuCard() {
      if (refreshScheduleTimer) clearTimeout(refreshScheduleTimer);
      refreshScheduleTimer = setTimeout(function () {
        refreshScheduleTimer = null;
        if (document.getElementById('dashboardMenuStatusPanel')) refreshMenuCard();
      }, 350);
    }

    renderLastPublishSummary();
    refreshMenuCard();

    global.addEventListener('pageshow', scheduleRefreshMenuCard);

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') scheduleRefreshMenuCard();
    });

    global.addEventListener('ttms:auth-ready', scheduleRefreshMenuCard);

    global.__ttmsMenuStatusRefresh = refreshMenuCard;

    return { refresh: refreshMenuCard };
  }

  global.DashboardMenuStatus = { init: init, refresh: function () {
    if (typeof global.__ttmsMenuStatusRefresh === 'function') return global.__ttmsMenuStatusRefresh();
    return Promise.resolve();
  } };
})(typeof window !== 'undefined' ? window : this);
