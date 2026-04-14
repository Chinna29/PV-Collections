/* ============================================================
   PV Collection — filters.js
   Filter state management and application logic
   ============================================================ */

(function(PVC) {
  'use strict';

  // ── Filter State ────────────────────────────────────────────
  PVC.filterState = {
    tab:        'all',    // 'all' | 'coin' | 'currency'
    types:      [],       // ['coin','paper','polymer']
    themes:     [],       // ['animal-theme','bird-theme','aquatic-theme', etc.]
    continents: [],       // e.g. ['Asia']
    countries:  [],       // e.g. ['India']
    search:     '',
    sort:       'default',
  };

  // ── Apply all filters to items array ───────────────────────
  PVC.applyFilters = function(items) {
    const s = PVC.filterState;
    let result = [...items];

    // 1. Tab filter
    if (s.tab === 'coin') {
      result = result.filter(i => i.type === 'coin');
    } else if (s.tab === 'currency') {
      result = result.filter(i => i.type === 'currency');
    }

    // 2. Type checkboxes (coin / paper / polymer)
    if (s.types.length > 0) {
      result = result.filter(i => {
        const dtype = PVC.getDisplayType(i);
        return s.types.includes(dtype);
      });
    }

    // 3. Theme checkboxes
    if (s.themes.length > 0) {
      result = result.filter(i =>
        s.themes.some(t => i.theme && i.theme.includes(t))
      );
    }

    // 4. Continent filter
    if (s.continents.length > 0) {
      result = result.filter(i => s.continents.includes(i.continent));
    }

    // 5. Country filter
    if (s.countries.length > 0) {
      result = result.filter(i => s.countries.includes(i.country));
    }

    // 6. Text search
    if (s.search.trim()) {
      const q = s.search.trim().toLowerCase();
      result = result.filter(i =>
        (i.title       || '').toLowerCase().includes(q) ||
        (i.country     || '').toLowerCase().includes(q) ||
        (i.continent   || '').toLowerCase().includes(q) ||
        (i.description || '').toLowerCase().includes(q) ||
        (i.denomination|| '').toLowerCase().includes(q) ||
        (i.material    || '').toLowerCase().includes(q) ||
        (i.tags        || []).some(t => t.toLowerCase().includes(q))
      );
    }

    // 7. Sort
    if (s.sort === 'year-asc') {
      result.sort((a, b) => (a.year || 0) - (b.year || 0));
    } else if (s.sort === 'year-desc') {
      result.sort((a, b) => (b.year || 0) - (a.year || 0));
    } else if (s.sort === 'country') {
      result.sort((a, b) => (a.country || '').localeCompare(b.country || ''));
    } else if (s.sort === 'title') {
      result.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    }

    return result;
  };

  // ── Bind filter UI events ───────────────────────────────────
  PVC.bindFilters = function() {
    // Tab switcher
    document.querySelectorAll('.type-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.type-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        PVC.filterState.tab = btn.dataset.type;
        PVC.refreshGallery();
      });
    });

    // Search input
    const searchInput = document.getElementById('filter-search');
    if (searchInput) {
      searchInput.addEventListener('input', debounce(() => {
        PVC.filterState.search = searchInput.value;
        PVC.refreshGallery();
      }, 280));
    }

    // Type checkboxes
    document.querySelectorAll('.filter-cb-type').forEach(cb => {
      cb.addEventListener('change', () => {
        PVC.filterState.types = getCheckedValues('.filter-cb-type');
        PVC.refreshGallery();
        updateActiveChips();
      });
    });

    // Theme checkboxes
    document.querySelectorAll('.filter-cb-theme').forEach(cb => {
      cb.addEventListener('change', () => {
        PVC.filterState.themes = getCheckedValues('.filter-cb-theme');
        PVC.refreshGallery();
        updateActiveChips();
      });
    });

    // Sort select
    const sortSel = document.getElementById('sort-select');
    if (sortSel) {
      sortSel.addEventListener('change', () => {
        PVC.filterState.sort = sortSel.value;
        PVC.refreshGallery();
      });
    }

    // Clear all button
    const btnClear = document.getElementById('btn-clear-filters');
    if (btnClear) {
      btnClear.addEventListener('click', () => PVC.clearFilters());
    }

    // Collapsible filter groups
    document.querySelectorAll('.filter-group__header').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.target;
        const body = document.getElementById(targetId);
        if (!body) return;
        const isExpanded = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', String(!isExpanded));
        body.classList.toggle('collapsed', isExpanded);
      });
    });

    // Mobile filter FAB
    const fab = document.getElementById('filter-fab');
    const sidebar = document.getElementById('filter-sidebar');
    const overlay = document.getElementById('filter-overlay');

    if (fab && sidebar && overlay) {
      fab.addEventListener('click', () => toggleMobileSidebar(true));
      overlay.addEventListener('click', () => toggleMobileSidebar(false));
    }

    // Mobile menu
    const menuBtn = document.getElementById('mobile-menu-btn');
    const nav = document.getElementById('site-nav');
    if (menuBtn && nav) {
      menuBtn.addEventListener('click', () => {
        nav.classList.toggle('open');
      });
    }

    // Theme toggle
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
      const saved = localStorage.getItem('pvc-theme') || 'dark';
      document.documentElement.setAttribute('data-theme', saved);
      themeToggle.querySelector('.theme-toggle__icon').textContent =
        saved === 'dark' ? '🌙' : '☀️';

      themeToggle.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'dark';
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('pvc-theme', next);
        themeToggle.querySelector('.theme-toggle__icon').textContent =
          next === 'dark' ? '🌙' : '☀️';
      });
    }
  };

  // ── Populate dynamic filter options (continents, countries) ─
  PVC.populateDynamicFilters = function(items) {
    // Continents
    const continentSet = [...new Set(items.map(i => i.continent).filter(Boolean))].sort();
    const contEl = document.getElementById('continent-options');
    if (contEl) {
      contEl.innerHTML = '';
      continentSet.forEach(cont => {
        const label = document.createElement('label');
        label.className = 'filter-checkbox';
        label.innerHTML = `
          <input type="checkbox" value="${cont}" class="filter-cb-continent">
          <span class="filter-checkbox__mark"></span>
          ${getIconForContinent(cont)} ${cont}
        `;
        contEl.appendChild(label);
        label.querySelector('input').addEventListener('change', () => {
          PVC.filterState.continents = getCheckedValues('.filter-cb-continent');
          PVC.refreshGallery();
          updateActiveChips();
        });
      });
    }

    // Countries
    const countrySet = [...new Set(items.map(i => i.country).filter(Boolean))].sort();
    renderCountryOptions(countrySet);

    // Country search
    const cSearch = document.getElementById('country-search');
    if (cSearch) {
      cSearch.addEventListener('input', debounce(() => {
        const q = cSearch.value.toLowerCase();
        const filtered = q ? countrySet.filter(c => c.toLowerCase().includes(q)) : countrySet;
        renderCountryOptions(filtered);
      }, 250));
    }
  };

  function renderCountryOptions(countries) {
    const el = document.getElementById('country-options');
    if (!el) return;
    el.innerHTML = '';
    countries.forEach(country => {
      const label = document.createElement('label');
      label.className = 'filter-checkbox';
      const isChecked = PVC.filterState.countries.includes(country);
      label.innerHTML = `
        <input type="checkbox" value="${country}" class="filter-cb-country"
               ${isChecked ? 'checked' : ''}>
        <span class="filter-checkbox__mark"></span>
        ${PVC.getFlag(country)} ${country}
      `;
      el.appendChild(label);
      label.querySelector('input').addEventListener('change', () => {
        PVC.filterState.countries = getCheckedValues('.filter-cb-country');
        PVC.refreshGallery();
        updateActiveChips();
      });
    });
  }

  // ── Active filter chips ─────────────────────────────────────
  function updateActiveChips() {
    const container = document.getElementById('active-filters');
    const btnClear  = document.getElementById('btn-clear-filters');
    if (!container) return;

    container.innerHTML = '';

    const chips = [
      ...PVC.filterState.types.map(v => ({ label: TYPE_LABELS[v] || v, key: 'types', value: v })),
      ...PVC.filterState.themes.map(v => ({ label: THEME_LABELS[v] || v, key: 'themes', value: v })),
      ...PVC.filterState.continents.map(v => ({ label: v, key: 'continents', value: v })),
      ...PVC.filterState.countries.map(v => ({ label: `${PVC.getFlag(v)} ${v}`, key: 'countries', value: v })),
    ];

    chips.forEach(chip => {
      const el = document.createElement('div');
      el.className = 'active-filter-chip';
      el.innerHTML = `
        <span>${chip.label}</span>
        <span class="active-filter-chip__remove" title="Remove">✕</span>
      `;
      el.querySelector('.active-filter-chip__remove').addEventListener('click', () => {
        PVC.filterState[chip.key] = PVC.filterState[chip.key].filter(v => v !== chip.value);
        // Uncheck the actual checkbox
        document.querySelectorAll(`.filter-cb-${chip.key.replace(/s$/, '')}`).forEach(cb => {
          if (cb.value === chip.value) cb.checked = false;
        });
        // Also handle continent/country specific classes
        document.querySelectorAll(`.filter-cb-continent, .filter-cb-country`).forEach(cb => {
          if (cb.value === chip.value) cb.checked = false;
        });
        PVC.refreshGallery();
        updateActiveChips();
      });
      container.appendChild(el);
    });

    // Update filter badge count on FAB
    const badge = document.getElementById('filter-badge');
    if (badge) {
      const count = chips.length;
      badge.textContent = count;
      badge.classList.toggle('hidden', count === 0);
    }

    // Show/hide clear button
    if (btnClear) {
      btnClear.classList.toggle('active', chips.length > 0);
    }
  }

  // ── Clear all filters ───────────────────────────────────────
  PVC.clearFilters = function() {
    PVC.filterState.types      = [];
    PVC.filterState.themes     = [];
    PVC.filterState.continents = [];
    PVC.filterState.countries  = [];
    PVC.filterState.search     = '';

    document.querySelectorAll(
      '.filter-cb-type, .filter-cb-theme, .filter-cb-continent, .filter-cb-country'
    ).forEach(cb => cb.checked = false);

    const si = document.getElementById('filter-search');
    if (si) si.value = '';

    PVC.refreshGallery();
    updateActiveChips();
  };

  // ── Mobile sidebar ──────────────────────────────────────────
  function toggleMobileSidebar(open) {
    const sidebar = document.getElementById('filter-sidebar');
    const overlay = document.getElementById('filter-overlay');
    sidebar && sidebar.classList.toggle('sidebar-open', open);
    overlay && overlay.classList.toggle('active', open);
  }

  // ── Helpers ─────────────────────────────────────────────────
  function getCheckedValues(selector) {
    return [...document.querySelectorAll(selector)]
      .filter(cb => cb.checked)
      .map(cb => cb.value);
  }

  function debounce(fn, delay) {
    let timer;
    return function(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function getIconForContinent(c) {
    const map = {
      'Africa':        '🌍',
      'Asia':          '🌏',
      'Europe':        '🌍',
      'North America': '🌎',
      'South America': '🌎',
      'Oceania':       '🌏',
      'Antarctica':    '🧊',
    };
    return map[c] || '🌐';
  }

  const TYPE_LABELS = {
    coin: '🪙 Coin', paper: '📄 Paper', polymer: '🧪 Polymer'
  };
  const THEME_LABELS = {
    'animal-theme': '🦁 Animal',
    'bird-theme': '🦅 Bird',
    'aquatic-theme': '🐠 Aquatic',
    'building-theme': '🏛️ Buildings',
    'nature-theme': '🌿 Nature',
    'sports-theme': '🏅 Sports',
    'person-theme': '👤 Person',
    'history-theme': '📜 History',
    'space-theme': '🚀 Space',
    'transport-theme': '🚆 Transport',
    'art-theme': '🎨 Art',
    'flora-theme': '🌻 Flora',
    'science-theme': '🧬 Science'
  };

  // Expose for chip removal
  PVC._updateActiveChips = updateActiveChips;

})(window.PVCollection);
