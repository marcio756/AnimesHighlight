// src/content/services/matcher.service.js

import { TextNormalizer, Matcher, SWLogger, SeasonExtractor } from '../utils.js';
import { SynonymDictionary, RelationDictionary } from '../data.js';

export class MatcherService {
    constructor(globalMediaMap) {
        this.globalMediaMap = globalMediaMap;
        this.relations = RelationDictionary.getRelations();
        this.seasonChains = this.buildSeasonChains();
    }

    /**
     * Constrói as Season Chains para cada anime ativo, usando os dados de relação (prequels).
     * @returns {Map} Um mapa ligando a base do nome a um array de temporadas sequenciais.
     */
    buildSeasonChains() {
        const chains = new Map();
        
        // Função auxiliar para encontrar a raiz (Temporada 1) de uma entrada
        const findRootId = (startId) => {
            let currentId = startId;
            let visited = new Set([currentId]);
            while (this.relations[currentId] && this.relations[currentId].prequels && this.relations[currentId].prequels.length > 0) {
                const preId = this.relations[currentId].prequels[0];
                if (visited.has(preId)) break; // Prevents circular loops
                currentId = preId;
                visited.add(currentId);
            }
            return currentId;
        };

        // Percorre a lista global do utilizador e constrói cadeias lógicas
        for (let [malTitle, dataArray] of this.globalMediaMap.entries()) {
            dataArray.forEach(item => {
                const rootId = findRootId(item.id);
                
                // Procurar qual item do utilizador corresponde a este rootId para saber o nome base
                let rootTitle = malTitle;
                for (let [t, dArray] of this.globalMediaMap.entries()) {
                    if (dArray.some(d => d.id === rootId)) {
                        rootTitle = SeasonExtractor.getBaseTitle(t);
                        break;
                    }
                }

                // Deduzir um pseudo-número de temporada baseado na profundidade na cadeia
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
                
                // Apenas adiciona se ainda não existir
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
        
        return chains;
    }

    /**
     * Identifies the exact or fuzzy match for a given raw title from the global media map.
     * Integrates the new SeasonChain logic.
     */
    findMatch(rawText, currentMediaType) {
        const itemTitleRaw = TextNormalizer.normalize(rawText);
        if (!itemTitleRaw || itemTitleRaw.length < 3) return null;

        const itemTitle = SynonymDictionary.resolve(itemTitleRaw);

        // 1. Tentar Match via Season Chain
        const extractedSeason = SeasonExtractor.extractSeasonNumber(rawText);
        const baseTitleSite = SeasonExtractor.getBaseTitle(itemTitle);
        
        if (extractedSeason > 1 && baseTitleSite.length > 3) {
            for (let [baseMalTitle, chain] of this.seasonChains.entries()) {
                if (Matcher.isFuzzyMatch(baseTitleSite, baseMalTitle)) {
                    const seasonMatch = chain.find(c => c.seasonNumber === extractedSeason && c.type === currentMediaType);
                    if (seasonMatch) {
                        return seasonMatch; // Retorna imediatamente o match da cadeia
                    }
                }
            }
        }

        // 2. Fallback para o Fuzzy Match Clássico
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
     */
    matchFromUrl(currentMediaType) {
        const urlTitle = TextNormalizer.getSlugFromUrl();
        if (!urlTitle || urlTitle.length <= 3) return { match: null, urlTitle };

        const normUrlTitle = TextNormalizer.normalize(urlTitle);
        const resolvedUrlTitle = SynonymDictionary.resolve(normUrlTitle);
        
        // Pode ser útil aplicar a lógica SeasonChain também aos URLs no futuro, mas mantemos o clássico como pedido
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