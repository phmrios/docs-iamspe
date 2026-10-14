import { FONTS, cssFont, fontHasCodePoint } from './fonts.js';

const CACHE_LIMIT = 60000;

function withCache(measureRaw) {
  let cache = new Map();
  return (text, fontKey, sizePx) => {
    if (!text) return 0;
    const key = `${fontKey}|${sizePx}|${text}`;
    let width = cache.get(key);
    if (width === undefined) {
      width = measureRaw(text, fontKey, sizePx);
      if (cache.size >= CACHE_LIMIT) cache = new Map();
      cache.set(key, width);
    }
    return width;
  };
}

/**
 * Medidor de referência: Canvas 2D `measureText()`.
 * As fontes precisam estar carregadas antes da primeira medição.
 */
export function createCanvasMeasurer(doc = document) {
  const canvas = doc.createElement('canvas');
  const ctx = canvas.getContext('2d');
  let current = '';
  const measure = withCache((text, fontKey, sizePx) => {
    const font = cssFont(fontKey, sizePx);
    if (font !== current) {
      ctx.font = font;
      current = font;
      if ('fontKerning' in ctx) ctx.fontKerning = 'none';
      if ('textRendering' in ctx) ctx.textRendering = 'geometricPrecision';
    }
    return ctx.measureText(text).width;
  });
  return { kind: 'canvas', measure };
}

const MARK = /\p{M}/u;

/**
 * Medidor baseado nas tabelas de avanço das fontes incorporadas.
 * É o que os testes usam fora do navegador e a referência para validar o Canvas.
 */
export function createMetricsMeasurer() {
  const zero = new Map();
  const isZeroWidth = (fontKey, cp) => {
    let set = zero.get(fontKey);
    if (!set) {
      set = new Set();
      const ranges = FONTS[fontKey].zeroWidth || [];
      for (let i = 0; i < ranges.length; i += 2) for (let c = ranges[i]; c <= ranges[i + 1]; c++) set.add(c);
      zero.set(fontKey, set);
    }
    return set.has(cp);
  };
  const measure = withCache((text, fontKey, sizePx) => {
    const font = FONTS[fontKey];
    let units = 0;
    for (const ch of text) {
      const cp = ch.codePointAt(0);
      if (isZeroWidth(fontKey, cp) || MARK.test(ch)) continue;
      if (cp >= 0xfe00 && cp <= 0xfe0f) continue;
      units += font.advance;
    }
    return units * sizePx;
  });
  return { kind: 'metrics', measure };
}

/**
 * Compara o medidor em uso com as tabelas das fontes. Divergência relevante indica
 * fonte não carregada ou substituída pelo navegador.
 * @returns {{fontKey: string, expected: number, actual: number}[]}
 */
export function checkMeasurer(measurer, sizePx) {
  const reference = createMetricsMeasurer();
  const problems = [];
  const samples = { regular: 'Receituário 0123456789 mg/kg', bold: 'RECEITUÁRIO MÉDICO', fallback: '✓✓✓✓✓✓✓✓' };
  for (const [fontKey, sample] of Object.entries(samples)) {
    for (const ch of sample) {
      if (!fontHasCodePoint(fontKey, ch.codePointAt(0))) throw new Error(`amostra inválida para ${fontKey}`);
    }
    const expected = reference.measure(sample, fontKey, sizePx);
    const actual = measurer.measure(sample, fontKey, sizePx);
    if (Math.abs(actual - expected) > expected * 0.01) problems.push({ fontKey, expected, actual });
  }
  return problems;
}
