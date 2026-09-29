/**
 * Public star ratings and comments for dishes, promotions, and the restaurant.
 */
(function () {
  'use strict';

  var cache = {};
  var inflight = {};
  var pending = [];
  var flushTimer = 0;
  var scanTimer = 0;
  var sheet;
  var current;
  var selectedRating = 0;

  function cfg() {
    return window.REVIEWS_CONFIG || {};
  }

  function clientId() {
    return String(cfg().clientId || window.SITE_CLIENT_ID || '').trim();
  }

  function apiBase() {
    var raw = String(cfg().apiUrl || 'https://reviews.ttmenus.com/api/v1').trim();
    return raw.replace(/\/+$/, '');
  }

  function enabled() {
    return cfg().enabled !== false && !!clientId() && !!apiBase();
  }

  function cacheKey(kind, key) {
    return kind + '\0' + key;
  }

  function dishKey(url) {
    var path = String(url || '')
      .trim()
      .replace(/^\//, '')
      .replace(/\/+$/, '');
    var id = clientId();
    if (!id || !path) return '';
    return id + '|' + path;
  }

  function promoKey(adId, catalogIndex) {
    var id = clientId();
    if (!id) return '';
    adId = String(adId || '').trim();
    if (adId) return id + '|ad:' + adId;
    catalogIndex = String(catalogIndex == null ? '' : catalogIndex).trim();
    if (catalogIndex) return id + '|catalog:' + catalogIndex;
    return '';
  }

  function formatAvg(value) {
    var n = Number(value);
    if (!isFinite(n) || n <= 0) return '';
    return (Math.round(n * 10) / 10).toFixed(1);
  }

  function summaryFor(kind, key) {
    return cache[cacheKey(kind, key)] || null;
  }

  function isLoggedIn() {
    return !!(window.AuthClient && typeof AuthClient.isAuthenticated === 'function' && AuthClient.isAuthenticated());
  }

  function canModerate() {
    return (
      isLoggedIn() &&
      window.AuthClientAccess &&
      typeof AuthClientAccess.hasClientAccess === 'function' &&
      AuthClientAccess.hasClientAccess()
    );
  }

  function promptLogin() {
    if (typeof window.confirm !== 'function') return;
    var go = window.confirm(
      'You need a TT Menus account to leave a rating.\n\nWould you like to go to the login page?'
    );
    if (!go) return;
    try {
      sessionStorage.setItem('ttmenus_redirect_after_login', window.location.pathname + window.location.search);
    } catch (err) {
      /* ignore */
    }
    window.location.href = '/login/';
  }

  function paintChip(el) {
    if (!el) return;
    var kind = el.getAttribute('data-review-kind') || '';
    var key = el.getAttribute('data-review-key') || '';
    var title = el.getAttribute('data-review-title') || '';
    var summary = summaryFor(kind, key);
    var label = el.querySelector('.menu-review-chip__label');
    if (!label) return;
    var count = summary && Number(summary.count) > 0 ? Number(summary.count) : 0;
    var avg = count ? formatAvg(summary.average) : '';
    if (count && avg) {
      label.textContent = avg + ' · ' + count + (count === 1 ? ' rating' : ' ratings');
      el.setAttribute('aria-label', 'Rated ' + avg + ' from ' + count + (count === 1 ? ' rating' : ' ratings'));
    } else {
      label.textContent = 'Rate';
      el.setAttribute('aria-label', 'Rate ' + (title || 'this'));
    }
  }

  function paintAll() {
    document.querySelectorAll('.menu-review-chip').forEach(paintChip);
  }

  function rememberSummary(summary) {
    if (!summary || !summary.kind || !summary.target_key) return;
    cache[cacheKey(summary.kind, summary.target_key)] = summary;
    paintAll();
  }

  function queueSummary(kind, key) {
    if (!kind || !key) return;
    var id = cacheKey(kind, key);
    if (cache[id] || inflight[id]) return;
    inflight[id] = true;
    pending.push({ kind: kind, key: key, id: id });
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flushSummaries, 80);
  }

  function flushSummaries() {
    if (!pending.length || !enabled()) return;
    var batch = pending.splice(0, 100);
    var params = new URLSearchParams();
    params.set('client_id', clientId());
    batch.forEach(function (target) {
      params.append('targets', target.kind + ':' + target.key);
    });
    fetch(apiBase() + '/reviews/summaries?' + params.toString(), { credentials: 'omit' })
      .then(function (response) {
        if (!response.ok) throw new Error('summaries failed');
        return response.json();
      })
      .then(function (data) {
        (data.summaries || []).forEach(rememberSummary);
        batch.forEach(function (target) {
          if (!cache[target.id]) {
            cache[target.id] = { kind: target.kind, target_key: target.key, average: 0, count: 0 };
          }
          delete inflight[target.id];
        });
        paintAll();
        if (pending.length) flushSummaries();
      })
      .catch(function () {
        batch.forEach(function (target) {
          delete inflight[target.id];
        });
      });
  }

  function locationKey(card) {
    var id = clientId();
    if (!id || !card) return '';
    var slug = String(card.getAttribute('data-slug') || '').trim();
    if (!slug) slug = String(card.getAttribute('data-address') || '').trim();
    if (!slug || slug.indexOf('|') !== -1) return '';
    return id + '|loc:' + slug;
  }

  function ensureChip(row, spec) {
    if (!row || !spec || !spec.key) return;
    row.querySelectorAll('.menu-review-chip').forEach(function (old) {
      old.remove();
    });
    var bar = row.nextElementSibling;
    if (!bar || !bar.classList.contains('menu-item-rating-bar')) {
      bar = document.createElement('div');
      bar.className = 'menu-item-rating-bar';
      row.insertAdjacentElement('afterend', bar);
    }
    var chips = bar.querySelectorAll('.menu-review-chip');
    var chip = chips[0] || null;
    for (var i = 1; i < chips.length; i++) chips[i].remove();
    if (!chip) {
      chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'menu-review-chip';
      var star = document.createElement('span');
      star.className = 'menu-review-chip__star';
      star.setAttribute('aria-hidden', 'true');
      star.textContent = '★';
      var label = document.createElement('span');
      label.className = 'menu-review-chip__label';
      label.textContent = 'Rate';
      chip.appendChild(star);
      chip.appendChild(label);
      bar.appendChild(chip);
    }
    chip.setAttribute('data-review-kind', spec.kind);
    chip.setAttribute('data-review-key', spec.key);
    chip.setAttribute('data-review-title', spec.title || '');
    paintChip(chip);
    queueSummary(spec.kind, spec.key);
  }

  function cardTitle(card) {
    var text = card.querySelector('.menu-item-title-text');
    if (text && text.textContent.trim()) return text.textContent.trim();
    var link = card.querySelector('.menu-item-title a');
    if (link && link.textContent.trim()) return link.textContent.trim();
    return 'Dish';
  }

  function scan() {
    if (!enabled()) return;
    document.querySelectorAll('.menu-item-card[data-item-url]').forEach(function (card) {
      var row = card.querySelector('.menu-item-title-row');
      ensureChip(row, {
        kind: 'dish',
        key: dishKey(card.getAttribute('data-item-url')),
        title: cardTitle(card),
      });
    });
    document.querySelectorAll('[data-actions-kind="promotion"]').forEach(function (actions) {
      var row = actions.closest('.menu-item-title-row');
      ensureChip(row, {
        kind: 'promotion',
        key: promoKey(actions.getAttribute('data-ad-id'), actions.getAttribute('data-promotion-catalog-index')),
        title: actions.getAttribute('data-item-title') || 'Promotion',
      });
    });
    document.querySelectorAll('.location-picker-card').forEach(function (card) {
      var venue = card.querySelector('.location-rating');
      var key = locationKey(card);
      if (!venue || !key) return;
      venue.classList.add('is-ready');
      venue.setAttribute('data-review-kind', 'venue');
      venue.setAttribute('data-review-key', key);
      if (!venue.getAttribute('data-review-title')) {
        venue.setAttribute('data-review-title', card.getAttribute('data-address') || 'This location');
      }
      paintChip(venue);
      queueSummary('venue', key);
    });
  }

  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, 60);
  }

  function ensureSheet() {
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.className = 'menu-review-sheet';
    sheet.hidden = true;
    sheet.innerHTML =
      '<div class="menu-review-sheet__backdrop" data-review-close></div>' +
      '<div class="menu-review-sheet__panel" role="dialog" aria-modal="true" aria-labelledby="menu-review-sheet-title">' +
      '<header class="menu-review-sheet__header">' +
      '<h2 id="menu-review-sheet-title" class="menu-review-sheet__title"></h2>' +
      '<button type="button" class="menu-review-sheet__close" data-review-close aria-label="Close">×</button>' +
      '</header>' +
      '<p class="menu-review-sheet__score"></p>' +
      '<form class="menu-review-sheet__form">' +
      '<div class="menu-review-stars" role="radiogroup" aria-label="Rating">' +
      starButtons() +
      '</div>' +
      '<label class="menu-review-sheet__comment-label" for="menu-review-body">Comment</label>' +
      '<textarea id="menu-review-body" class="menu-review-sheet__body" maxlength="500" placeholder="Add a comment (optional)"></textarea>' +
      '<p class="menu-review-sheet__error" hidden></p>' +
      '<div class="menu-review-sheet__actions">' +
      '<button type="submit" class="menu-review-sheet__save">Save</button>' +
      '<button type="button" class="menu-review-sheet__delete" hidden>Delete</button>' +
      '</div></form>' +
      '<ul class="menu-review-sheet__list"></ul>' +
      '</div>';
    document.body.appendChild(sheet);
    sheet.addEventListener('click', onSheetClick);
    sheet.querySelector('form').addEventListener('submit', onSubmit);
    return sheet;
  }

  function starButtons() {
    var html = '';
    for (var i = 1; i <= 5; i++) {
      html +=
        '<button type="button" class="menu-review-stars__star" data-star="' +
        i +
        '" role="radio" aria-checked="false" aria-label="' +
        i +
        ' star' +
        (i === 1 ? '' : 's') +
        '">★</button>';
    }
    return html;
  }

  function setStars(value) {
    selectedRating = value;
    if (!sheet) return;
    sheet.querySelectorAll('.menu-review-stars__star').forEach(function (btn) {
      var n = Number(btn.getAttribute('data-star'));
      var on = n <= value;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-checked', n === value ? 'true' : 'false');
    });
  }

  function showError(message) {
    var el = sheet && sheet.querySelector('.menu-review-sheet__error');
    if (!el) return;
    if (!message) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.textContent = message;
  }

  function formatWhen(value) {
    var date = new Date(value);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function renderList(data) {
    var list = sheet.querySelector('.menu-review-sheet__list');
    var score = sheet.querySelector('.menu-review-sheet__score');
    var summary = (data && data.summary) || {};
    var count = Number(summary.count) || 0;
    var avg = formatAvg(summary.average);
    score.textContent = count && avg ? avg + ' · ' + count + (count === 1 ? ' rating' : ' ratings') : 'No ratings yet';
    list.replaceChildren();
    var reviews = (data && data.reviews) || [];
    var comments = reviews.filter(function (row) {
      return String(row.body || '').trim();
    });
    if (!comments.length) {
      var empty = document.createElement('li');
      empty.className = 'menu-review-sheet__empty';
      empty.textContent = 'No comments yet.';
      list.appendChild(empty);
    }
    var moderate = canModerate();
    comments.forEach(function (row) {
      var item = document.createElement('li');
      item.className = 'menu-review-sheet__item';
      var head = document.createElement('div');
      head.className = 'menu-review-sheet__item-head';
      var who = document.createElement('span');
      who.className = 'menu-review-sheet__author';
      who.textContent = row.author || 'Guest';
      var stars = document.createElement('span');
      stars.className = 'menu-review-sheet__item-stars';
      stars.textContent = '★'.repeat(Math.max(1, Math.min(5, Number(row.rating) || 0)));
      stars.setAttribute('aria-label', (row.rating || 0) + ' stars');
      head.appendChild(who);
      head.appendChild(stars);
      var body = document.createElement('p');
      body.className = 'menu-review-sheet__item-body';
      body.textContent = row.body || '';
      item.appendChild(head);
      item.appendChild(body);
      var when = formatWhen(row.created_at);
      if (when) {
        var time = document.createElement('time');
        time.className = 'menu-review-sheet__when';
        time.dateTime = row.created_at || '';
        time.textContent = when;
        item.appendChild(time);
      }
      if (row.id && (row.mine || moderate)) {
        var remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'menu-review-sheet__remove';
        remove.setAttribute('data-review-id', String(row.id));
        remove.textContent = row.mine ? 'Delete my review' : 'Remove';
        item.appendChild(remove);
      }
      list.appendChild(item);
    });

    var mine = data && data.mine;
    var bodyEl = sheet.querySelector('.menu-review-sheet__body');
    var deleteBtn = sheet.querySelector('.menu-review-sheet__delete');
    if (mine && mine.rating) {
      setStars(Number(mine.rating) || 0);
      bodyEl.value = mine.body || '';
      deleteBtn.hidden = false;
      deleteBtn.setAttribute('data-review-id', mine.id ? String(mine.id) : '');
    } else {
      setStars(selectedRating || 0);
      if (!selectedRating) bodyEl.value = '';
      deleteBtn.hidden = true;
      deleteBtn.removeAttribute('data-review-id');
    }
    if (summary && summary.kind) rememberSummary(summary);
  }

  function reviewsRequest(url, options, retried) {
    options = options || {};
    var method = options.method || 'GET';
    var headers = Object.assign({ Accept: 'application/json' }, options.headers || {});
    var tokenReady = Promise.resolve('');
    if (isLoggedIn() && window.AuthClient && typeof AuthClient.ensureAccessToken === 'function') {
      tokenReady = AuthClient.ensureAccessToken()
        .then(function (result) {
          if (result && result.accessToken) return result.accessToken;
          return (AuthClient.getAccessToken && AuthClient.getAccessToken()) || '';
        })
        .catch(function () {
          return (AuthClient.getAccessToken && AuthClient.getAccessToken()) || '';
        });
    }
    return tokenReady.then(function (token) {
      if (options.auth && !token) throw new Error('Not authenticated');
      if (token) headers.Authorization = 'Bearer ' + token;
      return fetch(url, {
        method: method,
        headers: headers,
        body: options.body,
        credentials: 'omit',
      }).then(function (response) {
        return response.text().then(function (text) {
          var data = {};
          try {
            data = text ? JSON.parse(text) : {};
          } catch (parseErr) {
            data = {};
          }
          if (response.status === 401 && !retried && token && window.AuthClient && typeof AuthClient.refreshToken === 'function') {
            return AuthClient.refreshToken().then(function (refreshResult) {
              if (refreshResult && refreshResult.success) return reviewsRequest(url, options, true);
              throw new Error((data && data.error) || 'Not authenticated');
            });
          }
          if (!response.ok) {
            throw new Error((data && (data.error || data.message)) || 'Request failed');
          }
          return data;
        });
      });
    });
  }

  function loadDetail(spec) {
    var params = new URLSearchParams();
    params.set('client_id', clientId());
    params.set('kind', spec.kind);
    params.set('target_key', spec.key);
    return reviewsRequest(apiBase() + '/reviews?' + params.toString(), { method: 'GET' });
  }

  function open(spec) {
    if (!enabled() || !spec || !spec.kind || !spec.key) return;
    if (spec.kind !== 'dish' && spec.kind !== 'promotion' && spec.kind !== 'venue') return;
    current = spec;
    selectedRating = 0;
    ensureSheet();
    sheet.querySelector('.menu-review-sheet__title').textContent = spec.title || 'Reviews';
    sheet.querySelector('.menu-review-sheet__body').value = '';
    sheet.querySelector('.menu-review-sheet__score').textContent = 'Loading…';
    sheet.querySelector('.menu-review-sheet__list').replaceChildren();
    setStars(0);
    showError('');
    sheet.hidden = false;
    document.body.classList.add('menu-review-sheet-open');
    var closeBtn = sheet.querySelector('.menu-review-sheet__close');
    if (closeBtn) closeBtn.focus();
    loadDetail(spec)
      .then(renderList)
      .catch(function (err) {
        showError(err && err.message ? err.message : 'Could not load reviews');
      });
  }

  function closeSheet() {
    if (!sheet) return;
    sheet.hidden = true;
    document.body.classList.remove('menu-review-sheet-open');
    current = null;
  }

  function invalidateCurrent() {
    if (!current) return;
    delete cache[cacheKey(current.kind, current.key)];
    queueSummary(current.kind, current.key);
  }

  function onSubmit(e) {
    e.preventDefault();
    if (!current) return;
    if (!isLoggedIn()) {
      promptLogin();
      return;
    }
    if (selectedRating < 1 || selectedRating > 5) {
      showError('Choose a star rating.');
      return;
    }
    showError('');
    var body = sheet.querySelector('.menu-review-sheet__body').value || '';
    var saveBtn = sheet.querySelector('.menu-review-sheet__save');
    saveBtn.disabled = true;
    reviewsRequest(apiBase() + '/reviews', {
      method: 'PUT',
      auth: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId(),
        kind: current.kind,
        target_key: current.key,
        rating: selectedRating,
        body: body,
      }),
    })
      .then(function () {
        invalidateCurrent();
        return loadDetail(current);
      })
      .then(renderList)
      .catch(function (err) {
        showError(err && err.message ? err.message : 'Could not save review');
      })
      .then(function () {
        saveBtn.disabled = false;
      });
  }

  function deleteReview(id) {
    if (!current || !isLoggedIn()) {
      promptLogin();
      return;
    }
    if (typeof window.confirm === 'function' && !window.confirm('Delete this review?')) return;
    var url = apiBase() + '/reviews';
    if (id) url += '/' + encodeURIComponent(id);
    else {
      var params = new URLSearchParams();
      params.set('client_id', clientId());
      params.set('kind', current.kind);
      params.set('target_key', current.key);
      url += '?' + params.toString();
    }
    reviewsRequest(url, { method: 'DELETE', auth: true })
      .then(function () {
        selectedRating = 0;
        invalidateCurrent();
        return loadDetail(current);
      })
      .then(renderList)
      .catch(function (err) {
        showError(err && err.message ? err.message : 'Could not delete review');
      });
  }

  function onSheetClick(e) {
    if (e.target.closest('[data-review-close]')) {
      e.preventDefault();
      closeSheet();
      return;
    }
    var star = e.target.closest('.menu-review-stars__star');
    if (star) {
      e.preventDefault();
      setStars(Number(star.getAttribute('data-star')) || 0);
      return;
    }
    var remove = e.target.closest('.menu-review-sheet__remove, .menu-review-sheet__delete');
    if (remove) {
      e.preventDefault();
      deleteReview(remove.getAttribute('data-review-id'));
    }
  }

  function onChipClick(e) {
    var chip = e.target.closest('.menu-review-chip');
    if (!chip) return;
    if (chip.classList.contains('location-rating') && !chip.classList.contains('is-ready')) return;
    e.preventDefault();
    e.stopPropagation();
    open({
      kind: chip.getAttribute('data-review-kind'),
      key: chip.getAttribute('data-review-key'),
      title: chip.getAttribute('data-review-title') || '',
    });
  }

  function openFromActions(root) {
    if (!root) return;
    var kind = root.getAttribute('data-actions-kind') || 'menu-item';
    if (kind === 'section-header') return;
    if (kind === 'promotion') {
      open({
        kind: 'promotion',
        key: promoKey(root.getAttribute('data-ad-id'), root.getAttribute('data-promotion-catalog-index')),
        title: root.getAttribute('data-item-title') || 'Promotion',
      });
      return;
    }
    open({
      kind: 'dish',
      key: dishKey(root.getAttribute('data-item-url')),
      title: root.getAttribute('data-item-title') || cardTitle(root.closest('.menu-item-card') || document) || 'Dish',
    });
  }

  function onKeydown(e) {
    if (e.key === 'Escape' && sheet && !sheet.hidden) {
      e.preventDefault();
      closeSheet();
    }
  }

  function observe() {
    if (!window.MutationObserver || !document.body) return;
    var observer = new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var node = records[i].target;
        if (node && node.closest && node.closest('.menu-review-sheet')) return;
      }
      scheduleScan();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function init() {
    if (!enabled()) return;
    scan();
    observe();
    document.addEventListener('click', onChipClick, true);
    document.addEventListener('keydown', onKeydown, true);
    [
      'ttms:home-menu-ready',
      'homeMenuItemsLoaded',
      'menuReelsUpdated',
      'menuReelsFlattened',
      'adsPopulated',
      'ttms:page-enter',
      'ttms:auth-ready',
    ].forEach(function (name) {
      window.addEventListener(name, scheduleScan);
    });
  }

  window.TTMSMenuReviews = {
    open: open,
    openFromActions: openFromActions,
    scan: scan,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
