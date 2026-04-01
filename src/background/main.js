// src/background/main.js

import { MalService } from './api.js';
import { ReleaseMonitorService, MONITOR_CONFIG } from './monitor.js';
import { SyncService } from './sync.js'; 
import { I18nService } from '../common/i18n.js';

chrome.storage.local.get(['lastMonitorCheck'], (res) => {
    const now = Date.now();
    const lastCheck = res.lastMonitorCheck || 0;
    const intervalMs = MONITOR_CONFIG.CHECK_INTERVAL_MIN * 60 * 1000;
    
    if (now - lastCheck > intervalMs) {
        ReleaseMonitorService.checkNewReleases();
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    
    // NOVO: Interceção das mensagens de log e impressão no Service Worker
    if (request.action === "SW_LOG") {
        console.group(request.message);
        if (request.data) console.log(JSON.stringify(request.data, null, 2));
        console.groupEnd();
        sendResponse({ success: true });
        return true;
    }

    if (request.action === "FETCH_MAL_LIST") {
        MalService.fetchAllUserItems(request.username)
            .then(data => sendResponse({ success: true, data: data }))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true; 
    }

    if (request.action === "SEARCH_ITEM") {
        const query = encodeURIComponent(request.title);
        Promise.all([
            fetch(`https://api.jikan.moe/v4/anime?q=${query}&limit=3`).then(res => res.json()).catch(() => ({ data: [] })),
            fetch(`https://api.jikan.moe/v4/manga?q=${query}&limit=3`).then(res => res.json()).catch(() => ({ data: [] }))
        ])
        .then(([animeRes, mangaRes]) => {
            const results = [];
            if (animeRes && animeRes.data) results.push(...animeRes.data.map(item => ({ ...item, type: 'anime' })));
            if (mangaRes && mangaRes.data) results.push(...mangaRes.data.map(item => ({ ...item, type: 'manga' })));
            
            if (results.length > 0) sendResponse({ success: true, results: results });
            else sendResponse({ success: false, error: "Not found" });
        })
        .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }

    if (request.action === "UPDATE_MONITORING") {
        ReleaseMonitorService.setupAlarm();
        ReleaseMonitorService.checkNewReleases(); 
        sendResponse({ success: true });
        return true;
    }

    if (request.action === "UPDATE_PROGRESS") {
        MalService.updateListEntry(request.id, request.mediaType, request.data)
            .then(data => sendResponse({ success: true, data: data }))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }

    if (request.action === "GET_SYNC_STATUS") {
        SyncService.authenticate(false)
            .then(user => sendResponse({ loggedIn: true, email: user.email }))
            .catch(() => sendResponse({ loggedIn: false }));
        return true;
    }

    if (request.action === "SYNC_LOGIN") {
        SyncService.authenticate(true)
            .then(user => { 
                SyncService.pullFromCloud(); 
                sendResponse({ success: true, email: user.email }); 
            })
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }

    if (request.action === "SYNC_LOGOUT") {
        SyncService.logout().then(() => sendResponse({ success: true }));
        return true;
    }
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === MONITOR_CONFIG.ALARM_NAME) ReleaseMonitorService.checkNewReleases();
});

chrome.notifications.onClicked.addListener((notificationId) => {
    chrome.storage.local.get(['notificationMeta'], (res) => {
        const meta = res.notificationMeta && res.notificationMeta[notificationId];
        if (meta && meta.monitorUrl) chrome.tabs.create({ url: meta.monitorUrl });
    });
    chrome.notifications.clear(notificationId);
});

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

chrome.runtime.onStartup.addListener(() => {
    ReleaseMonitorService.setupAlarm();
    ReleaseMonitorService.checkNewReleases(); 
    SyncService.pullFromCloud(); 
});

chrome.runtime.onInstalled.addListener((details) => {
    SyncService.initListeners();
    SyncService.pullFromCloud();
    
    chrome.storage.local.get(['monitorUrl', 'monitorEnabled', 'monitoredSites'], (res) => {
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