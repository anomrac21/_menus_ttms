/**
 * TTMenus Authentication Client
 * Handles all authentication operations with the auth-service backend
 */

function ttmsNormalizeAuthApiV1Base(raw) {
  var s = String(raw == null ? '' : raw)
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/\/+$/, '');
  if (!s || !/^https?:\/\//i.test(s)) {
    return '';
  }
  if (/\/api\/v1$/i.test(s)) {
    return s;
  }
  return s + '/api/v1';
}

const AuthClient = {
  /** True when session is valid via hub .ttmenus.com HttpOnly cookie (no local JWT). */
  _sessionFromCookie: false,
  _readyPromise: null,

  // Configuration (hub uses auth_token; menu CMS uses ttmenus_* — read both)
  config: {
    tokenKeys: ['auth_token', 'ttmenus_access_token'],
    refreshKeys: ['refresh_token', 'ttmenus_refresh_token'],
    userKeys: ['user_data', 'ttmenus_user'],
    get apiUrl() {
      if (typeof window !== 'undefined') {
        var fromApp = ttmsNormalizeAuthApiV1Base(
          window.APP_CONFIG && window.APP_CONFIG.authServiceUrl
        );
        if (fromApp) {
          return fromApp;
        }
        var fromAuth = ttmsNormalizeAuthApiV1Base(window.AUTH_CONFIG && window.AUTH_CONFIG.apiUrl);
        if (fromAuth) {
          return fromAuth;
        }
        var fromSvc = ttmsNormalizeAuthApiV1Base(window.AUTH_SERVICE_URL);
        if (fromSvc) {
          return fromSvc;
        }
      }
      return 'http://localhost:8080/api/v1';
    },
  },

  /**
   * Initialize auth client and resolve hub cookie or local token session.
   */
  init() {
    console.log('Auth Client initialized');
    this._readyPromise = this.checkAuthStatus();
    return this._readyPromise;
  },

  whenReady() {
    if (!this._readyPromise) {
      this._readyPromise = this.checkAuthStatus();
    }
    return this._readyPromise;
  },

  _notifyAuthReady() {
    try {
      window.dispatchEvent(new CustomEvent('ttms:auth-ready'));
    } catch (e) {}
  },

  _tokenLooksValid(token) {
    if (!token) {
      return false;
    }
    try {
      const payload = this.parseJWT(token);
      const now = Math.floor(Date.now() / 1000);
      return payload.exp > now;
    } catch (e) {
      return false;
    }
  },

  /**
   * Check if user is currently authenticated (local JWT or hub cookie session).
   */
  isAuthenticated() {
    const token = this.getAccessToken();
    if (this._tokenLooksValid(token)) {
      return true;
    }
    return !!this._sessionFromCookie;
  },

  /**
   * Parse JWT token
   */
  parseJWT(token) {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(jsonPayload);
    } catch (e) {
      console.error('Failed to parse JWT:', e);
      return null;
    }
  },

  _readStorageKey(keys) {
    var i;
    var v;
    for (i = 0; i < keys.length; i++) {
      v = sessionStorage.getItem(keys[i]);
      if (v && String(v).trim()) {
        return v;
      }
    }
    for (i = 0; i < keys.length; i++) {
      v = localStorage.getItem(keys[i]);
      if (v && String(v).trim()) {
        return v;
      }
    }
    return null;
  },

  _writeStorageKey(keys, value, storages) {
    var s;
    var k;
    storages = storages || [localStorage, sessionStorage];
    storages.forEach(function (storage) {
      keys.forEach(function (key) {
        storage.setItem(key, value);
      });
    });
  },

  _removeStorageKeys(keys) {
    var i;
    keys.forEach(function (key) {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });
  },

  getAccessToken() {
    return this._readStorageKey(this.config.tokenKeys);
  },

  getRefreshToken() {
    return this._readStorageKey(this.config.refreshKeys);
  },

  getCurrentUser() {
    var userStr = this._readStorageKey(this.config.userKeys);
    return userStr ? JSON.parse(userStr) : null;
  },

  storeAuth(accessToken, refreshToken, user) {
    this._writeStorageKey(this.config.tokenKeys, accessToken);
    if (refreshToken) {
      this._writeStorageKey(this.config.refreshKeys, refreshToken);
    }
    if (user) {
      var serialized = JSON.stringify(user);
      this._writeStorageKey(this.config.userKeys, serialized);
    }
  },

  clearAuth() {
    this._sessionFromCookie = false;
    this._removeStorageKeys(this.config.tokenKeys);
    this._removeStorageKeys(this.config.refreshKeys);
    this._removeStorageKeys(this.config.userKeys);
  },

  _purgeExpiredLocalTokens() {
    const token = this.getAccessToken();
    if (token && !this._tokenLooksValid(token)) {
      this._removeStorageKeys(this.config.tokenKeys);
    }
  },

  /**
   * GET /me using a valid Bearer token and/or hub .ttmenus.com HttpOnly cookie.
   * @param {{cookieOnly?: boolean}} opts
   */
  async _fetchMe(opts) {
    const cookieOnly = !!(opts && opts.cookieOnly);
    const headers = { Accept: 'application/json' };
    if (!cookieOnly) {
      const token = this.getAccessToken();
      if (this._tokenLooksValid(token)) {
        headers.Authorization = 'Bearer ' + token;
      }
    }
    const response = await fetch(this.config.apiUrl + '/me', {
      method: 'GET',
      credentials: 'include',
      headers: headers,
    });
    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (parseErr) {
      data = {};
    }
    return { response: response, data: data };
  },

  /**
   * Resolve session from hub login cookie on .ttmenus.com (cross-subdomain).
   */
  async syncHubSession() {
    return this._resolveSessionFromServer();
  },

  /**
   * Resolve session from auth-service /me (Bearer and/or hub cookie).
   */
  async _resolveSessionFromServer() {
    this._purgeExpiredLocalTokens();

    try {
      let result = await this._fetchMe();

      if (result.response.status === 401) {
        const refreshResult = await this.refreshToken();
        if (refreshResult.success) {
          result = await this._fetchMe();
        } else {
          result = await this._fetchMe({ cookieOnly: true });
        }
      }

      if (result.response.ok && result.data) {
        this._sessionFromCookie = true;
        const userPayload = result.data.user || result.data;
        if (result.data.access_token) {
          this.storeAuth(
            result.data.access_token,
            result.data.refresh_token || this.getRefreshToken(),
            userPayload
          );
        } else {
          this._writeStorageKey(this.config.userKeys, JSON.stringify(userPayload));
        }
        return { success: true, user: userPayload };
      }

      this._sessionFromCookie = false;
      if (!this._tokenLooksValid(this.getAccessToken())) {
        this.clearAuth();
      }
      return {
        success: false,
        error: (result.data && result.data.error) || 'Not authenticated',
      };
    } catch (error) {
      console.error('Session resolve failed:', error);
      this._sessionFromCookie = false;
      if (!this._tokenLooksValid(this.getAccessToken())) {
        this.clearAuth();
      }
      return { success: false, error: error.message };
    }
  },

  /**
   * Login user
   */
  async login(email, password) {
    try {
      const response = await fetch(`${this.config.apiUrl}/login`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      this.storeAuth(data.access_token, data.refresh_token, data.user);
      this._sessionFromCookie = true;

      return {
        success: true,
        user: data.user,
      };
    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  },

  /**
   * Sign up new user
   */
  async signup(userData) {
    try {
      const response = await fetch(`${this.config.apiUrl}/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Signup failed');
      }

      return {
        success: true,
        message: data.message,
        userId: data.user_id,
      };
    } catch (error) {
      console.error('Signup error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  },

  /**
   * Logout user
   */
  async logout() {
    const token = this.getAccessToken();
    
    try {
      const headers = {};
      if (token) {
        headers.Authorization = 'Bearer ' + token;
      }
      await fetch(`${this.config.apiUrl}/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: headers,
      });
    } catch (error) {
      console.error('Logout error:', error);
    }

    this.clearAuth();
    return { success: true };
  },

  /**
   * Refresh access token
   */
  async refreshToken() {
    const refreshToken = this.getRefreshToken();
    const body = refreshToken ? { refresh_token: refreshToken } : {};

    try {
      const response = await fetch(`${this.config.apiUrl}/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Token refresh failed');
      }

      if (data.access_token) {
        this._writeStorageKey(this.config.tokenKeys, data.access_token);
      }
      this._sessionFromCookie = true;

      return {
        success: true,
        accessToken: data.access_token,
      };
    } catch (error) {
      console.error('Token refresh error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  },

  /**
   * Get current user profile from API
   */
  async getProfile() {
    const token = this.getAccessToken();
    const headers = {};
    if (this._tokenLooksValid(token)) {
      headers.Authorization = 'Bearer ' + token;
    }

    try {
      const response = await fetch(`${this.config.apiUrl}/me`, {
        method: 'GET',
        credentials: 'include',
        headers: headers,
      });

      const data = await response.json();

      if (!response.ok) {
        // Try to refresh token if unauthorized
        if (response.status === 401) {
          const refreshResult = await this.refreshToken();
          if (refreshResult.success) {
            // Retry with new token
            return this.getProfile();
          }
        }
        throw new Error(data.error || 'Failed to get profile');
      }

      this._sessionFromCookie = true;
      this._writeStorageKey(this.config.userKeys, JSON.stringify(data));

      return {
        success: true,
        user: data,
      };
    } catch (error) {
      console.error('Get profile error:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Update user profile
   */
  async updateProfile(updates) {
    const token = this.getAccessToken();
    
    if (!token) {
      return { success: false, error: 'Not authenticated' };
    }

    try {
      const response = await fetch(`${this.config.apiUrl}/me`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update profile');
      }

      // Update stored user info
      if (data.user) {
        localStorage.setItem(this.config.userKey, JSON.stringify(data.user));
      }

      return {
        success: true,
        message: data.message,
        user: data.user,
      };
    } catch (error) {
      console.error('Update profile error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  },

  /**
   * Change password
   */
  async changePassword(currentPassword, newPassword, confirmPassword) {
    const token = this.getAccessToken();
    
    if (!token) {
      return { success: false, error: 'Not authenticated' };
    }

    try {
      const response = await fetch(`${this.config.apiUrl}/change-password`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
          confirm_password: confirmPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to change password');
      }

      return {
        success: true,
        message: data.message,
      };
    } catch (error) {
      console.error('Change password error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  },

  /**
   * Forgot password - request reset
   */
  async forgotPassword(email) {
    try {
      const response = await fetch(`${this.config.apiUrl}/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to request password reset');
      }

      return {
        success: true,
        message: data.message,
      };
    } catch (error) {
      console.error('Forgot password error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  },

  /**
   * Reset password with token
   */
  async resetPassword(token, newPassword, confirmPassword) {
    try {
      const response = await fetch(`${this.config.apiUrl}/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          new_password: newPassword,
          confirm_password: confirmPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reset password');
      }

      return {
        success: true,
        message: data.message,
      };
    } catch (error) {
      console.error('Reset password error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  },

  /**
   * Verify email with token
   */
  async verifyEmail(token) {
    try {
      const response = await fetch(`${this.config.apiUrl}/verify-email?token=${token}`, {
        method: 'GET',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to verify email');
      }

      return {
        success: true,
        message: data.message,
      };
    } catch (error) {
      console.error('Verify email error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  },

  /**
   * Check authentication on first load (local token, refresh, or hub cookie).
   */
  async checkAuthStatus() {
    await this._resolveSessionFromServer();
    this._notifyAuthReady();
  },

  /**
   * Re-check session after in-site navigation or bfcache restore.
   */
  async refreshMenuSession() {
    await this._resolveSessionFromServer();
    this._notifyAuthReady();
  },

  _normalizeRoles(roles) {
    if (!roles) {
      return [];
    }
    if (Array.isArray(roles)) {
      return roles;
    }
    if (typeof roles === 'string') {
      return roles.split(',').map(function (r) {
        return r.trim();
      }).filter(Boolean);
    }
    return [];
  },

  /**
   * Check if user has specific role
   */
  hasRole(role) {
    const user = this.getCurrentUser();
    return user && this._normalizeRoles(user.roles).includes(role);
  },

  /**
   * Check if user is admin (includes superadmin)
   */
  isAdmin() {
    return this.hasRole('admin') || this.hasRole('superadmin');
  },

  /**
   * Check if user is superadmin
   */
  isSuperadmin() {
    return this.hasRole('superadmin');
  },

  /**
   * Make authenticated API request
   */
  async authenticatedRequest(url, options = {}, _retried) {
    if (!this.isAuthenticated()) {
      const synced = await this.syncHubSession();
      if (!synced.success) {
        return { success: false, error: 'Not authenticated' };
      }
    }

    const token = this.getAccessToken();
    const headers = { ...(options.headers || {}) };
    if (this._tokenLooksValid(token)) {
      headers.Authorization = 'Bearer ' + token;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        credentials: 'include',
      });

      const text = await response.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch (parseErr) {
        data = {};
      }

      if (!response.ok) {
        if (response.status === 401 && !_retried) {
          const refreshResult = await this.refreshToken();
          if (refreshResult.success) {
            return this.authenticatedRequest(url, options, true);
          }
          const synced = await this.syncHubSession();
          if (synced.success) {
            return this.authenticatedRequest(url, options, true);
          }
        }
        var errMsg = data.error || data.message || 'Request failed';
        if (response.status) {
          errMsg = errMsg + ' (HTTP ' + response.status + ')';
        }
        throw new Error(errMsg);
      }

      return { success: true, data };
    } catch (error) {
      console.error('Authenticated request error:', error);
      return { success: false, error: error.message };
    }
  },

  /** Favorites (venues, locations, dishes, recipes) — auth-service, shared with ttms_app hub. */
  async getFavorites(kind) {
    const q = kind ? '?kind=' + encodeURIComponent(kind) : '';
    return this.authenticatedRequest(this.config.apiUrl + '/me/favorites' + q, { method: 'GET' });
  },

  async addFavorite(payload) {
    return this.authenticatedRequest(this.config.apiUrl + '/me/favorites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    });
  },

  async removeFavorite(kind, itemKey) {
    var params = new URLSearchParams();
    params.set('kind', kind || '');
    params.set('item_key', itemKey || '');
    return this.authenticatedRequest(
      this.config.apiUrl + '/me/favorites?' + params.toString(),
      { method: 'DELETE' }
    );
  },

  async addFavoriteVenue(menuId, menuName, menuUrl, imageUrl) {
    return this.addFavorite({
      kind: 'venue',
      item_key: menuId,
      title: menuName || menuId,
      url: menuUrl || '',
      image_url: imageUrl || '',
    });
  },
};

// Initialize auth client when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => AuthClient.init());
} else {
  AuthClient.init();
}

// Export for use in other scripts
window.AuthClient = AuthClient;

