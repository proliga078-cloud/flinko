// pedido.html: o cliente compara as propostas e escolhe uma; o profissional vê
// se foi escolhido; uma proposta nova avisa o cliente.
const { test, expect } = require('@playwright/test');
const path = require('path');

const FAKE_SDK_PATH = path.join(__dirname, 'fixtures', 'fake-supabase-sdk.js');
const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3';

const CLI = 'cli-1', RUI = 'pro-rui', MARTA = 'pro-marta';
const pedido = (extra) => ({ id: 'req-1', client_id: CLI, title: 'Trocar quadro elétrico', category: 'Eletricistas', location: 'Braga', status: 'open', created_at: new Date().toISOString(), profiles: { name: 'Ana Silva' }, ...extra });
const ofertas = (estados = {}) => [
  { id: 'of-rui', request_id: 'req-1', professional_id: RUI, price_from: 150, message: 'Posso ir amanhã', status: estados.rui || 'pending', profiles: { name: 'Rui Alves', verified: true, avg_response_minutes: 30, response_sample_count: 4 } },
  { id: 'of-marta', request_id: 'req-1', professional_id: MARTA, price_from: 90, message: 'Tenho vaga sexta', status: estados.marta || 'pending', profiles: { name: 'Marta Sousa', verified: false } },
];

async function abrir(page, uid, { req = pedido(), offers = ofertas(), rpc = {} } = {}) {
  await page.route(SUPABASE_CDN_URL, (r) => r.fulfill({ path: FAKE_SDK_PATH, contentType: 'text/javascript' }));
  await page.route('**/.netlify/functions/*', (r) => r.fulfill({ status: 200, body: '{}' }));
  await page.addInitScript((c) => { window.__testAuthConfig = c; }, {
    session: uid ? { access_token: 'tok', user: { id: uid, email: 'x@x.pt' } } : null,
    tableData: { requests: { data: [req] }, request_offers: { data: offers }, reviews: { data: [{ professional_id: RUI, rating: 5 }, { professional_id: RUI, rating: 4 }] }, messages: { data: [] }, conversations: { data: [] }, profiles: { data: [] } },
    rpcResults: rpc,
    insertReturn: { id: 'of-nova' },
  });
  await page.goto('/pedido.html?id=req-1');
}

test('cliente: compara as propostas (avaliação, tempo de resposta, preço) e ordena pela mais barata', async ({ page }) => {
  await abrir(page, CLI);
  const sec = page.locator('.offers-section');
  await expect(sec).toContainText('Compara e escolhe (2)');
  const rui = sec.locator('.offer-card', { hasText: 'Rui Alves' });
  await expect(rui).toContainText('★ 4,5');
  await expect(rui).toContainText('Responde em ~30 min');
  await expect(sec.locator('.offer-card', { hasText: 'Marta Sousa' })).toContainText('Sem avaliações ainda');
  await sec.locator('.offers-sort select').selectOption('preco');
  await expect(sec.locator('.offer-card .oc-name').first()).toHaveText('Marta Sousa');
});

test('cliente: escolher uma proposta chama escolher_proposta, avisa o profissional e abre a conversa', async ({ page }) => {
  await abrir(page, CLI, { rpc: { escolher_proposta: 'conv-9' } });
  page.on('dialog', (d) => d.accept());
  // guarda a chamada ao servidor (a página muda logo a seguir)
  await page.evaluate(() => { const o = db.rpc.bind(db); db.rpc = (n, a) => { sessionStorage.setItem('rpc', JSON.stringify({ n, a })); return o(n, a); }; });
  const aviso = page.waitForRequest('**/.netlify/functions/notify-message');
  await page.locator('.offer-card', { hasText: 'Rui Alves' }).getByRole('button', { name: 'Escolher esta proposta' }).click();
  expect(JSON.parse((await aviso).postData())).toMatchObject({ conversationId: 'conv-9' });
  await page.waitForURL('**/messages.html?c=conv-9');
  expect(JSON.parse(await page.evaluate(() => sessionStorage.getItem('rpc')))).toEqual({ n: 'escolher_proposta', a: { p_offer: 'of-rui' } });
});

test('cliente: pedido fechado mostra a escolhida e já não deixa escolher', async ({ page }) => {
  await abrir(page, CLI, { req: pedido({ status: 'resolved' }), offers: ofertas({ rui: 'accepted', marta: 'declined' }) });
  const sec = page.locator('.offers-section');
  await expect(sec.locator('.offer-card.chosen')).toContainText('Rui Alves');
  await expect(sec.locator('.offer-card.chosen')).toContainText('Escolhida');
  await expect(sec.getByRole('button', { name: 'Escolher esta proposta' })).toHaveCount(0);
  await expect(sec.locator('.offer-card.chosen .oc-name')).toHaveText('Rui Alves'); // escolhida primeiro
});

test('profissional: vê que foi escolhido', async ({ page }) => {
  await abrir(page, RUI, { req: pedido({ status: 'resolved' }), offers: ofertas({ rui: 'accepted', marta: 'declined' }) });
  await expect(page.locator('#offer-panel')).toContainText('O cliente escolheu a tua proposta');
});

test('profissional: enviar a primeira proposta avisa o cliente (notify-offer)', async ({ page }) => {
  await abrir(page, RUI, { offers: [] });
  await page.getByRole('button', { name: /Responder/ }).click();
  await page.locator('#offer-msg').fill('Posso ir amanhã de manhã');
  await page.locator('#offer-from').fill('120');
  // depois de gravar, a página relê as propostas: a do Rui passa a existir
  await page.evaluate(() => { window.__testAuthConfig.tableData.request_offers.data = [{ id: 'of-nova', request_id: 'req-1', professional_id: 'pro-rui', price_from: 120, status: 'pending', profiles: { name: 'Rui' } }]; });
  const aviso = page.waitForRequest('**/.netlify/functions/notify-offer');
  await page.getByRole('button', { name: 'Enviar proposta' }).click();
  expect(JSON.parse((await aviso).postData())).toEqual({ offerId: 'of-nova' });
});
