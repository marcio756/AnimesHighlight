/**
 * Internationalization (i18n) Service - SRP Application
 * @description Manages all static text across the extension to support multiple languages.
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
        
        infoMonitor: "Checks your active sites every 15 minutes for new items.",
        lblAddSite: "Add Site to Monitor:",
        placeholderSiteUrl: "https://example.com/latest",
        btnAddSite: "Add Site",
        siteListEmpty: "No sites added yet. Add a URL above to start monitoring.",
        siteExists: "Site already exists.",
        
        emptyHistory: "No new releases detected yet.",
        btnClearHistory: "Clear History",
        confirmClear: "Clear all history?",
        filterAllSites: "All Sites",
        
        lblLanguage: "Extension Language:",
        langEn: "English",
        langPt: "Português",
        
        lblCloudSync: "Cloud Sync & Backup",
        syncWarning: "You can use the extension normally without logging in, but if you uninstall or change devices, your data and site settings will be lost.",
        syncLoggedIn: "Logged in",
        syncNotLoggedIn: "Not logged in (Local only)",
        btnLogin: "Login",
        btnLogout: "Logout",

        lblEnablePanel: "Show Floating Panel",
        lblEnableTransparency: "Transparent Panel (Hover to view)",
        lblSavePanelPos: "Save Panel Drag Position",
        lblAutoUpdate: "Auto-Update Progress (URL Sync)",
        lblAutoDetectSeasons: "Auto-Detect Seasons from Episode Number",
        lblHighlights: "Statuses to Highlight:",
        lblColors: "Status Colors:",
        
        btnSaveSettings: "Save Settings",
        
        lblNextCheck: "Next check in:",
        lblMinutes: "minutes",
        lblNow: "Checking now...",
        lblNotScheduled: "Monitoring disabled.",
        
        statusChecking: "Checking...",
        statusCheckingMultiple: "Checking multiple sites...",
        statusNotInList: "NOT IN LIST",
        statusAddToList: "Add to List...",
        statusSaved: "Saved successfully!",
        statusErrorUser: "User not found or private.",
        statusErrorUrl: "Please enter a valid URL.",
        statusNotFoundMal: "Not found on MAL",
        
        panelOpenBtn: "Open MyAnimeList",
        btnSearchMal: "Search on MAL",
        btnQuickAdd: "Quick Add +1",
        
        notifTitle: "MAL Highlighter Monitor",
        notifNew: "New Release",
        notifMultiple: "New Releases Available!",
        notifBtnWatch: "Watch Now",
        notifBtnMarkSeen: "Mark as Seen",
        notifBtnSearching: "Searching...",
        notifBtnOpen: "Open",
        notifMarkedSeen: "Successfully marked {title} progress {ep} as seen.",

        statusWatching: "WATCHING",
        statusReading: "READING",
        statusCompleted: "COMPLETED",
        statusOnHold: "ON HOLD",
        statusDropped: "DROPPED",
        statusPlanned: "PLANNED",

        welcomeTitle: "Welcome to MAL Highlighter",
        welcomeSubtitle: "Let's set up your extension in two simple steps.",
        welcomeStep1Title: "1. Connect your MyAnimeList",
        welcomeStep1Desc: "Click the extension icon in your browser toolbar, enter your MyAnimeList username, and click 'Verify & Save'.",
        welcomeStep2Title: "2. Enjoy the Magic",
        welcomeStep2Desc: "Visit your favorite anime or manga sites. The extension will automatically highlight covers based on your list and show a floating panel you can drag around!",
        welcomeStartBtn: "Close and Start",

        prefixEp: "Ep",
        prefixCh: "Ch",
        profileWelcome: "Welcome, {user}!"
    },
    pt: {
        appTitle: "Realçador MAL",
        tabProfile: "Perfil",
        tabMonitor: "Monitor",
        tabHistory: "Histórico",
        tabSettings: "Definições",
        
        lblUsername: "Nome de Utilizador (MyAnimeList):",
        btnVerifySave: "Verificar e Guardar",
        
        infoMonitor: "Verifica os teus sites ativos a cada 15 minutos por novidades.",
        lblAddSite: "Adicionar Site a Monitorizar:",
        placeholderSiteUrl: "https://exemplo.com/lancamentos",
        btnAddSite: "Adicionar Site",
        siteListEmpty: "Nenhum site adicionado. Adiciona um URL acima para começar.",
        siteExists: "Este site já existe na lista.",
        
        emptyHistory: "Ainda não foram detetados novos lançamentos.",
        btnClearHistory: "Limpar Histórico",
        confirmClear: "Apagar todo o histórico?",
        filterAllSites: "Todos os Sites",
        
        lblLanguage: "Idioma da Extensão:",
        langEn: "English",
        langPt: "Português",

        lblCloudSync: "Sincronização Cloud",
        syncWarning: "Podes usar a extensão normalmente sem fazer login, mas se a desinstalares ou mudares de dispositivo, vais perder as tuas definições e histórico.",
        syncLoggedIn: "Sessão iniciada",
        syncNotLoggedIn: "Sem sessão iniciada (Apenas local)",
        btnLogin: "Login",
        btnLogout: "Sair",
        
        lblEnablePanel: "Ativar Painel Flutuante",
        lblEnableTransparency: "Ativar Transparência no Painel",
        lblSavePanelPos: "Guardar Posição do Painel",
        lblAutoUpdate: "Atualizar Progresso Autom.",
        lblAutoDetectSeasons: "Detetar Temporadas Auto. pela Numeração",
        lblHighlights: "Estados a Destacar:",
        lblColors: "Cores dos Estados:",
        
        btnSaveSettings: "Guardar Definições",
        
        lblNextCheck: "Próxima verificação em:",
        lblMinutes: "minutos",
        lblNow: "A verificar agora...",
        lblNotScheduled: "Monitorização desativada.",
        
        statusChecking: "A verificar...",
        statusCheckingMultiple: "A verificar múltiplos sites...",
        statusNotInList: "NÃO ESTÁ NA LISTA",
        statusAddToList: "Adicionar à Lista...",
        statusSaved: "Guardado com sucesso!",
        statusErrorUser: "Utilizador não encontrado ou privado.",
        statusErrorUrl: "Por favor, insere um URL válido.",
        statusNotFoundMal: "Não encontrado no MAL",
        
        panelOpenBtn: "Abrir no MyAnimeList",
        btnSearchMal: "Pesquisar no MAL",
        btnQuickAdd: "Adicionar Rápido +1",
        
        notifTitle: "Monitor do Realçador MAL",
        notifNew: "Novo Lançamento",
        notifMultiple: "Novos Lançamentos Disponíveis!",
        notifBtnWatch: "Assistir Agora",
        notifBtnMarkSeen: "Marcar como Visto",
        notifBtnSearching: "A procurar...",
        notifBtnOpen: "Abrir",
        notifMarkedSeen: "Marcaste {title} cap/ep {ep} como visto com sucesso.",

        statusWatching: "A VER",
        statusReading: "A LER",
        statusCompleted: "CONCLUÍDO",
        statusOnHold: "EM ESPERA",
        statusDropped: "DESISTIU",
        statusPlanned: "PLANEADO",

        welcomeTitle: "Bem-vindo ao Realçador MAL",
        welcomeSubtitle: "Vamos configurar a tua extensão em dois passos simples.",
        welcomeStep1Title: "1. Conecta o teu MyAnimeList",
        welcomeStep1Desc: "Clica no ícone da extensão na barra do teu navegador, insere o teu nome de utilizador do MyAnimeList e clica em 'Verificar e Guardar'.",
        welcomeStep2Title: "2. Desfruta da Magia",
        welcomeStep2Desc: "Visita os teus sites favoritos de anime ou manga. A extensão irá realçar automaticamente as capas com base na tua lista e mostrar um painel flutuante que podes arrastar!",
        welcomeStartBtn: "Fechar e Começar",

        prefixEp: "Ep",
        prefixCh: "Cap",
        profileWelcome: "Bem-vindo, {user}!"
    }
};

export class I18nService {
    static async getCurrentLang() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['extensionLang'], (res) => {
                resolve(res.extensionLang || 'en');
            });
        });
    }

    static get(key, lang = 'en') {
        const dictionary = DICTIONARY[lang] || DICTIONARY['en'];
        return dictionary[key] || key;
    }

    static translateDOM(lang) {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (key) el.innerText = this.get(key, lang);
        });
    }
}