import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openApp, body, field, fillFields, paste, snapshot, typeParagraphs, exportPdf, expectInSync, MOD, SIGNATURE_PNG } from './helpers.js';
import { extractPdf, inspectPdf } from '../fixtures/pdf.js';

const textOf = (page) => page.items.map((i) => i.text).join(' ');

test.describe('zoom', () => {
  test('botões, atalhos, porcentagem, ajuste à largura e restauração; a paginação não muda', async ({ page }) => {
    await openApp(page);
    await typeParagraphs(page, 12);
    const before = await snapshot(page);
    const sizeAt = () => page.locator('canvas.rx-canvas').first().evaluate((c) => ({ css: c.getBoundingClientRect().width, px: c.width }));
    await page.click('[data-action="zoom-reset"]');
    const base = await sizeAt();
    expect(base.css).toBeCloseTo(793.7, 0); // 210 mm a 96 ppp
    await page.click('[data-action="zoom-in"]');
    await expect.poll(async () => (await snapshot(page)).zoom).toBeCloseTo(1.1, 5);
    await page.keyboard.press(`${MOD}+Equal`);
    await expect.poll(async () => (await snapshot(page)).zoom).toBeCloseTo(1.2, 5);
    const bigger = await sizeAt();
    expect(bigger.css).toBeCloseTo(base.css * 1.2, 0);
    expect(bigger.px).toBeGreaterThan(base.px); // mais zoom, mais resolução
    await expect(page.locator('#rx-zoom')).toHaveValue('120%');
    await expectInSync(page);
    await page.keyboard.press(`${MOD}+Minus`);
    await page.keyboard.press(`${MOD}+Digit0`);
    await expect.poll(async () => (await snapshot(page)).zoom).toBe(1);
    await page.fill('#rx-zoom', '75');
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await snapshot(page)).zoom).toBe(0.75);
    await expectInSync(page);
    await page.click('[data-action="zoom-fit"]');
    await expect.poll(async () => (await snapshot(page)).zoom).toBeGreaterThan(1.5);
    const fit = await page.evaluate(() => ({ canvas: document.querySelector('canvas.rx-canvas').getBoundingClientRect().width, view: document.getElementById('rx-workspace').clientWidth }));
    expect(fit.canvas).toBeLessThanOrEqual(fit.view);
    expect(fit.canvas).toBeGreaterThan(fit.view - 90);
    const after = await snapshot(page);
    expect(after.pageCount).toBe(before.pageCount);
    expect(after.paragraphs).toEqual(before.paragraphs);
    await expectInSync(page, 1.5);
  });

  test('a escala inicial depende da janela', async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 800 });
    await openApp(page);
    const small = (await snapshot(page)).zoom;
    expect(small).toBeLessThan(1);
    expect(small).toBeGreaterThanOrEqual(0.5);
  });
});

test.describe('prévia', () => {
  test('CA-09: sem elementos de edição, zoom independente, fecha por botão, Esc e clique fora', async ({ page }) => {
    await openApp(page);
    await fillFields(page, { doctor: '', uf: '', crm: '', place: '' });
    await body(page).click();
    await typeParagraphs(page, 12);
    const before = await snapshot(page);
    await page.click('[data-action="preview"]');
    const modal = page.locator('.rx-preview');
    await expect(modal).toBeVisible();
    await expect(modal.locator('canvas')).toHaveCount(before.pageCount);
    await expect(modal.locator('.rx-placeholder, .rx-hl, .rx-field, .rx-sig-add, .rx-page-break, [contenteditable]')).toHaveCount(0);
    const box = await modal.boundingBox();
    expect(box.width).toBeCloseTo(1360 * 0.9, -1);
    expect(box.height).toBeCloseTo(900 * 0.9, -1);
    // A prévia usa a composição final: campos vazios não aparecem, nem textos indicativos.
    const drawn = await page.evaluate(() => {
      const comp = window.__rx.preview.composition;
      return { editing: comp.editing, texts: comp.pages[0].items.filter((i) => i.type === 'text').map((i) => i.text) };
    });
    expect(drawn.editing).toBe(false);
    expect(drawn.texts).toContain('PACIENTE:');
    expect(drawn.texts.join('|')).not.toMatch(/Nome do médico|CRM|Local de atendimento$|Digite/);
    // O canvas da prévia tem conteúdo (não está em branco).
    const ink = await modal.locator('canvas').first().evaluate((c) => {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let dark = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] < 100) dark++;
      return dark;
    });
    expect(ink).toBeGreaterThan(2000);

    const editorZoom = before.zoom;
    await modal.getByRole('button', { name: 'Ampliar zoom da prévia' }).click();
    await page.keyboard.press(`${MOD}+Equal`);
    const zooms = await page.evaluate(() => ({ editor: window.__rx.zoom, preview: window.__rx.preview.zoom }));
    expect(zooms.editor).toBe(editorZoom);
    expect(zooms.preview).toBeGreaterThan(1);

    await modal.getByRole('button', { name: 'Fechar' }).click();
    await expect(modal).toBeHidden();
    await page.click('[data-action="preview"]');
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();
    await page.click('[data-action="preview"]');
    await page.mouse.click(8, 450);
    await expect(modal).toBeHidden();
    const after = await snapshot(page);
    expect(after.paragraphs).toEqual(before.paragraphs);
    expect(after.fields).toEqual(before.fields);
    expect(after.zoom).toBe(editorZoom);
  });
});

test.describe('exportação de PDF', () => {
  test('CA-10/CA-11: PDF A4 multipágina, texto real, fontes incorporadas, nome padronizado', async ({ page }) => {
    const { external, errors } = await openApp(page);
    await fillFields(page);
    await body(page).click();
    await paste(page, 'Amoxicilina 500 mg\nDose: 500 µg ± 10% a 37 °C ✓\n\tTomar após as refeições');
    await page.keyboard.press(`${MOD}+Enter`);
    await typeParagraphs(page, 10);
    const state = await snapshot(page);
    const { name, file } = await exportPdf(page);
    expect(name).toMatch(/^Receituario_Joao_da_Silva_\d{2}-\d{2}-\d{4}\.pdf$/);
    const bytes = readFileSync(file);
    const info = await inspectPdf(bytes);
    expect(info.pageCount).toBe(state.pageCount);
    for (const size of info.sizes) {
      expect(size.width).toBeCloseTo(595.28, 1);
      expect(size.height).toBeCloseTo(841.89, 1);
    }
    expect(info.formFields).toBe(0);
    expect(info.images).toBe(0);
    expect(info.title).toBeUndefined();
    expect(info.author).toBeUndefined();
    const fontNames = [...info.fonts.keys()].join(' ');
    expect(fontNames).toMatch(/LiberationMono-Bold/);
    expect(fontNames).toMatch(/DejaVuSansMono/);
    for (const font of info.fonts.values()) expect(font.embedded && font.toUnicode).toBe(true);

    const extracted = await extractPdf(bytes);
    const first = textOf(extracted.pages[0]);
    for (const expected of ['RECEITUÁRIO MÉDICO', 'PACIENTE:', 'João da Silva', 'Amoxicilina 500 mg', 'Dose: 500 µg ± 10% a 37 °C', '✓', 'Tomar após as refeições', 'Dra. Maria Souza', 'CRM-SP 123456', 'LOCAL DE ATENDIMENTO:', 'Clínica Central', `Página 1 de ${state.pageCount}`]) {
      expect(first).toContain(expected);
    }
    expect(first).not.toContain('1) Tomar'); // a quebra manual levou o restante para a página 2
    expect(textOf(extracted.pages[1])).toContain('1) Tomar um comprimido');
    const all = extracted.pages.map(textOf).join(' ');
    expect(all).not.toMatch(/Quebra de página|Inserir assinatura|Digite a prescrição/);
    for (let i = 1; i <= 10; i++) expect(all).toContain(`${i}) Tomar`);
    // Exportar não limpa o documento.
    expect((await snapshot(page)).paragraphs).toEqual(state.paragraphs);
    await expect(page.locator('.rx-toast')).toContainText(name);
    expect(external).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('posição no PDF coincide com a do editor', async ({ page }) => {
    await openApp(page);
    await fillFields(page);
    await body(page).click();
    await typeParagraphs(page, 9);
    // Posição (em pontos) da primeira linha de cada página, medida na camada HTML.
    const dom = await page.evaluate(() => {
      const app = window.__rx;
      const view = app.body.view;
      const out = [];
      const seen = new Set();
      view.state.doc.forEach((node, offset, index) => {
        const layout = app.composition.body.nodes[index];
        if (!node.content.size) return;
        const pageIndex = layout.linePage[0];
        if (seen.has(pageIndex)) return;
        seen.add(pageIndex);
        const dom = view.domAtPos(offset + 1, 1);
        const range = document.createRange();
        range.setStart(dom.node, dom.offset);
        range.setEnd(dom.node, dom.offset + 1);
        const rect = range.getClientRects()[0];
        const canvas = document.querySelectorAll('canvas.rx-canvas')[pageIndex].getBoundingClientRect();
        const toPt = (px) => (px / app.zoom) * 0.75;
        out.push({ pageIndex, text: node.textContent.slice(0, 20), x: toPt(rect.left - canvas.left), yCenter: toPt((rect.top + rect.bottom) / 2 - canvas.top) });
      });
      return out;
    });
    expect(dom.length).toBeGreaterThan(1);
    const { file } = await exportPdf(page);
    const extracted = await extractPdf(readFileSync(file));
    for (const line of dom) {
      const item = extracted.pages[line.pageIndex].items.find((i) => i.text.startsWith(line.text));
      expect(item, line.text).toBeTruthy();
      expect(item.x).toBeCloseTo(line.x, 0);
      // Centro da caixa da fonte = linha de base − (ascendente − descendente)/2
      const center = 841.89 - item.y - ((1705 - 615) / 2048 / 2) * 11;
      expect(Math.abs(center - line.yCenter)).toBeLessThan(0.8);
    }
  });

  test('validação anterior à exportação: avisos não bloqueantes', async ({ page }) => {
    await openApp(page);
    await page.click('[data-action="export"]');
    const dialog = page.locator('.rx-dialog');
    await expect(dialog).toContainText('Há 5 avisos');
    for (const message of ['Nome do paciente', 'prescrição está vazia', 'Nome do médico', 'CRM e UF', 'Local de atendimento']) await expect(dialog).toContainText(message);
    await dialog.getByRole('button', { name: 'Voltar à edição' }).click();
    await expect(dialog).toBeHidden();
    await expect(body(page)).toBeFocused();
    // Continuar mesmo assim: a exportação permanece permitida.
    const { name, file } = await exportPdf(page);
    expect(name).toMatch(/^Receituario_\d{2}-\d{2}-\d{4}\.pdf$/);
    expect((await inspectPdf(readFileSync(file))).pageCount).toBe(1);
  });

  test('atalho de exportação e data alterada manualmente no nome do arquivo', async ({ page }) => {
    await openApp(page);
    await fillFields(page);
    await body(page).click();
    await page.keyboard.type('Repouso.');
    await page.locator('.rx-date').first().click();
    await page.locator('.rx-date-input').fill('2027-01-05');
    await page.locator('.rx-dialog').getByRole('button', { name: 'Concluir' }).click();
    expect((await snapshot(page)).date).toBe('2027-01-05');
    const downloadPromise = page.waitForEvent('download');
    await body(page).click();
    await page.keyboard.press(`${MOD}+Shift+KeyE`);
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('Receituario_Joao_da_Silva_05-01-2027.pdf');
    const text = textOf((await extractPdf(readFileSync(await download.path()))).pages[0]);
    expect(text).toContain('5 de janeiro de 2027');
    // A alteração da data integra o histórico.
    await page.keyboard.press(`${MOD}+z`);
    expect((await snapshot(page)).date).not.toBe('2027-01-05');
  });

  test('falha técnica: nova tentativa e, se persistir, mensagem de erro sem arquivo', async ({ page }) => {
    await openApp(page);
    await fillFields(page);
    await body(page).click();
    await page.keyboard.type('Repouso.');
    const before = await snapshot(page);
    // Fontes inutilizadas: a geração falha em todas as tentativas.
    await page.evaluate(() => {
      window.__rx.savedFonts = window.__rx.fonts;
      window.__rx.fonts = { regular: new Uint8Array(10), bold: new Uint8Array(10), fallback: new Uint8Array(10) };
    });
    let downloads = 0;
    page.on('download', () => downloads++);
    await page.click('[data-action="export"]');
    await expect(page.locator('.rx-dialog')).toContainText('Não foi possível gerar o PDF');
    await page.locator('.rx-dialog').getByRole('button', { name: 'Voltar à edição' }).click();
    expect(downloads).toBe(0);
    expect((await snapshot(page)).paragraphs).toEqual(before.paragraphs);
    await page.evaluate(() => {
      window.__rx.fonts = window.__rx.savedFonts;
    });
    const { file } = await exportPdf(page);
    expect((await inspectPdf(readFileSync(file))).pageCount).toBe(1);
  });
});

test.describe('impressão', () => {
  test('CA-12: imprime o próprio PDF vetorial e mantém o documento', async ({ page }) => {
    await openApp(page);
    await fillFields(page);
    await body(page).click();
    await page.keyboard.type('Repouso.');
    const before = await snapshot(page);
    // Captura o PDF entregue à impressão, sem abrir o diálogo do sistema.
    await page.evaluate(() => {
      window.__printed = [];
      const original = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (blob) => {
        if (blob.type === 'application/pdf') blob.arrayBuffer().then((b) => window.__printed.push(Array.from(new Uint8Array(b).slice(0, 5))));
        return original(blob);
      };
      window.open = () => ({ closed: false });
    });
    await page.keyboard.press(`${MOD}+KeyP`);
    await expect.poll(() => page.evaluate(() => window.__printed.length)).toBe(1);
    expect(await page.evaluate(() => String.fromCharCode(...window.__printed[0]))).toBe('%PDF-');
    const frame = page.locator('iframe.rx-print-frame');
    await expect(frame).toHaveCount(1);
    expect(await frame.getAttribute('src')).toMatch(/^blob:/);
    const media = await page.evaluate(() => {
      const rules = [];
      for (const sheet of document.styleSheets) for (const rule of sheet.cssRules) if (rule.media && rule.media.mediaText === 'print') rules.push(rule.cssText);
      return rules.join(' ');
    });
    expect(media).toContain('.rx-topbar');
    expect((await snapshot(page)).paragraphs).toEqual(before.paragraphs);
  });
});

test.describe('nova receita e saída', () => {
  test('CA-14: exige confirmação e limpa tudo, inclusive histórico, páginas e assinaturas', async ({ page }) => {
    await openApp(page);
    await fillFields(page);
    await body(page).click();
    await typeParagraphs(page, 10);
    await page.keyboard.press(`${MOD}+Enter`);
    const chooser = page.waitForEvent('filechooser');
    await page.locator('.rx-sig-add').first().click();
    await (await chooser).setFiles(SIGNATURE_PNG);
    await expect.poll(async () => Object.keys((await snapshot(page)).signatures).length).toBe(1);
    await page.evaluate(() => window.__rx.commit({ date: '2020-01-01' }));
    const filled = await snapshot(page);
    expect(filled.pageCount).toBeGreaterThan(1);

    await page.click('[data-action="new"]');
    const dialog = page.locator('.rx-dialog');
    await expect(dialog).toContainText('Começar uma nova receita?');
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    expect((await snapshot(page)).paragraphs).toEqual(filled.paragraphs);

    await page.click('[data-action="new"]');
    await page.keyboard.press('Escape');
    expect((await snapshot(page)).fields.patient).toBe('João da Silva');

    await page.click('[data-action="new"]');
    await dialog.getByRole('button', { name: 'Nova receita' }).click();
    const state = await snapshot(page);
    expect(state.fields).toEqual({ patient: '', doctor: '', uf: '', crm: '', place: '' });
    expect(state.paragraphs).toEqual(['']);
    expect(state.pageCount).toBe(1);
    expect(state.domPages).toBe(1);
    expect(state.signatures).toEqual({});
    expect(state.canUndo).toBe(false);
    expect(state.canRedo).toBe(false);
    const today = await page.evaluate(() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    expect(state.date).toBe(today);
    await expect(body(page)).toBeFocused();
    await expect(page.locator('.rx-placeholder')).toHaveCount(6);
  });

  test('documento vazio: nova receita não pede confirmação', async ({ page }) => {
    await openApp(page);
    await page.click('[data-action="new"]');
    await expect(page.locator('.rx-dialog')).toHaveCount(0);
  });

  test('aviso contra fechamento acidental só quando há conteúdo', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'o diálogo beforeunload só é observável de forma confiável no Chromium');
    await openApp(page);
    expect(await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    })).toBe(false);
    await page.keyboard.type('conteúdo');
    expect(await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    })).toBe(true);
    let asked = false;
    page.on('dialog', async (dialog) => {
      asked = dialog.type() === 'beforeunload';
      await dialog.dismiss();
    });
    await page.close({ runBeforeUnload: true });
    await expect.poll(() => asked).toBe(true);
  });
});

test.describe('atalhos e navegação entre campos', () => {
  test('F6, Shift+F6, Tab entre campos e Shift+Tab a partir da prescrição', async ({ page }) => {
    await openApp(page);
    await expect(body(page)).toBeFocused();
    await page.keyboard.press('F6');
    await expect(field(page, 'doctor')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(field(page, 'uf')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(field(page, 'crm')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(field(page, 'place')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(field(page, 'crm')).toBeFocused();
    await page.keyboard.press('Shift+F6');
    await page.keyboard.press('Shift+F6');
    await page.keyboard.press('Shift+F6');
    await expect(body(page)).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(field(page, 'patient')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(body(page)).toBeFocused();
    // Dentro da prescrição, Tab é texto.
    await page.keyboard.press('Tab');
    expect((await snapshot(page)).paragraphs).toEqual(['\t']);
  });

  test('nova receita por atalho alternativo e ajuda de atalhos', async ({ page }) => {
    await openApp(page);
    await page.keyboard.type('x');
    await page.keyboard.press('Alt+Shift+KeyN');
    await expect(page.locator('.rx-dialog')).toContainText('Começar uma nova receita?');
    await page.keyboard.press('Escape');
    await page.click('[data-action="help"]');
    await expect(page.locator('.rx-dialog')).toContainText('Quebra de página manual');
    await page.keyboard.press('Escape');
    await expect(page.locator('.rx-dialog')).toHaveCount(0);
  });
});
