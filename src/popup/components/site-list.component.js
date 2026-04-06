// src/popup/components/site-list.component.js

import { I18nService } from '../../common/i18n.js';

export class SiteListComponent {
    static render(sites, listEl, emptyEl, callbacks) {
        listEl.innerHTML = ""; // Limpeza do contentor base
        
        if (!sites || sites.length === 0) {
            emptyEl.style.display = 'block';
            return;
        }

        emptyEl.style.display = 'none';

        const trashIconSVG = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`;

        sites.forEach((site) => {
            if (site.isSkeleton) {
                // Skeleton é puramente estático/visual, innerHTML aqui é seguro pois não usa variáveis
                listEl.innerHTML += `
                    <li class="skeleton-card">
                        <div style="width: 60%;"><div class="skeleton-box skeleton-title"></div><div class="skeleton-box skeleton-subtitle"></div></div>
                        <div class="skeleton-box skeleton-toggle"></div>
                    </li>`;
                return;
            }

            const li = document.createElement('li');
            li.className = `site-card ${site.enabled ? '' : 'disabled'}`;
            
            const infoDiv = document.createElement('div');
            infoDiv.className = 'site-info';
            infoDiv.title = site.url; // Seguro contra XSS (Atributo em vez de HTML literal)
            
            const nameSpan = document.createElement('span');
            nameSpan.className = 'site-name';
            nameSpan.textContent = site.name; // Seguro
            
            const urlSpan = document.createElement('span');
            urlSpan.className = 'site-url';
            urlSpan.textContent = site.url; // Seguro
            
            infoDiv.appendChild(nameSpan);
            infoDiv.appendChild(urlSpan);
            
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'site-actions';
            
            const label = document.createElement('label');
            label.className = 'switch';
            label.style.cssText = 'transform: scale(0.85); margin: 0;';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'toggle-site';
            checkbox.setAttribute('data-id', site.id);
            if (site.enabled) checkbox.checked = true;
            
            const slider = document.createElement('span');
            slider.className = 'slider round';
            
            label.appendChild(checkbox);
            label.appendChild(slider);
            
            const delBtn = document.createElement('button');
            delBtn.className = 'btn-icon delete-site';
            delBtn.setAttribute('data-id', site.id);
            delBtn.title = 'Remove Site';
            delBtn.style.cssText = 'border:none; background:transparent; cursor:pointer; padding: 4px; display: flex; align-items: center; justify-content: center;';
            delBtn.innerHTML = trashIconSVG; // Estático
            
            actionsDiv.appendChild(label);
            actionsDiv.appendChild(delBtn);
            
            li.appendChild(infoDiv);
            li.appendChild(actionsDiv);
            
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
        
        optionsContainerEl.innerHTML = ""; // Limpeza
        const allSitesText = I18nService.get('filterAllSites', currentLang);
        
        const createOption = (text, value, isSelected) => {
            const div = document.createElement('div');
            div.className = `mal-option ${isSelected ? 'selected' : ''}`;
            div.setAttribute('data-value', value);
            div.textContent = text; // Seguro
            return div;
        };
        
        let currentLabel = allSitesText;
        optionsContainerEl.appendChild(createOption(allSitesText, 'all', currentValue === 'all'));

        if (sites) {
            sites.forEach(site => {
                const isSelected = currentValue === site.name;
                if (isSelected) currentLabel = site.name;
                optionsContainerEl.appendChild(createOption(site.name, site.name, isSelected));
            });
        }
        
        labelEl.textContent = currentLabel;

        optionsContainerEl.querySelectorAll('.mal-option').forEach(opt => {
            opt.addEventListener('click', (e) => {
                const val = e.target.getAttribute('data-value');
                labelEl.textContent = e.target.textContent;
                onChangeCallback(val);
            });
        });
    }
}