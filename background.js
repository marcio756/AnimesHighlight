/**
 * Background Service Worker - v31.0 (Pagination Fix)
 * Correção Crítica:
 * Implementada paginação (loop) no pedido load.json.
 * O MAL só devolve 300 animes por pedido. Agora a extensão continua a pedir
 * (offset += 300) até ter a lista completa (Dropped, On Hold, etc.).
 */

// Função auxiliar para buscar a lista completa (com paginação)
async function fetchUserListRecursively(username) {
    let allItems = [];
    let offset = 0;
    let hasMore = true;

    // Proteção contra loops infinitos (limite de 30.000 animes)
    while (hasMore && offset < 30000) {
        // Adicionamos status=7 (All) e o offset dinâmico
        const malUrl = `https://myanimelist.net/animelist/${username}/load.json?status=7&offset=${offset}&_t=${Date.now()}`;
        
        try {
            const res = await fetch(malUrl);
            
            // Se der erro de acesso (400/403)
            if (!res.ok) throw new Error("Private or Invalid Profile");
            
            const data = await res.json();
            
            // Validação de formato
            if (!Array.isArray(data)) throw new Error("Invalid Data Format");

            // Junta os novos itens à lista principal
            allItems = allItems.concat(data);

            console.log(`[Background] Fetched ${data.length} items (Offset: ${offset})`);

            // Se vieram menos de 300 itens, significa que chegámos ao fim da lista.
            if (data.length < 300) {
                hasMore = false;
            } else {
                // Senão, preparamos o próximo bloco
                offset += 300;
            }
        } catch (error) {
            console.error(`[Background] Error fetching offset ${offset}:`, error);
            // Se falhar a meio (ex: timeout), devolvemos o que já temos para não partir tudo
            if (allItems.length > 0) return allItems;
            throw error;
        }
    }
    
    console.log(`[Background] Full list fetch complete. Total items: ${allItems.length}`);
    return allItems;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // 1. Buscar Lista do Utilizador (COM PAGINAÇÃO)
    if (request.action === "FETCH_MAL_LIST") {
        fetchUserListRecursively(request.username)
            .then(data => {
                sendResponse({ success: true, data: data });
            })
            .catch(err => {
                sendResponse({ success: false, error: err.message });
            });

        return true; // Mantém o canal aberto para a resposta assíncrona
    }

    // 2. Pesquisar Anime (Multi-Result)
    // Mantém a lógica v30.0 de pedir 5 resultados para encontrar filmes/especiais
    if (request.action === "SEARCH_ANIME") {
        const query = encodeURIComponent(request.title);
        fetch(`https://api.jikan.moe/v4/anime?q=${query}&limit=5`)
            .then(res => res.json())
            .then(data => {
                if (data.data && data.data.length > 0) {
                    sendResponse({ success: true, results: data.data });
                } else {
                    sendResponse({ success: false, error: "Anime not found" });
                }
            })
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }
});