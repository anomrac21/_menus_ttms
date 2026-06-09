/**
 * Location open/closed status badges (contact picker + locations pages).
 * Barba reinit is handled by page-reinit.js.
 */
(function () {
  'use strict';

  if (window.__ttmsLocationStatusLoaded) return;
  window.__ttmsLocationStatusLoaded = true;

  function parseOpeningHoursAttr(raw) {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (_) {
      try {
        var el = document.createElement('textarea');
        el.innerHTML = raw;
        return JSON.parse(el.value);
      } catch (e2) {
        return null;
      }
    }
  }

  function calculateLocationStatus(openingHours) {
    var days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    var now = new Date();
    var todayIndex = now.getDay();
    var todayDay = days[todayIndex];
    var yesterdayIndex = (todayIndex - 1 + 7) % 7;
    var yesterdayDay = days[yesterdayIndex];

    function parseTime(timeStr, baseDate) {
      if (!timeStr) return null;
      var parts = String(timeStr).split(':').map(Number);
      var date = new Date(baseDate || now);
      date.setHours(parts[0], parts[1], 0, 0);
      return date;
    }

    function getHoursForDay(day, baseDate) {
      if (!openingHours[day] || !Array.isArray(openingHours[day])) return null;

      var entries = openingHours[day];
      var openTimeStr = null;
      var closeTimeStr = null;

      entries.forEach(function (entry) {
        if (entry.type === 'Open') openTimeStr = entry.time;
        else if (entry.type === 'Close') closeTimeStr = entry.time;
      });

      if (!openTimeStr || !closeTimeStr) return null;

      return {
        openTime: parseTime(openTimeStr, baseDate),
        closeTime: parseTime(closeTimeStr, baseDate),
        openTimeStr: openTimeStr,
        closeTimeStr: closeTimeStr,
      };
    }

    var yesterdayDate = new Date(now);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    var yesterdayHours = getHoursForDay(yesterdayDay, yesterdayDate);

    if (yesterdayHours && yesterdayHours.openTime && yesterdayHours.closeTime) {
      var yesterdayOpen = yesterdayHours.openTime;
      var yesterdayClose = new Date(yesterdayHours.closeTime);
      var yCloseParts = yesterdayHours.closeTimeStr.split(':').map(Number);
      var yOpenParts = yesterdayHours.openTimeStr.split(':').map(Number);

      if (yCloseParts[0] < yOpenParts[0] || (yCloseParts[0] === yOpenParts[0] && yCloseParts[1] <= yOpenParts[1])) {
        yesterdayClose.setDate(yesterdayClose.getDate() + 1);
      }

      if (now >= yesterdayOpen && now < yesterdayClose) {
        var minsToClose = Math.floor((yesterdayClose - now) / 60000);
        if (minsToClose <= 30 && minsToClose > 0) {
          return { type: 'soon-close', text: 'Closes Soon' };
        }
        return { type: 'open', text: 'Open' };
      }
    }

    var todayHours = getHoursForDay(todayDay, now);
    if (todayHours && todayHours.openTime && todayHours.closeTime) {
      var todayOpen = todayHours.openTime;
      var todayClose = new Date(todayHours.closeTime);
      var tCloseParts = todayHours.closeTimeStr.split(':').map(Number);
      var tOpenParts = todayHours.openTimeStr.split(':').map(Number);

      if (tCloseParts[0] < tOpenParts[0] || (tCloseParts[0] === tOpenParts[0] && tCloseParts[1] <= tOpenParts[1])) {
        todayClose.setDate(todayClose.getDate() + 1);
      }

      if (now >= todayOpen && now < todayClose) {
        var minsClose = Math.floor((todayClose - now) / 60000);
        if (minsClose <= 30 && minsClose > 0) {
          return { type: 'soon-close', text: 'Closes Soon' };
        }
        return { type: 'open', text: 'Open' };
      }

      if (now < todayOpen) {
        var minsOpen = Math.floor((todayOpen - now) / 60000);
        if (minsOpen > 0 && minsOpen <= 30) {
          return { type: 'soon-open', text: 'Opens Soon' };
        }
      }
    }

    return { type: 'closed', text: 'Closed' };
  }

  function updateStatusBadge(item, statusType, statusText) {
    if (!item) return;
    var statusElement = item.querySelector('.location-status-badge');
    if (!statusElement) {
      statusElement = item.querySelector('.openstatus .status-badge');
    }
    if (!statusElement) return;

    statusElement.classList.remove('open', 'closed', 'soon-open', 'soon-close', 'hide');
    statusElement.classList.add(statusType);
    statusElement.textContent = statusText;
    statusElement.disabled = false;
  }

  function syncPickerCloneBadges() {
    document.querySelectorAll('.location-picker-card[data-picker-clone]').forEach(function (clone) {
      var cloneType = clone.getAttribute('data-picker-clone');
      var picker = clone.closest('.location-picker');
      if (!picker) return;

      var cards = picker.querySelectorAll('.location-picker-card:not([data-picker-clone])');
      var source = null;
      if (cloneType === 'start') source = cards[cards.length - 1];
      else if (cloneType === 'end') source = cards[0];
      if (!source) return;

      var srcBadge = source.querySelector('.location-status-badge');
      var cloneBadge = clone.querySelector('.location-status-badge');
      if (!srcBadge || !cloneBadge) return;

      cloneBadge.className = srcBadge.className;
      cloneBadge.textContent = srcBadge.textContent;
      cloneBadge.disabled = false;
    });
  }

  function updateLocationStatuses() {
    var locationItems = document.querySelectorAll(
      '.location-item[data-location-index]:not([data-picker-clone]), .location-card[data-location-index]'
    );
    if (!locationItems.length) return;

    var needsFetch = false;

    locationItems.forEach(function (item) {
      var openingHoursData = item.getAttribute('data-opening-hours');
      if (!openingHoursData) {
        needsFetch = true;
        return;
      }

      var openingHours = parseOpeningHoursAttr(openingHoursData);
      if (!openingHours) {
        needsFetch = true;
        return;
      }

      var status = calculateLocationStatus(openingHours);
      updateStatusBadge(item, status.type, status.text);
    });

    syncPickerCloneBadges();

    if (!needsFetch) return;

    fetch('/index.json')
      .then(function (response) {
        return response.json();
      })
      .then(function (data) {
        var locations =
          data.locations && Array.isArray(data.locations)
            ? data.locations
            : data.locations && data.locations.locations && Array.isArray(data.locations.locations)
              ? data.locations.locations
              : [];

        locationItems.forEach(function (item) {
          if (item.getAttribute('data-opening-hours')) return;

          var index = parseInt(item.getAttribute('data-location-index'), 10);
          var location = locations[index];
          if (!location || !location.opening_hours) {
            updateStatusBadge(item, 'closed', 'Closed');
            return;
          }

          var status = calculateLocationStatus(location.opening_hours);
          updateStatusBadge(item, status.type, status.text);
        });

        syncPickerCloneBadges();
      })
      .catch(function () {
        locationItems.forEach(function (item) {
          if (!item.getAttribute('data-opening-hours')) {
            updateStatusBadge(item, 'closed', 'Closed');
          }
        });
        syncPickerCloneBadges();
      });
  }

  function refreshLocationStatus(button) {
    var locationStatusDiv = button.closest('.location-status');
    var locationCard = button.closest('.location-card');
    var locationItem = locationStatusDiv ? locationStatusDiv.closest('.location-item') : locationCard;
    if (!locationItem && !locationCard) return;

    var targetElement = locationItem || locationCard;
    button.disabled = true;
    var originalText = button.textContent.trim();

    button.innerHTML = '';
    var throbber = document.createElement('span');
    throbber.className = 'throbber';
    throbber.style.display = 'inline-block';
    button.appendChild(throbber);
    button.appendChild(document.createTextNode(' ' + originalText));

    function finish(statusType, statusText) {
      if (locationItem) {
        updateStatusBadge(locationItem, statusType, statusText);
      } else if (locationCard) {
        var statusButton = locationCard.querySelector('.openstatus .status-badge');
        if (statusButton) {
          statusButton.classList.remove('open', 'closed', 'soon-open', 'soon-close', 'hide');
          statusButton.classList.add(statusType);
          statusButton.textContent = statusText;
        }
      }
      syncPickerCloneBadges();
      setTimeout(function () {
        button.disabled = false;
      }, 100);
    }

    var openingHoursData = targetElement.getAttribute('data-opening-hours');
    if (openingHoursData) {
      var openingHours = parseOpeningHoursAttr(openingHoursData);
      setTimeout(function () {
        if (!openingHours) {
          button.textContent = originalText;
          button.disabled = false;
          return;
        }
        var status = calculateLocationStatus(openingHours);
        finish(status.type, status.text);
      }, 400);
      return;
    }

    var indexDiv = locationStatusDiv || locationCard;
    var index = parseInt(indexDiv.getAttribute('data-location-index'), 10);
    fetch('/index.json')
      .then(function (response) {
        return response.json();
      })
      .then(function (data) {
        var locations =
          data.locations && Array.isArray(data.locations)
            ? data.locations
            : data.locations && data.locations.locations && Array.isArray(data.locations.locations)
              ? data.locations.locations
              : [];
        var location = locations[index];
        setTimeout(function () {
          if (!location || !location.opening_hours) {
            finish('closed', 'Closed');
          } else {
            var status = calculateLocationStatus(location.opening_hours);
            finish(status.type, status.text);
          }
        }, 400);
      })
      .catch(function () {
        setTimeout(function () {
          button.textContent = originalText;
          button.disabled = false;
        }, 400);
      });
  }

  var locationStatusInterval = null;

  function initLocationStatuses() {
    updateLocationStatuses();
    if (locationStatusInterval) clearInterval(locationStatusInterval);
    locationStatusInterval = setInterval(updateLocationStatuses, 60000);
  }

  window.updateLocationStatuses = updateLocationStatuses;
  window.refreshLocationStatus = refreshLocationStatus;
  window.calculateLocationStatus = calculateLocationStatus;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(initLocationStatuses, 100);
    });
  } else {
    setTimeout(initLocationStatuses, 100);
  }
})();
