/**
 * UI Presentation Layer
 * @description Manages all DOM manipulations, CSS injections, and floating panel generation.
 */

class UIManager {
    static isPanelTransparent = false;

    /**
     * Sets the transparency behavior flag based on user settings.
     * @param {boolean} transparent - True if the panel should be semi-transparent when idle.
     */
    static setTransparency(transparent) {
        this.isPanelTransparent = transparent;
    }

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
        
        // Handle transparency state driven by user settings
        if (this.isPanelTransparent) {
            panel.classList.add('mal-panel-transparent');
        } else {
            panel.classList.remove('mal-panel-transparent');
        }

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