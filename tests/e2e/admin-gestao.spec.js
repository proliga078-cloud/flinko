// Testes E2E do painel de gestão (admin.html).
//
// O painel fala diretamente com a API REST do Supabase (fetch, sem o SDK) e
// com as funções Netlify. Aqui essas duas APIs são simuladas com page.route:
// cada teste define as tabelas e verifica os pedidos que o painel faz quando
// o admin carrega nos botões (aprovar verificação, apagar conta RGPD,
// moderar, enviar emails…), incluindo o que um admin de apoio NÃO vê.
const { test, expect } = require('@playwright/test');

const { openAdmin, modalOk, PRO, ME, iso } = require('./fixtures/admin-mock');

test('lê todas as linhas página a página (sem o limite de 1000 linhas da API)', async ({ page }) => {
  const many = Array.from({ length: 2500 }, (_, i) => ({ ...PRO, id: 'p' + i, name: 'Pro ' + i, verified: true }));
  const calls = await openAdmin(page, { tables: { profiles: [ME].concat(many) } });
  await expect(page.locator('.kpi', { hasText: 'Profissionais' }).first().locator('.v')).toHaveText(/2\s?500/);
  const offsets = calls.filter((c) => c.path === '/rest/v1/profiles' && c.search.includes('offset=')).map((c) => new URLSearchParams(c.search).get('offset'));
  expect(offsets).toEqual(['0', '1000', '2000', '2501']);
});

test('verificação: abre o documento e aprovar chama admin_resolve_verification', async ({ page }) => {
  const calls = await openAdmin(page, { view: 'ops' });
  const card = page.locator('#verifCard');
  await expect(card).toContainText('Rui Alves');
  const popup = page.waitForEvent('popup');
  await card.getByRole('button', { name: /Cartão de cidadão/ }).click();
  await (await popup).close();
  expect(calls.some((c) => c.path === '/storage/v1/object/sign/verification-docs/pro-1/cc.pdf')).toBe(true);
  await card.getByRole('button', { name: 'Aprovar' }).click();
  await modalOk(page);
  await expect.poll(() => calls.find((c) => c.path === '/rest/v1/rpc/admin_resolve_verification')?.body).toEqual({ p_request: 'ver-1', p_approve: true, p_note: null });
});

test('verificar na ficha do profissional usa admin_set_verified (fecha também o pedido)', async ({ page }) => {
  const calls = await openAdmin(page);
  await page.evaluate(() => openPro('pro-1'));
  await page.locator('#drawer').getByRole('button', { name: 'Verificar profissional' }).click();
  await modalOk(page);
  await expect.poll(() => calls.find((c) => c.path === '/rest/v1/rpc/admin_set_verified')?.body).toEqual({ p_profile: 'pro-1', p_value: true });
  expect(calls.some((c) => c.method === 'PATCH' && c.path === '/rest/v1/profiles')).toBe(false);
});

test('RGPD: mudar o estado, exportar dados e apagar conta só com o nome certo', async ({ page }) => {
  const calls = await openAdmin(page, { view: 'ops', fns: { 'admin-gdpr': (b) => (b.action === 'export' ? { data: { profile: { name: 'Ana Cliente' } } } : { success: true, filesRemoved: 2 }) } });
  const card = page.locator('#gdprCard');
  await card.locator('select').nth(1).selectOption('in_progress');
  await expect.poll(() => calls.find((c) => c.method === 'PATCH' && c.path === '/rest/v1/gdpr_requests')?.body?.status).toBe('in_progress');

  const dl = page.waitForEvent('download');
  await card.getByRole('button', { name: /Exportar dados/ }).click();
  expect((await dl).suggestedFilename()).toMatch(/^flinko-dados-ana-cliente-.*\.json$/);

  await card.getByRole('button', { name: 'Apagar conta' }).click();
  await page.locator('#ff_name').fill('Ana');
  await modalOk(page);
  await expect(page.locator('.toast')).toContainText('não coincide');
  expect(calls.some((c) => c.fn === 'admin-gdpr' && c.body.action === 'delete')).toBe(false);

  await card.getByRole('button', { name: 'Apagar conta' }).click();
  await page.locator('#ff_name').fill('Ana Cliente');
  await modalOk(page);
  await expect.poll(() => calls.find((c) => c.fn === 'admin-gdpr' && c.body.action === 'delete')?.body).toEqual({ action: 'delete', requestId: 'gd-1', confirmName: 'Ana Cliente' });
});

test('admin de apoio: não vê pagamentos, receita do Stripe, exportação RGPD nem envio de emails', async ({ page }) => {
  const calls = await openAdmin(page, { role: 'support' });
  await expect(page.locator('#whoami')).toContainText('apoio');
  await page.evaluate(() => openPro('pro-1'));
  await expect(page.locator('#drawer')).toContainText('só para donos');
  await expect(page.locator('#drawer').getByRole('button', { name: 'Pagamentos e reembolsos' })).toHaveCount(0);
  await page.evaluate(() => { closeDrawer(); go('ops'); });
  await expect(page.locator('#gdprCard')).toContainText('só para donos');
  await page.evaluate(() => go('fin'));
  await expect(page.locator('#main')).toContainText('A receita real é só para donos');
  await page.evaluate(() => go('contact'));
  await expect(page.getByRole('button', { name: /Enviar email a este grupo/ })).toHaveCount(0);
  expect(calls.some((c) => c.fn === 'admin-stripe-summary')).toBe(false);
});

test('sem ligação às tabelas do painel: mostra o erro e não guarda nada no navegador às escondidas', async ({ page }) => {
  const calls = await openAdmin(page, { fail: { admin_tasks: { status: 500, message: 'timeout' } } });
  await expect(page.locator('#brokenBanner')).toContainText('Sem ligação às tabelas do painel');
  await page.evaluate(() => go('tasks'));
  await page.locator('#ttl').fill('Ligar ao Rui');
  await page.getByRole('button', { name: 'Adicionar' }).click();
  await expect(page.locator('.toast')).toContainText('nada foi guardado');
  expect(calls.some((c) => c.method === 'POST' && c.path === '/rest/v1/admin_tasks')).toBe(false);
  expect(await page.evaluate(() => localStorage.getItem('fk_tasks'))).toBeNull();
});

test('tabelas do painel ainda por criar: continua a funcionar só neste navegador (sem aviso de erro)', async ({ page }) => {
  await openAdmin(page, { fail: { admin_tasks: { status: 404, message: 'relation "public.admin_tasks" does not exist' } } });
  await expect(page.locator('#brokenBanner')).toHaveCount(0);
  await page.evaluate(() => go('set'));
  await expect(page.locator('#main')).toContainText('Só neste navegador');
});

test('moderação: denúncia visível, apagar avaliação suspeita e fechar pedido', async ({ page }) => {
  const calls = await openAdmin(page, { view: 'mod' });
  await expect(page.locator('#denCard')).toContainText('Não é eletricista');
  const rev = page.locator('#revCard');
  await expect(rev).toContainText('Troll');
  await expect(rev).not.toContainText('Muito bom'); // só as suspeitas por omissão
  await rev.getByRole('button', { name: 'Apagar' }).click();
  await modalOk(page);
  await expect.poll(() => calls.find((c) => c.method === 'DELETE' && c.path === '/rest/v1/reviews')?.search).toContain('id=eq.rev-bad');
  await page.locator('#reqCard').getByRole('button', { name: 'Fechar' }).click();
  await expect.poll(() => calls.find((c) => c.method === 'PATCH' && c.path === '/rest/v1/requests')?.body).toEqual({ status: 'resolved' });
});

test('apoio: pedidos do formulário de contacto aparecem e mudam de estado', async ({ page }) => {
  const calls = await openAdmin(page, { view: 'support' });
  const card = page.locator('#webTickets');
  await expect(card).toContainText('Quanto custa o Pro?');
  await expect(card).not.toContainText('Não é eletricista'); // denúncias ficam em Moderação
  await card.locator('select').selectOption('resolvido');
  await expect.poll(() => calls.find((c) => c.method === 'PATCH' && c.path === '/rest/v1/support_tickets')?.body?.status).toBe('resolvido');
});

test('enviar email a um grupo: pré-visualiza, confirma e manda o texto preenchido para cada pessoa', async ({ page }) => {
  const calls = await openAdmin(page, {
    view: 'contact',
    fns: { 'admin-send-campaign': (b) => (b.action === 'preview' ? { recipients: 1, skipped: [] } : { sent: 1, failed: [], skipped: [], sentIds: ['pro-1'] }) },
  });
  await page.evaluate(() => setSeg('all'));
  await page.getByRole('button', { name: /Enviar email a este grupo/ }).click();
  await page.locator('#ff_subject').fill('Olá {nome}');
  await page.locator('#ff_text').fill('Olá {nome}, falta-te: {falta}.');
  await modalOk(page);
  await expect(page.locator('#modal')).toContainText('1 profissional(is)');
  await modalOk(page);
  await expect.poll(() => calls.find((c) => c.fn === 'admin-send-campaign' && c.body.action === 'send')?.body?.messages?.['pro-1']).toMatch(/^Olá Rui, falta-te: /);
  await expect(page.locator('.toast')).toContainText('1 email(s) enviado(s)');
});

test('registo de ações: mostra o que vem do admin_audit e a receita real do Stripe nas Finanças', async ({ page }) => {
  await openAdmin(page, { view: 'audit', fns: { 'admin-stripe-summary': { mrr: 1999, last30: { gross: 1999, refunds: 0, fees: 60, net: 1939 }, months: [], subscriptions: { active: 1, trialing: 0, pastDue: 1 }, pastDue: [{ customer: { name: 'Rui Alves', profile_id: 'pro-1' }, monthly: 1999 }], churned30: [], disputes: [], balance: { available: 1939, pending: 0 } } } });
  await expect(page.locator('#autable')).toContainText('Rui Alves: suspended');
  await expect(page.locator('#autable')).toContainText('outro@flinko.pt');
  await page.evaluate(() => go('fin'));
  await expect(page.locator('#main')).toContainText('MRR real');
  await expect(page.locator('#main')).toContainText('em atraso');
});

test('clientes: lista as contas de cliente com os seus pedidos', async ({ page }) => {
  await openAdmin(page, { view: 'clients' });
  await expect(page.locator('#cltable')).toContainText('Ana Cliente');
  await page.locator('#cltable tr.clk').first().click();
  await expect(page.locator('#drawer')).toContainText('Instalar tomadas');
});
