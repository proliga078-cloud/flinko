// Teste E2E: a tabela "Todas as Contas" em admin.html misturava profissionais
// e clientes sem qualquer distinção — um cliente que só queria pedir um
// serviço aparecia com o mesmo aviso "⚠️ Sem categoria" de um profissional
// que se esqueceu de preencher a categoria, tornando impossível ao admin
// distinguir os dois. Este teste cobre a separação: coluna "Tipo", filtro
// por tipo de conta (default "Só profissionais"), e o facto de uma conta
// cliente nunca mostrar o aviso de "sem categoria" (não se aplica a ela).
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

const accounts = [
  { id: 'p1', name: 'Henrique Silva', account_type: 'professional', category: 'Eletricistas', location: 'Porto', plan: 'pro', approved: true, credits: 0 },
  { id: 'p2', name: 'Ana Cliente', account_type: 'client', category: '', location: 'Lisboa', plan: 'free', approved: true, credits: 0 },
  { id: 'p3', name: 'Profissional Antigo', category: 'Jardineiros', location: 'Aveiro', plan: 'free', approved: true, credits: 0 }, // sem account_type = registo antigo, era o default
];

test.describe('admin.html separa contas de cliente e de profissional', () => {
  test('por omissão só mostra profissionais (registos antigos sem account_type contam como profissional)', async ({ page }) => {
    await withFakeSupabase(page, {
      session: { access_token: 'admin-tok', user: { id: 'admin-1', email: 'admin@example.com' } },
      rpcResults: { is_admin: true, admin_list_profiles: accounts },
      tableData: { profiles: { data: accounts }, profile_private: { data: [] } },
    });

    await page.goto('/admin.html');
    await page.waitForSelector('#admin-panel', { state: 'visible' });
    await page.click('text=👤 Profissionais');

    await expect(page.locator('#pros-tbody tr')).toHaveCount(2);
    await expect(page.locator('#pros-tbody', { hasText: 'Henrique Silva' })).toBeVisible();
    await expect(page.locator('#pros-tbody', { hasText: 'Profissional Antigo' })).toBeVisible();
    await expect(page.locator('#pros-tbody', { hasText: 'Ana Cliente' })).toHaveCount(0);
  });

  test('filtro "Só clientes" mostra só clientes, e a conta cliente não tem o aviso "Sem categoria"', async ({ page }) => {
    await withFakeSupabase(page, {
      session: { access_token: 'admin-tok', user: { id: 'admin-1', email: 'admin@example.com' } },
      rpcResults: { is_admin: true, admin_list_profiles: accounts },
      tableData: { profiles: { data: accounts }, profile_private: { data: [] } },
    });

    await page.goto('/admin.html');
    await page.waitForSelector('#admin-panel', { state: 'visible' });
    await page.click('text=👤 Profissionais');
    await page.selectOption('#pros-type-filter', 'client');

    await expect(page.locator('#pros-tbody tr')).toHaveCount(1);
    const row = page.locator('#pros-tbody tr', { hasText: 'Ana Cliente' });
    await expect(row).toBeVisible();
    await expect(row.locator('.badge-acc-client', { hasText: 'Cliente' })).toBeVisible();
    await expect(row.locator('text=⚠️ Sem categoria')).toHaveCount(0);
  });

  test('filtro "Todos" mostra as duas contas com o badge de Tipo correto', async ({ page }) => {
    await withFakeSupabase(page, {
      session: { access_token: 'admin-tok', user: { id: 'admin-1', email: 'admin@example.com' } },
      rpcResults: { is_admin: true, admin_list_profiles: accounts },
      tableData: { profiles: { data: accounts }, profile_private: { data: [] } },
    });

    await page.goto('/admin.html');
    await page.waitForSelector('#admin-panel', { state: 'visible' });
    await page.click('text=👤 Profissionais');
    await page.selectOption('#pros-type-filter', '');

    await expect(page.locator('#pros-tbody tr')).toHaveCount(3);
    const proRow = page.locator('#pros-tbody tr', { hasText: 'Henrique Silva' });
    const clientRow = page.locator('#pros-tbody tr', { hasText: 'Ana Cliente' });
    await expect(proRow.locator('.badge-acc-pro', { hasText: 'Profissional' })).toBeVisible();
    await expect(clientRow.locator('.badge-acc-client', { hasText: 'Cliente' })).toBeVisible();
    // Profissional sem categoria continua a merecer o aviso — é um problema real para ele.
    await expect(page.locator('#pros-tbody tr', { hasText: 'Henrique Silva' }).locator('text=⚠️ Sem categoria')).toHaveCount(0);
  });
});
