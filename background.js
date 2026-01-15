/**
 * Background Service Worker - v18.0 (Lite Version)
 * Funcionalidade: Apenas Leitura e Pesquisa (Sem escritas/updates)
 */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // 1. Buscar Lista do Utilizador (Para pintar as bordas/visuais)
    if (request.action === "FETCH_MAL_LIST") {
        const username = request.username;
        const malUrl = `https://myanimelist.net/animelist/${username}/load.json?status=7&offset=0`;

        fetch(malUrl)
            .then(res => res.json())
            .then(data => sendResponse({ success: true, data: data }))
            .catch(err => sendResponse({ success: false, error: err.message }));

        return true; 
    }

    // 2. Pesquisar ID do Anime (Para gerar o botão de abrir)
    if (request.action === "SEARCH_ANIME") {
        const query = encodeURIComponent(request.title);
        fetch(`https://api.jikan.moe/v4/anime?q=${query}&limit=1`)
            .then(res => res.json())
            .then(data => {
                if (data.data && data.data.length > 0) {
                    sendResponse({ success: true, anime: data.data[0] });
                } else {
                    sendResponse({ success: false, error: "Anime not found" });
                }
            })
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }
});