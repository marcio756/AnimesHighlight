document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('username');
    const saveBtn = document.getElementById('saveBtn');
    const status = document.getElementById('status');
    const profileArea = document.getElementById('profileArea');
    const avatar = document.getElementById('avatar');
    const welcomeText = document.getElementById('welcomeText');

    // 1. Load saved data
    chrome.storage.local.get(['malUsername', 'malAvatar'], (result) => {
        if (result.malUsername) {
            input.value = result.malUsername;
            if (result.malAvatar) {
                showProfile(result.malUsername, result.malAvatar);
            }
        }
    });

    // 2. Save Button Action
    saveBtn.addEventListener('click', async () => {
        const username = input.value.trim();
        if (!username) return;

        saveBtn.disabled = true;
        saveBtn.innerText = "Verifying...";
        status.className = "status";
        status.innerText = "";
        profileArea.style.display = 'none';

        try {
            // Step 1: Check if user exists via Jikan API
            const response = await fetch(`https://api.jikan.moe/v4/users/${username}`);
            
            if (!response.ok) {
                throw new Error('User not found');
            }

            const data = await response.json();
            const imageUrl = data.data.images.jpg.image_url;

            // Step 2: Check if Profile/List is Public
            // Tenta obter a lista via background. Se falhar, é porque é privada.
            chrome.runtime.sendMessage({ action: "FETCH_MAL_LIST", username: username }, (malResponse) => {
                if (malResponse && malResponse.success) {
                    // SUCESSO: Perfil Público -> Guardar
                    chrome.storage.local.set({ 
                        malUsername: username,
                        malAvatar: imageUrl 
                    }, () => {
                        status.innerText = "Saved successfully!";
                        status.className = "status success";
                        showProfile(username, imageUrl);
                        saveBtn.disabled = false;
                        saveBtn.innerText = "Verify & Save";
                        
                        // Limpar cache para forçar atualização imediata
                        localStorage.removeItem('mal_v24_clean');
                        localStorage.removeItem('mal_v25_clean');
                    });
                } else {
                    // FALHA: Perfil Privado ou Erro de Rede
                    status.innerText = "Your MAL Profile is private. Please make it public to use this extension.";
                    status.className = "status error";
                    saveBtn.disabled = false;
                    saveBtn.innerText = "Verify & Save";
                }
            });

        } catch (error) {
            status.innerText = "Error: User not found.";
            status.className = "status error";
            saveBtn.disabled = false;
            saveBtn.innerText = "Verify & Save";
        }
    });

    function showProfile(name, imgUrl) {
        avatar.src = imgUrl;
        welcomeText.innerText = `Hello, ${name}!`;
        profileArea.style.display = 'block';
    }
});