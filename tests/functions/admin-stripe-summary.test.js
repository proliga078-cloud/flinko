// Testa netlify/functions/admin-stripe-summary.js: o resumo da receita real
// do Stripe que substitui a estimativa de MRR do painel.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeQueryableSupabase } = require('./helpers/queryable');
const { stubModule } = require('./helpers/stub-require');

process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';

const scenario = {};
const HANDLER_PATH = require.resolve('../../netlify/functions/admin-stripe-summary.js');
const list = (arr) => ({ async *[Symbol.asyncIterator]() { for (const x of arr) yield x; } });
stubModule('stripe', () => ({
  balanceTransactions: { list: () => list(scenario.tx || []) },
  subscriptions: { list: () => list(scenario.subs || []) },
  disputes: { list: () => list(scenario.disputes || []) },
  balance: { retrieve: async () => ({ available: [{ currency: 'eur', amount: 5000 }], pending: [{ currency: 'eur', amount: 700 }] }) },
}), HANDLER_PATH);
stubModule('@supabase/supabase-js', { createClient: makeQueryableSupabase(scenario) }, HANDLER_PATH);
const { handler, summarize, monthlyCents } = require(HANDLER_PATH);

const NOW = Date.UTC(2026, 8, 24, 12) / 1000; // 24/09/2026
const DAY = 86400;
const item = (unit_amount, interval = 'month', quantity = 1) => ({ price: { unit_amount, recurring: { interval, interval_count: 1 } }, quantity });

test('monthlyCents normaliza preços anuais e semanais para mês', () => {
  assert.equal(monthlyCents(item(1999)), 1999);
  assert.equal(monthlyCents(item(12000, 'year')), 1000);
  assert.equal(Math.round(monthlyCents(item(100, 'week'))), 433);
  assert.equal(monthlyCents(item(1000, 'month', 3)), 3000);
});

test('summarize: MRR real com descontos, sem períodos de teste; atrasos e cancelamentos recentes', () => {
  const r = summarize({
    now: NOW,
    subscriptions: [
      { id: 'a', status: 'active', customer: 'cus_a', items: { data: [item(1999)] } },
      { id: 'b', status: 'active', customer: 'cus_b', items: { data: [item(23988, 'year')] }, discount: { coupon: { percent_off: 50 } } },
      { id: 'c', status: 'trialing', customer: 'cus_c', items: { data: [item(2999)] } },
      { id: 'd', status: 'past_due', customer: 'cus_d', items: { data: [item(999)] }, current_period_start: NOW - 5 * DAY },
    ],
    canceled: [
      { id: 'e', status: 'canceled', customer: 'cus_e', canceled_at: NOW - 3 * DAY, cancellation_details: { reason: 'cancellation_requested' } },
      { id: 'f', status: 'canceled', customer: 'cus_f', canceled_at: NOW - 60 * DAY },
    ],
    names: { cus_d: { name: 'Rui', profile_id: 'p-rui' } },
  });
  assert.equal(r.mrr, Math.round(1999 + 999.5 + 999)); // b: 239,88/ano = 19,99/mês com 50% = 9,995; d conta (ainda é cliente); c não (teste)
  assert.deepEqual(r.subscriptions, { active: 2, trialing: 1, pastDue: 1 });
  assert.equal(r.pastDue[0].customer.name, 'Rui');
  assert.equal(r.churned30.length, 1);
  assert.equal(r.churned30[0].reason, 'cancellation_requested');
});

test('summarize: soma recebido, reembolsos, taxas e líquido dos últimos 30 dias e por mês', () => {
  const r = summarize({
    now: NOW,
    transactions: [
      { type: 'charge', amount: 1999, fee: 60, net: 1939, created: NOW - 2 * DAY },
      { type: 'charge', amount: 999, fee: 40, net: 959, created: NOW - 40 * DAY },
      { type: 'refund', amount: -999, fee: 0, net: -999, created: NOW - 1 * DAY },
    ],
    balance: { available: [{ currency: 'eur', amount: 100 }], pending: [] },
  });
  assert.deepEqual(r.last30, { gross: 1999, refunds: 999, fees: 60, net: 940 });
  assert.equal(r.months.length, 6);
  const sep = r.months.find((m) => m.month === '2026-09'), aug = r.months.find((m) => m.month === '2026-08');
  assert.equal(sep.gross, 1999); assert.equal(sep.refunds, 999);
  assert.equal(aug.gross, 999);
  assert.deepEqual(r.balance, { available: 100, pending: 0 });
});

test('handler: só donos; devolve o resumo com os nomes dos perfis', async () => {
  const setRole = (role) => {
    scenario.getUser = async () => ({ data: { user: { id: 'u1' } }, error: null });
    scenario.queries = {
      profiles: (calls) => calls[0].args[0] === 'is_admin,admin_role' ? { data: [{ is_admin: true, admin_role: role }], error: null } : { data: [{ stripe_customer_id: 'cus_a', name: 'Ana', id: 'p-ana' }], error: null },
    };
  };
  const ev = { httpMethod: 'POST', headers: { authorization: 'Bearer t' }, body: '{}' };
  setRole('support');
  assert.equal((await handler(ev)).statusCode, 403);

  setRole('owner');
  scenario.subs = [{ id: 'a', status: 'past_due', customer: 'cus_a', items: { data: [item(1999)] } }, { id: 'z', status: 'canceled', customer: 'cus_a', canceled_at: Math.floor(Date.now() / 1000) - DAY }];
  const res = await handler(ev);
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.pastDue[0].customer.name, 'Ana');
  assert.equal(body.churned30.length, 1);
  assert.deepEqual(body.balance, { available: 5000, pending: 700 });
});
