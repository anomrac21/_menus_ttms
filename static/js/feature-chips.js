/**
 * Feature chips — expand/collapse detail copy (ordering channels, payments, etc.)
 * After loader hides: show titles briefly, then collapse to icon badges.
 */
(function () {
  'use strict';

  var TITLES_HOLD_MS = 2200;
  var titlesTimers = [];

  function collapseChip(chip) {
    if (!chip) return;
    chip.classList.remove('is-expanded');
    var btn = chip.querySelector('.loader-feature__btn');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function expandChip(chip) {
    if (!chip) return;
    chip.classList.add('is-expanded');
    var btn = chip.querySelector('.loader-feature__btn');
    if (btn) btn.setAttribute('aria-expanded', 'true');
  }

  function setExpanded(chip, list, open) {
    if (!chip || !list) return;
    // User interaction ends the intro titles phase
    list.classList.remove('is-titles-in');
    list.querySelectorAll('.loader-feature.is-expanded').forEach(function (other) {
      if (other !== chip) collapseChip(other);
    });
    if (open) expandChip(chip);
    else collapseChip(chip);
  }

  function onActivate(btn) {
    var chip = btn.closest('.loader-feature');
    var list = btn.closest('.loader-features');
    if (!chip || !list) return;
    setExpanded(chip, list, !chip.classList.contains('is-expanded'));
  }

  function initList(list) {
    if (!list || list.dataset.featureChipsReady === '1') return;
    if (!list.classList.contains('loader-features--expandable')) return;
    list.dataset.featureChipsReady = '1';

    list.addEventListener('click', function (e) {
      var btn = e.target.closest('.loader-feature__btn');
      if (!btn || !list.contains(btn)) return;
      e.preventDefault();
      onActivate(btn);
    });
  }

  function initAll(root) {
    (root || document).querySelectorAll('.loader-features--expandable').forEach(initList);
  }

  function clearTitlesTimers() {
    titlesTimers.forEach(function (id) {
      clearTimeout(id);
    });
    titlesTimers = [];
  }

  function collapseTitlesToIcons(list) {
    if (!list) return;
    list.classList.remove('is-titles-in');
  }

  function beginTitlesIntro(list) {
    if (!list || !list.classList.contains('loader-features--expandable')) return;
    list.classList.add('is-titles-in');
    list.querySelectorAll('.loader-feature.is-expanded').forEach(collapseChip);
    var id = setTimeout(function () {
      collapseTitlesToIcons(list);
    }, TITLES_HOLD_MS);
    titlesTimers.push(id);
  }

  function runTitlesIntroAll() {
    clearTitlesTimers();
    document.querySelectorAll('.loader-features--expandable').forEach(beginTitlesIntro);
  }

  function onLoaderHidden() {
    runTitlesIntroAll();
  }

  document.addEventListener('click', function (e) {
    if (e.target.closest('.loader-feature__btn')) return;
    document.querySelectorAll('.loader-feature.is-expanded').forEach(collapseChip);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    document.querySelectorAll('.loader-feature.is-expanded').forEach(collapseChip);
  });

  function loaderStillVisible() {
    var loader = document.getElementById('loader');
    if (!loader) return false;
    if (loader.classList.contains('loader-force-hidden')) return false;
    if (loader.style.display === 'none') return false;
    var style = window.getComputedStyle(loader);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    return true;
  }

  function onPageEnter() {
    collapseAll();
    initAll();
    // First paint / Barba leave that still shows the loader: wait for ttms:loader-hidden
    if (!loaderStillVisible()) {
      runTitlesIntroAll();
    } else {
      // Keep titles ready under the loader until it exits
      document.querySelectorAll('.loader-features--expandable').forEach(function (list) {
        list.classList.add('is-titles-in');
      });
    }
  }

  function collapseAll() {
    document.querySelectorAll('.loader-feature.is-expanded').forEach(collapseChip);
  }

  function registerBarba() {
    if (!window.TTMSBarba || window._ttmsFeatureChipsBarbaRegistered) return;
    window._ttmsFeatureChipsBarbaRegistered = true;
    window.TTMSBarba.register(onPageEnter);
  }

  function bindLoaderHidden() {
    document.addEventListener('ttms:loader-hidden', onLoaderHidden);

    // If loader already gone when this script boots, start titles intro
    var loader = document.getElementById('loader');
    if (
      !loader ||
      loader.classList.contains('loader-force-hidden') ||
      loader.style.display === 'none'
    ) {
      // Defer so first paint can show is-titles-in from HTML
      setTimeout(onLoaderHidden, 80);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initAll();
      registerBarba();
      bindLoaderHidden();
    });
  } else {
    initAll();
    registerBarba();
    bindLoaderHidden();
  }

  if (!window._ttmsFeatureChipsBarbaRegistered) {
    var tries = 0;
    var timer = setInterval(function () {
      registerBarba();
      if (window._ttmsFeatureChipsBarbaRegistered || ++tries > 40) {
        clearInterval(timer);
      }
    }, 50);
  }

  window.TtmsFeatureChips = {
    init: initAll,
    collapseAll: collapseAll,
    showTitlesThenCollapse: runTitlesIntroAll
  };
})();
