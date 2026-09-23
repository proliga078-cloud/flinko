// Testes E2E do fix de reconciliação plano/Stripe em admin-classico.html.
//
// Bug de auditoria: "Reverter para Free" (e as outras edições de plano no
// admin) escreviam profiles.plan diretamente do browser sem tocar em
// stripe_subscription_id. Se o profissional tivesse uma subscrição Stripe
// ainda ativa, o cliente continuava a ser cobrado, e o próximo webhook do
// Stripe para essa subscrição reescrevia sozinho o plano antigo por cima da
// decisão do admin. Agora, sempre que existe stripe_subscription_id, a
// mudança de plano passa por /.netlify/functions/admin-set-plan (que
// cancela a subscrição a sério) em vez de um update direto à tabela.
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

test('perfil COM subscrição Stripe: "Reverter para Free" chama admin-set-plan em vez de escrever o plano diretamente', async ({ page }) => {
  await withFakeSupabase(page, adminConfig([
    { id: 'pro-1', name: 'Profissional Stripe', plan: 'pro', stripe_subscription_id: 'sub_ativa', credits: 0 },
  ]));
  page.on('dialog', (dialog) => dialog.accept());

  let functionCalledWith = null;
  await page.route('**/.netlify/functions/admin-set-plan', (route) => {
    functionCalledWith = JSON.parse(route.request().postData());
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, stripeCancelled: true }) });
  });

  await page.goto('/admin-classico.html');
  await page.waitForSelector('#admin-panel', { state: 'visible' });
  await page.click('text=💳 Subscrições');
  await page.click('button:has-text("✏️ Gerir")');
  await page.click('.btn-revert-free');

  expect(functionCalledWith).toEqual({ targetProfileId: 'pro-1', plan: 'free' });

  // Depois do sucesso da função, só plan_expires_at é atualizado diretamente
  // (o plano em si já foi tratado no servidor) — nunca um update direto de "plan".
  const updateCalls = await page.evaluate(() => window.__updateCalls || []);
  const directPlanUpdate = updateCalls.find((c) => c.table === 'profiles' && 'plan' in c.patch);
  expect(directPlanUpdate).toBeFalsy();
});

test('perfil SEM subscrição Stripe: "Reverter para Free" atualiza o perfil diretamente, sem chamar a função de servidor', async ({ page }) => {
  await withFakeSupabase(page, adminConfig([
    { id: 'pro-2', name: 'Profissional Manual', plan: 'pro', stripe_subscription_id: null, credits: 0 },
  ]));
  page.on('dialog', (dialog) => dialog.accept());

  let functionCalled = false;
  await page.route('**/.netlify/functions/admin-set-plan', (route) => {
    functionCalled = true;
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  });

  await page.goto('/admin-classico.html');
  await page.waitForSelector('#admin-panel', { state: 'visible' });
  await page.click('text=💳 Subscrições');
  await page.click('button:has-text("✏️ Gerir")');
  await page.click('.btn-revert-free');

  expect(functionCalled).toBe(false);
  const updateCalls = await page.evaluate(() => window.__updateCalls || []);
  const directPlanUpdate = updateCalls.find((c) => c.table === 'profiles' && c.patch.plan === 'free');
  expect(directPlanUpdate).toBeTruthy();
});

test('se admin-set-plan falhar, o admin vê o erro e o perfil não é tocado', async ({ page }) => {
  await withFakeSupabase(page, adminConfig([
    { id: 'pro-3', name: 'Profissional Com Erro', plan: 'pro', stripe_subscription_id: 'sub_falha', credits: 0 },
  ]));
  let alertMessage = null;
  page.on('dialog', (dialog) => {
    if (dialog.type() === 'alert') alertMessage = dialog.message();
    dialog.accept();
  });

  await page.route('**/.netlify/functions/admin-set-plan', (route) => {
    route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'Não foi possível cancelar no Stripe' }) });
  });

  await page.goto('/admin-classico.html');
  await page.waitForSelector('#admin-panel', { state: 'visible' });
  await page.click('text=💳 Subscrições');
  await page.click('button:has-text("✏️ Gerir")');
  await page.click('.btn-revert-free');

  await expect.poll(() => alertMessage).toContain('Não foi possível cancelar no Stripe');
  const updateCalls = await page.evaluate(() => window.__updateCalls || []);
  expect(updateCalls.filter((c) => c.table === 'profiles')).toHaveLength(0);
});
