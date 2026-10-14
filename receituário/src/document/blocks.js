/**
 * Blocos de texto: grupos de parágrafos que a paginação tenta manter na mesma folha.
 *
 * Detecção automática: linhas vazias separam blocos. O usuário ajusta os limites com
 * o atributo `boundary` do parágrafo:
 *   - "split" em um parágrafo com texto: um novo bloco começa nele;
 *   - "join" em uma linha vazia: ela deixa de separar e passa a integrar o bloco.
 * Os ajustes só mudam atributos; o texto nunca é tocado.
 *
 * @typedef {{type: 'paragraph', text: string, boundary: (null|'split'|'join')}|{type: 'page_break'}} BodyNode
 * @typedef {{kind: 'para'|'sep'|'break', block: number, first: boolean, last: boolean}} BlockInfo
 */

export const isSeparator = (node) => node.type === 'paragraph' && node.text === '' && node.boundary !== 'join';

/**
 * @param {BodyNode[]} nodes
 * @returns {BlockInfo[]} uma entrada por nó
 */
export function computeBlocks(nodes) {
  const info = new Array(nodes.length);
  let block = -1;
  let open = false;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.type !== 'paragraph') {
      info[i] = { kind: 'break', block: -1, first: false, last: false };
      open = false;
    } else if (isSeparator(node)) {
      info[i] = { kind: 'sep', block: -1, first: false, last: false };
      open = false;
    } else {
      const starts = !open || (node.boundary === 'split' && node.text !== '');
      if (starts) block += 1;
      info[i] = { kind: 'para', block, first: starts, last: false };
      open = true;
    }
  }
  for (let i = 0; i < nodes.length; i++) {
    if (info[i].kind !== 'para') continue;
    const next = info[i + 1];
    info[i].last = !next || next.kind !== 'para' || next.first;
  }
  return info;
}
