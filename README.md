# 🌟 Universal MAL Highlighter

Highlight anime and manga on **any** streaming/reading website based on your [MyAnimeList](https://myanimelist.net/) list, get notified when new episodes or chapters come out, and update your progress without leaving the page.

Free, open source, no ads, no tracking.

---

## ✨ Features

### 🎨 Universal highlighting
* Detects anime/manga titles on any website and tags the card with your MAL status: **Watching/Reading, Completed, On Hold, Dropped, Plan to Watch/Read**.
* Choose which statuses are highlighted and pick a **custom color for each one**.
* Works on infinite-scroll and single-page sites (DOM observer, only processes what is on screen, chunked so it never freezes the page).
* Skips sites that are not about anime/manga (YouTube, social networks, shops, …) to save CPU.

### 🧠 Smart title matching
* Several layers: exact → fuzzy → **synonym dictionary** (English/alternative titles from Jikan) → **season chains** (finds "Season 3" through prequel/sequel relations).
* Understands season/part/cour markers, roman numerals, and noise words such as *dubbed*, *legendado*, *HD*, …
* **Manual link / unlink:** if a title is not recognized (or is wrong), paste a MAL link, ID or name to associate it permanently.

### 🪟 Floating quick-action panel
* Appears on the series page you are visiting. Draggable, optionally **transparent** and **remembers its position**.
* Change **status**, **score (1-10)** and **progress** (`-` / `+` / typed value) straight from the site, synced to MAL.
* **Add to your list** directly from the panel when the title is not in it yet.
* **Auto-update progress** (optional): reads the episode/chapter number from the page URL/title and updates MAL for you.
* **Auto-detect next season** (optional): if you go past the last episode of a season, the progress moves to the sequel (e.g. episode 14 of a 12-episode season → episode 2 of season 2).
* One-click **Open on MyAnimeList** / **Search on MAL**.

### 🔔 Release monitor
* Add as many sites as you want (a "latest releases" page works best); they are checked **every 15 minutes** in the background.
* Desktop notifications with **Watch Now** and **Mark as Seen** (updates MAL) buttons.
* Badge with the number of unread releases, a **History** tab with per-site filter, and a countdown to the next check.
* Finds the exact episode/chapter link on the site when possible.

### ☁️ Cloud sync (optional)
* Sign in with Google to back up and sync settings, monitored sites and manual links across devices. Everything works without signing in.

### ⚙️ Other
* **English and Portuguese** (follows your browser language by default).
* **Light and dark** themes.
* Welcome page on first install.
* **OAuth2 + PKCE** login with MyAnimeList for write access (progress, status, score). Reading your list needs no login, but **your MAL list must be public**.

---

## 🚀 Install

### Option A – Browser store (recommended once published)
Install from the Edge Add-ons / Chrome Web Store page (links will be added here when available).

### Option B – Manual install (Chrome, Edge, Brave, Opera, …)
1. Open the [Releases page](../../releases) and download the latest `MAL_Highlighter_vX.X.X.zip`.
2. Unzip it into a folder (the folder must contain `manifest.json` directly).
3. Go to `chrome://extensions` (or `edge://extensions`), enable **Developer mode**, click **Load unpacked** and select the folder.
4. Click the extension icon, type your MyAnimeList username and press **Verify & Save**.

> Keep the folder: the browser loads the extension from it. To update, download the new zip, replace the files and click *Reload* on the extensions page.

---

## 🛠️ Development

```bash
npm install
npm run build      # bundles the content script into dist/content.bundle.js
npm test           # unit tests (title matching, release detection)
npm run package    # build + creates release/MAL_Highlighter_vX.Y.Z.zip
```

**Releasing:** bump `version` in `manifest.json` and `package.json`, commit, then `git tag vX.Y.Z && git push --tags`. The GitHub Action in `.github/workflows/release.yml` builds the zip and publishes the Release.

**Setup for your own fork:** create a MyAnimeList app of type *other* (no client secret) and put its Client ID in `src/background/services/auth.service.js`; register `https://<extension-id>.chromiumapp.org/` as redirect URI in MAL and in your Google Cloud OAuth client; publish `firestore.rules` in your Firebase project.

* **Manifest V3**, vanilla JavaScript (ES modules), only dependency is `esbuild` (dev).
* `src/background` – service worker (MAL/Jikan API, monitor, notifications, cloud sync)
* `src/content` – highlighting, matching, floating panel
* `src/popup` – settings UI · `src/welcome` – first-run page · `src/common` – i18n and shared helpers

## 🔒 Privacy

See [PRIVACY.md](PRIVACY.md). In short: no analytics, no ads; data only goes to MyAnimeList, Jikan (title lookups) and, **only if you sign in**, to your own Firebase sync document.

## ⚠️ Known limitations
* The monitor reads the site's HTML; pages that need JavaScript to render or that are behind anti-bot protection (e.g. Cloudflare challenge) cannot be monitored.
* Matching is heuristic: unusual site titles may need a manual link.
* Jikan (the unofficial MAL API) is rate limited, so the first synonym sync of a big list can take a while.

## 📄 License
MIT — see [LICENSE](LICENSE). Not affiliated with MyAnimeList.
