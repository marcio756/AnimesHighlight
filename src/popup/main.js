/**
 * Main Controller for Popup
 * @description Orchestrates user settings, storage, I18n translations, and Multi-Site logic.
 */
import { I18nService } from '../common/i18n.js';
import { PopupUI } from './ui.js';

document.addEventListener('DOMContentLoaded', async () => {
    chrome.action.setBadgeText({ text: "" });
    chrome.storage.local.set({ unreadCount: 0 });

    let currentLang = await I18nService.getCurrentLang();
    I18nService.translateDOM(currentLang);

    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const tabs = document.querySelectorAll('.tab-btn');
    const panes = document.querySelectorAll('.tab-pane');
    
    const inputUser = document.getElementById('username');
    const saveProfileBtn = document.getElementById('saveBtn');
    const statusProfile = document.getElementById('statusProfile');
    const profileArea = document.getElementById('profileArea');
    const avatar = document.getElementById('avatar');
    const welcomeText = document.getElementById('welcomeText');

    const inputNewSiteUrl = document.getElementById('newSiteUrl');
    const addSiteBtn = document.getElementById('addSiteBtn');
    const monitoredSitesList = document.getElementById('monitoredSitesList');
    const emptySitesState = document.getElementById('emptySitesState');
    const statusMonitor = document.getElementById('statusMonitor');

    const notifListEl = document.getElementById('notificationList');
    const emptyStateEl = document.getElementById('emptyState');
    const clearNotifsBtn = document.getElementById('clearNotifsBtn');
    const historySiteFilter = document.getElementById('historySiteFilter');

    const langSelect = document.getElementById('langSelect');
    const checkPanelEnabled = document.getElementById('panelEnabled');
    const checkPanelTrans = document.getElementById('panelTransparent');
    const checkSavePanelPos = document.getElementById('savePanelPos');
    const checkAutoUpdate = document.getElementById('autoUpdateProgress');
    const hlStatusCheckboxes = document.querySelectorAll('.hl-status');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const statusSettings = document.getElementById('statusSettings');

    const colorPickers = {
        1: document.getElementById('color1'), 2: document.getElementById('color2'),
        3: document.getElementById('color3'), 4: document.getElementById('color4'),
        6: document.getElementById('color6')
    };

    let globalSites = [];
    let globalLogs = [];

    const updateThemeIcon = () => {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        themeToggleBtn.innerText = isDark ? '☀️' : '🌙';
    };
    updateThemeIcon();

    themeToggleBtn.addEventListener('click', () => {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const newTheme = isDark ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        updateThemeIcon();
        chrome.storage.local.set({ theme: newTheme });
    });

    const syncColorVisibility = () => {
        hlStatusCheckboxes.forEach(cb => {
            const statusId = cb.value;
            const colorRow = document.getElementById(`color-row-${statusId}`);
            if (colorRow) colorRow.style.display = cb.checked ? 'flex' : 'none';
        });
    };
    hlStatusCheckboxes.forEach(cb => cb.addEventListener('change', syncColorVisibility));

    const saveSitesState = (triggerAlarmRefresh = true) => {
        chrome.storage.local.set({ monitoredSites: globalSites }, () => {
            PopupUI.renderSitesList(globalSites, monitoredSitesList, emptySitesState, siteActionCallbacks);
            PopupUI.updateSiteFilterDropdown(globalSites, historySiteFilter, currentLang);
            if (triggerAlarmRefresh) chrome.runtime.sendMessage({ action: "UPDATE_MONITORING" });
        });
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
        PopupUI.renderNotifications(globalLogs, notifListEl, emptyStateEl, clearNotifsBtn, historySiteFilter.value, (updatedLogs) => {
            globalLogs = updatedLogs;
            chrome.storage.local.set({ notificationLog: globalLogs }, () => renderLogs());
        });
    };

    const loadCoreData = () => {
        chrome.storage.local.get(['notificationLog', 'monitoredSites'], (result) => {
            globalSites = result.monitoredSites || [];
            globalLogs = result.notificationLog || [];
            
            PopupUI.renderSitesList(globalSites, monitoredSitesList, emptySitesState, siteActionCallbacks);
            PopupUI.updateSiteFilterDropdown(globalSites, historySiteFilter, currentLang);
            renderLogs();
            PopupUI.renderAlarmFeedback('nextCheckDisplay', currentLang);
        });
    };

    PopupUI.initTabs(tabs, panes, loadCoreData, loadCoreData);

    chrome.storage.local.get([
        'malUsername', 'malAvatar', 'extensionLang', 
        'panelEnabled', 'panelTransparent', 'savePanelPos', 'autoUpdateProgress', 'highlightStatuses', 'customColors'
    ], (res) => {
        if (res.malUsername) {
            inputUser.value = res.malUsername;
            if (res.malAvatar) PopupUI.showProfile(res.malUsername, res.malAvatar, avatar, welcomeText, profileArea);
        }
        if (res.extensionLang) langSelect.value = res.extensionLang;
        if (res.panelEnabled !== undefined) checkPanelEnabled.checked = res.panelEnabled;
        if (res.panelTransparent !== undefined) checkPanelTrans.checked = res.panelTransparent;
        if (res.savePanelPos !== undefined) checkSavePanelPos.checked = res.savePanelPos;
        if (res.autoUpdateProgress !== undefined) checkAutoUpdate.checked = res.autoUpdateProgress;
        
        if (res.highlightStatuses) {
            hlStatusCheckboxes.forEach(cb => cb.checked = res.highlightStatuses.includes(parseInt(cb.value)));
        }
        if (res.customColors) {
            Object.keys(colorPickers).forEach(id => {
                if (res.customColors[id]) colorPickers[id].value = res.customColors[id];
            });
        }
        syncColorVisibility();
        loadCoreData(); 
    });

    addSiteBtn.addEventListener('click', () => {
        const urlRaw = inputNewSiteUrl.value.trim();
        if (!urlRaw) return;

        let formattedUrl;
        try {
            const urlObj = new URL(urlRaw.startsWith('http') ? urlRaw : `https://${urlRaw}`);
            formattedUrl = urlObj.href;
            const siteName = urlObj.hostname.replace('www.', '');

            if (globalSites.some(s => s.url === formattedUrl)) {
                PopupUI.updateStatus(statusMonitor, "Site already exists.", "error");
                return;
            }

            globalSites.push({ id: 'temp', isSkeleton: true });
            PopupUI.renderSitesList(globalSites, monitoredSitesList, emptySitesState, siteActionCallbacks);
            inputNewSiteUrl.value = "";

            setTimeout(() => {
                globalSites = globalSites.filter(s => s.id !== 'temp');
                globalSites.push({
                    id: Date.now().toString(),
                    url: formattedUrl,
                    name: siteName,
                    enabled: true
                });
                saveSitesState();
            }, 500);

        } catch (e) {
            PopupUI.updateStatus(statusMonitor, I18nService.get('statusErrorUrl', currentLang), "error");
        }
    });

    inputNewSiteUrl.addEventListener('keypress', (e) => { if (e.key === 'Enter') addSiteBtn.click(); });
    historySiteFilter.addEventListener('change', () => renderLogs());

    saveSettingsBtn.addEventListener('click', () => {
        const selectedLang = langSelect.value;
        const pEnabled = checkPanelEnabled.checked;
        const pTrans = checkPanelTrans.checked;
        const sPos = checkSavePanelPos.checked;
        const aUpdate = checkAutoUpdate.checked;

        const activeHighlights = Array.from(hlStatusCheckboxes).filter(cb => cb.checked).map(cb => parseInt(cb.value));
        const activeColors = {
            1: colorPickers[1].value, 2: colorPickers[2].value,
            3: colorPickers[3].value, 4: colorPickers[4].value, 6: colorPickers[6].value
        };

        chrome.storage.local.set({ 
            extensionLang: selectedLang, panelEnabled: pEnabled, panelTransparent: pTrans,
            savePanelPos: sPos, autoUpdateProgress: aUpdate, highlightStatuses: activeHighlights, customColors: activeColors
        }, () => {
            currentLang = selectedLang;
            I18nService.translateDOM(currentLang); 
            PopupUI.updateSiteFilterDropdown(globalSites, historySiteFilter, currentLang); 
            PopupUI.updateStatus(statusSettings, I18nService.get('statusSaved', currentLang), "success");
        });
    });

    clearNotifsBtn.addEventListener('click', () => {
        if(confirm(I18nService.get('confirmClear', currentLang))) {
            globalLogs = [];
            chrome.storage.local.set({ notificationLog: [] }, () => renderLogs());
        }
    });

    saveProfileBtn.addEventListener('click', async () => {
        const username = inputUser.value.trim();
        if (!username) return;

        PopupUI.updateStatus(statusProfile, I18nService.get('statusChecking', currentLang), "");
        saveProfileBtn.disabled = true;
        profileArea.style.display = 'none';

        try {
            const response = await fetch(`https://api.jikan.moe/v4/users/${username}`);
            if (!response.ok) throw new Error('User not found');
            const data = await response.json();
            const imageUrl = data.data.images.jpg.image_url;

            chrome.runtime.sendMessage({ action: "FETCH_MAL_LIST", username: username }, (malResponse) => {
                if (malResponse && malResponse.success) {
                    chrome.storage.local.set({ malUsername: username, malAvatar: imageUrl }, () => {
                        PopupUI.updateStatus(statusProfile, I18nService.get('statusSaved', currentLang), "success");
                        PopupUI.showProfile(username, imageUrl, avatar, welcomeText, profileArea);
                        saveProfileBtn.disabled = false;
                        localStorage.removeItem('mal_v35_full_list'); 
                    });
                } else {
                    PopupUI.updateStatus(statusProfile, I18nService.get('statusErrorUser', currentLang), "error");
                    saveProfileBtn.disabled = false;
                }
            });
        } catch (error) {
            PopupUI.updateStatus(statusProfile, I18nService.get('statusErrorUser', currentLang), "error");
            saveProfileBtn.disabled = false;
        }
    });
});