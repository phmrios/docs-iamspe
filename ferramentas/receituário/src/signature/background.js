/**
 * Remoção automática de fundo branco ou quase branco de uma assinatura.
 *
 * Trabalha direto sobre os pixels RGBA. Pixels claros e pouco saturados ficam
 * transparentes; a transição é gradual para preservar o contorno suave dos traços.
 * Não há controle de sensibilidade: os limiares são fixos.
 */
const WHITE_FROM = 205; // abaixo disso o pixel é traço e fica opaco
const WHITE_TO = 245; // acima disso o pixel é fundo e fica transparente
const MAX_CHROMA = 40; // fundo é quase neutro; tinta colorida clara é preservada

/**
 * @param {Uint8ClampedArray|Uint8Array} data  pixels RGBA (modificado no lugar)
 * @returns {{changed: number, total: number}} quantos pixels tiveram a opacidade reduzida
 */
export function removeWhiteBackground(data) {
  let changed = 0;
  const total = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha === 0) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const min = Math.min(r, g, b);
    if (min <= WHITE_FROM) continue;
    const max = Math.max(r, g, b);
    if (max - min > MAX_CHROMA) continue;
    const keep = min >= WHITE_TO ? 0 : (WHITE_TO - min) / (WHITE_TO - WHITE_FROM);
    const next = Math.round(alpha * keep);
    if (next !== alpha) {
      // Compensa a mistura com o branco para o traço não clarear ao ficar translúcido.
      if (keep > 0) {
        data[i] = Math.max(0, Math.round((r - 255 * (1 - keep)) / keep));
        data[i + 1] = Math.max(0, Math.round((g - 255 * (1 - keep)) / keep));
        data[i + 2] = Math.max(0, Math.round((b - 255 * (1 - keep)) / keep));
      }
      data[i + 3] = next;
      changed += 1;
    }
  }
  return { changed, total };
}

/** Assinatura PNG: 89 50 4E 47 0D 0A 1A 0A. */
export function isPng(bytes) {
  const magic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return bytes.length > 8 && magic.every((value, i) => bytes[i] === value);
}
