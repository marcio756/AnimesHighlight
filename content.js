/**
 * Content Script - MAL Highlighter v12.0 (Overlay System)
 * Zero impacto no layout do site.
 */

const CACHE_KEY = 'mal_v12_cache';
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

// --- Aplicação Visual (OVERLAY) ---
function applyVisuals(element, statusId) {
    if (!STATUS_MAP[statusId]) return;

    // Se já tiver overlay, não faz nada
    if (element.querySelector('.mal-overlay')) return;

    // Proteção contra elementos gigantes (ex: sliders de fundo)
    const rect = element.getBoundingClientRect();
    if (rect.width > window.innerWidth * 0.9) return;

    const styleInfo = STATUS_MAP[statusId];

    // Para o overlay absoluto funcionar, o pai tem de ser relativo
    // Isto geralmente não afeta o layout visual, apenas o contexto de posicionamento
    if (getComputedStyle(element).position === 'static') {
        element.style.position = 'relative';
    }

    // Criar o Overlay
    const overlay = document.createElement('div');
    overlay.className = `mal-overlay ${styleInfo.class}`;
    
    // Criar a Etiqueta dentro do Overlay
    const label = document.createElement('div');
    label.className = 'mal-label';
    label.innerText = styleInfo.label;
    
    overlay.appendChild(label);
    element.appendChild(overlay);
    
    element.dataset.malStatus = statusId;
}

// --- Algoritmo de Busca Inteligente ---
function findCardContainer(titleElement) {
    let current = titleElement.parentElement;
    let attempts = 0;
    const MAX_LEVELS_UP = 6; 

    while (current && attempts < MAX_LEVELS_UP) {
        if (current.dataset.malStatus || current.querySelector('.mal-overlay')) return current;

        // Procura imagem ou div com background-image (comum no Goyabu)
        const hasImgTag = current.querySelector('img');
        const hasBgDiv = current.querySelector('.cover, .poster, .thumb, .contentImg, .coverImg'); 

        if (hasImgTag || hasBgDiv) {
            // Ignora tags de estrutura macro
            if (!['BODY', 'HTML', 'MAIN', 'SECTION'].includes(current.tagName)) {
                return current;
            }
        }
        current = current.parentElement;
        attempts++;
    }
    return null;
}

// --- Motor Principal ---
function applyStyles(animeMap) {
    // Procura todos os possíveis títulos
    const candidates = document.querySelectorAll('a, span, h1, h2, h3, h4, p, div.title, div.serie, .title_anime');

    candidates.forEach(element => {
        // Ignora se já estiver dentro de um card processado
        if (element.closest('[data-mal-status]')) return;

        const text = element.innerText || "";
        if (text.length < 3) return;

        const animeTitle = normalize(text);
        if (!animeTitle) return;

        let foundStatus = null;
        if (animeMap.has(animeTitle)) {
            foundStatus = animeMap.get(animeTitle);
        } else {
            for (let [malTitle, status] of animeMap) {
                if (malTitle.length > 3 && (animeTitle.includes(malTitle) || malTitle.includes(animeTitle))) {
                    if (Math.abs(animeTitle.length - malTitle.length) <= 4) {
                        foundStatus = status;
                        break;
                    }
                }
            }
        }

        if (foundStatus) {
            const cardContainer = findCardContainer(element);
            if (cardContainer) {
                applyVisuals(cardContainer, foundStatus);
            }
        }
    });
}

// --- Inicialização ---
(async () => {
    // Limpeza cache
    if (localStorage.getItem('mal_v11_cache')) localStorage.removeItem('mal_v11_cache');

    const animeMap = await getUserList();
    if (animeMap.size > 0) {
        applyStyles(animeMap);
        setInterval(() => applyStyles(animeMap), 2500);
    }
})();