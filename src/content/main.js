/**
 * Main Controller Workflow
 * @description Initializes the extension observer and acts as the orchestrator between Data, UI, and Utilities.
 */

class MalController {
    constructor() {
        this.globalMediaMap = new Map();
        this.observer = null;
        this.debounceTimer = null;
        this.isSearching = false;
        this.isPanelEnabled = true; // Default state
    }

    /**
     * Bootstraps the highlighter logic. Retrieves user preferences before starting.
     */
    async init() {
        if (!PerformanceGuard.isRelevantPage()) return;
        
        try {
            // Retrieve User Settings
            const settings = await chrome.storage.local.get(['panelEnabled', 'panelTransparent']);
            this.isPanelEnabled = settings.panelEnabled !== false; // Defaults to true if undefined
            UIManager.setTransparency(settings.panelTransparent === true);

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
        if (!this.isPanelEnabled) return; // Prevent feature usage if disabled
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
                match = matchArray.find(m => m.type === currentMediaType) || matchArray[0];
            }

            if (match) {
                const card = UIManager.findCardContainer(element);
                if (card) UIManager.applyVisuals(card, match.status);
            }

            // Floating Panel Logic Guard
            if (this.isPanelEnabled && !foundMainItem && !isHomePage) {
                const tag = element.tagName;
                const isHead1 = tag === 'H1'; 
                const urlPath = pathName.toLowerCase().replace(/[^a-z0-9]/g, "");
                const titleClean = itemTitle.replace(/\s/g, "");
                
                const isInUrl = urlPath.includes(titleClean.replace(/-/g, "")) && titleClean.length > 5;
                
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

        if (this.isPanelEnabled && !foundMainItem && !isHomePage) {
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

        if (!foundMainItem) {
            setTimeout(() => { if (!foundMainItem) UIManager.hidePanel(); }, 500);
        }
    }

    /**
     * Initializes the MutationObserver to handle dynamically loaded content.
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