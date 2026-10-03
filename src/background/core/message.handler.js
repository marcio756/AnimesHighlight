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

            // Validação de Segurança de Origem: Rejeita mensagens de origens não reconhecidas
            if (sender.id !== chrome.runtime.id) {
                console.warn("[Security] Rejeitado pedido de origem externa suspeita:", sender);
                return;
            }

            // Logs do Content Script impressos no Service Worker
            if (request.action === "SW_LOG") {
                console.group(request.message);
                if (request.data) console.log(JSON.stringify(request.data, null, 2));
                console.groupEnd();
                sendResponse({ success: true });
                return true;
            }

            if (request.action === "FETCH_MAL_LIST") {
                MalService.fetchAllUserItemsShared(request.username, request.force === true)
                    .then(data => sendResponse({ success: true, data: data }))
                    .catch(err => sendResponse({ success: false, error: err.message }));
                return true;
            }

            if (request.action === "SEARCH_ITEM") {
                MalService.searchItems(request.title, request.mediaType)
                    .then(results => sendResponse({ success: true, results }))
                    .catch(err => sendResponse({ success: false, error: err.message }));
                return true;
            }

            if (request.action === "RESOLVE_CONTINUOUS") {
                MalService.resolveContinuous(request.id, request.mediaType, request.progress)
                    .then(data => sendResponse({ success: true, data }))
                    .catch(err => sendResponse({ success: false, error: err.message }));
                return true;
            }

            if (request.action === "RESOLVE_MAL_LINK") {
                MalService.resolveManualLink(request.input, request.mediaType)
                    .then(data => sendResponse({ success: true, data }))
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