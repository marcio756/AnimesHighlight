// src/content/services/progress.service.js

import { ProgressExtractor } from '../utils.js';
import { DataManager } from '../data.js';

export class ProgressService {
    constructor() {
        this.autoUpdatedId = null;
    }

    /**
     * Avalia e executa atualizações automáticas de progresso.
     */
    attemptAutoUpdate(match, currentMediaType, autoUpdateProgress) {
        if (!autoUpdateProgress || !match || this.autoUpdatedId === match.id) return;

        const url = window.location.pathname;
        const title = document.title;
        const currentNum = ProgressExtractor.extract(url, currentMediaType) || ProgressExtractor.extract(title, currentMediaType);

        if (currentNum !== null && currentNum > match.progress) {
            const field = currentMediaType === 'anime' ? 'num_watched_episodes' : 'num_chapters_read';

            if (match.total > 0 && currentNum > match.total) {
                const cappedNum = match.total;
                if (cappedNum > match.progress) this.executeAutoUpdate(match, currentMediaType, cappedNum, field);
                return;
            }

            this.executeAutoUpdate(match, currentMediaType, currentNum, field);
        }
    }

    /**
     * Executa a atualização de progresso aplicando UI Otimista para perceção de velocidade.
     */
    executeAutoUpdate(match, currentMediaType, finalNum, field) {
        this.autoUpdatedId = match.id; 

        // Optimistic UI: Assumir sucesso e atualizar imediatamente a interface
        match.progress = finalNum;
        DataManager.updateCacheItem(match.id, currentMediaType, { progress: finalNum });
        
        const progressInput = document.getElementById('malProgressInput');
        if (progressInput) progressInput.value = finalNum;

        // Processar no background
        chrome.runtime.sendMessage({
            action: "UPDATE_PROGRESS",
            id: match.id,
            mediaType: currentMediaType,
            data: { [field]: finalNum }
        });
    }
}