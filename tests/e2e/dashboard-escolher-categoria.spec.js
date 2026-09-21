// Cartão do Resumo para profissionais sem categoria ou zona: sem isso o perfil não aparece em nenhuma pesquisa.
// Motivo: 9 de 27 contas de profissional nunca escolheram categoria.
const { test, expect } = require('@playwright/test');
const path = require('path');

const FAKE_SDK_PATH = path.join(__dirname, 'fixtures', 'fake-supabase-sdk.js');
const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

async function abrir(page, perfilExtra) {
  const p = { id: 'u1', name: 'Ana', plan: 'free', account_type: 'professional', category: 'Eletricistas', location: 'Porto', bio: 'x', photo_url: 'https://example.com/f.jpg', notify_email: true, notify_digest: true, ...perfilExtra };
  await page.route(SUPABASE_CDN_URL, (route) => route.fulfill({ path: FAKE_SDK_PATH, contentType: 'text/javascript' }));
  await page.route(/^https?:\/\/(?!localhost)/, (route) => (route.request().url() === SUPABASE_CDN_URL ? route.fallback() : route.abort()));
  await page.addInitScript((cfg) => { window.__testAuthConfig = cfg; }, {
    session: { access_token: 'tok', user: { id: 'u1', email: 'a@example.com' } },
    rpcResults: { get_my_profile: [p] },
    tableData: { plan_limits: { data: [] }, services: { data: [], count: 0 } },
  });
  await page.goto('/dashboard.html');
  await page.waitForFunction(() => typeof showPage === 'function');
}

test('sem categoria: o Resumo mostra o cartão, exige os dois campos e guarda', async ({ page }) => {
  await abrir(page, { category: null, location: null });
  const card = page.locator('#quick-category');
  await expect(card).toBeVisible();
  await page.click('#qcat-btn');
  await expect(page.locator('#qcat-error')).toContainText('categoria e o distrito');
  await page.selectOption('#qcat-cat', 'Eletricistas');
  await page.selectOption('#qcat-district', 'Porto');
  await page.click('#qcat-btn');
  await expect(card).toBeHidden();
});

test('com categoria e zona, o cartão não aparece', async ({ page }) => {
  await abrir(page, {});
  await expect(page.locator('#quick-category')).toBeHidden();
});

test('clientes não veem o cartão', async ({ page }) => {
  await abrir(page, { account_type: 'client', category: null, location: null });
  await expect(page.locator('#quick-category')).toBeHidden();
});
