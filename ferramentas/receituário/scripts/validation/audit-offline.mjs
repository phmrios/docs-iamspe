// Auditoria do artefato final: dist/receituario.html precisa ser autossuficiente,
// não pode referenciar recursos externos nem usar armazenamento ou rede.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const file = path.join(root, 'dist/receituario.html');
const html = readFileSync(file, 'utf8');
const problems = [];
const notes = [];
const check = (ok, message) => (ok ? notes.push(`ok  ${message}`) : problems.push(message));

// 1. Nenhum elemento carrega recurso externo.
const tags = html.match(/<(script|link|img|iframe|source|video|audio|object|embed)\b[^>]*>/gi) || [];
const external = tags.filter((tag) => /\b(src|href|data)\s*=\s*["']?(?!data:|blob:|#)/i.test(tag));
check(external.length === 0, `elementos com recurso externo: ${external.length}${external.length ? ` → ${external.slice(0, 3).join(' ')}` : ''}`);
check(!/@import\b/.test(html), 'CSS sem @import');
check(!/url\(\s*["']?https?:/i.test(html), 'CSS sem url() remota');
check(!/@font-face/.test(html), 'fontes registradas a partir dos bytes incorporados (sem @font-face remoto)');

// 2. Política de segurança de conteúdo que bloqueia qualquer conexão.
const csp = (/http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html) || [])[1] || '';
check(/default-src 'none'/.test(csp), "CSP: default-src 'none'");
check(/connect-src 'none'/.test(csp), "CSP: connect-src 'none'");
check(!/https?:/.test(csp), 'CSP sem origens remotas');

// 3. O código não usa APIs de rede nem de armazenamento persistente.
const script = html.slice(html.lastIndexOf('<script>'));
const banned = {
  'fetch(': /(?<![\w$.])fetch\s*\(/,
  XMLHttpRequest: /XMLHttpRequest/,
  WebSocket: /WebSocket/,
  sendBeacon: /sendBeacon/,
  EventSource: /EventSource/,
  'new Worker': /new\s+(Shared)?Worker\b/,
  OffscreenCanvas: /OffscreenCanvas/,
  serviceWorker: /serviceWorker/,
  localStorage: /localStorage/,
  sessionStorage: /sessionStorage/,
  indexedDB: /indexedDB/,
  'document.cookie': /document\.cookie/,
  'import(': /(?<![\w$.])import\s*\(/,
};
for (const [name, pattern] of Object.entries(banned)) check(!pattern.test(script), `código sem ${name}`);

// 4. Recursos incorporados presentes.
check(/window\.__RX_FONTS__=\{"regular":"AAEAAA/.test(html), 'fontes TTF incorporadas em base64');
check(html.includes('amoxicilina'), 'dicionário médico incorporado');
check(html.includes('rx-topbar'), 'CSS e HTML da interface incorporados');

// 5. URLs literais restantes (identificadores de namespace das bibliotecas, não acessados).
const urls = [...new Set(script.match(/https?:\/\/[^\s"'`)\\<]+/g) || [])];
notes.push(`URLs literais no código (apenas identificadores, nunca requisitados): ${urls.length}`);
for (const url of urls.slice(0, 12)) notes.push(`    ${url}`);

console.log(`dist/receituario.html — ${(html.length / 1024 / 1024).toFixed(2)} MB`);
for (const note of notes) console.log(note);
if (problems.length) {
  console.error('\nFALHAS:');
  for (const problem of problems) console.error(`  ✗ ${problem}`);
  process.exit(1);
}
console.log('\nAuditoria offline: sem pendências.');
