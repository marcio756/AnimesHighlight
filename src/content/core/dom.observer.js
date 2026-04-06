// src/content/core/dom.observer.js

import { ContextAnalyzer } from '../utils.js';

/**
 * DOM Mutation and Intersection Observer
 * @description Watches the DOM for dynamic elements and processes them in batches to prevent browser freezing.
 */
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
            try {
                const isListingPage = ContextAnalyzer.isListingPage();
                const currentMediaType = ContextAnalyzer.guessContentType();
                const panelVisible = document.getElementById('malControlPanel')?.classList.contains('visible') || false;

                const intersectingEntries = entries.filter(entry => entry.isIntersecting);
                
                // Bulletproof: Batch Processing to prevent UI Freezing (>300 elements)
                if (intersectingEntries.length > 300) {
                    console.warn(`[DOMObserver] Heavy DOM load detected (${intersectingEntries.length} elements). Chunking...`);
                    this.processInChunks(intersectingEntries, observer, isListingPage, currentMediaType, panelVisible);
                } else {
                    intersectingEntries.forEach(entry => {
                        this.processCallback(entry.target, isListingPage, currentMediaType, panelVisible);
                        observer.unobserve(entry.target);
                    });
                }
            } catch (error) {
                console.warn("[DOMObserver] Silent error processing intersection:", error);
            }
        }, options);

        this.mutationObserver = new MutationObserver((mutations) => {
            try {
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === 1) { 
                            this.observeNewElements(node);
                        }
                    });
                });
                if (this.debounceCallback) this.debounceCallback();
            } catch (error) {
                console.warn("[DOMObserver] Silent error processing mutation:", error);
            }
        });
        
        this.mutationObserver.observe(document.body, { childList: true, subtree: true });
        this.observeNewElements(document.body);
        if (this.debounceCallback) this.debounceCallback();
    }

    /**
     * Processes a large array of entries in manageable chunks to avoid locking the main thread.
     */
    processInChunks(entries, observer, isListingPage, currentMediaType, panelVisible) {
        const CHUNK_SIZE = 50;
        let index = 0;

        const processNextChunk = () => {
            try {
                const chunk = entries.slice(index, index + CHUNK_SIZE);
                chunk.forEach(entry => {
                    this.processCallback(entry.target, isListingPage, currentMediaType, panelVisible);
                    observer.unobserve(entry.target);
                });

                index += CHUNK_SIZE;
                if (index < entries.length) {
                    setTimeout(processNextChunk, 100);
                }
            } catch (error) {
                console.warn("[DOMObserver] Silent error processing chunk:", error);
            }
        };

        processNextChunk();
    }

    /**
     * Binds specific target nodes to the Intersection Observer.
     * @param {HTMLElement} rootNode - The parent node to query inside.
     */
    observeNewElements(rootNode) {
        try {
            const selector = 'a, h1, h2, h3, h4, h5, .title, .name, .serie, .serie-title, [class*="title"], [class*="nome"], article h3, li h3';
            
            if (rootNode.matches && rootNode.matches(selector)) {
                 this.intersectionObserver.observe(rootNode);
            }
            
            if (rootNode.querySelectorAll) {
                const candidates = rootNode.querySelectorAll(selector);
                candidates.forEach(el => this.intersectionObserver.observe(el));
            }
        } catch (error) {
            console.warn("[DOMObserver] Silent error observing new elements:", error);
        }
    }
}