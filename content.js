/**
 * Content Script - MAL Highlighter v35.0 (Strict Heuristics & Data Grouping)
 * * Architectural Changes:
 * 1. DataManager: Map values are now Arrays to prevent Key Collisions between Animes and Mangas with identical names.
 * 2. MalController: Implemented strict HomePageGuard to prevent floating panel on index pages.
 * 3. Contextual Resolving: The script now selects the correct media type from the matched array based on the site's context.
 */

const CONFIG = {
    CACHE_KEY: 'mal_v35_full_list', 
    CACHE_DURATION: 1000 * 60 * 15,
    DEBOUNCE_DELAY: 500,
    SITE_KEYWORDS: [
        'anime', 'manga', 'donghua', 'episodio', 'episode', 'season', 
        'temporada', 'assistir', 'online', 'legendado', 'dublado', 'stream',
        'ler', 'capitulo', 'chapter', 'manhwa', 'comic', 'scan'
    ]
};

const UI_BLOCKLIST = [
    "selecione um", "player de video", "comentarios", "relacionados", 
    "episodios", "lancamentos", "parceiros", "dmca", "termos", 
    "login", "registrar", "assistir", "online", "download", 
    "animes online", "todos os direitos", "copyright", "proximo episodio",
    "episodio anterior", "lista de animes", "generos", "contato",
    "filmes", "animes", "donghuas", "calendario", "mangas", "ler manga"
];

const STATUS_MAP = {
    1: { class: 'mal-watching', label: 'CURRENT', color: '#2db039' }, 
    2: { class: 'mal-completed', label: 'COMPLETED', color: '#26448f' },
    3: { class: 'mal-hold', label: 'ON HOLD', color: '#f1c83e' },
    4: { class: 'mal-dropped', label: 'DROPPED', color: '#a12f31' },
    6: { class: 'mal-plan', label: 'PLANNED', color: '#787878' }
};

// --- MODULES (SERVICE LAYER) ---

class PerformanceGuard {
    /**
     * Validates if the current web page context is related to anime or manga.
     * Prevents the script from wasting CPU cycles on irrelevant websites.
     * @returns {boolean} True if the page context matches the keywords.
     */
    static isRelevantPage() {
        const url = window.location.href.toLowerCase();
        if (url.includes('myanimelist')) return false; 

        const title = document.title.toLowerCase();
        const metaDesc = document.querySelector('meta[name="description"]')?.content.toLowerCase() || "";
        
        const hasKeyword = CONFIG.SITE_KEYWORDS.some(kw => 
            title.includes(kw) || metaDesc.includes(kw) || url.includes(kw)
        );

        if (!hasKeyword) {
            console.log("[MAL Highlighter] Script inativo: Página não relacionada a animes/mangas.");
        }
        return hasKeyword;
    }
}

class ContextAnalyzer {
    /**
     * Infers the type of media (anime or manga) based on the URL and page title keywords.
     * Crucial for deciding which MyAnimeList profile to open when names collide.
     * @returns {string} The inferred media type: 'anime' or 'manga'.
     */
    static guessContentType() {
        const url = window.location.href.toLowerCase();
        const title = document.title.toLowerCase();
        const fullContext = url + title;

        const mangaKeywords = ['manga', 'manhwa', 'comic', 'ler', 'read', 'capitulo', 'chapter', 'scan'];
        
        if (mangaKeywords.some(kw => fullContext.includes(kw))) {
            return 'manga';
        }
        return 'anime';
    }
}

class TextNormalizer {
    /**
     * Strips punctuation, accents, and irrelevant keywords to create a clean string for fuzzy matching.
     * @param {string} str - The raw title string extracted from the DOM.
     * @returns {string} The normalized string.
     */
    static normalize(str) {
        if (!str || str.length < 3) return "";
        
        let clean = String(str).toLowerCase();
        clean = clean.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); 
        clean = clean.replace(/\b(episodio|episode|ep|e|capitulo|cap|chapter|ch)\s*[0-9]+\b/g, " "); 
        clean = clean.replace(/\b([0-9]+)(st|nd|rd|th)\b/g, "$1"); 
        clean = clean.replace(/\s+-\s+/g, " "); 
        clean = clean.replace(/[\[\]\(\)\_\.]/g, " "); 
        
        const ignoreRegex = /\b(tv|movie|legendado|leg|dublado|dubbed|dub|filme|filmes|animes|anime|manga|mangas|manhwa|[0-9]+ª|online|ver|assistir|ler|season|temp|parte|part|net|com|br|org|hd|fhd|4k|q1n)\b/g;
        clean = clean.replace(ignoreRegex, " ");

        clean = clean.replace(/[^a-z0-9\s\-]/g, "").replace(/\s+/g, " ").trim();
        if (clean.endsWith('-')) clean = clean.slice(0, -1);
        
        return clean.trim();
    }

    /**
     * Extracts a potential title from the URL path as a fallback mechanism.
     * @returns {string|null} The extracted slug or null if invalid.
     */
    static getSlugFromUrl() {
        const path = window.location.pathname;
        const segments = path.split('/').filter(p => p.length > 0);
        if (segments.length === 0) return null;
        
        const lastSegment = segments[segments.length - 1].toLowerCase();
        if (UI_BLOCKLIST.includes(lastSegment) || /page\d+/.test(lastSegment)) return null;

        return lastSegment.replace(/-/g, ' ');
    }
}

class DataManager {
    /**
     * Retrieves the stored MAL username.
     * @returns {Promise<string>} The username.
     */
    static async getUsername() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['malUsername'], (result) => {
                resolve(result.malUsername || 'marcio756');
            });
        });
    }

    /**
     * Fetches and caches the user's combined list (Anime & Manga).
     * Groups identical titles into an array to prevent key collision overrides.
     * @returns {Promise<Map<string, Array<Object>>>} A Map where the key is the normalized title and the value is an array of media objects.
     */
    static async getUserList() {
        const USERNAME = await this.getUsername();
        const cached = localStorage.getItem(CONFIG.CACHE_KEY);

        if (cached) {
            try {
                const { timestamp, data, owner } = JSON.parse(cached);
                if ((Date.now() - timestamp < CONFIG.CACHE_DURATION) && owner === USERNAME) {
                    return new Map(data);
                }
            } catch (e) { localStorage.removeItem(CONFIG.CACHE_KEY); }
        }
        
        return await new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: "FETCH_MAL_LIST", username: USERNAME }, (response) => {
                const newMap = new Map();
                if (response && response.success && Array.isArray(response.data)) {
                    response.data.forEach(item => {
                        if (!item || !item.title) return;
                        
                        const normTitle = TextNormalizer.normalize(item.title);
                        
                        // Initialize array if it doesn't exist for this title
                        if (!newMap.has(normTitle)) {
                            newMap.set(normTitle, []);
                        }

                        // Push the item to handle title collisions (e.g., Anime and Manga with the exact same name)
                        newMap.get(normTitle).push({
                            status: item.status,
                            id: item.id,
                            score: item.score,
                            rawTitle: item.title,
                            type: item.type 
                        });
                    });
                    localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify({
                        timestamp: Date.now(),
                        owner: USERNAME,
                        data: Array.from(newMap.entries())
                    }));
                }
                resolve(newMap);
            });
        });
    }
}

class Matcher {
    /**
     * Performs a fuzzy string comparison to match DOM titles with MAL titles.
     * @param {string} siteTitle - The normalized title from the website.
     * @param {string} malTitle - The normalized title from MyAnimeList.
     * @returns {boolean} True if the strings are a likely match.
     */
    static isFuzzyMatch(siteTitle, malTitle) {
        if (siteTitle === malTitle) return true;

        if (malTitle.includes(siteTitle) || siteTitle.includes(malTitle)) {
            if (Math.abs(malTitle.length - siteTitle.length) <= 4) return true;
        }

        const cleanToken = t => t.replace(/-/g, '');
        const tokensSite = siteTitle.split(' ').filter(t => t.length > 1).map(cleanToken);
        const tokensMal = malTitle.split(' ').filter(t => t.length > 1).map(cleanToken);
        
        if (tokensSite.length === 0 || tokensMal.length === 0) return false;

        let matches = 0;
        tokensSite.forEach(token => {
            if (tokensMal.includes(token)) matches++;
        });

        if (tokensSite.length >= 5 && matches === tokensSite.length) return true;

        const allTokens = new Set([...tokensSite, ...tokensMal]);
        const ratio = matches / allTokens.size;

        if (tokensMal.length < 3) return ratio >= 1.0;
        
        const allMalTokensPresent = tokensMal.every(t => tokensSite.includes(t));
        if (allMalTokensPresent && tokensMal.length >= 3) return ratio >= 0.6;

        return ratio >= 0.75;
    }
}

class UIManager {
    /**
     * Applies the appropriate CSS classes and dataset attributes for visual highlighting.
     * @param {HTMLElement} element - The DOM element to highlight.
     * @param {number} statusId - The MAL status ID.
     */
    static applyVisuals(element, statusId) {
        if (element.classList.contains('mal-item-highlight')) return;
        const styleInfo = STATUS_MAP[statusId];
        if (!styleInfo) return;

        element.classList.add('mal-item-highlight', styleInfo.class);
        element.setAttribute('data-mal-label', styleInfo.label);
        element.dataset.malStatus = statusId;
    }

    /**
     * Traverses up the DOM tree from a title element to find the logical "Card" container.
     * @param {HTMLElement} titleElement - The text element that matched a list item.
     * @returns {HTMLElement|null} The container element, or null if not found.
     */
    static findCardContainer(titleElement) {
        let current = titleElement.parentElement;
        let attempts = 0;
        
        while (current && attempts < 5) {
            if (current.dataset.malStatus) return current;

            const hasImg = current.querySelector('img') || 
                           current.querySelector('.cover, .poster, .thumb, .contentImg') ||
                           (current.style.backgroundImage && current.style.backgroundImage !== 'none');

            const isCardTag = ['ARTICLE', 'LI', 'DIV'].includes(current.tagName);
            
            const hasCardClass = current.className.includes('item') || 
                                 current.className.includes('card') || 
                                 current.className.includes('poster');

            if ((hasImg || (isCardTag && hasCardClass)) && current.tagName !== 'BODY') {
                if (current.offsetWidth < window.innerWidth * 0.95) return current;
            }
            current = current.parentElement;
            attempts++;
        }
        return null;
    }

    /**
     * Creates and injects the floating control panel into the DOM.
     */
    static async createPanel() {
        if (document.getElementById('malControlPanel')) return;
        
        const lang = await I18nService.getCurrentLang();
        
        const panel = document.createElement('div');
        panel.id = 'malControlPanel';
        panel.className = 'mal-control-panel';
        panel.innerHTML = `
            <div class="mal-panel-header" id="malPanelTitle">Loading...</div>
            <div class="mal-control-row" style="justify-content: center; margin-bottom: 15px;">
                <span id="malStatusText" style="font-size: 12px; color: #aaa; font-weight: 600;">${I18nService.get('statusChecking', lang)}</span>
            </div>
            <button class="mal-update-btn" id="malOpenBtn">${I18nService.get('panelOpenBtn', lang)}</button>
        `;
        document.body.appendChild(panel);
    }

    /**
     * Populates the floating panel with the relevant item data and displays it.
     * @param {string} itemName - The title of the item.
     * @param {Object} data - The matched item data object.
     */
    static async showPanel(itemName, data) {
        await this.createPanel();
        const lang = await I18nService.getCurrentLang();
        
        const panel = document.getElementById('malControlPanel');
        const titleEl = document.getElementById('malPanelTitle');
        const statusEl = document.getElementById('malStatusText');
        const btn = document.getElementById('malOpenBtn');
        
        titleEl.innerText = itemName.substring(0, 30) + (itemName.length > 30 ? '...' : '');
        
        if (data && data.status && STATUS_MAP[data.status]) {
            statusEl.innerText = STATUS_MAP[data.status].label;
            statusEl.style.color = STATUS_MAP[data.status].color;
        } else {
            statusEl.innerText = I18nService.get('statusNotInList', lang);
            statusEl.style.color = "#aaa";
        }
        
        btn.onclick = () => {
            if (data && data.id) {
                const mediaType = data.type || ContextAnalyzer.guessContentType();
                window.open(`https://myanimelist.net/${mediaType}/${data.id}`, '_blank');
            } else {
                alert("Item not found on MyAnimeList.");
            }
        };
        
        panel.classList.add('visible');
    }

    /**
     * Hides the floating control panel.
     */
    static hidePanel() {
        const panel = document.getElementById('malControlPanel');
        if (panel) panel.classList.remove('visible');
    }
}

// --- MAIN CONTROLLER ---

class MalController {
    constructor() {
        this.globalMediaMap = new Map();
        this.observer = null;
        this.debounceTimer = null;
        this.isSearching = false;
    }

    /**
     * Bootstraps the highlighter logic.
     */
    async init() {
        if (!PerformanceGuard.isRelevantPage()) return;
        
        try {
            this.globalMediaMap = await DataManager.getUserList();
            this.startObserver();
        } catch (e) {
            console.error("[MAL Highlighter] Init failed", e);
        }
    }

    /**
     * Queries the Jikan API as a fallback when an item appears to be the main focus but is not in the local map.
     * @param {string} rawTitle - The extracted title from the DOM.
     */
    searchAndShowPanel(rawTitle) {
        if (this.isSearching) return;
        if (document.getElementById('malControlPanel')?.classList.contains('visible')) return;
        
        const cleanQuery = TextNormalizer.normalize(rawTitle);
        if (cleanQuery.length < 4) return;
        
        this.isSearching = true;
        document.body.style.cursor = 'wait';

        const currentMediaType = ContextAnalyzer.guessContentType();

        chrome.runtime.sendMessage({ 
            action: "SEARCH_ITEM", 
            title: cleanQuery,
            itemType: currentMediaType 
        }, (response) => {
            this.isSearching = false;
            document.body.style.cursor = 'default';
            
            if (response && response.success && response.results) {
                let bestMatch = null;
                for (const item of response.results) {
                    const itemTitleNorm = TextNormalizer.normalize(item.title);
                    if (Matcher.isFuzzyMatch(cleanQuery, itemTitleNorm)) {
                        bestMatch = item;
                        break; 
                    }
                }

                if (!bestMatch) return;

                let finalStatus = null;
                // Look up in our local map to see if the API result exists in the user's list
                for (let [key, valArray] of this.globalMediaMap.entries()) {
                    const found = valArray.find(v => v.id === bestMatch.mal_id && v.type === currentMediaType);
                    if (found) {
                        finalStatus = found.status;
                        break;
                    }
                }
                UIManager.showPanel(bestMatch.title, { id: bestMatch.mal_id, status: finalStatus, type: currentMediaType });
            }
        });
    }

    /**
     * Analyzes the DOM to find titles, highlight cards, and detect the "main" item being viewed.
     */
    processPage() {
        const selector = 'a, h1, h2, h3, h4, h5, .title, .name, [class*="title"], [class*="nome"], article h3, li h3';
        const candidates = document.querySelectorAll(selector);
        
        let panelVisible = document.getElementById('malControlPanel')?.classList.contains('visible');
        let foundMainItem = panelVisible; 

        let processedCount = 0;
        const PROCESS_LIMIT = 500; 
        
        // Context variables for smart matching
        const currentMediaType = ContextAnalyzer.guessContentType();
        const pathName = window.location.pathname;
        const isHomePage = pathName === '/' || pathName.length < 3; 

        for (const element of candidates) {
            if (processedCount > PROCESS_LIMIT) break;
            
            if (element.closest('[data-mal-status]')) continue;
            if (element.offsetParent === null) continue; 
            
            const text = element.innerText || "";
            if (text.length < 3) continue;
            
            const lowerText = text.toLowerCase();
            if (UI_BLOCKLIST.some(term => lowerText.includes(term))) continue;

            const itemTitle = TextNormalizer.normalize(text);
            if (!itemTitle || itemTitle.length < 3) continue;

            processedCount++;

            // Extract the matching array of objects (could contain both Anime and Manga versions)
            let matchArray = null;
            if (this.globalMediaMap.has(itemTitle)) {
                matchArray = this.globalMediaMap.get(itemTitle);
            } else {
                if (itemTitle.length < 50) {
                    for (let [malTitle, dataArray] of this.globalMediaMap) {
                        if (Matcher.isFuzzyMatch(itemTitle, malTitle)) {
                            matchArray = dataArray;
                            break;
                        }
                    }
                }
            }

            let match = null;
            if (matchArray && matchArray.length > 0) {
                // Heuristic: Prefer the list item that matches the website's context (e.g. Manga item on a Manga reader)
                match = matchArray.find(m => m.type === currentMediaType) || matchArray[0];
            }

            // Highlighting Phase
            if (match) {
                const card = UIManager.findCardContainer(element);
                if (card) UIManager.applyVisuals(card, match.status);
            }

            // Main Item Detection Phase (Floating Panel Logic)
            if (!foundMainItem && !isHomePage) {
                const tag = element.tagName;
                const isHead1 = tag === 'H1'; // Strict requirement: Must be H1 to prevent false positives on sliders/carousels
                const urlPath = pathName.toLowerCase().replace(/[^a-z0-9]/g, "");
                const titleClean = itemTitle.replace(/\s/g, "");
                
                const isInUrl = urlPath.includes(titleClean.replace(/-/g, "")) && titleClean.length > 5;
                
                // Exclude elements inside common non-main areas
                if ((isHead1 || isInUrl) && !element.closest('aside, footer, .sidebar, header, nav, .slider, .carousel')) {
                    if (match && !panelVisible) {
                        UIManager.showPanel(text, match);
                        foundMainItem = true;
                    } else if (!match && !panelVisible && isInUrl) {
                        this.searchAndShowPanel(text);
                        foundMainItem = true;
                    }
                }
            }
        }

        // URL Fallback Phase: If DOM parsing failed to find a main item, guess from the URL slug
        if (!foundMainItem && !isHomePage) {
            const urlTitle = TextNormalizer.getSlugFromUrl();
            if (urlTitle && urlTitle.length > 3) {
                const normUrlTitle = TextNormalizer.normalize(urlTitle);
                if (!UI_BLOCKLIST.some(term => normUrlTitle.includes(term))) {
                     
                     let matchArray = this.globalMediaMap.get(normUrlTitle);
                     if (!matchArray) {
                         for (let [malTitle, dataArray] of this.globalMediaMap) {
                             if (Matcher.isFuzzyMatch(normUrlTitle, malTitle)) {
                                 matchArray = dataArray;
                                 break;
                             }
                         }
                     }

                     let match = null;
                     if (matchArray && matchArray.length > 0) {
                         match = matchArray.find(m => m.type === currentMediaType) || matchArray[0];
                     }
                     
                     if (match && !panelVisible) {
                         UIManager.showPanel(urlTitle, match);
                         foundMainItem = true;
                     } else if (!panelVisible) {
                         this.searchAndShowPanel(urlTitle);
                         foundMainItem = true;
                     }
                }
            }
        }

        // Hide panel if user navigates back to a homepage dynamically (SPA support)
        if (!foundMainItem) {
            setTimeout(() => { if (!foundMainItem) UIManager.hidePanel(); }, 500);
        }
    }

    /**
     * Initializes the MutationObserver to handle dynamically loaded content (Infinite Scroll, SPAs).
     */
    startObserver() {
        if (!document.body) { setTimeout(() => this.startObserver(), 100); return; }
        
        this.processPage();

        if (this.observer) this.observer.disconnect();
        this.observer = new MutationObserver((mutations) => {
            if (this.debounceTimer) clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => { this.processPage(); }, CONFIG.DEBOUNCE_DELAY);
        });
        
        this.observer.observe(document.body, { childList: true, subtree: true });
    }
}

// --- BOOT PROCESS ---
const app = new MalController();
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => app.init());
} else {
    app.init();
}