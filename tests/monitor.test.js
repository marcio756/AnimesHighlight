// Teste Unitário para ReleaseMonitorService.detectRelease
// Correção v2: Suporte a quebras de linha (Newlines)

const mockHtml = `
    <div class="latest-releases">
        <div class="card">
            <h3>One Piece</h3>
            <span>Episode 1099</span>
        </div>
        <div class="card">
            <h3>Naruto Shippuden</h3>
            <span>Ep 500</span>
        </div>
    </div>
`;

// Simulação da classe para teste isolado
const Service = {
    detectRelease: (html, title, ep) => {
        // 1. Limpeza básica
        const cleanTitle = title.toLowerCase().replace(/[^a-z0-9 ]/g, "");
        const cleanHtml = html.toLowerCase();
        
        if (!cleanHtml.includes(cleanTitle)) return false;

        const escapedTitle = cleanTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // CORREÇÃO AQUI: 
        // Usamos [\s\S] em vez de . para apanhar também as quebras de linha (\n) do HTML
        const pattern = new RegExp(`${escapedTitle}[\\s\\S]{0,100}?\\b0*${ep}\\b`, "i");
        
        return pattern.test(cleanHtml);
    }
};

// Execução dos Testes
console.log("Teste 1 (Positivo): One Piece Ep 1099");
const res1 = Service.detectRelease(mockHtml, "One Piece", 1099);
console.assert(res1 === true, "FALHOU: Deveria ter encontrado o One Piece 1099");
if(res1) console.log(">> Passou ✅");

console.log("\nTeste 2 (Negativo): One Piece Ep 1100 (Ainda não saiu)");
const res2 = Service.detectRelease(mockHtml, "One Piece", 1100);
console.assert(res2 === false, "FALHOU: Encontrou falsamente o episódio 1100");
if(!res2) console.log(">> Passou ✅");

console.log("\nTeste 3 (Positivo): Naruto Ep 500 (Já saiu)");
// Nota: O HTML tem 'Naruto Shippuden' e 'Ep 500'. Deve encontrar.
const res3 = Service.detectRelease(mockHtml, "Naruto Shippuden", 500);
console.assert(res3 === true, "FALHOU: Deveria ter encontrado o Naruto 500");
if(res3) console.log(">> Passou ✅");

console.log("\n--- Fim dos Testes ---");