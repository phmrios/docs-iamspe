// Compila o projeto em um único arquivo HTML autossuficiente (dist/receituario.html):
// JavaScript e dependências reunidos pelo esbuild; CSS, fontes e dicionário incorporados.
import { build, context } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const watch = process.argv.includes('--watch');
const outFile = path.join(root, 'dist/receituario.html');

const FONT_FILES = { regular: 'LiberationMono-Regular.ttf', bold: 'LiberationMono-Bold.ttf', fallback: 'DejaVuSansMono.ttf' };

function assemble(js) {
  const template = readFileSync(path.join(root, 'src/ui/index.html'), 'utf8');
  const css = readFileSync(path.join(root, 'src/ui/styles.css'), 'utf8');
  const fonts = {};
  for (const [key, file] of Object.entries(FONT_FILES)) {
    fonts[key] = readFileSync(path.join(root, 'assets/fonts', file)).toString('base64');
  }
  // "</script" dentro do código encerraria o elemento antes da hora.
  const safeJs = js.replace(/<\/script/gi, '<\\/script');
  const html = template
    .replaceAll('__MOD__', 'Ctrl/⌘')
    .replace('/*__CSS__*/', () => css)
    .replace('/*__FONTS__*/', () => `window.__RX_FONTS__=${JSON.stringify(fonts)};`)
    .replace('/*__JS__*/', () => safeJs);
  mkdirSync(path.dirname(outFile), { recursive: true });
  writeFileSync(outFile, html);
  console.log(`dist/receituario.html  ${(statSync(outFile).size / 1024 / 1024).toFixed(2)} MB`);
}

const options = {
  entryPoints: [path.join(root, 'src/main.js')],
  bundle: true,
  write: false,
  format: 'iife',
  target: ['es2022'],
  minify: !watch,
  legalComments: 'none',
  charset: 'utf8',
  loader: { '.txt': 'text', '.json': 'json' },
  logLevel: 'warning',
};

if (watch) {
  const ctx = await context({
    ...options,
    plugins: [{ name: 'assemble', setup(b) { b.onEnd((result) => { if (!result.errors.length) assemble(result.outputFiles[0].text); }); } }],
  });
  await ctx.watch();
  console.log('Observando alterações…');
} else {
  const result = await build(options);
  assemble(result.outputFiles[0].text);
}
