import { FONTS } from '../typography/fonts.js';

function decodeBase64(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Registra as fontes incorporadas ao HTML e só retorna depois de carregadas:
 * nenhuma medição pode acontecer antes disso. Os mesmos bytes são reutilizados
 * na incorporação ao PDF.
 * @param {{regular: string, bold: string, fallback: string}} embedded  TTF em base64
 * @returns {Promise<{regular: Uint8Array, bold: Uint8Array, fallback: Uint8Array}>}
 */
export async function loadEmbeddedFonts(embedded) {
  const bytes = {};
  const faces = [];
  for (const key of ['regular', 'bold', 'fallback']) {
    bytes[key] = decodeBase64(embedded[key]);
    const font = FONTS[key];
    // Cópia do buffer: o FontFace pode tomar posse dos dados.
    const face = new FontFace(font.family, bytes[key].slice().buffer, { weight: String(font.weight), style: 'normal' });
    document.fonts.add(face);
    faces.push(face.load());
  }
  await Promise.all(faces);
  await document.fonts.ready;
  return bytes;
}
