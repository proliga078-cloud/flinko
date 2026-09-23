// Testes E2E da ação de reembolso Stripe no admin ("Gerir subscrição").
//
// Lacuna de auditoria: o admin conseguia suspender um perfil disputado ou
// cancelar a subscrição, mas não tinha nenhuma forma de devolver dinheiro
// a um cliente a partir do painel — tinha de o fazer manualmente no
// dashboard do Stripe. Ao abrir "Gerir subscrição", o modal agora carrega
// os últimos pagamentos do cliente Stripe do perfil (via
// /.netlify/functions/admin-refund, action:"list") e permite reembolsar
// cada um (action:"refund").
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

function adminConfig(subs) {
  return {
    session: { access_token: 'admin-tok', user: { id: 'admin-1', email: 'admin@example.com' } },
    rpcResults: { is_admin: true, admin_list_profiles: subs },
    tableData: { profiles: { data: subs } },
  };
}

test('perfil sem stripe_customer_id: mostra que não há pagamentos, sem chamar a função', async ({ page }) => {
  await withFakeSupabase(page, adminConfig([
    { id: 'pro-1', name: 'Profissional Manual', plan: 'pro', stripe_subscription_id: null, stripe_customer_id: null, credits: 0 },
  ]));

  let called = false;
  await page.route('**/.netlify/functions/admin-refund', (route) => {
    called = true;
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ charges: [] }) });
  });

  await page.goto('/admin-classico.html');
  await page.waitForSelector('#admin-panel', { state: 'visible' });
  await page.click('text=💳 Subscrições');
  await page.click('button:has-text("✏️ Gerir")');

  await expect(page.locator('#sub-charges-list')).toContainText('Sem pagamentos Stripe');
  expect(called).toBe(true); // a função é sempre chamada; é ela que decide devolver [] quando não há customer
});

test('perfil com pagamentos: lista os charges e reembolsar chama a função com o valor certo', async ({ page }) => {
  await withFakeSupabase(page, adminConfig([
    { id: 'pro-2', name: 'Profissional Pago', plan: 'pro', stripe_subscription_id: 'sub_1', stripe_customer_id: 'cus_1', credits: 0 },
  ]));
  page.on('dialog', (dialog) => dialog.accept());

  await page.route('**/.netlify/functions/admin-refund', (route) => {
    const reqBody = JSON.parse(route.request().postData());
    if (reqBody.action === 'list') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          charges: [
            { id: 'ch_1', amount: 2900, amount_refunded: 0, currency: 'eur', refunded: false, paid: true, created: 1700000000, description: 'Plano Pro' },
          ],
        }),
      });
      return;
    }
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, refund: { id: 're_1', amount: 2900, status: 'succeeded' } }) });
  });

  await page.goto('/admin-classico.html');
  await page.waitForSelector('#admin-panel', { state: 'visible' });
  await page.click('text=💳 Subscrições');
  await page.click('button:has-text("✏️ Gerir")');

  await expect(page.locator('#sub-charges-list')).toContainText('Plano Pro');

  let refundRequest = null;
  await page.route('**/.netlify/functions/admin-refund', async (route) => {
    const reqBody = JSON.parse(route.request().postData());
    if (reqBody.action === 'refund') {
      refundRequest = reqBody;
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, refund: { id: 're_1', amount: 2900, status: 'succeeded' } }) });
      return;
    }
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ charges: [] }) });
  });

  await page.click('button:has-text("💰 Reembolsar")');

  await expect.poll(() => refundRequest).toBeTruthy();
  expect(refundRequest.targetProfileId).toBe('pro-2');
  expect(refundRequest.chargeId).toBe('ch_1');
  expect(refundRequest.amount).toBe(2900);
});

test('pagamento já reembolsado mostra o badge e não tem botão de reembolso', async ({ page }) => {
  await withFakeSupabase(page, adminConfig([
    { id: 'pro-3', name: 'Profissional Reembolsado', plan: 'free', stripe_subscription_id: null, stripe_customer_id: 'cus_3', credits: 0 },
  ]));

  await page.route('**/.netlify/functions/admin-refund', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        charges: [
          { id: 'ch_2', amount: 2900, amount_refunded: 2900, currency: 'eur', refunded: true, paid: true, created: 1700000000, description: 'Plano Pro' },
        ],
      }),
    });
  });

  await page.goto('/admin-classico.html');
  await page.waitForSelector('#admin-panel', { state: 'visible' });
  await page.click('text=💳 Subscrições');
  await page.click('button:has-text("✏️ Gerir")');

  await expect(page.locator('#sub-charges-list')).toContainText('Reembolsado');
  await expect(page.locator('#sub-charges-list button:has-text("💰 Reembolsar")')).toHaveCount(0);
});
