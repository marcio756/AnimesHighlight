/**
 * Content Script - TopAnimes Direct MAL
 * Versão: 5.0 (Smart Cache & Identity Check)
 */

const CACHE_KEY = 'mal_smart_cache_v5';
const CACHE_DURATION = 1000 * 60 * 30; // 30 Minutos

const STATUS_MAP = {
    1: { class: 'mal-watching', label: 'WATCHING' },
    2: { class: 'mal-completed', label: 'COMPLETED' },
    3: { class: 'mal-hold', label: 'ON HOLD' },
    4: { class: 'mal-dropped', label: 'DROPPED' },
    6: { class: 'mal-plan', label: 'PLAN TO WATCH' }
};

// --- Helpers ---
const normalize = (str) => {
    if (str === null || str === undefined) return "";
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

// --- Lógica Principal de Dados ---
async function getUserList() {
    const USERNAME = await getUsername();
    const cached = localStorage.getItem(CACHE_KEY);
    
    // VERIFICAÇÃO DE INTEGRIDADE DA CACHE
    if (cached) {
        try {
            const { timestamp, data, owner } = JSON.parse(cached);
            
            // Verifica validade temporal E se o dono da cache é o utilizador atual
            // Se o dono for diferente (trocaste de user), a cache é ignorada
            if ((Date.now() - timestamp < CACHE_DURATION) && owner === USERNAME) {
                return new Map(data); 
            } else {
                console.log("[MAL] Cache expirada ou de outro utilizador. A recarregar...");
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
                
                // GUARDAMOS TAMBÉM O 'OWNER' (DONO) DA LISTA
                localStorage.setItem(CACHE_KEY, JSON.stringify({
                    timestamp: Date.now(),
                    owner: USERNAME, // <--- Fundamental para a troca funcionar
                    data: Array.from(animeMap.entries())
                }));
                resolve(animeMap);
            } else {
                resolve(new Map());
            }
        });
    });
}

// --- Lógica de UI ---
function applyStyles(animeMap) {
    const articles = document.querySelectorAll('article.item');
    articles.forEach(article => {
        // Se mudarmos de user, queremos reprocessar tudo, por isso removemos a verificação simples de dataset
        // Mas para performance, verificamos se o status atual bate certo com o novo mapa
        
        const titleElement = article.querySelector('.serie');
        if (!titleElement) return;
        
        const animeTitle = normalize(titleElement.innerText);
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

        // Limpeza de classes antigas (caso mudes de user e o status mude)
        article.classList.remove('mal-item-highlight', 'mal-watching', 'mal-completed', 'mal-hold', 'mal-dropped', 'mal-plan');
        const existingLabel = article.querySelector('.mal-label');
        if (existingLabel) existingLabel.remove();

        if (foundStatus && STATUS_MAP[foundStatus]) {
            const styleInfo = STATUS_MAP[foundStatus];
            article.classList.add('mal-item-highlight', styleInfo.class);
            
            const label = document.createElement('div');
            label.className = 'mal-label';
            label.innerText = styleInfo.label;
            article.appendChild(label);
            
            article.dataset.malStatus = foundStatus;
        }
    });
}

// --- Inicialização ---
(async () => {
    // Inicia processo
    const animeMap = await getUserList();
    if (animeMap.size > 0) {
        applyStyles(animeMap);
        setInterval(() => applyStyles(animeMap), 2500);
    }
})();