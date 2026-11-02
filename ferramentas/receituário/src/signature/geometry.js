import { mm } from '../utils/units.js';
import { SIGNATURE_LINE, SIGNATURE_REGION } from '../pagination/geometry.js';

export const MIN_SIGNATURE_SIZE = mm(4);

const toRadians = (degrees) => (degrees * Math.PI) / 180;

/** Normaliza o ângulo para o intervalo (-180, 180]. */
export function normalizeAngle(degrees) {
  if (!Number.isFinite(degrees)) return 0;
  let angle = degrees % 360;
  if (angle > 180) angle -= 360;
  if (angle <= -180) angle += 360;
  return angle;
}

/** Meia-extensão da caixa alinhada aos eixos que envolve o retângulo girado. */
export function rotatedHalfExtent(width, height, degrees) {
  const angle = toRadians(degrees);
  const cos = Math.abs(Math.cos(angle));
  const sin = Math.abs(Math.sin(angle));
  return { ex: (width * cos + height * sin) / 2, ey: (width * sin + height * cos) / 2 };
}

/**
 * Ajusta posição e tamanho para que a imagem girada fique inteiramente dentro da
 * região reservada. Reduz o tamanho (mantendo a proporção) só quando necessário.
 * @param {{cx: number, cy: number, width: number, height: number, rotation: number}} signature
 * @param {{x: number, y: number, width: number, height: number}} region
 */
export function fitSignature(signature, region = SIGNATURE_REGION) {
  const rotation = normalizeAngle(signature.rotation || 0);
  let width = Math.max(signature.width, 1);
  let height = Math.max(signature.height, 1);
  let { ex, ey } = rotatedHalfExtent(width, height, rotation);
  const scale = Math.min(1, region.width / (2 * ex), region.height / (2 * ey));
  if (scale < 1) {
    width *= scale;
    height *= scale;
    ex *= scale;
    ey *= scale;
  }
  const clamp = (value, min, max) => (min > max ? (min + max) / 2 : Math.min(Math.max(value, min), max));
  const cx = clamp(signature.cx, region.x + ex, region.x + region.width - ex);
  const cy = clamp(signature.cy, region.y + ey, region.y + region.height - ey);
  return { cx, cy, width, height, rotation };
}

/** Indica se a assinatura, como informada, já respeita a região (tolerância de 0,5 px). */
export function isInsideRegion(signature, region = SIGNATURE_REGION) {
  const { ex, ey } = rotatedHalfExtent(signature.width, signature.height, signature.rotation || 0);
  const t = 0.5;
  return (
    signature.cx - ex >= region.x - t &&
    signature.cx + ex <= region.x + region.width + t &&
    signature.cy - ey >= region.y - t &&
    signature.cy + ey <= region.y + region.height + t
  );
}

/** Posição inicial: centralizada, apoiada na linha de assinatura. */
export function defaultPlacement(naturalWidth, naturalHeight, region = SIGNATURE_REGION) {
  const aspect = naturalWidth > 0 && naturalHeight > 0 ? naturalWidth / naturalHeight : 3;
  let height = Math.min(mm(16), region.height - mm(2));
  let width = height * aspect;
  const maxWidth = mm(70);
  if (width > maxWidth) {
    width = maxWidth;
    height = width / aspect;
  }
  const bottom = SIGNATURE_LINE.y + mm(1);
  return fitSignature({ cx: region.x + region.width / 2, cy: bottom - height / 2, width, height, rotation: 0 }, region);
}

/**
 * Redimensiona a partir de um arrasto de alça: a distância do ponteiro ao centro
 * define a escala, preservando proporção e centro.
 */
export function resizeFromPointer(signature, start, pointer) {
  const d0 = Math.hypot(start.x - signature.cx, start.y - signature.cy) || 1;
  const d1 = Math.hypot(pointer.x - signature.cx, pointer.y - signature.cy);
  const aspect = signature.width / signature.height;
  let width = Math.max(MIN_SIGNATURE_SIZE, signature.width * (d1 / d0));
  let height = width / aspect;
  if (height < MIN_SIGNATURE_SIZE) {
    height = MIN_SIGNATURE_SIZE;
    width = height * aspect;
  }
  return { ...signature, width, height };
}

/** Ângulo (graus) do centro até o ponteiro, com 0° apontando para cima. */
export function angleFromPointer(signature, pointer) {
  const degrees = (Math.atan2(pointer.y - signature.cy, pointer.x - signature.cx) * 180) / Math.PI + 90;
  return normalizeAngle(degrees);
}

/**
 * Origem (canto inferior esquerdo) para desenhar no PDF uma imagem girada em torno
 * do próprio centro. Coordenadas do PDF: y cresce para cima; rotação anti-horária.
 * @param {{cx: number, cy: number, width: number, height: number, rotation: number}} box  em pontos, já no sistema do PDF
 */
export function pdfImageOrigin(box) {
  const angle = toRadians(box.rotation);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const hw = box.width / 2;
  const hh = box.height / 2;
  return { x: box.cx - (hw * cos - hh * sin), y: box.cy - (hw * sin + hh * cos) };
}
