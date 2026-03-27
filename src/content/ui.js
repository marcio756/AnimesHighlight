/**
 * UI Presentation Layer
 * @description Manages all DOM manipulations, CSS injections, and floating panel generation.
 * Features Optimistic UI updates and Premium Glassmorphism design.
 */
import { I18nService } from '../common/i18n.js';
import { STATUS_MAP, ContextAnalyzer } from './utils.js';
import { DataManager } from './data.js';
import { DraggableService } from './drag.js';

export class UIManager {
    static isPanelTransparent = false;
    static currentLanguage = 'en';
    static savePanelPosition = false;

    static async initLanguage() {
        this.currentLanguage = await I18nService.getCurrentLang();
    }

    static async initTheming() {
        const res = await chrome.storage.local.get(['customColors']);
        if (res.customColors) {
            const root = document.documentElement;
            // Mapeia para as novas variáveis do design premium
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
            
            const isCardTag = ['DIV', 'ARTICLE', 'LI', 'A', 'SECTION', 'UL'].includes(current.tagName);
            const hasCardClass = current.className.includes('item') || current.className.includes('card') || current.className.includes('poster');
            
            if ((hasImg || (isCardTag && hasCardClass)) && current.tagName !== 'BODY') {
                return current;
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

        chrome.storage.local.get(['theme'], (res) => {
            panel.setAttribute('data-theme', res.theme || 'light');
        });

        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && changes.theme) {
                const p = document.getElementById('malControlPanel');
                if (p) p.setAttribute('data-theme', changes.theme.newValue);
            }
        });

        panel.innerHTML = `
            <div class="mal-panel-header" id="malPanelTitle" title="Drag to move">Loading...</div>
            <div class="mal-control-row" style="flex-direction: column; align-items: stretch; gap: 10px; margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <select id="malStatusSelect" class="mal-status-dropdown"></select>
                </div>
                <div id="malProgressWrap" class="mal-progress-container" style="display: none;">
                    <span id="malProgressText" class="mal-progress-text"></span>
                    <div style="display: flex; gap: 6px;">
                        <button id="malQuickDecBtn" class="mal-mini-btn dec">-</button>
                        <button id="malQuickAddBtn" class="mal-mini-btn inc">+</button>
                    </div>
                </div>
            </div>
            <button class="mal-update-btn" id="malOpenBtn">${I18nService.get('panelOpenBtn', this.currentLanguage)}</button>
        `;
        document.body.appendChild(panel);
        
        const header = document.getElementById('malPanelTitle');
        DraggableService.init(panel, header, this.savePanelPosition);
    }

    static async showNotFoundPanel(itemName) {
        await this.createPanel();
        const panel = document.getElementById('malControlPanel');
        const titleEl = document.getElementById('malPanelTitle');
        const statusSelect = document.getElementById('malStatusSelect');
        const btn = document.getElementById('malOpenBtn');
        const progressWrap = document.getElementById('malProgressWrap');
        
        titleEl.innerText = itemName;
        
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
        
        titleEl.innerText = itemName;
        
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

            if (data.progress === undefined) data.progress = 0;
            
            const prefix = mediaType === 'manga' ? 'Ch' : 'Ep';
            const field = mediaType === 'manga' ? 'num_chapters_read' : 'num_watched_episodes';
            
            progressText.innerText = `${prefix}: ${data.progress}`;
            progressWrap.style.display = 'flex';
            
            /**
             * Aplicação de Optimistic UI
             * O UI atualiza instantaneamente para dar sensação de zero latência.
             */
            const updateProgressOptimistic = (newVal) => {
                if (newVal < 0) return;
                
                const oldVal = data.progress;
                
                // 1. Atualização Otimista Imediata
                data.progress = newVal;
                progressText.innerText = `${prefix}: ${newVal}`;
                
                // Animação de Feedback "Pop"
                progressText.classList.remove('pop');
                void progressText.offsetWidth; // Reflow
                progressText.classList.add('pop');
                progressWrap.classList.add('optimistic-success');
                
                setTimeout(() => {
                    progressText.classList.remove('pop');
                    progressWrap.classList.remove('optimistic-success');
                }, 300);

                // Prevenir spam de cliques rápidos que possam engasgar a API
                quickAddBtn.disabled = true;
                quickDecBtn.disabled = true;
                
                // 2. Chamada de Rede em Background
                chrome.runtime.sendMessage({
                    action: "UPDATE_PROGRESS",
                    id: data.id,
                    mediaType: mediaType,
                    data: { [field]: newVal }
                }, (response) => {
                    quickAddBtn.disabled = false;
                    quickDecBtn.disabled = false;

                    if (response && response.success) {
                        DataManager.invalidateCache();
                    } else {
                        // 3. Rollback silencioso em caso de erro da API
                        data.progress = oldVal;
                        progressText.innerText = `${prefix}: ${oldVal}`;
                        console.warn("[MAL Highlighter] Optimistic Update failed. Reverted progress.");
                    }
                });
            };

            quickAddBtn.onclick = () => updateProgressOptimistic(data.progress + 1);
            quickDecBtn.onclick = () => updateProgressOptimistic(data.progress - 1);
        } else {
            progressWrap.style.display = 'none';
        }

        // Dropdown status change using standard loading (not optimistic as it implies major state change)
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
                    // Reinicia a janela para refletir novos botões de progresso caso aplicável
                    const statusMap = { 1: 'watching', 2: 'completed', 3: 'on_hold', 4: 'dropped', 6: 'plan_to_watch' };
                    const statusId = Object.keys(statusMap).find(key => statusMap[key] === newStatus);
                    
                    this.showPanel(itemName, { ...data, status: parseInt(statusId) });
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