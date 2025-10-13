/**
 * TTMenus Admin User Management
 * Handles user creation, editing, and management by admins
 */

const AdminUserManager = {
  /**
   * Create a new user (admin only)
   */
  async createUser(userData) {
    const token = AuthClient.getAccessToken();
    
    if (!token || !AuthClient.isAdmin()) {
      return { success: false, error: 'Admin access required' };
    }

    try {
      const response = await fetch(`${AuthClient.config.apiUrl}/admin/users`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create user');
      }

      return {
        success: true,
        message: data.message,
        user: data.user,
      };
    } catch (error) {
      console.error('Create user error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  },

  /**
   * List all users (admin only)
   */
  async listUsers(options = {}) {
    const { limit = 10, offset = 0 } = options;
    
    const result = await AuthClient.authenticatedRequest(
      `${AuthClient.config.apiUrl}/admin/users?limit=${limit}&offset=${offset}`,
      { method: 'GET' }
    );

    return result;
  },

  /**
   * Get user by ID (admin only)
   */
  async getUser(userId) {
    const result = await AuthClient.authenticatedRequest(
      `${AuthClient.config.apiUrl}/admin/users/${userId}`,
      { method: 'GET' }
    );

    return result;
  },

  /**
   * Update user (admin only)
   */
  async updateUser(userId, updates) {
    const token = AuthClient.getAccessToken();
    
    if (!token || !AuthClient.isAdmin()) {
      return { success: false, error: 'Admin access required' };
    }

    try {
      const response = await fetch(`${AuthClient.config.apiUrl}/admin/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update user');
      }

      return {
        success: true,
        message: data.message,
        user: data.user,
      };
    } catch (error) {
      console.error('Update user error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  },

  /**
   * Activate user (admin only)
   */
  async activateUser(userId) {
    const result = await AuthClient.authenticatedRequest(
      `${AuthClient.config.apiUrl}/admin/users/${userId}/activate`,
      { method: 'PUT' }
    );

    return result;
  },

  /**
   * Deactivate user (admin only)
   */
  async deactivateUser(userId) {
    const result = await AuthClient.authenticatedRequest(
      `${AuthClient.config.apiUrl}/admin/users/${userId}/deactivate`,
      { method: 'PUT' }
    );

    return result;
  },

  /**
   * Delete user (admin only)
   */
  async deleteUser(userId) {
    const token = AuthClient.getAccessToken();
    
    if (!token || !AuthClient.isAdmin()) {
      return { success: false, error: 'Admin access required' };
    }

    try {
      const response = await fetch(`${AuthClient.config.apiUrl}/admin/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete user');
      }

      return {
        success: true,
        message: data.message,
      };
    } catch (error) {
      console.error('Delete user error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  },

  /**
   * Get user statistics (admin only)
   */
  async getUserStats() {
    const result = await AuthClient.authenticatedRequest(
      `${AuthClient.config.apiUrl}/admin/users/stats`,
      { method: 'GET' }
    );

    return result;
  },

  /**
   * Render user list table
   */
  renderUserTable(users, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!users || users.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 3rem; color: #6b7280;">
          <p style="font-size: 1.125rem; font-weight: 500;">No users found</p>
        </div>
      `;
      return;
    }

    const cardsHtml = `
      <div class="user-cards-grid">
        ${users.map(user => `
          <div class="user-card ${!user.is_active ? 'inactive' : ''}">
            <div class="user-card-header">
              <div class="user-avatar">
                ${user.email.charAt(0).toUpperCase()}
              </div>
              <div class="user-card-info">
                <h3 class="user-card-email">${user.email}</h3>
                <div class="user-card-meta">
                  <span class="user-role-badge ${user.roles && user.roles.includes('admin') ? 'role-admin' : 'role-user'}">
                    ${user.roles ? user.roles.join(', ') : 'user'}
                  </span>
                  <span class="status-badge ${user.is_active ? 'status-active' : 'status-inactive'}">
                    ${user.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            </div>
            
            <div class="user-card-details">
              <div class="user-detail-item">
                <span class="detail-label">📧 Email Verified</span>
                <span class="detail-value">${user.email_verified ? 'Yes ✓' : 'No'}</span>
              </div>
              <div class="user-detail-item">
                <span class="detail-label">🕐 Last Login</span>
                <span class="detail-value">${user.last_login_at ? new Date(user.last_login_at).toLocaleDateString() : 'Never'}</span>
              </div>
              <div class="user-detail-item">
                <span class="detail-label">📅 Created</span>
                <span class="detail-value">${user.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown'}</span>
              </div>
            </div>
            
            <div class="user-card-actions">
              <button class="btn btn-sm btn-secondary" onclick="AdminUserManager.editUser(${user.id})">✏️ Edit</button>
              ${user.is_active 
                ? `<button class="btn btn-sm btn-warning" onclick="AdminUserManager.toggleUserStatus(${user.id}, false)">⏸️ Deactivate</button>`
                : `<button class="btn btn-sm btn-success" onclick="AdminUserManager.toggleUserStatus(${user.id}, true)">▶️ Activate</button>`
              }
              <button class="btn btn-sm btn-danger" onclick="AdminUserManager.deleteUser(${user.id})">🗑️ Delete</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    container.innerHTML = cardsHtml;
  },

  /**
   * Delete user (admin only)
   */
  async deleteUser(userId) {
    const confirmed = confirm('⚠️ Delete this user?\n\nThis action cannot be undone!');
    
    if (!confirmed) return;
    
    try {
      const response = await this.authenticatedFetch(`${this.authConfig.apiUrl}/admin/users/${userId}`, {
        method: 'DELETE',
      });
      
      const result = await response.json();
      
      if (result.success || response.ok) {
        this.showSuccess('User deleted successfully');
        
        // Reload user list
        if (window.loadUserList) {
          await window.loadUserList(window.currentPage || 0);
        }
        if (window.loadUserStats) {
          await window.loadUserStats();
        }
      } else {
        throw new Error(result.error || 'Failed to delete user');
      }
    } catch (error) {
      console.error('Delete user error:', error);
      this.showError(error.message || 'Failed to delete user');
    }
  },

  /**
   * Toggle user active status
   */
  async toggleUserStatus(userId, activate) {
    const result = activate 
      ? await this.activateUser(userId)
      : await this.deactivateUser(userId);

    if (result.success) {
      alert(result.data?.message || `User ${activate ? 'activated' : 'deactivated'} successfully`);
      // Reload user list
      if (typeof window.loadUserList === 'function') {
        window.loadUserList();
      }
    } else {
      alert('Error: ' + result.error);
    }
  },

  /**
   * Show edit user modal
   */
  editUser(userId) {
    // This would open a modal or navigate to an edit page
    console.log('Edit user:', userId);
    alert('Edit user feature - implement based on your needs');
  },
};

// Export for global use
window.AdminUserManager = AdminUserManager;

