import { describe, test, expect } from 'vitest';
import { History } from '../../src/history/history.js';

describe('histórico', () => {
  test('desfazer e refazer restauram os estados correspondentes', () => {
    const h = new History();
    let state = 'A';
    const change = (next, meta) => {
      h.record(state, meta);
      state = next;
    };
    change('B');
    change('C');
    expect(h.canUndo).toBe(true);
    state = h.undo(state);
    expect(state).toBe('B');
    state = h.undo(state);
    expect(state).toBe('A');
    expect(h.undo(state)).toBe(null);
    state = h.redo(state);
    state = h.redo(state);
    expect(state).toBe('C');
    expect(h.canRedo).toBe(false);
  });
  test('digitação contínua é agrupada', () => {
    const h = new History({ groupDelay: 700 });
    for (let i = 0; i < 10; i++) h.record(`s${i}`, { kind: 'typing', key: 'body:insert', time: 1000 + i * 100 });
    expect(h.undoStack).toHaveLength(1);
    expect(h.undo('fim')).toBe('s0');
  });
  test('pausa, troca de chave ou de campo abre novo grupo', () => {
    const h = new History({ groupDelay: 700 });
    h.record(1, { kind: 'typing', key: 'body:insert', time: 0 });
    h.record(2, { kind: 'typing', key: 'body:insert', time: 100 });
    h.record(3, { kind: 'typing', key: 'body:insert', time: 2000 });
    h.record(4, { kind: 'typing', key: 'body:delete', time: 2100 });
    h.record(5, { kind: 'typing', key: 'field:patient', time: 2200 });
    expect(h.undoStack.map((e) => e.snapshot)).toEqual([1, 3, 4, 5]);
  });
  test('operações discretas sempre têm entrada própria e encerram a digitação', () => {
    const h = new History();
    h.record(1, { kind: 'typing', key: 'k', time: 0 });
    h.record(2, { kind: 'discrete', time: 10 });
    h.record(3, { kind: 'discrete', time: 20 });
    h.record(4, { kind: 'typing', key: 'k', time: 30 });
    h.record(5, { kind: 'typing', key: 'k', time: 40 });
    expect(h.undoStack.map((e) => e.snapshot)).toEqual([1, 2, 3, 4]);
  });
  test('closeGroup separa digitações (mudança de foco)', () => {
    const h = new History();
    h.record(1, { kind: 'typing', key: 'k', time: 0 });
    h.closeGroup();
    h.record(2, { kind: 'typing', key: 'k', time: 10 });
    expect(h.undoStack).toHaveLength(2);
  });
  test('nova alteração descarta o refazer', () => {
    const h = new History();
    h.record('A');
    h.undo('B');
    expect(h.canRedo).toBe(true);
    h.record('A');
    expect(h.canRedo).toBe(false);
  });
  test('limites de quantidade e de memória descartam as entradas mais antigas', () => {
    const byCount = new History({ maxEntries: 3 });
    for (let i = 0; i < 10; i++) byCount.record(i);
    expect(byCount.undoStack.map((e) => e.snapshot)).toEqual([7, 8, 9]);
    const byBytes = new History({ maxBytes: 250, sizeOf: () => 100 });
    for (let i = 0; i < 10; i++) byBytes.record(i);
    expect(byBytes.undoStack.map((e) => e.snapshot)).toEqual([8, 9]);
    expect(byBytes.bytes).toBe(200);
  });
  test('clear reinicia tudo', () => {
    const h = new History();
    h.record(1);
    h.undo(2);
    h.clear();
    expect(h.canUndo || h.canRedo).toBe(false);
    expect(h.bytes).toBe(0);
  });
});
