import { el } from '../ui/dialogs.js';
import { fitSignature, resizeFromPointer, angleFromPointer, normalizeAngle } from './geometry.js';
import { round3 } from '../utils/units.js';

/**
 * Controles de assinatura de UMA página: inserir, arrastar, redimensionar, girar,
 * substituir, restaurar e remover. A imagem em si é desenhada pelo Canvas; aqui
 * ficam apenas as alças e os botões, que nunca são exportados.
 */
export class SignatureOverlay {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.layer   camada HTML da página (coordenadas lógicas)
   * @param {number} options.page
   * @param {Object} options.region       região reservada à assinatura
   * @param {() => number} options.zoom
   * @param {Object} options.actions      { add, change, remove, pickFile }
   */
  constructor({ layer, page, region, zoom, actions }) {
    this.layer = layer;
    this.page = page;
    this.region = region;
    this.zoom = zoom;
    this.actions = actions;
    this.signature = null;

    this.addButton = el('button', {
      type: 'button', class: 'rx-sig-add', text: 'Inserir assinatura (PNG)', title: 'Carregar uma imagem PNG de assinatura para esta página',
      onclick: () => actions.pickFile(page),
    });
    this.addButton.style.left = `${round3(region.x)}px`;
    this.addButton.style.top = `${round3(region.y + 4)}px`;

    this.angleInput = el('input', {
      type: 'number', class: 'rx-sig-angle', step: '1', min: '-180', max: '180', 'aria-label': 'Rotação em graus', title: 'Rotação em graus',
      onchange: () => this.commit({ rotation: normalizeAngle(Number(this.angleInput.value) || 0) }, true),
    });
    this.backgroundButton = el('button', { type: 'button', class: 'rx-sig-tool', onclick: () => this.toggleBackground() });
    this.toolbar = el('div', { class: 'rx-sig-toolbar' }, [
      el('button', { type: 'button', class: 'rx-sig-tool', text: 'Substituir', onclick: () => actions.pickFile(page) }),
      this.backgroundButton,
      el('label', { class: 'rx-sig-angle-label' }, [this.angleInput, el('span', { text: '°' })]),
      el('button', { type: 'button', class: 'rx-sig-tool rx-sig-remove', text: 'Remover', onclick: () => actions.remove(page) }),
    ]);

    this.box = el('div', { class: 'rx-sig-box', tabindex: '0', role: 'img', 'aria-label': `Assinatura da página ${page + 1}` }, [
      el('div', { class: 'rx-sig-handle rx-sig-rotate', 'data-mode': 'rotate', title: 'Girar' }),
      ...['nw', 'ne', 'sw', 'se'].map((corner) => el('div', { class: `rx-sig-handle rx-sig-${corner}`, 'data-mode': 'resize', title: 'Redimensionar' })),
    ]);
    this.box.addEventListener('pointerdown', (event) => this.startDrag(event));
    this.box.addEventListener('keydown', (event) => this.onKey(event));

    this.root = el('div', { class: 'rx-sig' }, [this.addButton, this.box, this.toolbar]);
    layer.append(this.root);
    this.update(null);
  }

  update(signature) {
    this.signature = signature;
    const has = Boolean(signature);
    this.addButton.hidden = has;
    this.box.hidden = !has;
    this.toolbar.hidden = !has;
    if (!has) return;
    const s = fitSignature(signature, this.region);
    const style = this.box.style;
    style.left = `${round3(s.cx - s.width / 2)}px`;
    style.top = `${round3(s.cy - s.height / 2)}px`;
    style.width = `${round3(s.width)}px`;
    style.height = `${round3(s.height)}px`;
    style.transform = `rotate(${round3(s.rotation)}deg)`;
    this.toolbar.style.left = `${round3(this.region.x)}px`;
    this.toolbar.style.top = `${round3(this.region.y - 34)}px`;
    if (document.activeElement !== this.angleInput) this.angleInput.value = String(Math.round(s.rotation));
    this.backgroundButton.textContent = signature.useProcessed ? 'Restaurar original' : 'Remover fundo';
    this.backgroundButton.title = signature.useProcessed
      ? 'Voltar à imagem original, com fundo e sem rotação'
      : 'Remover novamente o fundo branco';
  }

  toggleBackground() {
    const signature = this.signature;
    if (!signature) return;
    if (signature.useProcessed) {
      // Restaurar imagem original: pixels originais, proporção original, sem rotação.
      const height = signature.height;
      this.commit({ useProcessed: false, rotation: 0, width: height * signature.aspect, height }, true);
    } else {
      this.commit({ useProcessed: true }, true);
    }
  }

  commit(patch, record) {
    if (!this.signature) return;
    const next = fitSignature({ ...this.signature, ...patch }, this.region);
    this.actions.change(this.page, { ...this.signature, ...patch, ...next }, record);
  }

  pointerToPage(event) {
    const rect = this.layer.getBoundingClientRect();
    const zoom = this.zoom();
    return { x: (event.clientX - rect.left) / zoom, y: (event.clientY - rect.top) / zoom };
  }

  startDrag(event) {
    if (event.button !== 0 || !this.signature) return;
    // Um arrasto anterior pode não ter recebido o "soltar" (ponteiro fora da janela).
    if (this.stopDrag) this.stopDrag();
    const under = document.elementFromPoint(event.clientX, event.clientY);
    const handle = under && this.box.contains(under) ? under : event.target;
    const mode = handle.getAttribute('data-mode') || 'move';
    event.preventDefault();
    this.box.focus();
    const start = this.pointerToPage(event);
    const origin = { ...this.signature };
    let first = true;
    const move = (ev) => {
      // Sem botão pressionado, o arrasto já terminou (o "soltar" ocorreu fora da janela).
      if (ev.buttons === 0) {
        stop();
        return;
      }
      const pointer = this.pointerToPage(ev);
      let patch;
      if (mode === 'move') patch = { cx: origin.cx + pointer.x - start.x, cy: origin.cy + pointer.y - start.y };
      else if (mode === 'resize') patch = resizeFromPointer(origin, start, pointer);
      else {
        let rotation = angleFromPointer(origin, pointer);
        if (ev.shiftKey) rotation = Math.round(rotation / 15) * 15;
        patch = { rotation };
      }
      const next = fitSignature({ ...origin, ...patch }, this.region);
      // Um arrasto inteiro é uma única entrada no histórico.
      this.actions.change(this.page, { ...origin, ...patch, ...next }, first);
      first = false;
    };
    // Captura do ponteiro: o arrasto continua (e termina) mesmo que o ponteiro
    // saia da janela do navegador.
    const target = this.box;
    const stop = () => {
      this.stopDrag = null;
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', stop);
      target.removeEventListener('pointercancel', stop);
      target.removeEventListener('lostpointercapture', stop);
      try {
        target.releasePointerCapture(event.pointerId);
      } catch {
        /* captura já liberada */
      }
    };
    try {
      target.setPointerCapture(event.pointerId);
    } catch {
      /* ponteiro sintético sem captura */
    }
    this.stopDrag = stop;
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', stop);
    target.addEventListener('pointercancel', stop);
    target.addEventListener('lostpointercapture', stop);
  }

  onKey(event) {
    if (event.target !== this.box || !this.signature) return;
    const step = event.shiftKey ? 10 : 1;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[event.key]) {
      event.preventDefault();
      this.commit({ cx: this.signature.cx + moves[event.key][0], cy: this.signature.cy + moves[event.key][1] }, true);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.actions.remove(this.page);
    }
  }

  destroy() {
    this.root.remove();
  }
}
