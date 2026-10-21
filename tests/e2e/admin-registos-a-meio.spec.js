// admin-antigo.html › Avisos: contas com o registo a meio e convite para acabarem.
const { test, expect } = require('@playwright/test');
const { openAdmin, modalOk } = require('./fixtures/admin-mock');

const PREVIEW = {
  total: 2, porConvidar: 1,
  contas: [
    { id: 'ana', email: 'ana@x.pt', criada: '2026-06-16T10:00:00Z', via: 'email', convidado: null, podeConvidar: true },
    { id: 'rui', email: 'rui@x.pt', criada: '2026-08-01T10:00:00Z', via: 'google', convidado: '2026-09-25T10:00:00Z', podeConvidar: false },
  ],
  exemplo: { assunto: 'Falta só um passo para entrares na Flinko', texto: 'Olá Ana!\n\nCriaste conta na Flinko…' },
};

test('aviso e lista de registos a meio; enviar o convite pede confirmação com o texto do email', async ({ page }) => {
  let enviado = false;
  const calls = await openAdmin(page, {
    view: 'alerts',
    fns: { 'admin-registos-a-meio': (b) => b.action === 'send' ? (enviado = true, { sent: 1, failed: 0 }) : (enviado ? { ...PREVIEW, porConvidar: 0 } : PREVIEW) },
  });
  await expect(page.locator('#main')).toContainText('1 pessoa(s) criaram conta mas o registo ficou a meio');
  const card = page.locator('#incompletosCard');
  await expect(card).toContainText('Registos a meio (2)');
  await expect(card).toContainText('ana@x.pt');
  await expect(card).toContainText('enviado 25/09/2026');
  await card.getByRole('button', { name: 'Enviar convite a 1' }).click();
  await expect(page.locator('#modal')).toContainText('Falta só um passo para entrares na Flinko');
  await modalOk(page);
  await expect.poll(() => calls.filter((c) => c.fn === 'admin-registos-a-meio').map((c) => c.body.action)).toEqual(['preview', 'send', 'preview']);
  await expect(card.getByRole('button', { name: /Enviar convite/ })).toHaveCount(0);
});

test('admin de apoio não pede a lista (é só para donos)', async ({ page }) => {
  const calls = await openAdmin(page, { role: 'support', view: 'alerts' });
  expect(calls.some((c) => c.fn === 'admin-registos-a-meio')).toBe(false);
  await expect(page.locator('#incompletosCard')).toHaveCount(0);
});
