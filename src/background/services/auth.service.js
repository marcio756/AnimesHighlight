// src/background/services/auth.service.js

/**
 * Authentication Service
 * @description Handles OAuth2 PKCE flow for MyAnimeList API, token storage, and automatic token refreshing.
 */
export class AuthService {
    static CLIENT_ID = 'ea88ed2de2dce587ff8e3e5849c3cf9f';
    static CLIENT_SECRET = 'c892f9cf267d04c669a21529670913ab2db2c8c3968a4dcfa9d7075ca2c38a0f';
    
    /**
     * Generates a random string for PKCE verification
     * @param {number} length - The length of the string
     * @returns {string} Random string securely generated
     */
    static generateRandomString(length) {
        const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
        let result = '';
        const values = new Uint8Array(length);
        crypto.getRandomValues(values);
        for (let i = 0; i < length; i++) {
            result += charset[values[i] % charset.length];
        }
        return result;
    }

    /**
     * Refreshes the existing access token using the stored refresh token.
     * @param {string} refreshToken - The token used to request a new access session.
     * @returns {Promise<string>} The newly generated access token.
     */
    static async refreshAccessToken(refreshToken) {
        try {
            const tokenPayload = {
                client_id: this.CLIENT_ID,
                client_secret: this.CLIENT_SECRET,
                grant_type: 'refresh_token',
                refresh_token: refreshToken
            };

            const response = await fetch('https://myanimelist.net/v1/oauth2/token', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/x-www-form-urlencoded' 
                },
                body: new URLSearchParams(tokenPayload)
            });

            if (!response.ok) {
                throw new Error('Refresh token expired or invalid. Re-authentication required.');
            }

            const tokenData = await response.json();
            
            // Calculate exact expiration timestamp (subtracting 5 minutes for safety buffer)
            const expiresInMs = (tokenData.expires_in - 300) * 1000;
            const expiresAt = Date.now() + expiresInMs;

            await chrome.storage.local.set({ 
                mal_access_token: tokenData.access_token,
                mal_refresh_token: tokenData.refresh_token,
                mal_token_expires_at: expiresAt
            });

            console.log("[Auth] Token refreshed successfully.");
            return tokenData.access_token;
        } catch (err) {
            console.error("[Auth] Failed to refresh token:", err);
            // Purge invalid tokens to force a clean manual login on next attempt
            await chrome.storage.local.remove(['mal_access_token', 'mal_refresh_token', 'mal_token_expires_at']);
            throw err;
        }
    }

    /**
     * Initiates the OAuth2 flow to get an access token, or retrieves/refreshes the existing one.
     * @returns {Promise<string>} The access token required for write actions
     */
    static async getAccessToken() {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(['mal_access_token', 'mal_refresh_token', 'mal_token_expires_at'], async (res) => {
                
                // 1. Check if token exists and is still valid
                if (res.mal_access_token && res.mal_token_expires_at) {
                    if (Date.now() < res.mal_token_expires_at) {
                        return resolve(res.mal_access_token);
                    } else if (res.mal_refresh_token) {
                        // Token expired, attempt silent refresh
                        try {
                            const newToken = await this.refreshAccessToken(res.mal_refresh_token);
                            return resolve(newToken);
                        } catch (refreshErr) {
                            return reject(refreshErr);
                        }
                    }
                }
                
                // 2. Perform full interactive login if no token or refresh failed
                const codeVerifier = this.generateRandomString(128);
                const redirectUri = chrome.identity.getRedirectURL();
                
                console.log("[Auth] Redirect URI em uso:", redirectUri);
                
                const authUrl = `https://myanimelist.net/v1/oauth2/authorize?` + 
                    new URLSearchParams({
                        response_type: 'code',
                        client_id: this.CLIENT_ID,
                        code_challenge: codeVerifier,
                        code_challenge_method: 'plain',
                        redirect_uri: redirectUri
                    }).toString();

                chrome.identity.launchWebAuthFlow({
                    url: authUrl,
                    interactive: true
                }, async (redirectUrl) => {
                    
                    // Tratamento correto do objeto de erro do Chrome
                    if (chrome.runtime.lastError) {
                        const errorMsg = chrome.runtime.lastError.message || JSON.stringify(chrome.runtime.lastError);
                        console.error("[Auth] Erro no fluxo ou cancelado pelo Chrome:", errorMsg);
                        return reject(new Error(`Falha no popup de Autenticação: ${errorMsg}`));
                    }

                    if (!redirectUrl) {
                        console.error("[Auth] Nenhum URL de redirecionamento recebido.");
                        return reject(new Error('Autenticação cancelada ou nenhum URL recebido.'));
                    }

                    // Verifica se o MAL enviou erros pela barra de endereço
                    const urlObj = new URL(redirectUrl);
                    const urlParams = new URLSearchParams(urlObj.search);
                    
                    if (urlParams.has('error')) {
                        const malError = urlParams.get('error');
                        const malErrorDesc = urlParams.get('error_description') || 'Sem descrição fornecida pelo MAL';
                        console.error(`[Auth] O MyAnimeList rejeitou o pedido: ${malError} - ${malErrorDesc}`);
                        return reject(new Error(`O MyAnimeList bloqueou o acesso: ${malError}`));
                    }

                    const code = urlParams.get('code');

                    if (!code) {
                        return reject(new Error('Nenhum código de autenticação recebido do MAL.'));
                    }

                    try {
                        const tokenPayload = {
                            client_id: this.CLIENT_ID,
                            client_secret: this.CLIENT_SECRET,
                            code: code,
                            code_verifier: codeVerifier,
                            grant_type: 'authorization_code',
                            redirect_uri: redirectUri
                        };

                        const tokenResponse = await fetch('https://myanimelist.net/v1/oauth2/token', {
                            method: 'POST',
                            headers: { 
                                'Content-Type': 'application/x-www-form-urlencoded' 
                            },
                            body: new URLSearchParams(tokenPayload)
                        });

                        const tokenData = await tokenResponse.json();

                        if (tokenData.access_token) {
                            console.log("[Auth] Token obtido com sucesso!");
                            
                            const expiresInMs = (tokenData.expires_in - 300) * 1000;
                            const expiresAt = Date.now() + expiresInMs;

                            await chrome.storage.local.set({ 
                                mal_access_token: tokenData.access_token,
                                mal_refresh_token: tokenData.refresh_token,
                                mal_token_expires_at: expiresAt
                            });
                            resolve(tokenData.access_token);
                        } else {
                            console.error("[Auth] Resposta do servidor sem token:", tokenData);
                            reject(new Error('Falha ao obter o token na resposta do servidor.'));
                        }
                    } catch (err) {
                        console.error("[Auth] Erro no fetch do token:", err);
                        reject(err);
                    }
                });
            });
        });
    }
}