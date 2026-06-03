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

  function authHeaders() {
    var token =
      (global.AuthClient && global.AuthClient.getAccessToken && global.AuthClient.getAccessToken()) ||
      (typeof localStorage !== 'undefined' &&
        localStorage.getItem &&
        localStorage.getItem('ttmenus_access_token'));
    var h = { Accept: 'application/json' };
    if (token) h.Authorization = 'Bearer ' + token;
    return h;
  }

  function clientId() {
    return global.CLIENT_ID || global.SITE_CLIENT_ID || global.CMS_CLIENT_ID || '_ttms_menu_demo';
  }

  function cmsBase() {
    return (global.CMS_SERVICE_URL || 'https://cms.ttmenus.com').replace(/\/+$/, '');
  }

  function fetchSummary(days) {
    days = days || 30;
    var url =
      cmsBase() +
      '/api/clients/' +
      encodeURIComponent(clientId()) +
      '/analytics/summary?days=' +
      encodeURIComponent(String(days));
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

  function errorMessage(status, data) {
    var err = (data && (data.error || data.message)) || String(status);
    if (status === 503) {
      return 'Analytics reporting is not configured on the server yet.';
    }
    if (status === 404) {
      return 'No Matomo site linked yet (set params.services.analyticsid in hugo.toml).';
    }
    if (status === 502 && err.indexOf('Matomo:') === 0) {
      return err;
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

    if (!authHeaders().Authorization) {
      if (hint) {
        hint.textContent = 'Sign in to load analytics.';
        hint.classList.remove('hidden');
      }
      return Promise.resolve();
    }

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

    if (!authHeaders().Authorization) {
      if (noteEl) noteEl.textContent = 'Sign in to load analytics. Open Matomo for full reports.';
      return Promise.resolve();
    }

    if (noteEl) noteEl.textContent = 'Loading analytics from Matomo…';

    return fetchSummary(days)
      .then(function (x) {
        if (!x.ok) {
          if (noteEl) {
            noteEl.textContent = errorMessage(x.status, x.data) + ' Open Matomo for full reports.';
          }
          return;
        }
        var d = x.data || {};
        setMetric('metricPageViews', d.pageViews, 'Page views');
        setMetric('metricVisits', d.visits, 'Visits');
        setMetric('metricUniqueVisitors', d.uniqueVisitors, 'Unique visitors');
        setMetric('metricMenuItemViews', d.menuItemViews, 'Menu item views');
        setMetric('metricAddToCart', d.addToCart, 'Add to cart');
        if (noteEl) {
          noteEl.innerHTML =
            'Numbers come from Matomo for this site. Open <a href="https://analytics.ttmenus.com" target="_blank" rel="noopener">Matomo</a> for full reports and segments.';
        }
      })
      .catch(function () {
        if (noteEl) {
          noteEl.textContent = 'Could not load analytics. Try again later or open Matomo for full reports.';
        }
      });
  }

  global.DashboardAnalyticsSnapshot = {
    formatCount: formatCount,
    fetchSummary: fetchSummary,
    loadDashboardCard: loadDashboardCard,
    loadAnalyticsPage: loadAnalyticsPage,
  };
})(typeof window !== 'undefined' ? window : this);
