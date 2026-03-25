/**
 * UI Presentation Layer
 * @description Manages all DOM manipulations, CSS injections, and floating panel generation.
 */

class UIManager {
    static isPanelTransparent = false;
    static currentLanguage = 'en';

    static async initLanguage() {
        this.currentLanguage = await I18nService.getCurrentLang();
    }

    static setTransparency(transparent) {
        this.isPanelTransparent = transparent;
    }

    /**
     * Applies visuals with context-aware labels (Watch vs Read).
     */
    static applyVisuals(element, statusId, mediaType) {
        if (element.classList.contains('mal-item-highlight')) return;
        const styleInfo = STATUS_MAP[statusId];
        if (!styleInfo) return;

        // Lógica de Contexto: Se for status 1 (Watching), decide entre Watch ou Read
        let labelKey = styleInfo.labelKey;
        if (statusId === 1) {
            labelKey = (mediaType === 'manga') ? 'statusReading' : 'statusWatching';
        }

        const translatedLabel = I18nService.get(labelKey, this.currentLanguage);

        element.classList.add('mal-item-highlight', styleInfo.class);
        element.setAttribute('data-mal-label', translatedLabel);
        element.dataset.malStatus = statusId;
    }

    static findCardContainer(titleElement) {
        let current = titleElement.parentElement;
        let attempts = 0;
        while (current && attempts < 5) {
            if (current.dataset.malStatus) return current;
            const hasImg = current.querySelector('img') || 
                           current.querySelector('.cover, .poster, .thumb, .contentImg') ||
                           (current.style.backgroundImage && current.style.backgroundImage !== 'none');
            const isCardTag = ['ARTICLE', 'LI', 'DIV'].includes(current.tagName);
            const hasCardClass = current.className.includes('item') || current.className.includes('card') || current.className.includes('poster');
            if ((hasImg || (isCardTag && hasCardClass)) && current.tagName !== 'BODY') {
                if (current.offsetWidth < window.innerWidth * 0.95) return current;
            }
            current = current.parentElement;
            attempts++;
        }
        return null;
    }

    static async createPanel() {
        if (document.getElementById('malControlPanel')) return;
        const panel = document.createElement('div');
        panel.id = 'malControlPanel';
        panel.className = 'mal-control-panel';
        panel.innerHTML = `
            <div class="mal-panel-header" id="malPanelTitle">Loading...</div>
            <div class="mal-control-row" style="justify-content: center; margin-bottom: 15px;">
                <span id="malStatusText" style="font-size: 12px; color: #aaa; font-weight: 600;">${I18nService.get('statusChecking', this.currentLanguage)}</span>
            </div>
            <button class="mal-update-btn" id="malOpenBtn">${I18nService.get('panelOpenBtn', this.currentLanguage)}</button>
        `;
        document.body.appendChild(panel);
    }

    static async showPanel(itemName, data) {
        await this.createPanel();
        const panel = document.getElementById('malControlPanel');
        const titleEl = document.getElementById('malPanelTitle');
        const statusEl = document.getElementById('malStatusText');
        const btn = document.getElementById('malOpenBtn');
        
        titleEl.innerText = itemName.substring(0, 30) + (itemName.length > 30 ? '...' : '');
        
        if (data && data.status && STATUS_MAP[data.status]) {
            const styleInfo = STATUS_MAP[data.status];
            
            // Lógica de Contexto também no Painel Flutuante
            let labelKey = styleInfo.labelKey;
            const mediaType = data.type || ContextAnalyzer.guessContentType();
            if (data.status === 1) {
                labelKey = (mediaType === 'manga') ? 'statusReading' : 'statusWatching';
            }

            statusEl.innerText = I18nService.get(labelKey, this.currentLanguage);
            statusEl.style.color = styleInfo.color;
        } else {
            statusEl.innerText = I18nService.get('statusNotInList', this.currentLanguage);
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
        
        if (this.isPanelTransparent) panel.classList.add('mal-panel-transparent');
        else panel.classList.remove('mal-panel-transparent');

        panel.classList.add('visible');
    }

    static hidePanel() {
        const panel = document.getElementById('malControlPanel');
        if (panel) panel.classList.remove('visible');
    }
}