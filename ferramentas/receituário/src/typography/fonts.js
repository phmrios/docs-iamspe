import metrics from '../../assets/fonts/metrics.json';
import { graphemes } from '../utils/text.js';

/**
 * Fontes incorporadas. `regular` e `bold` são a Liberation Mono; `fallback` cobre
 * caracteres que ela não tem. `missing` identifica caracteres sem glifo em nenhuma
 * delas: são desenhados com a fonte do sistema na tela e geram aviso técnico.
 */
export const FONTS = {
  regular: { ...metrics.regular, key: 'regular', family: 'RX Mono', weight: 400 },
  bold: { ...metrics.bold, key: 'bold', family: 'RX Mono', weight: 700 },
  fallback: { ...metrics.fallback, key: 'fallback', family: 'RX Fallback', weight: 400 },
  missing: {
    key: 'missing',
    family: 'monospace',
    weight: 400,
    unitsPerEm: metrics.regular.unitsPerEm,
    ascent: metrics.regular.ascent,
    descent: metrics.regular.descent,
    advance: metrics.regular.advance,
    coverage: [],
    zeroWidth: [],
  },
};

export const MISSING_FONT_STACK = 'monospace, sans-serif';

/** Valor de `font` para Canvas 2D e CSS. */
export function cssFont(fontKey, sizePx) {
  const font = FONTS[fontKey];
  const family = fontKey === 'missing' ? MISSING_FONT_STACK : `"${font.family}"`;
  return `${font.weight} ${sizePx}px ${family}`;
}

function inRanges(ranges, cp) {
  let lo = 0;
  let hi = ranges.length / 2 - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cp < ranges[mid * 2]) hi = mid - 1;
    else if (cp > ranges[mid * 2 + 1]) lo = mid + 1;
    else return true;
  }
  return false;
}

const bitmaps = new Map();
function bmpBitmap(fontKey) {
  let bitmap = bitmaps.get(fontKey);
  if (!bitmap) {
    bitmap = new Uint8Array(0x10000);
    const ranges = FONTS[fontKey].coverage;
    for (let i = 0; i < ranges.length; i += 2) {
      for (let cp = ranges[i]; cp <= Math.min(ranges[i + 1], 0xffff); cp++) bitmap[cp] = 1;
    }
    bitmaps.set(fontKey, bitmap);
  }
  return bitmap;
}

export function fontHasCodePoint(fontKey, cp) {
  if (cp <= 0xffff) return bmpBitmap(fontKey)[cp] === 1;
  return inRanges(FONTS[fontKey].coverage, cp);
}

// Caracteres sem forma própria (seletores de variação, junções): não decidem a fonte.
function isIgnorable(cp) {
  return (cp >= 0x200b && cp <= 0x200f) || (cp >= 0xfe00 && cp <= 0xfe0f) || cp === 0x2060 || cp === 0xfeff;
}

export function fontHasCluster(fontKey, cluster) {
  for (const ch of cluster) {
    const cp = ch.codePointAt(0);
    if (isIgnorable(cp)) continue;
    if (!fontHasCodePoint(fontKey, cp)) return false;
  }
  return true;
}

const ASCII_ONLY = /^[\x20-\x7e]*$/;

/**
 * Divide o texto em sequências desenhadas com a mesma fonte.
 * A escolha é feita por grafema: nunca separa uma letra do seu acento.
 * @returns {{text: string, font: string, start: number, end: number}[]}
 */
export function splitRuns(text, preferred = 'regular') {
  if (!text) return [];
  if (ASCII_ONLY.test(text)) return [{ text, font: preferred, start: 0, end: text.length }];
  const runs = [];
  let offset = 0;
  for (const cluster of graphemes(text)) {
    const font = fontHasCluster(preferred, cluster)
      ? preferred
      : fontHasCluster('fallback', cluster)
        ? 'fallback'
        : 'missing';
    const last = runs[runs.length - 1];
    if (last && last.font === font) {
      last.text += cluster;
      last.end += cluster.length;
    } else {
      runs.push({ text: cluster, font, start: offset, end: offset + cluster.length });
    }
    offset += cluster.length;
  }
  return runs;
}

/** Caracteres do texto que não têm glifo em nenhuma fonte incorporada. */
export function missingCharacters(text) {
  const found = new Set();
  if (!text || ASCII_ONLY.test(text)) return found;
  for (const run of splitRuns(text.replace(/[\n\t]/g, ''))) {
    if (run.font === 'missing') for (const cluster of graphemes(run.text)) found.add(cluster);
  }
  return found;
}

/**
 * Posição da linha de base dentro de uma caixa de linha de altura `lineHeight`:
 * o entrelinhamento excedente é dividido igualmente acima e abaixo (modelo CSS).
 */
export function baselineOffset(fontKey, sizePx, lineHeight) {
  const font = FONTS[fontKey];
  return (lineHeight - (font.ascent + font.descent) * sizePx) / 2 + font.ascent * sizePx;
}
