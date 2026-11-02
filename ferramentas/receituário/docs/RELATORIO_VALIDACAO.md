# Relatório de validação

Versão 1.0, validada em 13/10/2026.
Ambiente: macOS 15.7.7, Node.js 26.0.0, Playwright 1.64.0 (Chromium 156.0, Firefox 157.0, WebKit 27.2), poppler.

Para reproduzir: `npm run validate` e `npm run validate:pdf`.

## Resultado

| Etapa | Comando | Resultado |
| --- | --- | --- |
| Build | `npm run build` | `dist/receituario.html`, 2,62 MB, arquivo único |
| Auditoria offline | `npm run audit:offline` | 23 verificações, sem pendências |
| Unitários e integração | `npm test` | 149 de 149 aprovados (9 arquivos) |
| Interface, Chromium | `playwright --project=chromium` | 40 de 40 aprovados |
| Interface, Firefox | `playwright --project=firefox` | 39 aprovados, 1 não se aplica |
| Interface, WebKit | `playwright --project=webkit` | 39 aprovados, 1 não se aplica |
| Visuais e fidelidade | `npm run test:visual` | 6 de 6 aprovados |
| PDF por ferramenta externa | `npm run validate:pdf` | 3 amostras: páginas, A4, fontes e texto conferem |

O teste que não se aplica a Firefox e WebKit é o do diálogo de confirmação ao fechar a página, que a automação só
consegue observar no Chromium. O código é o mesmo nos três.

A suíte de interface foi repetida 3 vezes seguidas nos três motores (354 execuções aprovadas, 6 não se aplicam).

Não há defeito crítico ou bloqueador conhecido.

## Critérios de aceitação

| Critério | Situação | Evidência |
| --- | --- | --- |
| CA-01 Inicialização offline | Atendido | Abre por `file://` com a rede bloqueada; zero requisições externas, zero erros, nos 3 motores |
| CA-02 Edição sobre a folha | Atendido | `editor.spec.js`: campos e prescrição preenchidos na página; não há formulário lateral |
| CA-03 Paginação automática | Atendido | Páginas criadas e removidas conforme o texto; contagem de linhas conservada |
| CA-04 Cursor | Atendido | Inserção e exclusão no meio de várias páginas mantêm a posição lógica e o foco |
| CA-05 Histórico | Atendido | Desfazer/refazer de texto, campos, quebras, blocos, data e assinaturas |
| CA-06 Tipografia | Atendido | Liberation Mono 11 pt, entrelinha 22 px (1,5), 8 px (6 pt) entre parágrafos, medidos no DOM |
| CA-07 Layout | Atendido | `compose.test.js`: margens de 20 mm, rodapé de 45 mm, faixa de 10 mm |
| CA-08 Assinatura | Atendido | Inserir, mover, redimensionar, girar, substituir, restaurar e remover, nos 3 motores |
| CA-09 Prévia | Atendido | Sem elementos de edição; composição final; zoom independente; fecha por botão, Esc e clique fora |
| CA-10 PDF | Atendido | Texto real, fontes incorporadas em subconjunto, A4, sem formulário, sem rasterização de página |
| CA-11 Integridade | Atendido | Texto extraído do PDF reproduz a sequência original, distinguindo quebra visual de quebra digitada |
| CA-12 Impressão | Atendido em parte | O PDF vetorial é o que vai para a impressão; o diálogo do sistema e o papel não foram conferidos |
| CA-13 Privacidade | Atendido | CSP sem conexões; armazenamento do navegador vazio após o uso; auditoria do código |
| CA-14 Nova receita | Atendido | Confirmação, cancelamento e limpeza completa (campos, páginas, assinaturas, histórico, data) |
| CA-15 Compatibilidade | Atendido em parte | Chromium, Firefox e WebKit automatizados; Safari, Edge e Chrome reais não foram abertos |

## Fidelidade entre editor, prévia e PDF

- **Camada HTML × composição**: a posição de cada linha no DOM é comparada com a calculada. Em um documento de
  3 páginas a 125%, o maior desvio medido foi 0,02 px (Chromium, Firefox e WebKit). Os testes exigem menos de
  1 px a 75%, 100% e 120%, e menos de 1,5 px no ajuste à largura (162%).
- **Editor × prévia**: captura do editor comparada pixel a pixel com o Canvas final; menos de 3% da tinta fica a
  mais de 1 px de distância (o resíduo é a diferença de suavização entre texto DOM e texto Canvas).
- **Composição × PDF**: todos os itens de texto de um documento de 30 itens aparecem no PDF na posição
  calculada, com tolerância de 0,1 pt.
- **Editor × PDF**: a primeira linha de cada página, medida na tela, coincide com a do PDF exportado (menos de
  0,8 pt na vertical).

## Desempenho

Documento de 23 páginas (339 parágrafos), digitação no meio do texto:

| Motor | Tempo por tecla (mediana / máximo) | Colagem das 23 páginas |
| --- | --- | --- |
| Chromium | 8,2 ms / 13,2 ms | 70 ms |
| Firefox | 9,0 ms / 15,0 ms | 108 ms |
| WebKit | 8,0 ms / 14,0 ms | 111 ms |

Em cada tecla a paginação recalculou 1 nó de 339. Não há limite de páginas definido; o custo cresce de forma
linear com o tamanho do documento.

## O que não foi validado

1. **Safari, Edge e Chrome reais, Windows e Linux.** Só os motores do Playwright, no macOS. O WebKit do
   Playwright não é o Safari.
2. **Impressão em papel.** Os testes confirmam que o PDF é entregue ao `iframe` de impressão. Diálogo do
   sistema, escala e margens físicas não foram conferidos. Firefox e Safari podem recusar a impressão do PDF
   embutido; nesse caso o PDF abre em outra aba.
3. **Assinatura digital posterior.** O PDF é um arquivo comum, sem formulários nem criptografia, mas não foi
   assinado em nenhuma ferramenta ICP-Brasil.
4. **Conformidade normativa.** O modelo se inspira no receituário simples do CFM; requisitos legais e sanitários
   vigentes não foram verificados (PRD 24.1).
5. **Colagem pela área de transferência real.** Os testes disparam o evento de colagem com os dados; o caminho
   do sistema operacional não é exercitado pela automação.
6. **Corretor ortográfico.** A camada de edição declara `spellcheck` e `lang="pt-BR"`; a marcação depende do
   navegador e do sistema.
7. **Métricas em Windows e Linux.** A medição é conferida contra as tabelas das fontes na inicialização (aviso
   técnico se divergir), mas só foi observada no macOS.

## Limitações conhecidas

- **Caracteres sem glifo** nas duas fontes incorporadas (emojis, por exemplo) aparecem na tela com a fonte do
  sistema e, no PDF, como um quadro vazio. O aplicativo avisa antes de exportar e lista os caracteres.
- **Hífen visual no PDF**: marcado com `ActualText` vazio. O poppler extrai a palavra sem hífen; leitores que
  ignoram a marcação (pdf.js) mostram o hífen no fim da linha.
- **Fim de linha**: um clique à direita de uma linha quebrada posiciona o cursor conforme o navegador; a posição
  lógica é sempre a correta.
- **Setas logo após digitar**: o ProseMirror ignora mudanças de seleção nos 50 ms seguintes a um caractere
  digitado (proteção contra um defeito do Chrome). Só a automação alcança esse intervalo; os testes aguardam.
- **Espaços no fim de uma linha quebrada** ficam pendentes além da margem direita, sem tinta.
- **Local de atendimento** com mais de duas linhas pode encostar na data ou na numeração; há aviso técnico e o
  texto nunca é cortado.
- **Blocos** maiores que uma folha voltam à regra por parágrafo.
- **Histórico**: até 1000 entradas ou cerca de 48 MB estimados.
- O objeto `window.__rx` fica exposto para os testes automatizados.

## Riscos do PRD

| Risco | Como foi tratado |
| --- | --- |
| 21.1 Sincronização Canvas × ProseMirror | Um só texto; quebras impostas por decorações; teste de desvio por linha |
| 21.2 Diferenças tipográficas entre navegadores | Fontes incorporadas; tolerância de encaixe de 0,5 px; conferência das medidas na inicialização |
| 21.3 Paginação durante a edição | Decorações não tocam o DOM de texto; testes de cursor entre páginas |
| 21.4 Renderização completa | `requestAnimationFrame`; resolução adaptativa; medição com 23 páginas |
| 21.5 Hifenização | Dicionário médico com 476 entradas protegidas; hífen fora do texto lógico; testes de extração |
| 21.6 PDF vetorial | Mesma composição do Canvas; testes de geometria, fontes e extração |
| 21.7 Distribuição offline | Auditoria do HTML final; testes com rede bloqueada |
| 21.8 Assinaturas | Limites geométricos em toda operação; teste de páginas eliminadas com desfazer |
