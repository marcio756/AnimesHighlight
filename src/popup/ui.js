// src/popup/ui.js

/**
 * Popup UI Facade Manager
 * @description Orchestrates the presentation layer components for the Popup extension window.
 */
import { I18nService } from '../common/i18n.js';
import { NotificationListComponent } from './components/notification-list.component.js';
import { SiteListComponent } from './components/site-list.component.js';

export class ProgressService {
    static start() {
        const bar = document.getElementById('globalProgress');
        if (bar) bar.classList.add('loading');
    }

    static stop() {
        const bar = document.getElementById('globalProgress');
        if (bar) bar.classList.remove('loading');
    }
}

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

    static showProfile(username, avatarUrl, avatarEl, textEl, container, skeletonEl, currentLang) {
        if (!container || !avatarEl || !textEl) return;
        if (skeletonEl) skeletonEl.style.display = 'none';
        
        avatarEl.src = avatarUrl;
        
        let msg = I18nService.get('profileWelcome', currentLang) || `Welcome, ${username}!`;
        textEl.innerText = msg.replace('{user}', username);
        
        container.style.display = 'flex';
    }

    // --- Component Bindings ---

    static renderSitesList(sites, listEl, emptyEl, callbacks) {
        SiteListComponent.render(sites, listEl, emptyEl, callbacks);
    }

    static updateSiteFilterDropdown(sites, optionsContainerEl, labelEl, currentLang, currentValue, onChangeCallback) {
        SiteListComponent.updateFilterDropdown(sites, optionsContainerEl, labelEl, currentLang, currentValue, onChangeCallback);
    }

    static renderNotifications(logs, listEl, emptyEl, clearBtn, filterValue, currentLang, onUpdateLogs) {
        NotificationListComponent.render(logs, listEl, emptyEl, clearBtn, filterValue, currentLang, onUpdateLogs);
    }
}