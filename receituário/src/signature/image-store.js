import { removeWhiteBackground, isPng } from './background.js';

const MAX_SIDE = 2400;

function canvasToBytes(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error('Não foi possível codificar a imagem.'));
      else blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)), reject);
    }, 'image/png');
  });
}

function decode(bytes) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('O arquivo não é uma imagem PNG válida.'));
    };
    img.src = url;
  });
}

/**
 * Imagens de assinatura da sessão. Tudo fica em memória, no próprio navegador:
 * nada é enviado nem gravado. Cada imagem tem a versão original e a versão com o
 * fundo branco removido.
 */
export class ImageStore {
  constructor() {
    this.images = new Map();
    this.counter = 0;
  }

  /** @param {File|Blob} file */
  async add(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!isPng(bytes)) throw new Error('Selecione um arquivo PNG.');
    const img = await decode(bytes);
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));

    const original = document.createElement('canvas');
    original.width = width;
    original.height = height;
    original.getContext('2d').drawImage(img, 0, 0, width, height);

    const processed = document.createElement('canvas');
    processed.width = width;
    processed.height = height;
    const ctx = processed.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(original, 0, 0);
    const data = ctx.getImageData(0, 0, width, height);
    const result = removeWhiteBackground(data.data);
    ctx.putImageData(data, 0, 0);

    const id = `sig-${++this.counter}`;
    this.images.set(id, {
      width,
      height,
      backgroundRemoved: result.changed > 0,
      original: { canvas: original, bytes: scale === 1 ? bytes : await canvasToBytes(original) },
      processed: { canvas: processed, bytes: await canvasToBytes(processed) },
    });
    return { id, width, height, backgroundRemoved: result.changed > 0 };
  }

  canvas(id, variant) {
    const entry = this.images.get(id);
    return entry ? entry[variant].canvas : undefined;
  }

  bytes(id, variant) {
    const entry = this.images.get(id);
    return entry ? entry[variant].bytes : undefined;
  }

  info(id) {
    return this.images.get(id);
  }

  clear() {
    this.images.clear();
  }
}
