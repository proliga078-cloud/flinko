// Mensagens da Flinko: o admin escreve no painel e cada profissional recebe na
// sua conversa com a "Flinko" (messages.html). A quem não entra há 14+ dias, o
// painel propõe um reforço por WhatsApp (links wa.me, enviados à mão).
const { test, expect } = require('@playwright/test');
const path = require('path');
const { openAdmin, modalOk } = require('./fixtures/admin-mock');

test('admin: mensagem da Flinko a um profissional e reforço por WhatsApp a quem não entra há muito', async ({ page }) => {
  const calls = await openAdmin(page, {
    fns: { 'admin-flinko-message': (b) => b.action === 'preview' ? { recipients: 1, skipped: [] } : { sent: 1, emailed: 1, sentIds: ['pro-1'] } },
  });
  await page.evaluate(() => openPro('pro-1'));
  await page.locator('#drawer').getByRole('button', { name: '💬 Mensagem da Flinko' }).click();
  await page.locator('#modal #ff_text').fill('Olá {nome}! Tens pedidos novos em {categoria} à tua espera.');
  await modalOk(page);
  await modalOk(page); // confirmar o envio
  await expect.poll(() => calls.filter((c) => c.fn === 'admin-flinko-message').map((c) => c.body.action)).toEqual(['preview', 'send']);
  const send = calls.find((c) => c.fn === 'admin-flinko-message' && c.body.action === 'send').body;
  expect(send).toEqual({ action: 'send', profileIds: ['pro-1'], message: 'Olá {nome}! Tens pedidos novos em {categoria} à tua espera.' });
  // o Rui nunca foi visto no site: aparece o reforço por WhatsApp
  const box = page.getByRole('dialog', { name: 'Reforçar por WhatsApp' });
  await expect(box).toContainText('Rui Alves');
  const link = box.getByRole('link', { name: 'Abrir WhatsApp' });
  const href = await link.getAttribute('href');
  expect(href.startsWith('https://wa.me/351912345678?text=')).toBe(true);
  const txt = new URL(href).searchParams.get('text');
  expect(txt).toContain('Olá Rui! Aqui é a equipa Flinko');
  expect(txt).toContain('«Olá Rui! Tens pedidos novos em eletricistas à tua espera.»');
  expect(txt).toContain('https://flinko.pt/messages');
});

const FAKE_SDK_PATH = path.join(__dirname, 'fixtures', 'fake-supabase-sdk.js');
const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3';
const PRO = 'b0000000-0000-0000-0000-000000000002', ADM = 'd0000000-0000-0000-0000-000000000009', CONV = 'a0000000-0000-0000-0000-00000000000f';

async function abrirMensagens(page, me) {
  await page.route(SUPABASE_CDN_URL, (r) => r.fulfill({ path: FAKE_SDK_PATH, contentType: 'text/javascript' }));
  await page.route('**/.netlify/functions/*', (r) => r.fulfill({ status: 200, body: '{}' }));
  await page.addInitScript((c) => { window.__testAuthConfig = c; }, {
    session: { access_token: 'tok', user: { id: me, email: 'x@x.pt' } },
    tableData: {
      profiles: { data: [{ id: PRO, name: 'Rui Alves', category: 'Eletricistas' }, { id: ADM, name: 'David', category: '' }] },
      conversations: { data: [{ id: CONV, professional_id: PRO, client_id: ADM, is_flinko: true, last_message: 'Olá Rui!', last_message_at: new Date().toISOString() }] },
      messages: { data: [{ id: 'm1', conversation_id: CONV, sender_id: ADM, content: 'Olá Rui! Tens pedidos novos.', attachments: [], read: false, created_at: new Date().toISOString() }] },
      message_reactions: { data: [] }, user_blocks: { data: [] }, jobs: { data: [] },
    },
  });
  await page.goto('/messages.html?c=' + CONV);
}

test('profissional: a conversa aparece como "Flinko" (oficial), sem perfil nem denúncia', async ({ page }) => {
  await abrirMensagens(page, PRO);
  await expect(page.locator('.conv').first()).toContainText('Flinko');
  await expect(page.locator('.conv').first()).not.toContainText('David');
  await expect(page.locator('#hName')).toHaveText('Flinko');
  await page.getByRole('button', { name: 'Detalhes da conversa' }).click();
  await expect(page.locator('#infoBody')).toContainText('Conversa oficial com a equipa Flinko');
  await expect(page.locator('#infoBody').getByRole('button', { name: 'Denunciar', exact: true })).toHaveCount(0);
  await expect(page.locator('#infoBody').getByRole('link', { name: 'Ver perfil' })).toHaveCount(0);
});

test('admin: nas suas mensagens vê o profissional, marcado como conversa enviada como Flinko', async ({ page }) => {
  await abrirMensagens(page, ADM);
  const conv = page.locator('.conv').first();
  await expect(conv).toContainText('Rui Alves');
  await expect(conv.locator('.official')).toHaveText('Flinko');
});
