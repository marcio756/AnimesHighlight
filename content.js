/**
 * Content Script - MAL Highlighter v23.0
 * Correção: Mantém palavras como "Final", "Season", "Part" para distinguir temporadas.
 * Feature: Logs detalhados na consola para debug do utilizador.
 */

const CACHE_KEY = 'mal_v23_precision';
const CACHE_DURATION = 1000 * 60 * 15; 

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

// --- LOGGING ---
function logDebug(title, msg, data = '') {
    console.log(
        `%c[MAL] ${title}%c ${msg}`, 
        'color: #2db039; font-weight: bold;', 
        'color: #aaa;', 
        data
    );
}

// --- NORMALIZAÇÃO (CORRIGIDA) ---
const normalize = (str) => {
    if (!str || str.length < 3) return "";
    
    // LISTA NEGRA ATUALIZADA:
    // Removi: 'season', 'final', 'part', 'cour' (Eles são importantes!)
    // Mantive: lixo de sites de streaming
    const ignoreRegex = /\(tv\)|\(movie\)|legendado|dublado|dubbed|dub|episodio|episode|filme|[0-9]+ª|online|ver|assistir/g;
    
    let cleaned = String(str).toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove acentos
        .replace(ignoreRegex, " ")                         // Remove palavras proibidas
        .replace(/[^a-z0-9\s]/g, " ")                      // Remove símbolos estranhos
        .replace(/\s+[0-9]+$/, "")                         // Remove número do episódio no fim
        .replace(/\s+/g, " ").trim();                      // Limpa espaços duplos
        
    return cleaned;
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
                            score: item.score
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

// --- VISUAIS ---
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
        const hasImg = current.querySelector('img') || current.querySelector('.cover, .poster, .thumb, .contentImg, .coverImg');
        const isStructuralTag = ['BODY', 'HTML', 'MAIN', 'ASIDE', 'SECTION', 'UL'].includes(current.tagName);
        if (hasImg && !isStructuralTag) return current;
        current = current.parentElement;
        attempts++;
    }
    return null;
}

// --- PAINEL ---
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
        else alert("Anime não encontrado.");
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

function searchAndShowPanel(rawTitle) {
    if (isSearching) return;
    if (document.getElementById('malControlPanel')?.classList.contains('visible')) return;
    
    isSearching = true;
    document.body.style.cursor = 'wait';
    
    const cleanQuery = normalize(rawTitle);
    
    // LOG DE DEBUG PARA O UTILIZADOR
    logDebug("Pesquisa API", `Original: "${rawTitle}" -> Pesquisado: "${cleanQuery}"`);

    if (cleanQuery.length < 4) {
        isSearching = false;
        document.body.style.cursor = 'default';
        return;
    }

    chrome.runtime.sendMessage({ action: "SEARCH_ANIME", title: cleanQuery }, (response) => {
        isSearching = false;
        document.body.style.cursor = 'default';
        if (response && response.success) {
            const anime = response.anime;
            logDebug("API Resposta", `Encontrado: "${anime.title}" (ID: ${anime.mal_id})`);
            
            let finalStatus = null;
            for (let [key, val] of globalAnimeMap.entries()) {
                if (val.id === anime.mal_id) {
                    finalStatus = val.status;
                    break;
                }
            }
            showPanel(anime.title, { id: anime.mal_id, status: finalStatus });
        } else {
            logDebug("API Erro", "Nenhum anime encontrado.");
        }
    });
}

// --- LÓGICA PRINCIPAL ---
function processPage() {
    const candidates = document.querySelectorAll('a, span, h1, h2, h3, h4, p, div.title, div.serie, .title_anime');
    let foundMainAnime = false; 

    candidates.forEach(element => {
        if (element.closest('[data-mal-status]')) return;
        if (!element.offsetParent) return; 
        
        const text = element.innerText || "";
        if (text.length < 3) return;
        
        const animeTitle = normalize(text);
        if (!animeTitle || animeTitle.length < 3) return;

        // 1. Check na Lista
        let match = null;
        if (globalAnimeMap.has(animeTitle)) {
            match = globalAnimeMap.get(animeTitle);
        } else {
             for (let [malTitle, data] of globalAnimeMap) {
                const t1 = animeTitle.replace(/\s/g, "");
                const t2 = malTitle.replace(/\s/g, "");
                if (t1.includes(t2) || t2.includes(t1)) {
                    // Match Aproximado
                    if (Math.abs(t1.length - t2.length) <= 5) {
                        match = data;
                        break;
                    }
                }
            }
        }

        if (match) {
            const card = findCardContainer(element);
            if (card) applyVisuals(card, match.status);
        }

        // 2. PAINEL
        if (!foundMainAnime) {
            const tag = element.tagName;
            const isH1 = (tag === 'H1');
            const urlPath = window.location.pathname.toLowerCase().replace(/[^a-z0-9]/g, "");
            const titleClean = animeTitle.replace(/\s/g, "");
            const isInUrl = urlPath.includes(titleClean);
            
            if ((isH1 || isInUrl) && !element.closest('aside, footer, .sidebar, .widget, header, nav')) {
                foundMainAnime = true; 
                
                // LOG DE DEBUG DO MATCH
                if(isInUrl) logDebug("URL Match", `Anime: "${animeTitle}" encontrado no URL.`);
                
                if (!document.getElementById('malControlPanel')?.classList.contains('visible')) {
                    if (match) {
                        logDebug("Lista Local", `Encontrado na tua lista: "${text}"`);
                        showPanel(text, match);
                    } else {
                        searchAndShowPanel(text);
                    }
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
        debounceTimer = setTimeout(() => { processPage(); }, 500);
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

(async () => {
    if (window.location.hostname.includes("myanimelist.net")) return;
    if (localStorage.getItem('mal_v22_domainfix')) localStorage.removeItem('mal_v22_domainfix');

    try {
        await getUserList();
        if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startObserver);
        else startObserver();
    } catch (e) { console.error("[MAL] Init failed:", e); }
})();