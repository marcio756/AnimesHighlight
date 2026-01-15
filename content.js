/**
 * Content Script - TopAnimes Direct MAL
 * Versão: 2.1 (Fix Layout & Duplicates)
 */

const USERNAME = 'marcio756';
const CACHE_KEY = 'mal_direct_cache';
const CACHE_DURATION = 1000 * 60 * 30; // 30 Minutos

// --- 1. Normalização ---
const normalize = (str) => {
    if (!str) return "";
    return str.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/\(tv\)|\(movie\)|legendado|dublado|episodio|filme|[0-9]+ª|temporada/g, "")
        .replace(/[^a-z0-9]/g, "");
};

// --- 2. Serviço de Dados (Via Background) ---
async function getWatchingList() {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
        const { timestamp, data } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_DURATION) {
            return new Set(data);
        }
    }
    
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "FETCH_MAL_LIST", username: USERNAME }, (response) => {
            if (response && response.success) {
                const titles = new Set();
                response.data.forEach(item => {
                    titles.add(normalize(item.anime_title));
                });
                
                localStorage.setItem(CACHE_KEY, JSON.stringify({
                    timestamp: Date.now(),
                    data: Array.from(titles)
                }));
                
                resolve(titles);
            } else {
                resolve(new Set());
            }
        });
    });
}

// --- 3. Lógica de UI ---
function applyBorders(watchingSet) {
    const articles = document.querySelectorAll('article.item');

    articles.forEach(article => {
        // Se já tem a classe da borda, não precisamos de fazer nada (evita duplicados)
        if (article.classList.contains('mal-watching-border')) return;

        const titleElement = article.querySelector('.serie');
        if (!titleElement) return;

        const animeTitle = normalize(titleElement.innerText);
        
        let isMatch = false;
        if (watchingSet.has(animeTitle)) {
            isMatch = true;
        } else {
            for (let malTitle of watchingSet) {
                if ((animeTitle.includes(malTitle) || malTitle.includes(animeTitle)) && malTitle.length > 4) {
                    isMatch = true;
                    break;
                }
            }
        }

        if (isMatch) {
            // Adiciona a classe que trata da borda e da posição
            article.classList.add('mal-watching-border');
            
            // Adiciona a etiqueta (Verificação extra para garantir que não existe)
            if (!article.querySelector('.mal-label')) {
                const label = document.createElement('div');
                label.className = 'mal-label';
                label.innerText = 'WATCHING';
                article.appendChild(label);
            }
        }
    });
}

// --- 4. Inicialização ---
(async () => {
    const watchingSet = await getWatchingList();
    
    if (watchingSet.size > 0) {
        applyBorders(watchingSet);
        // Intervalo aumentado para 2.5s para ser menos agressivo
        setInterval(() => applyBorders(watchingSet), 2500);
    }
})();