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

  function init() {
    const container = document.querySelector('.single-page-content[data-menu-image-client-id][data-menu-item-path]');
    if (!container) return;

    const clientId = container.getAttribute('data-menu-image-client-id') || CONFIG.clientId;
    const menuItemPath = container.getAttribute('data-menu-item-path') || window.location.pathname;

    // Normalize path (ensure no trailing slash for API)
    const pathForApi = menuItemPath.replace(/\/$/, '') || '/';

    // Fetch approved images and inject into carousel
    fetchApprovedImages(clientId, pathForApi).then(images => {
      if (images.length > 0) {
        injectApprovedImages(images);
      }
    }).catch(err => console.warn('Menu image fetch:', err));

    // Show Add photo button when logged in
    const addBtn = document.getElementById('menuImageAddBtn');
    if (addBtn) {
      if (isLoggedIn()) {
        addBtn.style.display = 'inline-flex';
        addBtn.onclick = () => openUploadModal(clientId, pathForApi);
      }
    }
  }

  async function fetchApprovedImages(clientId, menuItemPath) {
    const url = `${CONFIG.apiUrl}/menu-images?client_id=${encodeURIComponent(clientId)}&menu_item_path=${encodeURIComponent(menuItemPath)}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    return (json.data || []).map(img => img.thumbor_url || img.thumborURL || img.url);
  }

  function injectApprovedImages(thumborUrls) {
    let carousel = document.getElementById('singlePageImageCarousel');
    if (!carousel) return;

    // If it's the placeholder (single image container), convert to carousel
    if (carousel.classList.contains('single-page-image-container')) {
      const img = carousel.querySelector('img');
      const parent = carousel.parentNode;
      const newCarousel = document.createElement('div');
      newCarousel.className = 'single-page-image-carousel';
      newCarousel.id = 'singlePageImageCarousel';
      newCarousel.setAttribute('data-current-image', '0');
      newCarousel.innerHTML = `
        <div class="single-page-image-carousel-container">
          ${thumborUrls.map((url, i) => `
            <div class="single-page-image-slide ${i === 0 ? 'active' : ''}" data-image-index="${i}">
              <img src="${url}" alt="User photo" loading="lazy" class="single-page-image-carousel-img">
            </div>
          `).join('')}
        </div>
        ${thumborUrls.length > 1 ? `
        <div class="single-page-image-nav-buttons">
          <button class="single-page-image-nav single-page-image-nav-prev" onclick="navigateSinglePageImage(this, -1, event)" aria-label="Previous image"><i class="fa fa-chevron-left"></i></button>
          <button class="single-page-image-nav single-page-image-nav-next" onclick="navigateSinglePageImage(this, 1, event)" aria-label="Next image"><i class="fa fa-chevron-right"></i></button>
        </div>
        <div class="single-page-image-indicators">
          ${thumborUrls.map((_, i) => `<span class="single-page-image-indicator ${i === 0 ? 'active' : ''}" data-indicator-index="${i}" onclick="goToSinglePageImage(this, ${i}, event)"></span>`).join('')}
        </div>
        ` : ''}
      `;
      parent.replaceChild(newCarousel, carousel);
      return;
    }

    // Existing carousel - append slides
    const container = carousel.querySelector('.single-page-image-carousel-container');
    if (!container) return;

    const baseIndex = container.querySelectorAll('.single-page-image-slide').length;
    thumborUrls.forEach((url, i) => {
      const slide = document.createElement('div');
      slide.className = 'single-page-image-slide' + (baseIndex === 0 && i === 0 ? ' active' : '');
      slide.setAttribute('data-image-index', baseIndex + i);
      slide.innerHTML = `<img src="${url}" alt="User photo" loading="lazy" class="single-page-image-carousel-img">`;
      container.appendChild(slide);
    });

    // Update indicators if they exist
    const indicators = carousel.querySelector('.single-page-image-indicators');
    if (indicators && thumborUrls.length > 0) {
      thumborUrls.forEach((_, i) => {
        const span = document.createElement('span');
        span.className = 'single-page-image-indicator';
        span.setAttribute('data-indicator-index', baseIndex + i);
        span.onclick = function () { if (typeof goToSinglePageImage === 'function') goToSinglePageImage(this, baseIndex + i, event); };
        indicators.appendChild(span);
      });
    }
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
