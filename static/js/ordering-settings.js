/**
 * Ordering system form: guest channel + optional Loyverse flags via CMS.
 */
(function () {
  'use strict';

  function cmsApiBase() {
    var a = (window.CMS_API_URL || '').replace(/\/+$/, '');
    if (a) return a;
    var s = (window.CMS_SERVICE_URL || 'https://cms.ttmenus.com').replace(/\/+$/, '');
    if (/\/api$/i.test(s)) return s;
    return s + '/api';
  }

  function parseCmsApiResponse(res) {
    var ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct.indexOf('application/json') !== -1) {
      return res.json().then(function (data) {
        if (!res.ok) {
          throw new Error((data && (data.error || data.message)) || res.statusText || String(res.status));
        }
        return data;
      });
    }
    return res.text().then(function (text) {
      if (!res.ok) {
        var t = (text || '').replace(/\s+/g, ' ').trim();
        throw new Error((res.status ? res.status + ' ' : '') + (t.slice(0, 160) || res.statusText));
      }
      try {
        return JSON.parse(text);
      } catch (e) {
        throw new Error('Expected JSON from CMS; got: ' + (text || '').slice(0, 100));
      }
    });
  }

  function digitsOnly(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function expandDashboardCard(el) {
    if (!el) return;
    var card = el.closest('[data-dashboard-card]') || el;
    if (card.classList.contains('is-collapsed')) {
      var toggle = card.querySelector('[data-dashboard-card-toggle]');
      if (toggle) toggle.click();
    }
    if (card.scrollIntoView) {
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function orderingIsOn() {
    var el = document.getElementById('os-enabled');
    return !!(el && el.checked);
  }

  function loyverseIsOn() {
    var el = document.getElementById('posEnabledCb');
    return orderingIsOn() && !!(el && !el.disabled && el.checked);
  }

  function guestUsesPhone() {
    var el = document.getElementById('os-phonecall');
    return !el || el.value === 'true';
  }

  function setHidden(el, hidden) {
    if (!el) return;
    el.hidden = !!hidden;
  }

  function syncOrderingDashboardVisibility() {
    var orderingOn = orderingIsOn();
    var loyverseOn = loyverseIsOn();
    var usePhone = guestUsesPhone();
    var banner = document.getElementById('posAccountBanner');
    var connected = loyverseOn && banner && banner.getAttribute('data-state') === 'connected';
    var showCharges = orderingOn && !loyverseOn;
    var showGuestCheckout = orderingOn && !loyverseOn;

    document.querySelectorAll('[data-os-requires-ordering]').forEach(function (el) {
      if (el.hasAttribute('data-os-requires-no-loyverse') || el.hasAttribute('data-os-requires-guest-checkout')) {
        return;
      }
      setHidden(el, !orderingOn);
    });
    document.querySelectorAll('[data-os-when-ordering="off"]').forEach(function (el) {
      setHidden(el, orderingOn);
    });
    document.querySelectorAll('[data-os-requires-no-loyverse]').forEach(function (el) {
      setHidden(el, !showCharges);
    });
    document.querySelectorAll('[data-os-requires-guest-checkout]').forEach(function (el) {
      setHidden(el, !showGuestCheckout);
    });

    var posEmbed = document.getElementById('posIntegrationPanel');
    setHidden(posEmbed, !loyverseOn);

    document.querySelectorAll('[data-pos-requires-connected]').forEach(function (el) {
      setHidden(el, !connected);
    });

    setHidden(document.getElementById('orderingSystemFormActions'), loyverseOn && orderingOn);

    var channelHint = document.getElementById('os-channel-group-hint');
    if (channelHint) {
      channelHint.textContent = loyverseOn
        ? 'WhatsApp is optional alongside Loyverse receipts. Phone is dialer-only and does not create a POS order.'
        : 'Phone opens the dialer. WhatsApp sends the order summary.';
    }
    var contactHint = document.getElementById('os-contact-hint');
    if (contactHint) {
      contactHint.textContent = usePhone
        ? loyverseOn
          ? 'Opens the phone dialer only — does not create a Loyverse order.'
          : 'Opens the phone dialer only.'
        : loyverseOn
          ? 'Opens WhatsApp with the order summary when guests tap Order Now (optional alongside Loyverse).'
          : 'Opens WhatsApp with the order summary when guests tap Order Now.';
    }
  }
  window.syncOrderingDashboardVisibility = syncOrderingDashboardVisibility;

  function init() {
    var form = document.getElementById('orderingSystemForm');
    if (!form) return;

    function autoResizeTextarea(el) {
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = el.scrollHeight + 'px';
    }

    function updateTextareaCharCount(textarea, counterEl, maxLen) {
      if (!textarea || !counterEl) return;
      var len = (textarea.value || '').length;
      counterEl.textContent = len + '/' + maxLen;
      counterEl.classList.toggle('dashboard-settings-char-count--limit', len >= maxLen);
    }

    var disabledMsg = document.getElementById('os-disabled-msg');
    if (disabledMsg) {
      var counterEl = document.getElementById('os-disabled-msg-count');
      function refresh() {
        autoResizeTextarea(disabledMsg);
        updateTextareaCharCount(disabledMsg, counterEl, 255);
      }
      disabledMsg.addEventListener('input', refresh);
      refresh();
    }

    var statusEl = document.getElementById('orderingSystemSaveStatus');
    var btn = document.getElementById('btnSaveOrderingSystem');

    function syncOrderingContactHiddenFields() {
      var contactEl = document.getElementById('os-contact');
      var whatsappEl = document.getElementById('os-whatsapp');
      var phoneEl = document.getElementById('os-phone');
      var phonecallEl = document.getElementById('os-phonecall');
      if (!contactEl || !whatsappEl || !phoneEl || !phonecallEl) return;
      var usePhone = phonecallEl.value === 'true';
      var contact = digitsOnly(contactEl.value);
      if (usePhone) {
        phoneEl.value = contact;
        contactEl.setAttribute('data-phone', contact);
      } else {
        whatsappEl.value = contact;
        contactEl.setAttribute('data-whatsapp', contact);
      }
    }

    function setOrderingChannel(channel) {
      var usePhone = channel === 'phone';
      var phonecallEl = document.getElementById('os-phonecall');
      var contactEl = document.getElementById('os-contact');
      var contactLabel = document.getElementById('os-contact-label');
      var contactIcon = document.getElementById('os-contact-icon');
      var whatsappBtn = document.getElementById('os-channel-whatsapp');
      var phoneBtn = document.getElementById('os-channel-phone');
      if (!phonecallEl || !contactEl) return;
      var currentlyPhone = phonecallEl.value === 'true';
      var currentContact = digitsOnly(contactEl.value);
      if (currentlyPhone) {
        contactEl.setAttribute('data-phone', currentContact);
      } else {
        contactEl.setAttribute('data-whatsapp', currentContact);
      }
      phonecallEl.value = usePhone ? 'true' : 'false';
      contactEl.value = usePhone
        ? contactEl.getAttribute('data-phone') || ''
        : contactEl.getAttribute('data-whatsapp') || '';
      if (whatsappBtn) {
        whatsappBtn.classList.toggle('active', !usePhone);
        whatsappBtn.setAttribute('aria-pressed', usePhone ? 'false' : 'true');
      }
      if (phoneBtn) {
        phoneBtn.classList.toggle('active', usePhone);
        phoneBtn.setAttribute('aria-pressed', usePhone ? 'true' : 'false');
      }
      if (contactLabel) {
        contactLabel.textContent = usePhone ? 'Phone number' : 'WhatsApp number';
      }
      if (contactIcon) {
        contactIcon.innerHTML = usePhone
          ? '<i class="fa fa-phone" aria-hidden="true"></i>'
          : '<i class="fa fa-whatsapp" aria-hidden="true"></i>';
      }
      syncOrderingContactHiddenFields();
      syncOrderingDashboardVisibility();
    }

    var openPosBtn = document.getElementById('osOpenPosPanelBtn');
    if (openPosBtn) {
      openPosBtn.addEventListener('click', function () {
        expandDashboardCard(document.getElementById('posIntegrationPanel'));
      });
    }

    var channelWhatsappBtn = document.getElementById('os-channel-whatsapp');
    var channelPhoneBtn = document.getElementById('os-channel-phone');
    if (channelWhatsappBtn) {
      channelWhatsappBtn.addEventListener('click', function () {
        setOrderingChannel('whatsapp');
      });
    }
    if (channelPhoneBtn) {
      channelPhoneBtn.addEventListener('click', function () {
        setOrderingChannel('phone');
      });
    }
    var contactInput = document.getElementById('os-contact');
    if (contactInput) {
      contactInput.addEventListener('input', syncOrderingContactHiddenFields);
      syncOrderingContactHiddenFields();
    }

    var enabledCb = document.getElementById('os-enabled');
    if (enabledCb) {
      enabledCb.addEventListener('change', syncOrderingDashboardVisibility);
    }
    var loyverseCb = document.getElementById('posEnabledCb');
    if (loyverseCb) {
      loyverseCb.addEventListener('change', syncOrderingDashboardVisibility);
    }
    syncOrderingDashboardVisibility();

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var token =
        typeof AuthClient !== 'undefined' && AuthClient.getAccessToken
          ? AuthClient.getAccessToken()
          : null;
      if (!token) {
        alert('Sign in required.');
        return;
      }
      syncOrderingContactHiddenFields();
      var osHastablesPreserve = (form.getAttribute('data-os-hastables') || 'true') === 'true';
      var payload = {
        enabled: document.getElementById('os-enabled').checked,
        orderingDisabledMessage: (document.getElementById('os-disabled-msg').value || '').trim().slice(0, 255),
        vat: parseFloat(document.getElementById('os-vat').value) || 0,
        servicecharge: parseFloat(document.getElementById('os-service').value) || 0,
        hastables: osHastablesPreserve,
        usephonecall: document.getElementById('os-phonecall').value === 'true',
        whatsapp: digitsOnly(document.getElementById('os-whatsapp').value),
        phone: digitsOnly(document.getElementById('os-phone').value),
      };
      var clientId = window.CLIENT_ID || window.SITE_CLIENT_ID || '_ttms_menu_demo';
      var url = cmsApiBase() + '/clients/' + encodeURIComponent(clientId) + '/config/hugo-orderingsystem';
      if (btn) btn.disabled = true;
      if (statusEl) statusEl.textContent = 'Saving…';
      var loyverseCb = document.getElementById('posEnabledCb');
      var saveOrdering = fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify(payload),
      }).then(parseCmsApiResponse);

      var savePos = Promise.resolve(null);
      if (loyverseCb && !loyverseCb.disabled) {
        var posCfg = window.POS_CONFIG || {};
        var autoCb = document.getElementById('posAutoProcessCb');
        var storeSel = document.getElementById('posStoreSelect');
        var posBody = {
          enabled: !!loyverseCb.checked,
          provider: 'loyverse',
          api_url: posCfg.apiUrl || posCfg.oauthUrl || 'https://loyverse-oauth.ttmenus.com',
          oauth_url: posCfg.oauthUrl || posCfg.apiUrl || 'https://loyverse-oauth.ttmenus.com',
          store_id: (storeSel && storeSel.value) || posCfg.storeId || '',
          sync_menu: !!posCfg.syncMenu,
          auto_process_orders: autoCb ? !!autoCb.checked : !!posCfg.autoProcessOrders,
          fallback_to_whatsapp: false,
        };
        var posUrl =
          cmsApiBase() + '/clients/' + encodeURIComponent(clientId) + '/config/hugo-posintegration';
        savePos = fetch(posUrl, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: 'Bearer ' + token,
          },
          body: JSON.stringify(posBody),
        })
          .then(parseCmsApiResponse)
          .then(function (posData) {
            if (window.POS_CONFIG) {
              window.POS_CONFIG.enabled = !!posBody.enabled;
              window.POS_CONFIG.autoProcessOrders = !!posBody.auto_process_orders;
              window.POS_CONFIG.fallbackToWhatsapp = !!posBody.fallback_to_whatsapp;
            }
            syncOrderingDashboardVisibility();
            return posData;
          });
      }

      // Sequential: both writes rewrite hugo.toml and push master. Parallel
      // clones race (remote rejected: cannot lock ref / expected stale SHA).
      saveOrdering
        .then(function (data) {
          return savePos.then(function (posData) {
            return [data, posData];
          });
        })
        .then(function (results) {
          var data = results[0];
          if (statusEl) {
            var h = data && data.commit && data.commit.hash ? String(data.commit.hash).slice(0, 7) : '';
            var posData = results[1];
            var ph = posData && posData.commit && posData.commit.hash ? String(posData.commit.hash).slice(0, 7) : '';
            statusEl.textContent = ph
              ? 'Saved · ordering ' + (h || 'ok') + ' · POS ' + ph + ' (redeploy to apply)'
              : h
                ? 'Saved · commit ' + h
                : 'Saved.';
          }
        })
        .catch(function (err) {
          alert('Could not save: ' + (err.message || err));
          if (statusEl) statusEl.textContent = '';
        })
        .finally(function () {
          if (btn) btn.disabled = false;
        });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
