/**
 * Background Service Worker - v32.0 (Monitor & Notification)
 * Arquitetura: Services Pattern
 */

// --- SERVICES ---

class MalService {
    static async fetchUserList(username) {
        let allItems = [];
        let offset = 0;
        let hasMore = true;

        while (hasMore && offset < 5000) { // Safety limit
            const malUrl = `https://myanimelist.net/animelist/${username}/load.json?status=7&offset=${offset}&_t=${Date.now()}`;
            const res = await fetch(malUrl);
            if (!res.ok) throw new Error("MAL API Error");
            const data = await res.json();
            
            if (!Array.isArray(data)) throw new Error("Invalid Data");
            
            allItems = allItems.concat(data);
            
            if (data.length < 300) hasMore = false;
            else offset += 300;
        }
        return allItems;
    }
}

class ReleaseMonitorService {
    static ALARM_NAME = "MAL_MONITOR_CHECK";
    static CHECK_INTERVAL_MIN = 15;

    /**
     * Configura o alarme com base nas preferências.
     */
    static async setupAlarm() {
        const { monitorEnabled } = await chrome.storage.local.get('monitorEnabled');
        
        // Limpa alarme existente para evitar duplicação ou se estiver desativado
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

    /**
     * Executa a verificação lógica.
     */
    static async checkNewReleases() {
        const settings = await chrome.storage.local.get(['malUsername', 'monitorUrl']);
        if (!settings.malUsername || !settings.monitorUrl) return;

        try {
            console.log(`[Monitor] Checking ${settings.monitorUrl}...`);
            
            // 1. Obter HTML do site
            const htmlText = await this.fetchSiteContent(settings.monitorUrl);
            
            // 2. Obter Lista Watching do utilizador
            const animeList = await MalService.fetchUserList(settings.malUsername);
            const watchingList = animeList.filter(a => a.status === 1); // 1 = Watching

            // 3. Verificar Correspondências
            let newReleases = [];
            
            for (const anime of watchingList) {
                // Heurística: Procurar Título + Próximo Episódio
                const nextEp = anime.num_watched_episodes + 1;
                if (this.detectRelease(htmlText, anime.anime_title, nextEp)) {
                    newReleases.push(`${anime.anime_title} - Ep ${nextEp}`);
                }
            }

            // 4. Notificar se houver novidades
            if (newReleases.length > 0) {
                this.sendNotification(newReleases);
            }

        } catch (error) {
            console.error("[Monitor] Check failed:", error);
        }
    }

    static async fetchSiteContent(url) {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 10000); // 10s timeout
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(id);
        return await response.text();
    }

    /**
     * Lógica Complexa de Deteção (Core Heuristic)
     * Verifica se o Título e o Número do episódio aparecem próximos um do outro.
     */
    static detectRelease(html, title, episodeNumber) {
        // Normaliza título (remove simbolos) e html para lower case
        const cleanTitle = title.toLowerCase().replace(/[^a-z0-9 ]/g, "");
        const cleanHtml = html.toLowerCase(); 

        // Se o título nem existe na página, abortar logo (performance)
        if (!cleanHtml.includes(cleanTitle)) return false;

        try {
            const escapedTitle = cleanTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape regex chars
            
            // CORREÇÃO: Alterado de . para [\s\S] para suportar quebras de linha
            const pattern = new RegExp(`${escapedTitle}[\\s\\S]{0,100}?\\b0*${episodeNumber}\\b`, "i");
            
            return pattern.test(cleanHtml);
        } catch (e) {
            return false;
        }
    }

    static sendNotification(items) {
        const message = items.length === 1 
            ? `New Episode Available: ${items[0]}`
            : `${items.length} New Episodes Available!`;

        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icon.png',
            title: 'MAL Highlighter Monitor',
            message: message,
            priority: 2
        });
    }
}

// --- EVENT LISTENERS ---

// 1. Mensagens da Popup / Content Script
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

    // Trigger manual ou reconfiguração
    if (request.action === "UPDATE_MONITORING") {
        ReleaseMonitorService.setupAlarm();
        sendResponse({ success: true });
    }
});

// 2. Alarm Trigger (O Cron Job)
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ReleaseMonitorService.ALARM_NAME) {
        ReleaseMonitorService.checkNewReleases();
    }
});

// 3. Inicialização (Startup)
chrome.runtime.onStartup.addListener(() => {
    ReleaseMonitorService.setupAlarm();
});

// 4. Instalação/Atualização
chrome.runtime.onInstalled.addListener(() => {
    ReleaseMonitorService.setupAlarm();
});