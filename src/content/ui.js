/**
 * UI Presentation Layer
 * @description Manages all DOM manipulations, CSS injections, and floating panel generation.
 */

class UIManager {
    static isPanelTransparent = false;
    static currentLanguage = 'en';
    static savePanelPosition = false;

    static async initLanguage() {
        this.currentLanguage = await I18nService.getCurrentLang();
    }

    static setTransparency(transparent) {
        this.isPanelTransparent = transparent;
    }
    
    static setSavePosition(savePos) {
        this.savePanelPosition = savePos;
    }

    /**
     * Applies visuals with context-aware labels (Watch vs Read).
     */
    static applyVisuals(element, statusId, mediaType) {
        if (element.classList.contains('mal-item-highlight')) return;
        const styleInfo = STATUS_MAP[statusId];
        if (!styleInfo) return;

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
            <div class="mal-panel-header" id="malPanelTitle" title="Drag to move">Loading...</div>
            <div class="mal-control-row" style="justify-content: space-between; margin-bottom: 15px;">
                <span id="malStatusText" style="font-size: 12px; color: #aaa; font-weight: 600;">${I18nService.get('statusChecking', this.currentLanguage)}</span>
                <div id="malProgressWrap" style="display: none; align-items: center; gap: 5px;">
                    <span id="malProgressText" style="font-size: 11px; color: #ddd;"></span>
                    <button id="malQuickAddBtn" class="mal-mini-btn" title="${I18nService.get('btnQuickAdd', this.currentLanguage)}">+</button>
                </div>
            </div>
            <button class="mal-update-btn" id="malOpenBtn">${I18nService.get('panelOpenBtn', this.currentLanguage)}</button>
        `;
        document.body.appendChild(panel);
        
        const header = document.getElementById('malPanelTitle');
        DraggableService.init(panel, header, this.savePanelPosition);
    }

    static async showPanel(itemName, data) {
        await this.createPanel();
        const panel = document.getElementById('malControlPanel');
        const titleEl = document.getElementById('malPanelTitle');
        const statusEl = document.getElementById('malStatusText');
        const btn = document.getElementById('malOpenBtn');
        const progressWrap = document.getElementById('malProgressWrap');
        const progressText = document.getElementById('malProgressText');
        const quickAddBtn = document.getElementById('malQuickAddBtn');
        
        titleEl.innerText = itemName.substring(0, 30) + (itemName.length > 30 ? '...' : '');
        
        if (data && data.status && STATUS_MAP[data.status]) {
            const styleInfo = STATUS_MAP[data.status];
            
            let labelKey = styleInfo.labelKey;
            const mediaType = data.type || ContextAnalyzer.guessContentType();
            if (data.status === 1) {
                labelKey = (mediaType === 'manga') ? 'statusReading' : 'statusWatching';
            }

            statusEl.innerText = I18nService.get(labelKey, this.currentLanguage);
            statusEl.style.color = styleInfo.color;

            // Integrar Controlador de Progresso e Quick-Add
            if (data.progress !== undefined) {
                const prefix = mediaType === 'manga' ? 'Ch' : 'Ep';
                progressText.innerText = `${prefix}: ${data.progress}`;
                progressWrap.style.display = 'flex';
                
                // Evita acumular Listeners e permite isolar a função
                const newBtn = quickAddBtn.cloneNode(true);
                quickAddBtn.parentNode.replaceChild(newBtn, quickAddBtn);
                
                newBtn.onclick = () => {
                    newBtn.disabled = true;
                    newBtn.innerText = '...';
                    const nextVal = data.progress + 1;
                    
                    chrome.runtime.sendMessage({
                        action: "UPDATE_PROGRESS",
                        id: data.id,
                        mediaType: mediaType,
                        progress: nextVal
                    }, (response) => {
                        if (response && response.success) {
                            data.progress = nextVal;
                            progressText.innerText = `${prefix}: ${nextVal}`;
                            newBtn.innerText = '✓';
                            DataManager.invalidateCache(); // Força renovação da cache ao próximo recarregamento
                            setTimeout(() => { newBtn.innerText = '+'; newBtn.disabled = false; }, 2000);
                        } else {
                            newBtn.innerText = 'X';
                            newBtn.title = "OAuth Login Required";
                            setTimeout(() => { newBtn.innerText = '+'; newBtn.disabled = false; }, 3000);
                        }
                    });
                };
            } else {
                progressWrap.style.display = 'none';
            }

        } else {
            statusEl.innerText = I18nService.get('statusNotInList', this.currentLanguage);
            statusEl.style.color = "#aaa";
            progressWrap.style.display = 'none';
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