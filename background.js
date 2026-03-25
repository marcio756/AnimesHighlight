/**
 * Background Service Worker - v37.0 (I18n Service Integration)
 * Arquitetura: Services Pattern com Idempotência e Data Normalization
 */

// Import I18n Service dynamically for Service Worker
try { importScripts("i18n.js"); } catch (e) { console.error("Could not load i18n", e); }

const CONFIG = {
    ALARM_NAME: "MAL_MONITOR_CHECK",
    CHECK_INTERVAL_MIN: 15,
    HISTORY_LIMIT: 100
};

// --- SERVICE: MAL DATA ---
class MalService {
    static async fetchList(username, listType) {
        let allItems = [];
        let offset = 0;
        let hasMore = true;

        while (hasMore && offset < 50000) { 
            const malUrl = `https://myanimelist.net/${listType}/${username}/load.json?status=7&offset=${offset}&_t=${Date.now()}`;
            try {
                const res = await fetch(malUrl);
                if (!res.ok) throw new Error(`MAL API Error: Private or Invalid Profile for ${listType}`);
                
                const data = await res.json();
                if (!Array.isArray(data)) throw new Error("Invalid Data Format");
                
                allItems = allItems.concat(data);
                
                if (data.length < 300) hasMore = false;
                else offset += 300;
            } catch (error) {
                console.error(`[MalService] Error fetching ${listType}:`, error);
                hasMore = false; 
            }
        }
        return allItems;
    }

    static async fetchAllUserItems(username) {
        try {
            const [animeList, mangaList] = await Promise.all([
                this.fetchList(username, 'animelist'),
                this.fetchList(username, 'mangalist')
            ]);

            const normalizedAnimes = animeList.map(item => ({
                id: item.anime_id,
                title: item.anime_title,
                status: item.status,
                score: item.score,
                type: 'anime',
                num_watched_episodes: item.num_watched_episodes || 0
            }));

            const normalizedMangas = mangaList.map(item => ({
                id: item.manga_id,
                title: item.manga_title,
                status: item.status,
                score: item.score,
                type: 'manga',
                num_read_chapters: item.num_read_chapters || 0
            }));

            return [...normalizedAnimes, ...normalizedMangas];
        } catch (error) {
            console.error("[MalService] Error combining lists:", error);
            throw error;
        }
    }
}

// --- SERVICE: RELEASE MONITOR ---
class ReleaseMonitorService {

    static async setupAlarm() {
        const { monitorEnabled } = await chrome.storage.local.get('monitorEnabled');
        
        await chrome.alarms.clear(CONFIG.ALARM_NAME);

        if (monitorEnabled) {
            chrome.alarms.create(CONFIG.ALARM_NAME, {
                periodInMinutes: CONFIG.CHECK_INTERVAL_MIN
            });
            console.log(`[Monitor] Alarme ativo. Verificação a cada ${CONFIG.CHECK_INTERVAL_MIN} minutos.`);
        } else {
            console.log("[Monitor] Monitorização desativada.");
        }
    }

    static async checkNewReleases() {
        const store = await chrome.storage.local.get(['malUsername', 'monitorUrl', 'seenEpisodes']);
        
        const username = store.malUsername;
        const monitorUrl = store.monitorUrl;
        let seenEpisodes = store.seenEpisodes || {}; 

        if (!username || !monitorUrl) return;

        try {
            console.log(`[Monitor] A verificar: ${monitorUrl}`);
            
            const [htmlText, allItems] = await Promise.all([
                this.fetchSiteContent(monitorUrl),
                MalService.fetchAllUserItems(username)
            ]);

            const watchingAnimeList = allItems.filter(a => a.status === 1 && a.type === 'anime'); 
            let notificationsQueue = [];
            let stateChanged = false;

            for (const anime of watchingAnimeList) {
                const nextEp = anime.num_watched_episodes + 1;
                const animeId = anime.id;

                if (this.isEpisodeSeen(seenEpisodes, animeId, nextEp)) continue; 

                if (this.detectRelease(htmlText, anime.title, nextEp)) {
                    notificationsQueue.push(`${anime.title} - Ep ${nextEp}`);
                    this.markEpisodeAsSeen(seenEpisodes, animeId, nextEp);
                    stateChanged = true;
                }
            }

            if (notificationsQueue.length > 0) {
                await this.sendNotification(notificationsQueue);
            }

            if (stateChanged) {
                await chrome.storage.local.set({ seenEpisodes });
            }

        } catch (error) {
            console.error("[Monitor] Falha na verificação:", error);
        }
    }

    static isEpisodeSeen(seenMap, animeId, episode) {
        if (!seenMap[animeId]) return false;
        return seenMap[animeId].includes(episode);
    }

    static markEpisodeAsSeen(seenMap, animeId, episode) {
        if (!seenMap[animeId]) seenMap[animeId] = [];
        if (!seenMap[animeId].includes(episode)) {
            seenMap[animeId].push(episode);
            if (seenMap[animeId].length > 5) seenMap[animeId].shift(); 
        }
    }

    static async fetchSiteContent(url) {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 15000);
        try {
            const response = await fetch(url, { 
                signal: controller.signal,
                cache: "no-store" 
            });
            clearTimeout(id);
            return await response.text();
        } catch (e) {
            return "";
        }
    }

    static detectRelease(html, title, episodeNumber) {
        const cleanTitle = title.toLowerCase().replace(/[^a-z0-9 ]/g, "");
        const cleanHtml = html.toLowerCase(); 

        if (!cleanHtml.includes(cleanTitle)) return false;

        try {
            const escapedTitle = cleanTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); 
            const pattern = new RegExp(`${escapedTitle}[\\s\\S]{0,150}?\\b(ep|episodio|episode|e)?\\s*0*${episodeNumber}\\b`, "i");
            return pattern.test(cleanHtml);
        } catch (e) {
            return false;
        }
    }

    static async sendNotification(items) {
        // Obter idioma local e usar I18nService
        const lang = await I18nService.getCurrentLang();
        
        const message = items.length === 1 
            ? `${I18nService.get('notifNew', lang)}: ${items[0]}`
            : `${items.length} ${I18nService.get('notifMultiple', lang)}`;

        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icon.png',
            title: I18nService.get('notifTitle', lang),
            message: message,
            priority: 2
        });

        await this.saveToHistory(items);
    }

    static async saveToHistory(items) {
        const timestamp = Date.now();
        const newEntries = items.map(itemString => ({
            text: itemString,
            date: timestamp,
            read: false
        }));

        const data = await chrome.storage.local.get('notificationLog');
        let logs = data.notificationLog || [];

        logs.unshift(...newEntries);
        if (logs.length > CONFIG.HISTORY_LIMIT) logs = logs.slice(0, CONFIG.HISTORY_LIMIT);

        await chrome.storage.local.set({ notificationLog: logs });
    }
}

// --- EVENT LISTENERS ---

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "FETCH_MAL_LIST") {
        MalService.fetchAllUserItems(request.username)
            .then(data => sendResponse({ success: true, data: data }))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true; 
    }

    if (request.action === "SEARCH_ITEM") {
        const query = encodeURIComponent(request.title);
        const itemType = request.itemType || 'anime'; 
        
        fetch(`https://api.jikan.moe/v4/${itemType}?q=${query}&limit=5`)
            .then(res => res.json())
            .then(data => {
                if (data.data && data.data.length > 0) sendResponse({ success: true, results: data.data });
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
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === CONFIG.ALARM_NAME) {
        ReleaseMonitorService.checkNewReleases();
    }
});

chrome.notifications.onClicked.addListener((notificationId) => {
    chrome.storage.local.get('monitorUrl', (result) => {
        if (result.monitorUrl) {
            chrome.tabs.create({ url: result.monitorUrl });
        }
    });
    chrome.notifications.clear(notificationId);
});

chrome.runtime.onStartup.addListener(() => ReleaseMonitorService.setupAlarm());
chrome.runtime.onInstalled.addListener(() => {
    ReleaseMonitorService.setupAlarm();
    chrome.storage.local.remove('seenEpisodes'); 
});