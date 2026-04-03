// src/popup/components/site-list.component.js

import { I18nService } from '../../common/i18n.js';

export class SiteListComponent {
    static render(sites, listEl, emptyEl, callbacks) {
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

    static updateFilterDropdown(sites, optionsContainerEl, labelEl, currentLang, currentValue, onChangeCallback) {
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
}