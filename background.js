/**
 * Background Service Worker
 * Responsável por fazer o fetch cross-origin ao MyAnimeList
 */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "FETCH_MAL_LIST") {
        const username = request.username;
        // URL interna que o MAL usa para carregar a lista (muito mais rápido e fiável que APIs externas)
        // status=1 significa "Watching"
        const malUrl = `https://myanimelist.net/animelist/${username}/load.json?status=1&offset=0`;

        fetch(malUrl)
            .then(response => {
                if (!response.ok) throw new Error('Falha ao conectar ao MAL');
                return response.json();
            })
            .then(data => {
                sendResponse({ success: true, data: data });
            })
            .catch(error => {
                console.error("Erro no Background:", error);
                sendResponse({ success: false, error: error.message });
            });

        return true; // Mantém o canal de mensagem aberto para a resposta assíncrona
    }
});