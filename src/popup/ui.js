/**
 * Popup UI Manager
 * @description Handles all visual updates, tab switching, and data rendering for the extension popup.
 */
class PopupUI {
    static clockInterval = null;

    /**
     * Initializes Tab logic by binding buttons to their respective panes.
     * @param {NodeList} tabs - The tab buttons.
     * @param {NodeList} panes - The content panes.
     * @param {Function} onHistoryLoad - Callback to trigger when history tab is opened.
     * @param {Function} onMonitorLoad - Callback to trigger when monitor tab is opened.
     */
    static initTabs(tabs, panes, onHistoryLoad, onMonitorLoad) {
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const target = tab.getAttribute('data-tab');

                // Toggle active class on buttons
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                // Toggle active class on panes
                panes.forEach(pane => {
                    pane.classList.toggle('active', pane.id === target);
                });

                // Load history if the notifications tab is selected
                if (target === 'tab-notifications' && onHistoryLoad) {
                    onHistoryLoad();
                }

                // Load monitor feedback if the monitor tab is selected
                if (target === 'tab-monitor' && onMonitorLoad) {
                    onMonitorLoad();
                }
            });
        });
    }

    /**
     * Renders real-time feedback for the background monitor alarm.
     * @param {string} elementId - The ID of the container element.
     * @param {string} currentLang - The currently selected language.
     */
    static renderAlarmFeedback(elementId, currentLang) {
        const el = document.getElementById(elementId);
        if (!el) return;

        const updateClock = async () => {
            const alarm = await chrome.alarms.get("MAL_MONITOR_CHECK");
            if (!alarm) {
                el.innerText = I18nService.get('lblNotScheduled', currentLang);
                return;
            }
            const diffMs = alarm.scheduledTime - Date.now();
            if (diffMs <= 0) {
                el.innerText = I18nService.get('lblNow', currentLang);
            } else {
                const mins = Math.ceil(diffMs / 60000);
                el.innerText = `${I18nService.get('lblNextCheck', currentLang)} ${mins} ${I18nService.get('lblMinutes', currentLang)}`;
            }
        };

        updateClock();
        if (this.clockInterval) clearInterval(this.clockInterval);
        this.clockInterval = setInterval(updateClock, 10000); // Polling every 10 seconds to save CPU
    }

    /**
     * Updates a status message element with temporary visual feedback.
     * @param {HTMLElement} element - The DOM element to show the message.
     * @param {string} message - The text to display.
     * @param {string} type - The type of status ('success', 'error', or empty).
     */
    static updateStatus(element, message, type = "") {
        if (!element) return;
        element.innerText = message;
        element.className = `status ${type}`;
        
        // Clear message after 3 seconds
        setTimeout(() => {
            element.innerText = "";
            element.className = "status";
        }, 3000);
    }

    /**
     * Displays the user profile information in the UI.
     */
    static showProfile(username, avatarUrl, avatarEl, textEl, container) {
        if (!container || !avatarEl || !textEl) return;
        avatarEl.src = avatarUrl;
        textEl.innerText = `Welcome, ${username}!`;
        container.style.display = 'flex';
    }

    /**
     * Renders the list of detected releases in the History tab.
     */
    static renderNotifications(logs, listEl, emptyEl, clearBtn) {
        if (!listEl) return;
        listEl.innerHTML = "";

        if (!logs || logs.length === 0) {
            emptyEl.style.display = 'block';
            clearBtn.style.display = 'none';
            return;
        }

        emptyEl.style.display = 'none';
        clearBtn.style.display = 'block';

        logs.forEach(log => {
            const li = document.createElement('li');
            const date = new Date(log.date).toLocaleString();
            li.innerHTML = `
                <div class="notif-item">
                    <span class="notif-text">${log.text}</span>
                    <span class="notif-date">${date}</span>
                </div>
            `;
            listEl.appendChild(li);
        });
    }

    /**
     * Communicates with background to update MAL progress.
     */
    static async updateMalProgress(id, newValue, isAnime) {
        if (newValue < 0) return;
        const field = isAnime ? 'num_watched_episodes' : 'num_chapters_read';
        
        chrome.runtime.sendMessage({
            action: "UPDATE_PROGRESS",
            id: id,
            mediaType: isAnime ? 'anime' : 'manga',
            data: { [field]: newValue }
        }, (response) => {
            if (response && response.success) {
                location.reload(); 
            }
        });
    }

    /**
     * Communicates with background to update MAL status.
     */
    static async updateMalStatus(id, newStatus, isAnime) {
        chrome.runtime.sendMessage({
            action: "UPDATE_PROGRESS",
            id: id,
            mediaType: isAnime ? 'anime' : 'manga',
            data: { status: newStatus }
        }, (response) => {
            if (response && response.success) {
                location.reload();
            }
        });
    }
}