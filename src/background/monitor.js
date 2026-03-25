/**
 * Background Monitoring Layer
 * @description Manages alarms, background site scraping, and notification generation using synonym dictionaries.
 */

const MONITOR_CONFIG = {
    ALARM_NAME: "MAL_MONITOR_CHECK",
    CHECK_INTERVAL_MIN: 15,
    HISTORY_LIMIT: 100
};

class ReleaseMonitorService {
    static async setupAlarm() {
        const { monitorEnabled } = await chrome.storage.local.get('monitorEnabled');
        await chrome.alarms.clear(MONITOR_CONFIG.ALARM_NAME);

        if (monitorEnabled) {
            chrome.alarms.create(MONITOR_CONFIG.ALARM_NAME, { periodInMinutes: MONITOR_CONFIG.CHECK_INTERVAL_MIN });
        }
    }

    static async checkNewReleases() {
        const store = await chrome.storage.local.get(['malUsername', 'monitorUrl', 'seenEpisodes', 'mal_synonyms_cache']);
        const username = store.malUsername;
        const monitorUrl = store.monitorUrl;
        let seenEpisodes = store.seenEpisodes || {}; 
        const synonymsCache = store.mal_synonyms_cache || {};

        if (!username || !monitorUrl) return;

        try {
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

                const normTarget = anime.title.toLowerCase();
                const titlesToCheck = new Set([anime.title]);
                
                if (anime.title_eng) titlesToCheck.add(anime.title_eng);

                for (const [alias, official] of Object.entries(synonymsCache)) {
                    if (official === normTarget || official === anime.title) {
                        titlesToCheck.add(alias);
                    }
                }

                let releaseDetected = false;
                for (const titleVariant of titlesToCheck) {
                    if (this.detectRelease(htmlText, titleVariant, nextEp)) {
                        releaseDetected = true;
                        break;
                    }
                }

                if (releaseDetected) {
                    notificationsQueue.push({
                        title: anime.title,
                        id: anime.id,
                        type: anime.type,
                        nextEp: nextEp
                    });
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
            console.error("[Monitor] Verification failed:", error);
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
            const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
            clearTimeout(id);
            return await response.text();
        } catch (e) { return ""; }
    }

    static detectRelease(html, title, episodeNumber) {
        const cleanTitle = title.toLowerCase().replace(/[^a-z0-9 ]/g, "");
        const cleanHtml = html.toLowerCase(); 
        if (!cleanHtml.includes(cleanTitle)) return false;

        try {
            const escapedTitle = cleanTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); 
            const pattern = new RegExp(`${escapedTitle}[\\s\\S]{0,150}?\\b(ep|episodio|episode|e)?\\s*0*${episodeNumber}\\b`, "i");
            return pattern.test(cleanHtml);
        } catch (e) { return false; }
    }

    static async sendNotification(items) {
        const lang = await I18nService.getCurrentLang();
        
        // INCREMENT AND SET BADGE COUNTER
        const badgeStore = await chrome.storage.local.get('unreadCount');
        let currentUnread = (badgeStore.unreadCount || 0) + items.length;
        await chrome.storage.local.set({ unreadCount: currentUnread });
        chrome.action.setBadgeText({ text: currentUnread.toString() });
        chrome.action.setBadgeBackgroundColor({ color: '#E53935' }); // Red circle
        
        items.forEach(async item => {
            const notifId = `mal_notif_${item.id}_${item.nextEp}_${Date.now()}`;
            const message = `${item.title} - Ep ${item.nextEp}`;
            
            chrome.notifications.create(notifId, {
                type: 'basic', 
                iconUrl: 'icon.png',
                title: I18nService.get('notifNew', lang),
                message: message, 
                priority: 2,
                buttons: [
                    { title: I18nService.get('notifBtnWatch', lang) },
                    { title: I18nService.get('notifBtnMarkSeen', lang) }
                ]
            });

            const storageRes = await chrome.storage.local.get('notificationMeta');
            const notificationMeta = storageRes.notificationMeta || {};
            notificationMeta[notifId] = item;
            
            const keys = Object.keys(notificationMeta);
            if (keys.length > 50) delete notificationMeta[keys[0]];
            
            await chrome.storage.local.set({ notificationMeta });
        });

        await this.saveToHistory(items.map(i => `${i.title} - Ep ${i.nextEp}`));
    }

    static async saveToHistory(items) {
        const timestamp = Date.now();
        const newEntries = items.map(text => ({ text, date: timestamp, read: false }));

        const data = await chrome.storage.local.get('notificationLog');
        let logs = data.notificationLog || [];

        logs.unshift(...newEntries);
        if (logs.length > MONITOR_CONFIG.HISTORY_LIMIT) logs = logs.slice(0, MONITOR_CONFIG.HISTORY_LIMIT);

        await chrome.storage.local.set({ notificationLog: logs });
    }
}