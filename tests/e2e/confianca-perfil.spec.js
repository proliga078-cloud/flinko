// Perfil público (out/2026): avaliar pede sessão, contas de cliente não têm
// página pública, e os "semelhantes" mostram os planos pagos primeiro.
const { test, expect } = require('@playwright/test');
const path = require('path');

const FAKE_SDK_PATH = path.join(__dirname, 'fixtures', 'fake-supabase-sdk.js');
const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3';

const PRO = {
  id: 'pro-1', account_type: 'professional', name: 'Ana Jardineira', bio: 'Bio', category: 'Jardineiros', location: 'Lisboa – Lisboa',
  slug: null, plan: 'free', verified: true, created_at: '2026-01-01T00:00:00Z', is_demo: false, suspended: false, approved: true,
};

async function abrir(page, { session = null, profiles = [PRO], insertError } = {}) {
  await page.route(SUPABASE_CDN_URL, (route) => route.fulfill({ path: FAKE_SDK_PATH, contentType: 'text/javascript' }));
  await page.addInitScript((cfg) => { window.__testAuthConfig = cfg; }, {
    session, insertError,
    tableData: { profiles: { data: profiles }, reviews: { data: [] } },
  });
  await page.goto('/profile.html?id=' + profiles[0].id);
}
const abrirAvaliacoes = (page) => page.getByRole('button', { name: 'Avaliar' }).click();

test('sem sessão, "Entrar para avaliar" leva ao login e volta ao perfil', async ({ page }) => {
  await abrir(page);
  await abrirAvaliacoes(page);
  await expect(page.locator('#rev-btn')).toHaveText('Entrar para avaliar');
  await page.click('#rev-btn');
  await page.waitForURL(/auth\.html\?tab=login&intent=client&redirect=/);
  expect(decodeURIComponent(page.url())).toContain('redirect=/profile.html?id=pro-1');
});

test('com sessão, a recusa do servidor ("só quem falou contigo") aparece tal e qual', async ({ page }) => {
  await abrir(page, {
    session: { access_token: 't', user: { id: 'cli-1', email: 'rui@example.com' } },
    insertError: 'Só podes avaliar um profissional com quem falaste na Flinko.',
  });
  await abrirAvaliacoes(page);
  await expect(page.locator('#rev-btn')).toHaveText('Publicar avaliação');
  await page.fill('#rev-name', 'Rui');
  await page.click('.star-btn[data-v="5"]');
  await page.click('#rev-btn');
  await expect(page.locator('#rev-error')).toContainText('com quem falaste');
  const ins = await page.evaluate(() => window.__insertCalls.find((c) => c.table === 'reviews').row);
  expect(ins).toMatchObject({ professional_id: 'pro-1', client_id: 'cli-1', reviewer_email: 'rui@example.com', rating: 5 });
});

test('conta de cliente: não mostra perfil público e fica noindex', async ({ page }) => {
  await abrir(page, { profiles: [{ ...PRO, id: 'cli-9', account_type: 'client', name: 'Cliente Qualquer', category: '' }] });
  await expect(page.locator('#profile-header')).toContainText('não encontrado');
  await expect(page.locator('#meta-robots')).toHaveAttribute('content', 'noindex, nofollow');
  await expect(page.locator('body')).not.toContainText('Cliente Qualquer');
});
