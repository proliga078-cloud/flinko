// Teste E2E de XSS refletido em categoria.html via o parâmetro de URL
// ?loc=. Contexto: auditoria total ao site (ago/2026) encontrou
// updateHeader() a montar `desc` (que inclui `loc`, lido diretamente de
// location.search sem qualquer validação) e a inseri-lo em
// #page-desc.innerHTML. Como `desc` nunca precisou de conter markup (é só
// texto simples), a correção passou a usar .textContent em vez de
// .innerHTML — elimina o vetor de injeção por completo em vez de apenas
// escapar, o que também protege qualquer utilização futura deste campo.
const { test, expect } = require('@playwright/test');
const path = require('path');

const FAKE_SDK_PATH = path.join(__dirname, 'fixtures', 'fake-supabase-sdk.js');
const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

async function withFakeSupabase(page, config) {
  await page.route(SUPABASE_CDN_URL, (route) =>
    route.fulfill({ path: FAKE_SDK_PATH, contentType: 'text/javascript' })
  );
  await page.addInitScript((cfg) => {
    window.__testAuthConfig = cfg;
  }, config);
}

test.describe('categoria.html — parâmetro ?loc= não permite XSS refletido', () => {
  test('valor malicioso de ?loc= aparece como texto literal em #page-desc, HTML não é injetado', async ({ page }) => {
    const payload = '<img src=x onerror="window.__xss=true">';
    await withFakeSupabase(page, { tableData: { profiles: { count: 0, data: [] } } });
    await page.goto('/categoria.html?loc=' + encodeURIComponent(payload));
    await page.waitForFunction(() => document.getElementById('page-desc').textContent.length > 0);

    const descText = await page.locator('#page-desc').textContent();
    expect(descText).toContain(payload);
    await expect(page.locator('#page-desc img')).toHaveCount(0);
    const xssRan = await page.evaluate(() => window.__xss === true);
    expect(xssRan).toBe(false);
  });
});
