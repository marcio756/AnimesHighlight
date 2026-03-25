/**
 * UI Manipulation Service for Popup
 * @description Centralizes logic to avoid UI clutter in the main controller.
 */
class PopupUI {
    static initTabs(tabsArray, panesArray, onLoadNotifications) {
        tabsArray.forEach(tab => {
            tab.addEventListener('click', () => {
                tabsArray.forEach(t => t.classList.remove('active'));
                panesArray.forEach(p => p.classList.remove('active'));
                tab.classList.add('active');
                
                const targetId = tab.dataset.tab;
                document.getElementById(targetId).classList.add('active');

                if (targetId === 'tab-notifications' && onLoadNotifications) {
                    onLoadNotifications();
                }
            });
        });
    }

    static showProfile(name, imgUrl, avatarEl, welcomeTextEl, profileAreaEl) {
        avatarEl.src = imgUrl;
        welcomeTextEl.innerText = `Hello, ${name}!`;
        profileAreaEl.style.display = 'block';
    }

    static updateStatus(element, msg, type) {
        element.innerText = msg;
        element.className = "status " + type;
    }

    static escapeHtml(text) {
        if (!text) return text;
        return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    static renderNotifications(logs, listEl, emptyStateEl, clearBtn) {
        listEl.innerHTML = '';
        
        if (logs.length === 0) {
            emptyStateEl.style.display = 'block';
            clearBtn.disabled = true;
            return;
        }

        emptyStateEl.style.display = 'none';
        clearBtn.disabled = false;

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
            
            li.addEventListener('click', () => {
                chrome.storage.local.get('monitorUrl', (res) => {
                    if (res.monitorUrl) chrome.tabs.create({ url: res.monitorUrl });
                });
            });

            li.innerHTML = `
                <div class="notif-header">
                    <span class="notif-title">${this.escapeHtml(title)}</span>
                    <span class="notif-date">${dateStr}</span>
                </div>
                ${ep ? `<div class="notif-ep">${this.escapeHtml(ep)}</div>` : ''}
            `;
            listEl.appendChild(li);
        });
    }
}