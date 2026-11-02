import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';

// Carrega arquivos .txt como texto (mesmo comportamento do `loader` do esbuild no build).
const textFiles = {
  name: 'rx-text-files',
  enforce: 'pre',
  load(id) {
    if (id.endsWith('.txt')) return `export default ${JSON.stringify(readFileSync(id, 'utf8'))};`;
    return null;
  },
};

export default defineConfig({
  plugins: [textFiles],
  test: {
    include: ['tests/unit/**/*.test.js', 'tests/integration/**/*.test.js'],
    environment: 'node',
    testTimeout: 30000,
  },
});
