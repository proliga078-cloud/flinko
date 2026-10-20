// Painel de gestão novo (gestao.html), out/2026. O dono pediu um painel mais
// simples: 6 partes em vez de 29. E os envios davam erro: agora vão aos
// poucos (lotes de 10, abaixo do limite de 10 s do Netlify), mostram quem
// recebeu e quem falhou, e as respostas às conversas da Flinko saem pelo
// servidor em nome da Flinko, seja qual for o admin.
const { test, expect } = require('@playwright/test');
const { openAdmin, PRO, iso } = require('./fixtures/admin-mock');

const abrir = (page, opts = {}) => openAdmin(page, { path: '/gestao.html', ...opts });
const INBOX = { conversations: [{ id: 'conv-1', professionalId: 'pro-1', name: 'Rui Alves', category: 'Eletricistas', lastMessage: 'Já completei o perfil!', lastAt: iso(0.1), porResponder: true }] };
const muitos = (n) => Array.from({ length: n }, (_, i) => ({ ...PRO, id: 'p' + i, name: 'Pro ' + i, verified: true }));

test('entra direto com a sessão de admin e mostra as 7 partes', async ({ page }) => {
  await abrir(page, { fns: { 'admin-flinko-message': INBOX } });
  await expect(page.locator('#main h1')).toHaveText('Hoje');
  await expect(page.locator('#nav a')).toHaveText([/Hoje/, /Estratégia/, /Profissionais/, /Mensagens/, /Clientes e pedidos/, /Angariação/, /Dinheiro e equipa/]);
});

test('Hoje: o que há para fazer (mensagens, verificar, pedidos)', async ({ page }) => {
  await abrir(page, { fns: { 'admin-flinko-message': INBOX } });
  const main = page.locator('#main');
  await expect(main.locator('.cartao', { has: page.locator('h2', { hasText: 'Mensagens por responder' }) })).toContainText('Rui Alves');
  await expect(main.locator('.cartao', { has: page.locator('h2', { hasText: 'Profissionais por verificar' }) })).toContainText('Rui Alves');
  await expect(main.locator('.cartao', { has: page.locator('h2', { hasText: 'Pedidos de clientes' }) })).toContainText('Instalar tomadas');
  await expect(page.locator('#nav a[href="#mensagens"] .conta')).toHaveText('1');
});

test('Profissionais: filtra, abre a ficha, verifica e guarda notas', async ({ page }) => {
  const calls = await abrir(page, { fns: { 'admin-flinko-message': INBOX } });
  await page.locator('#nav a[href="#profissionais"]').click();
  await expect(page.locator('[data-grupo="verificar"]')).toContainText('1');
  await page.locator('#pesqPros').fill('nada disto');
  await expect(page.locator('#listaPros')).toContainText('Ninguém neste grupo');
  await page.locator('#pesqPros').fill('rui');
  await page.locator('#listaPros li', { hasText: 'Rui Alves' }).click();
  const ficha = page.locator('#ficha');
  await expect(ficha).toContainText('912345678');
  await ficha.getByRole('button', { name: 'Verificar' }).click();
  await expect.poll(() => calls.find((c) => c.path === '/rest/v1/rpc/admin_set_verified')?.body).toEqual({ p_profile: 'pro-1', p_value: true });
  await page.locator('#fEtapa').selectOption('contactado');
  await page.locator('#fNotas').fill('Ligou-me, vai pôr fotos.');
  await ficha.getByRole('button', { name: 'Guardar notas' }).click();
  await expect.poll(() => calls.find((c) => c.method === 'POST' && c.path === '/rest/v1/admin_crm')?.body).toMatchObject({ profile_id: 'pro-1', stage: 'contactado', notes: 'Ligou-me, vai pôr fotos.' });
});

test('Mensagens: lê a conversa e responde em nome da Flinko', async ({ page }) => {
  const calls = await abrir(page, {
    fns: {
      'admin-flinko-message': (b) => b.action === 'inbox' ? INBOX : b.action === 'thread'
        ? { messages: [{ id: 'm1', content: 'Já completei o perfil!', createdAt: iso(0.1), deFlinko: false }] }
        : { sent: 1 },
    },
  });
  await page.goto('/gestao.html#mensagens/conv-1');
  await expect(page.locator('#msgs')).toContainText('Já completei o perfil!');
  await page.locator('#tResp').fill('Ótimo, obrigado!');
  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.locator('#aviso')).toHaveText('Resposta enviada.');
  expect(calls.find((c) => c.fn === 'admin-flinko-message' && c.body.action === 'reply').body).toEqual({ action: 'reply', conversationId: 'conv-1', message: 'Ótimo, obrigado!' });
});

test('Mensagens: se a resposta falhar, diz porquê e não perde o texto', async ({ page }) => {
  await abrir(page, {
    fns: {
      'admin-flinko-message': (b) => b.action === 'inbox' ? INBOX : b.action === 'thread' ? { messages: [] } : { status: 500, json: { error: 'A base de dados recusou.' } },
    },
  });
  await page.goto('/gestao.html#mensagens/conv-1');
  await page.locator('#tResp').fill('Olá');
  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.locator('#aviso')).toContainText('A base de dados recusou.');
  await expect(page.locator('#tResp')).toHaveValue('Olá');
});

test('Enviar a um grupo: vai aos poucos (10 de cada vez), mostra quem falhou e repete só esses', async ({ page }) => {
  let lote = 0;
  const calls = await abrir(page, {
    tables: { profiles: [{ id: 'admin-1', name: 'Admin', is_admin: true, account_type: 'professional', created_at: iso(100) }, ...muitos(23)] },
    fns: {
      'admin-flinko-message': (b) => {
        if (b.action === 'inbox') return { conversations: [] };
        lote++;
        if (lote === 2) return { status: 504, json: {} };
        return { sent: b.profileIds.length, sentIds: b.profileIds, skipped: [] };
      },
    },
  });
  await page.goto('/gestao.html#mensagens/enviar');
  await page.locator('#modelo').selectOption('avaliacoes');
  await expect(page.locator('#previa')).toContainText('Olá Pro');
  await page.getByRole('button', { name: 'Enviar a 23' }).click();
  await expect(page.locator('#resultado')).toContainText('13 enviada(s), 10 falharam');
  await expect(page.locator('#resultado')).toContainText('O servidor demorou demasiado');
  const envios = calls.filter((c) => c.fn === 'admin-flinko-message' && c.body.action === 'send');
  expect(envios.map((c) => c.body.profileIds.length)).toEqual([10, 10, 3]);
  // cada pessoa recebe o texto com o seu nome
  expect(envios[0].body.messages.p0).toContain('Olá Pro!');
  await page.getByRole('button', { name: 'Tentar outra vez só estes' }).click();
  await expect(page.locator('#resultado')).toContainText('10 enviada(s)');
  const ultimo = calls.filter((c) => c.fn === 'admin-flinko-message' && c.body.action === 'send').pop();
  expect(ultimo.body.profileIds).toEqual(['p10', 'p11', 'p12', 'p13', 'p14', 'p15', 'p16', 'p17', 'p18', 'p19']);
});

test('Angariação: junta um contacto novo', async ({ page }) => {
  const calls = await abrir(page, { fns: { 'admin-flinko-message': INBOX } });
  await page.goto('/gestao.html#angariacao');
  await page.getByRole('button', { name: 'Adicionar contacto' }).click();
  await page.locator('#lNome').fill('Carlos Pinto');
  await page.locator('#lTel').fill('912000111');
  await page.locator('#lCat').fill('Canalizador');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect.poll(() => calls.find((c) => c.method === 'POST' && c.path === '/rest/v1/admin_items')?.body).toMatchObject({ kind: 'lead', data: { name: 'Carlos Pinto', phone: '912000111', stage: 'novo' } });
});

test('conta de apoio: sem "só email" nem números da Stripe', async ({ page }) => {
  await abrir(page, { role: 'support', fns: { 'admin-flinko-message': INBOX } });
  await page.goto('/gestao.html#dinheiro');
  await expect(page.locator('#stripe')).toContainText('só para donos');
  await page.goto('/gestao.html#mensagens/enviar');
  await expect(page.locator('#canal option')).toHaveCount(1);
});

test('quem não é admin fica na entrada, com a explicação', async ({ page }) => {
  await abrir(page, { me: { is_admin: false } });
  await expect(page.locator('#login')).toBeVisible();
  await expect(page.locator('#lErro')).toContainText('não tem acesso');
  await expect(page.locator('#app')).toBeHidden();
});

test('no telemóvel: menu em baixo e nada desliza para o lado', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await abrir(page, { fns: { 'admin-flinko-message': INBOX } });
  await expect(page.locator('#main h1')).toHaveText('Hoje');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  const nav = await page.locator('.lado').boundingBox();
  expect(nav.y + nav.height).toBeGreaterThan(760);
});

// "Só com visitantes não tenho nada": a parte Estratégia junta os números
// verdadeiros (sem a equipa nem os profissionais) com estudos, passos e
// como medir, mais o plano de 4 semanas, as políticas e a concorrência.
test('Estratégia: números sem a equipa, recomendações completas, plano, estudos, políticas e concorrência', async ({ page }) => {
  const dia = new Date().toISOString().slice(0, 10);
  const v = (visitor_id, path, ref_host, user_id = null) => ({ day: dia, visitor_id, user_id, path, ref_host, n: 1, last_at: iso(0) });
  await abrir(page, {
    tables: {
      visits: [v('c1', '/', 'google.com'), v('c1', '/eletricistas', 'flinko.pt'), v('c1', '/rui', 'flinko.pt'), v('c2', '/', 'l.facebook.com'), v('pro', '/dashboard', 'Direto', 'pro-1')],
    },
    fns: { 'admin-flinko-message': INBOX },
  });
  await page.goto('/gestao.html#estrategia');
  const main = page.locator('#main');
  await expect(main.locator('h1')).toHaveText('Estratégia');
  await expect(main.locator('.kpi').first()).toContainText('2');
  await expect(main.locator('.kpi').first()).toContainText('visitantes reais');
  const trafego = main.locator('.rec', { hasText: 'o problema é falta de gente' });
  await expect(trafego).toContainText('Tiveste 2 visitantes reais em 30 dias');
  await expect(trafego).toContainText('The Cold Start Problem');
  await expect(trafego.locator('ol li')).toHaveCount(5);
  await expect(trafego).toContainText('Como medir');
  await expect(main.locator('.cartao', { hasText: 'De onde vêm os visitantes' })).toContainText('Google');
  await expect(main.locator('.cartao h3')).toContainText(['Semana 1', 'Semana 2', 'Semana 3', 'Semana 4']);
  await expect(main.locator('.rec', { hasText: 'Como se arranca um marketplace' })).toBeVisible();
  await expect(main.locator('.cartao', { hasText: 'Seguro e garantias' })).toContainText('Falta');
  await expect(main.locator('.tabela')).toContainText(['Zaask']);
  await page.getByRole('button', { name: '7 dias' }).click();
  await expect(trafego).toContainText('em 7 dias');
});

test('Estratégia: no telemóvel não desliza para o lado', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await abrir(page, { fns: { 'admin-flinko-message': INBOX } });
  await page.goto('/gestao.html#estrategia');
  await expect(page.locator('#main h1')).toHaveText('Estratégia');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
