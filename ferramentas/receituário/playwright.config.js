import { defineConfig, devices } from '@playwright/test';

// Os testes abrem dist/receituario.html direto do disco (file://), com a rede
// bloqueada: é exatamente a forma de uso prevista para o produto.
export default defineConfig({
  testDir: 'tests',
  testMatch: ['e2e/**/*.spec.js', 'visual/**/*.spec.js'],
  outputDir: 'test-results',
  snapshotPathTemplate: '{testDir}/visual/referencias/{arg}-{projectName}{ext}',
  fullyParallel: true,
  workers: 4,
  retries: 0,
  timeout: 60000,
  reporter: [['list']],
  use: { viewport: { width: 1360, height: 900 }, deviceScaleFactor: 1, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', acceptDownloads: true },
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' } },
  projects: [
    { name: 'chromium', testMatch: 'e2e/**/*.spec.js', use: { ...devices['Desktop Chrome'], viewport: { width: 1360, height: 900 } } },
    { name: 'firefox', testMatch: 'e2e/**/*.spec.js', use: { ...devices['Desktop Firefox'], viewport: { width: 1360, height: 900 } } },
    { name: 'webkit', testMatch: 'e2e/**/*.spec.js', use: { ...devices['Desktop Safari'], viewport: { width: 1360, height: 900 } } },
    { name: 'visual', testMatch: 'visual/**/*.spec.js', use: { ...devices['Desktop Chrome'], viewport: { width: 1360, height: 900 } } },
  ],
});
