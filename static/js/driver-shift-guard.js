/**
 * While a driver is online, keep them on /drive/ (hub, recipes, and menus).
 * Cookie is on .ttmenus.com so every TT Menus property can bounce back.
 */
(function () {
  'use strict';

  var COOKIE = 'ttms-driver-shift';
  var STORE = 'ttms-driver-shift';
  var hookedBarba = false;
  var bound = false;

  function driveUrl() {
    var explicit = window.TTMS_DRIVE_URL;
    if (explicit) {
      var e = String(explicit).trim();
      if (e) return e.charAt(e.length - 1) === '/' ? e : e + '/';
    }
    var hub = window.TTMS_HUB_URL;
    if (hub) {
      var h = String(hub).trim().replace(/\/+$/, '');
      if (h) return h + '/drive/';
    }
    if (isHubOrigin()) return '/drive/';
    return 'https://www.ttmenus.com/drive/';
  }

  function isHubOrigin() {
    var host = String((location && location.hostname) || '').toLowerCase();
    if (host === 'www.ttmenus.com' || host === 'ttmenus.com') return true;
    if (typeof window.__ttmsMountDriverPage === 'function') return true;
    return !!(document.getElementById && document.getElementById('ttmsDriverPage'));
  }

  function pathOf(href) {
    try {
      var u = new URL(href, location.href);
      return (u.pathname || '/').replace(/\/+$/, '') || '/';
    } catch (e) {
      return '';
    }
  }

  function isOnDrivePage() {
    if (document.getElementById && document.getElementById('ttmsDriverPage')) return true;
    if (document.body && document.body.classList.contains('drive-page')) return true;
    return pathOf(location.href) === '/drive';
  }

  function isDriveHref(href) {
    try {
      var u = new URL(href, location.href);
      var path = (u.pathname || '/').replace(/\/+$/, '') || '/';
      if (path !== '/drive') return false;
      if (u.origin === location.origin) return true;
      var host = String(u.hostname || '').toLowerCase();
      return host === 'www.ttmenus.com' || host === 'ttmenus.com';
    } catch (e) {
      return false;
    }
  }

  function cookieDomain() {
    var host = String((location && location.hostname) || '').toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1') return '';
    if (host === 'ttmenus.com' || host.slice(-12) === '.ttmenus.com') return '; Domain=.ttmenus.com';
    return '';
  }

  function writeCookie(on) {
    var secure = location.protocol === 'https:' ? '; Secure' : '';
    var domain = cookieDomain();
    if (on) {
      document.cookie = COOKIE + '=1; Path=/; SameSite=Lax; Max-Age=86400' + domain + secure;
    } else {
      document.cookie = COOKIE + '=; Path=/; SameSite=Lax; Max-Age=0' + domain + secure;
      document.cookie = COOKIE + '=; Path=/; SameSite=Lax; Max-Age=0' + secure;
    }
  }

  function readCookie() {
    var parts = String(document.cookie || '').split(';');
    for (var i = 0; i < parts.length; i++) {
      var row = parts[i].replace(/^\s+/, '');
      if (row.indexOf(COOKIE + '=') === 0) return row.slice(COOKIE.length + 1) === '1';
    }
    return false;
  }

  function persist(on) {
    try {
      if (on) {
        sessionStorage.setItem(STORE, '1');
        localStorage.setItem(STORE, '1');
      } else {
        sessionStorage.removeItem(STORE);
        localStorage.removeItem(STORE);
      }
    } catch (e) {}
    try {
      writeCookie(!!on);
    } catch (e) {}
  }

  function storedOn() {
    try {
      if (sessionStorage.getItem(STORE) === '1') return true;
      if (localStorage.getItem(STORE) === '1') return true;
    } catch (e) {}
    return readCookie();
  }

  function authSaysSignedOut() {
    if (!window.AuthClient || typeof AuthClient.isAuthenticated !== 'function') return false;
    return !AuthClient.isAuthenticated();
  }

  function isLocked() {
    if (!storedOn()) return false;
    if (authSaysSignedOut()) {
      persist(false);
      applyShiftClass(false);
      return false;
    }
    return true;
  }

  function applyShiftClass(on) {
    document.documentElement.classList.toggle('ttms-driver-shift', !!on);
    if (document.body) document.body.classList.toggle('ttms-driver-shift', !!on);
    document.documentElement.classList.toggle('ttms-driver-online', !!on);
    if (document.body) document.body.classList.toggle('ttms-driver-online', !!on);
  }

  function closeChrome() {
    try {
      if (typeof window.closeAll === 'function') window.closeAll();
    } catch (e) {}
    try {
      if (typeof window.closeDashboard === 'function') window.closeDashboard();
    } catch (e) {}
    try {
      if (typeof window.closeAccountDashboard === 'function') window.closeAccountDashboard();
    } catch (e) {}
    try {
      if (typeof window.closeNotifyInbox === 'function') window.closeNotifyInbox({ instant: true });
    } catch (e) {}
  }

  function fsEl() {
    return document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement || null;
  }

  function enterFullscreen() {
    var root = document.documentElement;
    var req = root.requestFullscreen || root.webkitRequestFullscreen || root.msRequestFullscreen;
    if (!req) return;
    try {
      var p = req.call(root);
      if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  }

  function exitFullscreen() {
    if (!fsEl()) return;
    var exit = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
    if (!exit) return;
    try {
      var p = exit.call(document);
      if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  }

  function bounceToDrive() {
    if (isOnDrivePage()) return;
    var url = driveUrl();
    if (isHubOrigin() && isDriveHref(url) && typeof barba !== 'undefined' && typeof barba.go === 'function') {
      try {
        barba.go('/drive/');
        return;
      } catch (e) {}
    }
    location.replace(url);
  }

  function shouldBlockHref(href) {
    if (!isLocked()) return false;
    var raw = String(href || '').trim();
    if (!raw || raw.charAt(0) === '#') return false;
    if (/^(mailto|tel|sms):/i.test(raw)) return false;
    if (/^javascript:/i.test(raw)) return false;
    return !isDriveHref(raw);
  }

  function onClick(e) {
    if (!isLocked()) return;
    var t = e.target;
    var a = t && t.closest ? t.closest('a[href]') : null;
    if (!a) return;
    var href = a.getAttribute('href');
    if (!shouldBlockHref(href)) return;
    e.preventDefault();
    e.stopPropagation();
    bounceToDrive();
  }

  function onPopState() {
    if (!isLocked()) return;
    if (isOnDrivePage()) return;
    try {
      history.pushState({ ttmsDriverShift: 1 }, '', driveUrl());
    } catch (e) {}
    bounceToDrive();
  }

  function hookBarba() {
    if (hookedBarba) return;
    if (typeof barba === 'undefined' || !barba.hooks || typeof barba.hooks.before !== 'function') {
      return;
    }
    hookedBarba = true;
    barba.hooks.before(function (data) {
      if (!isLocked()) return;
      var next =
        (data && data.next && data.next.url && (data.next.url.href || data.next.url.path)) ||
        (data && data.trigger && data.trigger.href) ||
        '';
      if (!next && data && data.next && data.next.url && data.next.url.pathname) {
        next = data.next.url.pathname;
      }
      if (!next || isDriveHref(next) || pathOf(next) === '/drive') return;
      bounceToDrive();
      throw new Error('ttms-driver-shift');
    });
  }

  function bind() {
    if (bound) return;
    bound = true;
    document.addEventListener('click', onClick, true);
    window.addEventListener('popstate', onPopState);
    window.addEventListener('pageshow', function () {
      if (isLocked() && !isOnDrivePage()) bounceToDrive();
    });
    hookBarba();
    if (!hookedBarba) {
      var n = 0;
      var timer = setInterval(function () {
        hookBarba();
        n += 1;
        if (hookedBarba || n > 40) clearInterval(timer);
      }, 50);
    }
    window.addEventListener('auth:logout', function () {
      setLocked(false);
    });
    window.addEventListener('ttms:auth-ready', function () {
      if (isLocked() && !isOnDrivePage()) bounceToDrive();
    });
  }

  function setLocked(on, opts) {
    persist(!!on);
    applyShiftClass(!!on);
    if (on) {
      closeChrome();
      if (opts && opts.fullscreen) enterFullscreen();
      bounceToDrive();
    } else {
      exitFullscreen();
    }
  }

  window.TtmsDriverShift = {
    set: setLocked,
    isLocked: isLocked,
    persist: persist,
    driveUrl: driveUrl,
    bounceToDrive: bounceToDrive,
    isOnDrivePage: isOnDrivePage,
    shouldBlockHref: shouldBlockHref,
    enterFullscreen: enterFullscreen,
    exitFullscreen: exitFullscreen,
  };

  if (storedOn() && !authSaysSignedOut()) {
    applyShiftClass(true);
    if (!isOnDrivePage()) {
      location.replace(driveUrl());
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
