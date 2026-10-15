// "Click to WhatsApp" (links wa.me, sem Twilio nem envios automáticos).
//  - pedido.html: o cliente vê "Contactar pelo WhatsApp" nas propostas de quem
//    aceitou mostrar o número; os outros mostram a mensagem de fallback;
//  - dashboard.html: o profissional escolhe se o botão aparece.
const { test, expect } = require('@playwright/test');
const path = require('path');

const FAKE_SDK_PATH = path.join(__dirname, 'fixtures', 'fake-supabase-sdk.js');
const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3';

const CLI = 'cli-1', RUI = 'pro-rui', MARTA = 'pro-marta';
const PEDIDO = { id: 'req-1', client_id: CLI, title: 'Trocar quadro elétrico & tomadas', category: 'Eletricistas', location: 'Braga – Guimarães', description: 'Disjuntores a saltar #urgente', status: 'open', created_at: new Date().toISOString(), profiles: { name: 'Ana Silva' } };
const OFERTAS = [
  { id: 'of-rui', request_id: 'req-1', professional_id: RUI, price_from: 150, status: 'pending', profiles: { name: 'Rui Alves' } },
  { id: 'of-marta', request_id: 'req-1', professional_id: MARTA, price_from: 90, status: 'pending', profiles: { name: 'Marta Sousa' } },
];

async function abrirPedido(page, uid, telefones) {
  await page.route(SUPABASE_CDN_URL, (r) => r.fulfill({ path: FAKE_SDK_PATH, contentType: 'text/javascript' }));
  await page.route('**/.netlify/functions/*', (r) => r.fulfill({ status: 200, body: '{}' }));
  await page.addInitScript((c) => { window.__testAuthConfig = c; }, {
    session: { access_token: 'tok', user: { id: uid, email: 'x@x.pt' } },
    tableData: { requests: { data: [PEDIDO] }, request_offers: { data: OFERTAS }, reviews: { data: [] }, profiles: { data: [] } },
    rpcResults: { whatsapp_das_propostas: telefones },
  });
  await page.goto('/pedido.html?id=req-1');
}

test('cliente: botão abre wa.me com o número certo e a mensagem do pedido; sem número mostra o aviso', async ({ page }) => {
  await abrirPedido(page, CLI, [{ professional_id: RUI, phone: '+351 912 345 678' }]);
  const rui = page.locator('.offer-card', { hasText: 'Rui Alves' });
  const btn = rui.getByRole('link', { name: 'Contactar pelo WhatsApp' });
  await expect(btn).toHaveAttribute('target', '_blank');
  const href = await btn.getAttribute('href');
  expect(href.startsWith('https://wa.me/351912345678?text=')).toBe(true);
  const msg = new URL(href).searchParams.get('text');
  expect(msg).toBe([
    'Olá! Vi a tua proposta na Flinko para o meu pedido.', '',
    'Serviço: Trocar quadro elétrico & tomadas (Eletricistas)',
    'Localização: Braga – Guimarães',
    'Descrição: Disjuntores a saltar #urgente', '',
    'Podes consultar todos os detalhes do pedido na Flinko:',
    'https://flinko.pt/pedido.html?id=req-1', '',
    'Obrigado!',
  ].join('\n'));
  // Marta não tem WhatsApp disponível: sem botão, com a mensagem clara
  const marta = page.locator('.offer-card', { hasText: 'Marta Sousa' });
  await expect(marta.getByRole('link', { name: 'Contactar pelo WhatsApp' })).toHaveCount(0);
  await expect(marta).toContainText('Este profissional não tem um número de WhatsApp disponível.');
  const rpc = await page.evaluate(() => window.__rpcCalls.find((c) => c.fnName === 'whatsapp_das_propostas'));
  expect(rpc.args).toEqual({ p_request: 'req-1' });
});

test('número inválido vindo da base de dados: não cria link', async ({ page }) => {
  await abrirPedido(page, CLI, [{ professional_id: RUI, phone: '223 456 789' }]);
  const rui = page.locator('.offer-card', { hasText: 'Rui Alves' });
  await expect(rui).toContainText('não tem um número de WhatsApp disponível');
  await expect(page.locator('a[href^="https://wa.me/"]')).toHaveCount(0);
});

test('quem não é o dono do pedido nunca pede os números', async ({ page }) => {
  await abrirPedido(page, 'outra-pessoa', [{ professional_id: RUI, phone: '912345678' }]);
  await page.waitForLoadState('networkidle');
  expect(await page.evaluate(() => (window.__rpcCalls || []).some((c) => c.fnName === 'whatsapp_das_propostas'))).toBe(false);
  await expect(page.locator('a[href^="https://wa.me/"]')).toHaveCount(0);
});

async function abrirPainel(page, phone, visivel = false) {
  await page.route(SUPABASE_CDN_URL, (r) => r.fulfill({ path: FAKE_SDK_PATH, contentType: 'text/javascript' }));
  const profile = { id: 'pro-1', slug: 'rui', name: 'Rui Alves', plan: 'free', account_type: 'professional', category: 'Eletricistas', location: 'Braga – Braga' };
  await page.addInitScript((c) => { window.__testAuthConfig = c; }, {
    session: { access_token: 'tok', user: { id: 'pro-1', email: 'rui@example.com' } },
    rpcResults: { get_my_profile: [profile] },
    tableData: { plan_limits: { data: [] }, profile_private: { data: [{ profile_id: 'pro-1', phone, whatsapp_visivel: visivel }] } },
  });
  await page.goto('/dashboard.html');
  await page.evaluate(() => showPage('profile'));
}

test('painel: ligar o botão de WhatsApp mostra o número e grava o consentimento', async ({ page }) => {
  await abrirPainel(page, '912 345 678');
  await expect(page.locator('#wa-row')).toBeVisible();
  await expect(page.locator('#wa-phone')).toHaveText('+351912345678');
  await page.locator('label[for="wa-toggle"]').click();
  await expect(page.locator('#notif-success')).toContainText('WhatsApp');
  const up = await page.evaluate(() => window.__updateCalls.find((c) => c.table === 'profile_private').patch);
  expect(up.whatsapp_visivel).toBe(true);
  expect(typeof up.whatsapp_visivel_at).toBe('string');
});

test('painel: sem telemóvel válido não liga e explica o que falta', async ({ page }) => {
  await abrirPainel(page, '');
  await expect(page.locator('#wa-phone')).toContainText('ainda sem telemóvel');
  await page.locator('label[for="wa-toggle"]').click();
  await expect(page.locator('#notif-error')).toContainText('adiciona um telemóvel válido');
  await expect(page.locator('#wa-toggle')).not.toBeChecked();
});

test('contador: carregar no botão regista o contacto (registar_contacto_whatsapp) e abre o WhatsApp', async ({ page, context }) => {
  await context.route('https://wa.me/**', (r) => r.fulfill({ status: 200, body: 'wa' }));
  await abrirPedido(page, CLI, [{ professional_id: RUI, phone: '912345678' }]);
  const popup = page.waitForEvent('popup');
  await page.locator('.offer-card', { hasText: 'Rui Alves' }).getByRole('link', { name: 'Contactar pelo WhatsApp' }).click();
  expect((await popup).url()).toContain('https://wa.me/351912345678?text=');
  await expect.poll(() => page.evaluate(() => (window.__rpcCalls || []).find((c) => c.fnName === 'registar_contacto_whatsapp'))).toBeTruthy();
  const call = await page.evaluate(() => window.__rpcCalls.find((c) => c.fnName === 'registar_contacto_whatsapp'));
  expect(call.args).toEqual({ p_professional: RUI, p_request: 'req-1' });
});

test('contador no painel: mostra quantas vezes o profissional foi contactado', async ({ page }) => {
  await page.route(SUPABASE_CDN_URL, (r) => r.fulfill({ path: FAKE_SDK_PATH, contentType: 'text/javascript' }));
  const profile = { id: 'pro-1', slug: 'rui', name: 'Rui Alves', plan: 'free', account_type: 'professional', category: 'Eletricistas', location: 'Braga – Braga' };
  const dias = (d) => new Date(Date.now() - d * 864e5).toISOString();
  await page.addInitScript((c) => { window.__testAuthConfig = c; }, {
    session: { access_token: 'tok', user: { id: 'pro-1', email: 'rui@example.com' } },
    rpcResults: { get_my_profile: [profile] },
    tableData: {
      plan_limits: { data: [] },
      profile_private: { data: [{ profile_id: 'pro-1', phone: '912345678', whatsapp_visivel: true }] },
      whatsapp_contactos: { data: [{ created_at: dias(1), source: 'proposta' }, { created_at: dias(5), source: 'admin' }, { created_at: dias(60), source: 'proposta' }] },
    },
  });
  await page.goto('/dashboard.html');
  await page.evaluate(() => showPage('profile'));
  await expect(page.locator('#wa-count')).toHaveText('📲 Contactado 3 vezes pelo WhatsApp (2 nos últimos 30 dias)');
});
