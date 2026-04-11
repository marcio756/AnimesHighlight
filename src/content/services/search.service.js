// src/content/services/search.service.js

/**
 * External Search Service
 * @description Handles complex heuristic matching for items not found in the local cache by querying external APIs.
 */
import { TextNormalizer, Matcher } from '../utils.js';
import { SynonymDictionary } from '../data.js';

export class SearchService {
    /**
     * Queries the background script for an item and attempts to match it against the local map using fuzzy logic.
     * @param {string} rawTitle - The original title scraped from the DOM.
     * @param {string} currentMediaType - 'anime' or 'manga'.
     * @param {Map} globalMediaMap - The user's current MAL list mapped by title.
     * @returns {Promise<Object|null>} The best match object containing id, status, and type, or null if not found.
     */
    static async findExternalMatch(rawTitle, currentMediaType, globalMediaMap) {
        const cleanQuery = TextNormalizer.normalize(rawTitle);
        if (cleanQuery.length < 3) return null;

        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: "SEARCH_ITEM", title: cleanQuery }, (response) => {
                let bestMatch = null;
                let finalStatus = null;
                let finalType = null;

                if (response && response.success && response.results) {
                    // 1. Procurar correspondência com algo já existente na lista do utilizador
                    for (const apiItem of response.results) {
                        if (apiItem.type !== currentMediaType) continue;

                        const apiTitleNorm = TextNormalizer.normalize(apiItem.title);
                        const apiTitleEngNorm = apiItem.title_english ? TextNormalizer.normalize(apiItem.title_english) : "";
                        const hasSynonymMatch = apiItem.title_synonyms && Array.isArray(apiItem.title_synonyms)
                            ? apiItem.title_synonyms.some(syn => Matcher.isFuzzyMatch(cleanQuery, TextNormalizer.normalize(syn))) : false;
                        
                        const isMatch = Matcher.isFuzzyMatch(cleanQuery, apiTitleNorm) || 
                                        (apiTitleEngNorm && Matcher.isFuzzyMatch(cleanQuery, apiTitleEngNorm)) || hasSynonymMatch;
                        
                        if (!isMatch) continue;

                        for (let [localTitle, localDataArray] of globalMediaMap.entries()) {
                            const foundInList = localDataArray.find(v => v.id === apiItem.mal_id && v.type === currentMediaType);
                            if (foundInList) {
                                bestMatch = apiItem;
                                finalStatus = foundInList.status;
                                finalType = foundInList.type;
                                
                                if (cleanQuery !== localTitle && !Matcher.isFuzzyMatch(cleanQuery, localTitle)) {
                                    SynonymDictionary.save(cleanQuery, localTitle);
                                }
                                break;
                            }
                        }
                        if (bestMatch) break; 
                    }

                    // 2. Se não estiver na lista, aceitar o melhor resultado geral da API
                    if (!bestMatch) {
                        for (const apiItem of response.results) {
                            if (apiItem.type !== currentMediaType) continue;
                            const apiTitleNorm = TextNormalizer.normalize(apiItem.title);
                            const apiTitleEngNorm = apiItem.title_english ? TextNormalizer.normalize(apiItem.title_english) : "";
                            const hasSynonymMatch = apiItem.title_synonyms && Array.isArray(apiItem.title_synonyms)
                                ? apiItem.title_synonyms.some(syn => Matcher.isFuzzyMatch(cleanQuery, TextNormalizer.normalize(syn))) : false;
                            
                            if (Matcher.isFuzzyMatch(cleanQuery, apiTitleNorm) || (apiTitleEngNorm && Matcher.isFuzzyMatch(cleanQuery, apiTitleEngNorm)) || hasSynonymMatch) {
                                bestMatch = apiItem;
                                finalType = apiItem.type;
                                break;
                            }
                        }
                    }
                }

                if (bestMatch) {
                    resolve({ id: bestMatch.mal_id, title: bestMatch.title, status: finalStatus, type: finalType, cleanQuery });
                } else {
                    resolve({ notFound: true, cleanQuery });
                }
            });
        });
    }
}