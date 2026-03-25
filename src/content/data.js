/**
 * Data Storage and API Communication Layer
 * @description Isolates caching logic, self-learning dictionaries, and message passing.
 */

class SynonymDictionary {
    static cache = {};

    /**
     * Initializes the dictionary by loading data from Chrome Storage asynchronously.
     * @returns {Promise<void>} Resolves when the cache is successfully loaded.
     */
    static async init() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['mal_synonyms_cache'], (res) => {
                this.cache = res.mal_synonyms_cache || {};
                resolve();
            });
        });
    }

    /**
     * Retrieves the self-learned synonyms cache mapping.
     * @returns {Object} Key-Value pairs mapping aliases to official titles.
     */
    static getCache() {
        return this.cache;
    }

    /**
     * Persists a new discovered alias/synonym to storage and updates current cache.
     * @param {string} alias - The name found on the website.
     * @param {string} officialTitle - The normalized official MAL title.
     */
    static save(alias, officialTitle) {
        if (!alias || !officialTitle) return;
        this.cache[alias] = officialTitle;
        chrome.storage.local.set({ mal_synonyms_cache: this.cache });
    }

    /**
     * Translates a string using the self-learned cache if a match exists.
     * @param {string} title - The title to translate.
     * @returns {string} The official title if cached, otherwise the original string.
     */
    static resolve(title) {
        return this.cache[title] || title;
    }
}

class DataManager {
    static async getUsername() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['malUsername'], (result) => {
                resolve(result.malUsername || 'marcio756');
            });
        });
    }

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
                        
                        if (!newMap.has(normTitle)) newMap.set(normTitle, []);

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