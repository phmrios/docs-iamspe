# Docs IAMSPE

Biblioteca pública de documentos em PDF, hospedada no GitHub Pages.

Site estático (HTML, CSS e JavaScript vanilla), sem backend, sem banco de
dados e sem autenticação. Todo conteúdo publicado é considerado público.

## Como adicionar um novo documento

1. Acesse a pasta `pdfs/` neste repositório no GitHub.
2. Clique em **Add file → Upload files**.
3. Selecione o arquivo PDF (use um nome legível, ex.: `Choque Séptico.pdf`).
4. Faça o commit direto na branch `main`.

Depois do commit, o GitHub Actions gera automaticamente a lista de
documentos (`data/files.json`) e publica a nova versão do site no GitHub
Pages. Nenhuma edição manual é necessária.

## Como remover ou renomear um documento

Basta excluir ou renomear o arquivo dentro de `pdfs/` e fazer o commit. O
próximo deploy atualizará a biblioteca automaticamente.

## Estrutura do projeto

```text
docs-iamspe/
├── index.html
├── assets/
│   ├── css/style.css
│   └── js/app.js
├── pdfs/                  # PDFs publicados (nome do arquivo = nome exibido)
├── data/files.json        # gerado automaticamente, não editar manualmente
├── scripts/generate-file-list.js
└── .github/workflows/build.yml
```

## Rodando localmente

Como o `fetch` de `data/files.json` exige HTTP (não funciona em `file://`),
sirva a pasta com um servidor estático simples, por exemplo:

```bash
node scripts/generate-file-list.js   # gera data/files.json a partir de /pdfs
npx serve .
```

## Configuração do GitHub Pages

Em **Settings → Pages**, defina a fonte como **GitHub Actions**. O workflow
em `.github/workflows/build.yml` cuida do build e do deploy a cada push na
branch `main`.
# docs-iamspe
