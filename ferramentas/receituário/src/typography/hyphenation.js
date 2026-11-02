import pt from 'hyphen/pt/index.js';
import dictionaryText from '../../assets/dictionaries/medico-pt-br.txt';

const MARKER = '\u0001';
const LEFT_MIN = 2;
const RIGHT_MIN = 3;
const MIN_WORD = 6;

const LETTERS_ONLY = /^[\p{L}\p{M}]+$/u;
const HAS_LOWER = /\p{Ll}/u;

/** Converte o texto do dicionário em um conjunto de palavras protegidas. */
export function parseDictionary(text) {
  const words = new Set();
  for (const rawLine of String(text).split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    for (const word of line.split(/\s+/)) words.add(word.toLocaleLowerCase('pt-BR'));
  }
  return words;
}

export const MEDICAL_DICTIONARY = parseDictionary(dictionaryText);

/**
 * Cria o hifenizador de português brasileiro.
 *
 * `points(word)` devolve os índices em que a palavra pode ser dividida no fim de
 * uma linha. A divisão é apenas visual: o texto lógico nunca recebe o hífen.
 *
 * Ficam inteiros: termos do dicionário médico, siglas em maiúsculas, palavras
 * curtas e qualquer sequência que não seja formada só por letras (doses, unidades).
 */
export function createHyphenator(dictionary = MEDICAL_DICTIONARY) {
  const cache = new Map();

  function points(word) {
    let result = cache.get(word);
    if (result) return result;
    result = compute(word);
    if (cache.size > 20000) cache.clear();
    cache.set(word, result);
    return result;
  }

  function compute(word) {
    if (word.length < MIN_WORD || !LETTERS_ONLY.test(word) || !HAS_LOWER.test(word)) return [];
    if (dictionary.has(word.toLocaleLowerCase('pt-BR'))) return [];
    const marked = pt.hyphenateSync(word, { hyphenChar: MARKER, minWordLength: MIN_WORD });
    const found = [];
    let index = 0;
    for (const ch of marked) {
      if (ch === MARKER) {
        if (index >= LEFT_MIN && word.length - index >= RIGHT_MIN) found.push(index);
      } else {
        index += ch.length;
      }
    }
    return found;
  }

  return { points, isProtected: (word) => dictionary.has(word.toLocaleLowerCase('pt-BR')) };
}

const WORD_PART = /[\p{L}\p{M}]+/gu;
const LETTER = /[\p{L}\p{M}]/u;
const DIGIT = /\d/;

/**
 * Oportunidades de quebra dentro de uma sequência sem espaços.
 * - após um hífen digitado entre letras ("anti-|inflamatório"): sem hífen adicional;
 * - nos pontos silábicos de cada parte alfabética: com hífen visual.
 * Sequências com algarismos (doses, "500mg", "8/8h") nunca são divididas aqui.
 * @returns {{at: number, hyphen: boolean}[]} em ordem crescente de posição
 */
export function breakOpportunities(token, hyphenator) {
  if (!hyphenator || token.length < 4 || DIGIT.test(token)) return [];
  const found = [];
  for (let i = 1; i < token.length - 1; i++) {
    if (token[i] === '-' && LETTER.test(token[i - 1]) && LETTER.test(token[i + 1])) {
      found.push({ at: i + 1, hyphen: false });
    }
  }
  WORD_PART.lastIndex = 0;
  let match;
  while ((match = WORD_PART.exec(token))) {
    for (const point of hyphenator.points(match[0])) found.push({ at: match.index + point, hyphen: true });
  }
  return found.sort((a, b) => a.at - b.at);
}
