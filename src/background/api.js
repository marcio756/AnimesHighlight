/**
 * API Communication Layer
 * @description Handles fetching data from MyAnimeList and Jikan APIs.
 */
class MalService {
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
                status: item.status,
                score: item.score,
                type: 'anime',
                num_watched_episodes: item.num_watched_episodes || 0
            }));

            const normalizedMangas = mangaList.map(item => ({
                id: item.manga_id,
                title: item.manga_title,
                status: item.status,
                score: item.score,
                type: 'manga',
                num_read_chapters: item.num_read_chapters || 0
            }));

            return [...normalizedAnimes, ...normalizedMangas];
        } catch (error) {
            console.error("[MalService] Error combining lists:", error);
            throw error;
        }
    }
}