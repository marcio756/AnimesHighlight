// src/content/data.js

import { TextNormalizer, CONFIG } from './utils.js';
import { sendMessage } from './messaging.js';

/**
 * Storage Abstraction with LastError Protection
 * @description Safe wrapper for reading and writing to Chrome storage.
 */
class SafeStorage {
    static async get(keys) {
        return new Promise((resolve) => {
            chrome.storage.local.get(keys, (res) => {
                if (chrome.runtime.lastError) console.warn("[SafeStorage] Read Error:", chrome.runtime.lastError);
                resolve(res || {});
            });
        });
    }

    static async set(data) {
        return new Promise((resolve) => {
            chrome.storage.local.set(data, () => {
                if (chrome.runtime.lastError) console.warn("[SafeStorage] Write Error:", chrome.runtime.lastError);
                resolve();
            });
        });
    }

    static async remove(keys) {
        return new Promise((resolve) => {
            chrome.storage.local.remove(keys, () => {
                if (chrome.runtime.lastError) console.warn("[SafeStorage] Remove Error:", chrome.runtime.lastError);
                resolve();
            });
        });
    }
}

export class RelationDictionary {
    static relationsCache = {};

    static async init() {
        try {
            const res = await SafeStorage.get(['mal_relations_cache']);
            this.relationsCache = res.mal_relations_cache || {};
        } catch (error) {
            console.warn("[RelationDictionary] Silent init error:", error);
        }
    }

    static getRelations() {
        return this.relationsCache;
    }
}

/**
 * Manual Mappings
 * @description Associações criadas pelo utilizador ("este título do site é este anime do MAL").
 * Chave = título normalizado do site; valor = { id, type, title }.
 */
export class ManualMappingManager {
    static cache = {};

    static async init() {
        const res = await SafeStorage.get(['manualMappings']);
        this.cache = res.manualMappings || {};
    }

    static get(normTitle) {
        return normTitle ? this.cache[normTitle] || null : null;
    }

    static async remove(normTitle) {
        if (!normTitle || !this.cache[normTitle]) return;
        delete this.cache[normTitle];
        await SafeStorage.set({ manualMappings: this.cache });
    }

    static async save(normTitle, mapping) {
        if (!normTitle || !mapping || !mapping.id) return;
        this.cache[normTitle] = { id: mapping.id, type: mapping.type, title: mapping.title, total: mapping.total || 0 };
        await SafeStorage.set({ manualMappings: this.cache });
    }
}

export class SynonymDictionary {
    static cache = {};

    static async init() {
        try {
            await RelationDictionary.init();
            const res = await SafeStorage.get(['mal_synonyms_cache', 'synonym_version']);

            if (res.synonym_version !== 4) {
                this.cache = {};
                await SafeStorage.set({ mal_synonyms_cache: {}, synonym_version: 4 });
            } else {
                this.cache = res.mal_synonyms_cache || {};
            }
        } catch (error) {
            console.warn("[SynonymDictionary] Silent init error:", error);
        }
    }

    static getCache() {
        return this.cache;
    }

    static save(alias, officialTitle) {
        try {
            if (!alias || !officialTitle) return;
            this.cache[alias] = officialTitle;
            // Merge com o que já está guardado (o service worker também escreve aqui)
            SafeStorage.get(['mal_synonyms_cache']).then(res => {
                SafeStorage.set({ mal_synonyms_cache: { ...(res.mal_synonyms_cache || {}), [alias]: officialTitle } });
            });
        } catch (error) {
            console.warn("[SynonymDictionary] Silent save error:", error);
        }
    }

    static resolve(title) {
        return this.cache[title] || title;
    }
}

export class DataManager {
    static async getUsername() {
        try {
            const result = await SafeStorage.get(['malUsername']);
            return result.malUsername || null;
        } catch (error) {
            console.warn("[DataManager] Silent getUsername error:", error);
            return null;
        }
    }

    static invalidateCache() {
        SafeStorage.remove([CONFIG.CACHE_KEY]);
    }

    /**
     * Updates an item in the cached list. If the item is not cached yet (e.g. just added to the
     * user's MAL list from the panel) and `meta.title` is provided, it is inserted instead.
     */
    static async updateCacheItem(id, type, newData, meta = null) {
        try {
            const res = await SafeStorage.get([CONFIG.CACHE_KEY]);
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
                    if (!updated && meta && meta.title) {
                        const normTitle = TextNormalizer.normalize(meta.title);
                        const newItem = {
                            status: 6, id, score: 0, rawTitle: meta.title, title_eng: null,
                            type, progress: 0, total: meta.total || 0, ...newData
                        };
                        const existing = parsed.data.find(([t]) => t === normTitle);
                        if (existing) existing[1].push(newItem);
                        else parsed.data.push([normTitle, [newItem]]);
                        updated = true;
                    }
                    if (updated) {
                        await SafeStorage.set({ [CONFIG.CACHE_KEY]: JSON.stringify(parsed) });
                    }
                } catch (e) {
                    console.warn("[DataManager] Silent JSON parse error:", e);
                }
            }
        } catch (error) {
            console.warn("[DataManager] Silent update cache error:", error);
        }
    }

    static async getUserList() {
        try {
            const USERNAME = await this.getUsername();
            if (!USERNAME) return new Map(); // Sem utilizador configurado: nada a destacar (nunca assumir a lista de outra pessoa)
            const res = await SafeStorage.get([CONFIG.CACHE_KEY]);
            const cachedData = res[CONFIG.CACHE_KEY];
            let staleMap = null;

            if (cachedData) {
                try {
                    const { timestamp, data, owner } = JSON.parse(cachedData);
                    if (owner === USERNAME) {
                        if (Date.now() - timestamp < CONFIG.CACHE_DURATION) return new Map(data);
                        staleMap = new Map(data); // usada se o MAL estiver inacessível
                    }
                } catch (e) {
                    this.invalidateCache();
                }
            }

            return new Promise((resolve) => {
                sendMessage({ action: "FETCH_MAL_LIST", username: USERNAME }, async (response) => {
                    if (chrome.runtime.lastError) console.warn("[DataManager] Message error:", chrome.runtime.lastError);

                    const newMap = new Map();
                    if (!(response && response.success && Array.isArray(response.data))) {
                        resolve(staleMap || newMap);
                        return;
                    }
                    {
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

                        await SafeStorage.set({
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
        } catch (error) {
            console.warn("[DataManager] Silent getUserList error:", error);
            return new Map();
        }
    }
}