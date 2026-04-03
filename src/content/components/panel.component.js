// src/content/components/panel.component.js

import { I18nService } from '../../common/i18n.js';
import { ContextAnalyzer } from '../utils.js';
import { DataManager } from '../data.js';
import { DraggableService } from '../drag.js';

export class PanelComponent {
    /**
     * Initializes the floating panel structure within the DOM.
     * @param {Object} config - Global UI settings.
     */
    static async create(config) {
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
                
                <div class="mal-custom-select" id="malStatusSelectWrapper">
                    <div class="mal-select-trigger" id="malStatusTrigger">
                        <span id="malStatusLabel">Loading...</span>
                        <span class="chevron"></span>
                    </div>
                    <div class="mal-options-container" id="malStatusOptions"></div>
                </div>

                <div id="malProgressWrap" class="mal-progress-container" style="display: none;">
                    <div class="mal-progress-input-group">
                        <span id="malProgressPrefix" class="mal-progress-prefix"></span>
                        <input type="number" id="malProgressInput" class="mal-progress-input" min="0">
                        <span id="malProgressMax" class="mal-progress-max"></span>
                    </div>
                    <div style="display: flex; gap: 6px;">
                        <button id="malQuickDecBtn" class="mal-mini-btn dec">-</button>
                        <button id="malQuickAddBtn" class="mal-mini-btn inc">+</button>
                    </div>
                </div>
            </div>
            <button class="mal-update-btn" id="malOpenBtn">${I18nService.get('panelOpenBtn', config.language)}</button>
        `;
        document.body.appendChild(panel);
        
        const header = document.getElementById('malPanelTitle');
        DraggableService.init(panel, header, config.savePosition);

        document.addEventListener('click', (e) => {
            const wrapper = document.getElementById('malStatusSelectWrapper');
            if (wrapper && !wrapper.contains(e.target)) {
                wrapper.classList.remove('open');
            }
        });
    }

    /**
     * Triggers the "Not Found" state UI.
     */
    static async showNotFound(itemName, config) {
        await this.create(config);
        const panel = document.getElementById('malControlPanel');
        const titleEl = document.getElementById('malPanelTitle');
        
        const statusWrapper = document.getElementById('malStatusSelectWrapper');
        const statusLabel = document.getElementById('malStatusLabel');
        const statusOptions = document.getElementById('malStatusOptions');
        
        const btn = document.getElementById('malOpenBtn');
        const progressWrap = document.getElementById('malProgressWrap');
        
        titleEl.innerText = itemName;
        
        statusWrapper.classList.remove('open');
        statusLabel.innerText = I18nService.get('statusNotFoundMal', config.language);
        statusOptions.innerHTML = '';
        statusWrapper.style.opacity = '0.5';
        statusWrapper.style.pointerEvents = 'none';
        
        progressWrap.style.display = 'none';
        
        btn.innerText = I18nService.get('btnSearchMal', config.language);
        btn.onclick = () => {
            window.open(`https://myanimelist.net/search/all?q=${encodeURIComponent(itemName)}`, '_blank');
        };
        
        panel.classList.toggle('mal-panel-transparent', config.transparent);
        panel.classList.add('visible');
    }

    /**
     * Binds active list data and UI logic to the floating panel.
     */
    static async show(itemName, data, config) {
        await this.create(config);
        const panel = document.getElementById('malControlPanel');
        const titleEl = document.getElementById('malPanelTitle');
        
        const statusWrapper = document.getElementById('malStatusSelectWrapper');
        const statusTrigger = document.getElementById('malStatusTrigger');
        const statusLabel = document.getElementById('malStatusLabel');
        const statusOptions = document.getElementById('malStatusOptions');
        
        const btn = document.getElementById('malOpenBtn');
        const progressWrap = document.getElementById('malProgressWrap');
        
        const prefixEl = document.getElementById('malProgressPrefix');
        const inputEl = document.getElementById('malProgressInput');
        const maxEl = document.getElementById('malProgressMax');
        const quickAddBtn = document.getElementById('malQuickAddBtn');
        const quickDecBtn = document.getElementById('malQuickDecBtn');
        
        titleEl.innerText = itemName;
        
        const mediaType = data?.type || ContextAnalyzer.guessContentType();
        const watchingLabel = mediaType === 'manga' ? 'statusReading' : 'statusWatching';

        statusWrapper.style.opacity = '1';
        statusWrapper.style.pointerEvents = 'auto';

        const statusMap = { 1: 'watching', 2: 'completed', 3: 'on_hold', 4: 'dropped', 6: 'plan_to_watch' };
        const currentStatusStr = data?.status ? statusMap[data.status] : null;

        statusOptions.innerHTML = `
            ${!data?.status ? `<div class="mal-option disabled">${I18nService.get('statusAddToList', config.language)}</div>` : ''}
            <div class="mal-option ${currentStatusStr === 'watching' ? 'selected' : ''}" data-value="watching">${I18nService.get(watchingLabel, config.language)}</div>
            <div class="mal-option ${currentStatusStr === 'completed' ? 'selected' : ''}" data-value="completed">${I18nService.get('statusCompleted', config.language)}</div>
            <div class="mal-option ${currentStatusStr === 'on_hold' ? 'selected' : ''}" data-value="on_hold">${I18nService.get('statusOnHold', config.language)}</div>
            <div class="mal-option ${currentStatusStr === 'dropped' ? 'selected' : ''}" data-value="dropped">${I18nService.get('statusDropped', config.language)}</div>
            <div class="mal-option ${currentStatusStr === 'plan_to_watch' ? 'selected' : ''}" data-value="plan_to_watch">${I18nService.get('statusPlanned', config.language)}</div>
        `;

        if (currentStatusStr) {
            const activeOption = statusOptions.querySelector(`.mal-option[data-value="${currentStatusStr}"]`);
            statusLabel.innerText = activeOption ? activeOption.innerText : I18nService.get('statusPlanned', config.language);
        } else {
            statusLabel.innerText = I18nService.get('statusAddToList', config.language);
        }

        statusTrigger.onclick = () => {
            statusWrapper.classList.toggle('open');
        };

        statusOptions.querySelectorAll('.mal-option:not(.disabled)').forEach(opt => {
            opt.onclick = (e) => {
                const newStatus = e.target.getAttribute('data-value');
                statusLabel.innerText = e.target.innerText;
                statusWrapper.classList.remove('open');
                
                statusWrapper.style.opacity = '0.7';
                statusWrapper.style.pointerEvents = 'none';

                chrome.runtime.sendMessage({
                    action: "UPDATE_PROGRESS",
                    id: data.id,
                    mediaType: mediaType,
                    data: { status: newStatus }
                }, (response) => {
                    if (response && response.success) {
                        const statusId = Object.keys(statusMap).find(key => statusMap[key] === newStatus);
                        DataManager.updateCacheItem(data.id, mediaType, { status: parseInt(statusId) });
                        this.show(itemName, { ...data, status: parseInt(statusId) }, config);
                    } else {
                        statusWrapper.style.opacity = '1';
                        statusWrapper.style.pointerEvents = 'auto';
                    }
                });
            };
        });

        let field = mediaType === 'manga' ? 'num_chapters_read' : 'num_watched_episodes';

        const commitProgressUpdate = (finalVal) => {
            const oldVal = data.progress;
            if (oldVal === finalVal) {
                inputEl.value = oldVal; 
                return;
            }

            data.progress = finalVal;
            inputEl.value = finalVal;
            
            inputEl.classList.remove('pop');
            void inputEl.offsetWidth; 
            inputEl.classList.add('pop');
            progressWrap.classList.add('optimistic-success');
            
            setTimeout(() => {
                inputEl.classList.remove('pop');
                progressWrap.classList.remove('optimistic-success');
            }, 300);

            quickAddBtn.disabled = true;
            quickDecBtn.disabled = true;
            inputEl.disabled = true;
            
            chrome.runtime.sendMessage({
                action: "UPDATE_PROGRESS",
                id: data.id,
                mediaType: mediaType,
                data: { [field]: finalVal }
            }, (response) => {
                quickAddBtn.disabled = false;
                quickDecBtn.disabled = false;
                inputEl.disabled = false;

                if (response && response.success) {
                    DataManager.updateCacheItem(data.id, mediaType, { progress: finalVal });
                } else {
                    data.progress = oldVal;
                    inputEl.value = oldVal;
                }
            });
        };

        if (data && data.status) {
            if (data.progress === undefined) data.progress = 0;
            
            const prefixStr = mediaType === 'manga' ? I18nService.get('prefixCh', config.language) + ':' : I18nService.get('prefixEp', config.language) + ':';
            const maxVal = data.total > 0 ? data.total : null;
            
            prefixEl.innerText = prefixStr;
            inputEl.value = data.progress;
            
            if (maxVal) {
                maxEl.innerText = `/ ${maxVal}`;
                inputEl.max = maxVal;
            } else {
                maxEl.innerText = "";
                inputEl.removeAttribute('max');
            }
            
            progressWrap.style.display = 'flex';
            
            const updateProgressOptimistic = (newVal) => {
                if (isNaN(newVal) || newVal < 0) newVal = 0;
                
                if (maxVal && newVal > maxVal) {
                    if (!config.autoDetectSeasons) {
                        newVal = maxVal; 
                        inputEl.value = maxVal; 
                        commitProgressUpdate(newVal);
                    } else {
                        inputEl.value = maxVal;
                        
                        inputEl.disabled = true;
                        quickAddBtn.disabled = true;
                        quickDecBtn.disabled = true;
                        progressWrap.style.opacity = '0.7';
                        document.getElementById('malPanelTitle').innerText = I18nService.get('statusChecking', config.language);
                        
                        chrome.runtime.sendMessage({
                            action: "RESOLVE_CONTINUOUS",
                            id: data.id,
                            mediaType: mediaType,
                            progress: newVal
                        }, (response) => {
                            inputEl.disabled = false;
                            quickAddBtn.disabled = false;
                            quickDecBtn.disabled = false;
                            progressWrap.style.opacity = '1';
                            
                            if (response && response.success && response.data) {
                                const resolved = response.data;
                                if (resolved.resolvedId !== data.id) {
                                    commitProgressUpdate(maxVal);

                                    chrome.runtime.sendMessage({
                                        action: "UPDATE_PROGRESS",
                                        id: resolved.resolvedId,
                                        mediaType: mediaType,
                                        data: { [field]: resolved.resolvedProgress, status: 1 }
                                    }, () => {
                                        const newData = {
                                            id: resolved.resolvedId,
                                            title: resolved.title,
                                            rawTitle: resolved.title,
                                            type: mediaType,
                                            status: 1,
                                            progress: resolved.resolvedProgress,
                                            total: resolved.max || 0
                                        };
                                        DataManager.updateCacheItem(resolved.resolvedId, mediaType, newData);
                                        this.show(resolved.title, newData, config);
                                    });
                                    return;
                                } else {
                                    newVal = resolved.overflow ? resolved.max : resolved.resolvedProgress;
                                }
                            } else {
                                newVal = maxVal;
                            }
                            
                            document.getElementById('malPanelTitle').innerText = itemName;
                            commitProgressUpdate(newVal);
                        });
                    }
                } else {
                    commitProgressUpdate(newVal);
                }
            };

            quickAddBtn.onclick = () => updateProgressOptimistic(data.progress + 1);
            quickDecBtn.onclick = () => updateProgressOptimistic(data.progress - 1);

            const newChangeHandler = (e) => updateProgressOptimistic(parseInt(e.target.value, 10));
            const newKeyHandler = (e) => { if (e.key === 'Enter') inputEl.blur(); };
            
            const newInputEl = inputEl.cloneNode(true);
            inputEl.parentNode.replaceChild(newInputEl, inputEl);
            
            newInputEl.addEventListener('change', newChangeHandler);
            newInputEl.addEventListener('keypress', newKeyHandler);
            
        } else {
            progressWrap.style.display = 'none';
        }
        
        btn.innerText = I18nService.get('panelOpenBtn', config.language);
        btn.onclick = () => {
            if (data && data.id) {
                window.open(`https://myanimelist.net/${mediaType}/${data.id}`, '_blank');
            }
        };
        
        panel.classList.toggle('mal-panel-transparent', config.transparent);
        panel.classList.add('visible');
    }

    static hide() {
        const panel = document.getElementById('malControlPanel');
        if (panel) panel.classList.remove('visible');
    }
}