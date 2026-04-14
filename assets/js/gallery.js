/* ============================================================
   PV Collection — gallery.js
   Renders collection cards, stats, skeleton loaders
   ============================================================ */

(function(PVC) {
  'use strict';

  // ── Cached item list (full) ─────────────────────────────────
  let _allItems = [];

  // ── Main init ───────────────────────────────────────────────
  PVC.init = async function() {
    showSkeletons(9);

    const data = await PVC.loadData();
    _allItems  = data.items || [];

    // Populate dynamic filters from data
    PVC.populateDynamicFilters(_allItems);

    // Bind all filter UI events
    PVC.bindFilters();

    // Initial render
    PVC.refreshGallery();
    updateGlobalStats(_allItems);

    // Hide loader
    setTimeout(() => {
      const loader = document.getElementById('loader');
      if (loader) loader.classList.add('fade-out');
    }, 400);
  };

  // ── Refresh gallery with current filters ────────────────────
  PVC.refreshGallery = function() {
    const filtered = PVC.applyFilters(_allItems);
    renderGallery(filtered);
    updateResultsCount(filtered.length, _allItems.length);
  };

  // ── Render gallery grid ─────────────────────────────────────
  function renderGallery(items) {
    const grid  = document.getElementById('gallery-grid');
    const empty = document.getElementById('gallery-empty');
    if (!grid) return;

    grid.innerHTML = '';

    if (items.length === 0) {
      if (empty) empty.classList.remove('hidden');
      return;
    }
    if (empty) empty.classList.add('hidden');

    items.forEach(item => {
      const card = buildCard(item);
      grid.appendChild(card);
    });
  }

  // ── Build a single card element ─────────────────────────────
  function buildCard(item) {
    const dtype     = PVC.getDisplayType(item);
    const typeCfg   = PVC.TYPE_CONFIG[dtype];
    const flag      = PVC.getFlag(item.country);
    const isCoin    = item.type === 'coin';
    const placeholder = PVC.getPlaceholderSVG(item);

    const card = document.createElement('div');
    card.className = 'collection-card';

    // Accent color on card top border based on type
    const accentColors = { coin: '#e8a827', paper: '#28b06d', polymer: '#4080e8' };
    card.style.setProperty('--card-accent', accentColors[dtype] || '#e8a827');

    card.innerHTML = `
      <div class="card-image-wrap${isCoin ? '' : ' currency-ratio'}">
        <img
          class="card-img"
          src="${placeholder}"
          data-real="${item.image || ''}"
          alt="${item.title}"
          loading="lazy"
        >
        <div class="card-type-badge badge ${typeCfg.cls}">${typeCfg.label}</div>
        <div class="card-year-badge">${item.year || '—'}</div>
      </div>
      <div class="card-body">
        <div class="card-country-row">
          <span class="card-flag">${flag}</span>
          <span>${item.country || '—'}</span>
          ${item.continent ? `<span class="text-muted" style="margin-left:auto;font-size:0.72rem">${item.continent}</span>` : ''}
        </div>
        <div class="card-title">${item.title}</div>
        <div class="card-themes">
          ${buildThemeBadges(item.theme || [])}
        </div>
      </div>
    `;

    // Load real image if path exists
    tryLoadRealImage(card.querySelector('.card-img'), item.image, placeholder);

    // Click → lightbox
    card.addEventListener('click', () => PVC.openLightbox(item));

    return card;
  }

  // ── Try loading the real image, fallback to placeholder ─────
  function tryLoadRealImage(imgEl, src, placeholder) {
    if (!src) return;
    const testImg = new Image();
    testImg.onload = () => { imgEl.src = src; };
    testImg.onerror = () => { imgEl.src = placeholder; };
    testImg.src = src;
  }

  // ── Build theme badge HTML ───────────────────────────────────
  function buildThemeBadges(themes) {
    if (!themes || themes.length === 0) return '';
    return themes.map(t => {
      const cfg = PVC.THEME_CONFIG[t];
      if (!cfg) return '';
      return `<span class="badge ${cfg.cls}">${cfg.label}</span>`;
    }).join('');
  }

  // ── Update results count text ────────────────────────────────
  function updateResultsCount(filtered, total) {
    const el = document.getElementById('results-count');
    if (!el) return;
    if (filtered === total) {
      el.innerHTML = `Showing <strong>${total}</strong> items`;
    } else {
      el.innerHTML = `Showing <strong>${filtered}</strong> of <strong>${total}</strong> items`;
    }
  }

  // ── Update global stats bar ─────────────────────────────────
  function updateGlobalStats(items) {
    const coins     = items.filter(i => i.type === 'coin').length;
    const notes     = items.filter(i => i.type === 'currency').length;
    const countries = new Set(items.map(i => i.country).filter(Boolean)).size;

    PVC.animateCount(document.getElementById('stat-total'),     items.length,   800);
    PVC.animateCount(document.getElementById('stat-coins'),     coins,          800);
    PVC.animateCount(document.getElementById('stat-notes'),     notes,          800);
    PVC.animateCount(document.getElementById('stat-countries'), countries,      800);
  }

  // ── Skeleton loading cards ───────────────────────────────────
  function showSkeletons(count) {
    const grid = document.getElementById('gallery-grid');
    if (!grid) return;
    grid.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const isCoin = i % 3 !== 2; // mix of ratios
      grid.innerHTML += `
        <div class="skeleton-card">
          <div class="skeleton skeleton-img${isCoin ? '' : ' currency-ratio'}"></div>
          <div class="skeleton-body">
            <div class="skeleton skeleton-line short"></div>
            <div class="skeleton skeleton-line long"></div>
            <div class="skeleton skeleton-line medium"></div>
          </div>
        </div>
      `;
    }
  }

  // ── Expose refresh for external calls ───────────────────────
  PVC._buildThemeBadges = buildThemeBadges;

})(window.PVCollection);
