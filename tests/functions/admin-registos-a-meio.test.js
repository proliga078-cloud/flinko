// Testa netlify/functions/admin-registos-a-meio.js: contas criadas que nunca
// ficaram com perfil e o convite para acabarem o registo.
//
// O que estes testes protegem:
//  - só donos; o "preview" não envia nada;
//  - só conta quem não tem perfil; quem foi convidado há menos de 30 dias
//    não recebe outra vez;
//  - o email explica como entrar (Google ou email) e leva ao login.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeQueryableSupabase } = require('./helpers/queryable');
const { stubModule } = require('./helpers/stub-require');

process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';
process.env.RESEND_API_KEY = 're_fake';

const scenario = {};
const FN = require.resolve('../../netlify/functions/admin-registos-a-meio.js');
const base = makeQueryableSupabase(scenario);
const USERS = [
  { id: 'com-perfil', email: 'ok@x.pt', created_at: '2026-07-01T10:00:00Z', app_metadata: { provider: 'email' } },
  { id: 'ana', email: 'ana@x.pt', created_at: '2026-06-16T10:00:00Z', app_metadata: { provider: 'email' }, user_metadata: { name: 'Ana Silva' } },
  { id: 'rui', email: 'rui@x.pt', created_at: '2026-09-10T10:00:00Z', app_metadata: { provider: 'google' }, user_metadata: { full_name: 'Rui Alves' } },
  { id: 'jaconv', email: 'j@x.pt', created_at: '2026-08-01T10:00:00Z', app_metadata: { provider: 'email' } },
];
stubModule('@supabase/supabase-js', {
  createClient: () => { const c = base(); c.auth.admin = { listUsers: async () => ({ data: { users: USERS }, error: null }) }; return c; },
}, FN);
const { handler, incompletos, texto } = require(FN);

function setup(role = 'owner') {
  Object.keys(scenario).forEach((k) => delete scenario[k]);
  scenario.getUser = async () => ({ data: { user: { id: 'dono', email: 'dono@flinko.pt' } }, error: null });
  scenario.audits = [];
  scenario.queries = {
    profiles: (calls) => calls[0].args[0] === 'is_admin,admin_role' ? { data: [{ is_admin: true, admin_role: role }], error: null } : { data: [{ id: 'com-perfil' }], error: null },
    admin_audit: (calls) => {
      const ins = calls.find((c) => c.method === 'insert');
      if (ins) { scenario.audits.push(ins.args[0]); return { data: null, error: null }; }
      return { data: [{ at: new Date(Date.now() - 5 * 864e5).toISOString(), details: { sent: ['jaconv'] } }], error: null };
    },
  };
}
const ev = (body) => ({ httpMethod: 'POST', headers: { authorization: 'Bearer t' }, body: JSON.stringify(body) });

test('incompletos: só sem perfil; convidado há < 30 dias não pode ser convidado outra vez', () => {
  const agora = Date.parse('2026-09-30T12:00:00Z');
  const L = incompletos(USERS, ['com-perfil'], { jaconv: '2026-09-25T00:00:00Z', rui: '2026-08-01T00:00:00Z' }, agora);
  assert.deepEqual(L.map((c) => [c.id, c.nome, c.via, c.podeConvidar]), [
    ['ana', 'Ana', 'email', true],
    ['jaconv', '', 'email', false],
    ['rui', 'Rui', 'google', true], // convite antigo (60 dias): pode receber outro
  ]);
});

test('texto: explica como entrar e leva ao login', () => {
  const g = texto({ nome: 'Rui', via: 'google' });
  assert.match(g, /^Olá Rui!/);
  assert.match(g, /Continuar com Google/);
  assert.match(g, /https:\/\/flinko\.pt\/auth\?tab=login/);
  assert.match(texto({ nome: '', via: 'email' }), /^Olá!\n[\s\S]*email e palavra-passe/);
});

test('admin de apoio não pode ver nem enviar', async () => {
  setup('support');
  assert.equal((await handler(ev({ action: 'preview' }))).statusCode, 403);
});

test('preview: lista sem enviar nada', async () => {
  setup();
  let enviados = 0;
  global.fetch = async () => { enviados++; return { ok: true }; };
  const r = JSON.parse((await handler(ev({ action: 'preview' }))).body);
  assert.equal(r.total, 3);
  assert.equal(r.porConvidar, 2);
  assert.match(r.exemplo.assunto, /Falta só um passo/);
  assert.equal(enviados, 0);
});

test('send: envia a quem ainda não foi convidado e regista no histórico', async () => {
  setup();
  const lotes = [];
  global.fetch = async (url, opts) => { lotes.push({ url, emails: JSON.parse(opts.body) }); return { ok: true }; };
  const r = JSON.parse((await handler(ev({ action: 'send' }))).body);
  assert.deepEqual(r, { sent: 2, failed: 0 });
  assert.equal(lotes[0].url, 'https://api.resend.com/emails/batch');
  assert.deepEqual(lotes[0].emails.map((e) => e.to[0]), ['ana@x.pt', 'rui@x.pt']);
  assert.match(lotes[0].emails[0].html, /Acabar o registo/);
  assert.equal(scenario.audits[0].action, 'convite_registo');
  assert.deepEqual(scenario.audits[0].details.sent, ['ana', 'rui']);
});
