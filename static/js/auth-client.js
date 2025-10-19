/**
 * TTMenus Authentication Client
 * Handles all authentication operations with the auth-service backend
 */

const AuthClient = {
  // Configuration
  config: {
    apiUrl: window.AUTH_CONFIG?.apiUrl || 'http://localhost:8080/api/v1',
    tokenKey: 'ttmenus_access_token',
    refreshKey: 'ttmenus_refresh_token',
    userKey: 'ttmenus_user',
  },

  /**
   * Initialize auth client and check authentication status
   */
  init() {
    console.log('Auth Client initialized');
    this.checkAuthStatus();
  },

  /**
   * Check if user is currently authenticated
   */
  isAuthenticated() {
    const token = this.getAccessToken();
    if (!token) return false;
    
    // Check if token is expired
    try {
      const payload = this.parseJWT(token);
      const now = Math.floor(Date.now() / 1000);
      return payload.exp > now;
    } catch (e) {
      return false;
    }
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

  /**
   * Get access token from localStorage
   */
  getAccessToken() {
    return localStorage.getItem(this.config.tokenKey);
  },

  /**
   * Get refresh token from localStorage
   */
  getRefreshToken() {
    return localStorage.getItem(this.config.refreshKey);
  },

  /**
   * Get current user from localStorage
   */
  getCurrentUser() {
    const userStr = localStorage.getItem(this.config.userKey);
    return userStr ? JSON.parse(userStr) : null;
  },

  /**
   * Store authentication tokens and user info
   */
  storeAuth(accessToken, refreshToken, user) {
    localStorage.setItem(this.config.tokenKey, accessToken);
    if (refreshToken) {
      localStorage.setItem(this.config.refreshKey, refreshToken);
    }
    if (user) {
      localStorage.setItem(this.config.userKey, JSON.stringify(user));
    }
  },

  /**
   * Clear authentication data
   */
  clearAuth() {
    localStorage.removeItem(this.config.tokenKey);
    localStorage.removeItem(this.config.refreshKey);
    localStorage.removeItem(this.config.userKey);
  },

  /**
   * Login user
   */
  async login(email, password) {
    try {
      const response = await fetch(`${this.config.apiUrl}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      // Store tokens and user info
      this.storeAuth(data.access_token, data.refresh_token, data.user);

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
    
    if (token) {
      try {
        await fetch(`${this.config.apiUrl}/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
      } catch (error) {
        console.error('Logout error:', error);
      }
    }

    this.clearAuth();
    return { success: true };
  },

  /**
   * Refresh access token
   */
  async refreshToken() {
    const refreshToken = this.getRefreshToken();
    
    if (!refreshToken) {
      return { success: false, error: 'No refresh token' };
    }

    try {
      const response = await fetch(`${this.config.apiUrl}/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Token refresh failed');
      }

      // Update access token
      localStorage.setItem(this.config.tokenKey, data.access_token);

      return {
        success: true,
        accessToken: data.access_token,
      };
    } catch (error) {
      console.error('Token refresh error:', error);
      this.clearAuth();
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
    
    if (!token) {
      return { success: false, error: 'Not authenticated' };
    }

    try {
      const response = await fetch(`${this.config.apiUrl}/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
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

      // Update stored user info
      localStorage.setItem(this.config.userKey, JSON.stringify(data));

      return {
        success: true,
        user: data,
      };
    } catch (error) {
      console.error('Get profile error:', error);
      return {
        success: false,
        error: error.message,
      };
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
   * Check authentication status on page load
   */
  checkAuthStatus() {
    if (this.isAuthenticated()) {
      console.log('User is authenticated');
      // Optionally refresh user profile
      this.getProfile().catch(err => console.error('Failed to refresh profile:', err));
    } else {
      console.log('User is not authenticated');
      this.clearAuth();
    }
  },

  /**
   * Check if user has specific role
   */
  hasRole(role) {
    const user = this.getCurrentUser();
    return user && user.roles && user.roles.includes(role);
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
  async authenticatedRequest(url, options = {}) {
    const token = this.getAccessToken();
    
    if (!token) {
      return { success: false, error: 'Not authenticated' };
    }

    const headers = {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      const data = await response.json();

      if (!response.ok) {
        // Try to refresh token if unauthorized
        if (response.status === 401) {
          const refreshResult = await this.refreshToken();
          if (refreshResult.success) {
            // Retry with new token
            return this.authenticatedRequest(url, options);
          }
        }
        throw new Error(data.error || 'Request failed');
      }

      return {
        success: true,
        data,
      };
    } catch (error) {
      console.error('Authenticated request error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
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

