/**
 * Control-room card counts: open orders, delivery jobs, and mirrored snapshots.
 */
(function (global) {
  'use strict';

  var POLL_MS = 20000;
  var COUNT_IDS = [
    'dashboardCardOrdersCount',
    'dashboardCardDeliveryCount',
    'dashboardCardEditMenuCount',
    'dashboardCardMenuImagesCount',
    'dashboardCardAnalyticsCount',
    'dashboardCardNotifyCount',
    'dashboardCardOrderingCount',
  ];

  function $(id) {
    return document.getElementById(id);
  }

  function prefersReducedMotion() {
    return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function parseCount(text) {
    var m = String(text == null ? '' : text).replace(/,/g, '').match(/(\d+)/);
    return m ? parseInt(m[1], 10) : NaN;
  }

  function playReveal(el, firstPaint) {
    if (prefersReducedMotion()) return;
    el.classList.remove('is-bump', 'is-reveal');
    void el.offsetWidth;
    el.classList.add(firstPaint ? 'is-reveal' : 'is-bump');
  }

  function animateCount(el, from, to, done) {
    if (el._countRaf) {
      global.cancelAnimationFrame(el._countRaf);
      el._countRaf = 0;
    }
    if (prefersReducedMotion() || from === to) {
      el.textContent = String(to);
      if (done) done();
      return;
    }
    var duration = Math.min(820, 320 + Math.abs(to - from) * 36);
    var start = global.performance && performance.now ? performance.now() : Date.now();
    function tick(now) {
      var t = Math.min(1, (now - start) / duration);
      var eased = 1 - Math.pow(1 - t, 3);
      el.textContent = String(Math.round(from + (to - from) * eased));
      if (t < 1) {
        el._countRaf = global.requestAnimationFrame(tick);
      } else {
        el._countRaf = 0;
        el.textContent = String(to);
        if (done) done();
      }
    }
    el._countRaf = global.requestAnimationFrame(tick);
  }

  function setCount(id, n) {
    var el = $(id);
    if (!el || n == null || isNaN(n)) return;
    var next = String(n);
    var prevAttr = el.getAttribute('data-count');
    var firstPaint = el.classList.contains('is-loading') || prevAttr === null;
    var from = prevAttr !== null ? parseInt(prevAttr, 10) : 0;
    if (isNaN(from)) from = 0;
    if (!firstPaint && prevAttr === next) {
      el.textContent = next;
      return;
    }
    el.classList.remove('is-loading');
    el.removeAttribute('aria-busy');
    el.setAttribute('data-count', next);
    el.classList.toggle('is-hot', n > 0);
    el.classList.toggle('is-zero', n === 0);
    var card = el.closest('.card');
    if (card) card.classList.toggle('has-hot-count', n > 0);
    playReveal(el, firstPaint);
    animateCount(el, firstPaint ? 0 : from, n);
  }

  function setUnavailable(id) {
    var el = $(id);
    if (!el || el.getAttribute('data-count') !== null) return;
    el.classList.remove('is-loading', 'is-hot', 'is-zero', 'is-bump', 'is-reveal');
    el.removeAttribute('aria-busy');
    el.textContent = '—';
  }

  function sourceReady(raw) {
    raw = (raw || '').trim();
    if (!raw || raw === '—' || raw === 'Checking…') return false;
    return true;
  }

  function mirror(srcId, destId, emptyIsZero) {
    var src = $(srcId);
    if (!src) {
      setCount(destId, 0);
      return;
    }
    function sync() {
      var raw = (src.textContent || '').trim();
      if (!sourceReady(raw)) return;
      if (/^no\b/i.test(raw)) {
        setCount(destId, 0);
        return;
      }
      var n = parseCount(raw);
      if (!isNaN(n)) setCount(destId, n);
      else if (emptyIsZero) setCount(destId, 0);
    }
    sync();
    new MutationObserver(sync).observe(src, { childList: true, characterData: true, subtree: true });
  }

  function locationCount() {
    var cfg = global.MENU_CONFIG || {};
    var locs = Array.isArray(cfg.locations) ? cfg.locations : [];
    return locs.filter(function (loc) {
      return loc && loc.slug;
    }).length;
  }

  function isOpenDelivery(order) {
    var s = String((order && order.status) || '').toLowerCase();
    return !/^(delivered|completed|cancelled|canceled|expired|rejected)$/.test(s);
  }

  async function loadOrders() {
    if (!global.OrderClient || typeof global.OrderClient.listClient !== 'function') {
      setCount('dashboardCardOrdersCount', 0);
      return;
    }
    try {
      var res = await global.OrderClient.listClient({});
      var orders = (res && res.orders) || [];
      setCount('dashboardCardOrdersCount', orders.length);
    } catch (_) {
      setUnavailable('dashboardCardOrdersCount');
    }
  }

  async function loadDelivery() {
    if (!global.DeliveryClient || typeof global.DeliveryClient.listClientOrders !== 'function' || !global.DeliveryClient.enabled()) {
      setCount('dashboardCardDeliveryCount', 0);
      return;
    }
    try {
      var res = await global.DeliveryClient.listClientOrders();
      var orders = (res && (res.orders || res)) || [];
      if (!Array.isArray(orders)) orders = [];
      setCount(
        'dashboardCardDeliveryCount',
        orders.filter(isOpenDelivery).length
      );
    } catch (_) {
      setCount('dashboardCardDeliveryCount', 0);
    }
  }

  function loadStatic() {
    setCount('dashboardCardOrderingCount', locationCount());
    mirror('dashboardCardMenuImagesPending', 'dashboardCardMenuImagesCount', true);
    mirror('dashboardCardAnalyticsVisits', 'dashboardCardAnalyticsCount', false);
    mirror('dashboardCardNotifySubs', 'dashboardCardNotifyCount', false);
    mirror('dashboardDraftBlockSummary', 'dashboardCardEditMenuCount', true);
  }

  async function refresh() {
    await Promise.all([loadOrders(), loadDelivery()]);
  }

  function init() {
    COUNT_IDS.forEach(function (id) {
      var el = $(id);
      if (!el || el.getAttribute('data-count') !== null) return;
      el.classList.add('is-loading');
      el.setAttribute('aria-busy', 'true');
      el.textContent = '';
    });
    loadStatic();
    refresh();
    setInterval(refresh, POLL_MS);
    setTimeout(function () {
      COUNT_IDS.forEach(function (id) {
        var el = $(id);
        if (el && el.classList.contains('is-loading')) setCount(id, 0);
      });
    }, 12000);
  }

  global.DashboardOpsSnapshot = { init: init, refresh: refresh };
})(typeof window !== 'undefined' ? window : this);
