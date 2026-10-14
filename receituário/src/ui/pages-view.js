import { PAGE, PLACEHOLDERS } from '../pagination/geometry.js';
import { renderPage, sizeCanvas } from '../rendering/canvas-renderer.js';
import { FieldEditor } from '../editor/field-editor.js';
import { SignatureOverlay } from '../signature/overlay.js';
import { FIELD_NAMES } from '../document/model.js';
import { round3 } from '../utils/units.js';
import { el } from './dialogs.js';

/** Espaço, na tela, entre folhas consecutivas (px lógicos). Não existe no documento. */
export const SCREEN_GAP = 28;
export const PAGE_STRIDE = PAGE.height + SCREEN_GAP;

const FIELD_LABELS = {
  patient: 'Nome do paciente', doctor: 'Nome do médico', uf: 'UF do CRM', crm: 'Número do CRM', place: 'Local de atendimento',
};

/**
 * Folhas A4 do editor: um Canvas por página (representação gráfica) e, por cima,
 * a camada HTML com os campos editáveis e os controles de assinatura.
 */
export class PagesView {
  constructor({ sizer, layer, workspace, app }) {
    this.sizer = sizer;
    this.layer = layer;
    this.workspace = workspace;
    this.app = app;
    this.pages = [];
    this.zoom = 1;
    this.composition = null;
    this.highlightKey = '';
    this.frame = 0;
    workspace.addEventListener('scroll', () => this.scheduleRender(), { passive: true });
  }

  get totalHeight() {
    return this.pages.length * PAGE_STRIDE - SCREEN_GAP;
  }

  createPage(index, composition, state) {
    const canvas = el('canvas', { class: 'rx-canvas', 'aria-hidden': 'true' });
    this.sizer.insertBefore(canvas, this.layer);
    const highlights = el('div', { class: 'rx-highlights' });
    const pageLayer = el('div', { class: 'rx-page-layer', 'data-page': String(index) }, [highlights]);
    pageLayer.style.top = `${round3(index * PAGE_STRIDE)}px`;
    this.layer.append(pageLayer);

    const fields = {};
    for (const name of FIELD_NAMES) {
      const mount = el('div');
      pageLayer.append(mount);
      fields[name] = new FieldEditor({
        mount, name, page: index, label: `${FIELD_LABELS[name]} (página ${index + 1})`, placeholder: PLACEHOLDERS[name],
        value: state.fields[name], box: composition.fields[name],
        onChange: (editor, value) => this.app.changeField(editor, value),
        onFocus: (editor) => this.app.fieldFocused(editor),
        actions: this.app.editorActions,
      });
    }
    const dateButton = el('button', {
      type: 'button', class: 'rx-date', title: 'Alterar a data de emissão', 'aria-label': 'Alterar a data de emissão',
      onclick: () => this.app.editDate(dateButton),
    });
    pageLayer.append(dateButton);
    const signature = new SignatureOverlay({
      layer: pageLayer, page: index, region: composition.signatureRegion, zoom: () => this.zoom, actions: this.app.signatureActions,
    });
    return { index, canvas, pageLayer, highlights, fields, dateButton, signature, scale: 0, dirty: true };
  }

  destroyPage(page) {
    for (const editor of Object.values(page.fields)) editor.destroy();
    page.signature.destroy();
    page.canvas.remove();
    page.pageLayer.remove();
  }

  /**
   * Reflete uma nova composição.
   * @param {FieldEditor|null} source  campo que originou a alteração (não é ressincronizado)
   */
  update(composition, state, source = null, selections = null) {
    this.composition = composition;
    while (this.pages.length > composition.pageCount) this.destroyPage(this.pages.pop());
    while (this.pages.length < composition.pageCount) this.pages.push(this.createPage(this.pages.length, composition, state));

    const m = composition.metrics;
    const rects = [{ x: m.bodyLeft, y: m.bodyTop, width: m.bodyWidth, height: m.bodyHeight, kind: 'body' }];
    for (const name of FIELD_NAMES) for (const rect of composition.fields[name].highlight) rects.push(rect);
    const key = JSON.stringify(rects.map((r) => [round3(r.x), round3(r.y), round3(r.width), round3(r.height)]));

    for (const page of this.pages) {
      if (key !== this.highlightKey || !page.highlights.childElementCount) {
        page.highlights.replaceChildren(
          ...rects.map((rect) => {
            const node = el('div', { class: rect.kind === 'body' ? 'rx-hl rx-hl-body' : 'rx-hl' });
            node.style.cssText = `left:${round3(rect.x)}px;top:${round3(rect.y)}px;width:${round3(rect.width)}px;height:${round3(rect.height)}px`;
            return node;
          }),
        );
      }
      for (const name of FIELD_NAMES) {
        const editor = page.fields[name];
        const box = composition.fields[name];
        if (editor === source) editor.updateBox(box);
        else editor.sync(state.fields[name], box, selections && selections.page === page.index && selections.name === name ? selections : null);
      }
      const date = composition.fields.date;
      page.dateButton.style.cssText = `left:${round3(date.x)}px;top:${round3(date.y)}px;width:${round3(date.width)}px;height:${round3(date.height)}px`;
      page.signature.update(state.signatures[page.index] || null);
      page.dirty = true;
    }
    this.highlightKey = key;
    this.applyGeometry();
    this.scheduleRender();
  }

  setZoom(zoom) {
    this.zoom = zoom;
    this.applyGeometry();
    for (const page of this.pages) page.dirty = true;
    this.scheduleRender();
  }

  applyGeometry() {
    const zoom = this.zoom;
    this.sizer.style.width = `${round3(PAGE.width * zoom)}px`;
    this.sizer.style.height = `${round3(this.totalHeight * zoom)}px`;
    this.layer.style.width = `${round3(PAGE.width)}px`;
    this.layer.style.height = `${round3(this.totalHeight)}px`;
    this.layer.style.transform = `scale(${zoom})`;
    for (const page of this.pages) {
      const style = page.canvas.style;
      style.top = `${round3(page.index * PAGE_STRIDE * zoom)}px`;
      style.width = `${round3(PAGE.width * zoom)}px`;
      style.height = `${round3(PAGE.height * zoom)}px`;
    }
  }

  /** Redesenho completo de todas as páginas, coordenado por requestAnimationFrame. */
  scheduleRender() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.render();
    });
  }

  render() {
    const composition = this.composition;
    if (!composition) return;
    const ratio = window.devicePixelRatio || 1;
    const view = this.workspace.getBoundingClientRect();
    for (const page of this.pages) {
      // Resolução adaptativa: nitidez total nas folhas visíveis (e vizinhas);
      // as demais são desenhadas em resolução menor para conter o uso de memória.
      const rect = page.canvas.getBoundingClientRect();
      const near = rect.bottom > view.top - view.height && rect.top < view.bottom + view.height;
      const maxScale = near ? Infinity : 1;
      const wanted = Math.min(this.zoom * ratio, maxScale);
      if (!page.dirty && Math.abs(page.wanted - wanted) < 1e-6) continue;
      page.wanted = wanted;
      const scale = sizeCanvas(page.canvas, composition, this.zoom, ratio, maxScale);
      renderPage(page.canvas.getContext('2d'), composition, page.index, {
        scale, editing: true, image: (id, variant) => this.app.images.canvas(id, variant),
      });
      page.dirty = false;
    }
  }

  field(pageIndex, name) {
    const page = this.pages[Math.min(pageIndex, this.pages.length - 1)];
    return page ? page.fields[name] : null;
  }

  focusedField() {
    for (const page of this.pages) for (const editor of Object.values(page.fields)) if (editor.hasFocus) return editor;
    return null;
  }

  /** Página mais visível no momento (para posicionar o foco ao navegar entre campos). */
  currentPage() {
    const view = this.workspace.getBoundingClientRect();
    const middle = view.top + view.height / 2;
    let best = 0;
    let bestDistance = Infinity;
    for (const page of this.pages) {
      const rect = page.canvas.getBoundingClientRect();
      const distance = middle < rect.top ? rect.top - middle : middle > rect.bottom ? middle - rect.bottom : 0;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = page.index;
      }
    }
    return best;
  }
}
