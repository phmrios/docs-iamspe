import { cssFont } from '../typography/fonts.js';

/**
 * Desenha uma página no Canvas a partir do resultado de composição.
 * Não calcula posições nem altera conteúdo: apenas representa os itens recebidos.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} composition
 * @param {number} pageIndex
 * @param {Object} options
 * @param {number} options.scale        px do canvas por px lógico (zoom × devicePixelRatio)
 * @param {boolean} [options.editing]   no editor, o texto editável é exibido pela camada HTML
 * @param {(id: string, variant: string) => CanvasImageSource|undefined} [options.image]
 */
export function renderPage(ctx, composition, pageIndex, { scale, editing = false, image }) {
  const { width, height } = composition.page;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.textBaseline = 'alphabetic';
  if ('fontKerning' in ctx) ctx.fontKerning = 'none';
  if ('textRendering' in ctx) ctx.textRendering = 'geometricPrecision';

  const page = composition.pages[pageIndex];
  if (!page) return;
  let font = '';
  for (const item of page.items) {
    if (item.type === 'text') {
      if (editing && item.editable) continue;
      const next = cssFont(item.font, item.size);
      if (next !== font) {
        ctx.font = next;
        font = next;
      }
      ctx.fillStyle = item.color || '#000000';
      ctx.fillText(item.text, item.x, item.y);
    } else if (item.type === 'line') {
      ctx.beginPath();
      ctx.moveTo(item.x1, item.y1);
      ctx.lineTo(item.x2, item.y2);
      ctx.lineWidth = item.thickness;
      ctx.strokeStyle = item.color || '#000000';
      ctx.stroke();
    } else if (item.type === 'image') {
      const source = image ? image(item.id, item.variant) : undefined;
      if (!source) continue;
      ctx.save();
      ctx.translate(item.cx, item.cy);
      ctx.rotate((item.rotation * Math.PI) / 180);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(source, -item.width / 2, -item.height / 2, item.width, item.height);
      ctx.restore();
    }
  }
}

const MAX_CANVAS_SIDE = 8192;

/**
 * Ajusta a resolução interna do canvas ao zoom e à densidade do monitor, sem
 * mudar o tamanho físico da página. Devolve a escala efetivamente usada.
 */
export function sizeCanvas(canvas, composition, zoom, pixelRatio, maxScale = Infinity) {
  const { width, height } = composition.page;
  let scale = Math.min(zoom * pixelRatio, maxScale);
  scale = Math.min(scale, MAX_CANVAS_SIDE / height);
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  canvas.style.width = `${width * zoom}px`;
  canvas.style.height = `${height * zoom}px`;
  return w / width;
}
