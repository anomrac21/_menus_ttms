/**
 * Client dashboard — notify-service: metrics, send, recent history, reports.
 * Expects window.NOTIFY_CONFIG.apiUrl, AuthClient.getAccessToken, and AuthClientAccess (guard runs in page).
 */
(function () {
  'use strict';

  /** Hugo jsonify in application/json tags can double-encode; normalize once. */
  function resolveNotifyConfig() {
    var cfg = window.NOTIFY_CONFIG;
    if (typeof cfg === 'string') {
      try {
        cfg = JSON.parse(cfg);
      } catch (e) {
        cfg = null;
      }
    }
    if (cfg && typeof cfg === 'object') {
      window.NOTIFY_CONFIG = cfg;
      return cfg;
    }
    return window.NOTIFY_CONFIG || {};
  }

  function getApiBase() {
    var page = document.getElementById('dashboardNotificationsPage');
    var cfg = resolveNotifyConfig();
    var base =
      (page && page.getAttribute('data-notify-api-url')) ||
      (cfg && cfg.apiUrl) ||
      '';
    if (!base && window.SiteConfig && window.SiteConfig.notifyServiceUrl) {
      base = String(window.SiteConfig.notifyServiceUrl).replace(/\/+$/, '') + '/api/v1';
    }
    return String(base).replace(/\/+$/, '');
  }

  function setFormsApiDisabled(disabled) {
    ['dashboardNotifySendForm', 'dashboardNotifyWelcomeForm'].forEach(function (id) {
      var form = document.getElementById(id);
      if (!form) return;
      form.querySelectorAll('input, textarea, select, button').forEach(function (el) {
        el.disabled = disabled;
      });
    });
  }

  function getClientDomain() {
    var page = document.getElementById('dashboardNotificationsPage');
    var fromPage = page && page.getAttribute('data-notify-client-domain');
    if (fromPage) return fromPage;
    var cfg = resolveNotifyConfig();
    if (cfg && cfg.clientDomain) {
      return cfg.clientDomain;
    }
    return window.location.hostname || '';
  }

  function authHeaders() {
    var h = { Accept: 'application/json', 'Content-Type': 'application/json' };
    var token =
      (window.AuthClient && AuthClient.getAccessToken && AuthClient.getAccessToken());
    if (token) h.Authorization = 'Bearer ' + token;
    return h;
  }

  async function ensureNotifyToken() {
    if (window.AuthClient && AuthClient.getAccessToken && AuthClient.getAccessToken()) {
      return AuthClient.getAccessToken();
    }
    if (window.AuthClient && typeof AuthClient.ensureAccessToken === 'function') {
      var result = await AuthClient.ensureAccessToken();
      if (result.success) return AuthClient.getAccessToken();
    }
    return null;
  }

  async function notifyFetch(path, options) {
    var base = getApiBase();
    if (!base) {
      throw new Error('Notification API URL is not configured (site notifications).');
    }
    await ensureNotifyToken();
    var url = base + path;
    var headers = Object.assign({}, authHeaders(), (options && options.headers) || {});
    var res = await fetch(url, Object.assign({ credentials: 'include' }, options || {}, { headers: headers }));
    if (res.status === 401) {
      if (window.AuthClient && AuthClient.logout) {
        await AuthClient.logout().catch(function () {});
      }
      window.location.href = '/login/';
      throw new Error('Session expired. Please sign in again.');
    }
    var text = await res.text();
    var data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (e) {
      if (!res.ok) throw new Error(text || res.statusText);
    }
    if (!res.ok) {
      var msg =
        (data && (data.error || data.message)) || text || 'Request failed (' + res.status + ')';
      throw new Error(msg);
    }
    return data;
  }

  function formatNum(n) {
    if (n == null || isNaN(n)) return '—';
    return String(Math.round(Number(n) * 10) / 10);
  }

  function formatInt(n) {
    if (n == null || isNaN(n)) return '—';
    return String(Math.floor(Number(n)));
  }

  function escapeHtml(s) {
    if (s == null) return '';
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function setMetricMeta(id, text) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = text || '';
    el.hidden = !text;
  }

  function formatPercent(value) {
    if (value == null || isNaN(value)) return '—';
    return Math.round(Number(value)) + '%';
  }

  function formatRateLabel(count, rate) {
    if (count == null) return '';
    if (rate == null || isNaN(rate)) return formatInt(count) + ' total';
    return formatPercent(rate) + ' of reached';
  }

  function formatCount(n) {
    if (n == null || n === '') return '—';
    try {
      return new Intl.NumberFormat(undefined).format(Number(n));
    } catch (e) {
      return String(n);
    }
  }

  function cardErrorMessage(status, data) {
    var err = (data && (data.error || data.message)) || String(status);
    if (status === 401) return 'Sign in to load notification stats.';
    if (status === 403) return 'You do not have access to notification stats for this site.';
    if (status === 404) {
      return 'Site not registered with notify service (check params.notifications.clientDomain).';
    }
    return 'Could not load notification stats (' + err + ').';
  }

  function fetchOverview(days) {
    days = days || 30;
    var domain = getClientDomain();
    var url =
      getApiBase() +
      '/analytics/overview?client_domain=' +
      encodeURIComponent(domain) +
      '&days=' +
      encodeURIComponent(String(days));
    return fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: authHeaders(),
    }).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch (e) {}
        return { ok: res.ok, status: res.status, data: data };
      });
    });
  }

  /**
   * Dashboard control-room card: subscribers + sent (30d).
   */
  function loadDashboardCard(options) {
    options = options || {};
    var days = options.days || 30;
    var subsEl = document.getElementById('dashboardCardNotifySubs');
    var sentEl = document.getElementById('dashboardCardNotifySent');
    var hint = document.getElementById('dashboardCardNotifyHint');
    var snap = document.getElementById('dashboardCardNotifySnapshot');
    if (!subsEl || !sentEl) return Promise.resolve();

    if (!getApiBase()) {
      if (hint) {
        hint.textContent = 'Notification API is not configured.';
        hint.classList.remove('hidden');
      }
      return Promise.resolve();
    }

    if (!authHeaders().Authorization) {
      if (hint) {
        hint.textContent = 'Sign in to load notification stats.';
        hint.classList.remove('hidden');
      }
      return Promise.resolve();
    }

    return fetchOverview(days)
      .then(function (x) {
        if (!x.ok) {
          if (hint) {
            hint.textContent = cardErrorMessage(x.status, x.data);
            hint.classList.remove('hidden');
          }
          if (snap) snap.setAttribute('aria-label', 'Notification snapshot unavailable');
          return;
        }
        var ov = (x.data && x.data.overview) || {};
        var sub = ov.subscriptions || {};
        var notif = ov.notifications || {};
        subsEl.textContent = formatCount(sub.active);
        sentEl.textContent = formatCount(notif.in_period);
        if (hint) hint.classList.add('hidden');
        if (snap) {
          snap.setAttribute(
            'aria-label',
            'Notification snapshot, last ' +
              days +
              ' days: ' +
              formatCount(sub.active) +
              ' subscribers, ' +
              formatCount(notif.in_period) +
              ' sent'
          );
        }
      })
      .catch(function () {
        if (hint) {
          hint.textContent = 'Could not load notification stats. Try again later.';
          hint.classList.remove('hidden');
        }
      });
  }

  function setStatus(el, msg, isError) {
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('dashboard-notify-status-error', !!isError);
  }

  function sumTrendField(rows, field) {
    return (rows || []).reduce(function (total, row) {
      return total + (Number(row && row[field]) || 0);
    }, 0);
  }

  async function loadMetrics() {
    var domain = getClientDomain();
    var q = '?client_domain=' + encodeURIComponent(domain) + '&days=30';
    var headers = authHeaders();

    var overview = await notifyFetch('/analytics/overview' + q, { headers: headers });
    var subTrends = await notifyFetch('/analytics/subscription-trends' + q, { headers: headers }).catch(
      function () {
        return { data: [] };
      }
    );

    var ov = (overview && overview.overview) || {};
    var sub = ov.subscriptions || {};
    var notif = ov.notifications || {};
    var trendRows = (subTrends && subTrends.data) || [];
    var newSubscribers = sumTrendField(trendRows, 'new_subscribed');
    var unsubscribes = sumTrendField(trendRows, 'new_unsubscribed');

    var attempts = Number(notif.delivery_attempts) || 0;
    var delivered = Number(notif.delivered) || 0;
    var notDelivered =
      notif.not_delivered != null
        ? Number(notif.not_delivered)
        : Math.max(0, attempts - delivered);

    setText('metricNotifySent30d', formatInt(notif.in_period));
    setMetricMeta(
      'metricNotifySent30dMeta',
      attempts ? formatInt(attempts) + ' delivery attempts' : ''
    );
    setText('metricNotifySubscribers', formatInt(sub.active));
    setText('metricNotifyArrived30d', formatInt(delivered));
    setMetricMeta(
      'metricNotifyArrived30dMeta',
      attempts
        ? formatPercent(notif.arrival_rate) + ' · ' + formatInt(attempts) + ' recipients'
        : ''
    );
    setText('metricNotifyOpened30d', formatInt(notif.confirmed));
    setMetricMeta(
      'metricNotifyOpened30dMeta',
      delivered ? formatRateLabel(notif.confirmed, notif.open_rate) : ''
    );
    setText('metricNotifyNotArrived30d', formatInt(notDelivered));
    setMetricMeta(
      'metricNotifyNotArrived30dMeta',
      attempts ? formatInt(notif.pending || 0) + ' pending · ' + formatInt(notif.failed || 0) + ' failed' : ''
    );
    setText('metricNotifyClicked30d', formatInt(notif.clicked));
    setMetricMeta(
      'metricNotifyClicked30dMeta',
      delivered ? formatRateLabel(notif.clicked, notif.click_rate) : ''
    );
    setText('metricNotifyNewSubscribers30d', formatInt(newSubscribers));
    setMetricMeta(
      'metricNotifyNewSubscribers30dMeta',
      sub.active != null ? formatInt(sub.active) + ' active now' : ''
    );
    setText('metricNotifyUnsubscribes30d', formatInt(unsubscribes));
    setMetricMeta(
      'metricNotifyUnsubscribes30dMeta',
      newSubscribers || unsubscribes
        ? (newSubscribers >= unsubscribes ? '+' : '') +
            formatInt(newSubscribers - unsubscribes) +
            ' net change'
        : ''
    );
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

  function mergeNotifyTrendRows(engagementRows, subscriptionRows) {
    var byDate = {};

    function ensureRow(date) {
      if (!byDate[date]) {
        byDate[date] = {
          date: date,
          sent: 0,
          delivered: 0,
          confirmed: 0,
          clicked: 0,
          subscribed: 0,
          unsubscribed: 0,
        };
      }
      return byDate[date];
    }

    (engagementRows || []).forEach(function (row) {
      var merged = ensureRow(row.date);
      merged.sent = Number(row.sent) || 0;
      merged.delivered = Number(row.delivered) || 0;
      merged.confirmed = Number(row.confirmed) || 0;
      merged.clicked = Number(row.clicked) || 0;
    });

    (subscriptionRows || []).forEach(function (row) {
      var merged = ensureRow(row.date);
      merged.subscribed = Number(row.new_subscribed) || 0;
      merged.unsubscribed = Number(row.new_unsubscribed) || 0;
    });

    return Object.keys(byDate)
      .sort()
      .map(function (date) {
        return byDate[date];
      });
  }

  function renderNotifyTrendChart(rows) {
    var chart = document.getElementById('dashboardNotifyTrendChart');
    var empty = document.getElementById('dashboardNotifyTrendEmpty');
    if (!chart) return;

    rows = rows || [];
    var hasData = rows.some(function (r) {
      return (
        (r.sent || 0) +
          (r.delivered || 0) +
          (r.confirmed || 0) +
          (r.clicked || 0) +
          (r.subscribed || 0) +
          (r.unsubscribed || 0) >
        0
      );
    });

    if (!hasData) {
      chart.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    var width = 960;
    var height = 260;
    var pad = { top: 16, right: 12, bottom: 36, left: 40 };
    var innerW = width - pad.left - pad.right;
    var innerH = height - pad.top - pad.bottom;
    var maxVal = 1;

    rows.forEach(function (r) {
      maxVal = Math.max(
        maxVal,
        r.sent || 0,
        r.delivered || 0,
        r.confirmed || 0,
        r.clicked || 0,
        r.subscribed || 0,
        r.unsubscribed || 0
      );
    });

    var series = [
      { key: 'sent', label: 'Sent', className: 'dashboard-notify-trends-bar--sent' },
      { key: 'delivered', label: 'Arrived', className: 'dashboard-notify-trends-bar--delivered' },
      { key: 'confirmed', label: 'Opened', className: 'dashboard-notify-trends-bar--confirmed' },
      { key: 'clicked', label: 'Clicked', className: 'dashboard-notify-trends-bar--clicked' },
      { key: 'subscribed', label: 'Subscribers', className: 'dashboard-notify-trends-bar--subscribed' },
      { key: 'unsubscribed', label: 'Unsubscribed', className: 'dashboard-notify-trends-bar--unsubscribed' },
    ];
    var seriesCount = series.length;
    var barGroupW = innerW / rows.length;
    var barW = Math.max(2, Math.min(5, (barGroupW - 8) / seriesCount));

    var svg =
      '<svg class="dashboard-notify-trends-svg" viewBox="0 0 ' +
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
        var x = groupX - (barW * seriesCount + (seriesCount - 1) * 2) / 2 + seriesIndex * (barW + 2);
        var y = pad.top + innerH - barH;
        svg +=
          '<rect class="dashboard-notify-trends-bar ' +
          s.className +
          '" x="' +
          x +
          '" y="' +
          y +
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

      if (index % 5 === 0 || index === rows.length - 1) {
        svg +=
          '<text class="dashboard-notify-trends-axis-x" x="' +
          groupX +
          '" y="' +
          (height - 10) +
          '" text-anchor="middle">' +
          escapeHtml(formatShortDate(row.date)) +
          '</text>';
      }
    });

    svg += '</svg>';
    chart.innerHTML = svg;
    chart.setAttribute(
      'aria-label',
      'Notification activity chart for the last 30 days with daily sends, delivery outcomes, and subscriber changes'
    );
  }

  async function loadEngagementTrends() {
    var domain = getClientDomain();
    var q =
      '?client_domain=' + encodeURIComponent(domain) + '&days=30';
    var headers = authHeaders();

    var engagement = await notifyFetch('/analytics/engagement-trends' + q, { headers: headers });
    var subscriptions = await notifyFetch('/analytics/subscription-trends' + q, { headers: headers }).catch(
      function () {
        return { data: [] };
      }
    );

    renderNotifyTrendChart(
      mergeNotifyTrendRows(
        (engagement && engagement.data) || [],
        (subscriptions && subscriptions.data) || []
      )
    );
  }

  function deliveryStats(deliveries) {
    var stats = {
      sent: deliveries.length,
      arrived: 0,
      opened: 0,
      clicked: 0,
      notArrived: 0,
    };
    deliveries.forEach(function (d) {
      var status = (d && d.status) || '';
      if (status === 'delivered' || status === 'confirmed' || status === 'clicked') {
        stats.arrived++;
      }
      if (status === 'confirmed' || status === 'clicked') {
        stats.opened++;
      }
      if (status === 'clicked') {
        stats.clicked++;
      }
      if (status === 'failed' || status === 'pending') {
        stats.notArrived++;
      }
    });
    return stats;
  }

  function formatDeliveryStatus(status) {
    var labels = {
      delivered: 'Arrived',
      confirmed: 'Opened',
      clicked: 'Clicked',
      pending: 'Pending',
      failed: 'Not arrived',
      bounced: 'Bounced',
      unsubscribed: 'Unsubscribed',
    };
    return labels[status] || status || '—';
  }

  function renderNotificationDetail(container, data) {
    var deliveries = (data && data.deliveries) || [];
    var stats = deliveryStats(deliveries);

    var html =
      '<div class="dashboard-notify-detail-stats">' +
      '<span class="dashboard-notify-detail-stat"><strong>Sent:</strong> ' +
      formatInt(stats.sent) +
      '</span>' +
      '<span class="dashboard-notify-detail-stat"><strong>Arrived:</strong> ' +
      formatInt(stats.arrived) +
      '</span>' +
      '<span class="dashboard-notify-detail-stat"><strong>Opened:</strong> ' +
      formatInt(stats.opened) +
      '</span>' +
      '<span class="dashboard-notify-detail-stat"><strong>Not arrived:</strong> ' +
      formatInt(stats.notArrived) +
      '</span>' +
      (stats.clicked
        ? '<span class="dashboard-notify-detail-stat"><strong>Clicked:</strong> ' +
          formatInt(stats.clicked) +
          '</span>'
        : '') +
      '</div>';

    if (!deliveries.length) {
      html += '<p class="dashboard-notify-detail-empty">No delivery records for this notification.</p>';
      container.innerHTML = html;
      return;
    }

    html +=
      '<div class="dashboard-notify-table-wrap dashboard-notify-detail-table-wrap">' +
      '<table class="dashboard-notify-table dashboard-notify-detail-table" aria-label="Delivery details">' +
      '<thead><tr>' +
      '<th scope="col">Subscription ID</th>' +
      '<th scope="col">Status</th>' +
      '<th scope="col">Arrived</th>' +
      '<th scope="col">Opened</th>' +
      '<th scope="col">Error</th>' +
      '</tr></thead><tbody>';

    deliveries.forEach(function (d) {
      var subId = d.subscription_id || '—';
      var status = (d && d.status) || '';
      var arrivedAt = d.delivered_at ? new Date(d.delivered_at).toLocaleString() : '—';
      var openedAt = d.confirmed_at
        ? new Date(d.confirmed_at).toLocaleString()
        : d.clicked_at
          ? new Date(d.clicked_at).toLocaleString()
          : '—';
      var errMsg = (d.error_message || '').trim();
      html +=
        '<tr>' +
        '<td><code class="dashboard-notify-sub-id">' +
        escapeHtml(String(subId)) +
        '</code></td>' +
        '<td><span class="dashboard-notify-status-badge dashboard-notify-status-badge--' +
        escapeHtml(status) +
        '">' +
        escapeHtml(formatDeliveryStatus(status)) +
        '</span></td>' +
        '<td>' +
        escapeHtml(arrivedAt) +
        '</td>' +
        '<td>' +
        escapeHtml(openedAt) +
        '</td>' +
        '<td class="dashboard-notify-error-cell">' +
        (errMsg ? escapeHtml(errMsg) : '—') +
        '</td>' +
        '</tr>';
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
  }

  async function toggleNotificationDetail(li, notificationId) {
    var detail = li.querySelector('.dashboard-notify-history-detail');
    if (!detail) return;

    var isOpen = li.classList.contains('dashboard-notify-history-item--open');
    if (isOpen) {
      li.classList.remove('dashboard-notify-history-item--open');
      detail.hidden = true;
      return;
    }

    li.classList.add('dashboard-notify-history-item--open');
    detail.hidden = false;
    detail.innerHTML =
      '<p class="dashboard-notify-detail-loading"><i class="fa fa-spinner fa-spin" aria-hidden="true"></i> Loading delivery data…</p>';

    try {
      var data = await notifyFetch('/notifications/' + encodeURIComponent(notificationId), {
        headers: authHeaders(),
      });
      renderNotificationDetail(detail, data);
    } catch (err) {
      detail.innerHTML =
        '<p class="dashboard-notify-detail-error">' +
        escapeHtml(err.message || 'Could not load delivery details.') +
        '</p>';
    }
  }

  function isWelcomeNotification(n) {
    var data = n && n.data;
    if (!data) return false;
    if (data.welcome === true || data.welcome === 'true') return true;
    return false;
  }

  function isAdminPhotoNotification(n) {
    var data = n && n.data;
    if (!data) return false;
    if (data.photo_review === true || data.photo_review === 'true') return true;
    return false;
  }

  function renderNotificationHistoryItem(n) {
    var li = document.createElement('li');
    li.className = 'dashboard-notify-history-item';
    var title = n.title || '(no title)';
    var created = n.created_at || '';
    try {
      created = created ? new Date(created).toLocaleString() : '';
    } catch (e) {}
    var status = n.status || '';
    var notifId = n.id || '';

    li.innerHTML =
      '<button type="button" class="dashboard-notify-history-toggle" aria-expanded="false">' +
      '<span class="dashboard-notify-history-title">' +
      escapeHtml(title) +
      '</span>' +
      '<span class="dashboard-notify-history-meta">' +
      escapeHtml(created) +
      (status ? ' · ' + escapeHtml(status) : '') +
      '</span>' +
      '<span class="dashboard-notify-history-chevron" aria-hidden="true"><i class="fa fa-chevron-down"></i></span>' +
      '</button>' +
      '<div class="dashboard-notify-history-detail" hidden></div>';

    if (notifId) {
      li.setAttribute('data-notification-id', notifId);
      var btn = li.querySelector('.dashboard-notify-history-toggle');
      btn.addEventListener('click', function () {
        var open = li.classList.contains('dashboard-notify-history-item--open');
        toggleNotificationDetail(li, notifId);
        btn.setAttribute('aria-expanded', open ? 'false' : 'true');
      });
    }

    return li;
  }

  async function loadNotificationHistory(options) {
    options = options || {};
    var filter = options.filter || 'sent';
    var listId = options.listId || 'dashboardNotifyRecentList';
    var emptyId = options.emptyId || 'dashboardNotifyRecentEmpty';

    var domain = getClientDomain();
    var path =
      '/notifications?client_domain=' + encodeURIComponent(domain) + '&limit=50';
    var data = await notifyFetch(path, { headers: authHeaders() });
    var list = document.getElementById(listId);
    var empty = document.getElementById(emptyId);
    if (!list) return;

    var items = (data && data.notifications) || [];
    if (filter === 'welcome') {
      items = items.filter(isWelcomeNotification);
    } else if (filter === 'sent') {
      items = items.filter(function (n) {
        return !isWelcomeNotification(n) && !isAdminPhotoNotification(n);
      });
    }

    list.innerHTML = '';
    if (!items.length) {
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    items.forEach(function (n) {
      list.appendChild(renderNotificationHistoryItem(n));
    });
  }

  async function loadRecent() {
    return loadNotificationHistory({
      filter: 'sent',
      listId: 'dashboardNotifyRecentList',
      emptyId: 'dashboardNotifyRecentEmpty',
    });
  }

  async function loadWelcomeHistory() {
    return loadNotificationHistory({
      filter: 'welcome',
      listId: 'dashboardNotifyWelcomeList',
      emptyId: 'dashboardNotifyWelcomeEmpty',
    });
  }

  function menuImageApiBase() {
    var cfg =
      typeof window.MENU_IMAGE_CONFIG !== 'undefined' ? window.MENU_IMAGE_CONFIG : null;
    return cfg && cfg.apiUrl ? String(cfg.apiUrl).replace(/\/+$/, '') : '';
  }

  function menuImageClientId() {
    var cfg =
      typeof window.MENU_IMAGE_CONFIG !== 'undefined' ? window.MENU_IMAGE_CONFIG : null;
    return (
      window.CLIENT_ID ||
      window.SITE_CLIENT_ID ||
      (cfg && cfg.clientId) ||
      ''
    );
  }

  function photoThumbUrl(url) {
    if (!url) return '';
    if (typeof window.TtmsThumbor !== 'undefined' && window.TtmsThumbor.menuImageSrc) {
      return window.TtmsThumbor.menuImageSrc(url, 'carousel') || url;
    }
    var thumbor =
      (typeof window.MENU_IMAGE_THUMBOR_URL !== 'undefined' &&
        window.MENU_IMAGE_THUMBOR_URL) ||
      'https://thumbor.ttmenus.com';
    return (
      String(thumbor).replace(/\/+$/, '') +
      '/unsafe/fit-in/240x300/' +
      encodeURIComponent(url)
    );
  }

  function menuItemTitle(path) {
    var p = String(path || '').replace(/\/$/, '');
    var slug = p.split('/').filter(Boolean).pop() || 'Menu item';
    return slug.replace(/-/g, ' ').replace(/\b\w/g, function (c) {
      return c.toUpperCase();
    });
  }

  async function loadPhotoApprovals() {
    var list = document.getElementById('dashboardNotifyPhotosList');
    var empty = document.getElementById('dashboardNotifyPhotosEmpty');
    var errEl = document.getElementById('dashboardNotifyPhotosError');
    if (!list) return;

    list.innerHTML = '';
    if (empty) empty.hidden = true;
    if (errEl) {
      errEl.hidden = true;
      errEl.textContent = '';
    }

    var base = menuImageApiBase();
    if (!base || !(window.MENU_IMAGE_CONFIG && window.MENU_IMAGE_CONFIG.enabled)) {
      if (empty) {
        empty.hidden = false;
        empty.textContent = 'Menu photo approvals are not enabled for this site.';
      }
      return;
    }

    try {
      await ensureNotifyToken();
      if (window.AuthClient && typeof AuthClient.isAdmin === 'function' && !AuthClient.isAdmin()) {
        if (empty) {
          empty.hidden = false;
          empty.textContent = 'Admin access is required to view pending photo approvals.';
        }
        return;
      }

      var res = await fetch(base + '/admin/menu-images/pending', {
        method: 'GET',
        headers: authHeaders(),
      });
      var json = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) {
        throw new Error(json.error || 'Could not load pending photos.');
      }

      var clientId = menuImageClientId();
      var items = (json.data || []).filter(function (sub) {
        return String(sub.client_id || '') === String(clientId || '');
      });

      if (!items.length) {
        if (empty) empty.hidden = false;
        return;
      }

      items.forEach(function (sub) {
        var li = document.createElement('li');
        li.className = 'dashboard-notify-photos-item';
        var preview = photoThumbUrl(sub.url) || sub.url || '';
        var when = sub.created_at || '';
        try {
          when = when ? new Date(when).toLocaleString() : '';
        } catch (e) {}
        var title = menuItemTitle(sub.menu_item_path);
        var approveHref = '/dashboard/#dashboardCardMenuImages';

        li.innerHTML =
          '<a class="dashboard-notify-photos-link" href="' +
          escapeHtml(approveHref) +
          '">' +
          (preview
            ? '<span class="dashboard-notify-photos-thumb"><img src="' +
              escapeHtml(preview) +
              '" alt="" loading="lazy"></span>'
            : '<span class="dashboard-notify-photos-thumb dashboard-notify-photos-thumb--empty" aria-hidden="true"><i class="fa fa-image"></i></span>') +
          '<span class="dashboard-notify-photos-body">' +
          '<span class="dashboard-notify-photos-title">' +
          escapeHtml(title) +
          '</span>' +
          '<span class="dashboard-notify-photos-meta">' +
          escapeHtml(when) +
          (sub.submitter_email ? ' · ' + escapeHtml(sub.submitter_email) : '') +
          '</span>' +
          '<span class="dashboard-notify-photos-action">Review on dashboard <i class="fa fa-arrow-right" aria-hidden="true"></i></span>' +
          '</span>' +
          '</a>';
        list.appendChild(li);
      });
    } catch (err) {
      if (errEl) {
        errEl.hidden = false;
        errEl.textContent =
          (err && err.message ? err.message : 'Could not load pending photos.') +
          ' Open the dashboard approval reel to review uploads.';
      }
    }
  }

  async function loadSubscribers() {
    var tbody = document.getElementById('dashboardNotifySubscribersBody');
    var empty = document.getElementById('dashboardNotifySubscribersEmpty');
    var errEl = document.getElementById('dashboardNotifySubscribersError');
    var table = document.getElementById('dashboardNotifySubscribersTable');
    if (!tbody) return;

    tbody.innerHTML = '';
    if (errEl) {
      errEl.hidden = true;
      errEl.textContent = '';
    }

    var domain = getClientDomain();
    var data = await notifyFetch(
      '/subscribers?client_domain=' + encodeURIComponent(domain),
      { headers: authHeaders() }
    );

    var subs = (data && data.subscribers) || [];
    if (!subs.length) {
      if (table) table.hidden = true;
      if (empty) empty.hidden = false;
      return;
    }

    if (table) table.hidden = false;
    if (empty) empty.hidden = true;

    subs.forEach(function (s) {
      var tr = document.createElement('tr');
      var subscribed = s.subscribed_at || '';
      try {
        subscribed = subscribed ? new Date(subscribed).toLocaleString() : '—';
      } catch (e) {
        subscribed = '—';
      }
      tr.innerHTML =
        '<td><code class="dashboard-notify-sub-id">' +
        escapeHtml(s.id || '—') +
        '</code></td>' +
        '<td>' +
        escapeHtml(s.platform || '—') +
        '</td>' +
        '<td>' +
        (s.has_background_push
          ? '<span class="dashboard-notify-status-badge dashboard-notify-status-badge--delivered" title="Can receive alerts when app is closed">Ready</span>'
          : '<span class="dashboard-notify-status-badge dashboard-notify-status-badge--pending" title="User must open menu and re-subscribe">Missing keys</span>') +
        '</td>' +
        '<td>' +
        (s.is_active
          ? '<span class="dashboard-notify-status-badge dashboard-notify-status-badge--delivered">Active</span>'
          : '<span class="dashboard-notify-status-badge dashboard-notify-status-badge--failed">Inactive</span>') +
        '</td>' +
        '<td>' +
        escapeHtml(subscribed) +
        '</td>';
      tbody.appendChild(tr);
    });
  }

  async function sendNotification(ev) {
    ev.preventDefault();
    var form = document.getElementById('dashboardNotifySendForm');
    var statusEl = document.getElementById('dashboardNotifySendStatus');
    var submitBtn = document.getElementById('dashboardNotifySendSubmit');
    if (!form) return;

    var title = (document.getElementById('notifyTitle') || {}).value;
    var message = (document.getElementById('notifyMessage') || {}).value;
    var type = (document.getElementById('notifyType') || {}).value || 'general';
    var priority = (document.getElementById('notifyPriority') || {}).value || 'normal';
    var link = (document.getElementById('notifyLink') || {}).value;
    var icon = (document.getElementById('notifyIcon') || {}).value;
    var image = (document.getElementById('notifyImage') || {}).value;
    var broadcastEl = document.getElementById('notifyBroadcast');
    var isBroadcast = !!(broadcastEl && broadcastEl.checked);

    title = String(title || '').trim();
    message = String(message || '').trim();

    if (!title || !message) {
      setStatus(statusEl, 'Title and message are required.', true);
      return;
    }

    var body = {
      client_domain: getClientDomain(),
      is_broadcast: isBroadcast,
      title: title,
      message: message,
      type: type,
      priority: priority,
    };
    body.data = {};
    if (link) body.data.url = String(link).trim();
    if (icon) body.data.icon = String(icon).trim();
    if (image) body.data.image = String(image).trim();
    if (!Object.keys(body.data).length) delete body.data;

    submitBtn.disabled = true;
    setStatus(statusEl, 'Sending…', false);

    try {
      await notifyFetch('/notifications', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      setStatus(statusEl, 'Notification queued successfully.', false);
      form.reset();
      setNotifyImageField('notifyIcon', '');
      setNotifyImageField('notifyImage', '');
      var iconStatus = document.getElementById('notifyIconStatus');
      var imageStatus = document.getElementById('notifyImageStatus');
      if (iconStatus) iconStatus.textContent = '';
      if (imageStatus) imageStatus.textContent = '';
      refreshSendPlatformPreview();
      await loadMetrics();
      await loadEngagementTrends();
      await loadRecent();
      await loadSubscribers().catch(function () {});
    } catch (err) {
      setStatus(statusEl, err.message || 'Send failed.', true);
    } finally {
      submitBtn.disabled = false;
    }
  }

  function init() {
    if (!document.getElementById('dashboardNotificationsPage')) return;

    initNotifyTabs();
    initHistorySubTabs();
    initBroadcastOption();
    initNotifyImageUploads();
    initNotifyMediaTabs();
    initNotifyPlatformPreviews();

    var errBanner = document.getElementById('dashboardNotifyConfigError');
    var hasApi = !!getApiBase();
    if (!hasApi) {
      if (errBanner) errBanner.removeAttribute('hidden');
      setFormsApiDisabled(true);
      return;
    }
    if (errBanner) errBanner.setAttribute('hidden', '');
    setFormsApiDisabled(false);

    loadMetrics().catch(function (err) {
      setText('metricNotifySent30d', '—');
      setText('metricNotifySubscribers', '—');
      setText('metricNotifyArrived30d', '—');
      setText('metricNotifyOpened30d', '—');
      setText('metricNotifyNotArrived30d', '—');
      setText('metricNotifyClicked30d', '—');
      setText('metricNotifyNewSubscribers30d', '—');
      setText('metricNotifyUnsubscribes30d', '—');
      [
        'metricNotifySent30dMeta',
        'metricNotifyArrived30dMeta',
        'metricNotifyOpened30dMeta',
        'metricNotifyNotArrived30dMeta',
        'metricNotifyClicked30dMeta',
        'metricNotifyNewSubscribers30dMeta',
        'metricNotifyUnsubscribes30dMeta',
      ].forEach(function (id) {
        setMetricMeta(id, '');
      });
      var note = document.getElementById('dashboardNotifyLoadError');
      if (note) {
        note.hidden = false;
        note.textContent =
          'Could not load notification stats. ' + (err && err.message ? err.message : 'Check that this site is registered with the notification service.');
      }
    });

    loadEngagementTrends().catch(function () {
      renderNotifyTrendChart([]);
    });

    loadSubscribers().catch(function (err) {
      var errEl = document.getElementById('dashboardNotifySubscribersError');
      if (errEl) {
        errEl.hidden = false;
        errEl.textContent =
          'Could not load subscribers. ' + (err && err.message ? err.message : 'Try again later.');
      }
    });

    loadRecent().catch(function () {
      var note = document.getElementById('dashboardNotifyLoadError');
      if (note) {
        note.hidden = false;
        note.textContent =
          (note.textContent ? note.textContent + ' ' : '') +
          'Recent activity could not be loaded.';
      }
    });

    loadWelcomeHistory().catch(function () {});

    loadPhotoApprovals().catch(function () {});

    var form = document.getElementById('dashboardNotifySendForm');
    if (form) form.addEventListener('submit', sendNotification);

    initWelcomeForm();
  }

  function initNotifyTabs() {
    var root = document.getElementById('dashboardNotifyTabs');
    if (!root || root.getAttribute('data-notify-tabs-bound') === 'true') return;
    root.setAttribute('data-notify-tabs-bound', 'true');

    var tabs = Array.prototype.slice.call(
      root.querySelectorAll('.dashboard-notify-tablist [role="tab"]')
    );
    if (!tabs.length) return;

    var panels = tabs.map(function (tab) {
      var id = tab.getAttribute('aria-controls');
      return id ? document.getElementById(id) : null;
    });

    function selectTab(index) {
      if (index < 0 || index >= tabs.length) return;
      tabs.forEach(function (tab, i) {
        var selected = i === index;
        tab.setAttribute('aria-selected', selected ? 'true' : 'false');
        tab.classList.toggle('dashboard-notify-tab--active', selected);
        tab.tabIndex = selected ? 0 : -1;
        var panel = panels[i];
        if (!panel) return;
        if (selected) {
          panel.removeAttribute('hidden');
        } else {
          panel.setAttribute('hidden', '');
        }
      });
    }

    var initial = tabs.findIndex(function (tab) {
      return tab.getAttribute('aria-selected') === 'true';
    });
    if (initial < 0) initial = 0;
    selectTab(initial);

    tabs.forEach(function (tab, index) {
      tab.addEventListener('click', function () {
        selectTab(index);
      });
      tab.addEventListener('keydown', function (ev) {
        var next = null;
        if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') next = (index + 1) % tabs.length;
        else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp')
          next = (index - 1 + tabs.length) % tabs.length;
        else if (ev.key === 'Home') next = 0;
        else if (ev.key === 'End') next = tabs.length - 1;
        else if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          selectTab(index);
          return;
        }
        if (next !== null) {
          ev.preventDefault();
          selectTab(next);
          tabs[next].focus();
        }
      });
    });
  }

  function getNotifyServiceRoot() {
    return String(getApiBase()).replace(/\/api\/v1\/?$/i, '');
  }

  function resolveNotifyImageUrl(path) {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    return getNotifyServiceRoot() + (path.charAt(0) === '/' ? path : '/' + path);
  }

  function setNotifyImageField(targetId, urlPath) {
    var hidden = document.getElementById(targetId);
    var preview = document.getElementById(targetId + 'Preview');
    var placeholder = document.getElementById(targetId + 'Placeholder');
    var card = document.querySelector('[data-notify-media="' + targetId + '"]');
    var clearBtn = document.querySelector(
      '.dashboard-notify-clear-image[data-notify-target="' + targetId + '"]'
    );
    var value = String(urlPath || '').trim();
    if (hidden) hidden.value = value;
    if (preview) {
      if (value) {
        preview.src = resolveNotifyImageUrl(value);
        preview.removeAttribute('hidden');
      } else {
        preview.removeAttribute('src');
        preview.setAttribute('hidden', '');
      }
    }
    if (placeholder) {
      if (value) placeholder.setAttribute('hidden', '');
      else placeholder.removeAttribute('hidden');
    }
    if (card) {
      card.classList.toggle('dashboard-notify-media-card--has-image', !!value);
    }
    if (clearBtn) {
      if (value) clearBtn.removeAttribute('hidden');
      else clearBtn.setAttribute('hidden', '');
    }
    refreshNotifyPlatformPreviews();
  }

  function getNotifyFieldValue(id) {
    var el = document.getElementById(id);
    return el ? String(el.value || '').trim() : '';
  }

  function truncatePreviewText(text, maxLen) {
    text = String(text || '').trim();
    if (!text) return '';
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen - 1) + '…';
  }

  function formatPreviewTime() {
    try {
      return new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    } catch (e) {
      return '9:41 AM';
    }
  }

  function formatPreviewClock() {
    try {
      return new Date()
        .toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
        .replace(/\s*[ap]\.?m\.?/i, '');
    } catch (e) {
      return '9:41';
    }
  }

  function formatPreviewDay() {
    try {
      return new Date().toLocaleDateString(undefined, { weekday: 'long' });
    } catch (e) {
      return 'Wednesday';
    }
  }

  function getDefaultNotifyIconUrl() {
    var link = document.querySelector('link[rel="icon"], link[rel="shortcut icon"]');
    if (link && link.href) return link.href;
    return '/favicon.ico';
  }

  function setPreviewIconWrap(wrap, iconUrl, useFallbackBell) {
    var img = wrap.querySelector('[data-preview-field="icon"]');
    if (!img) return;
    if (iconUrl && !useFallbackBell) {
      img.onerror = function () {
        setPreviewIconWrap(wrap, '', true);
      };
      img.src = iconUrl;
      img.removeAttribute('hidden');
      wrap.classList.add('dashboard-notify-mock-icon-wrap--has-img');
    } else {
      img.onerror = null;
      img.removeAttribute('src');
      img.setAttribute('hidden', '');
      wrap.classList.remove('dashboard-notify-mock-icon-wrap--has-img');
    }
  }

  function updateNotifyPlatformPreviewContainer(containerId, config) {
    var root = document.getElementById(containerId);
    if (!root) return;

    var title = truncatePreviewText(config.getTitle(), 120);
    var message = truncatePreviewText(config.getMessage(), 220);
    var iconPath = config.getIcon();
    var imagePath = config.getImage();
    var appName = truncatePreviewText(getClientDomain() || 'TTMenus', 48);
    var iconUrl = iconPath ? resolveNotifyImageUrl(iconPath) : getDefaultNotifyIconUrl();
    var imageUrl = imagePath ? resolveNotifyImageUrl(imagePath) : '';

    root.querySelectorAll('[data-preview-field="title"]').forEach(function (el) {
      el.textContent = title;
    });
    root.querySelectorAll('[data-preview-field="message"]').forEach(function (el) {
      el.textContent = message;
    });
    root.querySelectorAll('[data-preview-field="app"]').forEach(function (el) {
      el.textContent = appName;
    });
    root.querySelectorAll('[data-preview-field="time"]').forEach(function (el) {
      el.textContent = formatPreviewTime();
    });
    root.querySelectorAll('[data-preview-field="clock"]').forEach(function (el) {
      el.textContent = formatPreviewClock();
    });
    root.querySelectorAll('[data-preview-field="day"]').forEach(function (el) {
      el.textContent = formatPreviewDay();
    });

    root.querySelectorAll('[data-preview-icon-wrap]').forEach(function (wrap) {
      setPreviewIconWrap(wrap, iconUrl, false);
    });

    root.querySelectorAll('[data-preview-banner-wrap]').forEach(function (wrap) {
      var img = wrap.querySelector('[data-preview-field="banner"]');
      if (imageUrl) {
        if (img) img.src = imageUrl;
        wrap.removeAttribute('hidden');
      } else {
        if (img) img.removeAttribute('src');
        wrap.setAttribute('hidden', '');
      }
    });

    root.querySelectorAll('[data-preview-ios-expanded]').forEach(function (panel) {
      var img = panel.querySelector('[data-preview-field="banner"]');
      if (imageUrl) {
        if (img) img.src = imageUrl;
        panel.removeAttribute('hidden');
      } else {
        if (img) img.removeAttribute('src');
        panel.setAttribute('hidden', '');
      }
    });

    root.classList.toggle('dashboard-notify-previews--has-banner', !!imageUrl);
    root.classList.toggle('dashboard-notify-previews--has-icon', !!(iconPath || iconUrl));
  }

  function initNotifySubTabs(root, options) {
    if (!root) return;
    var boundKey = options.boundKey || 'data-notify-subtabs-bound';
    if (root.getAttribute(boundKey) === 'true') return;
    root.setAttribute(boundKey, 'true');

    var tabAttr = options.tabAttr;
    var paneAttr = options.paneAttr;
    var tabs = root.querySelectorAll(options.tabSelector);
    var panes = root.querySelectorAll(options.paneSelector);
    var order = options.order || [];
    var defaultName = options.defaultName || order[0];

    function selectTab(name) {
      if (!name) return;

      tabs.forEach(function (tab) {
        var active = tab.getAttribute(tabAttr) === name;
        tab.classList.toggle('dashboard-notify-preview-tab--active', active);
        tab.setAttribute('aria-selected', active ? 'true' : 'false');
        tab.tabIndex = active ? 0 : -1;
      });

      panes.forEach(function (pane) {
        var show = pane.getAttribute(paneAttr) === name;
        pane.classList.toggle('dashboard-notify-preview-pane--active', show);
      });
    }

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function (ev) {
        ev.preventDefault();
        selectTab(tab.getAttribute(tabAttr));
      });

      if (!order.length) return;

      tab.addEventListener('keydown', function (ev) {
        var current = tab.getAttribute(tabAttr);
        var index = order.indexOf(current);
        if (index === -1) return;
        var next = null;
        if (ev.key === 'ArrowRight') next = order[(index + 1) % order.length];
        else if (ev.key === 'ArrowLeft') next = order[(index + order.length - 1) % order.length];
        else if (ev.key === 'Home') next = order[0];
        else if (ev.key === 'End') next = order[order.length - 1];
        if (!next) return;
        ev.preventDefault();
        selectTab(next);
        var nextTab = root.querySelector('[' + tabAttr + '="' + next + '"]');
        if (nextTab) nextTab.focus();
      });
    });

    selectTab(defaultName);
  }

  function initNotifyPreviewTabs(root) {
    initNotifySubTabs(root, {
      boundKey: 'data-preview-tabs-bound',
      tabSelector: '.dashboard-notify-preview-tabs [data-preview-tab]',
      paneSelector: '.dashboard-notify-preview-stage > [data-preview-pane]',
      tabAttr: 'data-preview-tab',
      paneAttr: 'data-preview-pane',
      order: ['web', 'android', 'ios'],
      defaultName: 'web',
    });
  }

  function initHistorySubTabs() {
    var root = document.getElementById('notifyHistorySubTabs');
    if (!root) return;

    initNotifySubTabs(root, {
      boundKey: 'data-history-tabs-bound',
      tabSelector: '.dashboard-notify-history-tablist [data-history-tab]',
      paneSelector: '.dashboard-notify-history-panels > [data-history-pane]',
      tabAttr: 'data-history-tab',
      paneAttr: 'data-history-pane',
      order: ['sent', 'welcome', 'photos'],
      defaultName: 'sent',
    });

    var tabs = root.querySelectorAll('.dashboard-notify-history-tablist [data-history-tab]');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var name = tab.getAttribute('data-history-tab');
        if (name === 'photos') {
          loadPhotoApprovals().catch(function () {});
        } else if (name === 'welcome') {
          loadWelcomeHistory().catch(function () {});
        }
      });
    });

    var params = new URLSearchParams(window.location.search);
    var historyTab = params.get('history');
    if (historyTab === 'photos' || historyTab === 'welcome' || historyTab === 'sent') {
      var target = root.querySelector('[data-history-tab="' + historyTab + '"]');
      if (target) target.click();
    }
  }

  function initNotifyMediaTabs() {
    initNotifySubTabs(document.getElementById('notifyWelcomeMediaTabs'), {
      boundKey: 'data-media-tabs-bound',
      tabSelector: '.dashboard-notify-media-tablist [data-media-tab]',
      paneSelector: '.dashboard-notify-media-panels > [data-media-pane]',
      tabAttr: 'data-media-tab',
      paneAttr: 'data-media-pane',
      order: ['icon', 'banner', 'badge'],
      defaultName: 'icon',
    });

    initNotifySubTabs(document.getElementById('notifySendMediaTabs'), {
      boundKey: 'data-media-tabs-bound',
      tabSelector: '.dashboard-notify-media-tablist [data-media-tab]',
      paneSelector: '.dashboard-notify-media-panels > [data-media-pane]',
      tabAttr: 'data-media-tab',
      paneAttr: 'data-media-pane',
      order: ['icon', 'banner'],
      defaultName: 'icon',
    });
  }

  function refreshWelcomePlatformPreview() {
    updateNotifyPlatformPreviewContainer('notifyWelcomePlatformPreviews', {
      getTitle: function () {
        return getNotifyFieldValue('notifyWelcomeTitle') || 'Welcome! 🎉';
      },
      getMessage: function () {
        return (
          getNotifyFieldValue('notifyWelcomeMessage') ||
          'Thanks for subscribing — we\'ll keep you updated on specials and menu changes.'
        );
      },
      getIcon: function () {
        return getNotifyFieldValue('notifyDefaultIcon');
      },
      getImage: function () {
        return getNotifyFieldValue('notifyDefaultImage');
      },
    });
  }

  function refreshSendPlatformPreview() {
    updateNotifyPlatformPreviewContainer('notifySendPlatformPreviews', {
      getTitle: function () {
        return getNotifyFieldValue('notifyTitle') || 'Notification title';
      },
      getMessage: function () {
        return getNotifyFieldValue('notifyMessage') || 'Your message appears here.';
      },
      getIcon: function () {
        return getNotifyFieldValue('notifyIcon') || getNotifyFieldValue('notifyDefaultIcon');
      },
      getImage: function () {
        return getNotifyFieldValue('notifyImage') || getNotifyFieldValue('notifyDefaultImage');
      },
    });
  }

  function refreshNotifyPlatformPreviews() {
    refreshWelcomePlatformPreview();
    refreshSendPlatformPreview();
  }

  function initNotifyPlatformPreviews() {
    ['notifyWelcomePlatformPreviews', 'notifySendPlatformPreviews'].forEach(function (id) {
      var root = document.getElementById(id);
      if (root) initNotifyPreviewTabs(root);
    });

    var welcomeIds = ['notifyWelcomeTitle', 'notifyWelcomeMessage'];
    var sendIds = ['notifyTitle', 'notifyMessage'];

    welcomeIds.concat(sendIds).forEach(function (id) {
      var el = document.getElementById(id);
      if (!el || el.getAttribute('data-notify-preview-bound') === 'true') return;
      el.setAttribute('data-notify-preview-bound', 'true');
      el.addEventListener('input', refreshNotifyPlatformPreviews);
      el.addEventListener('change', refreshNotifyPlatformPreviews);
    });

    refreshNotifyPlatformPreviews();
  }

  async function uploadNotifyImage(file, statusEl) {
    if (!file) throw new Error('No file selected.');
    if (file.size > 5 * 1024 * 1024) throw new Error('File is too large. Maximum size is 5 MB.');
    var allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (file.type && allowed.indexOf(file.type) === -1) {
      throw new Error('Invalid file type. Use JPG, PNG, GIF, or WebP.');
    }
    await ensureNotifyToken();
    var formData = new FormData();
    formData.append('image', file);
    if (statusEl) {
      statusEl.textContent = 'Uploading…';
      statusEl.classList.remove('dashboard-notify-upload-status--error');
    }
    var headers = { Accept: 'application/json' };
    var token = window.AuthClient && AuthClient.getAccessToken && AuthClient.getAccessToken();
    if (token) headers.Authorization = 'Bearer ' + token;
    var res = await fetch(getApiBase() + '/upload/image', {
      method: 'POST',
      credentials: 'include',
      headers: headers,
      body: formData,
    });
    if (res.status === 401) {
      if (window.AuthClient && AuthClient.logout) await AuthClient.logout().catch(function () {});
      window.location.href = '/login/';
      throw new Error('Session expired. Please sign in again.');
    }
    var text = await res.text();
    var data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) {
      if (!res.ok) throw new Error(text || res.statusText);
    }
    if (!res.ok) throw new Error((data && (data.error || data.message)) || text || 'Upload failed');
    var imageUrl = (data && (data.url || data.image_url)) || '';
    if (!imageUrl) throw new Error('Upload succeeded but no URL was returned.');
    return imageUrl;
  }

  function initNotifyImageUploads() {
    document.querySelectorAll('.dashboard-notify-image-file').forEach(function (input) {
      if (input.getAttribute('data-notify-upload-bound') === 'true') return;
      input.setAttribute('data-notify-upload-bound', 'true');
      input.addEventListener('change', function () {
        var file = input.files && input.files[0];
        var targetId = input.getAttribute('data-notify-target');
        if (!file || !targetId) return;
        var statusEl = document.getElementById(targetId + 'Status');
        uploadNotifyImage(file, statusEl)
          .then(function (url) {
            setNotifyImageField(targetId, url);
            if (statusEl) statusEl.textContent = 'Uploaded.';
          })
          .catch(function (err) {
            if (statusEl) {
              statusEl.textContent = err.message || 'Upload failed.';
              statusEl.classList.add('dashboard-notify-upload-status--error');
            }
          })
          .finally(function () { input.value = ''; });
      });
    });
    document.querySelectorAll('.dashboard-notify-clear-image').forEach(function (btn) {
      if (btn.getAttribute('data-notify-clear-bound') === 'true') return;
      btn.setAttribute('data-notify-clear-bound', 'true');
      btn.addEventListener('click', function () {
        var targetId = btn.getAttribute('data-notify-target');
        if (!targetId) return;
        setNotifyImageField(targetId, '');
        var statusEl = document.getElementById(targetId + 'Status');
        if (statusEl) {
          statusEl.textContent = 'Removed.';
          statusEl.classList.remove('dashboard-notify-upload-status--error');
        }
      });
    });
  }

  function initBroadcastOption() {
    var row = document.getElementById('dashboardNotifyBroadcastRow');
    if (!row) return;
    var domain = String(getClientDomain() || '').replace(/^www\./i, '').toLowerCase();
    if (domain === 'ttmenus.com') row.removeAttribute('hidden');
    else row.setAttribute('hidden', '');
  }

  function setWelcomeStatus(el, msg, isError) {
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('dashboard-notify-status-error', !!isError);
  }

  async function loadWelcomeSettings() {
    var titleEl = document.getElementById('notifyWelcomeTitle');
    var msgEl = document.getElementById('notifyWelcomeMessage');
    if (!titleEl && !msgEl) return;

    var domain = getClientDomain();
    var data = await notifyFetch('/clients/' + encodeURIComponent(domain) + '/settings', {
      method: 'GET',
      headers: authHeaders(),
    });
    var s = (data && data.settings) || {};
    if (titleEl) titleEl.value = s.welcome_title || '';
    if (msgEl) msgEl.value = s.welcome_message || '';
    setNotifyImageField('notifyDefaultIcon', s.notification_icon || '');
    setNotifyImageField('notifyDefaultImage', s.notification_image || '');
    setNotifyImageField('notifyDefaultBadge', s.notification_badge || '');
    refreshWelcomePlatformPreview();
  }

  async function saveWelcome(ev) {
    ev.preventDefault();
    var form = document.getElementById('dashboardNotifyWelcomeForm');
    var statusEl = document.getElementById('notifyWelcomeSaveStatus');
    var btn = document.getElementById('btnNotifyWelcomeSave');
    if (!form) return;

    var title = (document.getElementById('notifyWelcomeTitle') || {}).value;
    var message = (document.getElementById('notifyWelcomeMessage') || {}).value;
    var icon = (document.getElementById('notifyDefaultIcon') || {}).value;
    var image = (document.getElementById('notifyDefaultImage') || {}).value;
    var badge = (document.getElementById('notifyDefaultBadge') || {}).value;
    var payload = {
      welcome_title: String(title || '').trim(),
      welcome_message: String(message || '').trim(),
      notification_icon: String(icon || '').trim(),
      notification_image: String(image || '').trim(),
      notification_badge: String(badge || '').trim(),
    };

    if (btn) btn.disabled = true;
    setWelcomeStatus(statusEl, 'Saving…', false);

    try {
      await notifyFetch('/clients/' + encodeURIComponent(getClientDomain()) + '/settings', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      setWelcomeStatus(statusEl, 'Saved.', false);
    } catch (err) {
      setWelcomeStatus(statusEl, err.message || 'Save failed.', true);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function initWelcomeForm() {
    var welcomeForm = document.getElementById('dashboardNotifyWelcomeForm');
    if (!welcomeForm || !getApiBase()) return;

    loadWelcomeSettings().catch(function (err) {
      var statusEl = document.getElementById('notifyWelcomeSaveStatus');
      setWelcomeStatus(
        statusEl,
        'Could not load welcome message: ' + (err && err.message ? err.message : 'unknown error'),
        true
      );
    });

    welcomeForm.addEventListener('submit', function (ev) {
      saveWelcome(ev);
    });

    initNotifyImageUploads();
  }

  window.DashboardNotifications = {
    init: init,
    initTabs: initNotifyTabs,
    loadDashboardCard: loadDashboardCard,
    fetchOverview: fetchOverview,
    refreshPlatformPreviews: refreshNotifyPlatformPreviews,
  };
})();
