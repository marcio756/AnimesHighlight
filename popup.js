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
            // Verify via Jikan API
            const response = await fetch(`https://api.jikan.moe/v4/users/${username}`);
            
            if (!response.ok) {
                throw new Error('User not found');
            }

            const data = await response.json();
            const imageUrl = data.data.images.jpg.image_url;

            // Success: Save to storage
            chrome.storage.local.set({ 
                malUsername: username,
                malAvatar: imageUrl 
            }, () => {
                status.innerText = "Saved successfully!";
                status.className = "status success";
                showProfile(username, imageUrl);
                saveBtn.disabled = false;
                saveBtn.innerText = "Verify & Save";
                
                // Clear cache to force update on next load
                localStorage.removeItem('mal_v12_cache');
            });

        } catch (error) {
            status.innerText = "Error: User not found or API issue.";
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