/* ============================================================
   PV Collection — image-store.js
   Local browser-side blob store for uploaded images, keyed by
   their intended repo path (e.g. "assets/images/coins/coin_x.jpg").
   Lets the gallery preview uploads immediately before they're
   committed to the repo, without a backend.
   ============================================================ */

window.PVCollection = window.PVCollection || {};

(function(PVC) {
  'use strict';

  const DB_NAME  = 'pvc-uploads';
  const STORE    = 'images';
  const VERSION  = 1;

  let _dbPromise = null;
  const _urlCache = new Map(); // path → object URL (freed on overwrite)

  function openDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') return reject(new Error('no-indexeddb'));
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = e => resolve(e.target.result);
      req.onerror   = e => reject(e.target.error);
    });
    return _dbPromise;
  }

  function withStore(mode, fn) {
    return openDB().then(db => new Promise((resolve, reject) => {
      const tx    = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      let result;
      try { result = fn(store); } catch (err) { return reject(err); }
      tx.oncomplete = () => resolve(result && result.value !== undefined ? result.value : result);
      tx.onerror    = () => reject(tx.error);
      tx.onabort    = () => reject(tx.error);
    }));
  }

  PVC.imageStore = {
    put(path, blob) {
      // Free any cached blob URL for this path so next read re-creates it
      if (_urlCache.has(path)) { URL.revokeObjectURL(_urlCache.get(path)); _urlCache.delete(path); }
      return withStore('readwrite', store => {
        const req = store.put(blob, path);
        return new Promise((res, rej) => {
          req.onsuccess = () => res();
          req.onerror   = () => rej(req.error);
        });
      });
    },
    get(path) {
      return withStore('readonly', store => {
        const req = store.get(path);
        return new Promise((res, rej) => {
          req.onsuccess = () => res(req.result || null);
          req.onerror   = () => rej(req.error);
        });
      }).catch(() => null);
    },
    has(path) {
      return this.get(path).then(b => !!b);
    },
    delete(path) {
      if (_urlCache.has(path)) { URL.revokeObjectURL(_urlCache.get(path)); _urlCache.delete(path); }
      return withStore('readwrite', store => {
        const req = store.delete(path);
        return new Promise((res, rej) => {
          req.onsuccess = () => res();
          req.onerror   = () => rej(req.error);
        });
      });
    },
    keys() {
      return withStore('readonly', store => {
        const req = store.getAllKeys();
        return new Promise((res, rej) => {
          req.onsuccess = () => res(req.result || []);
          req.onerror   = () => rej(req.error);
        });
      }).catch(() => []);
    },
    all() {
      // Returns [{path, blob}]
      return withStore('readonly', store => new Promise((res, rej) => {
        const out = [];
        const req = store.openCursor();
        req.onsuccess = e => {
          const cur = e.target.result;
          if (!cur) return res(out);
          out.push({ path: cur.key, blob: cur.value });
          cur.continue();
        };
        req.onerror = () => rej(req.error);
      })).catch(() => []);
    },
    clear() {
      for (const url of _urlCache.values()) URL.revokeObjectURL(url);
      _urlCache.clear();
      return withStore('readwrite', store => {
        const req = store.clear();
        return new Promise((res, rej) => {
          req.onsuccess = () => res();
          req.onerror   = () => rej(req.error);
        });
      });
    },

    // Get a blob URL for a stored path, or null.
    getURL(path) {
      if (_urlCache.has(path)) return Promise.resolve(_urlCache.get(path));
      return this.get(path).then(blob => {
        if (!blob) return null;
        const url = URL.createObjectURL(blob);
        _urlCache.set(path, url);
        return url;
      });
    }
  };

  // Resolve a path to a renderable src — prefers uploaded blob from
  // IndexedDB if available, otherwise returns the original path so
  // the caller's normal HTTP fetch applies.
  PVC.resolveImageSrc = function(path) {
    if (!path) return Promise.resolve(path);
    return PVC.imageStore.getURL(path).then(url => url || path).catch(() => path);
  };

  // Synchronous check: does the store *likely* have an image at
  // this path? (Uses the URL cache only; fast but may miss entries
  // that haven't been primed yet. Useful for optional UI hints.)
  PVC.hasCachedImage = function(path) {
    return _urlCache.has(path);
  };

})(window.PVCollection);
