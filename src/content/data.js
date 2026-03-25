/**
 * Data Storage and API Communication Layer
 * @description Isolates caching logic and message passing for state retrieval.
 */

class DataManager {
    /**
     * Retrieves the stored MAL username.
     * @returns {Promise<string>} The username.
     */
    static async getUsername() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['malUsername'], (result) => {
                resolve(result.malUsername || 'marcio756');
            });
        });
    }

    /**
     * Fetches and caches the user's combined list (Anime & Manga).
     * Groups identical titles into an array to prevent key collision overrides.
     * @returns {Promise<Map<string, Array<Object>>>} A Map of normalized titles to media arrays.
     */
    static async getUserList() {
        const USERNAME = await this.getUsername();
        const cached = localStorage.getItem(CONFIG.CACHE_KEY);

        if (cached) {
            try {
                const { timestamp, data, owner } = JSON.parse(cached);
                if ((Date.now() - timestamp < CONFIG.CACHE_DURATION) && owner === USERNAME) {
                    return new Map(data);
                }
            } catch (e) { localStorage.removeItem(CONFIG.CACHE_KEY); }
        }
        
        return await new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: "FETCH_MAL_LIST", username: USERNAME }, (response) => {
                const newMap = new Map();
                if (response && response.success && Array.isArray(response.data)) {
                    response.data.forEach(item => {
                        if (!item || !item.title) return;
                        
                        const normTitle = TextNormalizer.normalize(item.title);
                        
                        if (!newMap.has(normTitle)) {
                            newMap.set(normTitle, []);
                        }

                        newMap.get(normTitle).push({
                            status: item.status,
                            id: item.id,
                            score: item.score,
                            rawTitle: item.title,
                            type: item.type 
                        });
                    });
                    localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify({
                        timestamp: Date.now(),
                        owner: USERNAME,
                        data: Array.from(newMap.entries())
                    }));
                }
                resolve(newMap);
            });
        });
    }
}