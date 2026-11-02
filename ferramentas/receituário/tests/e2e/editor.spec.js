import { test, expect } from '@playwright/test';
import { openApp, body, field, fillFields, paste, snapshot, expectInSync, caretInfo, typeParagraphs, pressKeys, MOD } from './helpers.js';

test.describe('inicialização e funcionamento offline', () => {
  test('CA-01: abre do disco, sem rede, sem requisições externas e sem erros', async ({ page }) => {
    const { external, errors } = await openApp(page);
    await expect(page.locator('canvas.rx-canvas')).toHaveCount(1);
    await expect(body(page)).toBeFocused();
    const fonts = await page.evaluate(() => [...document.fonts].map((f) => `${f.family}:${f.weight}:${f.status}`));
    expect(fonts.sort()).toEqual(['RX Fallback:400:loaded', 'RX Mono:400:loaded', 'RX Mono:700:loaded']);
    expect((await snapshot(page)).warnings).toEqual([]);
    expect(external).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('CA-13: nada é gravado em armazenamento persistente', async ({ page }) => {
    await openApp(page);
    await fillFields(page);
    await body(page).click();
    await page.keyboard.type('Dipirona 1 g');
    const storage = await page.evaluate(async () => ({
      local: localStorage.length,
      session: sessionStorage.length,
      cookies: document.cookie,
      databases: indexedDB.databases ? (await indexedDB.databases()).length : 0,
      caches: typeof caches !== 'undefined' ? await caches.keys().then((k) => k.length).catch(() => 0) : 0,
    }));
    expect(storage).toEqual({ local: 0, session: 0, cookies: '', databases: 0, caches: 0 });
  });
});

test.describe('edição direta sobre a folha', () => {
  test('CA-02: campos e prescrição são preenchidos na própria página', async ({ page }) => {
    await openApp(page);
    await expect(page.locator('.rx-placeholder')).toHaveCount(6);
    await fillFields(page);
    await body(page).click();
    await page.keyboard.type('Amoxicilina 500 mg');
    const state = await snapshot(page);
    expect(state.fields).toEqual({ patient: 'João da Silva', doctor: 'Dra. Maria Souza', uf: 'SP', crm: '123456', place: 'Clínica Central' });
    expect(state.paragraphs).toEqual(['Amoxicilina 500 mg']);
    await expect(page.locator('.rx-placeholder')).toHaveCount(0);
    await expect(page.locator('form, aside, textarea')).toHaveCount(0);
  });

  test('Enter, Shift+Enter e Tab', async ({ page }) => {
    await openApp(page);
    await page.keyboard.type('um');
    await page.keyboard.press('Enter');
    await page.keyboard.type('dois');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.press('Tab');
    await page.keyboard.type('três');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('fim');
    expect((await snapshot(page)).paragraphs).toEqual(['um', 'dois\n\ttrês', '', 'fim']);
    await expect(body(page)).toBeFocused();
    await expectInSync(page);
    // Tabulação: parada a cada dois caracteres da fonte.
    const tab = await page.locator('.rx-tab').first().evaluate((el) => el.getBoundingClientRect().width / window.__rx.zoom);
    const char = await page.evaluate(() => window.__rx.composer.measure('0'));
    expect(tab).toBeCloseTo(2 * char, 1);
  });

  test('CA-06: tipografia da prescrição', async ({ page }) => {
    await openApp(page);
    await page.keyboard.type('um');
    await page.keyboard.press('Enter');
    await page.keyboard.type('dois');
    const style = await body(page).locator('p').first().evaluate((el) => {
      const cs = getComputedStyle(el);
      return { family: cs.fontFamily, size: parseFloat(cs.fontSize), line: parseFloat(cs.lineHeight), weight: cs.fontWeight, align: cs.textAlign, indent: cs.textIndent };
    });
    expect(style.family).toContain('RX Mono');
    expect(style.size).toBeCloseTo(14.667, 2); // 11 pt
    expect(style.line).toBeCloseTo(22, 2); // 1,5 × 11 pt
    expect(style.weight).toBe('400');
    expect(['left', 'start']).toContain(style.align);
    expect(parseFloat(style.indent)).toBe(0);
    const gap = await page.evaluate(() => {
      const [a, b] = document.querySelectorAll('.rx-body p');
      return (b.getBoundingClientRect().top - a.getBoundingClientRect().bottom) / window.__rx.zoom;
    });
    expect(gap).toBeCloseTo(8, 1); // 6 pt entre parágrafos
  });

  test('colagem: só texto, com parágrafos e quebras preservados', async ({ page }) => {
    const { errors } = await openApp(page);
    await page.keyboard.type('antes ');
    await paste(page, 'Linha 1\r\nLinha 2\r\n\r\nLinha\t4', '<p style="color:red;font-size:40px"><b>Linha 1</b></p><script>window.__hacked = true</script><img src=x onerror="window.__hacked = true">');
    const state = await snapshot(page);
    expect(state.paragraphs).toEqual(['antes Linha 1', 'Linha 2', '', 'Linha\t4']);
    expect(await page.evaluate(() => window.__hacked)).toBeUndefined();
    expect(await body(page).locator('b, i, u, img, script, [style*="color"]').count()).toBe(0);
    const size = await body(page).locator('p').first().evaluate((el) => getComputedStyle(el).fontSize);
    expect(parseFloat(size)).toBeCloseTo(14.667, 2);
    // Colagem é uma única entrada no histórico.
    await page.keyboard.press(`${MOD}+z`);
    expect((await snapshot(page)).paragraphs).toEqual(['antes ']);
    expect(errors).toEqual([]);
  });

  test('colagem só com HTML extrai o texto sem executar nada', async ({ page }) => {
    await openApp(page);
    await paste(page, null, '<div>Um<br>Dois</div><p>Três</p><script>window.__hacked = 1</script>');
    expect((await snapshot(page)).paragraphs).toEqual(['Um', 'Dois', 'Três']);
    expect(await page.evaluate(() => window.__hacked)).toBeUndefined();
  });

  test('campos administrativos aceitam só uma linha de texto simples', async ({ page }) => {
    await openApp(page);
    await field(page, 'patient').click();
    await paste(page, 'Maria\nda\tSilva', '<b>x</b>');
    await page.keyboard.press('Enter');
    expect((await snapshot(page)).fields.patient).toBe('Maria da Silva');
    await expect(body(page)).toBeFocused(); // Enter leva ao próximo campo
  });

  test('seleção, movimentação do cursor e edição no início e no fim', async ({ page }) => {
    await openApp(page);
    await page.keyboard.type('meio');
    await page.keyboard.press(`${MOD}+a`);
    const sel = (await snapshot(page)).selection;
    expect(Math.abs(sel.head - sel.anchor)).toBeGreaterThanOrEqual(4);
    await pressKeys(page, 'ArrowLeft');
    await page.keyboard.type('início ');
    await pressKeys(page, 'ArrowRight', 4);
    await page.keyboard.type(' fim');
    await pressKeys(page, 'ArrowLeft', 2);
    await pressKeys(page, 'Shift+ArrowRight', 2);
    await page.keyboard.type('M');
    expect((await snapshot(page)).paragraphs).toEqual(['início meio fM']);
  });

  test('caracteres especiais são preservados e usam a fonte alternativa quando preciso', async ({ page }) => {
    await openApp(page);
    const text = 'Dose: 500 µg ± 10% a 37 °C — αβγ Ω ≥ 2× ✓';
    await page.keyboard.insertText(text);
    expect((await snapshot(page)).paragraphs).toEqual([text]);
    await expect(page.locator('.rx-body .rx-fb')).toHaveText('✓');
    await expectInSync(page);
    const lineBoxes = await page.evaluate(() => document.querySelector('.rx-body p').getBoundingClientRect().height / window.__rx.zoom);
    expect(lineBoxes).toBeCloseTo(22, 1); // a fonte alternativa não altera a entrelinha
    expect((await snapshot(page)).warnings).toEqual([]);
  });

  test('quebra de linha, hifenização visual e palavras longas não alteram o texto', async ({ page }) => {
    await openApp(page);
    const text = `${'a'.repeat(62)} preferencialmente ${'X'.repeat(120)} amoxicilina`;
    await page.keyboard.insertText(text);
    expect((await snapshot(page)).paragraphs).toEqual([text]);
    await expect(page.locator('.rx-hyphen-break')).toHaveCount(1);
    expect(await body(page).evaluate((el) => el.textContent)).toBe(text);
    const overflow = await page.evaluate(() => {
      const host = document.getElementById('rx-body-host').getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(document.querySelector('.rx-body p'));
      return Math.max(...[...range.getClientRects()].map((r) => r.right)) - host.right;
    });
    expect(overflow).toBeLessThan(1.5);
    await expectInSync(page);
  });

  test('corretor ortográfico nativo, em português, só na camada de edição', async ({ page }) => {
    await openApp(page);
    expect(await body(page).getAttribute('spellcheck')).toBe('true');
    expect(await body(page).getAttribute('lang')).toBe('pt-BR');
    expect(await page.locator('html').getAttribute('lang')).toBe('pt-BR');
  });
});

test.describe('paginação durante a edição', () => {
  test('CA-03/CA-04: páginas são criadas, o cursor acompanha e nada se perde', async ({ page }) => {
    const { errors } = await openApp(page);
    await fillFields(page);
    await body(page).click();
    await typeParagraphs(page, 18);
    const state = await snapshot(page);
    expect(state.pageCount).toBeGreaterThanOrEqual(3);
    expect(state.domPages).toBe(state.pageCount);
    expect(state.paragraphs.filter((p) => p).length).toBe(18);
    const caret = await caretInfo(page);
    expect(caret.hasFocus).toBe(true);
    expect(caret.visible).toBe(true);
    expect(caret.pageIndex).toBe(state.pageCount - 1);
    await expectInSync(page);
    // Todas as páginas repetem os campos, sincronizados.
    for (let i = 0; i < state.pageCount; i++) await expect(field(page, 'patient', i)).toHaveText('João da Silva');
    expect(errors).toEqual([]);
  });

  test('inserção e exclusão no meio de várias páginas mantêm o cursor na posição lógica', async ({ page }) => {
    await openApp(page);
    await typeParagraphs(page, 14);
    const before = await snapshot(page);
    // Cursor no fim do 3º parágrafo com texto (página 1).
    await page.evaluate(() => {
      const view = window.__rx.body.view;
      let pos = 0;
      let seen = 0;
      view.state.doc.forEach((node, offset) => {
        if (node.content.size && ++seen === 3) pos = offset + node.nodeSize - 1;
      });
      const Selection = view.state.selection.constructor;
      view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(pos))).scrollIntoView());
      view.focus();
    });
    const head = (await caretInfo(page)).head;
    for (let i = 0; i < 12; i++) await page.keyboard.press('Enter');
    await page.keyboard.type('INSERIDO');
    const grown = await snapshot(page);
    expect(grown.pageCount).toBeGreaterThan(before.pageCount);
    const caret = await caretInfo(page);
    expect(caret.head).toBe(head + 12 * 2 + 8);
    expect(caret.visible).toBe(true);
    expect(caret.hasFocus).toBe(true);
    await expectInSync(page);
    for (let i = 0; i < 8 + 12; i++) await page.keyboard.press('Backspace');
    const back = await snapshot(page);
    expect(back.paragraphs).toEqual(before.paragraphs);
    expect(back.pageCount).toBe(before.pageCount);
    expect((await caretInfo(page)).head).toBe(head);
    await expectInSync(page);
  });

  test('excluir o texto remove as páginas adicionais', async ({ page }) => {
    await openApp(page);
    await typeParagraphs(page, 14);
    expect((await snapshot(page)).pageCount).toBeGreaterThan(1);
    await page.keyboard.press(`${MOD}+a`);
    await page.keyboard.press('Backspace');
    const state = await snapshot(page);
    expect(state.pageCount).toBe(1);
    expect(state.domPages).toBe(1);
    expect(state.paragraphs).toEqual(['']);
  });

  test('quebra manual: indicador só no editor; remover devolve o texto à mesma página', async ({ page }) => {
    await openApp(page);
    await page.keyboard.type('primeira');
    await page.keyboard.press(`${MOD}+Enter`);
    await page.keyboard.type('segunda');
    let state = await snapshot(page);
    expect(state.paragraphs).toEqual(['primeira', '<pb>', 'segunda']);
    expect(state.pageCount).toBe(2);
    await expect(page.locator('.rx-page-break')).toHaveText('Quebra de página manual');
    expect((await caretInfo(page)).pageIndex).toBe(1);
    await expectInSync(page);
    await pressKeys(page, 'ArrowLeft', 7);
    await page.keyboard.press('Backspace');
    state = await snapshot(page);
    expect(state.paragraphs).toEqual(['primeira', 'segunda']);
    expect(state.pageCount).toBe(1);
  });

  test('blocos: limites visíveis, dividir e unir pela barra, texto intacto', async ({ page }) => {
    await openApp(page);
    await paste(page, 'A1\nA2\nA3\n\nB1\nB2');
    await expect(page.locator('.rx-block-first')).toHaveCount(2);
    const before = (await snapshot(page)).paragraphs;
    // Cursor em A2 → dividir.
    await body(page).locator('p').nth(1).click();
    await expect(page.locator('[data-action="split-block"]')).toBeEnabled();
    await page.click('[data-action="split-block"]');
    await expect(page.locator('.rx-block-first')).toHaveCount(3);
    await expect(body(page)).toBeFocused();
    await page.click('[data-action="join-blocks"]');
    await expect(page.locator('.rx-block-first')).toHaveCount(2);
    // Cursor em B1 → unir com o bloco anterior, mantendo a linha vazia.
    await body(page).locator('p').nth(4).click();
    await page.keyboard.press('Alt+Shift+KeyU');
    await expect(page.locator('.rx-block-first')).toHaveCount(1);
    expect((await snapshot(page)).paragraphs).toEqual(before);
    await page.keyboard.press(`${MOD}+z`);
    await expect(page.locator('.rx-block-first')).toHaveCount(2);
  });

  test('nome do paciente extenso desloca a prescrição em todas as páginas', async ({ page }) => {
    await openApp(page);
    await typeParagraphs(page, 9);
    const before = await snapshot(page);
    await field(page, 'patient').click();
    await page.keyboard.insertText('Maria Aparecida '.repeat(8).trim());
    const after = await page.evaluate(() => ({ lines: window.__rx.composition.fields.patient.lines.length, top: window.__rx.composition.metrics.bodyTop }));
    expect(after.lines).toBe(2);
    await expectInSync(page);
    await expect(field(page, 'patient', 0)).toBeFocused();
    expect((await snapshot(page)).paragraphs).toEqual(before.paragraphs);
  });

  test('local de atendimento extenso: várias linhas centralizadas e aviso técnico quando não cabe', async ({ page }) => {
    await openApp(page);
    await field(page, 'place').click();
    await page.keyboard.insertText('Hospital Universitário Professor Doutor Fulano de Tal, Ambulatório de Especialidades');
    expect(await page.evaluate(() => window.__rx.composition.fields.place.lines.length)).toBe(2);
    await expect(page.locator('#rx-warnings')).toBeHidden();
    await page.keyboard.insertText(' — Unidade de atendimento muito distante'.repeat(6));
    await expect(page.locator('#rx-warnings')).toBeVisible();
    await page.click('#rx-warnings');
    await expect(page.locator('.rx-dialog')).toContainText('não cabe na região disponível do rodapé');
  });
});

test.describe('histórico', () => {
  test('CA-05: desfazer e refazer texto, campos e quebras, com o cursor', async ({ page }) => {
    await openApp(page);
    await page.keyboard.type('abc');
    await page.waitForTimeout(900); // pausa encerra o grupo de digitação
    await page.keyboard.type('def');
    await page.keyboard.press(`${MOD}+Enter`);
    await field(page, 'patient').click();
    await page.keyboard.type('Ana');
    expect((await snapshot(page)).undoDepth).toBe(4);

    await page.keyboard.press(`${MOD}+z`);
    let state = await snapshot(page);
    expect(state.fields.patient).toBe('');
    expect(state.paragraphs).toEqual(['abcdef', '<pb>', '']);
    await page.keyboard.press(`${MOD}+z`);
    state = await snapshot(page);
    expect(state.paragraphs).toEqual(['abcdef']);
    expect(state.pageCount).toBe(1);
    expect(state.selection.head).toBe(7);
    await expect(body(page)).toBeFocused();
    await page.keyboard.press(`${MOD}+z`);
    expect((await snapshot(page)).paragraphs).toEqual(['abc']);
    await page.keyboard.press(`${MOD}+z`);
    state = await snapshot(page);
    expect(state.paragraphs).toEqual(['']);
    expect(state.canUndo).toBe(false);
    await expect(page.locator('[data-action="undo"]')).toBeDisabled();

    for (let i = 0; i < 4; i++) await page.keyboard.press(`${MOD}+Shift+z`);
    state = await snapshot(page);
    expect(state.paragraphs).toEqual(['abcdef', '<pb>', '']);
    expect(state.fields.patient).toBe('Ana');
    expect(state.canRedo).toBe(false);
    await expect(field(page, 'patient')).toHaveText('Ana');

    // Botões da barra
    await page.click('[data-action="undo"]');
    expect((await snapshot(page)).fields.patient).toBe('');
    await page.click('[data-action="redo"]');
    expect((await snapshot(page)).fields.patient).toBe('Ana');
  });

  test('digitação contínua é agrupada; exclusão extensa tem entrada própria', async ({ page }) => {
    await openApp(page);
    await page.keyboard.type('uma frase digitada sem pausas');
    expect((await snapshot(page)).undoDepth).toBe(1);
    await page.keyboard.press(`${MOD}+a`);
    await page.keyboard.press('Backspace');
    expect((await snapshot(page)).undoDepth).toBe(2);
    await page.keyboard.press(`${MOD}+z`);
    expect((await snapshot(page)).paragraphs).toEqual(['uma frase digitada sem pausas']);
  });

  test('o histórico não interfere no texto ao alternar entre campo e prescrição', async ({ page }) => {
    await openApp(page);
    await page.keyboard.type('texto');
    await field(page, 'doctor').click();
    await page.keyboard.type('Dr. X');
    await body(page).click();
    await page.keyboard.type('!');
    await page.keyboard.press(`${MOD}+z`);
    await page.keyboard.press(`${MOD}+z`);
    const state = await snapshot(page);
    expect(state.fields.doctor).toBe('');
    expect(state.paragraphs.join('')).toContain('texto');
  });
});
