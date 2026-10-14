import { emptyBody, bodyNodes, bodyText } from '../editor/schema.js';
import { todayISO } from '../utils/date.js';

/**
 * Documento lógico central. É imutável: toda alteração produz um novo objeto, o
 * que permite ao histórico guardar versões por referência.
 *
 * @typedef {Object} RxState
 * @property {{patient: string, doctor: string, uf: string, crm: string, place: string}} fields
 * @property {string} date                         data de emissão, AAAA-MM-DD
 * @property {import('prosemirror-model').Node} body  prescrição (documento único, qualquer nº de páginas)
 * @property {Object<number, Signature>} signatures   uma imagem por página
 *
 * @typedef {Object} Signature
 * @property {string} id
 * @property {number} cx
 * @property {number} cy
 * @property {number} width
 * @property {number} height
 * @property {number} rotation     graus, sentido horário
 * @property {boolean} useProcessed  true = imagem com o fundo branco removido
 */

export const FIELD_NAMES = ['patient', 'doctor', 'uf', 'crm', 'place'];

export function createInitialState(now = new Date()) {
  return {
    fields: { patient: '', doctor: '', uf: '', crm: '', place: '' },
    date: todayISO(now),
    body: emptyBody(),
    signatures: {},
  };
}

/** Há algo preenchido que seria perdido ao fechar a página? */
export function hasContent(state) {
  if (FIELD_NAMES.some((name) => state.fields[name].trim() !== '')) return true;
  if (Object.keys(state.signatures).length) return true;
  return state.body.childCount > 1 || state.body.firstChild.content.size > 0;
}

/** Visão do documento consumida pelo motor de composição (sem dependência do editor). */
export function toDocumentState(state) {
  return { fields: state.fields, date: state.date, nodes: bodyNodes(state.body), signatures: state.signatures };
}

/** Descarta assinaturas de páginas que deixaram de existir. Devolve o mesmo objeto se nada mudou. */
export function pruneSignatures(signatures, pageCount) {
  const keys = Object.keys(signatures);
  if (keys.every((key) => Number(key) < pageCount)) return signatures;
  const kept = {};
  for (const key of keys) if (Number(key) < pageCount) kept[key] = signatures[key];
  return kept;
}

/** Estimativa de memória de um instantâneo, para o limite do histórico. */
export function estimateSize(state) {
  let size = state.body.content.size * 2 + 256;
  for (const name of FIELD_NAMES) size += state.fields[name].length * 2;
  return size;
}

export { bodyText };
