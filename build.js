/**
 * Build Configuration Script
 * @description Orchestrates the bundling of Content Scripts using ESBuild. 
 * It flattens the ES Module dependency tree into a single, highly optimized file,
 * eliminating network overhead and browser parsing latency during execution.
 * The 'iife' format ensures the code runs in an isolated scope, avoiding global variable pollution.
 */

const esbuild = require('esbuild');

esbuild.build({
    entryPoints: ['src/content/main.js'],
    bundle: true,
    minify: true,
    outfile: 'dist/content.bundle.js',
    target: ['chrome100'],
    format: 'iife'
}).then(() => {
    console.log('✅ Content Script bundled successfully: dist/content.bundle.js');
}).catch(() => process.exit(1));