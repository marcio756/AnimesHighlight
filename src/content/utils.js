// src/content/utils.js

/**
 * Utility Service Layer
 * @description Centralizes pure logic, heuristics, and configuration constants.
 * Cleaned of hardcoded site names to ensure universal applicability.
 */

const CONFIG = {
    CACHE_KEY: 'mal_v35_full_list', 
    CACHE_DURATION: 1000 * 60 * 15, 
    DEBOUNCE_DELAY: 500,
    SITE_KEYWORDS: [
        'anime', 'manga', 'donghua', 'episodio', 'episode', 'season', 
        'temporada', 'assistir', 'online', 'legendado', 'dublado', 'stream',
        'ler', 'capitulo', 'chapter', 'manhwa', 'comic', 'scan', 'webtoon'
    ]
};

const UI_BLOCKLIST = [
    "selecione um", "player de video", "comentarios", "relacionados", 
    "episodios", "episodio", "episode", "capitulo", "chapter", 
    "lancamentos", "parceiros", "dmca", "termos", 
    "login", "registrar", "assistir", "online", "download", 
    "todos os direitos", "copyright", "proximo episodio",
    "episodio anterior", "lista de", "generos", "contato",
    "filmes", "animes", "donghuas", "calendario", "mangas"
];

const STATUS_MAP = {
    1: { class: 'mal-watching', labelKey: 'statusWatching', color: '#2db039' }, 
    2: { class: 'mal-completed', labelKey: 'statusCompleted', color: '#26448f' },
    3: { class: 'mal-hold', labelKey: 'statusOnHold', color: '#f1c83e' },
    4: { class: 'mal-dropped', labelKey: 'statusDropped', color: '#a12f31' },
    6: { class: 'mal-plan', labelKey: 'statusPlanned', color: '#787878' }
};

class PerformanceGuard {
    /**
     * Determines if the script should run based on URL and page content metadata.
     */
    static isRelevantPage() {
        const url = window.location.href.toLowerCase();
        if (url.includes('myanimelist')) return false; 

        const title = document.title.toLowerCase();
        const metaDesc = document.querySelector('meta[name="description"]')?.content.toLowerCase() || "";
        
        const hasKeyword = CONFIG.SITE_KEYWORDS.some(kw => 
            title.includes(kw) || metaDesc.includes(kw) || url.includes(kw)
        );

        if (!hasKeyword) console.log("[MAL Highlighter] Script idle: Not a recognized media page.");
        return hasKeyword;
    }
}

class ContextAnalyzer {
    /**
     * Determines the most likely media type (anime/manga) based on URL and DOM heuristics.
     */
    static guessContentType() {
        const url = window.location.href.toLowerCase();
        
        // Priority 1: Specific URL Keywords
        const urlMangaKw = ['manga', 'manhwa', 'manhua', 'scan', 'webtoon', 'ler', 'capitulo'];
        const urlAnimeKw = ['anime', 'episode', 'episodio', 'ep', 'watch', 'assistir', 'season', 'ova'];
        
        const urlTokens = url.replace(/[^a-z0-9]/g, ' ').split(' ');
        
        for (let kw of urlMangaKw) {
            if (urlTokens.includes(kw) || url.includes(`/${kw}/`)) return 'manga';
        }
        for (let kw of urlAnimeKw) {
            if (urlTokens.includes(kw) || url.includes(`/${kw}/`)) return 'anime';
        }

        const path = window.location.pathname;
        const isHomePage = path === '/' || path.length < 3;
        const bodyText = document.body.innerText.toLowerCase();
        
        const chapterCount = (bodyText.match(/\b(chapter|capitulo|capítulo|scan|read|ler|manhwa|manhua)\b/g) || []).length;
        const episodeCount = (bodyText.match(/\b(episode|episodio|episódio|ep|watch|assistir|temporada|stream)\b/g) || []).length;

        // Priority 2: Predominant counts for ambiguous homepages
        if (isHomePage) {
            if (chapterCount > episodeCount) return 'manga';
            if (episodeCount > chapterCount) return 'anime';
        }

        // Priority 3: Meta metadata and Title
        const title = document.title.toLowerCase();
        const metaDesc = document.querySelector('meta[name="description"]')?.content.toLowerCase() || "";
        
        let pageMangaScore = chapterCount;
        let pageAnimeScore = episodeCount;
        
        urlMangaKw.forEach(kw => {
            if (title.includes(kw)) pageMangaScore += 10;
            if (metaDesc.includes(kw)) pageMangaScore += 10;
        });
        
        urlAnimeKw.forEach(kw => {
            if (title.includes(kw)) pageAnimeScore += 10;
            if (metaDesc.includes(kw)) pageAnimeScore += 10;
        });

        return (pageMangaScore > pageAnimeScore) ? 'manga' : 'anime';
    }

    /**
     * Identifies if the current page is a directory (listing multiple series) or a specific item.
     */
    static isListingPage() {
        const pathName = window.location.pathname.toLowerCase();
        const segments = pathName.split('/').filter(p => p.length > 0);
        
        if (segments.length === 0) return true; // Home
        
        const genericDirectories = [
            'episodios', 'episodio', 'lancamentos', 'animes', 'anime',
            'mangas', 'manga', 'filmes', 'ovas', 'calendario', 'lista', 'search', 'explorar', 'genre', 'categoria'
        ];

        if (segments.length === 1 && genericDirectories.includes(segments[0])) return true;
        if (segments.length === 2 && genericDirectories.includes(segments[0]) && ['lista', 'popular', 'news', 'recentes', 'search'].includes(segments[1])) return true;

        return false;
    }
}

class TextNormalizer {
    /**
     * Cleans and normalizes strings for fuzzy matching, removing release noise.
     */
    static normalize(str) {
        if (!str || str.length < 3) return "";
        
        let clean = String(str).toLowerCase();
        clean = clean.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); 
        
        // Strip episode/chapter numbering from the string
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
     * Extracts the series title slug from the URL robustly, ignoring generic directories and episode markers.
     */
    static getSlugFromUrl() {
        const path = window.location.pathname;
        const segments = path.split('/').filter(p => p.length > 0);
        if (segments.length === 0) return null;
        
        // Generic directory paths that are NOT the title
        const generics = ['anime', 'animes', 'manga', 'mangas', 'watch', 'read', 'ler', 'assistir', 'serie', 'series', 'tv', 'movie', 'filme', 'ova', 'category', 'genre'];

        // Traverse backwards to find the actual media title slug
        for (let i = segments.length - 1; i >= 0; i--) {
            const seg = segments[i].toLowerCase();
            
            if (generics.includes(seg)) continue;
            if (/^\d+$/.test(seg)) continue; // Skip pure numeric IDs
            if (/^(capitulo|capítulo|cap|chapter|ch|episodio|episódio|ep|episode)[\s\-]?\d+/i.test(seg)) continue; // Skip chapter/ep segments
            if (/^page\d+/.test(seg)) continue;

            return seg.replace(/[\-_]/g, ' ').trim();
        }

        return null;
    }
}

class Matcher {
    /**
     * Core fuzzy matching algorithm to compare website titles with MAL titles.
     */
    static isFuzzyMatch(siteTitle, malTitle) {
        if (siteTitle === malTitle) return true;

        if (malTitle.includes(siteTitle) || siteTitle.includes(malTitle)) {
            if (Math.abs(malTitle.length - siteTitle.length) <= 4) return true;
            if (siteTitle.length >= 12 && malTitle.startsWith(siteTitle)) return true;
        }

        const cleanToken = t => t.replace(/-/g, '');
        const tokensSite = siteTitle.split(' ').filter(t => t.length > 1).map(cleanToken);
        const tokensMal = malTitle.split(' ').filter(t => t.length > 1).map(cleanToken);
        
        if (tokensSite.length === 0 || tokensMal.length === 0) return false;

        let matches = 0;
        tokensSite.forEach((token, index) => {
            if (tokensMal.includes(token)) {
                matches++;
            } else if (index === tokensSite.length - 1 && token.length >= 3) {
                const isTruncated = tokensMal.some(malToken => malToken.startsWith(token));
                if (isTruncated) matches++;
            }
        });

        if (tokensSite.length >= 5 && matches >= tokensSite.length - 1) return true;

        const allTokens = new Set([...tokensSite, ...tokensMal]);
        const ratio = matches / allTokens.size;

        if (tokensMal.length < 3) return ratio >= 1.0;
        
        const allMalTokensPresent = tokensMal.every(t => tokensSite.includes(t));
        if (allMalTokensPresent && tokensMal.length >= 3) return ratio >= 0.6;

        return ratio >= 0.75;
    }
}