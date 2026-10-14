import { test, expect } from '@playwright/test';
import { openApp, body, fillFields, paste, typeParagraphs, MOD, SIGNATURE_PNG } from '../e2e/helpers.js';

const SAMPLE = [
  '1) Amoxicilina 500 mg ------------------------------ 21 comprimidos',
  'Tomar um comprimido por via oral a cada oito horas, durante sete dias consecutivos, preferencialmente após as refeições principais.',
  '',
  '2) Dipirona 1 g ------------------------------------ 10 comprimidos',
  'Tomar um comprimido se dor ou febre, até de 6/6 horas.',
  '\tDose máxima: 4 g/dia. Temperatura ≥ 37,8 °C ✓',
].join('\n');

async function prepare(page) {
  await openApp(page);
  // Data fixa: as referências não podem depender do dia em que o teste roda.
  await page.evaluate(() => window.__rx.commit({ date: '2026-10-13' }, { history: false }));
  await page.addStyleTag({ content: '.rx-body, .rx-field-input { caret-color: transparent !important; }' });
  await page.click('[data-action="zoom-reset"]');
}

test.describe('referências visuais', () => {
  test('editor vazio', async ({ page }) => {
    await prepare(page);
    await expect(page).toHaveScreenshot('editor-vazio.png');
  });

  test('editor preenchido, com assinatura', async ({ page }) => {
    await prepare(page);
    await fillFields(page);
    await body(page).click();
    await paste(page, SAMPLE);
    const chooser = page.waitForEvent('filechooser');
    await page.locator('.rx-sig-add').first().click();
    await (await chooser).setFiles(SIGNATURE_PNG);
    await expect(page.locator('.rx-sig-box').first()).toBeVisible();
    await body(page).click();
    await page.mouse.move(5, 300);
    await expect(page).toHaveScreenshot('editor-preenchido.png');
    await page.evaluate(() => (document.getElementById('rx-workspace').scrollTop = 520));
    await expect(page).toHaveScreenshot('editor-rodape.png');
  });

  test('duas páginas e quebra manual', async ({ page }) => {
    await prepare(page);
    await fillFields(page);
    await body(page).click();
    await page.keyboard.insertText('Primeira página');
    await page.keyboard.press(`${MOD}+Enter`);
    await page.keyboard.insertText('Segunda página');
    await page.evaluate(() => (document.getElementById('rx-workspace').scrollTop = 880));
    await page.mouse.move(5, 300);
    await expect(page).toHaveScreenshot('editor-duas-paginas.png');
  });

  test('prévia', async ({ page }) => {
    await prepare(page);
    await fillFields(page);
    await body(page).click();
    await paste(page, SAMPLE);
    await page.click('[data-action="preview"]');
    await expect(page.locator('.rx-preview')).toBeVisible();
    await expect(page).toHaveScreenshot('previa.png');
  });

  test('avisos antes de exportar', async ({ page }) => {
    await prepare(page);
    await page.click('[data-action="export"]');
    await expect(page.locator('.rx-dialog')).toBeVisible();
    await expect(page).toHaveScreenshot('avisos.png');
  });
});

test.describe('fidelidade editor × prévia', () => {
  test('o texto da camada HTML cai sobre o mesmo lugar do Canvas final', async ({ page }) => {
    await prepare(page);
    await fillFields(page);
    await body(page).click();
    await paste(page, SAMPLE);
    await typeParagraphs(page, 3);
    // Editor sem os elementos de edição (realces, limites de bloco, botões).
    await page.addStyleTag({ content: '.rx-hl, .rx-date { background: transparent !important; } .rx-block-first::before, .rx-block-last::after, .rx-sig-add, .rx-placeholder { display: none !important; } .rx-canvas { box-shadow: none !important; }' });
    await page.locator('.rx-field-patient .rx-field-input').first().blur();
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    const canvas = page.locator('canvas.rx-canvas').first();
    await canvas.scrollIntoViewIfNeeded();
    const size = await canvas.evaluate((c) => ({ width: c.getBoundingClientRect().width, height: c.getBoundingClientRect().height }));
    await page.setViewportSize({ width: 1360, height: Math.ceil(size.height) + 200 });
    const clipOf = async (locator) => {
      const b = await locator.boundingBox();
      return { x: Math.round(b.x), y: Math.round(b.y), width: Math.floor(size.width), height: Math.floor(size.height) };
    };
    const editorShot = await page.screenshot({ clip: await clipOf(canvas) });
    await page.click('[data-action="preview"]');
    await page.evaluate(() => window.__rx.preview.setZoom(1));
    const previewCanvas = page.locator('.rx-preview canvas').first();
    // A prévia rola dentro do modal: compara-se o próprio bitmap do canvas final.
    const previewData = await previewCanvas.evaluate((c) => c.toDataURL('image/png'));
    const result = await page.evaluate(async ({ a, b }) => {
      const load = (src) => new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      const w = Math.min(ia.width, ib.width);
      const h = Math.min(ia.height, ib.height);
      const pixels = (img) => {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, w, h).data;
      };
      const da = pixels(ia);
      const db = pixels(ib);
      // "Tinta": pixel escuro. Compara-se com tolerância de 1 px de vizinhança,
      // porque DOM e Canvas suavizam as bordas das letras de modo diferente.
      const dark = (d, x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4] < 110;
      const near = (d, x, y) => dark(d, x, y) || dark(d, x - 1, y) || dark(d, x + 1, y) || dark(d, x, y - 1) || dark(d, x, y + 1);
      let inkA = 0;
      let inkB = 0;
      let missA = 0;
      let missB = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const a1 = dark(da, x, y);
          const b1 = dark(db, x, y);
          if (a1) {
            inkA++;
            if (!near(db, x, y)) missA++;
          }
          if (b1) {
            inkB++;
            if (!near(da, x, y)) missB++;
          }
        }
      }
      return { inkA, inkB, missA: missA / inkA, missB: missB / inkB };
    }, { a: `data:image/png;base64,${editorShot.toString('base64')}`, b: previewData });
    expect(result.inkA).toBeGreaterThan(5000);
    expect(Math.abs(result.inkA - result.inkB) / result.inkB).toBeLessThan(0.15);
    expect(result.missA, 'tinta do editor sem correspondente na prévia').toBeLessThan(0.03);
    expect(result.missB, 'tinta da prévia sem correspondente no editor').toBeLessThan(0.03);
  });
});
