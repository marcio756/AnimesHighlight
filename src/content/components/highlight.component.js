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
     * @param {string} currentLanguage - Active localization.
     */
    static apply(element, statusId, mediaType, currentLanguage) {
        if (!element || element.tagName === 'BODY' || element.tagName === 'HTML') return;
        if (element.classList.contains('mal-item-highlight')) return;

        // Universal UI Noise Filter: 
        // Prevents layout links (e.g., grid/list toggle buttons with FontAwesome/SVG) from being highlighted.
        const isLinkOrBtn = ['A', 'BUTTON'].includes(element.tagName);
        const hasIcon = element.querySelector('i, svg') !== null;
        const hasImage = element.querySelector('img') !== null;
        const textLength = element.textContent.replace(/\s+/g, '').length;

        if (isLinkOrBtn && hasIcon && !hasImage && textLength < 2) {
            return; // Aborts injection silently
        }

        // Resolve the best logical container for the highlight
        const cardContainer = this.findCard(element);
        const target = cardContainer || element;

        if (target.classList.contains('mal-item-highlight')) return;

        const styleInfo = STATUS_MAP[statusId];
        if (!styleInfo) return;

        let labelKey = styleInfo.labelKey;
        if (statusId === 1) {
            labelKey = (mediaType === 'manga') ? 'statusReading' : 'statusWatching';
        }

        const translatedLabel = I18nService.get(labelKey, currentLanguage);

        target.classList.add('mal-item-highlight', styleInfo.class);
        target.setAttribute('data-mal-label', translatedLabel);
        target.dataset.malStatus = statusId;
    }

    /**
     * Climbs the DOM tree using universal heuristics to find the best "Card" or "Header" wrapper.
     * Designed to be site-agnostic by looking for common structural web patterns.
     * @param {HTMLElement} element - The origin element where the text matched.
     * @returns {HTMLElement|null} The resolved card container.
     */
    static findCard(element) {
        let current = element;
        let attempts = 0;
        let bestSemanticMatch = null;

        // Universal dictionaries for structural classes used across the web
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

            // Path A: Perfect container match (e.g., an Article or Card that contains an image)
            if (hasImg && (isGenericCard || isSemanticTag || tagName === 'A')) {
                return current;
            }

            // Path B: Logical container without an image (saved as fallback)
            if ((isGenericCard || isSemanticTag) && !bestSemanticMatch) {
                bestSemanticMatch = current;
            }

            // Path C: Generic wrapper blocks that bundle the Title and the Image together (e.g., div.data, header)
            if (hasImg && ['DIV', 'SECTION', 'HEADER'].includes(tagName) && isWrapper) {
                return current;
            }

            current = current.parentElement;
            attempts++;
        }

        return bestSemanticMatch;
    }
}