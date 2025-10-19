/**
 * TTMenus Client Access Control
 * Validates admin access to specific client sites
 */

const AuthClientAccess = {
  /**
   * Get the current site's client ID from the domain or config
   */
  getCurrentClientID() {
    // Try to get from window config first
    if (window.SITE_CLIENT_ID) {
      return window.SITE_CLIENT_ID;
    }
    
    // Extract from hostname (e.g., omgsushi.ttmenus.com -> omgsushi)
    const hostname = window.location.hostname;
    const parts = hostname.split('.');
    
    if (parts.length >= 2 && parts[1] === 'ttmenus') {
      return parts[0]; // Return subdomain as client ID
    }
    
    // For localhost development
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

    // Superadmin has access to all sites
    if (AuthClient.isSuperadmin()) {
      return true;
    }

    // Check if admin has this client in their assigned list
    if (AuthClient.isAdmin()) {
      const currentClientID = this.getCurrentClientID();
      
      if (!currentClientID) {
        console.warn('Could not determine current client ID');
        return true; // Allow access if we can\'t determine (fail open for dev)
      }

      // Check if user's client_id contains this client
      const userClientIDs = user.client_id || '';
      
      if (!userClientIDs) {
        console.log('Admin has no assigned clients');
        return false;
      }

      // Split comma-separated list and check
      const assignedClients = userClientIDs.split(',').map(id => id.trim());
      const hasAccess = assignedClients.includes(currentClientID);
      
      console.log('Client access check:', {
        currentClient: currentClientID,
        assignedClients: assignedClients,
        hasAccess: hasAccess
      });
      
      return hasAccess;
    }

    // Regular users don't have admin access anyway
    return true;
  },

  /**
   * Protect admin page with client access check
   */
  protectAdminPage(options = {}) {
    const {
      redirectUrl = '/',
      showError = true,
    } = options;

    // First check if user is authenticated and is admin
    if (!AuthClient.isAuthenticated()) {
      window.location.href = '/login/';
      return false;
    }

    if (!AuthClient.isAdmin()) {
      alert('Access denied. Admin privileges required.');
      window.location.href = redirectUrl;
      return false;
    }

    // Check client access
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
      return; // Not applicable for superadmins or non-admins
    }

    if (!this.hasClientAccess()) {
      const currentClientID = this.getCurrentClientID();
      const user = AuthClient.getCurrentUser();
      const assignedClients = (user.client_id || '').split(',').map(id => id.trim());
      
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
      
      // Hide admin links
      document.querySelectorAll('[data-auth="admin"]').forEach(el => {
        el.style.display = 'none';
      });
    }
  }
};

// Export for use in other scripts
window.AuthClientAccess = AuthClientAccess;

