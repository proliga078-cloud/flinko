// profissionais.html: página para profissionais (cabeçalho e hero próprios, distintos da página de clientes).
const { test, expect } = require('@playwright/test');
const path = require('path');

const FAKE_SDK_PATH = path.join(__dirname, 'fixtures', 'fake-supabase-sdk.js');
const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

async function abrir(page, session = null) {
  await page.route(SUPABASE_CDN_URL, (route) => route.fulfill({ path: FAKE_SDK_PATH, contentType: 'text/javascript' }));
  await page.addInitScript((cfg) => { window.__testAuthConfig = cfg; }, { session, tableData: {} });
  await page.goto('/profissionais.html');
}

test('avisa que é a área de profissionais e dá saída para clientes', async ({ page }) => {
  await abrir(page);
  await expect(page.locator('.promo')).toContainText('profissionais');
  await expect(page.locator('.promo a')).toHaveAttribute('href', 'index.html');
  await expect(page.locator('.ptag')).toHaveText('PARA PROFISSIONAIS');
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

test('com sessão iniciada, "Entrar" passa a "Dashboard"', async ({ page }) => {
  await abrir(page, { access_token: 'tok', user: { id: 'u1', email: 'a@example.com' } });
  await expect(page.locator('#nav-login')).toHaveText('Dashboard');
  await expect(page.locator('#nav-login')).toHaveAttribute('href', 'dashboard.html');
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
