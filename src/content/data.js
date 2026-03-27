/**
 * Data Storage and API Communication Layer
 * @description Isolates caching logic. 
 * Prevents domain-leakage by transitioning from generic localStorage to chrome.storage.local.
 */
import { TextNormalizer, CONFIG } from './utils.js';

export class SynonymDictionary {
    static cache = {};

    static async init() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['mal_synonyms_cache'], (res) => {
                this.cache = res.mal_synonyms_cache || {};
                resolve();
            });
        });
    }

    static getCache() {
        return this.cache;
    }

    static save(alias, officialTitle) {
        if (!alias || !officialTitle) return;
        this.cache[alias] = officialTitle;
        chrome.storage.local.set({ mal_synonyms_cache: this.cache });
    }

    static resolve(title) {
        return this.cache[title] || title;
    }
}

export class DataManager {
    static async getUsername() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['malUsername'], (result) => {
                resolve(result.malUsername || 'marcio756');
            });
        });
    }

    /**
     * Clears the active cache from extension storage.
     */
    static invalidateCache() {
        chrome.storage.local.remove([CONFIG.CACHE_KEY]);
    }

    /**
     * Fetches user list with built-in cache validation across all websites.
     */
    static async getUserList() {
        const USERNAME = await this.getUsername();

        return new Promise((resolve) => {
            chrome.storage.local.get([CONFIG.CACHE_KEY], (res) => {
                const cachedData = res[CONFIG.CACHE_KEY];
                
                if (cachedData) {
                    try {
                        const { timestamp, data, owner } = JSON.parse(cachedData);
                        if ((Date.now() - timestamp < CONFIG.CACHE_DURATION) && owner === USERNAME) {
                            return resolve(new Map(data));
                        }
                    } catch (e) {
                        this.invalidateCache();
                    }
                }
                
                chrome.runtime.sendMessage({ action: "FETCH_MAL_LIST", username: USERNAME }, (response) => {
                    const newMap = new Map();
                    if (response && response.success && Array.isArray(response.data)) {
                        response.data.forEach(item => {
                            if (!item || !item.title) return;
                            
                            const normTitle = TextNormalizer.normalize(item.title);
                            
                            if (!newMap.has(normTitle)) newMap.set(normTitle, []);

                            newMap.get(normTitle).push({
                                status: item.status,
                                id: item.id,
                                score: item.score,
                                rawTitle: item.title,
                                type: item.type,
                                progress: item.progress 
                            });
                        });
                        
                        // Saves standardized cache globally
                        chrome.storage.local.set({
                            [CONFIG.CACHE_KEY]: JSON.stringify({
                                timestamp: Date.now(),
                                owner: USERNAME,
                                data: Array.from(newMap.entries())
                            })
                        });
                    }
                    resolve(newMap);
                });
            });
        });
    }
}