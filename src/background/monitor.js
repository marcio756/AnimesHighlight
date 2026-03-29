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

        if (hasActiveSites) {
            chrome.alarms.create(MONITOR_CONFIG.ALARM_NAME, { 
                delayInMinutes: 1, 
                periodInMinutes: MONITOR_CONFIG.CHECK_INTERVAL_MIN 
            });
        }
    }

    static async checkNewReleases() {
        await chrome.storage.local.set({ lastMonitorCheck: Date.now() });

        const store = await chrome.storage.local.get(['malUsername', 'monitoredSites', 'seenEpisodes', 'mal_synonyms_cache', 'notificationLog']);
        const username = store.malUsername;
        const sites = store.monitoredSites || [];
        const activeSites = sites.filter(site => site.enabled);
        let seenEpisodes = store.seenEpisodes || {}; 
        const synonymsCache = store.mal_synonyms_cache || {};
        const notificationLog = store.notificationLog || []; 

        if (!username || activeSites.length === 0) return;

        try {
            console.log("[Monitor] Iniciando verificação de lançamentos para:", username);
            const activeItemsList = await MalService.fetchActiveItemsOnly(username);
            
            let notificationsQueue = [];
            let stateChanged = false;

            const siteFetches = activeSites.map(site => this.fetchSiteContent(site.url).then(html => ({ site, html })));
            const fetchResults = await Promise.allSettled(siteFetches);

            for (const result of fetchResults) {
                if (result.status !== 'fulfilled' || !result.value.html) {
                    console.warn("[Monitor] Falha ao aceder ao site:", result.value?.site?.url || "Desconhecido");
                    continue;
                }
                
                const { site, html } = result.value;

                for (const item of activeItemsList) {
                    const nextProgress = (item.progress || 0) + 1;
                    const uniqueItemId = `${item.type}_${item.id}`;

                    if (this.isItemSeen(seenEpisodes, uniqueItemId, nextProgress)) continue; 

                    const alreadyNotified = notificationLog.some(log => log.id === item.id && log.type === item.type && log.ep === nextProgress);
                    if (alreadyNotified) {
                        this.markItemAsSeen(seenEpisodes, uniqueItemId, nextProgress); 
                        stateChanged = true;
                        continue;
                    }

                    const normTarget = item.title.toLowerCase();
                    const titlesToCheck = new Set([item.title]);
                    
                    if (item.title_eng) titlesToCheck.add(item.title_eng);

                    for (const [alias, official] of Object.entries(synonymsCache)) {
                        if (official === normTarget || official === item.title) {
                            titlesToCheck.add(alias);
                        }
                    }

                    let detectedSpecificUrl = null;
                    for (const titleVariant of titlesToCheck) {
                        detectedSpecificUrl = this.detectRelease(html, titleVariant, nextProgress, site.url);
                        if (detectedSpecificUrl) break;
                    }

                    if (detectedSpecificUrl) {
                        notificationsQueue.push({
                            title: item.title,
                            id: item.id,
                            type: item.type,
                            nextEp: nextProgress,
                            siteUrl: detectedSpecificUrl, 
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
        const id = setTimeout(() => controller.abort(), 15000);
        try {
            const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
            clearTimeout(id);
            return await response.text();
        } catch (e) { return ""; }
    }

    static detectRelease(html, title, progressNumber, fallbackUrl) {
        if (!html || !title) return null;

        const plainText = html.replace(/<(script|style)\b[^<]*(?:(?!<\/\1>)<[^<]*)*<\/\1>/gi, ' ')
                              .replace(/<[^>]*>?/gm, ' ');
        const fullyCleanedText = plainText.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, ' ');

        let normalizedTitle = title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, ' ').trim();

        if (!normalizedTitle || normalizedTitle.length < 3) return null;

        const titleWords = normalizedTitle.split(' ');
        if (titleWords.length > 4) {
             normalizedTitle = titleWords.slice(0, 4).join(' ');
        }

        if (!fullyCleanedText.includes(normalizedTitle)) return null;

        try {
            const escapedTitle = normalizedTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); 
            const keywordGroup = "(ep|episodio|episode|e|capitulo|cap|chapter|ch|scan|c)";
            
            const pattern = new RegExp(`${escapedTitle}(?:.{0,60}?\\b${keywordGroup}\\s*[-:]?\\s*0*${progressNumber}\\b|.{0,15}?\\b0*${progressNumber}\\b)`, "i");
            
            if (!pattern.test(fullyCleanedText)) return null;

            // =========================================================
            // INÍCIO DO MODO DEBUG - Visível na consola do Service Worker
            // =========================================================
            console.group(`[MAL Highlighter Debug] Lançamento confirmado no HTML: ${title} (Ep/Cap ${progressNumber})`);
            console.log("Site Alvo:", fallbackUrl);

            const hrefRegex = /href=["']([^"']+)["']/gi;
            const titleSlug = normalizedTitle.replace(/\s+/g, '-');
            const titleSlugNoSpaces = normalizedTitle.replace(/\s+/g, '');
            const links = new Set();
            let match;

            while ((match = hrefRegex.exec(html)) !== null) {
                links.add(match[1]);
            }

            console.log(`Extraídos ${links.size} links totais da página para avaliação.`);

            let bestScore = 0;
            let bestHref = fallbackUrl;

            for (let href of links) {
                const hrefLower = href.toLowerCase();
                
                if (hrefLower.includes('.css') || hrefLower.includes('.js') || hrefLower.includes('page=')) continue;

                let score = 0;

                const numPattern1 = new RegExp(`[-_/(]0*${progressNumber}(/|\\?|\\b|$)`);
                const numPattern2 = new RegExp(`\\b${keywordGroup}[-_]?0*${progressNumber}\\b`, 'i');
                const hasEpNum = numPattern1.test(hrefLower) || numPattern2.test(hrefLower);

                if (!hasEpNum) continue;

                if (hrefLower.includes(titleSlug) || hrefLower.includes(titleSlugNoSpaces)) {
                    score += 20;
                }

                let wordsMatched = 0;
                for (const word of titleWords) {
                    if (word.length > 2 && hrefLower.includes(word)) wordsMatched++;
                }
                score += (wordsMatched * 2);

                if (new RegExp(`\\b${keywordGroup}\\b`, 'i').test(hrefLower)) {
                    score += 5;
                }

                console.log(`  🔎 [Candidato] Score: ${score.toString().padStart(2, '0')} | URL: ${href}`);

                if (score > bestScore && score >= 10) { 
                    bestScore = score;
                    bestHref = href;
                }
            }
            
            console.log(`🏆 [VENCEDOR] Score Final: ${bestScore} | URL Selecionado: ${bestHref}`);
            console.groupEnd();
            // =========================================================
            // FIM DO MODO DEBUG
            // =========================================================

            try {
                return new URL(bestHref, fallbackUrl).href;
            } catch (e) {
                return bestHref.startsWith('http') ? bestHref : fallbackUrl;
            }
        } catch (e) { 
            console.error("[MAL Highlighter Debug] Falha na regex ou parsing:", e);
            return null; 
        }
    }

    static async sendNotification(items) {
        const lang = await I18nService.getCurrentLang();
        
        const badgeStore = await chrome.storage.local.get('unreadCount');
        let currentUnread = (badgeStore.unreadCount || 0) + items.length;
        await chrome.storage.local.set({ unreadCount: currentUnread });
        chrome.action.setBadgeText({ text: currentUnread.toString() });
        chrome.action.setBadgeBackgroundColor({ color: '#E53935' }); 
        
        const storageRes = await chrome.storage.local.get(['notificationMeta']);
        let notificationMeta = storageRes.notificationMeta || {};

        for (const item of items) {
            const notifId = `mal_notif_${item.type}_${item.id}_${item.nextEp}_${Date.now()}`;
            const prefix = item.type === 'anime' ? 'Ep' : 'Ch';
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

            notificationMeta[notifId] = { ...item, monitorUrl: item.siteUrl };
        }

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
                url: item.siteUrl || item.url,
                siteName: item.siteName || 'Unknown Site',
                id: item.id,
                type: item.type,
                ep: item.nextEp,
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