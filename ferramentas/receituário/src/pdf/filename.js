import { stripAccents } from '../utils/text.js';
import { formatDateFile } from '../utils/date.js';

/**
 * Receituario_Nome_Sobrenome_DD-MM-AAAA.pdf
 * Sem acentos, espaços viram sublinhados, e nada que um sistema de arquivos rejeite.
 */
export function pdfFileName(patient, isoDate) {
  const name = stripAccents(String(patient || ''))
    .replace(/[^A-Za-z0-9 _-]+/g, ' ')
    .trim()
    .split(/[\s_]+/)
    .filter(Boolean)
    .join('_')
    .slice(0, 80);
  const date = formatDateFile(isoDate);
  return ['Receituario', name, date].filter(Boolean).join('_') + '.pdf';
}
