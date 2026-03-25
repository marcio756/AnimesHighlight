/**
 * Background Monitoring Layer
 * @description Manages alarms, background site scraping, and notification generation.
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
        const store = await chrome.storage.local.get(['malUsername', 'monitorUrl', 'seenEpisodes']);
        const username = store.malUsername;
        const monitorUrl = store.monitorUrl;
        let seenEpisodes = store.seenEpisodes || {}; 

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
        const message = items.length === 1 
            ? `${I18nService.get('notifNew', lang)}: ${items[0]}`
            : `${items.length} ${I18nService.get('notifMultiple', lang)}`;

        chrome.notifications.create({
            type: 'basic', iconUrl: 'icon.png',
            title: I18nService.get('notifTitle', lang),
            message: message, priority: 2
        });
        await this.saveToHistory(items);
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