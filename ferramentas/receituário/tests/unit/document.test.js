import { describe, test, expect } from 'vitest';
import { EditorState, TextSelection, NodeSelection } from 'prosemirror-state';
import { bodySchema, bodyFromText, bodyNodes, bodyText, emptyBody, paragraphText } from '../../src/editor/schema.js';
import {
  splitParagraph, insertHardBreak, insertTab, insertPageBreak, splitBlock, joinBlocks, ensureTrailingParagraph,
  deleteAdjacentPageBreak, selectAllText,
} from '../../src/editor/commands.js';
import { sliceFromText } from '../../src/editor/paste.js';
import { classifyTransaction } from '../../src/editor/body-editor.js';
import { computeBlocks } from '../../src/document/blocks.js';
import { createInitialState, hasContent, pruneSignatures, toDocumentState } from '../../src/document/model.js';
import { functionalWarnings } from '../../src/validation/validate.js';

function stateAt(doc, paragraphIndex, offset = 0, to = null) {
  let pos = 0;
  doc.forEach((node, at, i) => {
    if (i === paragraphIndex) pos = at + 1 + offset;
  });
  const selection = TextSelection.create(doc, pos, to == null ? pos : pos + to);
  return EditorState.create({ doc, selection });
}
function run(state, command) {
  let next = state;
  let last = null;
  const ok = command(state, (tr) => {
    last = tr;
    next = state.apply(tr);
  });
  return { ok, state: next, tr: last };
}
const kinds = (doc) => {
  const out = [];
  doc.forEach((n) => out.push(n.type.name === 'page_break' ? '<pb>' : paragraphText(n)));
  return out;
};

describe('estrutura do documento', () => {
  test('esquema: só texto simples, sem marcas', () => {
    expect(Object.keys(bodySchema.marks)).toEqual([]);
    expect(Object.keys(bodySchema.nodes).sort()).toEqual(['doc', 'hard_break', 'page_break', 'paragraph', 'text']);
  });
  test('documento vazio e estado inicial', () => {
    expect(kinds(emptyBody())).toEqual(['']);
    const state = createInitialState(new Date(2026, 9, 13));
    expect(state.date).toBe('2026-10-13');
    expect(state.fields).toEqual({ patient: '', doctor: '', uf: '', crm: '', place: '' });
    expect(hasContent(state)).toBe(false);
    expect(hasContent({ ...state, fields: { ...state.fields, crm: '1' } })).toBe(true);
    expect(hasContent({ ...state, body: bodyFromText('x') })).toBe(true);
  });
  test('texto ↔ documento preserva linhas vazias, tabulações e quebras manuais', () => {
    const text = 'a\n\n\tb\fc';
    const doc = bodyFromText(text);
    expect(kinds(doc)).toEqual(['a', '', '\tb', '<pb>', 'c']);
    expect(bodyText(doc)).toBe('a\n\n\tb\nc');
  });
  test('representação neutra é estável por identidade (base do cache e da paginação incremental)', () => {
    const doc = bodyFromText('um\ndois\ntrês');
    const before = bodyNodes(doc);
    const state = stateAt(doc, 1, 4);
    const after = bodyNodes(state.apply(state.tr.insertText('!')).doc);
    expect(after[0]).toBe(before[0]);
    expect(after[2]).toBe(before[2]);
    expect(after[1]).not.toBe(before[1]);
    expect(after[1].text).toBe('dois!');
  });
  test('visão para a composição não depende do editor', () => {
    const view = toDocumentState({ ...createInitialState(), body: bodyFromText('x\fy') });
    expect(view.nodes.map((n) => n.type)).toEqual(['paragraph', 'page_break', 'paragraph']);
  });
});

describe('comandos de edição', () => {
  test('Enter cria parágrafo; Shift+Enter cria quebra simples no mesmo parágrafo', () => {
    const base = stateAt(bodyFromText('abcd'), 0, 2);
    expect(kinds(run(base, splitParagraph).state.doc)).toEqual(['ab', 'cd']);
    const soft = run(base, insertHardBreak).state.doc;
    expect(soft.childCount).toBe(1);
    expect(kinds(soft)).toEqual(['ab\ncd']);
  });
  test('Enter não herda o ajuste manual de bloco', () => {
    const doc = bodySchema.node('doc', null, [bodySchema.node('paragraph', { boundary: 'split' }, [bodySchema.text('abcd')])]);
    const out = run(stateAt(doc, 0, 2), splitParagraph).state.doc;
    expect(out.child(0).attrs.boundary).toBe('split');
    expect(out.child(1).attrs.boundary).toBe(null);
  });
  test('Tab insere tabulação real', () => {
    const out = run(stateAt(bodyFromText('ab'), 0, 1), insertTab).state.doc;
    expect(bodyText(out)).toBe('a\tb');
  });
  test('quebra manual: no meio, no fim e no início do parágrafo', () => {
    expect(kinds(run(stateAt(bodyFromText('abcd'), 0, 2), insertPageBreak).state.doc)).toEqual(['ab', '<pb>', 'cd']);
    expect(kinds(run(stateAt(bodyFromText('abcd'), 0, 4), insertPageBreak).state.doc)).toEqual(['abcd', '<pb>', '']);
    const start = run(stateAt(bodyFromText('x\nabcd'), 1, 0), insertPageBreak);
    expect(kinds(start.state.doc)).toEqual(['x', '<pb>', 'abcd']);
    expect(start.state.selection.$from.parent.textContent).toBe('abcd');
    expect(start.state.selection.$from.parentOffset).toBe(0);
  });
  test('quebra manual com seleção substitui o trecho selecionado', () => {
    const out = run(stateAt(bodyFromText('abcdef'), 0, 2, 2), insertPageBreak).state;
    expect(kinds(out.doc)).toEqual(['ab', '<pb>', 'ef']);
    expect(out.selection.$from.parent.textContent).toBe('ef');
  });
  test('o documento sempre termina em parágrafo', () => {
    const doc = bodySchema.node('doc', null, [bodySchema.node('paragraph'), bodySchema.node('page_break')]);
    const state = EditorState.create({ doc });
    expect(kinds(state.apply(ensureTrailingParagraph(state.tr)).doc)).toEqual(['', '<pb>', '']);
  });
  test('Backspace/Delete junto à quebra manual removem só a quebra', () => {
    const doc = bodyFromText('a\fb');
    const back = run(stateAt(doc, 2, 0), deleteAdjacentPageBreak(-1));
    expect(back.ok).toBe(true);
    expect(kinds(back.state.doc)).toEqual(['a', 'b']);
    expect(back.state.selection.$from.parent.textContent).toBe('b');
    expect(kinds(run(stateAt(doc, 0, 1), deleteAdjacentPageBreak(1)).state.doc)).toEqual(['a', 'b']);
    expect(run(stateAt(doc, 2, 1), deleteAdjacentPageBreak(-1)).ok).toBe(false);
    expect(run(stateAt(bodyFromText('a\nb'), 1, 0), deleteAdjacentPageBreak(-1)).ok).toBe(false);
  });
  test('selecionar tudo abrange do primeiro ao último caractere', () => {
    const out = run(stateAt(bodyFromText('ab\fcd'), 0, 1), selectAllText).state.selection;
    expect([out.from, out.to]).toEqual([1, 8]);
  });
  test('remover a quebra manual preserva o texto', () => {
    const doc = bodyFromText('a\fb');
    const state = EditorState.create({ doc, selection: NodeSelection.create(doc, 3) });
    expect(kinds(state.apply(state.tr.deleteSelection()).doc)).toEqual(['a', 'b']);
  });
});

describe('blocos: dividir e unir', () => {
  const blocksOf = (doc) => computeBlocks(bodyNodes(doc)).map((i) => i.block);
  test('dividir marca o parágrafo do cursor e preserva o texto', () => {
    const doc = bodyFromText('a\nb\nc');
    expect(blocksOf(doc)).toEqual([0, 0, 0]);
    const out = run(stateAt(doc, 1), splitBlock);
    expect(out.ok).toBe(true);
    expect(blocksOf(out.state.doc)).toEqual([0, 1, 1]);
    expect(bodyText(out.state.doc)).toBe('a\nb\nc');
    expect(classifyTransaction(out.tr).kind).toBe('discrete');
  });
  test('não há o que dividir no primeiro parágrafo de um bloco', () => {
    expect(run(stateAt(bodyFromText('a\nb'), 0), splitBlock).ok).toBe(false);
  });
  test('unir desfaz a divisão manual', () => {
    const split = run(stateAt(bodyFromText('a\nb\nc'), 1), splitBlock).state;
    const joined = run(stateAt(split.doc, 2), joinBlocks);
    expect(joined.ok).toBe(true);
    expect(blocksOf(joined.state.doc)).toEqual([0, 0, 0]);
  });
  test('unir blocos separados por linhas vazias mantém as linhas', () => {
    const doc = bodyFromText('a\n\n\nb');
    expect(blocksOf(doc)).toEqual([0, -1, -1, 1]);
    const out = run(stateAt(doc, 3), joinBlocks).state.doc;
    expect(blocksOf(out)).toEqual([0, 0, 0, 0]);
    expect(bodyText(out)).toBe('a\n\n\nb');
    // Dividir de novo na linha vazia devolve a separação.
    const again = run(stateAt(out, 1), splitBlock).state.doc;
    expect(blocksOf(again)).toEqual([0, -1, 1, 1]);
  });
  test('no primeiro bloco, une com o seguinte; com o cursor na linha vazia, une os vizinhos', () => {
    expect(blocksOf(run(stateAt(bodyFromText('a\n\nb'), 0), joinBlocks).state.doc)).toEqual([0, 0, 0]);
    expect(blocksOf(run(stateAt(bodyFromText('a\n\nb'), 1), joinBlocks).state.doc)).toEqual([0, 0, 0]);
    expect(run(stateAt(bodyFromText('a'), 0), joinBlocks).ok).toBe(false);
  });
});

describe('colagem', () => {
  test('uma linha entra como texto; várias viram parágrafos', () => {
    const state = stateAt(bodyFromText('início fim'), 0, 7);
    expect(bodyText(state.apply(state.tr.replaceSelection(sliceFromText('meio '))).doc)).toBe('início meio fim');
    const multi = state.apply(state.tr.replaceSelection(sliceFromText('A\r\n\r\nB\tC\n')));
    expect(kinds(multi.doc)).toEqual(['início A', '', 'B\tC', 'fim']);
  });
  test('nenhuma marcação sobrevive: o resultado é só texto', () => {
    const slice = sliceFromText('<b>negrito</b> <script>alert(1)</script>');
    const state = stateAt(emptyBody(), 0);
    const doc = state.apply(state.tr.replaceSelection(slice)).doc;
    expect(bodyText(doc)).toBe('<b>negrito</b> <script>alert(1)</script>');
    let marks = 0;
    doc.descendants((n) => {
      marks += n.marks.length;
    });
    expect(marks).toBe(0);
  });
  test('classificação para o histórico', () => {
    const state = stateAt(bodyFromText('abcdef'), 0, 3);
    expect(classifyTransaction(state.tr.insertText('x'))).toEqual({ kind: 'typing', key: 'body:insert' });
    expect(classifyTransaction(state.tr.delete(3, 4))).toEqual({ kind: 'typing', key: 'body:delete' });
    expect(classifyTransaction(state.tr.delete(1, 6)).kind).toBe('discrete');
    expect(classifyTransaction(state.tr.insertText('colado').setMeta('paste', true)).kind).toBe('discrete');
  });
});

describe('validação de campos e assinaturas por página', () => {
  test('avisos funcionais para cada campo ausente', () => {
    const empty = createInitialState();
    expect(functionalWarnings(empty).map((w) => w.code)).toEqual(['no-patient', 'no-body', 'no-doctor', 'no-crm', 'no-place']);
    const full = { ...empty, body: bodyFromText('x'), fields: { patient: 'A', doctor: 'B', uf: 'SP', crm: '1', place: 'C' } };
    expect(functionalWarnings(full)).toEqual([]);
    expect(functionalWarnings({ ...full, fields: { ...full.fields, uf: '' } }).map((w) => w.code)).toEqual(['no-crm']);
  });
  test('CRM e UF são livres: nenhum formato é exigido', () => {
    const state = { ...createInitialState(), body: bodyFromText('x'), fields: { patient: 'A', doctor: 'B', uf: 'XYZ', crm: 'abc-0', place: 'C' } };
    expect(functionalWarnings(state)).toEqual([]);
  });
  test('assinaturas de páginas eliminadas são descartadas; as demais ficam na mesma página', () => {
    const sigs = { 0: { id: 'a' }, 1: { id: 'b' }, 2: { id: 'c' } };
    expect(pruneSignatures(sigs, 3)).toBe(sigs);
    expect(pruneSignatures(sigs, 2)).toEqual({ 0: { id: 'a' }, 1: { id: 'b' } });
    expect(pruneSignatures(sigs, 1)).toEqual({ 0: { id: 'a' } });
  });
});
