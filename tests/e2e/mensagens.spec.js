// messages.html: lista de conversas, conversa, enviar, fotos, responder e
// reagir. O Supabase é substituído pelo SDK falso (ignora filtros: cada tabela
// devolve sempre as mesmas linhas), por isso os dados de cada teste são só os
// de uma conversa.
const { test, expect } = require('@playwright/test');
const path = require('path');

const FAKE_SDK_PATH = path.join(__dirname, 'fixtures', 'fake-supabase-sdk.js');
const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3';

const ME = 'c0000000-0000-0000-0000-000000000001';
const PRO = 'b0000000-0000-0000-0000-000000000002';
const CONV = 'a0000000-0000-0000-0000-00000000000a';
const ago = (min) => new Date(Date.now() - min * 60000).toISOString();

function base(extra = {}) {
  return {
    session: { access_token: 'tok', user: { id: ME, email: 'ana@exemplo.pt' } },
    tableData: {
      profiles: { data: [{ id: ME, name: 'Ana Silva', category: '' }, { id: PRO, name: 'Rui Alves', category: 'Eletricistas', photo_url: null, slug: 'rui' }] },
      conversations: { data: [{ id: CONV, professional_id: PRO, client_id: ME, last_message: 'Pode ser amanhã?', last_message_at: ago(1), created_at: ago(100) }] },
      messages: { data: [
        { id: 'm3', conversation_id: CONV, sender_id: PRO, content: 'Pode ser amanhã?', attachments: [], reply_to: 'm1', read: false, created_at: ago(1) },
        { id: 'm2', conversation_id: CONV, sender_id: ME, content: '', attachments: [{ path: CONV + '/f.jpg' }], reply_to: null, read: true, read_at: ago(3), created_at: ago(4) },
        { id: 'm1', conversation_id: CONV, sender_id: ME, content: 'Olá! <b>Tem</b> disponibilidade?', attachments: [], reply_to: null, read: true, created_at: ago(5) },
      ] },
      message_reactions: { data: [{ message_id: 'm3', user_id: ME, emoji: '👍' }] },
      jobs: { data: [] },
    },
    signedUrls: { [CONV + '/f.jpg']: '/icon-192.png' },
    ...extra,
  };
}

async function abrir(page, cfg, url = '/messages.html') {
  await page.route(SUPABASE_CDN_URL, (r) => r.fulfill({ path: FAKE_SDK_PATH, contentType: 'text/javascript' }));
  await page.route('**/.netlify/functions/notify-message', (r) => r.fulfill({ status: 200, body: '{"sent":true}' }));
  await page.addInitScript((c) => { window.__testAuthConfig = c; }, cfg);
  await page.goto(url);
}

test('lista: mostra a conversa, a pré-visualização e as mensagens por ler', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await abrir(page, base());
  const conv = page.locator('.conv').first();
  await expect(conv).toContainText('Rui Alves');
  await expect(conv).toContainText('Pode ser amanhã?');
  await expect(conv.locator('.badge')).toHaveText('1');
});

test('conversa: texto escapado, foto, resposta, reação e ✓✓ nas mensagens vistas', async ({ page }) => {
  await abrir(page, base(), '/messages.html?c=' + CONV);
  const feed = page.locator('#feed');
  await expect(feed.locator('.row[data-id="m1"] .bubble')).toContainText('<b>Tem</b> disponibilidade?');
  await expect(feed.locator('.row[data-id="m2"] .pic img')).toHaveAttribute('src', '/icon-192.png');
  await expect(feed.locator('.row[data-id="m3"] .quote')).toContainText('Tu');
  await expect(feed.locator('.row[data-id="m3"] .react')).toContainText('👍');
  await expect(feed.locator('.row[data-id="m1"] .tick.read')).toHaveCount(1);
  // escondidos quando não estão a ser usados
  await expect(page.locator('#replying')).toBeHidden();
  await expect(page.locator('#strip')).toBeHidden();
  // cliente não vê as respostas rápidas de profissional
  await expect(page.locator('#quickBtn')).toBeHidden();
  // marca como lidas as mensagens recebidas
  await expect.poll(() => page.evaluate(() => (window.__updateCalls || []).some((c) => c.table === 'messages' && c.patch.read === true))).toBe(true);
});

test('enviar: a mensagem aparece logo e é gravada na conversa, com aviso ao destinatário', async ({ page }) => {
  await abrir(page, base({ insertReturn: { id: 'novo', conversation_id: CONV, sender_id: ME, content: 'Combinado!', attachments: [], reply_to: null, read: false, created_at: new Date().toISOString() } }), '/messages.html?c=' + CONV);
  await page.locator('#input').fill('Combinado!');
  const aviso = page.waitForRequest('**/.netlify/functions/notify-message');
  await page.locator('#sendBtn').click();
  await expect(page.locator('#feed')).toContainText('Combinado!');
  const ins = await page.evaluate(() => window.__insertCalls.find((c) => c.table === 'messages').row);
  expect(ins).toMatchObject({ conversation_id: CONV, sender_id: ME, content: 'Combinado!', attachments: [] });
  expect(JSON.parse((await aviso).postData())).toMatchObject({ conversationId: CONV, preview: 'Combinado!' });
});

test('responder: escolher "Responder" mostra a citação e envia reply_to', async ({ page }) => {
  await abrir(page, base({ insertReturn: { id: 'r1', conversation_id: CONV, sender_id: ME, content: 'Sim, às 10h', attachments: [], reply_to: 'm3', read: false, created_at: new Date().toISOString() } }), '/messages.html?c=' + CONV);
  await page.locator('.row[data-id="m3"]').hover();
  await page.locator('.row[data-id="m3"] .acts button[aria-label="Responder"]').click();
  await expect(page.locator('#replying')).toBeVisible();
  await expect(page.locator('#rpTxt')).toHaveText('Pode ser amanhã?');
  await page.locator('#input').fill('Sim, às 10h');
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => (window.__insertCalls || []).find((c) => c.table === 'messages')?.row.reply_to)).toBe('m3');
  await expect(page.locator('#replying')).toBeHidden();
});

test('fotos: escolher uma foto envia-a para o armazenamento privado da conversa', async ({ page }) => {
  await abrir(page, base({ insertReturn: { id: 'p1', conversation_id: CONV, sender_id: ME, content: '', attachments: [{ path: CONV + '/x.jpg' }], reply_to: null, read: false, created_at: new Date().toISOString() } }), '/messages.html?c=' + CONV);
  await page.locator('#file').setInputFiles(path.join(__dirname, 'fixtures', 'small-photo.jpg'));
  await expect(page.locator('#strip .thumb')).toHaveCount(1);
  await page.locator('#sendBtn').click();
  await expect.poll(() => page.evaluate(() => (window.__uploadCalls || []).length)).toBe(1);
  const up = await page.evaluate(() => window.__uploadCalls[0]);
  expect(up.bucket).toBe('chat-media');
  expect(up.path.startsWith(CONV + '/')).toBe(true);
});

test('a partir de um perfil (?with=): a conversa só é criada ao enviar a 1.ª mensagem', async ({ page }) => {
  const cfg = base();
  cfg.tableData.conversations.data = [];
  cfg.tableData.messages.data = [];
  cfg.tableData.profiles.data = [{ id: PRO, name: 'Rui Alves', category: 'Eletricistas' }];
  await abrir(page, { ...cfg, insertReturn: { id: CONV, professional_id: PRO, client_id: ME } }, '/messages.html?with=' + PRO);
  await expect(page.locator('#hName')).toHaveText('Rui Alves');
  await expect(page.locator('#chips .chip').first()).toBeVisible(); // sugestões para começar
  expect(await page.evaluate(() => (window.__insertCalls || []).length)).toBe(0);
  await page.locator('#chips .chip').first().click();
  await expect(page.locator('#input')).not.toHaveValue('');
  await page.locator('#sendBtn').click();
  await expect.poll(() => page.evaluate(() => (window.__insertCalls || []).map((c) => c.table))).toEqual(['conversations', 'messages']);
  const conv = await page.evaluate(() => window.__insertCalls[0].row);
  expect(conv).toEqual({ professional_id: PRO, client_id: ME });
});

test('reagir: duplo clique dá ❤️ (grava a reação da própria pessoa)', async ({ page }) => {
  await abrir(page, base(), '/messages.html?c=' + CONV);
  await page.locator('.row[data-id="m1"] .bubble').dblclick();
  await expect(page.locator('.row[data-id="m1"] .react')).toContainText('❤️');
  const up = await page.evaluate(() => (window.__upsertCalls || [])[0]);
  expect(up).toMatchObject({ table: 'message_reactions', row: { message_id: 'm1', user_id: ME, emoji: '❤️' } });
});
