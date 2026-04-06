// src/background/services/api.service.js

/**
 * API Communication Layer
 * @description Handles fetching data from MyAnimeList and Jikan APIs with strict rate limiting, timeout protection, and automatic OAuth2 token refreshing.
 */
import { AuthService } from './auth.service.js';

/**
 * Utility function to execute fetch requests with a strict timeout.
 * @param {string} url - The target URL.
 * @param {Object} options - Fetch options.
 * @param {number} timeoutMs - Timeout in milliseconds (default: 8000ms).
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
}

/**
 * Jikan API Rate Limiter
 * @description Ensures we do not exceed Jikan's 3 requests/second limit by queueing requests with a 400ms delay.
 */
class JikanRateLimiter {
    static queue = [];
    static isProcessing = false;

    /**
     * Enqueues a fetch request to the Jikan API.
     * @param {string} url - Jikan API endpoint.
     * @returns {Promise<any>} JSON response data.
     */
    static async schedule(url) {
        return new Promise((resolve, reject) => {
            this.queue.push({ url, resolve, reject });
            this.processQueue();
        });
    }

    static async processQueue() {
        if (this.isProcessing || this.queue.length === 0) return;
        this.isProcessing = true;

        const { url, resolve, reject } = this.queue.shift();

        try {
            const response = await fetchWithTimeout(url, {}, 8000);
            if (!response.ok) {
                if (response.status === 429) {
                    console.warn("[JikanRateLimiter] 429 Too Many Requests. Backing off.");
                    this.queue.unshift({ url, resolve, reject }); // Re-queue
                    await new Promise(r => setTimeout(r, 2000)); // Hard backoff
                } else {
                    reject(new Error(`Jikan API Error: ${response.status}`));
                }
            } else {
                const data = await response.json();
                resolve(data);
            }
        } catch (error) {
            reject(error);
        } finally {
            await new Promise(r => setTimeout(r, 400)); // Strict 400ms delay between calls
            this.isProcessing = false;
            this.processQueue();
        }
    }
}

export class ActiveItemsSynonymFetcher {
    static async sync(activeItems) {
        try {
            const storageData = await new Promise(resolve => {
                chrome.storage.local.get(['mal_synonyms_cache', 'mal_relations_cache'], (res) => {
                    if (chrome.runtime.lastError) console.warn("[Storage] Error:", chrome.runtime.lastError);
                    resolve(res);
                });
            });

            const cache = storageData.mal_synonyms_cache || {};
            const relationsCache = storageData.mal_relations_cache || {};
            let updated = false;

            for (const item of activeItems) {
                const normTitle = item.title.toLowerCase();
                const syncKey = `jikan_sync_v2_${item.type}_${item.id}`;
                
                const storageRes = await new Promise(resolve => chrome.storage.local.get(syncKey, resolve));
                if (storageRes[syncKey]) continue;

                try {
                    const url = `https://api.jikan.moe/v4/${item.type}/${item.id}`;
                    const { data } = await JikanRateLimiter.schedule(url); // Using Rate Limiter
                    
                    if (data.title_synonyms && Array.isArray(data.title_synonyms)) {
                        data.title_synonyms.forEach(syn => {
                            const cleanSyn = syn.toLowerCase().replace(/[^a-z0-9\s\-]/g, "").replace(/\s+/g, " ").trim();
                            if (cleanSyn) cache[cleanSyn] = normTitle;
                        });
                        updated = true;
                    }
                    
                    if (data.title_english) {
                        const cleanEng = data.title_english.toLowerCase().replace(/[^a-z0-9\s\-]/g, "").replace(/\s+/g, " ").trim();
                        if (cleanEng) cache[cleanEng] = normTitle;
                        updated = true;
                    }

                    if (data.relations && Array.isArray(data.relations)) {
                        let prequels = [];
                        let sequels = [];
                        
                        data.relations.forEach(rel => {
                            if (rel.relation === 'Prequel' && rel.entry) {
                                prequels.push(...rel.entry.filter(e => e.type === item.type).map(e => e.mal_id));
                            }
                            if (rel.relation === 'Sequel' && rel.entry) {
                                sequels.push(...rel.entry.filter(e => e.type === item.type).map(e => e.mal_id));
                            }
                        });

                        relationsCache[item.id] = { prequels, sequels };
                        updated = true;
                    }
                    
                    chrome.storage.local.set({ [syncKey]: true });
                } catch (error) {
                    console.warn(`[ActiveItemsSynonymFetcher] Silent error fetching ${item.id}:`, error);
                }
            }

            if (updated) {
                chrome.storage.local.set({ 
                    mal_synonyms_cache: cache,
                    mal_relations_cache: relationsCache
                });
            }
        } catch (globalError) {
            console.warn("[ActiveItemsSynonymFetcher] Global silent error:", globalError);
        }
    }
}

export class MalService {
    static async fetchList(username, listType, status = 7) {
        let allItems = [];
        let offset = 0;
        let hasMore = true;

        while (hasMore && offset < 50000) { 
            const malUrl = `https://myanimelist.net/${listType}/${username}/load.json?status=${status}&offset=${offset}&_t=${Date.now()}`;
            try {
                const res = await fetchWithTimeout(malUrl, {}, 8000);
                if (!res.ok) throw new Error(`MAL API Error: Private or Invalid Profile for ${listType}`);
                
                const data = await res.json();
                if (!Array.isArray(data)) throw new Error("Invalid Data Format");
                
                allItems = allItems.concat(data);
                
                if (data.length < 300) hasMore = false;
                else offset += 300;
            } catch (error) {
                console.warn(`[MalService] Silent error fetching ${listType}:`, error);
                hasMore = false; 
            }
        }
        return allItems;
    }

    static normalizeItems(rawList, type) {
        return rawList.map(item => {
            // Data Validation Protection
            const rawEps = type === 'anime' ? item.anime_num_episodes : item.manga_num_chapters;
            const validTotal = (typeof rawEps === 'number' && rawEps > 0) ? rawEps : 0;
            
            const rawProgress = type === 'anime' ? item.num_watched_episodes : item.num_read_chapters;
            const validProgress = (typeof rawProgress === 'number' && rawProgress > 0) ? rawProgress : 0;

            const validStatus = item.status ? item.status : 6; // Default to Planned if missing

            return {
                id: type === 'anime' ? item.anime_id : item.manga_id,
                title: type === 'anime' ? item.anime_title : item.manga_title,
                title_eng: (type === 'anime' ? item.anime_title_eng || item.anime_english : item.manga_title_eng || item.manga_english) || null,
                status: validStatus,
                score: item.score || 0,
                type: type,
                progress: validProgress,
                total: validTotal,
                num_watched_episodes: type === 'anime' ? validProgress : 0,
                num_read_chapters: type === 'manga' ? validProgress : 0
            };
        });
    }

    static async fetchActiveItemsOnly(username) {
        try {
            const [animeList, mangaList] = await Promise.all([
                this.fetchList(username, 'animelist', 1),
                this.fetchList(username, 'mangalist', 1)
            ]);

            const combined = [
                ...this.normalizeItems(animeList, 'anime'),
                ...this.normalizeItems(mangaList, 'manga')
            ];

            ActiveItemsSynonymFetcher.sync(combined);
            return combined;
        } catch (error) {
            console.warn("[MalService] Silent error fetching active items:", error);
            return [];
        }
    }

    static async fetchAllUserItems(username) {
        try {
            const [animeList, mangaList] = await Promise.all([
                this.fetchList(username, 'animelist', 7),
                this.fetchList(username, 'mangalist', 7)
            ]);

            const combined = [
                ...this.normalizeItems(animeList, 'anime'),
                ...this.normalizeItems(mangaList, 'manga')
            ];
            
            const activeItems = combined.filter(item => item.status === 1);
            ActiveItemsSynonymFetcher.sync(activeItems);

            return combined;
        } catch (error) {
            console.warn("[MalService] Silent error combining lists:", error);
            throw error;
        }
    }

    static async updateListEntry(id, type, params, isRetry = false) {
        try {
            const token = await AuthService.getAccessToken();
            const url = `https://api.myanimelist.net/v2/${type}/${id}/my_list_status`;
            
            let response = await fetchWithTimeout(url, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams(params)
            }, 8000);

            // Automatic Token Refresh Fallback
            if (response.status === 401 && !isRetry) {
                console.warn("[MalService] 401 Unauthorized. Attempting automatic token refresh...");
                await new Promise(resolve => {
                    chrome.storage.local.get(['mal_refresh_token'], async (res) => {
                        if (res.mal_refresh_token) {
                            try {
                                await AuthService.refreshAccessToken(res.mal_refresh_token);
                                resolve();
                            } catch(e) { resolve(); }
                        } else {
                            resolve();
                        }
                    });
                });
                return this.updateListEntry(id, type, params, true);
            }

            if (!response.ok) {
                const status = response.status;
                let errorData = null;
                try { errorData = await response.json(); } catch(e) {}
                
                if (status === 400 && (params.num_watched_episodes || params.num_chapters_read)) {
                    console.warn("[MAL Highlighter] Cap limit exceeded. Forcing completion status.");
                    delete params.num_watched_episodes;
                    delete params.num_chapters_read;
                    params.status = 2; 
                    
                    response = await fetchWithTimeout(url, {
                        method: 'PATCH',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/x-www-form-urlencoded'
                        },
                        body: new URLSearchParams(params)
                    }, 8000);
                    
                    if (!response.ok) throw new Error('MAL API Safety Fallback Failed');
                } else {
                    throw new Error(`MAL API Rejected: ${errorData?.message || status}`);
                }
            }
            return await response.json();
        } catch (error) {
            console.warn("[MalService] Silent error updating entry:", error);
            throw error;
        }
    }
}