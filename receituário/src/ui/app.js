import { createComposer } from '../pagination/compose.js';
import { PAGE } from '../pagination/geometry.js';
import { createHyphenator } from '../typography/hyphenation.js';
import { checkMeasurer } from '../typography/measure.js';
import { TEXT } from '../pagination/geometry.js';
import { createInitialState, toDocumentState, pruneSignatures, hasContent, estimateSize } from '../document/model.js';
import { History } from '../history/history.js';
import { BodyEditor, bodyCommands } from '../editor/body-editor.js';
import { FieldEditor } from '../editor/field-editor.js';
import { PagesView, PAGE_STRIDE } from './pages-view.js';
import { Preview } from './preview.js';
import { ImageStore } from '../signature/image-store.js';
import { defaultPlacement, fitSignature } from '../signature/geometry.js';
import { functionalWarnings, technicalWarnings, paginationDiverges } from '../validation/validate.js';
import { generateVerifiedPdf } from '../pdf/generate.js';
import { pdfFileName } from '../pdf/filename.js';
import { downloadPdf, printPdf } from '../pdf/output.js';
import { todayISO, isValidISO } from '../utils/date.js';
import { round3 } from '../utils/units.js';
import { el, showDialog, toast, warningList, isDialogOpen } from './dialogs.js';

const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const MOD = IS_MAC ? '⌘' : 'Ctrl';
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 3;
const FIELD_ORDER = ['patient', 'body', 'doctor', 'uf', 'crm', 'place', 'date'];

export class App {
  constructor({ fonts, measurer }) {
    this.fonts = fonts;
    this.measurer = measurer;
    this.composer = createComposer({ measurer, hyphenator: createHyphenator() });
    this.images = new ImageStore();
    this.history = new History({ sizeOf: (snapshot) => estimateSize(snapshot.state) });
    this.state = createInitialState();
    this.composition = this.compose(this.state);
    this.lastFocus = { kind: 'body', anchor: 1, head: 1 };
    this.fontProblems = checkMeasurer(measurer, TEXT.size);

    this.editorActions = {
      undo: () => this.undo(),
      redo: () => this.redo(),
      focusNext: () => this.moveFocus(1),
      focusPrevious: () => this.moveFocus(-1),
    };
    this.signatureActions = {
      pickFile: (page) => this.pickSignature(page),
      change: (page, signature, record) => this.setSignature(page, signature, record ? { kind: 'discrete' } : false),
      remove: (page) => this.setSignature(page, null, { kind: 'discrete' }),
    };
  }

  compose(state, editing = true) {
    return this.composer.compose(toDocumentState(state), { editing });
  }

  mount() {
    this.workspace = document.getElementById('rx-workspace');
    this.sizer = document.getElementById('rx-sizer');
    this.layer = document.getElementById('rx-layer');
    this.bodyHost = document.getElementById('rx-body-host');
    this.zoomSelect = document.getElementById('rx-zoom');
    this.warningButton = document.getElementById('rx-warnings');

    this.pages = new PagesView({ sizer: this.sizer, layer: this.layer, workspace: this.workspace, app: this });
    this.pages.update(this.composition, this.state);
    this.body = new BodyEditor({
      mount: this.bodyHost,
      doc: this.state.body,
      composition: () => this.composition,
      pageStride: PAGE_STRIDE,
      onChange: (doc, meta) => this.commit({ body: doc }, { source: 'body', history: meta }),
      onFocus: () => this.history.closeGroup(),
      actions: this.editorActions,
    });
    this.preview = new Preview({
      image: (id, variant) => this.images.canvas(id, variant),
      onExport: () => this.exportPdf(),
      onPrint: () => this.print(),
    });
    this.placeBody();
    this.bindToolbar();
    this.bindShortcuts();
    window.addEventListener('beforeunload', (event) => {
      if (!hasContent(this.state)) return;
      event.preventDefault();
      event.returnValue = '';
    });
    window.addEventListener('resize', () => this.pages.scheduleRender());
    this.setZoom(this.initialZoom());
    this.updateChrome();
    this.body.focus();
    this.fileInput = el('input', { type: 'file', accept: 'image/png,.png', hidden: true, 'aria-hidden': 'true', tabindex: '-1' });
    document.body.append(this.fileInput);
  }

  // ---------------------------------------------------------------- estado

  captureFocus() {
    if (this.body && this.body.hasFocus) return (this.lastFocus = { kind: 'body', ...this.body.selection });
    const field = this.pages ? this.pages.focusedField() : null;
    if (field) return (this.lastFocus = { kind: 'field', name: field.name, page: field.page, ...field.selection });
    return this.lastFocus;
  }

  snapshot() {
    return { state: this.state, focus: this.captureFocus() };
  }

  /**
   * Único ponto de alteração do documento central.
   * @param {Object} patch
   * @param {{source?: any, history?: Object|false}} meta
   */
  commit(patch, { source = null, history = { kind: 'discrete' } } = {}) {
    const before = this.snapshot();
    let next = { ...this.state, ...patch };
    let composition = this.compose(next);
    // Página que desapareceu leva junto a sua assinatura (e isso entra no histórico).
    const kept = pruneSignatures(next.signatures, composition.pageCount);
    if (kept !== next.signatures) {
      next = { ...next, signatures: kept };
      composition = this.compose(next);
    }
    if (history !== false) this.history.record(before, history);
    this.state = next;
    this.composition = composition;
    this.refresh(source);
  }

  refresh(source, selection = null) {
    this.pages.update(this.composition, this.state, source instanceof FieldEditor ? source : null, selection);
    this.placeBody();
    if (source !== 'body') this.body.refresh();
    this.updateChrome();
  }

  placeBody() {
    const m = this.composition.metrics;
    const style = this.bodyHost.style;
    style.left = `${round3(m.bodyLeft)}px`;
    style.top = `${round3(m.bodyTop)}px`;
    style.width = `${round3(m.bodyWidth)}px`;
    style.setProperty('--rx-body-min', `${round3((this.composition.pageCount - 1) * PAGE_STRIDE + m.bodyHeight)}px`);
  }

  restore(snapshot) {
    this.state = snapshot.state;
    this.composition = this.compose(this.state);
    const focus = snapshot.focus || this.lastFocus;
    this.pages.update(this.composition, this.state, null, focus.kind === 'field' ? focus : null);
    this.placeBody();
    this.body.setDoc(this.state.body, focus.kind === 'body' ? focus : this.body.selection);
    this.updateChrome();
    if (focus.kind === 'field') {
      const editor = this.pages.field(focus.page, focus.name);
      if (editor) editor.view.focus();
    } else {
      this.body.view.focus();
      this.body.view.dispatch(this.body.view.state.tr.scrollIntoView());
    }
    this.lastFocus = focus;
  }

  undo() {
    const snapshot = this.history.undo(this.snapshot());
    if (snapshot) this.restore(snapshot);
  }

  redo() {
    const snapshot = this.history.redo(this.snapshot());
    if (snapshot) this.restore(snapshot);
  }

  changeField(editor, value) {
    this.commit(
      { fields: { ...this.state.fields, [editor.name]: value } },
      { source: editor, history: { kind: 'typing', key: `field:${editor.name}` } },
    );
  }

  fieldFocused(editor) {
    this.history.closeGroup();
    this.lastFocus = { kind: 'field', name: editor.name, page: editor.page, ...editor.selection };
  }

  // ---------------------------------------------------------------- foco

  moveFocus(direction) {
    const field = this.pages.focusedField();
    const active = document.activeElement;
    let current = field ? field.name : this.body.hasFocus ? 'body' : active && active.classList.contains('rx-date') ? 'date' : null;
    const page = field ? field.page : current === 'date' ? Number(active.closest('.rx-page-layer').dataset.page) : this.caretPage();
    const index = current ? FIELD_ORDER.indexOf(current) + direction : direction > 0 ? 0 : FIELD_ORDER.length - 1;
    const target = FIELD_ORDER[(index + FIELD_ORDER.length) % FIELD_ORDER.length];
    if (target === 'body') this.body.focus();
    else if (target === 'date') this.pages.pages[Math.min(page, this.pages.pages.length - 1)].dateButton.focus();
    else this.pages.field(page, target).focus(direction > 0 ? 'end' : 'end');
  }

  caretPage() {
    try {
      const coords = this.body.view.coordsAtPos(this.body.view.state.selection.head);
      for (const page of this.pages.pages) {
        const rect = page.canvas.getBoundingClientRect();
        if (coords.top >= rect.top && coords.top <= rect.bottom) return page.index;
      }
    } catch {
      /* sem cursor visível */
    }
    return this.pages.currentPage();
  }

  // ---------------------------------------------------------------- zoom

  fitWidthZoom() {
    return (this.workspace.clientWidth - 72) / PAGE.width;
  }

  initialZoom() {
    return Math.min(1.25, Math.max(0.5, Math.floor(this.fitWidthZoom() * 20) / 20));
  }

  setZoom(zoom) {
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(zoom * 100) / 100));
    const ws = this.workspace;
    const anchor = ws.scrollHeight > 0 ? (ws.scrollTop + ws.clientHeight / 2) / ws.scrollHeight : 0;
    this.zoom = next;
    this.pages.setZoom(next);
    ws.scrollTop = anchor * ws.scrollHeight - ws.clientHeight / 2;
    this.updateChrome();
  }

  // ---------------------------------------------------------------- data

  editDate(anchor) {
    const input = el('input', { type: 'date', class: 'rx-date-input', value: this.state.date, 'aria-label': 'Data de emissão' });
    const apply = (value) => {
      if (isValidISO(value) && value !== this.state.date) this.commit({ date: value }, { history: { kind: 'discrete' } });
    };
    input.addEventListener('change', () => apply(input.value));
    showDialog({
      title: 'Data de emissão',
      body: [input, 'A data aparece no canto inferior direito de todas as páginas.'],
      buttons: [
        { label: 'Usar a data de hoje', value: 'today' },
        { label: 'Concluir', value: 'ok', primary: true },
      ],
    }).then((choice) => {
      if (choice === 'today') apply(todayISO());
      else if (choice === 'ok') apply(input.value);
      anchor.focus();
    });
    input.focus();
  }

  // ---------------------------------------------------------------- assinaturas

  setSignature(page, signature, history) {
    const signatures = { ...this.state.signatures };
    if (signature) signatures[page] = signature;
    else delete signatures[page];
    this.commit({ signatures }, { history });
  }

  pickSignature(page) {
    const input = this.fileInput;
    input.value = '';
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (file) this.addSignature(page, file);
    };
    input.click();
  }

  async addSignature(page, file) {
    try {
      const image = await this.images.add(file);
      const aspect = image.width / image.height;
      const previous = this.state.signatures[page];
      const base = previous
        ? fitSignature({ ...previous, width: previous.height * aspect }, this.composition.signatureRegion)
        : defaultPlacement(image.width, image.height, this.composition.signatureRegion);
      this.setSignature(page, { ...base, id: image.id, aspect, useProcessed: image.backgroundRemoved }, { kind: 'discrete' });
    } catch (error) {
      toast(error.message || 'Não foi possível carregar a imagem.', { kind: 'error' });
    }
  }

  // ---------------------------------------------------------------- saída

  currentWarnings() {
    const technical = technicalWarnings(this.composition);
    for (const problem of this.fontProblems) {
      technical.push({ code: 'font', message: `Falha de composição de fontes: a medida da fonte "${problem.fontKey}" difere da esperada.` });
    }
    return technical;
  }

  /** Composição final + avisos não bloqueantes + geração conferida do PDF. */
  async prepareOutput(action) {
    if (this.busy) return null;
    const composition = this.compose(this.state, false);
    const warnings = [...functionalWarnings(this.state), ...technicalWarnings(composition)];
    for (const problem of this.fontProblems) warnings.push({ code: 'font', message: `Falha de composição de fontes (${problem.fontKey}).` });
    if (paginationDiverges(this.composition, composition)) {
      warnings.push({ code: 'pagination', message: 'Divergência de paginação entre o editor e o documento final.' });
    }
    if (warnings.length) {
      const choice = await showDialog({
        title: warnings.length === 1 ? 'Há 1 aviso antes de continuar' : `Há ${warnings.length} avisos antes de continuar`,
        body: [warningList(warnings), 'Você pode continuar assim mesmo ou voltar e ajustar.'],
        buttons: [
          { label: 'Voltar à edição', value: 'back' },
          { label: action, value: 'go', primary: true },
        ],
        dismissValue: 'back',
      });
      if (choice !== 'go') return null;
    }
    this.busy = true;
    try {
      const bytes = await generateVerifiedPdf(composition, {
        fonts: this.fonts,
        image: (id, variant) => this.images.bytes(id, variant),
      });
      return { bytes, composition };
    } catch (error) {
      console.error(error);
      await showDialog({
        title: 'Não foi possível gerar o PDF',
        body: ['A geração falhou mesmo após novas tentativas. Nenhum arquivo foi criado e o documento continua intacto.', `Detalhe técnico: ${error && error.message ? error.message : error}`],
        buttons: [{ label: 'Voltar à edição', value: 'ok', primary: true }],
      });
      return null;
    } finally {
      this.busy = false;
    }
  }

  async exportPdf() {
    const output = await this.prepareOutput('Exportar PDF');
    if (!output) return;
    const name = pdfFileName(this.state.fields.patient, this.state.date);
    downloadPdf(output.bytes, name);
    this.lastExport = { name, size: output.bytes.length };
    toast(`PDF exportado: ${name}`);
  }

  async print() {
    const output = await this.prepareOutput('Imprimir');
    if (!output) return;
    const result = await printPdf(output.bytes);
    this.lastPrint = result;
    if (result === 'opened') toast('O PDF foi aberto em outra aba. Imprima a partir dela.');
    if (result === 'blocked') toast('O navegador bloqueou a impressão direta. Exporte o PDF e imprima o arquivo.', { kind: 'error' });
  }

  openPreview() {
    this.preview.open(this.compose(this.state, false));
  }

  async newPrescription() {
    if (hasContent(this.state)) {
      const choice = await showDialog({
        title: 'Começar uma nova receita?',
        body: ['Paciente, prescrição, identificação médica, local e assinaturas serão apagados. Isso não pode ser desfeito.'],
        buttons: [
          { label: 'Cancelar', value: 'cancel' },
          { label: 'Nova receita', value: 'new', primary: true, danger: true },
        ],
        dismissValue: 'cancel',
      });
      if (choice !== 'new') return;
    }
    this.history.clear();
    this.images.clear();
    this.lastFocus = { kind: 'body', anchor: 1, head: 1 };
    this.restore({ state: createInitialState(), focus: this.lastFocus });
    this.workspace.scrollTop = 0;
  }

  showWarnings() {
    const warnings = this.currentWarnings();
    showDialog({
      title: 'Avisos técnicos',
      body: warnings.length ? [warningList(warnings)] : ['Nenhum problema técnico detectado.'],
      buttons: [{ label: 'Fechar', value: 'ok', primary: true }],
    });
  }

  showHelp() {
    const rows = [
      ['Exportar PDF', `${MOD} + Shift + E`], ['Imprimir', `${MOD} + P`], ['Nova receita', `${MOD} + Shift + N  ou  Alt + Shift + N`],
      ['Desfazer / Refazer', `${MOD} + Z  /  ${MOD} + Shift + Z`], ['Ampliar / Reduzir / Zoom original', `${MOD} + +  /  ${MOD} + −  /  ${MOD} + 0`],
      ['Novo parágrafo', 'Enter'], ['Quebra de linha no mesmo parágrafo', 'Shift + Enter'], ['Tabulação na prescrição', 'Tab'],
      ['Quebra de página manual', `${MOD} + Enter`], ['Dividir bloco', 'Alt + Shift + D'], ['Unir blocos', 'Alt + Shift + U'],
      ['Próximo campo / campo anterior', 'F6  /  Shift + F6'], ['Sair da prescrição para o campo anterior', 'Shift + Tab'],
    ];
    const table = el('table', { class: 'rx-help' }, rows.map(([what, keys]) => el('tr', {}, [el('td', { text: what }), el('td', {}, [el('kbd', { text: keys })])])));
    showDialog({
      title: 'Atalhos de teclado',
      body: [table, 'Blocos são trechos separados por linha vazia que a paginação mantém juntos na mesma folha. A assinatura em PNG é só uma imagem: não equivale a uma assinatura digital.'],
      buttons: [{ label: 'Fechar', value: 'ok', primary: true }],
    });
  }

  // ---------------------------------------------------------------- barra e atalhos

  bindToolbar() {
    const actions = {
      new: () => this.newPrescription(),
      undo: () => this.undo(),
      redo: () => this.redo(),
      'page-break': () => this.body.run(bodyCommands.insertPageBreak),
      'split-block': () => this.body.run(bodyCommands.splitBlock),
      'join-blocks': () => this.body.run(bodyCommands.joinBlocks),
      'zoom-out': () => this.setZoom(this.zoom - 0.1),
      'zoom-in': () => this.setZoom(this.zoom + 0.1),
      'zoom-fit': () => this.setZoom(this.fitWidthZoom()),
      'zoom-reset': () => this.setZoom(1),
      preview: () => this.openPreview(),
      print: () => this.print(),
      export: () => this.exportPdf(),
      warnings: () => this.showWarnings(),
      help: () => this.showHelp(),
    };
    this.actions = actions;
    const bar = document.getElementById('rx-topbar');
    // mousedown não tira o foco do editor: os comandos de bloco dependem do cursor.
    bar.addEventListener('mousedown', (event) => {
      if (event.target.closest('button')) event.preventDefault();
    });
    bar.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-action]');
      if (button && !button.disabled && actions[button.dataset.action]) actions[button.dataset.action]();
    });
    this.zoomSelect.addEventListener('change', () => {
      const value = parseFloat(String(this.zoomSelect.value).replace(',', '.'));
      if (Number.isFinite(value) && value > 0) this.setZoom(value / 100);
      else this.updateChrome();
    });
    this.zoomSelect.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.zoomSelect.blur();
        this.body.view.focus();
      }
    });
    document.addEventListener('selectionchange', () => this.updateCommands());
  }

  updateChrome() {
    document.querySelector('[data-action="undo"]').disabled = !this.history.canUndo;
    document.querySelector('[data-action="redo"]').disabled = !this.history.canRedo;
    if (this.zoomSelect && document.activeElement !== this.zoomSelect) this.zoomSelect.value = `${Math.round((this.zoom || 1) * 100)}%`;
    const warnings = this.currentWarnings();
    this.warningButton.hidden = warnings.length === 0;
    this.warningButton.textContent = warnings.length === 1 ? '1 aviso' : `${warnings.length} avisos`;
    this.updateCommands();
  }

  updateCommands() {
    if (!this.body) return;
    const inBody = this.body.hasFocus;
    const set = (action, enabled) => {
      document.querySelector(`[data-action="${action}"]`).disabled = !enabled;
    };
    set('page-break', inBody && this.body.can(bodyCommands.insertPageBreak));
    set('split-block', inBody && this.body.can(bodyCommands.splitBlock));
    set('join-blocks', inBody && this.body.can(bodyCommands.joinBlocks));
  }

  bindShortcuts() {
    window.addEventListener(
      'keydown',
      (event) => {
        if (event.defaultPrevented) return;
        const mod = IS_MAC ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
        const run = (fn) => {
          event.preventDefault();
          event.stopPropagation();
          if (!isDialogOpen() || fn === 'always') return true;
          return false;
        };
        const blocked = isDialogOpen();
        const code = event.code;
        if (mod && !event.altKey) {
          if (event.shiftKey && code === 'KeyE') return run() && !this.busy && this.exportPdf();
          if (!event.shiftKey && code === 'KeyP') return run() && this.print();
          if (event.shiftKey && code === 'KeyN') return run() && this.newPrescription();
          if (code === 'KeyZ') return run() && !this.preview.isOpen && (event.shiftKey ? this.redo() : this.undo());
          if (!IS_MAC && !event.shiftKey && code === 'KeyY') return run() && !this.preview.isOpen && this.redo();
          if (code === 'Equal' || code === 'NumpadAdd' || event.key === '+') return run() && this.zoomBy(0.1);
          if (code === 'Minus' || code === 'NumpadSubtract' || event.key === '-') return run() && this.zoomBy(-0.1);
          if (code === 'Digit0' || code === 'Numpad0') return run() && this.zoomBy(0);
        }
        if (blocked || this.preview.isOpen) return undefined;
        if (event.altKey && event.shiftKey && !mod) {
          if (code === 'KeyN') return run() && this.newPrescription();
          if (code === 'KeyD') return run() && this.body.hasFocus && this.body.run(bodyCommands.splitBlock);
          if (code === 'KeyU') return run() && this.body.hasFocus && this.body.run(bodyCommands.joinBlocks);
        }
        if (event.key === 'F6') return run() && this.moveFocus(event.shiftKey ? -1 : 1);
        return undefined;
      },
      true,
    );
  }

  /** Os atalhos de zoom agem na prévia quando ela está aberta; senão, no editor. */
  zoomBy(delta) {
    if (this.preview.isOpen) this.preview.setZoom(delta === 0 ? 1 : this.preview.zoom + delta);
    else this.setZoom(delta === 0 ? 1 : this.zoom + delta);
  }
}
