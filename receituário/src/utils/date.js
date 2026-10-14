const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

const pad = (n) => String(n).padStart(2, '0');

/** Data local do dispositivo no formato AAAA-MM-DD. */
export function todayISO(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function parseISO(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  // Rejeita datas que o Date "corrige" (31/02 etc.).
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return { year, month, day };
}

export const isValidISO = (iso) => parseISO(iso) !== null;

/** "13 de outubro de 2026" */
export function formatDateLong(iso) {
  const parts = parseISO(iso);
  if (!parts) return '';
  return `${parts.day} de ${MONTHS[parts.month - 1]} de ${parts.year}`;
}

/** "13-10-2026", usado no nome do arquivo. */
export function formatDateFile(iso) {
  const parts = parseISO(iso);
  if (!parts) return '';
  return `${pad(parts.day)}-${pad(parts.month)}-${parts.year}`;
}
