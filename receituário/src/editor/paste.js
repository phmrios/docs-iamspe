import { Fragment, Slice } from 'prosemirror-model';
import { bodySchema, paragraphFromText } from './schema.js';
import { normalizePlainText, normalizeSingleLine } from '../utils/text.js';

const BLOCK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DIV', 'DL', 'DT', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'H1', 'H2',
  'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'TR', 'UL',
]);
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'HEAD', 'TITLE', 'META', 'LINK', 'NOSCRIPT', 'TEMPLATE', 'IFRAME', 'OBJECT']);

/**
 * Extrai somente o texto de um HTML colado. O HTML é interpretado em um documento
 * inerte (DOMParser): nada é executado nem inserido na página, e todo estilo é
 * descartado. Elementos de bloco e <br> viram quebras de linha.
 */
export function htmlToPlainText(html, parser = new DOMParser()) {
  const doc = parser.parseFromString(String(html), 'text/html');
  let out = '';
  const walk = (node) => {
    if (node.nodeType === 3) {
      out += node.nodeValue.replace(/\s+/g, ' ');
      return;
    }
    if (node.nodeType !== 1 || SKIP_TAGS.has(node.tagName)) return;
    if (node.tagName === 'BR') {
      out += '\n';
      return;
    }
    const block = BLOCK_TAGS.has(node.tagName);
    if (block && out && !out.endsWith('\n')) out += '\n';
    if (node.tagName === 'TD' || node.tagName === 'TH') {
      if (out && !out.endsWith('\n') && !out.endsWith('\t')) out += '\t';
    }
    for (const child of node.childNodes) walk(child);
    if (block && !out.endsWith('\n')) out += '\n';
  };
  if (doc.body) walk(doc.body);
  return out.replace(/ *\n */g, '\n').replace(/^\n+|\n+$/g, '');
}

/**
 * Texto simples → fatia do documento: cada linha vira um parágrafo, linhas vazias
 * são preservadas, tabulações permanecem. A tipografia padrão é a do editor.
 */
export function sliceFromText(input) {
  const text = normalizePlainText(input);
  const lines = text.split('\n');
  if (lines.length === 1) {
    return lines[0] ? new Slice(Fragment.from(bodySchema.text(lines[0])), 0, 0) : Slice.empty;
  }
  return new Slice(Fragment.from(lines.map((line) => paragraphFromText(line))), 1, 1);
}

/** Lê do evento de colagem/soltura apenas texto, nunca marcação externa. */
export function plainTextFromTransfer(transfer) {
  if (!transfer) return '';
  const plain = transfer.getData('text/plain');
  if (plain) return plain;
  const html = transfer.getData('text/html');
  return html ? htmlToPlainText(html) : '';
}

/** O conteúdo foi copiado deste próprio editor? (mantém quebras simples e manuais) */
export function isInternalClipboard(transfer) {
  const html = transfer ? transfer.getData('text/html') : '';
  return Boolean(html && html.includes('data-pm-slice'));
}

export { normalizeSingleLine };
