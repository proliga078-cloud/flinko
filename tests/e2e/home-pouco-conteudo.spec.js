// A homepage tem de parecer cuidada mesmo com pouco conteúdo dos profissionais:
// cartões sem bio nem experiência não ficam vazios, e categorias sem
// profissionais dizem todas o mesmo ("Em breve").
const { test, expect } = require('@playwright/test');
const path = require('path');

const FAKE_SDK_PATH = path.join(__dirname, 'fixtures', 'fake-supabase-sdk.js');
const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

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

test('categorias sem profissionais mostram "Em breve"; com profissionais mostram a contagem', async ({ page }) => {
  await abrir(page, [pro('1'), pro('2')]);
  await expect(page.locator('.cat-tile[data-cat="Eletricistas"] .desc')).toHaveText('2 profissionais');
  await expect(page.locator('.cat-tile[data-cat="Jardineiros"] .desc')).toHaveText('Em breve');
  await expect(page.locator('.cat-tile[data-cat="Carpinteiros"] .desc')).toHaveText('Em breve');
});
