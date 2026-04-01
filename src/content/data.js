// src/content/data.js

import { TextNormalizer, CONFIG } from './utils.js';

export class SynonymDictionary {
    static cache = {};

    static async init() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['mal_synonyms_cache', 'synonym_version'], (res) => {
                if (res.synonym_version !== 3) {
                    this.cache = {};
                    chrome.storage.local.set({ mal_synonyms_cache: {}, synonym_version: 3 });
                } else {
                    this.cache = res.mal_synonyms_cache || {};
                }
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

    static invalidateCache() {
        chrome.storage.local.remove([CONFIG.CACHE_KEY]);
    }

    static async updateCacheItem(id, type, newData) {
        return new Promise((resolve) => {
            chrome.storage.local.get([CONFIG.CACHE_KEY], (res) => {
                const cachedData = res[CONFIG.CACHE_KEY];
                if (cachedData) {
                    try {
                        const parsed = JSON.parse(cachedData);
                        let updated = false;
                        for (let [title, items] of parsed.data) {
                            for (let item of items) {
                                if (item.id === id && item.type === type) {
                                    Object.assign(item, newData);
                                    updated = true;
                                }
                            }
                        }
                        if (updated) {
                            chrome.storage.local.set({ [CONFIG.CACHE_KEY]: JSON.stringify(parsed) }, resolve);
                            return;
                        }
                    } catch (e) {}
                }
                resolve();
            });
        });
    }

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
                                title_eng: item.title_eng || null,
                                type: item.type,
                                progress: item.progress,
                                total: item.total
                            });
                        });
                        
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