// Testa netlify/functions/create-portal-session.js.
//
// Tal como no checkout, o ponto central é a correção de 21 de agosto de
// 2026: o customerId do Stripe tem de vir SEMPRE do perfil do próprio
// utilizador autenticado (resolvido a partir do token), nunca de nada que o
// browser mande no pedido — porque antes disso, qualquer pessoa com sessão
// podia ler o stripe_customer_id de outra conta e abrir/gerir a
// subscrição dela.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeFakeStripe, makeFakeSupabaseAdmin } = require('./helpers/fakes');
const { stubModule } = require('./helpers/stub-require');

const scenario = {};

process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';

const HANDLER_PATH = require.resolve('../../netlify/functions/create-portal-session.js');
stubModule('stripe', makeFakeStripe(scenario), HANDLER_PATH);
stubModule('@supabase/supabase-js', { createClient: makeFakeSupabaseAdmin(scenario) }, HANDLER_PATH);

const { handler } = require(HANDLER_PATH);

function resetScenario() {
  scenario.getUser = undefined;
  scenario.selectMaybeSingle = undefined;
  scenario.billingPortalSessionsCreate = undefined;
}

function baseEvent(overrides = {}) {
  return {
    httpMethod: 'POST',
    headers: { authorization: 'Bearer valid-token', host: 'flinko.pt' },
    body: '{}',
    ...overrides,
  };
}

test('rejeita métodos que não sejam POST', async () => {
  resetScenario();
  const res = await handler({ httpMethod: 'GET' });
  assert.equal(res.statusCode, 405);
});

test('rejeita pedido sem cabeçalho Authorization', async () => {
  resetScenario();
  const res = await handler(baseEvent({ headers: { host: 'flinko.pt' } }));
  assert.equal(res.statusCode, 401);
});

test('rejeita token inválido', async () => {
  resetScenario();
  scenario.getUser = async () => ({ data: null, error: new Error('bad token') });
  const res = await handler(baseEvent());
  assert.equal(res.statusCode, 401);
});

test('devolve 400 se o próprio utilizador não tiver stripe_customer_id', async () => {
  resetScenario();
  scenario.getUser = async () => ({ data: { user: { id: 'user-sem-plano' } }, error: null });
  scenario.selectMaybeSingle = async ({ table, col, val }) => {
    assert.equal(table, 'profiles');
    assert.equal(col, 'id');
    assert.equal(val, 'user-sem-plano');
    return { data: { stripe_customer_id: null }, error: null };
  };
  const res = await handler(baseEvent());
  assert.equal(res.statusCode, 400);
  assert.match(JSON.parse(res.body).error, /Ainda não tens uma subscrição/);
});

test('usa SEMPRE o customerId do PRÓPRIO perfil (via userId da sessão), ignora qualquer customerId no corpo', async () => {
  resetScenario();
  scenario.getUser = async (token) => {
    assert.equal(token, 'victim-token');
    return { data: { user: { id: 'victim-id' } }, error: null };
  };
  scenario.selectMaybeSingle = async ({ col, val }) => {
    assert.equal(col, 'id');
    assert.equal(val, 'victim-id', 'tem de procurar o customerId pelo ID de quem está autenticado, nunca por outro ID');
    return { data: { stripe_customer_id: 'cus_victim_real' }, error: null };
  };
  let capturedParams = null;
  scenario.billingPortalSessionsCreate = async (params) => { capturedParams = params; return { url: 'https://billing.stripe.com/session/abc' }; };

  // Um atacante autenticado como "victim" tenta, mesmo assim, mandar no
  // corpo o customerId de outra conta (ex: um valor visto nalgum lado).
  const res = await handler(baseEvent({
    headers: { authorization: 'Bearer victim-token', host: 'flinko.pt' },
    body: JSON.stringify({ customerId: 'cus_OUTRA_CONTA_QUALQUER' }),
  }));

  assert.equal(res.statusCode, 200);
  assert.equal(capturedParams.customer, 'cus_victim_real', 'o customer do portal tem de ser sempre o do próprio dono da sessão');
  assert.equal(JSON.parse(res.body).url, 'https://billing.stripe.com/session/abc');
});

test('devolve 500 se o Stripe falhar', async () => {
  resetScenario();
  scenario.getUser = async () => ({ data: { user: { id: 'user-x' } }, error: null });
  scenario.selectMaybeSingle = async () => ({ data: { stripe_customer_id: 'cus_x' }, error: null });
  scenario.billingPortalSessionsCreate = async () => { throw new Error('stripe fora do ar'); };
  const res = await handler(baseEvent());
  assert.equal(res.statusCode, 500);
});
