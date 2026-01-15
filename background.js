/**
 * Background Service Worker - v25.0 (Strict Validation)
 * Correção: Valida se o pedido ao MAL foi sucesso (200 OK) e se devolveu uma Lista.
 * Impede falsos positivos em perfis privados.
 */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // 1. Buscar Lista do Utilizador (COM VALIDAÇÃO)
    if (request.action === "FETCH_MAL_LIST") {
        const username = request.username;
        // Adicionamos timestamp para evitar que o browser use cache de quando era pública
        const malUrl = `https://myanimelist.net/animelist/${username}/load.json?status=7&offset=0&_t=${Date.now()}`;

        fetch(malUrl)
            .then(res => {
                // Se der erro 400/403 (Privado ou Banido), lança erro
                if (!res.ok) throw new Error("Private or Invalid Profile");
                return res.json();
            })
            .then(data => {
                // Se o MAL devolver um objeto de erro em vez de uma lista (Array), rejeita
                if (!Array.isArray(data)) throw new Error("Invalid Data Format");
                
                sendResponse({ success: true, data: data });
            })
            .catch(err => {
                console.warn("[Background] Fetch failed:", err.message);
                sendResponse({ success: false, error: err.message });
            });

        return true; 
    }

    // 2. Pesquisar ID do Anime
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