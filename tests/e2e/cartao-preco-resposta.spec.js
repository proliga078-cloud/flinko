// Cartões das listagens (out/2026): o preço passa a dizer a unidade
// ("€15/hora", "€40 por trabalho") e quem responde depressa mostra-o logo.
const { test, expect } = require('@playwright/test');
const path = require('path');

const FAKE_SDK_PATH = path.join(__dirname, 'fixtures', 'fake-supabase-sdk.js');
const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3';
const pro = (id, extra) => ({ id, name: 'Pro ' + id, category: 'Eletricistas', location: 'Porto', plan: 'free', approved: true, verified: true, account_type: 'professional', is_demo: false, avg_response_minutes: null, response_sample_count: 0, ...extra });

for (const pagina of ['/eletricistas.html', '/categoria.html']) test('cartão: preço com unidade e tempo de resposta real ' + pagina, async ({ page }) => {
  await page.route(SUPABASE_CDN_URL, (r) => r.fulfill({ path: FAKE_SDK_PATH, contentType: 'text/javascript' }));
  await page.addInitScript((cfg) => { window.__testAuthConfig = cfg; }, {
    tableData: {
      profiles: { data: [pro('a', { avg_response_minutes: 25, response_sample_count: 4 }), pro('b')] },
      reviews: { data: [] },
      services: { data: [{ professional_id: 'a', price_from: 15, price_unit: 'hora' }, { professional_id: 'b', price_from: 40, price_unit: 'trabalho' }] },
    },
  });
  await page.goto(pagina);
  const a = page.locator('.pro-card', { hasText: 'Pro a' });
  const b = page.locator('.pro-card', { hasText: 'Pro b' });
  await expect(a.locator('.pro-price')).toHaveText('A partir de €15/hora');
  await expect(a.locator('.pro-resp')).toHaveText('Responde em ~25 min');
  await expect(b.locator('.pro-price')).toHaveText('A partir de €40 por trabalho');
  await expect(b.locator('.pro-resp')).toHaveCount(0);
});
