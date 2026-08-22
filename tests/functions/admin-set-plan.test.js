// Testa netlify/functions/admin-set-plan.js.
//
// Esta função existe por causa de um bug real de reconciliação encontrado em
// auditoria: admin.html mudava profiles.plan diretamente do browser, sem
// nunca cancelar uma eventual subscrição Stripe ainda ativa. Isso deixava o
// cliente a ser cobrado por um plano que já não tinha, E o próximo evento do
// Stripe para essa subscrição (que continuava "active") reescrevia sozinho
// o plano antigo por cima da decisão do admin — sem erro nenhum a avisar.
// Os testes abaixo cobrem: autenticação/autorização de admin, cancelamento
// real da subscrição Stripe quando existe uma, e que stripe_subscription_id
// fica sempre limpo depois disso (para nenhum webhook futuro voltar a mexer
// no perfil).
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeFakeStripe, makeFakeSupabaseAdmin } = require('./helpers/fakes');
const { stubModule } = require('./helpers/stub-require');

const scenario = {};

process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';

const HANDLER_PATH = require.resolve('../../netlify/functions/admin-set-plan.js');
stubModule('stripe', makeFakeStripe(scenario), HANDLER_PATH);
stubModule('@supabase/supabase-js', { createClient: makeFakeSupabaseAdmin(scenario) }, HANDLER_PATH);

const { handler } = require(HANDLER_PATH);

function resetScenario() {
  scenario.getUser = undefined;
  scenario.selectMaybeSingle = undefined;
  scenario.subscriptionsRetrieve = undefined;
  scenario.subscriptionsCancel = undefined;
  scenario.updateCalls = [];
}

function baseEvent(overrides = {}) {
  return {
    httpMethod: 'POST',
    headers: { authorization: 'Bearer admin-token' },
    body: JSON.stringify({ targetProfileId: 'pro-1', plan: 'free' }),
    ...overrides,
  };
}

// Admin autenticado como 'admin-user-1', is_admin=true.
function adminSelectMaybeSingle({ target = {} } = {}) {
  return async ({ cols, col, val }) => {
    if (cols === 'is_admin') {
      assert.equal(col, 'user_id');
      assert.equal(val, 'admin-user-1');
      return { data: { is_admin: true }, error: null };
    }
    if (cols === 'id,stripe_subscription_id') {
      assert.equal(col, 'id');
      assert.equal(val, 'pro-1');
      return { data: { id: 'pro-1', stripe_subscription_id: target.stripe_subscription_id ?? null }, error: null };
    }
    throw new Error('select inesperado neste teste: ' + cols);
  };
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
    assert.equal(cols, 'is_admin');
    return { data: { is_admin: false }, error: null };
  };
  const res = await handler(baseEvent());
  assert.equal(res.statusCode, 403);
});

test('rejeita plano fora da lista permitida', async () => {
  resetScenario();
  scenario.getUser = async () => ({ data: { user: { id: 'admin-user-1' } }, error: null });
  scenario.selectMaybeSingle = adminSelectMaybeSingle();
  const res = await handler(baseEvent({ body: JSON.stringify({ targetProfileId: 'pro-1', plan: 'super-vip' }) }));
  assert.equal(res.statusCode, 400);
});

test('perfil sem subscrição Stripe: só muda o plano, nunca chama o Stripe', async () => {
  resetScenario();
  scenario.getUser = async () => ({ data: { user: { id: 'admin-user-1' } }, error: null });
  scenario.selectMaybeSingle = adminSelectMaybeSingle({ target: { stripe_subscription_id: null } });
  scenario.subscriptionsCancel = async () => { throw new Error('não devia ser chamado — perfil sem subscrição Stripe'); };

  const res = await handler(baseEvent());
  assert.equal(res.statusCode, 200);
  assert.equal(scenario.updateCalls.length, 1);
  assert.deepEqual(scenario.updateCalls[0].patch, { plan: 'free' });
  assert.equal(scenario.updateCalls[0].col, 'id');
  assert.equal(scenario.updateCalls[0].val, 'pro-1');
});

test('perfil COM subscrição Stripe ativa: cancela no Stripe e limpa stripe_subscription_id no perfil', async () => {
  resetScenario();
  scenario.getUser = async () => ({ data: { user: { id: 'admin-user-1' } }, error: null });
  scenario.selectMaybeSingle = adminSelectMaybeSingle({ target: { stripe_subscription_id: 'sub_ativa_1' } });
  scenario.subscriptionsRetrieve = async (id) => { assert.equal(id, 'sub_ativa_1'); return { status: 'active' }; };
  let cancelledId = null;
  scenario.subscriptionsCancel = async (id) => { cancelledId = id; return { status: 'canceled' }; };

  const res = await handler(baseEvent());
  assert.equal(res.statusCode, 200);
  assert.equal(cancelledId, 'sub_ativa_1', 'a subscrição real tem de ser cancelada no Stripe, não só ignorada');
  assert.equal(scenario.updateCalls.length, 1);
  assert.equal(scenario.updateCalls[0].patch.plan, 'free');
  assert.equal(scenario.updateCalls[0].patch.stripe_subscription_id, null, 'sem isto, o próximo evento do Stripe para esta subscrição reporia o plano antigo');
});

test('subscrição já cancelada no Stripe (status=canceled): não tenta cancelar outra vez, mas limpa mesmo assim o perfil', async () => {
  resetScenario();
  scenario.getUser = async () => ({ data: { user: { id: 'admin-user-1' } }, error: null });
  scenario.selectMaybeSingle = adminSelectMaybeSingle({ target: { stripe_subscription_id: 'sub_ja_cancelada' } });
  scenario.subscriptionsRetrieve = async () => ({ status: 'canceled' });
  scenario.subscriptionsCancel = async () => { throw new Error('não devia tentar cancelar uma subscrição já cancelada'); };

  const res = await handler(baseEvent());
  assert.equal(res.statusCode, 200);
  assert.equal(scenario.updateCalls[0].patch.stripe_subscription_id, null);
});

test('subscrição já removida no Stripe (resource_missing ao consultar): trata como já resolvido, não falha o pedido', async () => {
  resetScenario();
  scenario.getUser = async () => ({ data: { user: { id: 'admin-user-1' } }, error: null });
  scenario.selectMaybeSingle = adminSelectMaybeSingle({ target: { stripe_subscription_id: 'sub_fantasma' } });
  scenario.subscriptionsRetrieve = async () => { const e = new Error('No such subscription'); e.code = 'resource_missing'; throw e; };

  const res = await handler(baseEvent());
  assert.equal(res.statusCode, 200);
  assert.equal(scenario.updateCalls[0].patch.stripe_subscription_id, null);
});

test('erro real do Stripe ao cancelar (não resource_missing): devolve 502 e não atualiza o perfil às cegas', async () => {
  resetScenario();
  scenario.getUser = async () => ({ data: { user: { id: 'admin-user-1' } }, error: null });
  scenario.selectMaybeSingle = adminSelectMaybeSingle({ target: { stripe_subscription_id: 'sub_com_erro' } });
  scenario.subscriptionsRetrieve = async () => ({ status: 'active' });
  scenario.subscriptionsCancel = async () => { throw new Error('Stripe API fora do ar'); };

  const res = await handler(baseEvent());
  assert.equal(res.statusCode, 502);
  assert.equal(scenario.updateCalls.length, 0, 'não deve mudar o plano se não conseguimos confirmar que a cobrança real foi parada');
});
