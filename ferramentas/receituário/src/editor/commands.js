import { NodeSelection, Selection, TextSelection } from 'prosemirror-state';
import { bodySchema, bodyNodes } from './schema.js';
import { computeBlocks } from '../document/blocks.js';

const { paragraph, page_break: pageBreak, hard_break: hardBreak } = bodySchema.nodes;

/** Marca a transação como operação estrutural: entrada própria no histórico. */
const discrete = (tr) => tr.setMeta('rx-discrete', true);

/** Enter: novo parágrafo, sempre sem ajuste manual de bloco herdado. */
export function splitParagraph(state, dispatch) {
  if (state.selection instanceof NodeSelection) return false;
  const tr = state.tr;
  if (!tr.selection.empty) tr.deleteSelection();
  const $pos = tr.selection.$from;
  if ($pos.parent.type !== paragraph) return false;
  if (dispatch) {
    tr.split($pos.pos, 1, [{ type: paragraph, attrs: { boundary: null } }]);
    dispatch(tr.scrollIntoView());
  }
  return true;
}

/** Shift+Enter: quebra de linha simples dentro do mesmo parágrafo. */
export function insertHardBreak(state, dispatch) {
  if (state.selection.$from.parent.type !== paragraph) return false;
  if (dispatch) dispatch(state.tr.replaceSelectionWith(hardBreak.create()).scrollIntoView());
  return true;
}

/** Tab: tabulação real (caractere U+0009). */
export function insertTab(state, dispatch) {
  if (state.selection.$from.parent.type !== paragraph) return false;
  if (dispatch) dispatch(state.tr.insertText('\t').scrollIntoView());
  return true;
}

/** Quebra de página manual na posição do cursor. O texto seguinte vai para a nova página. */
export function insertPageBreak(state, dispatch) {
  if (state.selection.$from.parent.type !== paragraph && state.selection.empty) return false;
  if (dispatch) {
    const tr = state.tr;
    if (!tr.selection.empty) tr.deleteSelection();
    const $pos = tr.selection.$from;
    if ($pos.parent.type !== paragraph) return false;
    if ($pos.parentOffset === 0 && $pos.index(0) > 0) {
      // Cursor no início do parágrafo: a quebra entra antes dele, sem criar linha vazia.
      const before = $pos.before(1);
      tr.insert(before, pageBreak.create());
      tr.setSelection(TextSelection.create(tr.doc, before + 2));
    } else {
      tr.split($pos.pos, 1, [{ type: paragraph, attrs: { boundary: null } }]);
      const between = $pos.pos + 1;
      tr.insert(between, pageBreak.create());
      tr.setSelection(TextSelection.create(tr.doc, between + 2));
    }
    dispatch(discrete(tr).scrollIntoView());
  }
  return true;
}

function topLevelContext(state) {
  const index = state.selection.$from.index(0);
  const nodes = bodyNodes(state.doc);
  const info = computeBlocks(nodes);
  const positions = [];
  state.doc.forEach((_node, offset) => positions.push(offset));
  return { index, nodes, info, positions };
}

const setBoundary = (tr, state, pos, boundary) =>
  tr.setNodeMarkup(pos, null, { ...state.doc.nodeAt(pos).attrs, boundary });

/**
 * Dividir bloco: o parágrafo do cursor passa a iniciar um novo bloco.
 * Em uma linha vazia unida a um bloco, ela volta a separar. O texto não muda.
 */
export function splitBlock(state, dispatch) {
  const { index, nodes, info, positions } = topLevelContext(state);
  const node = nodes[index];
  if (!node || node.type !== 'paragraph') return false;
  let boundary;
  if (node.text === '' && node.boundary === 'join') boundary = null;
  else if (info[index].kind === 'para' && !info[index].first) boundary = 'split';
  else return false;
  if (dispatch) dispatch(discrete(setBoundary(state.tr, state, positions[index], boundary)));
  return true;
}

/**
 * Unir blocos: junta o bloco do cursor ao anterior (ou, se for o primeiro, ao
 * seguinte). Limites manuais são removidos; linhas vazias entre os dois blocos
 * continuam no texto, mas deixam de separar.
 */
export function joinBlocks(state, dispatch) {
  const { index, nodes, info, positions } = topLevelContext(state);
  if (!nodes[index] || nodes[index].type !== 'paragraph') return false;

  // Encontra o primeiro parágrafo do bloco de referência.
  let start = index;
  if (info[index].kind === 'para') while (!info[start].first) start--;

  const changes = [];
  const collectUp = (from) => {
    // De `from` para cima: linhas vazias até encontrar um bloco anterior.
    let i = from - 1;
    const seps = [];
    while (i >= 0 && info[i].kind === 'sep') seps.push(i--);
    if (i < 0 || info[i].kind !== 'para') return false;
    for (const s of seps) changes.push([s, 'join']);
    return true;
  };

  if (info[index].kind === 'sep') {
    // Cursor na linha vazia: une o que está acima com o que está abaixo.
    let up = index;
    while (up >= 0 && info[up].kind === 'sep') up--;
    let down = index;
    while (down < nodes.length && info[down].kind === 'sep') down++;
    if (up < 0 || down >= nodes.length || info[up].kind !== 'para' || info[down].kind !== 'para') return false;
    for (let i = up + 1; i < down; i++) changes.push([i, 'join']);
  } else if (nodes[start].boundary === 'split' && start > 0 && info[start - 1].kind === 'para') {
    changes.push([start, null]);
  } else if (!collectUp(start)) {
    // Primeiro bloco: une com o seguinte.
    let end = index;
    while (end + 1 < nodes.length && info[end + 1].kind === 'para' && !info[end + 1].first) end++;
    const next = end + 1;
    if (next >= nodes.length) return false;
    if (info[next].kind === 'para') changes.push([next, null]);
    else {
      let down = next;
      while (down < nodes.length && info[down].kind === 'sep') down++;
      if (down >= nodes.length || info[down].kind !== 'para') return false;
      for (let i = next; i < down; i++) changes.push([i, 'join']);
    }
  }
  if (!changes.length) return false;
  if (dispatch) {
    const tr = state.tr;
    for (const [i, boundary] of changes) setBoundary(tr, state, positions[i], boundary);
    dispatch(discrete(tr));
  }
  return true;
}

/** Garante que o documento termine em parágrafo (o cursor precisa de um lugar após uma quebra). */
export function ensureTrailingParagraph(tr) {
  if (tr.doc.lastChild && tr.doc.lastChild.type === paragraph) return tr;
  return tr.insert(tr.doc.content.size, paragraph.create());
}

/**
 * Backspace no início do parágrafo que sucede uma quebra manual (ou Delete no fim
 * do que a antecede) remove apenas a quebra: os parágrafos continuam separados.
 */
export function deleteAdjacentPageBreak(direction) {
  return (state, dispatch) => {
    const { $from, empty } = state.selection;
    if (!empty || $from.parent.type !== paragraph) return false;
    const index = $from.index(0);
    let target;
    if (direction < 0) {
      if ($from.parentOffset !== 0 || index === 0) return false;
      target = index - 1;
    } else {
      if ($from.parentOffset !== $from.parent.content.size || index >= state.doc.childCount - 1) return false;
      target = index + 1;
    }
    if (state.doc.child(target).type !== pageBreak) return false;
    if (dispatch) {
      let pos = 0;
      for (let i = 0; i < target; i++) pos += state.doc.child(i).nodeSize;
      dispatch(discrete(state.tr.delete(pos, pos + 1)).scrollIntoView());
    }
    return true;
  };
}

/** Selecionar tudo como seleção de texto comum (do primeiro ao último caractere). */
export function selectAllText(state, dispatch) {
  if (dispatch) {
    const start = Selection.atStart(state.doc);
    const end = Selection.atEnd(state.doc);
    dispatch(state.tr.setSelection(TextSelection.create(state.doc, start.from, end.to)));
  }
  return true;
}
