// Notificações push pedidas na altura certa (assets/push-optin.js): depois da
// 1.ª mensagem enviada e depois de publicar um pedido, nunca ao abrir a página.
// O browser de teste recebe um Notification/PushManager falso.
const { test, expect } = require('@playwright/test');
const path = require('path');

const FAKE_SDK_PATH = path.join(__dirname, 'fixtures', 'fake-supabase-sdk.js');
const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3';
const ME = 'c0000000-0000-0000-0000-000000000001';
const PRO = 'b0000000-0000-0000-0000-000000000002';
const CONV = 'a0000000-0000-0000-0000-00000000000a';

// Notification e PushManager falsos: a autorização fica 'granted' ao aceitar.
function fakePush(perm) {
  {
    localStorage.removeItem('fk_push_ask_until');
    let p = perm;
    window.__permAsked = 0;
    window.Notification = { get permission() { return p; }, requestPermission: async () => { window.__permAsked++; p = 'granted'; return p; } };
    window.PushManager = function () {};
    const sub = { toJSON: () => ({ endpoint: 'https://push.example/abc', keys: { p256dh: 'k1', auth: 'k2' } }) };
    const reg = { pushManager: { getSubscription: async () => null, subscribe: async () => sub } };
    Object.defineProperty(navigator, 'serviceWorker', { value: { ready: Promise.resolve(reg), register: async () => reg }, configurable: true });
  }
}

async function abrirMensagens(page, perm = 'default') {
  await page.route(SUPABASE_CDN_URL, (r) => r.fulfill({ path: FAKE_SDK_PATH, contentType: 'text/javascript' }));
  await page.route('**/.netlify/functions/notify-message', (r) => r.fulfill({ status: 200, body: '{"sent":true}' }));
  await page.addInitScript(fakePush, perm);
  await page.addInitScript((c) => { window.__testAuthConfig = c; }, {
    session: { access_token: 'tok', user: { id: ME, email: 'ana@exemplo.pt' } },
    tableData: {
      profiles: { data: [{ id: ME, name: 'Ana Silva', category: '' }, { id: PRO, name: 'Rui Alves', category: 'Eletricistas' }] },
      conversations: { data: [{ id: CONV, professional_id: PRO, client_id: ME, last_message: 'Olá', last_message_at: new Date().toISOString() }] },
      messages: { data: [] }, message_reactions: { data: [] }, user_blocks: { data: [] },
    },
  });
  await page.goto('/messages.html?c=' + CONV);
}

test('mensagens: não pergunta ao abrir; depois da 1.ª mensagem pergunta e guarda a subscrição', async ({ page }) => {
  await abrirMensagens(page);
  await page.waitForTimeout(1500);
  await expect(page.getByRole('dialog', { name: 'Ativar notificações' })).toHaveCount(0);
  await page.locator('#input').fill('Olá! Tem disponibilidade?');
  await page.locator('#sendBtn').click();
  const box = page.getByRole('dialog', { name: 'Ativar notificações' });
  await expect(box).toContainText('Queres saber quando Rui responder?');
  await box.getByRole('button', { name: 'Ativar notificações' }).click();
  await expect.poll(() => page.evaluate(() => (window.__upsertCalls || []).find((c) => c.table === 'push_subscriptions'))).toBeTruthy();
  const up = await page.evaluate(() => window.__upsertCalls.find((c) => c.table === 'push_subscriptions').row);
  expect(up).toEqual({ profile_id: ME, endpoint: 'https://push.example/abc', p256dh: 'k1', auth: 'k2' });
  expect(await page.evaluate(() => window.__permAsked)).toBe(1);
});

test('"Agora não" pausa o convite durante 14 dias', async ({ page }) => {
  await abrirMensagens(page);
  await page.locator('#input').fill('Olá');
  await page.locator('#sendBtn').click();
  await page.getByRole('button', { name: 'Agora não' }).click();
  const ate = Number(await page.evaluate(() => localStorage.getItem('fk_push_ask_until')));
  expect(ate - Date.now()).toBeGreaterThan(13 * 864e5);
  expect(await page.evaluate(() => window.__permAsked)).toBe(0);
});

test('quem já autorizou: guarda a subscrição deste dispositivo sem perguntar', async ({ page }) => {
  await abrirMensagens(page, 'granted');
  await expect.poll(() => page.evaluate(() => (window.__upsertCalls || []).some((c) => c.table === 'push_subscriptions'))).toBe(true);
  await page.locator('#input').fill('Olá');
  await page.locator('#sendBtn').click();
  await page.waitForTimeout(1500);
  await expect(page.getByRole('dialog', { name: 'Ativar notificações' })).toHaveCount(0);
});

test('pedidos: depois de publicar um pedido, convida a ativar para receber as propostas', async ({ page }) => {
  await page.route(SUPABASE_CDN_URL, (r) => r.fulfill({ path: FAKE_SDK_PATH, contentType: 'text/javascript' }));
  await page.route('**/.netlify/functions/notify-request', (r) => r.fulfill({ status: 200, body: '{"sent":0}' }));
  await page.addInitScript(fakePush, 'default');
  await page.addInitScript((c) => { window.__testAuthConfig = c; }, { session: { access_token: 'tok', user: { id: ME, email: 'ana@exemplo.pt' } }, tableData: { requests: { data: [] } } });
  await page.goto('/pedidos.html?publicar=1');
  await expect(page.getByRole('dialog', { name: 'Ativar notificações' })).toHaveCount(0);
  await page.fill('#m-title', 'Trocar quadro elétrico');
  await page.selectOption('#m-cat', 'Eletricistas');
  await page.selectOption('#m-district', 'Braga');
  await page.fill('#m-city', 'Guimarães');
  await page.click('#submit-btn');
  await expect(page.getByRole('dialog', { name: 'Ativar notificações' })).toContainText('Avisamos-te quando chegar uma proposta', { timeout: 8000 });
});
