/**
 * Background Service Worker - v34.0 (Full Monitor & History)
 * Arquitetura: Services Pattern
 */

// --- SERVICE: MAL DATA ---
class MalService {
    static async fetchUserList(username) {
        let allItems = [];
        let offset = 0;
        let hasMore = true;

        // Limite de segurança (50.000)
        while (hasMore && offset < 50000) { 
            const malUrl = `https://myanimelist.net/animelist/${username}/load.json?status=7&offset=${offset}&_t=${Date.now()}`;
            const res = await fetch(malUrl);
            
            if (!res.ok) throw new Error("MAL API Error: Private or Invalid Profile");
            
            const data = await res.json();
            
            if (!Array.isArray(data)) throw new Error("Invalid Data Format");
            
            allItems = allItems.concat(data);
            console.log(`[Background] Fetched ${data.length} items (Offset: ${offset})`);
            
            if (data.length < 300) {
                hasMore = false;
            } else {
                offset += 300;
            }
        }
        return allItems;
    }
}

// --- SERVICE: RELEASE MONITOR ---
class ReleaseMonitorService {
    static ALARM_NAME = "MAL_MONITOR_CHECK";
    static CHECK_INTERVAL_MIN = 60; // Verifica a cada 60 minutos

    static async setupAlarm() {
        const { monitorEnabled } = await chrome.storage.local.get('monitorEnabled');
        
        await chrome.alarms.clear(this.ALARM_NAME);

        if (monitorEnabled) {
            chrome.alarms.create(this.ALARM_NAME, {
                periodInMinutes: this.CHECK_INTERVAL_MIN
            });
            console.log(`[Monitor] Alarm set to run every ${this.CHECK_INTERVAL_MIN} minutes.`);
        } else {
            console.log("[Monitor] Monitoring disabled.");
        }
    }

    static async checkNewReleases() {
        const settings = await chrome.storage.local.get(['malUsername', 'monitorUrl']);
        if (!settings.malUsername || !settings.monitorUrl) return;

        try {
            console.log(`[Monitor] Checking ${settings.monitorUrl}...`);
            
            const htmlText = await this.fetchSiteContent(settings.monitorUrl);
            const animeList = await MalService.fetchUserList(settings.malUsername);
            const watchingList = animeList.filter(a => a.status === 1); // 1 = Watching

            let newReleases = [];
            
            for (const anime of watchingList) {
                const nextEp = anime.num_watched_episodes + 1;
                if (this.detectRelease(htmlText, anime.anime_title, nextEp)) {
                    newReleases.push(`${anime.anime_title} - Ep ${nextEp}`);
                }
            }

            if (newReleases.length > 0) {
                await this.sendNotification(newReleases);
            }

        } catch (error) {
            console.error("[Monitor] Check failed:", error);
        }
    }

    static async fetchSiteContent(url) {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 15000); // 15s timeout
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(id);
        return await response.text();
    }

    /**
     * Lógica de Deteção com Regex Fix ([\s\S])
     */
    static detectRelease(html, title, episodeNumber) {
        const cleanTitle = title.toLowerCase().replace(/[^a-z0-9 ]/g, "");
        const cleanHtml = html.toLowerCase(); 

        if (!cleanHtml.includes(cleanTitle)) return false;

        try {
            const escapedTitle = cleanTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); 
            
            // Regex que aceita quebras de linha
            const pattern = new RegExp(`${escapedTitle}[\\s\\S]{0,100}?\\b0*${episodeNumber}\\b`, "i");
            return pattern.test(cleanHtml);
        } catch (e) {
            return false;
        }
    }

    static async sendNotification(items) {
        const message = items.length === 1 
            ? `New Episode Available: ${items[0]}`
            : `${items.length} New Episodes Available!`;

        // Cria notificação nativa (ID opcional, mas útil se quisermos gerir)
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icon.png',
            title: 'MAL Highlighter Monitor',
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
        if (logs.length > 50) logs = logs.slice(0, 50);

        await chrome.storage.local.set({ notificationLog: logs });
    }
}

// --- EVENT LISTENERS ---

// 1. Messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "FETCH_MAL_LIST") {
        MalService.fetchUserList(request.username)
            .then(data => sendResponse({ success: true, data: data }))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true; 
    }

    if (request.action === "SEARCH_ANIME") {
        const query = encodeURIComponent(request.title);
        fetch(`https://api.jikan.moe/v4/anime?q=${query}&limit=5`)
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
        sendResponse({ success: true });
    }
});

// 2. Alarms
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ReleaseMonitorService.ALARM_NAME) {
        ReleaseMonitorService.checkNewReleases();
    }
});

// 3. Notification Click (Abre o site ao clicar na notificação do Windows)
chrome.notifications.onClicked.addListener((notificationId) => {
    chrome.storage.local.get('monitorUrl', (result) => {
        if (result.monitorUrl) {
            chrome.tabs.create({ url: result.monitorUrl });
        }
    });
    chrome.notifications.clear(notificationId);
});

// 4. Lifecycle
chrome.runtime.onStartup.addListener(() => ReleaseMonitorService.setupAlarm());
chrome.runtime.onInstalled.addListener(() => ReleaseMonitorService.setupAlarm());