const segmenter =
  typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('pt-BR', { granularity: 'grapheme' }) : null;

const FALLBACK_CLUSTER = /\P{M}\p{M}*|\p{M}+/gu;

/** Divide o texto em agrupamentos de grafemas (base + marcas combinantes). */
export function graphemes(text) {
  if (!text) return [];
  if (segmenter) return Array.from(segmenter.segment(text), (part) => part.segment);
  return text.match(FALLBACK_CLUSTER) || [];
}

/** Tamanho, em unidades UTF-16, do último grafema de `text`. */
export function lastGraphemeLength(text) {
  const parts = graphemes(text);
  return parts.length ? parts[parts.length - 1].length : 0;
}

/** Tamanho, em unidades UTF-16, do primeiro grafema de `text`. */
export function firstGraphemeLength(text) {
  const parts = graphemes(text);
  return parts.length ? parts[0].length : 0;
}

export function stripAccents(text) {
  return text.normalize('NFD').replace(/\p{M}+/gu, '');
}

// Os caracteres invisíveis são descritos por código numérico para que o próprio
// código-fonte não contenha caracteres invisíveis.
const chars = (...codes) => String.fromCharCode(...codes);
const SOFT_HYPHEN = 0xad;
const NBSP = 0xa0;

// Controles C0/C1 (exceto TAB e LF), marca de ordem de bytes, espaços de largura
// zero e hífens opcionais: nenhum deles é conteúdo visível digitado pelo usuário.
const INVISIBLE = new RegExp(
  `[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F-\\x84\\x86-\\x9F${chars(SOFT_HYPHEN, 0x200b, 0x2060, 0xfeff)}]`,
  'g',
);
// Separadores de linha/parágrafo Unicode e NEL.
const LINE_SEPARATORS = new RegExp(`[${chars(0x2028, 0x2029, 0x85)}]`, 'g');
const NBSP_ALL = new RegExp(chars(NBSP), 'g');

/**
 * Normaliza texto vindo de fora (colagem, arrastar e soltar) para a estrutura
 * interna: somente texto simples, quebras como "\n", tabulações preservadas.
 * Não corrige, não abrevia e não substitui palavras.
 */
export function normalizePlainText(input) {
  return String(input ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(LINE_SEPARATORS, '\n')
    .replace(NBSP_ALL, ' ')
    .replace(INVISIBLE, '')
    .normalize('NFC');
}

/** Texto de linha única (campos administrativos): quebras e tabulações viram espaço. */
export function normalizeSingleLine(input) {
  return normalizePlainText(input).replace(/[\n\t]+/g, ' ');
}
