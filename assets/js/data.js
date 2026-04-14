/* ============================================================
   PV Collection — data.js
   Loads & caches collection.json, exposes utility helpers
   ============================================================ */

window.PVCollection = window.PVCollection || {};

(function(PVC) {
  'use strict';

  // ── Internal state ──────────────────────────────────────────
  let _cache = null;

  // ── Load collection.json ────────────────────────────────────
  PVC.loadData = async function() {
    if (_cache) return _cache;

    try {
      const resp = await fetch('data/collection.json');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      _cache = json;
      return json;
    } catch (err) {
      console.error('[PV-Collection] Failed to load collection.json:', err);
      // Return empty structure so the app doesn't crash
      return { meta: {}, items: [] };
    }
  };

  // ── Get all items ───────────────────────────────────────────
  PVC.getItems = function() {
    return _cache ? _cache.items || [] : [];
  };

  // ── Get unique values for a field ───────────────────────────
  PVC.getUniqueValues = function(field) {
    return [...new Set(PVC.getItems().map(i => i[field]).filter(Boolean))].sort();
  };

  // ── Get country → continent map ─────────────────────────────
  PVC.getCountryMap = function() {
    const map = {};
    PVC.getItems().forEach(item => {
      if (item.country && item.continent) {
        map[item.country] = item.continent;
      }
    });
    return map;
  };

  // ── Country flag emoji by country name ─────────────────────
  const COUNTRY_FLAGS = {
    'India':          '🇮🇳',
    'Australia':      '🇦🇺',
    'New Zealand':    '🇳🇿',
    'USA':            '🇺🇸',
    'United Kingdom': '🇬🇧',
    'UK':             '🇬🇧',
    'South Africa':   '🇿🇦',
    'Japan':          '🇯🇵',
    'Brazil':         '🇧🇷',
    'Canada':         '🇨🇦',
    'Germany':        '🇩🇪',
    'France':         '🇫🇷',
    'China':          '🇨🇳',
    'Mexico':         '🇲🇽',
    'Argentina':      '🇦🇷',
    'Russia':         '🇷🇺',
    'Italy':          '🇮🇹',
    'Spain':          '🇪🇸',
    'Netherlands':    '🇳🇱',
    'Sweden':         '🇸🇪',
    'Norway':         '🇳🇴',
    'Switzerland':    '🇨🇭',
    'Portugal':       '🇵🇹',
    'Greece':         '🇬🇷',
    'Egypt':          '🇪🇬',
    'Kenya':          '🇰🇪',
    'Nigeria':        '🇳🇬',
    'Ghana':          '🇬🇭',
    'Ethiopia':       '🇪🇹',
    'Sri Lanka':      '🇱🇰',
    'Pakistan':       '🇵🇰',
    'Bangladesh':     '🇧🇩',
    'Nepal':          '🇳🇵',
    'Thailand':       '🇹🇭',
    'Malaysia':       '🇲🇾',
    'Singapore':      '🇸🇬',
    'Indonesia':      '🇮🇩',
    'Philippines':    '🇵🇭',
    'Vietnam':        '🇻🇳',
    'South Korea':    '🇰🇷',
    'Maldives':       '🇲🇻',
    'Myanmar':        '🇲🇲',
    'Bhutan':         '🇧🇹',
  };

  PVC.getFlag = function(country) {
    return COUNTRY_FLAGS[country] || '🌐';
  };

  // ── Badge config for types and themes ───────────────────────
  PVC.TYPE_CONFIG = {
    'coin':    { label: '🪙 Coin',    cls: 'badge--coin',    icon: '🪙' },
    'paper':   { label: '📄 Paper',   cls: 'badge--paper',   icon: '📄' },
    'polymer': { label: '🧪 Polymer', cls: 'badge--polymer', icon: '🧪' },
  };

  PVC.THEME_CONFIG = {
    'animal-theme':    { label: '🦁 Animal',    cls: 'badge--animal'    },
    'bird-theme':      { label: '🦅 Bird',      cls: 'badge--bird'      },
    'aquatic-theme':   { label: '🐠 Aquatic',   cls: 'badge--aquatic'   },
    'building-theme':  { label: '🏛️ Buildings', cls: 'badge--building'  },
    'nature-theme':    { label: '🌿 Nature',    cls: 'badge--nature'    },
    'sports-theme':    { label: '🏅 Sports',    cls: 'badge--sports'    },
    'person-theme':    { label: '👤 Person',    cls: 'badge--person'    },
    'history-theme':   { label: '📜 History',   cls: 'badge--history'   },
    'space-theme':     { label: '🚀 Space',     cls: 'badge--space'     },
    'transport-theme': { label: '🚆 Transport', cls: 'badge--transport' },
    'art-theme':       { label: '🎨 Art',       cls: 'badge--art'       },
    'flora-theme':     { label: '🌻 Flora',     cls: 'badge--flora'     },
    'science-theme':   { label: '🧬 Science',   cls: 'badge--science'   },
  };

  // ── Resolve item subtype to a display type key ──────────────
  PVC.getDisplayType = function(item) {
    if (item.type === 'coin') return 'coin';
    if (item.subtype === 'polymer') return 'polymer';
    return 'paper';
  };

  // ── Generate a placeholder SVG (coin or note) ───────────────
  PVC.getPlaceholderSVG = function(item) {
    const dtype = PVC.getDisplayType(item);
    const denom = item.denomination || item.title || '';

    if (dtype === 'coin') {
      // Golden coin SVG
      const svgStr = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="cg_${item.id}" cx="38%" cy="35%" r="65%">
            <stop offset="0%" stop-color="#f5c842"/>
            <stop offset="60%" stop-color="#c89020"/>
            <stop offset="100%" stop-color="#7a5010"/>
          </radialGradient>
          <radialGradient id="cg2_${item.id}" cx="38%" cy="30%" r="65%">
            <stop offset="0%" stop-color="#ffe080"/>
            <stop offset="100%" stop-color="#a07018"/>
          </radialGradient>
        </defs>
        <circle cx="100" cy="100" r="98" fill="#5a3800"/>
        <circle cx="100" cy="100" r="90" fill="url(#cg_${item.id})"/>
        <circle cx="100" cy="100" r="72" fill="none" stroke="#f5c842" stroke-width="2" stroke-dasharray="4 2"/>
        <circle cx="100" cy="100" r="64" fill="url(#cg2_${item.id})" opacity="0.3"/>
        <text x="100" y="110" text-anchor="middle" fill="#5a3200" font-size="22"
              font-family="Georgia,serif" font-weight="bold">${denom.slice(0,12)}</text>
        <text x="100" y="140" text-anchor="middle" fill="#8b5e20" font-size="13"
              font-family="Georgia,serif">${item.country || ''}</text>
      </svg>`;
      return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgStr)));

    } else if (dtype === 'polymer') {
      // Blue polymer note
      const svgStr = `<svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="ng_${item.id}" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#1a3a6a"/>
            <stop offset="100%" stop-color="#0d1f40"/>
          </linearGradient>
        </defs>
        <rect width="320" height="180" rx="10" fill="url(#ng_${item.id})"/>
        <rect x="8" y="8" width="304" height="164" rx="8" fill="none" stroke="#3060a8" stroke-width="1.5"/>
        <rect x="265" y="0" width="55" height="180" fill="rgba(100,180,255,0.08)" rx="0 10 10 0"/>
        <text x="160" y="95" text-anchor="middle" fill="#6098e0" font-size="28"
              font-family="Georgia,serif" font-weight="bold">${denom.slice(0,14)}</text>
        <text x="160" y="125" text-anchor="middle" fill="#3a5888" font-size="14"
              font-family="Georgia,serif">${item.country || ''}</text>
        <text x="160" y="55" text-anchor="middle" fill="#2a4870" font-size="11"
              font-family="auto">${item.year || ''}</text>
      </svg>`;
      return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgStr)));

    } else {
      // Green/cream paper note
      const svgStr = `<svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="ng_${item.id}" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#1a3a28"/>
            <stop offset="100%" stop-color="#0d2018"/>
          </linearGradient>
        </defs>
        <rect width="320" height="180" rx="10" fill="url(#ng_${item.id})"/>
        <rect x="8" y="8" width="304" height="164" rx="8" fill="none" stroke="#286840" stroke-width="1.5"/>
        <circle cx="50" cy="90" r="32" fill="none" stroke="#1a5030" stroke-width="8"/>
        <text x="160" y="95" text-anchor="middle" fill="#40a060" font-size="28"
              font-family="Georgia,serif" font-weight="bold">${denom.slice(0,14)}</text>
        <text x="160" y="125" text-anchor="middle" fill="#285a38" font-size="14"
              font-family="Georgia,serif">${item.country || ''}</text>
        <text x="160" y="55" text-anchor="middle" fill="#1e4028" font-size="11"
              font-family="auto">${item.year || ''}</text>
      </svg>`;
      return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgStr)));
    }
  };

  // ── Animated stats counter ─────────────────────────────────
  PVC.animateCount = function(el, target, duration) {
    if (!el) return;
    const start = 0;
    const startTime = performance.now();

    function step(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.floor(start + (target - start) * eased);
      if (progress < 1) requestAnimationFrame(step);
      else el.textContent = target;
    }
    requestAnimationFrame(step);
  };

})(window.PVCollection);
