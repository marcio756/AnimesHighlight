/**
 * Main Controller for Popup
 * @description Orchestrates user settings, storage, and I18n translations.
 */
document.addEventListener('DOMContentLoaded', async () => {
    let currentLang = await I18nService.getCurrentLang();
    I18nService.translateDOM(currentLang);

    // Doms References
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
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const statusSettings = document.getElementById('statusSettings');

    // Init UI Tabs
    const loadNotifications = () => {
        chrome.storage.local.get('notificationLog', (result) => {
            PopupUI.renderNotifications(result.notificationLog || [], notifListEl, emptyStateEl, clearNotifsBtn);
        });
    };
    PopupUI.initTabs(tabs, panes, loadNotifications);

    // Initial Storage Load
    chrome.storage.local.get([
        'malUsername', 'malAvatar', 'monitorUrl', 'monitorEnabled', 
        'extensionLang', 'panelEnabled', 'panelTransparent'
    ], (res) => {
        if (res.malUsername) {
            inputUser.value = res.malUsername;
            if (res.malAvatar) PopupUI.showProfile(res.malUsername, res.malAvatar, avatar, welcomeText, profileArea);
        }
        if (res.monitorUrl) inputUrl.value = res.monitorUrl;
        if (res.monitorEnabled !== undefined) checkEnabled.checked = res.monitorEnabled;
        if (res.extensionLang) langSelect.value = res.extensionLang;
        
        if (res.panelEnabled !== undefined) checkPanelEnabled.checked = res.panelEnabled;
        if (res.panelTransparent !== undefined) checkPanelTrans.checked = res.panelTransparent;
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
        });
    });

    // Settings Save Flow
    saveSettingsBtn.addEventListener('click', () => {
        const selectedLang = langSelect.value;
        const pEnabled = checkPanelEnabled.checked;
        const pTrans = checkPanelTrans.checked;

        chrome.storage.local.set({ 
            extensionLang: selectedLang,
            panelEnabled: pEnabled,
            panelTransparent: pTrans
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