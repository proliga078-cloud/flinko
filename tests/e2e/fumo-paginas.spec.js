// Teste de fumo: abre todas as páginas do site (sem sessão) e falha se alguma
// rebentar com um erro de JavaScript. Apanha scripts partidos, variáveis por
// definir e ficheiros em falta antes de chegarem aos utilizadores.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const FAKE_SDK_PATH = path.join(__dirname, 'fixtures', 'fake-supabase-sdk.js');
const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3';
const RAIZ = path.join(__dirname, '..', '..');

const paginas = fs.readdirSync(RAIZ).filter((f) => f.endsWith('.html')).sort();

for (const pagina of paginas) {
  test(`sem erros de JavaScript: ${pagina}`, async ({ page }) => {
    const erros = [];
    page.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
    // Só pedidos ao próprio site: fontes, mapas e CDNs externos não interessam aqui.
    page.on('response', (r) => {
      const u = new URL(r.url());
      if (u.origin === new URL(page.url() || 'http://localhost').origin && r.status() >= 400 && !/favicon/.test(u.pathname)) {
        erros.push(`HTTP ${r.status()}: ${u.pathname}`);
      }
    });
    await page.route(SUPABASE_CDN_URL, (route) => route.fulfill({ path: FAKE_SDK_PATH, contentType: 'text/javascript' }));
    await page.route(/^https?:\/\/(?!localhost)/, (route) => {
      if (route.request().url() === SUPABASE_CDN_URL) return route.fallback();
      return route.abort();
    });
    await page.addInitScript(() => { window.__testAuthConfig = { session: null, tableData: {} }; });
    await page.goto('/' + pagina, { waitUntil: 'load' });
    await page.waitForTimeout(600);
    expect(erros, erros.join('\n')).toEqual([]);
  });
}

// Páginas privadas com sessão iniciada (profissional, cliente e admin).
const perfis = {
  profissional: { id: 'u1', name: 'Ana Teste', plan: 'pro', account_type: 'professional', category: 'Eletricistas', location: 'Porto', bio: 'Bio', photo_url: null, notify_email: true, notify_digest: true },
  cliente: { id: 'u1', name: 'Rui Cliente', plan: 'free', account_type: 'client', notify_email: true },
  admin: { id: 'u1', name: 'Admin', plan: 'pro', account_type: 'professional', category: 'Eletricistas', location: 'Porto' },
};
const privadas = ['dashboard.html', 'messages.html', 'pedidos.html', 'gestao.html', 'pricing.html'];

for (const [tipo, perfil] of Object.entries(perfis)) {
  for (const pagina of privadas) {
    if (pagina === 'gestao.html' && tipo !== 'admin') continue;
    test(`sem erros de JavaScript com sessão (${tipo}): ${pagina}`, async ({ page }) => {
      const erros = [];
      page.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
      await page.route(SUPABASE_CDN_URL, (route) => route.fulfill({ path: FAKE_SDK_PATH, contentType: 'text/javascript' }));
      await page.route(/^https?:\/\/(?!localhost)/, (route) => (route.request().url() === SUPABASE_CDN_URL ? route.fallback() : route.abort()));
      await page.addInitScript((cfg) => { window.__testAuthConfig = cfg; }, {
        session: { access_token: 'tok', user: { id: 'u1', email: 'x@example.com' } },
        rpcResults: { get_my_profile: [perfil], is_admin: tipo === 'admin' },
        tableData: { plan_limits: { data: [] } },
      });
      await page.goto('/' + pagina, { waitUntil: 'load' });
      await page.waitForTimeout(1200);
      expect(erros, erros.join('\n')).toEqual([]);
    });
  }
}
