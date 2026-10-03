// src/popup/services/api.service.js

/**
 * API Service (Popup Context)
 * @description Gere as chamadas de rede feitas a partir do Popup, incluindo a validação na API do Jikan e a comunicação com o Service Worker.
 */
import { NetworkService } from '../../common/network.service.js';

export class ApiService {
    /**
     * Verifica se o utilizador existe no MyAnimeList e obtém a sua imagem de perfil.
     * @param {string} username - O nome de utilizador do MAL.
     * @returns {Promise<string>} O URL do avatar do utilizador.
     */
    static async verifyMalUser(username) {
        try {
            const response = await NetworkService.fetchWithTimeout(`https://api.jikan.moe/v4/users/${encodeURIComponent(username)}`, {}, 10000);
            if (response.status === 404) throw new Error('User not found');
            if (!response.ok) return '';
            const data = await response.json();
            return data?.data?.images?.jpg?.image_url || '';
        } catch (error) {
            if (error.message === 'User not found') throw error;
            return ''; // Jikan indisponível: a validação real é feita ao buscar a lista
        }
    }

    /**
     * Solicita ao Service Worker que sincronize a lista do utilizador a partir da nuvem.
     * @param {string} username - O nome de utilizador do MAL.
     * @returns {Promise<Object>} Resposta do Service Worker com o estado da sincronização.
     */
    static async syncMalList(username) {
        return new Promise((resolve) => {
            const timer = setTimeout(() => resolve({ success: false, error: 'Timeout' }), 90000);
            chrome.runtime.sendMessage({ action: "FETCH_MAL_LIST", username: username, force: true }, (res) => {
                clearTimeout(timer);
                resolve(chrome.runtime.lastError ? { success: false } : res);
            });
        });
    }

    /**
     * Pede ao Service Worker para recalcular as rotinas de verificação e os alarmes.
     */
    static triggerMonitorUpdate() {
        chrome.runtime.sendMessage({ action: "UPDATE_MONITORING" });
    }
}