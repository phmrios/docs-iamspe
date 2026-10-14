import { describe, test, expect } from 'vitest';
import { paginate } from '../../src/pagination/paginate.js';
import { computeBlocks } from '../../src/document/blocks.js';

const L = 22;
const G = 8;
const cfg = (lines) => ({ bodyHeight: lines * L + (lines - 1) * 0, lineHeight: L, paraGap: G });
const para = (lines, extra = {}) => ({ type: 'paragraph', lines, sep: false, first: true, ...extra });
const cont = (lines) => para(lines, { first: false });
const sep = () => ({ type: 'paragraph', lines: 1, sep: true, first: false });
const brk = () => ({ type: 'page_break' });
const pagesOf = (result, i) => [...result.placements[i].linePage];

describe('paginação', () => {
  test('documento vazio: uma página, uma linha', () => {
    const r = paginate([sep()], cfg(10));
    expect(r.pageCount).toBe(1);
    expect(r.placements[0]).toMatchObject({ page: 0, y: 0 });
  });
  test('espaçamento entre parágrafos e entrelinha', () => {
    const r = paginate([para(2), para(1)], { bodyHeight: 1000, lineHeight: L, paraGap: G });
    expect([...r.placements[0].lineY]).toEqual([0, L]);
    expect([...r.placements[1].lineY]).toEqual([2 * L + G]);
  });
  test('cria páginas automaticamente e não perde linhas', () => {
    const nodes = Array.from({ length: 30 }, () => para(3));
    const r = paginate(nodes, { bodyHeight: 10 * L + 9 * G, lineHeight: L, paraGap: G });
    expect(r.pageCount).toBeGreaterThan(5);
    let total = 0;
    for (const p of r.placements) total += p.linePage.length;
    expect(total).toBe(90);
    const height = 10 * L + 9 * G;
    for (const p of r.placements) for (const y of p.lineY) expect(y + L).toBeLessThanOrEqual(height + 0.01);
  });
  test('parágrafo que cabe em uma folha não é dividido', () => {
    const r = paginate([para(7), para(5)], { bodyHeight: 10 * L, lineHeight: L, paraGap: G });
    expect(pagesOf(r, 0)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(pagesOf(r, 1)).toEqual([1, 1, 1, 1, 1]);
    expect(r.placements[1].lineY[0]).toBe(0);
  });
  test('parágrafo muito longo é dividido sem linhas órfãs nem viúvas', () => {
    const r = paginate([para(8), para(13)], { bodyHeight: 10 * L, lineHeight: L, paraGap: G });
    // 8 linhas + espaço: sobra 1 linha na folha → órfã; o parágrafo começa na folha seguinte.
    const pages = pagesOf(r, 1);
    expect(pages.filter((p) => p === 0)).toHaveLength(0);
    expect(pages.filter((p) => p === 1)).toHaveLength(10);
    expect(pages.filter((p) => p === 2)).toHaveLength(3);
    const r2 = paginate([para(11)], { bodyHeight: 10 * L, lineHeight: L, paraGap: G });
    // 10 + 1 deixaria uma viúva: passam 2 linhas para a folha seguinte.
    expect(pagesOf(r2, 0).filter((p) => p === 0)).toHaveLength(9);
    expect(pagesOf(r2, 0).filter((p) => p === 1)).toHaveLength(2);
  });
  test('linhas vazias consecutivas são preservadas e podem ir para a outra folha', () => {
    const nodes = [para(9), sep(), sep(), sep(), para(1)];
    const r = paginate(nodes, { bodyHeight: 10 * L + 2 * G, lineHeight: L, paraGap: G });
    expect(r.placements[1].page).toBe(0);
    expect(r.placements[2].page).toBe(1);
    expect(r.placements[2].y).toBe(0);
    expect(r.placements[3].page).toBe(1);
    expect(r.placements[4].lineY[0]).toBe(2 * (L + G));
  });
  test('quebra manual inicia nova página; quebras seguidas criam folha em branco', () => {
    const r = paginate([para(1), brk(), para(1), brk(), brk(), para(1)], cfg(10));
    expect(r.placements[2].page).toBe(1);
    expect(r.placements[2].y).toBe(0);
    expect(r.placements[5].page).toBe(3);
    expect(r.pageCount).toBe(4);
  });
  test('bloco que cabe em uma folha vai inteiro para a seguinte', () => {
    const nodes = [para(6), sep(), para(2), cont(2), cont(2)];
    const r = paginate(nodes, { bodyHeight: 10 * L + 9 * G, lineHeight: L, paraGap: G });
    expect(r.placements[2].page).toBe(1);
    expect(r.placements[3].page).toBe(1);
    expect(r.placements[4].page).toBe(1);
    // Com o bloco dividido manualmente, a primeira parte volta a caber na primeira folha.
    const split = [para(6), sep(), para(2), para(2), cont(2)];
    const r2 = paginate(split, { bodyHeight: 10 * L + 9 * G, lineHeight: L, paraGap: G });
    expect(r2.placements[2].page).toBe(0);
    expect(r2.placements[3].page).toBe(1);
  });
  test('bloco maior que a folha recai na regra por parágrafo', () => {
    const nodes = [para(4), cont(4), cont(4), cont(4)];
    const r = paginate(nodes, { bodyHeight: 10 * L, lineHeight: L, paraGap: G });
    expect(r.placements.map((p) => p.page)).toEqual([0, 0, 1, 1]);
  });
  test('folha menor que as linhas mínimas não entra em laço', () => {
    const r = paginate([para(5)], { bodyHeight: L, lineHeight: L, paraGap: G });
    expect(r.pageCount).toBe(5);
  });
});

describe('paginação incremental', () => {
  const config = { bodyHeight: 10 * L + 9 * G, lineHeight: L, paraGap: G };
  const doc = () => Array.from({ length: 200 }, (_, i) => (i % 3 === 2 ? sep() : para(1 + (i % 4))));

  test('resultado idêntico ao cálculo completo', () => {
    const before = doc();
    const first = paginate(before, config);
    for (const edit of [5, 97, 199]) {
      const after = before.slice();
      after[edit] = para(6);
      const full = paginate(after, config);
      const inc = paginate(after, config, first);
      expect(inc.pageCount).toBe(full.pageCount);
      for (let i = 0; i < after.length; i++) {
        expect([...inc.placements[i].linePage]).toEqual([...full.placements[i].linePage]);
        expect([...inc.placements[i].lineY]).toEqual([...full.placements[i].lineY]);
      }
    }
  });
  test('inserção e exclusão no meio de várias páginas', () => {
    const before = doc();
    const first = paginate(before, config);
    const inserted = [...before.slice(0, 100), para(3), ...before.slice(100)];
    const removed = [...before.slice(0, 60), ...before.slice(64)];
    for (const after of [inserted, removed]) {
      const full = paginate(after, config);
      const inc = paginate(after, config, first);
      expect(inc.pageCount).toBe(full.pageCount);
      expect(inc.placements.map((p) => [p.page, p.y])).toEqual(full.placements.map((p) => [p.page, p.y]));
    }
  });
  test('recalcula só a região afetada quando a composição volta a coincidir', () => {
    const before = doc();
    const first = paginate(before, config);
    expect(first.recomputed).toBe(200);
    const after = before.slice();
    after[40] = para(before[40].lines === 1 ? 2 : before[40].lines); // alteração mínima
    after[40] = { ...before[40] };
    const same = paginate(after, config, first);
    expect(same.recomputed).toBeLessThan(10);
    const tail = before.slice();
    tail[198] = para(2);
    expect(paginate(tail, config, first).recomputed).toBeLessThan(10);
  });
  test('mudança de altura da área (cabeçalho) invalida o reaproveitamento', () => {
    const nodes = doc();
    const first = paginate(nodes, config);
    const second = paginate(nodes, { ...config, bodyHeight: config.bodyHeight - L }, first);
    expect(second.recomputed).toBe(200);
    expect(second.pageCount).toBeGreaterThanOrEqual(first.pageCount);
  });
});

describe('blocos', () => {
  const p = (text, boundary = null) => ({ type: 'paragraph', text, boundary });
  test('linhas vazias separam blocos automaticamente', () => {
    const info = computeBlocks([p('a'), p('b'), p(''), p('c')]);
    expect(info.map((i) => i.kind)).toEqual(['para', 'para', 'sep', 'para']);
    expect(info.map((i) => i.block)).toEqual([0, 0, -1, 1]);
    expect(info.map((i) => i.first)).toEqual([true, false, false, true]);
    expect(info.map((i) => i.last)).toEqual([false, true, false, true]);
  });
  test('dividir: novo bloco sem linha vazia', () => {
    const info = computeBlocks([p('a'), p('b', 'split'), p('c')]);
    expect(info.map((i) => i.block)).toEqual([0, 1, 1]);
    expect(info[0].last).toBe(true);
  });
  test('unir: a linha vazia deixa de separar e continua no texto', () => {
    const nodes = [p('a'), p('', 'join'), p('b')];
    const info = computeBlocks(nodes);
    expect(info.map((i) => i.block)).toEqual([0, 0, 0]);
    expect(nodes.map((n) => n.text)).toEqual(['a', '', 'b']);
  });
  test('quebra manual encerra o bloco', () => {
    const info = computeBlocks([p('a'), { type: 'page_break' }, p('b')]);
    expect(info.map((i) => i.block)).toEqual([0, -1, 1]);
  });
});
