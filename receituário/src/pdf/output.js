/** Entrega do PDF ao usuário: download e impressão. Tudo local, por URLs `blob:`. */

export function downloadPdf(bytes, fileName) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

let printFrame = null;

/**
 * Imprime o próprio PDF vetorial, para que o papel seja idêntico ao arquivo.
 * Se o navegador não permitir imprimir o PDF embutido, ele é aberto em uma nova
 * aba, de onde pode ser impresso.
 * @returns {Promise<'printed'|'opened'|'blocked'>}
 */
export function printPdf(bytes) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    if (printFrame) printFrame.remove();
    const frame = document.createElement('iframe');
    printFrame = frame;
    frame.className = 'rx-print-frame';
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    let settled = false;
    const fallback = () => {
      if (settled) return;
      settled = true;
      const opened = window.open(url, '_blank');
      resolve(opened ? 'opened' : 'blocked');
    };
    frame.onload = () => {
      // O visualizador de PDF do navegador precisa de um instante para montar o documento.
      setTimeout(() => {
        if (settled) return;
        try {
          frame.contentWindow.focus();
          frame.contentWindow.print();
          settled = true;
          resolve('printed');
        } catch {
          fallback();
        }
      }, 400);
    };
    frame.onerror = fallback;
    setTimeout(fallback, 8000);
    frame.src = url;
    document.body.append(frame);
  });
}
