// Configuração do Playwright para os testes E2E de auth/checkout.
// As páginas são servidas tal como estão no repositório (site estático,
// sem build step para HTML/JS) por tests/e2e/static-server.js.
const { defineConfig, devices } = require('@playwright/test');

const PORT = process.env.E2E_STATIC_PORT || 4173;

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `node tests/e2e/static-server.js`,
    port: Number(PORT),
    reuseExistingServer: !process.env.CI,
    env: { E2E_STATIC_PORT: String(PORT) },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
