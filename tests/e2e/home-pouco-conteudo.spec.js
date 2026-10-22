// A homepage tem de parecer cuidada mesmo com pouco conteúdo dos profissionais:
// cartões sem bio nem experiência não ficam vazios, e categorias sem
// profissionais levam a publicar o pedido nessa categoria.
const { test, expect } = require('@playwright/test');
const path = require('path');

const FAKE_SDK_PATH = path.join(__dirname, 'fixtures', 'fake-supabase-sdk.js');
const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3';

async function abrir(page, profiles) {
  await page.route(SUPABASE_CDN_URL, (route) => route.fulfill({ path: FAKE_SDK_PATH, contentType: 'text/javascript' }));
  await page.addInitScript((cfg) => { window.__testAuthConfig = cfg; }, {
    tableData: { profiles: { data: profiles }, reviews: { data: [] }, requests: { data: [] }, ad_slots: { data: [] } },
    rpcResults: { spotlight_pros: [] },
  });
  await page.goto('/index.html');
}

const pro = (id, extra) => ({ id, name: 'Pro ' + id, category: 'Eletricistas', location: 'Lisboa', plan: 'free', verified: true, slug: null, bio: null, experience_years: 0, account_type: 'professional', photo_url: null, ...extra });

test('cartão de profissional sem bio mostra texto de apoio e não fica vazio', async ({ page }) => {
  await abrir(page, [pro('1', { bio: 'Instalações elétricas em casas e empresas.' }), pro('2'), pro('3')]);
  await expect(page.locator('#proGrid .pro-card')).toHaveCount(3);
  const bios = await page.locator('#proGrid .pro-card .bio').allTextContents();
  expect(bios).toHaveLength(3);
  expect(bios.every((t) => t.trim().length > 20)).toBe(true);
  expect(bios.filter((t) => /Perfil verificado pela equipa/.test(t))).toHaveLength(2);
});

test('sem pedidos recentes o cartão "Pedidos recentes" do topo desaparece em vez de dizer que não há nada', async ({ page }) => {
  await abrir(page, [pro('1')]);
  await expect(page.locator('.live-card')).toBeHidden();
  await expect(page.locator('body')).not.toContainText('Ainda não há pedidos publicados');
  await expect(page.locator('#avatarsRowText')).toHaveText('1 profissional verificado em Portugal');
});

test('perfis sem categoria não contam para o total nem aparecem na montra; os completos aparecem primeiro', async ({ page }) => {
  await abrir(page, [
    pro('1', { name: 'Sem Categoria', category: '' }),
    pro('2', { name: 'Só Nome' }),
    pro('3', { name: 'Completo', bio: 'Instalações elétricas em casas e empresas.', photo_url: 'https://x.pt/f.jpg' }),
  ]);
  await expect(page.locator('#avatarsRowText')).toHaveText('2 profissionais verificados em Portugal');
  const nomes = await page.locator('#proGrid .pro-name').allTextContents();
  expect(nomes).toEqual(['Completo', 'Só Nome']);
});

test('categorias sem profissionais levam a publicar o pedido; com profissionais mostram a contagem', async ({ page }) => {
  await abrir(page, [pro('1'), pro('2')]);
  await expect(page.locator('.cat-tile[data-cat="Eletricistas"] .desc')).toHaveText('2 profissionais');
  await expect(page.locator('.cat-tile[data-cat="Eletricistas"]')).toHaveAttribute('href', '/eletricistas');
  for (const cat of ['Jardineiros', 'Carpinteiros']) {
    const tile = page.locator('.cat-tile[data-cat="' + cat + '"]');
    await expect(tile.locator('.desc')).toHaveText('Publica o pedido e avisamos quem trabalha perto');
    await expect(tile).toHaveAttribute('href', '/pedidos?publicar=1&cat=' + cat);
  }
  await expect(page.locator('body')).not.toContainText('Em breve');
});

test('a zona do cartão ignora localidades estragadas e listas de terras', async ({ page }) => {
  await abrir(page, [
    pro('1', { name: 'Estragada', location: 'Lisboa – I’m' }),
    pro('2', { name: 'Lista', location: 'Leiria – Caldas da Rainha, Nazare,Alcobaça' }),
    pro('3', { name: 'Normal', location: 'Braga – Guimarães' }),
  ]);
  const meta = (n) => page.locator('#proGrid .pro-card', { hasText: n }).locator('.pro-meta');
  await expect(meta('Estragada')).toHaveText('Eletricistas · Lisboa');
  await expect(meta('Lista')).toHaveText('Eletricistas · Caldas da Rainha');
  await expect(meta('Normal')).toHaveText('Eletricistas · Guimarães');
});

test('sem os tiques de site feito por IA: etiquetas por cima, passos numerados, emojis e faixa de vantagens', async ({ page }) => {
  await abrir(page, [pro('1')]);
  await expect(page.locator('main .kicker, main .hi-block, main .step-num, main .tag-pill, .value-strip')).toHaveCount(0);
  const texto = await page.locator('main').innerText();
  expect(texto).not.toMatch(/[🌀-🫿]|especialista certo|—/u);
});
