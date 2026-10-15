// Testes E2E do fluxo de "Privacidade e RGPD" em dashboard.html (Art. 15º
// direito de acesso / Art. 17º direito ao apagamento). Antes deste fix não
// havia forma de o utilizador pedir isto diretamente na conta — só por
// email manual, sem registo nenhum do lado da Flinko. Agora o pedido cria
// uma linha na tabela gdpr_requests (RLS: só o próprio dono e admins veem/
// tratam), visível também no painel admin.
//
// Nota importante: este ecrã tem de estar visível tanto para profissionais
// como para clientes — dashboard.html esconde a maior parte dos separadores
// para contas 'client' (ver hidePages em init()), por isso um dos testes
// abaixo confirma explicitamente que "Privacidade e RGPD" NÃO fica escondido
// nesse caso (seria fácil recriar o mesmo bug de exclusão aqui).
const { test, expect } = require('@playwright/test');
const path = require('path');

const FAKE_SDK_PATH = path.join(__dirname, 'fixtures', 'fake-supabase-sdk.js');
const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3';

async function withFakeSupabase(page, config) {
  await page.route(SUPABASE_CDN_URL, (route) =>
    route.fulfill({ path: FAKE_SDK_PATH, contentType: 'text/javascript' })
  );
  await page.addInitScript((cfg) => {
    window.__testAuthConfig = cfg;
  }, config);
}

function baseConfig(overrides) {
  const profile = {
    id: 'pro-1',
    name: 'Profissional Teste',
    plan: 'free',
    account_type: 'professional',
    notify_email: true,
    notify_digest: true,
    ...((overrides && overrides.profile) || {}),
  };
  return {
    session: { access_token: 'tok', user: { id: 'pro-1', email: 'pro@example.com' } },
    rpcResults: { get_my_profile: [profile] },
    tableData: {
      gdpr_requests: { data: (overrides && overrides.gdprRequests) || [] },
      plan_limits: { data: [] },
    },
  };
}

test.describe('dashboard.html — Privacidade e RGPD', () => {
  test('separador fica visível e o pedido de exportação regista um insert em gdpr_requests', async ({ page }) => {
    await withFakeSupabase(page, baseConfig());
    page.on('dialog', (dialog) => dialog.accept());

    await page.goto('/dashboard.html');
    await page.waitForSelector('.nav-item[data-page="privacidade"]');
    await expect(page.locator('.nav-item[data-page="privacidade"]')).toBeVisible();

    await page.click('.nav-item[data-page="privacidade"]');
    await expect(page.locator('#page-privacidade')).toHaveClass(/active/);

    await page.click('text=Pedir exportação dos dados');
    await expect(page.locator('#gdpr-success')).toBeVisible();

    const insertCalls = await page.evaluate(() => window.__insertCalls || []);
    const gdprInserts = insertCalls.filter((c) => c.table === 'gdpr_requests');
    expect(gdprInserts).toHaveLength(1);
    expect(gdprInserts[0].row).toEqual({ profile_id: 'pro-1', request_type: 'export' });
  });

  test('pedido de eliminação pede confirmação e regista request_type "delete"', async ({ page }) => {
    await withFakeSupabase(page, baseConfig());
    let confirmMessage = null;
    page.on('dialog', (dialog) => {
      confirmMessage = dialog.message();
      dialog.accept();
    });

    await page.goto('/dashboard.html');
    await page.click('.nav-item[data-page="privacidade"]');
    await page.click('text=Pedir eliminação da conta');

    expect(confirmMessage).toContain('30 dias');
    const insertCalls = await page.evaluate(() => window.__insertCalls || []);
    const deleteInsert = insertCalls.find((c) => c.table === 'gdpr_requests' && c.row.request_type === 'delete');
    expect(deleteInsert).toBeTruthy();
  });

  test('se o utilizador cancelar a confirmação, não é criado nenhum pedido', async ({ page }) => {
    await withFakeSupabase(page, baseConfig());
    page.on('dialog', (dialog) => dialog.dismiss());

    await page.goto('/dashboard.html');
    await page.click('.nav-item[data-page="privacidade"]');
    await page.click('text=Pedir eliminação da conta');

    const insertCalls = await page.evaluate(() => window.__insertCalls || []);
    expect(insertCalls.filter((c) => c.table === 'gdpr_requests')).toHaveLength(0);
  });

  test('lista pedidos existentes com estado, e mostra "Cancelar" só para pedidos pendentes', async ({ page }) => {
    await withFakeSupabase(page, baseConfig({
      gdprRequests: [
        { id: 'req-1', profile_id: 'pro-1', request_type: 'export', status: 'pending', created_at: '2026-08-01T10:00:00Z' },
        { id: 'req-2', profile_id: 'pro-1', request_type: 'delete', status: 'completed', created_at: '2026-07-01T10:00:00Z' },
      ],
    }));

    await page.goto('/dashboard.html');
    await page.click('.nav-item[data-page="privacidade"]');

    const rows = page.locator('#gdpr-list > div');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('Exportação de dados');
    await expect(rows.nth(0)).toContainText('Pendente');
    await expect(rows.nth(0).locator('button:has-text("Cancelar")')).toBeVisible();
    await expect(rows.nth(1)).toContainText('Concluído');
    await expect(rows.nth(1).locator('button:has-text("Cancelar")')).toHaveCount(0);
  });

  test('cancelar um pedido pendente chama update() com status="cancelled"', async ({ page }) => {
    await withFakeSupabase(page, baseConfig({
      gdprRequests: [
        { id: 'req-1', profile_id: 'pro-1', request_type: 'export', status: 'pending', created_at: '2026-08-01T10:00:00Z' },
      ],
    }));
    page.on('dialog', (dialog) => dialog.accept());

    await page.goto('/dashboard.html');
    await page.click('.nav-item[data-page="privacidade"]');
    await page.click('#gdpr-list button:has-text("Cancelar")');

    const updateCalls = await page.evaluate(() => window.__updateCalls || []);
    const cancelCall = updateCalls.find((c) => c.table === 'gdpr_requests');
    expect(cancelCall).toBeTruthy();
    expect(cancelCall.patch).toEqual({ status: 'cancelled' });
  });

  test('conta de cliente (account_type=client): "Privacidade e RGPD" continua visível apesar dos outros separadores serem escondidos', async ({ page }) => {
    await withFakeSupabase(page, baseConfig({ profile: { account_type: 'client' } }));

    await page.goto('/dashboard.html');
    await page.waitForSelector('.nav-item[data-page="myrequests"]');

    // Regressão a vigiar: hidePages em init() esconde 'profile', 'financas', etc.
    // para clientes. "privacidade" tem de ficar de fora dessa lista.
    await expect(page.locator('.nav-item[data-page="profile"]')).toBeHidden();
    await expect(page.locator('.nav-item[data-page="privacidade"]')).toBeVisible();

    await page.click('.nav-item[data-page="privacidade"]');
    await expect(page.locator('#page-privacidade')).toHaveClass(/active/);
    await expect(page.locator('text=Pedir exportação dos dados')).toBeVisible();
  });
});
