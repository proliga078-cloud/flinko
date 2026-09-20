// "Divulga o teu perfil" (dashboard) e o cartaz com QR (cartaz.html).
const { test, expect } = require('@playwright/test');
const path = require('path');

const FAKE_SDK_PATH = path.join(__dirname, 'fixtures', 'fake-supabase-sdk.js');
const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

async function fake(page, cfg) {
  await page.route(SUPABASE_CDN_URL, (route) => route.fulfill({ path: FAKE_SDK_PATH, contentType: 'text/javascript' }));
  await page.route(/^https?:\/\/(?!localhost)/, (route) => (route.request().url() === SUPABASE_CDN_URL ? route.fallback() : route.abort()));
  await page.addInitScript((c) => { window.__testAuthConfig = c; }, cfg);
}

const perfil = (extra) => ({
  id: '11111111-2222-3333-4444-555555555555', name: 'Ana <b>Teste</b>', plan: 'free', account_type: 'professional',
  category: 'Eletricistas', location: 'Porto', bio: 'Bio', photo_url: 'https://example.com/f.jpg', notify_email: true, notify_digest: true, ...extra,
});

test('dashboard: mostra link, WhatsApp e cartaz do perfil (plano grátis usa profile.html?id=)', async ({ page }) => {
  const p = perfil({});
  await fake(page, {
    session: { access_token: 'tok', user: { id: p.id, email: 'a@example.com' } },
    rpcResults: { get_my_profile: [p] },
    tableData: { plan_limits: { data: [] } },
  });
  await page.goto('/dashboard.html');
  const link = page.locator('#share-url');
  await expect(link).toContainText('profile.html?id=' + p.id);
  await expect(page.locator('#share-wa')).toHaveAttribute('href', /^https:\/\/wa\.me\/\?text=.+profile\.html%3Fid%3D/);
  await expect(page.locator('#share-poster')).toHaveAttribute('href', 'cartaz.html?id=' + p.id);
});

test('dashboard: com link próprio usa /o-nome', async ({ page }) => {
  const p = perfil({ slug: 'ana-eletricista', plan: 'pro' });
  await fake(page, {
    session: { access_token: 'tok', user: { id: p.id, email: 'a@example.com' } },
    rpcResults: { get_my_profile: [p] },
    tableData: { plan_limits: { data: [{ plan: 'pro', custom_link: true }] } },
  });
  await page.goto('/dashboard.html');
  await expect(page.locator('#share-url')).toHaveText('localhost:4173/ana-eletricista');
});

test('cartaz: mostra nome, categoria e endereço, e escapa HTML', async ({ page }) => {
  const p = perfil({});
  await fake(page, { session: null, tableData: { profiles: { data: [p] } } });
  await page.goto('/cartaz.html?id=' + p.id);
  await expect(page.locator('.nome')).toHaveText('Ana <b>Teste</b>');
  await expect(page.locator('.top h1')).toContainText('Eletricistas');
  await expect(page.locator('.url')).toContainText('profile.html?id=' + p.id);
  expect(await page.locator('.nome b').count()).toBe(0);
});

test('cartaz: id inválido mostra mensagem em vez de rebentar', async ({ page }) => {
  await fake(page, { session: null, tableData: {} });
  await page.goto('/cartaz.html?id=<script>');
  await expect(page.locator('.err')).toContainText('Perfil não encontrado');
});
