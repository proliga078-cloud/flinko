// Testa netlify/functions/admin-flinko-message.js: mensagens da Flinko (dentro
// da plataforma) a um grupo de profissionais, a partir do painel admin.
//
// O que estes testes protegem:
//  - só admins enviam; quem bloqueou a Flinko, suspensos e admins ficam de fora;
//  - reaproveita a conversa que já existe e cria as que faltam, marcadas is_flinko;
//  - cada um recebe o texto com o seu nome, com push e email (a quem não desligou).
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeQueryableSupabase } = require('./helpers/queryable');
const { stubModule } = require('./helpers/stub-require');

process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';
process.env.RESEND_API_KEY = 're_fake';

const scenario = {};
const HANDLER_PATH = require.resolve('../../netlify/functions/admin-flinko-message.js');
stubModule('@supabase/supabase-js', { createClient: makeQueryableSupabase(scenario) }, HANDLER_PATH);
stubModule('./_push', { sendPush: async (id, payload) => { scenario.pushes.push({ id, payload }); return { sent: 1 }; } }, HANDLER_PATH);
const { handler, recipients } = require(HANDLER_PATH);

const ADMIN = 'adm-david';
const PROFILES = [
  { id: 'rui', name: 'Rui Alves', category: 'Eletricistas', notify_email: true },
  { id: 'ana', name: 'Ana Sousa', category: 'Pintores', notify_email: false },
  { id: 'susp', name: 'Suspenso', suspended: true },
  { id: 'blq', name: 'Bloqueou' },
];

function setup({ isAdmin = true } = {}) {
  Object.keys(scenario).forEach((k) => delete scenario[k]);
  scenario.pushes = [];
  scenario.inserts = {};
  scenario.getUser = async () => ({ data: { user: { id: ADMIN, email: 'david@flinko.pt' } }, error: null });
  const ins = (table, calls) => { const c = calls.find((x) => x.method === 'insert'); if (c) (scenario.inserts[table] = scenario.inserts[table] || []).push(...[].concat(c.args[0])); return c; };
  scenario.queries = {
    profiles: (calls) => calls.some((c) => c.method === 'eq' && c.args[0] === 'is_admin') ? { data: [{ id: ADMIN }], error: null } : calls[0].args[0] === 'is_admin,admin_role' ? { data: [{ is_admin: isAdmin, admin_role: 'owner' }], error: null } : { data: PROFILES, error: null },
    user_blocks: () => ({ data: [{ blocker_id: 'blq' }], error: null }),
    conversations: (calls) => {
      if (ins('conversations', calls)) return { data: [{ id: 'conv-ana', professional_id: 'ana' }], error: null };
      if (calls.some((c) => c.method === 'update')) { scenario.updated = calls; return { data: null, error: null }; }
      // 2.ª procura (conversas normais deste admin): a Ana já falou com a Flinko fora de uma conversa marcada
      if (calls.some((c) => c.method === 'eq' && c.args[0] === 'client_id')) return { data: [], error: null };
      return { data: [{ id: 'conv-rui', professional_id: 'rui' }], error: null };
    },
    messages: (calls) => { ins('messages', calls); return { data: null, error: null }; },
    admin_audit: () => ({ data: null, error: null }),
  };
  scenario.rpc = { emails_for: ({ ids }) => ({ data: ids.map((id) => ({ id, email: id + '@x.pt' })), error: null }) };
}
const ev = (body) => ({ httpMethod: 'POST', headers: { authorization: 'Bearer t' }, body: JSON.stringify({ profileIds: PROFILES.map((p) => p.id), ...body }) });

test('recipients: fora quem bloqueou a Flinko, suspensos, admins/demo e o próprio', () => {
  const { ok, skipped } = recipients(PROFILES.concat([{ id: ADMIN }, { id: 'demo', is_demo: true }]), ADMIN, new Set(['blq']));
  assert.deepEqual(ok.map((p) => p.id), ['rui', 'ana']);
  assert.deepEqual(Object.fromEntries(skipped.map((s) => [s.id, s.reason])), { susp: 'conta suspensa', blq: 'bloqueou a Flinko', [ADMIN]: 'és tu', demo: 'conta de admin ou demo' });
});

test('quem não é admin não envia', async () => {
  setup({ isAdmin: false });
  assert.equal((await handler(ev({ action: 'preview' }))).statusCode, 403);
});

test('preview: conta sem enviar nada', async () => {
  setup();
  const res = await handler(ev({ action: 'preview' }));
  assert.equal(JSON.parse(res.body).recipients, 2);
  assert.equal(scenario.inserts.messages, undefined);
});

test('send: reaproveita a conversa do Rui, cria a da Ana (is_flinko), mensagem com o nome, push e email', async () => {
  setup();
  const emails = [];
  global.fetch = async (url, opts) => { emails.push(...JSON.parse(opts.body)); return { ok: true }; };
  const res = await handler(ev({ action: 'send', message: 'Olá {nome}! Temos novidades para {categoria}.' }));
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.sent, 2);
  assert.deepEqual(scenario.inserts.conversations, [{ professional_id: 'ana', client_id: ADMIN, is_flinko: true }]);
  assert.deepEqual(scenario.inserts.messages.map((m) => [m.conversation_id, m.sender_id, m.content]), [
    ['conv-rui', ADMIN, 'Olá Rui! Temos novidades para eletricistas.'],
    ['conv-ana', ADMIN, 'Olá Ana! Temos novidades para pintores.'],
  ]);
  assert.deepEqual(scenario.pushes.map((p) => [p.id, p.payload.url]), [['rui', '/messages.html?c=conv-rui'], ['ana', '/messages.html?c=conv-ana']]);
  // a Ana desligou os emails: só o Rui recebe email
  assert.deepEqual(emails.map((e) => e.to[0]), ['rui@x.pt']);
  assert.equal(body.emailed, 1);
});

test('send: mensagem vazia é recusada', async () => {
  setup();
  assert.equal((await handler(ev({ action: 'send', message: ' ' }))).statusCode, 400);
});

// Out/2026: havia dois donos (David e Matilde). As conversas da Flinko ficavam
// em nome de quem as começou e os outros não conseguiam responder (a base de
// dados recusava: não eram parte da conversa). A partir de agora há uma só
// conversa da Flinko por profissional, e tudo sai em nome de quem a começou.
const MATILDE = 'adm-matilde';
const evr = (body) => ({ httpMethod: 'POST', headers: { authorization: 'Bearer t' }, body: JSON.stringify(body) });

test('send: reaproveita a conversa da Flinko começada por outro admin e escreve em nome dela', async () => {
  setup();
  scenario.getUser = async () => ({ data: { user: { id: MATILDE, email: 'matilde@flinko.pt' } }, error: null });
  let filtros = null;
  scenario.queries.conversations = (calls) => {
    if (calls.some((c) => c.method === 'insert')) { (scenario.inserts.conversations = scenario.inserts.conversations || []).push(...calls.find((c) => c.method === 'insert').args[0]); return { data: [{ id: 'conv-ana', professional_id: 'ana', client_id: MATILDE }], error: null }; }
    if (calls.some((c) => c.method === 'update')) return { data: null, error: null };
    if (calls.some((c) => c.method === 'eq' && c.args[0] === 'client_id')) return { data: [], error: null };
    filtros = calls;
    return { data: [{ id: 'conv-rui', professional_id: 'rui', client_id: ADMIN }], error: null };
  };
  global.fetch = async () => ({ ok: true });
  const res = await handler(ev({ action: 'send', message: 'Olá {nome}' }));
  assert.equal(res.statusCode, 200);
  assert.ok(filtros.some((c) => c.method === 'eq' && c.args[0] === 'is_flinko' && c.args[1] === true), 'procura qualquer conversa da Flinko');
  assert.ok(!filtros.some((c) => c.method === 'eq' && c.args[0] === 'client_id'), 'não se limita às conversas de quem envia');
  assert.deepEqual(scenario.inserts.messages.map((m) => [m.conversation_id, m.sender_id]), [['conv-rui', ADMIN], ['conv-ana', MATILDE]]);
});

test('reply: qualquer admin responde numa conversa da Flinko, em nome da Flinko', async () => {
  setup();
  scenario.getUser = async () => ({ data: { user: { id: MATILDE, email: 'matilde@flinko.pt' } }, error: null });
  scenario.queries.conversations = () => ({ data: [{ id: 'conv-rui', professional_id: 'rui', client_id: ADMIN, is_flinko: true }], error: null });
  scenario.queries.profiles = (calls) => calls.some((c) => c.method === 'eq' && c.args[0] === 'is_admin') ? { data: [{ id: ADMIN }], error: null } : calls[0].args[0] === 'is_admin,admin_role' ? { data: [{ is_admin: true, admin_role: 'owner' }], error: null } : { data: [{ id: 'rui', name: 'Rui Alves', notify_email: true }], error: null };
  const emails = [];
  global.fetch = async (url, opts) => { emails.push(JSON.parse(opts.body)); return { ok: true }; };
  const res = await handler(evr({ action: 'reply', conversationId: 'conv-rui', message: 'Já tratámos disso.' }));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(scenario.inserts.messages.map((m) => [m.conversation_id, m.sender_id, m.content]), [['conv-rui', ADMIN, 'Já tratámos disso.']]);
  assert.deepEqual(scenario.pushes.map((p) => p.id), ['rui']);
});

test('reply: recusa conversas que não são da Flinko e mensagens vazias', async () => {
  setup();
  scenario.queries.conversations = () => ({ data: [{ id: 'c1', professional_id: 'rui', client_id: 'cliente-x', is_flinko: false }], error: null });
  assert.equal((await handler(evr({ action: 'reply', conversationId: 'c1', message: 'Olá' }))).statusCode, 403);
  scenario.queries.conversations = () => ({ data: [{ id: 'c2', professional_id: 'rui', client_id: ADMIN, is_flinko: true }], error: null });
  assert.equal((await handler(evr({ action: 'reply', conversationId: 'c2', message: '  ' }))).statusCode, 400);
});

test('inbox: lista só as conversas da Flinko, com o nome do profissional e se está por responder', async () => {
  setup();
  scenario.queries.conversations = (calls) => {
    assert.ok(calls.some((c) => c.method === 'eq' && c.args[0] === 'is_flinko' && c.args[1] === true));
    return { data: [{ id: 'conv-rui', professional_id: 'rui', client_id: ADMIN, last_message: 'Obrigado!', last_message_at: '2026-10-20T10:00:00Z' }], error: null };
  };
  scenario.queries.profiles = (calls) => calls.some((c) => c.method === 'eq' && c.args[0] === 'is_admin') ? { data: [{ id: ADMIN }], error: null } : calls[0].args[0] === 'is_admin,admin_role' ? { data: [{ is_admin: true, admin_role: 'owner' }], error: null } : { data: [{ id: 'rui', name: 'Rui Alves', category: 'Eletricistas', photo_url: null }], error: null };
  scenario.queries.messages = () => ({ data: [{ conversation_id: 'conv-rui', sender_id: 'rui', created_at: '2026-10-20T10:00:00Z' }], error: null });
  const res = await handler(evr({ action: 'inbox' }));
  assert.equal(res.statusCode, 200);
  const [c] = JSON.parse(res.body).conversations;
  assert.equal(c.name, 'Rui Alves');
  assert.equal(c.porResponder, true);
});

test('thread: devolve as mensagens de uma conversa da Flinko, e recusa as outras', async () => {
  setup();
  scenario.queries.conversations = () => ({ data: [{ id: 'conv-rui', professional_id: 'rui', client_id: ADMIN, is_flinko: true }], error: null });
  scenario.queries.messages = () => ({ data: [{ id: 'm1', sender_id: 'rui', content: 'Olá', created_at: '2026-10-20T10:00:00Z' }], error: null });
  const res = await handler(evr({ action: 'thread', conversationId: 'conv-rui' }));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body).messages.map((m) => [m.content, m.deFlinko]), [['Olá', false]]);
  scenario.queries.conversations = () => ({ data: [{ id: 'c1', professional_id: 'rui', client_id: 'cliente-x', is_flinko: false }], error: null });
  assert.equal((await handler(evr({ action: 'thread', conversationId: 'c1' }))).statusCode, 403);
});

test('send: uma conversa normal que o admin já tinha com o profissional passa a ser a da Flinko (sem duplicar)', async () => {
  setup();
  let atualizada = null;
  scenario.queries.conversations = (calls) => {
    if (calls.some((c) => c.method === 'insert')) throw new Error('não devia criar conversa nova');
    if (calls.some((c) => c.method === 'update')) { atualizada = calls; return { data: null, error: null }; }
    if (calls.some((c) => c.method === 'eq' && c.args[0] === 'client_id')) return { data: [{ id: 'conv-ana-antiga', professional_id: 'ana' }], error: null };
    return { data: [{ id: 'conv-rui', professional_id: 'rui', client_id: ADMIN }], error: null };
  };
  global.fetch = async () => ({ ok: true });
  const res = await handler(ev({ action: 'send', message: 'Olá' }));
  assert.equal(res.statusCode, 200);
  assert.ok(atualizada.some((c) => c.method === 'update' && c.args[0].is_flinko === true));
  assert.deepEqual(scenario.inserts.messages.map((m) => m.conversation_id), ['conv-rui', 'conv-ana-antiga']);
});

// Fase 1 do painel único (out/2026): o dono quer escrever também aos
// clientes pela conta da Flinko. Na conversa com um cliente, a Flinko fica
// do lado do profissional (professional_id = admin) e o cliente do seu lado.
test('send: a clientes cria a conversa com a Flinko no lugar do profissional', async () => {
  setup();
  scenario.queries.profiles = (calls) => calls[0].args[0] === 'is_admin,admin_role'
    ? { data: [{ is_admin: true, admin_role: 'owner' }], error: null }
    : { data: [{ id: 'cli-1', name: 'Ana Cliente', account_type: 'client', notify_email: true }], error: null };
  let procura = null;
  scenario.queries.conversations = (calls) => {
    const ins = calls.find((c) => c.method === 'insert');
    if (ins) { (scenario.inserts.conversations = scenario.inserts.conversations || []).push(...ins.args[0]); return { data: [{ id: 'conv-cli', professional_id: ADMIN, client_id: 'cli-1' }], error: null }; }
    procura = calls; return { data: [], error: null };
  };
  global.fetch = async () => ({ ok: true });
  const res = await handler(evr({ action: 'send', profileIds: ['cli-1'], message: 'Olá {nome}, o teu pedido já tem propostas?' }));
  assert.equal(res.statusCode, 200);
  assert.ok(procura.some((c) => c.method === 'in' && c.args[0] === 'client_id'), 'procura a conversa da Flinko pelo lado do cliente');
  assert.deepEqual(scenario.inserts.conversations, [{ professional_id: ADMIN, client_id: 'cli-1', is_flinko: true }]);
  assert.deepEqual(scenario.inserts.messages.map((m) => [m.conversation_id, m.sender_id, m.content]), [['conv-cli', ADMIN, 'Olá Ana, o teu pedido já tem propostas?']]);
});

test('reply e thread: numa conversa com um cliente, a Flinko é o lado do profissional', async () => {
  setup();
  scenario.queries.conversations = () => ({ data: [{ id: 'conv-cli', professional_id: ADMIN, client_id: 'cli-1', is_flinko: true }], error: null });
  scenario.queries.profiles = (calls) => {
    if (calls[0].args[0] === 'is_admin,admin_role') return { data: [{ is_admin: true, admin_role: 'owner' }], error: null };
    if (calls.some((c) => c.method === 'eq' && c.args[0] === 'is_admin')) return { data: [{ id: ADMIN }], error: null };
    return { data: [{ id: 'cli-1', name: 'Ana Cliente', notify_email: true }], error: null };
  };
  scenario.queries.messages = (calls) => { if (calls.some((c) => c.method === 'insert')) { (scenario.inserts.messages = scenario.inserts.messages || []).push(calls.find((c) => c.method === 'insert').args[0]); return { data: null, error: null }; } return { data: [{ id: 'm1', sender_id: 'cli-1', content: 'Obrigada!', created_at: '2026-10-20T10:00:00Z' }], error: null }; };
  global.fetch = async () => ({ ok: true });
  const t = JSON.parse((await handler(evr({ action: 'thread', conversationId: 'conv-cli' }))).body);
  assert.deepEqual(t.messages.map((m) => [m.content, m.deFlinko]), [['Obrigada!', false]]);
  const r = await handler(evr({ action: 'reply', conversationId: 'conv-cli', message: 'De nada!' }));
  assert.equal(r.statusCode, 200);
  assert.deepEqual(scenario.inserts.messages.map((m) => [m.sender_id, m.content]), [[ADMIN, 'De nada!']]);
  assert.deepEqual(scenario.pushes.map((p) => p.id), ['cli-1']);
});

test('inbox: conversas com clientes aparecem com o nome do cliente e marcadas como cliente', async () => {
  setup();
  scenario.queries.conversations = () => ({ data: [{ id: 'conv-cli', professional_id: ADMIN, client_id: 'cli-1', last_message: 'Obrigada!', last_message_at: '2026-10-20T10:00:00Z' }], error: null });
  scenario.queries.profiles = (calls) => {
    if (calls[0].args[0] === 'is_admin,admin_role') return { data: [{ is_admin: true, admin_role: 'owner' }], error: null };
    if (calls.some((c) => c.method === 'eq' && c.args[0] === 'is_admin')) return { data: [{ id: ADMIN }], error: null };
    return { data: [{ id: 'cli-1', name: 'Ana Cliente', account_type: 'client' }], error: null };
  };
  scenario.queries.messages = () => ({ data: [{ conversation_id: 'conv-cli', sender_id: 'cli-1', created_at: '2026-10-20T10:00:00Z' }], error: null });
  const [c] = JSON.parse((await handler(evr({ action: 'inbox' }))).body).conversations;
  assert.equal(c.name, 'Ana Cliente');
  assert.equal(c.tipo, 'cliente');
  assert.equal(c.personId, 'cli-1');
  assert.equal(c.porResponder, true);
});
