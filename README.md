# Docs IAMSPE

Biblioteca pública de documentos em PDF, hospedada no GitHub Pages.

Site estático (HTML, CSS e JavaScript vanilla), sem backend, sem banco de
dados e sem autenticação. Todo conteúdo publicado é considerado público.

O deploy é feito pelo próprio GitHub Pages a partir da branch `main`
("Deploy from a branch"), sem GitHub Actions. Por isso, `data/files.json`
precisa ser gerado **localmente, antes do commit**.

## Como adicionar um novo documento

1. Coloque o arquivo PDF dentro da pasta `pdfs/` (use um nome legível, ex.:
   `Choque Séptico.pdf`).
2. Gere a lista atualizada de documentos:
   ```bash
   node scripts/generate-file-list.js
   ```
3. Faça commit do PDF novo **e** do `data/files.json` atualizado.
4. Dê push para a branch `main`.

O GitHub Pages publica a nova versão do site automaticamente após o push.

## Como remover ou renomear um documento

Exclua ou renomeie o arquivo dentro de `pdfs/`, rode novamente
`node scripts/generate-file-list.js`, e faça commit e push das duas
alterações (o arquivo em `pdfs/` e o `data/files.json`).

## Estrutura do projeto

```text
docs-iamspe/
├── index.html
├── assets/
│   ├── css/style.css
│   └── js/app.js
├── pdfs/                  # PDFs publicados (nome do arquivo = nome exibido)
├── data/files.json        # gerado localmente pelo script, não editar manualmente
└── scripts/generate-file-list.js
```

## Rodando localmente

Como o `fetch` de `data/files.json` exige HTTP (não funciona em `file://`),
sirva a pasta com um servidor estático simples, por exemplo:

```bash
node scripts/generate-file-list.js   # gera data/files.json a partir de /pdfs
npx serve .
```

## Configuração do GitHub Pages

Em **Settings → Pages**, defina a fonte como **Deploy from a branch**,
selecione a branch `main` e a pasta `/ (root)`. Não há workflow de GitHub
Actions neste repositório — o próprio GitHub Pages serve os arquivos como
estão na branch a cada push.
