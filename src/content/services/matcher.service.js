// src/content/services/matcher.service.js

import { TextNormalizer, Matcher, SWLogger } from '../utils.js';
import { SynonymDictionary } from '../data.js';

export class MatcherService {
    constructor(globalMediaMap) {
        this.globalMediaMap = globalMediaMap;
    }

    /**
     * Identifies the exact or fuzzy match for a given raw title from the global media map.
     * @param {string} rawText - The raw text extracted from the DOM.
     * @param {string} currentMediaType - The media type ('anime' or 'manga').
     * @returns {Object|null} The matched media object or null.
     */
    findMatch(rawText, currentMediaType) {
        const itemTitleRaw = TextNormalizer.normalize(rawText);
        if (!itemTitleRaw || itemTitleRaw.length < 3) return null;

        const itemTitle = SynonymDictionary.resolve(itemTitleRaw);

        if (itemTitle.includes("dorohedoro") || itemTitle.includes("jidou") || itemTitle.includes("youkoso")) {
            SWLogger.log(`Extraído do HTML: "${rawText}" | Limpo/Resolvido para: "${itemTitle}"`);
        }

        let matchArray = null;
        if (this.globalMediaMap.has(itemTitle)) {
            matchArray = this.globalMediaMap.get(itemTitle);
        } else {
            if (itemTitle.length < 150) {
                for (let [malTitle, dataArray] of this.globalMediaMap.entries()) {
                    if (Matcher.isFuzzyMatch(itemTitle, malTitle)) {
                        matchArray = dataArray;
                        break;
                    }
                    
                    const hasAlternativeMatch = dataArray.some(node => {
                        return node.title_eng && Matcher.isFuzzyMatch(itemTitle, TextNormalizer.normalize(node.title_eng));
                    });
                    
                    if (hasAlternativeMatch) {
                        matchArray = dataArray;
                        break;
                    }
                }
            }
        }

        if (matchArray && matchArray.length > 0) {
            return matchArray.find(m => m.type === currentMediaType) || null;
        }

        return null;
    }

    /**
     * Analyzes the URL slug to attempt finding a media match.
     * @param {string} currentMediaType - The media type ('anime' or 'manga').
     * @returns {Object} An object containing the match and the extracted URL title.
     */
    matchFromUrl(currentMediaType) {
        const urlTitle = TextNormalizer.getSlugFromUrl();
        if (!urlTitle || urlTitle.length <= 3) return { match: null, urlTitle };

        const normUrlTitle = TextNormalizer.normalize(urlTitle);
        const resolvedUrlTitle = SynonymDictionary.resolve(normUrlTitle);
        
        let matchArray = this.globalMediaMap.get(resolvedUrlTitle);
        
        if (!matchArray) {
            for (let [malTitle, dataArray] of this.globalMediaMap.entries()) {
                if (Matcher.isFuzzyMatch(resolvedUrlTitle, malTitle)) {
                    matchArray = dataArray;
                    break;
                }
                
                const hasAlternativeMatch = dataArray.some(node => {
                    return node.title_eng && Matcher.isFuzzyMatch(resolvedUrlTitle, TextNormalizer.normalize(node.title_eng));
                });
                
                if (hasAlternativeMatch) {
                    matchArray = dataArray;
                    break;
                }
            }
        }

        let match = null;
        if (matchArray && matchArray.length > 0) {
            match = matchArray.find(m => m.type === currentMediaType) || null;
        }

        return { match, urlTitle };
    }
}