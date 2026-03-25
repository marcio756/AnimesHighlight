/**
 * Internationalization (i18n) Service - SRP Application
 * @description Manages all static text across the extension to support multiple languages.
 * Provides a unified dictionary and a helper class to resolve keys asynchronously.
 */

const DICTIONARY = {
    en: {
        appTitle: "MAL Highlighter",
        tabProfile: "Profile",
        tabMonitor: "Monitor",
        tabHistory: "History",
        tabSettings: "Settings",
        
        lblUsername: "MyAnimeList Username:",
        btnVerifySave: "Verify & Save",
        
        infoMonitor: "Checks the site every 15 minutes for new episodes/chapters of items you are currently watching or reading.",
        lblMonitorUrl: "Site URL to Monitor:",
        lblEnableMonitor: "Enable Background Monitoring",
        btnSaveSettings: "Save Settings",
        
        emptyHistory: "No new releases detected yet.",
        btnClearHistory: "Clear History",
        confirmClear: "Clear all history?",
        
        lblLanguage: "Extension Language:",
        langEn: "English",
        langPt: "Português",
        
        lblEnablePanel: "Show Floating Panel",
        lblEnableTransparency: "Transparent Panel (Hover to view)",
        
        statusChecking: "Checking...",
        statusNotInList: "NOT IN LIST",
        statusSaved: "Saved successfully!",
        statusErrorUser: "User not found or private.",
        statusErrorUrl: "Please enter a valid URL.",
        
        panelOpenBtn: "Open MyAnimeList",
        
        notifTitle: "MAL Highlighter Monitor",
        notifNew: "New Release",
        notifMultiple: "New Releases Available!"
    },
    pt: {
        appTitle: "Realçador MAL",
        tabProfile: "Perfil",
        tabMonitor: "Monitor",
        tabHistory: "Histórico",
        tabSettings: "Definições",
        
        lblUsername: "Nome de Utilizador (MyAnimeList):",
        btnVerifySave: "Verificar e Guardar",
        
        infoMonitor: "Verifica o site a cada 15 minutos por novos episódios/capítulos de itens que estás a acompanhar.",
        lblMonitorUrl: "URL do Site a Monitorizar:",
        lblEnableMonitor: "Ativar Monitorização em Segundo Plano",
        btnSaveSettings: "Guardar Definições",
        
        emptyHistory: "Ainda não foram detetados novos lançamentos.",
        btnClearHistory: "Limpar Histórico",
        confirmClear: "Apagar todo o histórico?",
        
        lblLanguage: "Idioma da Extensão:",
        langEn: "English",
        langPt: "Português",
        
        lblEnablePanel: "Ativar Painel Flutuante",
        lblEnableTransparency: "Ativar Transparência no Painel",
        
        statusChecking: "A verificar...",
        statusNotInList: "NÃO ESTÁ NA LISTA",
        statusSaved: "Guardado com sucesso!",
        statusErrorUser: "Utilizador não encontrado ou privado.",
        statusErrorUrl: "Por favor, insere um URL válido.",
        
        panelOpenBtn: "Abrir no MyAnimeList",
        
        notifTitle: "Monitor do Realçador MAL",
        notifNew: "Novo Lançamento",
        notifMultiple: "Novos Lançamentos Disponíveis!"
    }
};

class I18nService {
    /**
     * Retrieves the current saved language from storage.
     * @returns {Promise<string>} 'en' or 'pt'
     */
    static async getCurrentLang() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['extensionLang'], (res) => {
                resolve(res.extensionLang || 'en');
            });
        });
    }

    /**
     * Translates a specific key based on the current language.
     * @param {string} key - The dictionary key.
     * @param {string} lang - The language code.
     * @returns {string} The translated string or the key itself if not found.
     */
    static get(key, lang = 'en') {
        const dictionary = DICTIONARY[lang] || DICTIONARY['en'];
        return dictionary[key] || key;
    }

    /**
     * Automatically scans the DOM for 'data-i18n' attributes and replaces their innerText.
     * @param {string} lang - The language code to apply.
     */
    static translateDOM(lang) {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (key) el.innerText = this.get(key, lang);
        });
    }
}