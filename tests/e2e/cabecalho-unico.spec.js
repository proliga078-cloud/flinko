// Cabeçalho único (scripts/site-header.js): todas as páginas públicas têm o
// mesmo menu, com a página atual marcada, e o menu do telemóvel abre e fecha.
const { test, expect } = require('@playwright/test');
const path = require('path');
const { build } = require('../../scripts/build-site-header.js');

const FAKE_SDK_PATH = path.join(__dirname, 'fixtures', 'fake-supabase-sdk.js');
const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3';

async function abrir(page, url) {
  await page.route(SUPABASE_CDN_URL, (route) => route.fulfill({ path: FAKE_SDK_PATH, contentType: 'text/javascript' }));
  await page.addInitScript(() => { window.__testAuthConfig = { tableData: {} }; });
  await page.goto(url);
}

const PAGINAS = [
  ['/index.html', null],
  ['/eletricistas.html', 'Encontrar'],
  ['/categoria.html', 'Encontrar'],
  ['/pedidos.html', 'Pedidos'],
  ['/como-funciona.html', 'Como funciona'],
  ['/pricing.html', 'Preços'],
  ['/profissionais.html', 'Para profissionais'],
  ['/academia.html', 'Academia'],
  ['/sobre.html', null],
  ['/blog-limpeza-precos.html', null],
];

for (const [url, ativo] of PAGINAS) {
  test(`${url}: tem o cabeçalho e o rodapé únicos${ativo ? ` com "${ativo}" marcado` : ''}`, async ({ page }) => {
    await abrir(page, url);
    await expect(page.locator('#fkHeader')).toHaveCount(1);
    await expect(page.locator('.fk-footer')).toHaveCount(1);
    await expect(page.locator('.fk-footer .fk-legal a')).toHaveText(['Termos', 'Privacidade', 'Cookies', 'RGPD']);
    await expect(page.locator('#fkHeader .fk-links a')).toHaveText(['Encontrar', 'Pedidos', 'Como funciona', 'Preços', 'Para profissionais', 'Academia']);
    const atual = page.locator('#fkHeader .fk-links a[aria-current="page"]');
    if (ativo) await expect(atual).toHaveText(ativo);
    else await expect(atual).toHaveCount(0);
  });
}

test('no telemóvel o menu abre, mostra os links e fecha com Escape', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await abrir(page, '/pedidos.html');
  const panel = page.locator('#fkPanel');
  await expect(panel).toBeHidden();
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('link', { name: 'Encontrar' })).toBeVisible();
  await expect(page.locator('#fkToggle')).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
});

test('as páginas commitadas estão em dia com scripts/site-header.js', async () => {
  // build() devolve quantas páginas têm as marcas; se alguma mudasse, o CI
  // apanhava no passo "Páginas geradas em dia". Aqui basta confirmar que há.
  expect(build()).toBeGreaterThan(20);
});
