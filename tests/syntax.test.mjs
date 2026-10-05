import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync, copyFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Garante que todos os módulos da extensão são JavaScript válido (um erro de sintaxe deixa o popup/content inteiro "morto").
const walk = (dir) => readdirSync(dir).flatMap(n => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
});

test('every src/*.js file parses as an ES module', () => {
    const tmp = join(mkdtempSync(join(tmpdir(), 'syn-')), 'check.mjs');
    for (const file of walk('src')) {
        copyFileSync(file, tmp);
        assert.doesNotThrow(() => execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' }), file);
    }
});
