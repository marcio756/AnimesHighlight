/**
 * Main Controller for Popup
 * @description Orchestrates user settings, storage, I18n translations, and interactive UI states.
 */
document.addEventListener('DOMContentLoaded', async () => {
    // RESET BADGE ON OPEN (UX Best Practice)
    chrome.action.setBadgeText({ text: "" });
    chrome.storage.local.set({ unreadCount: 0 });

    let currentLang = await I18nService.getCurrentLang();
    I18nService.translateDOM(currentLang);

    // Doms References - Tabs
    const tabs = document.querySelectorAll('.tab-btn');
    const panes = document.querySelectorAll('.tab-pane');
    
    // Feature: Profile
    const inputUser = document.getElementById('username');
    const saveProfileBtn = document.getElementById('saveBtn');
    const statusProfile = document.getElementById('statusProfile');
    const profileArea = document.getElementById('profileArea');
    const avatar = document.getElementById('avatar');
    const welcomeText = document.getElementById('welcomeText');

    // Feature: Monitor
    const inputUrl = document.getElementById('monitorUrl');
    const checkEnabled = document.getElementById('monitorEnabled');
    const saveMonitorBtn = document.getElementById('saveMonitorBtn');
    const statusMonitor = document.getElementById('statusMonitor');

    // Feature: History
    const notifListEl = document.getElementById('notificationList');
    const emptyStateEl = document.getElementById('emptyState');
    const clearNotifsBtn = document.getElementById('clearNotifsBtn');

    // Feature: Settings
    const langSelect = document.getElementById('langSelect');
    const checkPanelEnabled = document.getElementById('panelEnabled');
    const checkPanelTrans = document.getElementById('panelTransparent');
    const checkSavePanelPos = document.getElementById('savePanelPos');
    const hlStatusCheckboxes = document.querySelectorAll('.hl-status');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const statusSettings = document.getElementById('statusSettings');

    // Features: Colors
    const colorPickers = {
        1: document.getElementById('color1'),
        2: document.getElementById('color2'),
        3: document.getElementById('color3'),
        4: document.getElementById('color4'),
        6: document.getElementById('color6')
    };

    // ==========================================
    // UI Interactions: Accordions & Dynamic Rows
    // ==========================================
    
    // Collapsible Sections (Accordions)
    document.querySelectorAll('.settings-header').forEach(header => {
        header.addEventListener('click', () => {
            const card = header.parentElement;
            card.classList.toggle('collapsed');
        });
    });

    // Dynamic Visibility for Colors based on Highlight Status
    const syncColorVisibility = () => {
        hlStatusCheckboxes.forEach(cb => {
            const statusId = cb.value;
            const colorRow = document.getElementById(`color-row-${statusId}`);
            if (colorRow) {
                // Se a checkbox estiver inativa, esconde o row da cor correspondente
                colorRow.style.display = cb.checked ? 'flex' : 'none';
            }
        });
    };

    // Escutar por mudanças nas checkboxes em tempo real
    hlStatusCheckboxes.forEach(cb => {
        cb.addEventListener('change', syncColorVisibility);
    });

    // ==========================================
    // Core Logic Initialization
    // ==========================================

    const loadNotifications = () => {
        chrome.storage.local.get('notificationLog', (result) => {
            PopupUI.renderNotifications(result.notificationLog || [], notifListEl, emptyStateEl, clearNotifsBtn);
        });
    };
    const loadMonitorFeedback = () => {
        PopupUI.renderAlarmFeedback('nextCheckDisplay', currentLang);
    };

    PopupUI.initTabs(tabs, panes, loadNotifications, loadMonitorFeedback);

    // Initial Storage Load
    chrome.storage.local.get([
        'malUsername', 'malAvatar', 'monitorUrl', 'monitorEnabled', 
        'extensionLang', 'panelEnabled', 'panelTransparent', 'savePanelPos', 'highlightStatuses', 'customColors'
    ], (res) => {
        if (res.malUsername) {
            inputUser.value = res.malUsername;
            if (res.malAvatar) PopupUI.showProfile(res.malUsername, res.malAvatar, avatar, welcomeText, profileArea);
        }
        if (res.monitorUrl) inputUrl.value = res.monitorUrl;
        if (res.monitorEnabled !== undefined) {
            checkEnabled.checked = res.monitorEnabled;
            if (res.monitorEnabled) loadMonitorFeedback();
        }
        if (res.extensionLang) langSelect.value = res.extensionLang;
        
        if (res.panelEnabled !== undefined) checkPanelEnabled.checked = res.panelEnabled;
        if (res.panelTransparent !== undefined) checkPanelTrans.checked = res.panelTransparent;
        if (res.savePanelPos !== undefined) checkSavePanelPos.checked = res.savePanelPos;
        
        if (res.highlightStatuses) {
            hlStatusCheckboxes.forEach(cb => {
                cb.checked = res.highlightStatuses.includes(parseInt(cb.value));
            });
        }

        if (res.customColors) {
            Object.keys(colorPickers).forEach(id => {
                if (res.customColors[id]) colorPickers[id].value = res.customColors[id];
            });
        }

        // Aplicar a lógica visual dinâmica após preencher os dados gravados
        syncColorVisibility();
    });

    // Profile Save Flow
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

    // Monitor Save Flow
    saveMonitorBtn.addEventListener('click', () => {
        const url = inputUrl.value.trim();
        const enabled = checkEnabled.checked;
        
        const isValidUrl = (string) => { try { new URL(string); return true; } catch (_) { return false; } };

        if (enabled && !isValidUrl(url)) {
            PopupUI.updateStatus(statusMonitor, I18nService.get('statusErrorUrl', currentLang), "error");
            return;
        }

        chrome.storage.local.set({ monitorUrl: url, monitorEnabled: enabled }, () => {
            PopupUI.updateStatus(statusMonitor, I18nService.get('statusSaved', currentLang), "success");
            chrome.runtime.sendMessage({ action: "UPDATE_MONITORING" });
            if (enabled) loadMonitorFeedback();
        });
    });

    // Settings Save Flow
    saveSettingsBtn.addEventListener('click', () => {
        const selectedLang = langSelect.value;
        const pEnabled = checkPanelEnabled.checked;
        const pTrans = checkPanelTrans.checked;
        const sPos = checkSavePanelPos.checked;

        const activeHighlights = Array.from(hlStatusCheckboxes)
                                    .filter(cb => cb.checked)
                                    .map(cb => parseInt(cb.value));

        const activeColors = {
            1: colorPickers[1].value,
            2: colorPickers[2].value,
            3: colorPickers[3].value,
            4: colorPickers[4].value,
            6: colorPickers[6].value
        };

        chrome.storage.local.set({ 
            extensionLang: selectedLang,
            panelEnabled: pEnabled,
            panelTransparent: pTrans,
            savePanelPos: sPos,
            highlightStatuses: activeHighlights,
            customColors: activeColors
        }, () => {
            currentLang = selectedLang;
            I18nService.translateDOM(currentLang); 
            PopupUI.updateStatus(statusSettings, I18nService.get('statusSaved', currentLang), "success");
            
            if (emptyStateEl.style.display === 'block') {
                emptyStateEl.innerText = I18nService.get('emptyHistory', currentLang);
            }
        });
    });

    // Notifications Clear Flow
    clearNotifsBtn.addEventListener('click', () => {
        const msg = I18nService.get('confirmClear', currentLang);
        if(confirm(msg)) {
            chrome.storage.local.set({ notificationLog: [] }, () => loadNotifications());
        }
    });
});