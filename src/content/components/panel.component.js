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
                
                <div style="display: flex; gap: 8px;">
                    <div class="mal-custom-select" id="malStatusSelectWrapper" style="flex: 1;">
                        <div class="mal-select-trigger" id="malStatusTrigger">
                            <span id="malStatusLabel">Loading...</span>
                            <span class="chevron"></span>
                        </div>
                        <div class="mal-options-container" id="malStatusOptions"></div>
                    </div>

                    <div class="mal-custom-select" id="malScoreSelectWrapper" style="width: 75px; display: none;">
                        <div class="mal-select-trigger" id="malScoreTrigger" style="padding-left: 10px; padding-right: 10px;">
                            <span id="malScoreLabel">★ -</span>
                            <span class="chevron" style="background-position: right; width: 12px;"></span>
                        </div>
                        <div class="mal-options-container" id="malScoreOptions" style="max-height: 180px; overflow-y: auto !important;"></div>
                    </div>
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
            const statusWrapper = document.getElementById('malStatusSelectWrapper');
            const scoreWrapper = document.getElementById('malScoreSelectWrapper');
            if (statusWrapper && !statusWrapper.contains(e.target)) {
                statusWrapper.classList.remove('open');
            }
            if (scoreWrapper && !scoreWrapper.contains(e.target)) {
                scoreWrapper.classList.remove('open');
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
        const scoreWrapper = document.getElementById('malScoreSelectWrapper');
        
        const btn = document.getElementById('malOpenBtn');
        const progressWrap = document.getElementById('malProgressWrap');
        
        titleEl.innerText = itemName;
        
        statusWrapper.classList.remove('open');
        statusLabel.innerText = I18nService.get('statusNotFoundMal', config.language);
        statusOptions.innerHTML = '';
        statusWrapper.style.opacity = '0.5';
        statusWrapper.style.pointerEvents = 'none';
        
        if (scoreWrapper) scoreWrapper.style.display = 'none';
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
        
        const scoreWrapper = document.getElementById('malScoreSelectWrapper');
        const scoreTrigger = document.getElementById('malScoreTrigger');
        const scoreLabel = document.getElementById('malScoreLabel');
        const scoreOptions = document.getElementById('malScoreOptions');
        
        const btn = document.getElementById('malOpenBtn');
        const progressWrap = document.getElementById('malProgressWrap');
        
        const prefixEl = document.getElementById('malProgressPrefix');
        const inputEl = document.getElementById('malProgressInput');
        const maxEl = document.getElementById('malProgressMax');
        const quickAddBtn = document.getElementById('malQuickAddBtn');
        const quickDecBtn = document.getElementById('malQuickDecBtn');
        
        titleEl.innerText = itemName;
        
        const mediaType = data?.type || ContextAnalyzer.guessContentType();
        const isManga = mediaType === 'manga';
        const watchingLabel = isManga ? 'statusReading' : 'statusWatching';

        statusWrapper.style.opacity = '1';
        statusWrapper.style.pointerEvents = 'auto';

        // Mapeamento unificado: Suporta tanto IDs numéricos (cache) como strings (API)
        const statusMap = { 
            1: isManga ? 'reading' : 'watching', 
            2: 'completed', 
            3: 'on_hold', 
            4: 'dropped', 
            6: isManga ? 'plan_to_read' : 'plan_to_watch' 
        };

        let currentStatusStr = null;
        if (data?.status) {
            // Se já for string (vinda da API Search), usamos direto. Se for número, mapeamos.
            currentStatusStr = isNaN(data.status) ? data.status : statusMap[data.status];
        }

        statusOptions.innerHTML = `
            ${!data?.status ? `<div class="mal-option disabled">${I18nService.get('statusAddToList', config.language)}</div>` : ''}
            <div class="mal-option ${currentStatusStr === statusMap[1] ? 'selected' : ''}" data-value="${statusMap[1]}">${I18nService.get(watchingLabel, config.language)}</div>
            <div class="mal-option ${currentStatusStr === statusMap[2] ? 'selected' : ''}" data-value="${statusMap[2]}">${I18nService.get('statusCompleted', config.language)}</div>
            <div class="mal-option ${currentStatusStr === statusMap[3] ? 'selected' : ''}" data-value="${statusMap[3]}">${I18nService.get('statusOnHold', config.language)}</div>
            <div class="mal-option ${currentStatusStr === statusMap[4] ? 'selected' : ''}" data-value="${statusMap[4]}">${I18nService.get('statusDropped', config.language)}</div>
            <div class="mal-option ${currentStatusStr === statusMap[6] ? 'selected' : ''}" data-value="${statusMap[6]}">${I18nService.get('statusPlanned', config.language)}</div>
        `;

        if (currentStatusStr) {
            const activeOption = statusOptions.querySelector(`.mal-option[data-value="${currentStatusStr}"]`);
            statusLabel.innerText = activeOption ? activeOption.textContent : I18nService.get('statusPlanned', config.language);
        } else {
            statusLabel.innerText = I18nService.get('statusAddToList', config.language);
        }

        statusTrigger.onclick = () => {
            statusWrapper.classList.toggle('open');
        };

        statusOptions.querySelectorAll('.mal-option:not(.disabled)').forEach(opt => {
            opt.onclick = (e) => {
                const newStatusStr = opt.getAttribute('data-value');
                statusLabel.innerText = opt.textContent;
                statusWrapper.classList.remove('open');
                
                statusWrapper.style.opacity = '0.7';
                statusWrapper.style.pointerEvents = 'none';

                chrome.runtime.sendMessage({
                    action: "UPDATE_PROGRESS",
                    id: data.id,
                    mediaType: mediaType,
                    data: { status: newStatusStr }
                }, (response) => {
                    if (response && response.success) {
                        const statusId = parseInt(Object.keys(statusMap).find(key => statusMap[key] === newStatusStr));
                        DataManager.updateCacheItem(data.id, mediaType, { status: statusId });
                        
                        window.dispatchEvent(new CustomEvent('mal_entry_updated', {
                            detail: { id: data.id, type: mediaType, status: statusId }
                        }));
                        
                        this.show(itemName, { ...data, status: statusId }, config);
                    } else {
                        statusWrapper.style.opacity = '1';
                        statusWrapper.style.pointerEvents = 'auto';
                    }
                });
            };
        });

        // Setup do Score (Classificação) - Corrigido para carregar sempre que houver status
        if (data && data.status) {
            scoreWrapper.style.display = 'block';
            const currentScore = data.score || 0;
            scoreLabel.innerText = currentScore > 0 ? `★ ${currentScore}` : '★ -';

            let scoreHtml = `<div class="mal-option ${currentScore === 0 ? 'selected' : ''}" data-value="0">★ -</div>`;
            for(let i=10; i>=1; i--) {
                scoreHtml += `<div class="mal-option ${currentScore === i ? 'selected' : ''}" data-value="${i}">★ ${i}</div>`;
            }
            scoreOptions.innerHTML = scoreHtml;

            const newScoreTrigger = scoreTrigger.cloneNode(true);
            scoreTrigger.parentNode.replaceChild(newScoreTrigger, scoreTrigger);

            newScoreTrigger.onclick = () => {
                scoreWrapper.classList.toggle('open');
            };

            scoreOptions.querySelectorAll('.mal-option').forEach(opt => {
                opt.onclick = (e) => {
                    const newScore = parseInt(opt.getAttribute('data-value'));
                    document.getElementById('malScoreLabel').innerText = newScore > 0 ? `★ ${newScore}` : '★ -';
                    scoreWrapper.classList.remove('open');
                    
                    scoreWrapper.style.opacity = '0.7';
                    scoreWrapper.style.pointerEvents = 'none';

                    chrome.runtime.sendMessage({
                        action: "UPDATE_PROGRESS",
                        id: data.id,
                        mediaType: mediaType,
                        data: { score: newScore }
                    }, (response) => {
                        scoreWrapper.style.opacity = '1';
                        scoreWrapper.style.pointerEvents = 'auto';
                        if (response && response.success) {
                            DataManager.updateCacheItem(data.id, mediaType, { score: newScore });
                            data.score = newScore;
                            scoreOptions.querySelectorAll('.mal-option').forEach(o => o.classList.remove('selected'));
                            opt.classList.add('selected');
                        }
                    });
                };
            });
        } else {
            scoreWrapper.style.display = 'none';
        }

        let field = isManga ? 'num_chapters_read' : 'num_watched_episodes';

        const commitProgressUpdate = (finalVal) => {
            const currentInputEl = document.getElementById('malProgressInput');
            const currentProgressWrap = document.getElementById('malProgressWrap');
            const currentAddBtn = document.getElementById('malQuickAddBtn');
            const currentDecBtn = document.getElementById('malQuickDecBtn');

            const oldVal = data.progress;
            if (oldVal === finalVal) {
                currentInputEl.value = oldVal; 
                return;
            }

            data.progress = finalVal;
            currentInputEl.value = finalVal;
            
            currentInputEl.classList.remove('pop');
            void currentInputEl.offsetWidth; 
            currentInputEl.classList.add('pop');
            currentProgressWrap.classList.add('optimistic-success');
            
            setTimeout(() => {
                currentInputEl.classList.remove('pop');
                currentProgressWrap.classList.remove('optimistic-success');
            }, 300);

            currentAddBtn.disabled = true;
            currentDecBtn.disabled = true;
            currentInputEl.disabled = true;
            
            chrome.runtime.sendMessage({
                action: "UPDATE_PROGRESS",
                id: data.id,
                mediaType: mediaType,
                data: { [field]: finalVal }
            }, (response) => {
                currentAddBtn.disabled = false;
                currentDecBtn.disabled = false;
                currentInputEl.disabled = false;

                if (response && response.success) {
                    DataManager.updateCacheItem(data.id, mediaType, { progress: finalVal });
                    
                    window.dispatchEvent(new CustomEvent('mal_entry_updated', {
                        detail: { id: data.id, type: mediaType, progress: finalVal }
                    }));
                } else {
                    data.progress = oldVal;
                    currentInputEl.value = oldVal;
                }
            });
        };

        if (data && data.status) {
            if (data.progress === undefined) data.progress = 0;
            
            const prefixStr = isManga ? I18nService.get('prefixCh', config.language) + ':' : I18nService.get('prefixEp', config.language) + ':';
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
                        document.getElementById('malProgressInput').value = maxVal; 
                        commitProgressUpdate(newVal);
                    } else {
                        document.getElementById('malProgressInput').value = maxVal;
                        
                        document.getElementById('malProgressInput').disabled = true;
                        document.getElementById('malQuickAddBtn').disabled = true;
                        document.getElementById('malQuickDecBtn').disabled = true;
                        document.getElementById('malProgressWrap').style.opacity = '0.7';
                        document.getElementById('malPanelTitle').innerText = I18nService.get('statusChecking', config.language);
                        
                        chrome.runtime.sendMessage({
                            action: "RESOLVE_CONTINUOUS",
                            id: data.id,
                            mediaType: mediaType,
                            progress: newVal
                        }, (response) => {
                            document.getElementById('malProgressInput').disabled = false;
                            document.getElementById('malQuickAddBtn').disabled = false;
                            document.getElementById('malQuickDecBtn').disabled = false;
                            document.getElementById('malProgressWrap').style.opacity = '1';
                            
                            if (response && response.success && response.data) {
                                const resolved = response.data;
                                if (resolved.resolvedId !== data.id) {
                                    commitProgressUpdate(maxVal);

                                    chrome.runtime.sendMessage({
                                        action: "UPDATE_PROGRESS",
                                        id: resolved.resolvedId,
                                        mediaType: mediaType,
                                        data: { [field]: resolved.resolvedProgress, status: isManga ? 'reading' : 'watching' }
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
                                        
                                        window.dispatchEvent(new CustomEvent('mal_entry_updated', {
                                            detail: { id: resolved.resolvedId, type: mediaType, status: 1, progress: resolved.resolvedProgress }
                                        }));

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
            const newKeyHandler = (e) => { if (e.key === 'Enter') document.getElementById('malProgressInput').blur(); };
            
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