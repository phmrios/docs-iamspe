import { EditorState, TextSelection, Selection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap } from 'prosemirror-commands';
import { bodySchema } from './schema.js';
import { buildBodyDecorations, bodyPlaceholder } from './decorations.js';
import {
  splitParagraph, insertHardBreak, insertTab, insertPageBreak, splitBlock, joinBlocks, ensureTrailingParagraph,
  deleteAdjacentPageBreak, selectAllText,
} from './commands.js';
import { sliceFromText, plainTextFromTransfer, isInternalClipboard } from './paste.js';
import { PLACEHOLDERS } from '../pagination/geometry.js';

const swallow = () => true;

/**
 * Classifica uma transação para o histórico: digitação contínua é agrupada;
 * colagens, exclusões extensas e operações estruturais ficam isoladas.
 */
export function classifyTransaction(tr) {
  const ui = tr.getMeta('uiEvent');
  if (tr.getMeta('rx-discrete') || tr.getMeta('paste') || ui === 'paste' || ui === 'drop' || ui === 'cut') {
    return { kind: 'discrete', key: 'body' };
  }
  let deleted = 0;
  let inserted = 0;
  for (const map of tr.mapping.maps) {
    map.forEach((oldStart, oldEnd, newStart, newEnd) => {
      deleted += oldEnd - oldStart;
      inserted += newEnd - newStart;
    });
  }
  if (deleted > 1) return { kind: 'discrete', key: 'body' };
  return { kind: 'typing', key: inserted > 0 ? 'body:insert' : 'body:delete' };
}

/**
 * Editor da prescrição: um único documento ProseMirror estendido sobre todas as
 * folhas. A posição de cada linha vem da composição, via decorações.
 */
export class BodyEditor {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.mount
   * @param {import('prosemirror-model').Node} options.doc
   * @param {() => Object} options.composition  composição vigente (modo edição)
   * @param {number} options.pageStride
   * @param {(doc, meta) => void} options.onChange  chamado ANTES de a visão ser atualizada
   * @param {Object} options.actions  { undo, redo, focusPrevious }
   */
  constructor({ mount, doc, composition, pageStride, onChange, onFocus, onSelection, actions }) {
    this.composition = composition;
    this.pageStride = pageStride;
    this.onChange = onChange;
    this.decorations = null;

    const keys = keymap({
      Enter: splitParagraph,
      'Shift-Enter': insertHardBreak,
      'Mod-Enter': insertPageBreak,
      Tab: insertTab,
      'Shift-Tab': () => (actions.focusPrevious(), true),
      'Mod-a': selectAllText,
      Backspace: deleteAdjacentPageBreak(-1),
      Delete: deleteAdjacentPageBreak(1),
      'Mod-b': swallow,
      'Mod-i': swallow,
      'Mod-u': swallow,
    });

    const state = EditorState.create({ doc, schema: bodySchema, plugins: [keys, keymap(baseKeymap)] });
    this.rebuild(state.doc);
    this.view = new EditorView(mount, {
      state,
      attributes: { class: 'rx-body', spellcheck: 'true', lang: 'pt-BR', 'aria-label': 'Prescrição', role: 'textbox', 'aria-multiline': 'true' },
      decorations: () => this.decorations,
      scrollThreshold: { top: 70, bottom: 110, left: 0, right: 0 },
      scrollMargin: { top: 90, bottom: 130, left: 0, right: 0 },
      dispatchTransaction: (tr) => this.dispatch(tr),
      handlePaste: (view, event) => this.handlePaste(view, event),
      handleDrop: (view, event, _slice, moved) => this.handleDrop(view, event, moved),
      handleDOMEvents: {
        beforeinput: (_view, event) => {
          const type = event.inputType || '';
          if (type === 'historyUndo') {
            event.preventDefault();
            actions.undo();
            return true;
          }
          if (type === 'historyRedo') {
            event.preventDefault();
            actions.redo();
            return true;
          }
          if (type.startsWith('format')) {
            event.preventDefault();
            return true;
          }
          return false;
        },
        focus: () => (onFocus && onFocus(), false),
      },
    });
    this.onSelection = onSelection;
  }

  rebuild(doc) {
    let set = buildBodyDecorations(doc, this.composition(), this.pageStride);
    const placeholder = bodyPlaceholder(doc, PLACEHOLDERS.body);
    if (placeholder) set = set.add(doc, [placeholder]);
    this.decorations = set;
  }

  dispatch(tr) {
    const view = this.view;
    let next = view.state.apply(tr);
    if (tr.docChanged) {
      if (next.doc.lastChild.type.name !== 'paragraph') next = next.apply(ensureTrailingParagraph(next.tr));
      if (!tr.getMeta('rx-sync')) this.onChange(next.doc, classifyTransaction(tr));
      this.rebuild(next.doc);
    }
    view.updateState(next);
    if (this.onSelection) this.onSelection();
  }

  /** A composição mudou sem que o texto mudasse (cabeçalho, zoom não entra aqui). */
  refresh() {
    this.rebuild(this.view.state.doc);
    this.view.updateState(this.view.state);
  }

  /** Substitui o documento inteiro (desfazer, refazer, nova receita). */
  setDoc(doc, selection) {
    const state = this.view.state;
    const tr = state.tr.setMeta('rx-sync', true);
    if (!state.doc.eq(doc)) tr.replaceWith(0, state.doc.content.size, doc.content);
    const size = tr.doc.content.size;
    if (selection) {
      const anchor = Math.min(Math.max(selection.anchor, 0), size);
      const head = Math.min(Math.max(selection.head, 0), size);
      try {
        tr.setSelection(TextSelection.between(tr.doc.resolve(anchor), tr.doc.resolve(head)));
      } catch {
        tr.setSelection(Selection.atStart(tr.doc));
      }
    } else {
      tr.setSelection(Selection.atStart(tr.doc));
    }
    if (tr.docChanged) this.view.dispatch(tr);
    else {
      this.rebuild(tr.doc);
      this.view.updateState(state.apply(tr));
    }
  }

  handlePaste(view, event) {
    const transfer = event.clipboardData;
    if (isInternalClipboard(transfer)) return false;
    const text = plainTextFromTransfer(transfer);
    event.preventDefault();
    if (text) view.dispatch(view.state.tr.replaceSelection(sliceFromText(text)).setMeta('paste', true).scrollIntoView());
    return true;
  }

  handleDrop(view, event, moved) {
    if (moved || view.dragging) return false; // arrasto interno: comportamento padrão
    const text = plainTextFromTransfer(event.dataTransfer);
    event.preventDefault();
    const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
    if (text && at) {
      const tr = view.state.tr;
      tr.setSelection(TextSelection.near(tr.doc.resolve(at.pos)));
      view.dispatch(tr.replaceSelection(sliceFromText(text)).setMeta('paste', true).scrollIntoView());
    }
    return true;
  }

  run(command) {
    const done = command(this.view.state, this.view.dispatch.bind(this.view));
    this.view.focus();
    return done;
  }

  can(command) {
    return command(this.view.state);
  }

  get selection() {
    const { anchor, head } = this.view.state.selection;
    return { anchor, head };
  }

  get hasFocus() {
    return this.view.hasFocus();
  }

  focus(where) {
    if (where === 'start' || where === 'end') {
      const doc = this.view.state.doc;
      const selection = where === 'start' ? Selection.atStart(doc) : Selection.atEnd(doc);
      this.view.dispatch(this.view.state.tr.setSelection(selection).scrollIntoView());
    }
    this.view.focus();
  }
}

export const bodyCommands = { insertPageBreak, splitBlock, joinBlocks };
