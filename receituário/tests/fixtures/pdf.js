// Leitura de PDFs nos testes: texto por página (pdf.js) e estrutura (pdf-lib).
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFDocument, PDFName, PDFDict, PDFRawStream, PDFArray } from 'pdf-lib';

/**
 * Extrai os trechos de texto de cada página, com posição (pontos, origem no canto
 * inferior esquerdo) e nome da fonte.
 */
export async function extractPdf(bytes) {
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, disableFontFace: true, verbosity: 0 });
  const pdf = await task.promise;
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent({ includeMarkedContent: false, disableNormalization: true });
    const ops = await page.getOperatorList();
    // O pdf.js devolve palavras e espaços separados: trechos contíguos na mesma
    // linha de base e com a mesma fonte são reunidos.
    const items = [];
    for (const raw of content.items) {
      if (raw.str === undefined || raw.str === '') continue;
      const item = { text: raw.str, x: raw.transform[4], y: raw.transform[5], width: raw.width, size: Math.abs(raw.transform[3]), font: raw.fontName };
      const last = items[items.length - 1];
      if (last && last.font === item.font && Math.abs(last.y - item.y) < 0.01 && Math.abs(last.x + last.width - item.x) < 0.5) {
        last.text += item.text;
        last.width = item.x + item.width - last.x;
      } else {
        items.push(item);
      }
    }
    pages.push({ width: viewport.width, height: viewport.height, items, operators: ops.fnArray.length });
  }
  const meta = await pdf.getMetadata();
  await task.destroy();
  return { pages, info: meta.info };
}

/**
 * Reconstrói o texto de uma região da página, linha a linha (de cima para baixo).
 * O hífen visual de fim de linha é marcado no PDF com ActualText vazio; o pdf.js
 * não interpreta essa marcação e devolve "-", que os testes descontam pela
 * informação de composição (linha com hífen visual).
 */
export function linesOf(page, { top = Infinity, bottom = -Infinity } = {}) {
  const rows = new Map();
  for (const item of page.items) {
    if (item.y > top || item.y < bottom) continue;
    const key = Math.round(item.y * 10) / 10;
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push(item);
  }
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([y, items]) => ({ y, items: items.sort((a, b) => a.x - b.x) }));
}

/** Informações estruturais: fontes incorporadas, imagens, formulários, anotações. */
export async function inspectPdf(bytes) {
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  const fonts = new Map();
  let images = 0;
  let annotations = 0;
  let pageImageArea = 0;
  for (const page of pdf.getPages()) {
    const resources = page.node.Resources();
    const fontDict = resources && resources.lookupMaybe(PDFName.of('Font'), PDFDict);
    if (fontDict) {
      for (const [, ref] of fontDict.entries()) {
        const font = pdf.context.lookup(ref, PDFDict);
        const base = font.lookup(PDFName.of('BaseFont')).decodeText();
        const descendants = font.lookupMaybe(PDFName.of('DescendantFonts'), PDFArray);
        let embedded = false;
        let fileSize = 0;
        if (descendants) {
          const cid = pdf.context.lookup(descendants.get(0), PDFDict);
          const descriptor = cid.lookup(PDFName.of('FontDescriptor'), PDFDict);
          const file = descriptor.lookupMaybe(PDFName.of('FontFile2'), PDFRawStream) || descriptor.lookupMaybe(PDFName.of('FontFile3'), PDFRawStream);
          embedded = Boolean(file);
          fileSize = file ? file.contents.length : 0;
        }
        fonts.set(base, { embedded, toUnicode: font.has(PDFName.of('ToUnicode')), fileSize });
      }
    }
    const xobjects = resources && resources.lookupMaybe(PDFName.of('XObject'), PDFDict);
    if (xobjects) {
      for (const [, ref] of xobjects.entries()) {
        const stream = pdf.context.lookup(ref);
        if (stream.dict.lookup(PDFName.of('Subtype')) === PDFName.of('Image')) {
          images += 1;
          pageImageArea = Math.max(pageImageArea, stream.dict.lookup(PDFName.of('Width')).asNumber() * stream.dict.lookup(PDFName.of('Height')).asNumber());
        }
      }
    }
    const annots = page.node.Annots();
    if (annots) annotations += annots.size();
  }
  return {
    pageCount: pdf.getPageCount(),
    sizes: pdf.getPages().map((p) => p.getSize()),
    fonts,
    images,
    largestImagePixels: pageImageArea,
    annotations,
    formFields: pdf.getForm().getFields().length,
    title: pdf.getTitle(),
    author: pdf.getAuthor(),
    subject: pdf.getSubject(),
    keywords: pdf.getKeywords(),
    producer: pdf.getProducer(),
  };
}
