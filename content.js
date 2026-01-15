/**
 * Content Script - MAL Highlighter v28.3 (Sequel Precision)
 * Correção: Lógica de comparação (isFuzzyMatch) alterada para Jaccard Index.
 * Impede que "Golden Kamuy" (Prequela) seja detetado como match para 
 * "Golden Kamuy: Saishuushou" (Sequela), forçando a procura correta na API.
 */

const CACHE_KEY = 'mal_v26_enhanced'; 
const CACHE_DURATION = 1000 * 60 * 15; 

// Blocklist de UI (Mantida da v28.2)
const UI_BLOCKLIST = [
    "selecione um", "player de video", "comentarios", "relacionados", 
    "episodios", "lancamentos", "parceiros", "dmca", "termos", 
    "login", "registrar", "assistir", "online", "download", 
    "animes online", "todos os direitos", "copyright", "proximo episodio",
    "episodio anterior", "lista de animes", "generos", "contato"
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

const normalize = (str) => {
    if (!str || str.length < 3) return "";
    
    let clean = String(str).toLowerCase()
        .replace(/[\[\]\(\)\-\_\.]/g, " "); 

    clean = clean.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    const ignoreRegex = /\b(tv|movie|legendado|leg|dublado|dubbed|dub|episodio|episode|ep|filme|[0-9]+ª|online|ver|assistir|season|temp|parte|part)\b/g;
    clean = clean.replace(ignoreRegex, " ");

    return clean.replace(/[^a-z0-9\s]/g, "")
                .replace(/\s+/g, " ").trim();
};

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
 * REFACTORED: Strict Token Comparison (Jaccard Index)
 * Corrige o problema onde "Golden Kamuy" dava match com "Golden Kamuy: Saishuushou".
 */
function isFuzzyMatch(siteTitle, malTitle) {
    // 1. Exact Match (Fastest)
    if (siteTitle === malTitle) return true;

    // 2. Substring Check (Strict)
    // Só aceita diferenças minúsculas (ex: 4 letras), para prevenir
    // que "Anime X" capture "Anime X: Sequel Y".
    if (malTitle.includes(siteTitle) || siteTitle.includes(malTitle)) {
        if (Math.abs(malTitle.length - siteTitle.length) <= 4) return true;
    }

    const tokensSite = siteTitle.split(' ').filter(t => t.length > 1);
    const tokensMal = malTitle.split(' ').filter(t => t.length > 1);
    
    if (tokensSite.length === 0 || tokensMal.length === 0) return false;

    // 3. Jaccard Index Calculation
    // Intersection (palavras comuns) / Union (total palavras únicas)
    // Ex: "A B" vs "A B C" -> Intersect: 2, Union: 3 -> 0.66 (Reprovado, precisa de 0.75)
    
    const allTokens = new Set([...tokensSite, ...tokensMal]); // Union
    let matches = 0;
    
    tokensSite.forEach(token => {
        if (tokensMal.includes(token)) matches++;
    });

    const ratio = matches / allTokens.size;

    // Se tiver poucas palavras, exige perfeição. Se tiver muitas, aceita 75%.
    return ratio >= (allTokens.size < 3 ? 1.0 : 0.75);
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
        
        if (response && response.success) {
            const anime = response.anime;
            const animeTitleNorm = normalize(anime.title);
            
            // Validation using the new stricter logic
            if (!isFuzzyMatch(cleanQuery, animeTitleNorm)) {
                console.warn(`[MAL Highlighter] Mismatch ignored: "${cleanQuery}" vs "${animeTitleNorm}"`);
                return; 
            }

            let finalStatus = null;
            for (let [key, val] of globalAnimeMap.entries()) {
                if (val.id === anime.mal_id) {
                    finalStatus = val.status;
                    break;
                }
            }
            showPanel(anime.title, { id: anime.mal_id, status: finalStatus });
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

        // 1. BLOCKLIST CHECK
        if (UI_BLOCKLIST.some(term => lowerText.includes(term))) return;

        const animeTitle = normalize(text);
        if (!animeTitle || animeTitle.length < 3) return;

        // 2. Local Cache Check
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

        // 3. Main Anime Panel Logic
        if (!foundMainAnime) {
            const tag = element.tagName;
            const isHead = ['H1','H2'].includes(tag);
            const urlPath = window.location.pathname.toLowerCase().replace(/[^a-z0-9]/g, "");
            const titleClean = animeTitle.replace(/\s/g, "");
            const isInUrl = urlPath.includes(titleClean);
            
            if ((isHead || isInUrl) && !element.closest('aside, footer, .sidebar, .widget, header, nav')) {
                
                // Extra check: If we found a match in LOCAL list, verify similarity again
                // to prevent "Golden Kamuy" local match overriding "Golden Kamuy Saishuushou" page title.
                if (match) {
                    // Se o match local for "Golden Kamuy" mas o título da página for 
                    // "Golden Kamuy Saishuushou", isFuzzyMatch agora deve retornar FALSE
                    // e impedir este bloco de executar como match local.
                    // (Já tratado pela função isFuzzyMatch atualizada acima)
                }

                foundMainAnime = true; 
                if (!panelVisible) {
                    if (match) showPanel(text, match);
                    else searchAndShowPanel(text);
                }
            }
        }
    });

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
    if (localStorage.getItem('mal_v25_clean')) localStorage.removeItem('mal_v25_clean'); 

    try {
        await getUserList();
        if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startObserver);
        else startObserver();
    } catch (e) { console.error("[MAL Highlighter] Init failed", e); }
})();