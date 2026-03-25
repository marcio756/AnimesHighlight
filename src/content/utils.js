/**
 * Utility Service Layer
 * @description Centralizes pure logic, heuristics, and configuration constants.
 * Separated to enforce SRP and allow independent testing of text and matching algorithms.
 */

const CONFIG = {
    CACHE_KEY: 'mal_v35_full_list', 
    CACHE_DURATION: 1000 * 60 * 15, // 15 Minutes
    DEBOUNCE_DELAY: 500,
    SITE_KEYWORDS: [
        'anime', 'manga', 'donghua', 'episodio', 'episode', 'season', 
        'temporada', 'assistir', 'online', 'legendado', 'dublado', 'stream',
        'ler', 'capitulo', 'chapter', 'manhwa', 'comic', 'scan'
    ]
};

const UI_BLOCKLIST = [
    "selecione um", "player de video", "comentarios", "relacionados", 
    "episodios", "lancamentos", "parceiros", "dmca", "termos", 
    "login", "registrar", "assistir", "online", "download", 
    "animes online", "todos os direitos", "copyright", "proximo episodio",
    "episodio anterior", "lista de animes", "generos", "contato",
    "filmes", "animes", "donghuas", "calendario", "mangas", "ler manga"
];

const STATUS_MAP = {
    1: { class: 'mal-watching', label: 'CURRENT', color: '#2db039' }, 
    2: { class: 'mal-completed', label: 'COMPLETED', color: '#26448f' },
    3: { class: 'mal-hold', label: 'ON HOLD', color: '#f1c83e' },
    4: { class: 'mal-dropped', label: 'DROPPED', color: '#a12f31' },
    6: { class: 'mal-plan', label: 'PLANNED', color: '#787878' }
};

class PerformanceGuard {
    /**
     * Validates if the current web page context is related to anime or manga.
     * Prevents the script from wasting CPU cycles on irrelevant websites.
     * @returns {boolean} True if the page context matches the keywords.
     */
    static isRelevantPage() {
        const url = window.location.href.toLowerCase();
        if (url.includes('myanimelist')) return false; 

        const title = document.title.toLowerCase();
        const metaDesc = document.querySelector('meta[name="description"]')?.content.toLowerCase() || "";
        
        const hasKeyword = CONFIG.SITE_KEYWORDS.some(kw => 
            title.includes(kw) || metaDesc.includes(kw) || url.includes(kw)
        );

        if (!hasKeyword) {
            console.log("[MAL Highlighter] Script idle: Not a recognized media page.");
        }
        return hasKeyword;
    }
}

class ContextAnalyzer {
    /**
     * Infers the type of media (anime or manga) based on the URL and page title keywords.
     * Crucial for deciding which MyAnimeList profile to open when names collide.
     * @returns {string} The inferred media type: 'anime' or 'manga'.
     */
    static guessContentType() {
        const url = window.location.href.toLowerCase();
        const title = document.title.toLowerCase();
        const fullContext = url + title;

        const mangaKeywords = ['manga', 'manhwa', 'comic', 'ler', 'read', 'capitulo', 'chapter', 'scan'];
        
        if (mangaKeywords.some(kw => fullContext.includes(kw))) {
            return 'manga';
        }
        return 'anime';
    }
}

class TextNormalizer {
    /**
     * Strips punctuation, accents, and irrelevant keywords to create a clean string for fuzzy matching.
     * @param {string} str - The raw title string extracted from the DOM.
     * @returns {string} The normalized string.
     */
    static normalize(str) {
        if (!str || str.length < 3) return "";
        
        let clean = String(str).toLowerCase();
        clean = clean.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); 
        clean = clean.replace(/\b(episodio|episode|ep|e|capitulo|cap|chapter|ch)\s*[0-9]+\b/g, " "); 
        clean = clean.replace(/\b([0-9]+)(st|nd|rd|th)\b/g, "$1"); 
        clean = clean.replace(/\s+-\s+/g, " "); 
        clean = clean.replace(/[\[\]\(\)\_\.]/g, " "); 
        
        const ignoreRegex = /\b(tv|movie|legendado|leg|dublado|dubbed|dub|filme|filmes|animes|anime|manga|mangas|manhwa|[0-9]+ª|online|ver|assistir|ler|season|temp|parte|part|net|com|br|org|hd|fhd|4k|q1n)\b/g;
        clean = clean.replace(ignoreRegex, " ");

        clean = clean.replace(/[^a-z0-9\s\-]/g, "").replace(/\s+/g, " ").trim();
        if (clean.endsWith('-')) clean = clean.slice(0, -1);
        
        return clean.trim();
    }

    /**
     * Extracts a potential title from the URL path as a fallback mechanism.
     * @returns {string|null} The extracted slug or null if invalid.
     */
    static getSlugFromUrl() {
        const path = window.location.pathname;
        const segments = path.split('/').filter(p => p.length > 0);
        if (segments.length === 0) return null;
        
        const lastSegment = segments[segments.length - 1].toLowerCase();
        if (UI_BLOCKLIST.includes(lastSegment) || /page\d+/.test(lastSegment)) return null;

        return lastSegment.replace(/-/g, ' ');
    }
}

class Matcher {
    /**
     * Performs a fuzzy string comparison to match DOM titles with MAL titles.
     * @param {string} siteTitle - The normalized title from the website.
     * @param {string} malTitle - The normalized title from MyAnimeList.
     * @returns {boolean} True if the strings are a likely match.
     */
    static isFuzzyMatch(siteTitle, malTitle) {
        if (siteTitle === malTitle) return true;

        if (malTitle.includes(siteTitle) || siteTitle.includes(malTitle)) {
            if (Math.abs(malTitle.length - siteTitle.length) <= 4) return true;
        }

        const cleanToken = t => t.replace(/-/g, '');
        const tokensSite = siteTitle.split(' ').filter(t => t.length > 1).map(cleanToken);
        const tokensMal = malTitle.split(' ').filter(t => t.length > 1).map(cleanToken);
        
        if (tokensSite.length === 0 || tokensMal.length === 0) return false;

        let matches = 0;
        tokensSite.forEach(token => {
            if (tokensMal.includes(token)) matches++;
        });

        if (tokensSite.length >= 5 && matches === tokensSite.length) return true;

        const allTokens = new Set([...tokensSite, ...tokensMal]);
        const ratio = matches / allTokens.size;

        if (tokensMal.length < 3) return ratio >= 1.0;
        
        const allMalTokensPresent = tokensMal.every(t => tokensSite.includes(t));
        if (allMalTokensPresent && tokensMal.length >= 3) return ratio >= 0.6;

        return ratio >= 0.75;
    }
}