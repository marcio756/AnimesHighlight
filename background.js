/**
 * Background Service Worker - v35.0 (Smart Monitor & Deduplication)
 * Arquitetura: Services Pattern com Idempotência
 */

// --- CONFIGURAÇÃO ---
const CONFIG = {
    ALARM_NAME: "MAL_MONITOR_CHECK",
    CHECK_INTERVAL_MIN: 15, // Intervalo reduzido para cumprir o requisito de ~15min
    HISTORY_LIMIT: 100 // Limite de histórico para não encher o storage
};

// --- SERVICE: MAL DATA ---
class MalService {
    static async fetchUserList(username) {
        let allItems = [];
        let offset = 0;
        let hasMore = true;

        // Limite de segurança (50.000)
        while (hasMore && offset < 50000) { 
            const malUrl = `https://myanimelist.net/animelist/${username}/load.json?status=7&offset=${offset}&_t=${Date.now()}`;
            try {
                const res = await fetch(malUrl);
                if (!res.ok) throw new Error("MAL API Error: Private or Invalid Profile");
                
                const data = await res.json();
                if (!Array.isArray(data)) throw new Error("Invalid Data Format");
                
                allItems = allItems.concat(data);
                
                if (data.length < 300) hasMore = false;
                else offset += 300;
            } catch (error) {
                console.error("[MalService] Error fetching list:", error);
                hasMore = false; // Stop on error
            }
        }
        return allItems;
    }
}

// --- SERVICE: RELEASE MONITOR ---
class ReleaseMonitorService {

    static async setupAlarm() {
        const { monitorEnabled } = await chrome.storage.local.get('monitorEnabled');
        
        // Limpar alarme anterior para garantir atualização do intervalo
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
        // Obter configurações e o histórico de episódios já vistos
        const store = await chrome.storage.local.get(['malUsername', 'monitorUrl', 'seenEpisodes']);
        
        const username = store.malUsername;
        const monitorUrl = store.monitorUrl;
        // Estrutura do seenEpisodes: { "anime_id_12345": [10, 11, 12], "anime_id_999": [1] }
        let seenEpisodes = store.seenEpisodes || {}; 

        if (!username || !monitorUrl) return;

        try {
            console.log(`[Monitor] A verificar: ${monitorUrl}`);
            
            // 1. Obter conteúdo do site e lista do utilizador em paralelo (Performance)
            const [htmlText, animeList] = await Promise.all([
                this.fetchSiteContent(monitorUrl),
                MalService.fetchUserList(username)
            ]);

            const watchingList = animeList.filter(a => a.status === 1); // 1 = Watching
            let notificationsQueue = [];
            let stateChanged = false;

            // 2. Iterar lista de animes a ver
            for (const anime of watchingList) {
                const nextEp = anime.num_watched_episodes + 1;
                const animeId = anime.anime_id;

                // Verificar se este episódio específico JÁ foi processado antes (Deduplicação)
                if (this.isEpisodeSeen(seenEpisodes, animeId, nextEp)) {
                    continue; 
                }

                // 3. Detetar no HTML
                if (this.detectRelease(htmlText, anime.anime_title, nextEp)) {
                    notificationsQueue.push(`${anime.anime_title} - Ep ${nextEp}`);
                    
                    // Marcar como visto para nunca mais notificar este episódio
                    this.markEpisodeAsSeen(seenEpisodes, animeId, nextEp);
                    stateChanged = true;
                }
            }

            // 4. Se houver novidades GENUÍNAS, notificar e guardar estado
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

    // --- Helpers de Estado (Novos) ---

    static isEpisodeSeen(seenMap, animeId, episode) {
        if (!seenMap[animeId]) return false;
        return seenMap[animeId].includes(episode);
    }

    static markEpisodeAsSeen(seenMap, animeId, episode) {
        if (!seenMap[animeId]) seenMap[animeId] = [];
        // Guardamos apenas os últimos 5 episódios para poupar memória, assumindo que não voltam atrás
        if (!seenMap[animeId].includes(episode)) {
            seenMap[animeId].push(episode);
            if (seenMap[animeId].length > 5) seenMap[animeId].shift(); 
        }
    }

    // --- Helpers Utilitários ---

    static async fetchSiteContent(url) {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 15000); // 15s timeout
        try {
            const response = await fetch(url, { 
                signal: controller.signal,
                cache: "no-store" // Importante: Forçar nova versão da página
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
            // Regex ajustada para apanhar variações comuns e newlines
            const pattern = new RegExp(`${escapedTitle}[\\s\\S]{0,150}?\\b(ep|episodio|episode|e)?\\s*0*${episodeNumber}\\b`, "i");
            return pattern.test(cleanHtml);
        } catch (e) {
            return false;
        }
    }

    static async sendNotification(items) {
        const message = items.length === 1 
            ? `Novo Episódio: ${items[0]}`
            : `${items.length} Novos Episódios Disponíveis!`;

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
        if (logs.length > CONFIG.HISTORY_LIMIT) logs = logs.slice(0, CONFIG.HISTORY_LIMIT);

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
        // Opcional: Correr verificação imediata ao salvar
        ReleaseMonitorService.checkNewReleases(); 
        sendResponse({ success: true });
    }
});

// 2. Alarms
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === CONFIG.ALARM_NAME) {
        ReleaseMonitorService.checkNewReleases();
    }
});

// 3. Notification Click
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
chrome.runtime.onInstalled.addListener(() => {
    ReleaseMonitorService.setupAlarm();
    // Limpar cache antigo para evitar conflitos na nova versão
    chrome.storage.local.remove('seenEpisodes'); 
});