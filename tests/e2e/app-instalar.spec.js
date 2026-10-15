// Instalar a app (assets/pwa.js): a homepage explica a app e o botão instala
// logo quando o browser deixa; senão mostra os passos certos para o aparelho
// (no iPhone é sempre manual: Partilhar → Adicionar ao ecrã principal).
const { test, expect } = require('@playwright/test');
const path = require('path');

const FAKE_SDK_PATH = path.join(__dirname, 'fixtures', 'fake-supabase-sdk.js');
const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

async function abrir(page, url = '/index.html') {
  await page.route(SUPABASE_CDN_URL, (route) => route.fulfill({ path: FAKE_SDK_PATH, contentType: 'text/javascript' }));
  await page.addInitScript(() => { window.__testAuthConfig = { tableData: {} }; });
  await page.goto(url);
}

test('a homepage tem a secção da app e carrega o pwa.js', async ({ page }) => {
  await abrir(page);
  const sec = page.locator('#app');
  await expect(sec).toContainText('A Flinko no teu telemóvel');
  await expect(sec.getByRole('button', { name: /Instalar a app/ })).toBeVisible();
  expect(await page.evaluate(() => typeof window.flinkoInstallApp)).toBe('function');
});

test('quando o browser deixa instalar, o botão abre o pedido de instalação do próprio browser', async ({ page }) => {
  await abrir(page);
  await page.evaluate(() => {
    const e = new Event('beforeinstallprompt');
    e.prompt = () => { window.__prompted = true; };
    e.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(e);
  });
  await page.locator('#app').getByRole('button', { name: /Instalar a app/ }).click();
  expect(await page.evaluate(() => window.__prompted)).toBe(true);
  await expect(page.locator('#fk-install-guide')).toHaveCount(0);
});

test.describe('no iPhone', () => {
  test.use({ userAgent: IPHONE, viewport: { width: 390, height: 844 }, hasTouch: true });

  test('o botão mostra os passos do Safari (Partilhar → Adicionar ao ecrã principal)', async ({ page }) => {
    await abrir(page);
    await page.locator('#app').getByRole('button', { name: /Instalar a app/ }).click();
    const guia = page.locator('#fk-install-guide');
    await expect(guia).toBeVisible();
    await expect(guia).toContainText('Partilhar');
    await expect(guia).toContainText('Adicionar ao ecrã principal');
    await guia.getByRole('button', { name: 'Percebi' }).click();
    await expect(guia).toHaveCount(0);
  });

  test('o menu do telemóvel também tem "Instalar a app"', async ({ page }) => {
    await abrir(page, '/pedidos.html');
    await page.getByRole('button', { name: 'Abrir menu' }).click();
    await page.locator('#fkPanel').getByRole('button', { name: /Instalar a app/ }).click();
    await expect(page.locator('#fk-install-guide')).toContainText('Adicionar ao ecrã principal');
  });

  test('a partir da segunda visita aparece o aviso com os passos (uma vez; fechar esconde-o)', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('flinko_visits', '1'); localStorage.setItem('flinko_cookie_consent', JSON.stringify({ necessary: true, analytics: false, ts: Date.now() })); } catch (e) {} });
    await abrir(page);
    const aviso = page.locator('#pwa-install-banner');
    await expect(aviso).toBeVisible({ timeout: 10000 });
    await expect(aviso).toContainText('Adicionar ao ecrã principal');
    await aviso.getByRole('button', { name: 'Fechar' }).click();
    await expect(aviso).toHaveCount(0);
    expect(await page.evaluate(() => !!localStorage.getItem('proliga_install_dismissed_at'))).toBe(true);
  });
});

test.describe('no iPhone, antes de decidir os cookies', () => {
  test.use({ userAgent: IPHONE, viewport: { width: 390, height: 844 }, hasTouch: true });

  test('o aviso da app espera: não aparece por cima do aviso de cookies', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('flinko_visits', '1'); localStorage.removeItem('flinko_cookie_consent'); } catch (e) {} });
    await abrir(page);
    await page.waitForTimeout(5500);
    await expect(page.locator('#pwa-install-banner')).toHaveCount(0);
    await page.getByRole('button', { name: 'Rejeitar não essenciais' }).click();
    await expect(page.locator('#pwa-install-banner')).toBeVisible({ timeout: 6000 });
  });
});
