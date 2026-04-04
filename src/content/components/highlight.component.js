// src/content/components/highlight.component.js

import { I18nService } from '../../common/i18n.js';
import { STATUS_MAP } from '../utils.js';

export class HighlightComponent {
    /**
     * Injects custom CSS classes and pseudo-element data tags for highlighted items.
     * Includes a universal UI noise filter to prevent highlighting structural buttons.
     * @param {HTMLElement} element - The target element.
     * @param {number} statusId - MAL status ID.
     * @param {string} mediaType - 'anime' or 'manga'.
     * @param {number} mediaId - The MAL ID for the entry.
     * @param {string} currentLanguage - Active localization.
     */
    static apply(element, statusId, mediaType, mediaId, currentLanguage) {
        if (!element || element.tagName === 'BODY' || element.tagName === 'HTML') return;

        // Universal UI Noise Filter
        const isLinkOrBtn = ['A', 'BUTTON'].includes(element.tagName);
        const hasIcon = element.querySelector('i, svg') !== null;
        const hasImage = element.querySelector('img') !== null;
        const textLength = element.textContent.replace(/\s+/g, '').length;

        if (isLinkOrBtn && hasIcon && !hasImage && textLength < 2) {
            return; 
        }

        const cardContainer = this.findCard(element);
        const target = cardContainer || element;

        // Aborta se já estiver realçado COM O MESMO ESTADO, poupando processamento no scroll.
        if (target.classList.contains('mal-item-highlight') && target.dataset.malStatus == statusId) return;

        const styleInfo = STATUS_MAP[statusId];
        if (!styleInfo) return;

        let labelKey = styleInfo.labelKey;
        if (statusId === 1) {
            labelKey = (mediaType === 'manga') ? 'statusReading' : 'statusWatching';
        }

        const translatedLabel = I18nService.get(labelKey, currentLanguage);

        // Remove classes antigas antes de aplicar as novas (vital para as atualizações reativas)
        Object.values(STATUS_MAP).forEach(map => target.classList.remove(map.class));

        target.classList.add('mal-item-highlight', styleInfo.class);
        target.setAttribute('data-mal-label', translatedLabel);
        target.dataset.malStatus = statusId;
        target.dataset.malId = mediaId;
    }

    /**
     * Procura todos os elementos na página vinculados a este ID e força a atualização visual.
     */
    static updateAllById(mediaId, newStatusId, mediaType, currentLanguage) {
        const elements = document.querySelectorAll(`[data-mal-id="${mediaId}"]`);
        elements.forEach(el => this.apply(el, newStatusId, mediaType, mediaId, currentLanguage));
    }

    /**
     * Remove todos os traços visuais da extensão de um elemento.
     */
    static removeAllById(mediaId) {
        const elements = document.querySelectorAll(`[data-mal-id="${mediaId}"]`);
        elements.forEach(target => {
            Object.values(STATUS_MAP).forEach(map => target.classList.remove(map.class));
            target.classList.remove('mal-item-highlight');
            target.removeAttribute('data-mal-label');
            delete target.dataset.malStatus;
            delete target.dataset.malId;
        });
    }

    static findCard(element) {
        let current = element;
        let attempts = 0;
        let bestSemanticMatch = null;

        const cardClasses = ['item', 'card', 'post', 'entry', 'box', 'cover', 'thumb'];
        const wrapperClasses = ['wrap', 'info', 'data', 'head', 'detail', 'content'];

        while (current && attempts < 8) {
            if (current.dataset && current.dataset.malStatus) return current;

            const tagName = current.tagName;
            if (tagName === 'BODY' || tagName === 'HTML') break;

            const classStr = (typeof current.className === 'string') ? current.className.toLowerCase() : '';
            
            const hasImg = current.querySelector('img') !== null || 
                           (current.style && current.style.backgroundImage && current.style.backgroundImage !== 'none');

            const isGenericCard = cardClasses.some(c => classStr.includes(c));
            const isWrapper = wrapperClasses.some(c => classStr.includes(c));
            const isSemanticTag = ['ARTICLE', 'LI', 'FIGURE'].includes(tagName);

            if (hasImg && (isGenericCard || isSemanticTag || tagName === 'A')) {
                return current;
            }

            if ((isGenericCard || isSemanticTag) && !bestSemanticMatch) {
                bestSemanticMatch = current;
            }

            if (hasImg && ['DIV', 'SECTION', 'HEADER'].includes(tagName) && isWrapper) {
                return current;
            }

            current = current.parentElement;
            attempts++;
        }

        return bestSemanticMatch;
    }
}