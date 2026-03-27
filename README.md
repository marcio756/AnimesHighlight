# 🌟 Universal MAL Highlighter

Automatically highlight anime and manga cards across your favorite websites and synchronize your progress directly with [MyAnimeList](https://myanimelist.net/)!

## ✨ Features
* **Universal Highlighting:** Visually highlights anime/manga covers based on your MAL list (Watching, Completed, On Hold, etc.).
* **Smart Monitoring:** Tracks your active series and notifies you when new episodes or chapters are released.
* **Floating Quick-Action Panel:** Drag-and-drop panel to update your progress (+1 episode/chapter) without leaving the site you are currently on.
* **OAuth2 Security:** Uses official MyAnimeList API authentication.

---

## 🚀 How to Install (Manual Installation)

Since this extension is not currently hosted on the Chrome Web Store, you can install it manually in Developer Mode in less than a minute.

### Step 1: Download the Extension
1. Go to the [Releases page](../../releases) of this repository.
2. Download the latest `MAL_Highlighter_vX.X.zip` file.
3. Extract (unzip) the file into a folder on your computer. *(Make sure the folder contains the `manifest.json` file directly inside it).*

### Step 2: Load into Chrome / Edge
1. Open your browser and go to the extensions page:
   * **Chrome:** Type `chrome://extensions/` in your address bar.
   * **Edge:** Type `edge://extensions/` in your address bar.
2. In the top right corner, turn on **Developer mode**.
3. Click the **Load unpacked** button in the top left corner.
4. Select the folder where you extracted the extension in Step 1.

🎉 **That's it!** The extension is now installed. Click on the extension icon in your toolbar to connect your MyAnimeList account and start monitoring!

---

## 🛠️ Built With
* **Manifest V3** - The latest standard for Chrome Extensions.
* **Vanilla JavaScript (ES Modules)** - Fast, lightweight, and zero dependencies.
* **Jikan API & MAL API** - For lightning-fast data fetching and synchronization.