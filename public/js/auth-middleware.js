/**
 * TTMenus Authentication Middleware
 * Protects pages that require authentication
 */

const AuthMiddleware = {
  /**
   * Protect current page - redirect to login if not authenticated
   */
  protectPage(options = {}) {
    const {
      redirectUrl = '/login/',
      requireAdmin = false,
      onUnauthorized = null,
    } = options;

    // Check if authenticated
    if (!AuthClient.isAuthenticated()) {
      console.log('User not authenticated, redirecting to login');
      
      if (onUnauthorized && typeof onUnauthorized === 'function') {
        onUnauthorized();
      } else {
        // Store intended destination
        sessionStorage.setItem('ttmenus_redirect_after_login', window.location.pathname);
        window.location.href = redirectUrl;
      }
      return false;
    }

    // Check admin requirement
    if (requireAdmin && !AuthClient.isAdmin()) {
      console.log('User is not admin, access denied');
      
      if (onUnauthorized && typeof onUnauthorized === 'function') {
        onUnauthorized();
      } else {
        alert('You do not have permission to access this page');
        window.location.href = '/';
      }
      return false;
    }

    return true;
  },

  /**
   * Redirect to intended page after login
   */
  redirectAfterLogin(defaultUrl = '/') {
    const redirectUrl = sessionStorage.getItem('ttmenus_redirect_after_login');
    sessionStorage.removeItem('ttmenus_redirect_after_login');
    window.location.href = redirectUrl || defaultUrl;
  },

  /**
   * Show/hide elements based on authentication
   */
  toggleAuthElements() {
    const isAuth = AuthClient.isAuthenticated();
    const isAdmin = AuthClient.isAdmin();

    // Show/hide elements with data-auth attribute
    document.querySelectorAll('[data-auth]').forEach(el => {
      const authType = el.getAttribute('data-auth');
      
      switch (authType) {
        case 'required':
          el.style.display = isAuth ? '' : 'none';
          break;
        case 'guest':
          el.style.display = isAuth ? 'none' : '';
          break;
        case 'admin':
          el.style.display = isAdmin ? '' : 'none';
          break;
      }
    });
  },

  /**
   * Setup logout buttons
   */
  setupLogoutButtons() {
    document.querySelectorAll('[data-logout]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        
        const result = await AuthClient.logout();
        if (result.success) {
          window.location.href = '/';
        }
      });
    });
  },

  /**
   * Display user info in elements
   */
  displayUserInfo() {
    const user = AuthClient.getCurrentUser();
    
    if (!user) return;

    // Update elements with data-user-* attributes
    document.querySelectorAll('[data-user-email]').forEach(el => {
      el.textContent = user.email || '';
    });

    document.querySelectorAll('[data-user-name]').forEach(el => {
      const name = user.first_name && user.last_name 
        ? `${user.first_name} ${user.last_name}` 
        : user.email;
      el.textContent = name;
    });

    document.querySelectorAll('[data-user-role]').forEach(el => {
      el.textContent = user.roles ? user.roles.join(', ') : '';
    });
  },

  /**
   * Initialize auth middleware
   */
  init() {
    this.toggleAuthElements();
    this.setupLogoutButtons();
    this.displayUserInfo();
  },
};

// Auto-initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => AuthMiddleware.init());
} else {
  AuthMiddleware.init();
}

// Export for use in other scripts
window.AuthMiddleware = AuthMiddleware;

