import { describe, test, expect } from 'vitest';
import { newComposer, docState, loadFonts, LOREM, TINY_PNG, FIELDS } from '../fixtures/env.js';
import { extractPdf, inspectPdf, linesOf } from '../fixtures/pdf.js';
import { generatePdf, generateVerifiedPdf, verifyPdf, PDF_PRODUCER } from '../../src/pdf/generate.js';
import { defaultPlacement } from '../../src/signature/geometry.js';
import { pxToPt } from '../../src/utils/units.js';
import { PDFDocument, decodePDFRawStream } from 'pdf-lib';
import { FOOTER_TOP, SIGNATURE_LINE } from '../../src/pagination/geometry.js';

const fonts = loadFonts();
const long = (n) => Array.from({ length: n }, (_, i) => `${i + 1}) ${LOREM}`).join('\n\n');
const A4 = { width: 595.2756, height: 841.8898 };

/** Texto da prescrição reconstruído do PDF, respeitando quebras visuais × digitadas. */
function bodyFromPdf(extracted, composition) {
  const H = A4.height;
  const top = H - pxToPt(composition.metrics.bodyTop);
  const bottom = H - pxToPt(composition.metrics.bodyBottom);
  const perPage = extracted.pages.map((page) => linesOf(page, { top, bottom }));
  const paragraphs = [];
  for (const node of composition.body.nodes) {
    if (node.type !== 'paragraph') continue;
    let text = '';
    node.lines.forEach((line, k) => {
      const baseline = H - pxToPt(composition.metrics.bodyTop + node.lineY[k] + 22 * 0.5);
      const row = perPage[node.linePage[k]].find((r) => Math.abs(r.y - baseline) < 8);
      let content = row ? row.items.map((i) => i.text).join('') : '';
      if (line.hyphen) {
        expect(content.endsWith('-')).toBe(true);
        content = content.slice(0, -1); // hífen visual: não pertence ao texto
      }
      text += content;
      if (line.hard) text += '\n';
      // Quebra visual após espaço: o espaço pendente não é desenhado, mas separa as palavras.
      else if (k < node.lines.length - 1 && !line.hyphen && line.hangFrom < line.end && !/\s$/.test(content)) text += ' ';
    });
    paragraphs.push(text);
  }
  return paragraphs.join('\n');
}
const squash = (text) => text.replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').trim();

describe('paginação → PDF', () => {
  test('uma página A4, texto real, fontes incorporadas, sem formulário', async () => {
    const comp = newComposer().compose(docState('Dipirona 1 g\nTomar 1 comprimido se dor.'));
    const bytes = await generatePdf(comp, { fonts });
    const info = await inspectPdf(bytes);
    expect(info.pageCount).toBe(1);
    expect(info.sizes[0].width).toBeCloseTo(A4.width, 2);
    expect(info.sizes[0].height).toBeCloseTo(A4.height, 2);
    expect(info.formFields).toBe(0);
    expect(info.annotations).toBe(0);
    expect(info.images).toBe(0);
    const names = [...info.fonts.keys()].join(' ');
    expect(names).toMatch(/LiberationMono-Bold/);
    expect(names).toMatch(/LiberationMono(?!-Bold)/);
    for (const font of info.fonts.values()) {
      expect(font.embedded).toBe(true);
      expect(font.toUnicode).toBe(true);
      expect(font.fileSize).toBeGreaterThan(1000);
    }
    const text = (await extractPdf(bytes)).pages[0].items.map((i) => i.text).join('\n');
    for (const expected of ['RECEITUÁRIO MÉDICO', 'PACIENTE:', FIELDS.patient, 'Dipirona 1 g', 'Tomar 1 comprimido se dor.', FIELDS.doctor, 'CRM-SP 123456', 'LOCAL DE ATENDIMENTO:', 'Clínica Central', '13 de outubro de 2026']) {
      expect(text).toContain(expected);
    }
    expect(text).not.toContain('Página 1');
  });

  test('fonte alternativa só é incorporada quando efetivamente necessária', async () => {
    const plain = await inspectPdf(await generatePdf(newComposer().compose(docState('texto simples')), { fonts }));
    expect([...plain.fonts.keys()].some((n) => /DejaVu/.test(n))).toBe(false);
    const fancy = await inspectPdf(await generatePdf(newComposer().compose(docState('feito ✓')), { fonts }));
    expect([...fancy.fonts.keys()].some((n) => /DejaVu/.test(n))).toBe(true);
  });

  test('documento extenso: mesma quantidade de páginas e mesma posição das linhas', async () => {
    const comp = newComposer().compose(docState(long(30)));
    const bytes = await generatePdf(comp, { fonts });
    const extracted = await extractPdf(bytes);
    expect(extracted.pages.length).toBe(comp.pageCount);
    for (const page of extracted.pages) {
      expect(page.width).toBeCloseTo(A4.width, 2);
      expect(page.height).toBeCloseTo(A4.height, 2);
    }
    // Cada item de texto da composição aparece no PDF na posição calculada.
    comp.pages.forEach((page, p) => {
      const pdfItems = extracted.pages[p].items;
      for (const item of page.items.filter((i) => i.type === 'text' && i.role !== 'hyphen')) {
        const x = pxToPt(item.x);
        const y = A4.height - pxToPt(item.y);
        // Fontes monoespaçadas: a posição de um trecho dentro de uma sequência
        // contígua do PDF é o início da sequência mais N avanços de caractere.
        const advance = pxToPt(item.size) * (1229 / 2048);
        const match = pdfItems.find((c) => {
          if (Math.abs(c.y - y) > 0.05 || c.x > x + 0.05) return false;
          const offset = Math.round((x - c.x) / advance);
          return Math.abs(c.x + offset * advance - x) < 0.1 && c.text.slice(offset).startsWith(item.text.trimEnd());
        });
        expect(match, `página ${p + 1}: "${item.text}"`).toBeTruthy();
        expect(match.size).toBeCloseTo(pxToPt(item.size), 2);
      }
      expect(pdfItems.map((i) => i.text).join(' ')).toContain(`Página ${p + 1} de ${comp.pageCount}`);
    });
  });

  test('integridade: o texto extraído reproduz a sequência original', async () => {
    const text = [
      long(6),
      'Linha com\ttabulação e    espaços',
      '',
      '',
      'Dose: 500 µg ± 10% a 37 °C — αβγ Ω ≥ 2× ½ ✓',
      'Associação anti-inflamatória preferencialmente administrada concomitantemente às refeições principais diariamente',
      'primeira\nsegunda (quebra simples)\n\nquarta',
      'X'.repeat(150),
    ].join('\n');
    const comp = newComposer().compose(docState(text));
    expect(comp.body.nodes.some((n) => n.lines && n.lines.some((l) => l.hyphen))).toBe(true);
    const extracted = await extractPdf(await generatePdf(comp, { fonts }));
    const rebuilt = bodyFromPdf(extracted, comp);
    expect(squash(rebuilt)).toBe(squash(text));
    // Símbolos clínicos chegam ao PDF exatamente como digitados.
    for (const symbol of ['µ', '±', '°', '%', 'α', 'β', 'γ', 'Ω', '≥', '×', '½', '✓']) expect(rebuilt).toContain(symbol);
  });

  test('quebras manuais geram páginas, inclusive em branco, sem marcar o texto', async () => {
    const comp = newComposer().compose(docState('primeira\fsegunda\f\fquarta'));
    const extracted = await extractPdf(await generatePdf(comp, { fonts }));
    expect(extracted.pages.length).toBe(4);
    const bodies = extracted.pages.map((p) => p.items.map((i) => i.text).join(' '));
    expect(bodies[0]).toContain('primeira');
    expect(bodies[1]).toContain('segunda');
    expect(bodies[2]).not.toMatch(/primeira|segunda|quarta/);
    expect(bodies[3]).toContain('quarta');
    expect(bodies.join(' ')).not.toContain('Quebra de página');
  });

  test('campos vazios são omitidos; rótulos permanentes ficam; textos indicativos nunca saem', async () => {
    const comp = newComposer().compose(docState('x', { fields: { patient: '', doctor: '', uf: '', crm: '', place: '' } }));
    const text = (await extractPdf(await generatePdf(comp, { fonts }))).pages[0].items.map((i) => i.text).join('|');
    expect(text).toContain('PACIENTE:');
    expect(text).toContain('LOCAL DE ATENDIMENTO:');
    expect(text).not.toMatch(/CRM|Nome do|Digite|UF/);
  });

  test('metadados mínimos, sem dados pessoais ou clínicos', async () => {
    const bytes = await generatePdf(newComposer().compose(docState('Amoxicilina 500 mg')), { fonts });
    const info = await inspectPdf(bytes);
    expect(info.producer).toBe(PDF_PRODUCER);
    expect(info.title).toBeUndefined();
    expect(info.author).toBeUndefined();
    expect(info.subject).toBeUndefined();
    expect(info.keywords).toBeUndefined();
    const raw = Buffer.from(bytes).toString('latin1');
    expect(raw).not.toContain('João');
    expect(raw).not.toContain('Amoxicilina');
  });
});

describe('paginação → assinaturas → PDF', () => {
  const sig = { ...defaultPlacement(600, 200), id: 's1', aspect: 3, useProcessed: true };
  const image = () => TINY_PNG;

  test('a imagem PNG é incorporada como imagem; o restante continua vetorial', async () => {
    const comp = newComposer().compose(docState('a\fb\fc', { signatures: { 0: sig, 2: { ...sig, rotation: 20 } } }));
    const bytes = await generatePdf(comp, { fonts, image });
    const info = await inspectPdf(bytes);
    expect(info.pageCount).toBe(3);
    expect(info.images).toBe(2);
    // Sem rasterização integral: a única imagem é a assinatura (2×2 px no teste).
    expect(info.largestImagePixels).toBe(4);
    const text = (await extractPdf(bytes)).pages.map((p) => p.items.map((i) => i.text).join(' '));
    expect(text[1]).toContain('RECEITUÁRIO MÉDICO');
  });
  test('assinatura fica na área reservada, acima do nome do médico', () => {
    const comp = newComposer().compose(docState('a', { signatures: { 0: sig } }));
    const img = comp.pages[0].items.find((i) => i.type === 'image');
    expect(img.cy - img.height / 2).toBeGreaterThanOrEqual(FOOTER_TOP);
    expect(img.cy + img.height / 2).toBeLessThan(SIGNATURE_LINE.y + 8);
  });
  test('imagem indisponível: falha explícita, nunca um PDF incompleto', async () => {
    const comp = newComposer().compose(docState('a', { signatures: { 0: sig } }));
    await expect(generateVerifiedPdf(comp, { fonts, image: () => undefined }, { attempts: 2 })).rejects.toThrow(/assinatura/i);
  });
});

describe('hífen visual no PDF', () => {
  test('é desenhado dentro de um trecho marcado com texto equivalente vazio', async () => {
    const text = `${'a'.repeat(62)} preferencialmente depois`;
    const comp = newComposer().compose(docState(text));
    expect(comp.pages[0].items.filter((i) => i.role === 'hyphen')).toHaveLength(1);
    const bytes = await generatePdf(comp, { fonts });
    const pdf = await PDFDocument.load(bytes);
    const stream = pdf.getPage(0).node.Contents();
    const content = Buffer.from(decodePDFRawStream(pdf.context.lookup(stream.get ? stream.get(0) : stream)).decode()).toString('latin1');
    const spans = content.match(/\/Span\s*<<[^>]*\/ActualText\s*\(\)[^>]*>>\s*BDC[\s\S]*?EMC/g) || [];
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatch(/Tj/);
  });
});

describe('recuperação de falhas', () => {
  const comp = newComposer().compose(docState('a\fb'));
  test('tenta novamente após falha técnica e entrega o PDF conferido', async () => {
    let calls = 0;
    const flaky = async (...args) => {
      calls += 1;
      if (calls < 3) throw new Error('falha transitória');
      return generatePdf(...args);
    };
    const bytes = await generateVerifiedPdf(comp, { fonts }, { attempts: 3, generate: flaky });
    expect(calls).toBe(3);
    await expect(verifyPdf(bytes, comp)).resolves.toBe(true);
  });
  test('PDF com quantidade de páginas divergente é rejeitado', async () => {
    const onePage = await generatePdf(newComposer().compose(docState('a')), { fonts });
    await expect(verifyPdf(onePage, comp)).rejects.toThrow(/página/);
    await expect(generateVerifiedPdf(comp, { fonts }, { attempts: 2, generate: async () => onePage })).rejects.toThrow();
  });
  test('a composição não é alterada pela geração', async () => {
    const before = JSON.stringify(comp.pages);
    await generatePdf(comp, { fonts });
    expect(JSON.stringify(comp.pages)).toBe(before);
  });
});
