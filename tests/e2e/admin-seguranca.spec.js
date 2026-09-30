// Proteções de dinheiro e segurança no painel de gestão (admin.html).
//
// Estes casos eram testados no painel antigo (admin-classico.html, apagado em
// set/2026) e passaram para o painel atual:
//  - mudar o plano passa sempre pela função admin-set-plan (que cancela a
//    subscrição Stripe), nunca por uma escrita direta no perfil;
//  - reembolsos pedem a lista ao servidor e mandam o pagamento certo;
//  - o caminho de um documento de verificação nunca é executado como HTML.
const { test, expect } = require('@playwright/test');
const { openAdmin, modalOk, PRO } = require('./fixtures/admin-mock');

test('mudar o plano chama admin-set-plan e não escreve o plano diretamente no perfil', async ({ page }) => {
  const calls = await openAdmin(page, { tables: { profiles: [{ ...PRO, stripe_subscription_id: 'sub_1', plan: 'pro' }] }, fns: { 'admin-set-plan': { success: true, stripeCancelled: true } } });
  await page.evaluate(() => openPro('pro-1'));
  await page.locator('#planSel').selectOption('free');
  await page.locator('#drawer').getByRole('button', { name: 'Alterar plano' }).click();
  await expect(page.locator('#modal')).toContainText('subscrição ativa no Stripe');
  await modalOk(page);
  await expect.poll(() => calls.find((c) => c.fn === 'admin-set-plan')?.body).toEqual({ targetProfileId: 'pro-1', plan: 'free' });
  expect(calls.some((c) => c.method === 'PATCH' && c.path === '/rest/v1/profiles' && c.body && 'plan' in c.body)).toBe(false);
});

test('reembolso: lista os pagamentos do servidor e reembolsa o pagamento certo', async ({ page }) => {
  const charge = { id: 'ch_1', amount: 1999, amount_refunded: 0, currency: 'eur', refunded: false, paid: true, created: Math.floor(Date.now() / 1000) };
  const calls = await openAdmin(page, { fns: { 'admin-refund': (b) => (b.action === 'list' ? { charges: [charge] } : { success: true, refund: { id: 're_1', amount: 1999 } }) } });
  await page.evaluate(() => openPro('pro-1'));
  await page.locator('#drawer').getByRole('button', { name: 'Pagamentos e reembolsos' }).click();
  await expect(page.locator('#chargesBox')).toContainText('19,99');
  await page.locator('#chargesBox').getByRole('button', { name: /Reembolsar/ }).click();
  await modalOk(page); // formulário (valor 0 = tudo)
  await expect(page.locator('#modal')).toContainText('não pode ser desfeito');
  await modalOk(page); // confirmação
  await expect.poll(() => calls.find((c) => c.fn === 'admin-refund' && c.body.action === 'refund')?.body).toMatchObject({ action: 'refund', targetProfileId: 'pro-1', chargeId: 'ch_1' });
});

test('SEGURANÇA: caminho malicioso de um documento de verificação não executa código', async ({ page }) => {
  const mau = `pro-1/x"><img src=x onerror="window.__pwn=1">.pdf`;
  const calls = await openAdmin(page, { view: 'ops', tables: { verification_requests: [{ id: 'ver-1', profile_id: 'pro-1', status: 'pending', documents: [{ path: mau, name: 'Documento' }], created_at: new Date().toISOString() }] } });
  const card = page.locator('#verifCard');
  await expect(card).toContainText('Rui Alves');
  expect(await page.evaluate(() => window.__pwn)).toBeUndefined();
  const popup = page.waitForEvent('popup');
  await card.getByRole('button', { name: /Documento/ }).click();
  await (await popup).close();
  expect(await page.evaluate(() => window.__pwn)).toBeUndefined();
  expect(calls.some((c) => c.path && c.path.startsWith('/storage/v1/object/sign/verification-docs/'))).toBe(true);
});
