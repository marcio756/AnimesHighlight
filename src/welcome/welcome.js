/**
 * Controller for Welcome Page
 * @description Loads localized text strings and binds window closure events.
 */
document.addEventListener('DOMContentLoaded', async () => {
    const currentLang = await I18nService.getCurrentLang();
    I18nService.translateDOM(currentLang);

    document.getElementById('startBtn').addEventListener('click', () => {
        window.close();
    });
});