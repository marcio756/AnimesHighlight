document.addEventListener('DOMContentLoaded', () => {
    // UI References
    const tabs = document.querySelectorAll('.tab-btn');
    const panes = document.querySelectorAll('.tab-pane');
    
    // Profile Logic
    const inputUser = document.getElementById('username');
    const saveProfileBtn = document.getElementById('saveBtn');
    const statusProfile = document.getElementById('statusProfile');
    const profileArea = document.getElementById('profileArea');
    const avatar = document.getElementById('avatar');
    const welcomeText = document.getElementById('welcomeText');

    // Monitor Logic
    const inputUrl = document.getElementById('monitorUrl');
    const checkEnabled = document.getElementById('monitorEnabled');
    const saveMonitorBtn = document.getElementById('saveMonitorBtn');
    const statusMonitor = document.getElementById('statusMonitor');

    // --- TABS NAVIGATION ---
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            panes.forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(tab.dataset.tab).classList.add('active');
        });
    });

    // --- INITIALIZATION ---
    chrome.storage.local.get(['malUsername', 'malAvatar', 'monitorUrl', 'monitorEnabled'], (res) => {
        // Init Profile
        if (res.malUsername) {
            inputUser.value = res.malUsername;
            if (res.malAvatar) showProfile(res.malUsername, res.malAvatar);
        }
        // Init Monitor
        if (res.monitorUrl) inputUrl.value = res.monitorUrl;
        if (res.monitorEnabled !== undefined) checkEnabled.checked = res.monitorEnabled;
    });

    // --- PROFILE ACTIONS ---
    saveProfileBtn.addEventListener('click', async () => {
        const username = inputUser.value.trim();
        if (!username) return;

        updateStatus(statusProfile, "Verifying...", "");
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
                        updateStatus(statusProfile, "Saved successfully!", "success");
                        showProfile(username, imageUrl);
                        saveProfileBtn.disabled = false;
                        
                        // Clear caches
                        localStorage.removeItem('mal_v31_full_list'); 
                    });
                } else {
                    updateStatus(statusProfile, "Profile is private or API error.", "error");
                    saveProfileBtn.disabled = false;
                }
            });
        } catch (error) {
            updateStatus(statusProfile, "User not found.", "error");
            saveProfileBtn.disabled = false;
        }
    });

    // --- MONITOR ACTIONS ---
    saveMonitorBtn.addEventListener('click', () => {
        const url = inputUrl.value.trim();
        const enabled = checkEnabled.checked;
        
        if (enabled && !isValidUrl(url)) {
            updateStatus(statusMonitor, "Please enter a valid URL (http/https).", "error");
            return;
        }

        chrome.storage.local.set({ monitorUrl: url, monitorEnabled: enabled }, () => {
            updateStatus(statusMonitor, "Settings saved!", "success");
            
            // Notify Background to restart/stop alarms
            chrome.runtime.sendMessage({ action: "UPDATE_MONITORING" });
        });
    });

    // --- HELPERS ---
    function showProfile(name, imgUrl) {
        avatar.src = imgUrl;
        welcomeText.innerText = `Hello, ${name}!`;
        profileArea.style.display = 'block';
    }

    function updateStatus(element, msg, type) {
        element.innerText = msg;
        element.className = "status " + type;
    }

    function isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    }
});