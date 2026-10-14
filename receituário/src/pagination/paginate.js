/**
 * Distribuição das linhas da prescrição entre as páginas.
 *
 * Entrada: uma lista de unidades já compostas em linhas. Saída: página e posição
 * vertical de cada linha, relativas ao topo da área de prescrição.
 *
 * Regras, em ordem de prioridade:
 *  1. quebras manuais sempre iniciam nova página;
 *  2. linhas vazias são preservadas onde caírem, inclusive no topo de uma folha;
 *  3. um bloco que cabe em uma folha não é dividido;
 *  4. um parágrafo que cabe em uma folha não é dividido;
 *  5. parágrafos maiores que uma folha são divididos sem deixar linha isolada
 *     no fim ou no início de página (órfãs/viúvas = 2).
 *
 * @typedef {Object} PageNode
 * @property {'paragraph'|'page_break'} type
 * @property {number} [lines]   quantidade de linhas (parágrafo)
 * @property {boolean} [sep]    linha vazia separadora de blocos
 * @property {boolean} [first]  primeiro parágrafo de um bloco
 *
 * @typedef {Object} Placement
 * @property {number} page             página da primeira linha (ou da quebra)
 * @property {number} y                posição da primeira linha (ou da quebra)
 * @property {Int32Array} [linePage]
 * @property {Float64Array} [lineY]
 *
 * @typedef {Object} Pagination
 * @property {number} pageCount
 * @property {Placement[]} placements
 * @property {({page: number, y: number, empty: boolean}|null)[]} starts  estado antes de cada unidade
 * @property {string[]} signature
 * @property {Object} config
 * @property {number} recomputed  nós efetivamente recalculados (diagnóstico e testes)
 */

const ORPHANS = 2;
const WIDOWS = 2;
const EPS = 0.01;

const signatureOf = (node) =>
  node.type === 'page_break' ? 'b' : `${node.sep ? 's' : node.first ? 'f' : 'p'}${node.lines}`;

const isUnitStart = (node) => node.type === 'page_break' || node.sep || node.first;

const sameConfig = (a, b) =>
  a.bodyHeight === b.bodyHeight && a.lineHeight === b.lineHeight && a.paraGap === b.paraGap;

/**
 * @param {PageNode[]} nodes
 * @param {{bodyHeight: number, lineHeight: number, paraGap: number}} config
 * @param {Pagination|null} [previous]  resultado anterior, para paginação incremental
 * @returns {Pagination}
 */
export function paginate(nodes, config, previous = null) {
  const { bodyHeight, lineHeight, paraGap } = config;
  const limit = bodyHeight + EPS;
  const count = nodes.length;
  const signature = nodes.map(signatureOf);
  const placements = new Array(count);
  const starts = new Array(count).fill(null);

  let page = 0;
  let y = 0;
  let empty = true;
  let index = 0;
  let resumeFrom = Infinity;
  let shift = 0;

  // Paginação incremental: reaproveita tudo o que vem antes da primeira unidade
  // alterada e interrompe o recálculo quando a distribuição volta a coincidir
  // com a anterior.
  if (previous && sameConfig(previous.config, config)) {
    const old = previous.signature;
    let prefix = 0;
    while (prefix < count && prefix < old.length && signature[prefix] === old[prefix]) prefix++;
    let suffix = 0;
    while (
      suffix < count - prefix &&
      suffix < old.length - prefix &&
      signature[count - 1 - suffix] === old[old.length - 1 - suffix]
    ) {
      suffix++;
    }
    let restart = Math.min(prefix, count);
    while (restart > 0 && !(restart < count && isUnitStart(nodes[restart]) && previous.starts[restart])) restart--;
    if (restart > 0) {
      for (let i = 0; i < restart; i++) {
        placements[i] = previous.placements[i];
        starts[i] = previous.starts[i];
      }
      ({ page, y, empty } = previous.starts[restart]);
      index = restart;
    }
    resumeFrom = count - suffix;
    shift = old.length - count;
  }

  const fits = (height) => y + (empty ? 0 : paraGap) + height <= limit;
  const newPage = () => {
    page += 1;
    y = 0;
    empty = true;
  };
  const placeLines = (placement, from, howMany, withGap) => {
    if (withGap && !empty) y += paraGap;
    for (let k = from; k < from + howMany; k++) {
      placement.linePage[k] = page;
      placement.lineY[k] = y;
      y += lineHeight;
    }
    empty = false;
  };
  const allocate = (i) => {
    const lines = nodes[i].lines;
    const placement = { page: 0, y: 0, linePage: new Int32Array(lines), lineY: new Float64Array(lines) };
    placements[i] = placement;
    return placement;
  };
  const finish = (placement) => {
    placement.page = placement.linePage[0];
    placement.y = placement.lineY[0];
  };
  const placeWhole = (i) => {
    const placement = allocate(i);
    placeLines(placement, 0, nodes[i].lines, true);
    finish(placement);
  };
  const splitParagraph = (i) => {
    const placement = allocate(i);
    const total = nodes[i].lines;
    let placed = 0;
    while (placed < total) {
      const first = placed === 0;
      const room = limit - y - (first && !empty ? paraGap : 0);
      const available = Math.max(0, Math.floor(room / lineHeight));
      const remaining = total - placed;
      if (remaining <= available) {
        placeLines(placement, placed, remaining, first);
        break;
      }
      let take = available;
      if (remaining - take < WIDOWS) take = remaining - WIDOWS;
      if (take < ORPHANS && !empty) take = 0;
      if (take <= 0) {
        if (!empty) {
          newPage();
          continue;
        }
        // Folha vazia que não comporta nem as linhas mínimas: coloca o que couber.
        take = Math.max(1, Math.min(available, remaining));
      }
      placeLines(placement, placed, take, first);
      placed += take;
      newPage();
    }
    finish(placement);
  };

  let recomputed = 0;
  let reused = false;
  while (index < count) {
    const node = nodes[index];

    if (index >= resumeFrom && isUnitStart(node)) {
      const before = previous.starts[index + shift];
      if (before && before.page === page && Math.abs(before.y - y) < EPS && before.empty === empty) {
        for (let i = index; i < count; i++) {
          placements[i] = previous.placements[i + shift];
          starts[i] = previous.starts[i + shift];
        }
        reused = true;
        break;
      }
    }

    starts[index] = { page, y, empty };

    if (node.type === 'page_break') {
      placements[index] = { page, y };
      newPage();
      index += 1;
      recomputed += 1;
      continue;
    }

    if (node.sep) {
      if (!fits(lineHeight)) newPage();
      placeWhole(index);
      index += 1;
      recomputed += 1;
      continue;
    }

    let end = index + 1;
    while (end < count && nodes[end].type === 'paragraph' && !nodes[end].sep && !nodes[end].first) end++;
    let blockHeight = (end - index - 1) * paraGap;
    for (let i = index; i < end; i++) blockHeight += nodes[i].lines * lineHeight;

    if (!fits(blockHeight) && !empty && blockHeight <= limit) newPage();
    if (fits(blockHeight)) {
      for (let i = index; i < end; i++) placeWhole(i);
    } else {
      for (let i = index; i < end; i++) {
        const height = nodes[i].lines * lineHeight;
        if (fits(height)) placeWhole(i);
        else if (height <= limit) {
          newPage();
          placeWhole(i);
        } else splitParagraph(i);
      }
    }
    recomputed += end - index;
    index = end;
  }

  let pageCount = page + 1;
  if (reused) {
    pageCount = previous.pageCount;
  }
  return { pageCount, placements, starts, signature, config: { bodyHeight, lineHeight, paraGap }, recomputed };
}
