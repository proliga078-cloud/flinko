// Pedidos de apoio e denúncias que chegam ao painel de gestão
// (assets/support-form.js → tabela support_tickets).
//
// Antes, a página de contacto só tinha links mailto: e os pedidos perdiam-se
// no email; não havia forma de denunciar um perfil. Agora o formulário de
// contacto e o botão "Denunciar este perfil" criam uma linha em
// support_tickets, que aparece em admin.html › Apoio a clientes / Moderação.
const { test, expect } = require('@playwright/test');
const path = require('path');

const SB = 'https://cdwinidhtfxfxowflize.supabase.co';
const FAKE_SDK_PATH = path.join(__dirname, 'fixtures', 'fake-supabase-sdk.js');
const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3';

async function captureTickets(page, status = 201, body = '') {
  const sent = [];
  await page.route(SB + '/rest/v1/support_tickets', (route) => {
    sent.push({ headers: route.request().headers(), body: JSON.parse(route.request().postData()) });
    route.fulfill({ status, body, contentType: 'application/json' });
  });
  return sent;
}

test('contacto: o formulário cria um pedido de apoio e confirma ao utilizador', async ({ page }) => {
  const sent = await captureTickets(page);
  await page.goto('/contacto.html');
  await page.fill('#cf-name', 'Zé Silva');
  await page.fill('#cf-email', 'ze@exemplo.pt');
  await page.selectOption('#cf-subject', 'Pagamentos e planos');
  await page.fill('#cf-message', 'Fui cobrado duas vezes este mês.');
  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.locator('[data-status]')).toContainText('Recebemos a tua mensagem');
  expect(sent).toHaveLength(1);
  expect(sent[0].body).toMatchObject({ kind: 'contacto', name: 'Zé Silva', email: 'ze@exemplo.pt', subject: 'Pagamentos e planos', message: 'Fui cobrado duas vezes este mês.', page: '/contacto.html' });
  expect(sent[0].headers.prefer).toBe('return=minimal');
  await expect(page.locator('#cf-message')).toHaveValue('');
});

test('contacto: robôs que preenchem o campo escondido não chegam a enviar', async ({ page }) => {
  const sent = await captureTickets(page);
  await page.goto('/contacto.html');
  await page.fill('#cf-name', 'Bot');
  await page.fill('#cf-email', 'bot@exemplo.pt');
  await page.fill('#cf-message', 'spam spam spam');
  await page.evaluate(() => { document.querySelector('[name=website]').value = 'http://spam'; });
  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.locator('[data-status]')).toContainText('Recebemos');
  expect(sent).toHaveLength(0);
});

test('contacto: o limite de pedidos por hora mostra uma mensagem clara', async ({ page }) => {
  await captureTickets(page, 400, JSON.stringify({ message: 'Demasiados pedidos seguidos. Tenta de novo daqui a uma hora.' }));
  await page.goto('/contacto.html');
  await page.fill('#cf-name', 'Zé');
  await page.fill('#cf-email', 'ze@exemplo.pt');
  await page.fill('#cf-message', 'Outra vez a mesma dúvida');
  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.locator('[data-status]')).toContainText('daqui a uma hora');
});

test('perfil público: "Denunciar este perfil" envia a denúncia com o perfil certo', async ({ page }) => {
  const sent = await captureTickets(page);
  await page.route(SUPABASE_CDN_URL, (route) => route.fulfill({ path: FAKE_SDK_PATH, contentType: 'text/javascript' }));
  await page.addInitScript((cfg) => { window.__testAuthConfig = cfg; }, {
    session: null,
    tableData: { profiles: { data: [{ id: 'pro-1', name: 'Rui Alves', bio: 'Bio', category: 'Eletricistas', location: 'Porto – Porto', slug: null, plan: 'free', verified: true, created_at: '2026-01-01T00:00:00Z' }] } },
  });
  await page.goto('/profile.html?id=pro-1');
  await expect(page.locator('.profile-name')).toContainText('Rui Alves');
  await page.getByRole('button', { name: 'Denunciar este perfil' }).click();
  const box = page.locator('.sf-box');
  await box.locator('select[name=subject]').selectOption({ label: 'Não fez o trabalho ou burla' });
  await box.locator('textarea[name=message]').fill('Pagou-se adiantado e nunca apareceu.');
  await box.locator('input[name=name]').fill('Maria');
  await box.locator('input[name=email]').fill('maria@exemplo.pt');
  await box.getByRole('button', { name: 'Enviar denúncia' }).click();
  await expect(box.locator('[data-status]')).toContainText('Recebemos a denúncia');
  expect(sent).toHaveLength(1);
  expect(sent[0].body).toMatchObject({ kind: 'denuncia', target_profile_id: 'pro-1', subject: 'Não fez o trabalho ou burla · Rui Alves', name: 'Maria' });
});
