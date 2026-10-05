# Privacy Policy – Universal MAL Highlighter

_Last updated: 2026-10-05_

Universal MAL Highlighter does not collect analytics, does not show ads and does not sell or share data. The developer runs no server that receives your browsing data.

## What the extension reads
* **Pages you visit:** on pages that look related to anime/manga, the extension reads titles, links and the URL **locally in your browser** to match them with your list. Pages on well-known unrelated sites (social networks, video platforms, shops, …) are ignored.
* **Sites you add to the monitor:** the extension downloads those pages periodically, without cookies, and compares them with your active list locally.

## What is stored (on your device, `chrome.storage.local`)
MyAnimeList username, cached list, settings, monitored sites, manual title links, notification history and, if you log in to MAL, the OAuth access/refresh tokens.

## Third parties contacted
| Service | Why | Data sent |
|---|---|---|
| MyAnimeList (`myanimelist.net`, `api.myanimelist.net`) | Read your public list; update status/score/progress after you log in | Your username; OAuth tokens (only to MAL) |
| Jikan (`api.jikan.moe`) | Look up titles, synonyms, sequels | Title text taken from the page or your list |
| Google / Firebase (optional) | Cloud sync, only if you press *Login* in Settings | Google account ID/e-mail and your synced settings |

## Your control
* Log out of cloud sync or remove the extension at any time; uninstalling deletes local data.
* Delete synced data by contacting the developer (open an issue in the GitHub repository).
* The extension never sells data and never uses it for advertising or credit decisions.

## Contact
Open an issue at https://github.com/marcio756/AnimesHighlight/issues.
