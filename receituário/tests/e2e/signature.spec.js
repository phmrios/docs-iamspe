import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openApp, body, fillFields, snapshot, typeParagraphs, exportPdf, MOD, SIGNATURE_PNG } from './helpers.js';
import { inspectPdf } from '../fixtures/pdf.js';

async function addSignature(page, pageIndex = 0) {
  const chooser = page.waitForEvent('filechooser');
  await page.locator(`.rx-page-layer[data-page="${pageIndex}"] .rx-sig-add`).click();
  await (await chooser).setFiles(SIGNATURE_PNG);
  await expect.poll(async () => Boolean((await snapshot(page)).signatures[pageIndex])).toBe(true);
}
const sig = async (page, index = 0) => (await snapshot(page)).signatures[index];
const inside = (page, index = 0) => page.evaluate((i) => {
  const s = window.__rx.state.signatures[i];
  const r = window.__rx.composition.signatureRegion;
  const a = (s.rotation * Math.PI) / 180;
  const ex = (s.width * Math.abs(Math.cos(a)) + s.height * Math.abs(Math.sin(a))) / 2;
  const ey = (s.width * Math.abs(Math.sin(a)) + s.height * Math.abs(Math.cos(a))) / 2;
  return s.cx - ex >= r.x - 0.5 && s.cx + ex <= r.x + r.width + 0.5 && s.cy - ey >= r.y - 0.5 && s.cy + ey <= r.y + r.height + 0.5;
}, index);

test.describe('assinatura PNG', () => {
  test('CA-08: inserir, mover, redimensionar, girar, substituir, restaurar e remover', async ({ page }) => {
    const { external, errors } = await openApp(page);
    await addSignature(page);
    const box = page.locator('.rx-sig-box').first();
    await expect(box).toBeVisible();
    const initial = await sig(page);
    expect(initial.useProcessed).toBe(true); // fundo branco removido automaticamente
    expect(initial.width / initial.height).toBeCloseTo(3, 1);
    expect(await inside(page)).toBe(true);
    // O fundo ficou transparente; os traços continuam opacos.
    const alpha = await page.evaluate((id) => {
      const canvas = window.__rx.images.canvas(id, 'processed');
      const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let clear = 0;
      let solid = 0;
      for (let i = 3; i < d.length; i += 4) d[i] === 0 ? clear++ : d[i] === 255 && solid++;
      return { clear, solid, total: d.length / 4 };
    }, initial.id);
    expect(alpha.clear / alpha.total).toBeGreaterThan(0.8);
    expect(alpha.solid).toBeGreaterThan(300);

    // Arrastar
    const rect = await box.boundingBox();
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.mouse.move(rect.x + rect.width / 2 - 120, rect.y + rect.height / 2 - 10, { steps: 6 });
    await page.mouse.up();
    const moved = await sig(page);
    expect(moved.cx).toBeLessThan(initial.cx - 50);
    // Arrastar para muito longe: fica contida na área reservada.
    const r2 = await box.boundingBox();
    await page.mouse.move(r2.x + r2.width / 2, r2.y + r2.height / 2);
    await page.mouse.down();
    await page.mouse.move(r2.x - 2000, r2.y - 2000, { steps: 4 });
    await page.mouse.up();
    expect(await inside(page)).toBe(true);
    const undoDepth = (await snapshot(page)).undoDepth;
    expect(undoDepth).toBe(3); // inserir + 2 arrastos, cada um com entrada própria

    // Redimensionar pela alça
    await box.hover();
    const handle = page.locator('.rx-sig-se').first();
    const h = await handle.boundingBox();
    const beforeResize = await sig(page);
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.down();
    await page.mouse.move(h.x - 70, h.y - 22, { steps: 5 });
    await page.mouse.up();
    const resized = await sig(page);
    expect(resized.width).toBeLessThan(beforeResize.width - 3);
    expect(resized.width / resized.height).toBeCloseTo(beforeResize.width / beforeResize.height, 2);

    // Girar: campo numérico e alça
    const angle = page.locator('.rx-sig-angle').first();
    await angle.fill('25');
    await angle.press('Enter');
    await angle.blur();
    expect((await sig(page)).rotation).toBe(25);
    expect(await inside(page)).toBe(true);
    await box.hover();
    const rot = await page.locator('.rx-sig-rotate').first().boundingBox();
    await page.mouse.move(rot.x + rot.width / 2, rot.y + rot.height / 2);
    await page.mouse.down();
    await page.mouse.move(rot.x + 60, rot.y + 5, { steps: 5 });
    await page.mouse.up();
    expect((await sig(page)).rotation).not.toBe(25);
    expect(await inside(page)).toBe(true);

    // Restaurar a imagem original e voltar a remover o fundo
    await page.getByRole('button', { name: 'Restaurar original' }).first().click();
    let current = await sig(page);
    expect(current.useProcessed).toBe(false);
    expect(current.rotation).toBe(0);
    await page.getByRole('button', { name: 'Remover fundo' }).first().click();
    expect((await sig(page)).useProcessed).toBe(true);

    // Substituir
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Substituir' }).first().click();
    await (await chooser).setFiles(SIGNATURE_PNG);
    await expect.poll(async () => (await sig(page)).id).not.toBe(initial.id);
    expect(await inside(page)).toBe(true);

    // Remover e desfazer
    await page.getByRole('button', { name: 'Remover', exact: true }).first().click();
    expect((await snapshot(page)).signatures).toEqual({});
    await expect(page.locator('.rx-sig-add').first()).toBeVisible();
    await body(page).click();
    await page.keyboard.press(`${MOD}+z`);
    expect(await sig(page)).toBeTruthy();
    expect(external).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('arquivo que não é PNG é recusado com mensagem', async ({ page }) => {
    await openApp(page);
    const chooser = page.waitForEvent('filechooser');
    await page.locator('.rx-sig-add').first().click();
    await (await chooser).setFiles({ name: 'foto.png', mimeType: 'image/png', buffer: Buffer.from('isto não é uma imagem') });
    await expect(page.locator('.rx-toast-error')).toContainText('PNG');
    expect((await snapshot(page)).signatures).toEqual({});
  });

  test('controles independentes por página; página eliminada descarta a assinatura', async ({ page }) => {
    await openApp(page);
    await typeParagraphs(page, 18);
    const count = (await snapshot(page)).pageCount;
    expect(count).toBeGreaterThanOrEqual(3);
    await expect(page.locator('.rx-sig-add')).toHaveCount(count);
    await addSignature(page, 0);
    await addSignature(page, count - 1);
    let state = await snapshot(page);
    expect(Object.keys(state.signatures).map(Number)).toEqual([0, count - 1]);
    expect(state.signatures[0].id).not.toBe(state.signatures[count - 1].id);
    // A linha de assinatura continua em todas as páginas, com ou sem imagem.
    const lines = await page.evaluate(() => window.__rx.composition.pages.map((p) => p.items.filter((i) => i.role === 'sigline').length));
    expect(lines).toEqual(new Array(count).fill(1));

    // Reduz o conteúdo: as páginas finais desaparecem.
    await body(page).click();
    await page.keyboard.press(`${MOD}+a`);
    await page.keyboard.type('curto');
    state = await snapshot(page);
    expect(state.pageCount).toBe(1);
    expect(Object.keys(state.signatures)).toEqual(['0']);
    // Desfazer devolve texto, páginas e a assinatura da página eliminada.
    await page.keyboard.press(`${MOD}+z`);
    await page.keyboard.press(`${MOD}+z`);
    state = await snapshot(page);
    if (state.pageCount === 1) {
      await page.keyboard.press(`${MOD}+z`);
      state = await snapshot(page);
    }
    expect(state.pageCount).toBe(count);
    expect(Object.keys(state.signatures).map(Number)).toEqual([0, count - 1]);
  });

  test('a assinatura sai no PDF como imagem, com o restante vetorial', async ({ page }) => {
    await openApp(page);
    await fillFields(page);
    await body(page).click();
    await page.keyboard.type('Repouso.');
    await addSignature(page);
    const angle = page.locator('.rx-sig-angle').first();
    await angle.fill('-12');
    await angle.press('Enter');
    const { file } = await exportPdf(page);
    const info = await inspectPdf(readFileSync(file));
    expect(info.images).toBe(1);
    expect(info.largestImagePixels).toBe(300 * 100); // só a assinatura; a página não é rasterizada
    expect(info.formFields).toBe(0);
    for (const font of info.fonts.values()) expect(font.embedded).toBe(true);
  });
});
