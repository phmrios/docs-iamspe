import { Schema } from 'prosemirror-model';

/**
 * Esquema da prescrição: somente texto simples. Não existem marcas (negrito,
 * itálico, cor...), tabelas ou imagens; os únicos nós estruturais são parágrafo,
 * quebra simples de linha e quebra manual de página.
 */
export const bodySchema = new Schema({
  nodes: {
    doc: { content: '(paragraph | page_break)+' },
    paragraph: {
      content: 'inline*',
      attrs: { boundary: { default: null } }, // ajuste manual de bloco: null | 'split' | 'join'
      parseDOM: [
        { tag: 'p', getAttrs: (dom) => ({ boundary: dom.getAttribute('data-boundary') || null }) },
        { tag: 'div' }, { tag: 'li' }, { tag: 'h1' }, { tag: 'h2' }, { tag: 'h3' }, { tag: 'h4' }, { tag: 'h5' }, { tag: 'h6' },
      ],
      toDOM: (node) => (node.attrs.boundary ? ['p', { 'data-boundary': node.attrs.boundary }, 0] : ['p', 0]),
    },
    page_break: {
      atom: true,
      selectable: true,
      parseDOM: [{ tag: 'div[data-page-break]' }],
      toDOM: () => ['div', { 'data-page-break': '', class: 'rx-page-break' }, ['span', 'Quebra de página manual']],
    },
    hard_break: {
      inline: true,
      group: 'inline',
      selectable: false,
      leafText: () => '\n',
      parseDOM: [{ tag: 'br' }],
      toDOM: () => ['br'],
    },
    text: { group: 'inline' },
  },
  marks: {},
});

/** Esquema dos campos administrativos: um único parágrafo de texto simples. */
export const fieldSchema = new Schema({
  nodes: {
    doc: { content: 'paragraph' },
    paragraph: { content: 'text*', parseDOM: [{ tag: 'p' }, { tag: 'div' }], toDOM: () => ['p', 0] },
    text: {},
  },
  marks: {},
});

export function emptyBody() {
  return bodySchema.node('doc', null, [bodySchema.node('paragraph')]);
}

/** Texto de um parágrafo: quebras simples viram "\n". Cada nó em linha ocupa 1 posição. */
export function paragraphText(node) {
  return node.textBetween(0, node.content.size, '', '\n');
}

const nodeCache = new WeakMap();

/**
 * Converte o documento ProseMirror na representação neutra usada pela composição.
 * Parágrafos inalterados devolvem o mesmo objeto, o que mantém válido o cache de
 * linhas e torna a paginação incremental.
 * @returns {import('../document/blocks.js').BodyNode[]}
 */
export function bodyNodes(doc) {
  const nodes = [];
  doc.forEach((child) => {
    let neutral = nodeCache.get(child);
    if (!neutral) {
      neutral =
        child.type.name === 'page_break'
          ? { type: 'page_break' }
          : { type: 'paragraph', text: paragraphText(child), boundary: child.attrs.boundary };
      nodeCache.set(child, neutral);
    }
    nodes.push(neutral);
  });
  return nodes;
}

/** Texto integral da prescrição (parágrafos separados por "\n"; quebras manuais ignoradas). */
export function bodyText(doc) {
  const parts = [];
  doc.forEach((child) => {
    if (child.type.name === 'paragraph') parts.push(paragraphText(child));
  });
  return parts.join('\n');
}

/** Constrói um documento a partir de texto simples: uma linha por parágrafo; "\f" = quebra de página. */
export function bodyFromText(text) {
  const children = [];
  for (const [index, chunk] of String(text).split('\f').entries()) {
    if (index > 0) children.push(bodySchema.node('page_break'));
    for (const line of chunk.split('\n')) children.push(paragraphFromText(line));
  }
  return bodySchema.node('doc', null, children);
}

export function paragraphFromText(line, attrs = null) {
  return bodySchema.node('paragraph', attrs, line ? [bodySchema.text(line)] : []);
}
