/**
 * Popup UI Manager
 * @description Handles all visual updates, tab switching, and data rendering for the extension popup.
 */
class PopupUI {
    /**
     * Initializes Tab logic by binding buttons to their respective panes.
     * @param {NodeList} tabs - The tab buttons.
     * @param {NodeList} panes - The content panes.
     * @param {Function} onHistoryLoad - Callback to trigger when history tab is opened.
     */
    static initTabs(tabs, panes, onHistoryLoad) {
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
            });
        });
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
     * @param {string} username - MAL Username.
     * @param {string} avatarUrl - URL for the user's avatar.
     * @param {HTMLElement} avatarEl - The image element for the avatar.
     * @param {HTMLElement} textEl - The element for the welcome text.
     * @param {HTMLElement} container - The profile section container.
     */
    static showProfile(username, avatarUrl, avatarEl, textEl, container) {
        if (!container || !avatarEl || !textEl) return;
        avatarEl.src = avatarUrl;
        textEl.innerText = `Welcome, ${username}!`;
        container.style.display = 'flex';
    }

    /**
     * Renders the list of detected releases in the History tab.
     * @param {Array} logs - Array of notification log objects.
     * @param {HTMLElement} listEl - The UL element to contain the list.
     * @param {HTMLElement} emptyEl - The element to show if the list is empty.
     * @param {HTMLElement} clearBtn - The button to clear history.
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
     * Renders detailed media information (Quick-Add logic).
     * Note: Requires an element with id="anime-details" in popup.html.
     * @param {Object} entry - The MAL API entry data.
     */
    static renderEntry(entry) {
        const container = document.getElementById('anime-details');
        if (!container || !entry) return;

        const isAnime = entry.node.main_picture !== undefined;
        const currentProgress = isAnime ? (entry.list_status?.num_episodes_watched || 0) : (entry.list_status?.num_chapters_read || 0);
        const total = isAnime ? (entry.node.num_episodes || '?') : (entry.node.num_chapters || '?');
        const status = entry.list_status?.status || 'plan_to_watch';

        container.innerHTML = `
            <div class="entry-card">
                <img src="${entry.node.main_picture?.medium}" alt="${entry.node.title}">
                <div class="entry-info">
                    <h3>${entry.node.title}</h3>
                    <div class="status-selector">
                        <select id="status-update">
                            <option value="watching" ${status === 'watching' ? 'selected' : ''}>Watching</option>
                            <option value="completed" ${status === 'completed' ? 'selected' : ''}>Completed</option>
                            <option value="on_hold" ${status === 'on_hold' ? 'selected' : ''}>On Hold</option>
                            <option value="dropped" ${status === 'dropped' ? 'selected' : ''}>Dropped</option>
                            <option value="plan_to_watch" ${status === 'plan_to_watch' ? 'selected' : ''}>Plan to Watch</option>
                        </select>
                    </div>
                    <div class="progress-control">
                        <button id="dec-progress" class="btn-small">-</button>
                        <span id="progress-display">${currentProgress} / ${total}</span>
                        <button id="inc-progress" class="btn-small">+</button>
                    </div>
                </div>
            </div>
        `;

        // Event Listeners for Quick-Edit
        document.getElementById('dec-progress').onclick = () => this.updateMalProgress(entry.node.id, currentProgress - 1, isAnime);
        document.getElementById('inc-progress').onclick = () => this.updateMalProgress(entry.node.id, currentProgress + 1, isAnime);
        document.getElementById('status-update').onchange = (e) => this.updateMalStatus(entry.node.id, e.target.value, isAnime);
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
                // Refresh data if renderEntry is being used
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