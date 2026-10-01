function initLocationsSettings() {
      var listEl = document.getElementById('settingsLocationsList');
      var emptyEl = document.getElementById('settingsLocationsEmpty');
      var addBtn = document.getElementById('btnSettingsLocationAdd');
      var saveAllBtn = document.getElementById('btnSaveLocationsSettings');
      var saveAllStatus = document.getElementById('locationsSettingsSaveStatus');
      var modal = document.getElementById('settingsLocationModal');
      var modalForm = document.getElementById('settingsLocationForm');
      var modalTitle = document.getElementById('settingsLocationModalTitle');
      var editIndexEl = document.getElementById('settingsLocationEditIndex');
      var removeBtn = document.getElementById('btnSettingsLocationRemove');
      var locationHoursEditor = (typeof TtmsSettingsLocationHours !== 'undefined' && TtmsSettingsLocationHours.create)
        ? TtmsSettingsLocationHours.create()
        : null;
      var locationsState = [];
      var snapshotLocationsApplied = false;

      function locStr(v) {
        if (v === null || v === undefined) return '';
        return String(v).trim();
      }
      function locDigits(v) {
        return locStr(v).replace(/\D/g, '');
      }
      function splitCsv(value) {
        return locStr(value)
          .split(',')
          .map(function(s) { return s.trim(); })
          .filter(Boolean);
      }
      function parseLatLon(loc) {
        var ll = loc && loc.latlon;
        if (!Array.isArray(ll) || ll.length < 2) return { lat: '', lon: '' };
        return { lat: Number(ll[0]), lon: Number(ll[1]) };
      }
      function setIslandOnForm(island) {
        var islandEl = document.getElementById('settingsLocationIsland');
        if (!islandEl) return;
        island = locStr(island);
        if (island && islandEl.tagName === 'SELECT') {
          var found = false;
          for (var i = 0; i < islandEl.options.length; i++) {
            if (islandEl.options[i].value === island) {
              found = true;
              break;
            }
          }
          if (!found) {
            var islandOpt = document.createElement('option');
            islandOpt.value = island;
            islandOpt.textContent = island;
            islandEl.appendChild(islandOpt);
          }
        }
        islandEl.value = island;
      }
      function locationOrderingFlags(orderingtables) {
        var list = Array.isArray(orderingtables) ? orderingtables : [];
        return {
          takeaway: list.some(isTakeawayOrderingOption),
          tables: list.some(function(s) { return !isTakeawayOrderingOption(s); })
        };
      }
      function locationOrderingCardHtml(flags) {
        return '<div class="dashboard-settings-location-card-ordering" aria-label="Ordering options">' +
          '<div class="settings-location-ordering-switch-row settings-location-ordering-switch-row--card">' +
          '<span class="settings-location-ordering-switch-label">Takeaway</span>' +
          '<span class="dashboard-switch dashboard-switch--readonly">' +
          '<input type="checkbox" class="dashboard-switch-input" disabled' + (flags.takeaway ? ' checked' : '') + ' aria-label="Takeaway">' +
          '<span class="dashboard-switch-track" aria-hidden="true"></span>' +
          '<span class="dashboard-switch-state" aria-hidden="true"></span>' +
          '</span></div>' +
          '<div class="settings-location-ordering-switch-row settings-location-ordering-switch-row--card">' +
          '<span class="settings-location-ordering-switch-label">Tables</span>' +
          '<span class="dashboard-switch dashboard-switch--readonly">' +
          '<input type="checkbox" class="dashboard-switch-input" disabled' + (flags.tables ? ' checked' : '') + ' aria-label="Tables">' +
          '<span class="dashboard-switch-track" aria-hidden="true"></span>' +
          '<span class="dashboard-switch-state" aria-hidden="true"></span>' +
          '</span></div></div>';
      }
      function isTakeawayOrderingOption(value) {
        var t = locStr(value).toLowerCase();
        return t === 'takeway only' || t === 'takeaway only' || t.indexOf('takeaway') !== -1;
      }
      function parseTableLabel(value) {
        var s = locStr(value);
        if (!s) return '';
        if (/^tables\s*/i.test(s)) return locStr(s.replace(/^tables\s*/i, ''));
        if (/^table\s+/i.test(s)) return locStr(s.replace(/^table\s+/i, ''));
        return s;
      }
      function toTableStorage(label) {
        label = locStr(label);
        if (!label) return '';
        if (/^tables/i.test(label)) return label;
        return 'Tables ' + label;
      }
      function syncOrderingTablesListVisibility() {
        var tablesCb = document.getElementById('settingsLocationOrderingTablesEnabled');
        var tablesList = document.getElementById('settingsLocationTablesList');
        if (!tablesCb || !tablesList) return;
        tablesList.classList.toggle('hidden', !tablesCb.checked);
      }
      function addOrderingTableRow(value) {
        var rowsEl = document.getElementById('settingsLocationTablesRows');
        if (!rowsEl) return;
        var row = document.createElement('div');
        row.className = 'settings-location-table-row';
        var input = document.createElement('input');
        input.type = 'text';
        input.className = 'dashboard-settings-input settings-location-table-name';
        input.placeholder = 'Table name';
        input.setAttribute('aria-label', 'Table name');
        if (value) input.value = value;
        var rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'btn-dash btn-dash-secondary settings-location-table-remove';
        rm.setAttribute('aria-label', 'Remove table');
        rm.innerHTML = '<i class="fa fa-times" aria-hidden="true"></i>';
        rm.addEventListener('click', function() {
          row.remove();
        });
        row.appendChild(input);
        row.appendChild(rm);
        rowsEl.appendChild(row);
        input.focus();
      }
      function readOrderingTablesFromForm() {
        var out = [];
        var takeawayCb = document.getElementById('settingsLocationOrderingTakeaway');
        if (takeawayCb && takeawayCb.checked) out.push('Takeway Only');
        var tablesCb = document.getElementById('settingsLocationOrderingTablesEnabled');
        if (tablesCb && tablesCb.checked) {
          document.querySelectorAll('#settingsLocationTablesRows .settings-location-table-name').forEach(function(input) {
            var stored = toTableStorage(input.value);
            if (stored) out.push(stored);
          });
        }
        return out;
      }
      function setOrderingTablesOnForm(list) {
        list = Array.isArray(list) ? list : [];
        var takeawayCb = document.getElementById('settingsLocationOrderingTakeaway');
        var tablesCb = document.getElementById('settingsLocationOrderingTablesEnabled');
        var tablesList = document.getElementById('settingsLocationTablesList');
        var rowsEl = document.getElementById('settingsLocationTablesRows');
        var hasTakeaway = list.some(isTakeawayOrderingOption);
        var tableOpts = list.filter(function(s) { return !isTakeawayOrderingOption(s); });
        if (takeawayCb) takeawayCb.checked = hasTakeaway;
        if (tablesCb) tablesCb.checked = tableOpts.length > 0;
        if (rowsEl) rowsEl.innerHTML = '';
        if (tableOpts.length) {
          tableOpts.forEach(function(opt) {
            addOrderingTableRow(parseTableLabel(opt));
          });
        }
        if (tablesList) tablesList.classList.toggle('hidden', !tablesCb || !tablesCb.checked);
      }
      function normalizeLocation(loc) {
        if (!loc || typeof loc !== 'object') return null;
        var out = {
          address: locStr(loc.address),
          city: locStr(loc.city),
          island: locStr(loc.island),
          phone: locDigits(loc.phone),
          whatsapp: locDigits(loc.whatsapp),
          latlon: parseLatLon(loc),
          subcategories: Array.isArray(loc.subcategories) ? loc.subcategories.map(locStr).filter(Boolean) : [],
          orderingtables: Array.isArray(loc.orderingtables) ? loc.orderingtables.map(locStr).filter(Boolean) : [],
          delivery: loc.delivery && typeof loc.delivery === 'object' ? loc.delivery : {},
          opening_hours: loc.opening_hours && typeof loc.opening_hours === 'object' ? loc.opening_hours : {}
        };
        out.latlon = [out.latlon.lat || 0, out.latlon.lon || 0];
        var loyverseStoreId = locStr(loc.loyverse_store_id);
        if (loyverseStoreId) out.loyverse_store_id = loyverseStoreId;
        return out;
      }
      function locationPayloadFromForm() {
        var payload = {
          address: locStr(document.getElementById('settingsLocationAddress').value),
          city: locStr(document.getElementById('settingsLocationCity').value),
          island: locStr(document.getElementById('settingsLocationIsland').value),
          phone: locDigits(document.getElementById('settingsLocationPhone').value),
          whatsapp: locDigits(document.getElementById('settingsLocationWhatsapp').value),
          latlon: [
            parseFloat(document.getElementById('settingsLocationLat').value) || 0,
            parseFloat(document.getElementById('settingsLocationLon').value) || 0
          ],
          subcategories: splitCsv(document.getElementById('settingsLocationSubcategories').value),
          orderingtables: readOrderingTablesFromForm(),
          delivery: {},
          opening_hours: locationHoursEditor
            ? locationHoursEditor.export()
            : { mode: 'Auto' }
        };
        var fooddrop = locStr(document.getElementById('settingsLocationFooddrop').value);
        if (fooddrop) payload.delivery.fooddrop = fooddrop;
        var editIdx = editIndexEl ? parseInt(editIndexEl.value, 10) : -1;
        if (!isNaN(editIdx) && editIdx >= 0 && locationsState[editIdx]) {
          var existingStore = locStr(locationsState[editIdx].loyverse_store_id);
          if (existingStore) payload.loyverse_store_id = existingStore;
        }
        return payload;
      }
      function parseLocationsInitialText(raw) {
        var data;
        try {
          data = JSON.parse(raw || '[]');
        } catch (e) {
          return [];
        }
        if (typeof data === 'string') {
          try {
            data = JSON.parse(data);
          } catch (e2) {
            return [];
          }
        }
        if (Array.isArray(data)) return data;
        if (data && Array.isArray(data.locations)) return data.locations;
        return [];
      }
      function renderLocationsList() {
        if (!listEl) return;
        listEl.innerHTML = '';
        if (emptyEl) emptyEl.classList.toggle('hidden', locationsState.length > 0);
        locationsState.forEach(function(loc, index) {
          var card = document.createElement('article');
          card.className = 'dashboard-settings-location-card';
          var sub = Array.isArray(loc.subcategories) ? loc.subcategories.join(', ') : '';
          var orderingFlags = locationOrderingFlags(loc.orderingtables);
          card.innerHTML =
            '<div class="dashboard-settings-location-card-main">' +
            '<h3 class="dashboard-settings-location-card-title">' + (locStr(loc.city) || locStr(loc.address) || 'Location') + '</h3>' +
            '<p class="dashboard-settings-location-card-address">' + locStr(loc.address) + '</p>' +
            '<p class="dashboard-settings-location-card-meta">' +
            (locStr(loc.island) ? '<span>' + locStr(loc.island) + '</span>' : '') +
            (sub ? '<span>' + sub + '</span>' : '') +
            '</p>' +
            locationOrderingCardHtml(orderingFlags) +
            '</div>' +
            '<div class="dashboard-settings-location-card-actions">' +
            '<button type="button" class="btn-dash btn-dash-secondary btn-settings-location-edit" data-index="' + index + '"><i class="fa fa-pencil" aria-hidden="true"></i> Edit</button>' +
            '<button type="button" class="btn-dash btn-dash-secondary btn-settings-location-delete" data-index="' + index + '" aria-label="Remove location"><i class="fa fa-trash" aria-hidden="true"></i></button>' +
            '</div>';
          listEl.appendChild(card);
        });
        listEl.querySelectorAll('.btn-settings-location-edit').forEach(function(btn) {
          btn.addEventListener('click', function() {
            openLocationModal(parseInt(btn.getAttribute('data-index'), 10));
          });
        });
        listEl.querySelectorAll('.btn-settings-location-delete').forEach(function(btn) {
          btn.addEventListener('click', function() {
            var idx = parseInt(btn.getAttribute('data-index'), 10);
            if (!isNaN(idx) && confirm('Remove this location from the list? Save locations to commit.')) {
              locationsState.splice(idx, 1);
              renderLocationsList();
            }
          });
        });
        var locationsSummary = document.getElementById('settingsLocationsSummary');
        if (locationsSummary) {
          var nLoc = locationsState.length;
          locationsSummary.textContent = nLoc
            ? nLoc + ' location' + (nLoc === 1 ? '' : 's')
            : 'No locations';
        }
      }
      function openLocationModal(index) {
        if (!modal) return;
        var isEdit = typeof index === 'number' && index >= 0 && index < locationsState.length;
        if (modalTitle) modalTitle.textContent = isEdit ? 'Edit location' : 'Add location';
        if (editIndexEl) editIndexEl.value = isEdit ? String(index) : '';
        if (removeBtn) removeBtn.classList.toggle('hidden', !isEdit);
        var loc = isEdit ? normalizeLocation(locationsState[index]) : null;
        document.getElementById('settingsLocationAddress').value = loc ? loc.address : '';
        document.getElementById('settingsLocationCity').value = loc ? loc.city : '';
        setIslandOnForm(loc ? loc.island : '');
        document.getElementById('settingsLocationPhone').value = loc ? loc.phone : '';
        document.getElementById('settingsLocationWhatsapp').value = loc ? loc.whatsapp : '';
        document.getElementById('settingsLocationLat').value = loc ? loc.latlon[0] : '';
        document.getElementById('settingsLocationLon').value = loc ? loc.latlon[1] : '';
        document.getElementById('settingsLocationSubcategories').value = loc ? loc.subcategories.join(', ') : '';
        setOrderingTablesOnForm(loc ? loc.orderingtables : []);
        document.getElementById('settingsLocationFooddrop').value = loc && loc.delivery && loc.delivery.fooddrop ? locStr(loc.delivery.fooddrop) : '';
        if (locationHoursEditor) locationHoursEditor.load(loc ? loc.opening_hours : null);
        modal.classList.remove('hidden');
        modal.hidden = false;
        document.body.classList.add('dashboard-settings-location-modal-open');
      }
      function closeLocationModal() {
        if (!modal) return;
        modal.classList.add('hidden');
        modal.hidden = true;
        document.body.classList.remove('dashboard-settings-location-modal-open');
        if (modalForm) modalForm.reset();
        if (editIndexEl) editIndexEl.value = '';
        setOrderingTablesOnForm([]);
      }
      function loadLocationsFromCms(replaceAlways) {
        var token = (typeof AuthClient !== 'undefined' && AuthClient.getAccessToken) ? AuthClient.getAccessToken() : null;
        if (!token) return Promise.resolve();
        var clientId = window.CLIENT_ID || window.SITE_CLIENT_ID || '_ttms_menu_demo';
        var url = window.cmsApiBase() + '/clients/' + encodeURIComponent(clientId) + '/config/data-locations';
        return fetch(url, {
          credentials: 'include',
          headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }
        })
          .then(window.parseCmsApiResponse)
          .then(function(data) {
            if (snapshotLocationsApplied && !replaceAlways) return;
            if (data && Array.isArray(data.locations) && (replaceAlways || data.locations.length > 0)) {
              locationsState = data.locations.map(normalizeLocation).filter(Boolean);
              renderLocationsList();
            }
          })
          .catch(function() {
            /* keep Hugo initial data */
          });
      }
      function saveAllLocations() {
        var token = (typeof AuthClient !== 'undefined' && AuthClient.getAccessToken) ? AuthClient.getAccessToken() : null;
        if (!token) {
          alert('Sign in required.');
          return;
        }
        var clientId = window.CLIENT_ID || window.SITE_CLIENT_ID || '_ttms_menu_demo';
        var url = window.cmsApiBase() + '/clients/' + encodeURIComponent(clientId) + '/config/data-locations';
        if (saveAllBtn) saveAllBtn.disabled = true;
        if (saveAllStatus) saveAllStatus.textContent = 'Saving…';
        fetch(url, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': 'Bearer ' + token
          },
          body: JSON.stringify({ locations: locationsState })
        })
          .then(window.parseCmsApiResponse)
          .then(function(data) {
            if (saveAllStatus) saveAllStatus.textContent = window.snapshotSavedStatus(data);
          })
          .catch(function(err) {
            alert('Could not save locations: ' + (err.message || err));
            if (saveAllStatus) saveAllStatus.textContent = '';
          })
          .finally(function() {
            if (saveAllBtn) saveAllBtn.disabled = false;
          });
      }

      try {
        var initialEl = document.getElementById('settingsLocationsInitial');
        if (initialEl) {
          locationsState = parseLocationsInitialText(initialEl.textContent).map(normalizeLocation).filter(Boolean);
        }
      } catch (e) { /* ignore */ }
      renderLocationsList();
      loadLocationsFromCms().then(function() {
        if (locationsState.length === 0) {
          return fetch('/data/locations.json', { credentials: 'same-origin' })
            .then(function(res) { return res.ok ? res.json() : null; })
            .then(function(data) {
              var list = data && data.locations;
              if (Array.isArray(list) && list.length) {
                locationsState = list.map(normalizeLocation).filter(Boolean);
                renderLocationsList();
              }
            })
            .catch(function() {});
        }
      });

      if (addBtn) addBtn.addEventListener('click', function() { openLocationModal(-1); });
      try {
        var addLocationParams = new URLSearchParams(window.location.search);
        if (addLocationParams.get('add') === 'location') {
          openLocationModal(-1);
          addLocationParams.delete('add');
          var addLocationQuery = addLocationParams.toString();
          history.replaceState(
            null,
            '',
            window.location.pathname + (addLocationQuery ? '?' + addLocationQuery : '') + window.location.hash
          );
        }
      } catch (e) {}
      var orderingTablesCb = document.getElementById('settingsLocationOrderingTablesEnabled');
      if (orderingTablesCb) orderingTablesCb.addEventListener('change', syncOrderingTablesListVisibility);
      var addOrderingTableBtn = document.getElementById('btnSettingsLocationAddTable');
      if (addOrderingTableBtn) addOrderingTableBtn.addEventListener('click', function() { addOrderingTableRow(''); });
      if (saveAllBtn) saveAllBtn.addEventListener('click', saveAllLocations);
      if (modalForm) {
        modalForm.addEventListener('submit', function(ev) {
          ev.preventDefault();
          var payload = locationPayloadFromForm();
          if (!payload.address || !payload.city || !payload.island) {
            alert('Address, city, and island are required.');
            return;
          }
          var idx = editIndexEl ? parseInt(editIndexEl.value, 10) : -1;
          if (!isNaN(idx) && idx >= 0) {
            locationsState[idx] = payload;
          } else {
            locationsState.push(payload);
          }
          renderLocationsList();
          closeLocationModal();
        });
      }
      if (removeBtn) {
        removeBtn.addEventListener('click', function() {
          var idx = editIndexEl ? parseInt(editIndexEl.value, 10) : -1;
          if (!isNaN(idx) && idx >= 0 && confirm('Remove this location?')) {
            locationsState.splice(idx, 1);
            renderLocationsList();
            closeLocationModal();
          }
        });
      }
      document.querySelectorAll('[data-close-location-modal]').forEach(function(el) {
        el.addEventListener('click', closeLocationModal);
      });
      window.__ttmsSettingsLocations = {
        apply: function(list) {
          snapshotLocationsApplied = true;
          locationsState = (Array.isArray(list) ? list : []).map(normalizeLocation).filter(Boolean);
          renderLocationsList();
        },
        reloadLive: function() {
          snapshotLocationsApplied = false;
          return loadLocationsFromCms(true);
        }
      };
    }
