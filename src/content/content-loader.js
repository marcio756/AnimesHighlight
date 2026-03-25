/**
 * @fileoverview Content Script Bootstrapper
 * @description Contorna a limitação do Manifest V3 carregando a aplicação via dynamic import, 
 * permitindo o uso nativo de ES Modules e isolamento total de escopo.
 */

(async () => {
    try {
        const mainModuleUrl = chrome.runtime.getURL('src/content/main.js');
        await import(mainModuleUrl);
    } catch (error) {
        console.error("[MAL Highlighter] Erro crítico ao iniciar os módulos ES:", error);
    }
})();