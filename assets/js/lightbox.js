/* ============================================================
   PV Collection — lightbox.js
   Full-screen item viewer with multi-image support, keyboard
   & touch navigation, and hover magnifier lens.
   ============================================================ */

(function(PVC) {
  'use strict';

  let _currentItem = null;
  let _images      = [];   // [{url,label}] — resolved by PVC.getItemImages
  let _imgIndex    = 0;
  let _placeholder = '';
  let _magnifierOn = false;

  // ── Open lightbox with an item ──────────────────────────────
  PVC.openLightbox = function(item) {
    _currentItem = item;
    _placeholder = PVC.getPlaceholderSVG(item);
    _imgIndex    = 0;

    // Start with just the primary image so the lightbox renders
    // instantly, even if we still need to probe for back/extras.
    const candidates = PVC.getItemImages(item);
    _images = candidates.length
      ? [{ url: candidates[0].url, label: candidates[0].label }]
      : [];

    const lb = document.getElementById('lightbox');
    if (!lb) return;

    populateLightbox(item);

    lb.classList.add('open');
    document.body.style.overflow = 'hidden';
    lb.setAttribute('tabindex', '-1');
    lb.focus();

    // Async: probe for _back / _3 / _4 variants, and if any exist
    // re-render the main image + thumb strip to reveal them.
    PVC.resolveImages(candidates).then(resolved => {
      if (_currentItem !== item) return; // lightbox re-opened / closed
      if (resolved.length <= _images.length) return;
      _images = resolved;
      renderMainImage();
      renderThumbnailStrip();
    });
  };

  // ── Close lightbox ──────────────────────────────────────────
  PVC.closeLightbox = function() {
    const lb = document.getElementById('lightbox');
    if (!lb) return;
    lb.classList.remove('open');
    document.body.style.overflow = '';
    hideMagnifier();
    _currentItem = null;
  };

  // ── Populate all lightbox fields ────────────────────────────
  function populateLightbox(item) {
    const dtype    = PVC.getDisplayType(item);
    const typeCfg  = PVC.TYPE_CONFIG[dtype];
    const flag     = PVC.getFlag(item.country);

    renderMainImage();
    renderThumbnailStrip();

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

    const titleEl = document.getElementById('lb-title');
    if (titleEl) titleEl.textContent = item.title;

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

    const descEl = document.getElementById('lb-description');
    if (descEl) {
      descEl.textContent = item.description || '';
      descEl.style.display = item.description ? '' : 'none';
    }

    const tagsEl = document.getElementById('lb-tags');
    if (tagsEl) {
      tagsEl.innerHTML = (item.tags || [])
        .map(t => `<span class="tag-chip">#${t}</span>`)
        .join('');
    }
  }

  // ── Render the currently-selected main image ────────────────
  function renderMainImage() {
    const imgEl    = document.getElementById('lb-img');
    const counter  = document.getElementById('lb-counter');
    const prevBtn  = document.getElementById('lb-prev');
    const nextBtn  = document.getElementById('lb-next');

    if (!imgEl) return;

    const current = _images[_imgIndex];
    const src = current ? current.url : _placeholder;
    const label = current ? current.label : '';

    imgEl.alt = _currentItem.title + (label ? ` — ${label}` : '');

    if (current && current.url) {
      // Resolve via IndexedDB first (uploaded-but-not-committed images),
      // then probe with a temporary <img> and fall back to placeholder
      // on error.
      const resolve = PVC.resolveImageSrc ? PVC.resolveImageSrc(current.url) : Promise.resolve(current.url);
      resolve.then(realSrc => {
        const probe = new Image();
        probe.onload  = () => { imgEl.src = realSrc; };
        probe.onerror = () => { imgEl.src = _placeholder; };
        probe.src = realSrc;
      });
    } else {
      imgEl.src = _placeholder;
    }

    imgEl.classList.remove('hidden');

    // Multi-image navigation visibility
    const multi = _images.length > 1;
    if (prevBtn) {
      prevBtn.style.display = multi ? '' : 'none';
      prevBtn.disabled = _imgIndex <= 0;
    }
    if (nextBtn) {
      nextBtn.style.display = multi ? '' : 'none';
      nextBtn.disabled = _imgIndex >= _images.length - 1;
    }
    if (counter) {
      counter.textContent = multi
        ? `${_imgIndex + 1} / ${_images.length}${label ? ' · ' + label : ''}`
        : (label || '');
    }

    // Reset the magnifier so it re-binds against the new src
    hideMagnifier();
  }

  // ── Thumbnail strip (front / back / extras) ─────────────────
  function renderThumbnailStrip() {
    const strip = document.getElementById('lb-thumbs');
    if (!strip) return;

    if (_images.length <= 1) {
      strip.innerHTML = '';
      strip.style.display = 'none';
      return;
    }

    strip.style.display = '';
    strip.innerHTML = _images.map((img, i) => `
      <button class="lb-thumb${i === _imgIndex ? ' active' : ''}"
              data-idx="${i}"
              aria-label="Show ${img.label}"
              title="${img.label}">
        <img data-path="${img.url}" alt="${img.label}"
             onerror="this.style.opacity='0.25'">
        <span class="lb-thumb__label">${img.label}</span>
      </button>
    `).join('');

    // Resolve thumbnail images through IndexedDB (uploaded-not-committed)
    strip.querySelectorAll('.lb-thumb img[data-path]').forEach(img => {
      const path = img.getAttribute('data-path');
      const resolve = PVC.resolveImageSrc ? PVC.resolveImageSrc(path) : Promise.resolve(path);
      resolve.then(realSrc => { img.src = realSrc; });
    });

    strip.querySelectorAll('.lb-thumb').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = parseInt(btn.dataset.idx, 10);
        if (!isNaN(i)) {
          _imgIndex = i;
          renderMainImage();
          strip.querySelectorAll('.lb-thumb').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        }
      });
    });
  }

  // ── Navigate between images ─────────────────────────────────
  function showPrev() {
    if (_imgIndex > 0) { _imgIndex--; renderMainImage(); renderThumbnailStrip(); }
  }
  function showNext() {
    if (_imgIndex < _images.length - 1) { _imgIndex++; renderMainImage(); renderThumbnailStrip(); }
  }

  // ── Magnifier lens ──────────────────────────────────────────
  // Zoom factor (2.5x). A circular lens follows the cursor and
  // shows the image at higher resolution at that point.
  const ZOOM = 2.5;

  function updateLens(e) {
    const img  = document.getElementById('lb-img');
    const lens = document.getElementById('lb-lens');
    if (!img || !lens || !_magnifierOn) return;

    const rect = img.getBoundingClientRect();

    // Read pointer coords (mouse or touch)
    const pt = (e.touches && e.touches[0]) || e;
    const x  = pt.clientX - rect.left;
    const y  = pt.clientY - rect.top;

    // Hide if pointer outside image bounds
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
      lens.style.display = 'none';
      return;
    }
    lens.style.display = 'block';

    const lensW = lens.offsetWidth;
    const lensH = lens.offsetHeight;

    // Position lens relative to the image panel
    const panelRect = lens.offsetParent.getBoundingClientRect();
    lens.style.left = (rect.left - panelRect.left + x - lensW / 2) + 'px';
    lens.style.top  = (rect.top  - panelRect.top  + y - lensH / 2) + 'px';

    lens.style.backgroundImage    = `url("${img.currentSrc || img.src}")`;
    lens.style.backgroundSize     = `${rect.width * ZOOM}px ${rect.height * ZOOM}px`;
    lens.style.backgroundPosition = `-${x * ZOOM - lensW / 2}px -${y * ZOOM - lensH / 2}px`;
  }

  function hideMagnifier() {
    const lens = document.getElementById('lb-lens');
    if (lens) lens.style.display = 'none';
  }

  function bindMagnifier() {
    const img  = document.getElementById('lb-img');
    const lens = document.getElementById('lb-lens');
    if (!img || !lens) return;

    img.addEventListener('mouseenter', () => { _magnifierOn = true; });
    img.addEventListener('mouseleave', () => { _magnifierOn = false; hideMagnifier(); });
    img.addEventListener('mousemove',  updateLens);

    // Touch: tap-and-hold to magnify
    img.addEventListener('touchstart', e => {
      _magnifierOn = true;
      updateLens(e);
    }, { passive: true });
    img.addEventListener('touchmove',  e => { updateLens(e); }, { passive: true });
    img.addEventListener('touchend',   () => { _magnifierOn = false; hideMagnifier(); });
  }

  // ── Bind lightbox events ────────────────────────────────────
  function bindEvents() {
    document.getElementById('lb-close')?.addEventListener('click', PVC.closeLightbox);
    document.getElementById('lb-backdrop')?.addEventListener('click', PVC.closeLightbox);
    document.getElementById('lb-prev')?.addEventListener('click', e => { e.stopPropagation(); showPrev(); });
    document.getElementById('lb-next')?.addEventListener('click', e => { e.stopPropagation(); showNext(); });

    document.addEventListener('keydown', e => {
      const lb = document.getElementById('lightbox');
      if (!lb || !lb.classList.contains('open')) return;
      if (e.key === 'Escape')      PVC.closeLightbox();
      else if (e.key === 'ArrowLeft')  showPrev();
      else if (e.key === 'ArrowRight') showNext();
    });

    // Swipe: horizontal for image nav, vertical-down to close
    let touchStartX = 0, touchStartY = 0;
    const lb = document.getElementById('lightbox');
    if (lb) {
      lb.addEventListener('touchstart', e => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      }, { passive: true });

      lb.addEventListener('touchend', e => {
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;
        if (Math.abs(dx) > Math.abs(dy)) {
          if (dx >  60) showPrev();
          if (dx < -60) showNext();
        } else if (dy > 80) {
          PVC.closeLightbox();
        }
      }, { passive: true });
    }

    bindMagnifier();
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
