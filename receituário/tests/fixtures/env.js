// Ambiente de composição para testes fora do navegador: mede pelo avanço real das
// fontes incorporadas (mesmos arquivos TTF usados na aplicação).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createComposer } from '../../src/pagination/compose.js';
import { createMetricsMeasurer } from '../../src/typography/measure.js';
import { createHyphenator } from '../../src/typography/hyphenation.js';
import { bodyFromText, bodyNodes } from '../../src/editor/schema.js';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const measurer = createMetricsMeasurer();
export const hyphenator = createHyphenator();

export function newComposer(options = {}) {
  return createComposer({ measurer, hyphenator, ...options });
}

export function loadFonts() {
  const read = (file) => new Uint8Array(readFileSync(path.join(root, 'assets/fonts', file)));
  return {
    regular: read('LiberationMono-Regular.ttf'),
    bold: read('LiberationMono-Bold.ttf'),
    fallback: read('DejaVuSansMono.ttf'),
  };
}

export const FIELDS = { patient: 'João da Silva', doctor: 'Dra. Maria Souza', uf: 'SP', crm: '123456', place: 'Clínica Central' };

/** Monta o estado consumido pela composição a partir de texto simples. */
export function docState(text, overrides = {}) {
  return {
    fields: { ...FIELDS, ...(overrides.fields || {}) },
    date: overrides.date || '2026-10-13',
    nodes: overrides.nodes || bodyNodes(bodyFromText(text)),
    signatures: overrides.signatures || {},
  };
}

/** PNG 2×2 válido (preto opaco), para testes de assinatura. */
export const TINY_PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR4nGNkYGD4z8DAwMAAAA0HAQEOL2PyAAAAAElFTkSuQmCC',
    'base64',
  ),
);

export const LOREM =
  'Tomar um comprimido por via oral a cada oito horas, durante sete dias consecutivos, preferencialmente após as refeições principais, com um copo cheio de água.';
