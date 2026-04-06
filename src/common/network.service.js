// src/common/network.service.js

/**
 * Common Network Utilities
 * @description Provides shared network functions such as safe fetches with timeouts across different extension contexts.
 */
export class NetworkService {
    /**
     * Executes a fetch request with a strict timeout.
     * @param {string} url - The target URL.
     * @param {Object} options - Fetch options.
     * @param {number} timeoutMs - Timeout in milliseconds (default: 8000ms).
     * @returns {Promise<Response>}
     */
    static async fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(id);
            return response;
        } catch (error) {
            clearTimeout(id);
            throw error;
        }
    }
}