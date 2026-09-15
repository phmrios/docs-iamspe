"use strict";

const fs = require("fs");
const path = require("path");

const PDFS_DIR = path.join(__dirname, "..", "pdfs");
const OUTPUT_FILE = path.join(__dirname, "..", "data", "files.json");

function listPdfFiles(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => path.extname(name).toLowerCase() === ".pdf");
}

function sortFiles(files) {
  return files.slice().sort((a, b) =>
    a.localeCompare(b, "pt-BR", {
      sensitivity: "base",
    }),
  );
}

function main() {
  const files = sortFiles(listPdfFiles(PDFS_DIR));

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(files, null, 2) + "\n");

  console.log(`Gerado ${OUTPUT_FILE} com ${files.length} PDF(s).`);
}

main();
