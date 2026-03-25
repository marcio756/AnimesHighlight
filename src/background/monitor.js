/**
 * Background Monitoring Layer
 * @description Manages alarms, multi-site background scraping, and notification generation using synonym dictionaries.
 */

import { I18nService } from '../common/i18n.js';
import { MalService } from './api.js';

export const MONITOR_CONFIG = {
    ALARM_NAME: "MAL_MONITOR_CHECK",
    CHECK_INTERVAL_MIN: 15,
    HISTORY_LIMIT: 100
};

export class ReleaseMonitorService {
    static async setupAlarm() {
        const store = await chrome.storage.local.get('monitoredSites');
        const sites = store.monitoredSites || [];
        const hasActiveSites = sites.some(site => site.enabled);

        await chrome.alarms.clear(MONITOR_CONFIG.ALARM_NAME);

        // Apenas cria alarme se houver pelo menos um site ativo
        if (hasActiveSites) {
            chrome.alarms.create(MONITOR_CONFIG.ALARM_NAME, { 
                delayInMinutes: 1, 
                periodInMinutes: MONITOR_CONFIG.CHECK_INTERVAL_MIN 
            });
        }
    }

    static async checkNewReleases() {
        const store = await chrome.storage.local.get(['malUsername', 'monitoredSites', 'seenEpisodes', 'mal_synonyms_cache']);
        const username = store.malUsername;
        const sites = store.monitoredSites || [];
        const activeSites = sites.filter(site => site.enabled);
        let seenEpisodes = store.seenEpisodes || {}; 
        const synonymsCache = store.mal_synonyms_cache || {};

        if (!username || activeSites.length === 0) return;

        try {
            // Requisita a lista do utilizador ao MAL
            const allItems = await MalService.fetchAllUserItems(username);
            const activeItemsList = allItems.filter(item => item.status === 1); 
            
            let notificationsQueue = [];
            let stateChanged = false;

            // Resolve o Scraping de todos os sites em paralelo, sem que um bloqueie os outros
            const siteFetches = activeSites.map(site => this.fetchSiteContent(site.url).then(html => ({ site, html })));
            const fetchResults = await Promise.allSettled(siteFetches);

            // Processa o HTML recolhido de cada site ativo
            for (const result of fetchResults) {
                if (result.status !== 'fulfilled' || !result.value.html) continue;
                
                const { site, html } = result.value;

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
                        if (this.detectRelease(html, titleVariant, nextProgress)) {
                            releaseDetected = true;
                            break;
                        }
                    }

                    if (releaseDetected) {
                        notificationsQueue.push({
                            title: item.title,
                            id: item.id,
                            type: item.type,
                            nextEp: nextProgress,
                            siteUrl: site.url,
                            siteName: site.name
                        });
                        
                        this.markItemAsSeen(seenEpisodes, uniqueItemId, nextProgress);
                        stateChanged = true;
                    }
                }
            }

            if (notificationsQueue.length > 0) {
                await this.sendNotification(notificationsQueue);
            }

            if (stateChanged) {
                await chrome.storage.local.set({ seenEpisodes });
            }
        } catch (error) {
            console.error("[Monitor] Multi-Site Verification failed:", error);
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
        const id = setTimeout(() => controller.abort(), 15000); // 15s timeout
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
        
        const storageRes = await chrome.storage.local.get(['notificationMeta']);
        const notificationMeta = storageRes.notificationMeta || {};

        items.forEach(async item => {
            const notifId = `mal_notif_${item.type}_${item.id}_${item.nextEp}_${Date.now()}`;
            const prefix = item.type === 'anime' ? 'Ep' : 'Ch';
            // Adicionamos a fonte da notificação para clareza
            const message = `${item.title} - ${prefix} ${item.nextEp} (${item.siteName})`;
            
            chrome.notifications.create(notifId, {
                type: 'basic', 
                iconUrl: '/icon.png', 
                title: I18nService.get('notifNew', lang),
                message: message, 
                priority: 2,
                buttons: [
                    { title: I18nService.get('notifBtnWatch', lang) },
                    { title: I18nService.get('notifBtnMarkSeen', lang) }
                ]
            });

            // Gravamos metadados expandidos
            notificationMeta[notifId] = { ...item, monitorUrl: item.siteUrl };
        });

        const keys = Object.keys(notificationMeta);
        if (keys.length > 50) delete notificationMeta[keys[0]];
        await chrome.storage.local.set({ notificationMeta });

        await this.saveToHistory(items);
    }

    static async saveToHistory(items) {
        const timestamp = Date.now();
        const newEntries = items.map(item => {
            return { 
                text: `${item.title} - ${item.type === 'anime' ? 'Ep' : 'Ch'} ${item.nextEp}`, 
                url: item.siteUrl || item.url, // fallback legacy
                siteName: item.siteName || 'Unknown Site',
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