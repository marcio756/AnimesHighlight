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
        lblSettingsGeneral: "General & Floating Panel",
        usernamePlaceholder: "e.g. your MAL username",
        themeToggle: "Toggle theme",
        removeSite: "Remove site",
        removeItem: "Remove",
        panelLoading: "Loading...",
        panelDragHint: "Drag to move",
        statusSyncFail: "Could not sync your list. Is the profile public?",
        footerText: "Universal MAL Highlighter",
        
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
        btnLogin: "Iniciar sessão",
        btnLogout: "Logout",

        lblEnablePanel: "Show Floating Panel",
        lblEnableTransparency: "Transparent Panel (Hover to view)",
        lblSavePanelPos: "Save Panel Drag Position",
        lblAutoUpdate: "Auto-Update Progress (URL Sync)",
        lblAutoSeasons: "Auto-Detect Next Season",
        lblHighlights: "Statuses to Highlight:",
        lblColors: "Status Colors:",
        
        btnSaveSettings: "Save Settings",
        
        lblNextCheck: "Next check in:",
        lblNow: "Checking now...",
        lblNotScheduled: "Monitoring disabled.",
        
        statusChecking: "Checking...",
        statusAddToList: "Add to List...",
        statusSaved: "Saved successfully!",
        statusErrorUser: "User not found or private.",
        statusErrorUrl: "Please enter a valid URL.",
        statusNotFoundMal: "Not found on MAL",
        
        panelOpenBtn: "Open MyAnimeList",
        btnSearchMal: "Search on MAL",
        manualPlaceholder: "MAL link, ID or name",
        manualLinkBtn: "Link",
        manualLinkFail: "Not found",
        manualUnlinkBtn: "Wrong anime? Unlink",
        
        notifNew: "New Release",
        notifBtnWatch: "Watch Now",
        notifBtnMarkSeen: "Mark as Seen",
        notifBtnSearching: "Searching...",
        notifBtnOpen: "Open",
        notifMarkedSeen: "Marked {title} #{ep} as seen.",

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
        appTitle: "MAL Highlighter",
        tabProfile: "Perfil",
        tabMonitor: "Monitor",
        tabHistory: "Histórico",
        tabSettings: "Definições",
        lblSettingsGeneral: "Geral e Painel Flutuante",
        usernamePlaceholder: "ex.: o teu utilizador do MAL",
        themeToggle: "Alternar tema",
        removeSite: "Remover site",
        removeItem: "Remover",
        panelLoading: "A carregar...",
        panelDragHint: "Arrastar para mover",
        statusSyncFail: "Não foi possível sincronizar a lista. O perfil é público?",
        footerText: "Universal MAL Highlighter",
        
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

        lblCloudSync: "Sincronização e Cópia de Segurança",
        syncWarning: "Podes usar a extensão normalmente sem iniciar sessão, mas se a desinstalares ou mudares de dispositivo, vais perder as tuas definições e o histórico.",
        syncLoggedIn: "Sessão iniciada",
        syncNotLoggedIn: "Sem sessão iniciada (Apenas local)",
        btnLogin: "Login",
        btnLogout: "Sair",
        
        lblEnablePanel: "Ativar Painel Flutuante",
        lblEnableTransparency: "Painel Transparente (passa o rato para ver)",
        lblSavePanelPos: "Guardar Posição do Painel",
        lblAutoUpdate: "Atualizar Progresso Automaticamente (pelo URL)",
        lblAutoSeasons: "Detetar Próxima Temporada Automaticamente",
        lblHighlights: "Estados a Destacar:",
        lblColors: "Cores dos Estados:",
        
        btnSaveSettings: "Guardar Definições",
        
        lblNextCheck: "Próxima verificação em:",
        lblNow: "A verificar agora...",
        lblNotScheduled: "Monitorização desativada.",
        
        statusChecking: "A verificar...",
        statusAddToList: "Adicionar à Lista...",
        statusSaved: "Guardado com sucesso!",
        statusErrorUser: "Utilizador não encontrado ou privado.",
        statusErrorUrl: "Por favor, insere um URL válido.",
        statusNotFoundMal: "Não encontrado no MAL",
        
        panelOpenBtn: "Abrir no MyAnimeList",
        btnSearchMal: "Pesquisar no MAL",
        manualPlaceholder: "Link, ID ou nome do MAL",
        manualLinkBtn: "Associar",
        manualLinkFail: "Não encontrado",
        manualUnlinkBtn: "Anime errado? Desassociar",
        
        notifNew: "Novo Lançamento",
        notifBtnWatch: "Ver Agora",
        notifBtnMarkSeen: "Marcar como Visto",
        notifBtnSearching: "A procurar...",
        notifBtnOpen: "Abrir",
        notifMarkedSeen: "Marcaste {title} (n.º {ep}) como visto.",

        statusWatching: "A VER",
        statusReading: "A LER",
        statusCompleted: "CONCLUÍDO",
        statusOnHold: "EM ESPERA",
        statusDropped: "ABANDONADO",
        statusPlanned: "PLANEADO",

        welcomeTitle: "Bem-vindo ao MAL Highlighter",
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
                resolve(res.extensionLang || ((chrome.i18n && chrome.i18n.getUILanguage().toLowerCase().startsWith('pt')) ? 'pt' : 'en'));
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
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            el.placeholder = this.get(el.getAttribute('data-i18n-placeholder'), lang);
        });
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            el.title = this.get(el.getAttribute('data-i18n-title'), lang);
        });
    }
}