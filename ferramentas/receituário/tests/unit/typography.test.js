import { describe, test, expect } from 'vitest';
import { breakParagraph, textOfLines, FIT_EPSILON } from '../../src/typography/linebreak.js';
import { createHyphenator, breakOpportunities, parseDictionary, MEDICAL_DICTIONARY } from '../../src/typography/hyphenation.js';
import { splitRuns, missingCharacters, fontHasCodePoint, baselineOffset, FONTS } from '../../src/typography/fonts.js';
import { createMetricsMeasurer, checkMeasurer } from '../../src/typography/measure.js';
import { CONTENT_WIDTH, TEXT } from '../../src/pagination/geometry.js';
import { measurer, hyphenator, LOREM } from '../fixtures/env.js';

const opts = (extra = {}) => ({ width: CONTENT_WIDTH, measurer, size: TEXT.size, hyphenator, ...extra });
const CHAR = measurer.measure('0', 'regular', TEXT.size);
const h = createHyphenator();
const visible = (text, line) => text.slice(line.start, line.end) + (line.hyphen ? '-' : '');

describe('medição', () => {
  test('avanço da Liberation Mono a 11 pt', () => {
    expect(CHAR).toBeCloseTo((1229 / 2048) * TEXT.size, 6);
    expect(measurer.measure('abc', 'regular', TEXT.size)).toBeCloseTo(3 * CHAR, 6);
  });
  test('73 caracteres cabem na largura útil de 170 mm', () => {
    expect(Math.floor((CONTENT_WIDTH + FIT_EPSILON) / CHAR)).toBe(73);
  });
  test('marcas combinantes não avançam', () => {
    expect(measurer.measure('ã', 'regular', TEXT.size)).toBeCloseTo(CHAR, 6);
  });
  test('o medidor de referência confere consigo mesmo', () => {
    expect(checkMeasurer(createMetricsMeasurer(), TEXT.size)).toEqual([]);
    const wrong = { measure: (t, f, s) => measurer.measure(t, f, s) * 1.2 };
    expect(checkMeasurer(wrong, TEXT.size).length).toBeGreaterThan(0);
  });
  test('linha de base centraliza a caixa da fonte na entrelinha', () => {
    const f = FONTS.regular;
    const expected = (TEXT.lineHeight - (f.ascent + f.descent) * TEXT.size) / 2 + f.ascent * TEXT.size;
    expect(baselineOffset('regular', TEXT.size, TEXT.lineHeight)).toBeCloseTo(expected, 9);
  });
});

describe('fontes e caracteres especiais', () => {
  test('símbolos clínicos têm glifo na fonte principal', () => {
    for (const ch of 'µ°±%αβγΩ≤≥×÷½¼') expect(fontHasCodePoint('regular', ch.codePointAt(0)), ch).toBe(true);
  });
  test('seleção de fonte por caractere, sem alterar o texto', () => {
    const text = 'ok ✓ fim';
    const runs = splitRuns(text);
    expect(runs.map((r) => r.font)).toEqual(['regular', 'fallback', 'regular']);
    expect(runs.map((r) => r.text).join('')).toBe(text);
    expect(runs[1]).toMatchObject({ text: '✓', start: 3, end: 4 });
  });
  test('acento combinante acompanha a letra', () => {
    const runs = splitRuns('é');
    expect(runs).toHaveLength(1);
  });
  test('caracteres sem representação são identificados, não descartados', () => {
    expect([...missingCharacters('dose 😀 ok')]).toEqual(['😀']);
    expect(missingCharacters('dose µg').size).toBe(0);
    const lines = breakParagraph('a 😀 b', opts());
    expect(textOfLines('a 😀 b', lines)).toBe('a 😀 b');
    expect(lines[0].segs.some((s) => s.font === 'missing')).toBe(true);
  });
});

describe('quebra de linhas', () => {
  test('parágrafo vazio tem uma linha', () => {
    const lines = breakParagraph('', opts());
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ start: 0, end: 0, hard: false, hyphen: false });
  });
  test('uma linha curta', () => {
    const lines = breakParagraph('Dipirona 1 g', opts());
    expect(lines).toHaveLength(1);
    expect(lines[0].width).toBeCloseTo(12 * CHAR, 6);
    expect(lines[0].segs).toHaveLength(1);
  });
  test('nenhuma linha ultrapassa a largura e o texto é reconstruído integralmente', () => {
    const text = `${LOREM} ${LOREM}`;
    const lines = breakParagraph(text, opts());
    expect(lines.length).toBeGreaterThan(3);
    for (const line of lines) expect(line.width).toBeLessThanOrEqual(CONTENT_WIDTH + FIT_EPSILON);
    expect(textOfLines(text, lines)).toBe(text);
  });
  test('espaços finais ficam pendentes na linha anterior', () => {
    const text = `${'a'.repeat(70)}   ${'b'.repeat(10)}`;
    const lines = breakParagraph(text, opts({ hyphenator: null }));
    expect(lines).toHaveLength(2);
    expect(text.slice(lines[0].start, lines[0].end)).toBe(`${'a'.repeat(70)}   `);
    expect(lines[0].hangFrom).toBe(70);
    expect(lines[0].width).toBeCloseTo(70 * CHAR, 6);
    expect(lines[1].start).toBe(73);
  });
  test('quebra simples (Shift+Enter) e linhas vazias consecutivas', () => {
    const text = 'a\n\n\nb\n';
    const lines = breakParagraph(text, opts());
    expect(lines.map((l) => text.slice(l.start, l.end))).toEqual(['a\n', '\n', '\n', 'b\n', '']);
    expect(lines.map((l) => l.hard)).toEqual([true, true, true, true, false]);
  });
  test('sequência maior que a linha é dividida sem hífen e sem perder caracteres', () => {
    const text = 'X'.repeat(200);
    const lines = breakParagraph(text, opts());
    expect(lines.map((l) => l.end - l.start)).toEqual([73, 73, 54]);
    expect(lines.every((l) => !l.hyphen)).toBe(true);
    expect(textOfLines(text, lines)).toBe(text);
  });
  test('palavra que não cabe passa inteira para a linha seguinte', () => {
    const text = `${'a'.repeat(68)} 500mg/5mL`;
    const lines = breakParagraph(text, opts());
    expect(lines).toHaveLength(2);
    expect(text.slice(lines[1].start, lines[1].end)).toBe('500mg/5mL');
    expect(lines[0].hyphen).toBe(false);
  });
  test('recuo da primeira linha (rótulo permanente)', () => {
    const indent = 10 * CHAR;
    const lines = breakParagraph('a'.repeat(63), opts({ indent, hyphenator: null }));
    expect(lines).toHaveLength(1);
    expect(lines[0].segs[0].x).toBeCloseTo(indent, 6);
    const wrapped = breakParagraph(`${'a'.repeat(60)} ${'b'.repeat(10)}`, opts({ indent, hyphenator: null }));
    expect(wrapped).toHaveLength(2);
    expect(wrapped[1].segs[0].x).toBe(0);
  });
});

describe('tabulações', () => {
  test('paradas a cada dois caracteres', () => {
    const lines = breakParagraph('\tA\tBC\tD', opts());
    const line = lines[0];
    expect(line.tabs.map((t) => t.width / CHAR)).toEqual([2, 1, 2].map((n) => expect.closeTo(n, 6)));
    expect(line.segs.map((s) => s.x / CHAR)).toEqual([2, 4, 8].map((n) => expect.closeTo(n, 6)));
  });
  test('tabulação é preservada no texto lógico', () => {
    const text = 'a\t\tb';
    expect(textOfLines(text, breakParagraph(text, opts()))).toBe(text);
  });
  test('tabulação nunca ultrapassa a margem', () => {
    const text = `${'a'.repeat(72)}\t\tb`;
    const lines = breakParagraph(text, opts());
    expect(lines[0].tabs).toHaveLength(2);
    expect(lines[0].advance).toBeLessThanOrEqual(CONTENT_WIDTH + 1e-9);
    expect(text.slice(lines[1].start, lines[1].end)).toBe('b');
  });
});

describe('hifenização', () => {
  test('regras silábicas do português', () => {
    const word = 'preferencialmente';
    const parts = [];
    let last = 0;
    for (const p of h.points(word)) {
      parts.push(word.slice(last, p));
      last = p;
    }
    parts.push(word.slice(last));
    expect(parts.join('')).toBe(word);
    expect(parts.length).toBeGreaterThan(3);
    expect(parts[0].length).toBeGreaterThanOrEqual(2);
    expect(parts[parts.length - 1].length + (parts.length > 1 ? 0 : 0)).toBeGreaterThanOrEqual(2);
  });
  test('mínimos: 2 letras antes, 3 depois; palavras curtas inteiras', () => {
    for (const p of h.points('diariamente')) {
      expect(p).toBeGreaterThanOrEqual(2);
      expect('diariamente'.length - p).toBeGreaterThanOrEqual(3);
    }
    expect(h.points('horas')).toEqual([]);
  });
  test('hífen visual: o texto lógico não muda', () => {
    const text = `${'a'.repeat(62)} preferencialmente depois`;
    const lines = breakParagraph(text, opts());
    expect(lines[0].hyphen).toBe(true);
    expect(visible(text, lines[0]).endsWith('-')).toBe(true);
    expect(textOfLines(text, lines)).toBe(text);
    expect(text.includes('-')).toBe(false);
    expect(lines[0].width + 0).toBeLessThanOrEqual(CONTENT_WIDTH + FIT_EPSILON - CHAR + 1e-6);
  });
  test('hífen digitado pelo usuário é distinguido do hífen visual', () => {
    const text = `${'a'.repeat(66)} anti-inflamatório`;
    const lines = breakParagraph(text, opts());
    expect(text.slice(lines[0].start, lines[0].end).endsWith('anti-')).toBe(true);
    expect(lines[0].hyphen).toBe(false);
    expect(breakOpportunities('anti-inflamatório', h)[0]).toEqual({ at: 5, hyphen: false });
  });
});

describe('dicionário médico', () => {
  test('carregado do arquivo incorporado', () => {
    expect(MEDICAL_DICTIONARY.size).toBeGreaterThan(400);
    expect(MEDICAL_DICTIONARY.has('amoxicilina')).toBe(true);
    expect(MEDICAL_DICTIONARY.has('mg/kg')).toBe(true);
  });
  test('formato do arquivo: comentários e termos compostos', () => {
    const set = parseDictionary('# c\nÁcido Fólico\n\n  dipirona  ');
    expect([...set].sort()).toEqual(['dipirona', 'fólico', 'ácido'].sort());
  });
  test('medicamentos, siglas e doses nunca são hifenizados', () => {
    expect(h.points('amoxicilina')).toEqual([]);
    expect(h.points('Amoxicilina')).toEqual([]);
    expect(h.points('PARACETAMOL')).toEqual([]);
    expect(h.isProtected('Losartana')).toBe(true);
    expect(breakOpportunities('500mg/5mL', h)).toEqual([]);
    expect(breakOpportunities('B12', h)).toEqual([]);
    const text = `${'a'.repeat(64)} hidroclorotiazida`;
    const lines = breakParagraph(text, opts());
    expect(text.slice(lines[1].start, lines[1].end)).toBe('hidroclorotiazida');
    expect(lines[0].hyphen).toBe(false);
  });
  test('o dicionário não altera nem sugere palavras', () => {
    const text = 'amoxicilna dipirnoa';
    expect(textOfLines(text, breakParagraph(text, opts()))).toBe(text);
  });
});
