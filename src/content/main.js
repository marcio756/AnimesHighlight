// src/content/main.js

import { PerformanceGuard, ContextAnalyzer, TextNormalizer, Matcher, DynamicDebouncer, UI_BLOCKLIST, ProgressExtractor } from './utils.js';
import { SynonymDictionary, DataManager } from './data.js';
import { UIManager } from './ui.js';

class MalController {
    constructor() {
        this.globalMediaMap = new Map();
        this.mutationObserver = null;
        this.intersectionObserver = null;
        this.dynamicDebouncer = null;
        this.isSearching = false;
        this.isPanelEnabled = true; 
        this.activeHighlights = [1, 2, 3, 4, 5]; 
        
        this.autoUpdateProgress = false;
        this.autoUpdatedId = null;
    }

    async init() {
        if (!PerformanceGuard.isRelevantPage()) return;
        
        try {
            await SynonymDictionary.init(); 
            
            const settings = await chrome.storage.local.get();
            this.isPanelEnabled = settings.panelEnabled !== false; 
            this.autoUpdateProgress = settings.autoUpdateProgress === true;
            
            if (settings.highlightStatuses) {
                this.activeHighlights = settings.highlightStatuses;
            }

            UIManager.setTransparency(settings.panelTransparent === true);
            UIManager.setSavePosition(settings.savePanelPos === true);

            await UIManager.initLanguage();
            await UIManager.initTheming(); 

            // Escutador Reativo: Mantém as configurações sincronizadas sem precisar de dar F5 na página
            chrome.storage.onChanged.addListener((changes, area) => {
                if (area === 'local' && changes.autoUpdateProgress !== undefined) {
                    this.autoUpdateProgress = changes.autoUpdateProgress.newValue === true;
                    // Se a opção foi ativada agora mesmo e já estamos na página do episódio, força a verificação
                    if (this.autoUpdateProgress) {
                        const currentMediaType = ContextAnalyzer.guessContentType();
                        let panelVisible = document.getElementById('malControlPanel')?.classList.contains('visible') || false;
                        this.analyzeUrlForPanel(currentMediaType, panelVisible);
                    }
                }
            });

            this.globalMediaMap = await DataManager.getUserList();
            this.startObserver();
        } catch (e) {
            console.error("[MAL Highlighter] Init failed", e);
        }
    }

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
                for (const apiItem of response.results) {
                    if (apiItem.type !== currentMediaType) continue;

                    for (let [localTitle, localDataArray] of this.globalMediaMap.entries()) {
                        const foundInList = localDataArray.find(v => v.id === apiItem.mal_id && v.type === currentMediaType);
                        
                        if (foundInList) {
                            bestMatch = apiItem;
                            finalStatus = foundInList.status;
                            finalType = foundInList.type;
                            
                            if (cleanQuery !== localTitle && !Matcher.isFuzzyMatch(cleanQuery, localTitle)) {
                                SynonymDictionary.save(cleanQuery, localTitle);
                            }
                            
                            setTimeout(() => this.startObserver(), 200);
                            break;
                        }
                    }
                    if (bestMatch) break; 
                }

                if (!bestMatch) {
                    for (const apiItem of response.results) {
                        if (apiItem.type !== currentMediaType) continue;
                        
                        const apiTitleNorm = TextNormalizer.normalize(apiItem.title);
                        const apiTitleEngNorm = apiItem.title_english ? TextNormalizer.normalize(apiItem.title_english) : "";
                        
                        if (Matcher.isFuzzyMatch(cleanQuery, apiTitleNorm) || 
                           (apiTitleEngNorm && Matcher.isFuzzyMatch(cleanQuery, apiTitleEngNorm))) {
                            bestMatch = apiItem;
                            finalType = apiItem.type;
                            break;
                        }
                    }
                }
            }

            if (!bestMatch) {
                UIManager.showNotFoundPanel(cleanQuery);
                return;
            }

            UIManager.showPanel(bestMatch.title, { id: bestMatch.mal_id, status: finalStatus, type: finalType });
        });
    }

    startObserver() {
        if (!document.body) { setTimeout(() => this.startObserver(), 100); return; }
        
        const options = {
            root: null,
            rootMargin: "250px 0px 250px 0px", 
            threshold: 0
        };

        this.intersectionObserver = new IntersectionObserver((entries, observer) => {
            const isListingPage = ContextAnalyzer.isListingPage();
            const currentMediaType = ContextAnalyzer.guessContentType();
            let panelVisible = document.getElementById('malControlPanel')?.classList.contains('visible') || false;

            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    this.processElement(entry.target, isListingPage, currentMediaType, panelVisible);
                    observer.unobserve(entry.target); 
                }
            });
        }, options);

        this.dynamicDebouncer = new DynamicDebouncer(() => {
            const currentMediaType = ContextAnalyzer.guessContentType();
            let panelVisible = document.getElementById('malControlPanel')?.classList.contains('visible') || false;
            this.analyzeUrlForPanel(currentMediaType, panelVisible);
        });

        this.mutationObserver = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) { 
                        this.observeNewElements(node);
                    }
                });
            });
            this.dynamicDebouncer.trigger();
        });
        
        this.mutationObserver.observe(document.body, { childList: true, subtree: true });
        this.observeNewElements(document.body);
        this.dynamicDebouncer.trigger();
    }

    observeNewElements(rootNode) {
        const selector = 'a, h1, h2, h3, h4, h5, .title, .name, .serie, .serie-title, [class*="title"], [class*="nome"], article h3, li h3';
        
        if (rootNode.matches && rootNode.matches(selector)) {
             this.intersectionObserver.observe(rootNode);
        }
        
        if (rootNode.querySelectorAll) {
            const candidates = rootNode.querySelectorAll(selector);
            candidates.forEach(el => this.intersectionObserver.observe(el));
        }
    }

    processElement(element, isListingPage, currentMediaType, panelVisible) {
        if (element.closest('[data-mal-status]')) return;
        if (element.offsetParent === null) return; 
        
        const text = element.innerText || "";
        if (text.length < 3) return;
        
        const lowerText = text.toLowerCase();
        if (UI_BLOCKLIST.some(term => lowerText.includes(term))) return;

        const itemTitleRaw = TextNormalizer.normalize(text);
        if (!itemTitleRaw || itemTitleRaw.length < 3) return;

        const itemTitle = SynonymDictionary.resolve(itemTitleRaw);

        let matchArray = null;
        if (this.globalMediaMap.has(itemTitle)) {
            matchArray = this.globalMediaMap.get(itemTitle);
        } else {
            if (itemTitle.length < 150) {
                for (let [malTitle, dataArray] of this.globalMediaMap.entries()) {
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

        if (this.isPanelEnabled) {
            const tag = element.tagName;
            const isHead1 = tag === 'H1'; 
            const pathName = window.location.pathname;
            const urlPath = pathName.toLowerCase().replace(/[^a-z0-9]/g, "");
            const titleClean = itemTitle.replace(/\s/g, "");
            
            const isInUrl = urlPath.includes(titleClean.replace(/-/g, "")) && titleClean.length > 5;
            
            if ((isHead1 || isInUrl) && !element.closest('aside, footer, .sidebar, header, nav, .slider, .carousel')) {
                if (match && !document.getElementById('malControlPanel')?.classList.contains('visible')) {
                    UIManager.showPanel(match.rawTitle || text, match);
                }
            }
        }
    }

    /**
     * Tenta atualizar o MyAnimeList de forma assíncrona baseada na leitura do site atual
     */
    attemptAutoUpdate(match, currentMediaType) {
        if (!this.autoUpdateProgress || !match) return;
        if (this.autoUpdatedId === match.id) return; 

        const url = window.location.pathname;
        const title = document.title;

        const currentNum = ProgressExtractor.extract(url, currentMediaType) || ProgressExtractor.extract(title, currentMediaType);

        if (currentNum && currentNum > (match.progress || 0)) {
            console.log(`[MAL Highlighter] Auto-updating ${match.rawTitle} to ${currentMediaType === 'manga' ? 'Chapter' : 'Episode'} ${currentNum}`);
            this.autoUpdatedId = match.id; 

            const field = currentMediaType === 'anime' ? 'num_watched_episodes' : 'num_chapters_read';

            chrome.runtime.sendMessage({
                action: "UPDATE_PROGRESS",
                id: match.id,
                mediaType: currentMediaType,
                data: { [field]: currentNum }
            }, (response) => {
                if (response && response.success) {
                    match.progress = currentNum;
                    DataManager.invalidateCache();
                    
                    const progressText = document.getElementById('malProgressText');
                    if (progressText) {
                        const prefix = currentMediaType === 'manga' ? 'Ch' : 'Ep';
                        progressText.innerText = `${prefix}: ${currentNum}`;
                    }
                }
            });
        }
    }

    analyzeUrlForPanel(currentMediaType, panelVisible) {
        const urlTitle = TextNormalizer.getSlugFromUrl();
        if (!urlTitle || urlTitle.length <= 3) return false;

        const normUrlTitle = TextNormalizer.normalize(urlTitle);
        if (UI_BLOCKLIST.some(term => normUrlTitle.includes(term))) return false;

        const resolvedUrlTitle = SynonymDictionary.resolve(normUrlTitle);
        let matchArray = this.globalMediaMap.get(resolvedUrlTitle);
        
        if (!matchArray) {
            for (let [malTitle, dataArray] of this.globalMediaMap.entries()) {
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
        
        if (match) {
            this.attemptAutoUpdate(match, currentMediaType);
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
}

const app = new MalController();
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => app.init());
} else {
    app.init();
}