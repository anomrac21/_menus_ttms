/**
 * Dashboard Ads card: list + create ads on ads.ttmenus.com.
 */
(function (global) {
  'use strict';

  var uploadedUrl = '';
  var creating = false;
  var editingAdId = '';
  var networkAdsById = {};

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

  var ADS_STEP_LABELS = ['Image', 'Details', 'Days', 'Submit'];
  var adsStep = 0;

  function getAdsPreviewRoot(step) {
    if (step === 3) return document.getElementById('dashboardAdsSubmitPreview');
    return document.getElementById('dashboardAdsUploadPreview');
  }

  function pauseAdsPreviewRoot(root) {
    if (!root) return;
    var video = root.querySelector('video.ad-video');
    var unmuteBtn = root.querySelector('.ad-unmute-btn');
    if (!video) return;
    try {
      video.pause();
    } catch (e) { /* ignore */ }
    setAdsPreviewMutedUi(video, unmuteBtn, true);
  }

  function syncAdsPreviewPlayback() {
    var panel = document.getElementById('dashboardAdsCreatePanel');
    var open = !!(panel && !panel.hidden);
    var uploadRoot = document.getElementById('dashboardAdsUploadPreview');
    var submitRoot = document.getElementById('dashboardAdsSubmitPreview');
    var activeStep = open && (adsStep === 0 || adsStep === 3) ? adsStep : -1;
    if (activeStep !== 0) pauseAdsPreviewRoot(uploadRoot);
    if (activeStep !== 3) pauseAdsPreviewRoot(submitRoot);
    if (activeStep < 0) return;
    var root = getAdsPreviewRoot(activeStep);
    if (!root) return;
    var video = root.querySelector('video.ad-video');
    var unmuteBtn = root.querySelector('.ad-unmute-btn');
    if (!video) return;
    playAdsPreviewVideo(video, unmuteBtn, adsPreviewWantsSound);
  }

  function isEditingAd() {
    return !!editingAdId;
  }

  function syncEditModeUi() {
    var editing = isEditingAd();
    var submit = document.getElementById('dashboardAdsSubmit');
    var label = submit && submit.querySelector('.dashboard-ads-submit-label');
    var note = document.querySelector('#dashboardAdsPanelSubmit .dashboard-menu-item-wizard-note');
    var form = document.getElementById('dashboardAdsCreateForm');
    if (label) label.textContent = editing ? 'Save changes' : 'Create ad';
    if (note) {
      note.textContent = editing
        ? 'Review your changes, then save this ad on ads.ttmenus.com.'
        : 'This is how the ad will look in menu reels. Create it when you’re ready.';
    }
    if (form) form.classList.toggle('is-editing', editing);
    var toggle = document.getElementById('dashboardAdsAddToggle');
    if (toggle && !document.getElementById('dashboardAdsCreatePanel').hidden) {
      toggle.setAttribute('aria-expanded', 'true');
    }
  }

  function setPanelOpen(open) {
    var panel = document.getElementById('dashboardAdsCreatePanel');
    var toggle = document.getElementById('dashboardAdsAddToggle');
    if (panel) panel.hidden = !open;
    if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      setAdsStep(0);
      syncEditModeUi();
      var image = document.getElementById('dashboardAdsImage');
      if (image && !isEditingAd()) image.focus();
      try {
        panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch (e) { /* ignore */ }
    } else {
      syncAdsPreviewPlayback();
    }
  }

  function adsStatusLabel(value) {
    var v = String(value || 'active').toLowerCase();
    if (v === 'draft') return 'Draft';
    if (v === 'paused') return 'Paused';
    return 'Active';
  }

  function adsReviewDaysLabel() {
    var days = selectedDays();
    if (days.length === 0) return 'Any day';
    if (days.length === 7) return 'Every day';
    return days.map(function (d) { return d.slice(0, 3); }).join(', ');
  }

  function updateAdsReview() {
    var linkEl = document.getElementById('dashboardAdsLink');
    var statusEl = document.getElementById('dashboardAdsStatus');
    var set = function (key, value) {
      var el = document.querySelector('#dashboardAdsReviewMeta [data-ads-review="' + key + '"]');
      if (el) el.textContent = value || '—';
    };
    set('link', linkEl ? String(linkEl.value || '').trim() || 'None' : 'None');
    set('status', adsStatusLabel(statusEl ? statusEl.value : 'active'));
    set('days', adsReviewDaysLabel());
    renderAdsSubmitPreview();
  }

  function setAdsStep(step) {
    adsStep = Math.max(0, Math.min(ADS_STEP_LABELS.length - 1, Number(step) || 0));
    var form = document.getElementById('dashboardAdsCreateForm');
    if (form) form.setAttribute('data-ads-step', String(adsStep));

    Array.prototype.forEach.call(document.querySelectorAll('#dashboardAdsWizardNav [data-ads-step]'), function (tab) {
      var on = Number(tab.getAttribute('data-ads-step')) === adsStep;
      tab.classList.toggle('dashboard-wizard-tab-active', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    Array.prototype.forEach.call(document.querySelectorAll('.dashboard-ads-wizard-panels [data-ads-step]'), function (panel) {
      var on = Number(panel.getAttribute('data-ads-step')) === adsStep;
      panel.classList.toggle('hidden', !on);
      panel.setAttribute('aria-hidden', on ? 'false' : 'true');
    });

    var last = ADS_STEP_LABELS.length - 1;
    var isFirst = adsStep === 0;
    var isLast = adsStep === last;
    var isMiddle = !isFirst && !isLast;
    var setBtnVisible = function (el, visible) {
      if (!el) return;
      el.hidden = !visible;
      el.classList.toggle('hidden', !visible);
    };
    var cancel = document.getElementById('dashboardAdsCreateCancel');
    var prev = document.getElementById('dashboardAdsWizardPrev');
    var next = document.getElementById('dashboardAdsWizardNext');
    var submit = document.getElementById('dashboardAdsSubmit');
    setBtnVisible(cancel, isFirst);
    setBtnVisible(prev, isMiddle);
    if (prev) prev.disabled = !isMiddle;
    setBtnVisible(next, !isLast);
    setBtnVisible(submit, isLast);
    if (isLast) updateAdsReview();
    syncAdsPreviewPlayback();
  }

  function validateAdsStep(step) {
    if (step === 0) {
      if (!uploadedUrl) {
        setFormStatus('Upload an image or video first.', 'error');
        setAdsStep(0);
        return false;
      }
      return true;
    }
    if (step === 1) {
      var titleEl = document.getElementById('dashboardAdsTitle');
      var linkEl = document.getElementById('dashboardAdsLink');
      var statusEl = document.getElementById('dashboardAdsStatus');
      var title = titleEl ? String(titleEl.value || '').trim() : '';
      var link = linkEl ? String(linkEl.value || '').trim() : '';
      var status = statusEl ? String(statusEl.value || '').toLowerCase() : 'active';
      if (!title) {
        setFormStatus('Title is required.', 'error');
        setAdsStep(1);
        if (titleEl) titleEl.focus();
        return false;
      }
      if (link && !isValidLink(link)) {
        setFormStatus('Use an https:// or tel: link.', 'error');
        setAdsStep(1);
        if (linkEl) linkEl.focus();
        return false;
      }
      if (status !== 'active' && status !== 'draft' && status !== 'paused') {
        setFormStatus('Choose Active, Draft, or Paused.', 'error');
        setAdsStep(1);
        if (statusEl) statusEl.focus();
        return false;
      }
      return true;
    }
    return true;
  }

  var ADS_DAY_ORDER = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ];

  function adsDaysRoot() {
    return document.getElementById('dashboardAdsDays');
  }

  function setAdsDaysUi(days) {
    var root = adsDaysRoot();
    if (!root) return;
    var selected = {};
    (Array.isArray(days) ? days : []).forEach(function (d) {
      if (d) selected[String(d)] = true;
    });
    Array.prototype.forEach.call(root.querySelectorAll('.dashboard-availability-day'), function (btn) {
      var on = !!selected[btn.getAttribute('data-day')];
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.classList.toggle('is-on', on);
    });
  }

  function selectedDays() {
    var root = adsDaysRoot();
    if (!root) return [];
    return Array.prototype.map
      .call(root.querySelectorAll('.dashboard-availability-day[aria-pressed="true"]'), function (btn) {
        return btn.getAttribute('data-day');
      })
      .filter(Boolean);
  }

  function bindAdsDaysUi() {
    var root = adsDaysRoot();
    if (root && !root.getAttribute('data-bound')) {
      root.setAttribute('data-bound', '1');
      root.addEventListener('click', function (e) {
        var btn = e.target.closest('.dashboard-availability-day');
        if (!btn || !root.contains(btn)) return;
        var on = btn.getAttribute('aria-pressed') === 'true';
        btn.setAttribute('aria-pressed', on ? 'false' : 'true');
        btn.classList.toggle('is-on', !on);
      });
    }
    var presets = document.getElementById('dashboardAdsDaysPresets');
    if (presets && !presets.getAttribute('data-bound')) {
      presets.setAttribute('data-bound', '1');
      presets.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-ads-day-preset]');
        if (!btn) return;
        var kind = btn.getAttribute('data-ads-day-preset');
        var next = [];
        if (kind === 'weekdays') next = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
        else if (kind === 'weekend') next = ['Saturday', 'Sunday'];
        else if (kind === 'all') next = ADS_DAY_ORDER.slice();
        setAdsDaysUi(next);
      });
    }
  }

  function resetForm() {
    var form = document.getElementById('dashboardAdsCreateForm');
    if (form) form.reset();
    uploadedUrl = '';
    editingAdId = '';
    var name = document.getElementById('dashboardAdsImageName');
    if (name) name.textContent = 'No file selected yet';
    var pickBtn = document.getElementById('dashboardAdsPickMedia');
    if (pickBtn) pickBtn.hidden = false;
    var progress = document.getElementById('dashboardAdsUploadProgress');
    if (progress) progress.hidden = true;
    var bar = document.getElementById('dashboardAdsUploadBar');
    if (bar) bar.style.width = '0%';
    clearAdsUploadPreview();
    var statusEl = document.getElementById('dashboardAdsStatus');
    if (statusEl) statusEl.value = 'active';
    var weightEl = document.getElementById('dashboardAdsWeight');
    if (weightEl) weightEl.value = '30';
    setAdsDaysUi(ADS_DAY_ORDER.slice());
    setFormStatus('', '');
    setAdsStep(0);
    syncEditModeUi();
  }

  function adDaysFromAd(ad) {
    var schedule = (ad && (ad.schedule || ad.Schedule)) || {};
    var days = schedule.days_of_week || schedule.daysOfWeek || ad.days_of_week || ad.daysofweek || [];
    if (!Array.isArray(days)) return ADS_DAY_ORDER.slice();
    var cleaned = days
      .map(function (d) { return String(d || '').trim(); })
      .filter(function (d) { return ADS_DAY_ORDER.indexOf(d) !== -1; });
    return cleaned.length ? cleaned : ADS_DAY_ORDER.slice();
  }

  function adLinkFromAd(ad) {
    if (!ad) return '';
    return String(ad.link_url || ad.linkUrl || ad.link || ad.url || '').trim();
  }

  function populateFormFromAd(ad) {
    if (!ad) return;
    editingAdId = String(ad.id || ad.ID || '').trim();
    var titleEl = document.getElementById('dashboardAdsTitle');
    var linkEl = document.getElementById('dashboardAdsLink');
    var statusEl = document.getElementById('dashboardAdsStatus');
    var weightEl = document.getElementById('dashboardAdsWeight');
    var nameEl = document.getElementById('dashboardAdsImageName');
    if (titleEl) titleEl.value = String(ad.title || '').trim();
    if (linkEl) linkEl.value = adLinkFromAd(ad);
    if (statusEl) {
      var status = String(ad.status || 'active').toLowerCase();
      statusEl.value = status === 'draft' || status === 'paused' ? status : 'active';
    }
    if (weightEl) {
      var weight = parseInt(ad.weight, 10);
      weightEl.value = String(isNaN(weight) ? 30 : Math.max(0, Math.min(100, weight)));
    }
    setAdsDaysUi(adDaysFromAd(ad));
    uploadedUrl = firstImageUrl(ad);
    if (uploadedUrl) {
      var fileLabel = String(ad.title || 'Current media').trim() || 'Current media';
      if (nameEl) nameEl.textContent = fileLabel;
      renderAdsUploadPreview(resolveAssetUrl(uploadedUrl), {
        isVideo: isVideoUrl(uploadedUrl),
        fileName: fileLabel,
        wantSound: false,
        title: String(ad.title || '').trim() || 'Your ad',
      });
    } else {
      clearAdsUploadPreview();
      if (nameEl) nameEl.textContent = 'No file selected yet';
    }
    syncEditModeUi();
  }

  function fetchAdById(id) {
    return ensureAuth()
      .then(function () {
        var clientId = siteClientId();
        var url = adsApiBase() + '/ads/' + encodeURIComponent(id);
        if (clientId) url += '?client_id=' + encodeURIComponent(clientId);
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
          throw new Error(
            (x.data && (x.data.error || x.data.message)) ||
              'Could not load ad (' + x.status + ')'
          );
        }
        return (x.data && (x.data.data || x.data.ad || x.data)) || null;
      });
  }

  function startEditAd(id) {
    var adId = String(id || '').trim();
    if (!adId) return;
    editingAdId = adId;
    uploadedUrl = '';
    clearAdsUploadPreview();
    setFormStatus('Loading ad…', 'info');
    setPanelOpen(true);
    syncEditModeUi();
    var cached = networkAdsById[adId];
    if (cached) populateFormFromAd(cached);
    fetchAdById(adId)
      .then(function (ad) {
        if (!ad) throw new Error('Ad not found.');
        networkAdsById[adId] = ad;
        populateFormFromAd(ad);
        setFormStatus('', '');
        setAdsStep(0);
      })
      .catch(function (err) {
        if (!cached) {
          editingAdId = '';
          syncEditModeUi();
          setFormStatus((err && err.message) || 'Could not load ad.', 'error');
        } else {
          setFormStatus('', '');
        }
      });
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
    networkAdsById = {};
    ads.forEach(function (ad) {
      if (ad && ad.id) networkAdsById[String(ad.id)] = ad;
    });
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
        '<button type="button" class="dashboard-ads-promo-link dashboard-ads-promo-edit" data-ads-edit="' +
        escapeHtml(ad.id) +
        '">Edit</button>' +
        '<a href="' +
        escapeHtml(editUrl) +
        '" class="dashboard-ads-promo-link" target="_blank" rel="noopener">Ads console</a>' +
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

  var adsPreviewObjectUrl = '';

  function revokeAdsPreviewObjectUrl() {
    if (adsPreviewObjectUrl) {
      try {
        URL.revokeObjectURL(adsPreviewObjectUrl);
      } catch (e) { /* ignore */ }
      adsPreviewObjectUrl = '';
    }
  }

  function setAdsImageStepMediaReady(ready) {
    var panel = document.getElementById('dashboardAdsPanelImage');
    var field = document.getElementById('dashboardAdsImageField');
    var replaceBtn = document.getElementById('dashboardAdsReplaceMedia');
    var pickBtn = document.getElementById('dashboardAdsPickMedia');
    if (panel) panel.classList.toggle('has-ads-media', !!ready);
    if (field) field.classList.toggle('has-ads-media', !!ready);
    if (replaceBtn) replaceBtn.hidden = !ready;
    if (pickBtn) pickBtn.hidden = !!ready;
  }

  function openAdsMediaPicker() {
    var input = document.getElementById('dashboardAdsImage');
    if (input) input.click();
  }

  function formatAdsFileLabel(file) {
    if (!file) return 'No file selected yet';
    var name = String(file.name || 'Selected file');
    var size = Number(file.size) || 0;
    var sizeLabel = '';
    if (size >= 1024 * 1024) sizeLabel = (Math.round((size / (1024 * 1024)) * 10) / 10) + ' MB';
    else if (size >= 1024) sizeLabel = Math.max(1, Math.round(size / 1024)) + ' KB';
    var shortName = name.length > 42 ? name.slice(0, 28) + '…' + name.slice(-10) : name;
    return sizeLabel ? shortName + ' · ' + sizeLabel : shortName;
  }

  function clearAdsUploadPreview() {
    revokeAdsPreviewObjectUrl();
    var preview = document.getElementById('dashboardAdsUploadPreview');
    if (preview) {
      preview.hidden = true;
      preview.innerHTML = '';
      preview.classList.remove('is-ready', 'is-video', 'is-image');
      preview.removeAttribute('data-preview-src');
      preview.removeAttribute('data-preview-video');
      preview.removeAttribute('data-preview-file');
    }
    var submitPreview = document.getElementById('dashboardAdsSubmitPreview');
    if (submitPreview) {
      submitPreview.innerHTML = '';
      submitPreview.classList.remove('is-video', 'is-image');
    }
    setAdsImageStepMediaReady(false);
  }

  function previewAdTitle() {
    var titleEl = document.getElementById('dashboardAdsTitle');
    var t = titleEl ? String(titleEl.value || '').trim() : '';
    return t || 'Your ad';
  }

  function adsUnmuteIconSvg(muted) {
    if (muted) {
      return (
        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        '<path d="M16.5 12C16.5 10.23 15.48 8.71 14 7.97V10.18L16.45 12.63C16.48 12.43 16.5 12.22 16.5 12ZM19 12C19 12.94 18.8 13.82 18.46 14.64L19.97 16.15C20.62 14.91 21 13.5 21 12C21 7.72 18.01 4.14 14 3.23V5.29C16.89 6.15 19 8.83 19 12ZM4.27 3L3 4.27L7.73 9H3V15H7L12 20V13.27L16.25 17.53C15.58 18.04 14.83 18.46 14 18.7V20.76C15.38 20.45 16.63 19.82 17.68 18.96L19.73 21L21 19.73L12 10.73L4.27 3ZM12 4L9.91 6.09L12 8.18V4Z" fill="currentColor"/>' +
        '</svg>'
      );
    }
    return (
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<path d="M3 9V15H7L12 20V4L7 9H3ZM16.5 12C16.5 10.23 15.48 8.71 14 7.97V16.03C15.48 15.29 16.5 13.77 16.5 12ZM14 3.23V5.29C16.89 6.15 19 8.83 19 12C19 15.17 16.89 17.85 14 18.71V20.77C18.01 19.86 21 16.28 21 12C21 7.72 18.01 4.14 14 3.23Z" fill="currentColor"/>' +
      '</svg>'
    );
  }

  function adsReelActionsHtml(title) {
    var safe = escapeHtml(title || 'Your ad');
    return (
      '<div class="ads-reel-actions" aria-hidden="true">' +
      '<button type="button" class="ads-reel-action ads-reel-action--favorite" tabindex="-1" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.7-4.35-9.33-8.1C.8 10.4 1.2 6.7 4.1 5.2 6.2 4.1 8.4 4.7 12 8.2 15.6 4.7 17.8 4.1 19.9 5.2c2.9 1.5 3.3 5.2 1.43 7.7C18.7 16.65 12 21 12 21z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>' +
      '</button>' +
      '<button type="button" class="ads-reel-action ads-reel-action--comment" tabindex="-1" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-4 3v-3H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>' +
      '<span class="ads-reel-action__count"></span>' +
      '</button>' +
      '<button type="button" class="ads-reel-action ads-reel-action--share" tabindex="-1" aria-hidden="true" aria-label="Share ' +
      safe +
      '">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5l6 6-6 6v-4c-4.2 0-7 1.4-9 5 1.2-5.2 4.2-8 9-8V5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>' +
      '</button>' +
      '</div>'
    );
  }

  var adsPreviewWantsSound = true;

  function setAdsPreviewMutedUi(video, unmuteBtn, muted) {
    if (!video) return;
    video.muted = !!muted;
    video.defaultMuted = !!muted;
    if (muted) video.setAttribute('muted', '');
    else video.removeAttribute('muted');
    if (!unmuteBtn) return;
    unmuteBtn.classList.toggle('unmuted', !muted);
    unmuteBtn.setAttribute('aria-label', muted ? 'Unmute video' : 'Mute video');
    unmuteBtn.setAttribute('title', muted ? 'Click to unmute video' : 'Click to mute video');
    unmuteBtn.innerHTML = adsUnmuteIconSvg(muted);
  }

  function playAdsPreviewVideo(video, unmuteBtn, withSound) {
    if (!video) return;
    setAdsPreviewMutedUi(video, unmuteBtn, !withSound);
    video.volume = 1;
    var p = video.play();
    if (p && typeof p.catch === 'function') {
      p.catch(function () {
        if (!withSound) return;
        setAdsPreviewMutedUi(video, unmuteBtn, true);
        video.play().catch(function () {});
      });
    }
  }

  function bindAdsReelPreview(slide, opts) {
    opts = opts || {};
    if (!slide) return;
    var video = slide.querySelector('video.ad-video');
    var unmuteBtn = slide.querySelector('.ad-unmute-btn');
    if (!video) return;

    var wantSound = opts.wantSound != null ? !!opts.wantSound : adsPreviewWantsSound;
    video.loop = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.volume = 1;

    var attempt = function () {
      playAdsPreviewVideo(video, unmuteBtn, wantSound);
    };
    attempt();
    video.addEventListener('loadeddata', attempt, { once: true });
    video.addEventListener('canplay', attempt, { once: true });
    setTimeout(attempt, 60);
    setTimeout(attempt, 320);

    var toggleSound = function (e) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      var nextMuted = !video.muted;
      adsPreviewWantsSound = !nextMuted;
      playAdsPreviewVideo(video, unmuteBtn, !nextMuted);
    };

    if (unmuteBtn) unmuteBtn.addEventListener('click', toggleSound);
    video.addEventListener('click', toggleSound);
  }

  function isAdsVideoSrc(src, hint) {
    if (hint != null) return !!hint;
    return isVideoUrl(src);
  }

  function mountAdsReelPreview(preview, src, opts) {
    opts = opts || {};
    if (!preview || !src) return;
    var isVideo = isAdsVideoSrc(src, opts.isVideo);
    var fileName = String(opts.fileName || '').trim();
    var title = String(opts.title || previewAdTitle() || 'Your ad').trim() || 'Your ad';
    var safeSrc = escapeHtml(src);
    var safeTitle = escapeHtml(title);
    var safeAlt = escapeHtml(title || 'Advertisement');
    var wantSound = opts.wantSound != null ? !!opts.wantSound : adsPreviewWantsSound;
    var mediaHtml = isVideo
      ? '<div class="ad-preview-media">' +
        '<video class="ad-portrait ad-video" autoplay' +
        (wantSound ? '' : ' muted') +
        ' loop playsinline webkit-playsinline preload="auto" aria-label="Ad video preview">' +
        '<source src="' +
        safeSrc +
        '">' +
        '</video>' +
        '</div>' +
        '<button type="button" class="ad-unmute-btn' +
        (wantSound ? ' unmuted' : '') +
        '" aria-label="' +
        (wantSound ? 'Mute video' : 'Unmute video') +
        '" title="' +
        (wantSound ? 'Click to mute video' : 'Click to unmute video') +
        '">' +
        adsUnmuteIconSvg(!wantSound) +
        '</button>'
      : '<img src="' +
        safeSrc +
        '" class="ad-portrait-bg" alt="' +
        safeAlt +
        '">' +
        '<img src="' +
        safeSrc +
        '" class="ad-portrait" alt="' +
        safeAlt +
        '">';

    preview.classList.toggle('is-video', isVideo);
    preview.classList.toggle('is-image', !isVideo);
    preview.classList.add('is-ready');
    preview.hidden = false;
    preview.setAttribute('data-preview-src', src);
    preview.setAttribute('data-preview-video', isVideo ? '1' : '0');
    if (fileName) preview.setAttribute('data-preview-file', fileName);
    preview.innerHTML =
      '<div class="dashboard-ads-upload-preview-shell">' +
      '<div class="dashboard-ads-upload-preview-viewport" aria-label="Menu reel preview">' +
      '<article class="ads-reels-slide is-in dashboard-ads-reel-preview-slide">' +
      '<span>Sponsored</span>' +
      mediaHtml +
      '<p class="ads-reel-caption" data-ads-preview-caption>' +
      safeTitle +
      '</p>' +
      adsReelActionsHtml(title) +
      '</article>' +
      '</div>' +
      '</div>';
    bindAdsReelPreview(preview.querySelector('.dashboard-ads-reel-preview-slide'), {
      wantSound: wantSound,
    });
  }

  function renderAdsUploadPreview(src, opts) {
    opts = opts || {};
    var preview = document.getElementById('dashboardAdsUploadPreview');
    mountAdsReelPreview(preview, src, opts);
    setAdsImageStepMediaReady(true);
    if (adsStep !== 0) pauseAdsPreviewRoot(preview);
  }

  function renderAdsSubmitPreview() {
    var preview = document.getElementById('dashboardAdsSubmitPreview');
    if (!preview) return;
    if (!uploadedUrl) {
      preview.innerHTML =
        '<p class="dashboard-ads-submit-preview-empty">Upload media on the Image step to preview this ad.</p>';
      preview.classList.remove('is-video', 'is-image');
      return;
    }
    var uploadPreview = document.getElementById('dashboardAdsUploadPreview');
    var isVideo =
      uploadPreview && uploadPreview.getAttribute('data-preview-video') === '1'
        ? true
        : isVideoUrl(uploadedUrl);
    mountAdsReelPreview(preview, resolveAssetUrl(uploadedUrl), {
      isVideo: isVideo,
      title: previewAdTitle(),
      fileName: uploadPreview ? uploadPreview.getAttribute('data-preview-file') || '' : '',
      wantSound: adsStep === 3 ? adsPreviewWantsSound : false,
    });
    if (adsStep !== 3) pauseAdsPreviewRoot(preview);
  }

  function refreshAdsPreviewCaption() {
    var title = previewAdTitle();
    Array.prototype.forEach.call(
      document.querySelectorAll('#dashboardAdsUploadPreview [data-ads-preview-caption], #dashboardAdsSubmitPreview [data-ads-preview-caption]'),
      function (caption) {
        caption.textContent = title;
      }
    );
  }

  function handleImageChange(event) {
    var input = event.target;
    var file = input.files && input.files[0];
    var name = document.getElementById('dashboardAdsImageName');
    var progress = document.getElementById('dashboardAdsUploadProgress');
    var bar = document.getElementById('dashboardAdsUploadBar');
    uploadedUrl = '';
    clearAdsUploadPreview();
    if (!file) {
      if (name) name.textContent = 'No file selected';
      if (progress) progress.hidden = true;
      return;
    }
    if (name) name.textContent = formatAdsFileLabel(file);
    var isVideo = String(file.type || '').indexOf('video/') === 0;
    var max = isVideo ? 100 * 1024 * 1024 : 50 * 1024 * 1024;
    if (file.size > max) {
      setFormStatus('File is too large (max ' + (isVideo ? '100MB' : '50MB') + ').', 'error');
      input.value = '';
      if (name) name.textContent = 'No file selected';
      return;
    }
    adsPreviewWantsSound = true;
    try {
      adsPreviewObjectUrl = URL.createObjectURL(file);
      renderAdsUploadPreview(adsPreviewObjectUrl, {
        isVideo: isVideo,
        fileName: file.name,
        wantSound: true,
      });
    } catch (e) { /* remote preview after upload */ }
    setFormStatus('Uploading…', 'info');
    if (progress) progress.hidden = false;
    if (bar) bar.style.width = '0%';
    uploadFile(file, function (pct) {
      if (bar) bar.style.width = Math.max(0, Math.min(100, pct)) + '%';
    })
      .then(function (url) {
        uploadedUrl = url;
        if (bar) bar.style.width = '100%';
        if (progress) progress.hidden = true;
        setFormStatus('', '');
        revokeAdsPreviewObjectUrl();
        renderAdsUploadPreview(resolveAssetUrl(url), {
          isVideo: isVideo,
          fileName: file.name,
          wantSound: adsPreviewWantsSound,
        });
      })
      .catch(function (err) {
        uploadedUrl = '';
        clearAdsUploadPreview();
        setFormStatus((err && err.message) || 'Upload failed.', 'error');
        if (progress) progress.hidden = true;
      });
  }

  function saveAd(event) {
    event.preventDefault();
    if (creating) return;
    if (!validateAdsStep(0) || !validateAdsStep(1)) return;
    setAdsStep(3);

    var titleEl = document.getElementById('dashboardAdsTitle');
    var linkEl = document.getElementById('dashboardAdsLink');
    var statusEl = document.getElementById('dashboardAdsStatus');
    var weightEl = document.getElementById('dashboardAdsWeight');
    var submit = document.getElementById('dashboardAdsSubmit');
    var label = submit && submit.querySelector('.dashboard-ads-submit-label');
    var editing = isEditingAd();

    var title = titleEl ? String(titleEl.value || '').trim() : '';
    var link = linkEl ? String(linkEl.value || '').trim() : '';
    var status = statusEl ? statusEl.value : 'active';
    var weight = weightEl ? parseInt(weightEl.value, 10) : 30;
    var days = selectedDays();

    if (isNaN(weight) || weight < 0 || weight > 100) weight = 30;

    var menuClientId = siteClientId();
    if (!menuClientId) {
      setFormStatus('This menu has no ads client id configured (params.ads.clientId).', 'error');
      return;
    }
    if (!uploadedUrl) {
      setFormStatus('Upload an image or video first.', 'error');
      setAdsStep(0);
      return;
    }

    var payload = {
      title: title,
      description: null,
      link_url: link || null,
      weight: weight,
      status: status || 'active',
      recurring: true,
      images: [{ url: uploadedUrl, alt_text: title }],
      schedule: { days_of_week: days.length ? days : ADS_DAY_ORDER.slice() },
      targeting: null,
    };
    payload.client_id = menuClientId;

    creating = true;
    if (submit) submit.disabled = true;
    if (label) label.textContent = editing ? 'Saving…' : 'Creating…';
    setFormStatus(
      editing ? 'Saving changes on ads.ttmenus.com…' : 'Creating ad for this menu on ads.ttmenus.com…',
      'info'
    );

    var url = editing
      ? adsApiBase() +
        '/ads/' +
        encodeURIComponent(editingAdId) +
        '?client_id=' +
        encodeURIComponent(menuClientId)
      : adsApiBase() + '/ads';
    var method = editing ? 'PUT' : 'POST';

    ensureAuth()
      .then(function () {
        return fetch(url, {
          method: method,
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
              (editing ? 'Update failed (' : 'Create failed (') + x.status + ')'
          );
        }
        setFormStatus(editing ? 'Ad updated.' : 'Ad created for this menu.', 'ok');
        resetForm();
        setPanelOpen(false);
        return loadNetworkAds();
      })
      .catch(function (err) {
        setFormStatus((err && err.message) || (editing ? 'Could not update ad.' : 'Could not create ad.'), 'error');
      })
      .then(function () {
        creating = false;
        if (submit) submit.disabled = false;
        syncEditModeUi();
      });
  }

  function bindAdsWizardUi() {
    var nav = document.getElementById('dashboardAdsWizardNav');
    if (nav && !nav.getAttribute('data-bound')) {
      nav.setAttribute('data-bound', '1');
      nav.addEventListener('click', function (e) {
        var tab = e.target.closest('[data-ads-step]');
        if (!tab || !nav.contains(tab)) return;
        var target = Number(tab.getAttribute('data-ads-step'));
        if (target > adsStep) {
          for (var i = adsStep; i < target; i++) {
            if (!validateAdsStep(i)) return;
          }
        }
        setFormStatus('', '');
        setAdsStep(target);
      });
    }
    var prev = document.getElementById('dashboardAdsWizardPrev');
    if (prev && !prev.getAttribute('data-bound')) {
      prev.setAttribute('data-bound', '1');
      prev.addEventListener('click', function () {
        setFormStatus('', '');
        setAdsStep(adsStep - 1);
      });
    }
    var next = document.getElementById('dashboardAdsWizardNext');
    if (next && !next.getAttribute('data-bound')) {
      next.setAttribute('data-bound', '1');
      next.addEventListener('click', function () {
        if (!validateAdsStep(adsStep)) return;
        setFormStatus('', '');
        setAdsStep(adsStep + 1);
      });
    }
  }

  function bindUi() {
    bindAdsDaysUi();
    bindAdsWizardUi();
    setAdsStep(0);
    var titleEl = document.getElementById('dashboardAdsTitle');
    if (titleEl && !titleEl.getAttribute('data-ads-preview-bound')) {
      titleEl.setAttribute('data-ads-preview-bound', '1');
      titleEl.addEventListener('input', refreshAdsPreviewCaption);
    }
    var toggle = document.getElementById('dashboardAdsAddToggle');
    var cancel = document.getElementById('dashboardAdsCreateCancel');
    var form = document.getElementById('dashboardAdsCreateForm');
    var image = document.getElementById('dashboardAdsImage');
    if (toggle && !toggle.getAttribute('data-bound')) {
      toggle.setAttribute('data-bound', '1');
      toggle.addEventListener('click', function () {
        var panel = document.getElementById('dashboardAdsCreatePanel');
        var open = panel && panel.hidden;
        if (open) {
          resetForm();
          setFormStatus('', '');
        }
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
      form.addEventListener('submit', saveAd);
    }
    var list = document.getElementById('dashboardAdsNetworkList');
    if (list && !list.getAttribute('data-ads-edit-bound')) {
      list.setAttribute('data-ads-edit-bound', '1');
      list.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-ads-edit]');
        if (!btn || !list.contains(btn)) return;
        e.preventDefault();
        startEditAd(btn.getAttribute('data-ads-edit'));
      });
    }
    if (image && !image.getAttribute('data-bound')) {
      image.setAttribute('data-bound', '1');
      image.addEventListener('change', handleImageChange);
    }
    var pickBtn = document.getElementById('dashboardAdsPickMedia');
    if (pickBtn && !pickBtn.getAttribute('data-bound')) {
      pickBtn.setAttribute('data-bound', '1');
      pickBtn.addEventListener('click', openAdsMediaPicker);
    }
    var replaceBtn = document.getElementById('dashboardAdsReplaceMedia');
    if (replaceBtn && !replaceBtn.getAttribute('data-bound')) {
      replaceBtn.setAttribute('data-bound', '1');
      replaceBtn.addEventListener('click', openAdsMediaPicker);
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
