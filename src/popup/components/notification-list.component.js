// src/popup/components/notification-list.component.js

import { I18nService } from '../../common/i18n.js';
import { LiveScanService } from '../services/live-scan.service.js';

export class NotificationListComponent {
    static render(logs, listEl, emptyEl, clearBtn, filterValue, currentLang, onUpdateLogs) {
        if (!listEl) return;
        listEl.innerHTML = "";

        const filteredLogs = filterValue === 'all' ? logs : logs.filter(l => l.siteName === filterValue);

        if (!filteredLogs || filteredLogs.length === 0) {
            emptyEl.style.display = 'block';
            clearBtn.style.display = 'none';
            return;
        }

        emptyEl.style.display = 'none';
        clearBtn.style.display = 'block';

        const closeIconSVG = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
        
        const btnOpenText = I18nService.get('notifBtnOpen', currentLang);
        const btnSearchingText = I18nService.get('notifBtnSearching', currentLang);

        filteredLogs.forEach((log) => {
            const originalIndex = logs.indexOf(log); 
            const li = document.createElement('li');
            const date = new Date(log.date).toLocaleString();
            const actionUrl = log.url || `https://myanimelist.net/${log.type || 'anime'}/${log.id || ''}`;
            const siteTag = log.siteName ? `<span class="notif-tag" style="background:var(--bg-main); color:var(--primary-color); padding:2px 6px; border-radius:4px; font-size:9px; font-weight:bold; border:1px solid var(--border-color);">${log.siteName}</span>` : '';
            
            li.innerHTML = `
                <div class="notif-item" style="position: relative; padding-right: 25px;">
                    <button class="delete-notif-btn" data-index="${originalIndex}" style="position: absolute; top: 10px; right: 10px; background: none; border: none; cursor: pointer; padding: 4px; display: flex; align-items: center; justify-content: center;" title="Remover">${closeIconSVG}</button>
                    
                    <div style="display: flex; flex-direction: column; gap: 8px; width:100%;">
                        <span class="notif-text" style="font-size: 13px; font-weight: 700; color: var(--text-main); padding-right: 15px;">${log.text}</span>
                        
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div style="display: flex; gap: 6px; align-items: center;">
                                <span class="notif-date" style="font-size: 10px; color: var(--text-muted);">${date}</span>
                                ${siteTag}
                            </div>
                            <button class="open-notif-btn" data-index="${originalIndex}" data-url="${actionUrl}" style="background-color: #48bb78; color: white; border: none; padding: 4px 12px; border-radius: 4px; font-size: 11px; cursor: pointer; font-weight: bold; box-shadow: var(--shadow-sm); transition: transform 0.2s;">${btnOpenText}</button>
                        </div>
                    </div>
                </div>
            `;
            listEl.appendChild(li);
        });

        const handleRemove = (e) => {
            const btn = e.currentTarget;
            const idx = parseInt(btn.getAttribute('data-index'));
            const li = btn.closest('.notif-item');
            li.style.opacity = '0';
            li.style.transform = 'translateX(20px)';
            
            setTimeout(() => {
                logs.splice(idx, 1);
                if (onUpdateLogs) onUpdateLogs(logs);
            }, 250); 
        };

        listEl.querySelectorAll('.delete-notif-btn').forEach(btn => btn.addEventListener('click', handleRemove));

        listEl.querySelectorAll('.open-notif-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const button = e.currentTarget;
                const idx = parseInt(button.getAttribute('data-index'));
                const log = logs[idx];
                const targetUrl = button.getAttribute('data-url');

                button.innerText = btnSearchingText;
                button.style.opacity = "0.7";
                button.style.pointerEvents = "none";

                const searchBase = log.title || log.text || "";
                const finalUrl = await LiveScanService.findExactLink(targetUrl, searchBase, log.ep);

                if (finalUrl !== targetUrl) {
                    log.url = finalUrl;
                    if (onUpdateLogs) onUpdateLogs(logs);
                }

                window.open(finalUrl, '_blank');
                button.innerText = btnOpenText;
                button.style.opacity = "1";
                button.style.pointerEvents = "auto";
            });
        });
    }
}