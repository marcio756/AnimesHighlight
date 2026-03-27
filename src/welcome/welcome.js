/**
 * Controller for Welcome Page
 * @description Loads localized text strings, orchestrates UI initialization, and binds closure events.
 */
import { I18nService } from '../common/i18n.js';

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Inicializa as traduções dinâmicas
    const currentLang = await I18nService.getCurrentLang();
    I18nService.translateDOM(currentLang);

    // 2. Comportamento do botão
    const startBtn = document.getElementById('startBtn');
    
    startBtn.addEventListener('click', () => {
        // Efeito de saída antes de fechar a janela para não ser brusco
        document.body.style.opacity = '0';
        document.body.style.transition = 'opacity 0.3s ease';
        
        setTimeout(() => {
            window.close();
        }, 300);
    });
});