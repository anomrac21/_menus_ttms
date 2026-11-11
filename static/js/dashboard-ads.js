/**
 * Dashboard Ads card: list + create ads on ads.ttmenus.com.
 */
(function (global) {
  'use strict';

  var uploadedUrl = '';
  var creating = false;

  function root() {
    return document.getElementById('dashboardAdsOverview');
  }

  function adsApiBase() {
    var el = root();
    var fromDom = el && el.getAttribute('data-ads-api-url');
    if (fromDom) return String(fromDom).replace(/\/+$/, '');
    var service = (el && el.getAttribute('data-ads-service-url')) || 'https://ads.ttmenus.com';
    return String(service).replace(/\/+$/, '') + '/api/v1';
  }

  function adsServiceBase() {
    var el = root();
    return String((el && el.getAttribute('data-ads-service-url')) || 'https://ads.ttmenus.com').replace(
      /\/+$/,
      ''
    );
  }

  function siteClientId() {
    var field = document.getElementById('dashboardAdsClientId');
    var fromField = field && String(field.value || '').trim();
    var el = root();
    var fromDom = el && el.getAttribute('data-ads-client-id');
    var id =
      fromField ||
      (fromDom && String(fromDom).trim()) ||
      (global.CLIENT_ID && String(global.CLIENT_ID).trim()) ||
      (global.SITE_CLIENT_ID && String(global.SITE_CLIENT_ID).trim()) ||
      '';
    return id;
  }

  function normalizeClientKey(id) {
    return String(id || '')
      .trim()
      .toLowerCase()
      .replace(/^_+/, '')
      .replace(/_+/g, '');
  }

  function adsForThisMenu(ads) {
    var clientId = siteClientId();
    if (!clientId) return [];
    var key = normalizeClientKey(clientId);
    return (Array.isArray(ads) ? ads : []).filter(function (ad) {
      var adClient = ad && (ad.client_id || ad.clientId);
      if (!adClient) return false;
      var adKey = normalizeClientKey(adClient);
      return adKey === key || adKey === normalizeClientKey('_' + clientId) || adClient === clientId;
    });
  }

  function isVideoUrl(url) {
    return /\.(mp4|webm|ogg)(\?|$)/i.test(String(url || ''));
  }

  function formatCount(n) {
    if (n == null || n === '') return '0';
    try {
      return new Intl.NumberFormat(undefined).format(Number(n) || 0);
    } catch (e) {
      return String(n);
    }
  }

  function escapeHtml(s) {
    if (s == null) return '';
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function authHeaders(json) {
    var headers = {};
    if (json) headers['Content-Type'] = 'application/json';
    var ac = global.AuthClient;
    var token = ac && typeof ac.getAccessToken === 'function' ? ac.getAccessToken() : null;
    if (token) headers.Authorization = 'Bearer ' + token;
    return headers;
  }

  function ensureAuth() {
    var ac = global.AuthClient;
    if (!ac) return Promise.resolve();
    var p = Promise.resolve();
    if (typeof ac.whenReady === 'function') p = p.then(function () { return ac.whenReady(); });
    if (typeof ac.ensureAccessToken === 'function') {
      p = p.then(function () { return ac.ensureAccessToken(); });
    }
    return p.catch(function () { /* ignore */ });
  }

  function setFormStatus(message, kind) {
    var el = document.getElementById('dashboardAdsFormStatus');
    if (!el) return;
    if (!message) {
      el.hidden = true;
      el.textContent = '';
      el.className = 'dashboard-ads-form-status';
      return;
    }
    el.hidden = false;
    el.textContent = message;
    el.className = 'dashboard-ads-form-status' + (kind ? ' is-' + kind : '');
  }

  function setPanelOpen(open) {
    var panel = document.getElementById('dashboardAdsCreatePanel');
    var toggle = document.getElementById('dashboardAdsAddToggle');
    if (panel) panel.hidden = !open;
    if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      var title = document.getElementById('dashboardAdsTitle');
      if (title) title.focus();
    }
  }

  function resetForm() {
    var form = document.getElementById('dashboardAdsCreateForm');
    if (form) form.reset();
    uploadedUrl = '';
    var name = document.getElementById('dashboardAdsImageName');
    if (name) name.textContent = 'No file selected';
    var progress = document.getElementById('dashboardAdsUploadProgress');
    if (progress) progress.hidden = true;
    var bar = document.getElementById('dashboardAdsUploadBar');
    if (bar) bar.style.width = '0%';
    var preview = document.getElementById('dashboardAdsUploadPreview');
    if (preview) {
      preview.hidden = true;
      preview.innerHTML = '';
    }
    Array.prototype.forEach.call(document.querySelectorAll('input[name="dashboardAdsDay"]'), function (cb) {
      cb.checked = true;
    });
    setFormStatus('', '');
  }

  function resolveAssetUrl(url) {
    var src = String(url || '').trim();
    if (!src) return '';
    if (/^(https?:)?\/\//i.test(src) || src.indexOf('data:') === 0) return src;
    if (src.charAt(0) === '/') return adsServiceBase() + src;
    return adsServiceBase() + '/' + src.replace(/^\/+/, '');
  }

  function firstImageUrl(ad) {
    var images = ad && ad.images;
    if (!Array.isArray(images) || !images.length) return '';
    var img = images[0] || {};
    return resolveAssetUrl(img.image_url || img.url || img.src || '');
  }

  function adAnalytics(ad) {
    var a = (ad && ad.analytics) || {};
    var impressions = Number(a.impressions) || 0;
    var clicks = Number(a.clicks) || 0;
    var ctr = a.ctr != null ? Number(a.ctr) : impressions ? (clicks / impressions) * 100 : 0;
    return {
      impressions: impressions,
      clicks: clicks,
      rate: Math.round(ctr * 10) / 10,
    };
  }

  function renderNetworkAds(ads) {
    var list = document.getElementById('dashboardAdsNetworkList');
    var lead = document.getElementById('dashboardAdsOverviewLead');
    var totals = document.getElementById('dashboardAdsTotals');
    var countEl = document.getElementById('dashboardCardAdsCount');
    var rootEl = root();
    if (!list) return;

    ads = Array.isArray(ads) ? ads.slice() : [];
    ads.sort(function (a, b) {
      var aa = adAnalytics(a);
      var bb = adAnalytics(b);
      return bb.impressions + bb.clicks - (aa.impressions + aa.clicks) || String(a.title || '').localeCompare(String(b.title || ''));
    });

    var promoCount = Number((rootEl && rootEl.getAttribute('data-promo-count')) || 0) || 0;
    var totalCount = ads.length + promoCount;
    if (countEl) {
      countEl.textContent = formatCount(totalCount);
      countEl.classList.remove('is-loading');
      countEl.removeAttribute('aria-busy');
    }
    if (lead) {
      lead.textContent =
        formatCount(ads.length) +
        ' ad' +
        (ads.length === 1 ? '' : 's') +
        ' for this menu' +
        (promoCount ? ' · ' + formatCount(promoCount) + ' menu promotion' + (promoCount === 1 ? '' : 's') : '');
    }

    var impressions = 0;
    var clicks = 0;
    ads.forEach(function (ad) {
      var stats = adAnalytics(ad);
      impressions += stats.impressions;
      clicks += stats.clicks;
    });
    var rate = impressions ? Math.round((clicks / impressions) * 1000) / 10 : null;
    var impEl = document.getElementById('dashboardAdsTotalImpressions');
    var clickEl = document.getElementById('dashboardAdsTotalClicks');
    var rateEl = document.getElementById('dashboardAdsTotalRate');
    if (impEl) impEl.textContent = formatCount(impressions);
    if (clickEl) clickEl.textContent = formatCount(clicks);
    if (rateEl) rateEl.textContent = rate != null ? String(rate) + '%' : '—';
    if (totals) totals.hidden = false;

    if (!ads.length) {
      list.innerHTML =
        '<p class="dashboard-analytics-subtitle" id="dashboardAdsNetworkEmpty">No ads for this menu yet. Use <strong>Add ad</strong> to create one on ads.ttmenus.com.</p>';
      return;
    }

    var html = '';
    ads.forEach(function (ad) {
      var stats = adAnalytics(ad);
      var image = firstImageUrl(ad);
      var status = String(ad.status || 'draft');
      var editUrl = adsServiceBase() + '/ads/' + encodeURIComponent(ad.id) + '/';
      var mediaHtml = !image
        ? '<span class="dashboard-ads-promo-media-fallback"><i class="fa fa-bullhorn" aria-hidden="true"></i></span>'
        : isVideoUrl(image)
          ? '<video src="' +
            escapeHtml(image) +
            '" muted playsinline preload="metadata" aria-hidden="true"></video>'
          : '<img src="' + escapeHtml(image) + '" alt="" loading="lazy" decoding="async">';
      html +=
        '<article class="dashboard-ads-promo-card" data-ad-id="' +
        escapeHtml(ad.id) +
        '" data-ad-client="' +
        escapeHtml(ad.client_id || ad.clientId || '') +
        '" data-promo-kind="network">' +
        '<div class="dashboard-ads-promo-media"' +
        (image ? '' : ' aria-hidden="true"') +
        '>' +
        mediaHtml +
        '</div>' +
        '<div class="dashboard-ads-promo-body">' +
        '<div class="dashboard-ads-promo-copy">' +
        '<span class="dashboard-ads-promo-kind">' +
        escapeHtml(status) +
        '</span>' +
        '<h4 class="dashboard-ads-promo-title">' +
        escapeHtml(ad.title || 'Untitled ad') +
        '</h4>' +
        '</div>' +
        '<dl class="dashboard-ads-promo-stats">' +
        '<div><dt>Impressions</dt><dd>' +
        escapeHtml(formatCount(stats.impressions)) +
        '</dd></div>' +
        '<div><dt>Clicks</dt><dd>' +
        escapeHtml(formatCount(stats.clicks)) +
        '</dd></div>' +
        '<div><dt>Click rate</dt><dd>' +
        escapeHtml(stats.impressions ? String(stats.rate) + '%' : '—') +
        '</dd></div>' +
        '</dl>' +
        '<div class="dashboard-ads-promo-links">' +
        '<a href="' +
        escapeHtml(editUrl) +
        '" class="dashboard-ads-promo-link" target="_blank" rel="noopener">Edit on Ads</a>' +
        '</div>' +
        '</div></article>';
    });
    list.innerHTML = html;
  }

  function loadNetworkAds() {
    var hint = document.getElementById('dashboardAdsHint');
    var clientId = siteClientId();
    if (!clientId) {
      if (hint) {
        hint.textContent = 'This menu has no ads client id configured (params.ads.clientId).';
        hint.classList.remove('hidden');
      }
      renderNetworkAds([]);
      return Promise.resolve();
    }
    return ensureAuth()
      .then(function () {
        var url = adsApiBase() + '/ads?client_id=' + encodeURIComponent(clientId);
        return fetch(url, {
          method: 'GET',
          credentials: 'include',
          headers: authHeaders(false),
        });
      })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, status: res.status, data: data };
        });
      })
      .then(function (x) {
        if (!x.ok) {
          var msg =
            (x.data && (x.data.error || x.data.message)) ||
            (x.status === 401 ? 'Sign in to manage ads for this menu.' : 'Could not load ads (' + x.status + ').');
          if (hint) {
            hint.textContent = msg;
            hint.classList.remove('hidden');
          }
          renderNetworkAds([]);
          return;
        }
        if (hint) {
          hint.classList.add('hidden');
          hint.textContent = '';
        }
        var ads = (x.data && (x.data.data || x.data.ads)) || [];
        // Defense in depth: keep only this menu's client_id even if the API returns more.
        renderNetworkAds(adsForThisMenu(Array.isArray(ads) ? ads : []));
      })
      .catch(function () {
        if (hint) {
          hint.textContent = 'Could not reach ads.ttmenus.com. Try again later.';
          hint.classList.remove('hidden');
        }
        renderNetworkAds([]);
      });
  }

  function uploadFile(file, onProgress) {
    return new Promise(function (resolve, reject) {
      ensureAuth()
        .then(function () {
          var fd = new FormData();
          fd.append('file', file);
          var xhr = new XMLHttpRequest();
          xhr.open('POST', adsApiBase() + '/upload', true);
          var headers = authHeaders(false);
          Object.keys(headers).forEach(function (key) {
            xhr.setRequestHeader(key, headers[key]);
          });
          xhr.upload.onprogress = function (event) {
            if (!event.lengthComputable || typeof onProgress !== 'function') return;
            onProgress((event.loaded / event.total) * 100);
          };
          xhr.onload = function () {
            var body = {};
            try {
              body = JSON.parse(xhr.responseText || '{}');
            } catch (e) {
              body = {};
            }
            if (xhr.status >= 200 && xhr.status < 300 && body.url) {
              resolve(body.url);
              return;
            }
            reject(new Error((body && (body.error || body.message)) || 'Upload failed (' + xhr.status + ')'));
          };
          xhr.onerror = function () {
            reject(new Error('Network error during upload'));
          };
          xhr.send(fd);
        })
        .catch(reject);
    });
  }

  function selectedDays() {
    return Array.prototype.map
      .call(document.querySelectorAll('input[name="dashboardAdsDay"]:checked'), function (cb) {
        return cb.value;
      })
      .filter(Boolean);
  }

  function isValidLink(value) {
    if (!value) return true;
    try {
      var url = new URL(value);
      if (url.protocol === 'http:' || url.protocol === 'https:') return !!url.hostname;
      if (url.protocol === 'tel:') {
        var digits = String(url.pathname || '').replace(/[^\d+]/g, '');
        return /^\+?\d{7,15}$/.test(digits);
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  function handleImageChange(event) {
    var input = event.target;
    var file = input.files && input.files[0];
    var name = document.getElementById('dashboardAdsImageName');
    var progress = document.getElementById('dashboardAdsUploadProgress');
    var bar = document.getElementById('dashboardAdsUploadBar');
    var preview = document.getElementById('dashboardAdsUploadPreview');
    uploadedUrl = '';
    if (!file) {
      if (name) name.textContent = 'No file selected';
      if (progress) progress.hidden = true;
      if (preview) {
        preview.hidden = true;
        preview.innerHTML = '';
      }
      return;
    }
    if (name) name.textContent = file.name;
    var isVideo = String(file.type || '').indexOf('video/') === 0;
    var max = isVideo ? 100 * 1024 * 1024 : 50 * 1024 * 1024;
    if (file.size > max) {
      setFormStatus('File is too large (max ' + (isVideo ? '100MB' : '50MB') + ').', 'error');
      input.value = '';
      if (name) name.textContent = 'No file selected';
      return;
    }
    setFormStatus('Uploading…', 'info');
    if (progress) progress.hidden = false;
    if (bar) bar.style.width = '0%';
    uploadFile(file, function (pct) {
      if (bar) bar.style.width = Math.max(0, Math.min(100, pct)) + '%';
    })
      .then(function (url) {
        uploadedUrl = url;
        if (bar) bar.style.width = '100%';
        setFormStatus('Media uploaded.', 'ok');
        if (preview) {
          preview.hidden = false;
          if (isVideo) {
            preview.innerHTML =
              '<video src="' + escapeHtml(resolveAssetUrl(url)) + '" controls playsinline></video>';
          } else {
            preview.innerHTML = '<img src="' + escapeHtml(resolveAssetUrl(url)) + '" alt="">';
          }
        }
      })
      .catch(function (err) {
        uploadedUrl = '';
        setFormStatus((err && err.message) || 'Upload failed.', 'error');
        if (progress) progress.hidden = true;
      });
  }

  function createAd(event) {
    event.preventDefault();
    if (creating) return;

    var titleEl = document.getElementById('dashboardAdsTitle');
    var linkEl = document.getElementById('dashboardAdsLink');
    var statusEl = document.getElementById('dashboardAdsStatus');
    var weightEl = document.getElementById('dashboardAdsWeight');
    var submit = document.getElementById('dashboardAdsSubmit');
    var label = submit && submit.querySelector('.dashboard-ads-submit-label');

    var title = titleEl ? String(titleEl.value || '').trim() : '';
    var link = linkEl ? String(linkEl.value || '').trim() : '';
    var status = statusEl ? statusEl.value : 'active';
    var weight = weightEl ? parseInt(weightEl.value, 10) : 10;
    var days = selectedDays();

    if (!title) {
      setFormStatus('Title is required.', 'error');
      if (titleEl) titleEl.focus();
      return;
    }
    if (!uploadedUrl) {
      setFormStatus('Upload an image or video first.', 'error');
      return;
    }
    if (link && !isValidLink(link)) {
      setFormStatus('Use an https:// or tel: link.', 'error');
      return;
    }
    if (isNaN(weight) || weight < 0 || weight > 100) {
      setFormStatus('Priority must be between 0 and 100.', 'error');
      return;
    }

    var menuClientId = siteClientId();
    if (!menuClientId) {
      setFormStatus('This menu has no ads client id configured (params.ads.clientId).', 'error');
      return;
    }

    var payload = {
      client_id: menuClientId,
      title: title,
      description: null,
      link_url: link || null,
      weight: weight,
      status: status || 'active',
      recurring: true,
      images: [{ url: uploadedUrl, alt_text: title }],
      schedule: days.length ? { days_of_week: days } : null,
      targeting: null,
    };

    creating = true;
    if (submit) submit.disabled = true;
    if (label) label.textContent = 'Creating…';
    setFormStatus('Creating ad for this menu on ads.ttmenus.com…', 'info');

    ensureAuth()
      .then(function () {
        return fetch(adsApiBase() + '/ads', {
          method: 'POST',
          credentials: 'include',
          headers: authHeaders(true),
          body: JSON.stringify(payload),
        });
      })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, status: res.status, data: data };
        });
      })
      .then(function (x) {
        if (!x.ok) {
          throw new Error(
            (x.data && (x.data.error || x.data.message || x.data.details)) ||
              'Create failed (' + x.status + ')'
          );
        }
        setFormStatus('Ad created for this menu.', 'ok');
        resetForm();
        setPanelOpen(false);
        return loadNetworkAds();
      })
      .catch(function (err) {
        setFormStatus((err && err.message) || 'Could not create ad.', 'error');
      })
      .then(function () {
        creating = false;
        if (submit) submit.disabled = false;
        if (label) label.textContent = 'Create ad';
      });
  }

  function bindUi() {
    var toggle = document.getElementById('dashboardAdsAddToggle');
    var cancel = document.getElementById('dashboardAdsCreateCancel');
    var form = document.getElementById('dashboardAdsCreateForm');
    var image = document.getElementById('dashboardAdsImage');
    if (toggle && !toggle.getAttribute('data-bound')) {
      toggle.setAttribute('data-bound', '1');
      toggle.addEventListener('click', function () {
        var panel = document.getElementById('dashboardAdsCreatePanel');
        var open = panel && panel.hidden;
        if (open) setFormStatus('', '');
        setPanelOpen(!!open);
      });
    }
    if (cancel && !cancel.getAttribute('data-bound')) {
      cancel.setAttribute('data-bound', '1');
      cancel.addEventListener('click', function () {
        resetForm();
        setPanelOpen(false);
      });
    }
    if (form && !form.getAttribute('data-bound')) {
      form.setAttribute('data-bound', '1');
      form.addEventListener('submit', createAd);
    }
    if (image && !image.getAttribute('data-bound')) {
      image.setAttribute('data-bound', '1');
      image.addEventListener('change', handleImageChange);
    }
  }

  function init() {
    if (!root()) return;
    bindUi();
    loadNetworkAds();
  }

  global.DashboardAds = {
    init: init,
    loadNetworkAds: loadNetworkAds,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      /* client-dashboard awaits auth then calls init */
    });
  }
})(typeof window !== 'undefined' ? window : this);
