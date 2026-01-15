/**
 * Background Service Worker - v30.0 (Multi-Result Search)
 * Melhoria: Agora pede 5 resultados à API em vez de 1.
 * Isso permite encontrar Especiais/Filmes que a API esconde atrás da Série Principal.
 */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // 1. Buscar Lista do Utilizador
    if (request.action === "FETCH_MAL_LIST") {
        const username = request.username;
        const malUrl = `https://myanimelist.net/animelist/${username}/load.json?status=7&offset=0&_t=${Date.now()}`;

        fetch(malUrl)
            .then(res => {
                if (!res.ok) throw new Error("Private or Invalid Profile");
                return res.json();
            })
            .then(data => {
                if (!Array.isArray(data)) throw new Error("Invalid Data Format");
                sendResponse({ success: true, data: data });
            })
            .catch(err => {
                console.warn("[Background] Fetch failed:", err.message);
                sendResponse({ success: false, error: err.message });
            });

        return true; 
    }

    // 2. Pesquisar Anime (AGORA COM LIMIT=5)
    if (request.action === "SEARCH_ANIME") {
        const query = encodeURIComponent(request.title);
        // Alterado de limit=1 para limit=5
        fetch(`https://api.jikan.moe/v4/anime?q=${query}&limit=5`)
            .then(res => res.json())
            .then(data => {
                if (data.data && data.data.length > 0) {
                    // Devolvemos o array completo 'results' em vez de 'anime' único
                    sendResponse({ success: true, results: data.data });
                } else {
                    sendResponse({ success: false, error: "Anime not found" });
                }
            })
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }
});