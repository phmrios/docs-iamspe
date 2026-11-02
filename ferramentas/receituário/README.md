# Receituário Médico HTML

Editor offline de receituários médicos simples: edição direta sobre folhas A4, paginação automática e PDF vetorial.
Implementa o PRD versão 1.0 (`chatgpt.com-Análise do receituário PDF.pdf`).

## Usar

Abra **`dist/receituario.html`** no navegador (duplo clique). Não precisa de servidor, instalação nem internet.
O arquivo é autossuficiente: código, fontes e dicionário médico estão dentro dele.

- Clique nos campos da folha e digite. `Enter` cria parágrafo, `Shift+Enter` quebra a linha, `Tab` insere tabulação.
- `Ctrl/⌘+Enter` insere quebra de página manual. O botão **?** lista todos os atalhos.
- **Exportar PDF** gera `Receituario_Nome_Sobrenome_DD-MM-AAAA.pdf`; **Imprimir** imprime esse mesmo PDF.
- Nada é gravado: ao fechar ou recarregar a página, o conteúdo é descartado (o navegador pede confirmação).

A imagem PNG de assinatura é só uma imagem. Ela não equivale a uma assinatura digital; o PDF pode ser
assinado depois em uma ferramenta externa. A conformidade normativa do documento deve ser verificada à parte.

## Desenvolver

Requisitos: Node.js 20 ou mais recente.

```bash
npm ci                      # dependências nas versões do package-lock.json
npx playwright install      # navegadores dos testes de interface (uma vez)

npm run build               # gera dist/receituario.html
npm run dev                 # recompila a cada alteração (sem minificar)
npm run fonts               # regenera assets/fonts/metrics.json (só se as fontes mudarem)
```

## Testar

```bash
npm test                    # unitários + integração (Vitest)
npm run test:e2e            # interface em Chromium, Firefox e WebKit (Playwright)
npm run test:visual         # comparação com as capturas de referência
npm run audit:offline       # auditoria do HTML final (rede, armazenamento, recursos externos)
npm run validate:pdf        # PDFs de amostra em validacao/, conferidos com poppler se instalado
npm run validate            # tudo acima, em sequência, a partir de um build novo
```

Os testes de interface abrem `dist/receituario.html` por `file://` com a rede bloqueada; rode `npm run build` antes.
Para aprovar novas capturas de referência: `npx playwright test --project=visual --update-snapshots`.

## Organização

```
src/
  document/     documento lógico central, blocos de texto
  editor/       ProseMirror: esquema, comandos, colagem, decorações (sincronização com a composição)
  typography/   fontes, medição, quebra de linhas, hifenização, dicionário médico
  pagination/   geometria da página, paginação incremental, motor de composição
  rendering/    renderizador Canvas 2D
  pdf/          gerador pdf-lib, nome do arquivo, download e impressão
  signature/    geometria, remoção de fundo, imagens e controles de assinatura
  history/      desfazer/refazer
  validation/   avisos funcionais e técnicos
  ui/           aplicação, páginas, prévia, diálogos, HTML e CSS
  utils/        unidades, datas, texto
tests/          unit/ integration/ e2e/ visual/ fixtures/
assets/         fonts/ (Liberation Mono, DejaVu Sans Mono, métricas) e dictionaries/
scripts/        build/ e validation/
docs/           ARQUITETURA.md e RELATORIO_VALIDACAO.md
```

Arquitetura em `docs/ARQUITETURA.md`; resultados e limitações em `docs/RELATORIO_VALIDACAO.md`.

## Licenças de terceiros

Liberation Mono (SIL OFL 1.1) e DejaVu Sans Mono (licença Bitstream Vera/DejaVu): ver `assets/fonts/LICENSE-*.txt`.
ProseMirror, pdf-lib, @pdf-lib/fontkit e hyphen: licença MIT.
