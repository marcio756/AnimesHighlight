// src/popup/services/live-scan.service.js

/**
 * Live Scan Service
 * @description Responsável por pesquisar ativamente no HTML do site alvo o link exato do episódio/capítulo quando o utilizador clica na notificação.
 */
export class LiveScanService {
    static async findExactLink(targetUrl, searchBase, epNumber) {
        try {
            const urlObj = new URL(targetUrl);
            const path = urlObj.pathname;
            
            if (path !== '/' && path.length >= 5 && path.match(/(ep|cap|ver|watch|ler|chapter|episodio)/i)) {
                return targetUrl; 
            }

            console.group(`[Live Scan] Procurando link exato para: ${searchBase} (Alvo: Ep/Cap ${epNumber})`);
            console.log("A aceder ao site base:", targetUrl);
            
            const res = await fetch(targetUrl);
            const html = await res.text();
            
            const hrefRegex = /href=["']([^"']+)["']/gi;
            const links = new Set();
            let match;
            while ((match = hrefRegex.exec(html)) !== null) {
                links.add(match[1]);
            }
            
            console.log(`Encontrados ${links.size} links totais na página principal do site.`);
            
            let bestScore = 0;
            let bestHref = targetUrl;
            
            const titleWords = searchBase.toLowerCase()
                .replace(/[^a-z0-9 ]/g, ' ')
                .split(' ')
                .filter(w => w.length > 2 && !['ep', 'cap', 'ch', 'episodio', 'capitulo'].includes(w));
            
            for (let href of links) {
                const hrefLower = href.toLowerCase();
                if (hrefLower.includes('.css') || hrefLower.includes('.js')) continue;
                
                let score = 0;
                const numPattern = new RegExp(`[-_/(]0*${epNumber}(/|\\?|\\b|$)`, 'i');
                const numPattern2 = new RegExp(`\\b(ep|cap|episodio|chapter|ch)[-_]?0*${epNumber}\\b`, 'i');
                
                if (numPattern.test(hrefLower) || numPattern2.test(hrefLower)) {
                    score += 10;
                } else {
                    continue; 
                }
                
                let wordsMatched = 0;
                for (const word of titleWords) {
                    if (hrefLower.includes(word)) wordsMatched++;
                }
                score += (wordsMatched * 2);
                
                if (score > bestScore && score >= 12) {
                    bestScore = score;
                    bestHref = href;
                }
            }
            
            console.groupEnd();

            if (bestScore > 0) {
                const finalUrl = new URL(bestHref, targetUrl).href;
                console.log(`✅ Sucesso! Vencedor ao vivo: ${finalUrl}`);
                return finalUrl;
            } else {
                console.warn("⚠️ Não foi possível deduzir o link ao vivo. A abrir a homepage.");
                return targetUrl;
            }
            
        } catch(err) {
            console.error("[Live Scan] Erro durante o scan:", err);
            return targetUrl;
        }
    }
}