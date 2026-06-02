/**
 * Menu Image Integration - fetches approved user-submitted images and allows upload (when logged in)
 * Uses Thumbor for optimized image delivery
 */
(function () {
  const CONFIG = typeof window.MENU_IMAGE_CONFIG !== 'undefined' ? window.MENU_IMAGE_CONFIG : {
    apiUrl: 'https://menu-images.ttmenus.com/api/v1',
    clientId: '_ttms_menu_demo',
    enabled: true
  };

  if (!CONFIG.enabled || !CONFIG.apiUrl) return;

  function getToken() {
    if (typeof AuthClient !== 'undefined' && AuthClient.getAccessToken) {
      return AuthClient.getAccessToken();
    }
    try {
      return localStorage.getItem('ttmenus_access_token');
    } catch (e) {
      return null;
    }
  }

  function isLoggedIn() {
    if (typeof AuthClient !== 'undefined' && AuthClient.isAuthenticated) {
      return AuthClient.isAuthenticated();
    }
    return !!getToken();
  }

  function findMenuImageHosts(root) {
    const scope = root && root.querySelectorAll ? root : document;
    if (root && root.matches && root.matches('[data-menu-item-path][data-menu-image-client-id]')) {
      return [root];
    }
    return Array.from(
      scope.querySelectorAll('[data-menu-item-path][data-menu-image-client-id]')
    );
  }

  async function fetchApprovedImages(clientId, menuItemPath) {
    const url = `${CONFIG.apiUrl}/menu-images?client_id=${encodeURIComponent(clientId)}&menu_item_path=${encodeURIComponent(menuItemPath)}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    return (json.data || []).map(img => img.thumbor_url || img.thumborURL || img.url);
  }

  function ensureExpandedCarouselNav(carousel, slideCount) {
    if (!carousel || slideCount <= 1) return;

    let view = carousel.querySelector('.expanded-image-carousel-view');
    if (!view) {
      view = document.createElement('div');
      view.className = 'expanded-image-carousel-view';
      const container = carousel.querySelector('.expanded-image-carousel-container');
      if (container) {
        view.appendChild(container);
        carousel.insertBefore(view, carousel.firstChild);
      }
    }

    if (!carousel.querySelector('.expanded-image-nav-buttons')) {
      const navWrap = document.createElement('div');
      navWrap.className = 'expanded-image-nav-buttons';
      navWrap.innerHTML = `
        <button type="button" class="expanded-image-nav expanded-image-nav-prev" onclick="navigateExpandedImage(this, -1, '', event)" aria-label="Previous image"><i class="fa fa-chevron-left" aria-hidden="true"></i></button>
        <button type="button" class="expanded-image-nav expanded-image-nav-next" onclick="navigateExpandedImage(this, 1, '', event)" aria-label="Next image"><i class="fa fa-chevron-right" aria-hidden="true"></i></button>
      `;
      view.appendChild(navWrap);
    }

    let indicators = carousel.querySelector('.expanded-image-indicators');
    if (!indicators) {
      indicators = document.createElement('div');
      indicators.className = 'expanded-image-indicators';
      indicators.setAttribute('role', 'tablist');
      indicators.setAttribute('aria-label', 'Item images');
      carousel.appendChild(indicators);
    }

    const needed = slideCount - indicators.querySelectorAll('.expanded-image-indicator').length;
    const start = indicators.querySelectorAll('.expanded-image-indicator').length;
    for (let i = 0; i < needed; i++) {
      const idx = start + i;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'expanded-image-indicator';
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-label', 'Image ' + (idx + 1));
      btn.setAttribute('data-indicator-index', String(idx));
      btn.setAttribute('aria-selected', 'false');
      btn.onclick = function (event) {
        if (typeof goToExpandedImage === 'function') goToExpandedImage(this, idx, '', event);
      };
      indicators.appendChild(btn);
    }
  }

  function injectApprovedImages(carousel, thumborUrls) {
    if (!carousel || !thumborUrls.length) return;

    const container = carousel.querySelector(
      '.menu-item-slideshow-track, .expanded-image-carousel-container, .single-page-image-carousel-container'
    );
    if (!container) return;

    const baseIndex = container.querySelectorAll('.expanded-image-slide, .single-page-image-slide').length;
    thumborUrls.forEach((url, i) => {
      const slide = document.createElement('div');
      const isFirst = baseIndex === 0 && i === 0;
      slide.className =
        'expanded-image-slide menu-item-slideshow-slide' + (isFirst ? ' active' : '');
      slide.setAttribute('data-image-index', String(baseIndex + i));
      slide.setAttribute('data-user-photo', '1');
      const safeUrl = String(url).replace(/'/g, '%27');
      slide.innerHTML =
        '<div class="content-panel" style="--ad-image: url(\'' +
        safeUrl +
        '\')">' +
        '<img src="' +
        safeUrl.replace(/"/g, '%22') +
        '" alt="User photo" loading="lazy" decoding="async" class="ad-portrait expanded-image-carousel-img">' +
        '</div>';
      container.appendChild(slide);
    });

    ensureExpandedCarouselNav(carousel, baseIndex + thumborUrls.length);

    if (typeof bindExpandedCarouselImages === 'function') {
      bindExpandedCarouselImages(carousel);
    }
  }

  function bindAddPhotoButton(host, clientId, pathForApi) {
    const addBtn = host.querySelector('.menu-image-add-btn');
    if (!addBtn) return;

    if (isLoggedIn()) {
      addBtn.style.display = 'inline-flex';
      if (addBtn._menuImageClickHandler) {
        addBtn.removeEventListener('click', addBtn._menuImageClickHandler);
      }
      addBtn._menuImageClickHandler = function (e) {
        e.preventDefault();
        e.stopPropagation();
        openUploadModal(clientId, pathForApi);
      };
      addBtn.addEventListener('click', addBtn._menuImageClickHandler);
    } else {
      addBtn.style.display = 'none';
    }
  }

  function initMenuImageHost(host) {
    if (!host || host.dataset.menuImageBound === '1') return;

    const clientId = host.getAttribute('data-menu-image-client-id') || CONFIG.clientId;
    const menuItemPath = host.getAttribute('data-menu-item-path') || '';
    if (!menuItemPath) return;

    host.dataset.menuImageBound = '1';
    const pathForApi = menuItemPath.replace(/\/$/, '') || '/';

    const carousel =
      host.querySelector('#singlePageImageCarousel') ||
      host.querySelector('.expanded-image-carousel');

    if (carousel) {
      const container = carousel.querySelector(
        '.menu-item-slideshow-track, .expanded-image-carousel-container'
      );
      if (container) {
        container.querySelectorAll('[data-user-photo]').forEach(function (slide) {
          slide.remove();
        });
      }

      fetchApprovedImages(clientId, pathForApi)
        .then(function (images) {
          if (images.length > 0) {
            injectApprovedImages(carousel, images);
          }
        })
        .catch(function (err) {
          console.warn('Menu image fetch:', err);
        });
    }

    bindAddPhotoButton(host, clientId, pathForApi);
  }

  function init(root) {
    findMenuImageHosts(root || document).forEach(initMenuImageHost);
  }

  function openUploadModal(clientId, menuItemPath) {
    const modal = document.getElementById('menuImageUploadModal');
    if (modal) {
      modal.style.display = 'flex';
      modal.dataset.clientId = clientId;
      modal.dataset.menuItemPath = menuItemPath;
      return;
    }

    const m = document.createElement('div');
    m.id = 'menuImageUploadModal';
    m.className = 'menu-image-upload-modal';
    m.style.cssText = 'display:flex;position:fixed;inset:0;background:rgba(0,0,0,0.6);align-items:center;justify-content:center;z-index:9999;';
    m.innerHTML = `
      <div class="menu-image-upload-dialog" style="background:#1a1a1a;padding:24px;border-radius:12px;max-width:400px;width:90%;">
        <h3 style="margin:0 0 16px;color:#fff;">Add photo for this menu item</h3>
        <p style="color:#999;font-size:14px;margin-bottom:16px;">Your photo will be reviewed by an admin before it appears on the menu.</p>
        <input type="file" id="menuImageFileInput" accept="image/jpeg,image/png,image/webp" style="margin-bottom:16px;">
        <div id="menuImageUploadStatus" style="min-height:20px;font-size:14px;color:#0f0;"></div>
        <div style="display:flex;gap:12px;justify-content:flex-end;">
          <button type="button" class="menu-image-btn-cancel" style="padding:10px 20px;background:#333;color:#fff;border:none;border-radius:8px;cursor:pointer;">Cancel</button>
          <button type="button" id="menuImageUploadSubmit" style="padding:10px 20px;background:#667eea;color:#fff;border:none;border-radius:8px;cursor:pointer;">Upload</button>
        </div>
      </div>
    `;
    m.dataset.clientId = clientId;
    m.dataset.menuItemPath = menuItemPath;
    document.body.appendChild(m);

    m.querySelector('.menu-image-btn-cancel').onclick = () => { m.style.display = 'none'; };
    m.querySelector('#menuImageUploadSubmit').onclick = () => doUpload(m);
    m.onclick = (e) => { if (e.target === m) m.style.display = 'none'; };
  }

  async function doUpload(modal) {
    const input = document.getElementById('menuImageFileInput');
    const status = document.getElementById('menuImageUploadStatus');
    if (!input || !input.files || !input.files[0]) {
      if (status) status.textContent = 'Please select an image.';
      return;
    }

    const token = getToken();
    if (!token) {
      if (status) status.textContent = 'Please log in to upload.';
      return;
    }

    const clientId = modal.dataset.clientId;
    const menuItemPath = modal.dataset.menuItemPath;
    const form = new FormData();
    form.append('client_id', clientId);
    form.append('menu_item_path', menuItemPath);
    form.append('image', input.files[0]);

    status.textContent = 'Uploading...';
    try {
      const res = await fetch(`${CONFIG.apiUrl}/menu-images`, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token },
        body: form
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success) {
        status.textContent = 'Submitted for review! An admin will approve it soon.';
        status.style.color = '#22c55e';
        input.value = '';
        setTimeout(() => { modal.style.display = 'none'; }, 2000);
      } else {
        status.textContent = json.error || 'Upload failed. Please try again.';
        status.style.color = '#ef4444';
      }
    } catch (e) {
      status.textContent = 'Network error. Please try again.';
      status.style.color = '#ef4444';
    }
  }

  window.initMenuImageIntegration = init;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { init(); });
  } else {
    init();
  }

  function registerBarbaMenuImages() {
    if (window.TTMSBarba) {
      window.TTMSBarba.register(function () { init(); });
    }
  }

  if (window.TTMSBarba) {
    registerBarbaMenuImages();
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', registerBarbaMenuImages);
  } else {
    registerBarbaMenuImages();
  }

  document.addEventListener('auth:login', function () {
    document.querySelectorAll('[data-menu-item-path][data-menu-image-client-id]').forEach(function (host) {
      delete host.dataset.menuImageBound;
      initMenuImageHost(host);
    });
  });
})();
