/**
 * Menu-admin snapshot marker and View action on live menu item cards.
 * Guests never see the marker or the menu option.
 */
(function (global) {
  'use strict';

  var byUrl = {};
  var bySlug = {};
  var itemKeys = {};
  var loadPromise = null;
  var applying = false;

  function tokenRoles() {
    if (!global.AuthClient || typeof global.AuthClient.getAccessToken !== 'function') return [];
    var token = global.AuthClient.getAccessToken();
    if (!token || typeof global.AuthClient.parseJWT !== 'function') return [];
    var claims = global.AuthClient.parseJWT(token);
    if (!claims) return [];
    var roles = claims.roles || claims.Roles || [];
    if (typeof roles === 'string') roles = roles.split(',');
    if (!roles || !roles.length) return [];
    return roles.map(function (role) {
      return String(role || '').trim().toLowerCase();
    });
  }

  function isMenuAdmin() {
    if (!global.AuthClient || !global.AuthClient.isAuthenticated()) return false;
    if (typeof global.AuthClient.isSuperadmin === 'function' && global.AuthClient.isSuperadmin()) return true;
    if (typeof global.AuthClient.isAdmin === 'function' && global.AuthClient.isAdmin()) return true;
    var roles = tokenRoles();
    return roles.indexOf('superadmin') !== -1 || roles.indexOf('admin') !== -1;
  }

  function hasAdminSiteAccess() {
    if (!isMenuAdmin()) return false;
    if (typeof global.AuthClient.isSuperadmin === 'function' && global.AuthClient.isSuperadmin()) return true;
    if (tokenRoles().indexOf('superadmin') !== -1) return true;
    return (
      global.AuthClientAccess &&
      typeof global.AuthClientAccess.hasClientAccess === 'function' &&
      global.AuthClientAccess.hasClientAccess()
    );
  }

  function cmsApiBase() {
    var base = (global.CMS_API_URL || global.CMS_SERVICE_URL || 'https://cms.ttmenus.com').replace(/\/+$/, '');
    if (base.endsWith('/api')) return base;
    return base + '/api';
  }

  function clientId() {
    return global.CLIENT_ID || global.SITE_CLIENT_ID || '_ttms_menu_demo';
  }

  function authHeaders() {
    var headers = { Accept: 'application/json' };
    var token =
      global.AuthClient && typeof global.AuthClient.getAccessToken === 'function'
        ? global.AuthClient.getAccessToken()
        : null;
    if (!token && typeof localStorage !== 'undefined') {
      token = localStorage.getItem('ttmenus_access_token');
    }
    if (token) headers.Authorization = 'Bearer ' + token;
    return headers;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function normalizeUrl(url) {
    var trimmed = String(url || '').trim();
    if (!trimmed) return '';
    try {
      if (/^https?:/i.test(trimmed)) trimmed = new URL(trimmed).pathname;
    } catch (err) {
      /* keep raw */
    }
    if (trimmed.charAt(0) !== '/') trimmed = '/' + trimmed;
    return trimmed.replace(/\/+$/, '') + '/';
  }

  function segments(url) {
    return String(url || '').split('/').filter(Boolean);
  }

  function blankOption(value) {
    var text = String(value || '').trim();
    if (!text || text === '-' || text === 'None') return '';
    return text;
  }

  function snapshotPrices(item) {
    var prices = (item && (item.prices || item.Prices)) || [];
    var out = [];
    if (!prices || !prices.length) return out;
    prices.forEach(function (pr) {
      if (!pr || typeof pr !== 'object') return;
      var size = pr.size != null ? pr.size : pr.variable1 != null ? pr.variable1 : pr.Size;
      var flavour = pr.flavour != null ? pr.flavour : pr.variable2 != null ? pr.variable2 : pr.Flavour;
      var price = pr.price != null ? pr.price : pr.Price;
      out.push({
        size: blankOption(size),
        flavour: blankOption(flavour),
        price: Number(price) || 0,
      });
    });
    return out;
  }

  function livePrices(card) {
    var raw = card.getAttribute('data-prices-array');
    if (!raw) return [];
    try {
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      var out = [];
      for (var i = 0; i + 2 < arr.length; i += 3) {
        out.push({
          size: blankOption(arr[i]),
          flavour: blankOption(arr[i + 1]),
          price: Number(arr[i + 2]) || 0,
        });
      }
      return out;
    } catch (err) {
      return [];
    }
  }

  function pricesSignature(prices) {
    return (prices || [])
      .map(function (p) {
        return [p.size, p.flavour, String(Number(p.price) || 0)].join('\u0001');
      })
      .join('\u0002');
  }

  function plainText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function titleNode(card) {
    return (
      card.querySelector('.menu-item-title-text') ||
      card.querySelector('.menu-item-title a') ||
      card.querySelector('h1.center.title, h2.center.title') ||
      card.querySelector('.menu-item-title')
    );
  }

  function itemDiffers(card, item) {
    var title = plainText(titleNode(card) && titleNode(card).textContent);
    var snapTitle = plainText(item.title || item.Title);
    if (snapTitle && title !== snapTitle) return true;
    var desc = card.querySelector('.menu-item-description, .menu-summary');
    var liveDesc = plainText(desc && desc.textContent);
    var snapDesc = plainText(item.summary || item.Summary);
    if (snapDesc && liveDesc !== snapDesc && snapDesc.indexOf(liveDesc) !== 0) return true;
    var snapPrices = snapshotPrices(item);
    if (snapPrices.length && pricesSignature(livePrices(card)) !== pricesSignature(snapPrices)) return true;
    return imagesDiffer(card, item);
  }

  function normImage(path) {
    return String(path || '').trim().replace(/^\//, '').split('?')[0];
  }

  function imagesDiffer(card, model) {
    var snap = imagePaths(model).map(normImage).filter(Boolean);
    if (!snap.length) return false;
    var live = [];
    if (card.classList && card.classList.contains('menu-header')) {
      var icon = normImage(card.getAttribute('data-icon') || '');
      var primary = normImage(card.getAttribute('data-images-primary') || '');
      if (icon) live.push(icon);
      if (primary && primary !== icon) live.push(primary);
    } else {
      try {
        var parsed = JSON.parse(card.getAttribute('data-images-array') || '[]');
        if (Array.isArray(parsed)) live = parsed.map(normImage).filter(Boolean);
      } catch (err) {}
    }
    if (live.length !== snap.length) return true;
    for (var i = 0; i < live.length; i++) if (live[i] !== snap[i]) return true;
    return false;
  }

  function pageLocationSlug() {
    var root = document.getElementById('menu-reels-viewport') || document.getElementById('packery-container');
    return (root && root.getAttribute('data-location-slug')) || '';
  }

  function sameMenuUrl(a, b) {
    var ak = normalizeUrl(a);
    var bk = normalizeUrl(b);
    if (!ak || !bk) return false;
    if (ak === bk) return true;
    var as = segments(ak);
    var bs = segments(bk);
    if (as.length < 2 || bs.length < 2) return false;
    var shorter = as.length <= bs.length ? as : bs;
    var longer = as.length > bs.length ? as : bs;
    return longer.slice(longer.length - shorter.length).join('/') === shorter.join('/');
  }

  function contentPathForCard(card) {
    if (global.TTMSContentDrafts && typeof global.TTMSContentDrafts.contentPathForElement === 'function') {
      return global.TTMSContentDrafts.contentPathForElement(card);
    }
    var itemUrl = card && card.getAttribute('data-item-url');
    if (!itemUrl) return '';
    return 'content' + normalizeUrl(itemUrl).replace(/\/$/, '') + '.md';
  }

  function draftPreview(card) {
    if (!global.TTMSContentDrafts || typeof global.TTMSContentDrafts.getPreview !== 'function') return null;
    var path = contentPathForCard(card);
    return path ? global.TTMSContentDrafts.getPreview(path) : null;
  }

  function itemFromDraft(preview) {
    if (!preview) return null;
    var payload = preview.payload || preview.Payload || {};
    var frontMatter = payload.frontMatter || payload.FrontMatter || {};
    var prices = snapshotPrices({ prices: frontMatter.prices || frontMatter.Prices || [] });
    return {
      title: frontMatter.title || frontMatter.Title || '',
      summary: payload.body || payload.Body || frontMatter.summary || '',
      prices: prices,
      images: imagePaths(frontMatter),
    };
  }

  function hostUrl(host) {
    if (!host) return '';
    if (host.classList && host.classList.contains('menu-header')) {
      var link = host.querySelector('a.menu-header__link, a[href].menu-header__link');
      var href = link && link.getAttribute('href');
      if (href && href.charAt(0) !== '#') return href;
      var slug = host.getAttribute('data-section-slug') || '';
      return slug ? '/' + slug + '/' : '';
    }
    return host.getAttribute('data-item-url') || '';
  }

  function viewModel(card) {
    var snap = null;
    if (card.classList && card.classList.contains('menu-header')) {
      var slug = card.getAttribute('data-section-slug') || '';
      snap = lookup(hostUrl(card)) || bySlug[slug] || null;
    } else {
      snap = lookup(card.getAttribute('data-item-url'));
    }
    var draft = itemFromDraft(draftPreview(card));
    if (!snap && !draft) return null;
    var model = {
      title: (snap && (snap.title || snap.Title)) || '',
      summary: (snap && (snap.summary || snap.Summary)) || '',
      prices: snap ? snapshotPrices(snap) : [],
      images: snap ? imagePaths(snap) : [],
    };
    if (draft) {
      if (plainText(draft.title)) model.title = draft.title;
      if (draft.summary != null && String(draft.summary) !== '') model.summary = draft.summary;
      if (draft.prices && draft.prices.length) model.prices = draft.prices;
      if (draft.images && draft.images.length) model.images = draft.images;
    }
    return model;
  }

  function lookup(url) {
    var key = normalizeUrl(url);
    if (!key) return null;
    if (byUrl[key]) return byUrl[key];
    var keySeg = segments(key);
    var hits = [];
    Object.keys(byUrl).forEach(function (candidate) {
      var seg = segments(candidate);
      if (seg.length < 2 || keySeg.length < 2) return;
      var shorter = seg.length <= keySeg.length ? seg : keySeg;
      var longer = seg.length > keySeg.length ? seg : keySeg;
      var tail = longer.slice(longer.length - shorter.length).join('/');
      if (tail === shorter.join('/')) hits.push(candidate);
    });
    if (hits.length === 1) return byUrl[hits[0]];
    if (hits.length > 1) {
      var loc = pageLocationSlug();
      var locHits = loc
        ? hits.filter(function (candidate) {
            return segments(candidate)[0] === loc;
          })
        : [];
      if (locHits.length === 1) return byUrl[locHits[0]];
    }
    return null;
  }

  function pushImagePath(out, value) {
    if (typeof value === 'string' && value.trim()) out.push(value.trim());
  }

  function imagePaths(source) {
    var out = [];
    if (!source) return out;
    pushImagePath(out, source.icon || source.Icon);
    pushImagePath(out, source.image || source.Image);
    var raw = source.images || source.Images;
    if (raw && !Array.isArray(raw) && typeof raw === 'object') {
      pushImagePath(out, raw.primary || raw.Primary);
      pushImagePath(out, raw.secondary || raw.Secondary);
      return out;
    }
    if (!raw || !raw.length) return out;
    raw.forEach(function (img) {
      if (!img) return;
      if (typeof img === 'string') {
        if (img) out.push(img);
        return;
      }
      var path = img.image || img.Image || img.url || img.src || '';
      if (path) out.push(String(path));
    });
    return out;
  }

  function resolveImageSrc(path) {
    var src = String(path || '').trim();
    if (!src) return '';
    if (global.TtmsThumbor && typeof global.TtmsThumbor.menuImageSrc === 'function') {
      src = global.TtmsThumbor.menuImageSrc(path, 'smash') || global.TtmsThumbor.menuImageSrc(path, 'card') || src;
    }
    if (src && !/^https?:\/\//i.test(src) && src.charAt(0) !== '/') src = '/' + src.replace(/^\//, '');
    return src;
  }

  function indexCategory(cat) {
    if (!cat) return;
    var key = normalizeUrl(cat.url || cat.URL);
    var seg = segments(key);
    var slug = seg.length ? seg[seg.length - 1] : '';
    if (!slug) {
      slug = String(cat.title || cat.Title || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      if (slug) key = '/' + slug + '/';
    }
    if (key && !byUrl[key]) byUrl[key] = cat;
    if (slug) bySlug[slug] = cat;
  }

  function indexItems(menuData) {
    byUrl = {};
    bySlug = {};
    itemKeys = {};
    var items = menuData && (menuData.menuItems || menuData.MenuItems);
    if (items && items.length) {
      items.forEach(function (item) {
        if (!item) return;
        var key = normalizeUrl(item.url || item.URL);
        if (!key) return;
        byUrl[key] = item;
        itemKeys[key] = true;
      });
    }
    var cats = menuData && (menuData.categories || menuData.Categories);
    if (cats && cats.length) cats.forEach(indexCategory);
  }

  function formatMoney(amount) {
    var n = parseFloat(amount);
    if (Number.isNaN(n)) return '0';
    return n.toFixed(2).replace(/\.00$/, '');
  }

  function priceLabel(prices) {
    var nums = (prices || [])
      .map(function (p) {
        return Number(p.price);
      })
      .filter(function (n) {
        return !Number.isNaN(n);
      })
      .sort(function (a, b) {
        return a - b;
      });
    if (!nums.length) return '';
    if (nums[0] === nums[nums.length - 1]) return '$' + formatMoney(nums[0]);
    return '$' + formatMoney(nums[0]) + ' | $' + formatMoney(nums[nums.length - 1]);
  }

  function uniqueValues(prices, key) {
    var seen = {};
    var out = [];
    (prices || []).forEach(function (p) {
      var value = p[key];
      if (!value || seen[value]) return;
      seen[value] = true;
      out.push(value);
    });
    return out;
  }

  function setOptionList(options, className, values) {
    var list = options.querySelector('ul.' + className);
    if (!values.length) {
      if (list) list.innerHTML = '';
      return;
    }
    if (!list) {
      list = document.createElement('ul');
      list.className = className;
      options.appendChild(list);
    }
    list.innerHTML = values
      .map(function (value) {
        return '<li>' + escapeHtml(value) + '</li>';
      })
      .join('');
  }

  function captureLive(card) {
    if (card._ttmsLiveSnapshotView) return;
    var title = titleNode(card);
    var desc = card.querySelector('.menu-item-description');
    var price = card.querySelector('.menu-item-price');
    var options = card.querySelector('.menu-item-options');
    var sizes = options && options.querySelector('ul.sizes');
    var flavours = options && options.querySelector('ul.flavours');
    var actions = card.querySelector('[data-menu-item-actions]');
    var trigger = actions && actions.querySelector('.menu-item-actions__trigger');
    var photo = card.querySelector('.menu-item-image img, .menu-item-img');
    var stack = card.querySelector('.menu-smash-pass__stack');
    card._ttmsLiveSnapshotView = {
      titleHTML: title ? title.innerHTML : '',
      descriptionHTML: desc ? desc.innerHTML : '',
      priceHTML: price ? price.innerHTML : '',
      sizesHTML: sizes ? sizes.innerHTML : null,
      flavoursHTML: flavours ? flavours.innerHTML : null,
      pricesArray: card.getAttribute('data-prices-array'),
      variable1: card.getAttribute('data-selected-variable1'),
      variable2: card.getAttribute('data-selected-variable2'),
      triggerLabel: trigger ? trigger.getAttribute('aria-label') : '',
      itemTitle: actions ? actions.getAttribute('data-item-title') : '',
      imagesArray: card.getAttribute('data-images-array'),
      regularImagesArray: card.getAttribute('data-regular-images-array'),
      photoSrc: photo ? photo.getAttribute('src') : '',
      photoPath: photo ? photo.getAttribute('data-src-path') : '',
      smashTop: stack
        ? Array.prototype.map.call(stack.querySelectorAll('.menu-smash-pass-card.is-top'), function (el) {
            return el;
          })
        : [],
    };
  }

  function applySnapshotImage(card, item) {
    var paths = (item && item.images) || [];
    if (!paths.length) return;
    var path = paths[0];
    var src = resolveImageSrc(path);
    var isDraft = String(path).indexOf('draft-assets/') === 0;
    card.setAttribute('data-images-array', JSON.stringify(paths));
    card.setAttribute('data-regular-images-array', JSON.stringify(paths));

    var photo = card.querySelector('.menu-item-image img');
    if (photo && !card.querySelector('.menu-smash-pass')) {
      if (src) photo.setAttribute('src', src);
      photo.setAttribute('data-src-path', path);
      if (isDraft) photo.setAttribute('data-draft-pending', '1');
      else photo.removeAttribute('data-draft-pending');
      card.classList.add('menu-item-card--has-image');
      if (isDraft && typeof global.hydrateAuthenticatedDraftAssetImg === 'function') {
        global.hydrateAuthenticatedDraftAssetImg(photo);
      }
      return;
    }

    var stack = card.querySelector('.menu-smash-pass__stack');
    var host = stack || card.querySelector('.menu-smash-pass') || card.querySelector('.menu-item-row-top');
    if (!host) return;
    var frame = card.querySelector('.menu-smash-pass-card--snapshot');
    if (!frame) {
      frame = document.createElement('article');
      frame.className = 'menu-smash-pass-card menu-smash-pass-card--snapshot is-local is-top';
      frame.setAttribute('data-image-id', 'snapshot-view');
      frame.innerHTML =
        '<div class="menu-smash-pass-card__media"><div class="menu-smash-pass-card__img-stage">' +
        '<img class="menu-smash-pass-card__img menu-smash-pass-card__img--backdrop" alt="" draggable="false" decoding="async">' +
        '<img class="menu-smash-pass-card__img menu-smash-pass-card__img--front" alt="" draggable="false" decoding="async">' +
        '</div></div>';
      if (stack) {
        stack.querySelectorAll('.menu-smash-pass-card.is-top').forEach(function (el) {
          el.classList.remove('is-top');
          el.classList.add('is-behind');
        });
        stack.insertBefore(frame, stack.firstChild);
      } else {
        host.insertBefore(frame, host.firstChild);
      }
    }
    var imgs = frame.querySelectorAll('img');
    if (!imgs.length) return;
    var label = plainText(item.title || '');
    imgs.forEach(function (img) {
      img.alt = label;
      img.setAttribute('data-src-path', path);
      if (src) img.setAttribute('src', src);
      if (isDraft) img.setAttribute('data-draft-pending', '1');
      else img.removeAttribute('data-draft-pending');
    });
    if (isDraft && typeof global.hydrateAuthenticatedDraftAssetImg === 'function') {
      global.hydrateAuthenticatedDraftAssetImg(imgs[imgs.length - 1]);
    }
    var smash = card.querySelector('.menu-smash-pass');
    if (smash) smash.classList.add('is-showing-snapshot');
    var reel = card.querySelector('.menu-smash-pass__reel');
    if (reel) reel.classList.remove('hidden');
    var empty = card.querySelector('.menu-smash-pass__empty');
    if (empty) empty.classList.add('hidden');
    card.classList.add('menu-item-card--has-image');
  }

  function restoreSnapshotImage(card, live) {
    var smash = card.querySelector('.menu-smash-pass');
    if (smash) smash.classList.remove('is-showing-snapshot');
    var frame = card.querySelector('.menu-smash-pass-card--snapshot');
    if (frame) frame.remove();
    if (live.smashTop && live.smashTop.length) {
      live.smashTop.forEach(function (el) {
        if (!el || !el.isConnected) return;
        el.classList.add('is-top');
        el.classList.remove('is-behind');
      });
    }
    var photo = card.querySelector('.menu-item-image img');
    if (photo && !card.querySelector('.menu-smash-pass')) {
      if (live.photoSrc) photo.setAttribute('src', live.photoSrc);
      else photo.removeAttribute('src');
      if (live.photoPath) photo.setAttribute('data-src-path', live.photoPath);
    }
    if (live.imagesArray != null) card.setAttribute('data-images-array', live.imagesArray);
    if (live.regularImagesArray != null) card.setAttribute('data-regular-images-array', live.regularImagesArray);
  }

  function viewButton(card) {
    return card.querySelector('.menu-item-actions__option--view');
  }

  function viewOptionMarkup(viewing) {
    var icon = viewing ? 'fa-eye' : 'fa-exclamation';
    var label = viewing ? 'View live' : 'View snapshot';
    return '<i class="fa ' + icon + '" aria-hidden="true"></i> ' + label;
  }

  function setViewLabel(card, viewing) {
    var button = viewButton(card);
    if (!button) return;
    button.innerHTML = viewOptionMarkup(viewing);
  }

  function sectionHeading(header) {
    return header.querySelector('.headerstyle h1, .headerstyle h2, h1.center.title, h2.center.title');
  }

  function headingTextNode(el) {
    if (!el) return null;
    for (var i = 0; i < el.childNodes.length; i++) {
      if (el.childNodes[i].nodeType === 3 && String(el.childNodes[i].textContent || '').trim()) {
        return el.childNodes[i];
      }
    }
    var node = document.createTextNode('');
    el.insertBefore(node, el.firstChild);
    return node;
  }

  function menublockLinkForHeader(header) {
    var slug = (header.getAttribute('data-section-slug') || '').trim().toLowerCase();
    var label = plainText(header.getAttribute('data-reel-section') || '').toLowerCase();
    if (!label && header._ttmsLiveSnapshotView) {
      label = plainText(header._ttmsLiveSnapshotView.headingText).toLowerCase();
    }
    var links = document.querySelectorAll('#menublock a.menublock-link');
    var i;
    for (i = 0; i < links.length; i++) {
      var link = links[i];
      var textEl = link.querySelector('.menublock-link__label');
      var text = plainText(textEl && textEl.textContent).toLowerCase();
      var href = (link.getAttribute('href') || '').toLowerCase();
      if (label && text === label) return link;
      if (slug && href.indexOf('/' + slug) !== -1) return link;
    }
    return null;
  }

  function paintMenublockIcon(link, path, liveBag) {
    if (!link || !path) return;
    var wrap = link.querySelector('.menublock-link__icon');
    if (!wrap) {
      wrap = document.createElement('span');
      wrap.className = 'menublock-link__icon';
      wrap.setAttribute('aria-hidden', 'true');
      wrap.setAttribute('data-snapshot-created', '1');
      link.insertBefore(wrap, link.firstChild);
    }
    var img = wrap.querySelector('img');
    if (!img) {
      img = document.createElement('img');
      img.className = 'icon center menublock-link__photo';
      img.alt = '';
      img.width = 32;
      img.height = 32;
      img.setAttribute('data-snapshot-created', '1');
      wrap.appendChild(img);
    }
    if (liveBag && !liveBag.menublock) {
      liveBag.menublock = {
        link: link,
        src: img.getAttribute('src') || '',
        path: img.getAttribute('data-src-path') || '',
        photo: img.classList.contains('menublock-link__photo'),
        createdImg: img.getAttribute('data-snapshot-created') === '1',
        createdWrap: wrap.getAttribute('data-snapshot-created') === '1',
      };
    }
    img.setAttribute('data-src-path', path);
    if (/\.(jpe?g|png|webp|gif|avif|bmp)(\?|$)/i.test(path)) {
      img.classList.add('menublock-link__photo');
      img.style.removeProperty('--menublock-icon');
      wrap.style.removeProperty('--menublock-icon');
    }
    var src = resolveImageSrc(path);
    if (src) img.setAttribute('src', src);
    if (String(path).indexOf('draft-assets/') === 0 && typeof global.hydrateAuthenticatedDraftAssetImg === 'function') {
      delete img.dataset.draftAssetHydrated;
      global.hydrateAuthenticatedDraftAssetImg(img);
    }
  }

  function restoreMenublockIcon(live) {
    var saved = live && live.menublock;
    if (!saved || !saved.link) return;
    if (saved.createdWrap) {
      var createdWrap = saved.link.querySelector('.menublock-link__icon');
      if (createdWrap) createdWrap.remove();
      return;
    }
    var img = saved.link.querySelector('.menublock-link__icon img');
    if (!img) return;
    if (saved.createdImg) {
      img.remove();
      return;
    }
    if (saved.src) img.setAttribute('src', saved.src);
    else img.removeAttribute('src');
    if (saved.path) img.setAttribute('data-src-path', saved.path);
    else img.removeAttribute('data-src-path');
    img.classList.toggle('menublock-link__photo', !!saved.photo);
    delete img.dataset.draftAssetHydrated;
  }

  function applySectionImage(header, item) {
    var paths = item.images || [];
    if (!paths.length) return;
    var path = paths[0];
    var src = resolveImageSrc(path);
    var link = header.querySelector('.menu-header__link') || header;
    var img = header.querySelector('img.food');
    var created = false;
    if (!img) {
      img = document.createElement('img');
      img.className = 'food item menu-snapshot-section-image';
      img.alt = plainText(item.title || item.Title);
      link.insertBefore(img, link.firstChild);
      created = true;
    }
    if (src) img.setAttribute('src', src);
    img.setAttribute('data-src-path', path);
    header.setAttribute('data-images-primary', path);
    if (created) img.setAttribute('data-snapshot-created', '1');
    if (String(path).indexOf('draft-assets/') === 0 && typeof global.hydrateAuthenticatedDraftAssetImg === 'function') {
      delete img.dataset.draftAssetHydrated;
      global.hydrateAuthenticatedDraftAssetImg(img);
    }
  }

  function applySectionSnapshot(header, item) {
    var heading = sectionHeading(header);
    var textNode = headingTextNode(heading);
    var summary = header.querySelector('.menu-summary');
    var img = header.querySelector('img.food');
    if (!header._ttmsLiveSnapshotView) {
      header._ttmsLiveSnapshotView = {
        kind: 'section',
        headingText: textNode ? textNode.textContent : '',
        summaryHTML: summary ? summary.innerHTML : null,
        photoSrc: img ? img.getAttribute('src') || '' : '',
        photoPath: img ? img.getAttribute('data-src-path') || '' : '',
        hadImage: !!img,
        primary: header.getAttribute('data-images-primary') || '',
        icon: header.getAttribute('data-icon') || '',
      };
    }
    var snapTitle = plainText(item.title || item.Title);
    if (textNode && snapTitle) textNode.textContent = snapTitle;
    var summaryText = plainText(item.summary || item.Summary);
    if (summaryText) {
      if (!summary) {
        summary = document.createElement('div');
        summary.className = 'menu-summary item';
        summary.setAttribute('data-snapshot-created', '1');
        var link = header.querySelector('.menu-header__link') || header;
        link.appendChild(summary);
      }
      summary.textContent = summaryText;
    }
    var iconPath = imagePaths(item)[0] || '';
    if (iconPath) {
      header.setAttribute('data-icon', iconPath);
      paintMenublockIcon(menublockLinkForHeader(header), iconPath, header._ttmsLiveSnapshotView);
    }
    applySectionImage(header, item);
    var actions = header.querySelector('[data-menu-item-actions]');
    var trigger = actions && actions.querySelector('.menu-item-actions__trigger');
    if (snapTitle && trigger) trigger.setAttribute('aria-label', 'More options for ' + snapTitle);
    header.classList.add('is-viewing-snapshot');
    setViewLabel(header, true);
  }

  function restoreSection(header) {
    var live = header._ttmsLiveSnapshotView || {};
    var heading = sectionHeading(header);
    var textNode = headingTextNode(heading);
    if (textNode) textNode.textContent = live.headingText || '';
    var summary = header.querySelector('.menu-summary');
    if (summary) {
      if (summary.getAttribute('data-snapshot-created') === '1' && live.summaryHTML == null) summary.remove();
      else if (live.summaryHTML != null) summary.innerHTML = live.summaryHTML;
    }
    var img = header.querySelector('img.food');
    if (img && img.getAttribute('data-snapshot-created') === '1' && !live.hadImage) img.remove();
    else if (img && live.hadImage) {
      if (live.photoSrc) img.setAttribute('src', live.photoSrc);
      else img.removeAttribute('src');
      if (live.photoPath) img.setAttribute('data-src-path', live.photoPath);
    }
    if (live.primary) header.setAttribute('data-images-primary', live.primary);
    else header.removeAttribute('data-images-primary');
    if (live.icon) header.setAttribute('data-icon', live.icon);
    else header.removeAttribute('data-icon');
    restoreMenublockIcon(live);
    header.classList.remove('is-viewing-snapshot');
    setViewLabel(header, false);
  }

  function applySnapshot(card, item) {
    if (card.classList && card.classList.contains('menu-header')) {
      applySectionSnapshot(card, item);
      return;
    }
    captureLive(card);
    var prices = snapshotPrices(item);
    var title = titleNode(card);
    var snapTitle = plainText(item.title || item.Title);
    if (title && snapTitle) title.textContent = snapTitle;
    var desc = card.querySelector('.menu-item-description');
    if (desc) desc.textContent = plainText(item.summary || item.Summary);
    var priceEl = card.querySelector('.menu-item-price');
    if (priceEl) priceEl.textContent = priceLabel(prices);
    var options = card.querySelector('.menu-item-options');
    if (options) {
      setOptionList(options, 'sizes', uniqueValues(prices, 'size'));
      setOptionList(options, 'flavours', uniqueValues(prices, 'flavour'));
    }
    var flat = [];
    prices.forEach(function (p) {
      flat.push(p.size || '', p.flavour || '', p.price);
    });
    if (flat.length) card.setAttribute('data-prices-array', JSON.stringify(flat));
    var sizes = uniqueValues(prices, 'size');
    var flavours = uniqueValues(prices, 'flavour');
    card.setAttribute('data-selected-variable1', sizes[0] || '-');
    card.setAttribute('data-selected-variable2', flavours[0] || '-');
    var actions = card.querySelector('[data-menu-item-actions]');
    var trigger = actions && actions.querySelector('.menu-item-actions__trigger');
    if (snapTitle) {
      if (actions) actions.setAttribute('data-item-title', snapTitle);
      if (trigger) trigger.setAttribute('aria-label', 'More options for ' + snapTitle);
    }
    applySnapshotImage(card, item);
    card.classList.add('is-viewing-snapshot');
    setViewLabel(card, true);
  }

  function restoreLive(card) {
    if (card.classList && card.classList.contains('menu-header')) {
      restoreSection(card);
      return;
    }
    var live = card._ttmsLiveSnapshotView;
    if (!live) {
      card.classList.remove('is-viewing-snapshot');
      setViewLabel(card, false);
      return;
    }
    var title = titleNode(card);
    if (title) title.innerHTML = live.titleHTML;
    var desc = card.querySelector('.menu-item-description');
    if (desc) desc.innerHTML = live.descriptionHTML;
    var priceEl = card.querySelector('.menu-item-price');
    if (priceEl) priceEl.innerHTML = live.priceHTML;
    var options = card.querySelector('.menu-item-options');
    if (options) {
      var sizes = options.querySelector('ul.sizes');
      var flavours = options.querySelector('ul.flavours');
      if (sizes && live.sizesHTML != null) sizes.innerHTML = live.sizesHTML;
      if (flavours && live.flavoursHTML != null) flavours.innerHTML = live.flavoursHTML;
    }
    if (live.pricesArray != null) card.setAttribute('data-prices-array', live.pricesArray);
    if (live.variable1 != null) card.setAttribute('data-selected-variable1', live.variable1);
    if (live.variable2 != null) card.setAttribute('data-selected-variable2', live.variable2);
    restoreSnapshotImage(card, live);
    var actions = card.querySelector('[data-menu-item-actions]');
    var trigger = actions && actions.querySelector('.menu-item-actions__trigger');
    if (actions && live.itemTitle != null) actions.setAttribute('data-item-title', live.itemTitle);
    if (trigger && live.triggerLabel) trigger.setAttribute('aria-label', live.triggerLabel);
    card.classList.remove('is-viewing-snapshot');
    setViewLabel(card, false);
  }

  function ensureViewButton(menu) {
    if (!menu || menu.querySelector('.menu-item-actions__option--view')) return;
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'menu-item-actions__option menu-item-actions__option--view';
    button.setAttribute('role', 'menuitem');
    button.setAttribute('data-auth', 'admin-site');
    button.hidden = true;
    button.innerHTML = viewOptionMarkup(false);
    var edit = menu.querySelector('.menu-item-actions__option--edit');
    if (edit && edit.parentNode) {
      edit.parentNode.insertBefore(button, edit);
      return;
    }
    var panel = menu.querySelector('.menu-item-actions__menu');
    if (panel) panel.appendChild(button);
  }

  function directChild(parent, el) {
    return !!(parent && el && el.parentNode === parent);
  }

  function ensureBadge(trigger, show) {
    if (!trigger || !trigger.isConnected) return;
    var actions = trigger.closest('.menu-item-actions');
    if (!actions || !actions.contains(trigger)) return;
    var badge = null;
    var i;
    for (i = 0; i < actions.children.length; i++) {
      if (actions.children[i].classList && actions.children[i].classList.contains('menu-item-snapshot-badge')) {
        badge = actions.children[i];
        break;
      }
    }
    if (!show) {
      if (badge) badge.remove();
      trigger.classList.remove('has-menu-snapshot');
      return;
    }
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'menu-item-snapshot-badge';
      badge.title = 'Saved menu snapshot';
      badge.setAttribute('aria-label', 'Snapshot available');
      badge.innerHTML = '<i class="fa fa-exclamation" aria-hidden="true"></i>';
    } else if (!badge.querySelector('.fa-exclamation')) {
      badge.innerHTML = '<i class="fa fa-exclamation" aria-hidden="true"></i>';
    }
    var anchor = directChild(actions, trigger) ? trigger : null;
    for (i = 0; i < actions.children.length; i++) {
      if (actions.children[i].classList && actions.children[i].classList.contains('menu-content-draft-badge')) {
        anchor = actions.children[i];
        break;
      }
    }
    if (!directChild(actions, anchor)) anchor = directChild(actions, trigger) ? trigger : null;
    if (badge.parentNode !== actions || badge.nextElementSibling !== anchor) {
      actions.insertBefore(badge, anchor);
    }
    trigger.classList.add('has-menu-snapshot');
  }

  function clearMarkers() {
    document.querySelectorAll('.menu-item-snapshot-badge').forEach(function (badge) {
      badge.remove();
    });
    document.querySelectorAll('.has-menu-snapshot').forEach(function (el) {
      el.classList.remove('has-menu-snapshot');
    });
    document.querySelectorAll('.menu-item-actions__option--view').forEach(function (button) {
      button.classList.remove('is-snapshot-available');
      button.hidden = true;
      button.style.display = 'none';
      if (!button.closest('.is-viewing-snapshot')) button.innerHTML = viewOptionMarkup(false);
    });
  }

  function syncAuth() {
    if (global.AuthMiddleware && typeof global.AuthMiddleware.toggleAuthElements === 'function') {
      global.AuthMiddleware.toggleAuthElements();
    }
  }

  function resolveCard(target) {
    if (!target) return null;
    if (target.classList && (target.classList.contains('menu-item-card') || target.classList.contains('menu-header'))) {
      return target;
    }
    var card = target.closest && target.closest('.menu-item-card');
    if (card) return card;
    var header = target.closest && target.closest('.menu-header');
    if (header) return header;
    var url = target.getAttribute && target.getAttribute('data-item-url');
    if (!url) return null;
    var key = normalizeUrl(url);
    var cards = document.querySelectorAll('.menu-item-card[data-item-url]');
    var i;
    for (i = 0; i < cards.length; i++) {
      if (normalizeUrl(cards[i].getAttribute('data-item-url')) === key) return cards[i];
    }
    var headers = document.querySelectorAll('.menu-header[data-section-slug]');
    for (i = 0; i < headers.length; i++) {
      if (normalizeUrl(hostUrl(headers[i])) === key) return headers[i];
    }
    return null;
  }

  function markHost(host) {
    try {
      var model = viewModel(host);
      var viewing = host.classList.contains('is-viewing-snapshot');
      var show = viewing || (!!model && (itemDiffers(host, model) || !!draftPreview(host)));
      if (viewing && model && !(host.classList && host.classList.contains('menu-header'))) {
        applySnapshotImage(host, model);
      }
      var actions = host.querySelector('[data-menu-item-actions]');
      if (actions) ensureViewButton(actions);
      var trigger = actions && actions.querySelector('.menu-item-actions__trigger');
      var button = actions && actions.querySelector('.menu-item-actions__option--view');
      ensureBadge(trigger, show);
      if (button) {
        button.classList.toggle('is-snapshot-available', show);
        if (!viewing) button.innerHTML = viewOptionMarkup(false);
      }
    } catch (err) {}
  }

  function catalogPrices(item) {
    var prices = (item && item.prices) || [];
    if (!prices.length) return [];
    if (Array.isArray(prices[0])) {
      return prices.map(function (row) {
        return {
          size: blankOption(row[0]),
          flavour: blankOption(row[1]),
          price: Number(row[2]) || 0,
        };
      });
    }
    if (typeof prices[0] === 'object') return snapshotPrices({ prices: prices });
    var out = [];
    for (var i = 0; i + 2 < prices.length; i += 3) {
      out.push({
        size: blankOption(prices[i]),
        flavour: blankOption(prices[i + 1]),
        price: Number(prices[i + 2]) || 0,
      });
    }
    return out;
  }

  function catalogDiffers(snap, live) {
    if (!snap || !live) return false;
    var liveTitle = plainText(live.linkTitle || live.name || live.title);
    var snapTitle = plainText(snap.title || snap.Title);
    if (snapTitle && liveTitle && snapTitle !== liveTitle) return true;
    var snapPrices = snapshotPrices(snap);
    if (snapPrices.length && pricesSignature(snapPrices) !== pricesSignature(catalogPrices(live))) return true;
    var snapImgs = imagePaths(snap).map(normImage).filter(Boolean);
    if (snapImgs.length) {
      var liveImgs = (live.images || []).map(normImage).filter(Boolean);
      if (liveImgs.join('\n') !== snapImgs.join('\n')) return true;
    }
    var snapSummary = plainText(snap.summary || snap.Summary);
    var liveSummary = plainText(live.summary);
    if (snapSummary && liveSummary && snapSummary !== liveSummary && snapSummary.indexOf(liveSummary) !== 0) return true;
    return false;
  }

  function catalogMatches(url) {
    var list = global.menuItemsCache || [];
    var hits = [];
    list.forEach(function (item) {
      if (!item) return;
      if (sameMenuUrl(url, item.url || item.permalink || '')) hits.push(item);
    });
    if (hits.length <= 1) return hits;
    var loc = pageLocationSlug();
    if (!loc) return [];
    return hits.filter(function (item) {
      var slug = item.location_slug || segments(normalizeUrl(item.url || item.permalink || ''))[0];
      return slug === loc;
    });
  }

  function changedMenuUrls() {
    var urls = [];
    var seen = {};
    function add(url) {
      var key = normalizeUrl(url);
      if (!key || seen[key]) return;
      seen[key] = true;
      urls.push(key);
    }
    Object.keys(itemKeys).forEach(function (key) {
      var snap = byUrl[key];
      catalogMatches(key).forEach(function (live) {
        if (!catalogDiffers(snap, live)) return;
        add(live.url || live.permalink);
        add(key);
      });
    });
    if (global.TTMSContentDrafts && typeof global.TTMSContentDrafts.itemUrls === 'function') {
      global.TTMSContentDrafts.itemUrls().forEach(add);
    }
    return urls;
  }

  function loadSnapshotItems() {
    if (typeof global.hydrateHomeMenuForUrls !== 'function') return;
    global.hydrateHomeMenuForUrls(changedMenuUrls(), { replace: true });
  }

  function applyMarkers() {
    if (applying) return;
    applying = true;
    try {
      if (!hasAdminSiteAccess()) {
        clearMarkers();
        syncAuth();
        return;
      }
      loadSnapshotItems();
      document.querySelectorAll('.menu-item-card[data-item-url], .menu-header[data-section-slug]').forEach(markHost);
      syncAuth();
    } finally {
      applying = false;
    }
  }

  function toggle(target) {
    if (!hasAdminSiteAccess()) return;
    var card = resolveCard(target);
    if (!card) return;
    if (card.classList.contains('is-viewing-snapshot')) {
      restoreLive(card);
      applyMarkers();
      return;
    }
    var item = viewModel(card);
    if (!item) return;
    applySnapshot(card, item);
    applyMarkers();
  }

  function loadSnapshot() {
    if (!hasAdminSiteAccess()) {
      byUrl = {};
      bySlug = {};
      itemKeys = {};
      applyMarkers();
      return Promise.resolve(null);
    }
    if (loadPromise) return loadPromise;
    var tokenReady =
      global.AuthClient && typeof global.AuthClient.ensureAccessToken === 'function'
        ? global.AuthClient.ensureAccessToken().catch(function () {
            return null;
          })
        : Promise.resolve(null);
    var listUrl = cmsApiBase() + '/clients/' + encodeURIComponent(clientId()) + '/menu-versions';
    loadPromise = tokenReady.then(function () {
      return fetch(listUrl, { method: 'GET', credentials: 'include', headers: authHeaders() });
    })
      .then(function (res) {
        return res.ok ? res.json() : { versions: [] };
      })
      .catch(function () {
        return { versions: [] };
      })
      .then(function (data) {
        var versions = data && data.versions ? data.versions : [];
        var id = versions[0] && (versions[0].id || versions[0].ID);
        if (!id) return null;
        var url =
          cmsApiBase() +
          '/clients/' +
          encodeURIComponent(clientId()) +
          '/menu-versions/' +
          encodeURIComponent(id);
        return fetch(url, { method: 'GET', credentials: 'include', headers: authHeaders() }).then(function (res) {
          return res.ok ? res.json() : null;
        });
      })
      .then(function (version) {
        var menuData = version && (version.menu_data || version.MenuData);
        indexItems(menuData || null);
        applyMarkers();
        return version;
      })
      .catch(function () {
        byUrl = {};
        bySlug = {};
        itemKeys = {};
        applyMarkers();
        return null;
      })
      .finally(function () {
        loadPromise = null;
      });
    return loadPromise;
  }

  function boot() {
    loadSnapshot();
  }

  function start() {
    if (global.AuthClient && typeof global.AuthClient.whenReady === 'function') {
      global.AuthClient.whenReady().then(boot);
      return;
    }
    boot();
  }

  function onPageEnter() {
    watchMenuCards();
    applyMarkers();
    setTimeout(boot, 80);
  }

  function registerBarba() {
    if (!global.TTMSBarba || typeof global.TTMSBarba.register !== 'function') return;
    global.TTMSBarba.register(onPageEnter);
  }

  global.addEventListener('ttms:auth-ready', boot);
  document.addEventListener('ttms:page-enter', onPageEnter);
  registerBarba();
  global.addEventListener('ttms:home-menu-ready', function () {
    setTimeout(applyMarkers, 80);
  });
  global.addEventListener('ttms:home-menu-location-filtered', function () {
    setTimeout(applyMarkers, 80);
  });
  global.addEventListener('menuReelsFlattened', function () {
    setTimeout(applyMarkers, 120);
  });
  global.addEventListener('ttms:content-drafts-ready', function () {
    setTimeout(applyMarkers, 40);
  });
  global.addEventListener('homeMenuItemsLoaded', function () {
    setTimeout(applyMarkers, 40);
  });

  var markerTimer = 0;
  function scheduleMarkers() {
    if (markerTimer) return;
    markerTimer = setTimeout(function () {
      markerTimer = 0;
      applyMarkers();
      if (global.TTMSContentDrafts && typeof global.TTMSContentDrafts.applyIndicators === 'function') {
        global.TTMSContentDrafts.applyIndicators();
      }
    }, 60);
  }

  function watchMenuCards() {
    if (!document.body || document.body._ttmsSnapshotWatch) return;
    document.body._ttmsSnapshotWatch = true;
    var observer = new MutationObserver(function (records) {
      var added = false;
      records.forEach(function (record) {
        if (!record.addedNodes || !record.addedNodes.length) return;
        for (var i = 0; i < record.addedNodes.length; i++) {
          var node = record.addedNodes[i];
          if (!node || node.nodeType !== 1) continue;
          if (
            (node.classList &&
              (node.classList.contains('menu-item-card') || node.classList.contains('menu-header'))) ||
            (node.querySelector && node.querySelector('.menu-item-card, .menu-header'))
          ) {
            added = true;
            break;
          }
        }
      });
      if (added) scheduleMarkers();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      registerBarba();
      watchMenuCards();
      start();
    });
  } else {
    registerBarba();
    watchMenuCards();
    start();
  }

  global.TTMSMenuSnapshotView = {
    refresh: loadSnapshot,
    toggle: toggle,
    applyMarkers: applyMarkers,
  };
})(typeof window !== 'undefined' ? window : this);
