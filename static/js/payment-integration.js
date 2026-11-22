/**
 * TTMenus Payment Integration
 * Connects menu checkout to payment-service (POST /pay, GET /status/:id).
 * Paid orders are tracked locally and verified against the service store (Redis/Kafka-backed).
 */
(function () {
  'use strict';

  if (typeof window.PaymentIntegration !== 'undefined') {
    return;
  }

  var STORAGE_PAID = 'ttms_paid_orders_v1';
  var STORAGE_PENDING = 'ttms_payment_pending_v1';
  var STORAGE_DINER = 'ttms_diner_session_v1';
  var cardOnFileKnown = null;
  var pendingPay = null;
  var cardOnFileWired = false;

  function cfg() {
    return window.PAYMENT_CONFIG || {};
  }

  function isEnabled() {
    var c = cfg();
    return !!(c.enabled && c.apiUrl);
  }

  function apiHeaders() {
    var c = cfg();
    var headers = { 'Content-Type': 'application/json' };
    if (c.apiKey) {
      headers['X-API-Key'] = c.apiKey;
    }
    return headers;
  }

  function apiBase() {
    return String(cfg().apiUrl || '').replace(/\/+$/, '');
  }

  function readPaidMap() {
    try {
      var raw = sessionStorage.getItem(STORAGE_PAID) || localStorage.getItem(STORAGE_PAID);
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  }

  function writePaidMap(map) {
    var json = JSON.stringify(map || {});
    try {
      sessionStorage.setItem(STORAGE_PAID, json);
    } catch (_) { /* ignore */ }
    try {
      localStorage.setItem(STORAGE_PAID, json);
    } catch (_) { /* ignore */ }
  }

  function readPending() {
    try {
      var raw = sessionStorage.getItem(STORAGE_PENDING);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function writePending(data) {
    if (!data) {
      sessionStorage.removeItem(STORAGE_PENDING);
      return;
    }
    sessionStorage.setItem(STORAGE_PENDING, JSON.stringify(data));
  }

  function originBase() {
    if (typeof window !== 'undefined' && window.location && window.location.origin) {
      return window.location.origin.replace(/\/+$/, '');
    }
    return String(cfg().siteOrigin || '').replace(/\/+$/, '');
  }

  function successUrl() {
    var c = cfg();
    return c.successUrl || originBase() + '/payment/success/';
  }

  function cancelUrl() {
    var c = cfg();
    return c.cancelUrl || originBase() + '/payment/cancel/';
  }

  function hashString(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) {
      h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h).toString(36);
  }

  function buildIdempotencyKey(context) {
    if (context && context.idempotencyKey) {
      return context.idempotencyKey;
    }
    var clientId = cfg().clientId || 'ttmenus';
    var payload = [
      clientId,
      context && context.amount,
      context && context.location,
      context && context.orderMode,
      context && context.tableNumber,
      JSON.stringify(context && context.items ? context.items.map(function (i) {
        return [i.item, i.quantity, i.price].join(':');
      }) : [])
    ].join('|');
    return clientId + '-order-' + hashString(payload);
  }

  function markPaid(record) {
    if (!record || !record.idempotencyKey) return;
    var map = readPaidMap();
    map[record.idempotencyKey] = {
      paymentId: record.paymentId,
      status: record.status || 'succeeded',
      amount: record.amount,
      currency: record.currency || 'TTD',
      paidAt: record.paidAt || new Date().toISOString()
    };
    writePaidMap(map);
  }

  function isLocallyPaid(idempotencyKey) {
    if (!idempotencyKey) return false;
    var entry = readPaidMap()[idempotencyKey];
    return !!(entry && entry.status === 'succeeded');
  }

  function setModalState(state, message) {
    var modal = document.getElementById('paymentModal');
    var statusEl = document.getElementById('paymentModalStatus');
    var actionsEl = document.getElementById('paymentModalActions');
    var summaryEl = document.getElementById('paymentModalSummary');
    if (statusEl) {
      statusEl.textContent = message || '';
      statusEl.className = 'payment-modal__status payment-modal__status--' + (state || 'idle');
    }
    if (actionsEl) {
      actionsEl.classList.toggle('hide', state === 'processing' || state === 'redirecting');
    }
    if (summaryEl) {
      summaryEl.classList.toggle('hide', state === 'redirecting');
    }
    if (modal) {
      modal.classList.toggle('hide', false);
      modal.setAttribute('aria-hidden', 'false');
    }
    var cardBox = document.getElementById('paymentCardOnFile');
    if (cardBox) {
      cardBox.classList.toggle('hide', state !== 'choose');
    }
  }

  function closeModal() {
    var modal = document.getElementById('paymentModal');
    if (!modal) return;
    modal.classList.add('hide');
    modal.setAttribute('aria-hidden', 'true');
  }

  function showModal() {
    var modal = document.getElementById('paymentModal');
    if (!modal) return;
    modal.classList.remove('hide');
    modal.setAttribute('aria-hidden', 'false');
  }

  function updateModalSummary(context) {
    var amountEl = document.getElementById('paymentModalAmount');
    var detailEl = document.getElementById('paymentModalDetails');
    if (amountEl && context) {
      amountEl.textContent = '$' + Number(context.amount).toFixed(2) + ' ' + (context.currency || 'TTD');
    }
    if (detailEl && context) {
      var parts = [];
      if (context.location) parts.push(context.location);
      if (context.orderMode) parts.push(context.orderMode);
      if (context.tableNumber) parts.push('Table #' + context.tableNumber);
      detailEl.textContent = parts.join(' · ');
    }
  }

  function submitHostedForm(payment) {
    if (!payment || !payment.form_action || !payment.form_fields) {
      throw new Error('Payment gateway did not return a hosted form');
    }
    var form = document.createElement('form');
    form.method = 'POST';
    form.action = payment.form_action;
    form.style.display = 'none';
    Object.keys(payment.form_fields).forEach(function (key) {
      var input = document.createElement('input');
      input.type = 'hidden';
      input.name = key;
      input.value = payment.form_fields[key];
      form.appendChild(input);
    });
    document.body.appendChild(form);
    form.submit();
  }

  function redirectToUrl(url) {
    if (!url) return;
    window.location.href = url;
  }

  async function fetchStatus(paymentId) {
    var res = await fetch(apiBase() + '/status/' + encodeURIComponent(paymentId), {
      method: 'GET',
      headers: apiHeaders()
    });
    if (!res.ok) {
      var errBody = await res.json().catch(function () { return {}; });
      throw new Error((errBody && errBody.error) || ('Status check failed (' + res.status + ')'));
    }
    return res.json();
  }

  async function createPayment(context) {
    var idempotencyKey = buildIdempotencyKey(context);
    var body = {
      amount: Number(context.amount).toFixed(2),
      currency: context.currency || cfg().currency || 'TTD',
      provider: cfg().provider || '',
      return_url: successUrl(),
      cancel_url: cancelUrl(),
      description: context.description || 'Menu order',
      customer_ref: cfg().clientId || '',
      idempotency_key: idempotencyKey,
      metadata: {
        flow: 'menu_order',
        client_id: cfg().clientId || '',
        location: context.location || '',
        order_mode: context.orderMode || '',
        table_number: context.tableNumber || ''
      }
    };
    if (context && context.dinerSession) {
      body.metadata.diner_session = context.dinerSession;
    }
    if (context && context.saveCard) {
      body.metadata.save_card = 'true';
    }
    if (context && context.walletId) {
      body.metadata.wallet_id = context.walletId;
    }
    if (!body.provider) {
      delete body.provider;
    }

    var res = await fetch(apiBase() + '/pay', {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      var err = await res.json().catch(function () { return {}; });
      throw new Error((err && err.error) || ('Payment request failed (' + res.status + ')'));
    }
    var payment = await res.json();
    return { payment: payment, idempotencyKey: idempotencyKey };
  }

  async function verifyPaid(idempotencyKey, paymentId) {
    if (isLocallyPaid(idempotencyKey)) {
      return true;
    }
    if (!paymentId) {
      return false;
    }
    try {
      var status = await fetchStatus(paymentId);
      if (status && status.status === 'succeeded') {
        markPaid({
          idempotencyKey: idempotencyKey,
          paymentId: paymentId,
          status: status.status,
          amount: status.amount && status.amount.value,
          currency: status.amount && status.amount.currency
        });
        return true;
      }
    } catch (e) {
      console.warn('Payment status check failed:', e);
    }
    return false;
  }

  function readDiner() {
    try {
      var raw = sessionStorage.getItem(STORAGE_DINER);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function writeDiner(session) {
    if (!session) {
      sessionStorage.removeItem(STORAGE_DINER);
      return;
    }
    sessionStorage.setItem(STORAGE_DINER, JSON.stringify(session));
  }

  async function cardOnFileOn() {
    if (cardOnFileKnown !== null) return cardOnFileKnown;
    try {
      var res = await fetch(apiBase() + '/card-on-file', { method: 'GET', headers: apiHeaders() });
      var data = await res.json();
      cardOnFileKnown = !!(data && data.enabled);
    } catch (_) {
      cardOnFileKnown = false;
    }
    return cardOnFileKnown;
  }

  function dinerHeaders() {
    var headers = apiHeaders();
    var diner = readDiner();
    if (diner && diner.session) {
      headers['X-Diner-Session'] = diner.session;
    }
    return headers;
  }

  async function renderCardOnFile() {
    var signedOut = document.getElementById('paymentDinerSignedOut');
    var signedIn = document.getElementById('paymentDinerSignedIn');
    var who = document.getElementById('paymentDinerWho');
    var saved = document.getElementById('paymentSavedCard');
    var note = document.getElementById('paymentSavedCardNote');
    var useBtn = document.getElementById('paymentUseSavedCard');
    var removeBtn = document.getElementById('paymentRemoveCard');
    var diner = readDiner();
    if (signedOut) signedOut.classList.toggle('hide', !!diner);
    if (signedIn) signedIn.classList.toggle('hide', !diner);
    if (!diner) return;
    if (who) who.textContent = diner.email || '';
    var card = null;
    try {
      var res = await fetch(apiBase() + '/diner/wallet', { method: 'GET', headers: dinerHeaders() });
      if (res.ok) card = await res.json();
    } catch (_) {
      card = null;
    }
    var hasCard = !!(card && card.saved && card.last4);
    if (saved) {
      saved.classList.toggle('hide', !hasCard);
      saved.textContent = hasCard ? ((card.brand || 'Card') + ' •••• ' + card.last4) : '';
    }
    if (note) note.classList.toggle('hide', !hasCard);
    if (useBtn) {
      useBtn.classList.toggle('hide', !hasCard);
      useBtn.textContent = hasCard ? ('Pay with ' + (card.brand || 'card') + ' •••• ' + card.last4) : 'Pay with this card';
      useBtn.setAttribute('data-wallet-id', hasCard ? card.wallet_id : '');
    }
    if (removeBtn) removeBtn.classList.toggle('hide', !hasCard);
    var box = document.getElementById('paymentSaveCard');
    if (box) box.checked = false;
  }

  function continueSavedCheckout(extra) {
    if (!pendingPay) return;
    var context = pendingPay.context || {};
    var diner = readDiner();
    context._cardChoiceMade = true;
    context.dinerSession = diner && diner.session ? diner.session : '';
    context.saveCard = !!(extra && extra.saveCard);
    context.walletId = extra && extra.walletId ? extra.walletId : '';
    var done = pendingPay.onSuccess;
    if (window.PaymentIntegration && typeof window.PaymentIntegration.startCheckout === 'function') {
      window.PaymentIntegration.startCheckout(context, done);
    }
  }

  function wireCardOnFile() {
    if (cardOnFileWired) return;
    cardOnFileWired = true;
    var send = document.getElementById('paymentDinerSendCode');
    var verify = document.getElementById('paymentDinerVerify');
    var payNew = document.getElementById('paymentPayNewCard');
    var payGuest = document.getElementById('paymentPayWithoutAccount');
    var paySaved = document.getElementById('paymentUseSavedCard');
    var remove = document.getElementById('paymentRemoveCard');
    var signOut = document.getElementById('paymentDinerSignOut');
    if (send) {
      send.addEventListener('click', async function () {
        var email = (document.getElementById('paymentDinerEmail') || {}).value || '';
        setModalState('choose', 'Sending a code…');
        try {
          var res = await fetch(apiBase() + '/diner/code', {
            method: 'POST',
            headers: apiHeaders(),
            body: JSON.stringify({ email: String(email).trim() })
          });
          var data = await res.json().catch(function () { return {}; });
          if (!res.ok) throw new Error((data && data.error) || 'Could not send the code');
          setModalState('choose', 'Check your email for the code.');
        } catch (err) {
          setModalState('choose', err.message || 'Could not send the code');
        }
      });
    }
    if (verify) {
      verify.addEventListener('click', async function () {
        var email = (document.getElementById('paymentDinerEmail') || {}).value || '';
        var code = (document.getElementById('paymentDinerCode') || {}).value || '';
        setModalState('choose', 'Checking the code…');
        try {
          var res = await fetch(apiBase() + '/diner/session', {
            method: 'POST',
            headers: apiHeaders(),
            body: JSON.stringify({ email: String(email).trim(), code: String(code).trim() })
          });
          var data = await res.json().catch(function () { return {}; });
          if (!res.ok || !data.session) throw new Error((data && data.error) || 'That code did not work');
          writeDiner({ session: data.session, email: data.email || String(email).trim() });
          setModalState('choose', 'Signed in.');
          await renderCardOnFile();
        } catch (err) {
          setModalState('choose', err.message || 'That code did not work');
        }
      });
    }
    if (payNew) {
      payNew.addEventListener('click', function () {
        var box = document.getElementById('paymentSaveCard');
        continueSavedCheckout({ saveCard: !!(box && box.checked) });
      });
    }
    if (payGuest) {
      payGuest.addEventListener('click', function () {
        continueSavedCheckout({});
      });
    }
    if (paySaved) {
      paySaved.addEventListener('click', function () {
        continueSavedCheckout({ walletId: paySaved.getAttribute('data-wallet-id') || '' });
      });
    }
    if (remove) {
      remove.addEventListener('click', async function () {
        setModalState('choose', 'Removing the saved card…');
        try {
          var res = await fetch(apiBase() + '/diner/wallet', { method: 'DELETE', headers: dinerHeaders() });
          if (!res.ok) {
            var data = await res.json().catch(function () { return {}; });
            throw new Error((data && data.error) || 'Could not remove the card');
          }
          setModalState('choose', 'Saved card removed.');
          await renderCardOnFile();
        } catch (err) {
          setModalState('choose', err.message || 'Could not remove the card');
        }
      });
    }
    if (signOut) {
      signOut.addEventListener('click', async function () {
        writeDiner(null);
        setModalState('choose', 'Signed out.');
        await renderCardOnFile();
      });
    }
  }

  var PaymentIntegration = {
    isEnabled: isEnabled,

    getOrderPaymentContext: function () {
      var locationSelect = document.getElementById('locationSelect');
      var selectedLocation = locationSelect
        ? locationSelect.options[locationSelect.selectedIndex]
        : null;
      var total = 0;
      if (typeof price !== 'undefined') {
        total = price + (typeof vatcost !== 'undefined' ? vatcost : 0) + (typeof servicecost !== 'undefined' ? servicecost : 0);
      }
      var items = typeof order !== 'undefined' && Array.isArray(order) ? order : [];
      return {
        amount: total,
        currency: cfg().currency || 'TTD',
        location: selectedLocation ? selectedLocation.text : '',
        orderMode: typeof currentOrderType !== 'undefined' ? currentOrderType : (typeof currentMode !== 'undefined' ? currentMode : ''),
        tableNumber: typeof currentTableNumber !== 'undefined' ? currentTableNumber : (typeof myTable !== 'undefined' ? myTable : ''),
        items: items,
        description: (typeof name !== 'undefined' ? name : 'Menu') + ' order'
      };
    },

    isCurrentOrderPaid: async function (context) {
      if (!isEnabled()) return true;
      context = context || this.getOrderPaymentContext();
      var key = buildIdempotencyKey(context);
      var pending = readPending();
      var paymentId = (pending && pending.idempotencyKey === key && pending.paymentId)
        ? pending.paymentId
        : '';
      if (!paymentId && isLocallyPaid(key)) {
        var entry = readPaidMap()[key];
        paymentId = entry && entry.paymentId ? entry.paymentId : '';
      }
      // Never trust local "paid" alone — verify with payment-service so we always
      // open the hosted page when the charge is not actually succeeded.
      if (paymentId) {
        return verifyPaid(key, paymentId);
      }
      return false;
    },

    startCheckout: async function (context, onSuccess) {
      if (!isEnabled()) {
        if (typeof onSuccess === 'function') onSuccess();
        return true;
      }
      context = context || this.getOrderPaymentContext();
      if (!context.amount || Number(context.amount) <= 0) {
        alert('Your cart total must be greater than zero to pay online.');
        return false;
      }

      var idempotencyKey = buildIdempotencyKey(context);
      if (await this.isCurrentOrderPaid(context)) {
        if (typeof onSuccess === 'function') onSuccess();
        return true;
      }

      if (!context._cardChoiceMade && await cardOnFileOn()) {
        pendingPay = { context: context, onSuccess: onSuccess };
        showModal();
        updateModalSummary(context);
        setModalState('choose', 'Sign in if you want to use a saved card.');
        wireCardOnFile();
        await renderCardOnFile();
        return false;
      }

      showModal();
      updateModalSummary(context);
      setModalState('processing', 'Connecting to secure payment…');

      try {
        var result = await createPayment(context);
        var payment = result.payment;
        writePending({
          idempotencyKey: idempotencyKey,
          paymentId: payment.payment_id,
          amount: context.amount,
          currency: context.currency || 'TTD',
          returnPath: window.location.pathname + window.location.search,
          onSuccess: null
        });

        if (payment.status === 'succeeded') {
          markPaid({
            idempotencyKey: idempotencyKey,
            paymentId: payment.payment_id,
            status: payment.status,
            amount: context.amount,
            currency: context.currency
          });
          writePending(null);
          closeModal();
          if (typeof window.trackPaymentEvent === 'function') {
            window.trackPaymentEvent('Checkout Success', payment.payment_id, context.amount);
          }
          if (typeof onSuccess === 'function') onSuccess();
          return true;
        }

        if (payment.redirect_url) {
          setModalState('redirecting', 'Redirecting to payment provider…');
          redirectToUrl(payment.redirect_url);
          return false;
        }

        if (payment.form_action && payment.form_fields) {
          setModalState('redirecting', 'Opening secure payment form…');
          submitHostedForm(payment);
          return false;
        }

        throw new Error('Unsupported payment response from server');
      } catch (err) {
        if (typeof window.trackPaymentEvent === 'function') {
          window.trackPaymentEvent('Checkout Error', err && err.message ? err.message : 'unknown');
        }
        console.error('Payment checkout failed:', err);
        setModalState('error', err.message || 'Payment failed. Please try again.');
        return false;
      }
    },

    ensurePaidBeforeOrder: async function (context, onSuccess) {
      if (!isEnabled()) {
        if (typeof onSuccess === 'function') onSuccess();
        return true;
      }
      context = context || this.getOrderPaymentContext();
      var paid = await this.isCurrentOrderPaid(context);
      if (paid) {
        if (typeof onSuccess === 'function') onSuccess();
        return true;
      }
      // Opens modal → POST /pay → redirect/form to Fiserv. Does not call onSuccess
      // until payment is already succeeded (or after return + verify).
      return this.startCheckout(context, onSuccess);
    },

    handleReturnPage: async function () {
      if (!isEnabled()) return;
      var path = window.location.pathname || '';
      var isSuccess = path.indexOf('/payment/success') !== -1;
      var isCancel = path.indexOf('/payment/cancel') !== -1;
      if (!isSuccess && !isCancel) return;

      var page = document.querySelector('[data-payment-return]');
      var pending = readPending();
      var params = new URLSearchParams(window.location.search);
      var paymentId = params.get('payment_id') || (pending && pending.paymentId) || '';
      var deliveryOrderId = params.get('order') || params.get('delivery_order') || '';
      function deliveryPage() {
        if (!deliveryOrderId) return '';
        return '/delivery/?order=' + encodeURIComponent(deliveryOrderId);
      }
      var titleEl = document.getElementById('paymentReturnTitle');
      var statusEl = document.getElementById('paymentReturnMessage');
      var detailEl = document.getElementById('paymentReturnDetail');
      var continueBtn = document.getElementById('paymentReturnContinue');
      var cartBtn = document.getElementById('paymentReturnCart');

      function setDetail(text) {
        if (!detailEl) return;
        if (!text) {
          detailEl.hidden = true;
          detailEl.textContent = '';
          return;
        }
        detailEl.hidden = false;
        detailEl.textContent = text;
      }

      function shortPaymentRef(id) {
        if (!id) return '';
        var s = String(id);
        return s.length > 28 ? s.slice(0, 12) + '…' + s.slice(-8) : s;
      }

      if (cartBtn) {
        cartBtn.addEventListener('click', function () {
          var home = (pending && pending.returnPath) || '/';
          if (path.indexOf('/payment/') === 0 && home.indexOf('/payment/') === -1) {
            try {
              sessionStorage.setItem('ttms_open_cart', '1');
            } catch (e) {}
            window.location.href = home;
            return;
          }
          if (typeof window.toggleCart === 'function') {
            window.toggleCart();
          }
        });
      }

      if (isCancel) {
        writePending(null);
        if (typeof window.trackPaymentEvent === 'function') {
          window.trackPaymentEvent('Checkout Cancel');
        }
        // Fiserv CONNECT posts fail params when the hosted page never opens
        // (bad hash, test store on prod URL, etc.) — surface that instead of "you left".
        var failReason =
          params.get('fail_reason') ||
          params.get('failReason') ||
          params.get('fail_rc') ||
          params.get('status') ||
          params.get('invalid') ||
          '';
        // Hosted CONNECT often returns to fail URL with only our payment_id
        // (Scotia HPP crash / genericException) — treat that as gateway reject.
        var providerRejected = !!(
          failReason ||
          paymentId ||
          params.get('response_hash') ||
          params.get('response_code_3dsecure') ||
          params.get('processor_response_code')
        );
        var delivery = deliveryPage();
        if (delivery && continueBtn) {
          continueBtn.href = delivery;
          continueBtn.textContent = 'Back to delivery';
        }
        if (titleEl) {
          titleEl.textContent = providerRejected ? 'Payment could not start' : 'Payment cancelled';
        }
        if (statusEl) {
          statusEl.textContent = providerRejected
            ? 'Checkout was rejected before card entry. Nothing was charged. Open your cart and try again — if this keeps happening, the menu’s payment gateway may be misconfigured.'
            : 'You left checkout before paying. Nothing was charged. Open your cart to try again, or return to the menu.';
        }
        var detailBits = [];
        if (paymentId) detailBits.push('Reference: ' + shortPaymentRef(paymentId));
        if (failReason) detailBits.push('Provider: ' + String(failReason).slice(0, 120));
        setDetail(detailBits.join(' · '));
        return;
      }

      if (page) page.classList.add('is-verifying');
      if (titleEl) titleEl.textContent = 'Confirming payment';
      if (statusEl) statusEl.textContent = 'Checking with the payment provider…';

      var idempotencyKey = pending && pending.idempotencyKey;
      var verified = false;
      var amountLabel = '';

      if (!paymentId) {
        if (page) {
          page.classList.remove('is-verifying');
          page.classList.add('is-failed');
        }
        if (titleEl) titleEl.textContent = 'Payment not confirmed';
        if (statusEl) {
          statusEl.textContent =
            'We could not find a payment reference on this return link. If you were charged, keep your receipt and contact the restaurant.';
        }
        setDetail('');
        return;
      }

      try {
        var status = await fetchStatus(paymentId);
        if (status && status.status === 'succeeded') {
          amountLabel =
            status.amount && status.amount.value
              ? '$' + status.amount.value + ' ' + (status.amount.currency || 'TTD')
              : '';
          markPaid({
            idempotencyKey:
              idempotencyKey ||
              buildIdempotencyKey({
                idempotencyKey: status.metadata && status.metadata.order_ref
              }),
            paymentId: paymentId,
            status: status.status,
            amount: status.amount && status.amount.value,
            currency: status.amount && status.amount.currency
          });
          verified = true;
        } else if (status && status.status === 'requires_action') {
          if (page) {
            page.classList.remove('is-verifying');
            page.classList.add('is-failed');
          }
          if (titleEl) titleEl.textContent = 'Payment still processing';
          if (statusEl) {
            statusEl.textContent =
              'The bank has not finished yet. Wait a moment, then refresh this page. Do not pay again until you see a confirmed status.';
          }
          setDetail('Reference: ' + shortPaymentRef(paymentId));
        } else if (status && (status.status === 'canceled' || status.status === 'cancelled')) {
          if (page) {
            page.classList.remove('is-verifying');
            page.classList.add('is-failed');
          }
          if (titleEl) titleEl.textContent = 'Payment cancelled';
          if (statusEl) {
            statusEl.textContent = 'This payment was cancelled. Nothing should have been charged.';
          }
          setDetail('Reference: ' + shortPaymentRef(paymentId));
        } else {
          if (page) {
            page.classList.remove('is-verifying');
            page.classList.add('is-failed');
          }
          if (titleEl) titleEl.textContent = 'Payment not completed';
          if (statusEl) {
            statusEl.textContent =
              'Checkout did not finish successfully' +
              (status && status.status ? ' (status: ' + status.status + ')' : '') +
              '. You can return to your cart and try again.';
          }
          setDetail('Reference: ' + shortPaymentRef(paymentId));
        }
      } catch (e) {
        if (page) {
          page.classList.remove('is-verifying');
          page.classList.add('is-failed');
        }
        if (titleEl) titleEl.textContent = 'Could not verify payment';
        if (statusEl) {
          statusEl.textContent =
            'We could not reach the payment service' +
            (e && e.message ? ': ' + e.message : '.') +
            ' If you were charged, keep your receipt and contact the restaurant.';
        }
        setDetail('Reference: ' + shortPaymentRef(paymentId));
      }

      if (verified) {
        writePending(null);
        if (page) {
          page.classList.remove('is-verifying', 'is-failed');
          page.classList.add('is-verified');
        }
        if (typeof window.trackPaymentEvent === 'function') {
          window.trackPaymentEvent('Return Success', paymentId);
        }
        var delivery = deliveryPage();
        if (delivery && window.DeliveryClient && typeof DeliveryClient.syncPayment === 'function') {
          DeliveryClient.syncPayment(deliveryOrderId).catch(function () {});
        }
        if (titleEl) titleEl.textContent = 'Payment successful';
        if (statusEl) {
          if (delivery) {
            statusEl.textContent = amountLabel
              ? 'Paid ' + amountLabel + '. Your delivery is confirmed.'
              : 'Payment confirmed. Your delivery is confirmed.';
          } else {
            statusEl.textContent = amountLabel
              ? 'Paid ' + amountLabel + '. Return to the menu to finish placing your order.'
              : 'Payment confirmed. Return to the menu to finish placing your order.';
          }
        }
        setDetail('Reference: ' + shortPaymentRef(paymentId));
        if (continueBtn) {
          continueBtn.classList.remove('hide');
          if (delivery) {
            continueBtn.textContent = 'View delivery';
            continueBtn.href = delivery;
          } else {
            continueBtn.onclick = function (ev) {
              if (ev) ev.preventDefault();
              var target = (pending && pending.returnPath) || '/';
              try {
                sessionStorage.setItem('ttms_open_cart', '1');
              } catch (err) {}
              window.location.href = target;
            };
          }
        }
      }
    },

    closeModal: closeModal,
    markPaid: markPaid,
    isLocallyPaid: isLocallyPaid,
    buildIdempotencyKey: buildIdempotencyKey
  };

  window.PaymentIntegration = PaymentIntegration;
  window.closePaymentModal = closeModal;

  document.addEventListener('DOMContentLoaded', function () {
    PaymentIntegration.handleReturnPage();
    try {
      if (sessionStorage.getItem('ttms_open_cart') === '1') {
        sessionStorage.removeItem('ttms_open_cart');
        setTimeout(function () {
          if (typeof window.toggleCart === 'function') window.toggleCart();
        }, 400);
      }
    } catch (e) {}
  });
})();
