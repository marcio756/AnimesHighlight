// src/content/ui.js

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

    /**
     * Initializes custom CSS variables for user-defined themes.
     * Prevents heavy style injections by updating the root properties.
     */
    static async initTheming() {
        const res = await chrome.storage.local.get(['customColors']);
        if (res.customColors) {
            const root = document.documentElement;
            if (res.customColors[1]) root.style.setProperty('--mal-color-1', res.customColors[1]);
            if (res.customColors[2]) root.style.setProperty('--mal-color-2', res.customColors[2]);
            if (res.customColors[3]) root.style.setProperty('--mal-color-3', res.customColors[3]);
            if (res.customColors[4]) root.style.setProperty('--mal-color-4', res.customColors[4]);
            if (res.customColors[6]) root.style.setProperty('--mal-color-6', res.customColors[6]);
        }
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

        // 1. Vai buscar o tema inicial da storage
        chrome.storage.local.get(['theme'], (res) => {
            panel.setAttribute('data-theme', res.theme || 'light');
        });

        // 2. Escuta mudanças em tempo real se o utilizador clicar no popup
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && changes.theme) {
                const p = document.getElementById('malControlPanel');
                if (p) p.setAttribute('data-theme', changes.theme.newValue);
            }
        });

        // NOTA: As cores estáticas do fundo (#2a2a2a) e do texto (#ddd) foram
        // substituídas por variáveis CSS para garantirem legibilidade dinâmica.
        panel.innerHTML = `
            <div class="mal-panel-header" id="malPanelTitle" title="Drag to move">Loading...</div>
            <div class="mal-control-row" style="flex-direction: column; align-items: stretch; gap: 8px; margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <select id="malStatusSelect" class="mal-status-dropdown"></select>
                </div>
                <div id="malProgressWrap" style="display: none; justify-content: space-between; align-items: center; background: var(--mal-progress-bg); padding: 5px 8px; border-radius: 4px;">
                    <span id="malProgressText" style="font-size: 11px; color: var(--mal-panel-text); font-weight: bold;"></span>
                    <div style="display: flex; gap: 4px;">
                        <button id="malQuickDecBtn" class="mal-mini-btn" style="background: #a12f31;">-</button>
                        <button id="malQuickAddBtn" class="mal-mini-btn" style="background: #2db039;">+</button>
                    </div>
                </div>
            </div>
            <button class="mal-update-btn" id="malOpenBtn">${I18nService.get('panelOpenBtn', this.currentLanguage)}</button>
        `;
        document.body.appendChild(panel);
        
        const header = document.getElementById('malPanelTitle');
        DraggableService.init(panel, header, this.savePanelPosition);
    }

    /**
     * Renders the panel specifically for items that returned 0 results from the Jikan API.
     * @param {string} itemName - The title that was searched.
     */
    static async showNotFoundPanel(itemName) {
        await this.createPanel();
        const panel = document.getElementById('malControlPanel');
        const titleEl = document.getElementById('malPanelTitle');
        const statusSelect = document.getElementById('malStatusSelect');
        const btn = document.getElementById('malOpenBtn');
        const progressWrap = document.getElementById('malProgressWrap');
        
        titleEl.innerText = itemName.substring(0, 30) + (itemName.length > 30 ? '...' : '');
        
        statusSelect.innerHTML = `<option value="" disabled selected>${I18nService.get('statusNotFoundMal', this.currentLanguage)}</option>`;
        statusSelect.disabled = true;
        progressWrap.style.display = 'none';
        
        btn.innerText = I18nService.get('btnSearchMal', this.currentLanguage);
        btn.onclick = () => {
            window.open(`https://myanimelist.net/search/all?q=${encodeURIComponent(itemName)}`, '_blank');
        };
        
        panel.classList.toggle('mal-panel-transparent', this.isPanelTransparent);
        panel.classList.add('visible');
    }

    static async showPanel(itemName, data) {
        await this.createPanel();
        const panel = document.getElementById('malControlPanel');
        const titleEl = document.getElementById('malPanelTitle');
        const statusSelect = document.getElementById('malStatusSelect');
        const btn = document.getElementById('malOpenBtn');
        const progressWrap = document.getElementById('malProgressWrap');
        const progressText = document.getElementById('malProgressText');
        const quickAddBtn = document.getElementById('malQuickAddBtn');
        const quickDecBtn = document.getElementById('malQuickDecBtn');
        
        titleEl.innerText = itemName.substring(0, 30) + (itemName.length > 30 ? '...' : '');
        
        const mediaType = data?.type || ContextAnalyzer.guessContentType();
        const watchingLabel = mediaType === 'manga' ? 'statusReading' : 'statusWatching';

        statusSelect.innerHTML = `
            ${!data?.status ? `<option value="" disabled selected>${I18nService.get('statusAddToList', this.currentLanguage)}</option>` : ''}
            <option value="watching">${I18nService.get(watchingLabel, this.currentLanguage)}</option>
            <option value="completed">${I18nService.get('statusCompleted', this.currentLanguage)}</option>
            <option value="on_hold">${I18nService.get('statusOnHold', this.currentLanguage)}</option>
            <option value="dropped">${I18nService.get('statusDropped', this.currentLanguage)}</option>
            <option value="plan_to_watch">${I18nService.get('statusPlanned', this.currentLanguage)}</option>
        `;
        statusSelect.disabled = false;

        if (data && data.status) {
            const statusMap = { 1: 'watching', 2: 'completed', 3: 'on_hold', 4: 'dropped', 6: 'plan_to_watch' };
            statusSelect.value = statusMap[data.status] || 'plan_to_watch';

            if (data.progress !== undefined) {
                const prefix = mediaType === 'manga' ? 'Ch' : 'Ep';
                const field = mediaType === 'manga' ? 'num_chapters_read' : 'num_watched_episodes';
                
                progressText.innerText = `${prefix}: ${data.progress}`;
                progressWrap.style.display = 'flex';
                
                const updateProgress = (newVal) => {
                    if (newVal < 0) return;
                    quickAddBtn.disabled = true;
                    quickDecBtn.disabled = true;
                    
                    chrome.runtime.sendMessage({
                        action: "UPDATE_PROGRESS",
                        id: data.id,
                        mediaType: mediaType,
                        data: { [field]: newVal }
                    }, (response) => {
                        if (response && response.success) {
                            data.progress = newVal;
                            progressText.innerText = `${prefix}: ${newVal}`;
                            DataManager.invalidateCache();
                        }
                        quickAddBtn.disabled = false;
                        quickDecBtn.disabled = false;
                    });
                };

                quickAddBtn.onclick = () => updateProgress(data.progress + 1);
                quickDecBtn.onclick = () => updateProgress(data.progress - 1);
            } else {
                progressWrap.style.display = 'none';
            }
        } else {
            progressWrap.style.display = 'none';
        }

        statusSelect.onchange = (e) => {
            const newStatus = e.target.value;
            if (!newStatus) return;

            statusSelect.disabled = true;
            chrome.runtime.sendMessage({
                action: "UPDATE_PROGRESS",
                id: data.id,
                mediaType: mediaType,
                data: { status: newStatus }
            }, (response) => {
                statusSelect.disabled = false;
                if (response && response.success) {
                    DataManager.invalidateCache();
                }
            });
        };
        
        btn.innerText = I18nService.get('panelOpenBtn', this.currentLanguage);
        btn.onclick = () => {
            if (data && data.id) {
                window.open(`https://myanimelist.net/${mediaType}/${data.id}`, '_blank');
            }
        };
        
        panel.classList.toggle('mal-panel-transparent', this.isPanelTransparent);
        panel.classList.add('visible');
    }

    static hidePanel() {
        const panel = document.getElementById('malControlPanel');
        if (panel) panel.classList.remove('visible');
    }
}