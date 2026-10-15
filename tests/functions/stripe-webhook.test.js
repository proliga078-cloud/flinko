// Testa netlify/functions/stripe-webhook.js — a função que recebe eventos
// do Stripe e atualiza profiles.plan / stripe_customer_id / stripe_subscription_id.
// Cobre: verificação de assinatura, atribuição do plano correto consoante
// o estado da subscrição, e que uma sessão sem client_reference_id nunca
// atualiza um perfil ao calhas.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeFakeStripe, makeFakeSupabaseAdmin } = require('./helpers/fakes');
const { stubModule } = require('./helpers/stub-require');

const scenario = {};
process.env.STRIPE_PRICE_STARTER_MONTHLY = 'price_starter_m';
process.env.STRIPE_PRICE_PRO_MONTHLY = 'price_pro_m';

process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fake';
process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';

const HANDLER_PATH = require.resolve('../../netlify/functions/stripe-webhook.js');
stubModule('stripe', makeFakeStripe(scenario), HANDLER_PATH);
stubModule('@supabase/supabase-js', { createClient: makeFakeSupabaseAdmin(scenario) }, HANDLER_PATH);

const { handler } = require(HANDLER_PATH);

function resetScenario() {
  scenario.constructEvent = undefined;
  scenario.subscriptionsRetrieve = undefined;
  scenario.chargesRetrieve = undefined;
  scenario.updateCalls = [];
}

function baseEvent(overrides = {}) {
  return {
    headers: { 'stripe-signature': 'sig_valid' },
    body: '{}',
    isBase64Encoded: false,
    ...overrides,
  };
}

test('assinatura inválida -> 400, nenhuma atualização na BD', async () => {
  resetScenario();
  scenario.constructEvent = () => { throw new Error('signature mismatch'); };
  const res = await handler(baseEvent());
  assert.equal(res.statusCode, 400);
  assert.match(res.body, /Webhook Error/);
  assert.equal(scenario.updateCalls.length, 0);
});

test('checkout.session.completed com subscrição: lê o plano dos metadados da subscrição e atualiza o perfil certo', async () => {
  resetScenario();
  scenario.constructEvent = () => ({
    type: 'checkout.session.completed',
    data: { object: { mode: 'subscription', client_reference_id: 'user-42', customer: 'cus_42', subscription: 'sub_42' } },
  });
  scenario.subscriptionsRetrieve = async (id) => {
    assert.equal(id, 'sub_42');
    return { metadata: { plan: 'pro' } };
  };
  const res = await handler(baseEvent());
  assert.equal(res.statusCode, 200);
  assert.equal(scenario.updateCalls.length, 1);
  const call = scenario.updateCalls[0];
  assert.equal(call.table, 'profiles');
  assert.equal(call.col, 'id');
  assert.equal(call.val, 'user-42');
  assert.equal(call.patch.plan, 'pro');
  assert.equal(call.patch.stripe_customer_id, 'cus_42');
  assert.equal(call.patch.stripe_subscription_id, 'sub_42');
});

test('checkout.session.completed sem client_reference_id: não atualiza nenhum perfil', async () => {
  resetScenario();
  scenario.constructEvent = () => ({
    type: 'checkout.session.completed',
    data: { object: { mode: 'subscription', client_reference_id: null, customer: 'cus_x', subscription: 'sub_x' } },
  });
  // A função ainda consulta a subscrição no Stripe mesmo sem
  // client_reference_id (só decide não escrever na BD mais tarde).
  scenario.subscriptionsRetrieve = async () => ({ metadata: { plan: 'pro' } });
  const res = await handler(baseEvent());
  assert.equal(res.statusCode, 200);
  assert.equal(scenario.updateCalls.length, 0, 'sem userId não há forma segura de saber a quem atribuir o plano');
});

test('checkout.session.completed de pagamento único (Construtor IA): não mexe no plano', async () => {
  resetScenario();
  scenario.constructEvent = () => ({
    type: 'checkout.session.completed',
    data: { object: { mode: 'payment', client_reference_id: 'user-9', customer: 'cus_9', subscription: null, metadata: { product: 'ai_profile_builder' } } },
  });
  scenario.subscriptionsRetrieve = async () => { throw new Error('não devia consultar subscrições'); };
  const res = await handler(baseEvent());
  assert.equal(res.statusCode, 200);
  assert.equal(scenario.updateCalls.length, 0, 'pagar o Construtor IA não pode dar plano Pro');
});

test('customer.subscription.updated: active -> mantém/atribui o plano pago', async () => {
  resetScenario();
  scenario.constructEvent = () => ({
    type: 'customer.subscription.updated',
    data: { object: { id: 'sub_1', status: 'active', metadata: { plan: 'pro' } } },
  });
  const res = await handler(baseEvent());
  assert.equal(res.statusCode, 200);
  assert.equal(scenario.updateCalls[0].patch.plan, 'pro');
  assert.equal(scenario.updateCalls[0].col, 'stripe_subscription_id');
  assert.equal(scenario.updateCalls[0].val, 'sub_1');
});

test('customer.subscription.updated: trialing -> também conta como pago', async () => {
  resetScenario();
  scenario.constructEvent = () => ({
    type: 'customer.subscription.updated',
    data: { object: { id: 'sub_2', status: 'trialing', metadata: {} } },
  });
  await handler(baseEvent());
  assert.equal(scenario.updateCalls[0].patch.plan, 'pro', 'sem metadata.plan deve cair no default "pro"');
});

for (const badStatus of ['unpaid', 'canceled', 'incomplete_expired', 'paused']) {
  test(`customer.subscription.updated: ${badStatus} -> volta para "free"`, async () => {
    resetScenario();
    scenario.constructEvent = () => ({
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_x', status: badStatus, metadata: { plan: 'pro' } } },
    });
    await handler(baseEvent());
    assert.equal(scenario.updateCalls[0].patch.plan, 'free');
  });
}

test('customer.subscription.deleted: repõe free e limpa o subscription id', async () => {
  resetScenario();
  scenario.constructEvent = () => ({
    type: 'customer.subscription.deleted',
    data: { object: { id: 'sub_9' } },
  });
  await handler(baseEvent());
  assert.equal(scenario.updateCalls.length, 1);
  assert.equal(scenario.updateCalls[0].patch.plan, 'free');
  assert.equal(scenario.updateCalls[0].patch.stripe_subscription_id, null);
  assert.equal(scenario.updateCalls[0].col, 'stripe_subscription_id');
  assert.equal(scenario.updateCalls[0].val, 'sub_9');
});

test('charge.dispute.created: suspende o perfil do cliente associado ao charge disputado', async () => {
  resetScenario();
  scenario.constructEvent = () => ({
    type: 'charge.dispute.created',
    data: { object: { id: 'dp_1', charge: 'ch_1' } },
  });
  scenario.chargesRetrieve = async (id) => {
    assert.equal(id, 'ch_1');
    return { customer: 'cus_disputado' };
  };
  const res = await handler(baseEvent());
  assert.equal(res.statusCode, 200);
  assert.equal(scenario.updateCalls.length, 1);
  assert.equal(scenario.updateCalls[0].table, 'profiles');
  assert.equal(scenario.updateCalls[0].col, 'stripe_customer_id');
  assert.equal(scenario.updateCalls[0].val, 'cus_disputado');
  assert.equal(scenario.updateCalls[0].patch.suspended, true);
  // Não deve mexer no plano nem na subscrição — ver comentário no handler
  // sobre porque isso ficaria vulnerável ao mesmo ciclo de reconciliação
  // corrigido em admin-set-plan.js.
  assert.equal('plan' in scenario.updateCalls[0].patch, false);
  assert.equal('stripe_subscription_id' in scenario.updateCalls[0].patch, false);
});

test('charge.dispute.created: charge sem customer -> não atualiza nenhum perfil (não rebenta)', async () => {
  resetScenario();
  scenario.constructEvent = () => ({
    type: 'charge.dispute.created',
    data: { object: { id: 'dp_2', charge: 'ch_2' } },
  });
  scenario.chargesRetrieve = async () => ({ customer: null });
  const res = await handler(baseEvent());
  assert.equal(res.statusCode, 200);
  assert.equal(scenario.updateCalls.length, 0);
});

test('charge.dispute.created: dispute sem charge -> não chama o Stripe nem a BD', async () => {
  resetScenario();
  scenario.constructEvent = () => ({
    type: 'charge.dispute.created',
    data: { object: { id: 'dp_3', charge: null } },
  });
  scenario.chargesRetrieve = async () => { throw new Error('não devia ser chamado sem charge'); };
  const res = await handler(baseEvent());
  assert.equal(res.statusCode, 200);
  assert.equal(scenario.updateCalls.length, 0);
});

test('tipo de evento desconhecido: responde 200 e não mexe na BD', async () => {
  resetScenario();
  scenario.constructEvent = () => ({ type: 'invoice.paid', data: { object: {} } });
  const res = await handler(baseEvent());
  assert.equal(res.statusCode, 200);
  assert.equal(scenario.updateCalls.length, 0);
});

test('erro a processar o evento -> 500', async () => {
  resetScenario();
  scenario.constructEvent = () => ({
    type: 'checkout.session.completed',
    data: { object: { mode: 'subscription', client_reference_id: 'user-1', subscription: 'sub_1' } },
  });
  scenario.subscriptionsRetrieve = async () => { throw new Error('falha a consultar a subscrição'); };
  const res = await handler(baseEvent());
  assert.equal(res.statusCode, 500);
});

test('customer.subscription.updated: past_due -> mantém o plano pago (período de graça enquanto o Stripe repete a cobrança)', async () => {
  resetScenario();
  scenario.constructEvent = () => ({
    type: 'customer.subscription.updated',
    data: { object: { id: 'sub_pd', status: 'past_due', metadata: { plan: 'pro' } } },
  });
  await handler(baseEvent());
  assert.equal(scenario.updateCalls[0].patch.plan, 'pro');
});

test('o plano vem do preço da subscrição (mudança Starter -> Pro no portal), não do metadata antigo', async () => {
  resetScenario();
  scenario.constructEvent = () => ({
    type: 'customer.subscription.updated',
    data: { object: { id: 'sub_up', status: 'active', metadata: { plan: 'starter' }, items: { data: [{ price: { id: 'price_pro_m' } }] } } },
  });
  await handler(baseEvent());
  assert.equal(scenario.updateCalls[0].patch.plan, 'pro');
});

test('checkout.session.completed de Starter grava plan="starter"', async () => {
  resetScenario();
  scenario.constructEvent = () => ({
    type: 'checkout.session.completed',
    data: { object: { mode: 'subscription', client_reference_id: 'user-7', customer: 'cus_7', subscription: 'sub_7' } },
  });
  scenario.subscriptionsRetrieve = async () => ({ metadata: {}, items: { data: [{ price: { id: 'price_starter_m' } }] } });
  await handler(baseEvent());
  assert.equal(scenario.updateCalls[0].patch.plan, 'starter');
});

test('REGRESSÃO: se a BD recusar a escrita, responde 500 para o Stripe repetir o evento (antes respondia 200 e o cliente ficava sem plano)', async () => {
  resetScenario();
  scenario.updateError = { message: 'connection reset' };
  scenario.constructEvent = () => ({
    type: 'customer.subscription.updated',
    data: { object: { id: 'sub_err', status: 'active', metadata: { plan: 'pro' } } },
  });
  const res = await handler(baseEvent());
  assert.equal(res.statusCode, 500);
  assert.match(res.body, /connection reset/);
});
