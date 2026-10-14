import { describe, test, expect } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { newComposer, docState, LOREM } from '../fixtures/env.js';
import { bodyFromText, bodyNodes, bodyText } from '../../src/editor/schema.js';
import { buildBodyDecorations, decorateLines } from '../../src/editor/decorations.js';
import { insertPageBreak } from '../../src/editor/commands.js';
import { classifyTransaction } from '../../src/editor/body-editor.js';
import { createInitialState, toDocumentState, pruneSignatures, estimateSize } from '../../src/document/model.js';
import { History } from '../../src/history/history.js';
import { PAGE } from '../../src/pagination/geometry.js';

const STRIDE = PAGE.height + 28;
const long = (n) => Array.from({ length: n }, (_, i) => `${i + 1}) ${LOREM}`).join('\n\n');
const compose = (composer, doc, extra = {}) => composer.compose({ ...docState(''), nodes: bodyNodes(doc), ...extra });
const decosOf = (doc, comp) => buildBodyDecorations(doc, comp, STRIDE).find();
const cls = (deco) => deco.type.attrs && deco.type.attrs.class;
const style = (deco) => (deco.type.attrs && deco.type.attrs.style) || '';

describe('ProseMirror ↔ modelo do documento ↔ paginação', () => {
  test('cada edição recompõe só o parágrafo alterado e mantém o texto único', () => {
    const composer = newComposer();
    let state = EditorState.create({ doc: bodyFromText(long(30)) });
    const first = compose(composer, state.doc);
    expect(first.pagination.recomputed).toBe(state.doc.childCount);
    // Digita no meio do documento.
    let pos = 0;
    state.doc.forEach((node, offset, i) => {
      if (i === 20) pos = offset + 5;
    });
    state = state.apply(state.tr.insertText('XYZ ', pos));
    const second = compose(composer, state.doc);
    expect(second.pagination.recomputed).toBeLessThan(6);
    expect(second.body.nodes[20].text).toContain('XYZ ');
    // Linhas reaproveitadas por identidade nos parágrafos intactos.
    expect(second.body.nodes[0].lines).toBe(first.body.nodes[0].lines);
    expect(second.body.nodes[40].lines).toBe(first.body.nodes[40].lines);
    expect(second.body.nodes[20].lines).not.toBe(first.body.nodes[20].lines);
    // O texto composto é exatamente o do editor.
    expect(second.body.nodes.map((n) => n.text).join('\n')).toBe(bodyText(state.doc));
  });

  test('quebra manual pelo comando do editor cria página na composição', () => {
    const composer = newComposer();
    const doc = bodyFromText('antes depois');
    let state = EditorState.create({ doc, selection: TextSelection.create(doc, 7) });
    expect(compose(composer, state.doc).pageCount).toBe(1);
    insertPageBreak(state, (tr) => {
      expect(classifyTransaction(tr).kind).toBe('discrete');
      state = state.apply(tr);
    });
    const comp = compose(composer, state.doc);
    expect(comp.pageCount).toBe(2);
    expect(comp.body.nodes.map((n) => n.type)).toEqual(['paragraph', 'page_break', 'paragraph']);
    expect(comp.body.nodes[2].linePage[0]).toBe(1);
    expect(comp.body.nodes[2].lineY[0]).toBe(0);
  });
});

describe('ProseMirror ↔ camada HTML (decorações)', () => {
  test('margens dos parágrafos reproduzem a posição vertical calculada, inclusive entre folhas', () => {
    const doc = bodyFromText(long(20));
    const comp = compose(newComposer(), doc);
    expect(comp.pageCount).toBeGreaterThan(2);
    const nodeDecos = decosOf(doc, comp).filter((d) => d.type.constructor.name === 'NodeType' || /margin-top/.test(style(d)));
    expect(nodeDecos).toHaveLength(doc.childCount);
    // Reconstrói a posição de cada parágrafo somando margens e alturas, como o navegador faz.
    let y = 0;
    nodeDecos.forEach((deco, i) => {
      const layout = comp.body.nodes[i];
      y += parseFloat(/margin-top:([-\d.]+)px/.exec(style(deco))[1]);
      const expected = layout.linePage[0] * STRIDE + layout.lineY[0];
      expect(y).toBeCloseTo(expected, 2);
      const last = layout.lines.length - 1;
      y = layout.linePage[last] * STRIDE + layout.lineY[last] + comp.metrics.lineHeight;
    });
  });

  test('quebras visuais, hífens e tabulações viram decorações; o texto não é tocado', () => {
    const text = `${'a'.repeat(62)} preferencialmente\tfim\nsegunda linha ✓`;
    const doc = bodyFromText(text.split('\n')[0]);
    const withBreak = EditorState.create({ doc }).apply(
      EditorState.create({ doc }).tr.insert(doc.content.size - 1, doc.type.schema.nodes.hard_break.create()).insertText('segunda linha ✓', doc.content.size),
    ).doc;
    const comp = compose(newComposer(), withBreak);
    const classes = decosOf(withBreak, comp).map(cls).filter(Boolean);
    expect(classes).toContain('rx-hyphen-break');
    expect(classes).toContain('rx-tab');
    expect(classes).toContain('rx-fb');
    expect(bodyText(withBreak)).toBe(text);
    // A tabulação recebe exatamente a largura calculada.
    const tab = decosOf(withBreak, comp).find((d) => cls(d) === 'rx-tab');
    const line = comp.body.nodes[0].lines.find((l) => l.tabs.length);
    expect(parseFloat(/width:([\d.]+)px/.exec(style(tab))[1])).toBeCloseTo(line.tabs[0].width, 2);
  });

  test('parágrafo dividido entre folhas: o salto fica no primeiro caractere da linha seguinte', () => {
    const giant = Array.from({ length: 60 }, () => LOREM).join(' ');
    const doc = bodyFromText(giant);
    const comp = compose(newComposer(), doc);
    const layout = comp.body.nodes[0];
    const jumps = [];
    for (let k = 0; k < layout.lines.length - 1; k++) if (layout.linePage[k + 1] !== layout.linePage[k]) jumps.push(k);
    expect(jumps.length).toBe(comp.pageCount - 1);
    const gaps = decosOf(doc, comp).filter((d) => cls(d) === 'rx-gap-before');
    expect(gaps).toHaveLength(jumps.length);
    gaps.forEach((deco, i) => {
      const k = jumps[i];
      expect(deco.from).toBe(1 + layout.lines[k + 1].start);
      const expected = (layout.linePage[k + 1] - layout.linePage[k]) * STRIDE + layout.lineY[k + 1] - layout.lineY[k] - comp.metrics.lineHeight;
      expect(parseFloat(/--rx-gap:([\d.]+)px/.exec(style(deco))[1])).toBeCloseTo(expected, 2);
    });
  });

  test('decorações nunca partem um grafema ao meio', () => {
    const out = [];
    const text = `${'a'.repeat(72)}é x`;
    const lines = newComposer().compose(docState(text)).body.nodes[0].lines;
    decorateLines(out, 1, text, lines, () => 0, false);
    for (const deco of out) {
      const piece = text.slice(deco.from - 1, deco.to - 1);
      expect(piece.normalize('NFC')).not.toMatch(/^\p{M}/u);
    }
  });
});

describe('paginação ↔ assinaturas ↔ histórico', () => {
  test('reduzir o conteúdo descarta a assinatura da página eliminada; desfazer a devolve', () => {
    const composer = newComposer();
    const history = new History({ sizeOf: (s) => estimateSize(s) });
    let state = { ...createInitialState(new Date(2026, 9, 13)), body: bodyFromText('a\fb\fc'), signatures: { 0: { id: 'x' }, 2: { id: 'z' } } };
    const commit = (patch) => {
      let next = { ...state, ...patch };
      const comp = composer.compose(toDocumentState(next));
      next = { ...next, signatures: pruneSignatures(next.signatures, comp.pageCount) };
      history.record(state);
      state = next;
      return comp;
    };
    expect(commit({ body: bodyFromText('a\fb') }).pageCount).toBe(2);
    expect(state.signatures).toEqual({ 0: { id: 'x' } });
    state = history.undo(state);
    expect(Object.keys(state.signatures)).toEqual(['0', '2']);
    expect(composer.compose(toDocumentState(state)).pageCount).toBe(3);
    state = history.redo(state);
    expect(state.signatures).toEqual({ 0: { id: 'x' } });
  });

  test('histórico de alterações estruturais restaura documento, campos e data', () => {
    const history = new History();
    let state = createInitialState(new Date(2026, 9, 13));
    const apply = (patch, meta) => {
      history.record(state, meta);
      state = { ...state, ...patch };
    };
    apply({ body: bodyFromText('texto') }, { kind: 'typing', key: 'body:insert', time: 0 });
    apply({ fields: { ...state.fields, patient: 'Ana' } }, { kind: 'typing', key: 'field:patient', time: 10 });
    apply({ body: bodyFromText('texto\fmais') }, { kind: 'discrete', time: 20 });
    apply({ date: '2027-01-01' }, { kind: 'discrete', time: 30 });
    const seen = [];
    let previous;
    while ((previous = history.undo(state))) {
      state = previous;
      seen.push([bodyText(state.body), state.fields.patient, state.date]);
    }
    expect(seen).toEqual([
      ['texto\nmais', 'Ana', '2026-10-13'],
      ['texto', 'Ana', '2026-10-13'],
      ['texto', '', '2026-10-13'],
      ['', '', '2026-10-13'],
    ]);
  });
});
