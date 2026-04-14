# 🪙 PV-Collection — Coin & Currency Showcase
## Static Web App — Implementation Plan

---

## 🎯 Project Overview

A fully **static** web application to showcase a personal coin and currency collection, hosted on **GitHub Pages**. No backend server required. Admin features use client-side authentication, and collection data is stored in a versioned **JSON file** committed to the repository.

---

## 🏗️ Architecture Decision: Static-First

| Concern | Solution |
|---|---|
| Hosting | GitHub Pages (free, static) |
| Image storage | `/assets/images/` folder in the repository |
| Collection data | `/data/collection.json` — versioned with Git |
| Admin auth | Client-side password hash check (SHA-256) |
| Upload workflow | Admin panel generates a JSON snippet + image → user commits to repo |
| Search/Filter | Pure JavaScript, client-side filtering |

> [!IMPORTANT]
> Since GitHub Pages is **read-only at runtime**, the admin "upload" flow works as:
> 1. Admin selects image + enters metadata/tags on the admin panel
> 2. App generates a **downloadable JSON entry** and shows the resized/compressed image
> 3. Admin manually commits both to the repo → site auto-updates via GitHub Pages

> [!TIP]
> If you want a fully automated upload (no manual commit), a later upgrade path could use **GitHub Actions + a GitHub Token** via a form submission service (e.g., Formspree → Actions webhook). This is noted as a future enhancement.

---

## 📁 File & Folder Structure

```
PV-Collection/
├── index.html                  → Main collection gallery page
├── admin.html                  → Admin dashboard (password protected)
├── 404.html                    → Custom 404 page
│
├── assets/
│   ├── css/
│   │   ├── main.css            → Global styles, design tokens
│   │   ├── gallery.css         → Collection grid & card styles
│   │   ├── filters.css         → Filter sidebar styles
│   │   └── admin.css           → Admin panel styles
│   │
│   ├── js/
│   │   ├── data.js             → Loads & caches collection.json
│   │   ├── gallery.js          → Renders collection cards
│   │   ├── filters.js          → Filtering & search logic
│   │   ├── lightbox.js         → Image lightbox/zoom viewer
│   │   └── admin.js            → Admin panel: auth, upload, JSON gen
│   │
│   └── images/
│       ├── coins/              → Coin images (e.g., india_1_rupee_1947.jpg)
│       ├── currency/           → Banknote images
│       └── ui/                 → Logo, favicon, placeholder images
│
├── data/
│   └── collection.json         → Single source of truth for all items
│
└── .github/
    └── workflows/
        └── deploy.yml          → Auto-deploy to GitHub Pages on push to main
```

---

## 📊 `collection.json` Schema

```json
{
  "items": [
    {
      "id": "coin_001",
      "type": "coin",
      "title": "1 Rupee — Republic India",
      "country": "India",
      "continent": "Asia",
      "year": 1950,
      "denomination": "1 Rupee",
      "material": "Nickel",
      "description": "First Republic India coin.",
      "tags": ["animal-theme", "deer", "india", "asia"],
      "theme": ["animal-theme"],
      "image": "assets/images/coins/india_1_rupee_1950.jpg",
      "thumbnail": "assets/images/coins/india_1_rupee_1950_thumb.jpg",
      "addedOn": "2024-01-15"
    },
    {
      "id": "note_001",
      "type": "currency",
      "subtype": "paper",
      "title": "10 Rupees — British India",
      "country": "India",
      "continent": "Asia",
      "year": 1937,
      "denomination": "10 Rupees",
      "description": "King George VI era banknote.",
      "tags": ["paper-currency", "india", "british-india"],
      "theme": [],
      "image": "assets/images/currency/india_10rs_1937.jpg",
      "thumbnail": "assets/images/currency/india_10rs_1937_thumb.jpg",
      "addedOn": "2024-02-01"
    }
  ]
}
```

### Tag Taxonomy

| Filter Category | Possible Tag Values |
|---|---|
| **Type** | `coin`, `paper-currency`, `polymer-currency` |
| **Theme** | `animal-theme`, `bird-theme`, `aquatic-theme` |
| **Continent** | `africa`, `asia`, `europe`, `north-america`, `south-america`, `oceania`, `antarctica` |
| **Country** | Any country name (free-form, normalized to lowercase-kebab) |

---

## 🖥️ Pages & Features

### 1. `index.html` — Main Gallery

**Header:**
- Logo / Site title "PV Collection"
- Navigation: Home | About | Admin (subtle link)
- Dark/Light mode toggle

**Type Switcher (Tab Bar):**
- `All` | `Coins` | `Currency` — animated underline tab switcher

**Filter Sidebar / Drawer (collapsible on mobile):**
- ☑ **Type**: Coin, Paper Currency, Polymer Currency
- ☑ **Theme**: Animal, Bird, Aquatic
- 🌍 **Continent**: Dropdown multi-select
- 🗺️ **Country**: Searchable dropdown (populated from data)
- 🔍 **Text Search**: Live search on title, description, country

**Gallery Grid:**
- Responsive masonry/grid layout (3 cols desktop, 2 tablet, 1 mobile)
- Card shows: thumbnail, title, country flag emoji, year, type badge, theme badges
- Hover effect: slight lift + glow
- Click → Lightbox viewer (obverse/reverse zoom, metadata panel)

**Stats Bar (below header):**
- Total items | Coins count | Notes count | Countries represented

### 2. `admin.html` — Admin Dashboard

**Auth Gate:**
- Password input (hashed with SHA-256, compared client-side)
- Password stored as a hash constant in `admin.js` — never plaintext

**Dashboard Overview:**
- Collection stats cards
- Recently added items table

**Upload Panel:**
- Drag & drop image upload (front + back images)
- Auto image preview + resize to standard dimensions
- Metadata form:
  - Title, Type (coin/paper/polymer), Country, Continent
  - Year, Denomination, Material, Description
  - Tags (multi-select chips + free-form add)
  - Themes (checkboxes: animal, bird, aquatic)
- **"Generate Entry" button**:
  - Outputs a JSON snippet to copy
  - Downloads the image files with standardized names
  - Shows instructions: "Commit these to your repo"

**Current Collection Manager:**
- Lists all items with Edit / Delete buttons
- Edit → pre-fills the upload form
- Delete → marks item as removed in the JSON export

---

## ✨ Design System

| Token | Value |
|---|---|
| Primary color | `hsl(38, 90%, 55%)` — Gold |
| Accent | `hsl(215, 80%, 55%)` — Royal Blue |
| Background (dark) | `hsl(222, 20%, 10%)` |
| Surface (dark) | `hsl(222, 15%, 15%)` |
| Text primary | `hsl(0, 0%, 95%)` |
| Font | `'Cinzel'` (headings) + `'Inter'` (body) from Google Fonts |
| Border radius | `12px` cards, `8px` inputs |
| Shadow | Layered gold glow on hover |

**Aesthetic:** Dark museum-like theme — feels premium like a numismatic catalog.

---

## 🚀 GitHub Pages Deployment

### Option A: Deploy from `main` branch root (Simplest)
- Go to repo Settings → Pages → Source: `main` branch, `/ (root)`
- Every push to `main` auto-deploys

### Option B: GitHub Actions (Recommended for control)
```yaml
# .github/workflows/deploy.yml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./
```

### Admin Workflow (Adding new items)
```
1. Open admin.html → login
2. Upload image + fill metadata + tags
3. Click "Generate Entry"
4. Copy the JSON snippet → paste into data/collection.json
5. Save the downloaded image files to assets/images/
6. git add . → git commit -m "Add: [item name]" → git push
7. GitHub Pages auto-deploys within ~60 seconds
```

---

## 📅 Build Phases

### Phase 1 — Foundation & Gallery (Start here)
- [ ] Set up project folder structure
- [ ] Initialize Git repo, link to GitHub
- [ ] Create `collection.json` with 2–3 sample items
- [ ] Build `index.html` with design system CSS
- [ ] Build gallery grid with filter logic in JS

### Phase 2 — Filters & Lightbox
- [ ] Implement full filter sidebar (type, theme, continent, country)
- [ ] Live search functionality
- [ ] Lightbox image viewer with metadata

### Phase 3 — Admin Panel
- [ ] Build `admin.html` with password gate
- [ ] Upload form + image preview + tag system
- [ ] JSON entry generator + image downloader

### Phase 4 — Polish & Deploy
- [ ] Dark/light mode toggle
- [ ] Mobile responsive layout
- [ ] Configure GitHub Pages
- [ ] Set up `deploy.yml` GitHub Action
- [ ] Custom domain (optional)

---

## ❓ Open Questions for You

1. **Repo name**: Will the GitHub repo be `PV-Collection` or something else? (This affects the GitHub Pages URL: `username.github.io/repo-name`)
2. **Admin password**: What password would you like to use for the admin panel? (I'll hash it — you can tell me privately or I can use a placeholder)
3. **Initial items**: Do you have existing photos of your collection to add in Phase 1, or should I use placeholder sample data?
4. **Upgrade path**: Do you want the automated upload flow (GitHub Token + Actions) built in from the start, or start with the manual commit workflow?
5. **Domain**: Do you have a custom domain to point to GitHub Pages, or use the default `username.github.io`?
