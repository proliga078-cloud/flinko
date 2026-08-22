// Testes E2E do reforço de sinais de confiança junto dos cards de
// profissionais (análise de mercado/UX: com 0 avaliações em toda a
// plataforma, o selo de verificação manual era o único sinal de confiança
// disponível, mas só aparecia como um ícone minúsculo no avatar — sem
// texto — e só na secção "Porquê confiar na Proliga", nunca junto dos
// próprios resultados de pesquisa, que é onde a decisão é tomada).
//
// Cobre: (1) a pill "Verificados à mão" que já existia nas páginas de
// categoria individuais (ex: eletricistas.html) mas faltava em
// categoria.html; (2) o texto "Verificado" visível em cada card de
// profissional verificado, além do ícone no avatar.
const { test, expect } = require('@playwright/test');
const path = require('path');

const FAKE_SDK_PATH = path.join(__dirname, 'fixtures', 'fake-supabase-sdk.js');
const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

async function withFakeSupabase(page, config) {
  await page.route(SUPABASE_CDN_URL, (route) =>
    route.fulfill({ path: FAKE_SDK_PATH, contentType: 'text/javascript' })
  );
  await page.addInitScript((cfg) => {
    window.__testAuthConfig = cfg;
  }, config);
}

const PROS = {
  count: 2,
  data: [
    { id: 'p1', name: 'Ana Verificada', category: 'Jardineiros', location: 'Porto', plan: 'free', verified: true, photo_url: null, bio: '' },
    { id: 'p2', name: 'Bruno Por Verificar', category: 'Jardineiros', location: 'Lisboa', plan: 'free', verified: false, photo_url: null, bio: '' },
  ],
};

test.describe('categoria.html — sinais de confiança junto dos resultados', () => {
  test('mostra a pill "Verificados à mão" junto da contagem de resultados', async ({ page }) => {
    await withFakeSupabase(page, { tableData: { profiles: PROS } });
    await page.goto('/categoria.html');
    await page.waitForFunction(() => document.getElementById('results-count').textContent.includes('profiss'));
    await expect(page.locator('.main-top .tverif')).toContainText('Verificados à mão');
  });

  test('profissional verificado mostra o texto "Verificado" no card; não verificado não mostra', async ({ page }) => {
    await withFakeSupabase(page, { tableData: { profiles: PROS } });
    await page.goto('/categoria.html');
    await page.waitForSelector('.pro-card');

    const anaCard = page.locator('.pro-card', { hasText: 'Ana Verificada' });
    await expect(anaCard.locator('.pro-card-cat .tverif')).toContainText('Verificado');

    const brunoCard = page.locator('.pro-card', { hasText: 'Bruno Por Verificar' });
    await expect(brunoCard.locator('.pro-card-cat .tverif')).toHaveCount(0);
  });
});

test.describe('jardineiros.html — sinais de confiança já existentes continuam a funcionar', () => {
  test('mostra a pill "Verificados à mão" e o texto "Verificado" no card do profissional verificado', async ({ page }) => {
    await withFakeSupabase(page, { tableData: { profiles: PROS } });
    await page.goto('/jardineiros.html');
    await page.waitForSelector('.pro-card');
    await expect(page.locator('.toolbar .tverif')).toContainText('Verificados à mão');
    const anaCard = page.locator('.pro-card', { hasText: 'Ana Verificada' });
    await expect(anaCard.locator('.pro-card-cat .tverif')).toContainText('Verificado');
  });
});
