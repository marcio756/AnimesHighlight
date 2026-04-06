// src/content/main.js

import { PerformanceGuard, ContextAnalyzer, TextNormalizer, DynamicDebouncer, UI_BLOCKLIST, Matcher } from './utils.js';
import { SynonymDictionary, DataManager } from './data.js';
import { UIManager } from './ui.js';
import { ProgressService } from './services/progress.service.js';
import { MatcherService } from './services/matcher.service.js';
import { SearchService } from './services/search.service.js';
import { DOMObserver } from './core/dom.observer.js';

class MalController {
    constructor() {
        this.globalMediaMap = new Map();
        this.dynamicDebouncer = null;
        this.isSearching = false;
        
        this.isPanelEnabled = true; 
        this.activeHighlights = [1, 2, 3, 4, 6]; 
        this.autoUpdateProgress = false;
        this.autoDetectSeasons = false;

        this.progressService = new ProgressService();
        this.matcherService = null;
        this.domObserver = null;
    }

    async init() {
        if (!PerformanceGuard.isRelevantPage()) return;
        
        try {
            await SynonymDictionary.init(); 
            
            const settings = await chrome.storage.local.get();
            this.isPanelEnabled = settings.panelEnabled !== false; 
            this.autoUpdateProgress = settings.autoUpdateProgress === true;
            this.autoDetectSeasons = settings.autoDetectSeasons === true;
            
            if (settings.highlightStatuses) {
                this.activeHighlights = settings.highlightStatuses;
            }

            UIManager.setTransparency(settings.panelTransparent === true);
            UIManager.setSavePosition(settings.savePanelPos === true);

            await UIManager.initLanguage();
            await UIManager.initSettings(); 

            // Ouvinte de Eventos Globais do Painel Flutuante
            window.addEventListener('mal_entry_updated', (e) => {
                const { id, type, status } = e.detail;
                if (status) {
                    const parsedStatus = parseInt(status, 10);
                    if (this.activeHighlights.includes(parsedStatus)) {
                        UIManager.updateVisualsById(id, parsedStatus, type);
                    } else {
                        UIManager.removeVisualsById(id);
                    }
                }
            });

            chrome.storage.onChanged.addListener((changes, area) => {
                if (area === 'local' && changes.autoUpdateProgress !== undefined) {
                    this.autoUpdateProgress = changes.autoUpdateProgress.newValue === true;
                    if (this.autoUpdateProgress) {
                        const currentMediaType = ContextAnalyzer.guessContentType();
                        let panelVisible = document.getElementById('malControlPanel')?.classList.contains('visible') || false;
                        this.analyzeUrlForPanel(currentMediaType, panelVisible);
                    }
                }
            });

            this.globalMediaMap = await DataManager.getUserList();
            this.matcherService = new MatcherService(this.globalMediaMap);

            this.dynamicDebouncer = new DynamicDebouncer(() => {
                const currentMediaType = ContextAnalyzer.guessContentType();
                let panelVisible = document.getElementById('malControlPanel')?.classList.contains('visible') || false;
                this.analyzeUrlForPanel(currentMediaType, panelVisible);
            });

            this.domObserver = new DOMObserver(
                this.processElement.bind(this),
                () => this.dynamicDebouncer.trigger()
            );
            
            this.domObserver.start();

        } catch (e) {
            console.error("[MAL Highlighter] Init failed", e);
        }
    }

    processElement(element, isListingPage, currentMediaType, panelVisible) {
        if (element.closest('[data-mal-status]')) return;
        if (element.offsetParent === null) return; 
        
        let text = element.getAttribute('title') || element.getAttribute('aria-label') || element.innerText || "";
        if (text.length < 3) return;
        
        const lowerText = text.toLowerCase();
        if (UI_BLOCKLIST.some(term => lowerText.includes(term))) return;

        const match = this.matcherService.findMatch(text, currentMediaType);

        if (match) {
            const card = UIManager.findCardContainer(element);
            if (card && this.activeHighlights.includes(match.status)) {
                UIManager.applyVisuals(card, match.status, match.type, match.id);
            }
        }

        if (this.isPanelEnabled) {
            const tag = element.tagName;
            const isHead1 = tag === 'H1'; 
            const pathName = window.location.pathname;
            const urlPath = pathName.toLowerCase().replace(/[^a-z0-9]/g, "");
            
            const itemTitleRaw = TextNormalizer.normalize(text);
            const itemTitle = SynonymDictionary.resolve(itemTitleRaw);
            const titleClean = itemTitle.replace(/\s/g, "");
            
            const isInUrl = urlPath.includes(titleClean.replace(/-/g, "")) && titleClean.length > 5;
            
            if ((isHead1 || isInUrl) && !element.closest('aside, footer, .sidebar, header, nav, .slider, .carousel')) {
                if (match) {
                    this.progressService.attemptAutoUpdate(match, currentMediaType, this.autoUpdateProgress, this.autoDetectSeasons, this.isPanelEnabled); 
                    if (!document.getElementById('malControlPanel')?.classList.contains('visible')) {
                        UIManager.showPanel(match.rawTitle || text, match);
                    }
                }
            }
        }
    }

    analyzeUrlForPanel(currentMediaType, panelVisible) {
        const { match, urlTitle } = this.matcherService.matchFromUrl(currentMediaType);
        
        if (UI_BLOCKLIST.some(term => urlTitle && TextNormalizer.normalize(urlTitle).includes(term))) return false;

        if (match) {
            this.progressService.attemptAutoUpdate(match, currentMediaType, this.autoUpdateProgress, this.autoDetectSeasons, this.isPanelEnabled);
        }

        if (match && !panelVisible) {
            UIManager.showPanel(match.rawTitle || urlTitle, match);
            return true;
        } else if (!panelVisible && !ContextAnalyzer.isListingPage() && urlTitle) {
            this.searchAndShowPanel(urlTitle);
            return true;
        }

        return false;
    }

    async searchAndShowPanel(rawTitle) {
        if (!this.isPanelEnabled || this.isSearching) return; 
        if (document.getElementById('malControlPanel')?.classList.contains('visible')) return;
        
        this.isSearching = true;
        document.body.style.cursor = 'wait';

        const currentMediaType = ContextAnalyzer.guessContentType();
        const result = await SearchService.findExternalMatch(rawTitle, currentMediaType, this.globalMediaMap);

        this.isSearching = false;
        document.body.style.cursor = 'default';

        if (!result || result.notFound) {
            UIManager.showNotFoundPanel(result ? result.cleanQuery : rawTitle);
            return;
        }

        UIManager.showPanel(result.title, { id: result.id, status: result.status, type: result.type });
    }
}

const app = new MalController();
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => app.init());
} else {
    app.init();
}