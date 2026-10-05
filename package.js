/**
 * Package Script
 * @description Creates release/MAL_Highlighter_vX.Y.Z.zip with only the files the extension needs
 * (no node_modules, no build tooling), ready for GitHub Releases or the Edge/Firefox/Chrome stores.
 * Requires the `zip` step to be available through Node's built-in tooling (uses PowerShell on Windows, `zip` elsewhere).
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const { version } = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const outDir = 'release';
const outFile = path.resolve(outDir, `MAL_Highlighter_v${version}.zip`);
const include = ['manifest.json', 'icons', 'dist', 'src'];

fs.mkdirSync(outDir, { recursive: true });
if (fs.existsSync(outFile)) fs.unlinkSync(outFile);

if (process.platform === 'win32') {
    const items = include.map(i => `'${i}'`).join(',');
    execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path ${items} -DestinationPath '${outFile}'`], { stdio: 'inherit' });
} else {
    execFileSync('zip', ['-r', outFile, ...include], { stdio: 'inherit' });
}
console.log(`✅ Package created: ${outFile}`);
