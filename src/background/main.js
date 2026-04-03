// src/background/main.js

/**
 * Service Worker Bootstrap
 * @description Ponto de entrada principal do background script.
 * Inicia os Handlers responsáveis pelo ecossistema sem misturar lógicas de domínio.
 */

import { MessageHandler } from './core/message.handler.js';
import { EventHandler } from './core/event.handler.js';

// Inicializar os orquestradores
MessageHandler.init();
EventHandler.init();