/**
 * Dashboard analytics snapshot — loads last-N-day Matomo metrics via CMS
 * (GET /api/clients/:clientId/analytics/summary). CMS reads idsite from hugo.toml
 * and queries Matomo in ttms-app-cluster/base/analytics.
 */
(function (global) {
  'use strict';

  function formatCount(n) {
    if (n == null || n === '') return '—';
    try {
      return new Intl.NumberFormat(undefined).format(Number(n));
    } catch (e) {
      return String(n);
    }
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
    }
    return null;
  }

  function authHeaders() {
    var token = getAccessTokenForCms();
    var h = { Accept: 'application/json' };
    if (token) h.Authorization = 'Bearer ' + token;
    return h;
  }

  function ensureAccessTokenForCms() {
    var existing = getAccessTokenForCms();
    if (existing) return Promise.resolve(existing);
    var ac = global.AuthClient;
    if (!ac) return Promise.resolve(null);
    if (typeof ac.ensureAccessToken === 'function') {
      return ac.ensureAccessToken().then(function (result) {
        if (result && result.success) return getAccessTokenForCms();
        return null;
      });
    }
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

  function clientId() {
    return global.CLIENT_ID || global.SITE_CLIENT_ID || global.CMS_CLIENT_ID || '_ttms_menu_demo';
  }

  function normalizeHubClientId(raw) {
    var cid = String(raw || '').trim();
    if (!cid) return '';
    if (cid.indexOf('ttms_') !== 0) {
      cid = 'ttms_' + cid.replace(/^ttms_/, '');
    }
    return cid;
  }

  function siteTierFromConfig() {
    var page = document.getElementById('dashboardAnalyticsPage');
    var fromDom = page && page.getAttribute('data-site-tier');
    if (fromDom) return String(fromDom).toLowerCase();
    if (global.SITE_TIER) return String(global.SITE_TIER).toLowerCase();
    if (global.SiteConfig && global.SiteConfig.tier) {
      return String(global.SiteConfig.tier).toLowerCase();
    }
    return 'free';
  }

  function isPaidPlan(plan) {
    var p = String(plan || 'free').toLowerCase().trim();
    return p !== '' && p !== 'free';
  }

  function hubAccountUpgradeUrl() {
    var base = String(global.HUB_ACCOUNT_URL || 'https://ttmenus.com/account/').replace(/\/+$/, '');
    var cid = normalizeHubClientId(clientId());
    return base + '/?client_id=' + encodeURIComponent(cid);
  }

  function setAnalyticsHeaderActions(plan) {
    var paid = isPaidPlan(plan);
    var external = document.querySelector('.dashboard-analytics-external-link');
    var upgrade = document.querySelector('.dashboard-analytics-upgrade-link');
    if (external) external.hidden = !paid;
    if (upgrade) {
      upgrade.hidden = paid;
      if (!paid) upgrade.href = hubAccountUpgradeUrl();
    }
  }

  function fetchBillingPlan() {
    var base = String(global.CPS_SERVICE_URL || '').replace(/\/+$/, '');
    var cid = normalizeHubClientId(clientId());
    if (!base || !cid) return Promise.resolve(null);
    var ac = global.AuthClient;
    if (!ac || typeof ac.authenticatedRequest !== 'function') {
      return Promise.resolve(null);
    }
    return ac
      .authenticatedRequest(
        base + '/api/billing/status?client_ids=' + encodeURIComponent(cid),
        { method: 'GET', headers: { Accept: 'application/json' }, credentials: 'include' }
      )
      .then(function (res) {
        if (!res || !res.ok) return null;
        return res.json().then(function (data) {
          var status = data && data.billing ? data.billing[cid] : null;
          return status && status.plan ? String(status.plan).toLowerCase() : null;
        });
      })
      .catch(function () {
        return null;
      });
  }

  function applyAnalyticsHeaderActions() {
    setAnalyticsHeaderActions(siteTierFromConfig());
    return fetchBillingPlan().then(function (billingPlan) {
      if (billingPlan) setAnalyticsHeaderActions(billingPlan);
    });
  }

  function cmsApiBase() {
    var api = (global.CMS_API_URL || '').replace(/\/+$/, '');
    if (api) return api;
    var svc = (global.CMS_SERVICE_URL || 'https://cms.ttmenus.com').replace(/\/+$/, '');
    if (/\/api$/i.test(svc)) return svc;
    return svc + '/api';
  }

  function fetchSummary(days) {
    days = days || 30;
    var url =
      cmsApiBase() +
      '/clients/' +
      encodeURIComponent(clientId()) +
      '/analytics/summary?days=' +
      encodeURIComponent(String(days));
    function doFetch() {
      return fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: authHeaders(),
      }).then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, status: res.status, data: data };
        });
      });
    }
    return ensureAccessTokenForCms().then(function () {
      return doFetch();
    }).then(function (result) {
      if (result.ok || (result.status !== 401 && result.status !== 403)) return result;
      var ac = global.AuthClient;
      if (!ac || typeof ac.refreshToken !== 'function') return result;
      return ac.refreshToken().then(function (rr) {
        if (!rr || !rr.success) return result;
        return doFetch();
      });
    });
  }

  function errorMessage(status, data) {
    var err = (data && (data.error || data.message)) || String(status);
    if (status === 503) {
      return 'Analytics reporting is not configured on the server yet.';
    }
    if (status === 404) {
      return 'No analytics site linked yet (set params.services.analyticsid in hugo.toml).';
    }
    if (status === 502 && err.indexOf('Matomo:') === 0) {
      return err.replace(/^Matomo:\s*/i, 'Analytics: ');
    }
    return 'Could not load analytics (' + err + ').';
  }

  /**
   * Dashboard control-room card: page views + visits (30d).
   */
  function loadDashboardCard(options) {
    options = options || {};
    var days = options.days || 30;
    var pv = document.getElementById('dashboardCardAnalyticsPageViews');
    var vs = document.getElementById('dashboardCardAnalyticsVisits');
    var hint = document.getElementById('dashboardCardAnalyticsHint');
    var snap = document.getElementById('dashboardCardAnalyticsSnapshot');
    if (!pv || !vs) return Promise.resolve();

    return fetchSummary(days)
      .then(function (x) {
        if (!x.ok) {
          if (hint) {
            hint.textContent = errorMessage(x.status, x.data);
            hint.classList.remove('hidden');
          }
          if (snap) snap.setAttribute('aria-label', 'Analytics snapshot unavailable');
          return;
        }
        var d = x.data || {};
        if (d.pageViews != null) pv.textContent = formatCount(d.pageViews);
        if (d.visits != null) vs.textContent = formatCount(d.visits);
        if (hint) hint.classList.add('hidden');
        if (snap) {
          snap.setAttribute(
            'aria-label',
            'Analytics snapshot, last ' + days + ' days: ' +
              formatCount(d.pageViews) + ' page views, ' + formatCount(d.visits) + ' visits'
          );
        }
      })
      .catch(function () {
        if (hint) {
          hint.textContent = 'Could not load analytics. Try again later.';
          hint.classList.remove('hidden');
        }
      });
  }

  /**
   * Full /analytics/ page metrics.
   */
  function setAnalyticsNoteState(noteEl, state, htmlOrText) {
    if (!noteEl) return;
    var textEl = noteEl.querySelector('.dashboard-analytics-note-text');
    var target = textEl || noteEl;
    noteEl.classList.remove(
      'dashboard-analytics-note--loading',
      'dashboard-analytics-note--ok',
      'dashboard-analytics-note--warn'
    );
    if (state) noteEl.classList.add('dashboard-analytics-note--' + state);
    ['loading', 'ok', 'warn'].forEach(function (s) {
      var icon = noteEl.querySelector('.dashboard-analytics-note-icon--' + s);
      if (icon) icon.hidden = s !== state;
    });
    if (htmlOrText != null) {
      if (textEl && String(htmlOrText).indexOf('<') !== -1) {
        textEl.innerHTML = htmlOrText;
      } else if (textEl) {
        textEl.textContent = htmlOrText;
      } else {
        noteEl.textContent = htmlOrText;
      }
    }
  }

  function loadAnalyticsPage(options) {
    options = options || {};
    var days = options.days || 30;
    var noteEl = document.getElementById('dashboardAnalyticsNote');

    function setMetric(id, value, name) {
      var el = document.getElementById(id);
      if (!el) return;
      if (value == null || value === '') {
        el.textContent = '—';
        el.setAttribute('aria-label', name + ', data not available');
        return;
      }
      var t = formatCount(value);
      el.textContent = t;
      el.setAttribute('aria-label', name + ': ' + t);
    }

    document.querySelectorAll('.dashboard-analytics-card-value').forEach(function (el) {
      if (el.textContent === '—') el.setAttribute('aria-label', 'Data not yet loaded');
    });

    setAnalyticsNoteState(noteEl, 'loading', 'Loading analytics…');

    return fetchSummary(days)
      .then(function (x) {
        if (!x.ok) {
          setAnalyticsNoteState(noteEl, 'warn', errorMessage(x.status, x.data));
          return;
        }
        var d = x.data || {};
        setMetric('metricPageViews', d.pageViews, 'Page views');
        setMetric('metricVisits', d.visits, 'Visits');
        setMetric('metricUniqueVisitors', d.uniqueVisitors, 'Unique visitors');
        setMetric('metricMenuItemViews', d.menuItemViews, 'Menu item views');
        setMetric('metricAddToCart', d.addToCart, 'Add to cart');
        setAnalyticsNoteState(
          noteEl,
          'ok',
          'Showing analytics for the last ' + days + ' days.'
        );
      })
      .catch(function () {
        setAnalyticsNoteState(noteEl, 'warn', 'Could not load analytics. Try again later.');
      });
  }

  global.DashboardAnalyticsSnapshot = {
    formatCount: formatCount,
    fetchSummary: fetchSummary,
    loadDashboardCard: loadDashboardCard,
    loadAnalyticsPage: loadAnalyticsPage,
    applyAnalyticsHeaderActions: applyAnalyticsHeaderActions,
    isPaidPlan: isPaidPlan,
  };
})(typeof window !== 'undefined' ? window : this);
