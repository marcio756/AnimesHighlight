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
        this.isPanelEnabled = true; 
    }

    async init() {
        if (!PerformanceGuard.isRelevantPage()) return;
        
        try {
            const settings = await chrome.storage.local.get(['panelEnabled', 'panelTransparent']);
            this.isPanelEnabled = settings.panelEnabled !== false; 
            UIManager.setTransparency(settings.panelTransparent === true);

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
        if (cleanQuery.length < 4) return;
        
        this.isSearching = true;
        document.body.style.cursor = 'wait';

        // O tipo de mídia inferido pelas tuas regras
        const currentMediaType = ContextAnalyzer.guessContentType();

        chrome.runtime.sendMessage({ 
            action: "SEARCH_ITEM", 
            title: cleanQuery
        }, (response) => {
            this.isSearching = false;
            document.body.style.cursor = 'default';
            
            if (response && response.success && response.results) {
                let bestMatch = null;
                let finalStatus = null;
                let finalType = null;

                // 1. Procurar nas respostas da API apenas itens que correspondam ao TIPO EXATO do site (Anime vs Manga)
                for (const apiItem of response.results) {
                    // Impede que um Anime seja aberto num site de Manga e vice-versa
                    if (apiItem.type !== currentMediaType) continue;

                    for (let [localTitle, localDataArray] of this.globalMediaMap.entries()) {
                        // Correspondência Estrita no tipo de ficheiro local
                        const foundInList = localDataArray.find(v => v.id === apiItem.mal_id && v.type === currentMediaType);
                        
                        if (foundInList) {
                            bestMatch = apiItem;
                            finalStatus = foundInList.status;
                            finalType = foundInList.type;
                            
                            // Auto-Aprendizagem de Sinónimos
                            if (cleanQuery !== localTitle && !Matcher.isFuzzyMatch(cleanQuery, localTitle)) {
                                SynonymDictionary.save(cleanQuery, localTitle);
                                console.log(`[MAL Highlighter] Learned synonym: "${cleanQuery}" -> "${localTitle}"`);
                                setTimeout(() => this.processPage(), 200);
                            }
                            break;
                        }
                    }
                    if (bestMatch) break; 
                }

                // Fallback de pesquisa: Se não tiver na lista, tenta mostrar a info geral no painel
                if (!bestMatch) {
                    for (const apiItem of response.results) {
                        const apiTitleNorm = TextNormalizer.normalize(apiItem.title);
                        if (apiItem.type === currentMediaType && Matcher.isFuzzyMatch(cleanQuery, apiTitleNorm)) {
                            bestMatch = apiItem;
                            finalType = apiItem.type;
                            break;
                        }
                    }
                }

                if (!bestMatch) return;

                UIManager.showPanel(bestMatch.title, { id: bestMatch.mal_id, status: finalStatus, type: finalType });
            }
        });
    }

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

            const itemTitleRaw = TextNormalizer.normalize(text);
            if (!itemTitleRaw || itemTitleRaw.length < 3) continue;

            const itemTitle = SynonymDictionary.resolve(itemTitleRaw);

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
                // Correspondência ESTRITA: Só aplica destaque se o tipo coincidir. 
                // Sem fallback para "|| matchArray[0]". Evita Chainsaw Man Anime a aparecer no Manga.
                match = matchArray.find(m => m.type === currentMediaType);
            }

            if (match) {
                const card = UIManager.findCardContainer(element);
                if (card) UIManager.applyVisuals(card, match.status);
            }

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
                         // Correspondência Estrita Fallback URL
                         match = matchArray.find(m => m.type === currentMediaType);
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

const app = new MalController();
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => app.init());
else app.init();