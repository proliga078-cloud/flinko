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
    profiles: (calls) => calls[0].args[0] === 'is_admin,admin_role' ? { data: [{ is_admin: isAdmin, admin_role: 'owner' }], error: null } : { data: PROFILES, error: null },
    user_blocks: () => ({ data: [{ blocker_id: 'blq' }], error: null }),
    conversations: (calls) => {
      if (ins('conversations', calls)) return { data: [{ id: 'conv-ana', professional_id: 'ana' }], error: null };
      if (calls.some((c) => c.method === 'update')) { scenario.updated = calls; return { data: null, error: null }; }
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
  assert.ok(scenario.updated.some((c) => c.method === 'update' && c.args[0].is_flinko === true));
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
