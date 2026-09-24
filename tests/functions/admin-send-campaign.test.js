// Testa netlify/functions/admin-send-campaign.js: envio de emails a um grupo
// de profissionais a partir do painel admin.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeQueryableSupabase } = require('./helpers/queryable');
const { stubModule } = require('./helpers/stub-require');

process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';

const scenario = {};
const HANDLER_PATH = require.resolve('../../netlify/functions/admin-send-campaign.js');
const base = makeQueryableSupabase(scenario);
stubModule('@supabase/supabase-js', {
  createClient: () => {
    const c = base();
    c.auth.admin = { listUsers: async () => ({ data: { users: [{ id: 'u-rui', email: 'rui@x.pt' }, { id: 'u-ana', email: 'ana@x.pt' }, { id: 'u-off', email: 'off@x.pt' }] }, error: null }) };
    return c;
  },
}, HANDLER_PATH);
const { handler, recipients } = require(HANDLER_PATH);

const PROFILES = [
  { id: 'rui', user_id: 'u-rui', name: 'Rui Alves', category: 'Eletricistas', notify_email: true },
  { id: 'ana', user_id: 'u-ana', name: 'Ana Sousa', category: 'Pintores', notify_email: null },
  { id: 'off', user_id: 'u-off', name: 'Desligado', notify_email: false },
  { id: 'susp', user_id: 'u-susp', name: 'Suspenso', suspended: true },
  { id: 'semmail', user_id: 'u-x', name: 'Sem email' },
];

function setup(role = 'owner') {
  Object.keys(scenario).forEach((k) => delete scenario[k]);
  scenario.getUser = async () => ({ data: { user: { id: 'dono', email: 'dono@flinko.pt' } }, error: null });
  scenario.queries = {
    profiles: (calls) => calls[0].args[0] === 'is_admin,admin_role' ? { data: [{ is_admin: true, admin_role: role }], error: null } : { data: PROFILES, error: null },
    admin_audit: () => ({ data: null, error: null }),
  };
}
const ev = (body) => ({ httpMethod: 'POST', headers: { authorization: 'Bearer t' }, body: JSON.stringify({ profileIds: PROFILES.map((p) => p.id), ...body }) });

test('recipients: tira de fora quem desligou os emails, suspensos, admins e quem não tem email', () => {
  const { ok, skipped } = recipients(PROFILES.concat([{ id: 'adm', user_id: 'u-adm', is_admin: true }]), { 'u-rui': 'rui@x.pt', 'u-ana': 'ana@x.pt', 'u-off': 'off@x.pt', 'u-adm': 'a@x.pt' });
  assert.deepEqual(ok.map((p) => p.id), ['rui', 'ana']);
  assert.deepEqual(Object.fromEntries(skipped.map((s) => [s.id, s.reason])), { off: 'desligou os emails', susp: 'conta suspensa', semmail: 'sem email', adm: 'conta de admin ou demo' });
});

test('admin de apoio não pode enviar emails', async () => {
  setup('support');
  assert.equal((await handler(ev({ action: 'preview' }))).statusCode, 403);
});

test('preview: conta destinatários sem enviar nada', async () => {
  setup();
  let fetched = false;
  global.fetch = async () => { fetched = true; return { ok: true }; };
  const res = await handler(ev({ action: 'preview' }));
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).recipients, 2);
  assert.equal(fetched, false);
});

test('send: sem RESEND_API_KEY não envia e explica porquê', async () => {
  setup();
  delete process.env.RESEND_API_KEY;
  const res = await handler(ev({ action: 'send', subject: 'Olá {nome}', message: 'Mensagem de teste suficientemente longa' }));
  assert.equal(res.statusCode, 503);
});

test('send: envia um email personalizado a cada um num lote e regista no admin_audit', async () => {
  setup();
  process.env.RESEND_API_KEY = 're_fake';
  let sentBody = null;
  global.fetch = async (url, opts) => { assert.equal(url, 'https://api.resend.com/emails/batch'); sentBody = JSON.parse(opts.body); return { ok: true }; };
  const res = await handler(ev({ action: 'send', subject: 'Olá {nome}', message: 'Olá {nome}, o teu perfil de {categoria} está quase pronto.', messages: { ana: 'Texto próprio da Ana, falta: foto' } }));
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.sent, 2);
  assert.equal(sentBody.length, 2);
  const rui = sentBody.find((m) => m.to[0] === 'rui@x.pt'), ana = sentBody.find((m) => m.to[0] === 'ana@x.pt');
  assert.equal(rui.subject, 'Olá Rui');
  assert.equal(rui.text, 'Olá Rui, o teu perfil de eletricistas está quase pronto.');
  assert.equal(ana.text, 'Texto próprio da Ana, falta: foto');
  assert.match(rui.html, /deixares de receber/);
  const audit = scenario.log.find((e) => e.table === 'admin_audit');
  const row = audit.calls.find((c) => c.method === 'insert').args[0];
  assert.equal(row.action, 'email_massa');
  assert.deepEqual(row.details.sent.sort(), ['ana', 'rui']);
});

test('send: rejeita mensagens demasiado curtas', async () => {
  setup();
  process.env.RESEND_API_KEY = 're_fake';
  assert.equal((await handler(ev({ action: 'send', subject: 'x', message: 'curta' }))).statusCode, 400);
});

test('latestConsent: vale o registo mais recente de cada pessoa', () => {
  const { latestConsent } = require(HANDLER_PATH);
  const c = latestConsent([
    { data: { ref: 'rui', status: 'dado', date: '2026-09-01', at: '2026-09-01T10:00:00Z' } },
    { data: { ref: 'rui', status: 'retirado', date: '2026-09-20', at: '2026-09-20T10:00:00Z' } },
    { data: { ref: 'ana', status: 'dado', date: '2026-09-10', at: '2026-09-10T10:00:00Z' } },
  ]);
  assert.deepEqual(c, { rui: 'retirado', ana: 'dado' });
});

test('promo: só envia a quem tem consentimento registado (quem disse PARAR fica de fora)', async () => {
  setup();
  scenario.queries.admin_items = (calls) => {
    assert.deepEqual(calls.find((c) => c.method === 'eq').args, ['kind', 'consent']);
    return { data: [{ data: { ref: 'ana', status: 'dado', date: '2026-09-10' } }, { data: { ref: 'rui', status: 'dado', date: '2026-09-01' } }, { data: { ref: 'rui', status: 'retirado', date: '2026-09-20' } }], error: null };
  };
  process.env.RESEND_API_KEY = 're_fake';
  let sentBody = null;
  global.fetch = async (_url, opts) => { sentBody = JSON.parse(opts.body); return { ok: true }; };
  const res = await handler(ev({ action: 'send', promo: true, subject: 'Plano Pro', message: 'Temos um plano com destaque nas pesquisas.' }));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(sentBody.map((m) => m.to[0]), ['ana@x.pt']);
  const body = JSON.parse(res.body);
  assert.equal(body.skipped.find((s) => s.id === 'rui').reason, 'sem consentimento para promoções');
});
