// Testa netlify/functions/create-checkout-session.js.
//
// O ponto central destes testes é a correção de segurança feita a 21 de
// agosto de 2026: o userId e o email TÊM de vir sempre da sessão validada
// (admin.auth.getUser(token)), nunca do corpo do pedido — porque antes um
// atacante podia pagar com o seu próprio cartão e atribuir a subscrição ao
// ID de outra conta qualquer. Se algum dia alguém "simplificar" a função e
// voltar a ler userId/email de event.body, estes testes têm de rebentar.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeFakeStripe, makeFakeSupabaseAdmin } = require('./helpers/fakes');
const { stubModule } = require('./helpers/stub-require');

const scenario = {};

process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
process.env.STRIPE_PRICE_PRO_MONTHLY = 'price_pro_monthly_fake';
process.env.STRIPE_PRICE_PRO_YEARLY = 'price_pro_yearly_fake';
process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';

const HANDLER_PATH = require.resolve('../../netlify/functions/create-checkout-session.js');
stubModule('stripe', makeFakeStripe(scenario), HANDLER_PATH);
stubModule('@supabase/supabase-js', { createClient: makeFakeSupabaseAdmin(scenario) }, HANDLER_PATH);

const { handler } = require(HANDLER_PATH);

function resetScenario() {
  scenario.getUser = undefined;
  scenario.checkoutSessionsCreate = undefined;
  scenario.checkoutSessionsCreateCalls = [];
}

function baseEvent(overrides = {}) {
  return {
    httpMethod: 'POST',
    headers: { authorization: 'Bearer valid-token', host: 'proliga.pt' },
    body: JSON.stringify({ plan: 'pro', billing: 'monthly' }),
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
  const res = await handler(baseEvent({ headers: { host: 'proliga.pt' } }));
  assert.equal(res.statusCode, 401);
  assert.match(JSON.parse(res.body).error, /Sem sessão/);
});

test('rejeita token inválido (admin.auth.getUser devolve erro)', async () => {
  resetScenario();
  scenario.getUser = async () => ({ data: null, error: new Error('invalid token') });
  const res = await handler(baseEvent());
  assert.equal(res.statusCode, 401);
  assert.match(JSON.parse(res.body).error, /Sessão inválida/);
});

test('rejeita token que não corresponde a nenhum utilizador', async () => {
  resetScenario();
  scenario.getUser = async () => ({ data: { user: null }, error: null });
  const res = await handler(baseEvent());
  assert.equal(res.statusCode, 401);
});

test('rejeita combinação de plano/periodicidade inválida', async () => {
  resetScenario();
  scenario.getUser = async () => ({ data: { user: { id: 'user-123', email: 'dono@example.com' } }, error: null });
  let created = false;
  scenario.checkoutSessionsCreate = async () => { created = true; return { url: 'https://checkout.stripe.com/should-not-happen' }; };
  const res = await handler(baseEvent({ body: JSON.stringify({ plan: 'premium', billing: 'monthly' }) }));
  assert.equal(res.statusCode, 400);
  assert.equal(created, false, 'não deve chamar o Stripe se o plano for inválido');
});

test('usa SEMPRE o userId/email da sessão validada, mesmo que o corpo tente mandar outros', async () => {
  resetScenario();
  scenario.getUser = async (token) => {
    assert.equal(token, 'attacker-own-valid-token');
    return { data: { user: { id: 'attacker-real-id', email: 'attacker@example.com' } }, error: null };
  };
  let capturedParams = null;
  scenario.checkoutSessionsCreate = async (params) => { capturedParams = params; return { url: 'https://checkout.stripe.com/session/xyz' }; };

  // O atacante tenta injectar o ID/email de outra vítima no corpo do pedido.
  const maliciousBody = JSON.stringify({
    plan: 'pro',
    billing: 'monthly',
    userId: 'victim-id-999',
    client_reference_id: 'victim-id-999',
    email: 'victima@example.com',
  });
  const res = await handler(baseEvent({
    headers: { authorization: 'Bearer attacker-own-valid-token', host: 'proliga.pt' },
    body: maliciousBody,
  }));

  assert.equal(res.statusCode, 200);
  assert.equal(capturedParams.client_reference_id, 'attacker-real-id', 'client_reference_id tem de vir da sessão, não do corpo');
  assert.equal(capturedParams.customer_email, 'attacker@example.com', 'customer_email tem de vir da sessão, não do corpo');
  assert.equal(capturedParams.subscription_data.metadata.supabase_user_id, 'attacker-real-id');
  assert.equal(JSON.parse(res.body).url, 'https://checkout.stripe.com/session/xyz');
});

test('mapeia plan+billing corretamente para o price ID configurado', async () => {
  resetScenario();
  scenario.getUser = async () => ({ data: { user: { id: 'user-abc', email: 'a@example.com' } }, error: null });
  let capturedParams = null;
  scenario.checkoutSessionsCreate = async (params) => { capturedParams = params; return { url: 'https://checkout.stripe.com/x' }; };

  await handler(baseEvent({ body: JSON.stringify({ plan: 'pro', billing: 'yearly' }) }));
  assert.equal(capturedParams.line_items[0].price, 'price_pro_yearly_fake');
});

test('não liga automatic_tax (regime de isenção de IVA, art. 53.º CIVA)', async () => {
  resetScenario();
  scenario.getUser = async () => ({ data: { user: { id: 'user-abc', email: 'a@example.com' } }, error: null });
  let capturedParams = null;
  scenario.checkoutSessionsCreate = async (params) => { capturedParams = params; return { url: 'https://checkout.stripe.com/x' }; };

  await handler(baseEvent());
  assert.equal(capturedParams.automatic_tax, undefined, 'automatic_tax não deve estar ligado enquanto a Proliga estiver isenta de IVA');
});

test('devolve 500 se o Stripe falhar', async () => {
  resetScenario();
  scenario.getUser = async () => ({ data: { user: { id: 'user-abc', email: 'a@example.com' } }, error: null });
  scenario.checkoutSessionsCreate = async () => { throw new Error('stripe indisponível'); };
  const res = await handler(baseEvent());
  assert.equal(res.statusCode, 500);
  assert.match(JSON.parse(res.body).error, /indisponível/);
});
