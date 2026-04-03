// src/popup/services/api.service.js

/**
 * API Service (Popup Context)
 * @description Gere as chamadas de rede feitas a partir do Popup, incluindo a validação na API do Jikan e a comunicação com o Service Worker.
 */
export class ApiService {
    /**
     * Verifica se o utilizador existe no MyAnimeList e obtém a sua imagem de perfil.
     * @param {string} username - O nome de utilizador do MAL.
     * @returns {Promise<string>} O URL do avatar do utilizador.
     */
    static async verifyMalUser(username) {
        const response = await fetch(`https://api.jikan.moe/v4/users/${username}`);
        if (!response.ok) throw new Error('User not found');
        const data = await response.json();
        return data.data.images.jpg.image_url;
    }

    /**
     * Solicita ao Service Worker que sincronize a lista do utilizador a partir da nuvem.
     * @param {string} username - O nome de utilizador do MAL.
     * @returns {Promise<Object>} Resposta do Service Worker com o estado da sincronização.
     */
    static async syncMalList(username) {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: "FETCH_MAL_LIST", username: username }, resolve);
        });
    }

    /**
     * Pede ao Service Worker para recalcular as rotinas de verificação e os alarmes.
     */
    static triggerMonitorUpdate() {
        chrome.runtime.sendMessage({ action: "UPDATE_MONITORING" });
    }
}