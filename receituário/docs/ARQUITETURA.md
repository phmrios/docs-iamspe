# Arquitetura

## Ideia central

Existe **um documento lógico** e **um motor de composição**. Tudo o que aparece na tela ou no arquivo deriva do
resultado desse motor; nenhuma outra parte decide onde uma linha termina ou em que página ela cai.

```
            ┌────────────────────────── documento lógico (imutável) ──────────────────────────┐
            │ campos · data · prescrição (documento ProseMirror único) · assinaturas por página │
            └───────────────────────────────────────┬─────────────────────────────────────────┘
                                                    ▼
   typography/ (fontes, medição, linhas, hífens) → pagination/ (páginas) → COMPOSIÇÃO
                                                    │   itens posicionados: texto, linhas, imagens
              ┌─────────────────────────────────────┼─────────────────────────────────────┐
              ▼                                     ▼                                     ▼
   rendering/ Canvas 2D                 editor/ decorações → camada HTML        pdf/ gerador pdf-lib
   (editor e prévia)                    editável (ProseMirror)                  (exportar e imprimir)
```

## Documento lógico (`src/document`)

`RxState = { fields, date, body, signatures }`. É imutável: cada alteração cria um novo objeto e passa por um único
ponto, `App.commit()`. `body` é o documento ProseMirror; não há cópia paralela do texto. Para compor, ele é visto
como uma lista neutra de nós (`bodyNodes`), em que parágrafos inalterados mantêm a **mesma identidade de objeto**.
Essa identidade sustenta o cache de linhas e a paginação incremental.

## Motor de composição (`src/typography`, `src/pagination`)

1. **Medição** (`measure.js`): `measureText()` do Canvas é a referência, sempre depois de as fontes carregarem.
   Na inicialização as medidas são comparadas com as tabelas de avanço das próprias fontes; divergência vira aviso
   técnico. Nos testes fora do navegador usa-se o medidor baseado nessas tabelas.
2. **Fonte por caractere** (`fonts.js`): cobertura extraída dos arquivos TTF em tempo de build. Cada grafema usa a
   Liberation Mono; se ela não tiver o glifo, a DejaVu Sans Mono; se nenhuma tiver, o caractere é marcado como
   `missing`, gera aviso e nunca é trocado por outro.
3. **Linhas** (`linebreak.js`): quebra nos espaços (que ficam pendentes no fim da linha), hifenização visual,
   palavra inteira para a linha seguinte, divisão forçada de sequências maiores que a linha, tabulações a cada dois
   caracteres. O resultado guarda deslocamentos no texto original; o texto não é alterado.
4. **Hifenização** (`hyphenation.js`): padrões de português (pacote `hyphen`), mínimo de 2 letras antes e 3 depois.
   Termos do dicionário médico, siglas e sequências com algarismos nunca são divididos.
5. **Paginação** (`paginate.js`): prioridades — quebra manual; linhas vazias preservadas; bloco inteiro na mesma
   folha; parágrafo inteiro na mesma folha; parágrafos maiores que a folha divididos sem órfãs/viúvas.
   É **incremental**: reaproveita tudo antes da primeira unidade alterada e para quando a distribuição volta a
   coincidir com a anterior (`recomputed` informa quantos nós foram recalculados).
6. **Composição** (`compose.js`): posiciona título, rótulos, campos, linha divisória, prescrição, rodapé, data,
   numeração e assinaturas. Devolve páginas com itens (`text`, `line`, `image`) em px lógicos fracionários
   (96/pol). A conversão para pontos só acontece no PDF.

A opção `editing` muda apenas a geometria de **campos vazios** (espaço dos textos indicativos e o prefixo `CRM-`).
A paginação é a mesma nos dois modos, e isso é conferido antes de cada exportação.

### Geometria (mm)

| Elemento | Valor |
| --- | --- |
| Página | A4 retrato, margens de 20 |
| Título | Liberation Mono Bold 14 pt, centralizado; 10 abaixo vem o paciente |
| Paciente | 11 pt; linha divisória 5 abaixo; prescrição 5 abaixo da linha |
| Prescrição | 11 pt, entrelinha 1,5 (16,5 pt), 6 pt entre parágrafos |
| Faixa de segurança | 10 entre prescrição e rodapé |
| Rodapé | 45: assinatura (20) · linha de 80 · 5 · nome · CRM · local (entrelinha 1,0) · data e numeração na última linha |

Com nome de paciente em uma linha cabem 29 linhas de prescrição por página.

## Camada HTML sincronizada (`src/editor`)

A prescrição é **um único `EditorView` do ProseMirror** estendido sobre todas as folhas. Os parágrafos usam
`white-space: pre`, de modo que o navegador nunca quebra linhas por conta própria. `decorations.js` traduz a
composição em decorações:

- margem superior de cada parágrafo = posição calculada (inclui o salto de uma folha para a outra);
- quebra visual: classe no último grafema da linha, com a quebra em um pseudo-elemento CSS (`::after { content: "\A" }`),
  mais o hífen quando houver;
- salto de página dentro de um parágrafo: bloco `::before` com a altura exata;
- largura explícita de cada tabulação; fonte alternativa em `span` com `line-height: 0` para não alterar a entrelinha.

Nada é inserido no documento nem no DOM de texto. Por isso cursor, seleção, colagem e corretor ortográfico operam
sobre o texto lógico, e a posição do cursor sobrevive a qualquer repaginação.

Os campos administrativos são pequenos editores ProseMirror (um por campo e por página) que usam o mesmo
mecanismo e refletem o mesmo valor do documento central.

## Canvas (`src/rendering`, `src/ui/pages-view.js`)

Um `<canvas>` por página, redesenhado por completo após cada alteração, em `requestAnimationFrame`, na thread
principal. No editor o Canvas desenha tudo, **menos** o texto editável (mostrado pela camada HTML, para não haver
duplicidade); na prévia desenha tudo. A resolução é `zoom × devicePixelRatio`; folhas longe da área visível são
desenhadas em resolução menor para conter memória e ganham nitidez total ao se aproximarem.

## PDF e impressão (`src/pdf`)

`generatePdf()` percorre os itens da composição final e os desenha com pdf-lib: texto real com fontes em
subconjunto, linhas vetoriais, assinatura como imagem PNG. Não há paginação nem quebra de linha nesse módulo.
O hífen visual é desenhado dentro de um trecho com `ActualText` vazio. `generateVerifiedPdf()` reabre o arquivo,
confere páginas, formato e ausência de formulários, e tenta de novo em caso de falha; se não conseguir, mostra erro
e não entrega arquivo. A impressão envia esse mesmo PDF a um `iframe` oculto e chama `print()`; se o navegador
recusar, o PDF é aberto em outra aba.

## Histórico (`src/history`)

Instantâneos do documento lógico com a seleção. Digitação contínua é agrupada (mesma chave, pausa menor que
700 ms); colagem, exclusão extensa, quebra manual, blocos, assinaturas, data e troca de campo abrem entrada
própria. Limite por quantidade e por memória estimada. Só existe em memória.

## Blocos de texto

Blocos são grupos de parágrafos separados por linha vazia. A paginação tenta manter cada bloco em uma única
folha. **Dividir bloco** marca o parágrafo do cursor como início de bloco; **Unir blocos** remove essa marca ou
faz as linhas vazias intermediárias deixarem de separar. Só atributos mudam; o texto fica igual.

## Privacidade

Sem rede (CSP `default-src 'none'`, `connect-src 'none'`), sem `localStorage`, `sessionStorage`, IndexedDB,
cookies, Web Workers ou OffscreenCanvas. `scripts/validation/audit-offline.mjs` verifica o HTML final.

## Build

`scripts/build/build.mjs`: o esbuild reúne `src/main.js` e dependências em um único script; o empacotamento
insere CSS, as três fontes (base64) e o script no modelo `src/ui/index.html`, gerando `dist/receituario.html`.
As fontes são registradas em tempo de execução com `FontFace` a partir dos bytes incorporados, e esses mesmos
bytes vão para o PDF.

## Decisões em pontos que o PRD deixou abertos

- **Entrelinha "simples (1,0)"** do rodapé: 1,0 × 11 pt, na mesma convenção do 1,5 da prescrição.
- **Blocos**: usados como unidade de paginação (manter junto).
- **Nome de paciente longo**: ocupa mais linhas e reduz a área da prescrição em todas as páginas.
- **CRM**: `CRM-UF número`; só número → `CRM número`; só UF → `CRM-UF`; ambos vazios → linha omitida.
- **Data**: clicar na data abre um seletor; o valor continua sendo composto e desenhado como o resto.
- **Nova receita**: `Ctrl/⌘+Shift+N` é reservado por alguns navegadores (janela anônima); há o alternativo `Alt+Shift+N`.
- **Colagem**: texto externo entra pelo formato texto simples (uma linha → um parágrafo); soft hyphens e
  caracteres invisíveis são removidos, espaço rígido vira espaço comum.
