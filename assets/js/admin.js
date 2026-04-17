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

  // Default password shipped with the app so the admin screen
  // works out of the box without running the setup flow.
  //   Default password: PVCadmin2026   (change via "Change Password")
  // Only the SHA-256 hash is embedded. Once the user sets a new
  // password via the UI, it replaces this in localStorage.
  const DEFAULT_HASH = '2bcf817b9eb43327412bcc48ca82a1fca0af8f2aedcd22b2838079a3b32ef0f5';

  // ── State ───────────────────────────────────────────────────
  let _collection  = [];   // loaded items
  let _editingId   = null; // id of item being edited
  let _tags        = [];   // current tag list in form
  let _imageFiles  = [];   // uploaded File objects
  let _existingImages = { image: '', images: [], thumbnail: '' }; // preserved during edit
  let _adminSearch = '';   // search in table

  // ============================================================
  //  PROJECT FOLDER — Auto-save via File System Access API
  //  Stores directory handle in IndexedDB so it persists across
  //  sessions. Every add/edit/delete writes collection.json and
  //  uploaded images directly to the project folder.
  // ============================================================

  const FS_DB_NAME = 'pvc-folder';
  const FS_STORE   = 'handles';
  const FS_KEY     = 'projectRoot';
  let _rootHandle  = null;  // FileSystemDirectoryHandle or null

  /** Does this browser support the File System Access API? */
  function hasFSAccess() {
    return typeof window.showDirectoryPicker === 'function';
  }

  /** Open a small IndexedDB to persist the directory handle */
  function openFSDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(FS_DB_NAME, 1);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(FS_STORE)) db.createObjectStore(FS_STORE);
      };
      req.onsuccess = e => resolve(e.target.result);
      req.onerror   = e => reject(e.target.error);
    });
  }

  /** Save the directory handle to IndexedDB */
  async function saveDirHandle(handle) {
    const db = await openFSDB();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(FS_STORE, 'readwrite');
      const st  = tx.objectStore(FS_STORE);
      st.put(handle, FS_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
  }

  /** Load the previously-saved directory handle from IndexedDB */
  async function loadDirHandle() {
    try {
      const db = await openFSDB();
      return new Promise((resolve, reject) => {
        const tx  = db.transaction(FS_STORE, 'readonly');
        const st  = tx.objectStore(FS_STORE);
        const req = st.get(FS_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror   = () => reject(req.error);
      });
    } catch { return null; }
  }

  /** Prompt user to pick the project folder */
  async function connectProjectFolder() {
    if (!hasFSAccess()) {
      alert('Your browser does not support direct folder access.\n'
          + 'Use Chrome or Edge for auto-save, or use the\n'
          + '"Download collection.json" button instead.');
      return false;
    }
    try {
      _rootHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      await saveDirHandle(_rootHandle);
      updateFolderUI(true);
      // Immediately save current state to the folder
      await autoSaveCollection();
      return true;
    } catch (err) {
      if (err.name === 'AbortError') return false; // user cancelled
      alert('Could not connect folder: ' + (err.message || err));
      return false;
    }
  }

  /** Try to reconnect a previously-saved handle (needs user gesture to re-verify permission) */
  async function tryReconnectFolder() {
    if (!hasFSAccess()) return;
    const handle = await loadDirHandle();
    if (!handle) return;
    // queryPermission returns 'granted' if still allowed, 'prompt' if needs re-ask
    try {
      const perm = await handle.queryPermission({ mode: 'readwrite' });
      if (perm === 'granted') {
        _rootHandle = handle;
        updateFolderUI(true);
        return;
      }
      // Permission expired — try requesting on next user gesture
      // Store the handle so the "Connect" click can re-request
      _rootHandle = handle;
      updateFolderUI(false, 'Click to reconnect');
    } catch { /* ignore — stale handle */ }
  }

  /** Re-request permission on an existing handle (needs user gesture) */
  async function reRequestPermission() {
    if (!_rootHandle) return connectProjectFolder();
    try {
      const perm = await _rootHandle.requestPermission({ mode: 'readwrite' });
      if (perm === 'granted') {
        updateFolderUI(true);
        await autoSaveCollection();
        return true;
      }
    } catch { /* fall through */ }
    // Permission denied — ask for a new folder
    return connectProjectFolder();
  }

  /** Write collection.json to the project folder */
  async function autoSaveCollection() {
    if (!_rootHandle) return false;
    try {
      // Verify permission is still valid
      const perm = await _rootHandle.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') {
        updateFolderUI(false, 'Permission lost');
        return false;
      }

      const payload = buildExportJSON();
      const dataDir = await _rootHandle.getDirectoryHandle('data', { create: true });
      const fileH   = await dataDir.getFileHandle('collection.json', { create: true });
      const writer  = await fileH.createWritable();
      await writer.write(JSON.stringify(payload, null, 2) + '\n');
      await writer.close();

      flashSaveStatus('✅ collection.json saved');
      return true;
    } catch (err) {
      console.warn('[admin] autoSaveCollection failed:', err);
      flashSaveStatus('❌ Save failed — ' + (err.message || err));
      return false;
    }
  }

  /** Write uploaded image files to the correct assets/images subfolder */
  async function autoSaveImages(uploads) {
    if (!_rootHandle || !uploads.length) return;
    try {
      const perm = await _rootHandle.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') return;

      for (const u of uploads) {
        const parts = u.path.split('/'); // e.g. ["assets","images","coins","file.jpg"]
        let dir = _rootHandle;
        for (let i = 0; i < parts.length - 1; i++) {
          dir = await dir.getDirectoryHandle(parts[i], { create: true });
        }
        const fh     = await dir.getFileHandle(parts[parts.length - 1], { create: true });
        const writer = await fh.createWritable();
        await writer.write(u.file);
        await writer.close();
      }
      flashSaveStatus(`✅ ${uploads.length} image(s) + collection.json saved`);
    } catch (err) {
      console.warn('[admin] autoSaveImages failed:', err);
    }
  }

  /** Update the folder connection indicator in the header */
  function updateFolderUI(connected, customText) {
    const dot  = document.getElementById('folder-status-dot');
    const text = document.getElementById('folder-status-text');
    const wrap = document.getElementById('folder-status');
    if (!dot || !text) return;

    if (connected) {
      dot.style.background  = '#28b06d';
      text.style.color      = 'var(--green)';
      text.textContent      = _rootHandle ? (_rootHandle.name + ' — auto-saving') : 'Connected';
      if (wrap) wrap.title   = 'Project folder connected — changes auto-save to disk';
    } else {
      dot.style.background  = customText ? '#e8a827' : '#e05252';
      text.style.color      = customText ? 'var(--gold)' : 'var(--text-muted)';
      text.textContent      = customText || 'Not connected';
      if (wrap) wrap.title   = 'Click to connect your project folder for auto-save';
    }
  }

  /** Flash a brief save-status message */
  function flashSaveStatus(msg) {
    const el = document.getElementById('save-status-msg');
    if (!el) return;
    el.innerHTML = `<strong style="color:var(--green)">${msg}</strong>`;
    clearTimeout(flashSaveStatus._t);
    flashSaveStatus._t = setTimeout(() => {
      el.innerHTML = _rootHandle
        ? '<strong style="color:var(--green)">✅ Auto-save active</strong> — changes write directly to <code>collection.json</code>.'
        : '<strong style="color:var(--gold)">📌 Tip:</strong> Connect your project folder (above) to auto-save, or download manually.';
    }, 4000);
  }

  // ============================================================
  //  AUTHENTICATION
  // ============================================================

  /** SHA-256 of a string via Web Crypto API */
  async function sha256(str) {
    const buf  = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  /** Current active hash — user-set (localStorage) or shipped default */
  function activeHash() {
    return localStorage.getItem(HASH_KEY) || DEFAULT_HASH;
  }

  /** Always true now — a default hash is always available */
  function hasStoredHash() {
    return true;
  }

  /** Verify entered password against active hash */
  async function verifyPassword(password) {
    const entered = await sha256(password);
    return entered === activeHash();
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

    // Try to reconnect a previously-saved project folder handle
    tryReconnectFolder();

    // Hide folder-related UI if browser doesn't support File System Access
    if (!hasFSAccess()) {
      const folderStatus = document.getElementById('folder-status');
      if (folderStatus) folderStatus.style.display = 'none';
      const connectBtn = document.getElementById('btn-connect-folder');
      if (connectBtn) {
        connectBtn.textContent = '📂 Not supported in this browser';
        connectBtn.disabled = true;
        connectBtn.style.opacity = '0.5';
      }
    }
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
      // src is resolved asynchronously below so we can hit
      // IndexedDB first (uploaded-not-yet-committed images).
      // Guard: resolve primary image safely (may be array)
      const imgSrc = Array.isArray(item.image) ? (item.image[0] || '') : (item.image || '');
      const preview = imgSrc
        ? `<img class="table-preview" data-src="${imgSrc}"
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

    // Resolve table previews via IndexedDB store → falls through
    // to the data-src path for the network if not uploaded.
    tbody.querySelectorAll('.table-preview[data-src]').forEach(img => {
      const src = img.getAttribute('data-src');
      const resolver = PVC.resolveImageSrc ? PVC.resolveImageSrc(src) : Promise.resolve(src);
      resolver.then(real => { img.src = real; });
    });
  }

  // ── Delete item (with confirm) ──────────────────────────────
  function deleteItem(id) {
    const item = _collection.find(i => i.id === id);
    if (!item) return;

    const msg = _rootHandle
      ? `Delete "${item.title}"?\n\nThis will auto-save the updated collection.json to your project folder.`
      : `Delete "${item.title}"?\n\nRemember to download or export collection.json afterwards.`;
    if (!confirm(msg)) return;

    _collection = _collection.filter(i => i.id !== id);
    saveCollectionToStorage();

    // Auto-save to project folder if connected
    if (_rootHandle) autoSaveCollection();

    renderCollectionTable(_collection);
    renderAdminStats();

    // Show the JSON for the updated collection (if not auto-saving)
    if (!_rootHandle) showDeletedJSON();
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

    // Connect project folder — header status badge (click to connect/reconnect)
    document.getElementById('folder-status')?.addEventListener('click', () => {
      if (_rootHandle) {
        reRequestPermission();
      } else {
        connectProjectFolder();
      }
    });

    // Connect project folder — main button in export section
    document.getElementById('btn-connect-folder')?.addEventListener('click', () => {
      connectProjectFolder();
    });

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

    // Export full collection.json
    document.getElementById('btn-export-json')?.addEventListener('click', () => {
      const payload = buildExportJSON();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = 'collection.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    });

    // Clear local changes
    document.getElementById('btn-clear-local')?.addEventListener('click', async () => {
      if (!confirm('Clear all locally-saved changes?\n\nThis will revert to the committed collection.json on next reload.')) return;
      localStorage.removeItem(LOCAL_COLLECTION_KEY);
      if (PVC.imageStore) {
        try { await PVC.imageStore.clear(); } catch (e) { /* ignore */ }
      }
      location.reload();
    });

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
    const zone  = document.getElementById('drop-zone');
    const input = document.getElementById('img-input');
    const btn   = document.getElementById('btn-browse-files');
    if (!zone || !input) return;

    // Clear .value before opening so picking the same file(s)
    // twice still emits a `change` event (browsers suppress it
    // if the value hasn't actually changed).
    const openPicker = () => { input.value = ''; input.click(); };

    // Drag events: preventDefault on both dragenter and dragover
    // is required for the drop event to fire.
    const onDragEnter = (e) => { e.preventDefault(); zone.classList.add('drag-over'); };
    const onDragOver  = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; };
    const onDragLeave = (e) => {
      // Only clear state when leaving the zone (not a child).
      if (e.target === zone) zone.classList.remove('drag-over');
    };
    zone.addEventListener('dragenter', onDragEnter);
    zone.addEventListener('dragover',  onDragOver);
    zone.addEventListener('dragleave', onDragLeave);

    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');

      // Prefer the DataTransferItemList API so folder drops work too
      // (WhatsApp export folder → iterate children).
      const dt = e.dataTransfer;
      if (dt.items && dt.items.length && dt.items[0].webkitGetAsEntry) {
        collectFilesFromItems(dt.items).then(files => handleFiles(files));
      } else {
        handleFiles(Array.from(dt.files || []));
      }
    });

    // Zone-level click — only opens picker when the click
    // *originated* on the zone itself (not on the Browse button,
    // which has its own handler). Without this guard, clicking
    // the button triggers the picker twice.
    zone.addEventListener('click', (e) => {
      if (btn && (e.target === btn || btn.contains(e.target))) return;
      openPicker();
    });

    // Dedicated Browse-Files handler, stops bubbling to the zone.
    btn?.addEventListener('click', (e) => {
      e.stopPropagation();
      openPicker();
    });

    // Keyboard accessibility (Enter / Space on the zone).
    zone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); }
    });
  }

  // Recursively collect File objects from a DataTransferItemList.
  // Supports dropping a folder (e.g. the whole WhatsApp export).
  function collectFilesFromItems(items) {
    const out = [];
    const walk = (entry) => new Promise(resolve => {
      if (!entry) return resolve();
      if (entry.isFile) {
        entry.file(f => { out.push(f); resolve(); }, () => resolve());
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        reader.readEntries(entries => {
          Promise.all(entries.map(walk)).then(() => resolve());
        }, () => resolve());
      } else {
        resolve();
      }
    });

    const entries = Array.from(items)
      .map(it => it.webkitGetAsEntry && it.webkitGetAsEntry())
      .filter(Boolean);
    return Promise.all(entries.map(walk)).then(() => out);
  }

  // Accept images by MIME *or* extension — WhatsApp exports and
  // some Windows copies arrive with an empty/unknown MIME type,
  // so relying solely on f.type silently drops them.
  const IMG_EXT_RE = /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif|tiff?)$/i;

  function isImageFile(f) {
    if (f.type && f.type.startsWith('image/')) return true;
    return IMG_EXT_RE.test(f.name || '');
  }

  function handleFiles(files) {
    const imgFiles = files.filter(isImageFile);
    const rejected = files.length - imgFiles.length;

    if (!imgFiles.length) {
      flashDropZone(`No image files found${files.length ? ' in the ' + files.length + ' selected item(s).' : '.'} Supported: JPG, PNG, WebP, GIF, HEIC.`);
      return;
    }

    const before = _imageFiles.length;
    _imageFiles = [..._imageFiles, ...imgFiles].slice(0, 4); // max 4
    renderImagePreviews();

    const added   = _imageFiles.length - before;
    const dropped = imgFiles.length - added;
    const bits    = [];
    if (added)    bits.push(`✅ Added ${added} image${added > 1 ? 's' : ''}.`);
    if (dropped)  bits.push(`⚠️ ${dropped} skipped — max is 4.`);
    if (rejected) bits.push(`⚠️ ${rejected} non-image file${rejected > 1 ? 's' : ''} ignored.`);
    if (bits.length) flashDropZone(bits.join(' '));
  }

  // Show a transient message below the drop zone so the user
  // actually sees why a file didn't get picked up.
  function flashDropZone(msg) {
    let note = document.getElementById('drop-zone-note');
    if (!note) {
      note = document.createElement('p');
      note.id = 'drop-zone-note';
      note.style.cssText = 'margin-top:10px;padding:10px 12px;border-radius:var(--r-sm);font-size:0.82rem;line-height:1.5;background:var(--surface-3);border:1px solid var(--border);color:var(--text-muted)';
      const zone = document.getElementById('drop-zone');
      zone?.parentElement?.insertBefore(note, zone.nextSibling);
    }
    note.textContent = msg;
    clearTimeout(flashDropZone._t);
    flashDropZone._t = setTimeout(() => { if (note) note.textContent = ''; }, 6000);
  }

  function renderImagePreviews() {
    const container = document.getElementById('image-previews');
    if (!container) return;
    container.innerHTML = '';

    const SIDE = ['Front (Obverse)', 'Back (Reverse)', 'View 3', 'View 4'];
    _imageFiles.forEach((file, idx) => {
      const url  = URL.createObjectURL(file);
      const item = document.createElement('div');
      item.className = 'preview-item';
      item.innerHTML = `
        <div class="preview-item__side">${SIDE[idx] || ('View ' + (idx+1))}</div>
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
    // Preserve existing image paths so editing doesn't lose them
    const existImg = Array.isArray(item.image) ? (item.image[0] || '') : (item.image || '');
    _existingImages = {
      image:     existImg,
      images:    Array.isArray(item.images) ? [...item.images] : (existImg ? [existImg] : []),
      thumbnail: item.thumbnail || existImg
    };

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

    // Build per-image paths: first image is the primary (front),
    // second becomes _back, further images get numeric suffixes.
    const suffixFor = (i) => i === 0 ? '' : (i === 1 ? '_back' : `_${i + 1}`);
    const imgPaths  = _imageFiles.length
      ? _imageFiles.map((_, i) =>
          `assets/images/${imgDir}/${imgSlug}${suffixFor(i)}.jpg`)
      : (_editingId ? _existingImages.images : []);

    const primaryPath = imgPaths[0] || (_editingId ? _existingImages.image : '');

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
      image:        primaryPath || undefined,
      images:       imgPaths.length > 1 ? imgPaths : undefined,
      thumbnail:    primaryPath || undefined,
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

    // Persist the full collection to localStorage so items survive
    // page reloads and are visible on the gallery page too.
    saveCollectionToStorage();

    // Save uploaded blobs to the local IndexedDB store at the
    // target repo paths. This lets the gallery render them
    // immediately without waiting for a commit to disk.
    const uploads = _imageFiles.length
      ? _imageFiles.map((file, i) => ({ file, path: imgPaths[i] }))
      : [];
    if (PVC.imageStore && uploads.length) {
      Promise.all(uploads.map(u => PVC.imageStore.put(u.path, u.file)))
             .catch(err => console.warn('[admin] imageStore.put failed', err));
    }

    // Auto-save to project folder (collection.json + images) if connected
    if (_rootHandle) {
      autoSaveImages(uploads).then(() => autoSaveCollection());
    }

    renderAdminStats();
    renderCollectionTable(_collection);
    showOutput(entry, imgDir, imgSlug, uploads);
  }

  function showOutput(entry, imgDir, imgSlug, uploads) {
    const out   = document.getElementById('output-section');
    const jsonEl = document.getElementById('output-json');
    if (!out || !jsonEl) return;

    jsonEl.textContent = JSON.stringify(entry, null, 2);

    const fileInstr = document.getElementById('file-instructions');
    if (fileInstr) {
      if (uploads && uploads.length) {
        const SIDE = ['Front', 'Back', 'View 3', 'View 4'];
        fileInstr.innerHTML = `
          <div style="margin:12px 0;padding:12px;background:var(--surface-3);border-radius:var(--r-md)">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:8px">
              <strong style="font-size:0.85rem;color:var(--text)">
                📁 Image File${uploads.length > 1 ? 's' : ''} — previewed locally
              </strong>
              <div style="display:flex;gap:8px">
                <button type="button" class="btn-secondary" id="btn-save-fs"
                        title="Write images directly into assets/images/ (Chrome/Edge)">
                  💾 Save to project folder
                </button>
                <button type="button" class="btn-secondary" id="btn-download-imgs">
                  ⬇️ Download renamed
                </button>
              </div>
            </div>
            ${uploads.map((u, i) => `
              <div style="margin-top:8px;font-size:0.82rem;color:var(--text-muted)">
                <strong style="color:var(--text)">${SIDE[i] || ('View ' + (i+1))}:</strong>
                <code style="color:var(--gold)">${u.file.name}</code>
                → <code style="color:var(--gold)">${u.path}</code>
              </div>`).join('')}
            <p style="margin-top:10px;font-size:0.76rem;color:var(--text-dim);line-height:1.6">
              ℹ️ Images are already visible in the gallery on this browser
              (stored locally). To publish them, click <em>Save to project folder</em>
              — or <em>Download renamed</em> and drop the files into the
              correct folder manually.
            </p>
          </div>`;

        document.getElementById('btn-save-fs')
          ?.addEventListener('click', () => saveUploadsToProject(uploads));
        document.getElementById('btn-download-imgs')
          ?.addEventListener('click', () => downloadUploadsRenamed(uploads));
      } else {
        fileInstr.innerHTML = `<p style="font-size:0.82rem;color:var(--text-muted);margin-top:8px">ℹ️ No image uploaded. You can add one later and update the <code style="color:var(--gold)">image</code> field.</p>`;
      }
    }

    const commitTitle = out.querySelector('.commit-instructions h4');
    if (commitTitle) commitTitle.textContent = `Next Steps to Publish "${entry.title}":`;

    out.classList.remove('hidden');
    out.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ── Publish helpers ─────────────────────────────────────────
  // File System Access API: Chrome/Edge. Writes images AND the
  // updated data/collection.json directly into the project root,
  // so the user only needs to `git add . && git push`.
  async function saveUploadsToProject(uploads) {
    if (!window.showDirectoryPicker) {
      alert('Your browser does not support direct folder writes.\n'
          + 'Falling back to per-file download — drop them into the\n'
          + 'matching folder manually.\n\n'
          + '(Chrome or Edge supports one-click save.)');
      return downloadUploadsRenamed(uploads);
    }
    let rootHandle;
    try {
      rootHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      alert('Could not open folder: ' + (err.message || err));
      return;
    }

    try {
      // 1) Write each image file to assets/images/<dir>/<slug>.jpg
      for (const u of uploads) {
        const parts = u.path.split('/');
        let dir = rootHandle;
        for (let i = 0; i < parts.length - 1; i++) {
          dir = await dir.getDirectoryHandle(parts[i], { create: true });
        }
        const fh     = await dir.getFileHandle(parts[parts.length - 1], { create: true });
        const writer = await fh.createWritable();
        await writer.write(u.file);
        await writer.close();
      }

      // 2) Write data/collection.json with the full current list
      const dataDir = await rootHandle.getDirectoryHandle('data', { create: true });
      const jsonH   = await dataDir.getFileHandle('collection.json', { create: true });
      const jsonW   = await jsonH.createWritable();
      const payload = {
        meta: {
          title: 'PV Collection',
          description: 'A personal coin and currency collection spanning the world',
          lastUpdated: new Date().toISOString().split('T')[0],
          version: '1.0.0'
        },
        items: _collection
      };
      await jsonW.write(JSON.stringify(payload, null, 2));
      await jsonW.close();

      alert(`✅ Saved ${uploads.length} image(s) + collection.json to the project folder.\n\n`
          + 'Next: `git add . && git commit -m "add: ' + (uploads[0]?.file.name || 'new item') + '" && git push`');
    } catch (err) {
      alert('Save failed: ' + (err.message || err));
    }
  }

  // Universal fallback: trigger one download per upload, with
  // the filename the site expects. User drops them into the
  // matching folder and commits.
  function downloadUploadsRenamed(uploads) {
    uploads.forEach((u, i) => {
      const targetName = u.path.split('/').pop();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(u.file);
      link.download = targetName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(link.href), 10000);
    });
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
    _existingImages = { image: '', images: [], thumbnail: '' };
    document.getElementById('item-form')?.reset();
    renderTags();
    renderImagePreviews();
    const title = document.getElementById('form-section-title');
    if (title) title.textContent = 'Add New Item';
    const genBtn = document.getElementById('btn-generate');
    if (genBtn) genBtn.textContent = '✨ Generate Entry';
    document.getElementById('output-section')?.classList.add('hidden');
  }

  // ── Persist collection to localStorage ───────────────────────
  // Both the admin page and gallery page read from this key.
  // The gallery merges these items with the static collection.json.
  const LOCAL_COLLECTION_KEY = 'pvc_local_collection';

  function saveCollectionToStorage() {
    try {
      const payload = {
        meta: {
          title: 'PV Collection',
          description: 'A personal coin and currency collection spanning the world',
          lastUpdated: new Date().toISOString().split('T')[0],
          version: '1.0.0'
        },
        items: _collection
      };
      localStorage.setItem(LOCAL_COLLECTION_KEY, JSON.stringify(payload));
    } catch (err) {
      console.warn('[admin] Failed to save collection to localStorage:', err);
    }
  }

  // ── Build full export JSON (all items) ──────────────────────
  function buildExportJSON() {
    return {
      meta: {
        title: 'PV Collection',
        description: 'A personal coin and currency collection spanning the world',
        lastUpdated: new Date().toISOString().split('T')[0],
        version: '1.0.0'
      },
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
