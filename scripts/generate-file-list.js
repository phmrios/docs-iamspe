"use strict";

const fs = require("fs");
const path = require("path");

const PDFS_DIR = path.join(__dirname, "..", "pdfs");
const OUTPUT_FILE = path.join(__dirname, "..", "data", "files.json");
const ALLOWED_EXTENSIONS = [".pdf", ".docx"];

function listPdfFiles(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => ALLOWED_EXTENSIONS.includes(path.extname(name).toLowerCase()))
    .map((name) => {
      // macOS decomposes accented characters (NFD) when creating files, but
      // GitHub Pages' CDN normalizes request URLs to NFC before matching
      // against the repo's stored filenames, causing 404s. Renaming the file
      // on disk keeps the URL, the JSON entry, and the git blob name in sync.
      const normalized = name.normalize("NFC");
      if (normalized !== name) {
        fs.renameSync(path.join(dir, name), path.join(dir, normalized));
      }
      return normalized;
    });
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

  console.log(`Gerado ${OUTPUT_FILE} com ${files.length} arquivo(s).`);
}

main();
