# PV Collection 🪙

A personal showcase of coins and currencies from around the world — built as a fully static web app, hosted on GitHub Pages.

## Live Site

> `https://YOUR-USERNAME.github.io/PV-Collection/`

---

## Project Structure

```
PV-Collection/
├── index.html              → Main gallery page
├── admin.html              → Admin dashboard (password protected)
├── data/
│   └── collection.json     → All collection items (your database)
├── assets/
│   ├── css/                → Stylesheets
│   ├── js/                 → JavaScript modules
│   └── images/
│       ├── coins/          → Coin photos
│       └── currency/       → Banknote photos
```

---

## Adding Items to Your Collection

Since there's no backend server, adding items is a simple commit workflow:

### Step 1 — Open the Admin Panel
Navigate to `admin.html` in your browser.

### Step 2 — Set Your Password (First Time)
On first visit, you'll be prompted to create an admin password. It's stored securely as a SHA-256 hash in your browser's localStorage.

### Step 3 — Upload & Tag
1. Drag & drop photos of the coin/note
2. Fill in the metadata (title, type, country, year, denomination, etc.)
3. Select themes (Animal / Bird / Aquatic) if applicable
4. Add any custom tags
5. Click **✨ Generate Entry**

### Step 4 — Commit to Repository
1. Copy the generated JSON snippet
2. Paste it inside the `"items": [...]` array in `data/collection.json`
3. Save the image file(s) to `assets/images/coins/` or `assets/images/currency/`
4. Commit and push:
   ```bash
   git add .
   git commit -m "Add: 1 Rupee Rhinoceros coin (India, 1975)"
   git push
   ```
5. GitHub Pages updates automatically within ~60 seconds ✅

---

## Filter System

| Filter | Options |
|--------|---------|
| Type   | Coin / Paper Currency / Polymer Currency |
| Theme  | Animal / Bird / Aquatic |
| Continent | Africa / Asia / Europe / North America / South America / Oceania |
| Country | Searchable list, populated from your data |

---

## GitHub Pages Setup

1. Push this repo to GitHub
2. Go to **Settings → Pages**
3. Source: **Deploy from a branch** → `main` → `/ (root)`
4. Your site will be live at `https://YOUR-USERNAME.github.io/PV-Collection/`

---

## Admin Password

- Stored as a **SHA-256 hash** in browser localStorage — never in your code or repo
- Each device/browser needs to set the password once (it's not synced)
- You can change it anytime via the **Change Password** section in the dashboard
- To reset: clear `pvc_admin_hash` from localStorage via DevTools → Application → Local Storage

---

## Tech Stack

- Pure HTML, CSS, JavaScript — zero dependencies, zero build step
- Google Fonts: Cinzel (headings) + Inter (body)
- Data: `collection.json` (committed to repo, loaded at runtime via `fetch`)
- Auth: Web Crypto API (SHA-256), sessionStorage for session
