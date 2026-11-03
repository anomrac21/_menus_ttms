/**
 * TTMenus Insights sections. Numbers come from the analytics overview.
 * Verified order value comes from the order service. Menu order clicks stay labeled as clicks.
 */
(function (global) {
  'use strict';

  var sections = [
    { id: 'overview', label: 'Overview', always: true },
    { id: 'visitors', label: 'Visitors', always: true },
    { id: 'menu', label: 'Menu Analytics', always: true },
    { id: 'behaviour', label: 'Customer Behaviour', always: true },
    { id: 'promotions', label: 'Promotions', key: 'promotions' },
    { id: 'orders', label: 'Orders', key: 'orders' },
    { id: 'sales', label: 'Sales', key: 'sales' },
    { id: 'customers', label: 'Customers', key: 'customers' },
    { id: 'pos', label: 'POS Integration', key: 'pos' },
    { id: 'reports', label: 'Reports', always: true },
    { id: 'recommendations', label: 'Recommendations', always: true }
  ];

  function shell() {
    return document.getElementById('insightsShell');
  }

  function flag(name) {
    var el = shell();
    return el && el.getAttribute(name) === 'true';
  }

  function money(n, currency) {
    var value = Number(n) || 0;
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'TTD' }).format(value);
    } catch (e) {
      return (currency || 'TTD') + ' ' + value.toFixed(2);
    }
  }

  function count(n) {
    if (global.DashboardAnalyticsSnapshot && DashboardAnalyticsSnapshot.formatCount) {
      return DashboardAnalyticsSnapshot.formatCount(n);
    }
    return String(n || 0);
  }

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function table(rows, columns) {
    if (!rows || !rows.length) return '<p class="dashboard-analytics-subtitle">Nothing recorded in this period.</p>';
    var html = '<table class="insights-table"><thead><tr>';
    columns.forEach(function (col) {
      html += '<th>' + escapeHtml(col.label) + '</th>';
    });
    html += '</tr></thead><tbody>';
    rows.forEach(function (row) {
      html += '<tr>';
      columns.forEach(function (col) {
        html += '<td>' + col.cell(row) + '</td>';
      });
      html += '</tr>';
    });
    return html + '</tbody></table>';
  }

  function actions(data) {
    data = data || {};
    return (Number(data.whatsappClicks) || 0) + (Number(data.phoneClicks) || 0) + (Number(data.directionClicks) || 0) + (Number(data.addToCart) || 0) + (Number(data.orderSubmissions) || 0);
  }

  function score(data) {
    if (data.engagementScore) return Number(data.engagementScore);
    var s = 0;
    if (data.visits > 0) s += 20;
    if (data.uniqueVisitors > 0) s += 10;
    if (data.pageViews > 0) s += 10;
    if (data.menuItemViews > 0) s += 20;
    if (actions(data) > 0) s += 20;
    if (data.dishes && data.dishes.length) s += 10;
    if (data.returningVisits > 0) s += 10;
    return s;
  }

  function showNav(visible) {
    var nav = document.getElementById('insightsNav');
    var root = shell();
    if (root) root._insightsVisible = Object.assign(root._insightsVisible || {}, visible);
    visible = (root && root._insightsVisible) || visible || {};
    if (!nav || nav.getAttribute('data-built') === '1') {
      sections.forEach(function (section) {
        var btn = nav && nav.querySelector('[data-insights-tab="' + section.id + '"]');
        if (!btn || section.always) return;
        btn.hidden = !visible[section.key];
      });
      settleNav();
      return;
    }
    nav.setAttribute('data-built', '1');
    nav.innerHTML = sections.map(function (section) {
      var hidden = section.always || visible[section.key] ? '' : ' hidden';
      return '<button type="button" class="dashboard-orders-hub-tab" data-insights-tab="' + section.id + '"' + hidden + '>' + escapeHtml(section.label) + '</button>';
    }).join('');
    nav.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-insights-tab]');
      if (!btn || btn.hidden) return;
      openPanel(btn.getAttribute('data-insights-tab'));
    });
    openPanel('overview');
    settleNav();
  }

  function settleNav() {
    var active = document.querySelector('#insightsNav [data-insights-tab].is-active');
    if (active && active.hidden) openPanel('overview');
  }

  function openPanel(id) {
    document.querySelectorAll('[data-insights-panel]').forEach(function (panel) {
      var on = panel.getAttribute('data-insights-panel') === id;
      panel.hidden = !on;
      panel.classList.toggle('is-active', on);
    });
    document.querySelectorAll('#insightsNav [data-insights-tab]').forEach(function (btn) {
      var on = btn.getAttribute('data-insights-tab') === id;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (id === 'visitors') renderTrinidadMap();
  }

  function setText(id, html) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }

  function journey(data) {
    var steps = [
      ['Restaurant discovered', data.uniqueVisitors, 'Unique visitors'],
      ['Menu opened', data.pageViews, 'Page views on the menu'],
      ['Menu items viewed', data.menuItemViews, 'Item view events'],
      ['Ordering actions', (Number(data.addToCart) || 0) + (Number(data.orderSubmissions) || 0), 'Cart adds and order clicks, not confirmed sales']
    ];
    setText('insightsJourney', steps.map(function (step) {
      return '<li><span>' + escapeHtml(step[0]) + '</span><strong>' + escapeHtml(count(step[1])) + '</strong><small>' + escapeHtml(step[2]) + '</small></li>';
    }).join(''));
  }

  function searchTerms(data) {
    if (Array.isArray(data.searchTerms)) return data.searchTerms;
    if (Array.isArray(data.searches)) return data.searches;
    return null;
  }

  function searchCount(data) {
    if (typeof data.searches === 'number') return data.searches;
    var rows = searchTerms(data) || [];
    return rows.reduce(function (sum, row) { return sum + (Number(row.count) || 0); }, 0);
  }

  function dishTable(rows) {
    if (!rows) return '<p class="dashboard-analytics-subtitle">Dish rankings are not in this response.</p>';
    return table(rows, [
      { label: 'Menu item', cell: function (row) { return escapeHtml(row.name); } },
      { label: 'Views', cell: function (row) { return escapeHtml(count(row.count)); } }
    ]);
  }

  function namedTable(rows, label) {
    if (!rows) return '<p class="dashboard-analytics-subtitle">Not available for this period yet.</p>';
    return table(rows, [
      { label: label, cell: function (row) { return escapeHtml(row.name); } },
      { label: 'Visits', cell: function (row) { return escapeHtml(count(row.count)); } }
    ]);
  }

  function peakDays(rows) {
    var buckets = {};
    (rows || []).forEach(function (row) {
      if (!row.date) return;
      var day = new Date(row.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long' });
      buckets[day] = (buckets[day] || 0) + (Number(row.menuItemViews) || 0);
    });
    var list = Object.keys(buckets).map(function (name) { return { name: name, count: buckets[name] }; });
    list.sort(function (a, b) { return b.count - a.count; });
    return list.filter(function (row) { return row.count > 0; });
  }

  function render(data) {
    if (!shell()) return;
    data = data || {};
    shell()._insightsData = data;
    var ordering = flag('data-ordering');
    var loyverse = flag('data-loyverse');
    var promotions = hasPromotions(data);
    showNav({
      promotions: promotions,
      orders: ordering,
      sales: false,
      customers: (Number(data.returningVisits) || 0) > 0,
      pos: loyverse
    });

    var actionEl = document.getElementById('metricCustomerActions');
    if (actionEl) actionEl.textContent = count(actions(data));
    renderActionDelta(data);

    journey(data);
    setText('insightsTopDishes', dishTable(data.dishes));
    setText('insightsMenuDishes', dishTable(data.dishes));
    setText('insightsScore', '<h3 class="dashboard-notify-subsection-title">Engagement score</h3><p class="insights-score-value">' + score(data) + '<span>/100</span></p><p class="dashboard-analytics-subtitle">Based on visits, menu views, dish interest, and customer actions in this period.</p>');

    var visitorBits = [
      ['Visits', data.visits],
      ['Unique visitors', data.uniqueVisitors],
      ['Menu views', data.pageViews],
      ['Searches on the menu', searchCount(data)]
    ];
    setText('insightsVisitorMetrics', visitorBits.map(function (bit) {
      return '<div class="dashboard-analytics-card dashboard-analytics-metric-card"><span class="dashboard-analytics-card-label">' + escapeHtml(bit[0]) + '</span><span class="dashboard-analytics-card-value">' + escapeHtml(count(bit[1])) + '</span></div>';
    }).join(''));
    setText('insightsSources', namedTable(data.sources, 'Source'));
    setText('insightsCampaigns', campaignHtml(data.campaigns));
    setText('insightsDevices', namedTable(data.devices, 'Device'));
    setText('insightsCountries', namedTable(focusCountries(data.countries), 'Country'));
    setText('insightsRegions', namedTable(data.regions, 'Region'));
    setText('dashboardAnalyticsContacts',
      '<li>Phone ' + escapeHtml(count(data.phoneClicks)) + '</li>' +
      '<li>WhatsApp ' + escapeHtml(count(data.whatsappClicks)) + '</li>' +
      '<li>Directions ' + escapeHtml(count(data.directionClicks)) + '</li>');
    var terms = searchTerms(data);
    setText('dashboardAnalyticsSearches', terms && terms.length
      ? terms.map(function (row) { return '<li>' + escapeHtml(row.name) + ' <span>' + escapeHtml(count(row.count)) + '</span></li>'; }).join('')
      : '<li>' + (terms ? 'No searches in this period.' : 'Search terms are not in this response.') + '</li>');
    setText('insightsObservedFunnel', funnelHtml(data.observedFunnel));
    setText('insightsOrdersFunnel', funnelHtml(data.observedFunnel));
    setText('insightsCartAbandonment', cartAbandonmentHtml(data.observedFunnel));
    setText('insightsPeakDays', namedTable(peakDays(data.rows).slice(0, 7), 'Day'));
    setText('insightsHours', namedTable((data.hours || []).slice(0, 6).map(function (row) {
      var hour = String(row.name);
      return { name: hour + ':00', count: row.count };
    }), 'Hour'));
    var returning = Number(data.returningVisits) || 0;
    var fresh = Number(data.newVisits) || 0;
    setText('insightsReturning', returning || fresh
      ? count(fresh) + ' new visits and ' + count(returning) + ' returning visits.'
      : 'Returning and new visits appear when Matomo reports them for this period.');
    setText('insightsLocations', namedTable(data.locations, 'Location'));
    if (Number(data.returningVisits) > 0) {
      setText('insightsCustomers', '<p>' + count(data.returningVisits) + ' returning visits in this period. Repeat purchases are listed when TTMenus orders are available.</p>');
    }
    setText('insightsPromotions', promotionsHtml(data));
    setText('insightsPos', loyverse
      ? '<p>Loyverse is connected for receipt push. In-store sales are not imported into Insights, so this section does not show a sales report.</p>'
      : '');
    if (ordering) {
      setText('insightsOrders', '<p class="dashboard-analytics-subtitle">Loading TTMenus orders…</p>');
    }
    var rec = data.action || {};
    setText('insightsRecommendations', rec.title
      ? '<h3 class="dashboard-notify-subsection-title">' + escapeHtml(rec.title) + '</h3><p>' + escapeHtml(rec.detail || '') + '</p>'
      : '<p class="dashboard-analytics-subtitle">A suggestion appears when this period has menu activity.</p>');
    setText('insightsReports', reportHtml(data, null));
    renderTrinidadMap();
  }

  function renderActionDelta(data) {
    var el = document.getElementById('deltaCustomerActions');
    if (!el) return;
    el.classList.remove('is-up', 'is-down');
    if (!data.changePct) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    var current = actions(data);
    var before = actions(data.previous || {});
    if (before <= 0) {
      el.hidden = current <= 0;
      el.textContent = current > 0 ? 'New' : '';
      return;
    }
    var rounded = Math.round(((current - before) / before) * 1000) / 10;
    el.hidden = false;
    el.textContent = (rounded > 0 ? '+' : '') + rounded + '% vs previous';
    if (rounded > 0) el.classList.add('is-up');
    if (rounded < 0) el.classList.add('is-down');
  }

  function hasPromotions(data) {
    if ((Number(data.promotionImpressions) || 0) + (Number(data.promotionClicks) || 0) > 0) return true;
    return Array.isArray(data.promotions) && data.promotions.length > 0;
  }

  function campaignHtml(rows) {
    if (!rows) {
      return '<p class="dashboard-analytics-subtitle">Campaign visits appear when guests arrive with UTM or Matomo campaign links.</p>';
    }
    if (!rows.length) {
      return '<p class="dashboard-analytics-subtitle">No campaign traffic in this period. Use utm_campaign or mtm_campaign on shared links.</p>';
    }
    return namedTable(rows, 'Campaign');
  }

  function funnelHtml(funnel) {
    if (!funnel || !Array.isArray(funnel.steps) || !funnel.steps.length) {
      return '<p class="dashboard-analytics-subtitle">Funnel steps appear when the menu records item views, cart adds, and order clicks.</p>';
    }
    return '<ol class="insights-journey">' + funnel.steps.map(function (step) {
      var rate = step.fromPreviousPct != null ? ' · ' + step.fromPreviousPct + '% of previous' : '';
      return '<li><span>' + escapeHtml(step.name) + '</span><strong>' + escapeHtml(count(step.count)) + '</strong><small>' + escapeHtml(rate.replace(/^ · /, '') || 'Observed event') + '</small></li>';
    }).join('') + '</ol>';
  }

  function cartAbandonmentHtml(funnel) {
    if (!funnel || !funnel.cartAdds) {
      return 'Cart abandonment needs cart-add events in this period. It compares cart adds with order-submit clicks, not confirmed sales.';
    }
    var rate = funnel.cartAbandonmentRate != null ? funnel.cartAbandonmentRate + '%' : 'n/a';
    return count(funnel.cartAbandons) + ' cart adds did not reach an order-submit click (' + rate + '). This is observed menu behaviour, not a verified abandoned checkout.';
  }

  function promotionsHtml(data) {
    var rows = Array.isArray(data.promotions) ? data.promotions : [];
    if (!rows.length && !hasPromotions(data)) return '';
    var html = '<p>' + count(data.promotionImpressions) + ' promotion impressions and ' + count(data.promotionClicks) + ' promotion clicks on this menu.</p>';
    if (rows.length) {
      html += table(rows, [
        { label: 'Promotion', cell: function (row) { return escapeHtml(row.name); } },
        { label: 'Impressions', cell: function (row) { return escapeHtml(count(row.impressions)); } },
        { label: 'Clicks', cell: function (row) { return escapeHtml(count(row.clicks)); } },
        { label: 'Click rate', cell: function (row) { return row.impressions ? escapeHtml(String(row.clickRate || 0) + '%') : '—'; } }
      ]);
    }
    return html;
  }

  function reportHtml(data, orders) {
    var days = data.periodDays || 30;
    var html = '<p>The ' + escapeHtml(String(days)) + '-day period above is the report. Switch it to 7, 30, or 90 days. A downloadable report is not available.</p>';
    html += '<ul class="dashboard-analytics-rank">';
    html += '<li>Unique visitors <span>' + escapeHtml(count(data.uniqueVisitors)) + '</span></li>';
    html += '<li>Menu views <span>' + escapeHtml(count(data.pageViews)) + '</span></li>';
    html += '<li>Menu item views <span>' + escapeHtml(count(data.menuItemViews)) + '</span></li>';
    html += '<li>Customer actions <span>' + escapeHtml(count(actions(data))) + '</span></li>';
    if (data.observedFunnel && data.observedFunnel.cartAbandonmentRate != null) {
      html += '<li>Observed cart abandonment <span>' + escapeHtml(String(data.observedFunnel.cartAbandonmentRate) + '%') + '</span></li>';
    }
    if (orders && orders.orderCount > 0) {
      html += '<li>TTMenus order value <span>' + escapeHtml(money(orders.totalValue, orders.currency)) + '</span></li>';
      if (orders.completionRate != null) {
        html += '<li>Order completion rate <span>' + escapeHtml(String(orders.completionRate) + '%') + '</span></li>';
      }
    }
    return html + '</ul>';
  }

  function applyOrderStats(stats) {
    if (!stats) return;
    var hasSales = Number(stats.orderCount) > 0;
    showNav({
      orders: true,
      sales: Number(stats.totalValue) > 0 || (Array.isArray(stats.popularItems) && stats.popularItems.length > 0),
      customers: hasSales || (shell() && shell()._insightsVisible && shell()._insightsVisible.customers),
      pos: flag('data-loyverse')
    });
    var completion = stats.completionRate != null ? stats.completionRate + '%' : '—';
    var cancel = stats.cancellationRate != null ? stats.cancellationRate + '%' : '—';
    setText('insightsOrders',
      '<div class="dashboard-analytics-metrics">' +
      '<div class="dashboard-analytics-card dashboard-analytics-metric-card"><span class="dashboard-analytics-card-label">TTMenus orders</span><span class="dashboard-analytics-card-value">' + escapeHtml(count(stats.orderCount)) + '</span></div>' +
      '<div class="dashboard-analytics-card dashboard-analytics-metric-card"><span class="dashboard-analytics-card-label">Order value</span><span class="dashboard-analytics-card-value">' + escapeHtml(money(stats.totalValue, stats.currency)) + '</span></div>' +
      '<div class="dashboard-analytics-card dashboard-analytics-metric-card"><span class="dashboard-analytics-card-label">Average order value</span><span class="dashboard-analytics-card-value">' + escapeHtml(money(stats.averageOrderValue, stats.currency)) + '</span></div>' +
      '<div class="dashboard-analytics-card dashboard-analytics-metric-card"><span class="dashboard-analytics-card-label">Completion rate</span><span class="dashboard-analytics-card-value">' + escapeHtml(completion) + '</span></div>' +
      '<div class="dashboard-analytics-card dashboard-analytics-metric-card"><span class="dashboard-analytics-card-label">Cancellation rate</span><span class="dashboard-analytics-card-value">' + escapeHtml(cancel) + '</span></div>' +
      '</div>' +
      '<p class="dashboard-analytics-subtitle">Verified TTMenus orders. Completion counts ready and paid tickets. Menu order-click counts stay separate.</p>' +
      namedTable(stats.byStatus || [], 'Status'));
    setText('insightsSales', hasSales
      ? '<p>Verified TTMenus order value for this period is ' + escapeHtml(money(stats.totalValue, stats.currency)) + ' across ' + escapeHtml(count(stats.orderCount)) + ' orders.</p>' + table(stats.popularItems || [], [
        { label: 'Menu item', cell: function (row) { return escapeHtml(row.name); } },
        { label: 'Quantity', cell: function (row) { return escapeHtml(count(row.count)); } }
      ])
      : '');
    if (hasSales) {
      setText('insightsCustomers',
        '<p>' + count(stats.customerCount) + ' customers placed a TTMenus order. ' + count(stats.repeatCustomers) + ' ordered more than once in this period.</p>');
    }
    if (shell() && shell()._insightsData) {
      setText('insightsReports', reportHtml(shell()._insightsData, stats));
    }
  }

  function loadOrders(days) {
    if (!flag('data-ordering')) return Promise.resolve();
    var cfg = global.ORDER_CONFIG || {};
    var base = String(cfg.apiUrl || '').replace(/\/$/, '');
    if (!base || !global.DashboardAnalyticsSnapshot) {
      setText('insightsOrders', '<p class="dashboard-analytics-subtitle">Ordering is enabled, but the order service address is not configured. Menu order clicks are not sales.</p>');
      return Promise.resolve();
    }
    var period = days || 30;
    var request = global.DashboardAnalyticsSnapshot.fetchWithAuth
      ? DashboardAnalyticsSnapshot.fetchWithAuth(base + '/client/orders/stats?days=' + encodeURIComponent(String(period)))
      : Promise.resolve({ ok: false });
    return request.then(function (result) {
      if (!result || !result.ok) {
        setText('insightsOrders', '<p class="dashboard-analytics-subtitle">TTMenus orders could not be loaded. Menu order clicks stay under customer actions and are not sales.</p>');
        return;
      }
      applyOrderStats(result.data || {});
    }).catch(function () {
      setText('insightsOrders', '<p class="dashboard-analytics-subtitle">TTMenus orders could not be loaded. Menu order clicks stay under customer actions and are not sales.</p>');
    });
  }

  var trinidadMap = null;
  var mapLibrePromise = null;
  var ttCentroids = {
    'arima': [10.6374, -61.2823],
    'chaguanas': [10.5168, -61.4114],
    'couva-tabaquite-talparo': [10.4236, -61.3735],
    'diego martin': [10.7204, -61.5662],
    'eastern tobago': [11.278, -60.545],
    'penal-debe': [10.208, -61.443],
    'point fortin': [10.174, -61.684],
    'port of spain': [10.66, -61.5086],
    'princes town': [10.2718, -61.371],
    'rio claro-mayaro': [10.298, -61.033],
    'mayaro-rio claro': [10.298, -61.033],
    'mayaro': [10.298, -61.033],
    'san fernando': [10.28, -61.468],
    'san juan-laventille': [10.649, -61.45],
    'sangre grande': [10.587, -61.13],
    'siparia': [10.145, -61.507],
    'tunapuna-piarco': [10.633, -61.383],
    'western tobago': [11.215, -60.735],
    'tobago': [11.25, -60.7],
    'scarborough': [11.182, -60.735]
  };

  function focusCountries(rows) {
    if (!Array.isArray(rows)) return null;
    var trinidad = 0;
    var other = 0;
    rows.forEach(function (row) {
      var name = String((row && row.name) || '');
      var n = Number(row && row.count) || 0;
      var key = name.toLowerCase().replace(/&/g, 'and');
      if (key === 'tt' || key === 'tto' || key.indexOf('trinidad') !== -1) trinidad += n;
      else other += n;
    });
    var out = [];
    if (trinidad) out.push({ name: 'Trinidad and Tobago', count: trinidad });
    if (other) out.push({ name: 'Other', count: other });
    return out;
  }

  function centroidFor(name) {
    var key = String(name || '').toLowerCase().replace(/&/g, 'and').replace(/\s+/g, ' ').trim();
    return ttCentroids[key] || null;
  }

  function trinidadHeatPoints(data) {
    data = data || {};
    var places = Array.isArray(data.trinidadPlaces) ? data.trinidadPlaces : [];
    var plotted = places.filter(function (place) {
      return place && Number(place.lat) && Number(place.lng);
    });
    if (plotted.length) return plotted;
    return (data.regions || []).map(function (row) {
      var spot = centroidFor(row.name);
      return spot ? { name: row.name, count: row.count, lat: spot[0], lng: spot[1] } : null;
    }).filter(Boolean);
  }

  function loadMapLibre() {
    if (global.maplibregl) return Promise.resolve();
    if (mapLibrePromise) return mapLibrePromise;
    mapLibrePromise = new Promise(function (resolve, reject) {
      var css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.min.css';
      css.crossOrigin = 'anonymous';
      document.head.appendChild(css);
      var script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.min.js';
      script.crossOrigin = 'anonymous';
      script.onload = function () { resolve(); };
      script.onerror = function () { reject(new Error('map')); };
      document.head.appendChild(script);
    });
    return mapLibrePromise;
  }

  function renderTrinidadMap() {
    var el = document.getElementById('insightsTrinidadMap');
    var empty = document.getElementById('insightsTrinidadMapEmpty');
    var panel = document.querySelector('[data-insights-panel="visitors"]');
    if (!el || !panel || panel.hidden) return;
    var points = trinidadHeatPoints(shell() && shell()._insightsData);
    if (!points.length) {
      el.classList.add('is-empty');
      if (empty) {
        empty.hidden = false;
        empty.textContent = 'No Trinidad and Tobago visits were located in this period.';
      }
      return;
    }
    el.classList.remove('is-empty');
    if (empty) empty.hidden = true;
    loadMapLibre().then(function () {
      if (panel.hidden || !global.maplibregl) return;
      drawTrinidadMap(el, points);
    }).catch(function () {
      el.classList.add('is-empty');
      if (empty) {
        empty.hidden = false;
        empty.textContent = 'The Trinidad and Tobago map could not be loaded. Region counts are listed beside it.';
      }
    });
  }

  function drawTrinidadMap(el, points) {
    var max = points.reduce(function (top, point) {
      return Math.max(top, Number(point.count) || 0);
    }, 1);
    var geo = {
      type: 'FeatureCollection',
      features: points.map(function (point) {
        var count = Number(point.count) || 0;
        return {
          type: 'Feature',
          properties: { name: point.name, count: count, weight: count / max },
          geometry: { type: 'Point', coordinates: [Number(point.lng), Number(point.lat)] }
        };
      })
    };
    if (trinidadMap) {
      trinidadMap._ttGeo = geo;
      try {
        var src = trinidadMap.getSource('tt-visits');
        if (src) src.setData(geo);
      } catch (e) {}
      try { trinidadMap.resize(); } catch (e) {}
      return;
    }
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    trinidadMap = new maplibregl.Map({
      container: el,
      style: dark ? '/src/map/styles/ttmenus-dark.json' : '/src/map/styles/ttmenus-day.json',
      center: [-61.25, 10.7],
      zoom: 7.15,
      maxBounds: [[-63.0, 9.2], [-59.5, 12.2]],
      attributionControl: true
    });
    trinidadMap._ttGeo = geo;
    trinidadMap.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
    trinidadMap.on('load', function () {
      var data = trinidadMap._ttGeo || geo;
      trinidadMap.addSource('tt-visits', { type: 'geojson', data: data });
      trinidadMap.addLayer({
        id: 'tt-visits-heat',
        type: 'heatmap',
        source: 'tt-visits',
        paint: {
          'heatmap-weight': ['get', 'weight'],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 6, 0.8, 10, 1.5],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 6, 28, 10, 56],
          'heatmap-opacity': 0.85,
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(0,0,0,0)',
            0.15, 'rgba(253,230,138,0.55)',
            0.4, '#fb923c',
            0.7, '#ef4444',
            1, '#7f1d1d'
          ]
        }
      });
      trinidadMap.resize();
    });
  }

  function mount() {
    var nav = document.getElementById('insightsNav');
    if (!shell() || !nav || nav.getAttribute('data-built') === '1') return;
    showNav({
      promotions: false,
      orders: flag('data-ordering'),
      sales: false,
      customers: false,
      pos: flag('data-loyverse')
    });
  }

  global.InsightsPlatform = {
    render: render,
    loadOrders: loadOrders,
    mount: mount
  };
})(typeof window !== 'undefined' ? window : this);
