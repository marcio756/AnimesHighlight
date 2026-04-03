// src/popup/main.js

/**
 * Main Controller for Popup
 * @description Orchestrates user settings, storage, I18n translations, and logic integration using Services.
 */
import { I18nService } from '../common/i18n.js';
import { PopupUI, ProgressService } from './ui.js';
import { StorageService } from './services/storage.service.js';
import { ApiService } from './services/api.service.js';

document.addEventListener('DOMContentLoaded', async () => {
    chrome.action.setBadgeText({ text: "" });
    chrome.storage.local.set({ unreadCount: 0 });

    let currentLang = await I18nService.getCurrentLang();
    I18nService.translateDOM(currentLang);

    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const tabs = document.querySelectorAll('.tab-btn');
    const panes = document.querySelectorAll('.tab-pane');
    
    // Elementos do Perfil
    const inputUser = document.getElementById('username');
    const saveProfileBtn = document.getElementById('saveBtn');
    const statusProfile = document.getElementById('statusProfile');
    const profileArea = document.getElementById('profileArea');
    const profileSkeleton = document.getElementById('profileSkeleton');
    const avatar = document.getElementById('avatar');
    const welcomeText = document.getElementById('welcomeText');

    // Elementos do Monitor
    const inputNewSiteUrl = document.getElementById('newSiteUrl');
    const addSiteBtn = document.getElementById('addSiteBtn');
    const monitoredSitesList = document.getElementById('monitoredSitesList');
    const emptySitesState = document.getElementById('emptySitesState');
    const statusMonitor = document.getElementById('statusMonitor');

    // Elementos do Histórico
    const notifListEl = document.getElementById('notificationList');
    const emptyStateEl = document.getElementById('emptyState');
    const clearNotifsBtn = document.getElementById('clearNotifsBtn');
    const historyFilterWrapper = document.getElementById('historyFilterWrapper');
    const historyFilterTrigger = document.getElementById('historyFilterTrigger');
    const historyFilterLabel = document.getElementById('historyFilterLabel');
    const historyFilterOptions = document.getElementById('historyFilterOptions');
    let currentFilterValue = 'all'; 

    // Elementos de Definições
    const langSelect = document.getElementById('langSelect');
    const checkPanelEnabled = document.getElementById('panelEnabled');
    const checkPanelTrans = document.getElementById('panelTransparent');
    const checkSavePanelPos = document.getElementById('savePanelPos');
    const checkAutoUpdate = document.getElementById('autoUpdateProgress');
    const hlStatusCheckboxes = document.querySelectorAll('.hl-status');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const statusSettings = document.getElementById('statusSettings');
    const syncStatusText = document.getElementById('syncStatusText');
    const syncActionBtn = document.getElementById('syncActionBtn');
    const syncWarningBox = document.getElementById('syncWarningBox');

    const colorPickers = {
        1: document.getElementById('color1'), 2: document.getElementById('color2'),
        3: document.getElementById('color3'), 4: document.getElementById('color4'),
        6: document.getElementById('color6')
    };

    let globalSites = [];
    let globalLogs = [];

    // --- Configuração de UI e Eventos Iniciais ---

    const iconSun = `<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
    const iconMoon = `<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;

    const updateThemeIcon = () => {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        themeToggleBtn.innerHTML = isDark ? iconSun : iconMoon;
    };
    updateThemeIcon();

    themeToggleBtn.addEventListener('click', () => {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const newTheme = isDark ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        updateThemeIcon();
        StorageService.saveSettings({ theme: newTheme });
    });

    historyFilterTrigger.addEventListener('click', () => historyFilterWrapper.classList.toggle('open'));
    document.addEventListener('click', (e) => {
        if (historyFilterWrapper && !historyFilterWrapper.contains(e.target)) historyFilterWrapper.classList.remove('open');
    });

    const updateFilter = () => {
        PopupUI.updateSiteFilterDropdown(globalSites, historyFilterOptions, historyFilterLabel, currentLang, currentFilterValue, (newVal) => {
            currentFilterValue = newVal;
            historyFilterWrapper.classList.remove('open');
            renderLogs();
            updateFilter(); 
        });
    };

    const syncColorVisibility = () => {
        hlStatusCheckboxes.forEach(cb => {
            const statusId = cb.value;
            const colorRow = document.getElementById(`color-row-${statusId}`);
            if (colorRow) colorRow.style.display = cb.checked ? 'flex' : 'none';
        });
    };
    hlStatusCheckboxes.forEach(cb => cb.addEventListener('change', syncColorVisibility));

    // --- Lógica de Estado (State Management) ---

    const saveSitesState = async (triggerAlarmRefresh = true) => {
        await StorageService.saveSites(globalSites);
        PopupUI.renderSitesList(globalSites, monitoredSitesList, emptySitesState, siteActionCallbacks);
        updateFilter(); 
        if (triggerAlarmRefresh) ApiService.triggerMonitorUpdate();
    };

    const siteActionCallbacks = {
        onToggle: (id, isEnabled) => {
            const site = globalSites.find(s => s.id === id);
            if (site) { site.enabled = isEnabled; saveSitesState(); }
        },
        onDelete: (id) => {
            globalSites = globalSites.filter(s => s.id !== id);
            saveSitesState();
        }
    };

    const renderLogs = () => {
        PopupUI.renderNotifications(globalLogs, notifListEl, emptyStateEl, clearNotifsBtn, currentFilterValue, currentLang, async (updatedLogs) => {
            globalLogs = updatedLogs;
            await StorageService.saveLogs(globalLogs);
            renderLogs();
        });
    };

    const loadCoreData = async () => {
        const data = await StorageService.getCoreData();
        globalSites = data.sites;
        globalLogs = data.logs;
        
        PopupUI.renderSitesList(globalSites, monitoredSitesList, emptySitesState, siteActionCallbacks);
        updateFilter(); 
        renderLogs();
        PopupUI.renderAlarmFeedback('nextCheckDisplay', currentLang);
    };

    // --- Inicialização ---

    PopupUI.initTabs(tabs, panes, loadCoreData, loadCoreData);
    PopupUI.initSettingsAccordions(); 

    const applySettingsToUI = (res) => {
        if (res.malUsername) {
            inputUser.value = res.malUsername;
            if (res.malAvatar) PopupUI.showProfile(res.malUsername, res.malAvatar, avatar, welcomeText, profileArea, profileSkeleton, currentLang);
        }
        if (res.extensionLang) langSelect.value = res.extensionLang;
        if (res.panelEnabled !== undefined) checkPanelEnabled.checked = res.panelEnabled;
        if (res.panelTransparent !== undefined) checkPanelTrans.checked = res.panelTransparent;
        if (res.savePanelPos !== undefined) checkSavePanelPos.checked = res.savePanelPos;
        if (res.autoUpdateProgress !== undefined) checkAutoUpdate.checked = res.autoUpdateProgress;
        
        if (res.highlightStatuses) hlStatusCheckboxes.forEach(cb => cb.checked = res.highlightStatuses.includes(parseInt(cb.value)));
        if (res.customColors) {
            Object.keys(colorPickers).forEach(id => {
                if (res.customColors[id]) colorPickers[id].value = res.customColors[id];
            });
        }
        syncColorVisibility();
    };

    StorageService.getSettings().then(res => {
        applySettingsToUI(res);
        loadCoreData();
    });

    // --- Sincronização Cloud ---

    const updateSyncUI = (isLoggedIn, email) => {
        if (isLoggedIn) {
            syncStatusText.removeAttribute('data-i18n');
            syncStatusText.innerText = email || I18nService.get('syncLoggedIn', currentLang);
            syncStatusText.style.color = '#48bb78'; 
            
            syncActionBtn.setAttribute('data-i18n', 'btnLogout');
            syncActionBtn.innerText = I18nService.get('btnLogout', currentLang);
            syncActionBtn.className = "action-btn btn-danger";
            syncWarningBox.style.display = 'none'; 
        } else {
            syncStatusText.setAttribute('data-i18n', 'syncNotLoggedIn');
            syncStatusText.innerText = I18nService.get('syncNotLoggedIn', currentLang);
            syncStatusText.style.color = 'var(--text-muted)';
            
            syncActionBtn.setAttribute('data-i18n', 'btnLogin');
            syncActionBtn.innerText = I18nService.get('btnLogin', currentLang);
            syncActionBtn.className = "action-btn";
            syncWarningBox.style.display = 'block'; 
        }
    };

    chrome.runtime.sendMessage({ action: "GET_SYNC_STATUS" }, (res) => {
        updateSyncUI(res && res.loggedIn, res?.email);
    });

    syncActionBtn.addEventListener('click', () => {
        ProgressService.start();
        const action = syncActionBtn.getAttribute('data-i18n') === 'btnLogout' ? "SYNC_LOGOUT" : "SYNC_LOGIN";
        syncActionBtn.innerText = "...";
        
        chrome.runtime.sendMessage({ action }, (res) => {
            updateSyncUI(res && res.success && action === "SYNC_LOGIN", res?.email);
            ProgressService.stop();
        });
    });

    // --- Manipulação de Eventos de Ação (Clicks e Submits) ---

    addSiteBtn.addEventListener('click', () => {
        const urlRaw = inputNewSiteUrl.value.trim();
        if (!urlRaw) return;

        try {
            const urlObj = new URL(urlRaw.startsWith('http') ? urlRaw : `https://${urlRaw}`);
            const formattedUrl = urlObj.href;
            
            if (globalSites.some(s => s.url === formattedUrl)) {
                return PopupUI.updateStatus(statusMonitor, I18nService.get('siteExists', currentLang), "error");
            }

            globalSites.push({ id: 'temp', isSkeleton: true });
            PopupUI.renderSitesList(globalSites, monitoredSitesList, emptySitesState, siteActionCallbacks);
            inputNewSiteUrl.value = "";

            setTimeout(() => {
                globalSites = globalSites.filter(s => s.id !== 'temp');
                globalSites.push({
                    id: Date.now().toString(),
                    url: formattedUrl,
                    name: urlObj.hostname.replace('www.', ''),
                    enabled: true
                });
                saveSitesState();
            }, 400);
        } catch (e) {
            PopupUI.updateStatus(statusMonitor, I18nService.get('statusErrorUrl', currentLang), "error");
        }
    });

    inputNewSiteUrl.addEventListener('keypress', (e) => { if (e.key === 'Enter') addSiteBtn.click(); });

    saveSettingsBtn.addEventListener('click', async () => {
        saveSettingsBtn.innerText = "...";
        saveSettingsBtn.disabled = true;

        const activeHighlights = Array.from(hlStatusCheckboxes).filter(cb => cb.checked).map(cb => parseInt(cb.value));
        const activeColors = {
            1: colorPickers[1].value, 2: colorPickers[2].value,
            3: colorPickers[3].value, 4: colorPickers[4].value, 6: colorPickers[6].value
        };

        const settings = {
            extensionLang: langSelect.value, 
            panelEnabled: checkPanelEnabled.checked, 
            panelTransparent: checkPanelTrans.checked,
            savePanelPos: checkSavePanelPos.checked, 
            autoUpdateProgress: checkAutoUpdate.checked, 
            highlightStatuses: activeHighlights, 
            customColors: activeColors
        };

        await StorageService.saveSettings(settings);
        
        currentLang = langSelect.value;
        I18nService.translateDOM(currentLang); 
        updateFilter(); 
        
        PopupUI.updateStatus(statusSettings, I18nService.get('statusSaved', currentLang), "success");
        saveSettingsBtn.innerText = I18nService.get('btnSaveSettings', currentLang);
        saveSettingsBtn.disabled = false;
    });

    clearNotifsBtn.addEventListener('click', async () => {
        if(confirm(I18nService.get('confirmClear', currentLang))) {
            globalLogs = [];
            await StorageService.clearLogs();
            renderLogs();
        }
    });

    saveProfileBtn.addEventListener('click', async () => {
        const username = inputUser.value.trim();
        if (!username) return;

        PopupUI.updateStatus(statusProfile, I18nService.get('statusChecking', currentLang), "");
        saveProfileBtn.disabled = true;
        profileArea.style.display = 'none';
        profileSkeleton.style.display = 'flex';
        ProgressService.start();

        try {
            const imageUrl = await ApiService.verifyMalUser(username);
            const malResponse = await ApiService.syncMalList(username);

            ProgressService.stop();
            if (malResponse && malResponse.success) {
                await StorageService.saveUserProfile(username, imageUrl);
                PopupUI.updateStatus(statusProfile, I18nService.get('statusSaved', currentLang), "success");
                PopupUI.showProfile(username, imageUrl, avatar, welcomeText, profileArea, profileSkeleton, currentLang);
                saveProfileBtn.disabled = false;
                localStorage.removeItem('mal_v35_full_list'); 
            } else {
                throw new Error('Falha ao sincronizar lista');
            }
        } catch (error) {
            ProgressService.stop();
            profileSkeleton.style.display = 'none';
            PopupUI.updateStatus(statusProfile, I18nService.get('statusErrorUser', currentLang), "error");
            saveProfileBtn.disabled = false;
        }
    });
});