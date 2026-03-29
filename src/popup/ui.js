/**
 * Popup UI Manager
 * @description Handles visual updates, Optimistic UI rendering, Context Transitions, and Progress Illusions.
 */
import { I18nService } from '../common/i18n.js';

export class ProgressService {
    static start() {
        const bar = document.getElementById('globalProgress');
        if (bar) bar.classList.add('loading');
    }

    static stop() {
        const bar = document.getElementById('globalProgress');
        if (bar) bar.classList.remove('loading');
    }
}

export class PopupUI {
    static clockInterval = null;

    static initTabs(tabs, panes, onHistoryLoad, onMonitorLoad) {
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const target = tab.getAttribute('data-tab');

                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                panes.forEach(pane => {
                    pane.classList.toggle('active', pane.id === target);
                });

                if (target === 'tab-notifications' && onHistoryLoad) onHistoryLoad();
                if (target === 'tab-monitor' && onMonitorLoad) onMonitorLoad();
            });
        });
    }

    static initSettingsAccordions() {
        const headers = document.querySelectorAll('.settings-header');
        headers.forEach(header => {
            header.addEventListener('click', () => {
                const card = header.closest('.settings-card');
                if (card) {
                    card.classList.toggle('collapsed');
                }
            });
        });
    }

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
                const mins = Math.floor(diffMs / 60000);
                const secs = Math.floor((diffMs % 60000) / 1000);
                const formattedSecs = secs.toString().padStart(2, '0');
                
                el.innerText = `${I18nService.get('lblNextCheck', currentLang)} ${mins}m ${formattedSecs}s`;
            }
        };

        updateClock();
        if (this.clockInterval) clearInterval(this.clockInterval);
        this.clockInterval = setInterval(updateClock, 1000); 
    }

    static updateStatus(element, message, type = "") {
        if (!element) return;
        element.innerText = message;
        element.className = `status ${type}`;
        
        setTimeout(() => {
            element.innerText = "";
            element.className = "status";
        }, 3000);
    }

    static showProfile(username, avatarUrl, avatarEl, textEl, container, skeletonEl) {
        if (!container || !avatarEl || !textEl) return;
        if (skeletonEl) skeletonEl.style.display = 'none';
        
        avatarEl.src = avatarUrl;
        textEl.innerText = `Welcome, ${username}!`;
        container.style.display = 'flex';
    }

    static renderSitesList(sites, listEl, emptyEl, callbacks) {
        listEl.innerHTML = "";
        
        if (!sites || sites.length === 0) {
            emptyEl.style.display = 'block';
            return;
        }

        emptyEl.style.display = 'none';

        const trashIconSVG = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`;

        sites.forEach((site) => {
            if (site.isSkeleton) {
                listEl.innerHTML += `
                    <li class="skeleton-card">
                        <div style="width: 60%;"><div class="skeleton-box skeleton-title"></div><div class="skeleton-box skeleton-subtitle"></div></div>
                        <div class="skeleton-box skeleton-toggle"></div>
                    </li>`;
                return;
            }

            const li = document.createElement('li');
            li.className = `site-card ${site.enabled ? '' : 'disabled'}`;
            li.innerHTML = `
                <div class="site-info" title="${site.url}">
                    <span class="site-name">${site.name}</span>
                    <span class="site-url">${site.url}</span>
                </div>
                <div class="site-actions">
                    <label class="switch" style="transform: scale(0.85); margin: 0;">
                        <input type="checkbox" class="toggle-site" data-id="${site.id}" ${site.enabled ? 'checked' : ''}>
                        <span class="slider round"></span>
                    </label>
                    <button class="btn-icon delete-site" data-id="${site.id}" title="Remove Site" style="border:none; background:transparent; cursor:pointer; padding: 4px; display: flex; align-items: center; justify-content: center;">${trashIconSVG}</button>
                </div>
            `;
            listEl.appendChild(li);
        });

        listEl.querySelectorAll('.toggle-site').forEach(btn => {
            btn.addEventListener('change', (e) => {
                const li = e.target.closest('.site-card');
                li.classList.toggle('disabled', !e.target.checked);
                callbacks.onToggle(e.target.dataset.id, e.target.checked);
            });
        });

        listEl.querySelectorAll('.delete-site').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const li = e.target.closest('.site-card');
                li.style.opacity = '0.3'; 
                setTimeout(() => callbacks.onDelete(e.currentTarget.dataset.id), 150);
            });
        });
    }

    static updateSiteFilterDropdown(sites, optionsContainerEl, labelEl, currentLang, currentValue, onChangeCallback) {
        if (!optionsContainerEl || !labelEl) return;
        
        const allSitesText = I18nService.get('filterAllSites', currentLang);
        let html = `<div class="mal-option ${currentValue === 'all' ? 'selected' : ''}" data-value="all">${allSitesText}</div>`;
        
        let currentLabel = allSitesText;

        if (sites) {
            sites.forEach(site => {
                const isSelected = currentValue === site.name;
                if (isSelected) currentLabel = site.name;
                html += `<div class="mal-option ${isSelected ? 'selected' : ''}" data-value="${site.name}">${site.name}</div>`;
            });
        }
        
        optionsContainerEl.innerHTML = html;
        labelEl.innerText = currentLabel;

        optionsContainerEl.querySelectorAll('.mal-option').forEach(opt => {
            opt.addEventListener('click', (e) => {
                const val = e.target.getAttribute('data-value');
                labelEl.innerText = e.target.innerText;
                onChangeCallback(val);
            });
        });
    }

    static renderNotifications(logs, listEl, emptyEl, clearBtn, filterValue, onUpdateLogs) {
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
                            <button class="open-notif-btn" data-index="${originalIndex}" data-url="${actionUrl}" style="background-color: #48bb78; color: white; border: none; padding: 4px 12px; border-radius: 4px; font-size: 11px; cursor: pointer; font-weight: bold; box-shadow: var(--shadow-sm); transition: transform 0.2s;">Abrir</button>
                        </div>
                    </div>
                </div>
            `;
            listEl.appendChild(li);
        });

        // 1. Lógica de Remoção
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

        // 2. Lógica de Clique com LIVE SCANNER e Logs no DevTools
        listEl.querySelectorAll('.open-notif-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const button = e.currentTarget;
                const idx = parseInt(button.getAttribute('data-index'));
                const log = logs[idx];
                let targetUrl = button.getAttribute('data-url');

                try {
                    const urlObj = new URL(targetUrl);
                    const path = urlObj.pathname;
                    
                    if (path === '/' || path.length < 5 || !path.match(/(ep|cap|ver|watch|ler|chapter|episodio)/i)) {
                        button.innerText = "A procurar...";
                        button.style.opacity = "0.7";
                        button.style.pointerEvents = "none";
                        
                        // FIX: Fallback seguro caso o title falhe no log guardado
                        const searchBase = log.title || log.text || "";
                        
                        console.group(`[Live Scan] Procurando link exato para: ${searchBase} (Alvo: Ep/Cap ${log.ep})`);
                        console.log("A aceder ao site base:", targetUrl);
                        
                        const res = await fetch(targetUrl);
                        const html = await res.text();
                        
                        const hrefRegex = /href=["']([^"']+)["']/gi;
                        const links = new Set();
                        let match;
                        while ((match = hrefRegex.exec(html)) !== null) {
                            links.add(match[1]);
                        }
                        
                        console.log(`Encontrados ${links.size} links totais na página principal do site.`);
                        
                        let bestScore = 0;
                        let bestHref = targetUrl;
                        
                        // Limpa o termo de pesquisa, removendo também palavras inúteis para a pontuação como 'ep' ou 'ch'
                        const titleWords = searchBase.toLowerCase()
                            .replace(/[^a-z0-9 ]/g, ' ')
                            .split(' ')
                            .filter(w => w.length > 2 && !['ep', 'cap', 'ch', 'episodio', 'capitulo'].includes(w));
                        
                        for (let href of links) {
                            const hrefLower = href.toLowerCase();
                            if (hrefLower.includes('.css') || hrefLower.includes('.js')) continue;
                            
                            let score = 0;
                            const numPattern = new RegExp(`[-_/(]0*${log.ep}(/|\\?|\\b|$)`, 'i');
                            const numPattern2 = new RegExp(`\\b(ep|cap|episodio|chapter|ch)[-_]?0*${log.ep}\\b`, 'i');
                            
                            if (numPattern.test(hrefLower) || numPattern2.test(hrefLower)) {
                                score += 10;
                            } else {
                                continue; 
                            }
                            
                            let wordsMatched = 0;
                            for (const word of titleWords) {
                                if (hrefLower.includes(word)) wordsMatched++;
                            }
                            score += (wordsMatched * 2);
                            
                            console.log(`  🔎 Avaliando: ${href} | Pontuação: ${score}`);
                            
                            if (score > bestScore && score >= 12) {
                                bestScore = score;
                                bestHref = href;
                            }
                        }
                        
                        if (bestScore > 0) {
                            targetUrl = new URL(bestHref, targetUrl).href;
                            console.log(`✅ Sucesso! Vencedor ao vivo: ${targetUrl}`);
                            log.url = targetUrl; 
                            if (onUpdateLogs) onUpdateLogs(logs); 
                        } else {
                            console.warn("⚠️ Não foi possível deduzir o link ao vivo. A abrir a homepage.");
                        }
                        console.groupEnd();
                    }
                } catch(err) {
                    console.error("[Live Scan] Erro durante o scan:", err);
                }

                window.open(targetUrl, '_blank');
                button.innerText = "Abrir";
                button.style.opacity = "1";
                button.style.pointerEvents = "auto";
            });
        });
    }
}