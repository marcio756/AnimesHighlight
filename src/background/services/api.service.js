// src/background/services/api.service.js

/**
 * API Communication Layer
 * @description Handles fetching data from MyAnimeList and Jikan APIs.
 * Applies SRP by separating full list fetches (for UI) from active list fetches (for background monitoring).
 */
import { AuthService } from './auth.service.js';

export class ActiveItemsSynonymFetcher {
    static async sync(activeItems) {
        const storageData = await chrome.storage.local.get(['mal_synonyms_cache', 'mal_relations_cache']);
        const cache = storageData.mal_synonyms_cache || {};
        const relationsCache = storageData.mal_relations_cache || {};
        let updated = false;

        for (const item of activeItems) {
            const normTitle = item.title.toLowerCase();
            const syncKey = `jikan_sync_v2_${item.type}_${item.id}`;
            
            const storageRes = await chrome.storage.local.get(syncKey);
            if (storageRes[syncKey]) continue;

            try {
                const url = `https://api.jikan.moe/v4/${item.type}/${item.id}`;
                const res = await fetch(url);
                
                if (!res.ok) {
                    if (res.status === 429) break; 
                    continue;
                }
                
                const { data } = await res.json();
                
                // Mapear Sinónimos
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

                // Extrair Relações (Sequels e Prequels) para construir a Season Chain
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

                    relationsCache[item.id] = {
                        prequels: prequels,
                        sequels: sequels
                    };
                    updated = true;
                }
                
                await chrome.storage.local.set({ [syncKey]: true });
                await new Promise(resolve => setTimeout(resolve, 1500)); 
            } catch (error) {
                console.error("[ActiveItemsSynonymFetcher] Error fetching data:", error);
            }
        }

        if (updated) {
            await chrome.storage.local.set({ 
                mal_synonyms_cache: cache,
                mal_relations_cache: relationsCache
            });
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
                const res = await fetch(malUrl);
                if (!res.ok) throw new Error(`MAL API Error: Private or Invalid Profile for ${listType}`);
                
                const data = await res.json();
                if (!Array.isArray(data)) throw new Error("Invalid Data Format");
                
                allItems = allItems.concat(data);
                
                if (data.length < 300) hasMore = false;
                else offset += 300;
            } catch (error) {
                console.error(`[MalService] Error fetching ${listType}:`, error);
                hasMore = false; 
            }
        }
        return allItems;
    }

    static normalizeItems(rawList, type) {
        return rawList.map(item => ({
            id: type === 'anime' ? item.anime_id : item.manga_id,
            title: type === 'anime' ? item.anime_title : item.manga_title,
            title_eng: (type === 'anime' ? item.anime_title_eng || item.anime_english : item.manga_title_eng || item.manga_english) || null,
            status: item.status,
            score: item.score,
            type: type,
            progress: type === 'anime' ? (item.num_watched_episodes || 0) : (item.num_read_chapters || 0),
            total: type === 'anime' ? (item.anime_num_episodes || 0) : (item.manga_num_chapters || 0),
            num_watched_episodes: item.num_watched_episodes || 0,
            num_read_chapters: item.num_read_chapters || 0
        }));
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
            console.error("[MalService] Error fetching active items:", error);
            throw error;
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
            console.error("[MalService] Error combining lists:", error);
            throw error;
        }
    }

    static async updateListEntry(id, type, params) {
        try {
            const token = await AuthService.getAccessToken();
            const url = `https://api.myanimelist.net/v2/${type}/${id}/my_list_status`;
            
            let response = await fetch(url, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams(params)
            });

            if (!response.ok) {
                const status = response.status;
                let errorData = null;
                try { errorData = await response.json(); } catch(e) {}
                
                if (status === 400 && (params.num_watched_episodes || params.num_chapters_read)) {
                    console.warn("[MAL Highlighter] Numeração excede limite do MAL. A forçar conclusão da temporada.");
                    delete params.num_watched_episodes;
                    delete params.num_chapters_read;
                    params.status = 2; 
                    
                    response = await fetch(url, {
                        method: 'PATCH',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/x-www-form-urlencoded'
                        },
                        body: new URLSearchParams(params)
                    });
                    
                    if (!response.ok) throw new Error('Falha no Fallback de segurança do MAL');
                } else {
                    throw new Error(`MAL API Rejeitou a atualização: ${errorData?.message || status}`);
                }
            }
            return await response.json();
        } catch (error) {
            console.error("[MalService] Error updating entry:", error);
            throw error;
        }
    }
}