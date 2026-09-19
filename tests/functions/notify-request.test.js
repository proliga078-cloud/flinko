// Testa netlify/functions/notify-request.js — avisa por email/push os
// profissionais da categoria quando um cliente publica um pedido.
//
// O que estes testes protegem:
//  - só o dono do pedido pode disparar o aviso (nunca um endereço vindo do browser);
//  - REGRESSÃO: chamar a function várias vezes com o mesmo pedido enviava os
//    emails todas as vezes (email-bombing) — agora só a 1.ª chamada envia;
//  - limite de pedidos notificados por hora por cliente;
//  - a escolha dos 15 destinatários dá prioridade à mesma zona e a planos pagos.
const test = require('node:test');
const assert = require('node:assert/strict');
const { stubModule } = require('./helpers/stub-require');
const { makeQueryableSupabase } = require('./helpers/queryable');

const scenario = {};

process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';
process.env.RESEND_API_KEY = 're_fake';

const HANDLER_PATH = require.resolve('../../netlify/functions/notify-request.js');
stubModule('@supabase/supabase-js', { createClient: makeQueryableSupabase(scenario) }, HANDLER_PATH);
stubModule('./_push', {
  sendPush: async (id, payload) => { scenario.pushes.push({ id, payload }); return { sent: 1 }; },
}, HANDLER_PATH);

const { handler } = require(HANDLER_PATH);

const PEDIDO = { id: 'req-1', client_id: 'cliente-1', title: 'Instalar tomadas', category: 'Eletricistas', location: 'Porto', budget_from: 100, budget_to: 200 };

function reset(overrides = {}) {
  scenario.log = [];
  scenario.pushes = [];
  scenario.emails = [];
  scenario.getUser = async () => ({ data: { user: { id: 'cliente-1' } }, error: null });
  scenario.rpc = {
    emails_for: ({ ids }) => ({ data: ids.map((id) => ({ id, email: id + '@exemplo.pt' })), error: null }),
  };
  scenario.pros = [];
  scenario.recentes = 0;
  scenario.jaNotificado = false;
  scenario.queries = {
    requests: (calls) => {
      const isCount = calls.some((c) => c.method === 'select' && c.args[1] && c.args[1].head);
      if (isCount) return { count: scenario.recentes, data: null, error: null };
      if (calls.some((c) => c.method === 'update')) return { data: scenario.jaNotificado ? [] : [{ id: 'req-1' }], error: null };
      return { data: [{ ...PEDIDO, ...(overrides.pedido || {}) }], error: null };
    },
    profiles: () => ({ data: scenario.pros, error: null }),
  };
  global.fetch = async (url, opts) => {
    scenario.emails.push(JSON.parse(opts.body));
    return { ok: true, text: async () => '' };
  };
}

function evento(body = { requestId: 'req-1' }) {
  return { httpMethod: 'POST', headers: { authorization: 'Bearer tok' }, body: JSON.stringify(body) };
}

test('sem sessão: 401 e nada é enviado', async () => {
  reset();
  const res = await handler({ httpMethod: 'POST', headers: {}, body: '{}' });
  assert.equal(res.statusCode, 401);
  assert.equal(scenario.emails.length, 0);
});

test('pedido de outro cliente: 403', async () => {
  reset({ pedido: { client_id: 'outro-cliente' } });
  const res = await handler(evento());
  assert.equal(res.statusCode, 403);
  assert.equal(scenario.emails.length, 0);
});

test('envia um email por profissional elegível, com os endereços vindos do servidor', async () => {
  reset();
  scenario.pros = [
    { id: 'p1', name: 'Ana', notify_email: true, location: 'Porto', plan: 'free' },
    { id: 'p2', name: 'Rui', notify_email: true, location: 'Faro', plan: 'free' },
  ];
  const res = await handler(evento());
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).sent, 2);
  assert.deepEqual(scenario.emails.map((e) => e.to[0]).sort(), ['p1@exemplo.pt', 'p2@exemplo.pt']);
});

test('REGRESSÃO: segunda chamada para o mesmo pedido não envia nada (email-bombing)', async () => {
  reset();
  scenario.pros = [{ id: 'p1', name: 'Ana', notify_email: true, location: 'Porto', plan: 'free' }];
  scenario.jaNotificado = true; // o UPDATE ... WHERE notified_at IS NULL não apanha nenhuma linha
  const res = await handler(evento());
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).sent, 0);
  assert.equal(scenario.emails.length, 0);
  assert.equal(scenario.pushes.length, 0);
});

test('limite por hora: 5 pedidos já notificados -> 429', async () => {
  reset();
  scenario.recentes = 5;
  scenario.pros = [{ id: 'p1', name: 'Ana', notify_email: true, location: 'Porto', plan: 'free' }];
  const res = await handler(evento());
  assert.equal(res.statusCode, 429);
  assert.equal(scenario.emails.length, 0);
});

test('só considera profissionais aprovados, não suspensos e não demo', async () => {
  reset();
  scenario.pros = [];
  await handler(evento());
  const q = scenario.log.find((l) => l.table === 'profiles');
  const filtros = q.calls.filter((c) => c.method === 'eq').map((c) => c.args.join('='));
  assert.ok(filtros.includes('approved=true'));
  assert.ok(filtros.includes('suspended=false'));
  assert.ok(filtros.includes('is_demo=false'));
});

test('mais de 15 candidatos: escolhe primeiro a mesma zona e os planos pagos', async () => {
  reset();
  const outros = Array.from({ length: 20 }, (_, i) => ({ id: 'far-' + i, name: 'X' + i, notify_email: true, location: 'Faro', plan: 'free' }));
  scenario.pros = [
    ...outros,
    { id: 'mesma-zona', name: 'A', notify_email: true, location: 'Porto – Matosinhos', plan: 'free' },
    { id: 'pago', name: 'B', notify_email: true, location: 'Faro', plan: 'pro' },
  ];
  await handler(evento());
  const destinos = scenario.emails.map((e) => e.to[0]);
  assert.equal(destinos.length, 15);
  assert.ok(destinos.includes('mesma-zona@exemplo.pt'), 'a mesma zona tem de entrar');
  assert.ok(destinos.includes('pago@exemplo.pt'), 'um plano pago tem de entrar');
});

test('respeita notify_email=false', async () => {
  reset();
  scenario.pros = [{ id: 'p1', name: 'Ana', notify_email: false, location: 'Porto', plan: 'free' }];
  const res = await handler(evento());
  assert.equal(JSON.parse(res.body).sent, 0);
  assert.equal(scenario.emails.length, 0);
});

test('o título do pedido é escapado no HTML do email', async () => {
  reset({ pedido: { title: '<img src=x onerror=alert(1)>' } });
  scenario.pros = [{ id: 'p1', name: 'Ana', notify_email: true, location: 'Porto', plan: 'free' }];
  await handler(evento());
  assert.ok(!scenario.emails[0].html.includes('<img src=x'));
  assert.ok(scenario.emails[0].html.includes('&lt;img'));
});
