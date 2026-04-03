/**
 * Cloud Synchronization Service (Firebase REST API)
 * @description Handles bi-directional synchronization between chrome.storage.local and Firestore.
 * Uses universal WebAuthFlow and Firebase Refresh Tokens for persistent sessions without background iframes.
 */

export class SyncService {
    static PROJECT_ID = 'mal-highlighter-cloud'; 
    static FIREBASE_API_KEY = 'AIzaSyB0JwypgHiKBp55R-qztyXIo8MXR56NSz4'; 
    
    static FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${this.PROJECT_ID}/databases/(default)/documents`;
    // Endpoint oficial do Firebase para trocar um refresh token por uma sessão válida
    static SECURE_TOKEN_URL = `https://securetoken.googleapis.com/v1/token?key=${this.FIREBASE_API_KEY}`;
    
    static SYNCABLE_KEYS = [
        'extensionLang', 'panelEnabled', 'panelTransparent', 
        'savePanelPos', 'autoUpdateProgress', 'autoDetectSeasons', 'highlightStatuses', 
        'customColors', 'monitoredSites', 'notificationLog', 'seenEpisodes'
    ];

    static debounceTimer = null;
    static isPullingDown = false; 
    static currentUser = null; 

    /**
     * Generic Google OAuth2 using WebAuthFlow (Browser Agnostic)
     * Removida a versão "silenciosa" para evitar o crash de iframes no Opera/Brave.
     * @returns {Promise<string>} Google ID Token
     */
    static async getGoogleIdToken() {
        return new Promise((resolve, reject) => {
            const clientId = chrome.runtime.getManifest().oauth2.client_id;
            const redirectUri = chrome.identity.getRedirectURL();
            const nonce = Math.random().toString(36).substring(2, 15);
            
            const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + 
                `client_id=${clientId}&` +
                `response_type=id_token&` +
                `redirect_uri=${encodeURIComponent(redirectUri)}&` +
                `scope=openid email profile&` +
                `nonce=${nonce}`;

            chrome.identity.launchWebAuthFlow({
                url: authUrl,
                interactive: true // Agora é sempre interativo.
            }, (responseUrl) => {
                if (chrome.runtime.lastError || !responseUrl) {
                    return reject(new Error(chrome.runtime.lastError?.message || "Auth flow cancelled."));
                }

                const hash = new URL(responseUrl).hash.substring(1);
                const params = new URLSearchParams(hash);
                const idToken = params.get('id_token');

                if (idToken) resolve(idToken);
                else reject(new Error("ID Token not found in Google response."));
            });
        });
    }

    static parseJwt(token) {
        try {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
            return JSON.parse(jsonPayload);
        } catch (e) { return null; }
    }

    /**
     * Authenticates the user. Uses Refresh Token for background tasks, or Interactive Flow if requested.
     * @param {boolean} interactive - Define se deve abrir janela ao utilizador.
     * @returns {Promise<Object|null>}
     */
    static async authenticate(interactive = false) {
        if (this.currentUser) return this.currentUser;

        // 1. Tentar restaurar a sessão usando o Refresh Token guardado (Resolve a perda de login)
        try {
            const stored = await chrome.storage.local.get(['firebaseRefreshToken', 'firebaseLocalId', 'syncEmail']);
            if (stored.firebaseRefreshToken) {
                const refreshRes = await fetch(this.SECURE_TOKEN_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: `grant_type=refresh_token&refresh_token=${stored.firebaseRefreshToken}`
                });

                if (refreshRes.ok) {
                    const data = await refreshRes.json();
                    this.currentUser = {
                        idToken: data.id_token, // O Firebase usa id_token nesta resposta em vez de idToken
                        localId: data.user_id,
                        email: stored.syncEmail
                    };
                    // O Refresh Token pode ser renovado pela Google por segurança, guardamos o novo
                    await chrome.storage.local.set({ firebaseRefreshToken: data.refresh_token });
                    return this.currentUser;
                } else {
                    // Refresh token inválido/expirado, limpamos a cache local
                    await chrome.storage.local.remove(['firebaseRefreshToken', 'firebaseLocalId', 'syncEmail']);
                }
            }
        } catch (e) {
            console.warn("[SyncService] Failed to restore session via refresh token.");
        }

        // 2. Se não for interativo e não tivermos token válido, abortamos silenciosamente
        if (!interactive) return null;

        // 3. Login Interativo Inicial (Google -> Firebase)
        try {
            const googleToken = await this.getGoogleIdToken();

            const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${this.FIREBASE_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    postBody: `id_token=${googleToken}&providerId=google.com`,
                    requestUri: "http://localhost",
                    returnSecureToken: true
                })
            });

            const data = await res.json();
            if (!data.idToken || !data.localId) throw new Error(data.error?.message || "Firebase Auth Exchange Failed");
            
            const jwtData = this.parseJwt(googleToken);
            const email = jwtData && jwtData.email ? jwtData.email : 'Cloud User';

            // Guardar no storage persistente para sobreviver ao reinício do browser
            await chrome.storage.local.set({
                firebaseRefreshToken: data.refreshToken,
                firebaseLocalId: data.localId,
                syncEmail: email
            });

            this.currentUser = { idToken: data.idToken, localId: data.localId, email: email };
            return this.currentUser;
        } catch (error) {
            console.error("[SyncService] Authentication Error:", error);
            throw error;
        }
    }

    /**
     * Executa o logout limpando a sessão e a persistência.
     */
    static async logout() {
        this.currentUser = null;
        await chrome.storage.local.remove(['firebaseRefreshToken', 'firebaseLocalId', 'syncEmail']);
        return new Promise((resolve) => {
            chrome.identity.clearAllCachedAuthTokens(() => resolve());
        });
    }

    static async pullFromCloud() {
        try {
            const auth = await this.authenticate(false); 
            if (!auth) return; // Se não estiver logado, sai limpo
            
            console.log("[SyncService] Pulling data from cloud...");
            const res = await fetch(`${this.FIRESTORE_URL}/users/${auth.localId}`, {
                headers: { 'Authorization': `Bearer ${auth.idToken}` }
            });

            if (!res.ok) {
                if (res.status === 404) {
                    console.log("[SyncService] No cloud profile found. Pushing local data to cloud instead.");
                    return this.pushToCloud();
                }
                throw new Error("Failed to fetch document from Firestore");
            }

            const data = await res.json();
            if (data.fields && data.fields.settings && data.fields.settings.stringValue) {
                const cloudSettings = JSON.parse(data.fields.settings.stringValue);
                
                this.isPullingDown = true;
                await chrome.storage.local.set(cloudSettings);
                
                setTimeout(() => { this.isPullingDown = false; }, 500);
                console.log("[SyncService] Local storage successfully updated from cloud.");
            }
        } catch (error) {
            console.warn("[SyncService] Pull failed:", error.message);
        }
    }

    static async pushToCloud() {
        if (this.isPullingDown) return;

        try {
            const auth = await this.authenticate(false);
            if (!auth) return; // Se não estiver logado, sai limpo

            const localData = await chrome.storage.local.get(this.SYNCABLE_KEYS);
            
            const documentBody = {
                fields: {
                    settings: { stringValue: JSON.stringify(localData) },
                    lastUpdated: { timestampValue: new Date().toISOString() }
                }
            };

            const res = await fetch(`${this.FIRESTORE_URL}/users?documentId=${auth.localId}`, {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${auth.idToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(documentBody)
            });

            if (res.status === 409) {
                await fetch(`${this.FIRESTORE_URL}/users/${auth.localId}`, {
                    method: 'PATCH',
                    headers: { 
                        'Authorization': `Bearer ${auth.idToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(documentBody)
                });
            }

            console.log("[SyncService] Data successfully pushed to cloud.");
        } catch (error) {
            console.warn("[SyncService] Push failed:", error.message);
        }
    }

    static initListeners() {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local' || this.isPullingDown) return;

            const shouldSync = Object.keys(changes).some(key => this.SYNCABLE_KEYS.includes(key));
            
            if (shouldSync) {
                clearTimeout(this.debounceTimer);
                this.debounceTimer = setTimeout(() => {
                    this.pushToCloud();
                }, 3000); 
            }
        });
    }
}