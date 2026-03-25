/**
 * Authentication Service
 * @description Handles OAuth2 PKCE flow for MyAnimeList API, token storage, and refreshing.
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
     * Initiates the OAuth2 flow to get an access token
     * @returns {Promise<string>} The access token required for write actions
     */
    static async getAccessToken() {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(['mal_access_token'], async (res) => {
                if (res.mal_access_token) {
                    return resolve(res.mal_access_token);
                }
                
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
                    if (chrome.runtime.lastError || !redirectUrl) {
                        console.error("[Auth] Erro no fluxo ou cancelado:", chrome.runtime.lastError);
                        return reject(new Error('Authentication failed or cancelled.'));
                    }

                    const urlParams = new URLSearchParams(new URL(redirectUrl).search);
                    const code = urlParams.get('code');

                    if (!code) {
                        return reject(new Error('No auth code received from MAL.'));
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
                            await chrome.storage.local.set({ 
                                mal_access_token: tokenData.access_token,
                                mal_refresh_token: tokenData.refresh_token 
                            });
                            resolve(tokenData.access_token);
                        } else {
                            console.error("[Auth] Resposta do servidor sem token:", tokenData);
                            reject(new Error('Failed to retrieve access token from server response.'));
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