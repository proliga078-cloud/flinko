// messages.html: segurança nas conversas. Aviso de burla por baixo de mensagens
// recebidas que pedem pagamento adiantado ou códigos, bloquear e denunciar.
const { test, expect } = require('@playwright/test');
const path = require('path');

const FAKE_SDK_PATH = path.join(__dirname, 'fixtures', 'fake-supabase-sdk.js');
const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3';

const ME = 'c0000000-0000-0000-0000-000000000001';
const PRO = 'b0000000-0000-0000-0000-000000000002';
const CONV = 'a0000000-0000-0000-0000-00000000000a';
const ago = (min) => new Date(Date.now() - min * 60000).toISOString();

function base(msgs, blocks = []) {
  return {
    session: { access_token: 'tok', user: { id: ME, email: 'ana@exemplo.pt' } },
    tableData: {
      profiles: { data: [{ id: ME, name: 'Ana Silva', category: '' }, { id: PRO, name: 'Rui Alves', category: 'Eletricistas', photo_url: null, slug: 'rui' }] },
      conversations: { data: [{ id: CONV, professional_id: PRO, client_id: ME, last_message: 'x', last_message_at: ago(1), created_at: ago(100) }] },
      messages: { data: msgs },
      message_reactions: { data: [] },
      user_blocks: { data: blocks },
      jobs: { data: [] },
    },
  };
}
const msg = (id, sender, content, min) => ({ id, conversation_id: CONV, sender_id: sender, content, attachments: [], reply_to: null, read: true, created_at: ago(min) });

async function abrir(page, cfg) {
  await page.route(SUPABASE_CDN_URL, (r) => r.fulfill({ path: FAKE_SDK_PATH, contentType: 'text/javascript' }));
  await page.route('**/.netlify/functions/notify-message', (r) => r.fulfill({ status: 200, body: '{"sent":true}' }));
  await page.addInitScript((c) => { window.__testAuthConfig = c; }, cfg);
  await page.goto('/messages.html?c=' + CONV);
}

test('aviso de burla: só por baixo de mensagens recebidas que pedem pagamento adiantado ou códigos', async ({ page }) => {
  await abrir(page, base([
    msg('m4', PRO, 'Diz-me o código que te chegou por SMS', 1),
    msg('m3', ME, 'Posso pagar por MB WAY no fim', 2),
    msg('m2', PRO, 'Para reservar preciso de 50€ de sinal por MB WAY adiantado', 3),
    msg('m1', PRO, 'Olá, posso passar amanhã às 10h', 4),
  ]));
  const feed = page.locator('#feed');
  await expect(feed.locator('.row[data-id="m2"] .warn')).toContainText('Cuidado com pagamentos adiantados');
  await expect(feed.locator('.row[data-id="m4"] .warn')).toContainText('Nunca partilhes códigos');
  await expect(feed.locator('.row[data-id="m1"] .warn')).toHaveCount(0);
  await expect(feed.locator('.row[data-id="m3"] .warn')).toHaveCount(0); // as minhas nunca têm aviso
  // do aviso vai-se direto à denúncia, já com o motivo escolhido
  await feed.locator('.row[data-id="m2"] .warn button').click();
  await expect(page.getByRole('radio', { name: 'Pede pagamento adiantado ou dados bancários' })).toBeChecked();
});

test('denunciar: envia para support_tickets com o motivo e as últimas mensagens, e bloqueia', async ({ page }) => {
  await abrir(page, base([msg('m2', PRO, 'Transfere 100€ para o IBAN PT50 0000 0000 0000 0000 0000 0', 2), msg('m1', ME, 'Olá', 3)]));
  await page.getByRole('button', { name: 'Detalhes da conversa' }).click();
  await page.getByRole('button', { name: 'Denunciar', exact: true }).click();
  await page.getByRole('radio', { name: 'Parece burla ou perfil falso' }).check();
  await page.locator('#repTxt').fill('Pediu dinheiro antes de vir');
  await page.getByRole('button', { name: 'Enviar denúncia' }).click();
  await expect(page.locator('#toast')).toContainText('Denúncia enviada');
  const calls = await page.evaluate(() => window.__insertCalls);
  const t = calls.find((c) => c.table === 'support_tickets').row;
  expect(t).toMatchObject({ kind: 'denuncia', email: 'ana@exemplo.pt', name: 'Ana Silva', target_profile_id: PRO, reporter_id: ME, page: 'messages.html?c=' + CONV, subject: 'Denúncia nas mensagens: Parece burla ou perfil falso' });
  expect(t.message).toContain('Pediu dinheiro antes de vir');
  expect(t.message).toContain('Rui Alves: Transfere 100€');
  expect(calls.find((c) => c.table === 'user_blocks').row).toEqual({ blocker_id: ME, blocked_id: PRO });
  await expect(page.locator('#blockedBar')).toContainText('Bloqueaste Rui Alves');
  await expect(page.locator('#composer')).toBeHidden();
});

test('bloquear pede confirmação; conversa bloqueada não deixa escrever e pode ser desbloqueada', async ({ page }) => {
  await abrir(page, base([msg('m1', PRO, 'Olá', 3)]));
  await page.getByRole('button', { name: 'Detalhes da conversa' }).click();
  await page.getByRole('button', { name: 'Bloquear Rui' }).click();
  await expect(page.locator('.confirm-box')).toContainText('A pessoa não é avisada');
  await page.getByRole('button', { name: 'Bloquear', exact: true }).click();
  await expect(page.locator('#composer')).toBeHidden();
  await expect(page.locator('.conv').first()).toContainText('Bloqueado');
  await page.locator('#blockedBar').getByRole('button', { name: 'Desbloquear' }).click();
  await expect(page.locator('#composer')).toBeVisible();
  expect(await page.evaluate(() => window.__deleteCalls.map((c) => c.table))).toContain('user_blocks');
});

test('já bloqueado ao abrir: mostra a barra em vez da caixa de texto', async ({ page }) => {
  await abrir(page, base([msg('m1', PRO, 'Olá', 3)], [{ blocked_id: PRO }]));
  await expect(page.locator('#blockedBar')).toBeVisible();
  await expect(page.locator('#composer')).toBeHidden();
});
