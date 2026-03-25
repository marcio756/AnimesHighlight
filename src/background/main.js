/**
 * Main Service Worker Bootstrapper
 * @description Loads dependencies and binds browser events. Orchestrates initialization logic.
 */

try { 
    importScripts("../common/i18n.js", "auth.js", "api.js", "monitor.js"); 
} catch (e) { 
    console.error("Failed to load background modules", e); 
}

// Routes Messages from Content Scripts and Popup
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
    }

    if (request.action === "UPDATE_PROGRESS") {
        MalService.updateListEntry(request.id, request.mediaType, request.progress)
            .then(data => sendResponse({ success: true, data: data }))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }
});

// Alarm Triggers
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === MONITOR_CONFIG.ALARM_NAME) ReleaseMonitorService.checkNewReleases();
});

// Notifications Click Triggers (Fallback without buttons)
chrome.notifications.onClicked.addListener((notificationId) => {
    chrome.storage.local.get('monitorUrl', (result) => {
        if (result.monitorUrl) chrome.tabs.create({ url: result.monitorUrl });
    });
    chrome.notifications.clear(notificationId);
});

// Notifications Action Buttons (Rich Notifications Sync-Back)
chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
    chrome.storage.local.get(['notificationMeta', 'monitorUrl'], (res) => {
        const meta = res.notificationMeta && res.notificationMeta[notificationId];
        if (!meta) return;

        if (buttonIndex === 0) {
            // Button: Watch Now
            if (res.monitorUrl) chrome.tabs.create({ url: res.monitorUrl });
        } else if (buttonIndex === 1) {
            // Button: Mark as Seen (Sync-Back)
            MalService.updateListEntry(meta.id, meta.type, meta.nextEp)
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

// Lifecycle Hooks
chrome.runtime.onStartup.addListener(() => ReleaseMonitorService.setupAlarm());
chrome.runtime.onInstalled.addListener((details) => {
    ReleaseMonitorService.setupAlarm();
    chrome.storage.local.remove('seenEpisodes'); 
    
    if (details.reason === 'install') {
        chrome.tabs.create({ url: 'src/welcome/welcome.html' });
    }
});