/**
 * TTMenus Client Access Control
 * Validates admin access to specific client sites
 */

const AuthClientAccess = {
  normalizeClientId(id) {
    return String(id || '')
      .trim()
      .replace(/^ttms_/, '')
      .toLowerCase();
  },

  clientIdsMatch(a, b) {
    if (!a || !b) return false;
    if (String(a).trim() === String(b).trim()) return true;
    return this.normalizeClientId(a) === this.normalizeClientId(b);
  },

  /**
   * All plausible client ids for this site (CMS id, subdomain, ttms_ prefix variants).
   */
  getSiteClientIdCandidates() {
    const ids = [];
    const add = (value) => {
      const id = String(value || '').trim();
      if (!id || ids.includes(id)) return;
      ids.push(id);
    };

    add(window.SITE_CLIENT_ID);
    add(window.CLIENT_ID);
    if (window.MENU_IMAGE_CONFIG && window.MENU_IMAGE_CONFIG.clientId) {
      add(window.MENU_IMAGE_CONFIG.clientId);
    }
    if (window.SiteConfig && window.SiteConfig.clientId) {
      add(window.SiteConfig.clientId);
    }

    const hostname = window.location.hostname || '';
    const parts = hostname.split('.');

    if (parts.length >= 2 && parts[1] === 'ttmenus') {
      const sub = parts[0];
      add(sub);
      add('ttms_' + sub);
    }

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      add(window.DEV_CLIENT_ID);
    }

    return ids;
  },

  /**
   * Get the current site's primary client ID from config or domain
   */
  getCurrentClientID() {
    const candidates = this.getSiteClientIdCandidates();
    if (candidates.length) return candidates[0];

    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return window.DEV_CLIENT_ID || null;
    }

    return null;
  },

  /**
   * Check if current user has access to this client site
   */
  hasClientAccess() {
    const user = AuthClient.getCurrentUser();

    if (!user) {
      return false;
    }

    if (AuthClient.isSuperadmin()) {
      return true;
    }

    if (!AuthClient.isAdmin()) {
      return false;
    }

    const siteIds = this.getSiteClientIdCandidates();
    const userClientIDs = user.client_id || '';

    if (!userClientIDs) {
      return false;
    }

    if (!siteIds.length) {
      console.warn('Could not determine current client ID');
      return true;
    }

    const assignedClients = String(userClientIDs)
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    const hasAccess = assignedClients.some((assigned) =>
      siteIds.some((siteId) => this.clientIdsMatch(assigned, siteId))
    );

    console.log('Client access check:', {
      siteIds: siteIds,
      assignedClients: assignedClients,
      hasAccess: hasAccess,
    });

    return hasAccess;
  },

  async ensureAuthSessionReady() {
    if (typeof AuthClient.refreshMenuSession === 'function') {
      await AuthClient.refreshMenuSession();
    } else if (typeof AuthClient.whenReady === 'function') {
      await AuthClient.whenReady();
    }
    if (typeof AuthClient.ensureAccessToken === 'function') {
      await AuthClient.ensureAccessToken();
    }
  },

  /**
   * Protect client dashboard/control room - only authenticated users with access to this client
   */
  async protectClientPage(options = {}) {
    const {
      redirectUrl = '/login/',
      noAccessRedirect = '/',
      showError = true,
    } = options;

    await this.ensureAuthSessionReady();

    if (!AuthClient.isAuthenticated()) {
      sessionStorage.setItem('ttmenus_redirect_after_login', window.location.pathname);
      window.location.href = redirectUrl;
      return false;
    }

    if (!this.hasClientAccess()) {
      if (showError) {
        const currentClientID = this.getCurrentClientID();
        alert(
          `Access denied. You don't have permission to access this menu for ${currentClientID || 'this site'}.`
        );
      }
      window.location.href = noAccessRedirect;
      return false;
    }

    return true;
  },

  /**
   * Protect admin page with client access check
   */
  async protectAdminPage(options = {}) {
    const { redirectUrl = '/', showError = true } = options;

    await this.ensureAuthSessionReady();

    if (!AuthClient.isAuthenticated()) {
      window.location.href = '/login/';
      return false;
    }

    if (!AuthClient.isAdmin()) {
      alert('Access denied. Admin privileges required.');
      window.location.href = redirectUrl;
      return false;
    }

    if (!this.hasClientAccess()) {
      const currentClientID = this.getCurrentClientID();

      if (showError) {
        alert(`Access denied. You don't have permission to manage ${currentClientID || 'this site'}.`);
      }

      window.location.href = redirectUrl;
      return false;
    }

    return true;
  },

  /**
   * Show warning if admin is on unauthorized site
   */
  showAccessWarning() {
    if (!AuthClient.isAdmin() || AuthClient.isSuperadmin()) {
      return;
    }

    if (!this.hasClientAccess()) {
      const currentClientID = this.getCurrentClientID();
      const user = AuthClient.getCurrentUser();
      const assignedClients = (user.client_id || '').split(',').map((id) => id.trim());

      const warningDiv = document.createElement('div');
      warningDiv.className = 'client-access-warning';
      warningDiv.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: #ff9800;
        color: white;
        padding: 12px;
        text-align: center;
        z-index: 10000;
        font-weight: bold;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      `;
      warningDiv.innerHTML = `
        ⚠️ Access Restricted: You are not authorized to manage ${currentClientID || 'this site'}.
        Your access is limited to: ${assignedClients.join(', ')}
      `;

      document.body.prepend(warningDiv);

      document.querySelectorAll('[data-auth="admin"], [data-auth="admin-site"]').forEach((el) => {
        el.style.display = 'none';
      });
    }
  },
};

window.AuthClientAccess = AuthClientAccess;
