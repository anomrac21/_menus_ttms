/**
 * TTMenus Client Access Control
 * Validates admin access to specific client sites
 */

const AuthClientAccess = {
  normalizeClientId(id) {
    let n = String(id || '')
      .trim()
      .toLowerCase()
      .replace(/^_+/, '')
      .replace(/^ttms_/, '');

    // menudemo.ttmenus.com ↔ _ttms_menu_demo / ttms_menu_demo
    if (n === 'menudemo' || n === 'menu_demo' || n === 'menu-demo') {
      return 'menu_demo';
    }
    return n;
  },

  clientIdsMatch(a, b) {
    if (!a || !b) return false;
    if (String(a).trim() === String(b).trim()) return true;
    return this.normalizeClientId(a) === this.normalizeClientId(b);
  },

  /**
   * Expand a known id into common CMS / hub / subdomain aliases.
   */
  expandClientIdAliases(value, add) {
    const id = String(value || '').trim();
    if (!id) return;
    add(id);
    add(id.replace(/^_+/, ''));
    if (id.indexOf('ttms_') !== 0 && id.indexOf('_ttms_') !== 0) {
      add('ttms_' + id.replace(/^_+/, ''));
      add('_ttms_' + id.replace(/^_+/, ''));
    }
    const norm = this.normalizeClientId(id);
    if (norm === 'menu_demo') {
      add('_ttms_menu_demo');
      add('ttms_menu_demo');
      add('menudemo');
      add('ttms_menudemo');
    }
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

    this.expandClientIdAliases(window.SITE_CLIENT_ID, add);
    this.expandClientIdAliases(window.CLIENT_ID, add);
    if (window.MENU_IMAGE_CONFIG && window.MENU_IMAGE_CONFIG.clientId) {
      this.expandClientIdAliases(window.MENU_IMAGE_CONFIG.clientId, add);
    }
    if (window.SiteConfig && window.SiteConfig.clientId) {
      this.expandClientIdAliases(window.SiteConfig.clientId, add);
    }

    const hostname = window.location.hostname || '';
    const parts = hostname.split('.');

    if (parts.length >= 2 && parts[1] === 'ttmenus') {
      const sub = parts[0];
      this.expandClientIdAliases(sub, add);
      this.expandClientIdAliases('ttms_' + sub, add);
    }

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      this.expandClientIdAliases(window.DEV_CLIENT_ID, add);
    }

    return ids;
  },

  /**
   * Client ids assigned to the signed-in user (legacy client_id + hub assignments).
   */
  getUserAssignedClientIds(user) {
    const ids = [];
    const add = (value) => {
      if (value == null) return;
      if (typeof value === 'object') {
        add(value.client_id || value.clientId || value.id);
        return;
      }
      String(value)
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
        .forEach((id) => {
          if (!ids.includes(id)) ids.push(id);
        });
    };

    if (!user) return ids;
    add(user.client_id);
    add(user.tenant_id);
    if (Array.isArray(user.client_sites)) {
      user.client_sites.forEach(add);
    }
    if (Array.isArray(user.assigned_clients)) {
      user.assigned_clients.forEach(add);
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
   * Merge JWT claim client_id when profile assignments are empty/stale.
   */
  getAssignedClientsWithJwtFallback(user) {
    const assigned = this.getUserAssignedClientIds(user);
    if (assigned.length) return assigned;
    try {
      const token =
        typeof AuthClient.getAccessToken === 'function' ? AuthClient.getAccessToken() : null;
      if (!token || typeof AuthClient.parseJWT !== 'function') return assigned;
      const claims = AuthClient.parseJWT(token);
      if (!claims) return assigned;
      const fromJwt = this.getUserAssignedClientIds({
        client_id: claims.client_id,
        roles: claims.roles,
      });
      fromJwt.forEach((id) => {
        if (assigned.indexOf(id) === -1) assigned.push(id);
      });
    } catch (e) {
      /* ignore */
    }
    return assigned;
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
    const assignedClients = this.getAssignedClientsWithJwtFallback(user);

    if (!assignedClients.length) {
      console.log('Client access check: admin has no assigned clients', {
        siteIds: siteIds,
        userClientId: user.client_id || null,
        clientSites: user.client_sites || null,
        assignedClientsField: user.assigned_clients || null,
      });
      return false;
    }

    if (!siteIds.length) {
      console.warn('Could not determine current client ID');
      return true;
    }

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

};

window.AuthClientAccess = AuthClientAccess;
