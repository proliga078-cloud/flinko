// Testa netlify/functions/admin-gdpr.js (exportar dados e apagar contas a
// pedido do RGPD, a partir do painel admin).
//
// O que interessa garantir: só donos conseguem usar; a eliminação exige o nome
// da conta escrito à mão; cancela a subscrição Stripe ANTES de apagar (senão a
// pessoa continuava a ser cobrada depois de a conta desaparecer) e, se o Stripe
// falhar, não apaga nada; e fica sempre registo em admin_audit.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeFakeStripe } = require('./helpers/fakes');
const { makeQueryableSupabase } = require('./helpers/queryable');
const { stubModule } = require('./helpers/stub-require');

process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';

const scenario = {};
const HANDLER_PATH = require.resolve('../../netlify/functions/admin-gdpr.js');
const baseCreate = makeQueryableSupabase(scenario);
function createClient() {
  const c = baseCreate();
  c.auth.admin = {
    getUserById: async (id) => ({ data: { user: { id, email: 'ana@exemplo.pt', created_at: '2026-01-01' } }, error: null }),
    deleteUser: async (id) => { scenario.deleted.push(id); return { error: scenario.deleteError || null }; },
  };
  c.storage = {
    from: (bucket) => ({
      list: async (folder) => ({ data: (scenario.files[bucket + ':' + folder] || []).map((name) => ({ name })), error: null }),
      remove: async (paths) => { scenario.removed.push(...paths.map((p) => bucket + ':' + p)); return { error: null }; },
    }),
  };
  return c;
}
stubModule('stripe', makeFakeStripe(scenario), HANDLER_PATH);
stubModule('@supabase/supabase-js', { createClient }, HANDLER_PATH);
const { handler } = require(HANDLER_PATH);

const first = (calls, m) => (calls.find((c) => c.method === m) || { args: [] }).args;

function setup({ role = 'owner', request = { id: 'g1', profile_id: 'ana', request_type: 'delete', status: 'pending', created_at: '2026-09-01T10:00:00Z' }, profile = { id: 'ana', user_id: 'ana', name: 'Ana Silva', stripe_subscription_id: null } } = {}) {
  Object.keys(scenario).forEach((k) => delete scenario[k]);
  Object.assign(scenario, { deleted: [], removed: [], files: {}, log: [] });
  scenario.getUser = async () => ({ data: { user: { id: 'dono-1', email: 'dono@flinko.pt' } }, error: null });
  scenario.queries = {
    profiles: (calls) => {
      const cols = first(calls, 'select')[0], eq = first(calls, 'eq');
      if (cols === 'is_admin,admin_role') return { data: [{ is_admin: true, admin_role: role }], error: null };
      if (eq[0] === 'id' && eq[1] === 'ana') return { data: profile ? [cols === '*' ? { ...profile, bio: 'Olá' } : profile] : [], error: null };
      return { data: [], error: null };
    },
    gdpr_requests: (calls) => (first(calls, 'eq')[0] === 'id' ? { data: request ? [request] : [], error: null } : { data: [request], error: null }),
    services: () => ({ data: [{ id: 's1', title: 'Pintura' }], error: null }),
    admin_audit: () => ({ data: null, error: null }),
  };
}
const event = (body) => ({ httpMethod: 'POST', headers: { authorization: 'Bearer t' }, body: JSON.stringify(body) });
const auditRows = () => scenario.log.filter((e) => e.table === 'admin_audit').map((e) => first(e.calls, 'insert')[0]);

test('admin de apoio não pode exportar nem apagar', async () => {
  setup({ role: 'support' });
  const res = await handler(event({ action: 'delete', requestId: 'g1', confirmName: 'Ana Silva' }));
  assert.equal(res.statusCode, 403);
  assert.deepEqual(scenario.deleted, []);
});

test('export: devolve os dados da conta e regista a exportação', async () => {
  setup({ request: { id: 'g1', profile_id: 'ana', request_type: 'export', status: 'pending', created_at: '2026-09-01T10:00:00Z' } });
  const res = await handler(event({ action: 'export', requestId: 'g1' }));
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.data.profile.name, 'Ana Silva');
  assert.equal(body.data.account.email, 'ana@exemplo.pt');
  assert.deepEqual(body.data.services, [{ id: 's1', title: 'Pintura' }]);
  assert.equal(auditRows()[0].action, 'rgpd_exportacao');
});

test('delete: nome de confirmação errado não apaga nada', async () => {
  setup();
  const res = await handler(event({ action: 'delete', requestId: 'g1', confirmName: 'Ana' }));
  assert.equal(res.statusCode, 400);
  assert.deepEqual(scenario.deleted, []);
});

test('delete: pedido de exportação não pode ser usado para apagar', async () => {
  setup({ request: { id: 'g1', profile_id: 'ana', request_type: 'export', status: 'pending', created_at: '2026-09-01T10:00:00Z' } });
  const res = await handler(event({ action: 'delete', requestId: 'g1', confirmName: 'Ana Silva' }));
  assert.equal(res.statusCode, 400);
  assert.deepEqual(scenario.deleted, []);
});

test('delete: cancela a subscrição, apaga ficheiros, anonimiza visitas, apaga o utilizador e regista', async () => {
  setup({ profile: { id: 'ana', user_id: 'ana', name: 'Ana Silva', stripe_subscription_id: 'sub_1' } });
  scenario.files['proliga-media:portfolio/ana'] = ['a.jpg', 'b.jpg'];
  scenario.files['verification-docs:ana'] = ['cc.pdf'];
  scenario.subscriptionsRetrieve = async () => ({ status: 'active' });
  let cancelled = null;
  scenario.subscriptionsCancel = async (id) => { cancelled = id; return { status: 'canceled' }; };
  const res = await handler(event({ action: 'delete', requestId: 'g1', confirmName: ' Ana Silva ' }));
  assert.equal(res.statusCode, 200);
  assert.equal(cancelled, 'sub_1');
  assert.deepEqual(scenario.removed.sort(), ['proliga-media:portfolio/ana/a.jpg', 'proliga-media:portfolio/ana/b.jpg', 'verification-docs:ana/cc.pdf']);
  const visits = scenario.log.find((e) => e.table === 'site_visits' && first(e.calls, 'update').length);
  assert.deepEqual(first(visits.calls, 'update')[0], { user_id: null });
  assert.deepEqual(scenario.deleted, ['ana']);
  const row = auditRows().find((r) => r.action === 'rgpd_eliminacao');
  assert.ok(row, 'tem de ficar registo da eliminação');
  assert.equal(row.details.files_removed, 3);
  assert.equal(row.details.stripe_cancelled, true);
});

test('delete: se o Stripe falhar, não apaga a conta', async () => {
  setup({ profile: { id: 'ana', user_id: 'ana', name: 'Ana Silva', stripe_subscription_id: 'sub_1' } });
  scenario.subscriptionsRetrieve = async () => { const e = new Error('Stripe em baixo'); e.code = 'api_error'; throw e; };
  const res = await handler(event({ action: 'delete', requestId: 'g1', confirmName: 'Ana Silva' }));
  assert.equal(res.statusCode, 502);
  assert.deepEqual(scenario.deleted, []);
});
