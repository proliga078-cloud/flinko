// Testa os tiles de categoria da homepage (index.html, .cat-tile[data-cat]).
//
// Regra (ver loadCategoryCounts()): o tile mostra a contagem REAL de
// profissionais ("2 profissionais", "1 profissional") só quando é maior que
// zero. Categorias ainda vazias levam a publicar o pedido nessa categoria,
// nunca "0 profissionais", que desencorajava e não acrescentava nada. Todos os tiles
// ficam sempre visíveis e com link para a página da categoria.
const { test, expect } = require('@playwright/test');
const path = require('path');

const FAKE_SDK_PATH = path.join(__dirname, 'fixtures', 'fake-supabase-sdk.js');
const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3';

async function withFakeSupabase(page, config) {
  await page.route(SUPABASE_CDN_URL, (route) =>
    route.fulfill({ path: FAKE_SDK_PATH, contentType: 'text/javascript' })
  );
  await page.addInitScript((cfg) => {
    window.__testAuthConfig = cfg;
  }, config);
}

const prof = (id, category) => ({ id, name: 'P' + id, category, location: 'Porto', plan: 'free', verified: true, account_type: 'professional' });

test.describe('index.html — tiles de categoria com contagem real', () => {
  test('mostra a contagem no singular/plural quando há profissionais, e não mostra "0" nas vazias', async ({ page }) => {
    await withFakeSupabase(page, {
      tableData: {
        profiles: { data: [prof('1', 'Eletricistas'), prof('2', 'Eletricistas'), prof('3', 'Pintores')] },
        reviews: { data: [] }, requests: { data: [] }, ad_slots: { data: [] },
      },
    });
    await page.goto('/index.html');

    await expect(page.locator('.cat-tile[data-cat="Eletricistas"] .desc')).toHaveText('2 profissionais');
    await expect(page.locator('.cat-tile[data-cat="Pintores"] .desc')).toHaveText('1 profissional');

    const vazia = page.locator('.cat-tile[data-cat="Jardineiros"] .desc');
    await expect(vazia).not.toHaveText(/^\d+ profission/);
  });

  test('todos os tiles continuam visíveis e com link, mesmo sem nenhum profissional', async ({ page }) => {
    await withFakeSupabase(page, {
      tableData: { profiles: { data: [] }, reviews: { data: [] }, requests: { data: [] }, ad_slots: { data: [] } },
    });
    await page.goto('/index.html');
    const tiles = page.locator('.cat-tile[data-cat]');
    expect(await tiles.count()).toBeGreaterThan(0);
    const hrefs = await tiles.evaluateAll((els) => els.map((e) => e.getAttribute('href')));
    expect(hrefs.every((h) => h && h.startsWith('/'))).toBe(true);
  });
});
