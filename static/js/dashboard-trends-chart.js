/**
 * Shared multi-mode dashboard trend charts (bars / lines / area / stacked).
 */
(function (global) {
  'use strict';

  var TYPES = ['bars', 'lines', 'area', 'stacked'];
  var STORAGE_KEY = 'ttms_dashboard_chart_type';

  function escapeDefault(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getType() {
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      if (TYPES.indexOf(stored) >= 0) return stored;
    } catch (e) { /* ignore */ }
    return 'bars';
  }

  function setType(type) {
    if (TYPES.indexOf(type) < 0) type = 'bars';
    try {
      localStorage.setItem(STORAGE_KEY, type);
    } catch (e) { /* ignore */ }
    return type;
  }

  function applyTypeTabs(listEl, type) {
    if (!listEl) return;
    type = TYPES.indexOf(type) >= 0 ? type : getType();
    listEl.querySelectorAll('[data-chart-type]').forEach(function (tab) {
      var on = tab.getAttribute('data-chart-type') === type;
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  function bindTypeTabs(listEl, onChange) {
    if (!listEl || listEl.getAttribute('data-bound') === '1') return;
    listEl.setAttribute('data-bound', '1');
    applyTypeTabs(listEl, getType());
    listEl.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-chart-type]');
      if (!btn || !listEl.contains(btn)) return;
      var type = btn.getAttribute('data-chart-type');
      if (!type || btn.getAttribute('aria-selected') === 'true') return;
      setType(type);
      applyTypeTabs(listEl, type);
      if (typeof onChange === 'function') onChange(type);
    });
  }

  function valueY(value, maxVal, padTop, innerH) {
    var h = maxVal ? ((Number(value) || 0) / maxVal) * innerH : 0;
    return padTop + innerH - h;
  }

  function appendGrid(parts, pad, width, innerH, maxVal, escapeHtml) {
    for (var g = 0; g <= 4; g++) {
      var y = pad.top + (innerH * g) / 4;
      var val = Math.round(maxVal * (1 - g / 4));
      parts.push(
        '<line class="dashboard-notify-trends-grid" x1="' +
          pad.left +
          '" y1="' +
          y +
          '" x2="' +
          (width - pad.right) +
          '" y2="' +
          y +
          '"></line>'
      );
      parts.push(
        '<text class="dashboard-notify-trends-axis-y" x="' +
          (pad.left - 8) +
          '" y="' +
          (y + 4) +
          '" text-anchor="end">' +
          escapeHtml(String(val)) +
          '</text>'
      );
    }
  }

  function buildSparseMarks(rows, xForIndex) {
    var labelGap = 72;
    var marks = [];
    rows.forEach(function (row, index) {
      var x = xForIndex(index);
      var prev = marks[marks.length - 1];
      if (index === rows.length - 1) {
        while (marks.length && x - marks[marks.length - 1].x < labelGap) marks.pop();
        marks.push({ x: x, date: row.date });
        return;
      }
      if (!prev || x - prev.x >= labelGap) marks.push({ x: x, date: row.date });
    });
    return marks;
  }

  function appendXLabels(parts, marks, height, formatDate, escapeHtml) {
    marks.forEach(function (mark) {
      parts.push(
        '<text class="dashboard-notify-trends-axis-x" x="' +
          mark.x +
          '" y="' +
          (height - 8) +
          '" text-anchor="middle">' +
          escapeHtml(formatDate(mark.date)) +
          '</text>'
      );
    });
  }

  function tooltip(row, series, value, formatDate, escapeHtml) {
    return escapeHtml(formatDate(row.date)) + ' · ' + series.label + ': ' + value;
  }

  function renderGroupedBars(parts, rows, series, pad, innerH, maxVal, barGroupW, barW, barGap, prefix, formatDate, escapeHtml) {
    var seriesCount = series.length;
    rows.forEach(function (row, index) {
      var groupX = pad.left + index * barGroupW + barGroupW / 2;
      series.forEach(function (s, seriesIndex) {
        var value = Number(row[s.key]) || 0;
        var barH = maxVal ? (value / maxVal) * innerH : 0;
        var x =
          groupX -
          (barW * seriesCount + (seriesCount - 1) * barGap) / 2 +
          seriesIndex * (barW + barGap);
        var yBar = pad.top + innerH - barH;
        parts.push(
          '<rect class="dashboard-notify-trends-bar ' +
            prefix +
            '-bar--' +
            s.slug +
            '" x="' +
            x +
            '" y="' +
            yBar +
            '" width="' +
            barW +
            '" height="' +
            barH +
            '" rx="1"><title>' +
            tooltip(row, s, value, formatDate, escapeHtml) +
            '</title></rect>'
        );
      });
    });
  }

  function renderStackedBars(parts, rows, series, pad, innerH, maxVal, barGroupW, barW, prefix, formatDate, escapeHtml) {
    rows.forEach(function (row, index) {
      var groupX = pad.left + index * barGroupW + barGroupW / 2;
      var x = groupX - barW / 2;
      var stack = 0;
      series.forEach(function (s) {
        var value = Number(row[s.key]) || 0;
        var barH = maxVal ? (value / maxVal) * innerH : 0;
        var yBar = pad.top + innerH - stack - barH;
        stack += barH;
        parts.push(
          '<rect class="dashboard-notify-trends-bar ' +
            prefix +
            '-bar--' +
            s.slug +
            '" x="' +
            x +
            '" y="' +
            yBar +
            '" width="' +
            barW +
            '" height="' +
            barH +
            '" rx="1"><title>' +
            tooltip(row, s, value, formatDate, escapeHtml) +
            '</title></rect>'
        );
      });
    });
  }

  function renderLineSeriesAt(parts, rows, series, pad, innerH, maxVal, prefix, formatDate, escapeHtml, xAt) {
    series.forEach(function (s) {
      var points = [];
      rows.forEach(function (row, index) {
        var value = Number(row[s.key]) || 0;
        points.push(xAt(index) + ',' + valueY(value, maxVal, pad.top, innerH));
      });
      parts.push(
        '<polyline class="dashboard-trends-line ' +
          prefix +
          '-line ' +
          prefix +
          '-line--' +
          s.slug +
          '" fill="none" points="' +
          points.join(' ') +
          '"></polyline>'
      );
      rows.forEach(function (row, index) {
        var value = Number(row[s.key]) || 0;
        var x = xAt(index);
        var y = valueY(value, maxVal, pad.top, innerH);
        parts.push(
          '<circle class="dashboard-trends-dot ' +
            prefix +
            '-dot ' +
            prefix +
            '-dot--' +
            s.slug +
            '" cx="' +
            x +
            '" cy="' +
            y +
            '" r="3.2"><title>' +
            tooltip(row, s, value, formatDate, escapeHtml) +
            '</title></circle>'
        );
      });
    });
  }

  function renderStackedAreaAt(parts, rows, series, pad, innerH, maxVal, prefix, escapeHtml, xAt) {
    var baselines = rows.map(function () {
      return 0;
    });
    var topsBySeries = series.map(function () {
      return [];
    });
    series.forEach(function (s, seriesIndex) {
      var topPoints = [];
      var bottomPoints = [];
      rows.forEach(function (row, index) {
        var value = Number(row[s.key]) || 0;
        var x = xAt(index);
        var bottom = baselines[index];
        var top = bottom + value;
        baselines[index] = top;
        var topPoint = x + ',' + valueY(top, maxVal, pad.top, innerH);
        topPoints.push(topPoint);
        topsBySeries[seriesIndex].push(topPoint);
        bottomPoints.unshift(x + ',' + valueY(bottom, maxVal, pad.top, innerH));
      });
      parts.push(
        '<polygon class="dashboard-trends-area ' +
          prefix +
          '-area ' +
          prefix +
          '-area--' +
          s.slug +
          '" points="' +
          topPoints.concat(bottomPoints).join(' ') +
          '"><title>' +
          escapeHtml(s.label) +
          '</title></polygon>'
      );
    });
    series.forEach(function (s, seriesIndex) {
      parts.push(
        '<polyline class="dashboard-trends-line ' +
          prefix +
          '-line ' +
          prefix +
          '-line--' +
          s.slug +
          '" fill="none" points="' +
          topsBySeries[seriesIndex].join(' ') +
          '"></polyline>'
      );
    });
  }

  function rowHasAny(row, series) {
    return series.some(function (s) {
      return (Number(row[s.key]) || 0) > 0;
    });
  }

  function rowSum(row, series) {
    return series.reduce(function (sum, s) {
      return sum + (Number(row[s.key]) || 0);
    }, 0);
  }

  function render(options) {
    options = options || {};
    var chart = options.chartEl;
    var empty = options.emptyEl;
    var rows = options.rows || [];
    var series = options.series || [];
    var escapeHtml = options.escapeHtml || escapeDefault;
    var formatDate = options.formatDate || String;
    var prefix = options.classPrefix || 'dashboard-analytics-trends';
    var chartType = TYPES.indexOf(options.type) >= 0 ? options.type : getType();

    if (!chart) return { ok: false, type: chartType };

    var hasData = rows.some(function (row) {
      return row && row.date && rowHasAny(row, series);
    });
    if (!hasData) {
      chart.innerHTML = '';
      if (empty) empty.hidden = false;
      return { ok: false, type: chartType, empty: true };
    }
    if (empty) empty.hidden = true;

    // Keep the same date column under the viewport when switching chart types.
    var prevScrollLeft = chart.scrollLeft || 0;
    var prevClientWidth = chart.clientWidth || 0;
    var anchorDate = '';
    if (chart._ttmsDayW && chart._ttmsPadLeft != null && rows.length) {
      var approxIndex = Math.round(
        (prevScrollLeft + prevClientWidth / 2 - chart._ttmsPadLeft) / chart._ttmsDayW - 0.5
      );
      approxIndex = Math.max(0, Math.min(rows.length - 1, approxIndex));
      anchorDate = rows[approxIndex] && rows[approxIndex].date ? rows[approxIndex].date : '';
    }

    var height = 260;
    var pad = { top: 16, right: 24, bottom: 36, left: 44 };
    var innerH = height - pad.top - pad.bottom;
    var host = chart.clientWidth || 320;
    chart._ttmsChartW = chart.clientWidth || 0;

    var maxVal = 1;
    if (chartType === 'stacked' || chartType === 'area') {
      rows.forEach(function (row) {
        maxVal = Math.max(maxVal, rowSum(row, series));
      });
    } else {
      rows.forEach(function (row) {
        series.forEach(function (s) {
          maxVal = Math.max(maxVal, Number(row[s.key]) || 0);
        });
      });
    }

    // One day slot for every mode so Bars/Lines/Area/Stacked share the same date segment.
    var seriesCount = Math.max(1, series.length);
    var barGap = 3;
    var groupGap = 12;
    var minBar = 6;
    var maxBar = 12;
    var minGrouped =
      seriesCount * minBar + Math.max(0, seriesCount - 1) * barGap + groupGap;
    var minDay = Math.max(20, minGrouped, 18);
    var innerForHost = Math.max(0, host - pad.left - pad.right);
    var dayW = Math.max(minDay, innerForHost / Math.max(rows.length, 1));
    var barGroupW = dayW;
    var barW;
    if (chartType === 'stacked') {
      barW = Math.max(10, Math.min(26, dayW - 8));
    } else {
      var barRoom = Math.max(seriesCount * minBar, dayW - groupGap - (seriesCount - 1) * barGap);
      barW = Math.max(minBar, Math.min(maxBar, barRoom / seriesCount));
    }
    var width = Math.ceil(pad.left + pad.right + dayW * rows.length);
    var xForIndex = function (index) {
      return pad.left + index * dayW + dayW / 2;
    };

    var parts = [
      '<svg class="dashboard-notify-trends-svg dashboard-trends-svg--' +
        chartType +
        ' ' +
        prefix +
        '-svg--' +
        chartType +
        '" width="' +
        width +
        '" viewBox="0 0 ' +
        width +
        ' ' +
        height +
        '" preserveAspectRatio="xMidYMid meet" aria-hidden="true">',
    ];
    appendGrid(parts, pad, width, innerH, maxVal, escapeHtml);

    if (chartType === 'bars') {
      renderGroupedBars(parts, rows, series, pad, innerH, maxVal, barGroupW, barW, barGap, prefix, formatDate, escapeHtml);
    } else if (chartType === 'stacked') {
      renderStackedBars(parts, rows, series, pad, innerH, maxVal, barGroupW, barW, prefix, formatDate, escapeHtml);
    } else if (chartType === 'area') {
      renderStackedAreaAt(parts, rows, series, pad, innerH, maxVal, prefix, escapeHtml, xForIndex);
    } else {
      renderLineSeriesAt(parts, rows, series, pad, innerH, maxVal, prefix, formatDate, escapeHtml, xForIndex);
    }

    appendXLabels(parts, buildSparseMarks(rows, xForIndex), height, formatDate, escapeHtml);
    parts.push('</svg>');
    chart.innerHTML = parts.join('');
    chart._ttmsDayW = dayW;
    chart._ttmsPadLeft = pad.left;

    if (options.ariaLabel) chart.setAttribute('aria-label', options.ariaLabel);
    if (options.sectionEl) options.sectionEl.setAttribute('data-chart-type', chartType);

    function restoreScroll() {
      var nextScrollable = Math.max(0, chart.scrollWidth - chart.clientWidth);
      // Same day slot width across modes → keep exact scroll when possible.
      if (anchorDate) {
        var ai = -1;
        for (var i = 0; i < rows.length; i++) {
          if (rows[i].date === anchorDate) {
            ai = i;
            break;
          }
        }
        if (ai >= 0) {
          var centerX = xForIndex(ai);
          chart.scrollLeft = Math.max(0, Math.min(nextScrollable, centerX - chart.clientWidth / 2));
          return;
        }
      }
      chart.scrollLeft = Math.max(0, Math.min(nextScrollable, prevScrollLeft));
    }
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(restoreScroll);
    else restoreScroll();

    return { ok: true, type: chartType, width: width, dayW: dayW };
  }

  function typeLabel(type) {
    if (type === 'lines') return 'line';
    if (type === 'area') return 'stacked area';
    if (type === 'stacked') return 'stacked bar';
    return 'bar';
  }

  global.DashboardTrendsChart = {
    TYPES: TYPES,
    STORAGE_KEY: STORAGE_KEY,
    getType: getType,
    setType: setType,
    applyTypeTabs: applyTypeTabs,
    bindTypeTabs: bindTypeTabs,
    render: render,
    typeLabel: typeLabel,
  };
})(typeof window !== 'undefined' ? window : this);
