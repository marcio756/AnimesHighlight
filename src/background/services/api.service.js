// src/background/services/api.service.js

/**
 * API Communication Layer
 * @description Handles fetching data from MyAnimeList and Jikan APIs with strict rate limiting, timeout protection, and automatic OAuth2 token refreshing.
 */
import { AuthService } from './auth.service.js';
import { NetworkService } from '../../common/network.service.js';
import { TextNormalizer } from '../../content/utils.js';

/**
 * Jikan API Rate Limiter
 * @description Ensures we do not exceed Jikan's 3 requests/second limit by queueing requests with a 400ms delay.
 */
export class JikanRateLimiter {
    static queue = [];
    static isProcessing = false;

    /**
     * Enqueues a fetch request to the Jikan API.
     * @param {string} url - Jikan API endpoint.
     * @returns {Promise<any>} JSON response data.
     */
    static async schedule(url, priority = false) {
        return new Promise((resolve, reject) => {
            const job = { url, resolve, reject, retries: 0 };
            // Pedidos iniciados pelo utilizador passam à frente da sincronização em segundo plano
            if (priority) this.queue.unshift(job);
            else this.queue.push(job);
            this.processQueue();
        });
    }

    static async processQueue() {
        if (this.isProcessing || this.queue.length === 0) return;
        this.isProcessing = true;

        const job = this.queue.shift();
        const { url, resolve, reject } = job;

        try {
            const response = await NetworkService.fetchWithTimeout(url, {}, 10000);
            if (!response.ok) {
                if (response.status === 429) {
                    console.warn("[JikanRateLimiter] 429 Too Many Requests. Backing off.");
                    if (++job.retries > 3) reject(new Error('Jikan API Error: 429'));
                    else {
                        this.queue.unshift(job); // Re-queue
                        await new Promise(r => setTimeout(r, 1500)); // Backoff
                    }
                } else {
                    reject(new Error(`Jikan API Error: ${response.status}`));
                }
            } else {
                const data = await response.json();
                resolve(data);
            }
        } catch (error) {
            // "Failed to fetch" costuma ser um 429 sem cabeçalhos CORS: dar tempo à Jikan antes do próximo pedido
            await new Promise(r => setTimeout(r, 3000));
            reject(error);
        } finally {
            // A Jikan permite 60 pedidos/minuto (e 3/s): ~1.1s entre chamadas mantém-nos abaixo do limite
            await new Promise(r => setTimeout(r, 1100));
            this.isProcessing = false;
            this.processQueue();
        }
    }
}

export class ActiveItemsSynonymFetcher {
    static running = false;

    static async sync(activeItems) {
        if (this.running) return; // Uma sincronização de cada vez (evita pedidos duplicados)
        this.running = true;
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
            let consecutiveFailures = 0;
            let processed = 0;

            const persist = () => chrome.storage.local.set({
                mal_synonyms_cache: cache,
                mal_relations_cache: relationsCache
            });

            for (const item of activeItems) {
                if (consecutiveFailures >= 3) {
                    console.warn("[ActiveItemsSynonymFetcher] Jikan indisponível/limitada. A retomar na próxima sincronização.");
                    break;
                }

                const normTitle = TextNormalizer.normalize(item.title);
                const syncKey = `jikan_sync_v3_${item.type}_${item.id}`;

                const storageRes = await new Promise(resolve => chrome.storage.local.get(syncKey, resolve));
                if (storageRes[syncKey]) continue;

                try {
                    const url = `https://api.jikan.moe/v4/${item.type}/${item.id}`;
                    const { data } = await JikanRateLimiter.schedule(url); // Using Rate Limiter

                    if (data.title_synonyms && Array.isArray(data.title_synonyms)) {
                        data.title_synonyms.forEach(syn => {
                            const cleanSyn = TextNormalizer.normalize(syn);
                            if (cleanSyn && cleanSyn !== normTitle) cache[cleanSyn] = normTitle;
                        });
                        updated = true;
                    }

                    if (data.title_english) {
                        const cleanEng = TextNormalizer.normalize(data.title_english);
                        if (cleanEng && cleanEng !== normTitle) cache[cleanEng] = normTitle;
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
                    consecutiveFailures = 0;
                    if (updated && ++processed % 10 === 0) persist(); // Guardar progresso (o service worker pode adormecer)
                } catch (error) {
                    consecutiveFailures++;
                    console.warn(`[ActiveItemsSynonymFetcher] Falha ao buscar ${item.id}: ${error.message}`);
                }
            }

            if (updated) persist();
        } catch (globalError) {
            console.warn("[ActiveItemsSynonymFetcher] Global silent error:", globalError);
        } finally {
            this.running = false;
        }
    }
}

export class MalService {
    static async fetchList(username, listType, status = 7) {
        let allItems = [];
        let offset = 0;
        let hasMore = true;

        const seen = new Set();
        const idKey = listType === 'animelist' ? 'anime_id' : 'manga_id';

        while (hasMore && offset < 50000) {
            const malUrl = `https://myanimelist.net/${listType}/${encodeURIComponent(username)}/load.json?status=${status}&offset=${offset}&_t=${Date.now()}`;
            // Erros propagam: uma lista parcial/vazia nunca deve ser tratada (nem guardada) como válida
            const res = await NetworkService.fetchWithTimeout(malUrl, {}, 15000);
            if (!res.ok) throw new Error(`MAL API Error: Private or Invalid Profile for ${listType}`);

            const data = await res.json();
            if (!Array.isArray(data)) throw new Error("Invalid Data Format");

            const fresh = data.filter(item => !seen.has(item[idKey]));
            fresh.forEach(item => seen.add(item[idKey]));
            allItems = allItems.concat(fresh);

            if (data.length < 300 || fresh.length === 0) hasMore = false;
            else offset += 300;
        }
        return allItems;
    }

    static normalizeItems(rawList, type) {
        return rawList.map(item => {
            const rawEps = type === 'anime' ? item.anime_num_episodes : item.manga_num_chapters;
            const validTotal = (typeof rawEps === 'number' && rawEps > 0) ? rawEps : 0;

            const rawProgress = type === 'anime' ? item.num_watched_episodes : item.num_read_chapters;
            const validProgress = (typeof rawProgress === 'number' && rawProgress > 0) ? rawProgress : 0;

            const validStatus = item.status ? item.status : 6;

            return {
                id: type === 'anime' ? item.anime_id : item.manga_id,
                title: type === 'anime' ? item.anime_title : item.manga_title,
                title_eng: (type === 'anime' ? item.anime_title_eng || item.anime_english : item.manga_title_eng || item.manga_english) || null,
                status: validStatus,
                score: item.score || 0,
                type: type,
                progress: validProgress,
                total: validTotal,
                // Garantir que os campos específicos existem para o painel
                num_watched_episodes: validProgress,
                num_read_chapters: validProgress
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

    static sharedList = { username: null, timestamp: 0, promise: null };

    /**
     * Single in-flight/short-lived list fetch shared by every tab (avoids N parallel downloads).
     */
    static fetchAllUserItemsShared(username, force = false) {
        const shared = this.sharedList;
        const fresh = shared.username === username && shared.promise && (Date.now() - shared.timestamp < 60000);
        if (!force && fresh) return shared.promise;

        const promise = this.fetchAllUserItems(username);
        this.sharedList = { username, timestamp: Date.now(), promise };
        promise.catch(() => {
            if (this.sharedList.promise === promise) this.sharedList = { username: null, timestamp: 0, promise: null };
        });
        return promise;
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

    static searchCache = new Map();

    /**
     * Searches anime and manga through the rate-limited Jikan queue (cached per session).
     */
    static async searchItems(title, mediaType) {
        const types = mediaType === 'manga' ? ['manga'] : mediaType === 'anime' ? ['anime'] : ['anime', 'manga'];
        const key = `${types.join(',')}|${String(title).toLowerCase()}`;
        if (this.searchCache.has(key)) return this.searchCache.get(key);

        const query = encodeURIComponent(title);
        const settled = await Promise.allSettled(
            types.map(type => JikanRateLimiter.schedule(`https://api.jikan.moe/v4/${type}?q=${query}&limit=5`, true))
        );

        const results = [];
        types.forEach((type, i) => {
            const res = settled[i];
            if (res.status === 'fulfilled' && Array.isArray(res.value.data)) {
                results.push(...res.value.data.map(item => ({ ...item, type })));
            }
        });

        if (results.length === 0) throw new Error('Not found');
        this.searchCache.set(key, results);
        return results;
    }

    /**
     * Follows the Sequel chain when progress exceeds the entry's total, so
     * e.g. episode 14 of a 12-episode season becomes episode 2 of the next one.
     * @returns {Promise<{resolvedId:number, resolvedProgress:number, title:string, max:number, overflow:boolean}>}
     */
    static async resolveContinuous(id, type, progress) {
        let currentId = id;
        let { data: current } = await JikanRateLimiter.schedule(`https://api.jikan.moe/v4/${type}/${currentId}`);
        let remaining = progress;
        const visited = new Set([currentId]);

        for (let depth = 0; depth < 10; depth++) {
            const max = (type === 'anime' ? current.episodes : current.chapters) || 0;
            if (!max || remaining <= max) {
                return { resolvedId: currentId, resolvedProgress: remaining, title: current.title, max, overflow: false };
            }

            const { data: relations } = await JikanRateLimiter.schedule(`https://api.jikan.moe/v4/${type}/${currentId}/relations`);
            const sequel = (relations || [])
                .filter(r => r.relation === 'Sequel')
                .flatMap(r => r.entry || [])
                .find(e => e.type === type && !visited.has(e.mal_id));

            if (!sequel) {
                return { resolvedId: currentId, resolvedProgress: max, title: current.title, max, overflow: true };
            }

            remaining -= max;
            currentId = sequel.mal_id;
            visited.add(currentId);
            ({ data: current } = await JikanRateLimiter.schedule(`https://api.jikan.moe/v4/${type}/${currentId}`));
        }

        const max = (type === 'anime' ? current.episodes : current.chapters) || 0;
        return { resolvedId: currentId, resolvedProgress: Math.min(remaining, max || remaining), title: current.title, max, overflow: false };
    }

    /**
     * Resolves a MAL URL, numeric id or free-text name to { id, type, title }.
     */
    static async resolveManualLink(input, defaultType) {
        const text = String(input || '').trim();
        if (!text) throw new Error('Empty input');

        const urlMatch = text.match(/myanimelist\.net\/(anime|manga)\/(\d+)/i);
        const idOnly = text.match(/^\d+$/);
        let type = defaultType === 'manga' ? 'manga' : 'anime';
        let id = null;

        if (urlMatch) { type = urlMatch[1].toLowerCase(); id = parseInt(urlMatch[2], 10); }
        else if (idOnly) { id = parseInt(text, 10); }

        if (id) {
            try {
                const { data } = await JikanRateLimiter.schedule(`https://api.jikan.moe/v4/${type}/${id}`, true);
                return { id, type, title: data.title, total: (type === 'anime' ? data.episodes : data.chapters) || 0 };
            } catch (e) {
                // Jikan lento/indisponível: o ID chega para associar; o título vem do slug do link
                const slug = urlMatch ? text.split(/\/(?:anime|manga)\/\d+\/?/i)[1] : '';
                const fallbackTitle = slug ? decodeURIComponent(slug.split(/[/?#]/)[0]).replace(/_/g, ' ').trim() : `MAL #${id}`;
                return { id, type, title: fallbackTitle || `MAL #${id}` };
            }
        }

        const { data } = await JikanRateLimiter.schedule(`https://api.jikan.moe/v4/${type}?q=${encodeURIComponent(text)}&limit=1`, true);
        if (!data || !data.length) throw new Error('Not found');
        return { id: data[0].mal_id, type, title: data[0].title, total: (type === 'anime' ? data[0].episodes : data[0].chapters) || 0 };
    }

    static async getTotalCount(id, type, token) {
        try {
            const field = type === 'anime' ? 'num_episodes' : 'num_chapters';
            const res = await NetworkService.fetchWithTimeout(`https://api.myanimelist.net/v2/${type}/${id}?fields=${field}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            }, 8000);
            if (!res.ok) return 0;
            const data = await res.json();
            return data[field] || 0;
        } catch (e) {
            return 0;
        }
    }

    static async updateListEntry(id, type, params, isRetry = false) {
        try {
            const token = await AuthService.getAccessToken();
            const url = `https://api.myanimelist.net/v2/${type}/${id}/my_list_status`;

            let response = await NetworkService.fetchWithTimeout(url, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams(params)
            }, 8000);

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

                const contentType = response.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    try { errorData = await response.json(); } catch(e) {}
                } else {
                    const textData = await response.text();
                    console.warn(`[MalService] HTML Error Response (Status ${status}):`, textData.substring(0, 100));
                }

                const progressField = params.num_watched_episodes !== undefined ? 'num_watched_episodes'
                    : (params.num_chapters_read !== undefined ? 'num_chapters_read' : null);
                const total = (status === 400 && progressField) ? await this.getTotalCount(id, type, token) : 0;

                if (total > 0 && Number(params[progressField]) >= total) {
                    console.warn("[MAL Highlighter] Cap limit reached. Completing entry at its real total.");
                    const fallbackParams = { ...params, [progressField]: total, status: 'completed' };

                    response = await NetworkService.fetchWithTimeout(url, {
                        method: 'PATCH',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/x-www-form-urlencoded'
                        },
                        body: new URLSearchParams(fallbackParams)
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