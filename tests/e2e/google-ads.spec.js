// Medição do Google Ads (assets/tracking.js): só com consentimento de análise e
// com o id AW- definido; cada evento do funil com etiqueta vira uma conversão.
const { test, expect } = require('@playwright/test');
const path = require('path');

const FAKE_SDK_PATH = path.join(__dirname, 'fixtures', 'fake-supabase-sdk.js');
const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3';
const SB = 'https://cdwinidhtfxfxowflize.supabase.co';
const ADS = { id: 'AW-123456789', conversoes: { conta_criada: 'abcConta', pedido_publicado: 'abcPedido', perfil_contactar: '' } };

async function abrir(page, { analytics, ads }) {
  const pedidosGoogle = [];
  await page.route(SUPABASE_CDN_URL, (route) => route.fulfill({ path: FAKE_SDK_PATH, contentType: 'text/javascript' }));
  await page.route(SB + '/rest/v1/**', (route) => route.fulfill({ status: 201, body: '' }));
  await page.route('https://www.googletagmanager.com/**', (route) => { pedidosGoogle.push(route.request().url()); return route.fulfill({ contentType: 'text/javascript', body: '' }); });
  await page.addInitScript(({ a, ads }) => {
    window.__testAuthConfig = { tableData: {} };
    if (ads) window.FLINKO_GOOGLE_ADS = ads;
    if (a !== null) localStorage.setItem('flinko_cookie_consent', JSON.stringify({ necessary: true, analytics: a, ts: Date.now() }));
  }, { a: analytics, ads });
  await page.goto('/index.html');
  return pedidosGoogle;
}
const conversoes = (page) => page.evaluate(() => (window.dataLayer || []).map((a) => Array.from(a)).filter((a) => a[0] === 'event' && a[1] === 'conversion').map((a) => a[2].send_to));

test('com consentimento e id: carrega a etiqueta da Google e envia as conversões com etiqueta', async ({ page }) => {
  const pedidosGoogle = await abrir(page, { analytics: true, ads: ADS });
  await expect.poll(() => pedidosGoogle.length).toBe(1);
  expect(pedidosGoogle[0]).toContain('id=AW-123456789');
  const config = await page.evaluate(() => window.dataLayer.map((a) => Array.from(a)).find((a) => a[0] === 'config'));
  expect(config).toEqual(['config', 'AW-123456789', { allow_ad_personalization_signals: false }]);
  await page.evaluate(() => { window.flinkoTrack('pedido_publicado', { category: 'Eletricistas' }); window.flinkoTrack('pesquisa', { q: 'x' }); window.flinkoTrack('perfil_contactar', {}); });
  expect(await conversoes(page)).toEqual(['AW-123456789/abcPedido']); // pesquisa e contacto sem etiqueta não contam
});

test('eventos de antes do consentimento (na fila) também contam', async ({ page }) => {
  await abrir(page, { analytics: null, ads: ADS });
  await page.evaluate(() => window.flinkoTrack('conta_criada', { tipo: 'client' }));
  expect(await page.evaluate(() => window.dataLayer)).toBeUndefined();
  await page.evaluate(() => window.flinkoCookieConsent.set(true));
  await expect.poll(() => conversoes(page)).toEqual(['AW-123456789/abcConta']);
});

test('a configuração do site usa a conta Google Ads da Flinko e as três conversões', async ({ page }) => {
  const pedidosGoogle = await abrir(page, { analytics: true, ads: null });
  await expect.poll(() => pedidosGoogle.length).toBe(1);
  expect(pedidosGoogle[0]).toContain('id=AW-18002306256');
  await page.evaluate(() => ['conta_criada', 'pedido_publicado', 'perfil_contactar'].forEach((n) => window.flinkoTrack(n, {})));
  expect(await conversoes(page)).toEqual(['AW-18002306256/G8fwCMi__KUdENDJlYhD', 'AW-18002306256/xMabCMu5_KUdENDJlYhD', 'AW-18002306256/RRBiCI7uh6YdENDJlYhD']);
});

for (const [nome, caso] of [['sem consentimento', { analytics: false, ads: ADS }], ['com o id vazio', { analytics: true, ads: { id: '', conversoes: {} } }]]) {
  test(nome + ': nada da Google é carregado', async ({ page }) => {
    const pedidosGoogle = await abrir(page, caso);
    await page.evaluate(() => window.flinkoTrack && window.flinkoTrack('pedido_publicado', {}));
    await page.waitForTimeout(400);
    expect(pedidosGoogle).toHaveLength(0);
    expect(await page.evaluate(() => typeof window.gtag)).toBe('undefined');
  });
}
