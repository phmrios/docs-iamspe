import { el } from './dialogs.js';
import { renderPage, sizeCanvas } from '../rendering/canvas-renderer.js';
import { PAGE } from '../pagination/geometry.js';

const clamp = (value) => Math.min(3, Math.max(0.25, value));

/**
 * Prévia limpa: as mesmas páginas, desenhadas pelo mesmo renderizador a partir da
 * composição final, sem nenhum elemento de edição. O zoom é independente do editor.
 */
export class Preview {
  constructor({ image, onExport, onPrint }) {
    this.image = image;
    this.onExport = onExport;
    this.onPrint = onPrint;
    this.backdrop = null;
    this.zoom = 1;
  }

  get isOpen() {
    return Boolean(this.backdrop);
  }

  open(composition) {
    if (this.isOpen) this.close();
    this.composition = composition;
    this.previousFocus = document.activeElement;
    this.zoomLabel = el('span', { class: 'rx-zoom-value', 'aria-live': 'polite' });
    this.scroller = el('div', { class: 'rx-preview-pages', tabindex: '0' });
    const bar = el('div', { class: 'rx-preview-bar' }, [
      el('strong', { text: composition.pageCount === 1 ? 'Prévia: 1 página' : `Prévia: ${composition.pageCount} páginas` }),
      el('div', { class: 'rx-group' }, [
        el('button', { type: 'button', class: 'rx-btn rx-btn-icon', text: '−', title: 'Reduzir', 'aria-label': 'Reduzir zoom da prévia', onclick: () => this.setZoom(this.zoom - 0.1) }),
        this.zoomLabel,
        el('button', { type: 'button', class: 'rx-btn rx-btn-icon', text: '+', title: 'Ampliar', 'aria-label': 'Ampliar zoom da prévia', onclick: () => this.setZoom(this.zoom + 0.1) }),
      ]),
      el('div', { class: 'rx-group rx-group-end' }, [
        el('button', { type: 'button', class: 'rx-btn', text: 'Imprimir', onclick: () => this.onPrint() }),
        el('button', { type: 'button', class: 'rx-btn rx-btn-primary', text: 'Exportar PDF', onclick: () => this.onExport() }),
        el('button', { type: 'button', class: 'rx-btn', text: 'Fechar', 'data-action': 'close-preview', onclick: () => this.close() }),
      ]),
    ]);
    this.panel = el('div', { class: 'rx-preview', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Prévia do receituário' }, [bar, this.scroller]);
    this.backdrop = el('div', { class: 'rx-backdrop rx-backdrop-preview', onmousedown: (event) => event.target === this.backdrop && this.close() }, [this.panel]);
    document.getElementById('rx-overlays').append(this.backdrop);

    this.canvases = composition.pages.map(() => {
      const canvas = el('canvas', { class: 'rx-preview-canvas' });
      this.scroller.append(canvas);
      return canvas;
    });
    this.onKey = (event) => {
      if (event.key === 'Escape' && document.getElementById('rx-overlays').lastElementChild === this.backdrop) {
        event.preventDefault();
        event.stopPropagation();
        this.close();
      }
    };
    document.addEventListener('keydown', this.onKey, true);
    const fit = (this.scroller.clientWidth - 48) / PAGE.width;
    this.setZoom(Math.min(1, fit));
    this.scroller.focus();
  }

  setZoom(zoom) {
    this.zoom = clamp(Math.round(zoom * 100) / 100);
    this.zoomLabel.textContent = `${Math.round(this.zoom * 100)}%`;
    const ratio = window.devicePixelRatio || 1;
    this.canvases.forEach((canvas, index) => {
      const scale = sizeCanvas(canvas, this.composition, this.zoom, ratio);
      renderPage(canvas.getContext('2d'), this.composition, index, { scale, editing: false, image: this.image });
    });
  }

  close() {
    if (!this.backdrop) return;
    document.removeEventListener('keydown', this.onKey, true);
    this.backdrop.remove();
    this.backdrop = null;
    if (this.previousFocus && this.previousFocus.focus) this.previousFocus.focus();
  }
}
