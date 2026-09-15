# PRD | Docs IAMSPE

## 1. Visão geral

**Nome do produto:** Docs IAMSPE
**Responsável:** Dr. Pedro Rios
**Tipo de produto:** Biblioteca pública de documentos em PDF
**Plataforma de hospedagem:** GitHub Pages
**Versão do PRD:** 1.0

O Docs IAMSPE será um site estático, público e minimalista destinado à disponibilização de arquivos PDF para consulta e download.

O site funcionará como uma biblioteca simples. Os documentos serão exibidos em ordem alfabética pelo nome do arquivo. O usuário poderá pesquisar documentos pelo nome e abrir qualquer PDF diretamente no navegador.

A administração deverá exigir o mínimo possível de trabalho. Para publicar um documento, o administrador deverá adicionar o arquivo PDF à pasta destinada aos documentos no repositório e rodar localmente um script simples antes do commit.

---

# 2. Objetivo do produto

Criar uma biblioteca pública de PDFs que seja:

- simples;
- rápida;
- fácil de navegar;
- fácil de pesquisar;
- fácil de manter;
- compatível com GitHub Pages;
- acessível por qualquer pessoa que possua o endereço do site.

O principal objetivo operacional é reduzir ao mínimo o trabalho necessário para adicionar novos arquivos.

## Fluxo administrativo ideal

```text
Adicionar PDF à pasta pdfs/ localmente
        ↓
Rodar script de indexação localmente
        ↓
Lista de PDFs (files.json) é reconstruída
        ↓
Commit + push para a branch main
        ↓
GitHub Pages publica a branch (Deploy from a branch)
        ↓
Novo PDF aparece automaticamente na biblioteca
```

Nenhuma edição manual da página ou de arquivo de configuração deverá ser necessária após a inclusão de um PDF. O único passo manual é rodar o script de indexação antes do commit.

---

# 3. Público-alvo

O site será acessível a qualquer pessoa que possua o link.

Não haverá:

- autenticação;
- cadastro;
- login;
- controle de permissões;
- diferenciação entre tipos de usuário;
- conteúdo privado.

Todos os PDFs publicados no repositório destinado ao site serão considerados públicos.

---

# 4. Escopo do MVP

O MVP deverá possuir cinco funcionalidades centrais:

1. exibição da biblioteca de PDFs;
2. ordenação alfabética automática;
3. pesquisa instantânea pelo nome;
4. abertura do PDF diretamente no navegador;
5. atualização automática da biblioteca após inclusão ou remoção de arquivos.

---

# 5. Estrutura da página

O produto terá inicialmente apenas uma página principal.

## 5.1 Cabeçalho

O topo da página deverá apresentar:

```text
Docs IAMSPE
Dr. Pedro Rios
```

Não haverá descrição adicional.

O título deverá possuir maior destaque visual.

O nome "Dr. Pedro Rios" deverá aparecer de forma secundária e discreta.

---

# 6. Biblioteca de documentos

A biblioteca será o componente principal da interface.

Cada documento deverá aparecer como uma linha individual.

Exemplo:

```text
Docs IAMSPE

Dr. Pedro Rios

[ Pesquisar documentos...                     ]

42 PDFs disponíveis

Abdome Agudo.pdf
Acidose Metabólica.pdf
Anemia Hemolítica.pdf
Antibioticoterapia.pdf
Arritmias.pdf
Choque Séptico.pdf
Cirrose Hepática.pdf
Distúrbios do Sódio.pdf
...
```

Não deverão existir cards ou tabelas complexas.

Cada entrada deverá mostrar apenas o nome do arquivo.

Não deverão ser exibidos:

- descrição;
- tamanho;
- data;
- autor;
- categoria;
- tags;
- miniatura;
- extensão como informação separada.

---

# 7. Comportamento dos documentos

O nome do arquivo será o elemento clicável.

Ao clicar:

```text
Nome do PDF
     ↓
abre o próprio arquivo PDF
     ↓
nova aba do navegador
```

O navegador será responsável pela visualização e eventual download.

Não haverá página intermediária para cada documento.

Não haverá botão separado de download.

Preferencialmente:

```html
target="_blank"
```

e

```html
rel="noopener noreferrer"
```

deverão ser utilizados nos links.

---

# 8. Ordenação

Os documentos deverão aparecer automaticamente em ordem alfabética crescente.

Exemplo:

```text
A
B
C
D
...
Z
```

A ordenação não deverá depender da ordem física dos arquivos no repositório.

A comparação deve ser case-insensitive.

Idealmente, a ordenação deverá respeitar locale `pt-BR`.

Exemplo conceitual:

```javascript
files.sort((a, b) =>
  a.localeCompare(b, "pt-BR", {
    sensitivity: "base",
  }),
);
```

---

# 9. Pesquisa

A página deverá possuir uma barra de pesquisa imediatamente acima da biblioteca.

Placeholder recomendado:

```text
Pesquisar documentos...
```

A filtragem deverá acontecer em tempo real conforme o usuário digita.

Não deverá haver botão "Pesquisar".

Exemplo:

```text
Pesquisa:
"choque"

Resultados:
Choque Cardiogênico.pdf
Choque Hipovolêmico.pdf
Choque Séptico.pdf
```

A pesquisa deverá:

- ignorar maiúsculas e minúsculas;
- localizar correspondências parciais;
- responder imediatamente;
- funcionar inteiramente no navegador;
- não depender de servidor ou API.

---

# 10. Normalização da pesquisa

É recomendável que a busca também ignore acentos.

Assim:

```text
cirrose
```

poderá localizar:

```text
Cirrose Hepática.pdf
```

e:

```text
hiponatremia
```

deverá funcionar independentemente da capitalização utilizada no nome físico do documento.

Função conceitual:

```javascript
function normalizeText(text) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
```

---

# 11. Contador de documentos

Acima da lista deverá existir um indicador com o total de PDFs publicados.

Exemplo:

```text
42 PDFs disponíveis
```

O contador deverá ser calculado automaticamente a partir da lista de documentos.

Após uma pesquisa, recomenda-se modificar a informação para algo como:

```text
4 de 42 PDFs
```

Isso torna claro que existe um filtro ativo.

---

# 12. Estado sem resultados

Caso nenhum documento corresponda à pesquisa:

```text
Nenhum documento encontrado.
```

Não deverá existir uma tela de erro.

---

# 13. Design

## Direção visual

O estilo deverá ser:

- minimalista;
- limpo;
- funcional;
- predominantemente tipográfico;
- sem elementos decorativos desnecessários.

Referências conceituais:

```text
documentação
biblioteca
index
finder
lista de arquivos
```

O site não deverá parecer um portal institucional complexo.

---

# 14. Paleta visual

O MVP utilizará exclusivamente modo claro.

Estrutura conceitual:

```text
Background        branco ou quase branco
Texto principal   preto / cinza muito escuro
Texto secundário  cinza
Bordas             cinza claro
Hover              cinza muito claro
Links              cor de destaque discreta
```

Não haverá dark mode.

---

# 15. Tipografia

Deve-se priorizar fontes nativas do sistema para evitar dependências externas.

Stack recomendada:

```css
font-family:
  -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial,
  sans-serif;
```

Benefícios:

- carregamento imediato;
- aparência nativa no macOS e iOS;
- ausência de dependência de Google Fonts;
- menor quantidade de requisições;
- melhor performance.

---

# 16. Layout

O conteúdo deve permanecer centralizado.

Desktop recomendado:

```text
largura máxima:
800 a 1000 px
```

Exemplo conceitual:

```text
┌───────────────────────────────────────────────┐
│                                               │
│ Docs IAMSPE                                   │
│ Dr. Pedro Rios                                │
│                                               │
│ ┌───────────────────────────────────────────┐ │
│ │ Pesquisar documentos...                  │ │
│ └───────────────────────────────────────────┘ │
│                                               │
│ 42 PDFs disponíveis                           │
│                                               │
│ Abdome Agudo.pdf                              │
│ Acidose Metabólica.pdf                        │
│ Anemia Hemolítica.pdf                         │
│ Antibioticoterapia.pdf                        │
│ Arritmias.pdf                                 │
│ ...                                           │
│                                               │
└───────────────────────────────────────────────┘
```

---

# 17. Responsividade

Prioridade:

```text
Desktop > Mobile
```

Entretanto, o site deverá funcionar corretamente em smartphones.

No mobile:

- conteúdo ocupa quase toda a largura;
- margens laterais reduzidas;
- barra de pesquisa ocupa 100%;
- nomes longos devem quebrar corretamente;
- não deverá existir rolagem horizontal;
- área clicável dos links deve permanecer confortável.

Breakpoint inicial sugerido:

```css
@media (max-width: 600px);
```

---

# 18. Rodapé

O site não possuirá rodapé.

A identificação do responsável aparecerá no cabeçalho.

---

# 19. Arquitetura técnica

A aplicação deverá ser completamente estática.

Stack recomendada:

```text
HTML5
CSS3
JavaScript Vanilla
GitHub
GitHub Pages (Deploy from a branch)
Node.js (apenas localmente, para o script de indexação)
```

Não utilizar inicialmente:

```text
React
Vue
Angular
Next.js
Nuxt
Node.js no frontend
Banco de dados
Backend
API própria
CMS
```

A complexidade desses componentes não se justifica para o escopo atual.

---

# 20. Estrutura recomendada do projeto

```text
docs-iamspe/
│
├── index.html
├── assets/
│   ├── css/
│   │   └── style.css
│   │
│   └── js/
│       └── app.js
│
├── pdfs/
│   ├── Abdome Agudo.pdf
│   ├── Acidose Metabólica.pdf
│   ├── Anemia Hemolítica.pdf
│   └── ...
│
├── data/
│   └── files.json
│
├── scripts/
│   └── generate-file-list.js
│
├── .gitignore
└── README.md
```

---

# 21. Diretório `/pdfs`

Todos os documentos publicados deverão ficar em:

```text
/pdfs/
```

Exemplo:

```text
/pdfs/Acidose Metabólica.pdf
/pdfs/Choque Séptico.pdf
/pdfs/Cirrose Hepática.pdf
```

O nome físico do arquivo será também o nome exibido na interface.

Isso elimina a necessidade de manter metadados duplicados.

---

# 22. Geração automática da biblioteca

Há uma restrição técnica importante.

JavaScript executado no navegador não possui acesso ao diretório do servidor para perguntar:

```text
"Quais arquivos existem dentro de /pdfs?"
```

O GitHub Pages também não fornece uma API própria de listagem desse diretório para o frontend.

Como o deploy é feito por "Deploy from a branch" (sem etapa de build no GitHub), a lista de arquivos precisa ser gerada **antes** do commit, localmente, rodando o script de indexação. O fluxo passa a ser:

```text
adicionar PDF → rodar script → commit da lista atualizada
```

---

# 23. `files.json`

Um arquivo gerado automaticamente conterá os PDFs disponíveis.

Exemplo:

```json
[
  "Abdome Agudo.pdf",
  "Acidose Metabólica.pdf",
  "Anemia Hemolítica.pdf",
  "Choque Séptico.pdf"
]
```

Esse arquivo ficará em:

```text
/data/files.json
```

O frontend utilizará:

```javascript
fetch("./data/files.json");
```

para carregar a biblioteca.

---

# 24. Script de indexação

Um script (`scripts/generate-file-list.js`) executado localmente com Node.js deverá:

1. acessar `/pdfs`;
2. identificar arquivos `.pdf`;
3. ignorar outros formatos;
4. extrair os nomes;
5. ordenar alfabeticamente;
6. gerar `data/files.json`.

Exemplo de responsabilidade:

```text
/pdfs
    ↓
scanner
    ↓
["A.pdf", "B.pdf", "C.pdf"]
    ↓
/data/files.json
```

Esse script roda manualmente, no computador do administrador, antes do commit — não há execução automática no GitHub.

---

# 25. GitHub Pages (Deploy from a branch)

Não há workflow de GitHub Actions neste projeto. O GitHub Pages é configurado em **Settings → Pages** com a fonte **Deploy from a branch**, apontando para a branch `main` e a pasta `/ (root)`.

A cada push na branch `main`, o GitHub Pages publica os arquivos exatamente como estão no repositório, sem nenhuma etapa de build. Por isso, `data/files.json` já deve estar atualizado e commitado antes do push.

---

# 26. Fluxo administrativo final

## Adicionar documento

```text
Adicionar PDF em pdfs/ (localmente)
↓
node scripts/generate-file-list.js
↓
git add + commit (PDF novo + files.json atualizado)
↓
git push (branch main)
```

Depois disso:

```text
GitHub Pages
↓
publica a branch main
↓
PDF aparece no site
```

## Remover documento

```text
Excluir arquivo em /pdfs/
↓
node scripts/generate-file-list.js
↓
Commit + push
↓
documento desaparece da biblioteca
```

## Renomear documento

```text
Renomear arquivo
↓
node scripts/generate-file-list.js
↓
Commit + push
↓
nome novo aparece automaticamente
```

---

# 27. Nomenclatura dos arquivos

Como o nome físico será apresentado diretamente ao usuário, os arquivos devem possuir nomes legíveis.

Preferir:

```text
Choque Séptico.pdf
Cirrose Hepática.pdf
Insuficiência Cardíaca.pdf
Síndrome Coronariana Aguda.pdf
```

Evitar:

```text
choque_septico_v4_final_final.pdf
cirrose2.pdf
documento(3).pdf
AULA_NOVA_ULTIMA.pdf
```

---

# 28. URLs dos documentos

Os PDFs terão URLs previsíveis.

Exemplo:

```text
https://usuario.github.io/docs-iamspe/pdfs/Choque%20Séptico.pdf
```

Cada arquivo poderá, portanto, ser compartilhado diretamente.

---

# 29. Performance

Como o site será extremamente simples, os objetivos de performance devem ser elevados.

Meta:

```text
Primeira renderização < 1 segundo em conexão adequada
```

A página inicial não deverá carregar os PDFs propriamente ditos.

Ela carregará apenas:

- HTML;
- CSS;
- JavaScript;
- pequeno arquivo JSON.

Os arquivos PDF serão transferidos somente quando solicitados.

---

# 30. Dependências

Preferência:

```text
zero dependências frontend
```

Não utilizar bibliotecas para tarefas que podem ser executadas diretamente pelo navegador.

Por exemplo, não utilizar:

```text
jQuery
Lodash
Bootstrap
Tailwind
```

no MVP.

CSS e JavaScript nativos são suficientes.

---

# 31. Acessibilidade

O site deverá utilizar HTML semântico.

Requisitos mínimos:

- `<header>`;
- `<main>`;
- `<input type="search">`;
- links reais com `<a>`;
- contraste adequado;
- foco de teclado visível;
- navegação possível via teclado;
- atributos ARIA apenas quando necessários.

A barra de pesquisa deverá possuir `label` acessível, mesmo que visualmente oculto.

---

# 32. SEO e indexação

Como os documentos são públicos, mecanismos de busca poderão potencialmente indexar o site e os arquivos.

O HTML deverá possuir pelo menos:

```html
<title>Docs IAMSPE</title>
<meta name="description" content="Biblioteca de documentos em PDF." />
<meta name="viewport" content="width=device-width, initial-scale=1" />
```

Caso futuramente seja desejável impedir indexação por mecanismos de busca, isso deverá ser tratado separadamente.

---

# 33. Segurança e privacidade

Todo conteúdo presente no repositório público ou distribuído pelo GitHub Pages deverá ser tratado como conteúdo público.

O administrador nunca deverá publicar:

- dados identificáveis de pacientes;
- prontuários;
- imagens contendo identificação;
- documentos internos confidenciais;
- credenciais;
- senhas;
- chaves de API;
- tokens;
- informações pessoais sensíveis.

Arquivos adicionados ao histórico Git podem continuar recuperáveis mesmo após exclusão posterior.

Portanto, a validação do documento antes do commit é obrigatória do ponto de vista operacional.

---

# 34. Compatibilidade

Suporte prioritário:

```text
Safari atual
Chrome atual
Firefox atual
Edge atual
Safari Mobile
Chrome Mobile
```

Não há necessidade de suporte a navegadores legados.

---

# 35. Tratamento de erros

## Falha ao carregar a biblioteca

Exibir:

```text
Não foi possível carregar os documentos.
```

## Biblioteca vazia

Exibir:

```text
Nenhum documento disponível.
```

## Pesquisa sem correspondência

Exibir:

```text
Nenhum documento encontrado.
```

---

# 36. Critérios de aceite

## AC01 | Página inicial

Dado que o usuário acessa o Docs IAMSPE,

quando a página termina de carregar,

então deverá visualizar:

```text
Docs IAMSPE
Dr. Pedro Rios
barra de pesquisa
contador de PDFs
lista de documentos
```

---

## AC02 | Ordenação

Dado que existem múltiplos PDFs,

quando a biblioteca é carregada,

então os documentos deverão aparecer em ordem alfabética.

---

## AC03 | Pesquisa

Dado que existem documentos cadastrados,

quando o usuário digitar parte de um nome,

então a lista deverá ser filtrada instantaneamente.

---

## AC04 | Case-insensitive

Pesquisar:

```text
CHOQUE
```

e:

```text
choque
```

deverá retornar o mesmo resultado.

---

## AC05 | Abertura do PDF

Dado um documento disponível,

quando o usuário clicar no nome,

então o PDF deverá abrir no navegador.

---

## AC06 | Inclusão automática

Dado que o administrador adiciona:

```text
/pdfs/Hipercalcemia.pdf
```

e realiza o commit,

quando o deploy terminar,

então:

```text
Hipercalcemia.pdf
```

deverá aparecer automaticamente na biblioteca.

Nenhuma lista deverá ser editada manualmente.

---

## AC07 | Exclusão automática

Ao excluir um PDF da pasta `/pdfs` e realizar o commit, o documento não deverá mais aparecer após a atualização do site.

---

## AC08 | Contador

Se existirem 37 arquivos PDF válidos:

```text
37 PDFs disponíveis
```

deverá ser exibido.

---

## AC09 | Mobile

A página deverá permanecer utilizável em largura de aproximadamente:

```text
320 px
```

sem rolagem horizontal.

---

## AC10 | Arquivos não PDF

Arquivos como:

```text
README.md
foto.png
arquivo.txt
```

não deverão aparecer na biblioteca.

---

# 37. Fora do escopo do MVP

Não implementar inicialmente:

- contas;
- login;
- senha;
- permissões;
- upload diretamente pelo site;
- painel administrativo;
- categorias;
- tags;
- favoritos;
- avaliações;
- comentários;
- preview embutido;
- analytics customizado;
- dark mode;
- paginação;
- backend;
- banco de dados;
- CMS;
- API própria.

---

# 38. Evoluções futuras possíveis

Caso o volume de arquivos aumente, poderão ser adicionados posteriormente:

```text
categorias
tags
ordenação personalizada
filtros
data de inclusão
favoritos locais
URL de pesquisa compartilhável
atalhos de teclado
visualização em grid
preview
PWA
analytics
domínio próprio
```

Esses recursos não devem interferir na implementação inicial.

---

# 39. Decisão arquitetural principal

A arquitetura escolhida será:

```text
Script local (Node.js)
        │
        ├── identifica PDFs
        ├── ordena nomes
        └── gera files.json
        │
        ▼
GitHub Repository (commit + push)
        │
        ├── PDFs
        ├── files.json
        │
        ▼
GitHub Pages (Deploy from a branch)
        │
        ▼
HTML + CSS + JavaScript
        │
        ▼
Usuário
```

Essa arquitetura atende aos principais requisitos:

```text
baixo custo
zero servidor
zero banco de dados
manutenção mínima
deploy automático do GitHub Pages a cada push
sem workflow de CI/CD
boa performance
compatibilidade com GitHub Pages
```

---

# 40. Métrica principal de sucesso

O principal indicador de sucesso do projeto será operacional:

> Depois da configuração inicial, adicionar um novo documento deverá exigir apenas colocar o PDF na pasta `/pdfs`, rodar o script de indexação localmente e fazer commit + push para o GitHub.

Nenhuma alteração adicional na aplicação deverá ser necessária.

---

# 41. Definição de pronto

O MVP estará concluído quando for possível:

1. acessar o Docs IAMSPE pelo GitHub Pages;
2. visualizar todos os PDFs;
3. visualizá-los em ordem alfabética;
4. pesquisar por nome;
5. abrir qualquer PDF;
6. visualizar o total de documentos;
7. utilizar o site no desktop e celular;
8. adicionar um novo PDF rodando apenas o script de indexação e um commit/push;
9. ver esse PDF aparecer automaticamente após o deploy do GitHub Pages;
10. remover um PDF e vê-lo desaparecer automaticamente após o deploy.

---

# 42. Resumo técnico final

```text
Produto:
Docs IAMSPE

Responsável:
Dr. Pedro Rios

Hospedagem:
GitHub Pages (Deploy from a branch)

Frontend:
HTML + CSS + JavaScript Vanilla

Dados:
JSON gerado localmente por script (manual, antes do commit)

Documentos:
arquivos em /pdfs/

Automação:
Script local (Node.js), sem CI/CD

Banco de dados:
nenhum

Backend:
nenhum

Autenticação:
nenhuma

Pesquisa:
client-side

Ordenação:
alfabética

Interface:
lista simples

Tema:
light only

Página de documento:
não

Botão de download:
não

Clique no nome:
abre PDF no navegador

Fluxo de publicação:
adicionar PDF → gerar files.json localmente → commit + push → deploy automático do GitHub Pages
```
