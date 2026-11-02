import { PDFDocument, PDFName, PDFString, PDFOperator, rgb, degrees } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { pxToPt } from '../utils/units.js';
import { pdfImageOrigin } from '../signature/geometry.js';

export const PDF_PRODUCER = 'Receituário Médico HTML 1.0';

function parseColor(hex) {
  const value = /^#([0-9a-f]{6})$/i.exec(hex || '');
  if (!value) return rgb(0, 0, 0);
  const n = parseInt(value[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/**
 * Gera o PDF vetorial a partir do resultado de composição.
 *
 * Não há paginação nem quebra de linha aqui: cada elemento é desenhado na posição
 * já calculada, apenas convertida de px lógicos para pontos. O texto é texto real
 * (selecionável e pesquisável), com as fontes incorporadas em subconjunto.
 *
 * @param {Object} composition  composição final (`editing: false`)
 * @param {Object} resources
 * @param {{regular: Uint8Array, bold: Uint8Array, fallback: Uint8Array}} resources.fonts
 * @param {(id: string, variant: string) => Uint8Array|undefined} [resources.image]  bytes PNG da assinatura
 * @param {Date} [resources.now]
 * @returns {Promise<Uint8Array>}
 */
export async function generatePdf(composition, { fonts, image, now = new Date() }) {
  const pdf = await PDFDocument.create({ updateMetadata: false });
  pdf.registerFontkit(fontkit);
  // Metadados técnicos mínimos: nada de nome de paciente, médico ou conteúdo clínico.
  pdf.setProducer(PDF_PRODUCER);
  pdf.setCreator(PDF_PRODUCER);
  pdf.setCreationDate(now);
  pdf.setModificationDate(now);
  pdf.setLanguage('pt-BR');

  const embeddedFonts = new Map();
  const fontFor = async (key) => {
    const fontKey = key === 'missing' ? 'fallback' : key;
    let font = embeddedFonts.get(fontKey);
    if (!font) {
      if (!fonts[fontKey]) throw new Error(`Fonte não disponível para o PDF: ${fontKey}`);
      font = await pdf.embedFont(fonts[fontKey], { subset: true });
      embeddedFonts.set(fontKey, font);
    }
    return font;
  };
  const embeddedImages = new Map();
  const imageFor = async (id, variant) => {
    const key = `${id}:${variant}`;
    let embedded = embeddedImages.get(key);
    if (!embedded) {
      const bytes = image ? image(id, variant) : undefined;
      if (!bytes) throw new Error('Imagem de assinatura indisponível.');
      embedded = await pdf.embedPng(bytes);
      embeddedImages.set(key, embedded);
    }
    return embedded;
  };

  const width = pxToPt(composition.page.width);
  const height = pxToPt(composition.page.height);
  // O hífen visual de fim de linha é desenhado, mas marcado com texto equivalente
  // vazio (ActualText): na extração, a palavra original não ganha um hífen que o
  // usuário não digitou. Leitores que ignoram a marcação apenas mostram o "-".
  const visualHyphen = pdf.context.obj({ ActualText: PDFString.of('') });

  for (const source of composition.pages) {
    const page = pdf.addPage([width, height]);
    for (const item of source.items) {
      if (item.type === 'text') {
        const font = await fontFor(item.font);
        const options = {
          x: pxToPt(item.x),
          y: height - pxToPt(item.y),
          size: pxToPt(item.size),
          font,
          color: parseColor(item.color),
        };
        if (item.role === 'hyphen') {
          page.pushOperators(PDFOperator.of('BDC', [PDFName.of('Span'), visualHyphen]));
          page.drawText(item.text, options);
          page.pushOperators(PDFOperator.of('EMC'));
        } else {
          page.drawText(item.text, options);
        }
      } else if (item.type === 'line') {
        page.drawLine({
          start: { x: pxToPt(item.x1), y: height - pxToPt(item.y1) },
          end: { x: pxToPt(item.x2), y: height - pxToPt(item.y2) },
          thickness: pxToPt(item.thickness),
          color: parseColor(item.color),
        });
      } else if (item.type === 'image') {
        const embedded = await imageFor(item.id, item.variant);
        // Tela: rotação horária, y para baixo. PDF: anti-horária, y para cima.
        const box = {
          cx: pxToPt(item.cx),
          cy: height - pxToPt(item.cy),
          width: pxToPt(item.width),
          height: pxToPt(item.height),
          rotation: -item.rotation,
        };
        const origin = pdfImageOrigin(box);
        page.drawImage(embedded, { x: origin.x, y: origin.y, width: box.width, height: box.height, rotate: degrees(box.rotation) });
      }
    }
  }
  return pdf.save();
}

/**
 * Confere o arquivo gerado antes de entregá-lo: precisa reabrir, ter a quantidade
 * de páginas da composição e o formato A4. Um PDF incompleto nunca é entregue.
 */
export async function verifyPdf(bytes, composition) {
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  const pages = pdf.getPages();
  if (pages.length !== composition.pageCount) {
    throw new Error(`PDF com ${pages.length} página(s); esperado: ${composition.pageCount}.`);
  }
  const width = pxToPt(composition.page.width);
  const height = pxToPt(composition.page.height);
  for (const page of pages) {
    const size = page.getSize();
    if (Math.abs(size.width - width) > 0.01 || Math.abs(size.height - height) > 0.01) {
      throw new Error('PDF com página fora do formato A4.');
    }
  }
  if (pdf.getForm().getFields().length) throw new Error('PDF contém campos de formulário.');
  return true;
}

/**
 * Gera e confere o PDF, tentando novamente em caso de falha técnica.
 * Os dados do documento não são alterados por nenhuma tentativa.
 */
export async function generateVerifiedPdf(composition, resources, { attempts = 3, generate = generatePdf } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const bytes = await generate(composition, resources);
      await verifyPdf(bytes, composition);
      return bytes;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}
