import { Decoration, DecorationSet } from 'prosemirror-view';
import { round3 } from '../utils/units.js';
import { firstGraphemeLength, lastGraphemeLength } from '../utils/text.js';

/**
 * Sincronização entre a composição e a camada HTML editável.
 *
 * O navegador nunca decide onde uma linha termina: os parágrafos usam
 * `white-space: pre` e todas as quebras, hífens visuais, larguras de tabulação e
 * saltos de página são impostos por decorações calculadas a partir do mesmo
 * resultado de composição que alimenta o Canvas e o PDF.
 *
 * As decorações são apenas atributos sobre o texto real (o conteúdo gerado fica em
 * pseudo-elementos CSS). Nada é inserido no documento, de modo que cursor, seleção
 * e corretor ortográfico continuam operando sobre o texto lógico.
 */

const wrap = (from, to, cls, style) =>
  Decoration.inline(from, to, style ? { nodeName: 'span', class: cls, style } : { nodeName: 'span', class: cls });

/**
 * Decorações de um parágrafo.
 * @param {Decoration[]} out
 * @param {number} base       posição do primeiro caractere do parágrafo
 * @param {string} text       texto do parágrafo ("\n" = quebra simples)
 * @param {import('../typography/linebreak.js').Line[]} lines
 * @param {(i: number) => number} gapAfter  espaço vertical extra após a linha i
 * @param {boolean} hideHanging  oculta os espaços pendentes (campos centralizados)
 */
export function decorateLines(out, base, text, lines, gapAfter, hideHanging) {
  const inner = [];
  const outer = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const tab of line.tabs) {
      inner.push(Decoration.inline(base + tab.offset, base + tab.offset + 1, { class: 'rx-tab', style: `width:${round3(tab.width)}px` }));
    }
    for (const seg of line.segs) {
      if (seg.font === 'fallback') inner.push(Decoration.inline(base + seg.start, base + seg.end, { class: 'rx-fb' }));
      else if (seg.font === 'missing') inner.push(Decoration.inline(base + seg.start, base + seg.end, { class: 'rx-nf' }));
    }
    if (i === lines.length - 1) break;

    const gap = gapAfter(i);
    const hasGap = gap > 0.01;
    const gapStyle = hasGap ? `--rx-gap:${round3(gap)}px` : null;
    const next = lines[i + 1];

    if (line.hard) {
      // A quebra simples já encerra a linha; só o salto de página precisa de ajuda.
      if (hasGap) outer.push(wrap(base + line.end - 1, base + line.end, 'rx-gap-after', gapStyle));
      continue;
    }

    if (hideHanging && line.end > line.hangFrom) {
      inner.push(Decoration.inline(base + line.hangFrom, base + line.end, { class: 'rx-hang' }));
    }

    const nextLength = firstGraphemeLength(text.slice(next.start, next.end));
    if (line.end === line.start) {
      // Linha sem caracteres (só o recuo do rótulo): a quebra vem antes do próximo.
      if (nextLength) outer.push(wrap(base + next.start, base + next.start + nextLength, 'rx-break-before'));
      continue;
    }
    const lastLength = lastGraphemeLength(text.slice(line.start, line.end));
    const from = base + line.end - lastLength;
    if (hasGap && nextLength) {
      if (line.hyphen) outer.push(wrap(from, base + line.end, 'rx-hyphen-only'));
      outer.push(wrap(base + next.start, base + next.start + nextLength, 'rx-gap-before', gapStyle));
    } else {
      outer.push(wrap(from, base + line.end, line.hyphen ? 'rx-hyphen-break' : 'rx-break'));
    }
  }
  // As decorações internas (tabulação, fonte) precisam vir antes das que criam
  // elementos envolventes, para que estes fiquem por fora.
  for (const deco of inner) out.push(deco);
  for (const deco of outer) out.push(deco);
}

/**
 * Decorações da prescrição: margens entre parágrafos (incluindo os saltos de uma
 * folha para a outra), limites de bloco e quebras de linha.
 * @param {import('prosemirror-model').Node} doc
 * @param {Object} composition
 * @param {number} pageStride  distância vertical, na tela, entre o topo de páginas consecutivas
 */
export function buildBodyDecorations(doc, composition, pageStride) {
  const decorations = [];
  const lineHeight = composition.metrics.lineHeight;
  const laid = composition.body.nodes;
  let bottom = 0;
  doc.forEach((node, offset, index) => {
    const layout = laid[index];
    if (node.type.name === 'page_break') {
      const top = layout.page * pageStride + layout.y;
      decorations.push(Decoration.node(offset, offset + node.nodeSize, { style: `margin-top:${round3(top - bottom)}px` }));
      bottom = top;
      return;
    }
    const top = (i) => layout.linePage[i] * pageStride + layout.lineY[i];
    const classes = [];
    if (layout.block.kind === 'para') {
      if (layout.block.first) classes.push('rx-block-first');
      if (layout.block.last) classes.push('rx-block-last');
    }
    const attrs = { style: `margin-top:${round3(top(0) - bottom)}px` };
    if (classes.length) attrs.class = classes.join(' ');
    decorations.push(Decoration.node(offset, offset + node.nodeSize, attrs));
    decorateLines(decorations, offset + 1, layout.text, layout.lines, (i) => top(i + 1) - top(i) - lineHeight, false);
    bottom = top(layout.lines.length - 1) + lineHeight;
  });
  return DecorationSet.create(doc, decorations);
}

/** Decorações de um campo administrativo (um único parágrafo). */
export function buildFieldDecorations(doc, box, placeholder) {
  const decorations = [];
  const text = doc.firstChild.textContent;
  decorateLines(decorations, 1, text, box.lines, () => 0, box.align === 'center');
  if (!text && placeholder) {
    decorations.push(Decoration.widget(1, () => placeholderElement(placeholder), { side: 1, key: `ph:${placeholder}`, ignoreSelection: true }));
  }
  return DecorationSet.create(doc, decorations);
}

export function placeholderElement(text) {
  const span = document.createElement('span');
  span.className = 'rx-placeholder';
  span.textContent = text;
  span.setAttribute('aria-hidden', 'true');
  span.contentEditable = 'false';
  return span;
}

/** Texto indicativo da prescrição: só quando o documento é um único parágrafo vazio. */
export function bodyPlaceholder(doc, text) {
  if (doc.childCount !== 1 || doc.firstChild.type.name !== 'paragraph' || doc.firstChild.content.size) return null;
  return Decoration.widget(1, () => placeholderElement(text), { side: 1, key: 'ph:body', ignoreSelection: true });
}
