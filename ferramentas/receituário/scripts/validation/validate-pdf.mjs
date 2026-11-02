// Gera PDFs de amostra com o motor de composição real (fora do navegador) e os
// confere com ferramentas independentes do projeto, quando instaladas (poppler).
// Uso: npm run validate:pdf   → arquivos em validacao/
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(root, 'validacao');
mkdirSync(outDir, { recursive: true });

// Os módulos importam .txt e .json: o esbuild os reúne em um módulo executável pelo Node.
const bundle = path.join(outDir, '.motor.mjs');
await build({
  stdin: {
    contents: `
      export { createComposer } from './src/pagination/compose.js';
      export { createMetricsMeasurer } from './src/typography/measure.js';
      export { createHyphenator } from './src/typography/hyphenation.js';
      export { bodyFromText, bodyNodes } from './src/editor/schema.js';
      export { generateVerifiedPdf } from './src/pdf/generate.js';
      export { technicalWarnings } from './src/validation/validate.js';
      export { pdfFileName } from './src/pdf/filename.js';`,
    resolveDir: root,
  },
  bundle: true, format: 'esm', platform: 'node', outfile: bundle, loader: { '.txt': 'text' }, logLevel: 'error',
});
const engine = await import(bundle);

const fonts = Object.fromEntries(
  Object.entries({ regular: 'LiberationMono-Regular.ttf', bold: 'LiberationMono-Bold.ttf', fallback: 'DejaVuSansMono.ttf' }).map(([key, file]) => [
    key, new Uint8Array(readFileSync(path.join(root, 'assets/fonts', file))),
  ]),
);
const composer = engine.createComposer({ measurer: engine.createMetricsMeasurer(), hyphenator: engine.createHyphenator() });
const fields = { patient: 'João da Silva', doctor: 'Dra. Maria Souza', uf: 'SP', crm: '123456', place: 'Clínica Central' };
const item = 'Tomar um comprimido por via oral a cada oito horas, durante sete dias consecutivos, preferencialmente após as refeições principais, com um copo cheio de água.';
const samples = {
  simples: '1) Amoxicilina 500 mg ------------------------------ 21 comprimidos\nTomar um comprimido de 8/8 horas por 7 dias.\n\n2) Dipirona 1 g\n\tDose: 500 µg ± 10% a 37 °C ✓ αβγ',
  multipagina: Array.from({ length: 24 }, (_, i) => `${i + 1}) ${item}`).join('\n\n'),
  quebras: 'Primeira página\fSegunda página\f\fQuarta página',
};

const has = (tool) => {
  try {
    execFileSync(tool, ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};
const poppler = has('pdfinfo') && has('pdffonts') && has('pdftotext');
let failed = false;

for (const [name, text] of Object.entries(samples)) {
  const state = { fields, date: '2026-10-13', nodes: engine.bodyNodes(engine.bodyFromText(text)), signatures: {} };
  const composition = composer.compose(state);
  const warnings = engine.technicalWarnings(composition);
  const bytes = await engine.generateVerifiedPdf(composition, { fonts });
  const file = path.join(outDir, `${name}.pdf`);
  writeFileSync(file, bytes);
  console.log(`\n${name}.pdf — ${composition.pageCount} página(s), ${(bytes.length / 1024).toFixed(1)} kB, avisos técnicos: ${warnings.length}`);
  if (warnings.length) failed = true;
  if (!poppler) continue;
  const info = execFileSync('pdfinfo', [file], { encoding: 'utf8' });
  const pages = Number(/Pages:\s+(\d+)/.exec(info)[1]);
  const a4 = /Page size:\s+595\.2\d* x 841\.8\d* pts \(A4\)/.test(info);
  const fontTable = execFileSync('pdffonts', [file], { encoding: 'utf8' }).trim().split('\n').slice(2);
  const embedded = fontTable.every((line) => /\byes\b/.test(line.replace(/^\S+\s+(CID )?\S+\s+\S+\s+/, '')));
  const extracted = execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
  const words = text.split(/\s+/).filter((w) => w.length > 3);
  const missing = words.filter((w) => !extracted.includes(w) && !extracted.replace(/-\n\s*/g, '').includes(w));
  console.log(`  pdfinfo: ${pages} página(s), A4 ${a4 ? 'sim' : 'NÃO'} | pdffonts: ${fontTable.length} fonte(s), incorporadas ${embedded ? 'sim' : 'NÃO'} | pdftotext: ${words.length - missing.length}/${words.length} palavras localizadas`);
  if (pages !== composition.pageCount || !a4 || !embedded || missing.length) {
    failed = true;
    if (missing.length) console.log(`  não localizadas: ${missing.slice(0, 8).join(', ')}`);
  }
}
if (!poppler) console.log('\n(poppler não encontrado: conferência externa não executada)');
console.log(`\nNome de arquivo de exemplo: ${engine.pdfFileName(fields.patient, '2026-10-13')}`);
process.exit(failed ? 1 : 0);
