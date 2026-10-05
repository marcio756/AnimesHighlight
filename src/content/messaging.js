// src/content/messaging.js

/**
 * Safe wrapper around chrome.runtime.sendMessage.
 * @description Depois de a extensão ser atualizada/recarregada, os content scripts já injetados perdem a ligação
 * ("Extension context invalidated"). Este wrapper nunca lança: em caso de falha o callback recebe `null`.
 */
export function sendMessage(message, callback) {
    const done = (res) => { if (typeof callback === 'function') callback(res); };
    try {
        chrome.runtime.sendMessage(message, (res) => {
            if (chrome.runtime.lastError) return done(null);
            done(res);
        });
    } catch (e) {
        done(null);
    }
}
