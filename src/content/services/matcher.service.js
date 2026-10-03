// src/content/services/matcher.service.js

import { TextNormalizer, Matcher, SeasonExtractor } from '../utils.js';
import { SynonymDictionary, RelationDictionary, ManualMappingManager } from '../data.js';

/**
 * Advanced Matching Service
 * @description Provides a 4-layer fallback matching system (Exact, Fuzzy, Synonym, SeasonChain).
 * Includes a robust 24h caching mechanism to prevent expensive calculations.
 */
export class MatcherService {
    constructor(globalMediaMap) {
        this.globalMediaMap = globalMediaMap;
        this.relations = RelationDictionary.getRelations();
        this.seasonChains = new Map();
        this.fuzzyCache = new Map();
        this.buildIndexes();
        this.initSeasonChains();
    }

    /**
     * Pre-computes lookup structures so per-element matching does not rescan / re-normalize the whole list.
     */
    buildIndexes() {
        this.idToTitle = new Map();
        this.entries = [];
        for (const [malTitle, dataArray] of this.globalMediaMap.entries()) {
            const engTitles = dataArray
                .map(node => node.title_eng ? TextNormalizer.normalize(node.title_eng) : null)
                .filter(Boolean);
            this.entries.push({ malTitle, dataArray, engTitles });
            dataArray.forEach(d => this.idToTitle.set(`${d.type}:${d.id}`, malTitle));
        }
    }

    /**
     * Fuzzy lookup across the list. Returns the first entry of the requested type
     * (entries of the wrong type no longer shadow a valid later match). Results are memoized.
     */
    fuzzyFind(itemTitle, currentMediaType) {
        const cacheKey = `${currentMediaType}|${itemTitle}`;
        if (this.fuzzyCache.has(cacheKey)) return this.fuzzyCache.get(cacheKey);

        let found = null;
        if (itemTitle.length < 150) {
            for (const { malTitle, dataArray, engTitles } of this.entries) {
                const typed = dataArray.find(m => m.type === currentMediaType);
                if (!typed) continue;
                if (Matcher.isFuzzyMatch(itemTitle, malTitle) || engTitles.some(t => Matcher.isFuzzyMatch(itemTitle, t))) {
                    found = typed;
                    break;
                }
            }
        }
        this.fuzzyCache.set(cacheKey, found);
        return found;
    }

    /**
     * Retrieves or builds the Season Chains with a 24h persistent TTL cache.
     */
    async initSeasonChains() {
        try {
            const cacheKey = 'mal_season_chain_cache';
            const storageRes = await new Promise(resolve => {
                chrome.storage.local.get([cacheKey], (res) => {
                    if (chrome.runtime.lastError) console.warn(chrome.runtime.lastError);
                    resolve(res);
                });
            });

            const cacheData = storageRes[cacheKey];
            const now = Date.now();
            const TTL_24H = 24 * 60 * 60 * 1000;

            if (cacheData && cacheData.timestamp && (now - cacheData.timestamp < TTL_24H)) {
                // Restore from cache
                this.seasonChains = new Map(JSON.parse(cacheData.data));
                return;
            }

            // Rebuild if expired or missing
            this.seasonChains = this.buildSeasonChains();

            // Save to cache
            chrome.storage.local.set({
                [cacheKey]: {
                    timestamp: now,
                    data: JSON.stringify(Array.from(this.seasonChains.entries()))
                }
            }, () => {
                if (chrome.runtime.lastError) console.warn(chrome.runtime.lastError);
            });
        } catch (error) {
            console.warn("[MatcherService] Silent error in SeasonChain cache init:", error);
            this.seasonChains = this.buildSeasonChains(); // Fallback to memory
        }
    }

    /**
     * Constrói as Season Chains para cada anime ativo, usando os dados de relação (prequels).
     * @returns {Map} Um mapa ligando a base do nome a um array de temporadas sequenciais.
     */
    buildSeasonChains() {
        const chains = new Map();
        
        try {
            const findRootId = (startId) => {
                let currentId = startId;
                let visited = new Set([currentId]);
                while (this.relations[currentId] && this.relations[currentId].prequels && this.relations[currentId].prequels.length > 0) {
                    const preId = this.relations[currentId].prequels[0];
                    if (visited.has(preId)) break; 
                    currentId = preId;
                    visited.add(currentId);
                }
                return currentId;
            };

            for (let [malTitle, dataArray] of this.globalMediaMap.entries()) {
                dataArray.forEach(item => {
                    const rootId = findRootId(item.id);
                    
                    const rootMalTitle = this.idToTitle.get(`${item.type}:${rootId}`);
                    const rootTitle = rootMalTitle ? SeasonExtractor.getBaseTitle(rootMalTitle) : malTitle;

                    let depth = 1;
                    let currentId = rootId;
                    let visited = new Set([currentId]);
                    
                    while (currentId !== item.id) {
                        if (this.relations[currentId] && this.relations[currentId].sequels && this.relations[currentId].sequels.length > 0) {
                            currentId = this.relations[currentId].sequels[0];
                            if (visited.has(currentId)) break;
                            visited.add(currentId);
                            depth++;
                        } else {
                            break;
                        }
                    }

                    if (!chains.has(rootTitle)) chains.set(rootTitle, []);
                    
                    const chainArr = chains.get(rootTitle);
                    if (!chainArr.some(c => c.id === item.id)) {
                        chainArr.push({
                            id: item.id,
                            title: malTitle,
                            seasonNumber: depth,
                            type: item.type,
                            status: item.status,
                            progress: item.progress,
                            total: item.total
                        });
                    }
                });
            }
        } catch (error) {
            console.warn("[MatcherService] Silent error building Season Chains:", error);
        }
        
        return chains;
    }

    /**
     * Resolves a user-defined mapping against the user's list.
     * @returns {Object|null} The list entry, or null if unmapped / not in the list.
     */
    findManual(normTitle, currentMediaType) {
        const mapped = ManualMappingManager.get(normTitle);
        if (!mapped || mapped.type !== currentMediaType) return null;
        const malTitle = this.idToTitle.get(`${mapped.type}:${mapped.id}`);
        const dataArray = malTitle ? this.globalMediaMap.get(malTitle) : null;
        return dataArray ? dataArray.find(d => d.id === mapped.id && d.type === mapped.type) || null : null;
    }

    /**
     * Executes the 4-layer matching strategy securely.
     */
    findMatch(rawText, currentMediaType) {
        try {
            const itemTitleRaw = TextNormalizer.normalize(rawText);
            if (!itemTitleRaw || itemTitleRaw.length < 3) return null;

            const manual = this.findManual(itemTitleRaw, currentMediaType);
            if (manual) return manual;

            // Layer 3: Jikan Synonyms resolution (Resolves to normalized official title)
            const itemTitle = SynonymDictionary.resolve(itemTitleRaw);

            // Layer 1: Exact Match (Normalized)
            if (this.globalMediaMap.has(itemTitle)) {
                const matchArray = this.globalMediaMap.get(itemTitle);
                const exactMatch = matchArray.find(m => m.type === currentMediaType);
                if (exactMatch) return exactMatch;
            }

            // Layer 2: Fuzzy Match
            const fuzzyRes = this.fuzzyFind(itemTitle, currentMediaType);
            if (fuzzyRes) return fuzzyRes;

            // Layer 4: SeasonChain Match (Franchise Traversal)
            const extractedSeason = SeasonExtractor.extractSeasonNumber(rawText);
            const baseTitleSite = SeasonExtractor.getBaseTitle(itemTitle);
            
            if (extractedSeason > 1 && baseTitleSite.length > 3) {
                for (let [baseMalTitle, chain] of this.seasonChains.entries()) {
                    if (Matcher.isFuzzyMatch(baseTitleSite, baseMalTitle)) {
                        const seasonMatch = chain.find(c => c.seasonNumber === extractedSeason && c.type === currentMediaType);
                        if (seasonMatch) return seasonMatch;
                    }
                }
            }

            return null;
        } catch (error) {
            console.warn("[MatcherService] Silent error in findMatch:", error);
            return null;
        }
    }

    /**
     * Analyzes the URL slug to attempt finding a media match securely.
     */
    matchFromUrl(currentMediaType) {
        try {
            const urlTitle = TextNormalizer.getSlugFromUrl();
            if (!urlTitle || urlTitle.length <= 3) return { match: null, urlTitle };

            const normUrlTitle = TextNormalizer.normalize(urlTitle);
            const manual = this.findManual(normUrlTitle, currentMediaType);
            if (manual) return { match: manual, urlTitle };
            const resolvedUrlTitle = SynonymDictionary.resolve(normUrlTitle);
            
            const exactArray = this.globalMediaMap.get(resolvedUrlTitle);
            const exact = exactArray ? exactArray.find(m => m.type === currentMediaType) : null;
            const match = exact || this.fuzzyFind(resolvedUrlTitle, currentMediaType);

            return { match, urlTitle };
        } catch (error) {
            console.warn("[MatcherService] Silent error in matchFromUrl:", error);
            return { match: null, urlTitle: null };
        }
    }
}