import { splitRuns } from './fonts.js';
import { breakOpportunities } from './hyphenation.js';
import { graphemes } from '../utils/text.js';

/**
 * @typedef {Object} Segment  Trecho contíguo desenhado com uma única fonte.
 * @property {string} text
 * @property {string} font     regular | bold | fallback | missing
 * @property {number} x        posição relativa ao início da linha
 * @property {number} width
 * @property {number} start    deslocamento no texto do parágrafo
 * @property {number} end
 *
 * @typedef {Object} Line
 * @property {number} start      deslocamento do primeiro caractere
 * @property {number} end        deslocamento após o último (inclui o "\n" de quebra simples)
 * @property {Segment[]} segs
 * @property {{offset: number, x: number, width: number}[]} tabs
 * @property {number} width      largura visível (sem os espaços finais pendentes)
 * @property {number} advance    posição final, incluindo espaços pendentes
 * @property {number} hangFrom   deslocamento onde começam os espaços finais
 * @property {boolean} hyphen    hífen visual acrescentado pela composição
 * @property {boolean} hard      termina em quebra de linha digitada (Shift+Enter)
 */

/** Tolerância de encaixe, em px: absorve diferenças de arredondamento entre navegadores. */
export const FIT_EPSILON = 0.5;

const TOKEN = /\n|\t| +|[^\n\t ]+/gu;

/**
 * Compõe um parágrafo em linhas.
 *
 * Regras: quebra nos espaços (que ficam pendentes no fim da linha), hifenização
 * visual quando parte da palavra cabe, palavra inteira para a linha seguinte quando
 * não cabe, e divisão forçada por grafema para sequências maiores que a linha.
 * Nenhum caractere do texto original é alterado, criado ou descartado.
 *
 * @param {string} text  texto do parágrafo; "\n" = quebra simples, "\t" = tabulação
 * @param {Object} options
 * @param {number} options.width        largura útil
 * @param {{measure: Function}} options.measurer
 * @param {number} options.size         tamanho da fonte em px
 * @param {string} [options.font]
 * @param {number} [options.indent]     recuo da primeira linha (rótulos permanentes)
 * @param {number} [options.tabChars]   distância entre paradas de tabulação, em caracteres
 * @param {Object|null} [options.hyphenator]
 * @returns {Line[]}
 */
export function breakParagraph(text, options) {
  const { width, measurer, size, font = 'regular', indent = 0, tabChars = 2, hyphenator = null } = options;
  const limit = width + FIT_EPSILON;
  const measure = (value, fontKey) => measurer.measure(value, fontKey, size);
  const tabWidth = tabChars * measure(' ', font);
  const hyphenWidth = hyphenator ? measure('-', font) : 0;

  const lines = [];
  let line = openLine(0, indent);

  function openLine(start, x = 0) {
    return { start, end: start, segs: [], tabs: [], width: x, advance: x, hangFrom: start, hyphen: false, hard: false, x0: x };
  }

  function closeLine(nextStart, hard = false) {
    line.hard = hard;
    lines.push(line);
    line = openLine(nextStart);
  }

  function runsWidth(runs) {
    let total = 0;
    for (const run of runs) total += measure(run.text, run.font);
    return total;
  }

  function append(value, start, isInk) {
    for (const run of splitRuns(value, font)) {
      const runWidth = measure(run.text, run.font);
      const last = line.segs[line.segs.length - 1];
      const absStart = start + run.start;
      if (last && last.font === run.font && last.end === absStart) {
        last.text += run.text;
        last.width += runWidth;
        last.end += run.text.length;
      } else {
        line.segs.push({ text: run.text, font: run.font, x: line.advance, width: runWidth, start: absStart, end: absStart + run.text.length });
      }
      line.advance += runWidth;
    }
    line.end = start + value.length;
    if (isInk) {
      line.width = line.advance;
      line.hangFrom = line.end;
    }
  }

  function placeWord(word, start) {
    for (;;) {
      const wordWidth = runsWidth(splitRuns(word, font));
      if (line.advance + wordWidth <= limit) {
        append(word, start, true);
        return;
      }
      const available = limit - line.advance;
      const candidates = breakOpportunities(word, hyphenator);
      let chosen = null;
      for (const candidate of candidates) {
        const head = word.slice(0, candidate.at);
        const headWidth = runsWidth(splitRuns(head, font)) + (candidate.hyphen ? hyphenWidth : 0);
        if (headWidth <= available) chosen = candidate;
        else break;
      }
      if (chosen) {
        append(word.slice(0, chosen.at), start, true);
        line.hyphen = chosen.hyphen;
        start += chosen.at;
        word = word.slice(chosen.at);
        closeLine(start);
        continue;
      }
      if (line.end > line.start || line.x0 > 0) {
        closeLine(start);
        continue;
      }
      // Linha vazia e sequência maior que a largura útil: divide entre grafemas,
      // sem hífen, garantindo ao menos um por linha.
      let taken = '';
      let takenWidth = 0;
      for (const cluster of graphemes(word)) {
        const clusterWidth = runsWidth(splitRuns(cluster, font));
        if (taken && line.advance + takenWidth + clusterWidth > limit) break;
        taken += cluster;
        takenWidth += clusterWidth;
      }
      append(taken, start, true);
      start += taken.length;
      word = word.slice(taken.length);
      if (!word) return;
      closeLine(start);
    }
  }

  TOKEN.lastIndex = 0;
  let match;
  while ((match = TOKEN.exec(text))) {
    const token = match[0];
    const start = match.index;
    if (token === '\n') {
      line.end = start + 1;
      closeLine(start + 1, true);
    } else if (token === '\t') {
      const next = (Math.floor(line.advance / tabWidth + 1e-6) + 1) * tabWidth;
      // Uma tabulação nunca ultrapassa a margem: o excedente fica pendente.
      const stop = Math.max(line.advance, Math.min(next, width));
      line.tabs.push({ offset: start, x: line.advance, width: stop - line.advance });
      line.advance = stop;
      line.end = start + 1;
    } else if (token[0] === ' ') {
      append(token, start, false);
    } else {
      placeWord(token, start);
    }
  }
  lines.push(line);
  return lines;
}

/** Reconstrói o texto lógico a partir das linhas (usado em testes de integridade). */
export function textOfLines(text, lines) {
  return lines.map((line) => text.slice(line.start, line.end)).join('');
}
