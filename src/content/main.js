// src/content/main.js

import { PerformanceGuard, ContextAnalyzer, TextNormalizer, DynamicDebouncer, isUiNoise, Matcher } from './utils.js';
import { SynonymDictionary, ManualMappingManager, DataManager } from './data.js';
import { UIManager } from './ui.js';
import { sendMessage } from './messaging.js';
import { ProgressService } from './services/progress.service.js';
import { MatcherService } from './services/matcher.service.js';
import { SearchService } from './services/search.service.js';
import { DOMObserver } from './core/dom.observer.js';

class MalController {
    constructor() {
        this.globalMediaMap = new Map();
        this.dynamicDebouncer = null;
        this.isSearching = false;
        this.lastUrl = null;
        
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
            await ManualMappingManager.init();
            
            const settings = await chrome.storage.local.get(['panelEnabled', 'autoUpdateProgress', 'autoDetectSeasons', 'highlightStatuses', 'panelTransparent', 'savePanelPos']);
            this.isPanelEnabled = settings.panelEnabled !== false; 
            this.autoUpdateProgress = settings.autoUpdateProgress === true;
            this.autoDetectSeasons = settings.autoDetectSeasons === true;
            
            if (settings.highlightStatuses) {
                this.activeHighlights = settings.highlightStatuses;
            }

            UIManager.setTransparency(settings.panelTransparent === true);
            UIManager.setSavePosition(settings.savePanelPos === true);
            UIManager.setAutoDetectSeasons(this.autoDetectSeasons);

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
                if (area === 'local' && changes.autoDetectSeasons !== undefined) {
                    this.autoDetectSeasons = changes.autoDetectSeasons.newValue === true;
                    UIManager.setAutoDetectSeasons(this.autoDetectSeasons);
                }
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
                // Navegação SPA: ao mudar de URL o painel anterior deixa de ser válido
                if (window.location.href !== this.lastUrl) {
                    if (this.lastUrl !== null) UIManager.hidePanel();
                    this.lastUrl = window.location.href;
                }
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
        
        if (isUiNoise(text)) return;

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
                        this.showPanelFor(match.rawTitle || text, match);
                    }
                }
            }
        }
    }

    analyzeUrlForPanel(currentMediaType, panelVisible) {
        const { match, urlTitle } = this.matcherService.matchFromUrl(currentMediaType);
        
        if (urlTitle && isUiNoise(urlTitle)) return false;

        if (match) {
            this.progressService.attemptAutoUpdate(match, currentMediaType, this.autoUpdateProgress, this.autoDetectSeasons, this.isPanelEnabled);
        }

        if (match && !panelVisible) {
            this.showPanelFor(match.rawTitle || urlTitle, match);
            return true;
        } else if (!panelVisible && !ContextAnalyzer.isListingPage() && urlTitle) {
            this.searchAndShowPanel(urlTitle);
            return true;
        }

        return false;
    }

    /**
     * Shows the panel; when the current page is manually mapped to this entry, offers an "unlink" action.
     */
    showPanelFor(title, data) {
        const key = TextNormalizer.normalize(TextNormalizer.getSlugFromUrl());
        const mapped = ManualMappingManager.get(key);
        const isManual = mapped && data && mapped.id === data.id && mapped.type === data.type;
        UIManager.showPanel(title, data, isManual ? () => this.unlinkManually(key, data) : null);
    }

    /**
     * Removes a manual mapping (wrong association) and re-runs the normal lookup for this page.
     */
    async unlinkManually(key, data) {
        await ManualMappingManager.remove(key);
        UIManager.removeVisualsById(data.id);
        UIManager.hidePanel();
        const urlTitle = TextNormalizer.getSlugFromUrl();
        if (urlTitle) this.searchAndShowPanel(urlTitle);
    }

    /**
     * Saves a user-provided mapping (MAL URL, id or name) for the given site title.
     * @returns {Promise<boolean>} true if the mapping was resolved and saved.
     */
    async linkManually(cleanQuery, input, mediaType) {
        const response = await new Promise(resolve =>
            sendMessage({ action: "RESOLVE_MAL_LINK", input, mediaType }, resolve));
        if (chrome.runtime.lastError || !response || !response.success) return false;

        const { id, type, title, total } = response.data;
        await ManualMappingManager.save(cleanQuery, { id, type, title, total });

        let status = null;
        for (const arr of this.globalMediaMap.values()) {
            const found = arr.find(v => v.id === id && v.type === type);
            if (found) { status = found.status; break; }
        }
        this.showPanelFor(title, { id, status, type, total });
        return true;
    }

    async searchAndShowPanel(rawTitle) {
        if (!this.isPanelEnabled || this.isSearching) return; 
        if (document.getElementById('malControlPanel')?.classList.contains('visible')) return;
        
        this.isSearching = true;

        const currentMediaType = ContextAnalyzer.guessContentType();
        const result = await SearchService.findExternalMatch(rawTitle, currentMediaType, this.globalMediaMap);

        this.isSearching = false;

        if (!result || result.notFound) {
            const cleanQuery = result ? result.cleanQuery : TextNormalizer.normalize(rawTitle);
            UIManager.showNotFoundPanel(cleanQuery, (input) => this.linkManually(cleanQuery, input, currentMediaType));
            return;
        }

        this.showPanelFor(result.title, { id: result.id, status: result.status, type: result.type, total: result.total });
    }
}

const app = new MalController();
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => app.init());
} else {
    app.init();
}