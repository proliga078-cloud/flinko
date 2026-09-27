// Configuração do Playwright para os testes E2E de auth/checkout.
// As páginas são servidas por tests/e2e/static-server.js depois de gerar as
// páginas de categoria (o mesmo passo que o Netlify corre no deploy), para
// testar exatamente o que vai para produção.
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
    // Consentimento de cookies já dado (só o necessário): sem isto o banner
    // do assets/cookie-consent.js fica por cima dos botões e tapa os cliques.
    storageState: {
      cookies: [],
      origins: [{
        origin: `http://localhost:${PORT}`,
        localStorage: [
          { name: 'flinko_cookie_consent', value: JSON.stringify({ necessary: true, analytics: false, ts: 1 }) },
          // O guia "Completa o teu perfil" abre sozinho por cima do dashboard e
          // taparia os cliques dos outros testes; só dashboard-guia-perfil o abre.
          { name: 'fk_onb_snooze_until', value: String(4102444800000) },
        ],
      }],
    },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `node scripts/build-site-header.js && node scripts/build-categories.js && node tests/e2e/static-server.js`,
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
