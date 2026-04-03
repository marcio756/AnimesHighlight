// src/popup/services/storage.service.js

/**
 * Storage Service
 * @description Abstrai o acesso e a manipulação do chrome.storage para o contexto do Popup.
 */
export class StorageService {
    static async getCoreData() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['notificationLog', 'monitoredSites'], (result) => {
                resolve({
                    sites: result.monitoredSites || [],
                    logs: result.notificationLog || []
                });
            });
        });
    }

    static async saveSites(sites) {
        return new Promise((resolve) => {
            chrome.storage.local.set({ monitoredSites: sites }, resolve);
        });
    }

    static async saveLogs(logs) {
        return new Promise((resolve) => {
            chrome.storage.local.set({ notificationLog: logs }, resolve);
        });
    }

    static async clearLogs() {
        return this.saveLogs([]);
    }

    static async getSettings() {
        return new Promise((resolve) => {
            chrome.storage.local.get([
                'malUsername', 'malAvatar', 'extensionLang', 
                'panelEnabled', 'panelTransparent', 'savePanelPos', 
                'autoUpdateProgress', 'autoDetectSeasons', 'highlightStatuses', 'customColors'
            ], resolve);
        });
    }

    static async saveSettings(settings) {
        return new Promise((resolve) => {
            chrome.storage.local.set(settings, resolve);
        });
    }

    static async saveUserProfile(username, avatarUrl) {
        return new Promise((resolve) => {
            chrome.storage.local.set({ malUsername: username, malAvatar: avatarUrl }, resolve);
        });
    }
}