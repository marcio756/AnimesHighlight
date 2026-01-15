/**
 * Content Script - TopAnimes Direct MAL
 * Versão: 3.2 (Strict Matching - Fix Sequels)
 */

const USERNAME = 'marcio756';
const CACHE_KEY = 'mal_full_list_cache_v3'; // Nova cache v3
const CACHE_DURATION = 1000 * 60 * 30; // 30 Minutos

const STATUS_MAP = {
    1: { class: 'mal-watching', label: 'WATCHING' },
    2: { class: 'mal-completed', label: 'COMPLETED' },
    3: { class: 'mal-hold', label: 'ON HOLD' },
    4: { class: 'mal-dropped', label: 'DROPPED' },
    6: { class: 'mal-plan', label: 'PLAN TO WATCH' }
};

// --- 1. Normalização Melhorada ---
const normalize = (str) => {
    if (str === null || str === undefined) return "";
    
    return String(str).toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        // Removemos mais palavras comuns de sequelas para aumentar a chance de match exato
        .replace(/\(tv\)|\(movie\)|legendado|dublado|episodio|filme|[0-9]+ª|temporada|season|final|part|cour/g, "")
        .replace(/[^a-z0-9]/g, "");
};

// --- 2. Serviço de Dados ---
async function getUserList() {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
        try {
            const { timestamp, data } = JSON.parse(cached);
            if (Date.now() - timestamp < CACHE_DURATION) {
                return new Map(data); 
            }
        } catch (e) {
            localStorage.removeItem(CACHE_KEY);
        }
    }
    
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "FETCH_MAL_LIST", username: USERNAME }, (response) => {
            if (response && response.success && Array.isArray(response.data)) {
                const animeMap = new Map();
                response.data.forEach(item => {
                    if (!item) return;
                    const title = item.anime_title; 
                    const status = item.status;
                    if (title) animeMap.set(normalize(title), status);
                });
                
                localStorage.setItem(CACHE_KEY, JSON.stringify({
                    timestamp: Date.now(),
                    data: Array.from(animeMap.entries())
                }));
                resolve(animeMap);
            } else {
                resolve(new Map());
            }
        });
    });
}

// --- 3. Lógica de UI (Com Proteção Anti-Sequela) ---
function applyStyles(animeMap) {
    const articles = document.querySelectorAll('article.item');

    articles.forEach(article => {
        if (article.dataset.malStatus) return;

        const titleElement = article.querySelector('.serie');
        if (!titleElement) return;

        // Normaliza o título do site
        const animeTitle = normalize(titleElement.innerText);
        if (!animeTitle) return;
        
        let foundStatus = null;
        
        // 1. Tenta Match Exato (Prioridade Máxima)
        if (animeMap.has(animeTitle)) {
            foundStatus = animeMap.get(animeTitle);
        } else {
            // 2. Tenta Match Parcial com RIGOR
            for (let [malTitle, status] of animeMap) {
                // Verifica se um contem o outro
                if (malTitle && (animeTitle.includes(malTitle) || malTitle.includes(animeTitle))) {
                    
                    // CÁLCULO DE SEGURANÇA:
                    // Calcula a diferença de tamanho entre os dois títulos
                    const lenDiff = Math.abs(animeTitle.length - malTitle.length);
                    
                    // SÓ aceita o match parcial se a diferença for menor que 3 caracteres.
                    // Isto permite: "Naruto" vs "Naruto!" (Diff 0 ou 1) -> OK
                    // Isto BLOQUEIA: "Golden Kamuy" (11) vs "Golden Kamuy Saishuushou" (22) -> Diff 11 -> BLOQUEADO
                    if (lenDiff <= 3 && malTitle.length > 3) {
                        foundStatus = status;
                        break;
                    }
                }
            }
        }

        if (foundStatus && STATUS_MAP[foundStatus]) {
            const styleInfo = STATUS_MAP[foundStatus];
            article.classList.add('mal-item-highlight', styleInfo.class);
            
            if (!article.querySelector('.mal-label')) {
                const label = document.createElement('div');
                label.className = 'mal-label';
                label.innerText = styleInfo.label;
                article.appendChild(label);
            }
            
            article.dataset.malStatus = foundStatus;
        }
    });
}

// --- 4. Inicialização ---
(async () => {
    // Limpa caches antigos para forçar nova lógica
    localStorage.removeItem('mal_full_list_cache_v2'); 
    
    const animeMap = await getUserList();
    if (animeMap.size > 0) {
        applyStyles(animeMap);
        setInterval(() => applyStyles(animeMap), 2500);
    }
})();