/* ============================================================
   PV Collection — lightbox.js
   Full-screen item viewer with keyboard & touch support
   ============================================================ */

(function(PVC) {
  'use strict';

  let _currentItem = null;

  // ── Open lightbox with an item ──────────────────────────────
  PVC.openLightbox = function(item) {
    _currentItem = item;

    const lb = document.getElementById('lightbox');
    if (!lb) return;

    // Populate content
    populateLightbox(item);

    // Show
    lb.classList.add('open');
    document.body.style.overflow = 'hidden';

    // Focus for keyboard nav
    lb.setAttribute('tabindex', '-1');
    lb.focus();
  };

  // ── Close lightbox ──────────────────────────────────────────
  PVC.closeLightbox = function() {
    const lb = document.getElementById('lightbox');
    if (!lb) return;
    lb.classList.remove('open');
    document.body.style.overflow = '';
    _currentItem = null;
  };

  // ── Populate all lightbox fields ────────────────────────────
  function populateLightbox(item) {
    const dtype    = PVC.getDisplayType(item);
    const typeCfg  = PVC.TYPE_CONFIG[dtype];
    const flag     = PVC.getFlag(item.country);
    const placeholder = PVC.getPlaceholderSVG(item);

    // Image
    const imgEl = document.getElementById('lb-img');
    if (imgEl) {
      imgEl.alt = item.title;
      // Try real image first
      if (item.image) {
        const test = new Image();
        test.onload  = () => { imgEl.src = item.image; imgEl.classList.remove('hidden'); };
        test.onerror = () => { imgEl.src = placeholder; imgEl.classList.remove('hidden'); };
        test.src = item.image;
      } else {
        imgEl.src = placeholder;
        imgEl.classList.remove('hidden');
      }
    }

    // Hide image nav (single image per item for now)
    const nav = document.getElementById('lb-counter');
    if (nav) nav.textContent = '';
    const prevBtn = document.getElementById('lb-prev');
    const nextBtn = document.getElementById('lb-next');
    if (prevBtn) prevBtn.style.display = 'none';
    if (nextBtn) nextBtn.style.display = 'none';

    // Badges
    const badgesEl = document.getElementById('lb-badges');
    if (badgesEl) {
      const themeBadges = (item.theme || []).map(t => {
        const cfg = PVC.THEME_CONFIG[t];
        return cfg ? `<span class="badge ${cfg.cls}">${cfg.label}</span>` : '';
      }).join('');
      badgesEl.innerHTML = `
        <span class="badge ${typeCfg.cls}">${typeCfg.label}</span>
        ${themeBadges}
      `;
    }

    // Title
    const titleEl = document.getElementById('lb-title');
    if (titleEl) titleEl.textContent = item.title;

    // Meta grid
    const metaEl = document.getElementById('lb-meta');
    if (metaEl) {
      metaEl.innerHTML = `
        <div class="lb-meta-item">
          <span class="lb-meta-item__label">Country</span>
          <span class="lb-meta-item__value">${flag} ${item.country || '—'}</span>
        </div>
        <div class="lb-meta-item">
          <span class="lb-meta-item__label">Year</span>
          <span class="lb-meta-item__value">${item.year || '—'}</span>
        </div>
        <div class="lb-meta-item">
          <span class="lb-meta-item__label">Continent</span>
          <span class="lb-meta-item__value">${item.continent || '—'}</span>
        </div>
        <div class="lb-meta-item">
          <span class="lb-meta-item__label">Denomination</span>
          <span class="lb-meta-item__value">${item.denomination || '—'}</span>
        </div>
        ${item.material ? `
        <div class="lb-meta-item">
          <span class="lb-meta-item__label">Material</span>
          <span class="lb-meta-item__value">${item.material}</span>
        </div>` : ''}
        <div class="lb-meta-item">
          <span class="lb-meta-item__label">Added</span>
          <span class="lb-meta-item__value">${formatDate(item.addedOn)}</span>
        </div>
      `;
    }

    // Description
    const descEl = document.getElementById('lb-description');
    if (descEl) {
      descEl.textContent = item.description || '';
      descEl.style.display = item.description ? '' : 'none';
    }

    // Tags
    const tagsEl = document.getElementById('lb-tags');
    if (tagsEl) {
      tagsEl.innerHTML = (item.tags || [])
        .map(t => `<span class="tag-chip">#${t}</span>`)
        .join('');
    }
  }

  // ── Bind lightbox events ────────────────────────────────────
  function bindEvents() {
    // Close button
    const closeBtn = document.getElementById('lb-close');
    if (closeBtn) closeBtn.addEventListener('click', PVC.closeLightbox);

    // Backdrop click
    const backdrop = document.getElementById('lb-backdrop');
    if (backdrop) backdrop.addEventListener('click', PVC.closeLightbox);

    // Keyboard
    document.addEventListener('keydown', e => {
      const lb = document.getElementById('lightbox');
      if (!lb || !lb.classList.contains('open')) return;
      if (e.key === 'Escape') PVC.closeLightbox();
    });

    // Touch swipe to close (swipe down)
    let touchStartY = 0;
    const lb = document.getElementById('lightbox');
    if (lb) {
      lb.addEventListener('touchstart', e => {
        touchStartY = e.touches[0].clientY;
      }, { passive: true });

      lb.addEventListener('touchend', e => {
        const dy = e.changedTouches[0].clientY - touchStartY;
        if (dy > 80) PVC.closeLightbox(); // swipe down 80px → close
      }, { passive: true });
    }
  }

  // ── Helpers ─────────────────────────────────────────────────
  function formatDate(dateStr) {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric'
      });
    } catch { return dateStr; }
  }

  // ── Init on DOM ready ────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', bindEvents);

})(window.PVCollection);
