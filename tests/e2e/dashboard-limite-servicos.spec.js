// Limite de serviços por plano no dashboard: Grátis 2; Starter, Pro, Empresas sem limite
// (é o que pricing.html promete). REGRESSÃO: Starter e Empresas ficavam com 2 e o Pro com 10.
const { test, expect } = require('@playwright/test');
const path = require('path');

const FAKE_SDK_PATH = path.join(__dirname, 'fixtures', 'fake-supabase-sdk.js');
const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

async function abrir(page, plan, servicos) {
  const p = { id: 'u1', name: 'Ana', plan, account_type: 'professional', category: 'Eletricistas', location: 'Porto', bio: 'x', photo_url: 'https://example.com/f.jpg', notify_email: true, notify_digest: true };
  await page.route(SUPABASE_CDN_URL, (route) => route.fulfill({ path: FAKE_SDK_PATH, contentType: 'text/javascript' }));
  await page.route(/^https?:\/\/(?!localhost)/, (route) => (route.request().url() === SUPABASE_CDN_URL ? route.fallback() : route.abort()));
  await page.addInitScript((cfg) => { window.__testAuthConfig = cfg; }, {
    session: { access_token: 'tok', user: { id: 'u1', email: 'a@example.com' } },
    rpcResults: { get_my_profile: [p] },
    tableData: { plan_limits: { data: [] }, services: { data: Array.from({ length: servicos }, (_, i) => ({ id: 's' + i, title: 'S' + i })), count: servicos } },
  });
  await page.goto('/dashboard.html');
  await page.waitForFunction(() => typeof showPage === 'function');
  await page.evaluate(() => showPage('services'));
  await page.fill('#srv-title', 'Novo serviço');
  await page.click('button:has-text("Adicionar serviço")');
}

for (const plano of ['starter', 'pro', 'empresas']) {
  test(`plano ${plano} com 12 serviços consegue adicionar mais um`, async ({ page }) => {
    await abrir(page, plano, 12);
    await expect(page.locator('#srv-success')).toContainText('Serviço adicionado');
  });
}

test('plano grátis com 2 serviços é avisado do limite', async ({ page }) => {
  await abrir(page, 'free', 2);
  await expect(page.locator('#srv-error')).toContainText('limite de 2 serviços');
});
