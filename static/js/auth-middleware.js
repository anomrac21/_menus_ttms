/**
 * TTMenus Authentication Middleware
 * Protects pages that require authentication
 */

const AuthMiddleware = {
  /**
   * Protect current page - redirect to login if not authenticated
   */
  async protectPage(options = {}) {
    const {
      redirectUrl = '/login/',
      requireAdmin = false,
      onUnauthorized = null,
    } = options;

    if (typeof AuthClient.whenReady === 'function') {
      await AuthClient.whenReady();
    }

    if (!AuthClient.isAuthenticated()) {
      console.log('User not authenticated, redirecting to login');

      if (onUnauthorized && typeof onUnauthorized === 'function') {
        onUnauthorized();
      } else {
        sessionStorage.setItem('ttmenus_redirect_after_login', window.location.pathname);
        window.location.href = redirectUrl;
      }
      return false;
    }

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

  redirectAfterLogin(defaultUrl = '/') {
    const redirectUrl = sessionStorage.getItem('ttmenus_redirect_after_login');
    sessionStorage.removeItem('ttmenus_redirect_after_login');
    window.location.href = redirectUrl || defaultUrl;
  },

  toggleAuthElements() {
    const isAuth = AuthClient.isAuthenticated();
    const isAdmin = AuthClient.isAdmin();

    document.querySelectorAll('[data-auth]').forEach((el) => {
      if (el.classList.contains('menu-favorite-btn')) {
        return;
      }
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

  setupLogoutButtons() {
    document.querySelectorAll('[data-logout]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();

        await AuthClient.logout({ redirect: true, redirectUrl: '/' });
      });
    });
  },

  displayUserInfo() {
    const user = AuthClient.getCurrentUser();

    if (!user) return;

    document.querySelectorAll('[data-user-email]').forEach((el) => {
      el.textContent = user.email || '';
    });

    document.querySelectorAll('[data-user-name]').forEach((el) => {
      const name =
        user.first_name && user.last_name
          ? `${user.first_name} ${user.last_name}`
          : user.email;
      el.textContent = name;
    });

    document.querySelectorAll('[data-user-role]').forEach((el) => {
      const roles = AuthClient._normalizeRoles
        ? AuthClient._normalizeRoles(user.roles)
        : user.roles || [];
      el.textContent = roles.join(', ');
    });
  },

  updateSettingsLoginLink() {
    const el = document.getElementById('settingsLoginOrDashboard');
    if (!el) return;

    const hubAccount = 'https://www.ttmenus.com/account/';
    const labelEl = el.querySelector('.footer-settings-popover__btn-label');
    const iconEl = el.querySelector('.footer-settings-popover__btn-icon i');

    function setLinkContent(iconClass, label) {
      if (iconEl) {
        iconEl.className = 'fa ' + iconClass;
      } else {
        el.innerHTML =
          '<span class="footer-settings-popover__btn-icon" aria-hidden="true"><i class="fa ' +
          iconClass +
          '"></i></span><span class="footer-settings-popover__btn-label">' +
          label +
          '</span>';
        return;
      }
      if (labelEl) {
        labelEl.textContent = label;
      } else {
        el.appendChild(
          Object.assign(document.createElement('span'), {
            className: 'footer-settings-popover__btn-label',
            textContent: label,
          })
        );
      }
    }

    el.removeAttribute('target');
    el.removeAttribute('rel');

    if (!AuthClient.isAuthenticated()) {
      el.href = '/login/';
      setLinkContent('fa-user', 'Login');
      return;
    }

    const hasAdminAccess =
      window.AuthClientAccess &&
      typeof window.AuthClientAccess.hasClientAccess === 'function' &&
      window.AuthClientAccess.hasClientAccess();

    if (hasAdminAccess) {
      el.href = '/dashboard/';
      setLinkContent('fa-th-large', 'Dashboard');
    } else {
      el.href = hubAccount;
      el.target = '_blank';
      el.rel = 'noopener noreferrer';
      setLinkContent('fa-user', 'My account');
    }
  },

  init() {
    this.toggleAuthElements();
    this.setupLogoutButtons();
    this.displayUserInfo();
    this.updateSettingsLoginLink();
    if (window.TTMSMenuFavorites && typeof window.TTMSMenuFavorites.refresh === 'function') {
      window.TTMSMenuFavorites.refresh();
    }
  },

  applyMenuAuthState() {
    if (!window.AuthClient) {
      return;
    }

    this.init();

    if (typeof window.syncBodyAuthClasses === 'function') {
      window.syncBodyAuthClasses(AuthClient.isAuthenticated());
    }

    if (typeof window.fetchAndUpdateUserInfo === 'function') {
      window.fetchAndUpdateUserInfo();
    }

    document.querySelectorAll('.client-access-warning').forEach((el) => {
      el.remove();
    });

    const path = window.location.pathname || '';
    const isDashboard =
      path.indexOf('/dashboard') === 0 || path.indexOf('/login') === 0;
    if (
      !isDashboard &&
      window.AuthClientAccess &&
      typeof AuthClientAccess.showAccessWarning === 'function'
    ) {
      AuthClientAccess.showAccessWarning();
    }
  },
};

var menuAuthBootstrapTimer = null;
var menuAuthBootstrapInFlight = null;

async function bootstrapMenuAuth(source) {
  if (!window.AuthClient) {
    return;
  }

  if (menuAuthBootstrapInFlight) {
    return menuAuthBootstrapInFlight;
  }

  menuAuthBootstrapInFlight = (async function () {
    try {
      if (typeof AuthClient.refreshMenuSession === 'function') {
        await AuthClient.refreshMenuSession();
      } else if (typeof AuthClient.whenReady === 'function') {
        await AuthClient.whenReady();
      }
      AuthMiddleware.applyMenuAuthState();
    } catch (err) {
      console.error('[Auth] Menu bootstrap failed (' + (source || 'unknown') + '):', err);
      AuthMiddleware.applyMenuAuthState();
    } finally {
      menuAuthBootstrapInFlight = null;
    }
  })();

  return menuAuthBootstrapInFlight;
}

function scheduleBootstrapMenuAuth(source) {
  if (menuAuthBootstrapTimer) {
    clearTimeout(menuAuthBootstrapTimer);
  }
  menuAuthBootstrapTimer = setTimeout(function () {
    menuAuthBootstrapTimer = null;
    bootstrapMenuAuth(source);
  }, 80);
}

function runAuthMiddlewareInit() {
  AuthMiddleware.applyMenuAuthState();
}

window.addEventListener('ttms:auth-ready', runAuthMiddlewareInit);
if (window.AuthClient && AuthClient._readyPromise) {
  AuthClient._readyPromise.then(runAuthMiddlewareInit);
}

window.bootstrapMenuAuth = bootstrapMenuAuth;

if (window.TTMSBarba) {
  window.TTMSBarba.register(function () {
    scheduleBootstrapMenuAuth('barba');
  });
} else if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () {
    if (window.TTMSBarba) {
      window.TTMSBarba.register(function () {
        scheduleBootstrapMenuAuth('barba');
      });
    }
  });
}

document.addEventListener('ttms:page-enter', function () {
  scheduleBootstrapMenuAuth('page-enter');
});

window.addEventListener('pageshow', function (event) {
  if (event.persisted) {
    scheduleBootstrapMenuAuth('pageshow');
  }
});

window.addEventListener('focus', function () {
  scheduleBootstrapMenuAuth('focus');
});

document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'visible') {
    scheduleBootstrapMenuAuth('visible');
  }
});

window.addEventListener('storage', function (event) {
  if (event.key === 'ttmenus_user_profile') {
    scheduleBootstrapMenuAuth('storage');
  }
});

window.AuthMiddleware = AuthMiddleware;
