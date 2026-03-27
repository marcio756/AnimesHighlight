/**
 * Popup UI Manager
 * @description Handles all visual updates, dynamic DOM generation, and Optimistic UI rendering.
 */
import { I18nService } from '../common/i18n.js';

export class PopupUI {
    static clockInterval = null;

    static initTabs(tabs, panes, onHistoryLoad, onMonitorLoad) {
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const target = tab.getAttribute('data-tab');

                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                panes.forEach(pane => {
                    pane.classList.toggle('active', pane.id === target);
                });

                if (target === 'tab-notifications' && onHistoryLoad) onHistoryLoad();
                if (target === 'tab-monitor' && onMonitorLoad) onMonitorLoad();
            });
        });
    }

    /**
     * Initializes the accordion logic for settings cards.
     * @description Binds click events to settings headers to toggle the 'collapsed' class.
     */
    static initSettingsAccordions() {
        const headers = document.querySelectorAll('.settings-header');
        headers.forEach(header => {
            header.addEventListener('click', () => {
                const card = header.closest('.settings-card');
                if (card) {
                    card.classList.toggle('collapsed');
                }
            });
        });
    }

    static renderAlarmFeedback(elementId, currentLang) {
        const el = document.getElementById(elementId);
        if (!el) return;

        const updateClock = async () => {
            const alarm = await chrome.alarms.get("MAL_MONITOR_CHECK");
            if (!alarm) {
                el.innerText = I18nService.get('lblNotScheduled', currentLang);
                return;
            }
            const diffMs = alarm.scheduledTime - Date.now();
            if (diffMs <= 0) {
                el.innerText = I18nService.get('lblNow', currentLang);
            } else {
                const mins = Math.floor(diffMs / 60000);
                const secs = Math.floor((diffMs % 60000) / 1000);
                const formattedSecs = secs.toString().padStart(2, '0');
                
                el.innerText = `${I18nService.get('lblNextCheck', currentLang)} ${mins}m ${formattedSecs}s`;
            }
        };

        updateClock();
        if (this.clockInterval) clearInterval(this.clockInterval);
        this.clockInterval = setInterval(updateClock, 1000); 
    }

    static updateStatus(element, message, type = "") {
        if (!element) return;
        element.innerText = message;
        element.className = `status ${type}`;
        
        setTimeout(() => {
            element.innerText = "";
            element.className = "status";
        }, 3000);
    }

    static showProfile(username, avatarUrl, avatarEl, textEl, container) {
        if (!container || !avatarEl || !textEl) return;
        avatarEl.src = avatarUrl;
        textEl.innerText = `Welcome, ${username}!`;
        container.style.display = 'flex';
    }

    static renderSitesList(sites, listEl, emptyEl, callbacks) {
        listEl.innerHTML = "";
        
        if (!sites || sites.length === 0) {
            emptyEl.style.display = 'block';
            return;
        }

        emptyEl.style.display = 'none';

        sites.forEach((site, index) => {
            if (site.isSkeleton) {
                listEl.innerHTML += `
                    <li class="skeleton-card">
                        <div style="width: 60%;"><div class="skeleton-box skeleton-title"></div><div class="skeleton-box skeleton-subtitle"></div></div>
                        <div class="skeleton-box skeleton-toggle"></div>
                    </li>`;
                return;
            }

            const li = document.createElement('li');
            li.className = `site-card ${site.enabled ? '' : 'disabled'}`;
            li.innerHTML = `
                <div class="site-info" title="${site.url}">
                    <span class="site-name">${site.name}</span>
                    <span class="site-url">${site.url}</span>
                </div>
                <div class="site-actions">
                    <label class="switch" style="transform: scale(0.8); margin: 0;">
                        <input type="checkbox" class="toggle-site" data-id="${site.id}" ${site.enabled ? 'checked' : ''}>
                        <span class="slider round"></span>
                    </label>
                    <button class="btn-icon delete-site" data-id="${site.id}" title="Remove Site">🗑️</button>
                </div>
            `;
            listEl.appendChild(li);
        });

        listEl.querySelectorAll('.toggle-site').forEach(btn => {
            btn.addEventListener('change', (e) => callbacks.onToggle(e.target.dataset.id, e.target.checked));
        });
        listEl.querySelectorAll('.delete-site').forEach(btn => {
            btn.addEventListener('click', (e) => callbacks.onDelete(e.target.dataset.id));
        });
    }

    static updateSiteFilterDropdown(sites, selectEl, currentLang) {
        if (!selectEl) return;
        const currentVal = selectEl.value;
        selectEl.innerHTML = `<option value="all">${I18nService.get('filterAllSites', currentLang)}</option>`;
        
        if (sites) {
            sites.forEach(site => {
                const opt = document.createElement('option');
                opt.value = site.name;
                opt.innerText = site.name;
                selectEl.appendChild(opt);
            });
        }
        
        if (Array.from(selectEl.options).some(o => o.value === currentVal)) {
            selectEl.value = currentVal;
        }
    }

    static renderNotifications(logs, listEl, emptyEl, clearBtn, filterValue, onUpdateLogs) {
        if (!listEl) return;
        listEl.innerHTML = "";

        const filteredLogs = filterValue === 'all' ? logs : logs.filter(l => l.siteName === filterValue);

        if (!filteredLogs || filteredLogs.length === 0) {
            emptyEl.style.display = 'block';
            clearBtn.style.display = 'none';
            return;
        }

        emptyEl.style.display = 'none';
        clearBtn.style.display = 'block';

        filteredLogs.forEach((log) => {
            const originalIndex = logs.indexOf(log); 
            const li = document.createElement('li');
            const date = new Date(log.date).toLocaleString();
            const actionUrl = log.url || `https://myanimelist.net/${log.type || 'anime'}/${log.id || ''}`;
            const siteTag = log.siteName ? `<span class="notif-tag">${log.siteName}</span>` : '';
            
            li.innerHTML = `
                <div class="notif-item" style="position: relative; padding-right: 20px;">
                    <button class="delete-notif-btn" data-index="${originalIndex}" style="position: absolute; top: 8px; right: 8px; background: none; border: none; color: #a12f31; font-size: 16px; cursor: pointer; line-height: 1; padding: 0;" title="Remover notificação">&times;</button>
                    
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        <span class="notif-text" style="font-size: 13px; font-weight: 600; color: var(--text-main); padding-right: 15px;">${log.text}</span>
                        
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div style="display: flex; gap: 6px; align-items: center;">
                                <span class="notif-date" style="font-size: 10px; color: var(--text-muted);">${date}</span>
                                ${siteTag}
                            </div>
                            <a href="${actionUrl}" target="_blank" class="open-notif-btn" data-index="${originalIndex}" style="background-color: #2db039; color: white; padding: 4px 12px; border-radius: 4px; font-size: 11px; text-decoration: none; font-weight: bold; box-shadow: 0 2px 4px rgba(45, 176, 57, 0.2);">Abrir</a>
                        </div>
                    </div>
                </div>
            `;
            listEl.appendChild(li);
        });

        const handleRemove = (e) => {
            const idx = parseInt(e.target.getAttribute('data-index'));
            logs.splice(idx, 1);
            if (onUpdateLogs) onUpdateLogs(logs);
        };

        listEl.querySelectorAll('.delete-notif-btn').forEach(btn => btn.addEventListener('click', handleRemove));
    }
}