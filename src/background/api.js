/**
 * API Communication Layer
 * @description Handles fetching data from MyAnimeList and Jikan APIs, including intelligent background synonym sync and authenticated requests.
 */
import { AuthService } from './auth.js';

export class ActiveItemsSynonymFetcher {
    /**
     * Synchronizes synonyms for active items (Watching/Reading) lazily to avoid API rate limits.
     * @param {Array<Object>} activeItems - Items currently marked with status === 1.
     */
    static async sync(activeItems) {
        const { mal_synonyms_cache } = await chrome.storage.local.get(['mal_synonyms_cache']);
        const cache = mal_synonyms_cache || {};
        let updated = false;

        for (const item of activeItems) {
            const normTitle = item.title.toLowerCase();
            const syncKey = `jikan_sync_${item.type}_${item.id}`;
            
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
                
                await chrome.storage.local.set({ [syncKey]: true });
                await new Promise(resolve => setTimeout(resolve, 1500)); 
            } catch (error) {
                console.error("[ActiveItemsSynonymFetcher] Error fetching synonyms:", error);
            }
        }

        if (updated) {
            await chrome.storage.local.set({ mal_synonyms_cache: cache });
        }
    }
}

export class MalService {
    static async fetchList(username, listType) {
        let allItems = [];
        let offset = 0;
        let hasMore = true;

        while (hasMore && offset < 50000) { 
            const malUrl = `https://myanimelist.net/${listType}/${username}/load.json?status=7&offset=${offset}&_t=${Date.now()}`;
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

    static async fetchAllUserItems(username) {
        try {
            const [animeList, mangaList] = await Promise.all([
                this.fetchList(username, 'animelist'),
                this.fetchList(username, 'mangalist')
            ]);

            const normalizedAnimes = animeList.map(item => ({
                id: item.anime_id,
                title: item.anime_title,
                title_eng: item.anime_title_eng || item.anime_english || null,
                status: item.status,
                score: item.score,
                type: 'anime',
                num_watched_episodes: item.num_watched_episodes || 0
            }));

            const normalizedMangas = mangaList.map(item => ({
                id: item.manga_id,
                title: item.manga_title,
                title_eng: item.manga_title_eng || item.manga_english || null,
                status: item.status,
                score: item.score,
                type: 'manga',
                num_read_chapters: item.num_read_chapters || 0
            }));

            const combined = [...normalizedAnimes, ...normalizedMangas];
            
            const activeItems = combined.filter(item => item.status === 1);
            ActiveItemsSynonymFetcher.sync(activeItems);

            return combined;
        } catch (error) {
            console.error("[MalService] Error combining lists:", error);
            throw error;
        }
    }

    /**
     * Updates user list entry on MyAnimeList utilizing OAuth2.
     * @param {number} id - Media ID.
     * @param {string} type - 'anime' or 'manga'.
     * @param {Object} params - The parameters to update (status, score, progress, etc).
     * @returns {Promise<Object>} Response from MAL API.
     */
    static async updateListEntry(id, type, params) {
        try {
            const token = await AuthService.getAccessToken();
            const url = `https://api.myanimelist.net/v2/${type}/${id}/my_list_status`;
            
            const response = await fetch(url, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams(params)
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error("[MalService] MAL API Rejection:", errorData);
                throw new Error('Failed to update MAL list');
            }
            return await response.json();
        } catch (error) {
            console.error("[MalService] Error updating entry:", error);
            throw error;
        }
    }
}