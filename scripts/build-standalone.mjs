#!/usr/bin/env node
/**
 * Single-file build: the whole app (script, styles, fonts and every data file) inside one HTML file.
 *
 *   npm run build:standalone
 *     → dist-standalone/ayni-zamanda.html           a full document: double-click it (file://) or put it on any host
 *     → dist-standalone/ayni-zamanda.fragment.html  the same page without <html>/<head>/<body>, for hosts that
 *                                                    wrap the content in their own skeleton
 *
 * The data JSON files become <script type="application/json" id="data:<path>"> blocks; the loader
 * (src/data/load.ts) reads those instead of fetching. Nothing is requested over the network.
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'dist-standalone');
const PARTS = join(OUT, 'parts');
const DATA = join(ROOT, 'public', 'data');
const NOTICE_URL =
  process.env.NOTICE_URL ??
  'https://github.com/erensemih/interactive_history/blob/claude/historical-map-prototype-h0jw9x/public/NOTICE.txt';
const TITLE = 'Aynı Zamanda';
const DESCRIPTION =
  'Bir zaman aralığı ve bir yer seçin: o dönemde orada ve dünyanın başka yerlerinde aynı sırada neler oluyordu?';

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

/* ----------------------------------------------------------------- bundle */
await build({
  root: ROOT,
  configFile: false,
  base: './',
  logLevel: 'warn',
  publicDir: false, // the data travels inside the page, not next to it
  define: { 'import.meta.env.VITE_NOTICE_URL': JSON.stringify(NOTICE_URL) },
  build: {
    outDir: PARTS,
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER, // fonts become data: URIs
    cssCodeSplit: false,
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'app.js',
        assetFileNames: '[name][extname]',
      },
    },
  },
});

/* ------------------------------------------------------------------- parts */
const html = readFileSync(join(PARTS, 'index.html'), 'utf8');
const scriptTag = /<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/.exec(html);
const styleTag = /<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/.exec(html);
if (!scriptTag || !styleTag) throw new Error('built index.html has no script/stylesheet tag');
const read = (href) => readFileSync(join(PARTS, href.replace(/^\.\//, '')), 'utf8');

// Inline code must never be able to close its own tag or open an HTML comment.
const js = read(scriptTag[1]).replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
const css = read(styleTag[1]).replace(/<\/style/gi, '<\\/style');

function dataFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === 'schema' ? [] : dataFiles(full);
    return name.endsWith('.json') ? [full] : [];
  });
}
const dataBlocks = dataFiles(DATA)
  .sort()
  .map((file) => {
    const id = relative(DATA, file).split('\\').join('/');
    // Valid JSON stays valid when every "<" becomes \u003c, and nothing can then end the <script> early.
    const json = JSON.stringify(JSON.parse(readFileSync(file, 'utf8'))).replace(/</g, '\\u003c');
    return `<script type="application/json" id="data:${id}">${json}</script>`;
  })
  .join('\n');

const icon =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%23efe7d4'/%3E%3Ccircle cx='16' cy='16' r='9' fill='none' stroke='%231d1a16' stroke-width='2'/%3E%3Cpath d='M16 7v9l6 4' fill='none' stroke='%23cf3f27' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E";

/* --------------------------------------------------------------- documents */
const body = `<div id="app" class="app"></div>\n${dataBlocks}\n<script>${js}</script>`;

const document_ = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${TITLE}</title>
<meta name="description" content="${DESCRIPTION}">
<meta name="theme-color" content="#efe7d4">
<link rel="icon" href="${icon}">
<style>${css}</style>
</head>
<body>
${body}
</body>
</html>
`;

const fragment = `<title>${TITLE}</title>\n<style>${css}</style>\n${body}\n`;

writeFileSync(join(OUT, 'ayni-zamanda.html'), document_);
writeFileSync(join(OUT, 'ayni-zamanda.fragment.html'), fragment);
rmSync(PARTS, { recursive: true, force: true });

const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;
console.log(`ayni-zamanda.html           ${mb(Buffer.byteLength(document_))}`);
console.log(`ayni-zamanda.fragment.html  ${mb(Buffer.byteLength(fragment))}`);
console.log(`(${dataBlocks.split('\n').length} veri dosyası, ${mb(Buffer.byteLength(js))} betik, ${mb(Buffer.byteLength(css))} stil)`);
