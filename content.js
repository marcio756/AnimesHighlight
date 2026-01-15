/**
 * Content Script - MAL Highlighter v31.0 (Cache Reset)
 * Correção:
 * 1. CACHE_KEY atualizada para 'mal_v31_full_list' para forçar o download 
 * da nova lista completa (com Dropped/OnHold) vinda do background atualizado.
 * 2. Mantém todas as lógicas de limpeza (Light Novel, Hífens, Acentos) da v30.1.
 */

// --- ATENÇÃO: MUDANÇA DE CHAVE DE CACHE ---
const CACHE_KEY = 'mal_v31_full_list'; 
const CACHE_DURATION = 1000 * 60 * 15; 

// Blocklist de UI
const UI_BLOCKLIST = [
    "selecione um", "player de video", "comentarios", "relacionados", 
    "episodios", "lancamentos", "parceiros", "dmca", "termos", 
    "login", "registrar", "assistir", "online", "download", 
    "animes online", "todos os direitos", "copyright", "proximo episodio",
    "episodio anterior", "lista de animes", "generos", "contato",
    "filmes", "animes", "donghuas", "calendario"
];

let globalAnimeMap = new Map();
let observer = null;
let debounceTimer = null;

const STATUS_MAP = {
    1: { class: 'mal-watching', label: 'WATCHING' },
    2: { class: 'mal-completed', label: 'COMPLETED' },
    3: { class: 'mal-hold', label: 'ON HOLD' },
    4: { class: 'mal-dropped', label: 'DROPPED' },
    6: { class: 'mal-plan', label: 'PLAN TO WATCH' }
};

/**
 * Advanced Normalization Strategy v5
 */
const normalize = (str) => {
    if (!str || str.length < 3) return "";
    
    let clean = String(str).toLowerCase();

    // 1. REMOVER ACENTOS
    clean = clean.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    // 2. Remover Episódios
    clean = clean.replace(/\b(episodio|episode|ep|e)\s*[0-9]+\b/g, " ");

    // 3. Normalizar Ordinais
    clean = clean.replace(/\b([0-9]+)(st|nd|rd|th)\b/g, "$1");

    // 4. Remover Hífens SEPARADORES
    clean = clean.replace(/\s+-\s+/g, " ");

    // 5. Limpar outros separadores
    clean = clean.replace(/[\[\]\(\)\_\.]/g, " "); 

    // 6. STOP WORDS
    const ignoreRegex = /\b(tv|movie|legendado|leg|dublado|dubbed|dub|filme|filmes|animes|anime|[0-9]+ª|online|ver|assistir|season|temp|parte|part|net|com|br|org|hd|fhd|4k|q1n|capitulo)\b/g;
    clean = clean.replace(ignoreRegex, " ");

    // 7. Limpeza Final
    clean = clean.replace(/[^a-z0-9\s\-]/g, "").replace(/\s+/g, " ").trim();
    if (clean.endsWith('-')) clean = clean.slice(0, -1);
    
    return clean.trim();
};

function getSlugFromUrl() {
    const path = window.location.pathname;
    const segments = path.split('/').filter(p => p.length > 0);
    
    if (segments.length === 0) return null;
    
    const lastSegment = segments[segments.length - 1].toLowerCase();
    
    if (UI_BLOCKLIST.includes(lastSegment) || /page\d+/.test(lastSegment)) return null;

    return lastSegment.replace(/-/g, ' ');
}

function getUsername() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['malUsername'], (result) => {
            resolve(result.malUsername || 'marcio756');
        });
    });
}

async function getUserList() {
    const USERNAME = await getUsername();
    const cached = localStorage.getItem(CACHE_KEY);
    let mapToReturn = new Map();

    if (cached) {
        try {
            const { timestamp, data, owner } = JSON.parse(cached);
            if ((Date.now() - timestamp < CACHE_DURATION) && owner === USERNAME) {
                mapToReturn = new Map(data); 
            }
        } catch (e) { localStorage.removeItem(CACHE_KEY); }
    }
    
    if (mapToReturn.size === 0) {
        mapToReturn = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: "FETCH_MAL_LIST", username: USERNAME }, (response) => {
                const newMap = new Map();
                if (response && response.success && Array.isArray(response.data)) {
                    response.data.forEach(item => {
                        if (!item) return;
                        const title = item.anime_title; 
                        if (title) newMap.set(normalize(title), {
                            status: item.status,
                            id: item.anime_id,
                            score: item.score,
                            rawTitle: title
                        });
                    });
                    localStorage.setItem(CACHE_KEY, JSON.stringify({
                        timestamp: Date.now(),
                        owner: USERNAME,
                        data: Array.from(newMap.entries())
                    }));
                }
                resolve(newMap);
            });
        });
    }
    globalAnimeMap = mapToReturn;
    return mapToReturn;
}

// --- VISUALS ---
function applyVisuals(element, statusId) {
    if (element.classList.contains('mal-item-highlight')) return;
    const styleInfo = STATUS_MAP[statusId];
    if (!styleInfo) return;

    element.classList.add('mal-item-highlight', styleInfo.class);
    element.setAttribute('data-mal-label', styleInfo.label);
    element.dataset.malStatus = statusId;
}

function findCardContainer(titleElement) {
    let current = titleElement.parentElement;
    let attempts = 0;
    
    while (current && attempts < 6) {
        if (current.dataset.malStatus) return current;

        const imgCount = current.querySelectorAll('img').length;
        const linkCount = current.querySelectorAll('a').length;

        if (imgCount > 2 || linkCount > 4) return null;

        const hasImg = current.querySelector('img') || 
                       current.querySelector('.cover, .poster, .thumb, .contentImg, .coverImg') ||
                       (window.getComputedStyle(current).backgroundImage !== 'none');

        const isStructuralTag = ['BODY', 'HTML', 'MAIN', 'SECTION', 'DIV#content', 'DIV.container'].includes(current.tagName + (current.id ? '#'+current.id : ''));
        const isCardTag = ['ARTICLE', 'LI'].includes(current.tagName);

        if ((hasImg || isCardTag) && !isStructuralTag) {
            if (current.offsetWidth < window.innerWidth * 0.95) return current;
        }
        current = current.parentElement;
        attempts++;
    }
    return null;
}

// --- PANEL LOGIC ---
let currentAnimeId = null; 
let isSearching = false; 

function createPanel() {
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
    document.getElementById('malOpenBtn').onclick = () => {
        if (currentAnimeId) window.open(`https://myanimelist.net/anime/${currentAnimeId}`, '_blank');
        else alert("Anime not found.");
    };
}

function showPanel(animeName, data) {
    createPanel();
    currentAnimeId = data.id;
    const panel = document.getElementById('malControlPanel');
    const titleEl = document.getElementById('malPanelTitle');
    const statusEl = document.getElementById('malStatusText');
    
    titleEl.innerText = animeName.substring(0, 30) + (animeName.length > 30 ? '...' : '');
    
    if (data.status && STATUS_MAP[data.status]) {
        statusEl.innerText = STATUS_MAP[data.status].label;
        statusEl.style.color = getStatusColor(data.status);
    } else {
        statusEl.innerText = "NOT IN LIST";
        statusEl.style.color = "#aaa";
    }
    panel.classList.add('visible');
}

function hidePanel() {
    const panel = document.getElementById('malControlPanel');
    if (panel) panel.classList.remove('visible');
}

function getStatusColor(status) {
    switch(status) {
        case 1: return '#2db039'; 
        case 2: return '#26448f'; 
        case 3: return '#f1c83e'; 
        case 4: return '#a12f31'; 
        default: return '#aaa';
    }
}

/**
 * REFACTORED: Enhanced Matching Logic (v30.1 + v31.0)
 * Adicionado suporte para "Subset Matching" em títulos longos.
 */
function isFuzzyMatch(siteTitle, malTitle) {
    if (siteTitle === malTitle) return true;

    if (malTitle.includes(siteTitle) || siteTitle.includes(malTitle)) {
        if (Math.abs(malTitle.length - siteTitle.length) <= 4) return true;
    }

    const cleanToken = t => t.replace(/-/g, '');
    
    const tokensSite = siteTitle.split(' ').filter(t => t.length > 1).map(cleanToken);
    const tokensMal = malTitle.split(' ').filter(t => t.length > 1).map(cleanToken);
    
    if (tokensSite.length === 0 || tokensMal.length === 0) return false;

    // --- NEW LOGIC: SUBSET CHECK (Long Titles) ---
    let matches = 0;
    tokensSite.forEach(token => {
        if (tokensMal.includes(token)) matches++;
    });

    if (tokensSite.length >= 5 && matches === tokensSite.length) {
        return true; 
    }
    // ----------------------------------------------

    const allTokens = new Set([...tokensSite, ...tokensMal]);
    const ratio = matches / allTokens.size;

    if (tokensMal.length < 3) {
        return ratio >= 1.0;
    }

    const allMalTokensPresent = tokensMal.every(t => tokensSite.includes(t));
    if (allMalTokensPresent && tokensMal.length >= 3) {
         return ratio >= 0.6; 
    }

    return ratio >= 0.75;
}

function searchAndShowPanel(rawTitle) {
    if (isSearching) return;
    if (document.getElementById('malControlPanel')?.classList.contains('visible')) return;
    
    const cleanQuery = normalize(rawTitle);
    if (cleanQuery.length < 4) return;
    
    isSearching = true;
    document.body.style.cursor = 'wait';

    chrome.runtime.sendMessage({ action: "SEARCH_ANIME", title: cleanQuery }, (response) => {
        isSearching = false;
        document.body.style.cursor = 'default';
        
        if (response && response.success && response.results) {
            
            // Smart Selector: Percorre os 5 resultados
            let bestMatch = null;

            for (const anime of response.results) {
                const animeTitleNorm = normalize(anime.title);
                
                if (isFuzzyMatch(cleanQuery, animeTitleNorm)) {
                    bestMatch = anime;
                    break; 
                } else {
                    console.log(`[MAL Highlighter] Rejected candidate: "${animeTitleNorm}" for query "${cleanQuery}"`);
                }
            }

            if (!bestMatch) {
                console.warn(`[MAL Highlighter] SafeGuard: All 5 API results rejected for query "${cleanQuery}".`);
                return;
            }

            let finalStatus = null;
            for (let [key, val] of globalAnimeMap.entries()) {
                if (val.id === bestMatch.mal_id) {
                    finalStatus = val.status;
                    break;
                }
            }
            showPanel(bestMatch.title, { id: bestMatch.mal_id, status: finalStatus });
        }
    });
}

// --- MAIN LOGIC ---
function processPage() {
    const selector = 'a, span, h1, h2, h3, h4, h5, h6, p, div.title, div.serie, .title_anime, strong, b, article, li';
    const candidates = document.querySelectorAll(selector);
    
    let panelVisible = document.getElementById('malControlPanel')?.classList.contains('visible');
    let foundMainAnime = panelVisible; 

    candidates.forEach(element => {
        if (element.closest('[data-mal-status]')) return;
        if (element.offsetParent === null) return; 
        
        const text = element.innerText || "";
        if (text.length < 3) return;
        
        const lowerText = text.toLowerCase();
        if (UI_BLOCKLIST.some(term => lowerText.includes(term))) return;

        const animeTitle = normalize(text);
        if (!animeTitle || animeTitle.length < 3) return;

        let match = null;
        if (globalAnimeMap.has(animeTitle)) {
            match = globalAnimeMap.get(animeTitle);
        } else {
             for (let [malTitle, data] of globalAnimeMap) {
                if (isFuzzyMatch(animeTitle, malTitle)) {
                    match = data;
                    break;
                }
            }
        }

        if (match) {
            const card = findCardContainer(element);
            if (card) applyVisuals(card, match.status);
        }

        if (!foundMainAnime) {
            const tag = element.tagName;
            const isHead = ['H1','H2'].includes(tag);
            const urlPath = window.location.pathname.toLowerCase().replace(/[^a-z0-9]/g, "");
            const titleClean = animeTitle.replace(/\s/g, "");
            const isInUrl = urlPath.includes(titleClean.replace(/-/g, ""));
            
            if ((isHead || isInUrl) && !element.closest('aside, footer, .sidebar, .widget, header, nav')) {
                if (match && !panelVisible) {
                    showPanel(text, match);
                    foundMainAnime = true;
                } else if (!match && !panelVisible) {
                    searchAndShowPanel(text);
                    foundMainAnime = true;
                }
            }
        }
    });

    if (!foundMainAnime) {
        const urlTitle = getSlugFromUrl();
        if (urlTitle && urlTitle.length > 3) {
            const normUrlTitle = normalize(urlTitle);
            if (!UI_BLOCKLIST.some(term => normUrlTitle.includes(term))) {
                 let match = null;
                 if (globalAnimeMap.has(normUrlTitle)) {
                     match = globalAnimeMap.get(normUrlTitle);
                 } else {
                     for (let [malTitle, data] of globalAnimeMap) {
                         if (isFuzzyMatch(normUrlTitle, malTitle)) {
                             match = data;
                             break;
                         }
                     }
                 }
                 if (match) {
                     if (!panelVisible) showPanel(urlTitle, match);
                     foundMainAnime = true;
                 } else if (!panelVisible) {
                     searchAndShowPanel(urlTitle);
                     foundMainAnime = true;
                 }
            }
        }
    }

    if (!foundMainAnime) {
        setTimeout(() => { if (!foundMainAnime) hidePanel(); }, 500);
    }
}

// --- BOOT ---
function startObserver() {
    if (!document.body) { setTimeout(startObserver, 100); return; }
    
    processPage();

    if (observer) observer.disconnect();
    observer = new MutationObserver((mutations) => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => { processPage(); }, 300);
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
}

(async () => {
    if (window.location.hostname.includes("myanimelist.net")) return;
    // Removemos chaves antigas se existirem
    if (localStorage.getItem('mal_v25_clean')) localStorage.removeItem('mal_v25_clean'); 

    try {
        await getUserList();
        if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startObserver);
        else startObserver();
    } catch (e) { console.error("[MAL Highlighter] Init failed", e); }
})();