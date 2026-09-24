// Testes E2E do painel de gestão (admin.html).
//
// O painel fala diretamente com a API REST do Supabase (fetch, sem o SDK) e
// com as funções Netlify. Aqui essas duas APIs são simuladas com page.route:
// cada teste define as tabelas e verifica os pedidos que o painel faz quando
// o admin carrega nos botões (aprovar verificação, apagar conta RGPD,
// moderar, enviar emails…), incluindo o que um admin de apoio NÃO vê.
const { test, expect } = require('@playwright/test');

const SB = 'https://cdwinidhtfxfxowflize.supabase.co';
const DAY = 864e5;
const iso = (d) => new Date(Date.now() - d * DAY).toISOString();

const PRO = { id: 'pro-1', name: 'Rui Alves', account_type: 'professional', category: 'Eletricistas', location: 'Porto – Porto', plan: 'free', verified: false, suspended: false, is_admin: false, is_demo: false, created_at: iso(20), bio: 'Olá', photo_url: 'x' };
const CLI = { id: 'cli-1', name: 'Ana Cliente', account_type: 'client', plan: 'free', verified: false, suspended: false, is_admin: false, is_demo: false, created_at: iso(5) };
const ME = { id: 'admin-1', name: 'Admin', account_type: 'professional', is_admin: true, is_demo: false, plan: 'free', created_at: iso(100) };

function baseTables() {
  return {
    profiles: [ME, PRO, CLI],
    profile_private: [{ profile_id: 'pro-1', phone: '912345678' }],
    reviews: [
      { id: 'rev-ok', professional_id: 'pro-1', client_id: 'cli-1', reviewer_name: 'Ana', rating: 5, comment: 'Muito bom', created_at: iso(3) },
      { id: 'rev-bad', professional_id: 'pro-1', client_id: null, reviewer_name: 'Troll', rating: 1, comment: 'isto é uma burla, merda', created_at: iso(2) },
    ],
    requests: [{ id: 'req-1', client_id: 'cli-1', title: 'Instalar tomadas', description: 'Três tomadas na sala', category: 'Eletricistas', location: 'Porto', status: 'open', created_at: iso(3) }],
    verification_requests: [{ id: 'ver-1', profile_id: 'pro-1', status: 'pending', documents: [{ path: 'pro-1/cc.pdf', name: 'Cartão de cidadão' }], notes: 'Envio o CC', created_at: iso(4) }],
    gdpr_requests: [{ id: 'gd-1', profile_id: 'cli-1', request_type: 'delete', status: 'pending', created_at: iso(10) }],
    support_tickets: [
      { id: 't-1', kind: 'contacto', name: 'Zé', email: 'ze@exemplo.pt', subject: 'Dúvida sobre planos', message: 'Quanto custa o Pro?', status: 'aberto', priority: 'media', created_at: iso(1) },
      { id: 't-2', kind: 'denuncia', name: 'Maria', email: 'maria@exemplo.pt', subject: 'Perfil falso · Rui Alves', message: 'Não é eletricista', target_profile_id: 'pro-1', status: 'aberto', priority: 'media', created_at: iso(1) },
    ],
    admin_audit: [{ id: 1, at: iso(0.1), actor_email: 'outro@flinko.pt', action: 'perfil_alterado', target_type: 'profile', target_id: 'pro-1', summary: 'Rui Alves: suspended', details: {} }],
    admin_tasks: [], admin_crm: [], admin_settings: [], admin_items: [],
  };
}

// Simula o Supabase e as funções Netlify. Devolve o registo de pedidos feitos.
async function openAdmin(page, { role = 'owner', tables = {}, fail = {}, fns = {}, view } = {}) {
  const T = Object.assign(baseTables(), tables), calls = [];
  await page.addInitScript(() => localStorage.setItem('fk_session', JSON.stringify({ access_token: 'tok', refresh_token: 'r', user: { id: 'admin-1', email: 'dono@flinko.pt' } })));
  await page.route(SB + '/**', async (route) => {
    const req = route.request(), url = new URL(req.url()), method = req.method();
    const body = req.postData() ? JSON.parse(req.postData()) : null;
    calls.push({ method, path: url.pathname, search: url.search, body });
    if (url.pathname.startsWith('/storage/v1/object/sign/')) return route.fulfill({ json: { signedURL: '/object/sign/verification-docs/pro-1/cc.pdf?token=x' } });
    const m = url.pathname.match(/^\/rest\/v1\/(.+)$/); if (!m) return route.fulfill({ status: 404, json: {} });
    const name = m[1], q = url.searchParams;
    if (fail[name]) return route.fulfill({ status: fail[name].status, json: { message: fail[name].message } });
    if (name === 'profiles' && q.get('select') === 'is_admin,admin_role') return route.fulfill({ json: [{ is_admin: true, admin_role: role }] });
    if (name.startsWith('rpc/')) {
      if (name === 'rpc/admin_visit_rows') return route.fulfill({ json: Number(q.get('offset')) ? [] : [{ day: new Date().toISOString().slice(0, 10), visitor_id: 'v1', user_id: null, path: '/', ref_host: 'google.com', n: 3, last_at: iso(0.1) }] });
      if (name === 'rpc/admin_team') return route.fulfill({ json: [{ profile_id: 'admin-1', name: 'Admin', email: 'dono@flinko.pt', admin_role: role }] });
      if (name === 'rpc/admin_pro_emails') return route.fulfill({ json: [{ profile_id: 'pro-1', email: 'rui@exemplo.pt' }, { profile_id: 'cli-1', email: 'ana@exemplo.pt' }] });
      return route.fulfill({ status: 200, json: null });
    }
    if (method !== 'GET') return route.fulfill({ status: 204, body: '' });
    const rows = T[name] || [];
    const off = Number(q.get('offset') || 0), lim = q.has('limit') ? Number(q.get('limit')) : rows.length;
    return route.fulfill({ json: rows.slice(off, off + lim) });
  });
  await page.route('**/.netlify/functions/*', async (route) => {
    const req = route.request(), fname = new URL(req.url()).pathname.split('/').pop(), body = JSON.parse(req.postData() || '{}');
    calls.push({ fn: fname, body });
    const h = fns[fname];
    const res = typeof h === 'function' ? h(body) : h;
    return route.fulfill(res && res.status ? res : { json: res || {} });
  });
  page.on('dialog', (d) => d.accept());
  await page.goto('/admin.html');
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#main h1')).toHaveText('Painel');
  if (view) await page.evaluate((v) => go(v), view);
  return calls;
}
const modalOk = (page) => page.locator('#modal #myes').click();

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
