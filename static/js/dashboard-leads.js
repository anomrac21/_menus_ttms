(function () {
  'use strict';

  var EMAIL = 'ttmenus868@gmail.com';

  function getAuthApiBase() {
    var raw = '';
    if (typeof window !== 'undefined' && window.AUTH_SERVICE_URL) {
      raw = String(window.AUTH_SERVICE_URL);
    } else if (typeof window !== 'undefined' && window.APP_CONFIG && window.APP_CONFIG.authServiceUrl) {
      raw = String(window.APP_CONFIG.authServiceUrl);
    }
    raw = raw.trim().replace(/\/+$/, '');
    if (!raw) raw = 'https://auth.ttmenus.com/api/v1';
    if (!/\/api\/v1$/i.test(raw)) raw += '/api/v1';
    return raw;
  }

  function getCpsBaseUrl() {
    var raw = (typeof window !== 'undefined' && window.CPS_SERVICE_URL) ? String(window.CPS_SERVICE_URL) : '';
    return raw.trim().replace(/\/+$/, '');
  }

  function isCpsCollectOnlyMode() {
    var v = typeof window !== 'undefined' ? window.TTMS_CPS_COLLECT_ONLY : undefined;
    return v === true || v === 'true';
  }

  function getBearerToken() {
    var ac = window.AuthClient;
    var t = ac && typeof ac.getAccessToken === 'function' ? ac.getAccessToken() : '';
    return t ? 'Bearer ' + t : '';
  }
  function getValue(form, name) {
    if (!form) return '';
    const el = form.elements?.namedItem?.(name);
    if (!el) return '';
    return String(el.value || '').trim();
  }

  function mountDashboardInquiry(cfg) {
    const maxStep = cfg.maxStep || 3;
    const messages = cfg.messages || {};

    function formEl() {
      return document.getElementById(cfg.formId);
    }

    function setStatus(msg, isError) {
      const el = document.getElementById(cfg.statusId);
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('is-error', !!isError);
  }

    function inquiryMotionOk() {
      return !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    function clearPanelClose(panel) {
      if (!panel) return;
      if (panel._ttmsCloseTimer) {
        clearTimeout(panel._ttmsCloseTimer);
        panel._ttmsCloseTimer = 0;
      }
      if (panel._ttmsCloseHandler) {
        panel.removeEventListener('transitionend', panel._ttmsCloseHandler);
        panel._ttmsCloseHandler = null;
      }
    }

    function setOpen(open) {
      const section = document.getElementById(cfg.sectionId);
      const btn = document.getElementById(cfg.toggleId);
      const panel = document.getElementById(cfg.panelId);
    if (!section || !btn) return;
    const next = !!open;
      const wasOpen = section.classList.contains('is-open');
      if (wasOpen === next) {
        if (panel && next) panel.hidden = false;
        return;
      }
      if (next && typeof cfg.closeOthers === 'function') cfg.closeOthers();
    btn.setAttribute('aria-expanded', next ? 'true' : 'false');
      if (!panel || !inquiryMotionOk()) {
        section.classList.toggle('is-open', next);
    if (panel) panel.hidden = !next;
        return;
      }
      clearPanelClose(panel);
      if (next) {
        panel.hidden = false;
        void panel.offsetHeight;
        section.classList.add('is-open');
        return;
      }
      section.classList.remove('is-open');
      const finish = function (ev) {
        if (ev && ev.target !== panel) return;
        if (ev && ev.propertyName && ev.propertyName !== 'grid-template-rows') return;
        if (section.classList.contains('is-open')) return;
        panel.hidden = true;
        clearPanelClose(panel);
      };
      panel._ttmsCloseHandler = finish;
      panel.addEventListener('transitionend', finish);
      panel._ttmsCloseTimer = window.setTimeout(function () {
        if (!section.classList.contains('is-open')) panel.hidden = true;
        clearPanelClose(panel);
      }, 520);
    }

    function collect(form) {
    const values = {};
      cfg.fields.forEach((name) => {
      values[name] = getValue(form, name);
    });
    return values;
  }

    function applyValues(form, values) {
    if (!form || !values || typeof values !== 'object') return;
      cfg.fields.forEach((name) => {
      const el = form.elements?.namedItem?.(name);
      if (!el || String(el.value || '').trim()) return;
      const next = String(values[name] || '').trim();
      if (next) el.value = next;
    });
  }

    function readDraft() {
    try {
        const raw = localStorage.getItem(cfg.draftKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) {
      return null;
    }
  }

    function writeDraft(form) {
    if (!form) return;
    try {
        const payload = collect(form);
        const hasAny = cfg.fields.some((name) => payload[name]);
      if (!hasAny) {
          localStorage.removeItem(cfg.draftKey);
        return;
      }
      payload.step = Number(form.getAttribute('data-lead-step') || 1) || 1;
      payload.savedAt = Date.now();
        localStorage.setItem(cfg.draftKey, JSON.stringify(payload));
    } catch (_) {
      /* ignore quota / private mode */
    }
  }

    function clearDraft() {
    try {
        localStorage.removeItem(cfg.draftKey);
    } catch (_) {
      /* ignore */
    }
  }

    function getStep(form) {
    const n = Number(form && form.getAttribute('data-lead-step'));
      return n >= 1 && n <= maxStep ? n : 1;
  }

    function setStep(form, step, opts) {
    if (!form) return;
      const prev = getStep(form);
      const next = Math.min(maxStep, Math.max(1, Number(step) || 1));
      const animate = inquiryMotionOk() && (!opts || opts.focus !== false) && prev !== next;
    form.setAttribute('data-lead-step', String(next));
    form.querySelectorAll('[data-lead-pane]').forEach((pane) => {
        const show = Number(pane.getAttribute('data-lead-pane')) === next;
        pane.hidden = !show;
        pane.classList.remove('is-entering', 'is-entering-back');
        if (show && animate) {
          pane.classList.add(next > prev ? 'is-entering' : 'is-entering-back');
        }
    });
    form.querySelectorAll('[role="tab"][data-lead-step]').forEach((tab) => {
      const tabStep = Number(tab.getAttribute('data-lead-step'));
      const active = tabStep === next;
      tab.classList.toggle('is-active', active);
      tab.classList.toggle('is-done', tabStep < next);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      tab.tabIndex = active ? 0 : -1;
    });
      if (opts && opts.save !== false) writeDraft(form);
    if (opts && opts.focus !== false) {
      const pane = form.querySelector(`[data-lead-pane="${next}"]`);
      const first = pane && pane.querySelector('input, textarea');
      if (first && typeof first.focus === 'function') first.focus();
    }
  }

    function validateStep(form, step, opts) {
      if (typeof cfg.beforeValidate === 'function') cfg.beforeValidate(form, step);
      const names = (cfg.stepFields && cfg.stepFields[step]) || [];
    const missing = names.filter((name) => !getValue(form, name));
    if (missing.length) {
      if (!opts || opts.announce !== false) {
          const custom =
            typeof cfg.missingMessage === 'function' ? cfg.missingMessage(form, step, missing) : '';
          setStatus(custom || messages.missing || 'Please fill in the required fields.', true);
      }
        const focusSel = cfg.focusFor && cfg.focusFor[missing[0]];
        const first = focusSel
          ? form.querySelector(focusSel)
          : form.elements?.namedItem?.(missing[0]);
      if (first && typeof first.focus === 'function') first.focus();
      return false;
    }
      if (cfg.emailField && step === cfg.emailStep) {
        const email = getValue(form, cfg.emailField);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        if (!opts || opts.announce !== false) {
            setStatus(messages.badEmail || 'Enter a valid email so we can follow up.', true);
        }
          form.elements?.namedItem?.(cfg.emailField)?.focus?.();
        return false;
      }
    }
      if (!opts || opts.announce !== false) setStatus('');
    return true;
  }

    function canAdvance(form, target) {
      const dest = Math.min(maxStep, Math.max(1, Number(target) || 1));
    for (let step = 1; step < dest; step += 1) {
        if (!validateStep(form, step, { announce: dest > getStep(form) })) {
          setStep(form, step, { save: true, focus: true });
        return false;
      }
    }
    return true;
  }

    function bindToggle() {
      const btn = document.getElementById(cfg.toggleId);
      if (!btn || btn.dataset.ttmsBound === '1') return;
      btn.dataset.ttmsBound = '1';
      btn.addEventListener('click', function () {
        setOpen(btn.getAttribute('aria-expanded') !== 'true');
      });
    }

    function bindSteps() {
      const form = formEl();
    if (!form || form.dataset.ttmsStepsBound === '1') return;
    form.dataset.ttmsStepsBound = '1';
    form.addEventListener('input', function () {
        writeDraft(form);
    });
    form.addEventListener('change', function () {
        writeDraft(form);
    });
    form.addEventListener('click', function (ev) {
      const tab = ev.target && ev.target.closest && ev.target.closest('[role="tab"][data-lead-step]');
      if (tab && form.contains(tab)) {
        const dest = Number(tab.getAttribute('data-lead-step'));
          if (dest <= getStep(form) || canAdvance(form, dest)) {
            setStep(form, dest, { save: true, focus: true });
        }
        return;
      }
      if (ev.target && ev.target.closest && ev.target.closest('[data-lead-next]')) {
        ev.preventDefault();
          const current = getStep(form);
          if (validateStep(form, current)) {
            setStep(form, current + 1, { save: true, focus: true });
        }
        return;
      }
      if (ev.target && ev.target.closest && ev.target.closest('[data-lead-back]')) {
        ev.preventDefault();
          setStep(form, getStep(form) - 1, { save: true, focus: true });
      }
    });
  }

    function savedNeedsPassword() {
      try {
        const raw = sessionStorage.getItem(cfg.sentKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.needsPassword === 'boolean') return parsed.needsPassword;
      } catch (_) {
        /* ignore */
      }
      return null;
    }

    function showThanks(opts) {
      const section = document.getElementById(cfg.sectionId);
      const thanks = document.getElementById(cfg.thanksId);
    const copy = thanks && thanks.querySelector('.dashboard-lead__thanks-copy');
    const title = thanks && thanks.querySelector('.dashboard-lead__thanks-title');
    if (section) section.classList.add('is-sent');
    if (thanks) thanks.hidden = false;
    if (copy) {
        const texts = cfg.thanks || {};
      if (opts && opts.duplicate) {
          copy.textContent = texts.duplicate;
      } else if (opts && opts.mailtoFallback) {
          copy.textContent = texts.mailto;
      } else {
          const needs = opts && opts.account
            ? !!opts.account.needs_password
            : savedNeedsPassword();
          if (needs === false && texts.existing) copy.textContent = texts.existing;
          else copy.textContent = texts.done;
        }
      }
      if (title && cfg.thanksTitle) title.textContent = cfg.thanksTitle;
      setOpen(true);
    }

    function validateAll(form) {
      for (let step = 1; step <= maxStep; step += 1) {
        const names = (cfg.stepFields && cfg.stepFields[step]) || [];
        if (!names.length && !(cfg.emailField && step === cfg.emailStep)) continue;
        if (!validateStep(form, step, { announce: true })) {
          setStep(form, step, { save: true, focus: true });
        return false;
      }
    }
    return true;
  }

    function persist(form, extra) {
      try {
        const payload = cfg.sentPayload(form);
        if (extra && typeof extra === 'object') {
          Object.keys(extra).forEach(function (key) {
            payload[key] = extra[key];
          });
        }
        sessionStorage.setItem(cfg.sentKey, JSON.stringify(payload));
    } catch (_) {
      /* ignore */
    }
      clearDraft();
  }

    function openMailto(form) {
    const emailTo = String(form.getAttribute('data-lead-email') || EMAIL).trim() || EMAIL;
      const subject = String(form.getAttribute('data-lead-subject') || cfg.subject).trim();
      const body = cfg.buildBody(form);
      window.location.href =
      `mailto:${encodeURIComponent(emailTo)}` +
      `?subject=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(body)}`;
  }

    async function submitToCps(form) {
    const baseUrl = getCpsBaseUrl();
      if (!baseUrl) throw new Error('CPS URL is not configured');
    const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
    const bearer = getBearerToken();
    if (bearer) headers.Authorization = bearer;
      const res = await fetch(`${baseUrl}${cfg.cpsPath || '/api/leads/listing'}`, {
      method: 'POST',
      headers,
      credentials: 'include',
        body: JSON.stringify(cfg.cpsPayload(form)),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.error || data.message || `HTTP ${res.status}`);
    }
    return data;
  }

    async function handleSubmit(e, form) {
    e.preventDefault();
      setStatus('');
      if (!validateAll(form)) return;
    const submitBtn = form.querySelector('.dashboard-lead__submit');
    if (submitBtn) submitBtn.disabled = true;
      setStatus(messages.sending || 'Sending…');
      try {
        if (typeof cfg.submitAccount === 'function') {
          const result = await cfg.submitAccount(form);
          if (!result || result.email_sent === false) {
            throw new Error((result && result.message) || 'Account saved, but the email did not send. Submit again to resend it.');
          }
          persist(form, { needsPassword: !!result.needs_password });
          showThanks({ account: result });
          setStatus('');
          return;
        }
        if (cfg.skipCps) {
          persist(form);
          openMailto(form);
          showThanks({ mailtoFallback: true });
          setStatus(messages.mailto);
          return;
        }
        if (isCpsCollectOnlyMode()) throw new Error('collect-only');
        const result = await submitToCps(form);
        persist(form);
        showThanks({ duplicate: !!(result && result.duplicate) });
        setStatus(result && result.duplicate ? messages.duplicate : messages.thanks);
    } catch (err) {
        if (typeof cfg.submitAccount === 'function' && !(err && err.offline)) {
          setStatus((err && err.message) || 'Could not create the account. Try again.', true);
          return;
        }
        console.warn(cfg.warnLabel || 'TTMS dashboard inquiry did not reach Odoo', err);
        persist(form);
        openMailto(form);
        showThanks({ mailtoFallback: true });
        setStatus(messages.mailto);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

    function prefill() {
      const form = formEl();
    if (!form) return;
    try {
        if (sessionStorage.getItem(cfg.sentKey)) {
          clearDraft();
          showThanks();
        return;
      }
    } catch (_) {
      /* ignore */
    }
      const draft = readDraft();
    if (draft) {
        applyValues(form, draft);
        setStep(form, draft.step || 1, { save: false, focus: false });
    } else {
        setStep(form, 1, { save: false, focus: false });
      }
      if (typeof cfg.prefillUser === 'function') {
        const wrote = cfg.prefillUser(form);
        if (wrote) writeDraft(form);
      }
    }

    return {
      boot() {
        bindToggle();
        bindSteps();
        prefill();
        if (typeof cfg.onBoot === 'function') cfg.onBoot(formEl());
      },
      handleSubmit,
      setOpen,
      setCloseOthers(fn) {
        cfg.closeOthers = fn;
      },
    };
  }

  function prefillInquiryFromAccount(form, nameField) {
    const ac = window.AuthClient;
    const user = ac && typeof ac.getCurrentUser === 'function' ? ac.getCurrentUser() : null;
    if (!user || typeof user !== 'object') return false;
    const email = String(user.email || '').trim();
    const first = String(user.first_name || user.firstName || '').trim();
    const last = String(user.last_name || user.lastName || '').trim();
    const name = [first, last].filter(Boolean).join(' ') || String(user.username || '').trim();
    const phone = String(user.phone || user.phone_number || '').trim();
    const emailEl = form.elements?.namedItem?.('contactEmail');
    const nameEl = nameField ? form.elements?.namedItem?.(nameField) : null;
    const phoneEl = form.elements?.namedItem?.('contactPhone');
    let wrote = false;
    if (emailEl && !String(emailEl.value || '').trim() && email) {
      emailEl.value = email;
      wrote = true;
    }
    if (nameEl && !String(nameEl.value || '').trim() && name) {
      nameEl.value = name;
      wrote = true;
    }
    if (phoneEl && !String(phoneEl.value || '').trim() && phone) {
      phoneEl.value = phone;
      wrote = true;
    }
    return wrote;
  }

  const listingInquiryMessages = {
    missing: 'Please fill in the required fields.',
    badEmail: 'Enter a valid email so we can follow up.',
    sending: 'Sending…',
    thanks: 'Thanks — we’ll be in touch.',
    duplicate: 'We already have a request from you. We’ll follow up.',
    mailto: 'Email draft opened. Send it so we receive your details.',
  };

  const listingInquiry = mountDashboardInquiry({
    formId: 'ttms-dashboard-lead-form',
    statusId: 'ttms-dashboard-lead-status',
    sectionId: 'dashboard-lead',
    toggleId: 'dashboard-lead-toggle',
    panelId: 'dashboard-lead-panel',
    thanksId: 'dashboard-lead-thanks',
    sentKey: 'ttms_dashboard_lead_sent',
    draftKey: 'ttms_dashboard_lead_draft',
    subject: 'Add my business to TTMenus',
    warnLabel: 'TTMS listing lead did not reach Odoo',
    fields: ['venueName', 'addressArea', 'contactName', 'contactEmail', 'contactPhone', 'notes'],
    stepFields: {
      1: ['venueName', 'addressArea'],
      2: ['contactName', 'contactEmail', 'contactPhone'],
      3: [],
    },
    emailField: 'contactEmail',
    emailStep: 2,
    messages: listingInquiryMessages,
    thanks: {
      done: 'We’ll follow up on the details you shared.',
      duplicate: 'We already have a request from you and will follow up.',
      mailto: 'Send the email draft if it opened, or wait for us to follow up on the details you shared.',
    },
    sentPayload(form) {
      return {
        at: Date.now(),
        venueName: getValue(form, 'venueName'),
        addressArea: getValue(form, 'addressArea'),
        contactName: getValue(form, 'contactName'),
        contactEmail: getValue(form, 'contactEmail'),
        contactPhone: getValue(form, 'contactPhone'),
      };
    },
    buildBody(form) {
      return [
        'New TTMenus business listing request',
        '',
        `Business name: ${getValue(form, 'venueName')}`,
        `Town / area: ${getValue(form, 'addressArea')}`,
        `Contact person: ${getValue(form, 'contactName')}`,
        `Email: ${getValue(form, 'contactEmail')}`,
        `Phone / WhatsApp: ${getValue(form, 'contactPhone')}`,
        '',
        'Notes:',
        getValue(form, 'notes') || '(none)',
        '',
        'Source: hub dashboard — Add my business',
      ].join('\n');
    },
    cpsPayload(form) {
      return {
        event: 'dashboard.listing_lead',
        source: 'hub_dashboard',
        venue_name: getValue(form, 'venueName'),
        address_area: getValue(form, 'addressArea'),
        contact_name: getValue(form, 'contactName'),
        email: getValue(form, 'contactEmail'),
        phone: getValue(form, 'contactPhone'),
        notes: getValue(form, 'notes'),
      };
    },
    prefillUser(form) {
      return prefillInquiryFromAccount(form, 'contactName');
    },
  });

  const driverInquiry = mountDashboardInquiry({
    formId: 'ttms-dashboard-driver-form',
    statusId: 'ttms-dashboard-driver-status',
    sectionId: 'dashboard-driver',
    toggleId: 'dashboard-driver-toggle',
    panelId: 'dashboard-driver-panel',
    thanksId: 'dashboard-driver-thanks',
    sentKey: 'ttms_dashboard_driver_sent',
    draftKey: 'ttms_dashboard_driver_draft',
    subject: 'Drive with TT Menus',
    warnLabel: 'TTMS driver signup did not reach Odoo',
    fields: ['driverName', 'driveArea', 'contactEmail', 'contactPhone', 'vehicleType', 'vehiclePlate', 'notes'],
    stepFields: {
      1: ['driverName', 'driveArea'],
      2: ['contactEmail', 'contactPhone'],
      3: ['vehicleType'],
    },
    emailField: 'contactEmail',
    emailStep: 2,
    messages: listingInquiryMessages,
    thanks: {
      done: 'We’ll follow up on your driver request. You can add photos anytime on Drive.',
      duplicate: 'We already have a driver request from you and will follow up.',
      mailto: 'Send the email draft if it opened, or wait for us to follow up on the details you shared.',
    },
    sentPayload(form) {
      return {
        at: Date.now(),
        driverName: getValue(form, 'driverName'),
        driveArea: getValue(form, 'driveArea'),
        contactEmail: getValue(form, 'contactEmail'),
        contactPhone: getValue(form, 'contactPhone'),
        vehicleType: getValue(form, 'vehicleType'),
      };
    },
    buildBody(form) {
      return [
        'New TTMenus driver signup',
        '',
        `Name: ${getValue(form, 'driverName')}`,
        `Town / area: ${getValue(form, 'driveArea')}`,
        `Email: ${getValue(form, 'contactEmail')}`,
        `Phone / WhatsApp: ${getValue(form, 'contactPhone')}`,
        `Vehicle: ${getValue(form, 'vehicleType')}`,
        `Plate: ${getValue(form, 'vehiclePlate') || '(none)'}`,
        '',
        'Notes:',
        getValue(form, 'notes') || '(none)',
        '',
        'Source: hub dashboard — Drive with TT Menus',
      ].join('\n');
    },
    cpsPayload(form) {
      const name = getValue(form, 'driverName');
      const plate = getValue(form, 'vehiclePlate');
      const extra = getValue(form, 'notes');
      return {
        event: 'dashboard.driver_lead',
        source: 'hub_dashboard_driver',
        venue_name: `Driver · ${name}`,
        address_area: getValue(form, 'driveArea'),
        contact_name: name,
        email: getValue(form, 'contactEmail'),
        phone: getValue(form, 'contactPhone'),
        notes: [
          'Driver signup',
          `Vehicle: ${getValue(form, 'vehicleType')}`,
          `Plate: ${plate || '(none)'}`,
          extra ? `Notes: ${extra}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      };
    },
    prefillUser(form) {
      return prefillInquiryFromAccount(form, 'driverName');
    },
  });

  function capitalizeDineTaste(raw) {
    const ss = window.SearchService;
    if (ss && typeof ss._capitalizeGuestTasteLabel === 'function') {
      return ss._capitalizeGuestTasteLabel(raw);
    }
    const t = String(raw || '')
      .trim()
      .replace(/\s+/g, ' ');
    if (!t) return '';
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  function currentDineTasteTags() {
    const ss = window.SearchService;
    if (!ss || typeof ss.getDashboardTastePreferences !== 'function') return [];
    const prefs = ss.getDashboardTastePreferences() || {};
    if (typeof ss._parseGuestTasteNotes === 'function') {
      return ss._parseGuestTasteNotes(prefs.cuisine_notes);
    }
    return String(prefs.cuisine_notes || '')
      .split(',')
      .map((part) => capitalizeDineTaste(part))
      .filter((part) => part.length >= 2);
  }

  function bindDineTasteField(form) {
    if (!form || form.dataset.ttmsTastesBound === '1') return;
    const list = form.querySelector('[data-dine-taste-list]');
    const input = form.querySelector('[data-dine-taste-input]');
    const hidden = form.elements?.namedItem?.('notes');
    if (!list || !input || !hidden) return;
    form.dataset.ttmsTastesBound = '1';

    function readTags() {
      return String(hidden.value || '')
        .split(',')
        .map((part) => capitalizeDineTaste(part))
        .filter((part) => part.length >= 2);
    }

    function render(tags) {
      list.textContent = '';
      tags.forEach((term) => {
        const chip = document.createElement('span');
        chip.className = 'dashboard-lead__taste';
        chip.setAttribute('role', 'listitem');
        const label = document.createElement('span');
        label.textContent = term;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'dashboard-lead__taste-remove';
        remove.setAttribute('data-dine-taste-remove', term);
        remove.setAttribute('aria-label', 'Remove ' + term);
        remove.textContent = '×';
        chip.appendChild(label);
        chip.appendChild(remove);
        list.appendChild(chip);
      });
    }

    function persistTags(tags) {
      hidden.value = tags.join(', ');
      render(tags);
      const ss = window.SearchService;
      if (ss && typeof ss.syncDashboardTastes === 'function') ss.syncDashboardTastes(tags);
      hidden.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function commit() {
      const parts = String(input.value || '')
        .split(/[,;/|]+/)
        .map((part) => capitalizeDineTaste(part))
        .filter((part) => part.length >= 2);
      input.value = '';
      if (!parts.length) return;
      const tags = readTags();
      const seen = {};
      tags.forEach((term) => {
        seen[term.toLowerCase()] = true;
      });
      let changed = false;
      parts.forEach((term) => {
        const key = term.toLowerCase();
        if (!term || seen[key] || tags.length >= 12) return;
        seen[key] = true;
        tags.push(term);
        changed = true;
      });
      if (changed) persistTags(tags);
    }

    if (!String(hidden.value || '').trim()) {
      const existing = currentDineTasteTags();
      if (existing.length) hidden.value = existing.join(', ');
    }
    render(readTags());
    form._ttmsCommitDineTastes = commit;

    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ',') {
        ev.preventDefault();
        commit();
        return;
      }
      if (ev.key === 'Backspace' && !input.value) {
        const tags = readTags();
        if (!tags.length) return;
        tags.pop();
        persistTags(tags);
      }
    });
    input.addEventListener('blur', commit);
    list.addEventListener('click', function (ev) {
      const btn = ev.target && ev.target.closest && ev.target.closest('[data-dine-taste-remove]');
      if (!btn || !form.contains(btn)) return;
      const value = String(btn.getAttribute('data-dine-taste-remove') || '').toLowerCase();
      persistTags(readTags().filter((term) => term.toLowerCase() !== value));
    });
  }

  const dinerInquiry = mountDashboardInquiry({
    formId: 'ttms-dashboard-dine-form',
    statusId: 'ttms-dashboard-dine-status',
    sectionId: 'dashboard-dine',
    toggleId: 'dashboard-dine-toggle',
    panelId: 'dashboard-dine-panel',
    thanksId: 'dashboard-dine-thanks',
    sentKey: 'ttms_dashboard_dine_sent',
    draftKey: 'ttms_dashboard_dine_draft',
    subject: 'Dine with TT Menus',
    skipCps: true,
    fields: ['dinerName', 'dineArea', 'contactEmail', 'contactPhone', 'notes'],
    stepFields: {
      1: ['notes'],
      2: ['dinerName', 'dineArea'],
      3: ['contactEmail', 'contactPhone'],
    },
    emailField: 'contactEmail',
    emailStep: 3,
    focusFor: { notes: '[data-dine-taste-input]' },
    missingMessage(form, step, missing) {
      if (missing.indexOf('notes') !== -1) return 'Add at least one taste.';
      return '';
    },
    beforeValidate(form) {
      if (form && typeof form._ttmsCommitDineTastes === 'function') form._ttmsCommitDineTastes();
    },
    onBoot(form) {
      bindDineTasteField(form);
    },
    messages: {
      missing: 'Please fill in the required fields.',
      badEmail: 'Enter a valid email so we can send the password link.',
      sending: 'Creating your account…',
      mailto: 'The account service did not respond. Send the email draft if it opened.',
    },
    thanksTitle: 'Check your email',
    thanks: {
      done: 'We sent a link to set your password and verify this account.',
      existing: 'Those tastes are on your account. Check your email, then log in.',
      mailto: 'The account service did not respond. Send the email draft if it opened.',
    },
    async submitAccount(form) {
      let res;
      try {
        res = await fetch(getAuthApiBase() + '/dine-signup', {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            email: getValue(form, 'contactEmail'),
            name: getValue(form, 'dinerName'),
            area: getValue(form, 'dineArea'),
            phone: getValue(form, 'contactPhone'),
            tastes: getValue(form, 'notes'),
            accept_terms: true,
            accept_privacy_policy: true,
          }),
        });
      } catch (err) {
        err.offline = true;
        throw err;
      }
      const data = await res.json().catch(function () { return {}; });
      if (!res.ok && res.status !== 201) {
        throw new Error(data.error || data.message || 'Could not create the account. Try again.');
      }
      return data;
    },
    sentPayload(form) {
      return {
        at: Date.now(),
        dinerName: getValue(form, 'dinerName'),
        dineArea: getValue(form, 'dineArea'),
        contactEmail: getValue(form, 'contactEmail'),
        contactPhone: getValue(form, 'contactPhone'),
      };
    },
    buildBody(form) {
      return [
        'New TTMenus diner signup',
        '',
        `Name: ${getValue(form, 'dinerName')}`,
        `Town / area: ${getValue(form, 'dineArea')}`,
        `Email: ${getValue(form, 'contactEmail')}`,
        `Phone / WhatsApp: ${getValue(form, 'contactPhone')}`,
        '',
        'What they like:',
        getValue(form, 'notes') || '(none)',
        '',
        'Source: hub dashboard — Dine with TT Menus',
      ].join('\n');
    },
    prefillUser(form) {
      return prefillInquiryFromAccount(form, 'dinerName');
    },
  });

  listingInquiry.setCloseOthers(function () {
    driverInquiry.setOpen(false);
    dinerInquiry.setOpen(false);
  });
  driverInquiry.setCloseOthers(function () {
    listingInquiry.setOpen(false);
    dinerInquiry.setOpen(false);
  });
  dinerInquiry.setCloseOthers(function () {
    listingInquiry.setOpen(false);
    driverInquiry.setOpen(false);
  });

  function handleDashboardLeadSubmit(e, form) {
    return listingInquiry.handleSubmit(e, form);
  }

  function handleDashboardDriverSubmit(e, form) {
    return driverInquiry.handleSubmit(e, form);
  }

  function handleDashboardDineSubmit(e, form) {
    return dinerInquiry.handleSubmit(e, form);
  }

  document.addEventListener('submit', function (ev) {
    var form = ev.target;
    if (!form || form.nodeName !== 'FORM') return;
    if (form.id === 'ttms-dashboard-lead-form') handleDashboardLeadSubmit(ev, form);
    if (form.id === 'ttms-dashboard-driver-form') handleDashboardDriverSubmit(ev, form);
    if (form.id === 'ttms-dashboard-dine-form') handleDashboardDineSubmit(ev, form);
  }, false);

  function bootDashboardLeadForm() {
    listingInquiry.boot();
    driverInquiry.boot();
    dinerInquiry.boot();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootDashboardLeadForm);
  } else {
    bootDashboardLeadForm();
  }
  window.addEventListener('ttms:auth-ready', bootDashboardLeadForm);
  window.addEventListener('auth:login', bootDashboardLeadForm);
})();
