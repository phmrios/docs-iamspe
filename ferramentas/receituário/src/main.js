import { App } from './ui/app.js';
import { loadEmbeddedFonts } from './ui/font-loader.js';
import { createCanvasMeasurer } from './typography/measure.js';

async function start() {
  const status = document.getElementById('rx-loading');
  try {
    const fonts = await loadEmbeddedFonts(window.__RX_FONTS__);
    delete window.__RX_FONTS__;
    const app = new App({ fonts, measurer: createCanvasMeasurer() });
    app.mount();
    // Ponto de inspeção para os testes automatizados; não é usado pela aplicação.
    window.__rx = app;
    status.remove();
    document.documentElement.dataset.ready = 'true';
  } catch (error) {
    console.error(error);
    status.textContent = 'Não foi possível iniciar o editor neste navegador. Use uma versão atual do Chrome, Firefox, Safari ou Edge.';
    status.classList.add('rx-loading-error');
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
