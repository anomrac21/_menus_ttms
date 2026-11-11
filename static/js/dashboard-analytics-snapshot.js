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

  function cmsApiBase() {
    var api = (global.CMS_API_URL || '').replace(/\/+$/, '');
    if (api) return api;
    var svc = (global.CMS_SERVICE_URL || 'https://cms.ttmenus.com').replace(/\/+$/, '');
    if (/\/api$/i.test(svc)) return svc;
    return svc + '/api';
  }

  function analyticsApiBase() {
    var api = String(global.ANALYTICS_API_URL || '').replace(/\/+$/, '');
    if (!api) return '';
    if (/\/api\/v1$/i.test(api)) return api;
    if (/\/api$/i.test(api)) return api + '/v1';
    return api + '/api/v1';
  }

  function insightsUrl(path, days) {
    var base = analyticsApiBase();
    if (!base || !clientId()) return '';
    return (
      base +
      '/clients/' +
      encodeURIComponent(clientId()) +
      path +
      '?days=' +
      encodeURIComponent(String(days || 30))
    );
  }

  function fetchWithAuth(url, options) {
    options = options || {};
    function doFetch() {
      var headers = Object.assign({}, authHeaders(), options.headers || {});
      return fetch(url, {
        method: options.method || 'GET',
        credentials: options.credentials || 'include',
        headers: headers,
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

  function fetchCmsSummary(days) {
    var url =
      cmsApiBase() +
      '/clients/' +
      encodeURIComponent(clientId()) +
      '/analytics/summary?days=' +
      encodeURIComponent(String(days || 30));
    return fetchWithAuth(url);
  }

  function fetchSummary(days) {
    days = days || 30;
    var primary = insightsUrl('/summary', days);
    if (!primary) return fetchCmsSummary(days);
    return fetchWithAuth(primary)
      .then(function (result) {
        if (result.ok) return result;
        return fetchCmsSummary(days);
      })
      .catch(function () {
        return fetchCmsSummary(days);
      });
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

  function fetchOverview(days) {
    var url = insightsUrl('/overview', days || 30);
    if (!url) return Promise.resolve({ ok: false, status: 0, data: {} });
    return fetchWithAuth(url).catch(function () {
      return { ok: false, status: 0, data: {} };
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
            'Analytics snapshot, last ' + periodDaysLabel(days) + ': ' +
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

  function normalizePromoKey(name) {
    return String(name || '')
      .toLowerCase()
      .replace(/&amp;/g, '&')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function cleanPromotionRows(rows) {
    if (!Array.isArray(rows)) return [];
    var merged = {};
    var order = [];
    rows.forEach(function (row) {
      var name = String((row && row.name) || '').trim();
      if (!name) return;
      if (!merged[name]) {
        merged[name] = { name: name, impressions: 0, clicks: 0 };
        order.push(name);
      }
      merged[name].impressions += Number(row.impressions) || 0;
      merged[name].clicks += Number(row.clicks) || 0;
    });
    return order.map(function (name) {
      var row = merged[name];
      row.clickRate = row.impressions > 0 ? Math.round((row.clicks / row.impressions) * 1000) / 10 : 0;
      return row;
    });
  }

  function matchPromoStats(title, statsRows) {
    var key = normalizePromoKey(title);
    if (!key) return { impressions: 0, clicks: 0, clickRate: 0 };
    var exact = null;
    var partial = null;
    (statsRows || []).forEach(function (row) {
      var rowKey = normalizePromoKey(row.name);
      if (!rowKey) return;
      if (rowKey === key) exact = row;
      else if (!partial && (rowKey.indexOf(key) !== -1 || key.indexOf(rowKey) !== -1)) partial = row;
    });
    var hit = exact || partial;
    if (!hit) return { impressions: 0, clicks: 0, clickRate: 0 };
    return {
      impressions: Number(hit.impressions) || 0,
      clicks: Number(hit.clicks) || 0,
      clickRate: hit.impressions ? Math.round((hit.clicks / hit.impressions) * 1000) / 10 : 0,
    };
  }

  function setPromoMetric(card, key, value) {
    var el = card.querySelector('[data-promo-metric="' + key + '"]');
    if (el) el.textContent = value;
  }

  /**
   * Ads card: fill per-promotion impressions / clicks from analytics summary.
   */
  function loadAdsCard(options) {
    options = options || {};
    var days = options.days || 30;
    var root = document.getElementById('dashboardAdsOverview');
    if (!root) return Promise.resolve();

    var hint = document.getElementById('dashboardAdsHint');
    var totals = document.getElementById('dashboardAdsTotals');
    var lead = document.getElementById('dashboardAdsOverviewLead');
    var cards = root.querySelectorAll('.dashboard-ads-promo-card[data-promo-title]');
    var countEl = document.getElementById('dashboardCardAdsCount');

    if (countEl && root.getAttribute('data-promo-count') != null) {
      countEl.textContent = formatCount(Number(root.getAttribute('data-promo-count')) || 0);
      countEl.classList.remove('is-loading');
      countEl.removeAttribute('aria-busy');
    }

    return fetchSummary(days)
      .then(function (x) {
        if (!x.ok) {
          if (hint) {
            hint.textContent = errorMessage(x.status, x.data);
            hint.classList.remove('hidden');
          }
          Array.prototype.forEach.call(cards, function (card) {
            setPromoMetric(card, 'impressions', '—');
            setPromoMetric(card, 'clicks', '—');
            setPromoMetric(card, 'rate', '—');
          });
          return;
        }

        var d = x.data || {};
        var statsRows = cleanPromotionRows(Array.isArray(d.promotions) ? d.promotions : []);
        var trackedImpressions = 0;
        var trackedClicks = 0;

        Array.prototype.forEach.call(cards, function (card) {
          var title = card.getAttribute('data-promo-title') || '';
          var stats = matchPromoStats(title, statsRows);
          trackedImpressions += stats.impressions;
          trackedClicks += stats.clicks;
          setPromoMetric(card, 'impressions', formatCount(stats.impressions));
          setPromoMetric(card, 'clicks', formatCount(stats.clicks));
          setPromoMetric(
            card,
            'rate',
            stats.impressions ? String(stats.clickRate) + '%' : '—'
          );
        });

        var rawImpressions = Number(d.promotionImpressions) || 0;
        var rawClicks = Number(d.promotionClicks) || 0;
        var showImpressions = cards.length ? trackedImpressions : rawImpressions;
        var showClicks = cards.length ? trackedClicks : rawClicks;
        var rate =
          showImpressions > 0 ? Math.round((showClicks / showImpressions) * 1000) / 10 : null;

        var impEl = document.getElementById('dashboardAdsTotalImpressions');
        var clickEl = document.getElementById('dashboardAdsTotalClicks');
        var rateEl = document.getElementById('dashboardAdsTotalRate');
        if (impEl) impEl.textContent = formatCount(showImpressions);
        if (clickEl) clickEl.textContent = formatCount(showClicks);
        if (rateEl) rateEl.textContent = rate != null ? String(rate) + '%' : '—';
        if (totals) totals.hidden = false;

        if (lead) {
          var n = cards.length || Number(root.getAttribute('data-promo-count')) || 0;
          lead.textContent =
            'Last ' +
            periodDaysLabel(days) +
            (n
              ? ' · ' + formatCount(n) + ' promotion' + (n === 1 ? '' : 's')
              : ' · no promotions yet');
        }

        if (hint) {
          if (!cards.length && (rawImpressions || rawClicks)) {
            hint.textContent =
              formatCount(rawImpressions) +
              ' impressions and ' +
              formatCount(rawClicks) +
              ' clicks were tracked, but no matching menu promotions are published yet.';
            hint.classList.remove('hidden');
          } else {
            hint.classList.add('hidden');
            hint.textContent = '';
          }
        }
      })
      .catch(function () {
        if (hint) {
          hint.textContent = 'Could not load promotion analytics. Try again later.';
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

  function analyticsTrendSeriesMeta() {
    return [
      { key: 'pageViews', label: 'Page views', slug: 'pageviews' },
      { key: 'visits', label: 'Visits', slug: 'visits' },
      { key: 'menuItemViews', label: 'Menu item views', slug: 'menu' },
      { key: 'addToCart', label: 'Add to cart', slug: 'cart' },
      { key: 'orderSubmissions', label: 'Orders', slug: 'orders' },
      { key: 'searches', label: 'Searches', slug: 'search' },
    ];
  }

  function getAnalyticsChartType() {
    var DTC = global.DashboardTrendsChart;
    if (DTC && typeof DTC.getType === 'function') return DTC.getType();
    try {
      var stored = localStorage.getItem('ttms_analytics_chart_type') || localStorage.getItem('ttms_dashboard_chart_type');
      if (['bars', 'lines', 'area', 'stacked'].indexOf(stored) >= 0) return stored;
    } catch (e) { /* ignore */ }
    return 'bars';
  }

  function bindAnalyticsChartTypeTabs() {
    var list = document.getElementById('dashboardAnalyticsChartTypeTabs');
    if (!list) return;
    // Prefer shared data-chart-type attrs; keep legacy data-analytics-chart working.
    list.querySelectorAll('[data-analytics-chart]').forEach(function (tab) {
      if (!tab.getAttribute('data-chart-type')) {
        tab.setAttribute('data-chart-type', tab.getAttribute('data-analytics-chart'));
      }
    });
    var DTC = global.DashboardTrendsChart;
    if (DTC && typeof DTC.bindTypeTabs === 'function') {
      DTC.bindTypeTabs(list, function () {
        if (analyticsChartRows.length) renderAnalyticsTrendChart(analyticsChartRows, analyticsChartDays);
      });
      return;
    }
    if (list.getAttribute('data-bound') === '1') return;
    list.setAttribute('data-bound', '1');
    list.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-chart-type], [data-analytics-chart]');
      if (!btn || !list.contains(btn)) return;
      var type = btn.getAttribute('data-chart-type') || btn.getAttribute('data-analytics-chart');
      if (!type) return;
      try { localStorage.setItem('ttms_dashboard_chart_type', type); } catch (e) { /* ignore */ }
      if (analyticsChartRows.length) renderAnalyticsTrendChart(analyticsChartRows, analyticsChartDays);
    });
  }

  function renderAnalyticsTrendChart(rows, days) {
    var chart = document.getElementById('dashboardAnalyticsTrendChart');
    var empty = document.getElementById('dashboardAnalyticsTrendEmpty');
    if (!chart) return;

    bindAnalyticsChartTypeTabs();
    rows = normalizeTrendRows(rows);
    analyticsChartRows = rows;
    analyticsChartDays = days || 30;
    ensureAnalyticsChartWatch(chart);

    var chartType = getAnalyticsChartType();
    var DTC = global.DashboardTrendsChart;
    var typeLabel = DTC && DTC.typeLabel ? DTC.typeLabel(chartType) : chartType;
    var aria =
      'Analytics ' +
      typeLabel +
      ' chart for the last ' +
      periodDaysLabel(days || 30) +
      ' with daily page views, visits, menu item views, add to cart, orders, and searches';

    if (DTC && typeof DTC.render === 'function') {
      DTC.applyTypeTabs(document.getElementById('dashboardAnalyticsChartTypeTabs'), chartType);
      DTC.render({
        chartEl: chart,
        emptyEl: empty,
        sectionEl: document.getElementById('dashboardAnalyticsTrendsSection'),
        rows: rows,
        series: analyticsTrendSeriesMeta(),
        type: chartType,
        classPrefix: 'dashboard-analytics-trends',
        formatDate: formatShortDate,
        escapeHtml: escapeHtml,
        ariaLabel: aria,
      });
      return;
    }

    // Fallback: bars-only if shared chart helper is unavailable.
    if (!rows.some(function (r) {
      return r.pageViews + r.visits + r.menuItemViews + r.addToCart + r.orderSubmissions + r.searches > 0;
    })) {
      chart.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    chart.setAttribute('aria-label', aria);
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
    'metricCustomerActions',
    'metricAddToCart',
    'metricOrderSubmissions',
    'metricSearches',
    'metricInsightsVisits',
    'metricInsightsUniqueVisitors',
    'metricInsightsMenuViews',
    'metricInsightsSearches',
    'metricOrdersCount',
    'metricOrdersValue',
    'metricOrdersAov',
    'metricOrdersSubmits',
    'metricOrdersCartAdds',
    'metricSalesValue',
    'metricSalesCompleted',
    'metricSalesAov',
    'metricSalesCancellation',
    'metricPosReceipts',
    'metricPosReceiptValue',
    'metricPosReceiptQueued',
    'metricPosReceiptFailed',
    'metricCustomersNew',
    'metricCustomersReturning',
    'metricCustomersOrdering',
    'metricCustomersRepeat',
    'metricReportUniqueVisitors',
    'metricReportMenuViews',
    'metricReportMenuItemViews',
    'metricReportCustomerActions',
    'metricReportEngagement',
    'metricReportCartAbandonment',
    'metricReportOrders',
    'metricReportOrderValue',
    'metricReportAov',
    'metricReportOrderClicks',
    'metricReportCartAdds',
    'metricReportCompletedValue',
    'metricReportCompletedOrders',
    'metricReportCompletedAov',
    'metricReportOrderingCustomers',
    'metricReportRepeatCustomers',
    'metricReportCancellation',
  ];

  function parseDisplayedMetricCount(el) {
    if (!el) return 0;
    var raw = String(el.textContent || '').replace(/[^\d.-]/g, '');
    var n = parseInt(raw, 10);
    return isFinite(n) ? n : 0;
  }

  function metricCountDuration(fromValue, toValue) {
    var delta = Math.abs(Number(toValue) - Number(fromValue)) || 0;
    if (delta <= 1) return 420;
    if (delta < 20) return 700;
    if (delta < 100) return 980;
    if (delta < 500) return 1200;
    return 1450;
  }

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

  function animateAnalyticsMetric(id, target, name, options) {
    options = options || {};
    var el = document.getElementById(id);
    if (!el) return;
    stopAnalyticsMetricAnimation(id);
    if (target == null || target === '' || isNaN(Number(target))) {
      el.textContent = '';
      el.setAttribute('aria-label', (name || id) + ', data not available');
      return;
    }
    var format =
      typeof options.format === 'function'
        ? options.format
        : function (n) {
            return formatCount(n);
          };
    var precise = !!options.format;
    var endValue = precise ? Number(target) : Math.floor(Number(target));
    var label = name || el.getAttribute('data-metric-label') || id;
    el.setAttribute('aria-label', label + ': ' + format(endValue));
    if (global.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.textContent = format(endValue);
      el.classList.remove('dashboard-analytics-card-value--counting', 'is-count-pop');
      return;
    }
    var startValue = options.from != null && isFinite(Number(options.from))
      ? Number(options.from)
      : parseDisplayedMetricCount(el);
    if (!precise) startValue = Math.floor(startValue);
    if (options.fromZero) startValue = 0;
    var duration = options.duration || metricCountDuration(startValue, endValue);
    var delay = Math.max(0, Number(options.delay) || 0);
    var requestAtStart = analyticsRequest;
    var state = { started: 0, delayed: true };
    analyticsMetricAnimations[id] = state;
    el.classList.add('dashboard-analytics-card-value--counting');
    el.classList.remove('is-count-pop');

    function tick(now) {
      if (analyticsMetricAnimations[id] !== state || requestAtStart !== analyticsRequest) {
        if (analyticsMetricAnimations[id] === state) stopAnalyticsMetricAnimation(id);
        return;
      }
      if (!state.started) {
        if (now - state.readyAt < delay) {
          state.rafId = requestAnimationFrame(tick);
          return;
        }
        state.started = now;
      }
      var progress = Math.min(1, (now - state.started) / duration);
      var eased = 1 - Math.pow(1 - progress, 3);
      var mixed = startValue + (endValue - startValue) * eased;
      var current = precise ? mixed : Math.round(mixed);
      el.textContent = format(current);
      if (progress < 1) {
        state.rafId = requestAnimationFrame(tick);
        return;
      }
      el.textContent = format(endValue);
      el.classList.remove('dashboard-analytics-card-value--counting');
      el.classList.remove('is-count-pop');
      void el.offsetWidth;
      el.classList.add('is-count-pop');
      delete analyticsMetricAnimations[id];
    }
    state.readyAt = performance.now();
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

  function periodDaysLabel(days) {
    var n = Number(days) || 0;
    return n === 1 ? '1 day' : n + ' days';
  }

  function selectedAnalyticsDays() {
    var active = document.querySelector('#dashboardAnalyticsPeriodTabs [data-analytics-days][aria-selected="true"]');
    var days = active ? parseInt(active.getAttribute('data-analytics-days'), 10) : 30;
    return days > 0 ? days : 30;
  }

  function applyAnalyticsPeriod(days) {
    var heading = document.getElementById('analytics-last-month-heading');
    if (heading) heading.textContent = 'Last ' + periodDaysLabel(days);
    var count = document.getElementById('dashboardCardAnalyticsCount');
    if (count) count.setAttribute('aria-label', 'Visits last ' + periodDaysLabel(days));
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

  function renderDelta(id, pct, current) {
    var el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('is-up', 'is-down');
    if (pct == null) {
      if (current > 0) {
        el.hidden = false;
        el.textContent = 'New';
        return;
      }
      el.hidden = true;
      el.textContent = '';
      return;
    }
    var n = Number(pct);
    if (!isFinite(n)) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    var rounded = Math.round(n * 10) / 10;
    el.textContent = (rounded > 0 ? '+' : '') + rounded + '% vs previous';
    if (rounded > 0) el.classList.add('is-up');
    if (rounded < 0) el.classList.add('is-down');
  }

  function renderRankList(id, rows, emptyText) {
    var el = document.getElementById(id);
    if (!el) return;
    rows = rows || [];
    if (!rows.length) {
      el.innerHTML = '<li>' + escapeHtml(emptyText) + '</li>';
      return;
    }
    el.innerHTML = rows
      .map(function (row) {
        return '<li>' + escapeHtml(row.name || row.term || '') + ' <span>' + escapeHtml(formatCount(row.count)) + '</span></li>';
      })
      .join('');
  }

  function renderInsights(data) {
    var panel = document.getElementById('dashboardAnalyticsInsights');
    if (!panel) return;
    panel.hidden = false;
    renderRankList('dashboardAnalyticsDishes', data.dishes, 'No dish views in this period.');
    renderRankList('dashboardAnalyticsSearches', Array.isArray(data.searchTerms) ? data.searchTerms : (Array.isArray(data.searches) ? data.searches : []), 'No searches in this period.');
    var contacts = document.getElementById('dashboardAnalyticsContacts');
    if (contacts) {
      contacts.innerHTML =
        '<li>WhatsApp ' + escapeHtml(formatCount(data.whatsappClicks || 0)) + '</li>' +
        '<li>Phone ' + escapeHtml(formatCount(data.phoneClicks || 0)) + '</li>' +
        '<li>Directions ' + escapeHtml(formatCount(data.directionClicks || 0)) + '</li>';
    }
    var action = data.action || {};
    var box = document.getElementById('dashboardAnalyticsAction');
    var title = document.getElementById('dashboardAnalyticsActionTitle');
    var detail = document.getElementById('dashboardAnalyticsActionDetail');
    if (box && title && detail && action.title) {
      box.hidden = false;
      title.textContent = action.title;
      detail.textContent = action.detail || '';
    }
  }

  function renderDeltas(changePct, data) {
    changePct = changePct || {};
    data = data || {};
    renderDelta('deltaPageViews', changePct.pageViews, data.pageViews);
    renderDelta('deltaVisits', changePct.visits, data.visits);
    renderDelta('deltaUniqueVisitors', changePct.uniqueVisitors, data.uniqueVisitors);
    renderDelta('deltaMenuItemViews', changePct.menuItemViews, data.menuItemViews);
    renderDelta('deltaAddToCart', changePct.addToCart, data.addToCart);
    renderDelta('deltaOrderSubmissions', changePct.orderSubmissions, data.orderSubmissions);
    renderDelta('deltaSearches', changePct.searches, typeof data.searches === 'number' ? data.searches : 0);
  }

  function clearInsights() {
    var panel = document.getElementById('dashboardAnalyticsInsights');
    if (panel) panel.hidden = true;
    ['deltaPageViews', 'deltaVisits', 'deltaUniqueVisitors', 'deltaMenuItemViews', 'deltaAddToCart', 'deltaOrderSubmissions', 'deltaSearches'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.hidden = true;
      el.textContent = '';
    });
  }

  function fillSummaryMetrics(d, days, setMetric, noteEl) {
    setMetric('metricPageViews', d.pageViews, 'Page views');
    setMetric('metricVisits', d.visits, 'Visits');
    setMetric('dashboardCardAnalyticsPageViews', d.pageViews, 'Page views');
    setMetric('dashboardCardAnalyticsVisits', d.visits, 'Visits');
    setMetric('metricUniqueVisitors', d.uniqueVisitors, 'Unique visitors');
    setMetric('metricMenuItemViews', d.menuItemViews, 'Menu item views');
    setMetric('metricAddToCart', d.addToCart, 'Add to cart');
    setMetric('metricOrderSubmissions', d.orderSubmissions, 'Orders submitted');
    setMetric('metricSearches', typeof d.searches === 'number' ? d.searches : null, 'Searches');
    setAnalyticsNoteState(noteEl, 'ok', 'Showing analytics for the last ' + periodDaysLabel(days) + '. Order submissions are menu clicks, not confirmed sales.');
  }

  function applyAnalyticsOverview(data, days, setMetric, noteEl) {
    fillSummaryMetrics(data, days, setMetric, noteEl);
    renderAnalyticsTrendChart(data.rows || [], days);
    if (data.changePct) renderDeltas(data.changePct, data);
    else clearInsights();
    renderInsights(data);
    if (global.InsightsPlatform) {
      InsightsPlatform.render(data);
      InsightsPlatform.loadOrders(days);
    }
  }

  function applyLegacyAnalytics(summaryResult, trendsResult, days, setMetric, noteEl) {
    clearInsights();
    if (!summaryResult.ok) {
      stopAnalyticsLoadingCounts();
      setAnalyticsNoteState(noteEl, 'warn', errorMessage(summaryResult.status, summaryResult.data));
    } else {
      fillSummaryMetrics(summaryResult.data || {}, days, setMetric, noteEl);
    }
    if (trendsResult.ok) {
      renderAnalyticsTrendChart((trendsResult.data && trendsResult.data.rows) || [], days);
    } else {
      renderAnalyticsTrendChart([], days);
    }
    if (global.InsightsPlatform && document.getElementById('insightsShell')) {
      var data = summaryResult.ok ? Object.assign({}, summaryResult.data || {}) : {};
      data.rows = (trendsResult.ok && trendsResult.data && trendsResult.data.rows) || data.rows || [];
      InsightsPlatform.render(data);
      if (summaryResult.ok) InsightsPlatform.loadOrders(days);
    }
  }

  function loadAnalyticsPage(options) {
    options = options || {};
    bindAnalyticsPeriodTabs();
    bindAnalyticsChartTypeTabs();
    var days = options.days || selectedAnalyticsDays();
    applyAnalyticsPeriod(days);
    var requestId = ++analyticsRequest;
    var noteEl = document.getElementById('dashboardAnalyticsNote');

    var overviewMetricOrder = {
      metricUniqueVisitors: 0,
      metricPageViews: 1,
      metricMenuItemViews: 2,
      metricCustomerActions: 3,
      metricVisits: 1,
      metricAddToCart: 4,
      metricOrderSubmissions: 5,
      metricSearches: 6
    };

    function setMetric(id, value, name) {
      var el = document.getElementById(id);
      if (!el) return;
      if (id.indexOf('metric') === 0) {
        animateAnalyticsMetric(id, value, name, {
          fromZero: true,
          delay: (overviewMetricOrder[id] != null ? overviewMetricOrder[id] : 0) * 70
        });
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

    if (global.InsightsPlatform && typeof InsightsPlatform.mount === 'function') InsightsPlatform.mount();
    setAnalyticsNoteState(noteEl, 'loading', 'Loading analytics…');
    setAnalyticsTrendsLoading(true);
    ANALYTICS_METRIC_IDS.forEach(startAnalyticsLoadingCount);

    return fetchOverview(days)
      .then(function (overview) {
        if (requestId !== analyticsRequest) return;
        if (overview && overview.ok) {
          applyAnalyticsOverview(overview.data || {}, days, setMetric, noteEl);
          return;
        }
        return Promise.all([fetchSummary(days), fetchTrends(days)]).then(function (results) {
          if (requestId !== analyticsRequest) return;
          applyLegacyAnalytics(results[0], results[1], days, setMetric, noteEl);
        });
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
    authHeaders: authHeaders,
    ensureAccessTokenForCms: ensureAccessTokenForCms,
    fetchSummary: fetchSummary,
    fetchTrends: fetchTrends,
    fetchWithAuth: fetchWithAuth,
    loadDashboardCard: loadDashboardCard,
    loadAdsCard: loadAdsCard,
    loadAnalyticsPage: loadAnalyticsPage,
    renderAnalyticsTrendChart: renderAnalyticsTrendChart,
    animateMetric: animateAnalyticsMetric,
  };
})(typeof window !== 'undefined' ? window : this);
