// profissionais.html: página para profissionais (aviso e hero próprios; o cabeçalho é o do resto do site).
const { test, expect } = require('@playwright/test');
const path = require('path');

const FAKE_SDK_PATH = path.join(__dirname, 'fixtures', 'fake-supabase-sdk.js');
const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3';

async function abrir(page, session = null) {
  await page.route(SUPABASE_CDN_URL, (route) => route.fulfill({ path: FAKE_SDK_PATH, contentType: 'text/javascript' }));
  await page.addInitScript((cfg) => { window.__testAuthConfig = cfg; }, { session, tableData: {} });
  await page.goto('/profissionais.html');
}

test('avisa que é a área de profissionais e dá saída para clientes', async ({ page }) => {
  await abrir(page);
  await expect(page.locator('.promo')).toContainText('profissionais');
  await expect(page.locator('.promo a')).toHaveAttribute('href', 'index.html');
  await expect(page.locator('#fkHeader .fk-links a[aria-current="page"]')).toHaveText('Para profissionais');
});

test('escolher o ofício muda a palavra do título e o texto', async ({ page }) => {
  await abrir(page);
  await expect(page.locator('#palavra')).toHaveText('pedidos');
  await page.getByRole('button', { name: 'Eletricista' }).click();
  await expect(page.locator('#palavra')).toHaveText('instalações');
  await expect(page.locator('#sub')).toContainText('Eletricistas');
  await expect(page.getByRole('button', { name: 'Eletricista' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'false');
});

test('com sessão iniciada, "Entrar" dá lugar a "O meu painel"', async ({ page }) => {
  // A página já não carrega o SDK do Supabase: o cabeçalho lê a sessão que o
  // SDK guarda no browser (assets/site-header.js).
  await page.addInitScript(() => {
    localStorage.setItem('sb-cdwinidhtfxfxowflize-auth-token', JSON.stringify({ access_token: 'tok', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u1', user_metadata: { full_name: 'Ana Silva' } } }));
  });
  await abrir(page);
  await expect(page.locator('#nav-avatar')).toHaveText('AS');
  await expect(page.locator('#nav-guest')).toBeHidden();
  await expect(page.locator('#nav-user a.fk-btn')).toHaveText('O meu painel');
  await expect(page.locator('#nav-user a.fk-btn')).toHaveAttribute('href', '/dashboard');
});

test('os botões de registo levam ao registo e os preços têm 3 planos + Empresas', async ({ page }) => {
  await abrir(page);
  const hrefs = await page.locator('a.btn-o, a.nb').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
  expect(hrefs.filter((h) => h === 'auth.html?tab=register').length).toBeGreaterThanOrEqual(4);
  await expect(page.locator('.plan')).toHaveCount(3);
  await expect(page.locator('.team')).toContainText('Empresas');
});

test('no telemóvel, o botão fixo só aparece depois de descer', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await abrir(page);
  await expect(page.locator('.sticky')).toBeHidden();
  await page.evaluate(() => window.scrollTo({ top: 1500, behavior: 'instant' }));
  await expect(page.locator('.sticky')).toBeVisible();
});
