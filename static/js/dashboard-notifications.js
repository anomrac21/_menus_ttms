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
    if (!base) {
      var codeEl = document.querySelector('.dashboard-notify-footnote .dashboard-notify-code');
      if (codeEl) base = (codeEl.textContent || '').trim();
    }
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
      (window.AuthClient && AuthClient.getAccessToken && AuthClient.getAccessToken()) ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('ttmenus_access_token'));
    if (token) h.Authorization = 'Bearer ' + token;
    return h;
  }

  async function notifyFetch(path, options) {
    var base = getApiBase();
    if (!base) {
      throw new Error('Notification API URL is not configured (site notifications).');
    }
    var url = base + path;
    var res = await fetch(url, Object.assign({ credentials: 'include' }, options || {}));
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

  async function loadMetrics() {
    var domain = getClientDomain();
    var q = '?client_domain=' + encodeURIComponent(domain) + '&days=30';

    var overview = await notifyFetch('/analytics/overview' + q, { headers: authHeaders() });

    var ov = (overview && overview.overview) || {};
    var sub = ov.subscriptions || {};
    var notif = ov.notifications || {};

    setText('metricNotifySent30d', formatInt(notif.in_period));
    setText('metricNotifySubscribers', formatInt(sub.active));
    setText('metricNotifyArrived30d', formatInt(notif.delivered));
    setText('metricNotifyOpened30d', formatInt(notif.confirmed));
    setText(
      'metricNotifyNotArrived30d',
      formatInt((notif.failed || 0) + (notif.pending || 0))
    );
    setText('metricNotifyClicked30d', formatInt(notif.clicked));
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

  async function loadRecent() {
    var domain = getClientDomain();
    var path =
      '/notifications?client_domain=' + encodeURIComponent(domain) + '&limit=15';
    var data = await notifyFetch(path, { headers: authHeaders() });
    var list = document.getElementById('dashboardNotifyRecentList');
    var empty = document.getElementById('dashboardNotifyRecentEmpty');
    if (!list) return;

    var items = (data && data.notifications) || [];
    list.innerHTML = '';
    if (!items.length) {
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    items.forEach(function (n) {
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

      list.appendChild(li);
    });
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

    title = String(title || '').trim();
    message = String(message || '').trim();

    if (!title || !message) {
      setStatus(statusEl, 'Title and message are required.', true);
      return;
    }

    var body = {
      client_domain: getClientDomain(),
      is_broadcast: false,
      title: title,
      message: message,
      type: type,
      priority: priority,
    };
    if (link) {
      body.data = { url: String(link).trim() };
    }

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
      await loadMetrics();
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
      var note = document.getElementById('dashboardNotifyLoadError');
      if (note) {
        note.hidden = false;
        note.textContent =
          'Could not load notification stats. ' + (err && err.message ? err.message : 'Check that this site is registered with the notification service.');
      }
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

    var form = document.getElementById('dashboardNotifySendForm');
    if (form) form.addEventListener('submit', sendNotification);

    initWelcomeForm();
  }

  function initNotifyTabs() {
    var root = document.getElementById('dashboardNotifyTabs');
    if (!root || root.getAttribute('data-notify-tabs-bound') === 'true') return;
    root.setAttribute('data-notify-tabs-bound', 'true');

    var tabs = Array.prototype.slice.call(root.querySelectorAll('[role="tab"]'));
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
  }

  async function saveWelcome(ev) {
    ev.preventDefault();
    var form = document.getElementById('dashboardNotifyWelcomeForm');
    var statusEl = document.getElementById('notifyWelcomeSaveStatus');
    var btn = document.getElementById('btnNotifyWelcomeSave');
    if (!form) return;

    var title = (document.getElementById('notifyWelcomeTitle') || {}).value;
    var message = (document.getElementById('notifyWelcomeMessage') || {}).value;
    var payload = {
      welcome_title: String(title || '').trim(),
      welcome_message: String(message || '').trim(),
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
  }

  window.DashboardNotifications = {
    init: init,
    initTabs: initNotifyTabs,
    loadDashboardCard: loadDashboardCard,
    fetchOverview: fetchOverview,
  };
})();
