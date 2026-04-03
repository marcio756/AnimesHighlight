// src/background/core/event.handler.js

import { ReleaseMonitorService, MONITOR_CONFIG } from '../services/monitor.service.js';
import { SyncService } from '../services/sync.service.js';
import { MalService } from '../services/api.service.js';
import { I18nService } from '../../common/i18n.js';

export class EventHandler {
    /**
     * Orquestra todos os listeners de eventos do sistema do Chrome.
     */
    static init() {
        this.registerAlarms();
        this.registerNotifications();
        this.registerLifecycleEvents();
        this.runInitialCheck();
    }

    static runInitialCheck() {
        chrome.storage.local.get(['lastMonitorCheck'], (res) => {
            const now = Date.now();
            const lastCheck = res.lastMonitorCheck || 0;
            const intervalMs = MONITOR_CONFIG.CHECK_INTERVAL_MIN * 60 * 1000;
            
            if (now - lastCheck > intervalMs) {
                ReleaseMonitorService.checkNewReleases();
            }
        });
    }

    static registerAlarms() {
        chrome.alarms.onAlarm.addListener((alarm) => {
            if (alarm.name === MONITOR_CONFIG.ALARM_NAME) {
                ReleaseMonitorService.checkNewReleases();
            }
        });
    }

    static registerNotifications() {
        // Clique no corpo da notificação
        chrome.notifications.onClicked.addListener((notificationId) => {
            chrome.storage.local.get(['notificationMeta'], (res) => {
                const meta = res.notificationMeta && res.notificationMeta[notificationId];
                if (meta && meta.monitorUrl) chrome.tabs.create({ url: meta.monitorUrl });
            });
            chrome.notifications.clear(notificationId);
        });

        // Clique nos botões de ação da notificação
        chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
            chrome.storage.local.get(['notificationMeta'], async (res) => {
                const meta = res.notificationMeta && res.notificationMeta[notificationId];
                if (!meta) return;

                if (buttonIndex === 0) {
                    if (meta.monitorUrl) chrome.tabs.create({ url: meta.monitorUrl });
                } else if (buttonIndex === 1) {
                    const lang = await I18nService.getCurrentLang();
                    const field = meta.type === 'anime' ? 'num_watched_episodes' : 'num_chapters_read';
                    
                    MalService.updateListEntry(meta.id, meta.type, { [field]: meta.nextEp })
                        .then(() => {
                            let msg = I18nService.get('notifMarkedSeen', lang);
                            msg = msg.replace('{title}', meta.title).replace('{ep}', meta.nextEp);

                            chrome.notifications.create({
                                type: 'basic', iconUrl: 'icon.png',
                                title: 'MAL Highlighter',
                                message: msg, priority: 1
                            });
                        })
                        .catch(err => console.error("[Sync-Back] Update failed", err));
                }
                chrome.notifications.clear(notificationId);
            });
        });
    }

    static registerLifecycleEvents() {
        // Arrancar o Service Worker (Browser Start)
        chrome.runtime.onStartup.addListener(() => {
            ReleaseMonitorService.setupAlarm();
            ReleaseMonitorService.checkNewReleases(); 
            SyncService.pullFromCloud(); 
        });

        // Instalação ou Atualização da Extensão
        chrome.runtime.onInstalled.addListener((details) => {
            SyncService.initListeners();
            SyncService.pullFromCloud();
            
            chrome.storage.local.get(['monitorUrl', 'monitorEnabled', 'monitoredSites'], (res) => {
                // Migração de legacy states, se aplicável
                if (res.monitorUrl && !res.monitoredSites) {
                    try {
                        const urlObj = new URL(res.monitorUrl);
                        const defaultSite = {
                            id: Date.now().toString(),
                            url: res.monitorUrl,
                            name: urlObj.hostname.replace('www.', ''),
                            enabled: res.monitorEnabled !== false
                        };
                        chrome.storage.local.set({ monitoredSites: [defaultSite] }, () => {
                            chrome.storage.local.remove(['monitorUrl', 'monitorEnabled']); 
                            ReleaseMonitorService.setupAlarm();
                            ReleaseMonitorService.checkNewReleases(); 
                        });
                    } catch(e) { 
                        ReleaseMonitorService.setupAlarm(); 
                        ReleaseMonitorService.checkNewReleases();
                    }
                } else {
                    ReleaseMonitorService.setupAlarm();
                    ReleaseMonitorService.checkNewReleases(); 
                }
            });

            if (details.reason === 'install') {
                chrome.tabs.create({ url: 'src/welcome/welcome.html' });
            }
        });
    }
}