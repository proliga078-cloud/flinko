// Teste E2E do separador "Profissionais" em admin.html: quando
// stripe-webhook.js marca profiles.suspended=true por causa de uma
// contestação de pagamento (charge.dispute.created), o admin tem de
// conseguir VER isso (badge "🚩 Disputado", distinto do badge normal de
// aprovação) e reverter depois de rever o caso — caso contrário a marca
// automática é um beco sem saída sem UI nenhuma para a tratar.
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

test('perfil marcado suspended=true (por disputa) mostra o badge "Disputado" e pode ser resolvido', async ({ page }) => {
  const pros = [
    { id: 'pro-1', name: 'Profissional Disputado', category: 'Eletricistas', location: 'Porto', plan: 'pro', approved: true, suspended: true, credits: 0 },
    { id: 'pro-2', name: 'Profissional Normal', category: 'Pintores', location: 'Braga', plan: 'free', approved: true, suspended: false, credits: 0 },
  ];
  await withFakeSupabase(page, {
    session: { access_token: 'admin-tok', user: { id: 'admin-1', email: 'davidscampos10@gmail.com' } },
    rpcResults: { is_admin: true, admin_list_profiles: pros },
    tableData: { profiles: { data: pros }, profile_private: { data: [] } },
  });
  page.on('dialog', (dialog) => dialog.accept());

  await page.goto('/admin.html');
  await page.waitForSelector('#admin-panel', { state: 'visible' });
  await page.click('text=👤 Profissionais');

  const disputedRow = page.locator('#pros-tbody tr', { hasText: 'Profissional Disputado' });
  const normalRow = page.locator('#pros-tbody tr', { hasText: 'Profissional Normal' });
  await expect(disputedRow.locator('text=🚩 Disputado')).toBeVisible();
  await expect(normalRow.locator('text=🚩 Disputado')).toHaveCount(0);

  await disputedRow.locator('button:has-text("Resolver disputa")').click();
  const updateCalls = await page.evaluate(() => window.__updateCalls || []);
  const resolveCall = updateCalls.find((c) => c.table === 'profiles' && 'suspended' in c.patch);
  expect(resolveCall).toBeTruthy();
  expect(resolveCall.patch).toEqual({ suspended: false });
});
