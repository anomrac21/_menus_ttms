/**
 * Dashboard analytics snapshot: loads last-N-day Matomo metrics via CMS
 * (GET /api/clients/:clientId/analytics/summary). CMS reads idsite from hugo.toml
 * and queries Matomo in ttms-app-cluster/base/analytics.
 */
(function (global) {
  'use strict';

  function formatCount(n) {
    if (n == null || n === '') return '';
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
    return global.CLIENT_ID || global.SITE_CLIENT_ID || global.CMS_CLIENT_ID || '';
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

  function fetchWithAuth(url) {
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

  function fetchSummary(days) {
    days = days || 30;
    var url =
      cmsApiBase() +
      '/clients/' +
      encodeURIComponent(clientId()) +
      '/analytics/summary?days=' +
      encodeURIComponent(String(days));
    return fetchWithAuth(url);
  }

  function fetchTrends(days) {
    days = days || 30;
    var url =
      cmsApiBase() +
      '/clients/' +
      encodeURIComponent(clientId()) +
      '/analytics/trends?days=' +
      encodeURIComponent(String(days));
    return fetchWithAuth(url);
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

  function escapeHtml(s) {
    if (s == null) return '';
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function formatShortDate(isoDate) {
    if (!isoDate) return '';
    try {
      var d = new Date(isoDate + 'T12:00:00');
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch (e) {
      return isoDate.slice(5);
    }
  }

  function setAnalyticsTrendsLoading(loading) {
    var wrap = document.getElementById('dashboardAnalyticsTrendChartWrap');
    var chart = document.getElementById('dashboardAnalyticsTrendChart');
    var empty = document.getElementById('dashboardAnalyticsTrendEmpty');
    if (!wrap || !chart) return;
    if (loading) {
      wrap.classList.add('dashboard-notify-trends-chart-wrap--loading');
      chart.innerHTML =
        '<p class="dashboard-notify-trends-loading" role="status">' +
        '<i class="fa fa-spinner fa-spin" aria-hidden="true"></i> Loading chart…</p>';
      if (empty) empty.hidden = true;
      return;
    }
    wrap.classList.remove('dashboard-notify-trends-chart-wrap--loading');
  }

  function normalizeTrendRows(rows) {
    return (rows || [])
      .filter(function (row) {
        return row && row.date;
      })
      .map(function (row) {
        return {
          date: row.date,
          pageViews: Number(row.pageViews) || 0,
          visits: Number(row.visits) || 0,
          menuItemViews: Number(row.menuItemViews) || 0,
          addToCart: Number(row.addToCart) || 0,
          orderSubmissions: Number(row.orderSubmissions) || 0,
          searches: Number(row.searches) || 0,
        };
      })
      .sort(function (a, b) {
        return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
      });
  }

  function renderAnalyticsTrendChart(rows, days) {
    var chart = document.getElementById('dashboardAnalyticsTrendChart');
    var empty = document.getElementById('dashboardAnalyticsTrendEmpty');
    if (!chart) return;

    rows = normalizeTrendRows(rows);
    var hasData = rows.some(function (r) {
      return r.pageViews + r.visits + r.menuItemViews + r.addToCart + r.orderSubmissions + r.searches > 0;
    });

    if (!hasData) {
      chart.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    analyticsChartRows = rows;
    analyticsChartDays = days || 30;
    ensureAnalyticsChartWatch(chart);

    var height = 260;
    var pad = { top: 16, right: 32, bottom: 36, left: 44 };
    var innerH = height - pad.top - pad.bottom;
    var maxVal = 1;

    rows.forEach(function (r) {
      maxVal = Math.max(maxVal, r.pageViews, r.visits, r.menuItemViews, r.addToCart, r.orderSubmissions, r.searches);
    });

    var series = [
      { key: 'pageViews', label: 'Page views', className: 'dashboard-analytics-trends-bar--pageviews' },
      { key: 'visits', label: 'Visits', className: 'dashboard-analytics-trends-bar--visits' },
      { key: 'menuItemViews', label: 'Menu item views', className: 'dashboard-analytics-trends-bar--menu' },
      { key: 'addToCart', label: 'Add to cart', className: 'dashboard-analytics-trends-bar--cart' },
      { key: 'orderSubmissions', label: 'Orders', className: 'dashboard-analytics-trends-bar--orders' },
      { key: 'searches', label: 'Searches', className: 'dashboard-analytics-trends-bar--search' },
    ];
    var seriesCount = series.length;
    var barGap = 3;
    var groupGap = 18;
    var minBar = 7;
    var maxBar = 14;
    var host = chart.clientWidth || 320;
    chart._ttmsChartW = chart.clientWidth || 0;
    var minGroup = seriesCount * minBar + (seriesCount - 1) * barGap + groupGap;
    var innerForHost = Math.max(0, host - pad.left - pad.right);
    var barGroupW = Math.max(minGroup, innerForHost / rows.length);
    var barRoom = barGroupW - groupGap - (seriesCount - 1) * barGap;
    var barW = Math.max(minBar, Math.min(maxBar, barRoom / seriesCount));
    var width = Math.ceil(pad.left + pad.right + barGroupW * rows.length);

    var svg =
      '<svg class="dashboard-notify-trends-svg" width="' +
      width +
      '" viewBox="0 0 ' +
      width +
      ' ' +
      height +
      '" preserveAspectRatio="xMidYMid meet" aria-hidden="true">';

    for (var g = 0; g <= 4; g++) {
      var y = pad.top + (innerH * g) / 4;
      var val = Math.round(maxVal * (1 - g / 4));
      svg +=
        '<line class="dashboard-notify-trends-grid" x1="' +
        pad.left +
        '" y1="' +
        y +
        '" x2="' +
        (width - pad.right) +
        '" y2="' +
        y +
        '"></line>';
      svg +=
        '<text class="dashboard-notify-trends-axis-y" x="' +
        (pad.left - 8) +
        '" y="' +
        (y + 4) +
        '" text-anchor="end">' +
        escapeHtml(String(val)) +
        '</text>';
    }

    rows.forEach(function (row, index) {
      var groupX = pad.left + index * barGroupW + barGroupW / 2;
      series.forEach(function (s, seriesIndex) {
        var value = Number(row[s.key]) || 0;
        var barH = maxVal ? (value / maxVal) * innerH : 0;
        var x = groupX - (barW * seriesCount + (seriesCount - 1) * barGap) / 2 + seriesIndex * (barW + barGap);
        var yBar = pad.top + innerH - barH;        svg +=
          '<rect class="dashboard-notify-trends-bar ' +
          s.className +
          '" x="' +
          x +
          '" y="' +
          yBar +
          '" width="' +
          barW +
          '" height="' +
          barH +
          '" rx="1"><title>' +
          escapeHtml(formatShortDate(row.date)) +
          ' · ' +
          s.label +
          ': ' +
          value +
          '</title></rect>';
      });

    });

    var labelGap = 72;
    var marks = [];
    rows.forEach(function (row, index) {
      var groupX = pad.left + index * barGroupW + barGroupW / 2;
      var prev = marks[marks.length - 1];
      if (index === rows.length - 1) {
        while (marks.length && groupX - marks[marks.length - 1].x < labelGap) marks.pop();
        marks.push({ x: groupX, date: row.date });
        return;
      }
      if (!prev || groupX - prev.x >= labelGap) marks.push({ x: groupX, date: row.date });
    });
    marks.forEach(function (mark) {
      svg +=
        '<text class="dashboard-notify-trends-axis-x" x="' +
        mark.x +
        '" y="' +
        (height - 8) +
        '" text-anchor="middle">' +
        escapeHtml(formatShortDate(mark.date)) +
        '</text>';
    });

    svg += '</svg>';
    chart.innerHTML = svg;
    chart.setAttribute(
      'aria-label',
      'Analytics activity chart for the last ' +
        (days || 30) +
        ' days with daily page views, visits, menu item views, add to cart, orders, and searches'
    );
  }

  var analyticsRequest = 0;
  var analyticsChartRows = [];
  var analyticsChartDays = 30;
  var analyticsChartWatch = false;
  var analyticsMetricAnimations = {};

  function stopAnalyticsMetricAnimation(id) {
    var state = analyticsMetricAnimations[id];
    if (!state) return;
    if (state.rafId) cancelAnimationFrame(state.rafId);
    delete analyticsMetricAnimations[id];
    var el = document.getElementById(id);
    if (el) el.classList.remove('dashboard-analytics-card-value--counting');
  }

  var ANALYTICS_METRIC_IDS = [
    'metricPageViews',
    'metricVisits',
    'metricUniqueVisitors',
    'metricMenuItemViews',
    'metricAddToCart',
    'metricOrderSubmissions',
    'metricSearches',
  ];

  function startAnalyticsLoadingCount(id) {
    stopAnalyticsMetricAnimation(id);
    var el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('is-loading');
    el.removeAttribute('aria-busy');
    el.classList.add('dashboard-analytics-card-value--counting');
    el.setAttribute('aria-label', 'Loading');
    var phase = Math.random() * Math.PI * 2;
    var requestAtStart = analyticsRequest;
    var state = { loading: true, started: performance.now() };
    analyticsMetricAnimations[id] = state;

    function tick(now) {
      if (analyticsMetricAnimations[id] !== state || !state.loading || requestAtStart !== analyticsRequest) return;
      var t = (now - state.started) / 1000;
      var wave = (Math.sin(t * 4.2 + phase) + Math.sin(t * 2.1 + phase * 0.7)) * 0.5;
      var pseudo = Math.max(0, Math.floor((wave * 0.5 + 0.5) * 99));
      el.textContent = formatCount(pseudo);
      state.rafId = requestAnimationFrame(tick);
    }

    state.rafId = requestAnimationFrame(tick);
  }

  function stopAnalyticsLoadingCounts() {
    ANALYTICS_METRIC_IDS.forEach(function (id) {
      stopAnalyticsMetricAnimation(id);
      var el = document.getElementById(id);
      if (el) el.textContent = '';
    });
  }

  function animateAnalyticsMetric(id, target, name) {
    var el = document.getElementById(id);
    if (!el) return;
    stopAnalyticsMetricAnimation(id);
    if (target == null || target === '' || isNaN(Number(target))) {
      el.textContent = '';
      el.setAttribute('aria-label', name + ', data not available');
      return;
    }
    var endValue = Math.floor(Number(target));
    el.setAttribute('aria-label', name + ': ' + formatCount(endValue));
    if (global.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.textContent = formatCount(endValue);
      return;
    }
    var requestAtStart = analyticsRequest;
    var state = { started: performance.now() };
    analyticsMetricAnimations[id] = state;
    el.classList.add('dashboard-analytics-card-value--counting');
    function tick(now) {
      if (analyticsMetricAnimations[id] !== state || requestAtStart !== analyticsRequest) {
        if (analyticsMetricAnimations[id] === state) stopAnalyticsMetricAnimation(id);
        return;
      }
      var progress = Math.min(1, (now - state.started) / 480);
      var eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = formatCount(Math.round(eased * endValue));
      if (progress < 1) {
        state.rafId = requestAnimationFrame(tick);
        return;
      }
      el.textContent = formatCount(endValue);
      el.classList.remove('dashboard-analytics-card-value--counting');
      delete analyticsMetricAnimations[id];
    }
    state.rafId = requestAnimationFrame(tick);
  }

  function ensureAnalyticsChartWatch(chart) {
    if (analyticsChartWatch || typeof global.ResizeObserver !== 'function') return;
    analyticsChartWatch = true;
    var timer = 0;
    new ResizeObserver(function () {
      var w = chart.clientWidth;
      if (!w || Math.abs(w - (chart._ttmsChartW || 0)) < 24) return;
      clearTimeout(timer);
      timer = setTimeout(function () {
        if (analyticsChartRows.length) renderAnalyticsTrendChart(analyticsChartRows, analyticsChartDays);
      }, 60);
    }).observe(chart);
  }

  function selectedAnalyticsDays() {
    var active = document.querySelector('#dashboardAnalyticsPeriodTabs [data-analytics-days][aria-selected="true"]');
    var days = active ? parseInt(active.getAttribute('data-analytics-days'), 10) : 30;
    return days > 0 ? days : 30;
  }

  function applyAnalyticsPeriod(days) {
    var heading = document.getElementById('analytics-last-month-heading');
    if (heading) heading.textContent = 'Last ' + days + ' days';
    var count = document.getElementById('dashboardCardAnalyticsCount');
    if (count) count.setAttribute('aria-label', 'Visits last ' + days + ' days');
    document.querySelectorAll('#dashboardAnalyticsPeriodTabs [data-analytics-days]').forEach(function (tab) {
      var on = String(tab.getAttribute('data-analytics-days')) === String(days);
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  function bindAnalyticsPeriodTabs() {
    var list = document.getElementById('dashboardAnalyticsPeriodTabs');
    if (!list || list.getAttribute('data-bound') === '1') return;
    list.setAttribute('data-bound', '1');
    list.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-analytics-days]');
      if (!btn || !list.contains(btn)) return;
      var days = parseInt(btn.getAttribute('data-analytics-days'), 10);
      if (!days || btn.getAttribute('aria-selected') === 'true') return;
      applyAnalyticsPeriod(days);
      loadAnalyticsPage({ days: days });
    });
  }

  function loadAnalyticsPage(options) {
    options = options || {};
    bindAnalyticsPeriodTabs();
    var days = options.days || selectedAnalyticsDays();
    applyAnalyticsPeriod(days);
    var requestId = ++analyticsRequest;
    var noteEl = document.getElementById('dashboardAnalyticsNote');

    function setMetric(id, value, name) {
      var el = document.getElementById(id);
      if (!el) return;
      if (id.indexOf('metric') === 0) {
        animateAnalyticsMetric(id, value, name);
        return;
      }
      if (value == null || value === '') {
        el.textContent = '';
        el.setAttribute('aria-label', name + ', data not available');
        return;
      }
      var t = formatCount(value);
      el.textContent = t;
      el.setAttribute('aria-label', name + ': ' + t);
    }

    document.querySelectorAll('.dashboard-analytics-card-value').forEach(function (el) {
      if (el.textContent === '') el.setAttribute('aria-label', 'Data not yet loaded');
    });

    setAnalyticsNoteState(noteEl, 'loading', 'Loading analytics…');
    setAnalyticsTrendsLoading(true);
    ANALYTICS_METRIC_IDS.forEach(startAnalyticsLoadingCount);

    return Promise.all([fetchSummary(days), fetchTrends(days)])
      .then(function (results) {
        if (requestId !== analyticsRequest) return;
        var summaryResult = results[0];
        var trendsResult = results[1];

        if (!summaryResult.ok) {
          stopAnalyticsLoadingCounts();
          setAnalyticsNoteState(noteEl, 'warn', errorMessage(summaryResult.status, summaryResult.data));
        } else {
          var d = summaryResult.data || {};
          setMetric('metricPageViews', d.pageViews, 'Page views');
          setMetric('metricVisits', d.visits, 'Visits');
          setMetric('dashboardCardAnalyticsPageViews', d.pageViews, 'Page views');
          setMetric('dashboardCardAnalyticsVisits', d.visits, 'Visits');
          setMetric('metricUniqueVisitors', d.uniqueVisitors, 'Unique visitors');
          setMetric('metricMenuItemViews', d.menuItemViews, 'Menu item views');
          setMetric('metricAddToCart', d.addToCart, 'Add to cart');
          setMetric('metricOrderSubmissions', d.orderSubmissions, 'Orders submitted');
          setMetric('metricSearches', d.searches, 'Searches');
          setAnalyticsNoteState(
            noteEl,
            'ok',
            'Showing analytics for the last ' + days + ' days.'
          );
        }

        if (trendsResult.ok) {
          renderAnalyticsTrendChart((trendsResult.data && trendsResult.data.rows) || [], days);
        } else {
          renderAnalyticsTrendChart([], days);
        }
      })
      .catch(function () {
        if (requestId !== analyticsRequest) return;
        stopAnalyticsLoadingCounts();
        setAnalyticsNoteState(noteEl, 'warn', 'Could not load analytics. Try again later.');
        renderAnalyticsTrendChart([], days);
      })
      .finally(function () {
        if (requestId !== analyticsRequest) return;
        setAnalyticsTrendsLoading(false);
      });
  }

  function bindSmoothMetricGrids() {
    var reduce = global.matchMedia('(prefers-reduced-motion: reduce)');
    ['dashboardNotificationsMetrics', 'dashboardAnalyticsMetrics'].forEach(function (id) {
      var grid = document.getElementById(id);
      if (!grid || grid.getAttribute('data-smooth-size') === '1') return;
      grid.setAttribute('data-smooth-size', '1');
      var prev = new WeakMap();
      var ready = false;

      function cards() {
        return Array.prototype.filter.call(grid.children, function (el) {
          return el.classList && el.classList.contains('dashboard-analytics-card');
        });
      }

      function box(el) {
        return { w: el.offsetWidth, h: el.offsetHeight };
      }

      function remember() {
        cards().forEach(function (el) {
          prev.set(el, box(el));
        });
      }

      remember();
      global.requestAnimationFrame(function () {
        ready = true;
        remember();
      });

      var observer = new ResizeObserver(function () {
        if (!ready || reduce.matches) {
          remember();
          return;
        }
        cards().forEach(function (el) {
          if (el._ttmsSizing) return;
          var next = box(el);
          var first = prev.get(el);
          prev.set(el, next);
          if (!first || first.h < 1 || next.h < 1 || Math.abs(first.h - next.h) < 1) return;
          el._ttmsSizing = true;
          var animation = el.animate([{ height: first.h + 'px' }, { height: next.h + 'px' }], {
            duration: 320,
            easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          });
          function settle() {
            el._ttmsSizing = false;
            prev.set(el, box(el));
          }
          animation.addEventListener('finish', settle);
          animation.addEventListener('cancel', settle);
        });
      });
      cards().forEach(function (el) {
        observer.observe(el);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindSmoothMetricGrids);
  } else {
    bindSmoothMetricGrids();
  }

  global.DashboardAnalyticsSnapshot = {
    formatCount: formatCount,
    fetchSummary: fetchSummary,
    fetchTrends: fetchTrends,
    loadDashboardCard: loadDashboardCard,
    loadAnalyticsPage: loadAnalyticsPage,
    renderAnalyticsTrendChart: renderAnalyticsTrendChart,
    applyAnalyticsHeaderActions: applyAnalyticsHeaderActions,
    isPaidPlan: isPaidPlan,
  };
})(typeof window !== 'undefined' ? window : this);
