document.addEventListener('DOMContentLoaded', () => {
    // UI References
    const tabs = document.querySelectorAll('.tab-btn');
    const panes = document.querySelectorAll('.tab-pane');
    
    // Profile
    const inputUser = document.getElementById('username');
    const saveProfileBtn = document.getElementById('saveBtn');
    const statusProfile = document.getElementById('statusProfile');
    const profileArea = document.getElementById('profileArea');
    const avatar = document.getElementById('avatar');
    const welcomeText = document.getElementById('welcomeText');

    // Monitor
    const inputUrl = document.getElementById('monitorUrl');
    const checkEnabled = document.getElementById('monitorEnabled');
    const saveMonitorBtn = document.getElementById('saveMonitorBtn');
    const statusMonitor = document.getElementById('statusMonitor');

    // Notifications
    const notifListEl = document.getElementById('notificationList');
    const emptyStateEl = document.getElementById('emptyState');
    const clearNotifsBtn = document.getElementById('clearNotifsBtn');

    // --- TABS ---
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            panes.forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            
            const targetId = tab.dataset.tab;
            document.getElementById(targetId).classList.add('active');

            if (targetId === 'tab-notifications') {
                loadNotifications();
            }
        });
    });

    // --- INIT ---
    chrome.storage.local.get(['malUsername', 'malAvatar', 'monitorUrl', 'monitorEnabled'], (res) => {
        if (res.malUsername) {
            inputUser.value = res.malUsername;
            if (res.malAvatar) showProfile(res.malUsername, res.malAvatar);
        }
        if (res.monitorUrl) inputUrl.value = res.monitorUrl;
        if (res.monitorEnabled !== undefined) checkEnabled.checked = res.monitorEnabled;
    });

    // --- PROFILE LOGIC ---
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

    // --- MONITOR LOGIC ---
    saveMonitorBtn.addEventListener('click', () => {
        const url = inputUrl.value.trim();
        const enabled = checkEnabled.checked;
        
        if (enabled && !isValidUrl(url)) {
            updateStatus(statusMonitor, "Please enter a valid URL.", "error");
            return;
        }

        chrome.storage.local.set({ monitorUrl: url, monitorEnabled: enabled }, () => {
            updateStatus(statusMonitor, "Settings saved!", "success");
            chrome.runtime.sendMessage({ action: "UPDATE_MONITORING" });
        });
    });

    // --- NOTIFICATIONS LOGIC ---
    function loadNotifications() {
        chrome.storage.local.get('notificationLog', (result) => {
            const logs = result.notificationLog || [];
            
            notifListEl.innerHTML = '';
            
            if (logs.length === 0) {
                emptyStateEl.style.display = 'block';
                clearNotifsBtn.disabled = true;
                return;
            }

            emptyStateEl.style.display = 'none';
            clearNotifsBtn.disabled = false;

            logs.forEach(log => {
                const dateObj = new Date(log.date);
                const dateStr = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                
                let title = log.text;
                let ep = "";
                
                if (log.text.includes(' - ')) {
                    const parts = log.text.split(' - ');
                    title = parts[0];
                    ep = parts[1];
                }

                const li = document.createElement('li');
                li.className = 'notif-item';
                
                // CLICK ACTION: Abre o site monitorizado
                li.addEventListener('click', () => {
                    chrome.storage.local.get('monitorUrl', (res) => {
                        if (res.monitorUrl) {
                            chrome.tabs.create({ url: res.monitorUrl });
                        } else {
                            alert("Monitor URL not found in settings.");
                        }
                    });
                });

                li.innerHTML = `
                    <div class="notif-header">
                        <span class="notif-title">${escapeHtml(title)}</span>
                        <span class="notif-date">${dateStr}</span>
                    </div>
                    ${ep ? `<div class="notif-ep">${escapeHtml(ep)}</div>` : ''}
                `;
                notifListEl.appendChild(li);
            });
        });
    }

    clearNotifsBtn.addEventListener('click', () => {
        if(confirm("Clear all history?")) {
            chrome.storage.local.set({ notificationLog: [] }, () => loadNotifications());
        }
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
        try { new URL(string); return true; } catch (_) { return false; }
    }

    function escapeHtml(text) {
        if (!text) return text;
        return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
});