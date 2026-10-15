// Testes E2E do widget "Mensagens recentes" do dashboard do profissional
// (assets/dashboard-stats.js, loadRecentMsgs()). Contexto: auditoria total
// ao site (ago/2026) encontrou aqui um XSS armazenado — nameMap[client_id]
// (nome do perfil do cliente, escolhido livremente por qualquer utilizador
// autenticado) e last_message (conteúdo de uma mensagem de chat, também
// escolhido livremente pelo remetente) eram inseridos em .innerHTML sem
// passar por escapeHtml(), ao contrário do resto do ficheiro (ex:
// loadRecentReviews(), que já escapava reviewer_name/comment
// corretamente). Um cliente malicioso podia por isso definir o nome do
// seu perfil, ou o texto de uma mensagem, como HTML/JS e teria esse
// código executado no dashboard autenticado do profissional assim que
// este abrisse a página — sem precisar de qualquer ação adicional do
// profissional além de ter uma conversa com esse cliente.
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

function baseConfig(tableOverrides) {
  const profile = {
    id: 'pro-1',
    name: 'Profissional Teste',
    plan: 'free',
    account_type: 'professional',
    category: 'Jardineiros',
    location: 'Porto',
  };
  return {
    session: { access_token: 'tok', user: { id: 'pro-1', email: 'pro@example.com' } },
    rpcResults: { get_my_profile: [profile] },
    tableData: {
      plan_limits: { data: [] },
      ...tableOverrides,
    },
  };
}

test.describe('dashboard.html — mensagens recentes não são vulneráveis a XSS', () => {
  test('nome do cliente com HTML malicioso aparece como texto, não é injetado nem executado', async ({ page }) => {
    const payload = '<img src=x onerror="window.__xss=true">';
    let alertFired = false;
    page.on('dialog', async (d) => { alertFired = true; await d.dismiss(); });

    await withFakeSupabase(page, baseConfig({
      conversations: {
        data: [{ id: 'c1', client_id: 'client-1', last_message: 'Olá, preciso de um orçamento', last_message_at: new Date().toISOString() }],
      },
      profiles: { data: [{ id: 'client-1', name: payload }] },
    }));
    await page.goto('/dashboard.html');
    await page.waitForSelector('#recent-msgs .msg-item');

    const fromText = await page.locator('#recent-msgs .msg-from').first().textContent();
    expect(fromText).toContain(payload);

    // O payload nunca deve existir como elemento real do DOM (teria de
    // estar apenas como texto escapado dentro de .msg-from).
    await expect(page.locator('#recent-msgs img[src="x"]')).toHaveCount(0);
    const xssRan = await page.evaluate(() => window.__xss === true);
    expect(xssRan).toBe(false);
    expect(alertFired).toBe(false);
  });

  test('conteúdo da última mensagem com HTML malicioso aparece como texto, não é injetado', async ({ page }) => {
    const payload = '<script>window.__xss2=true</script><b>oi</b>';
    await withFakeSupabase(page, baseConfig({
      conversations: {
        data: [{ id: 'c1', client_id: 'client-1', last_message: payload, last_message_at: new Date().toISOString() }],
      },
      profiles: { data: [{ id: 'client-1', name: 'Cliente Normal' }] },
    }));
    await page.goto('/dashboard.html');
    await page.waitForSelector('#recent-msgs .msg-item');

    const previewText = await page.locator('#recent-msgs .msg-preview').first().textContent();
    expect(previewText).toContain('<script>');
    await expect(page.locator('#recent-msgs b')).toHaveCount(0);
    const xssRan = await page.evaluate(() => window.__xss2 === true);
    expect(xssRan).toBe(false);
  });
});
