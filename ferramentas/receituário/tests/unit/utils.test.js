import { describe, test, expect } from 'vitest';
import { mm, pt, pxToPt, pxToMm } from '../../src/utils/units.js';
import { todayISO, formatDateLong, formatDateFile, isValidISO } from '../../src/utils/date.js';
import { normalizePlainText, normalizeSingleLine, graphemes, stripAccents } from '../../src/utils/text.js';
import { pdfFileName } from '../../src/pdf/filename.js';
import { PAGE, CONTENT_WIDTH, CONTENT_HEIGHT, FOOTER, FOOTER_TOP, BODY_BOTTOM, TEXT } from '../../src/pagination/geometry.js';

describe('conversão de unidades', () => {
  test('A4 em px lógicos e em pontos', () => {
    expect(mm(25.4)).toBeCloseTo(96, 10);
    expect(pt(72)).toBeCloseTo(96, 10);
    expect(pxToPt(PAGE.width)).toBeCloseTo(595.2756, 3);
    expect(pxToPt(PAGE.height)).toBeCloseTo(841.8898, 3);
    expect(pxToMm(mm(170))).toBeCloseTo(170, 10);
  });
  test('área útil, margens e rodapé do PRD', () => {
    expect(pxToMm(CONTENT_WIDTH)).toBeCloseTo(170, 6);
    expect(pxToMm(CONTENT_HEIGHT)).toBeCloseTo(257, 6);
    expect(pxToMm(FOOTER.height)).toBeCloseTo(45, 6);
    expect(pxToMm(FOOTER_TOP)).toBeCloseTo(232, 6);
    expect(pxToMm(FOOTER_TOP - BODY_BOTTOM)).toBeCloseTo(10, 6);
    expect(pxToPt(TEXT.size)).toBeCloseTo(11, 6);
    expect(TEXT.lineHeight / TEXT.size).toBeCloseTo(1.5, 6);
    expect(pxToPt(TEXT.paraGap)).toBeCloseTo(6, 6);
  });
});

describe('data', () => {
  test('formato longo sem cidade nem rótulo', () => {
    expect(formatDateLong('2026-10-13')).toBe('13 de outubro de 2026');
    expect(formatDateLong('2027-03-01')).toBe('1 de março de 2027');
  });
  test('data do dispositivo e formato do arquivo', () => {
    expect(todayISO(new Date(2026, 9, 13, 23, 59))).toBe('2026-10-13');
    expect(formatDateFile('2026-01-05')).toBe('05-01-2026');
  });
  test('datas inválidas', () => {
    expect(isValidISO('2026-02-30')).toBe(false);
    expect(isValidISO('13/10/2026')).toBe(false);
    expect(isValidISO('2024-02-29')).toBe(true);
    expect(formatDateLong('')).toBe('');
  });
});

describe('nome do PDF', () => {
  test('padrão do PRD', () => {
    expect(pdfFileName('João Silva', '2026-10-13')).toBe('Receituario_Joao_Silva_13-10-2026.pdf');
  });
  test('acentos, espaços e caracteres proibidos', () => {
    expect(pdfFileName('  Maria  Conceição d\'Ávila / Jr. ', '2026-10-13')).toBe('Receituario_Maria_Conceicao_d_Avila_Jr_13-10-2026.pdf');
    expect(pdfFileName('', '2026-10-13')).toBe('Receituario_13-10-2026.pdf');
    expect(pdfFileName('../../etc', '2026-10-13')).toBe('Receituario_etc_13-10-2026.pdf');
  });
});

describe('normalização de texto colado', () => {
  test('quebras de linha de qualquer origem viram \\n', () => {
    expect(normalizePlainText('a\r\nb\rc\nd')).toBe('a\nb\nc\nd');
    expect(normalizePlainText(`a${String.fromCharCode(0x2028)}b${String.fromCharCode(0x2029)}c`)).toBe('a\nb\nc');
  });
  test('preserva tabulações, linhas vazias e símbolos clínicos', () => {
    const text = 'Dose:\t500 µg ± 10%\n\n37 °C — αβ';
    expect(normalizePlainText(text)).toBe(text);
  });
  test('remove controles e invisíveis; espaço rígido vira espaço', () => {
    const dirty = `a${String.fromCharCode(0)}b${String.fromCharCode(0x200b)}c${String.fromCharCode(0xad)}d${String.fromCharCode(0xa0)}e${String.fromCharCode(0xfeff)}`;
    expect(normalizePlainText(dirty)).toBe('abcd e');
  });
  test('compõe acentos (NFC) sem trocar letras', () => {
    expect(normalizePlainText('ão')).toBe('ão');
  });
  test('campos de linha única', () => {
    expect(normalizeSingleLine('Hospital\nSão\tLucas')).toBe('Hospital São Lucas');
  });
  test('grafemas e acentos', () => {
    expect(graphemes('ãé').length).toBe(2);
    expect(stripAccents('Conceição')).toBe('Conceicao');
  });
});
