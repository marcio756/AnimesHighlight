// src/content/utils.js

export const CONFIG = {
    CACHE_KEY: 'mal_v36_full_list',
    CACHE_DURATION: 1000 * 60 * 15, 
    DEBOUNCE_DELAY: 500, 
    MIN_DEBOUNCE_DELAY: 100,
    MAX_DEBOUNCE_DELAY: 1200,
    SAFE_EXECUTION_BUDGET: 20,
    STRESS_MULTIPLIER: 5.0,
    SITE_KEYWORDS: [
        'anime', 'manga', 'donghua', 'episodio', 'episode', 'season', 
        'temporada', 'assistir', 'online', 'legendado', 'dublado', 'stream',
        'ler', 'capitulo', 'chapter', 'manhwa', 'comic', 'scan', 'webtoon'
    ]
};

export const UI_BLOCKLIST = [
    "selecione um", "player de video", "comentarios", "relacionados", 
    "episodios", "episodio", "episode", "capitulo", "chapter", 
    "lancamentos", "parceiros", "dmca", "termos", 
    "login", "registrar", "assistir", "online", "download", 
    "todos os direitos", "copyright", "proximo episodio",
    "episodio anterior", "lista de", "generos", "contato",
    "filmes", "animes", "donghuas", "calendario", "mangas"
];

export const STATUS_MAP = {
    1: { class: 'mal-watching', labelKey: 'statusWatching', color: '#2db039' }, 
    2: { class: 'mal-completed', labelKey: 'statusCompleted', color: '#26448f' },
    3: { class: 'mal-hold', labelKey: 'statusOnHold', color: '#f1c83e' },
    4: { class: 'mal-dropped', labelKey: 'statusDropped', color: '#a12f31' },
    6: { class: 'mal-plan', labelKey: 'statusPlanned', color: '#787878' }
};

export class SWLogger {
    static log(message, data = null) {
        try {
            chrome.runtime.sendMessage({ 
                action: "SW_LOG", 
                message: `[MAL Highlighter Debug] ${message}`, 
                data: data 
            });
        } catch(e) {}
    }
}

export class SeasonExtractor {
    static extractSeasonNumber(text) {
        if (!text) return null;
        let clean = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        
        // Match explícito: S4, Season 4, T4, Temporada 4, Part 4, Cour 4
        let match = clean.match(/\b(s|season|temporada|temp|t|part|parte|cour)\s*0*(\d+)\b/i);
        if (match && match[2]) return parseInt(match[2], 10);
        
        // Match ordinais: 4th Season, 4ª Temporada
        match = clean.match(/\b0*(\d+)(st|nd|rd|th|ª|º)\s*(season|temporada|temp|t)\b/i);
        if (match && match[1]) return parseInt(match[1], 10);

        // Match Romanos
        const romanMatch = clean.match(/\b(ii|iii|iv|v|vi|vii|viii|ix|x)\b(?:\s*)$/i);
        if (romanMatch && romanMatch[1]) {
            const r = romanMatch[1].toLowerCase();
            const romanMap = { 'ii': 2, 'iii': 3, 'iv': 4, 'v': 5, 'vi': 6, 'vii': 7, 'viii': 8, 'ix': 9, 'x': 10 };
            return romanMap[r];
        }

        // Match número arábico solto no final (ex: Shingeki no Kyojin 4)
        const endNumMatch = clean.match(/\b0*(\d+)\b(?:\s*)$/);
        if (endNumMatch && endNumMatch[1]) {
            const num = parseInt(endNumMatch[1], 10);
            if (num > 1 && num <= 20) return num; // Evita confundir anos ou episódios soltos muito altos
        }
        
        return 1; // Assumir temporada 1 se nada for encontrado
    }

    static getBaseTitle(text) {
        if (!text) return "";
        let clean = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        
        // Remove os indicadores de temporada para ficar apenas com a base da franquia
        clean = clean.replace(/\b(s|season|temporada|temp|t|part|parte|cour)\s*0*(\d+)\b/ig, "");
        clean = clean.replace(/\b0*(\d+)(st|nd|rd|th|ª|º)\s*(season|temporada|temp|t)\b/ig, "");
        clean = clean.replace(/\b(ii|iii|iv|v|vi|vii|viii|ix|x)\b(?:\s*)$/ig, "");
        clean = clean.replace(/\b0*(\d+)\b(?:\s*)$/g, ""); // trailing numbers
        
        return clean.trim();
    }
}

export class ProgressExtractor {
    static extract(text, mediaType) {
        if (!text) return null;
        const clean = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        
        const animeRegex = /\b(ep|episodio|episode)\s*[-_:]?\s*0*(\d+)\b/i;
        const mangaRegex = /\b(cap|capitulo|chapter|ch)\s*[-_:]?\s*0*(\d+)\b/i;
        
        const regex = mediaType === 'manga' ? mangaRegex : animeRegex;
        const match = clean.match(regex);
        
        if (match && match[2]) return parseInt(match[2], 10);

        const shortAnimeRegex = /\be0*(\d+)\b/i;
        const shortMangaRegex = /\bc0*(\d+)\b/i;
        const shortRegex = mediaType === 'manga' ? shortMangaRegex : shortAnimeRegex;
        const shortMatch = clean.match(shortRegex);

        if (shortMatch && shortMatch[1]) return parseInt(shortMatch[1], 10);
        
        const endNumMatch = clean.match(/(?:-|\/)\s*0*(\d+)\/?$/);
        if (endNumMatch && endNumMatch[1]) return parseInt(endNumMatch[1], 10);
        
        return null;
    }
}

export class DynamicDebouncer {
    constructor(callback) {
        this.callback = callback;
        this.timer = null;
        this.currentDelay = CONFIG.MIN_DEBOUNCE_DELAY;
    }

    trigger(...args) {
        if (this.timer) clearTimeout(this.timer);
        
        this.timer = setTimeout(() => {
            const start = performance.now();
            this.callback(...args);
            const end = performance.now();
            const duration = end - start;
            
            if (duration > CONFIG.SAFE_EXECUTION_BUDGET) {
                const excess = duration - CONFIG.SAFE_EXECUTION_BUDGET;
                this.currentDelay = Math.min(CONFIG.MAX_DEBOUNCE_DELAY, this.currentDelay + (excess * CONFIG.STRESS_MULTIPLIER));
            } else {
                this.currentDelay = Math.max(CONFIG.MIN_DEBOUNCE_DELAY, this.currentDelay * 0.9);
            }
        }, this.currentDelay);
    }
}

export class PerformanceGuard {
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

export class ContextAnalyzer {
    static guessContentType() {
        const url = window.location.href.toLowerCase();
        const urlMangaKw = ['manga', 'manhwa', 'manhua', 'scan', 'webtoon', 'ler', 'capitulo'];
        const urlAnimeKw = ['anime', 'episode', 'episodio', 'ep', 'watch', 'assistir', 'season', 'ova'];
        const urlTokens = url.replace(/[^a-z0-9]/g, ' ').split(' ');
        
        for (let kw of urlMangaKw) if (urlTokens.includes(kw) || url.includes(`/${kw}/`)) return 'manga';
        for (let kw of urlAnimeKw) if (urlTokens.includes(kw) || url.includes(`/${kw}/`)) return 'anime';

        const path = window.location.pathname;
        const isHomePage = path === '/' || path.length < 3;
        const bodyText = document.body.innerText.toLowerCase();
        
        const chapterCount = (bodyText.match(/\b(chapter|capitulo|capítulo|scan|read|ler|manhwa|manhua)\b/g) || []).length;
        const episodeCount = (bodyText.match(/\b(episode|episodio|episódio|ep|watch|assistir|temporada|stream)\b/g) || []).length;

        if (isHomePage) {
            if (chapterCount > episodeCount) return 'manga';
            if (episodeCount > chapterCount) return 'anime';
        }

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

    static isListingPage() {
        const pathName = window.location.pathname.toLowerCase();
        const segments = pathName.split('/').filter(p => p.length > 0);
        if (segments.length === 0) return true; 
        
        const genericDirectories = ['episodios', 'episodio', 'lancamentos', 'animes', 'anime', 'mangas', 'manga', 'filmes', 'ovas', 'calendario', 'lista', 'search', 'explorar', 'genre', 'categoria'];

        if (segments.length === 1 && genericDirectories.includes(segments[0])) return true;
        if (segments.length === 2 && genericDirectories.includes(segments[0]) && ['lista', 'popular', 'news', 'recentes', 'search'].includes(segments[1])) return true;

        return false;
    }
}

export class TextNormalizer {
    static normalize(str) {
        if (!str || str.length < 3) return "";
        
        let clean = String(str).toLowerCase();
        clean = clean.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); 
        
        // Remove numerações de episódios antes de processar temporadas
        clean = clean.replace(/\b(episodio|episode|ep|capitulo|cap|chapter|ch)\s*[0-9]+\b/g, " "); 
        
        // Converte romanos apenas se estiverem isolados no texto original (para evitar apagar letras do meio de palavras)
        const romanMap = {
            '\\bii\\b': '2', '\\biii\\b': '3', '\\biv\\b': '4', '\\bv\\b': '5',
            '\\bvi\\b': '6', '\\bvii\\b': '7', '\\bviii\\b': '8'
        };
        for(let r in romanMap) {
            clean = clean.replace(new RegExp(r, 'g'), romanMap[r]);
        }

        // Padronização rigorosa pedida: remover ruído específico e termos de qualidade/legenda
        const ignoreRegex = /\b(the final|final season|season final|ultima temporada|part|parte|cour|arc|arco|chapter|fhd|hd|dublado|legendado|online|tv|movie|leg|dubbed|dub|filme|filmes|animes|anime|manga|mangas|manhwa|ver|assistir|ler|net|com|br|org|q1n)\b/g;
        clean = clean.replace(ignoreRegex, " ");

        // Uniformiza indicadores de temporada
        clean = clean.replace(/\b([0-9]+)(st|nd|rd|th|ª|º)?\s*(season|temporada|temp|t)\b/g, " $1 ");
        clean = clean.replace(/\b(s|season|temporada|temp|t)\s*0*([0-9]+)\b/g, " $2 ");
        
        // Transforma TODOS os hífens e pontuação em espaços
        clean = clean.replace(/[\-\[\]\(\)\_\.]/g, " "); 
        
        clean = clean.replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
        return clean.trim();
    }

    static getSlugFromUrl() {
        const path = window.location.pathname;
        const segments = path.split('/').filter(p => p.length > 0);
        if (segments.length === 0) return null;
        
        const generics = ['anime', 'animes', 'manga', 'mangas', 'watch', 'read', 'ler', 'assistir', 'serie', 'series', 'tv', 'movie', 'filme', 'ova', 'category', 'genre'];

        for (let i = segments.length - 1; i >= 0; i--) {
            const seg = segments[i].toLowerCase();
            if (generics.includes(seg)) continue;
            if (/^\d+$/.test(seg)) continue; 
            if (/^(capitulo|capítulo|cap|chapter|ch|episodio|episódio|ep|episode)[\s\-]?\d+/i.test(seg)) continue;
            if (/^page\d+/.test(seg)) continue;

            return seg.replace(/[\-_]/g, ' ').trim();
        }
        return null;
    }
}

export class Matcher {
    static isFuzzyMatch(siteTitle, malTitle) {
        if (siteTitle === malTitle) return true;

        const baseSite = siteTitle.replace(/\d+/g, '').replace(/\s+/g, ' ').trim();
        const baseMal = malTitle.replace(/\d+/g, '').replace(/\s+/g, ' ').trim();

        let isTextMatch = false;
        let isPrefixMatch = false;

        if (malTitle.includes(siteTitle) || siteTitle.includes(malTitle)) {
            if (Math.abs(malTitle.length - siteTitle.length) <= 4) isTextMatch = true;
            if (siteTitle.length >= 12 && malTitle.startsWith(siteTitle)) {
                isTextMatch = true;
                isPrefixMatch = true;
            }
        }

        if (!isTextMatch) {
            const tokensSite = baseSite.split(' ').filter(t => t.length > 1);
            const tokensMal = baseMal.split(' ').filter(t => t.length > 1);
            
            if (tokensSite.length > 0 && tokensMal.length > 0) {
                let matches = 0;
                tokensSite.forEach((token, index) => {
                    if (tokensMal.includes(token)) {
                        matches++;
                    } else if (index === tokensSite.length - 1 && token.length >= 3) {
                        const isTruncated = tokensMal.some(malToken => malToken.startsWith(token));
                        if (isTruncated) matches++;
                    }
                });

                if (tokensSite.length >= 5 && matches >= tokensSite.length - 1) {
                    isTextMatch = true;
                    if (malTitle.length > siteTitle.length) isPrefixMatch = true;
                } else {
                    const allTokens = new Set([...tokensSite, ...tokensMal]);
                    const ratio = matches / (allTokens.size === 0 ? 1 : allTokens.size);

                    if (tokensMal.length < 3) isTextMatch = (ratio >= 1.0);
                    else {
                        const allMalTokensPresent = tokensMal.every(t => tokensSite.includes(t));
                        if (allMalTokensPresent && tokensMal.length >= 3) isTextMatch = (ratio >= 0.6);
                        else isTextMatch = (ratio >= 0.75);
                    }
                }
            }
        }

        if (!isTextMatch) return false;

        const extractNumbers = (t) => {
            const nums = (t.match(/\d+/g) || []);
            return [...new Set(nums)];
        };
        
        const numsSite = extractNumbers(siteTitle);
        const numsMal = extractNumbers(malTitle);

        if (numsSite.length > 0 || numsMal.length > 0) {
            const siteUniques = numsSite.filter(n => !numsMal.includes(n));
            const malUniques = numsMal.filter(n => !numsSite.includes(n));
            
            const isSeasonIndicator = (n) => {
                const num = parseInt(n, 10);
                return num >= 2 && num <= 99; 
            };
            
            // Correção de Conflito de Temporadas em Prefixo
            // Se o siteTitle é um prefixo truncado do MAL (ex: omite arcos/subtítulos como 2-nensei-hen),
            // então os números extra (malUniques) não representam uma quebra de validação lógica de temporada.
            if (siteUniques.some(isSeasonIndicator) || (!isPrefixMatch && malUniques.some(isSeasonIndicator))) {
                return false; 
            }
        }

        return true;
    }
}