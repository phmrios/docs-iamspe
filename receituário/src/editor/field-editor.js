import { EditorState, TextSelection, Selection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap, selectAll } from 'prosemirror-commands';
import { fieldSchema } from './schema.js';
import { buildFieldDecorations } from './decorations.js';
import { plainTextFromTransfer, normalizeSingleLine } from './paste.js';
import { round3 } from '../utils/units.js';

const swallow = () => true;

function docFor(text) {
  return fieldSchema.node('doc', null, [fieldSchema.node('paragraph', null, text ? [fieldSchema.text(text)] : [])]);
}

/**
 * Campo administrativo editável diretamente sobre a folha (paciente, médico, UF,
 * CRM, local). Existe uma instância por página; todas refletem o mesmo valor do
 * documento central. As quebras de linha seguem a composição, como na prescrição.
 */
export class FieldEditor {
  constructor({ mount, name, page, label, placeholder, value, box, onChange, onFocus, actions }) {
    this.name = name;
    this.page = page;
    this.placeholder = placeholder;
    this.onChange = onChange;
    this.box = box;
    this.host = mount;
    mount.className = `rx-field rx-field-${name}`;

    const next = () => (actions.focusNext(), true);
    const keys = keymap({
      Enter: next,
      Tab: next,
      'Shift-Tab': () => (actions.focusPrevious(), true),
      'Mod-a': selectAll,
      'Mod-b': swallow,
      'Mod-i': swallow,
      'Mod-u': swallow,
    });
    const state = EditorState.create({ doc: docFor(value), plugins: [keys, keymap(baseKeymap)] });
    this.decorations = buildFieldDecorations(state.doc, box, placeholder);
    this.view = new EditorView(mount, {
      state,
      attributes: { class: 'rx-field-input', spellcheck: name === 'place' ? 'true' : 'false', lang: 'pt-BR', 'aria-label': label, role: 'textbox' },
      decorations: () => this.decorations,
      dispatchTransaction: (tr) => this.dispatch(tr),
      handlePaste: (view, event) => this.insertExternal(view, event, event.clipboardData),
      handleDrop: (view, event) => this.insertExternal(view, event, event.dataTransfer),
      handleDOMEvents: {
        beforeinput: (_view, event) => {
          const type = event.inputType || '';
          if (type === 'historyUndo' || type === 'historyRedo') {
            event.preventDefault();
            (type === 'historyUndo' ? actions.undo : actions.redo)();
            return true;
          }
          if (type.startsWith('format') || type === 'insertParagraph' || type === 'insertLineBreak') {
            event.preventDefault();
            return true;
          }
          return false;
        },
        focus: () => (onFocus(this), false),
      },
    });
    this.place(box);
  }

  get text() {
    return this.view.state.doc.textContent;
  }

  dispatch(tr) {
    const next = this.view.state.apply(tr);
    if (tr.docChanged) {
      if (!tr.getMeta('rx-sync')) this.onChange(this, next.doc.textContent);
      // onChange já recompôs o documento: this.box está atualizado.
      this.decorations = buildFieldDecorations(next.doc, this.box, this.placeholder);
    }
    this.view.updateState(next);
  }

  insertExternal(view, event, transfer) {
    const text = normalizeSingleLine(plainTextFromTransfer(transfer));
    event.preventDefault();
    if (text) view.dispatch(view.state.tr.insertText(text).setMeta('paste', true).scrollIntoView());
    return true;
  }

  /** Aplica valor e geometria vindos do documento central. */
  sync(value, box, selection) {
    const boxChanged = box !== this.box;
    this.box = box;
    if (boxChanged) this.place(box);
    const state = this.view.state;
    if (state.doc.textContent !== value) {
      const tr = state.tr.setMeta('rx-sync', true);
      tr.replaceWith(0, state.doc.content.size, docFor(value).content);
      if (selection) {
        const size = tr.doc.content.size;
        const clamp = (pos) => Math.min(Math.max(pos, 1), size - 1);
        tr.setSelection(TextSelection.create(tr.doc, clamp(selection.anchor), clamp(selection.head)));
      }
      this.view.dispatch(tr);
    } else if (boxChanged) {
      this.decorations = buildFieldDecorations(state.doc, box, this.placeholder);
      this.view.updateState(state);
    }
  }

  /** Só a geometria (usado no campo que originou a alteração). */
  updateBox(box) {
    if (box === this.box) return;
    this.box = box;
    this.place(box);
  }

  place(box) {
    const style = this.host.style;
    style.left = `${round3(box.x)}px`;
    style.top = `${round3(box.y)}px`;
    style.width = `${round3(box.width)}px`;
    style.minHeight = `${round3(box.height)}px`;
    style.lineHeight = `${round3(box.lineHeight)}px`;
    style.textAlign = box.align;
    style.textIndent = `${round3(box.indent)}px`;
  }

  get selection() {
    const { anchor, head } = this.view.state.selection;
    return { anchor, head };
  }

  get hasFocus() {
    return this.view.hasFocus();
  }

  focus(where = 'end') {
    const doc = this.view.state.doc;
    const selection = where === 'start' ? Selection.atStart(doc) : where === 'all' ? TextSelection.create(doc, 1, doc.content.size - 1) : Selection.atEnd(doc);
    this.view.dispatch(this.view.state.tr.setSelection(selection));
    this.view.focus();
  }

  destroy() {
    this.view.destroy();
    this.host.remove();
  }
}
