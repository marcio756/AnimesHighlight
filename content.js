/**
 * Content Script - MAL Highlighter v10.0
 * Suporte: TopAnimes, Goyabu, AnimesOnline, AnimesDigital e Universal
 */

const CACHE_KEY = 'mal_v10_cache';
const CACHE_DURATION = 1000 * 60 * 30; 

const STATUS_MAP = {
    1: { class: 'mal-watching', label: 'WATCHING' },
    2: { class: 'mal-completed', label: 'COMPLETED' },
    3: { class: 'mal-hold', label: 'ON HOLD' },
    4: { class: 'mal-dropped', label: 'DROPPED' },
    6: { class: 'mal-plan', label: 'PLAN TO WATCH' }
};

// --- Helpers ---
const normalize = (str) => {
    if (!str || str.length < 3) return "";
    return String(str).toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/\(tv\)|\(movie\)|legendado|dublado|episodio|filme|[0-9]+ª|temporada|season|final|part|cour/g, "")
        .replace(/[^a-z0-9]/g, "");
};

function getUsername() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['malUsername'], (result) => {
            resolve(result.malUsername || 'marcio756');
        });
    });
}

// --- Dados ---
async function getUserList() {
    const USERNAME = await getUsername();
    const cached = localStorage.getItem(CACHE_KEY);
    
    if (cached) {
        try {
            const { timestamp, data, owner } = JSON.parse(cached);
            if ((Date.now() - timestamp < CACHE_DURATION) && owner === USERNAME) {
                return new Map(data); 
            }
        } catch (e) { localStorage.removeItem(CACHE_KEY); }
    }
    
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "FETCH_MAL_LIST", username: USERNAME }, (response) => {
            if (response && response.success && Array.isArray(response.data)) {
                const animeMap = new Map();
                response.data.forEach(item => {
                    if (!item) return;
                    const title = item.anime_title; 
                    if (title) animeMap.set(normalize(title), item.status);
                });
                
                localStorage.setItem(CACHE_KEY, JSON.stringify({
                    timestamp: Date.now(),
                    owner: USERNAME,
                    data: Array.from(animeMap.entries())
                }));
                resolve(animeMap);
            } else {
                resolve(new Map());
            }
        });
    });
}

// --- Aplicação Visual ---
function applyVisuals(element, statusId, isUniversalMode) {
    if (!STATUS_MAP[statusId]) return;
    const styleInfo = STATUS_MAP[statusId];

    element.classList.add('mal-item-highlight', styleInfo.class);
    
    // Força display block se necessário para a borda aparecer
    if (isUniversalMode || getComputedStyle(element).display === 'inline') {
        element.style.display = "inline-block";
    }
    if (getComputedStyle(element).position === 'static') {
        element.style.position = 'relative';
    }

    if (!element.querySelector('.mal-label')) {
        const label = document.createElement('div');
        label.className = 'mal-label';
        label.innerText = styleInfo.label;
        element.appendChild(label);
    }
    
    element.dataset.malStatus = statusId;
}

// --- Comparação ---
function checkAndApply(element, rawTitle, animeMap, isUniversal) {
    const animeTitle = normalize(rawTitle);
    if (!animeTitle) return;

    let foundStatus = null;
    if (animeMap.has(animeTitle)) {
        foundStatus = animeMap.get(animeTitle);
    } else {
        for (let [malTitle, status] of animeMap) {
            if (malTitle && (animeTitle.includes(malTitle) || malTitle.includes(animeTitle))) {
                const lenDiff = Math.abs(animeTitle.length - malTitle.length);
                if (lenDiff <= 3 && malTitle.length > 3) {
                    foundStatus = status;
                    break;
                }
            }
        }
    }

    if (foundStatus) {
        applyVisuals(element, foundStatus, isUniversal);
    }
}

// --- MOTOR DE DECISÃO V10 ---
function applyStyles(animeMap) {
    
    // 1. TEMA ANIMES DIGITAL (Novo!)
    // Estrutura: <div class="itemE"> ... <span class="title_anime">Título</span>
    const digitalCards = document.querySelectorAll('.itemE');
    if (digitalCards.length > 0) {
        digitalCards.forEach(card => {
            if (card.dataset.malStatus) return;
            const titleEl = card.querySelector('.title_anime');
            if (titleEl) checkAndApply(card, titleEl.innerText, animeMap, false);
        });
        return; // Encontrou o tema, para aqui.
    }

    // 2. TEMA DOOPLAY (TopAnimes, AnimesOnline)
    const dooplayCards = document.querySelectorAll('article.item');
    if (dooplayCards.length > 0) {
        dooplayCards.forEach(article => {
            if (article.dataset.malStatus) return;
            const titleEl = article.querySelector('.serie') || article.querySelector('.title') || article.querySelector('h3');
            if (titleEl) checkAndApply(article, titleEl.innerText, animeMap, false);
        });
        return;
    }

    // 3. TEMA CRONOS (Goyabu)
    const cronosCards = document.querySelectorAll('article.boxEP');
    if (cronosCards.length > 0) {
        cronosCards.forEach(article => {
            if (article.dataset.malStatus) return;
            const titleEl = article.querySelector('.title');
            if (titleEl) checkAndApply(article, titleEl.innerText, animeMap, false);
        });
        return;
    }

    // 4. FALLBACK UNIVERSAL (Outros sites desconhecidos)
    const potentialCards = document.querySelectorAll('a');
    potentialCards.forEach(link => {
        if (link.dataset.malStatus) return;
        const hasImg = link.querySelector('img');
        if (!hasImg) return;
        let rawText = link.getAttribute('title') || link.innerText || hasImg.alt;
        checkAndApply(link, rawText, animeMap, true);
    });
}

// --- Inicialização ---
(async () => {
    // Limpeza de cache de versões antigas
    if (localStorage.getItem('mal_v9_cache')) localStorage.removeItem('mal_v9_cache');

    const animeMap = await getUserList();
    if (animeMap.size > 0) {
        applyStyles(animeMap);
        setInterval(() => applyStyles(animeMap), 2500);
    }
})();