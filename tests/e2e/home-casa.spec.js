// Banner da homepage (out/2026): a foto de banco dos 4 trabalhadores deu
// lugar a uma casa desenhada onde o cliente toca na parte com problema
// (quadro elétrico, casa de banho, paredes, sala, jardim) e vê o ofício
// certo, quantos profissionais há e o caminho seguinte. Os números vêm da
// base de dados; um ofício ainda sem ninguém leva a publicar o pedido.
const { test, expect } = require('@playwright/test');
const path = require('path');

const FAKE_SDK_PATH = path.join(__dirname, 'fixtures', 'fake-supabase-sdk.js');
const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3';

const pro = (id, category) => ({ id, name: 'Pro ' + id, category, location: 'Lisboa', plan: 'free', verified: true, approved: true, slug: null, bio: null, experience_years: 0, account_type: 'professional', photo_url: null });

async function abrir(page, profiles) {
  await page.route(SUPABASE_CDN_URL, (route) => route.fulfill({ path: FAKE_SDK_PATH, contentType: 'text/javascript' }));
  await page.addInitScript((cfg) => { window.__testAuthConfig = cfg; }, {
    tableData: { profiles: { data: profiles }, reviews: { data: [] }, requests: { data: [] }, ad_slots: { data: [] } },
    rpcResults: { spotlight_pros: [] },
  });
  await page.goto('/index.html');
}

const PROS = [pro('1', 'Eletricistas'), pro('2', 'Eletricistas'), pro('3', 'Canalizadores')];

test('o banner já não usa a foto de banco dos trabalhadores', async ({ page }) => {
  await abrir(page, PROS);
  const html = await page.content();
  expect(html).not.toContain('hero-team.jpg');
  const fundo = await page.evaluate(() => getComputedStyle(document.querySelector('#heroSection'), '::before').backgroundImage);
  expect(fundo).not.toContain('url(');
});

test('a casa mostra o eletricista por omissão, com a contagem real', async ({ page }) => {
  await abrir(page, PROS);
  const painel = page.locator('#housePanel');
  await expect(painel).toContainText('Eletricista');
  await expect(painel).toContainText('2 eletricistas com perfil ativo');
  await expect(painel.getByRole('link', { name: /Ver eletricistas/ })).toHaveAttribute('href', '/eletricistas');
  await expect(page.getByRole('button', { name: /Quadro elétrico/ })).toHaveAttribute('aria-pressed', 'true');
});

test('tocar na casa de banho mostra canalizadores', async ({ page }) => {
  await abrir(page, PROS);
  await page.getByRole('button', { name: /Casa de banho/ }).click();
  const painel = page.locator('#housePanel');
  await expect(painel).toContainText('Canalizador');
  await expect(painel).toContainText('1 canalizador com perfil ativo');
  await expect(painel.getByRole('link', { name: /Ver canalizadores/ })).toHaveAttribute('href', '/canalizadores');
  await expect(page.getByRole('button', { name: /Casa de banho/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: /Quadro elétrico/ })).toHaveAttribute('aria-pressed', 'false');
});

test('um ofício ainda sem profissionais leva a publicar o pedido nessa categoria', async ({ page }) => {
  await abrir(page, PROS);
  await page.getByRole('button', { name: /Jardim/ }).click();
  const painel = page.locator('#housePanel');
  await expect(painel).toContainText('Jardinagem');
  await expect(painel).not.toContainText('0 ');
  await expect(painel.getByRole('link', { name: /Publicar o pedido/ })).toHaveAttribute('href', '/pedidos?publicar=1&cat=Jardineiros');
});

test('no telemóvel (375px) a casa cabe sem deslizar para o lado e os pontos têm 44px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await abrir(page, PROS);
  await expect(page.locator('#heroHouse')).toBeVisible();
  const largura = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(largura).toBeLessThanOrEqual(375);
  // A coluna do lado entra com uma pequena animação (scale .98): mede-se depois de acabar.
  await expect(page.locator('#heroSection')).toHaveClass(/loaded/);
  await expect.poll(async () => {
    const tamanhos = await page.locator('.house-spot').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return Math.min(r.width, r.height); }));
    return tamanhos.length === 5 ? Math.min(...tamanhos) : 0;
  }, { timeout: 5000 }).toBeGreaterThanOrEqual(44);
});
