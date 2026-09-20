/**
 * Client dashboard: manage people, roles, and access for this menu.
 */
(function () {
  'use strict';

  var ROLE_CATALOG = [
    {
      value: 'admin',
      label: 'Site admin',
      desc: 'Manage this menu, people, and dashboard',
      perms: [
        'menu:read',
        'menu:write',
        'menu:delete',
        'analytics:read',
        'user:read',
        'user:write',
        'ad:read',
        'ad:write',
        'ad:delete',
        'ad:analytics',
        'dashboard:access',
      ],
    },
    {
      value: 'restaurant-staff',
      label: 'Staff',
      desc: 'Take orders and run the kitchen',
      perms: ['menu:read', 'order:read', 'order:write', 'dashboard:access'],
    },
    {
      value: 'user',
      label: 'Viewer',
      desc: 'Personal dashboard only',
      perms: ['dashboard:access'],
    },
    {
      value: 'driver',
      label: 'Driver',
      desc: 'Accept and fulfill delivery jobs',
      perms: ['delivery:drive', 'delivery:location', 'order:read', 'dashboard:access'],
      deliveryOnly: true,
    },
  ];

  var PERM_LABELS = {
    'menu:read': 'View menu',
    'menu:write': 'Edit menu',
    'menu:delete': 'Delete menu items',
    'order:read': 'View orders',
    'order:write': 'Update orders',
    'order:delete': 'Cancel orders',
    'analytics:read': 'Analytics',
    'user:read': 'View people',
    'user:write': 'Manage people',
    'user:delete': 'Remove people',
    'ad:read': 'View ads',
    'ad:write': 'Edit ads',
    'ad:delete': 'Delete ads',
    'ad:analytics': 'Ad analytics',
    'dashboard:access': 'Dashboard',
    'delivery:drive': 'Deliver jobs',
    'delivery:location': 'Share location',
    'delivery:manage': 'Manage fleet',
    'restaurant:read': 'View restaurant',
    'restaurant:write': 'Edit restaurant',
    'restaurant:delete': 'Delete restaurant',
  };

  var state = {
    users: [],
    clientId: '',
    clientIds: [],
    deliveryOn: false,
    busyId: null,
  };

  function $(id) {
    return document.getElementById(id);
  }

  function apiRoot() {
    var url =
      (window.AuthClient && AuthClient.config && AuthClient.config.apiUrl) ||
      window.AUTH_SERVICE_URL ||
      window.AUTH_CONFIG && window.AUTH_CONFIG.apiUrl ||
      'https://auth.ttmenus.com/api/v1';
    return String(url).replace(/\/+$/, '');
  }

  function request(path, options) {
    return AuthClient.authenticatedRequest(apiRoot() + path, options || { method: 'GET' });
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function deliveryEnabled() {
    var page = $('dashboardAuthPage');
    return page && page.getAttribute('data-delivery-enabled') === 'true';
  }

  function roleCatalog() {
    return ROLE_CATALOG.filter(function (role) {
      return !role.deliveryOnly || state.deliveryOn;
    });
  }

  function roleMeta(name) {
    var key = String(name || '').trim().toLowerCase();
    if (key === 'basic_user') key = 'user';
    if (key === 'restaurant-admin') {
      return { value: key, label: 'Restaurant admin', desc: 'Menu, orders, and people', perms: [] };
    }
    for (var i = 0; i < ROLE_CATALOG.length; i++) {
      if (ROLE_CATALOG[i].value === key) return ROLE_CATALOG[i];
    }
    return {
      value: key,
      label: key ? key.replace(/[-_]+/g, ' ') : 'Unknown',
      desc: '',
      perms: [],
    };
  }

  function primaryRole(roles) {
    var list = Array.isArray(roles) ? roles.slice() : [];
    var order = ['superadmin', 'admin', 'restaurant-admin', 'restaurant-staff', 'driver', 'user'];
    var lower = list.map(function (r) {
      return String(r || '').trim().toLowerCase();
    });
    for (var i = 0; i < order.length; i++) {
      if (lower.indexOf(order[i]) !== -1) return order[i];
    }
    if (lower.indexOf('basic_user') !== -1) return 'user';
    return lower[0] || 'user';
  }

  function permLabel(name) {
    return PERM_LABELS[name] || String(name || '').replace(/:/g, ' · ');
  }

  function currentUser() {
    return (window.AuthClient && AuthClient.getCurrentUser && AuthClient.getCurrentUser()) || {};
  }

  function currentUserId() {
    var user = currentUser();
    return user.id || user.ID || null;
  }

  function isSelf(user) {
    var me = currentUser();
    if (!user) return false;
    if (user.id && me.id && String(user.id) === String(me.id)) return true;
    if (user.email && me.email && String(user.email).toLowerCase() === String(me.email).toLowerCase()) {
      return true;
    }
    return false;
  }

  function siteClientIds() {
    if (window.AuthClientAccess && typeof AuthClientAccess.getSiteClientIdCandidates === 'function') {
      return AuthClientAccess.getSiteClientIdCandidates();
    }
    var id = window.SITE_CLIENT_ID || window.CLIENT_ID || '';
    return id ? [id] : [];
  }

  function idsMatch(a, b) {
    if (window.AuthClientAccess && typeof AuthClientAccess.clientIdsMatch === 'function') {
      return AuthClientAccess.clientIdsMatch(a, b);
    }
    return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  }

  function matchesThisSite(clientId) {
    var siteIds = siteClientIds();
    return siteIds.some(function (id) {
      return idsMatch(id, clientId);
    });
  }

  function unwrapList(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];
    if (Array.isArray(payload.users)) return payload.users;
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.client_sites) && payload.users) return payload.users;
    return [];
  }

  function userIdOf(raw) {
    if (!raw || typeof raw !== 'object') return null;
    return raw.id || raw.ID || raw.user_id || raw.UserID || null;
  }

  function nestedUser(raw) {
    if (!raw) return null;
    if (raw.user && typeof raw.user === 'object') return raw.user;
    if (raw.User && typeof raw.User === 'object') return raw.User;
    return raw;
  }

  function normalizeUser(raw) {
    var row = nestedUser(raw);
    if (!row) return null;
    var roles = row.roles || row.Roles || [];
    if (typeof roles === 'string') {
      roles = roles.split(',').map(function (r) {
        return r.trim();
      }).filter(Boolean);
    }
    var id = userIdOf(row) || userIdOf(raw);
    if (!id && !row.email && !row.Email) return null;
    return {
      id: id,
      email: row.email || row.Email || '',
      username: row.username || row.Username || '',
      roles: roles,
      is_active: row.is_active != null ? !!row.is_active : row.IsActive != null ? !!row.IsActive : true,
      is_email_verified:
        row.is_email_verified != null
          ? !!row.is_email_verified
          : row.IsEmailVerified != null
            ? !!row.IsEmailVerified
            : false,
      client_id: row.client_id || row.ClientID || raw.client_id || '',
      client_sites: row.client_sites || row.clientSites || row.assigned_clients || [],
    };
  }

  function uniqueUsers(list) {
    var seen = {};
    var out = [];
    list.forEach(function (user) {
      if (!user) return;
      var key = String(user.id || user.email || '').toLowerCase();
      if (!key || seen[key]) return;
      seen[key] = true;
      out.push(user);
    });
    out.sort(function (a, b) {
      return String(a.email || '').localeCompare(String(b.email || ''));
    });
    return out;
  }

  function userBelongsToThisSite(user) {
    if (!user) return false;
    if (user.client_id && matchesThisSite(user.client_id)) return true;
    var sites = [].concat(user.client_sites || [], user.assigned_clients || []);
    if (sites.length) {
      return sites.some(function (site) {
        var id = typeof site === 'string' ? site : site && (site.client_id || site.id);
        return matchesThisSite(id);
      });
    }
    return false;
  }

  function setBanner(message, kind) {
    var el = $('dashboardAuthBanner');
    if (!el) return;
    if (!message) {
      el.hidden = true;
      el.textContent = '';
      el.className = 'dashboard-auth-banner';
      return;
    }
    el.hidden = false;
    el.textContent = message;
    el.className = 'dashboard-auth-banner' + (kind ? ' dashboard-auth-banner--' + kind : '');
  }

  function setPeopleStatus(message) {
    var el = $('dashboardAuthPeopleStatus');
    if (el) el.textContent = message || '';
  }

  function setInviteStatus(message, ok) {
    var el = $('dashboardAuthInviteStatus');
    if (!el) return;
    el.textContent = message || '';
    el.classList.toggle('is-error', !!message && !ok);
  }

  function roleOptionsHtml(selected) {
    var current = String(selected || 'admin').toLowerCase();
    var options = roleCatalog().slice();
    if (current && !options.some(function (role) { return role.value === current; })) {
      options.push(roleMeta(current));
    }
    return options
      .filter(function (role) {
        return role.value && role.value !== 'superadmin';
      })
      .map(function (role) {
        var sel = role.value === current ? ' selected' : '';
        return '<option value="' + escapeHtml(role.value) + '"' + sel + '>' + escapeHtml(role.label) + '</option>';
      })
      .join('');
  }

  function permChipsHtml(roleName, extra) {
    var meta = roleMeta(roleName);
    var perms = (meta.perms || []).slice();
    if (Array.isArray(extra)) {
      extra.forEach(function (p) {
        var name = typeof p === 'string' ? p : p && p.name;
        if (name && perms.indexOf(name) === -1) perms.push(name);
      });
    }
    if (!perms.length) {
      return '<span class="dashboard-auth-perm-empty">Permissions follow this role after the next sign-in.</span>';
    }
    return perms
      .map(function (name) {
        return '<span class="dashboard-auth-perm">' + escapeHtml(permLabel(name)) + '</span>';
      })
      .join('');
  }

  function personInitial(user) {
    var src = String(user.username || user.email || '?').trim();
    return src.charAt(0).toUpperCase() || '?';
  }

  function displayName(user) {
    if (user.username) return user.username;
    var email = String(user.email || '');
    return email.split('@')[0] || 'User';
  }

  function renderPeople() {
    var host = $('dashboardAuthPeople');
    if (!host) return;
    var users = state.users;
    if (!users.length) {
      host.innerHTML = '<p class="dashboard-auth-empty">No one else is assigned yet. Invite a site admin or staff member below.</p>';
      setPeopleStatus('0 people');
      return;
    }
    setPeopleStatus(users.length + (users.length === 1 ? ' person' : ' people'));
    host.innerHTML = users
      .map(function (user) {
        var role = primaryRole(user.roles);
        var self = isSelf(user);
        var locked = role === 'superadmin' || self;
        var busy = String(state.busyId) === String(user.id);
        return (
          '<article class="dashboard-auth-person' +
          (user.is_active ? '' : ' is-inactive') +
          (self ? ' is-self' : '') +
          '" data-user-id="' +
          escapeHtml(user.id) +
          '">' +
          '<div class="dashboard-auth-person-head">' +
          '<span class="dashboard-auth-avatar" aria-hidden="true">' +
          escapeHtml(personInitial(user)) +
          '</span>' +
          '<div class="dashboard-auth-person-copy">' +
          '<h3 class="dashboard-auth-person-name">' +
          escapeHtml(displayName(user)) +
          (self ? ' <span class="dashboard-auth-you">you</span>' : '') +
          '</h3>' +
          '<p class="dashboard-auth-person-email">' +
          escapeHtml(user.email) +
          '</p>' +
          '</div>' +
          '<span class="dashboard-auth-status-badge' +
          (user.is_active ? ' is-active' : ' is-inactive') +
          '">' +
          (user.is_active ? 'Active' : 'Inactive') +
          '</span>' +
          '</div>' +
          '<div class="dashboard-auth-person-role">' +
          '<label class="dashboard-settings-label" for="authRole-' +
          escapeHtml(user.id) +
          '">Role</label>' +
          '<select class="dashboard-settings-input dashboard-auth-role-select" id="authRole-' +
          escapeHtml(user.id) +
          '" data-user-id="' +
          escapeHtml(user.id) +
          '"' +
          (locked || busy ? ' disabled' : '') +
          '>' +
          roleOptionsHtml(role) +
          '</select>' +
          '</div>' +
          '<div class="dashboard-auth-person-perms" aria-label="Permissions">' +
          permChipsHtml(role) +
          '</div>' +
          '<div class="dashboard-auth-person-actions">' +
          (locked
            ? '<p class="dashboard-auth-locked-hint">' +
              (self ? 'You cannot change your own access here.' : 'Superadmin access is managed on the Auth service.') +
              '</p>'
            : '<button type="button" class="btn-dash btn-dash-secondary dashboard-auth-remove" data-user-id="' +
              escapeHtml(user.id) +
              '"' +
              (busy ? ' disabled' : '') +
              '><i class="fa fa-user-times" aria-hidden="true"></i> Remove access</button>') +
          '</div>' +
          '</article>'
        );
      })
      .join('');
  }

  function renderInviteRoles() {
    var select = $('authInviteRole');
    if (!select) return;
    select.innerHTML = roleOptionsHtml('admin');
    updateInviteHint();
  }

  function updateInviteHint() {
    var select = $('authInviteRole');
    var hint = $('dashboardAuthInviteHint');
    if (!select || !hint) return;
    var meta = roleMeta(select.value);
    hint.textContent = meta.desc || '';
  }

  function renderRoleGuide() {
    var host = $('dashboardAuthRoleGuide');
    if (!host) return;
    host.innerHTML = roleCatalog()
      .map(function (role) {
        return (
          '<article class="dashboard-auth-role-card">' +
          '<h3 class="dashboard-auth-role-card-title">' +
          escapeHtml(role.label) +
          '</h3>' +
          '<p class="dashboard-auth-role-card-desc">' +
          escapeHtml(role.desc) +
          '</p>' +
          '<div class="dashboard-auth-person-perms">' +
          permChipsHtml(role.value) +
          '</div>' +
          '</article>'
        );
      })
      .join('');
  }

  async function resolveClientId() {
    var siteIds = siteClientIds();
    state.clientIds = siteIds.slice();
    var mine = await request('/admin/my-client-sites', { method: 'GET' });
    if (mine.success && mine.data && Array.isArray(mine.data.client_sites)) {
      for (var i = 0; i < mine.data.client_sites.length; i++) {
        var site = mine.data.client_sites[i] || {};
        var id = site.client_id || site.ClientID || site.id;
        if (id && matchesThisSite(id)) {
          state.clientId = id;
          if (state.clientIds.indexOf(id) === -1) state.clientIds.unshift(id);
          return id;
        }
      }
    }
    state.clientId = siteIds[0] || '';
    return state.clientId;
  }

  async function loadUsersFromClientEndpoint() {
    var ids = state.clientIds.length ? state.clientIds : siteClientIds();
    var lastOk = null;
    for (var i = 0; i < ids.length; i++) {
      var result = await request('/admin/clients/' + encodeURIComponent(ids[i]) + '/users', {
        method: 'GET',
      });
      if (!result.success) continue;
      lastOk = ids[i];
      var users = uniqueUsers(unwrapList(result.data).map(normalizeUser));
      if (users.length) {
        state.clientId = ids[i];
        return users;
      }
    }
    if (lastOk) state.clientId = lastOk;
    return null;
  }

  async function loadUsersFromDirectory() {
    var result = await request('/admin/users?limit=100&offset=0', { method: 'GET' });
    if (!result.success) {
      throw new Error(result.error || 'Could not load people');
    }
    return uniqueUsers(unwrapList(result.data).map(normalizeUser)).filter(function (user) {
      return userBelongsToThisSite(user) || isSelf(user);
    });
  }

  async function loadPeople() {
    setPeopleStatus('Loading people with access…');
    try {
      var fromClient = await loadUsersFromClientEndpoint();
      state.users = fromClient && fromClient.length ? fromClient : await loadUsersFromDirectory();
      renderPeople();
      if (!state.users.length) setPeopleStatus('0 people');
    } catch (err) {
      state.users = [];
      renderPeople();
      setPeopleStatus('');
      setBanner(err.message || 'Could not load people with access.', 'warn');
    }
  }

  async function changeRole(userId, role) {
    var user = state.users.filter(function (u) {
      return String(u.id) === String(userId);
    })[0];
    if (!user || isSelf(user) || primaryRole(user.roles) === 'superadmin') return;
    if (primaryRole(user.roles) === role) return;
    var meta = roleMeta(role);
    if (!window.confirm('Change ' + (user.email || 'this person') + ' to ' + meta.label + '?')) {
      renderPeople();
      return;
    }
    state.busyId = userId;
    renderPeople();
    var result = await request('/admin/users/' + encodeURIComponent(userId), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roles: [role] }),
    });
    state.busyId = null;
    if (!result.success) {
      setBanner(result.error || 'Could not update role.', 'warn');
      renderPeople();
      return;
    }
    setBanner('');
    await loadPeople();
  }

  function sitesWithoutThis(user) {
    var sites = Array.isArray(user.client_sites) ? user.client_sites.slice() : [];
    if (user.client_id) sites.push(user.client_id);
    return sites
      .map(function (site) {
        return typeof site === 'string' ? site : site && (site.client_id || site.id);
      })
      .filter(function (id) {
        return id && !matchesThisSite(id);
      });
  }

  async function removeAccess(userId) {
    var user = state.users.filter(function (u) {
      return String(u.id) === String(userId);
    })[0];
    if (!user || isSelf(user)) return;
    if (
      !window.confirm(
        'Remove access for ' + (user.email || 'this person') + ' on this menu? They will no longer reach the dashboard.'
      )
    ) {
      return;
    }
    state.busyId = userId;
    renderPeople();
    var remaining = sitesWithoutThis(user);
    var result;
    if (remaining.length) {
      result = await request('/admin/users/' + encodeURIComponent(userId), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_sites: remaining }),
      });
    } else {
      result = await request('/admin/users/' + encodeURIComponent(userId), { method: 'DELETE' });
    }
    state.busyId = null;
    if (!result.success) {
      setBanner(result.error || 'Could not remove access.', 'warn');
      renderPeople();
      return;
    }
    setBanner('');
    await loadPeople();
  }

  async function invite(ev) {
    ev.preventDefault();
    var first = ($('authInviteFirstName') || {}).value;
    var last = ($('authInviteLastName') || {}).value;
    var email = ($('authInviteEmail') || {}).value;
    var role = ($('authInviteRole') || {}).value || 'admin';
    var submit = $('dashboardAuthInviteSubmit');
    if (!state.clientId) {
      setInviteStatus('This menu is missing a client id.', false);
      return;
    }
    setInviteStatus('Sending invite…', true);
    if (submit) submit.disabled = true;
    var body = {
      first_name: String(first || '').trim(),
      last_name: String(last || '').trim(),
      email: String(email || '').trim(),
      client_ids: [state.clientId],
    };
    var created = await request('/admin/create-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!created.success) {
      setInviteStatus(created.error || 'Could not send invite.', false);
      if (submit) submit.disabled = false;
      return;
    }
    var newId = created.data && (created.data.user_id || (created.data.user && created.data.user.id));
    if (role && role !== 'admin' && newId) {
      var updated = await request('/admin/users/' + encodeURIComponent(newId), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roles: [role], client_sites: [state.clientId] }),
      });
      if (!updated.success) {
        setInviteStatus(
          'Invited as site admin, but the role could not be changed: ' + (updated.error || 'unknown error'),
          false
        );
        if (submit) submit.disabled = false;
        await loadPeople();
        return;
      }
    }
    var form = $('dashboardAuthInviteForm');
    if (form) form.reset();
    renderInviteRoles();
    setInviteStatus('Invite sent. They will get an email to set a password.', true);
    if (submit) submit.disabled = false;
    await loadPeople();
  }

  function onPeopleClick(ev) {
    var btn = ev.target.closest('.dashboard-auth-remove');
    if (!btn) return;
    removeAccess(btn.getAttribute('data-user-id'));
  }

  function onPeopleChange(ev) {
    var select = ev.target.closest('.dashboard-auth-role-select');
    if (!select) return;
    changeRole(select.getAttribute('data-user-id'), select.value);
  }

  async function init() {
    state.deliveryOn = deliveryEnabled();
    renderInviteRoles();
    renderRoleGuide();

    if (window.AuthClient && typeof AuthClient.whenReady === 'function') {
      await AuthClient.whenReady();
    }
    if (window.AuthClient && typeof AuthClient.ensureAccessToken === 'function') {
      await AuthClient.ensureAccessToken();
    }
    if (
      !window.AuthClientAccess ||
      !(await AuthClientAccess.protectAdminPage({ redirectUrl: '/dashboard/', showError: true }))
    ) {
      return;
    }

    var inviteRole = $('authInviteRole');
    if (inviteRole) inviteRole.addEventListener('change', updateInviteHint);
    var form = $('dashboardAuthInviteForm');
    if (form) form.addEventListener('submit', invite);
    var people = $('dashboardAuthPeople');
    if (people) {
      people.addEventListener('click', onPeopleClick);
      people.addEventListener('change', onPeopleChange);
    }
    var refresh = $('dashboardAuthRefresh');
    if (refresh) {
      refresh.addEventListener('click', function () {
        setBanner('');
        loadPeople();
      });
    }

    await resolveClientId();
    await loadPeople();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
