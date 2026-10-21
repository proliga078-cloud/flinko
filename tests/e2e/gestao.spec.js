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

test('entra direto com a sessão de admin e mostra as 9 partes', async ({ page }) => {
  await abrir(page, { fns: { 'admin-flinko-message': INBOX } });
  await expect(page.locator('#main h1')).toHaveText('Hoje');
  await expect(page.locator('#nav a')).toHaveText([/Hoje/, /Estratégia/, /Profissionais/, /Mensagens/, /Clientes e pedidos/, /Moderação e apoio/, /Angariação/, /Dinheiro/, /Empresa/]);
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
  // como cresceram empresas conhecidas, e o que copiar
  const casos = main.locator('.caso');
  await expect(casos.first()).toContainText('O que o Flinko pode copiar');
  expect(await casos.count()).toBeGreaterThanOrEqual(8);
  await expect(main.locator('.caso', { hasText: 'Hotmail' })).toContainText('Orçamento gerado através da Flinko');
  await page.getByRole('button', { name: '7 dias' }).click();
  await expect(trafego).toContainText('em 7 dias');
});

test('Estratégia: no telemóvel não desliza para o lado', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await abrir(page, { fns: { 'admin-flinko-message': INBOX } });
  await page.goto('/gestao.html#estrategia');
  await expect(page.locator('#main h1')).toHaveText('Estratégia');
  // Letra larga, como a de reserva no servidor do GitHub (lá passava 11px).
  await page.addStyleTag({ content: '*{font-family:Verdana,sans-serif!important}' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});

/* ===== Fase 1 do painel único: tudo do antigo, mais arrumado ===== */

test('Mensagens: envia também a clientes, pela Flinko', async ({ page }) => {
  const calls = await abrir(page, { fns: { 'admin-flinko-message': (b) => b.action === 'inbox' ? { conversations: [] } : { sent: b.profileIds.length, sentIds: b.profileIds, skipped: [] } } });
  await page.goto('/gestao.html#mensagens/enviar');
  await page.getByRole('button', { name: 'Clientes' }).click();
  await expect(page.locator('#destinos')).toContainText('Ana Cliente');
  await page.locator('#modelo').selectOption('pedido');
  await expect(page.locator('#previa')).toContainText('Olá Ana!');
  await page.getByRole('button', { name: 'Enviar a 1' }).click();
  await expect(page.locator('#resultado')).toContainText('1 enviada(s)');
  const envio = calls.find((c) => c.fn === 'admin-flinko-message' && c.body.action === 'send');
  expect(envio.body.profileIds).toEqual(['cli-1']);
});

test('Mensagens: guarda um texto como modelo para usar depois', async ({ page }) => {
  const calls = await abrir(page, { dialogo: (d) => d.type() === 'prompt' ? d.accept('Lembrete de fotos') : d.accept(), fns: { 'admin-flinko-message': { conversations: [] } } });
  await page.goto('/gestao.html#mensagens/enviar');
  await page.locator('#texto').fill('Olá {nome}, não te esqueças das fotos!');
  await page.getByRole('button', { name: 'Guardar como modelo' }).click();
  await expect(page.locator('#modelo')).toContainText('★ Lembrete de fotos');
  const g = calls.find((c) => c.method === 'POST' && c.path === '/rest/v1/admin_items');
  expect(g.body).toMatchObject({ kind: 'template', data: { name: 'Lembrete de fotos', text: 'Olá {nome}, não te esqueças das fotos!', publico: 'pros' } });
});

test('Outros envios: convite aos registos a meio e email de teste', async ({ page }) => {
  const calls = await abrir(page, {
    fns: {
      'admin-flinko-message': { conversations: [] },
      'admin-registos-a-meio': (b) => b.action === 'preview' ? { total: 2, porConvidar: 2, contas: [{ email: 'a@x.pt', criada: iso(5) }, { email: 'b@x.pt', criada: iso(9) }], exemplo: { assunto: 'Acaba o registo', texto: 'Olá!' } } : { sent: 1, failed: 1 },
      'admin-send-campaign': { sent: 1, to: 'dono@flinko.pt' },
    },
  });
  await page.goto('/gestao.html#mensagens/outros');
  await expect(page.locator('#cMeio')).toContainText('a@x.pt');
  await page.getByRole('button', { name: 'Enviar convite a 2' }).click();
  await expect(page.locator('#aviso')).toContainText('1 falharam');
  await page.getByRole('button', { name: 'Enviar email de teste para mim' }).click();
  await expect(page.locator('#rTeste')).toContainText('dono@flinko.pt');
  expect(calls.some((c) => c.fn === 'admin-registos-a-meio' && c.body.action === 'send')).toBe(true);
});

test('Moderação: denúncia, avaliação, verificação e RGPD', async ({ page }) => {
  const calls = await abrir(page, { dialogo: (d) => d.type() === 'prompt' ? d.accept(d.message().includes('nome exato') ? 'Ana Cliente' : 'Documento confirmado') : d.accept(), fns: { 'admin-flinko-message': { conversations: [] }, 'admin-gdpr': { filesRemoved: 2 } } });
  await page.goto('/gestao.html#moderacao/denuncias');
  await expect(page.locator('#abaMod')).toContainText('Perfil falso · Rui Alves');
  await page.getByRole('button', { name: 'Suspender o perfil' }).click();
  await expect.poll(() => calls.find((c) => c.method === 'PATCH' && c.path === '/rest/v1/profiles')?.body).toEqual({ suspended: true });

  await page.goto('/gestao.html#moderacao/avaliacoes');
  await expect(page.locator('#abaMod')).toContainText('linguagem ofensiva');
  await page.locator('[data-av-apagar="rev-bad"]').click();
  await expect.poll(() => calls.some((c) => c.method === 'DELETE' && c.path === '/rest/v1/reviews' && c.search.includes('rev-bad'))).toBe(true);

  await page.goto('/gestao.html#moderacao/verificacoes');
  await expect(page.locator('#abaMod')).toContainText('Cartão de cidadão');
  await page.getByRole('button', { name: 'Aprovar' }).click();
  await expect.poll(() => calls.find((c) => c.path === '/rest/v1/rpc/admin_resolve_verification')?.body).toEqual({ p_request: 'ver-1', p_approve: true, p_note: 'Documento confirmado' });

  await page.goto('/gestao.html#moderacao/rgpd');
  await expect(page.locator('#abaMod')).toContainText('Apagar a conta · Ana Cliente');
  await page.getByRole('button', { name: 'Apagar a conta' }).click();
  await expect.poll(() => calls.find((c) => c.fn === 'admin-gdpr')?.body).toEqual({ action: 'delete', requestId: 'gd-1', confirmName: 'Ana Cliente' });
});

test('Pesquisa global: Ctrl+K encontra um profissional e abre a ficha', async ({ page }) => {
  await abrir(page, { fns: { 'admin-flinko-message': INBOX } });
  await expect(page.locator('#main h1')).toHaveText('Hoje');
  await page.keyboard.press('Control+k');
  await page.locator('#pq').fill('rui');
  await expect(page.locator('#pqRes')).toContainText('Profissional');
  await page.locator('#pq').press('Enter');
  await expect(page.locator('#ficha')).toContainText('912345678');
});

test('telemóvel: 4 partes em baixo e o "Mais" com o resto e a pesquisa', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await abrir(page, { fns: { 'admin-flinko-message': INBOX } });
  await expect(page.locator('#main h1')).toHaveText('Hoje');
  await expect(page.locator('#nav a:visible')).toHaveCount(4);
  await page.getByRole('button', { name: 'Mais partes e procurar' }).click();
  await page.locator('#ficha').getByRole('link', { name: 'Moderação e apoio' }).click();
  await expect(page.locator('#main h1')).toHaveText('Moderação e apoio');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});

/* ===== Fase 2: Hoje, Profissionais e Clientes completos ===== */
const hojeD = () => new Date().toISOString().slice(0, 10);
const espiaJanelas = (page) => page.evaluate(() => { window.__abertos = []; window.open = (u) => { window.__abertos.push(u); return null; }; });

test('Hoje: avisos com "adiar" e escolher que avisos aparecem', async ({ page }) => {
  const calls = await abrir(page, { fns: { 'admin-flinko-message': INBOX } });
  const avisos = page.locator('#cAvisos');
  await expect(avisos).toContainText('1 profissional(is) por verificar');
  await expect(avisos).toContainText('denúncia');
  await avisos.locator('li', { hasText: 'por verificar' }).getByRole('button', { name: 'Adiar 7 dias' }).click();
  await expect.poll(() => calls.find((c) => c.method === 'POST' && c.path === '/rest/v1/admin_items' && c.body.kind === 'snooze')?.body.data.key).toBe('unver:all');
  await page.getByRole('button', { name: 'Escolher avisos' }).click();
  await page.locator('#fRegras input[value="den"]').uncheck();
  await page.locator('#fRegras').getByRole('button', { name: 'Guardar' }).click();
  await expect.poll(() => calls.find((c) => c.method === 'POST' && c.path === '/rest/v1/admin_settings')?.body).toEqual({ key: 'alertrules', value: { off: ['den'] } });
});

test('Hoje: seguimento automático por WhatsApp envia e marca o passo seguinte', async ({ page }) => {
  const calls = await abrir(page, {
    tables: { admin_items: [
      { id: 'l1', kind: 'lead', data: { name: 'Carlos Pinto', phone: '912000111', category: 'Canalizador', stage: 'contactado' } },
      { id: 'f1', kind: 'followup', data: { target: 'lead', ref: 'l1', seq: 'd1', step: 0, tpl: 'd6', due: hojeD(), created: iso(3) } },
    ] },
    fns: { 'admin-flinko-message': INBOX },
  });
  await expect(page.locator('#main')).toContainText('Seguimentos automáticos');
  await espiaJanelas(page);
  await page.locator('[data-seg="f1"]').click();
  await expect.poll(() => page.evaluate(() => window.__abertos[0] || '')).toContain('wa.me');
  const seg = () => calls.filter((c) => c.method === 'POST' && c.path === '/rest/v1/admin_items' && c.body.kind === 'followup').map((c) => c.body);
  await expect.poll(() => seg().some((b) => b.id === 'f1' && b.data.done === 'enviado')).toBe(true);
  await expect.poll(() => seg().some((b) => b.id !== 'f1' && b.data.tpl === 'd7' && b.data.step === 1)).toBe(true);
});

test('Tarefas: junta, move e mostra no calendário', async ({ page }) => {
  const calls = await abrir(page, { tables: { admin_tasks: [{ id: 't1', title: 'Ligar à administradora', status: 'todo', priority: 'alta', due_date: hojeD(), created_at: iso(1) }] }, fns: { 'admin-flinko-message': INBOX } });
  await page.goto('/gestao.html#hoje/tarefas');
  await page.locator('#tTit').fill('Rever perfis novos');
  await page.getByRole('button', { name: 'Juntar' }).click();
  await expect.poll(() => calls.find((c) => c.method === 'POST' && c.path === '/rest/v1/admin_tasks')?.body).toMatchObject({ title: 'Rever perfis novos', status: 'todo' });
  await page.locator('[data-mover="t1"][data-para="done"]').click();
  await expect.poll(() => calls.some((c) => c.method === 'POST' && c.path === '/rest/v1/admin_tasks' && c.body.id === 't1' && c.body.status === 'done')).toBe(true);
  await page.goto('/gestao.html#hoje/calendario');
  await page.locator('[data-dia="' + hojeD() + '"]').click();
  await expect(page.locator('#calDia')).toContainText('Ligar à administradora');
});

test('Profissionais: contas suspeitas, Excel, e ficha com consentimento, tarefa e reembolso', async ({ page }) => {
  const resposta = (m) => m.startsWith('Por que canal') ? 'WhatsApp' : m.startsWith('Quanto') ? '' : m.startsWith('Tarefa') ? 'Ajudar com as fotos' : 'Respondeu SIM';
  const calls = await abrir(page, {
    dialogo: (d) => (d.type() === 'prompt' ? d.accept(resposta(d.message())) : d.accept()),
    tables: { profiles: [{ id: 'admin-1', name: 'Admin', is_admin: true, account_type: 'professional', created_at: iso(100) }, PRO, { ...PRO, id: 'pro-2', name: 'teste', created_at: iso(40) }] },
    fns: { 'admin-flinko-message': INBOX, 'admin-refund': (b) => (b.action === 'list' ? { charges: [{ id: 'ch_1', amount: 1999, amount_refunded: 0, currency: 'eur', paid: true, created: 1792000000 }] } : { ok: true }) },
  });
  await page.goto('/gestao.html#profissionais/suspeitos');
  await expect(page.locator('#listaPros')).toContainText('teste');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar para Excel' }).click();
  expect((await download).suggestedFilename()).toMatch(/^flinko-profissionais-.*\.csv$/);
  await page.goto('/gestao.html#profissionais/todos');
  await page.locator('#listaPros li', { hasText: 'Rui Alves' }).click();
  const ficha = page.locator('#ficha');
  await expect(ficha).toContainText('Atividade');
  await ficha.getByRole('button', { name: 'Registar consentimento' }).click();
  await expect.poll(() => calls.find((c) => c.method === 'POST' && c.body && c.body.kind === 'consent')?.body.data).toMatchObject({ ref: 'pro-1', status: 'dado', channel: 'WhatsApp', source: 'Respondeu SIM' });
  await ficha.getByRole('button', { name: 'Nova tarefa para esta pessoa' }).click();
  await expect.poll(() => calls.find((c) => c.method === 'POST' && c.path === '/rest/v1/admin_tasks')?.body).toMatchObject({ title: 'Ajudar com as fotos', profile_id: 'pro-1' });
  await ficha.getByRole('button', { name: 'Ver pagamentos e reembolsos' }).click();
  await ficha.getByRole('button', { name: 'Reembolsar' }).click();
  await expect.poll(() => calls.find((c) => c.fn === 'admin-refund' && c.body.action === 'refund')?.body).toMatchObject({ targetProfileId: 'pro-1', chargeId: 'ch_1' });
});

test('Clientes: lista com pedidos e ficha do cliente (suspender)', async ({ page }) => {
  const calls = await abrir(page, { fns: { 'admin-flinko-message': INBOX } });
  await page.goto('/gestao.html#clientes/clientes');
  await expect(page.locator('#listaCli')).toContainText('Ana Cliente');
  await expect(page.locator('#listaCli')).toContainText('1 pedido(s)');
  await page.locator('#listaCli li', { hasText: 'Ana Cliente' }).click();
  await expect(page.locator('#ficha')).toContainText('Instalar tomadas');
  await page.locator('#ficha').getByRole('button', { name: 'Suspender' }).click();
  await expect.poll(() => calls.find((c) => c.method === 'PATCH' && c.path === '/rest/v1/profiles')?.body).toEqual({ suspended: true });
});

test('Angariação: o WhatsApp do primeiro contacto marca o seguimento dos 3 dias', async ({ page }) => {
  const calls = await abrir(page, { tables: { admin_items: [{ id: 'l1', kind: 'lead', data: { name: 'Carlos Pinto', phone: '912000111', category: 'Canalizador', stage: 'novo' } }] }, fns: { 'admin-flinko-message': INBOX } });
  await page.goto('/gestao.html#angariacao');
  await page.evaluate(() => document.addEventListener('click', (e) => { if (e.target.closest('[data-wa-lead]')) e.preventDefault(); }, true));
  await page.locator('[data-wa-lead="l1"]').click();
  await expect.poll(() => calls.find((c) => c.method === 'POST' && c.body && c.body.kind === 'followup')?.body.data).toMatchObject({ target: 'lead', ref: 'l1', seq: 'd1', tpl: 'd6' });
});

/* ===== Fase 3: Dinheiro, Angariação e marketing ===== */
const postsDe = (calls, kind) => calls.filter((c) => c.method === 'POST' && c.path === '/rest/v1/admin_items' && c.body && c.body.kind === kind).map((c) => c.body);

test('Dinheiro: caixa a partir dos movimentos e novo movimento', async ({ page }) => {
  const calls = await abrir(page, {
    tables: { admin_settings: [{ key: 'cash0', value: 500 }], admin_items: [{ id: 'm1', kind: 'ledger', data: { date: '2026-10-01', type: 'despesa', category: 'Marketing', desc: 'Anúncios', amount: 100 } }] },
    fns: { 'admin-flinko-message': INBOX, 'admin-stripe-summary': { mrr: 0, last30: { net: 0 }, subscriptions: { active: 0 }, pastDue: [] } },
  });
  await page.goto('/gestao.html#dinheiro');
  await expect(page.locator('#main')).toContainText('caixa atual');
  await expect(page.locator('.kpi', { hasText: 'caixa atual' })).toContainText('400,00');
  await page.goto('/gestao.html#dinheiro/movimentos');
  await page.getByRole('button', { name: 'Novo movimento' }).click();
  await page.locator('#g_type').selectOption('receita');
  await page.locator('#g_desc').fill('Plano Pro do Rui');
  await page.locator('#g_amount').fill('19.99');
  await page.locator('#fGen').getByRole('button', { name: 'Guardar' }).click();
  await expect.poll(() => postsDe(calls, 'ledger')[0]?.data).toMatchObject({ type: 'receita', desc: 'Plano Pro do Rui', amount: 19.99 });
});

test('Faturas: número automático, e "Paga" junta a receita aos movimentos', async ({ page }) => {
  const calls = await abrir(page, {
    tables: { admin_items: [{ id: 'i1', kind: 'invoice', data: { number: 'FT 2026/001', date: '2026-10-01', due: '2026-10-15', client: 'Rui Alves', description: 'Plano Pro', net: 19.99, vat: 23, status: 'emitida' } }] },
    fns: { 'admin-flinko-message': INBOX },
  });
  await page.goto('/gestao.html#dinheiro/faturas');
  await expect(page.locator('#main')).toContainText('Atrasada');
  await page.getByRole('button', { name: 'Nova fatura' }).click();
  await expect(page.locator('#g_number')).toHaveValue(/^FT \d{4}\/00\d$/);
  await page.locator('#ficha .fechar').click();
  await page.getByRole('button', { name: 'Paga', exact: true }).click();
  await expect.poll(() => postsDe(calls, 'invoice').find((b) => b.id === 'i1')?.data.status).toBe('paga');
  await expect.poll(() => postsDe(calls, 'ledger')[0]?.data).toMatchObject({ type: 'receita', amount: 19.99, ref: 'FT 2026/001' });
});

test('Preços e projeção: guarda preços e custos', async ({ page }) => {
  const calls = await abrir(page, { fns: { 'admin-flinko-message': INBOX } });
  await page.goto('/gestao.html#dinheiro/precos');
  await page.locator('#pr_pro').fill('24.99');
  await page.getByRole('button', { name: 'Guardar preços' }).click();
  await expect.poll(() => calls.find((c) => c.path === '/rest/v1/admin_settings' && c.body && c.body.key === 'prices')?.body.value).toEqual({ starter: 9.99, pro: 24.99, premium: 29.99 });
  await page.locator('#cNome').fill('Supabase');
  await page.locator('#cValor').fill('25');
  await page.getByRole('button', { name: 'Juntar' }).click();
  await expect.poll(() => calls.find((c) => c.path === '/rest/v1/admin_settings' && c.body && c.body.key === 'costs')?.body.value).toEqual([{ name: 'Supabase', amount: 25 }]);
  await expect(page.locator('#main')).toContainText('Projeção a 12 meses');
});

test('Angariação: importar uma lista (sem repetir telemóveis)', async ({ page }) => {
  const calls = await abrir(page, { tables: { admin_items: [{ id: 'l1', kind: 'lead', data: { name: 'Carlos Pinto', phone: '912000111', stage: 'novo' } }] }, fns: { 'admin-flinko-message': INBOX } });
  await page.goto('/gestao.html#angariacao');
  await page.getByRole('button', { name: 'Importar lista' }).click();
  await page.locator('#impTxt').fill('Carlos Pinto; 912 000 111; Canalizador; Braga\nMaria Reis; 913222333; Pintora; Porto');
  await page.locator('#impOrig').fill('OLX');
  await page.getByRole('button', { name: 'Importar', exact: true }).click();
  await expect(page.locator('#aviso')).toContainText('1 contacto(s) importados, 1 já existiam');
  expect(postsDe(calls, 'lead').map((b) => b.data)).toEqual([expect.objectContaining({ name: 'Maria Reis', phone: '913222333', category: 'Pintora', zone: 'Porto', source: 'OLX', stage: 'novo' })]);
});

test('Angariação: guias com textos prontos que se guardam como modelo', async ({ page }) => {
  const calls = await abrir(page, { fns: { 'admin-flinko-message': INBOX } });
  await page.goto('/gestao.html#angariacao/guias');
  await expect(page.locator('#main')).toContainText('Plano de 30 dias');
  await page.locator('.texto-pronto').first().getByRole('button', { name: 'Guardar como modelo' }).click();
  await expect.poll(() => postsDe(calls, 'template')[0]?.data.publico).toBe('pros');
});

test('Marketing: campanha com custo por registo e link de campanha', async ({ page }) => {
  const calls = await abrir(page, { tables: { admin_items: [{ id: 'c1', kind: 'campaign', data: { name: 'Cartazes Braga', channel: 'Cartazes / flyers', spend: 40, signups: 4, status: 'ativa', start: '2026-10-01' } }] }, fns: { 'admin-flinko-message': INBOX } });
  await page.goto('/gestao.html#angariacao/marketing');
  await expect(page.locator('#main')).toContainText('10,00');
  await page.locator('#u_source').fill('Facebook');
  await page.locator('#u_campaign').fill('braga outubro');
  await expect(page.locator('#u_out')).toHaveValue('https://flinko.pt?utm_source=facebook&utm_campaign=braga-outubro');
  await page.getByRole('button', { name: 'Nova publicação' }).click();
  await page.locator('#g_text').fill('Antes e depois de uma sala pintada pelo Rui');
  await page.locator('#fGen').getByRole('button', { name: 'Guardar' }).click();
  await expect.poll(() => postsDe(calls, 'post')[0]?.data).toMatchObject({ text: 'Antes e depois de uma sala pintada pelo Rui', status: 'ideia' });
});

/* ===== Fase 4: o resto da Estratégia e a parte Empresa ===== */
const definicao = (calls, key) => calls.filter((c) => c.method === 'POST' && c.path === '/rest/v1/admin_settings' && c.body && c.body.key === key).map((c) => c.body.value).pop();

test('Objetivos: cria um objetivo com resultado-chave que se mede sozinho, e guarda metas', async ({ page }) => {
  const calls = await abrir(page, { tables: { admin_items: [{ id: 'o1', kind: 'okr', data: { objective: 'Provar que há clientes', quarter: 'T4 2026', krs: [] } }] }, fns: { 'admin-flinko-message': INBOX } });
  await page.goto('/gestao.html#estrategia/objetivos');
  await expect(page.locator('#main')).toContainText('Nota global da empresa');
  await page.getByRole('button', { name: 'Juntar resultado-chave' }).click();
  await page.locator('#g_text').fill('Chegar a 2 profissionais');
  await page.locator('#g_metric').selectOption('pros');
  await page.locator('#g_target').fill('2');
  await page.locator('#fGen').getByRole('button', { name: 'Guardar' }).click();
  await expect.poll(() => postsDe(calls, 'okr').pop()?.data.krs).toEqual([expect.objectContaining({ text: 'Chegar a 2 profissionais', metric: 'pros', target: 2 })]);
  await expect(page.locator('.okr')).toContainText('1 de 2 · 50%');
  await page.locator('#meta_pros').fill('100');
  await page.getByRole('button', { name: 'Guardar metas' }).click();
  await expect.poll(() => definicao(calls, 'goals')).toEqual({ pros: 100, clients: 0, reviews: 0, mrr: 0 });
});

test('Plano e decisões: junta uma sugestão ao plano e regista uma decisão', async ({ page }) => {
  const calls = await abrir(page, { fns: { 'admin-flinko-message': INBOX } });
  await page.goto('/gestao.html#estrategia/plano');
  await expect(page.locator('#main')).toContainText('Ainda sem ideias no plano');
  await page.locator('[data-sug-rm="0"]').click();
  await expect.poll(() => postsDe(calls, 'backlog')[0]?.data).toMatchObject({ title: 'Pedir avaliações depois de cada trabalho', impact: 5, effort: 2, status: 'ideia' });
  await page.getByRole('button', { name: 'Nova decisão' }).click();
  await page.locator('#g_title').fill('Começar só por Braga');
  await page.locator('#fGen').getByRole('button', { name: 'Guardar' }).click();
  await expect.poll(() => postsDe(calls, 'decision')[0]?.data.title).toBe('Começar só por Braga');
});

test('Histórico: tabela de crescimento e fotografia diária dos números', async ({ page }) => {
  const calls = await abrir(page, { fns: { 'admin-flinko-message': INBOX } });
  await page.goto('/gestao.html#estrategia/historico');
  const linha = page.locator('tr', { has: page.locator('th', { hasText: 'Profissionais' }) });
  await expect(linha.locator('td').first()).toHaveText('1');
  await expect(page.locator('svg.linha')).toBeVisible();
  await expect.poll(() => postsDe(calls, 'snapshot')[0]?.data).toMatchObject({ pros: 1, clients: 1 });
});

test('Relatório e investidores: texto pronto a copiar e mercado guardado', async ({ page }) => {
  const calls = await abrir(page, { fns: { 'admin-flinko-message': INBOX } });
  await page.goto('/gestao.html#estrategia/relatorio');
  await expect(page.locator('#relTxt')).toContainText('RELATÓRIO FLINKO · últimos 7 dias');
  await expect(page.locator('#relTxt')).toContainText('1 pedido(s) de clientes sem nenhuma proposta');
  await page.getByRole('button', { name: '30 dias' }).click();
  await expect(page.locator('#relTxt')).toContainText('últimos 30 dias');
  await page.locator('[data-est="investidores"]').click();
  await page.locator('#t_n').fill('1000');
  await page.locator('#t_arpu').fill('10');
  await page.locator('#t_sam').fill('50');
  await page.locator('#t_som').fill('10');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect.poll(() => definicao(calls, 'tam')).toEqual({ n: 1000, arpu: 10, sam: 50, som: 10 });
  await expect(page.locator('.kpi', { hasText: 'mercado total por ano' })).toContainText(/120\s000,00/);
  await expect(page.locator('#invTxt')).toContainText('Profissionais: 1 (0 verificados)');
});

test('Empresa: o dono muda o papel de alguém', async ({ page }) => {
  const calls = await abrir(page, { fns: { 'admin-flinko-message': INBOX } });
  await page.goto('/gestao.html#empresa');
  await expect(page.locator('#nav a')).toHaveText([/Hoje/, /Estratégia/, /Profissionais/, /Mensagens/, /Clientes e pedidos/, /Moderação e apoio/, /Angariação/, /Dinheiro/, /Empresa/]);
  await page.locator('[data-papel="dono@flinko.pt"]').selectOption('support');
  await expect.poll(() => calls.find((c) => c.path === '/rest/v1/rpc/admin_set_role')?.body).toEqual({ p_email: 'dono@flinko.pt', p_role: 'support' });
});

test('Empresa: quem é apoio não pode mudar acessos', async ({ page }) => {
  await abrir(page, { role: 'support', fns: { 'admin-flinko-message': INBOX } });
  await page.goto('/gestao.html#empresa');
  await expect(page.locator('#main')).toContainText('dono@flinko.pt');
  await expect(page.locator('[data-papel]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Dar acesso' })).toHaveCount(0);
});

test('Registo de ações: procura e notificações falhadas', async ({ page }) => {
  await abrir(page, { tables: { notification_queue: [{ id: 1, status: 'failed' }, { id: 2, status: 'sent' }] }, fns: { 'admin-flinko-message': INBOX } });
  await page.goto('/gestao.html#empresa/registo');
  await expect(page.locator('#rgTab')).toContainText('Rui Alves: suspended');
  await expect(page.locator('.kpi', { hasText: 'notificações que falharam' }).locator('strong')).toHaveText('1');
  await page.locator('#rgQ').fill('ninguém');
  await expect(page.locator('#rgTab')).toContainText('Nada com estes filtros');
});

test('Conformidade: marca um ponto da lista e junta um risco comum', async ({ page }) => {
  const calls = await abrir(page, { fns: { 'admin-flinko-message': INBOX } });
  await page.goto('/gestao.html#empresa/conformidade');
  await page.getByText('Termos e condições publicados').click();
  await expect.poll(() => Object.keys(definicao(calls, 'checks') || {})).toEqual(['RGPD:1']);
  await page.locator('[data-sug-risco="0"]').click();
  await expect.poll(() => postsDe(calls, 'risk')[0]?.data).toMatchObject({ title: 'Poucos clientes: profissionais sem procura', prob: 5, impact: 5 });
});

test('Notas de reunião: as ações passam a tarefas', async ({ page }) => {
  const calls = await abrir(page, { tables: { admin_items: [{ id: 'n1', kind: 'note', data: { date: '2026-10-20', title: 'Reunião com o contabilista', actions: 'Abrir atividade\nPedir orçamento do seguro' } }] }, fns: { 'admin-flinko-message': INBOX } });
  await page.goto('/gestao.html#empresa/contactos');
  await page.getByRole('button', { name: 'Passar a tarefas' }).click();
  await expect.poll(() => calls.filter((c) => c.method === 'POST' && c.path === '/rest/v1/admin_tasks').map((c) => c.body.title)).toEqual(['Abrir atividade', 'Pedir orçamento do seguro']);
  await expect.poll(() => postsDe(calls, 'note')[0]?.data.tasksDone).toBe(true);
});
