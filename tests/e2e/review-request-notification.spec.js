// Testes E2E do aviso (email/push) do pedido automático de avaliação.
//
// Contexto: o estudo de mercado da homepage (Baymard/Spiegel/NN-g) apontou
// 0 avaliações na plataforma como o problema #1 de confiança. A investigação
// deste ficheiro confirmou que já existe um fluxo automático completo:
// dashboard-jobs.js->requestReviewForJob() já insere, assim que um trabalho
// fica "pago", uma mensagem de chat a pedir avaliação com link para o
// perfil público, e profile.html já tem um formulário de avaliação real,
// protegido a nível de RLS (reviews_insert exige conversa existente).
//
// A lacuna real encontrada: essa mensagem automática ficava muda — só
// messages.html chama /.netlify/functions/notify-message (que envia
// email+push) depois de inserir uma mensagem; requestReviewForJob() nunca
// chamava essa função, por isso o cliente só via o pedido de avaliação se
// voltasse a abrir a Proliga por iniciativa própria. Corrigido chamando a
// mesma Netlify Function usada para mensagens normais.
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

function proConfig(jobOverrides, messagesData) {
  const profile = {
    id: 'pro-1',
    slug: 'joao-eletricista',
    name: 'João Eletricista',
    plan: 'free',
    account_type: 'professional',
    category: 'Eletricistas',
    location: 'Porto',
  };
  const job = {
    id: 'job-1',
    professional_id: 'pro-1',
    conversation_id: 'conv-1',
    status: 'agendado',
    title: 'Instalação elétrica',
    client_name: 'Maria Cliente',
    quote_amount: 150,
    ...jobOverrides,
  };
  return {
    session: { access_token: 'pro-tok', user: { id: 'pro-1', email: 'pro@example.com' } },
    rpcResults: { get_my_profile: [profile] },
    tableData: {
      plan_limits: { data: [] },
      jobs: { data: [job] },
      messages: { data: messagesData || [] },
    },
  };
}

async function markJobPaid(page) {
  await page.goto('/dashboard.html');
  await page.click('[data-page="trabalhos"]');
  await page.waitForSelector('.job-card[data-id="job-1"]');
  await page.locator('.job-card[data-id="job-1"] select').selectOption('pago');
}

test('marcar trabalho como pago: chama notify-message para avisar o cliente do pedido de avaliação', async ({ page }) => {
  await withFakeSupabase(page, proConfig());

  const calls = [];
  await page.route('**/.netlify/functions/notify-message', (route) => {
    calls.push({
      auth: route.request().headers()['authorization'],
      body: JSON.parse(route.request().postData()),
    });
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });

  await markJobPaid(page);
  await expect.poll(() => calls.length).toBeGreaterThan(0);

  expect(calls[0].auth).toBe('Bearer pro-tok');
  expect(calls[0].body.conversationId).toBe('conv-1');
  expect(calls[0].body.preview).toContain('deixa a tua avaliação');
  expect(calls[0].body.preview).toContain('joao-eletricista');
});

test('pedido de avaliação já enviado antes: não insere mensagem duplicada nem chama notify-message outra vez', async ({ page }) => {
  await withFakeSupabase(
    page,
    proConfig({}, [{ id: 'm-old', content: 'Obrigado! ... deixa a tua avaliação aqui: https://proliga.pt/joao-eletricista' }])
  );

  let notifyCalled = false;
  await page.route('**/.netlify/functions/notify-message', (route) => {
    notifyCalled = true;
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });

  await markJobPaid(page);
  // Dá tempo para o updateJobStatus/requestReviewForJob assíncronos correrem.
  await page.waitForTimeout(500);

  expect(notifyCalled).toBe(false);
  const insertCalls = await page.evaluate(() => window.__insertCalls || []);
  expect(insertCalls.some((c) => c.table === 'messages')).toBe(false);
});
