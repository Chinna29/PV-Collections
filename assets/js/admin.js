/* ============================================================
   PV Collection — admin.js
   Auth (SHA-256), dashboard stats, upload form, JSON generator,
   collection table management
   ============================================================ */

(function() {
  'use strict';

  const PVC = window.PVCollection;

  // ── Session key ─────────────────────────────────────────────
  const SESSION_KEY  = 'pvc_admin_auth';
  const HASH_KEY     = 'pvc_admin_hash';

  // ── State ───────────────────────────────────────────────────
  let _collection  = [];   // loaded items
  let _editingId   = null; // id of item being edited
  let _tags        = [];   // current tag list in form
  let _imageFiles  = [];   // uploaded File objects
  let _adminSearch = '';   // search in table

  // ============================================================
  //  AUTHENTICATION
  // ============================================================

  /** SHA-256 of a string via Web Crypto API */
  async function sha256(str) {
    const buf  = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  /** Check if a password hash is stored */
  function hasStoredHash() {
    return !!localStorage.getItem(HASH_KEY);
  }

  /** Verify entered password against stored hash */
  async function verifyPassword(password) {
    const stored = localStorage.getItem(HASH_KEY);
    if (!stored) return false;
    const entered = await sha256(password);
    return entered === stored;
  }

  /** Store a new password hash */
  async function storePassword(password) {
    const hash = await sha256(password);
    localStorage.setItem(HASH_KEY, hash);
  }

  /** Check if current session is authenticated */
  function isAuthenticated() {
    return sessionStorage.getItem(SESSION_KEY) === '1';
  }

  /** Mark session as authenticated */
  function setAuthenticated() {
    sessionStorage.setItem(SESSION_KEY, '1');
  }

  /** Logout */
  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    location.reload();
  }

  // ── Boot: show auth gate or dashboard ───────────────────────
  async function boot() {
    applyTheme();

    if (isAuthenticated()) {
      showDashboard();
      return;
    }

    // Check if password has been set
    if (!hasStoredHash()) {
      showSetupForm();
    } else {
      showLoginForm();
    }

    bindAuthEvents();
  }

  function applyTheme() {
    const saved = localStorage.getItem('pvc-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
  }

  function showLoginForm() {
    const setupEl = document.getElementById('auth-setup');
    if (setupEl) setupEl.style.display = 'none';
  }

  function showSetupForm() {
    const setupEl = document.getElementById('auth-setup');
    if (setupEl) setupEl.style.display = 'block';
    const hint = document.getElementById('auth-error');
    if (hint) {
      hint.style.color = 'var(--gold)';
      hint.textContent = '👋 First time here! Set a password below to get started.';
    }
  }

  function bindAuthEvents() {
    // Login form
    const authForm = document.getElementById('auth-form');
    if (authForm) {
      authForm.addEventListener('submit', async e => {
        e.preventDefault();
        const pw    = document.getElementById('admin-password').value.trim();
        const errEl = document.getElementById('auth-error');

        if (!pw) {
          showError(errEl, 'Please enter your password.');
          return;
        }

        const ok = await verifyPassword(pw);
        if (ok) {
          setAuthenticated();
          showDashboard();
        } else {
          showError(errEl, '❌ Incorrect password. Please try again.');
          document.getElementById('admin-password').value = '';
        }
      });
    }

    // Setup form
    const setupForm = document.getElementById('setup-form');
    if (setupForm) {
      setupForm.addEventListener('submit', async e => {
        e.preventDefault();
        const pw1   = document.getElementById('setup-password').value.trim();
        const pw2   = document.getElementById('setup-confirm').value.trim();
        const errEl = document.getElementById('auth-error');

        if (!pw1 || pw1.length < 6) {
          showError(errEl, 'Password must be at least 6 characters.'); return;
        }
        if (pw1 !== pw2) {
          showError(errEl, 'Passwords do not match.'); return;
        }

        await storePassword(pw1);
        errEl.style.color = 'var(--green)';
        errEl.textContent = '✅ Password set! You can now log in.';
        document.getElementById('auth-setup').style.display = 'none';

        // Auto-login
        setAuthenticated();
        setTimeout(showDashboard, 800);
      });
    }

    // Back link (already in HTML as <a>)
  }

  function showError(el, msg) {
    if (!el) return;
    el.style.color = 'var(--red)';
    el.textContent = msg;
    el.style.animation = 'none';
    requestAnimationFrame(() => { el.style.animation = ''; });
  }

  // ============================================================
  //  DASHBOARD
  // ============================================================

  async function showDashboard() {
    const gate = document.getElementById('auth-gate');
    const app  = document.getElementById('admin-app');
    if (gate) gate.style.display = 'none';
    if (app)  app.classList.remove('hidden');

    const data   = await PVC.loadData();
    _collection  = data.items || [];

    renderAdminStats();
    renderCollectionTable(_collection);
    bindDashboardEvents();
    populateCountryDatalist();
  }

  function renderAdminStats() {
    const el = document.getElementById('admin-stats');
    if (!el) return;

    const coins     = _collection.filter(i => i.type === 'coin').length;
    const paper     = _collection.filter(i => i.type === 'currency' && i.subtype === 'paper').length;
    const polymer   = _collection.filter(i => i.type === 'currency' && i.subtype === 'polymer').length;
    const countries = new Set(_collection.map(i => i.country).filter(Boolean)).size;
    const themed    = _collection.filter(i => i.theme && i.theme.length > 0).length;

    el.innerHTML = `
      ${statCard('🪙', _collection.length, 'Total Items')}
      ${statCard('🟡', coins, 'Coins')}
      ${statCard('📄', paper, 'Paper Notes')}
      ${statCard('🧪', polymer, 'Polymer Notes')}
      ${statCard('🌍', countries, 'Countries')}
      ${statCard('🦁', themed, 'Themed Items')}
    `;

    // Animate numbers
    el.querySelectorAll('.admin-stat-card__number').forEach(n => {
      const target = parseInt(n.dataset.target, 10);
      PVC.animateCount(n, target, 700);
    });
  }

  function statCard(icon, value, label) {
    return `
      <div class="admin-stat-card">
        <div class="admin-stat-card__icon">${icon}</div>
        <span class="admin-stat-card__number" data-target="${value}">0</span>
        <span class="admin-stat-card__label">${label}</span>
      </div>`;
  }

  // ── Collection table ────────────────────────────────────────
  function renderCollectionTable(items) {
    const tbody = document.getElementById('collection-tbody');
    if (!tbody) return;

    const filtered = _adminSearch
      ? items.filter(i =>
          (i.title   || '').toLowerCase().includes(_adminSearch) ||
          (i.country || '').toLowerCase().includes(_adminSearch))
      : items;

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr class="table-empty-row">
          <td colspan="7">No items found${_adminSearch ? ' — try a different search' : ''}.</td>
        </tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(item => {
      const dtype   = PVC.getDisplayType(item);
      const typeCfg = PVC.TYPE_CONFIG[dtype];
      const flag    = PVC.getFlag(item.country);
      const preview = item.image
        ? `<img class="table-preview" src="${item.image}"
                alt="${item.title}"
                onerror="this.parentElement.innerHTML='<div class=\\'table-preview-placeholder\\'>${typeCfg.icon}</div>'">`
        : `<div class="table-preview-placeholder">${typeCfg.icon}</div>`;

      const themes = (item.theme || []).map(t => {
        const tc = PVC.THEME_CONFIG[t];
        return tc ? `<span class="badge ${tc.cls}" style="font-size:0.68rem">${tc.label}</span>` : '';
      }).join('');

      return `
        <tr data-id="${item.id}">
          <td>${preview}</td>
          <td><div class="table-title" title="${item.title}">${item.title}</div></td>
          <td><span class="badge ${typeCfg.cls}">${typeCfg.label}</span></td>
          <td>${flag} ${item.country || '—'}</td>
          <td>${item.year || '—'}</td>
          <td style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;min-height:48px">${themes || '<span style="color:var(--text-dim);font-size:0.78rem">—</span>'}</td>
          <td>
            <div class="table-actions">
              <button class="btn-action btn-action--edit" data-id="${item.id}">✏️ Edit</button>
              <button class="btn-action btn-action--delete" data-id="${item.id}">🗑️ Delete</button>
            </div>
          </td>
        </tr>`;
    }).join('');

    // Bind edit/delete
    tbody.querySelectorAll('.btn-action--edit').forEach(btn => {
      btn.addEventListener('click', () => loadItemIntoForm(btn.dataset.id));
    });
    tbody.querySelectorAll('.btn-action--delete').forEach(btn => {
      btn.addEventListener('click', () => deleteItem(btn.dataset.id));
    });
  }

  // ── Delete item (with confirm) ──────────────────────────────
  function deleteItem(id) {
    const item = _collection.find(i => i.id === id);
    if (!item) return;
    if (!confirm(`Delete "${item.title}"?\n\nThis only updates the preview. You still need to commit the updated collection.json to your repo.`)) return;

    _collection = _collection.filter(i => i.id !== id);
    renderCollectionTable(_collection);
    renderAdminStats();

    // Show the JSON for the updated collection
    showDeletedJSON();
  }

  function showDeletedJSON() {
    const out     = document.getElementById('output-section');
    const jsonEl  = document.getElementById('output-json');
    const formTitle = document.getElementById('form-section-title');

    if (!out || !jsonEl) return;
    if (formTitle) formTitle.textContent = '⚠️ Item Deleted — Commit Updated JSON';

    const exportData = buildExportJSON();
    jsonEl.textContent = JSON.stringify(exportData, null, 2);
    out.classList.remove('hidden');
    out.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ============================================================
  //  UPLOAD FORM
  // ============================================================

  function bindDashboardEvents() {
    // Logout
    document.getElementById('btn-logout')?.addEventListener('click', logout);

    // Admin search
    document.getElementById('admin-search')?.addEventListener('input', e => {
      _adminSearch = e.target.value.toLowerCase().trim();
      renderCollectionTable(_collection);
    });

    // Drag & drop zone
    bindDropZone();

    // File input change
    document.getElementById('img-input')?.addEventListener('change', e => {
      handleFiles(Array.from(e.target.files));
    });

    // Tag input
    const tagInput = document.getElementById('f-tag-input');
    if (tagInput) {
      tagInput.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ',') {
          e.preventDefault();
          const val = tagInput.value.trim().replace(/,/g, '').replace(/\s+/g, '-').toLowerCase();
          if (val) addTag(val);
          tagInput.value = '';
        }
      });
    }

    // Form submit
    document.getElementById('item-form')?.addEventListener('submit', e => {
      e.preventDefault();
      generateEntry();
    });

    // Reset form
    document.getElementById('btn-reset-form')?.addEventListener('click', resetForm);

    // Copy JSON button
    document.getElementById('btn-copy-json')?.addEventListener('click', copyJSON);

    // Country auto-fill continent
    document.getElementById('f-country')?.addEventListener('input', e => {
      const map = PVC.getCountryMap();
      const cont = map[e.target.value];
      if (cont) {
        const sel = document.getElementById('f-continent');
        if (sel) sel.value = cont;
      }
    });
  }

  // ── Drop zone ───────────────────────────────────────────────
  function bindDropZone() {
    const zone = document.getElementById('drop-zone');
    if (!zone) return;

    zone.addEventListener('dragover', e => {
      e.preventDefault();
      zone.classList.add('drag-over');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      handleFiles(Array.from(e.dataTransfer.files));
    });
    zone.addEventListener('click', () => document.getElementById('img-input')?.click());
  }

  function handleFiles(files) {
    const imgFiles = files.filter(f => f.type.startsWith('image/'));
    if (!imgFiles.length) return;
    _imageFiles = [..._imageFiles, ...imgFiles].slice(0, 4); // max 4
    renderImagePreviews();
  }

  function renderImagePreviews() {
    const container = document.getElementById('image-previews');
    if (!container) return;
    container.innerHTML = '';

    _imageFiles.forEach((file, idx) => {
      const url  = URL.createObjectURL(file);
      const item = document.createElement('div');
      item.className = 'preview-item';
      item.innerHTML = `
        <img src="${url}" alt="Preview ${idx + 1}">
        <div class="preview-item__label">${file.name}</div>
        <button class="preview-item__remove" data-idx="${idx}">✕</button>
      `;
      item.querySelector('.preview-item__remove').addEventListener('click', e => {
        e.stopPropagation();
        _imageFiles.splice(idx, 1);
        renderImagePreviews();
      });
      container.appendChild(item);
    });
  }

  // ── Tags ────────────────────────────────────────────────────
  function addTag(tag) {
    if (_tags.includes(tag)) return;
    _tags.push(tag);
    renderTags();
  }

  function removeTag(tag) {
    _tags = _tags.filter(t => t !== tag);
    renderTags();
  }

  function renderTags() {
    const el = document.getElementById('tag-chips');
    if (!el) return;
    el.innerHTML = _tags.map(t => `
      <span class="admin-tag-chip">
        ${t}
        <button class="admin-tag-chip__remove" data-tag="${t}">✕</button>
      </span>`).join('');

    el.querySelectorAll('.admin-tag-chip__remove').forEach(btn => {
      btn.addEventListener('click', () => removeTag(btn.dataset.tag));
    });
  }

  // ── Load item into form (Edit) ──────────────────────────────
  function loadItemIntoForm(id) {
    const item = _collection.find(i => i.id === id);
    if (!item) return;

    _editingId = id;
    _tags = [...(item.tags || [])];
    _imageFiles = [];

    const dtype = PVC.getDisplayType(item);

    setValue('edit-id',       item.id);
    setValue('f-type',        dtype);
    setValue('f-title',       item.title      || '');
    setValue('f-country',     item.country    || '');
    setValue('f-continent',   item.continent  || '');
    setValue('f-year',        item.year       || '');
    setValue('f-denomination',item.denomination || '');
    setValue('f-material',    item.material   || '');
    setValue('f-description', item.description || '');

    // Themes
    document.querySelectorAll('input[name="theme"]').forEach(cb => {
      cb.checked = (item.theme || []).includes(cb.value);
    });

    renderTags();
    renderImagePreviews();

    // Scroll to form
    document.getElementById('upload-section')?.scrollIntoView({ behavior: 'smooth' });

    // Update form title
    const title = document.getElementById('form-section-title');
    if (title) title.textContent = `✏️ Edit: ${item.title}`;

    document.getElementById('btn-generate').textContent = '💾 Update Entry';
  }

  // ── Generate JSON entry ─────────────────────────────────────
  function generateEntry() {
    const type  = getValue('f-type');
    const title = getValue('f-title').trim();
    const country = getValue('f-country').trim();
    const continent = getValue('f-continent');
    const year  = parseInt(getValue('f-year'), 10) || null;

    if (!type || !title || !country || !continent) {
      alert('Please fill in all required fields (Type, Title, Country, Continent).');
      return;
    }

    const themes = [...document.querySelectorAll('input[name="theme"]:checked')]
      .map(cb => cb.value);

    // Auto-add type tag
    const autoTypeTag = type === 'coin' ? 'coin' : (type === 'polymer' ? 'polymer-currency' : 'paper-currency');
    const allTags = [...new Set([autoTypeTag, ...themes, country.toLowerCase().replace(/\s+/g,'-'), continent.toLowerCase().replace(/\s+/g,'-'), ..._tags])];

    // Generate a slug-based ID
    const baseId  = _editingId || generateId(type, country, year);
    const imgSlug = baseId.replace(/_/g, '_');
    const imgDir  = type === 'coin' ? 'coins' : 'currency';
    const imgPath = _imageFiles.length ? `assets/images/${imgDir}/${imgSlug}.jpg` : '';

    const entry = {
      id:           baseId,
      type:         type === 'coin' ? 'coin' : 'currency',
      subtype:      type === 'coin' ? 'coin' : type,
      title,
      country,
      continent,
      year,
      denomination: getValue('f-denomination').trim() || undefined,
      material:     getValue('f-material').trim()     || undefined,
      description:  getValue('f-description').trim()  || undefined,
      tags:         allTags,
      theme:        themes,
      image:        imgPath || undefined,
      thumbnail:    imgPath || undefined,
      addedOn:      new Date().toISOString().split('T')[0],
    };

    // Remove undefined fields
    Object.keys(entry).forEach(k => entry[k] === undefined && delete entry[k]);

    // Update or add to in-memory collection
    if (_editingId) {
      const idx = _collection.findIndex(i => i.id === _editingId);
      if (idx !== -1) _collection[idx] = entry;
    } else {
      _collection.push(entry);
    }

    renderAdminStats();
    renderCollectionTable(_collection);
    showOutput(entry, imgDir, imgSlug);
  }

  function showOutput(entry, imgDir, imgSlug) {
    const out   = document.getElementById('output-section');
    const jsonEl = document.getElementById('output-json');
    if (!out || !jsonEl) return;

    jsonEl.textContent = JSON.stringify(entry, null, 2);

    const fileInstr = document.getElementById('file-instructions');
    if (fileInstr) {
      if (_imageFiles.length) {
        fileInstr.innerHTML = `
          <div style="margin:12px 0;padding:12px;background:var(--surface-3);border-radius:var(--r-md)">
            <strong style="font-size:0.85rem;color:var(--text)">📁 Image File${_imageFiles.length > 1 ? 's' : ''} to save:</strong>
            ${_imageFiles.map((f, i) => `
              <div style="margin-top:8px;font-size:0.82rem;color:var(--text-muted)">
                Save <code style="color:var(--gold)">${f.name}</code> →
                <code style="color:var(--gold)">assets/images/${imgDir}/${imgSlug}${_imageFiles.length > 1 ? '_' + (i+1) : ''}.jpg</code>
              </div>`).join('')}
          </div>`;
      } else {
        fileInstr.innerHTML = `<p style="font-size:0.82rem;color:var(--text-muted);margin-top:8px">ℹ️ No image uploaded. You can add one later and update the <code style="color:var(--gold)">image</code> field.</p>`;
      }
    }

    // Update commit instructions title dynamically
    const commitTitle = out.querySelector('.commit-instructions h4');
    if (commitTitle) commitTitle.textContent = `Next Steps to Publish "${entry.title}":`;

    out.classList.remove('hidden');
    out.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function copyJSON() {
    const jsonEl = document.getElementById('output-json');
    const btn    = document.getElementById('btn-copy-json');
    if (!jsonEl || !btn) return;

    navigator.clipboard.writeText(jsonEl.textContent).then(() => {
      btn.textContent = '✅ Copied!';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.textContent = 'Copy JSON';
        btn.classList.remove('copied');
      }, 2000);
    }).catch(() => {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = jsonEl.textContent;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      btn.textContent = '✅ Copied!';
      setTimeout(() => { btn.textContent = 'Copy JSON'; }, 2000);
    });
  }

  // ── Reset form to blank state ────────────────────────────────
  function resetForm() {
    _editingId  = null;
    _tags       = [];
    _imageFiles = [];
    document.getElementById('item-form')?.reset();
    renderTags();
    renderImagePreviews();
    const title = document.getElementById('form-section-title');
    if (title) title.textContent = 'Add New Item';
    const genBtn = document.getElementById('btn-generate');
    if (genBtn) genBtn.textContent = '✨ Generate Entry';
    document.getElementById('output-section')?.classList.add('hidden');
  }

  // ── Build full export JSON (all items) ──────────────────────
  function buildExportJSON() {
    return {
      meta: { lastUpdated: new Date().toISOString().split('T')[0] },
      items: _collection
    };
  }

  // ── Populate country datalist ────────────────────────────────
  function populateCountryDatalist() {
    const dl = document.getElementById('country-datalist');
    if (!dl) return;
    const countries = PVC.getUniqueValues('country');
    dl.innerHTML = countries.map(c => `<option value="${c}">`).join('');
  }

  // ── Helpers ─────────────────────────────────────────────────
  function getValue(id) {
    return (document.getElementById(id)?.value || '');
  }
  function setValue(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
  }

  function generateId(type, country, year) {
    const prefix  = type === 'coin' ? 'coin' : (type === 'polymer' ? 'polymer' : 'note');
    const slug    = country.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'');
    const ts      = Date.now().toString().slice(-4);
    return `${prefix}_${slug}_${year || ts}`;
  }

  // ── Boot ─────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', boot);

})();
