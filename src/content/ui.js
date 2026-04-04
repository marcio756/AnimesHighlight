// src/content/ui.js

/**
 * UI Facade Manager
 * @description Orchestrates the presentation layer components (Panel and Highlights).
 */
import { I18nService } from '../common/i18n.js';
import { HighlightComponent } from './components/highlight.component.js';
import { PanelComponent } from './components/panel.component.js';

export class GlobalProgressUI {
    static start() {
        const bar = document.getElementById('globalProgress');
        if (bar) bar.classList.add('loading');
    }

    static stop() {
        const bar = document.getElementById('globalProgress');
        if (bar) bar.classList.remove('loading');
    }
}

export class UIManager {
    static isPanelTransparent = false;
    static currentLanguage = 'en';
    static savePanelPosition = false;

    /**
     * Initializes global locale context.
     */
    static async initLanguage() {
        this.currentLanguage = await I18nService.getCurrentLang();
    }

    /**
     * Configures global settings and dynamic CSS variables.
     */
    static async initSettings() {
        const res = await chrome.storage.local.get(['customColors']);
        
        if (res.customColors) {
            const root = document.documentElement;
            if (res.customColors[1]) root.style.setProperty('--mal-color-1', res.customColors[1]);
            if (res.customColors[2]) root.style.setProperty('--mal-color-2', res.customColors[2]);
            if (res.customColors[3]) root.style.setProperty('--mal-color-3', res.customColors[3]);
            if (res.customColors[4]) root.style.setProperty('--mal-color-4', res.customColors[4]);
            if (res.customColors[5]) root.style.setProperty('--mal-color-6', res.customColors[5]);
        }
    }

    static setTransparency(transparent) { 
        this.isPanelTransparent = transparent; 
    }
    
    static setSavePosition(savePos) { 
        this.savePanelPosition = savePos; 
    }

    /**
     * Builds the configuration object to be passed down to UI components.
     */
    static getConfig() {
        return {
            language: this.currentLanguage,
            transparent: this.isPanelTransparent,
            savePosition: this.savePanelPosition
        };
    }

    // --- Component Bindings ---

    static applyVisuals(element, statusId, mediaType, mediaId) {
        HighlightComponent.apply(element, statusId, mediaType, mediaId, this.currentLanguage);
    }

    static updateVisualsById(mediaId, newStatusId, mediaType) {
        HighlightComponent.updateAllById(mediaId, newStatusId, mediaType, this.currentLanguage);
    }

    static removeVisualsById(mediaId) {
        HighlightComponent.removeAllById(mediaId);
    }

    static findCardContainer(titleElement) {
        return HighlightComponent.findCard(titleElement);
    }

    static async showNotFoundPanel(itemName) {
        await PanelComponent.showNotFound(itemName, this.getConfig());
    }

    static async showPanel(itemName, data) {
        await PanelComponent.show(itemName, data, this.getConfig());
    }

    static hidePanel() {
        PanelComponent.hide();
    }
}