document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('username');
    const saveBtn = document.getElementById('saveBtn');
    const status = document.getElementById('status');
    const profileArea = document.getElementById('profileArea');
    const avatar = document.getElementById('avatar');
    const welcomeText = document.getElementById('welcomeText');

    // 1. Carregar dados guardados
    chrome.storage.local.get(['malUsername', 'malAvatar'], (result) => {
        if (result.malUsername) {
            input.value = result.malUsername;
            if (result.malAvatar) {
                showProfile(result.malUsername, result.malAvatar);
            }
        }
    });

    // 2. Botão Guardar
    saveBtn.addEventListener('click', async () => {
        const username = input.value.trim();
        if (!username) return;

        saveBtn.disabled = true;
        saveBtn.innerText = "A verificar...";
        status.className = "status";
        status.innerText = "";
        profileArea.style.display = 'none';

        try {
            // Verifica se o user existe via Jikan API
            const response = await fetch(`https://api.jikan.moe/v4/users/${username}`);
            
            if (!response.ok) {
                throw new Error('Utilizador não encontrado');
            }

            const data = await response.json();
            const imageUrl = data.data.images.jpg.image_url;

            // SUCESSO: Guarda na memória do Chrome
            chrome.storage.local.set({ 
                malUsername: username,
                malAvatar: imageUrl 
            }, () => {
                status.innerText = "Guardado com sucesso!";
                status.className = "status success";
                showProfile(username, imageUrl);
                saveBtn.disabled = false;
                saveBtn.innerText = "Verificar e Guardar";
            });

        } catch (error) {
            status.innerText = "Erro: Utilizador inválido ou API indisponível.";
            status.className = "status error";
            saveBtn.disabled = false;
            saveBtn.innerText = "Verificar e Guardar";
        }
    });

    function showProfile(name, imgUrl) {
        avatar.src = imgUrl;
        welcomeText.innerText = `Olá, ${name}!`;
        profileArea.style.display = 'block';
    }
});