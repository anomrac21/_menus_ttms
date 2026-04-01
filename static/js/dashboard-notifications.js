/**
 * Client dashboard — notify-service: metrics, send, recent history, reports.
 * Expects window.NOTIFY_CONFIG.apiUrl, AuthClient.getAccessToken, and AuthClientAccess (guard runs in page).
 */
(function () {
  'use strict';

  function getApiBase() {
    var base = (window.NOTIFY_CONFIG && window.NOTIFY_CONFIG.apiUrl) || '';
    return String(base).replace(/\/+$/, '');
  }

  function getClientDomain() {
    if (window.NOTIFY_CONFIG && window.NOTIFY_CONFIG.clientDomain) {
      return window.NOTIFY_CONFIG.clientDomain;
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

    var errBanner = document.getElementById('dashboardNotifyConfigError');
    if (!getApiBase()) {
      if (errBanner) errBanner.hidden = false;
      return;
    }
    if (errBanner) errBanner.hidden = true;

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
    initNotifyTabs();
  }

  function initNotifyTabs() {
    var root = document.getElementById('dashboardNotifyTabs');
    if (!root) return;

    var tabs = Array.prototype.slice.call(root.querySelectorAll('[role="tab"]'));
    var panels = tabs.map(function (tab) {
      return document.getElementById(tab.getAttribute('aria-controls'));
    });

    function selectTab(index) {
      if (index < 0 || index >= tabs.length) return;
      tabs.forEach(function (tab, i) {
        var selected = i === index;
        tab.setAttribute('aria-selected', selected ? 'true' : 'false');
        tab.tabIndex = selected ? 0 : -1;
        var panel = panels[i];
        if (panel) {
          if (selected) {
            panel.removeAttribute('hidden');
          } else {
            panel.setAttribute('hidden', '');
          }
        }
      });
    }

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

  window.DashboardNotifications = { init: init };
})();
