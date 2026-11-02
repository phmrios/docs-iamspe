import { expect } from '@playwright/test';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
export const APP_URL = pathToFileURL(path.resolve(here, '../../dist/receituario.html')).href;
export const SIGNATURE_PNG = path.resolve(here, '../fixtures/assinatura.png');
export const MOD = 'ControlOrMeta';

/** Abre o HTML final direto do disco, sem rede, registrando qualquer requisição externa. */
export async function openApp(page) {
  const external = [];
  const errors = [];
  await page.context().setOffline(true);
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (/^(file|blob|data|about):/.test(url)) return route.continue();
    external.push(url);
    return route.abort();
  });
  page.on('request', (request) => {
    if (!/^(file|blob|data|about):/.test(request.url())) external.push(request.url());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(APP_URL);
  await page.waitForSelector('html[data-ready="true"]');
  return { external, errors };
}

export const body = (page) => page.locator('.rx-body');
export const field = (page, name, pageIndex = 0) => page.locator(`.rx-page-layer[data-page="${pageIndex}"] .rx-field-${name} .rx-field-input`);

export async function fillFields(page, values = {}) {
  const all = { patient: 'João da Silva', doctor: 'Dra. Maria Souza', uf: 'SP', crm: '123456', place: 'Clínica Central', ...values };
  for (const [name, value] of Object.entries(all)) {
    if (!value) continue;
    await field(page, name).click();
    await page.keyboard.insertText(value);
  }
}

/** Cola texto simples (e, opcionalmente, HTML) no elemento com foco, como o sistema faria. */
export async function paste(page, text, html) {
  await page.evaluate(({ text, html }) => {
    // Eventos sintéticos não podem carregar a área de transferência real em todos os
    // navegadores; o evento leva um objeto com a mesma interface de leitura.
    const values = {};
    if (text != null) values['text/plain'] = text;
    if (html) values['text/html'] = html;
    const data = { types: Object.keys(values), getData: (type) => values[type] || '', files: [], items: [] };
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: data });
    document.activeElement.dispatchEvent(event);
  }, { text, html });
}

export const snapshot = (page) => page.evaluate(() => {
  const app = window.__rx;
  const paragraphs = [];
  app.state.body.forEach((node) => paragraphs.push(node.type.name === 'page_break' ? '<pb>' : node.textBetween(0, node.content.size, '', '\n')));
  return {
    fields: app.state.fields,
    date: app.state.date,
    paragraphs,
    pageCount: app.composition.pageCount,
    domPages: document.querySelectorAll('canvas.rx-canvas').length,
    signatures: app.state.signatures,
    zoom: app.zoom,
    canUndo: app.history.canUndo,
    canRedo: app.history.canRedo,
    undoDepth: app.history.undoStack.length,
    selection: app.body.selection,
    warnings: app.currentWarnings().map((w) => w.code),
  };
});

/**
 * Compara, linha a linha, a posição do texto na camada HTML com a posição prevista
 * pela composição (a mesma usada pelo Canvas e pelo PDF). Devolve o maior desvio em px de tela.
 */
export const syncDeviation = (page) => page.evaluate(() => {
  const app = window.__rx;
  const view = app.body.view;
  const comp = app.composition;
  const zoom = app.zoom;
  const host = document.getElementById('rx-body-host').getBoundingClientRect();
  const stride = comp.page.height + 28;
  let maxY = 0;
  let maxX = 0;
  let lines = 0;
  view.state.doc.forEach((node, offset, index) => {
    const layout = comp.body.nodes[index];
    if (node.type.name !== 'paragraph') return;
    layout.lines.forEach((line, k) => {
      const top = host.top + (layout.linePage[k] * stride + layout.lineY[k]) * zoom;
      for (const seg of line.segs) {
        // Glifos da fonte alternativa têm caixa própria; a linha é conferida pelos demais.
        if (seg.font !== 'regular') continue;
        for (const [at, x] of [[seg.start, seg.x], [seg.end - 1, null]]) {
          const range = document.createRange();
          const dom = view.domAtPos(offset + 1 + at, 1);
          if (dom.node.nodeType !== 3) continue;
          range.setStart(dom.node, dom.offset);
          range.setEnd(dom.node, Math.min(dom.offset + 1, dom.node.length));
          const rect = range.getClientRects()[0];
          if (!rect || !rect.width) continue;
          lines += 1;
          maxY = Math.max(maxY, Math.abs((rect.top + rect.bottom) / 2 - (top + (comp.metrics.lineHeight / 2) * zoom)));
          if (x !== null) maxX = Math.max(maxX, Math.abs(rect.left - (host.left + x * zoom)));
        }
      }
    });
  });
  return { maxX, maxY, lines };
});

export async function expectInSync(page, tolerance = 1) {
  const deviation = await syncDeviation(page);
  expect(deviation.lines).toBeGreaterThan(0);
  expect(deviation.maxY, 'desvio vertical HTML × composição').toBeLessThan(tolerance);
  expect(deviation.maxX, 'desvio horizontal HTML × composição').toBeLessThan(tolerance);
  return deviation;
}

export const caretInfo = (page) => page.evaluate(() => {
  const app = window.__rx;
  const view = app.body.view;
  const coords = view.coordsAtPos(view.state.selection.head);
  const ws = document.getElementById('rx-workspace').getBoundingClientRect();
  let pageIndex = -1;
  document.querySelectorAll('canvas.rx-canvas').forEach((canvas, i) => {
    const r = canvas.getBoundingClientRect();
    if (coords.top >= r.top - 1 && coords.bottom <= r.bottom + 1) pageIndex = i;
  });
  return { visible: coords.top >= ws.top && coords.bottom <= ws.bottom, pageIndex, head: view.state.selection.head, hasFocus: view.hasFocus() };
});

export async function typeParagraphs(page, count, text = 'Tomar um comprimido por via oral a cada oito horas, durante sete dias consecutivos, após as refeições.') {
  for (let i = 0; i < count; i++) {
    await page.keyboard.insertText(`${i + 1}) ${text}`);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
  }
}

export async function exportPdf(page, { confirmWarnings = true } = {}) {
  const downloadPromise = page.waitForEvent('download');
  await page.click('[data-action="export"]');
  if (confirmWarnings) {
    const go = page.locator('.rx-dialog button[data-value="go"]');
    await Promise.race([go.waitFor({ timeout: 1500 }).then(() => go.click()).catch(() => {}), downloadPromise.catch(() => {})]);
  }
  const download = await downloadPromise;
  const file = await download.path();
  return { name: download.suggestedFilename(), file };
}

/**
 * Navegação pelo teclado em ritmo humano: o navegador informa a nova posição do
 * cursor de forma assíncrona (evento selectionchange), o que nunca é mais lento
 * que uma pessoa digitando, mas é mais lento que um robô.
 */
export async function pressKeys(page, key, times = 1) {
  // Descreve a seleção do navegador por caminho de nós, para detectar que ela mudou.
  const read = () => {
    const s = getSelection();
    const path = (node) => {
      const parts = [];
      for (let n = node; n && n.parentNode && n !== document.body; n = n.parentNode) parts.push([...n.parentNode.childNodes].indexOf(n));
      return parts.join('.');
    };
    return s.rangeCount ? `${path(s.anchorNode)}:${s.anchorOffset}|${path(s.focusNode)}:${s.focusOffset}` : '';
  };
  // O ProseMirror ignora mudanças de seleção nos 50 ms seguintes a um caractere
  // digitado (proteção contra um defeito do Chrome). Uma pessoa não alcança esse
  // intervalo; o robô, sim.
  await page.waitForTimeout(90);
  for (let i = 0; i < times; i++) {
    await page.evaluate((value) => {
      window.__selBefore = value;
    }, await page.evaluate(read));
    await page.keyboard.press(key);
    // 1) o navegador move o cursor;
    await page.waitForFunction(() => {
      const s = getSelection();
      const path = (node) => {
        const parts = [];
        for (let n = node; n && n.parentNode && n !== document.body; n = n.parentNode) parts.push([...n.parentNode.childNodes].indexOf(n));
        return parts.join('.');
      };
      const now = s.rangeCount ? `${path(s.anchorNode)}:${s.anchorOffset}|${path(s.focusNode)}:${s.focusOffset}` : '';
      return now !== window.__selBefore;
    }, null, { timeout: 1500 }).catch(() => {});
    // 2) o editor registra a nova posição.
    await page.waitForFunction(() => {
      const view = window.__rx.body.view;
      const selection = getSelection();
      if (!view.hasFocus() || !selection.focusNode || !view.dom.contains(selection.focusNode)) return true;
      try {
        const { anchor, head } = view.state.selection;
        return view.posAtDOM(selection.focusNode, selection.focusOffset) === head && view.posAtDOM(selection.anchorNode, selection.anchorOffset) === anchor;
      } catch {
        return true;
      }
    }, null, { timeout: 2000 }).catch(() => {});
  }
}
