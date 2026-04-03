// src/content/core/dom.observer.js

import { ContextAnalyzer } from '../utils.js';

export class DOMObserver {
    constructor(processCallback, debounceCallback) {
        this.processCallback = processCallback;
        this.debounceCallback = debounceCallback;
        this.intersectionObserver = null;
        this.mutationObserver = null;
    }

    /**
     * Initializes the DOM observers to intercept and process new UI cards.
     */
    start() {
        if (!document.body) { 
            setTimeout(() => this.start(), 100); 
            return; 
        }
        
        const options = {
            root: null,
            rootMargin: "250px 0px 250px 0px", 
            threshold: 0
        };

        this.intersectionObserver = new IntersectionObserver((entries, observer) => {
            const isListingPage = ContextAnalyzer.isListingPage();
            const currentMediaType = ContextAnalyzer.guessContentType();
            const panelVisible = document.getElementById('malControlPanel')?.classList.contains('visible') || false;

            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    this.processCallback(entry.target, isListingPage, currentMediaType, panelVisible);
                    observer.unobserve(entry.target); 
                }
            });
        }, options);

        this.mutationObserver = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) { 
                        this.observeNewElements(node);
                    }
                });
            });
            if (this.debounceCallback) this.debounceCallback();
        });
        
        this.mutationObserver.observe(document.body, { childList: true, subtree: true });
        this.observeNewElements(document.body);
        if (this.debounceCallback) this.debounceCallback();
    }

    /**
     * Binds specific target nodes to the Intersection Observer.
     * @param {HTMLElement} rootNode - The parent node to query inside.
     */
    observeNewElements(rootNode) {
        const selector = 'a, h1, h2, h3, h4, h5, .title, .name, .serie, .serie-title, [class*="title"], [class*="nome"], article h3, li h3';
        
        if (rootNode.matches && rootNode.matches(selector)) {
             this.intersectionObserver.observe(rootNode);
        }
        
        if (rootNode.querySelectorAll) {
            const candidates = rootNode.querySelectorAll(selector);
            candidates.forEach(el => this.intersectionObserver.observe(el));
        }
    }
}