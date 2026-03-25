/**
 * Global Theme Loader
 * @description Injected directly into the <head> of extension pages to prevent FOUC (Flash of Unstyled Content).
 * Also listens for live changes across different extension contexts.
 */

// 1. Aplica o tema imediatamente antes de o DOM pintar
chrome.storage.local.get(['theme'], (res) => {
    const theme = res.theme || 'light';
    document.documentElement.setAttribute('data-theme', theme);
});

// 2. Sincroniza em tempo real se o utilizador mudar o tema numa janela diferente
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.theme) {
        document.documentElement.setAttribute('data-theme', changes.theme.newValue);
    }
});