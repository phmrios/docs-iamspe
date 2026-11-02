import {
  PAGE, CONTENT_WIDTH, TITLE, TEXT, PATIENT, RULE, FOOTER, FOOTER_TOP, FOOTER_BOTTOM, BODY_BOTTOM,
  SIGNATURE_REGION, SIGNATURE_LINE, PLACEHOLDERS,
} from './geometry.js';
import { paginate } from './paginate.js';
import { computeBlocks } from '../document/blocks.js';
import { breakParagraph } from '../typography/linebreak.js';
import { baselineOffset, missingCharacters } from '../typography/fonts.js';
import { formatDateLong } from '../utils/date.js';
import { fitSignature } from '../signature/geometry.js';

/**
 * @typedef {Object} DocumentState  Documento lógico (independente da interface).
 * @property {{patient: string, doctor: string, uf: string, crm: string, place: string}} fields
 * @property {string} date  AAAA-MM-DD
 * @property {import('../document/blocks.js').BodyNode[]} nodes
 * @property {Object<number, Object>} signatures  por índice de página
 *
 * @typedef {Object} Item  Elemento posicionado em uma página.
 * @property {'text'|'line'|'image'} type
 * @property {string} role  title | label | field | body | hyphen | date | pageno | rule | sigline | signature
 * @property {boolean} [editable]  texto que, no editor, é exibido pela camada HTML
 *
 * @typedef {Object} Composition  Resultado intermediário comum a Canvas e PDF.
 */

const X0 = PAGE.marginLeft;
const CENTER = PAGE.width / 2;

/**
 * Cria o motor de composição. O medidor é injetado: Canvas no navegador,
 * tabelas das fontes nos testes.
 */
export function createComposer({ measurer, hyphenator = null }) {
  const size = TEXT.size;
  const measure = (text, font = TEXT.font) => measurer.measure(text, font, size);
  const bodyBaseline = baselineOffset(TEXT.font, TEXT.size, TEXT.lineHeight);
  const footBaseline = baselineOffset(TEXT.font, TEXT.size, FOOTER.lineHeight);
  const titleBaseline = baselineOffset(TITLE.font, TITLE.size, TITLE.lineHeight);

  // A quebra de linhas é a parte cara; o resultado é guardado por identidade do
  // parágrafo, de modo que uma edição só recompõe o parágrafo alterado.
  const bodyLineCache = new WeakMap();
  const fieldLineCache = new Map();
  let lastPagination = null;

  function bodyLines(node) {
    let lines = bodyLineCache.get(node);
    if (!lines) {
      lines = breakParagraph(node.text, {
        width: CONTENT_WIDTH, measurer, size, font: TEXT.font, tabChars: TEXT.tabChars, hyphenator,
      });
      bodyLineCache.set(node, lines);
    }
    return lines;
  }

  function fieldLines(text, indent, width = CONTENT_WIDTH) {
    const key = `${indent}|${width}|${text}`;
    let lines = fieldLineCache.get(key);
    if (!lines) {
      lines = breakParagraph(text, { width, measurer, size, font: TEXT.font, indent, hyphenator: null });
      if (fieldLineCache.size > 500) fieldLineCache.clear();
      fieldLineCache.set(key, lines);
    }
    return lines;
  }

  /** Linha única, sem quebra: usada no CRM, que nunca é dividido. */
  const unbroken = (text) => fieldLines(text, 0, Number.MAX_SAFE_INTEGER);

  function textItems(target, lines, lineLeft, lineTop, lineHeight, baseline, role, extra) {
    lines.forEach((line, i) => {
      const left = lineLeft(line, i);
      const y = lineTop(i) + baseline;
      for (const seg of line.segs) {
        if (!seg.text.trim()) continue;
        target.push({
          type: 'text', role, text: seg.text, font: seg.font, size, x: left + seg.x, y, width: seg.width,
          top: lineTop(i), height: lineHeight, ...extra,
        });
      }
      if (line.hyphen) {
        target.push({
          type: 'text', role: 'hyphen', text: '-', font: TEXT.font, size, x: left + line.width, y,
          width: measure('-'), top: lineTop(i), height: lineHeight, ...extra,
        });
      }
    });
  }

  /**
   * @param {DocumentState} state
   * @param {{editing?: boolean}} [options]  `editing` só altera a geometria de campos
   *   vazios (espaço dos textos indicativos); a paginação é sempre a mesma.
   * @returns {Composition}
   */
  function compose(state, options = {}) {
    const editing = Boolean(options.editing);
    const { fields } = state;
    const warnings = [];
    const shared = []; // itens repetidos em todas as páginas
    const fieldBoxes = {};

    // ---- Cabeçalho
    const titleTop = PAGE.marginTop;
    const titleWidth = measurer.measure(TITLE.text, TITLE.font, TITLE.size);
    shared.push({
      type: 'text', role: 'title', text: TITLE.text, font: TITLE.font, size: TITLE.size,
      x: CENTER - titleWidth / 2, y: titleTop + titleBaseline, width: titleWidth, top: titleTop, height: TITLE.lineHeight,
    });

    const patientTop = titleTop + TITLE.lineHeight + TITLE.gapAfter;
    const patientLabelWidth = measure(PATIENT.label);
    const patientLines = fieldLines(fields.patient, patientLabelWidth);
    shared.push({
      type: 'text', role: 'label', text: PATIENT.label.trimEnd(), font: TEXT.font, size,
      x: X0, y: patientTop + bodyBaseline, width: measure(PATIENT.label.trimEnd()), top: patientTop, height: TEXT.lineHeight,
    });
    textItems(shared, patientLines, () => X0, (i) => patientTop + i * TEXT.lineHeight, TEXT.lineHeight, bodyBaseline, 'field', { editable: true, field: 'patient' });
    const patientHeight = patientLines.length * TEXT.lineHeight;
    fieldBoxes.patient = {
      x: X0, y: patientTop, width: CONTENT_WIDTH, height: patientHeight, indent: patientLabelWidth,
      align: 'left', lineHeight: TEXT.lineHeight, lines: patientLines,
      highlight: patientLines.map((line, i) => ({
        x: X0 + (i === 0 ? patientLabelWidth : 0), y: patientTop + i * TEXT.lineHeight,
        width: CONTENT_WIDTH - (i === 0 ? patientLabelWidth : 0), height: TEXT.lineHeight,
      })),
    };

    const ruleY = patientTop + patientHeight + PATIENT.gapAfter;
    shared.push({ type: 'line', role: 'rule', x1: X0, y1: ruleY, x2: X0 + CONTENT_WIDTH, y2: ruleY, thickness: RULE.thickness, color: RULE.color });

    const bodyTop = ruleY + RULE.gapAfter;
    const bodyHeight = BODY_BOTTOM - bodyTop;
    if (bodyHeight < TEXT.lineHeight * 3) {
      warnings.push({ code: 'body-area', message: 'A identificação do paciente ocupa quase toda a área da prescrição.' });
    }

    // ---- Rodapé
    shared.push({
      type: 'line', role: 'sigline', x1: SIGNATURE_LINE.x1, y1: SIGNATURE_LINE.y, x2: SIGNATURE_LINE.x2, y2: SIGNATURE_LINE.y,
      thickness: FOOTER.signatureLineThickness, color: '#000000',
    });

    let cursor = SIGNATURE_LINE.y + FOOTER.gapLineToName;
    const footLH = FOOTER.lineHeight;
    const centered = (line) => CENTER - line.width / 2;
    const pad = 3;
    const idExtents = []; // extensão horizontal de cada linha do bloco profissional

    // Nome do médico
    {
      const lines = fieldLines(fields.doctor, 0);
      const top = cursor;
      textItems(shared, lines, centered, (i) => top + i * footLH, footLH, footBaseline, 'field', { editable: true, field: 'doctor' });
      const placeholderWidth = measure(PLACEHOLDERS.doctor);
      fieldBoxes.doctor = {
        x: X0, y: top, width: CONTENT_WIDTH, height: lines.length * footLH, indent: 0, align: 'center', lineHeight: footLH, lines,
        highlight: lines.map((line, i) => {
          const width = Math.max(line.width, fields.doctor ? 0 : placeholderWidth) + pad * 2;
          return { x: CENTER - width / 2, y: top + i * footLH, width, height: footLH };
        }),
      };
      lines.forEach((line, i) => idExtents.push({ top: top + i * footLH, left: centered(line), right: centered(line) + line.width }));
      cursor = top + lines.length * footLH;
    }

    // CRM e UF: "CRM-SP 123456"
    {
      const top = cursor;
      const y = top + footBaseline;
      const uf = fields.uf;
      const crm = fields.crm;
      if (editing) {
        const prefix = `${FOOTER.crmLabel}-`;
        const prefixWidth = measure(prefix);
        const ufWidth = measure(uf || PLACEHOLDERS.uf);
        const gapWidth = measure(' ');
        const crmWidth = measure(crm || PLACEHOLDERS.crm);
        const total = prefixWidth + ufWidth + gapWidth + crmWidth;
        const left = CENTER - total / 2;
        shared.push({ type: 'text', role: 'label', text: prefix, font: TEXT.font, size, x: left, y, width: prefixWidth, top, height: footLH, editOnly: true });
        const single = (text, x, width) => ({
          x, y: top, width, height: footLH, indent: 0, align: 'left', lineHeight: footLH,
          lines: unbroken(text), highlight: [{ x: x - 1, y: top, width: width + 2, height: footLH }],
        });
        fieldBoxes.uf = single(uf, left + prefixWidth, ufWidth);
        fieldBoxes.crm = single(crm, left + prefixWidth + ufWidth + gapWidth, crmWidth);
        idExtents.push({ top, left, right: left + total });
        if (total > CONTENT_WIDTH + 0.5) warnings.push({ code: 'footer-width', message: 'CRM e UF ultrapassam a largura útil do rodapé.' });
      } else if (uf || crm) {
        const text = uf && crm ? `${FOOTER.crmLabel}-${uf} ${crm}` : crm ? `${FOOTER.crmLabel} ${crm}` : `${FOOTER.crmLabel}-${uf}`;
        const lines = unbroken(text);
        const left = CENTER - lines[0].width / 2;
        textItems(shared, lines, () => left, () => top, footLH, footBaseline, 'field', { field: 'crm' });
        idExtents.push({ top, left, right: left + lines[0].width });
        if (lines[0].width > CONTENT_WIDTH + 0.5) warnings.push({ code: 'footer-width', message: 'CRM e UF ultrapassam a largura útil do rodapé.' });
      }
      cursor = top + footLH;
    }

    // Local de atendimento
    {
      const top = cursor;
      const labelWidth = measure(FOOTER.placeLabel);
      const lines = fieldLines(fields.place, labelWidth);
      const placeholderWidth = editing && !fields.place ? measure(PLACEHOLDERS.place) : 0;
      // A primeira linha é centralizada junto com o rótulo que a antecede.
      const labelText = FOOTER.placeLabel.trimEnd();
      const lineWidth = (line, i) => {
        if (i > 0) return line.width;
        if (placeholderWidth) return labelWidth + placeholderWidth;
        return line.end > line.start ? line.width : measure(labelText);
      };
      const lineLeft = (line, i) => CENTER - lineWidth(line, i) / 2;
      shared.push({
        type: 'text', role: 'label', text: labelText, font: TEXT.font, size,
        x: lineLeft(lines[0], 0), y: top + footBaseline, width: measure(labelText), top, height: footLH,
      });
      textItems(shared, lines, lineLeft, (i) => top + i * footLH, footLH, footBaseline, 'field', { editable: true, field: 'place' });
      fieldBoxes.place = {
        x: X0, y: top, width: CONTENT_WIDTH, height: lines.length * footLH, indent: labelWidth, align: 'center', lineHeight: footLH, lines,
        highlight: lines.map((line, i) => {
          const left = lineLeft(line, i) + (i === 0 ? labelWidth : 0);
          const width = lineWidth(line, i) - (i === 0 ? labelWidth : 0);
          return { x: left - (i === 0 ? 1 : pad), y: top + i * footLH, width: width + (i === 0 ? 1 + pad : pad * 2), height: footLH };
        }),
      };
      lines.forEach((line, i) => idExtents.push({ top: top + i * footLH, left: lineLeft(line, i), right: lineLeft(line, i) + lineWidth(line, i) }));
      cursor = top + lines.length * footLH;
    }

    // Data (canto inferior direito) e numeração (canto inferior esquerdo)
    const lastLineTop = FOOTER_BOTTOM - footLH;
    const dateText = formatDateLong(state.date);
    const dateWidth = measure(dateText);
    const dateLeft = X0 + CONTENT_WIDTH - dateWidth;
    if (dateText) {
      shared.push({ type: 'text', role: 'date', text: dateText, font: TEXT.font, size, x: dateLeft, y: lastLineTop + footBaseline, width: dateWidth, top: lastLineTop, height: footLH });
    }
    fieldBoxes.date = { x: dateLeft - pad, y: lastLineTop, width: dateWidth + pad * 2, height: footLH };

    // ---- Prescrição
    const nodes = state.nodes;
    const blocks = computeBlocks(nodes);
    const lineSets = new Array(nodes.length);
    const pageNodes = nodes.map((node, i) => {
      if (node.type !== 'paragraph') return { type: 'page_break' };
      lineSets[i] = bodyLines(node);
      return { type: 'paragraph', lines: lineSets[i].length, sep: blocks[i].kind === 'sep', first: blocks[i].first };
    });
    const pagination = paginate(pageNodes, { bodyHeight, lineHeight: TEXT.lineHeight, paraGap: TEXT.paraGap }, lastPagination);
    lastPagination = pagination;
    const pageCount = pagination.pageCount;

    const pages = [];
    for (let p = 0; p < pageCount; p++) pages.push({ index: p, items: shared.slice(), lineCount: 0 });

    const missing = new Set();
    const bodyNodes = nodes.map((node, i) => {
      const placement = pagination.placements[i];
      if (node.type !== 'paragraph') return { type: 'page_break', page: placement.page, y: placement.y };
      const lines = lineSets[i];
      for (let k = 0; k < lines.length; k++) {
        const line = lines[k];
        const page = pages[placement.linePage[k]];
        const top = bodyTop + placement.lineY[k];
        page.lineCount += 1;
        for (const seg of line.segs) {
          if (seg.font === 'missing') for (const ch of missingCharacters(seg.text)) missing.add(ch);
          if (!seg.text.trim()) continue;
          page.items.push({
            type: 'text', role: 'body', text: seg.text, font: seg.font, size, x: X0 + seg.x, y: top + bodyBaseline,
            width: seg.width, top, height: TEXT.lineHeight, editable: true,
          });
        }
        if (line.hyphen) {
          page.items.push({
            type: 'text', role: 'hyphen', text: '-', font: TEXT.font, size, x: X0 + line.width, y: top + bodyBaseline,
            width: measure('-'), top, height: TEXT.lineHeight, editable: true,
          });
        }
      }
      return { type: 'paragraph', text: node.text, lines, linePage: placement.linePage, lineY: placement.lineY, block: blocks[i] };
    });

    for (const value of Object.values(fields)) for (const ch of missingCharacters(value)) missing.add(ch);
    if (missing.size) {
      warnings.push({
        code: 'missing-glyph',
        message: `Caracteres sem representação nas fontes incorporadas: ${[...missing].slice(0, 12).join(' ')}. No PDF eles aparecerão como um quadro vazio.`,
        characters: [...missing],
      });
    }

    // ---- Numeração e assinaturas (por página)
    for (const page of pages) {
      if (pageCount > 1) {
        const text = `Página ${page.index + 1} de ${pageCount}`;
        page.items.push({ type: 'text', role: 'pageno', text, font: TEXT.font, size, x: X0, y: lastLineTop + footBaseline, width: measure(text), top: lastLineTop, height: footLH });
      }
      const signature = state.signatures ? state.signatures[page.index] : null;
      if (signature) {
        const fitted = fitSignature(signature, SIGNATURE_REGION);
        page.items.push({ type: 'image', role: 'signature', id: signature.id, variant: signature.useProcessed ? 'processed' : 'original', ...fitted });
      }
    }

    // ---- Verificações do rodapé
    const pageNoWidth = pageCount > 1 ? measure(`Página ${pageCount} de ${pageCount}`) : 0;
    let footerOverflow = cursor > FOOTER_BOTTOM + 0.5;
    for (const extent of idExtents) {
      if (extent.top + footLH <= lastLineTop + 0.5) continue;
      if (extent.right > dateLeft - 2 || extent.left < X0 + pageNoWidth + 2) footerOverflow = true;
    }
    if (footerOverflow) {
      warnings.push({ code: 'footer-overflow', message: 'A identificação profissional não cabe na região disponível do rodapé. Reduza o nome ou o local de atendimento.' });
    }

    return {
      editing,
      page: { width: PAGE.width, height: PAGE.height },
      metrics: {
        bodyLeft: X0, bodyTop, bodyWidth: CONTENT_WIDTH, bodyHeight, bodyBottom: BODY_BOTTOM,
        footerTop: FOOTER_TOP, footerBottom: FOOTER_BOTTOM, lineHeight: TEXT.lineHeight, paraGap: TEXT.paraGap,
      },
      pageCount,
      pages,
      body: { nodes: bodyNodes },
      fields: fieldBoxes,
      signatureRegion: SIGNATURE_REGION,
      pagination,
      warnings,
    };
  }

  return { compose, measure };
}
