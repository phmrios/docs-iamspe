import { describe, test, expect } from 'vitest';
import {
  fitSignature, isInsideRegion, defaultPlacement, rotatedHalfExtent, normalizeAngle, resizeFromPointer, angleFromPointer,
  pdfImageOrigin, MIN_SIGNATURE_SIZE,
} from '../../src/signature/geometry.js';
import { removeWhiteBackground, isPng } from '../../src/signature/background.js';
import { SIGNATURE_REGION, SIGNATURE_LINE, FOOTER_TOP, BODY_BOTTOM, PAGE } from '../../src/pagination/geometry.js';
import { pxToMm } from '../../src/utils/units.js';
import { TINY_PNG } from '../fixtures/env.js';

const R = SIGNATURE_REGION;

describe('posicionamento de assinaturas', () => {
  test('a região reservada fica no rodapé e não alcança a prescrição', () => {
    expect(R.y).toBeCloseTo(FOOTER_TOP, 9);
    expect(R.y).toBeGreaterThan(BODY_BOTTOM);
    expect(pxToMm(R.width)).toBeCloseTo(170, 6);
    expect(R.y + R.height).toBeGreaterThan(SIGNATURE_LINE.y);
  });
  test('posição inicial: centralizada, apoiada na linha, dentro da região', () => {
    const s = defaultPlacement(600, 200);
    expect(s.cx).toBeCloseTo(PAGE.width / 2, 6);
    expect(s.width / s.height).toBeCloseTo(3, 6);
    expect(isInsideRegion(s)).toBe(true);
    expect(s.cy + s.height / 2).toBeGreaterThan(SIGNATURE_LINE.y - 1);
  });
  test('arrastar para fora é contido nos limites', () => {
    const base = defaultPlacement(600, 200);
    for (const [cx, cy] of [[-500, -500], [5000, 5000], [PAGE.width / 2, 0], [0, FOOTER_TOP + 30]]) {
      const s = fitSignature({ ...base, cx, cy });
      expect(isInsideRegion(s)).toBe(true);
      expect(s.width).toBeCloseTo(base.width, 6);
    }
  });
  test('imagem grande demais é reduzida mantendo a proporção', () => {
    const s = fitSignature({ cx: 400, cy: FOOTER_TOP + 20, width: 3000, height: 1000, rotation: 0 });
    expect(isInsideRegion(s)).toBe(true);
    expect(s.width / s.height).toBeCloseTo(3, 6);
    expect(s.height).toBeCloseTo(R.height, 4);
  });
  test('qualquer rotação continua dentro da área', () => {
    const base = defaultPlacement(600, 200);
    for (let angle = -180; angle <= 180; angle += 15) {
      const s = fitSignature({ ...base, rotation: angle });
      expect(isInsideRegion(s), `ângulo ${angle}`).toBe(true);
    }
    const { ex, ey } = rotatedHalfExtent(100, 40, 90);
    expect(ex).toBeCloseTo(20, 6);
    expect(ey).toBeCloseTo(50, 6);
  });
  test('ângulos', () => {
    expect(normalizeAngle(370)).toBe(10);
    expect(normalizeAngle(-190)).toBe(170);
    expect(normalizeAngle(NaN)).toBe(0);
    const s = { cx: 100, cy: 100 };
    expect(angleFromPointer(s, { x: 100, y: 0 })).toBeCloseTo(0, 6);
    expect(angleFromPointer(s, { x: 200, y: 100 })).toBeCloseTo(90, 6);
    expect(angleFromPointer(s, { x: 0, y: 100 })).toBeCloseTo(-90, 6);
  });
  test('redimensionar preserva centro e proporção, com tamanho mínimo', () => {
    const s = { cx: 100, cy: 100, width: 60, height: 20, rotation: 0 };
    const bigger = resizeFromPointer(s, { x: 130, y: 110 }, { x: 160, y: 120 });
    expect(bigger.width).toBeCloseTo(120, 6);
    expect(bigger.height).toBeCloseTo(40, 6);
    expect(bigger.cx).toBe(100);
    const tiny = resizeFromPointer(s, { x: 130, y: 110 }, { x: 100.01, y: 100 });
    expect(tiny.height).toBeGreaterThanOrEqual(MIN_SIGNATURE_SIZE - 1e-9);
    expect(tiny.width / tiny.height).toBeCloseTo(3, 6);
  });
  test('origem no PDF mantém o centro da imagem girada', () => {
    for (const rotation of [0, 30, 90, -45, 180]) {
      const box = { cx: 300, cy: 200, width: 120, height: 40, rotation };
      const o = pdfImageOrigin(box);
      const a = (rotation * Math.PI) / 180;
      const cx = o.x + (60 * Math.cos(a) - 20 * Math.sin(a));
      const cy = o.y + (60 * Math.sin(a) + 20 * Math.cos(a));
      expect(cx).toBeCloseTo(300, 6);
      expect(cy).toBeCloseTo(200, 6);
    }
  });
});

describe('remoção de fundo branco', () => {
  const px = (...v) => Uint8ClampedArray.from(v);
  test('branco e quase branco ficam transparentes', () => {
    const data = px(255, 255, 255, 255, 250, 249, 251, 255);
    const r = removeWhiteBackground(data);
    expect(data[3]).toBe(0);
    expect(data[7]).toBe(0);
    expect(r).toEqual({ changed: 2, total: 2 });
  });
  test('traços escuros e tinta colorida são preservados', () => {
    const data = px(0, 0, 0, 255, 20, 30, 120, 255, 200, 40, 40, 255, 120, 120, 120, 255);
    const copy = Array.from(data);
    expect(removeWhiteBackground(data).changed).toBe(0);
    expect(Array.from(data)).toEqual(copy);
  });
  test('borda suavizada vira transparência parcial, sem clarear o traço', () => {
    const data = px(225, 225, 225, 255);
    removeWhiteBackground(data);
    expect(data[3]).toBeGreaterThan(0);
    expect(data[3]).toBeLessThan(255);
    expect(data[0]).toBeLessThan(225);
  });
  test('pixels já transparentes não mudam', () => {
    const data = px(255, 255, 255, 0);
    expect(removeWhiteBackground(data).changed).toBe(0);
  });
  test('reconhece arquivos PNG pelo cabeçalho', () => {
    expect(isPng(TINY_PNG)).toBe(true);
    expect(isPng(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0]))).toBe(false);
  });
});
