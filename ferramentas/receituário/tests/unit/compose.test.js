import { describe, test, expect } from 'vitest';
import { newComposer, docState, FIELDS, LOREM } from '../fixtures/env.js';
import { PAGE, CONTENT_WIDTH, FOOTER, FOOTER_TOP, FOOTER_BOTTOM, BODY_BOTTOM, SIGNATURE_LINE, TEXT, TITLE } from '../../src/pagination/geometry.js';
import { mm, pxToMm } from '../../src/utils/units.js';
import { technicalWarnings, paginationDiverges } from '../../src/validation/validate.js';
import { defaultPlacement } from '../../src/signature/geometry.js';
import { baselineOffset } from '../../src/typography/fonts.js';

const find = (page, role, text) => page.items.filter((i) => i.role === role && (text === undefined || i.text === text));
const long = (n) => Array.from({ length: n }, (_, i) => `${i + 1}) ${LOREM}`).join('\n\n');

describe('cálculo de coordenadas', () => {
  const comp = newComposer().compose(docState('Dipirona 1 g'));
  const page = comp.pages[0];

  test('título: Liberation Mono Bold 14 pt, centralizado, na margem superior', () => {
    const [title] = find(page, 'title');
    expect(title).toMatchObject({ text: 'RECEITUÁRIO MÉDICO', font: 'bold' });
    expect(title.size).toBeCloseTo(TITLE.size, 9);
    expect(title.x + title.width / 2).toBeCloseTo(PAGE.width / 2, 6);
    expect(title.top).toBeCloseTo(mm(20), 6);
  });
  test('paciente: rótulo permanente, 10 mm abaixo do título', () => {
    const [label] = find(page, 'label', 'PACIENTE:');
    expect(label.x).toBeCloseTo(mm(20), 6);
    expect(pxToMm(label.top - (mm(20) + TITLE.lineHeight))).toBeCloseTo(10, 6);
    const value = find(page, 'field').find((i) => i.field === 'patient');
    expect(value.text).toBe(FIELDS.patient);
    expect(value.x).toBeGreaterThan(label.x + label.width);
    expect(value.y).toBeCloseTo(label.y, 9);
  });
  test('linha divisória de 170 mm, 5 mm abaixo do paciente; prescrição 5 mm abaixo dela', () => {
    const [rule] = find(page, 'rule');
    expect(pxToMm(rule.x2 - rule.x1)).toBeCloseTo(170, 6);
    expect(rule.thickness).toBeCloseTo((0.5 * 96) / 72, 9);
    const patientBottom = comp.fields.patient.y + comp.fields.patient.height;
    expect(pxToMm(rule.y1 - patientBottom)).toBeCloseTo(5, 6);
    expect(pxToMm(comp.metrics.bodyTop - rule.y1)).toBeCloseTo(5, 6);
    expect(page.items.some((i) => i.type === 'text' && /PRESCRI/.test(i.text))).toBe(false);
  });
  test('prescrição: 11 pt, entrelinha 1,5, alinhada à margem esquerda', () => {
    const [line] = find(page, 'body');
    expect(line.text).toBe('Dipirona 1 g');
    expect(line.x).toBeCloseTo(mm(20), 6);
    expect(line.top).toBeCloseTo(comp.metrics.bodyTop, 6);
    expect(line.height).toBeCloseTo(22, 6);
    expect(line.y).toBeCloseTo(comp.metrics.bodyTop + baselineOffset('regular', TEXT.size, TEXT.lineHeight), 6);
  });
  test('faixa de segurança de 10 mm e rodapé de 45 mm', () => {
    expect(pxToMm(FOOTER_TOP - comp.metrics.bodyBottom)).toBeCloseTo(10, 6);
    expect(pxToMm(FOOTER_BOTTOM - FOOTER_TOP)).toBeCloseTo(45, 6);
    expect(pxToMm(PAGE.height - FOOTER_BOTTOM)).toBeCloseTo(20, 6);
  });
  test('rodapé: linha de 80 mm, nome 5 mm abaixo, CRM-UF, local e data', () => {
    const [sig] = find(page, 'sigline');
    expect(pxToMm(sig.x2 - sig.x1)).toBeCloseTo(80, 6);
    expect((sig.x1 + sig.x2) / 2).toBeCloseTo(PAGE.width / 2, 6);
    const fields = find(page, 'field');
    const doctor = fields.find((i) => i.field === 'doctor');
    expect(pxToMm(doctor.top - sig.y1)).toBeCloseTo(5, 6);
    expect(doctor.x + doctor.width / 2).toBeCloseTo(PAGE.width / 2, 6);
    const crm = fields.find((i) => i.field === 'crm');
    expect(crm.text).toBe('CRM-SP 123456');
    expect(crm.top - doctor.top).toBeCloseTo(FOOTER.lineHeight, 6);
    const [placeLabel] = find(page, 'label', 'LOCAL DE ATENDIMENTO:');
    const place = fields.find((i) => i.field === 'place');
    expect(place.text).toBe('Clínica Central');
    expect((placeLabel.x + place.x + place.width) / 2).toBeCloseTo(PAGE.width / 2, 6);
    const [date] = find(page, 'date');
    expect(date.text).toBe('13 de outubro de 2026');
    expect(date.x + date.width).toBeCloseTo(mm(190), 6);
    expect(date.top + date.height).toBeCloseTo(FOOTER_BOTTOM, 6);
  });
  test('todos os elementos ficam dentro das margens', () => {
    for (const p of newComposer().compose(docState(long(20))).pages) {
      for (const item of p.items.filter((i) => i.type === 'text')) {
        expect(item.x).toBeGreaterThanOrEqual(mm(20) - 1e-6);
        // Espaços finais ficam pendentes além da margem: só a parte visível conta.
        const ink = item.width * (item.text.trimEnd().length / item.text.length);
        expect(item.x + ink).toBeLessThanOrEqual(mm(190) + 0.5 + 1e-6);
        expect(item.top).toBeGreaterThanOrEqual(mm(20) - 1e-6);
        expect(item.top + item.height).toBeLessThanOrEqual(mm(277) + 1e-6);
      }
    }
  });
});

describe('paginação do documento', () => {
  test('documento vazio: uma página, sem numeração, rótulos permanentes presentes', () => {
    const comp = newComposer().compose(docState('', { fields: { patient: '', doctor: '', uf: '', crm: '', place: '' } }));
    expect(comp.pageCount).toBe(1);
    const page = comp.pages[0];
    expect(find(page, 'pageno')).toHaveLength(0);
    expect(find(page, 'label').map((i) => i.text)).toEqual(['PACIENTE:', 'LOCAL DE ATENDIMENTO:']);
    expect(find(page, 'field')).toHaveLength(0);
    expect(find(page, 'body')).toHaveLength(0);
    expect(technicalWarnings(comp)).toEqual([]);
  });
  test('todas as páginas repetem título, paciente, linha, rodapé e data; numeração só com mais de uma', () => {
    const comp = newComposer().compose(docState(long(20)));
    expect(comp.pageCount).toBeGreaterThan(2);
    comp.pages.forEach((page, i) => {
      expect(find(page, 'title')).toHaveLength(1);
      expect(find(page, 'rule')).toHaveLength(1);
      expect(find(page, 'sigline')).toHaveLength(1);
      expect(find(page, 'date')).toHaveLength(1);
      expect(find(page, 'field').map((f) => f.field).sort()).toEqual(['crm', 'doctor', 'patient', 'place']);
      const [number] = find(page, 'pageno');
      expect(number.text).toBe(`Página ${i + 1} de ${comp.pageCount}`);
      expect(number.x).toBeCloseTo(mm(20), 6);
      const [date] = find(page, 'date');
      expect(number.x + number.width).toBeLessThan(date.x);
    });
  });
  test('nenhuma linha invade a faixa de segurança; nenhuma se perde', () => {
    const text = long(25);
    const comp = newComposer().compose(docState(text));
    let lines = 0;
    for (const node of comp.body.nodes) {
      for (let k = 0; k < node.lines.length; k++) {
        lines += 1;
        expect(comp.metrics.bodyTop + node.lineY[k] + TEXT.lineHeight).toBeLessThanOrEqual(BODY_BOTTOM + 0.01);
      }
    }
    expect(lines).toBe(comp.pages.reduce((sum, p) => sum + p.lineCount, 0));
    const rebuilt = comp.body.nodes.map((n) => n.lines.map((l) => n.text.slice(l.start, l.end)).join('')).join('\n');
    expect(rebuilt).toBe(text);
    expect(technicalWarnings(comp)).toEqual([]);
  });
  test('quebra manual e exclusão de texto mudam a quantidade de páginas', () => {
    const composer = newComposer();
    expect(composer.compose(docState('a\fb\fc')).pageCount).toBe(3);
    expect(composer.compose(docState('a\fb')).pageCount).toBe(2);
    expect(composer.compose(docState('a')).pageCount).toBe(1);
  });
  test('nome de paciente extenso ocupa mais linhas e desloca a prescrição', () => {
    const composer = newComposer();
    const short = composer.compose(docState(long(12)));
    const name = 'Maria Aparecida '.repeat(8).trim();
    const tall = composer.compose(docState(long(12), { fields: { patient: name } }));
    expect(tall.fields.patient.lines.length).toBe(2);
    expect(tall.metrics.bodyTop - short.metrics.bodyTop).toBeCloseTo(TEXT.lineHeight, 6);
    expect(tall.metrics.bodyHeight).toBeLessThan(short.metrics.bodyHeight);
    expect(tall.pagination.recomputed).toBe(tall.body.nodes.length);
    expect(technicalWarnings(tall)).toEqual([]);
  });
  test('alterações no rodapé não mudam a paginação', () => {
    const composer = newComposer();
    const a = composer.compose(docState(long(12)));
    const b = composer.compose(docState(long(12), { fields: { doctor: 'Dr. Outro Nome Bem Mais Comprido', place: 'Outro lugar' } }));
    expect(paginationDiverges(a, b)).toBe(false);
  });
  test('composição de edição e final têm a mesma paginação', () => {
    const composer = newComposer();
    const state = docState(long(12), { fields: { uf: '', crm: '', place: '' } });
    const editing = composer.compose(state, { editing: true });
    const final = composer.compose(state, { editing: false });
    expect(paginationDiverges(editing, final)).toBe(false);
    expect(editing.fields.uf.width).toBeGreaterThan(0);
    expect(final.pages[0].items.some((i) => i.field === 'crm')).toBe(false);
    expect(editing.pages[0].items.some((i) => i.text === 'CRM-')).toBe(true);
  });
  test('edição no meio de várias páginas usa paginação incremental', () => {
    const composer = newComposer();
    const state = docState(long(40));
    const first = composer.compose(state);
    const nodes = state.nodes.slice();
    nodes[30] = { ...nodes[30], text: `${nodes[30].text} mais` };
    const second = composer.compose({ ...state, nodes });
    expect(second.pageCount).toBe(first.pageCount);
    expect(second.pagination.recomputed).toBeLessThan(10);
  });
});

describe('campos e avisos técnicos', () => {
  test('formatos do CRM', () => {
    const composer = newComposer();
    const crm = (fields) => composer.compose(docState('x', { fields })).pages[0].items.filter((i) => i.field === 'crm').map((i) => i.text).join('');
    expect(crm({ uf: 'SP', crm: '123456' })).toBe('CRM-SP 123456');
    expect(crm({ uf: '', crm: '123456' })).toBe('CRM 123456');
    expect(crm({ uf: 'RJ', crm: '' })).toBe('CRM-RJ');
    expect(crm({ uf: '', crm: '' })).toBe('');
  });
  test('local extenso ocupa mais de uma linha, centralizado', () => {
    const place = 'Hospital Universitário Professor Doutor Fulano de Tal, Ambulatório de Especialidades, Bloco C';
    const comp = newComposer().compose(docState('x', { fields: { place } }));
    expect(comp.fields.place.lines.length).toBe(2);
    const parts = comp.pages[0].items.filter((i) => i.field === 'place');
    const second = parts[parts.length - 1];
    expect(second.x + second.width / 2).toBeCloseTo(PAGE.width / 2, 4);
    expect(technicalWarnings(comp)).toEqual([]);
  });
  test('local que não cabe no rodapé gera aviso técnico (sem cortar o texto)', () => {
    const place = 'Unidade de atendimento muito distante '.repeat(8);
    const comp = newComposer().compose(docState('x', { fields: { place } }));
    expect(technicalWarnings(comp).map((w) => w.code)).toContain('footer-overflow');
    const drawn = comp.pages[0].items.filter((i) => i.field === 'place').map((i) => i.text).join('');
    expect(drawn.replace(/\s+/g, '')).toBe(place.replace(/\s+/g, ''));
  });
  test('caracteres sem representação tipográfica geram aviso', () => {
    const comp = newComposer().compose(docState('dose 😀'));
    const warning = technicalWarnings(comp).find((w) => w.code === 'missing-glyph');
    expect(warning.characters).toEqual(['😀']);
  });
  test('assinatura: item por página, dentro da área reservada', () => {
    const sig = { ...defaultPlacement(600, 200), id: 's1', aspect: 3, useProcessed: true };
    const comp = newComposer().compose(docState('a\fb', { signatures: { 1: sig, 5: sig } }));
    expect(comp.pages[0].items.some((i) => i.type === 'image')).toBe(false);
    const [image] = comp.pages[1].items.filter((i) => i.type === 'image');
    expect(image).toMatchObject({ id: 's1', variant: 'processed' });
    expect(image.cy - image.height / 2).toBeGreaterThanOrEqual(FOOTER_TOP - 1e-6);
    expect(image.cy + image.height / 2).toBeLessThan(SIGNATURE_LINE.y + mm(2) + 1e-6);
    expect(technicalWarnings(comp)).toEqual([]);
  });
  test('validação técnica detecta geometria inválida e elementos fora da página', () => {
    const comp = newComposer().compose(docState('x'));
    const broken = { ...comp, pages: [{ index: 0, items: [
      { type: 'text', role: 'body', text: 'x', x: NaN, y: 0, width: 1, size: 10, top: 0, height: 1 },
      { type: 'text', role: 'date', text: 'x', x: 5000, y: 10, width: 10, size: 10, top: 10, height: 10 },
      { type: 'text', role: 'body', text: 'x', x: 100, y: 10, width: 10, size: 10, top: FOOTER_TOP, height: 22 },
      { type: 'image', role: 'signature', cx: 10, cy: 10, width: 50, height: 20, rotation: 0 },
      { type: 'line', role: 'rule', x1: 0, y1: 0, x2: 1, y2: 0, thickness: 0 },
    ] }] };
    const codes = technicalWarnings(broken).map((w) => w.code);
    expect(codes).toEqual(expect.arrayContaining(['invalid', 'out-of-page', 'body-overlap', 'signature-area']));
  });
  test('largura útil coincide com a área de 170 mm', () => {
    const comp = newComposer().compose(docState('x'));
    expect(comp.metrics.bodyWidth).toBeCloseTo(CONTENT_WIDTH, 9);
  });
});
