// src/background/core/message.handler.js

import { MalService } from '../services/api.service.js';
import { ReleaseMonitorService } from '../services/monitor.service.js';
import { SyncService } from '../services/sync.service.js';

export class MessageHandler {
    /**
     * Inicializa os listeners de mensagens (Inter-Process Communication).
     */
    static init() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            
            // Logs do Content Script impressos no Service Worker
            if (request.action === "SW_LOG") {
                console.group(request.message);
                if (request.data) console.log(JSON.stringify(request.data, null, 2));
                console.groupEnd();
                sendResponse({ success: true });
                return true;
            }

            if (request.action === "FETCH_MAL_LIST") {
                MalService.fetchAllUserItems(request.username)
                    .then(data => sendResponse({ success: true, data: data }))
                    .catch(err => sendResponse({ success: false, error: err.message }));
                return true; 
            }

            if (request.action === "SEARCH_ITEM") {
                const query = encodeURIComponent(request.title);
                Promise.all([
                    fetch(`https://api.jikan.moe/v4/anime?q=${query}&limit=3`).then(res => res.json()).catch(() => ({ data: [] })),
                    fetch(`https://api.jikan.moe/v4/manga?q=${query}&limit=3`).then(res => res.json()).catch(() => ({ data: [] }))
                ])
                .then(([animeRes, mangaRes]) => {
                    const results = [];
                    if (animeRes && animeRes.data) results.push(...animeRes.data.map(item => ({ ...item, type: 'anime' })));
                    if (mangaRes && mangaRes.data) results.push(...mangaRes.data.map(item => ({ ...item, type: 'manga' })));
                    
                    if (results.length > 0) sendResponse({ success: true, results: results });
                    else sendResponse({ success: false, error: "Not found" });
                })
                .catch(err => sendResponse({ success: false, error: err.message }));
                return true;
            }

            if (request.action === "UPDATE_MONITORING") {
                ReleaseMonitorService.setupAlarm();
                ReleaseMonitorService.checkNewReleases(); 
                sendResponse({ success: true });
                return true;
            }

            if (request.action === "UPDATE_PROGRESS") {
                MalService.updateListEntry(request.id, request.mediaType, request.data)
                    .then(data => sendResponse({ success: true, data: data }))
                    .catch(err => sendResponse({ success: false, error: err.message }));
                return true;
            }

            if (request.action === "GET_SYNC_STATUS") {
                SyncService.authenticate(false)
                    .then(user => sendResponse({ loggedIn: true, email: user.email }))
                    .catch(() => sendResponse({ loggedIn: false }));
                return true;
            }

            if (request.action === "SYNC_LOGIN") {
                SyncService.authenticate(true)
                    .then(user => { 
                        SyncService.pullFromCloud(); 
                        sendResponse({ success: true, email: user.email }); 
                    })
                    .catch(err => sendResponse({ success: false, error: err.message }));
                return true;
            }

            if (request.action === "SYNC_LOGOUT") {
                SyncService.logout().then(() => sendResponse({ success: true }));
                return true;
            }
        });
    }
}