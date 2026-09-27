// Eventos do funil (window.flinkoTrack): só saem do browser com consentimento
// de cookies de análise, e levam só dados curtos (sem identificar a pessoa).
const { test, expect } = require('@playwright/test');
const path = require('path');

const FAKE_SDK_PATH = path.join(__dirname, 'fixtures', 'fake-supabase-sdk.js');
const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
const SB = 'https://cdwinidhtfxfxowflize.supabase.co';

async function abrir(page, analytics) {
  const enviados = [];
  await page.route(SUPABASE_CDN_URL, (route) => route.fulfill({ path: FAKE_SDK_PATH, contentType: 'text/javascript' }));
  await page.route(SB + '/rest/v1/**', (route) => {
    const req = route.request();
    if (req.method() === 'POST') enviados.push({ tabela: new URL(req.url()).pathname.split('/').pop(), body: JSON.parse(req.postData() || '{}') });
    return route.fulfill({ status: 201, body: '' });
  });
  await page.addInitScript((a) => {
    window.__testAuthConfig = { tableData: {} };
    if (a !== null) localStorage.setItem('flinko_cookie_consent', JSON.stringify({ necessary: true, analytics: a, ts: Date.now() }));
  }, analytics);
  await page.goto('/index.html');
  return enviados;
}

test('com consentimento: a pesquisa do topo é registada em site_events', async ({ page }) => {
  const enviados = await abrir(page, true);
  await expect.poll(() => enviados.some((e) => e.tabela === 'site_visits')).toBe(true);
  await page.evaluate(() => window.flinkoTrack('pesquisa', { q: 'eletricista', local: 'Braga', origem: 'home', lixo: 'x'.repeat(500) }));
  await expect.poll(() => enviados.find((e) => e.tabela === 'site_events')?.body).toMatchObject({ name: 'pesquisa', props: { q: 'eletricista', local: 'Braga', origem: 'home' } });
  const ev = enviados.find((e) => e.tabela === 'site_events').body;
  expect(ev.props.lixo.length).toBe(80); // textos cortados
  expect(ev.user_id).toBeUndefined(); // não diz quem é
});

test('sem consentimento (rejeitou ou ainda não decidiu): nenhum evento sai do browser', async ({ page }) => {
  for (const escolha of [false, null]) {
    const enviados = await abrir(page, escolha);
    await page.evaluate(() => window.flinkoTrack('pesquisa', { q: 'eletricista' }));
    await page.waitForTimeout(500);
    expect(enviados.filter((e) => e.tabela === 'site_events' || e.tabela === 'site_visits')).toEqual([]);
  }
});
