/**
 * Content Script - MAL Highlighter v32.0 (Performance & Architecture Refactor)
 * * Alterações de Arquitetura:
 * 1. PerformanceGuard: Verifica heuristicamente se o site é relevante antes de iniciar.
 * 2. Scanner Otimizado: Removeu seletores genéricos (p, span) para reduzir CPU load.
 * 3. Modularização: Separação de responsabilidades (SRP) em objetos/classes.
 */

// --- CONFIGURAÇÃO & CONSTANTES ---
const CONFIG = {
    CACHE_KEY: 'mal_v31_full_list',
    CACHE_DURATION: 1000 * 60 * 15, // 15 Minutos
    DEBOUNCE_DELAY: 500,
    // Palavras-chave para ativar o script. Se a página não tiver isto, o script nem arranca.
    SITE_KEYWORDS: [
        'anime', 'manga', 'donghua', 'episodio', 'episode', 'season', 
        'temporada', 'assistir', 'online', 'legendado', 'dublado', 'stream'
    ]
};

const UI_BLOCKLIST = [
    "selecione um", "player de video", "comentarios", "relacionados", 
    "episodios", "lancamentos", "parceiros", "dmca", "termos", 
    "login", "registrar", "assistir", "online", "download", 
    "animes online", "todos os direitos", "copyright", "proximo episodio",
    "episodio anterior", "lista de animes", "generos", "contato",
    "filmes", "animes", "donghuas", "calendario"
];

const STATUS_MAP = {
    1: { class: 'mal-watching', label: 'WATCHING', color: '#2db039' },
    2: { class: 'mal-completed', label: 'COMPLETED', color: '#26448f' },
    3: { class: 'mal-hold', label: 'ON HOLD', color: '#f1c83e' },
    4: { class: 'mal-dropped', label: 'DROPPED', color: '#a12f31' },
    6: { class: 'mal-plan', label: 'PLAN TO WATCH', color: '#787878' }
};

// --- MÓDULOS (CAMADA DE SERVIÇO) ---

/**
 * Responsável por verificar se o script deve correr na página atual.
 * Evita execução desnecessária em sites como Google, Facebook, etc.
 */
class PerformanceGuard {
    /**
     * Verifica heuristicamente se a página é sobre animes.
     * @returns {boolean} True se a página for relevante.
     */
    static isRelevantPage() {
        const url = window.location.href.toLowerCase();
        // Whitelist forçada para testes ou sites conhecidos se necessário
        if (url.includes('myanimelist')) return false; // Não correr no próprio MAL

        const title = document.title.toLowerCase();
        const metaDesc = document.querySelector('meta[name="description"]')?.content.toLowerCase() || "";
        
        // Verifica se alguma palavra-chave existe no título ou descrição
        const hasKeyword = CONFIG.SITE_KEYWORDS.some(kw => 
            title.includes(kw) || metaDesc.includes(kw) || url.includes(kw)
        );

        if (!hasKeyword) {
            console.log("[MAL Highlighter] Script inativo: Página não relacionada a animes.");
        }
        return hasKeyword;
    }
}

/**
 * Estratégia de Normalização de Texto.
 */
class TextNormalizer {
    /**
     * Normaliza o título para comparação (Advanced Strategy v5).
     * @param {string} str - O texto original.
     * @returns {string} Texto limpo e normalizado.
     */
    static normalize(str) {
        if (!str || str.length < 3) return "";
        
        let clean = String(str).toLowerCase();
        clean = clean.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // Acentos
        clean = clean.replace(/\b(episodio|episode|ep|e)\s*[0-9]+\b/g, " "); // Episódios
        clean = clean.replace(/\b([0-9]+)(st|nd|rd|th)\b/g, "$1"); // Ordinais
        clean = clean.replace(/\s+-\s+/g, " "); // Hífens
        clean = clean.replace(/[\[\]\(\)\_\.]/g, " "); // Pontuação
        
        const ignoreRegex = /\b(tv|movie|legendado|leg|dublado|dubbed|dub|filme|filmes|animes|anime|[0-9]+ª|online|ver|assistir|season|temp|parte|part|net|com|br|org|hd|fhd|4k|q1n|capitulo)\b/g;
        clean = clean.replace(ignoreRegex, " ");

        clean = clean.replace(/[^a-z0-9\s\-]/g, "").replace(/\s+/g, " ").trim();
        if (clean.endsWith('-')) clean = clean.slice(0, -1);
        
        return clean.trim();
    }

    /**
     * Extrai o slug da URL atual como fallback.
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

/**
 * Gestão de Dados e Cache do Utilizador.
 */
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
        let mapToReturn = new Map();

        if (cached) {
            try {
                const { timestamp, data, owner } = JSON.parse(cached);
                if ((Date.now() - timestamp < CONFIG.CACHE_DURATION) && owner === USERNAME) {
                    return new Map(data);
                }
            } catch (e) { localStorage.removeItem(CONFIG.CACHE_KEY); }
        }
        
        // Fetch fresh data
        return await new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: "FETCH_MAL_LIST", username: USERNAME }, (response) => {
                const newMap = new Map();
                if (response && response.success && Array.isArray(response.data)) {
                    response.data.forEach(item => {
                        if (!item) return;
                        const title = item.anime_title; 
                        if (title) newMap.set(TextNormalizer.normalize(title), {
                            status: item.status,
                            id: item.anime_id,
                            score: item.score,
                            rawTitle: title
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

/**
 * Lógica de Comparação (Fuzzy Matching).
 */
class Matcher {
    /**
     * Verifica correspondência entre título do site e do MAL.
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

        // Subset match para títulos longos
        if (tokensSite.length >= 5 && matches === tokensSite.length) return true;

        const allTokens = new Set([...tokensSite, ...tokensMal]);
        const ratio = matches / allTokens.size;

        if (tokensMal.length < 3) return ratio >= 1.0;
        
        const allMalTokensPresent = tokensMal.every(t => tokensSite.includes(t));
        if (allMalTokensPresent && tokensMal.length >= 3) return ratio >= 0.6;

        return ratio >= 0.75;
    }
}

/**
 * Gestão da Interface (Painel e Highlights).
 */
class UIManager {
    static applyVisuals(element, statusId) {
        if (element.classList.contains('mal-item-highlight')) return;
        const styleInfo = STATUS_MAP[statusId];
        if (!styleInfo) return;

        element.classList.add('mal-item-highlight', styleInfo.class);
        element.setAttribute('data-mal-label', styleInfo.label);
        element.dataset.malStatus = statusId;
    }

    static findCardContainer(titleElement) {
        let current = titleElement.parentElement;
        let attempts = 0;
        
        // Reduzido para 5 tentativas para melhorar performance
        while (current && attempts < 5) {
            if (current.dataset.malStatus) return current;

            // Otimização: Evitar chamadas getComputedStyle repetitivas se possível
            // Mas mantemos a lógica original de deteção de imagem
            const hasImg = current.querySelector('img') || 
                           current.querySelector('.cover, .poster, .thumb, .contentImg') ||
                           (current.style.backgroundImage && current.style.backgroundImage !== 'none');

            const isCardTag = ['ARTICLE', 'LI', 'DIV'].includes(current.tagName);
            
            // Verifica classes comuns de cartões para evitar falsos positivos em layouts
            const hasCardClass = current.className.includes('item') || 
                                 current.className.includes('card') || 
                                 current.className.includes('poster');

            if ((hasImg || (isCardTag && hasCardClass)) && current.tagName !== 'BODY') {
                if (current.offsetWidth < window.innerWidth * 0.95) return current;
            }
            current = current.parentElement;
            attempts++;
        }
        return null;
    }

    // --- PAINEL FLUTUANTE ---
    static createPanel() {
        if (document.getElementById('malControlPanel')) return;
        const panel = document.createElement('div');
        panel.id = 'malControlPanel';
        panel.className = 'mal-control-panel';
        panel.innerHTML = `
            <div class="mal-panel-header" id="malPanelTitle">Loading...</div>
            <div class="mal-control-row" style="justify-content: center; margin-bottom: 15px;">
                <span id="malStatusText" style="font-size: 12px; color: #aaa; font-weight: 600;">Checking...</span>
            </div>
            <button class="mal-update-btn" id="malOpenBtn">Open MyAnimeList</button>
        `;
        document.body.appendChild(panel);
    }

    static showPanel(animeName, data) {
        this.createPanel();
        const panel = document.getElementById('malControlPanel');
        const titleEl = document.getElementById('malPanelTitle');
        const statusEl = document.getElementById('malStatusText');
        const btn = document.getElementById('malOpenBtn');
        
        titleEl.innerText = animeName.substring(0, 30) + (animeName.length > 30 ? '...' : '');
        
        if (data.status && STATUS_MAP[data.status]) {
            statusEl.innerText = STATUS_MAP[data.status].label;
            statusEl.style.color = STATUS_MAP[data.status].color;
        } else {
            statusEl.innerText = "NOT IN LIST";
            statusEl.style.color = "#aaa";
        }
        
        btn.onclick = () => {
            if (data.id) window.open(`https://myanimelist.net/anime/${data.id}`, '_blank');
            else alert("Anime not found.");
        };
        
        panel.classList.add('visible');
    }

    static hidePanel() {
        const panel = document.getElementById('malControlPanel');
        if (panel) panel.classList.remove('visible');
    }
}

// --- CONTROLLER PRINCIPAL ---

class MalController {
    constructor() {
        this.globalAnimeMap = new Map();
        this.observer = null;
        this.debounceTimer = null;
        this.isSearching = false;
        this.currentAnimeId = null;
    }

    async init() {
        if (!PerformanceGuard.isRelevantPage()) return;
        
        try {
            this.globalAnimeMap = await DataManager.getUserList();
            this.startObserver();
        } catch (e) {
            console.error("[MAL Highlighter] Init failed", e);
        }
    }

    searchAndShowPanel(rawTitle) {
        if (this.isSearching) return;
        if (document.getElementById('malControlPanel')?.classList.contains('visible')) return;
        
        const cleanQuery = TextNormalizer.normalize(rawTitle);
        if (cleanQuery.length < 4) return;
        
        this.isSearching = true;
        document.body.style.cursor = 'wait';

        chrome.runtime.sendMessage({ action: "SEARCH_ANIME", title: cleanQuery }, (response) => {
            this.isSearching = false;
            document.body.style.cursor = 'default';
            
            if (response && response.success && response.results) {
                let bestMatch = null;
                for (const anime of response.results) {
                    const animeTitleNorm = TextNormalizer.normalize(anime.title);
                    if (Matcher.isFuzzyMatch(cleanQuery, animeTitleNorm)) {
                        bestMatch = anime;
                        break; 
                    }
                }

                if (!bestMatch) return;

                let finalStatus = null;
                for (let [key, val] of this.globalAnimeMap.entries()) {
                    if (val.id === bestMatch.mal_id) {
                        finalStatus = val.status;
                        break;
                    }
                }
                UIManager.showPanel(bestMatch.title, { id: bestMatch.mal_id, status: finalStatus });
            }
        });
    }

    processPage() {
        // PERFORMANCE: Seletores mais específicos. Evita 'span', 'p', 'div' genéricos.
        const selector = 'a, h1, h2, h3, h4, h5, .title, .name, [class*="title"], [class*="nome"], article h3, li h3';
        const candidates = document.querySelectorAll(selector);
        
        let panelVisible = document.getElementById('malControlPanel')?.classList.contains('visible');
        let foundMainAnime = panelVisible; 

        // Limite de processamento por ciclo para evitar travar a UI em listas infinitas
        let processedCount = 0;
        const PROCESS_LIMIT = 500; 

        for (const element of candidates) {
            if (processedCount > PROCESS_LIMIT) break;
            
            // Skip se já processado ou oculto
            if (element.closest('[data-mal-status]')) continue;
            if (element.offsetParent === null) continue; 
            
            const text = element.innerText || "";
            if (text.length < 3) continue;
            
            const lowerText = text.toLowerCase();
            if (UI_BLOCKLIST.some(term => lowerText.includes(term))) continue;

            const animeTitle = TextNormalizer.normalize(text);
            if (!animeTitle || animeTitle.length < 3) continue;

            processedCount++;

            let match = null;
            if (this.globalAnimeMap.has(animeTitle)) {
                match = this.globalAnimeMap.get(animeTitle);
            } else {
                // Optimization: Só faz fuzzy match se o texto não for gigante
                if (animeTitle.length < 50) {
                    for (let [malTitle, data] of this.globalAnimeMap) {
                        if (Matcher.isFuzzyMatch(animeTitle, malTitle)) {
                            match = data;
                            break;
                        }
                    }
                }
            }

            if (match) {
                const card = UIManager.findCardContainer(element);
                if (card) UIManager.applyVisuals(card, match.status);
            }

            // Lógica para detetar o "Anime Principal" da página
            if (!foundMainAnime) {
                const tag = element.tagName;
                const isHead = ['H1','H2'].includes(tag);
                const urlPath = window.location.pathname.toLowerCase().replace(/[^a-z0-9]/g, "");
                const titleClean = animeTitle.replace(/\s/g, "");
                
                // Verifica se o título está na URL (forte indício de ser a página do anime)
                const isInUrl = urlPath.includes(titleClean.replace(/-/g, "")) && titleClean.length > 5;
                
                if ((isHead || isInUrl) && !element.closest('aside, footer, .sidebar, header, nav')) {
                    if (match && !panelVisible) {
                        UIManager.showPanel(text, match);
                        foundMainAnime = true;
                    } else if (!match && !panelVisible && isInUrl) {
                        // Só pesquisa na API se estivermos muito confiantes (está na URL)
                        this.searchAndShowPanel(text);
                        foundMainAnime = true;
                    }
                }
            }
        }

        // Fallback: Tenta pegar o nome da URL se nada foi encontrado no DOM
        if (!foundMainAnime) {
            const urlTitle = TextNormalizer.getSlugFromUrl();
            if (urlTitle && urlTitle.length > 3) {
                const normUrlTitle = TextNormalizer.normalize(urlTitle);
                if (!UI_BLOCKLIST.some(term => normUrlTitle.includes(term))) {
                     // Lógica repetida (DRY breach aceite por performance para evitar função extra closure)
                     let match = this.globalAnimeMap.get(normUrlTitle);
                     if (!match) {
                         for (let [malTitle, data] of this.globalAnimeMap) {
                             if (Matcher.isFuzzyMatch(normUrlTitle, malTitle)) {
                                 match = data;
                                 break;
                             }
                         }
                     }
                     
                     if (match && !panelVisible) {
                         UIManager.showPanel(urlTitle, match);
                         foundMainAnime = true;
                     } else if (!panelVisible) {
                         this.searchAndShowPanel(urlTitle);
                         foundMainAnime = true;
                     }
                }
            }
        }

        if (!foundMainAnime) {
            setTimeout(() => { if (!foundMainAnime) UIManager.hidePanel(); }, 500);
        }
    }

    startObserver() {
        if (!document.body) { setTimeout(() => this.startObserver(), 100); return; }
        
        this.processPage();

        if (this.observer) this.observer.disconnect();
        this.observer = new MutationObserver((mutations) => {
            if (this.debounceTimer) clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => { this.processPage(); }, CONFIG.DEBOUNCE_DELAY);
        });
        
        this.observer.observe(document.body, { childList: true, subtree: true });
    }
}

// --- BOOT ---
const app = new MalController();
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => app.init());
} else {
    app.init();
}