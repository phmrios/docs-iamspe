// Extrai métricas e cobertura de caracteres das fontes incorporadas.
// O resultado (assets/fonts/metrics.json) alimenta o motor de composição:
// seleção de fonte por caractere, linha de base e validação das medidas do Canvas.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fontkit from '@pdf-lib/fontkit';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fontsDir = path.join(root, 'assets/fonts');

const FILES = {
  regular: 'LiberationMono-Regular.ttf',
  bold: 'LiberationMono-Bold.ttf',
  fallback: 'DejaVuSansMono.ttf',
};

function toRanges(codePoints) {
  const sorted = [...codePoints].sort((a, b) => a - b);
  const ranges = [];
  for (const cp of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && cp === last[1] + 1) last[1] = cp;
    else ranges.push([cp, cp]);
  }
  return ranges.flat();
}

const out = {};
for (const [key, file] of Object.entries(FILES)) {
  const font = fontkit.create(readFileSync(path.join(fontsDir, file)));
  const upm = font.unitsPerEm;
  const space = font.glyphForCodePoint(0x20).advanceWidth;
  const covered = [];
  const zeroWidth = [];
  const odd = {};
  for (const cp of font.characterSet) {
    // Controles não são texto: ficam fora da cobertura.
    if (cp < 0x20 || (cp >= 0x7f && cp < 0xa0)) continue;
    const glyph = font.glyphForCodePoint(cp);
    if (!glyph || glyph.id === 0) continue;
    covered.push(cp);
    const adv = glyph.advanceWidth;
    if (adv === 0) zeroWidth.push(cp);
    else if (adv !== space) odd[cp] = adv;
  }
  out[key] = {
    file,
    family: font.familyName,
    unitsPerEm: upm,
    ascent: font.hhea.ascent / upm,
    descent: -font.hhea.descent / upm,
    lineGap: font.hhea.lineGap / upm,
    advance: space / upm,
    coverage: toRanges(covered),
    zeroWidth: toRanges(zeroWidth),
    oddAdvances: odd,
  };
  console.log(
    `${key}: ${font.familyName} upm=${upm} asc=${font.hhea.ascent} desc=${font.hhea.descent} ` +
      `adv=${space} glyphs=${covered.length} zero=${zeroWidth.length} odd=${Object.keys(odd).length} ` +
      `os2=${font['OS/2'].winAscent}/${font['OS/2'].winDescent} typo=${font['OS/2'].typoAscender}/${font['OS/2'].typoDescender} fsSel=${font['OS/2'].fsSelection ? JSON.stringify(font['OS/2'].fsSelection) : ''}`,
  );
}
writeFileSync(path.join(fontsDir, 'metrics.json'), JSON.stringify(out));
