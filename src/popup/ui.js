/**
 * Popup UI Manager
 * @description Handles all visual updates, tab switching, and data rendering for the extension popup.
 */
class PopupUI {
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

    /**
     * Atualizado com botão X e Callback 'onUpdateLogs' para fechar ao clicar em Abrir/X
     */
    static renderNotifications(logs, listEl, emptyEl, clearBtn, onUpdateLogs) {
        if (!listEl) return;
        listEl.innerHTML = "";

        if (!logs || logs.length === 0) {
            emptyEl.style.display = 'block';
            clearBtn.style.display = 'none';
            return;
        }

        emptyEl.style.display = 'none';
        clearBtn.style.display = 'block';

        logs.forEach((log, index) => {
            const li = document.createElement('li');
            const date = new Date(log.date).toLocaleString();
            const actionUrl = log.url || `https://myanimelist.net/${log.type || 'anime'}/${log.id || ''}`;
            
            li.innerHTML = `
                <div class="notif-item" style="position: relative; padding-right: 20px;">
                    <button class="delete-notif-btn" data-index="${index}" style="position: absolute; top: 8px; right: 8px; background: none; border: none; color: #a12f31; font-size: 16px; cursor: pointer; line-height: 1; padding: 0;" title="Remover notificação">&times;</button>
                    
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        <span class="notif-text" style="font-size: 13px; font-weight: 600; color: var(--text-main); padding-right: 15px;">${log.text}</span>
                        
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span class="notif-date" style="font-size: 10px; color: var(--text-muted);">${date}</span>
                            <a href="${actionUrl}" target="_blank" class="open-notif-btn" data-index="${index}" style="background-color: #2db039; color: white; padding: 4px 12px; border-radius: 4px; font-size: 11px; text-decoration: none; font-weight: bold; box-shadow: 0 2px 4px rgba(45, 176, 57, 0.2);">Abrir</a>
                        </div>
                    </div>
                </div>
            `;
            listEl.appendChild(li);
        });

        // Eventos de Deleção (Remover)
        listEl.querySelectorAll('.delete-notif-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.getAttribute('data-index'));
                logs.splice(idx, 1);
                if (onUpdateLogs) onUpdateLogs(logs);
            });
        });

        // Eventos ao Abrir (Remover também)
        listEl.querySelectorAll('.open-notif-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.getAttribute('data-index'));
                logs.splice(idx, 1);
                if (onUpdateLogs) onUpdateLogs(logs);
            });
        });
    }

    static async updateMalProgress(id, newValue, isAnime) {
        if (newValue < 0) return;
        const field = isAnime ? 'num_watched_episodes' : 'num_chapters_read';
        
        chrome.runtime.sendMessage({
            action: "UPDATE_PROGRESS",
            id: id,
            mediaType: isAnime ? 'anime' : 'manga',
            data: { [field]: newValue }
        }, (response) => {
            if (response && response.success) {
                location.reload(); 
            }
        });
    }

    static async updateMalStatus(id, newStatus, isAnime) {
        chrome.runtime.sendMessage({
            action: "UPDATE_PROGRESS",
            id: id,
            mediaType: isAnime ? 'anime' : 'manga',
            data: { status: newStatus }
        }, (response) => {
            if (response && response.success) {
                location.reload();
            }
        });
    }
}