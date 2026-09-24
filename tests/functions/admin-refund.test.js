// Testa netlify/functions/admin-refund.js.
//
// Lacuna encontrada em auditoria: o admin conseguia suspender um perfil
// disputado (toggleSuspended em admin.html) ou cancelar a subscrição
// (admin-set-plan.js), mas não existia nenhuma forma de emitir um
// reembolso Stripe real a partir do painel — tinha de ser feito
// manualmente fora do site. Os testes abaixo cobrem: autenticação/
// autorização de admin, a listagem de pagamentos (action:"list"), e o
// próprio reembolso (action:"refund"), incluindo a confirmação de que o
// charge pertence mesmo ao cliente Stripe do perfil-alvo antes de mexer
// em dinheiro.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeFakeStripe, makeFakeSupabaseAdmin } = require('./helpers/fakes');
const { stubModule } = require('./helpers/stub-require');

const scenario = {};

process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';

const HANDLER_PATH = require.resolve('../../netlify/functions/admin-refund.js');
stubModule('stripe', makeFakeStripe(scenario), HANDLER_PATH);
stubModule('@supabase/supabase-js', { createClient: makeFakeSupabaseAdmin(scenario) }, HANDLER_PATH);

const { handler } = require(HANDLER_PATH);

function resetScenario() {
  scenario.getUser = undefined;
  scenario.selectMaybeSingle = undefined;
  scenario.chargesList = undefined;
  scenario.chargesRetrieve = undefined;
  scenario.refundsCreate = undefined;
  scenario.updateCalls = [];
  scenario.insertCalls = [];
}

function baseEvent(overrides = {}) {
  return {
    httpMethod: 'POST',
    headers: { authorization: 'Bearer admin-token' },
    body: JSON.stringify({ action: 'list', targetProfileId: 'pro-1' }),
    ...overrides,
  };
}

// Admin autenticado como 'admin-user-1', is_admin=true.
function adminSelectMaybeSingle({ target = {} } = {}) {
  return async ({ cols, col, val }) => {
    if (cols === 'is_admin,admin_role') {
      assert.equal(col, 'user_id');
      assert.equal(val, 'admin-user-1');
      return { data: { is_admin: true }, error: null };
    }
    if (cols === 'id,name,stripe_customer_id') {
      assert.equal(col, 'id');
      assert.equal(val, 'pro-1');
      return { data: { id: 'pro-1', stripe_customer_id: target.stripe_customer_id ?? null }, error: null };
    }
    throw new Error('select inesperado neste teste: ' + cols);
  };
}

function asAdmin(target) {
  scenario.getUser = async () => ({ data: { user: { id: 'admin-user-1' } }, error: null });
  scenario.selectMaybeSingle = adminSelectMaybeSingle({ target });
}

test('rejeita métodos que não sejam POST', async () => {
  resetScenario();
  const res = await handler({ httpMethod: 'GET' });
  assert.equal(res.statusCode, 405);
});

test('rejeita pedido sem sessão', async () => {
  resetScenario();
  const res = await handler(baseEvent({ headers: {} }));
  assert.equal(res.statusCode, 401);
});

test('rejeita quem não é admin', async () => {
  resetScenario();
  scenario.getUser = async () => ({ data: { user: { id: 'user-comum' } }, error: null });
  scenario.selectMaybeSingle = async ({ cols }) => {
    assert.equal(cols, 'is_admin,admin_role');
    return { data: { is_admin: false }, error: null };
  };
  const res = await handler(baseEvent());
  assert.equal(res.statusCode, 403);
});

test('rejeita pedido sem targetProfileId', async () => {
  resetScenario();
  asAdmin({});
  const res = await handler(baseEvent({ body: JSON.stringify({ action: 'list' }) }));
  assert.equal(res.statusCode, 400);
});

test('rejeita perfil que não existe', async () => {
  resetScenario();
  scenario.getUser = async () => ({ data: { user: { id: 'admin-user-1' } }, error: null });
  scenario.selectMaybeSingle = async ({ cols }) => (cols === 'is_admin,admin_role' ? { data: { is_admin: true }, error: null } : { data: null, error: null });
  const res = await handler(baseEvent());
  assert.equal(res.statusCode, 404);
});

test('rejeita action desconhecida', async () => {
  resetScenario();
  asAdmin({});
  const res = await handler(baseEvent({ body: JSON.stringify({ action: 'apagar-tudo', targetProfileId: 'pro-1' }) }));
  assert.equal(res.statusCode, 400);
});

test('list: perfil sem stripe_customer_id devolve lista vazia sem chamar o Stripe', async () => {
  resetScenario();
  asAdmin({ stripe_customer_id: null });
  scenario.chargesList = async () => { throw new Error('não devia ser chamado sem stripe_customer_id'); };
  const res = await handler(baseEvent());
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { charges: [] });
});

test('list: perfil com stripe_customer_id consulta o Stripe pelo customer certo e devolve os campos necessários', async () => {
  resetScenario();
  asAdmin({ stripe_customer_id: 'cus_42' });
  scenario.chargesList = async (params) => {
    assert.equal(params.customer, 'cus_42');
    return {
      data: [
        { id: 'ch_1', amount: 2900, amount_refunded: 0, currency: 'eur', refunded: false, paid: true, created: 1700000000, description: 'Plano Pro' },
      ],
    };
  };
  const res = await handler(baseEvent());
  assert.equal(res.statusCode, 200);
  const { charges } = JSON.parse(res.body);
  assert.equal(charges.length, 1);
  assert.equal(charges[0].id, 'ch_1');
  assert.equal(charges[0].amount, 2900);
  assert.equal(charges[0].refunded, false);
});

test('refund: rejeita pedido sem chargeId', async () => {
  resetScenario();
  asAdmin({ stripe_customer_id: 'cus_42' });
  const res = await handler(baseEvent({ body: JSON.stringify({ action: 'refund', targetProfileId: 'pro-1' }) }));
  assert.equal(res.statusCode, 400);
});

test('refund: rejeita amount que não seja um inteiro positivo de cêntimos', async () => {
  resetScenario();
  asAdmin({ stripe_customer_id: 'cus_42' });
  const res = await handler(baseEvent({ body: JSON.stringify({ action: 'refund', targetProfileId: 'pro-1', chargeId: 'ch_1', amount: 12.5 }) }));
  assert.equal(res.statusCode, 400);
});

test('refund: rejeita motivo fora da lista aceite pelo Stripe', async () => {
  resetScenario();
  asAdmin({ stripe_customer_id: 'cus_42' });
  const res = await handler(baseEvent({ body: JSON.stringify({ action: 'refund', targetProfileId: 'pro-1', chargeId: 'ch_1', reason: 'porque_sim' }) }));
  assert.equal(res.statusCode, 400);
});

test('refund: perfil sem stripe_customer_id -> 400, nunca chama o Stripe', async () => {
  resetScenario();
  asAdmin({ stripe_customer_id: null });
  scenario.chargesRetrieve = async () => { throw new Error('não devia ser chamado'); };
  const res = await handler(baseEvent({ body: JSON.stringify({ action: 'refund', targetProfileId: 'pro-1', chargeId: 'ch_1' }) }));
  assert.equal(res.statusCode, 400);
});

test('refund: charge pertence a outro cliente Stripe -> 403, não reembolsa', async () => {
  resetScenario();
  asAdmin({ stripe_customer_id: 'cus_certo' });
  scenario.chargesRetrieve = async (id) => { assert.equal(id, 'ch_1'); return { customer: 'cus_errado' }; };
  scenario.refundsCreate = async () => { throw new Error('não devia reembolsar um charge de outro cliente'); };
  const res = await handler(baseEvent({ body: JSON.stringify({ action: 'refund', targetProfileId: 'pro-1', chargeId: 'ch_1' }) }));
  assert.equal(res.statusCode, 403);
});

test('refund: erro do Stripe a consultar o charge -> 502', async () => {
  resetScenario();
  asAdmin({ stripe_customer_id: 'cus_42' });
  scenario.chargesRetrieve = async () => { throw new Error('Stripe indisponível'); };
  const res = await handler(baseEvent({ body: JSON.stringify({ action: 'refund', targetProfileId: 'pro-1', chargeId: 'ch_1' }) }));
  assert.equal(res.statusCode, 502);
});

test('refund: sucesso (reembolso total, sem amount/reason) chama refunds.create só com o charge', async () => {
  resetScenario();
  asAdmin({ stripe_customer_id: 'cus_42' });
  scenario.chargesRetrieve = async () => ({ customer: 'cus_42' });
  let calledWith = null;
  scenario.refundsCreate = async (params) => { calledWith = params; return { id: 're_1', amount: 2900, status: 'succeeded' }; };
  const res = await handler(baseEvent({ body: JSON.stringify({ action: 'refund', targetProfileId: 'pro-1', chargeId: 'ch_1' }) }));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(calledWith, { charge: 'ch_1' });
  const body = JSON.parse(res.body);
  assert.equal(body.success, true);
  assert.equal(body.refund.id, 're_1');
});

test('refund: sucesso (parcial, com motivo) passa amount e reason ao Stripe', async () => {
  resetScenario();
  asAdmin({ stripe_customer_id: 'cus_42' });
  scenario.chargesRetrieve = async () => ({ customer: 'cus_42' });
  let calledWith = null;
  scenario.refundsCreate = async (params) => { calledWith = params; return { id: 're_2', amount: 1000, status: 'succeeded' }; };
  const res = await handler(baseEvent({ body: JSON.stringify({ action: 'refund', targetProfileId: 'pro-1', chargeId: 'ch_1', amount: 1000, reason: 'requested_by_customer' }) }));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(calledWith, { charge: 'ch_1', amount: 1000, reason: 'requested_by_customer' });
});

test('refund: erro do Stripe a criar o reembolso -> 502', async () => {
  resetScenario();
  asAdmin({ stripe_customer_id: 'cus_42' });
  scenario.chargesRetrieve = async () => ({ customer: 'cus_42' });
  scenario.refundsCreate = async () => { throw new Error('charge already refunded'); };
  const res = await handler(baseEvent({ body: JSON.stringify({ action: 'refund', targetProfileId: 'pro-1', chargeId: 'ch_1' }) }));
  assert.equal(res.statusCode, 502);
});

test('admin de apoio (admin_role=support) não pode ver pagamentos nem reembolsar', async () => {
  resetScenario();
  scenario.getUser = async () => ({ data: { user: { id: 'apoio-1' } }, error: null });
  scenario.selectMaybeSingle = async ({ cols }) => {
    assert.equal(cols, 'is_admin,admin_role');
    return { data: { is_admin: true, admin_role: 'support' }, error: null };
  };
  scenario.refundsCreate = async () => { throw new Error('não devia chegar ao Stripe'); };
  const res = await handler(baseEvent({ body: JSON.stringify({ action: 'refund', targetProfileId: 'pro-1', chargeId: 'ch_1' }) }));
  assert.equal(res.statusCode, 403);
});

test('refund: reembolso feito fica no registo de ações (admin_audit)', async () => {
  resetScenario();
  asAdmin({ stripe_customer_id: 'cus_42' });
  scenario.chargesRetrieve = async () => ({ customer: 'cus_42', currency: 'eur' });
  scenario.refundsCreate = async () => ({ id: 're_9', amount: 1500, status: 'succeeded' });
  const res = await handler(baseEvent({ body: JSON.stringify({ action: 'refund', targetProfileId: 'pro-1', chargeId: 'ch_1', amount: 1500, reason: 'duplicate' }) }));
  assert.equal(res.statusCode, 200);
  assert.equal(scenario.insertCalls.length, 1);
  const row = scenario.insertCalls[0].row;
  assert.equal(scenario.insertCalls[0].table, 'admin_audit');
  assert.equal(row.action, 'reembolso');
  assert.match(row.summary, /15\.00 EUR/);
  assert.equal(row.details.refundId, 're_9');
});
