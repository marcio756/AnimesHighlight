/**
 * Background Service Worker
 * Versão 3.0: Busca a lista completa de animes (Todos os estados)
 */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "FETCH_MAL_LIST") {
        const username = request.username;
        // status=7 pede "Todos" os animes da lista
        const malUrl = `https://myanimelist.net/animelist/${username}/load.json?status=7&offset=0`;

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

        return true; 
    }
});