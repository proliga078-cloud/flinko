// Core Web Vitals (out/2026): na página dos eletricistas o ecrã saltava
// (CLS 0,33; a Google pede menos de 0,1). A barra de números aparecia
// depois de carregar os perfis e empurrava a lista para baixo.
const { test, expect } = require('@playwright/test');
const path = require('path');

const FAKE_SDK_PATH = path.join(__dirname, 'fixtures', 'fake-supabase-sdk.js');
const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3';

const pro = (id) => ({ id, name: 'Pro ' + id, category: 'Eletricistas', location: 'Lisboa', plan: 'free', verified: true, approved: true, account_type: 'professional', is_demo: false, avg_response_minutes: 30, response_sample_count: 3 });

test('página de categoria: o ecrã não salta enquanto carrega (CLS < 0,1)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route(SUPABASE_CDN_URL, async (route) => { await new Promise((r) => setTimeout(r, 400)); route.fulfill({ path: FAKE_SDK_PATH, contentType: 'text/javascript' }); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  await page.addInitScript((cfg) => {
    window.__testAuthConfig = cfg;
    window.__cls = 0;
    new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__cls += e.value; })).observe({ type: 'layout-shift', buffered: true });
  }, { tableData: { profiles: { data: [pro('1'), pro('2')] }, reviews: { data: [] }, services: { data: [] } } });
  await page.goto('/eletricistas.html');
  await expect(page.locator('#cat-stats-row')).toBeVisible();
  await page.waitForTimeout(1500);
  const cls = await page.evaluate(() => window.__cls);
  expect(cls).toBeLessThan(0.1);
});

// Na página inicial, no telemóvel, o título mudava de altura quando o tipo de
// letra chegava (display=swap) e empurrava o resto (CLS 0,18). Com
// display=optional o browser só usa a letra se ela chegar logo no início.
test('página inicial: as letras a chegar tarde não fazem saltar o topo', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route(SUPABASE_CDN_URL, (route) => route.fulfill({ path: FAKE_SDK_PATH, contentType: 'text/javascript' }));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, async (route) => { await new Promise((r) => setTimeout(r, 900)); route.continue(); });
  await page.addInitScript((cfg) => {
    window.__testAuthConfig = cfg;
    window.__cls = 0;
    new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__cls += e.value; })).observe({ type: 'layout-shift', buffered: true });
  }, { tableData: { profiles: { data: [pro('1')] } }, rpcResults: { spotlight_pros: [] } });
  await page.goto('/index.html');
  await page.waitForTimeout(3000);
  expect(await page.evaluate(() => window.__cls)).toBeLessThan(0.1);
});

test('nenhuma página pública troca de tipo de letra depois de aparecer (display=swap)', async () => {
  const fs = require('fs');
  const raiz = path.join(__dirname, '..', '..');
  const com = fs.readdirSync(raiz).filter((f) => f.endsWith('.html') && f !== 'cartaz.html' && fs.readFileSync(path.join(raiz, f), 'utf8').includes('display=swap'));
  expect(com).toEqual([]);
});
