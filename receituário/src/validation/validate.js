import { bodyText } from '../editor/schema.js';
import { isInsideRegion } from '../signature/geometry.js';
import { FIT_EPSILON } from '../typography/linebreak.js';

/**
 * Validação funcional: campos que normalmente constam de uma receita.
 * Todos os avisos são não bloqueantes. O CRM e a UF não são conferidos.
 * @returns {{code: string, message: string}[]}
 */
export function functionalWarnings(state) {
  const warnings = [];
  const { fields } = state;
  if (!fields.patient.trim()) warnings.push({ code: 'no-patient', message: 'Nome do paciente não preenchido.' });
  if (!bodyText(state.body).trim()) warnings.push({ code: 'no-body', message: 'A prescrição está vazia.' });
  if (!fields.doctor.trim()) warnings.push({ code: 'no-doctor', message: 'Nome do médico não preenchido.' });
  if (!fields.crm.trim() || !fields.uf.trim()) warnings.push({ code: 'no-crm', message: 'CRM e UF não preenchidos por completo.' });
  if (!fields.place.trim()) warnings.push({ code: 'no-place', message: 'Local de atendimento não preenchido.' });
  return warnings;
}

const finite = (...values) => values.every((value) => Number.isFinite(value));

/**
 * Validação técnica do resultado de composição: confere a geometria de todos os
 * elementos contra os limites da página, da área de prescrição e do rodapé.
 * @returns {{code: string, message: string, page?: number}[]}
 */
export function technicalWarnings(composition) {
  const warnings = composition.warnings.slice();
  const { page, metrics, pages, pageCount } = composition;
  const seen = new Set(warnings.map((warning) => warning.code));
  const add = (code, message, pageIndex) => {
    const key = `${code}:${pageIndex}`;
    if (seen.has(key)) return;
    seen.add(key);
    warnings.push({ code, message, page: pageIndex });
  };
  const bodyRight = metrics.bodyLeft + metrics.bodyWidth;

  if (pages.length !== pageCount || pageCount < 1) {
    add('pagination', 'Divergência de paginação: a quantidade de páginas compostas não confere.', 0);
  }

  for (const current of pages) {
    const n = current.index + 1;
    for (const item of current.items) {
      if (item.type === 'text') {
        if (!finite(item.x, item.y, item.width, item.size) || item.size <= 0) {
          add('invalid', `Elemento de texto com dimensões inválidas na página ${n}.`, current.index);
          continue;
        }
        if (item.x < -0.5 || item.x + item.width > page.width + 0.5 || item.top < -0.5 || item.top + item.height > page.height + 0.5) {
          add('out-of-page', `Texto fora dos limites da página ${n}.`, current.index);
        }
        if (item.role === 'body' || item.role === 'hyphen') {
          if (item.top < metrics.bodyTop - 0.5 || item.top + item.height > metrics.bodyBottom + 0.5) {
            add('body-overlap', `A prescrição ultrapassa a área permitida na página ${n}.`, current.index);
          }
          if (item.role === 'body' && item.x + item.width > bodyRight + FIT_EPSILON + 0.5 && item.text.trimEnd().length === item.text.length) {
            add('body-width', `Texto além da margem direita na página ${n}.`, current.index);
          }
        }
      } else if (item.type === 'line') {
        if (!finite(item.x1, item.y1, item.x2, item.y2, item.thickness) || item.thickness <= 0) {
          add('invalid', `Linha com dimensões inválidas na página ${n}.`, current.index);
        }
      } else if (item.type === 'image') {
        if (!finite(item.cx, item.cy, item.width, item.height, item.rotation) || item.width <= 0 || item.height <= 0) {
          add('invalid', `Assinatura com dimensões inválidas na página ${n}.`, current.index);
        } else if (!isInsideRegion(item, composition.signatureRegion)) {
          add('signature-area', `Assinatura fora da área reservada na página ${n}.`, current.index);
        }
      }
    }
  }
  return warnings;
}

/**
 * Compara duas composições do mesmo documento (edição × final): a distribuição das
 * linhas da prescrição precisa ser idêntica.
 */
export function paginationDiverges(a, b) {
  if (a.pageCount !== b.pageCount || a.body.nodes.length !== b.body.nodes.length) return true;
  for (let i = 0; i < a.body.nodes.length; i++) {
    const x = a.body.nodes[i];
    const y = b.body.nodes[i];
    if (x.type !== y.type) return true;
    if (x.type !== 'paragraph') {
      if (x.page !== y.page) return true;
      continue;
    }
    if (x.lines.length !== y.lines.length) return true;
    for (let k = 0; k < x.lines.length; k++) {
      if (x.linePage[k] !== y.linePage[k] || Math.abs(x.lineY[k] - y.lineY[k]) > 0.01) return true;
      if (x.lines[k].start !== y.lines[k].start || x.lines[k].end !== y.lines[k].end) return true;
    }
  }
  return false;
}
