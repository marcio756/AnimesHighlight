// src/content/main.js

/**
 * Main Controller Workflow
 * @description Initializes the extension observer and acts as the orchestrator between Data, UI, Utilities, and Dictionary.
 */

class MalController {
    constructor() {
        this.globalMediaMap = new Map();
        this.observer = null;
        this.debounceTimer = null;
        this.isSearching = false;
        this.isPanelEnabled = true; 
        this.activeHighlights = [1, 2, 3, 4, 6]; 
    }

    /**
     * Bootstraps the highlighter logic. Retrieves user preferences before starting.
     */
    async init() {
        if (!PerformanceGuard.isRelevantPage()) return;
        
        try {
            await SynonymDictionary.init(); 
            
            const settings = await chrome.storage.local.get(['panelEnabled', 'panelTransparent', 'savePanelPos', 'highlightStatuses']);
            this.isPanelEnabled = settings.panelEnabled !== false; 
            
            if (settings.highlightStatuses) {
                this.activeHighlights = settings.highlightStatuses;
            }

            UIManager.setTransparency(settings.panelTransparent === true);
            UIManager.setSavePosition(settings.savePanelPos === true);

            await UIManager.initLanguage();
            await UIManager.initTheming(); // NOVO: Injeta as cores personalizadas do utilizador

            this.globalMediaMap = await DataManager.getUserList();
            this.startObserver();
        } catch (e) {
            console.error("[MAL Highlighter] Init failed", e);
        }
    }

    /**
     * Queries the Jikan API as a fallback when an item appears to be the main focus but is not in the local map.
     */
    searchAndShowPanel(rawTitle) {
        if (!this.isPanelEnabled) return; 
        if (this.isSearching) return;
        if (document.getElementById('malControlPanel')?.classList.contains('visible')) return;
        
        const cleanQuery = TextNormalizer.normalize(rawTitle);
        if (cleanQuery.length < 3) return;
        
        this.isSearching = true;
        document.body.style.cursor = 'wait';

        const currentMediaType = ContextAnalyzer.guessContentType();

        chrome.runtime.sendMessage({ 
            action: "SEARCH_ITEM", 
            title: cleanQuery
        }, (response) => {
            this.isSearching = false;
            document.body.style.cursor = 'default';
            
            let bestMatch = null;
            let finalStatus = null;
            let finalType = null;

            if (response && response.success && response.results) {
                // 1. Try to find a match in the local list first
                for (const apiItem of response.results) {
                    if (apiItem.type !== currentMediaType) continue;

                    for (let [localTitle, localDataArray] of this.globalMediaMap.entries()) {
                        const foundInList = localDataArray.find(v => v.id === apiItem.mal_id && v.type === currentMediaType);
                        
                        if (foundInList) {
                            bestMatch = apiItem;
                            finalStatus = foundInList.status;
                            finalType = foundInList.type;
                            
                            // Self-learning synonym logic
                            if (cleanQuery !== localTitle && !Matcher.isFuzzyMatch(cleanQuery, localTitle)) {
                                SynonymDictionary.save(cleanQuery, localTitle);
                            }
                            
                            setTimeout(() => this.processPage(), 200);
                            break;
                        }
                    }
                    if (bestMatch) break; 
                }

                // 2. Fallback: Validate Jikan results instead of blindly trusting them
                if (!bestMatch) {
                    for (const apiItem of response.results) {
                        if (apiItem.type !== currentMediaType) continue;
                        
                        const apiTitleNorm = TextNormalizer.normalize(apiItem.title);
                        const apiTitleEngNorm = apiItem.title_english ? TextNormalizer.normalize(apiItem.title_english) : "";
                        
                        // We check if the returned API title actually matches our extracted slug
                        if (Matcher.isFuzzyMatch(cleanQuery, apiTitleNorm) || 
                           (apiTitleEngNorm && Matcher.isFuzzyMatch(cleanQuery, apiTitleEngNorm))) {
                            bestMatch = apiItem;
                            finalType = apiItem.type;
                            break;
                        }
                    }
                }
            }

            // 3. Handle Empty Results (Not Found on MAL or Rejected by FuzzyMatch)
            if (!bestMatch) {
                UIManager.showNotFoundPanel(cleanQuery);
                return;
            }

            UIManager.showPanel(bestMatch.title, { id: bestMatch.mal_id, status: finalStatus, type: finalType });
        });
    }

    /**
     * Analyzes the DOM to orchestrate highlighting and panel triggering.
     */
    processPage() {
        const isListingPage = ContextAnalyzer.isListingPage();
        const currentMediaType = ContextAnalyzer.guessContentType();
        
        let panelVisible = document.getElementById('malControlPanel')?.classList.contains('visible') || false;
        
        let foundMainItem = this.scanDomElements(isListingPage, currentMediaType, panelVisible);

        if (this.isPanelEnabled && !foundMainItem) {
            foundMainItem = this.analyzeUrlForPanel(currentMediaType, panelVisible);
        }

        if (!foundMainItem) {
            setTimeout(() => { if (!foundMainItem) UIManager.hidePanel(); }, 500);
        }
    }

    /**
     * Scans DOM candidates, applying borders and potentially triggering the info panel ONLY if strictly matched.
     */
    scanDomElements(isListingPage, currentMediaType, panelVisible) {
        const selector = 'a, h1, h2, h3, h4, h5, .title, .name, .serie, .serie-title, [class*="title"], [class*="nome"], article h3, li h3';
        const candidates = document.querySelectorAll(selector);
        
        let foundMainItem = panelVisible;
        let processedCount = 0;
        const PROCESS_LIMIT = 500; 
        const pathName = window.location.pathname;

        for (const element of candidates) {
            if (processedCount > PROCESS_LIMIT) break;
            if (element.closest('[data-mal-status]')) continue;
            if (element.offsetParent === null) continue; 
            
            const text = element.innerText || "";
            if (text.length < 3) continue;
            
            const lowerText = text.toLowerCase();
            if (UI_BLOCKLIST.some(term => lowerText.includes(term))) continue;

            const itemTitleRaw = TextNormalizer.normalize(text);
            if (!itemTitleRaw || itemTitleRaw.length < 3) continue;

            const itemTitle = SynonymDictionary.resolve(itemTitleRaw);
            processedCount++;

            let matchArray = null;
            if (this.globalMediaMap.has(itemTitle)) {
                matchArray = this.globalMediaMap.get(itemTitle);
            } else {
                if (itemTitle.length < 150) {
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
                match = matchArray.find(m => m.type === currentMediaType);
            }

            if (match) {
                const card = UIManager.findCardContainer(element);
                if (card && this.activeHighlights.includes(match.status)) {
                    UIManager.applyVisuals(card, match.status, match.type);
                }
            }

            if (this.isPanelEnabled && !foundMainItem) {
                const tag = element.tagName;
                const isHead1 = tag === 'H1'; 
                const urlPath = pathName.toLowerCase().replace(/[^a-z0-9]/g, "");
                const titleClean = itemTitle.replace(/\s/g, "");
                
                const isInUrl = urlPath.includes(titleClean.replace(/-/g, "")) && titleClean.length > 5;
                
                if ((isHead1 || isInUrl) && !element.closest('aside, footer, .sidebar, header, nav, .slider, .carousel')) {
                    if (match && !panelVisible) {
                        UIManager.showPanel(match.rawTitle || text, match);
                        foundMainItem = true;
                    }
                }
            }
        }
        return foundMainItem;
    }

    /**
     * Checks if the URL slug corresponds to an anime/manga to force-open the panel.
     */
    analyzeUrlForPanel(currentMediaType, panelVisible) {
        const urlTitle = TextNormalizer.getSlugFromUrl();
        if (!urlTitle || urlTitle.length <= 3) return false;

        const normUrlTitle = TextNormalizer.normalize(urlTitle);
        if (UI_BLOCKLIST.some(term => normUrlTitle.includes(term))) return false;

        const resolvedUrlTitle = SynonymDictionary.resolve(normUrlTitle);
        let matchArray = this.globalMediaMap.get(resolvedUrlTitle);
        
        if (!matchArray) {
            for (let [malTitle, dataArray] of this.globalMediaMap) {
                if (Matcher.isFuzzyMatch(resolvedUrlTitle, malTitle)) {
                    matchArray = dataArray;
                    break;
                }
            }
        }

        let match = null;
        if (matchArray && matchArray.length > 0) {
            match = matchArray.find(m => m.type === currentMediaType);
        }
        
        if (match && !panelVisible) {
            UIManager.showPanel(match.rawTitle || urlTitle, match);
            return true;
        } else if (!panelVisible && !ContextAnalyzer.isListingPage()) {
            this.searchAndShowPanel(urlTitle);
            return true;
        }

        return false;
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