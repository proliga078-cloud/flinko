// Pedido de avaliação quando um trabalho fica pago (dashboard.html).
//
// O dashboard chama /.netlify/functions/review-request, que cria um link de
// avaliação de uso único e avisa o cliente (email com estrelas, push e
// mensagem na conversa). Quando o cliente não tem conta na Flinko, o dashboard
// mostra o link para o profissional o enviar à mão (WhatsApp ou copiar).
const { test, expect } = require('@playwright/test');
const path = require('path');

const FAKE_SDK_PATH = path.join(__dirname, 'fixtures', 'fake-supabase-sdk.js');
const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3';

async function withFakeSupabase(page, config) {
  await page.route(SUPABASE_CDN_URL, (route) => route.fulfill({ path: FAKE_SDK_PATH, contentType: 'text/javascript' }));
  await page.addInitScript((cfg) => { window.__testAuthConfig = cfg; }, config);
}

function proConfig(jobOverrides) {
  const profile = { id: 'pro-1', slug: 'joao-eletricista', name: 'João Eletricista', plan: 'free', account_type: 'professional', category: 'Eletricistas', location: 'Porto' };
  const job = { id: 'job-1', professional_id: 'pro-1', client_id: 'cli-1', conversation_id: 'conv-1', status: 'agendado', title: 'Instalação elétrica', client_name: 'Maria Cliente', quote_amount: 150, ...jobOverrides };
  return {
    session: { access_token: 'pro-tok', user: { id: 'pro-1', email: 'pro@example.com' } },
    rpcResults: { get_my_profile: [profile] },
    tableData: { plan_limits: { data: [] }, jobs: { data: [job] }, messages: { data: [] } },
  };
}

async function markJobPaid(page) {
  await page.goto('/dashboard.html');
  await page.click('[data-page="trabalhos"]');
  await page.waitForSelector('.job-card[data-id="job-1"]');
  await page.locator('.job-card[data-id="job-1"] select').selectOption('pago');
}

test('marcar trabalho como pago: pede a avaliação ao servidor (review-request) com a sessão do profissional', async ({ page }) => {
  await withFakeSupabase(page, proConfig());
  const calls = [];
  await page.route('**/.netlify/functions/review-request', (route) => {
    calls.push({ auth: route.request().headers()['authorization'], body: JSON.parse(route.request().postData()) });
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ link: 'https://flinko.pt/avaliar.html?t=abc', sent: true }) });
  });
  await markJobPaid(page);
  await expect.poll(() => calls.length).toBeGreaterThan(0);
  expect(calls[0].auth).toBe('Bearer pro-tok');
  expect(calls[0].body).toEqual({ jobId: 'job-1' });
  await expect(page.getByRole('status').filter({ hasText: 'Pedimos a avaliação ao cliente' })).toBeVisible();
});

test('cliente sem conta na Flinko: mostra o link de avaliação para enviar no WhatsApp', async ({ page }) => {
  await withFakeSupabase(page, proConfig({ client_id: null, conversation_id: null }));
  await page.route('**/.netlify/functions/review-request', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ link: 'https://flinko.pt/avaliar.html?t=abc', sent: false }) }));
  await markJobPaid(page);
  const box = page.getByRole('dialog', { name: 'Pedir avaliação' });
  await expect(box).toBeVisible();
  await expect(box.locator('input')).toHaveValue('https://flinko.pt/avaliar.html?t=abc');
  await expect(box.getByRole('link', { name: 'Enviar no WhatsApp' })).toHaveAttribute('href', /wa\.me\/\?text=.*avaliar\.html/);
});

test('convidar um cliente antigo: cria um link de uso único e mostra-o para enviar', async ({ page }) => {
  await withFakeSupabase(page, { ...proConfig(), insertReturn: { token: 'tok9' } });
  await page.goto('/dashboard.html');
  await page.evaluate(() => showPage('reviews'));
  await page.locator('#inv-name').fill('Carlos Mendes');
  await page.getByRole('button', { name: 'Criar link de avaliação' }).click();
  const box = page.getByRole('dialog', { name: 'Pedir avaliação' });
  await expect(box.locator('input')).toHaveValue('https://flinko.pt/avaliar.html?t=tok9');
  const ins = await page.evaluate(() => window.__insertCalls.find((c) => c.table === 'review_invites').row);
  expect(ins).toEqual({ professional_id: 'pro-1', client_name: 'Carlos Mendes' });
});
