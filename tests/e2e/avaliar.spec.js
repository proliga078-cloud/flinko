// avaliar.html: avaliar a partir de um link de avaliação (sem conta).
const { test, expect } = require('@playwright/test');
const path = require('path');

const FAKE_SDK_PATH = path.join(__dirname, 'fixtures', 'fake-supabase-sdk.js');
const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3';
const INFO = { professional_id: 'pro-1', pro_name: 'Rui Alves', pro_photo: null, pro_category: 'Eletricistas', pro_slug: 'rui', client_name: 'Carlos', used: false };

async function abrir(page, url, info = INFO) {
  await page.route(SUPABASE_CDN_URL, (r) => r.fulfill({ path: FAKE_SDK_PATH, contentType: 'text/javascript' }));
  await page.addInitScript((i) => { window.__testAuthConfig = { tableData: {}, rpcResults: { review_invite_info: i ? [i] : [], submit_review_invite: 'rev-1' } }; }, info);
  await page.goto(url);
}

test('vindo do email com 5 estrelas: já vem escolhido, com o nome, e publica com um toque', async ({ page }) => {
  await abrir(page, '/avaliar.html?t=abc123&s=5');
  await expect(page.locator('h1')).toHaveText('Como correu com Rui?');
  await expect(page.locator('#lbl')).toHaveText('Excelente');
  await expect(page.locator('#nome')).toHaveValue('Carlos');
  await page.locator('#com').fill('Muito profissional');
  await page.getByRole('button', { name: 'Publicar avaliação' }).click();
  await expect(page.locator('h1')).toContainText('Obrigado, Carlos!');
  const call = await page.evaluate(() => window.__rpcCalls.find((c) => c.fnName === 'submit_review_invite'));
  expect(call.args).toEqual({ p_token: 'abc123', p_rating: 5, p_comment: 'Muito profissional', p_name: 'Carlos' });
  await expect(page.getByRole('link', { name: 'Ver a avaliação' })).toHaveAttribute('href', '/rui');
});

test('sem estrelas escolhidas: pede para escolher antes de publicar', async ({ page }) => {
  await abrir(page, '/avaliar.html?t=abc123');
  await page.getByRole('button', { name: 'Publicar avaliação' }).click();
  await expect(page.locator('#err')).toContainText('Escolhe de 1 a 5 estrelas');
  await page.getByRole('radio', { name: /4 estrelas/ }).click();
  await expect(page.locator('#lbl')).toHaveText('Bom');
});

test('link já usado ou inválido: mensagens claras', async ({ page }) => {
  await abrir(page, '/avaliar.html?t=abc123', { ...INFO, used: true });
  await expect(page.locator('h1')).toHaveText('Obrigado!');
  await abrir(page, '/avaliar.html?t=nao-existe', null);
  await expect(page.locator('h1')).toHaveText('Link inválido');
});

test('SEGURANÇA: nome do profissional com HTML não é executado', async ({ page }) => {
  await abrir(page, '/avaliar.html?t=abc', { ...INFO, pro_name: '<img src=x onerror="window.__pwn=1">' });
  await expect(page.locator('.sub')).toContainText('<img src=x');
  expect(await page.evaluate(() => window.__pwn)).toBeUndefined();
});

// Out/2026 (Nielsen Global Trust: 83% confiam na recomendação de amigos):
// quem acaba de dar 4 ou 5 estrelas é quem mais vontade tem de recomendar.
test('depois de 4-5 estrelas: botão para recomendar o profissional no WhatsApp', async ({ page }) => {
  await abrir(page, '/avaliar.html?t=abc123&s=5');
  await page.getByRole('button', { name: 'Publicar avaliação' }).click();
  const wa = page.getByRole('link', { name: 'Recomendar a um amigo no WhatsApp' });
  const href = decodeURIComponent(await wa.getAttribute('href'));
  expect(href).toMatch(/^https:\/\/wa\.me\/\?text=/);
  expect(href).toContain('Rui Alves');
  expect(href).toContain('eletricista');
  expect(href).toMatch(/https?:\/\/[^ ]+\/rui$/);
});

test('com 3 estrelas ou menos não pede para recomendar', async ({ page }) => {
  await abrir(page, '/avaliar.html?t=abc123&s=3');
  await page.getByRole('button', { name: 'Publicar avaliação' }).click();
  await expect(page.locator('h1')).toContainText('Obrigado');
  await expect(page.getByRole('link', { name: /Recomendar/ })).toHaveCount(0);
});
