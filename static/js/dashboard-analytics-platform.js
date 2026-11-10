/**
 * TTMenus Insights sections. Numbers come from the analytics overview.
 * Verified order value comes from the order service. Menu order clicks stay labeled as clicks.
 */
(function (global) {
  'use strict';

  var sections = [
    { id: 'overview', label: 'Overview', icon: 'fa-th-large', always: true },
    { id: 'visitors', label: 'Visitors', icon: 'fa-users', always: true },
    { id: 'menu', label: 'Menu Analytics', icon: 'fa-cutlery', always: true },
    { id: 'behaviour', label: 'Customer Behaviour', icon: 'fa-line-chart', always: true },
    { id: 'promotions', label: 'Promotions', icon: 'fa-tag', always: true },
    { id: 'orders', label: 'Ordering', icon: 'fa-shopping-cart', key: 'orders' },
    { id: 'sales', label: 'Sales', icon: 'fa-money', key: 'sales' },
    { id: 'customers', label: 'Customers', icon: 'fa-user', key: 'customers' },
    { id: 'pos', label: 'POS Integration', icon: 'fa-credit-card', key: 'pos' },
    { id: 'reports', label: 'Reports', icon: 'fa-file-text-o', always: true },
    { id: 'recommendations', label: 'Recommendations', icon: 'fa-lightbulb-o', always: true }
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

  function formatHourAmPm(value) {
    var hour = parseInt(String(value == null ? '' : value).replace(/:.*$/, ''), 10);
    if (!isFinite(hour) || hour < 0 || hour > 23) {
      return String(value == null ? '' : value);
    }
    var suffix = hour >= 12 ? 'PM' : 'AM';
    var hour12 = hour % 12;
    if (hour12 === 0) hour12 = 12;
    return hour12 + ':00 ' + suffix;
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

  var scoreAnim = null;

  function prefersReducedMotion() {
    return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function paintScore(root, n) {
    var meter = root.querySelector('.insights-score-meter');
    var value = root.querySelector('[data-insights-score-value]');
    var rounded = Math.max(0, Math.min(100, Math.round(n)));
    if (meter) meter.style.setProperty('--insights-score', String(rounded));
    if (value) value.textContent = String(rounded);
    root.setAttribute('aria-label', 'Engagement score ' + rounded + ' out of 100');
  }

  function animateScore(root, target) {
    if (!root) return;
    if (scoreAnim) {
      global.cancelAnimationFrame(scoreAnim);
      scoreAnim = null;
    }
    var end = Math.max(0, Math.min(100, Number(target) || 0));
    if (prefersReducedMotion()) {
      paintScore(root, end);
      root.classList.remove('is-animating');
      root.classList.add('is-ready');
      return;
    }
    root.classList.remove('is-ready');
    root.classList.add('is-animating');
    paintScore(root, 0);
    void root.offsetWidth;
    var duration = Math.min(1400, 720 + end * 8);
    var start = global.performance && performance.now ? performance.now() : Date.now();
    function tick(now) {
      var t = Math.min(1, (now - start) / duration);
      var eased = 1 - Math.pow(1 - t, 3);
      paintScore(root, end * eased);
      if (t < 1) {
        scoreAnim = global.requestAnimationFrame(tick);
        return;
      }
      scoreAnim = null;
      paintScore(root, end);
      root.classList.remove('is-animating');
      root.classList.add('is-ready');
    }
    scoreAnim = global.requestAnimationFrame(tick);
  }

  function renderScore(data) {
    var el = document.getElementById('insightsScore');
    if (!el) return;
    var target = score(data);
    el.innerHTML =
      '<div class="insights-score-copy">' +
      '<h3 class="dashboard-notify-subsection-title">Engagement score</h3>' +
      '<p class="dashboard-analytics-subtitle">Based on visits, menu views, dish interest, and customer actions in this period.</p>' +
      '</div>' +
      '<div class="insights-score-meter" style="--insights-score:0">' +
      '<p class="insights-score-value"><span data-insights-score-value>0</span><span>/100</span></p>' +
      '</div>';
    animateScore(el, target);
  }

  function insightsNavHost() {
    return document.getElementById('insightsSideNav') || document.getElementById('insightsNav');
  }

  function showNav(visible) {
    var nav = document.getElementById('insightsNav');
    var host = insightsNavHost();
    var root = shell();
    if (root) root._insightsVisible = Object.assign(root._insightsVisible || {}, visible);
    visible = (root && root._insightsVisible) || visible || {};
    if (!nav || !host || nav.getAttribute('data-built') === '1') {
      sections.forEach(function (section) {
        var btn = nav && nav.querySelector('[data-insights-tab="' + section.id + '"]');
        if (!btn || section.always) return;
        btn.hidden = !visible[section.key];
      });
      settleNav();
      return;
    }
    nav.setAttribute('data-built', '1');
    host.innerHTML = sections.map(function (section) {
      var hidden = section.always || visible[section.key] ? '' : ' hidden';
      return (
        '<button type="button" class="dashboard-side-link insights-nav-link" data-insights-tab="' +
        section.id +
        '" aria-selected="false"' +
        hidden +
        '>' +
        '<i class="fa ' +
        escapeHtml(section.icon || 'fa-circle') +
        '" aria-hidden="true"></i>' +
        '<span class="dashboard-side-label">' +
        escapeHtml(section.label) +
        '</span>' +
        '</button>'
      );
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
      btn.setAttribute('aria-current', on ? 'page' : 'false');
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
    setText('insightsJourney', steps.map(function (step, index) {
      return (
        '<li class="insights-journey-step">' +
        '<span class="insights-journey-index" aria-hidden="true">' +
        (index + 1) +
        '</span>' +
        '<span class="insights-journey-copy"><span>' +
        escapeHtml(step[0]) +
        '</span><small>' +
        escapeHtml(step[2]) +
        '</small></span>' +
        '<strong>' +
        escapeHtml(count(step[1])) +
        '</strong></li>'
      );
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

  var noiseEventSuffixes = [
    ' - Page Enter',
    ' - Item View',
    ' - Scroll Depth',
    ' - Time on Page',
    ' - Install Prompt Shown',
    ' - Install Prompt',
    ' - Checkout Start',
    ' - Pull to Refresh',
    ' - Outbound Link',
    ' - Add Item',
    ' - Remove Item',
    ' - Impression',
    ' - Click',
    ' - Submit',
    ' - Query',
    ' - Select',
    ' - Close',
    ' - Open',
    ' - Logout',
    ' - Menu Click'
  ];

  function cleanEventLabel(name) {
    var label = String(name || '').trim();
    var i;
    for (i = 0; i < noiseEventSuffixes.length; i++) {
      if (label.length > noiseEventSuffixes[i].length && label.slice(-noiseEventSuffixes[i].length) === noiseEventSuffixes[i]) {
        return label.slice(0, -noiseEventSuffixes[i].length).trim();
      }
    }
    return label;
  }

  function usefulEventName(name) {
    var label = cleanEventLabel(name);
    if (!label || /^others$/i.test(label) || /^event name not defined$/i.test(label)) return false;
    if (/^\d+%$/.test(label)) return false;
    if (label.indexOf(' | ') !== -1) return false;
    var lower = label.toLowerCase();
    if (
      lower === 'order' ||
      lower === 'checkout' ||
      lower.indexOf('payment cancelled') !== -1 ||
      lower === 'scroll depth' ||
      lower === 'page enter' ||
      lower === 'time on page' ||
      lower === 'checkout start' ||
      lower.indexOf('install prompt') !== -1
    ) {
      return false;
    }
    return true;
  }

  function cleanNamedRows(rows) {
    if (!Array.isArray(rows)) return rows;
    var merged = {};
    var order = [];
    rows.forEach(function (row) {
      var name = cleanEventLabel(row && row.name);
      if (!usefulEventName(name)) return;
      var n = Number(row && row.count) || 0;
      if (!merged[name]) {
        merged[name] = 0;
        order.push(name);
      }
      merged[name] += n;
    });
    return order
      .map(function (name) {
        return { name: name, count: merged[name] };
      })
      .filter(function (row) {
        return row.count > 0;
      })
      .sort(function (a, b) {
        return b.count - a.count;
      });
  }

  function dishTable(rows) {
    if (!rows) return '<p class="dashboard-analytics-subtitle">Dish rankings are not in this response.</p>';
    rows = cleanNamedRows(rows);
    if (!rows.length) return '<p class="dashboard-analytics-subtitle">No dish views in this period yet.</p>';
    return table(rows, [
      { label: 'Menu item', cell: function (row) { return escapeHtml(row.name); } },
      { label: 'Views', cell: function (row) { return escapeHtml(count(row.count)); } }
    ]);
  }

  function namedTable(rows, label, countLabel) {
    if (!rows) return '<p class="dashboard-analytics-subtitle">Not available for this period yet.</p>';
    return table(rows, [
      { label: label, cell: function (row) { return escapeHtml(row.name); } },
      { label: countLabel || 'Visits', cell: function (row) { return escapeHtml(count(row.count)); } }
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

  function hourSortKey(value) {
    var hour = parseInt(String(value == null ? '' : value).replace(/:.*$/, ''), 10);
    return isFinite(hour) ? hour : 99;
  }

  function peakHours(rows, limit) {
    var top = (rows || []).slice().sort(function (a, b) {
      return (Number(b.count) || 0) - (Number(a.count) || 0);
    }).slice(0, limit || 6);
    top.sort(function (a, b) {
      return hourSortKey(a.name) - hourSortKey(b.name);
    });
    return top.map(function (row) {
      return { name: formatHourAmPm(row.name), count: row.count };
    });
  }

  function metricCards(bits) {
    return (
      '<div class="dashboard-analytics-metrics dashboard-analytics-metrics--full">' +
      bits
        .map(function (bit) {
          var opts = bit[2] || {};
          var id = opts.id || '';
          var initial = opts.animate != null ? '' : escapeHtml(bit[1] == null ? '' : String(bit[1]));
          var delta = opts.delta
            ? '<span class="dashboard-analytics-card-delta">' + escapeHtml(opts.delta) + '</span>'
            : '';
          return (
            '<div class="dashboard-analytics-card dashboard-analytics-metric-card">' +
            '<span class="dashboard-analytics-card-label">' +
            escapeHtml(bit[0]) +
            '</span>' +
            '<span class="dashboard-analytics-card-value"' +
            (id ? ' id="' + escapeHtml(id) + '"' : '') +
            ' aria-label="' +
            escapeHtml(bit[0]) +
            '">' +
            initial +
            '</span>' +
            delta +
            '</div>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function animateMetricCardBits(bits) {
    bits.forEach(function (bit, index) {
      var opts = bit[2] || {};
      if (!opts.id || opts.animate == null) return;
      if (global.DashboardAnalyticsSnapshot && typeof DashboardAnalyticsSnapshot.animateMetric === 'function') {
        DashboardAnalyticsSnapshot.animateMetric(opts.id, opts.animate, bit[0], {
          fromZero: true,
          delay: index * 70,
          format: opts.format
        });
        return;
      }
      var el = document.getElementById(opts.id);
      if (!el) return;
      el.textContent = opts.format ? opts.format(opts.animate) : count(opts.animate);
      el.setAttribute('aria-label', bit[0] + ': ' + el.textContent);
    });
  }

  function setMetricPanel(id, result) {
    if (!result || typeof result === 'string') {
      setText(id, result || '');
      return;
    }
    setText(id, result.html || '');
    animateMetricCardBits(result.bits || []);
  }

  function openOrderValue(stats) {
    if (!stats) return 0;
    if (stats.openValue != null) return Number(stats.openValue) || 0;
    if ((Number(stats.openCount) || 0) > 0 && !(Number(stats.completedCount) || 0)) {
      return Number(stats.totalValue) || 0;
    }
    return 0;
  }

  function completedOrderValue(stats) {
    if (!stats) return 0;
    if (stats.completedValue != null) return Number(stats.completedValue) || 0;
    if ((Number(stats.completedCount) || 0) > 0 && !(Number(stats.openCount) || 0)) {
      return Number(stats.totalValue) || 0;
    }
    return 0;
  }

  function averageOpenValue(stats) {
    if (!stats) return 0;
    if (stats.averageOpenValue != null) return Number(stats.averageOpenValue) || 0;
    var open = Number(stats.openCount) || 0;
    return open > 0 ? openOrderValue(stats) / open : 0;
  }

  function averageCompletedValue(stats) {
    if (!stats) return 0;
    if (stats.averageCompletedValue != null) return Number(stats.averageCompletedValue) || 0;
    var done = Number(stats.completedCount) || 0;
    return done > 0 ? completedOrderValue(stats) / done : 0;
  }

  function ordersMetricBits(stats, data) {
    stats = stats || {};
    data = data || {};
    var currency = stats.currency || 'TTD';
    var openCount = Number(stats.openCount) || 0;
    var openValue = openOrderValue(stats);
    var openAvg = averageOpenValue(stats);
    var submits = Number(data.orderSubmissions) || 0;
    var carts = Number(data.addToCart) || 0;
    var bits = [
      ['Unconfirmed orders', count(openCount), { id: 'metricOrdersCount', animate: openCount }],
      [
        'Unconfirmed value',
        money(openValue, currency),
        {
          id: 'metricOrdersValue',
          animate: openValue,
          format: function (n) {
            return money(n, currency);
          }
        }
      ],
      [
        'Average unconfirmed',
        money(openAvg, currency),
        {
          id: 'metricOrdersAov',
          animate: openAvg,
          format: function (n) {
            return money(n, currency);
          }
        }
      ],
      ['Order clicks', count(submits), { id: 'metricOrdersSubmits', animate: submits }],
      ['Cart adds', count(carts), { id: 'metricOrdersCartAdds', animate: carts }]
    ];
    return bits;
  }

  function ordersPanel(stats, data) {
    stats = stats || null;
    data = data || {};
    if (!stats) {
      var loadingBits = ordersMetricBits({}, data);
      return {
        html:
          metricCards(loadingBits) +
          '<p class="dashboard-analytics-subtitle">Loading unconfirmed TTMenus tickets and menu order clicks…</p>',
        bits: loadingBits
      };
    }
    var openCount = Number(stats.openCount) || 0;
    var ticketCount = Number(stats.orderCount) || 0;
    var bits = ordersMetricBits(stats, data);
    var html = metricCards(bits);
    html +=
      '<p class="dashboard-analytics-subtitle">Unconfirmed orders are open TTMenus tickets still waiting on kitchen or payment. Order clicks and cart adds are menu events before a ticket exists. Completed sales stay under Sales.</p>';
    if (ticketCount > 0) {
      html +=
        '<h3 class="dashboard-notify-subsection-title">Tickets by status</h3>' +
        namedTable(stats.byStatus || [], 'Status', 'Orders');
      if (!openCount) {
        html +=
          '<p class="dashboard-analytics-subtitle">No open tickets right now. ' +
          escapeHtml(count(ticketCount)) +
          ' tickets in this period are already completed or cancelled.</p>';
      }
    } else if ((Number(data.orderSubmissions) || 0) > 0 || (Number(data.addToCart) || 0) > 0) {
      html +=
        '<p class="dashboard-analytics-subtitle">Guests are adding to cart or tapping order, but no TTMenus tickets were created in this period yet.</p>';
    } else {
      html +=
        '<p class="dashboard-analytics-subtitle">No unconfirmed tickets or menu order clicks in this period yet.</p>';
    }
    return { html: html, bits: bits };
  }

  function salesMetricBits(stats) {
    var currency = stats.currency || 'TTD';
    var completed = Number(stats.completedCount) || 0;
    var value = completedOrderValue(stats);
    var avg = averageCompletedValue(stats);
    var cancel = stats.cancellationRate != null ? Number(stats.cancellationRate) : null;
    return [
      [
        'Completed value',
        money(value, currency),
        {
          id: 'metricSalesValue',
          animate: value,
          format: function (n) {
            return money(n, currency);
          }
        }
      ],
      ['Completed orders', count(completed), { id: 'metricSalesCompleted', animate: completed }],
      [
        'Average completed',
        money(avg, currency),
        {
          id: 'metricSalesAov',
          animate: avg,
          format: function (n) {
            return money(n, currency);
          }
        }
      ],
      [
        'Cancellation rate',
        cancel != null ? cancel + '%' : '—',
        cancel == null
          ? { id: 'metricSalesCancellation' }
          : {
              id: 'metricSalesCancellation',
              animate: cancel,
              format: function (n) {
                return Math.round(n) + '%';
              }
            }
      ]
    ];
  }

  function salesHtml(stats) {
    if (!stats) {
      return { html: '<p class="dashboard-analytics-subtitle">Loading TTMenus sales…</p>', bits: [] };
    }
    var completed = Number(stats.completedCount) || 0;
    var openCount = Number(stats.openCount) || 0;
    if (!completed) {
      return {
        html:
          '<p class="dashboard-analytics-subtitle">' +
          (openCount
            ? escapeHtml(count(openCount)) +
              ' unconfirmed ticket' +
              (openCount === 1 ? '' : 's') +
              ' worth ' +
              escapeHtml(money(openOrderValue(stats), stats.currency)) +
              ' are still open under Ordering. Completed sales appear when tickets become ready or paid.'
            : 'No completed TTMenus sales in this period yet. Unconfirmed tickets and menu order clicks stay under Ordering.') +
          '</p>' +
          (stats.note ? '<p class="dashboard-analytics-subtitle">' + escapeHtml(stats.note) + '</p>' : ''),
        bits: []
      };
    }
    var bits = salesMetricBits(stats);
    var html =
      metricCards(bits) +
      '<p class="dashboard-analytics-subtitle">Completed TTMenus sales only (ready and paid). Open tickets stay under Ordering.</p>';
    if (Array.isArray(stats.popularItems) && stats.popularItems.length) {
      html +=
        '<h3 class="dashboard-notify-subsection-title">Top selling items</h3>' +
        table(stats.popularItems, [
          { label: 'Menu item', cell: function (row) { return escapeHtml(row.name); } },
          { label: 'Quantity', cell: function (row) { return escapeHtml(count(row.count)); } }
        ]);
    } else {
      html += '<p class="dashboard-analytics-subtitle">Item quantities appear when completed order carts include dish names.</p>';
    }
    return { html: html, bits: bits };
  }

  function customersMetricBits(data, stats) {
    data = data || {};
    var returning = Number(data.returningVisits) || 0;
    var fresh = Number(data.newVisits) || 0;
    var bits = [];
    if (fresh || returning) {
      bits.push(['New visits', count(fresh), { id: 'metricCustomersNew', animate: fresh }]);
      bits.push(['Returning visits', count(returning), { id: 'metricCustomersReturning', animate: returning }]);
    }
    if (stats && Number(stats.orderCount) > 0) {
      bits.push([
        'Ordering customers',
        count(stats.customerCount),
        { id: 'metricCustomersOrdering', animate: Number(stats.customerCount) || 0 }
      ]);
      bits.push([
        'Repeat customers',
        count(stats.repeatCustomers),
        { id: 'metricCustomersRepeat', animate: Number(stats.repeatCustomers) || 0 }
      ]);
    }
    return bits;
  }

  function customersHtml(data, stats) {
    data = data || {};
    var returning = Number(data.returningVisits) || 0;
    var bits = customersMetricBits(data, stats);
    if (!bits.length) {
      if (stats && !Number(stats.orderCount)) {
        return {
          html: '<p class="dashboard-analytics-subtitle">No ordering customers in this period yet. Returning visits and repeat buyers appear once guests come back or place another order.</p>',
          bits: []
        };
      }
      return {
        html: '<p class="dashboard-analytics-subtitle">Customer counts appear when Matomo reports new/returning visits or when guests place TTMenus orders.</p>',
        bits: []
      };
    }
    var html = metricCards(bits);
    if (stats && Number(stats.orderCount) > 0) {
      html +=
        '<p class="dashboard-analytics-subtitle">' +
        escapeHtml(count(stats.customerCount)) +
        ' customers placed a TTMenus order. ' +
        escapeHtml(count(stats.repeatCustomers)) +
        ' ordered more than once in this period.</p>';
    } else if (returning) {
      html +=
        '<p class="dashboard-analytics-subtitle">' +
        escapeHtml(count(returning)) +
        ' returning visits in this period. Repeat purchases appear when TTMenus orders are available.</p>';
    }
    return { html: html, bits: bits };
  }

  function render(data) {
    if (!shell()) return;
    data = data || {};
    shell()._insightsData = data;
    var ordering = flag('data-ordering');
    var loyverse = flag('data-loyverse');
    var returning = Number(data.returningVisits) || 0;
    showNav({
      orders: ordering,
      sales: ordering,
      customers: ordering || returning > 0,
      pos: loyverse
    });

    var actionTotal = actions(data);
    if (global.DashboardAnalyticsSnapshot && typeof DashboardAnalyticsSnapshot.animateMetric === 'function') {
      DashboardAnalyticsSnapshot.animateMetric('metricCustomerActions', actionTotal, 'Customer actions', {
        fromZero: true,
        delay: 210
      });
    } else {
      var actionEl = document.getElementById('metricCustomerActions');
      if (actionEl) {
        actionEl.textContent = count(actionTotal);
        actionEl.setAttribute('aria-label', 'Customer actions: ' + count(actionTotal));
      }
    }
    renderActionDelta(data);

    journey(data);
    setText('insightsTopDishes', dishTable(data.dishes));
    setText('insightsMenuDishes', dishTable(data.dishes));
    renderScore(data);

    var visitorMetrics = [
      ['metricInsightsVisits', data.visits, 'Visits'],
      ['metricInsightsUniqueVisitors', data.uniqueVisitors, 'Unique visitors'],
      ['metricInsightsMenuViews', data.pageViews, 'Menu views'],
      ['metricInsightsSearches', searchCount(data), 'Searches']
    ];
    visitorMetrics.forEach(function (bit, index) {
      if (global.DashboardAnalyticsSnapshot && typeof DashboardAnalyticsSnapshot.animateMetric === 'function') {
        DashboardAnalyticsSnapshot.animateMetric(bit[0], bit[1], bit[2], {
          fromZero: true,
          delay: index * 70
        });
        return;
      }
      var el = document.getElementById(bit[0]);
      if (!el) return;
      el.textContent = count(bit[1]);
      el.setAttribute('aria-label', bit[2] + ': ' + count(bit[1]));
    });
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
    setText('insightsHours', namedTable(peakHours(data.hours, 6), 'Hour'));
    var fresh = Number(data.newVisits) || 0;
    setText('insightsReturning', returning || fresh
      ? count(fresh) + ' new visits and ' + count(returning) + ' returning visits.'
      : 'Returning and new visits appear when Matomo reports them for this period.');
    setText('insightsLocations', namedTable(data.locations, 'Location'));
    setMetricPanel('insightsCustomers', customersHtml(data, shell()._orderStats || null));
    setMetricPanel('insightsSales', ordering ? salesHtml(shell()._orderStats || null) : '');
    setText('insightsPromotions', '<p class="dashboard-analytics-subtitle">Loading promotions…</p>');
    loadPromoCatalog()
      .then(function (catalog) {
        setText('insightsPromotions', promotionsHtml(data, catalog));
      })
      .catch(function () {
        setText('insightsPromotions', promotionsHtml(data, []));
      });
    if (loyverse) setMetricPanel('insightsPos', posHtml(shell()._orderStats || null));
    else setText('insightsPos', '');
    if (ordering) {
      setMetricPanel('insightsOrders', ordersPanel(shell()._orderStats || null, data));
    }
    setText('insightsRecommendations', recommendationsHtml(data, shell()._orderStats || null));
    setMetricPanel('insightsReports', reportHtml(data, shell()._orderStats || null));
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

  function hasPromotions(data, catalog) {
    if (catalog && catalog.length) return true;
    if ((Number(data.promotionImpressions) || 0) + (Number(data.promotionClicks) || 0) > 0) {
      return cleanPromotionRows(Array.isArray(data.promotions) ? data.promotions : []).length > 0;
    }
    return cleanPromotionRows(Array.isArray(data.promotions) ? data.promotions : []).length > 0;
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

  function cleanPromotionRows(rows) {
    if (!Array.isArray(rows)) return [];
    var merged = {};
    var order = [];
    rows.forEach(function (row) {
      var name = cleanEventLabel(row && row.name);
      if (!usefulEventName(name)) return;
      if (!merged[name]) {
        merged[name] = { name: name, impressions: 0, clicks: 0, clickRate: 0 };
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

  function normalizePromoKey(name) {
    return String(name || '')
      .toLowerCase()
      .replace(/&amp;/g, '&')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function firstPromoImage(entry) {
    if (!entry) return '';
    if (typeof entry.image === 'string' && entry.image.trim()) return entry.image.trim();
    var images = entry.images;
    if (!Array.isArray(images)) return '';
    var i;
    for (i = 0; i < images.length; i++) {
      var img = images[i];
      if (!img) continue;
      if (typeof img === 'string' && img.trim()) return img.trim();
      var src = img.image || img.image_url || img.url || img.src || '';
      if (src) return String(src).trim();
    }
    return '';
  }

  function absoluteAssetUrl(path) {
    var src = String(path || '').trim();
    if (!src) return '';
    if (/^(https?:)?\/\//i.test(src) || src.indexOf('data:') === 0) return src;
    if (src.charAt(0) === '/') return src;
    return '/' + src.replace(/^\/+/, '');
  }

  function promoCatalogFromJson(payload, kind) {
    var items = [];
    if (Array.isArray(payload)) items = payload;
    else if (payload && typeof payload === 'object') {
      items = payload.items || payload.promotions || payload.ads || payload.data || [];
    }
    if (!Array.isArray(items)) return [];
    return items
      .map(function (item) {
        var title = String((item && (item.title || item.name)) || '').trim();
        var image = firstPromoImage(item);
        if (!title || !image) return null;
        return {
          title: title,
          image: absoluteAssetUrl(image),
          url: String((item && (item.url || item.link)) || '').trim(),
          kind: kind || 'promotion'
        };
      })
      .filter(Boolean);
  }

  function menuItemPromotionsFromCatalog(payload) {
    var items = [];
    if (payload && Array.isArray(payload.menu_items)) items = payload.menu_items;
    else if (payload && Array.isArray(payload.menuItems)) items = payload.menuItems;
    else if (Array.isArray(payload)) items = payload;
    var out = [];
    items.forEach(function (item) {
      var promos = item && item.promotions;
      if (!Array.isArray(promos) || !promos.length) return;
      var title = String((item && (item.name || item.title)) || '').trim();
      if (!title) return;
      var itemImage = '';
      if (Array.isArray(item.images) && item.images.length) {
        itemImage = typeof item.images[0] === 'string' ? item.images[0] : firstPromoImage({ images: item.images });
      } else if (item.image) {
        itemImage = String(item.image);
      }
      promos.forEach(function (promo) {
        var image = firstPromoImage(promo) || itemImage;
        if (!image) return;
        out.push({
          title: title,
          image: absoluteAssetUrl(image),
          url: String((item && item.url) || '').trim(),
          kind: 'item-promotion'
        });
      });
    });
    return out;
  }

  function dedupePromoCatalog(rows) {
    var seen = {};
    var out = [];
    (rows || []).forEach(function (row) {
      var key = normalizePromoKey(row.title) + '|' + row.kind + '|' + row.image;
      if (!key || seen[key]) return;
      seen[key] = true;
      out.push(row);
    });
    return out;
  }

  function loadPromoCatalog() {
    var root = shell();
    if (root && Array.isArray(root._promoCatalog)) {
      return Promise.resolve(root._promoCatalog);
    }
    return fetch('/index.json', { credentials: 'omit', headers: { Accept: 'application/json' } })
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .catch(function () {
        return null;
      })
      .then(function (idx) {
        var locs = idx && Array.isArray(idx.locations) ? idx.locations : [];
        var slugs = [];
        locs.forEach(function (loc) {
          var slug = String((loc && (loc.slug || loc.city)) || '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
          if (slug && slugs.indexOf(slug) === -1) slugs.push(slug);
        });
        // Multi-location menus publish /{slug}/promotions/index.json; also try the site-wide feed.
        var urls = ['/promotions/index.json'];
        slugs.forEach(function (slug) {
          urls.push('/' + encodeURIComponent(slug) + '/promotions/index.json');
        });
        var fetches = urls.map(function (url) {
          return fetch(url, { credentials: 'omit', headers: { Accept: 'application/json' }, cache: 'no-store' })
            .then(function (res) {
              return res.ok ? res.json() : null;
            })
            .catch(function () {
              return null;
            });
        });
        fetches.push(
          fetch('/api/menu-items.json', { credentials: 'omit', headers: { Accept: 'application/json' } })
            .then(function (res) {
              return res.ok ? res.json() : null;
            })
            .catch(function () {
              return null;
            })
        );
        return Promise.all(fetches);
      })
      .then(function (parts) {
        parts = Array.isArray(parts) ? parts : [];
        var catalog = [];
        var i;
        for (i = 0; i < parts.length - 1; i++) {
          catalog = catalog.concat(promoCatalogFromJson(parts[i], 'promotion'));
        }
        if (parts.length) {
          catalog = catalog.concat(menuItemPromotionsFromCatalog(parts[parts.length - 1]));
        }
        catalog = dedupePromoCatalog(catalog);
        if (root) root._promoCatalog = catalog;
        return catalog;
      })
      .catch(function () {
        return [];
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
      clickRate: hit.impressions ? Math.round((hit.clicks / hit.impressions) * 1000) / 10 : 0
    };
  }

  function promotionsHtml(data, catalog) {
    catalog = Array.isArray(catalog) ? catalog : [];
    var statsRows = cleanPromotionRows(Array.isArray(data.promotions) ? data.promotions : []);
    var cards = catalog.map(function (promo) {
      var stats = matchPromoStats(promo.title, statsRows);
      return {
        title: promo.title,
        image: promo.image,
        url: promo.url,
        kind: promo.kind,
        impressions: stats.impressions,
        clicks: stats.clicks,
        clickRate: stats.clickRate
      };
    });
    cards.sort(function (a, b) {
      return b.impressions + b.clicks - (a.impressions + a.clicks) || a.title.localeCompare(b.title);
    });

    if (!cards.length) {
      var rawImpressions = Number(data.promotionImpressions) || 0;
      var rawClicks = Number(data.promotionClicks) || 0;
      var htmlEmpty =
        '<p class="insights-promo-summary">Promotions with images from this menu will show here with previews and click stats.</p>';
      if (rawImpressions || rawClicks) {
        htmlEmpty +=
          '<p class="dashboard-analytics-subtitle">' +
          escapeHtml(count(rawImpressions)) +
          ' promotion impressions and ' +
          escapeHtml(count(rawClicks)) +
          ' clicks were tracked, but none matched a menu promotion or item promotion that has an image yet.</p>';
      }
      htmlEmpty +=
        '<p class="dashboard-analytics-subtitle">Add a promotion under Promotion settings, or attach a promotion image on a menu item. Page titles and checkout events are not listed here.</p>';
      return htmlEmpty;
    }

    var trackedImpressions = cards.reduce(function (sum, row) {
      return sum + (Number(row.impressions) || 0);
    }, 0);
    var trackedClicks = cards.reduce(function (sum, row) {
      return sum + (Number(row.clicks) || 0);
    }, 0);
    var html =
      '<p class="insights-promo-summary">' +
      escapeHtml(count(trackedImpressions)) +
      ' tracked impressions and ' +
      escapeHtml(count(trackedClicks)) +
      ' tracked clicks across ' +
      escapeHtml(count(cards.length)) +
      ' promotions with images.</p>' +
      '<div class="insights-promo-grid">';

    cards.forEach(function (row) {
      var kindLabel = row.kind === 'item-promotion' ? 'Item promotion' : 'Promotion';
      html +=
        '<article class="insights-promo-card">' +
        '<div class="insights-promo-media">' +
        '<img src="' +
        escapeHtml(row.image) +
        '" alt="" loading="lazy" decoding="async">' +
        '</div>' +
        '<div class="insights-promo-body">' +
        '<span class="insights-promo-kind">' +
        escapeHtml(kindLabel) +
        '</span>' +
        '<h4 class="insights-promo-title">' +
        escapeHtml(row.title) +
        '</h4>' +
        '<dl class="insights-promo-stats">' +
        '<div><dt>Impressions</dt><dd>' +
        escapeHtml(count(row.impressions)) +
        '</dd></div>' +
        '<div><dt>Clicks</dt><dd>' +
        escapeHtml(count(row.clicks)) +
        '</dd></div>' +
        '<div><dt>Click rate</dt><dd>' +
        escapeHtml(row.impressions ? String(row.clickRate) + '%' : '—') +
        '</dd></div>' +
        '</dl>' +
        '</div></article>';
    });
    return html + '</div>';
  }

  function changeLabel(pct) {
    if (pct == null || !isFinite(Number(pct))) return '';
    var n = Math.round(Number(pct) * 10) / 10;
    return (n > 0 ? '+' : '') + n + '% vs previous';
  }

  function reportMetric(label, value, delta) {
    return (
      '<div class="insights-report-metric">' +
      '<span class="insights-report-metric-label">' +
      escapeHtml(label) +
      '</span>' +
      '<strong>' +
      escapeHtml(value) +
      '</strong>' +
      (delta
        ? '<span class="insights-report-metric-delta">' + escapeHtml(delta) + '</span>'
        : '') +
      '</div>'
    );
  }

  function reportSection(title, body) {
    if (!body) return '';
    return (
      '<section class="insights-report-section">' +
      '<h3 class="dashboard-notify-subsection-title">' +
      escapeHtml(title) +
      '</h3>' +
      body +
      '</section>'
    );
  }

  function reportList(rows) {
    if (!rows || !rows.length) return '';
    return (
      '<ul class="insights-report-list">' +
      rows
        .map(function (row) {
          return (
            '<li><span>' +
            escapeHtml(row[0]) +
            '</span><strong>' +
            escapeHtml(row[1]) +
            '</strong></li>'
          );
        })
        .join('') +
      '</ul>'
    );
  }

  function topNamedLines(rows, limit) {
    return (cleanNamedRows(rows) || []).slice(0, limit || 5).map(function (row) {
      return [row.name, count(row.count)];
    });
  }

  function buildRecommendations(data, orders) {
    var days = data.periodDays || 30;
    var dishes = cleanNamedRows(data.dishes) || [];
    var funnel = data.observedFunnel || {};
    var peaks = peakDays(data.rows || []).slice(0, 3);
    var hours = (data.hours || []).slice(0, 3);
    var sources = Array.isArray(data.sources) ? data.sources.slice(0, 3) : [];
    var devices = Array.isArray(data.devices) ? data.devices.slice(0, 2) : [];
    var contacts =
      (Number(data.whatsappClicks) || 0) +
      (Number(data.phoneClicks) || 0) +
      (Number(data.directionClicks) || 0);
    var recs = [];
    var seen = {};

    function pushRec(priority, title, detail, tag) {
      var key = normalizePromoKey(title + '|' + detail);
      if (!title || !detail || seen[key]) return;
      seen[key] = true;
      recs.push({ priority: priority, title: title, detail: detail, tag: tag || 'Insight' });
    }

    if (dishes.length && dishes[0].count > 0 && usefulEventName(dishes[0].name)) {
      pushRec(
        10,
        'Feature ' + dishes[0].name,
        dishes[0].name +
          ' led dish interest with ' +
          count(dishes[0].count) +
          ' views. Put it in the next promotion and track the orders that follow.',
        'Menu'
      );
    }

    if (funnel.cartAbandonmentRate != null && funnel.cartAbandonmentRate >= 45 && funnel.cartAdds > 0) {
      pushRec(
        20,
        'Tighten the path from cart to order',
        count(funnel.cartAbandons) +
          ' cart adds (' +
          funnel.cartAbandonmentRate +
          '%) did not reach an order-submit click. Review price clarity, required fields, and how early the order button appears.',
        'Ordering'
      );
    }

    if (
      Number(data.menuItemViews) >= 40 &&
      Number(data.orderSubmissions) > 0 &&
      Number(data.orderSubmissions) / Number(data.menuItemViews) < 0.12
    ) {
      pushRec(
        25,
        'Close the gap between dish views and order clicks',
        count(data.menuItemViews) +
          ' item views produced only ' +
          count(data.orderSubmissions) +
          ' order-submit clicks. Check descriptions, photos, and add-to-cart friction on top dishes.',
        'Conversion'
      );
    }

    if (peaks.length && peaks[0].count > 0) {
      pushRec(
        30,
        'Plan specials around ' + peaks[0].name,
        peaks[0].name +
          ' was the strongest day for menu interest. Schedule promotions and staffing before that peak.',
        'Timing'
      );
    }

    if (hours.length && hours[0].count > 0) {
      pushRec(
        35,
        'Push offers near ' + formatHourAmPm(hours[0].name),
        formatHourAmPm(hours[0].name) +
          ' is the busiest hour in this period. Time WhatsApp blasts and featured dishes around it.',
        'Timing'
      );
    }

    if (sources.length && /direct/i.test(String(sources[0].name || '')) && Number(sources[0].count) > 0) {
      pushRec(
        40,
        'Grow tracked campaign traffic',
        'Most visits are Direct Entry. Add utm_campaign or mtm_campaign links on Instagram, WhatsApp, and flyers so Insights can credit the channel.',
        'Traffic'
      );
    } else if (sources.length && sources[0].count > 0) {
      pushRec(
        40,
        'Double down on ' + sources[0].name,
        sources[0].name +
          ' brought ' +
          count(sources[0].count) +
          ' visits. Keep that channel warm and compare it with the next best source.',
        'Traffic'
      );
    }

    if (devices.length === 1 || (devices[0] && /smart|phone|mobile/i.test(String(devices[0].name || '')))) {
      pushRec(
        45,
        'Keep the mobile menu fast',
        (devices[0] ? devices[0].name : 'Phones') +
          ' carry a large share of visits. Make sure photos, promotions, and checkout stay quick on small screens.',
        'Experience'
      );
    }

    if (contacts <= 0 && Number(data.visits) >= 20) {
      pushRec(
        50,
        'Make phone, WhatsApp, and directions easier to tap',
        count(data.visits) +
          ' visits produced no contact or map actions. Surface WhatsApp, call, and directions higher on the menu.',
        'Contact'
      );
    } else if ((Number(data.whatsappClicks) || 0) > (Number(data.phoneClicks) || 0) + (Number(data.directionClicks) || 0)) {
      pushRec(
        50,
        'Lean into WhatsApp as the response channel',
        count(data.whatsappClicks) +
          ' WhatsApp taps led contact actions. Keep reply templates and ordering replies ready for peak hours.',
        'Contact'
      );
    }

    if (orders && (Number(orders.openCount) || 0) > 0) {
      pushRec(
        14,
        'Clear unconfirmed tickets',
        count(orders.openCount) +
          ' open tickets worth ' +
          money(openOrderValue(orders), orders.currency) +
          ' are still unconfirmed. Move them to ready/paid or cancel stale ones so Ordering and Sales stay accurate.',
        'Ordering'
      );
    }
    if (orders && Number(orders.completedCount) > 0) {
      pushRec(
        15,
        'Protect completed sales',
        count(orders.completedCount) +
          ' completed TTMenus orders brought ' +
          money(completedOrderValue(orders), orders.currency) +
          (averageCompletedValue(orders)
            ? ' (average ' + money(averageCompletedValue(orders), orders.currency) + ').'
            : '.') +
          ' Feature the dishes that already convert.',
        'Sales'
      );
      if (orders.cancellationRate != null && Number(orders.cancellationRate) >= 15) {
        pushRec(
          18,
          'Investigate cancellations',
          'Cancellation rate is ' +
            orders.cancellationRate +
            '%. Check payment drop-offs, stockouts, and delivery timing messages.',
          'Sales'
        );
      }
    } else if (flag('data-ordering') && Number(data.orderSubmissions) > 0) {
      pushRec(
        22,
        'Turn order clicks into tickets',
        count(data.orderSubmissions) +
          ' order-submit clicks were observed, but no completed TTMenus sales landed yet. Confirm checkout creates tickets and staff can finish them.',
        'Ordering'
      );
    }

    if (Number(data.searches) > 0 || (searchTerms(data) || []).length) {
      var terms = searchTerms(data) || [];
      if (terms.length) {
        pushRec(
          55,
          'Stock and spotlight “' + terms[0].name + '”',
          'Guests searched for “' +
            terms[0].name +
            '” ' +
            count(terms[0].count) +
            ' times. Make sure that item is easy to find and available.',
          'Search'
        );
      }
    } else if (Number(data.visits) >= 25) {
      pushRec(
        60,
        'Encourage search when the menu is long',
        'No searches were recorded in the last ' +
          days +
          ' days. If the catalog is large, make search more visible so guests find dishes faster.',
        'Search'
      );
    }

    if (!recs.length) {
      pushRec(
        100,
        'Build more menu activity first',
        'Once guests open dishes, add to cart, and return, Insights will turn those signals into concrete next steps.',
        'Insight'
      );
    }

    recs.sort(function (a, b) {
      return a.priority - b.priority;
    });
    return recs.slice(0, 8);
  }

  function recommendationsHtml(data, orders) {
    var recs = buildRecommendations(data || {}, orders || null);
    var html =
      '<p class="dashboard-analytics-subtitle">Prioritized actions from this period’s visitors, dish interest, ordering funnel, and sales signals.</p>' +
      '<div class="insights-rec-list">';
    recs.forEach(function (rec, index) {
      html +=
        '<article class="insights-rec-card">' +
        '<div class="insights-rec-head">' +
        '<span class="insights-rec-index" aria-hidden="true">' +
        (index + 1) +
        '</span>' +
        '<span class="insights-rec-tag">' +
        escapeHtml(rec.tag) +
        '</span>' +
        '</div>' +
        '<h3 class="insights-rec-title">' +
        escapeHtml(rec.title) +
        '</h3>' +
        '<p class="insights-rec-detail">' +
        escapeHtml(rec.detail) +
        '</p>' +
        '</article>';
    });
    return html + '</div>';
  }

  function reportHeadlineBits(data) {
    data = data || {};
    var change = data.changePct || {};
    var funnel = data.observedFunnel || {};
    var actionTotal = actions(data);
    var engagement = score(data);
    var bits = [
      [
        'Unique visitors',
        count(data.uniqueVisitors),
        {
          id: 'metricReportUniqueVisitors',
          animate: Number(data.uniqueVisitors) || 0,
          delta: changeLabel(change.uniqueVisitors)
        }
      ],
      [
        'Menu views',
        count(data.pageViews),
        {
          id: 'metricReportMenuViews',
          animate: Number(data.pageViews) || 0,
          delta: changeLabel(change.pageViews)
        }
      ],
      [
        'Menu item views',
        count(data.menuItemViews),
        {
          id: 'metricReportMenuItemViews',
          animate: Number(data.menuItemViews) || 0,
          delta: changeLabel(change.menuItemViews)
        }
      ],
      [
        'Customer actions',
        count(actionTotal),
        { id: 'metricReportCustomerActions', animate: Number(actionTotal) || 0 }
      ],
      [
        'Engagement score',
        engagement + '/100',
        {
          id: 'metricReportEngagement',
          animate: Number(engagement) || 0,
          format: function (n) {
            return Math.round(n) + '/100';
          }
        }
      ]
    ];
    if (funnel.cartAbandonmentRate != null) {
      bits.push([
        'Cart abandonment',
        funnel.cartAbandonmentRate + '%',
        {
          id: 'metricReportCartAbandonment',
          animate: Number(funnel.cartAbandonmentRate) || 0,
          format: function (n) {
            return Math.round(n) + '%';
          }
        }
      ]);
    }
    return bits;
  }

  function reportOrderingBits(orders, data) {
    if (!orders && !data) return [];
    orders = orders || {};
    data = data || {};
    if (!(Number(orders.orderCount) || 0) && !(Number(data.orderSubmissions) || 0) && !(Number(data.addToCart) || 0)) {
      return [];
    }
    var currency = orders.currency || 'TTD';
    var openCount = Number(orders.openCount) || 0;
    var openValue = openOrderValue(orders);
    var openAvg = averageOpenValue(orders);
    return [
      ['Unconfirmed orders', count(openCount), { id: 'metricReportOrders', animate: openCount }],
      [
        'Unconfirmed value',
        money(openValue, currency),
        {
          id: 'metricReportOrderValue',
          animate: openValue,
          format: function (n) {
            return money(n, currency);
          }
        }
      ],
      [
        'Average unconfirmed',
        money(openAvg, currency),
        {
          id: 'metricReportAov',
          animate: openAvg,
          format: function (n) {
            return money(n, currency);
          }
        }
      ],
      [
        'Order clicks',
        count(data.orderSubmissions),
        { id: 'metricReportOrderClicks', animate: Number(data.orderSubmissions) || 0 }
      ],
      [
        'Cart adds',
        count(data.addToCart),
        { id: 'metricReportCartAdds', animate: Number(data.addToCart) || 0 }
      ]
    ];
  }

  function reportSalesBits(orders) {
    if (!orders || !(Number(orders.completedCount) || 0)) return [];
    var currency = orders.currency || 'TTD';
    var completed = Number(orders.completedCount) || 0;
    var value = completedOrderValue(orders);
    var avg = averageCompletedValue(orders);
    var cancel = orders.cancellationRate != null ? Number(orders.cancellationRate) : null;
    var bits = [
      [
        'Completed value',
        money(value, currency),
        {
          id: 'metricReportCompletedValue',
          animate: value,
          format: function (n) {
            return money(n, currency);
          }
        }
      ],
      ['Completed orders', count(completed), { id: 'metricReportCompletedOrders', animate: completed }],
      [
        'Average completed',
        money(avg, currency),
        {
          id: 'metricReportCompletedAov',
          animate: avg,
          format: function (n) {
            return money(n, currency);
          }
        }
      ],
      [
        'Ordering customers',
        count(orders.customerCount),
        { id: 'metricReportOrderingCustomers', animate: Number(orders.customerCount) || 0 }
      ],
      [
        'Repeat customers',
        count(orders.repeatCustomers),
        { id: 'metricReportRepeatCustomers', animate: Number(orders.repeatCustomers) || 0 }
      ]
    ];
    bits.push([
      'Cancellation rate',
      cancel != null ? cancel + '%' : '—',
      cancel == null
        ? { id: 'metricReportCancellation' }
        : {
            id: 'metricReportCancellation',
            animate: cancel,
            format: function (n) {
              return Math.round(n) + '%';
            }
          }
    ]);
    return bits;
  }

  function reportHtml(data, orders) {
    data = data || {};
    orders = orders || null;
    var days = data.periodDays || 30;
    var funnel = data.observedFunnel || {};
    var dishes = topNamedLines(data.dishes, 5);
    var sources = (data.sources || []).slice(0, 4).map(function (row) {
      return [row.name, count(row.count)];
    });
    var devices = (data.devices || []).slice(0, 4).map(function (row) {
      return [row.name, count(row.count)];
    });
    var regions = (data.regions || []).slice(0, 4).map(function (row) {
      return [row.name, count(row.count)];
    });
    var peaks = peakDays(data.rows || []).slice(0, 5).map(function (row) {
      return [row.name, count(row.count)];
    });
    var hours = peakHours(data.hours, 5).map(function (row) {
      return [row.name, count(row.count)];
    });
    var countries = focusCountries(data.countries) || [];
    var headlineBits = reportHeadlineBits(data);
    var orderingBits = reportOrderingBits(orders, data);
    var salesBits = reportSalesBits(orders);
    var animateBits = headlineBits.concat(orderingBits, salesBits);
    var html =
      '<div class="insights-report">' +
      '<header class="insights-report-hero">' +
      '<p class="insights-report-kicker">Period report</p>' +
      '<h3 class="insights-report-title">Last ' +
      escapeHtml(String(days)) +
      ' days</h3>' +
      '<p class="dashboard-analytics-subtitle">A full snapshot of visitors, menu interest, unconfirmed ordering, and completed sales for this window. Switch 7 / 30 / 90 above to refresh it.</p>' +
      '</header>';

    html += reportSection('Headline metrics', metricCards(headlineBits));

    html += reportSection(
      'Audience',
      reportList(
        [
          ['Visits', count(data.visits)],
          ['Unique visitors', count(data.uniqueVisitors)],
          ['New visits', count(data.newVisits)],
          ['Returning visits', count(data.returningVisits)]
        ].concat(
          countries.map(function (row) {
            return [row.name, count(row.count)];
          })
        )
      ) +
        (sources.length
          ? '<h4 class="insights-report-subtitle">Traffic sources</h4>' + reportList(sources)
          : '') +
        (devices.length
          ? '<h4 class="insights-report-subtitle">Devices</h4>' + reportList(devices)
          : '') +
        (regions.length
          ? '<h4 class="insights-report-subtitle">Trinidad and Tobago regions</h4>' + reportList(regions)
          : '')
    );

    html += reportSection(
      'Menu interest',
      reportList([
        ['Menu views', count(data.pageViews)],
        ['Menu item views', count(data.menuItemViews)],
        ['Searches', count(searchCount(data))],
        ['Locations chosen', count((data.locations || []).reduce(function (sum, row) {
          return sum + (Number(row.count) || 0);
        }, 0))]
      ]) +
        (dishes.length
          ? '<h4 class="insights-report-subtitle">Top dishes</h4>' + reportList(dishes)
          : '<p class="dashboard-analytics-subtitle">No clean dish names in this period yet.</p>')
    );

    html += reportSection(
      'Ordering funnel',
      funnelHtml(funnel) +
        '<p class="dashboard-analytics-subtitle">' +
        escapeHtml(cartAbandonmentHtml(funnel)) +
        '</p>'
    );

    var peakBody =
      (peaks.length ? '<h4 class="insights-report-subtitle">Busiest days</h4>' + reportList(peaks) : '') +
      (hours.length ? '<h4 class="insights-report-subtitle">Busiest hours</h4>' + reportList(hours) : '');
    html += reportSection(
      'Peak times',
      peakBody ||
        '<p class="dashboard-analytics-subtitle">Peak timing appears once daily activity is recorded.</p>'
    );

    html += reportSection(
      'Contact actions',
      reportList([
        ['Phone', count(data.phoneClicks)],
        ['WhatsApp', count(data.whatsappClicks)],
        ['Directions', count(data.directionClicks)]
      ])
    );

    if (orderingBits.length) {
      html += reportSection('Unconfirmed ordering', metricCards(orderingBits));
    } else if (flag('data-ordering')) {
      html += reportSection(
        'Unconfirmed ordering',
        '<p class="dashboard-analytics-subtitle">Open ticket value and menu order clicks appear here once guests start ordering in this period.</p>'
      );
    }

    if (salesBits.length) {
      html += reportSection('Completed TTMenus sales', metricCards(salesBits));
    } else if (flag('data-ordering')) {
      html += reportSection(
        'Completed TTMenus sales',
        '<p class="dashboard-analytics-subtitle">Completed sales appear when tickets become ready or paid. Open tickets stay under unconfirmed ordering.</p>'
      );
    }

    html += reportSection(
      'Recommendations snapshot',
      '<ol class="insights-report-recs">' +
        buildRecommendations(data, orders)
          .slice(0, 4)
          .map(function (rec) {
            return '<li><strong>' + escapeHtml(rec.title) + '</strong><span>' + escapeHtml(rec.detail) + '</span></li>';
          })
          .join('') +
        '</ol>'
    );

    html +=
      '<p class="insights-report-footnote">Order clicks and cart abandonment are observed menu events. Open tickets are unconfirmed sales. Ready and paid tickets are completed sales.</p></div>';
    return { html: html, bits: animateBits };
  }

  function applyOrderStats(stats) {
    if (!stats) return;
    if (shell()) shell()._orderStats = stats;
    var data = (shell() && shell()._insightsData) || {};
    showNav({
      orders: true,
      sales: true,
      customers: true,
      pos: flag('data-loyverse')
    });
    setMetricPanel('insightsOrders', ordersPanel(stats, data));
    setMetricPanel('insightsSales', salesHtml(stats));
    setMetricPanel('insightsCustomers', customersHtml(data, stats));
    if (flag('data-loyverse')) setMetricPanel('insightsPos', posHtml(stats));
    if (shell() && shell()._insightsData) {
      setMetricPanel('insightsReports', reportHtml(shell()._insightsData, stats));
      setText('insightsRecommendations', recommendationsHtml(shell()._insightsData, stats));
    }
  }

  function receiptModeLabel(mode) {
    mode = String(mode || '').toLowerCase();
    if (mode === 'direct') return 'Send receipt as soon as the guest orders';
    if (mode === 'off') return 'Don’t send a Loyverse receipt';
    return 'Send receipt when staff tap Charge';
  }

  function posConfigSummary() {
    var cfg = global.POS_CONFIG || {};
    var orderCfg = global.ORDER_CONFIG || {};
    var mode = cfg.loyverseReceiptMode || orderCfg.loyverseReceiptMode || '';
    if (!mode && cfg.autoProcessOrders) mode = 'direct';
    if (!mode) mode = 'on_payment';
    return {
      enabled: cfg.enabled !== false,
      provider: String(cfg.provider || 'loyverse'),
      mode: mode,
      modeLabel: receiptModeLabel(mode),
      storeId: String(cfg.storeId || '').trim(),
      requiredOnly: cfg.syncMenu !== false,
      clientId: String(cfg.clientId || orderClientId() || '').trim()
    };
  }

  function posMetricBits(stats) {
    stats = stats || {};
    var currency = stats.currency || 'TTD';
    var receipts = Number(stats.loyverseReceiptCount) || 0;
    var receiptValue = Number(stats.loyverseReceiptValue) || 0;
    var queued = Number(stats.loyverseReceiptQueued) || 0;
    var failed = Number(stats.loyverseReceiptFailed) || 0;
    var bits = [
      ['Verified receipts', count(receipts), { id: 'metricPosReceipts', animate: receipts }],
      [
        'Receipt value',
        money(receiptValue, currency),
        {
          id: 'metricPosReceiptValue',
          animate: receiptValue,
          format: function (n) {
            return money(n, currency);
          }
        }
      ],
      ['Queued receipts', count(queued), { id: 'metricPosReceiptQueued', animate: queued }],
      ['Failed receipts', count(failed), { id: 'metricPosReceiptFailed', animate: failed }]
    ];
    return bits;
  }

  function posHtml(stats) {
    var cfg = posConfigSummary();
    var details = [
      ['Status', 'Connected'],
      ['Receipt timing', cfg.modeLabel],
      ['Catalog matching', cfg.requiredOnly ? 'Only items needed for this menu' : 'Full Loyverse catalog'],
      ['Fallback till', cfg.storeId ? 'Set' : 'First Loyverse store if a location has none']
    ];
    if (cfg.clientId) details.push(['Menu client', cfg.clientId]);
    var bits = stats ? posMetricBits(stats) : [];
    var html =
      '<div class="insights-pos" data-state="connected">' +
      '<div class="insights-pos-bridge" aria-hidden="true">' +
      '<div class="insights-pos-node insights-pos-node--ttmenus">' +
      '<span class="insights-pos-node-glow"></span>' +
      '<img class="insights-pos-logo insights-pos-logo--ttmenus" src="/branding/favicon192.webp" alt="" width="48" height="48">' +
      '<span class="insights-pos-node-label">TTMenus</span>' +
      '</div>' +
      '<div class="insights-pos-link">' +
      '<span class="insights-pos-link-rail"></span>' +
      '<span class="insights-pos-link-pulse"></span>' +
      '<span class="insights-pos-packet insights-pos-packet--a"></span>' +
      '<span class="insights-pos-packet insights-pos-packet--b"></span>' +
      '<span class="insights-pos-packet insights-pos-packet--c"></span>' +
      '<span class="insights-pos-link-label">Receipts</span>' +
      '</div>' +
      '<div class="insights-pos-node insights-pos-node--loyverse">' +
      '<span class="insights-pos-node-glow"></span>' +
      '<img class="insights-pos-logo insights-pos-logo--loyverse" src="/icons/loyverse-mark.svg" alt="" width="48" height="48">' +
      '<span class="insights-pos-node-label">Loyverse</span>' +
      '</div>' +
      '</div>' +
      '<p class="insights-pos-status"><span class="insights-pos-status-dot" aria-hidden="true"></span>Linked for till receipts</p>' +
      '<p class="dashboard-analytics-subtitle">Verified receipts are TTMenus tickets that already posted a Loyverse receipt number. Queued and failed counts are still waiting on the till bridge. In-store Loyverse sales are not imported here.</p>' +
      (bits.length ? metricCards(bits) : '') +
      '<h3 class="dashboard-notify-subsection-title">Connection details</h3>' +
      '<ul class="insights-pos-details">' +
      details
        .map(function (row) {
          return (
            '<li><span>' +
            escapeHtml(row[0]) +
            '</span><strong>' +
            escapeHtml(row[1]) +
            '</strong></li>'
          );
        })
        .join('') +
      '</ul>' +
      '</div>';
    return { html: html, bits: bits };
  }

  function orderClientId() {
    var cfg = global.ORDER_CONFIG || {};
    return String(
      cfg.clientId ||
        global.CLIENT_ID ||
        global.SITE_CLIENT_ID ||
        global.CMS_CLIENT_ID ||
        (global.POS_CONFIG && global.POS_CONFIG.clientId) ||
        ''
    ).trim();
  }

  function loadOrders(days) {
    if (!flag('data-ordering')) return Promise.resolve();
    var cfg = global.ORDER_CONFIG || {};
    var base = String(cfg.apiUrl || '').replace(/\/$/, '');
    if (!base) {
      setText('insightsOrders', '<p class="dashboard-analytics-subtitle">Ordering is enabled, but the order service address is not configured. Menu order clicks are not sales.</p>');
      setText('insightsSales', '<p class="dashboard-analytics-subtitle">Sales need the order service address in site settings.</p>');
      return Promise.resolve();
    }
    if (!/\/api\/v1$/i.test(base)) {
      base = base.replace(/\/$/, '') + '/api/v1';
    }
    var period = days || 30;
    var cid = orderClientId();
    var url =
      base +
      '/client/orders/stats?days=' +
      encodeURIComponent(String(period));
    if (cid) url += '&client_id=' + encodeURIComponent(cid);

    function orderHeaders() {
      var headers = { Accept: 'application/json' };
      if (cid) headers['X-TTMenus-Client-Id'] = cid;
      var snap = global.DashboardAnalyticsSnapshot;
      if (snap && typeof snap.authHeaders === 'function') {
        return Object.assign(headers, snap.authHeaders());
      }
      var ac = global.AuthClient;
      if (ac && typeof ac.getAccessToken === 'function') {
        var token = ac.getAccessToken();
        if (token) headers.Authorization = 'Bearer ' + token;
      }
      return headers;
    }

    function fetchOrders() {
      if (global.DashboardAnalyticsSnapshot && DashboardAnalyticsSnapshot.fetchWithAuth) {
        return DashboardAnalyticsSnapshot.fetchWithAuth(url, {
          headers: cid ? { 'X-TTMenus-Client-Id': cid } : undefined
        });
      }
      return fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: orderHeaders()
      }).then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, status: res.status, data: data };
        });
      });
    }

    var ready = Promise.resolve();
    if (global.DashboardAnalyticsSnapshot && typeof DashboardAnalyticsSnapshot.ensureAccessTokenForCms === 'function') {
      ready = DashboardAnalyticsSnapshot.ensureAccessTokenForCms();
    }
    return ready
      .then(fetchOrders)
      .then(function (result) {
        if (!result || !result.ok) {
          var why =
            result && result.data && (result.data.error || result.data.message)
              ? String(result.data.error || result.data.message)
              : 'TTMenus orders could not be loaded';
          setText(
            'insightsOrders',
            '<p class="dashboard-analytics-subtitle">' +
              escapeHtml(why) +
              '. Menu order clicks stay under customer actions and are not sales.</p>'
          );
          setText(
            'insightsSales',
            '<p class="dashboard-analytics-subtitle">' +
              escapeHtml(why) +
              '. Sales appear when verified orders load.</p>'
          );
          setMetricPanel('insightsCustomers', customersHtml((shell() && shell()._insightsData) || {}, null));
          return;
        }
        applyOrderStats(result.data || {});
      })
      .catch(function () {
        setText('insightsOrders', '<p class="dashboard-analytics-subtitle">TTMenus orders could not be loaded. Menu order clicks stay under customer actions and are not sales.</p>');
        setText('insightsSales', '<p class="dashboard-analytics-subtitle">TTMenus sales could not be loaded for this period.</p>');
        setMetricPanel('insightsCustomers', customersHtml((shell() && shell()._insightsData) || {}, null));
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
    var ordering = flag('data-ordering');
    showNav({
      promotions: false,
      orders: ordering,
      sales: ordering,
      customers: ordering,
      pos: flag('data-loyverse')
    });
  }

  global.InsightsPlatform = {
    render: render,
    loadOrders: loadOrders,
    mount: mount
  };
})(typeof window !== 'undefined' ? window : this);
