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
            <div class="mal-control-row" style="flex-direction: column; align-items: stretch; gap: 8px; margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <select id="malStatusSelect" class="mal-status-dropdown">
                        <option value="watching">Watching</option>
                        <option value="completed">Completed</option>
                        <option value="on_hold">On Hold</option>
                        <option value="dropped">Dropped</option>
                        <option value="plan_to_watch">Plan to Watch</option>
                    </select>
                </div>
                <div id="malProgressWrap" style="display: none; justify-content: space-between; align-items: center; background: #2a2a2a; padding: 5px 8px; border-radius: 4px;">
                    <span id="malProgressText" style="font-size: 11px; color: #ddd; font-weight: bold;"></span>
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
        
        if (data && data.status) {
            // Map numeric status to MAL API string
            const statusMap = { 1: 'watching', 2: 'completed', 3: 'on_hold', 4: 'dropped', 6: 'plan_to_watch' };
            statusSelect.value = statusMap[data.status] || 'plan_to_watch';
            statusSelect.disabled = false;

            const mediaType = data.type || ContextAnalyzer.guessContentType();

            // Progress Controls Logic
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

            // Status Change Logic
            statusSelect.onchange = (e) => {
                const newStatus = e.target.value;
                statusSelect.disabled = true;
                chrome.runtime.sendMessage({
                    action: "UPDATE_PROGRESS",
                    id: data.id,
                    mediaType: mediaType,
                    data: { status: newStatus }
                }, (response) => {
                    statusSelect.disabled = false;
                    if (response && response.success) DataManager.invalidateCache();
                });
            };

        } else {
            statusSelect.innerHTML = `<option>${I18nService.get('statusNotInList', this.currentLanguage)}</option>`;
            statusSelect.disabled = true;
            progressWrap.style.display = 'none';
        }
        
        btn.onclick = () => {
            if (data && data.id) {
                const mediaType = data.type || ContextAnalyzer.guessContentType();
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