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
    var cfg = resolveNotifyConfig();
    var base = (cfg && cfg.apiUrl) || '';
    if (!base) {
      var codeEl = document.querySelector('.dashboard-notify-footnote .dashboard-notify-code');
      if (codeEl) base = (codeEl.textContent || '').trim();
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
    var engagement = await notifyFetch('/analytics/engagement-metrics' + q, {
      headers: authHeaders(),
    });

    var ov = (overview && overview.overview) || {};
    var sub = ov.subscriptions || {};
    var notif = ov.notifications || {};
    var met = (engagement && engagement.metrics) || {};

    setText('metricNotifySent30d', formatInt(notif.in_period));
    setText('metricNotifySubscribers', formatInt(sub.active));
    setText('metricNotifyDelivered30d', formatInt(met.total_delivered));
    setText('metricNotifyCtr', met.click_through_rate != null ? formatNum(met.click_through_rate) + '%' : '—');
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
      li.innerHTML =
        '<span class="dashboard-notify-history-title">' +
        escapeHtml(title) +
        '</span>' +
        '<span class="dashboard-notify-history-meta">' +
        escapeHtml(created) +
        (status ? ' · ' + escapeHtml(status) : '') +
        '</span>';
      list.appendChild(li);
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
      if (errBanner) errBanner.hidden = false;
      setFormsApiDisabled(true);
      return;
    }
    if (errBanner) errBanner.hidden = true;
    setFormsApiDisabled(false);

    loadMetrics().catch(function (err) {
      setText('metricNotifySent30d', '—');
      setText('metricNotifySubscribers', '—');
      setText('metricNotifyDelivered30d', '—');
      setText('metricNotifyCtr', '—');
      var note = document.getElementById('dashboardNotifyLoadError');
      if (note) {
        note.hidden = false;
        note.textContent =
          'Could not load notification stats. ' + (err && err.message ? err.message : 'Check that this site is registered with the notification service.');
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
