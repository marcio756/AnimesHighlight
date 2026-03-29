// src/background/main.js

import { MalService } from './api.js';
import { ReleaseMonitorService, MONITOR_CONFIG } from './monitor.js';
import { SyncService } from './sync.js'; 

chrome.storage.local.get(['lastMonitorCheck'], (res) => {
    const now = Date.now();
    const lastCheck = res.lastMonitorCheck || 0;
    const intervalMs = MONITOR_CONFIG.CHECK_INTERVAL_MIN * 60 * 1000;
    
    if (now - lastCheck > intervalMs) {
        ReleaseMonitorService.checkNewReleases();
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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

chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
    chrome.storage.local.get(['notificationMeta'], (res) => {
        const meta = res.notificationMeta && res.notificationMeta[notificationId];
        if (!meta) return;

        if (buttonIndex === 0) {
            if (meta.monitorUrl) chrome.tabs.create({ url: meta.monitorUrl });
        } else if (buttonIndex === 1) {
            const field = meta.type === 'anime' ? 'num_watched_episodes' : 'num_chapters_read';
            MalService.updateListEntry(meta.id, meta.type, { [field]: meta.nextEp })
                .then(() => {
                    chrome.notifications.create({
                        type: 'basic', iconUrl: 'icon.png',
                        title: 'MAL Highlighter',
                        message: `Successfully marked ${meta.title} episode ${meta.nextEp} as seen.`, priority: 1
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
    // REMOVIDO: chrome.storage.local.remove('seenEpisodes');
    
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