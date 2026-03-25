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
            chrome.alarms.create(MONITOR_CONFIG.ALARM_NAME, { 
                delayInMinutes: 1, 
                periodInMinutes: MONITOR_CONFIG.CHECK_INTERVAL_MIN 
            });
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

            const activeItemsList = allItems.filter(item => item.status === 1); 
            let notificationsQueue = [];
            let stateChanged = false;

            for (const item of activeItemsList) {
                const isAnime = item.type === 'anime';
                const progressField = isAnime ? 'num_watched_episodes' : 'num_read_chapters';
                const nextProgress = (item[progressField] || 0) + 1;
                const uniqueItemId = `${item.type}_${item.id}`;

                if (this.isItemSeen(seenEpisodes, uniqueItemId, nextProgress)) continue; 

                const normTarget = item.title.toLowerCase();
                const titlesToCheck = new Set([item.title]);
                
                if (item.title_eng) titlesToCheck.add(item.title_eng);

                for (const [alias, official] of Object.entries(synonymsCache)) {
                    if (official === normTarget || official === item.title) {
                        titlesToCheck.add(alias);
                    }
                }

                let releaseDetected = false;
                for (const titleVariant of titlesToCheck) {
                    if (this.detectRelease(htmlText, titleVariant, nextProgress)) {
                        releaseDetected = true;
                        break;
                    }
                }

                if (releaseDetected) {
                    notificationsQueue.push({
                        title: item.title,
                        id: item.id,
                        type: item.type,
                        nextEp: nextProgress
                    });
                    
                    this.markItemAsSeen(seenEpisodes, uniqueItemId, nextProgress);
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

    static isItemSeen(seenMap, uniqueItemId, progressNumber) {
        if (!seenMap[uniqueItemId]) return false;
        return seenMap[uniqueItemId].includes(progressNumber);
    }

    static markItemAsSeen(seenMap, uniqueItemId, progressNumber) {
        if (!seenMap[uniqueItemId]) seenMap[uniqueItemId] = [];
        if (!seenMap[uniqueItemId].includes(progressNumber)) {
            seenMap[uniqueItemId].push(progressNumber);
            if (seenMap[uniqueItemId].length > 5) seenMap[uniqueItemId].shift(); 
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

    /**
     * Strict Regex Logic to prevent cross-contamination between different anime titles.
     */
    static detectRelease(html, title, progressNumber) {
        if (!html || !title) return false;

        const plainText = html.replace(/<[^>]*>?/gm, ' ');
        const fullyCleanedText = plainText.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, ' ');

        let normalizedTitle = title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, ' ').trim();

        if (!normalizedTitle || normalizedTitle.length < 3) return false;

        const titleWords = normalizedTitle.split(' ');
        if (titleWords.length > 4) {
             normalizedTitle = titleWords.slice(0, 4).join(' ');
        }

        if (!fullyCleanedText.includes(normalizedTitle)) return false;

        try {
            const escapedTitle = normalizedTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); 
            const keywordGroup = "(ep|episodio|episode|e|capitulo|cap|chapter|ch|scan|c)";
            
            // Reduced gap dramatically (60 or 15 chars) to stop regex from reading neighboring titles
            const pattern = new RegExp(`${escapedTitle}(?:.{0,60}?\\b${keywordGroup}\\s*[-:]?\\s*0*${progressNumber}\\b|.{0,15}?\\b0*${progressNumber}\\b)`, "i");
            return pattern.test(fullyCleanedText);
        } catch (e) { return false; }
    }

    static async sendNotification(items) {
        const lang = await I18nService.getCurrentLang();
        
        const badgeStore = await chrome.storage.local.get('unreadCount');
        let currentUnread = (badgeStore.unreadCount || 0) + items.length;
        await chrome.storage.local.set({ unreadCount: currentUnread });
        chrome.action.setBadgeText({ text: currentUnread.toString() });
        chrome.action.setBadgeBackgroundColor({ color: '#E53935' }); 
        
        const storageRes = await chrome.storage.local.get(['notificationMeta', 'monitorUrl']);
        const notificationMeta = storageRes.notificationMeta || {};
        const monitorUrl = storageRes.monitorUrl || '';

        items.forEach(async item => {
            const notifId = `mal_notif_${item.type}_${item.id}_${item.nextEp}_${Date.now()}`;
            const prefix = item.type === 'anime' ? 'Ep' : 'Ch';
            const message = `${item.title} - ${prefix} ${item.nextEp}`;
            
            chrome.notifications.create(notifId, {
                type: 'basic', 
                iconUrl: '/icon.png', // Absolute path forces Chrome to start at the extension root
                title: I18nService.get('notifNew', lang),
                message: message, 
                priority: 2,
                buttons: [
                    { title: I18nService.get('notifBtnWatch', lang) },
                    { title: I18nService.get('notifBtnMarkSeen', lang) }
                ]
            });

            notificationMeta[notifId] = item;
        });

        const keys = Object.keys(notificationMeta);
        if (keys.length > 50) delete notificationMeta[keys[0]];
        await chrome.storage.local.set({ notificationMeta });

        const historyItems = items.map(i => ({
            title: i.title,
            type: i.type,
            id: i.id,
            nextEp: i.nextEp,
            url: monitorUrl
        }));
        await this.saveToHistory(historyItems);
    }

    static async saveToHistory(items) {
        const timestamp = Date.now();
        const newEntries = items.map(item => {
            if (typeof item === 'string') {
                return { text: item, date: timestamp, read: false }; 
            }
            return { 
                text: `${item.title} - ${item.type === 'anime' ? 'Ep' : 'Ch'} ${item.nextEp}`, 
                url: item.url,
                id: item.id,
                type: item.type,
                date: timestamp, 
                read: false 
            };
        });

        const data = await chrome.storage.local.get('notificationLog');
        let logs = data.notificationLog || [];

        logs.unshift(...newEntries);
        if (logs.length > MONITOR_CONFIG.HISTORY_LIMIT) logs = logs.slice(0, MONITOR_CONFIG.HISTORY_LIMIT);

        await chrome.storage.local.set({ notificationLog: logs });
    }
}