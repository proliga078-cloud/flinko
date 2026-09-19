// Testa netlify/functions/daily-digest.js — resumo diário por push.
//
// REGRESSÃO principal: a versão antiga fazia 3+ consultas POR profissional,
// em série, e estourava o tempo da function com centenas de utilizadores.
// O teste "número de consultas não cresce com o número de profissionais"
// prova que agora o custo é por lote, não por profissional.
const test = require('node:test');
const assert = require('node:assert/strict');
const { stubModule } = require('./helpers/stub-require');
const { makeQueryableSupabase } = require('./helpers/queryable');

const scenario = {};

process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';

const HANDLER_PATH = require.resolve('../../netlify/functions/daily-digest.js');
stubModule('@supabase/supabase-js', { createClient: makeQueryableSupabase(scenario) }, HANDLER_PATH);
stubModule('./_push', {
  sendPush: async (id, payload) => { scenario.pushes.push({ id, payload }); return { sent: 1 }; },
}, HANDLER_PATH);

const { handler } = require(HANDLER_PATH);

function reset({ pros = [], jobs = [], conversas = [], mensagens = [] } = {}) {
  scenario.log = [];
  scenario.pushes = [];
  scenario.queries = {
    profiles: () => ({ data: pros, error: null }),
    jobs: (calls) => {
      const pendente = calls.some((c) => c.method === 'eq' && c.args[0] === 'status');
      const ids = calls.find((c) => c.method === 'in').args[1];
      const linhas = jobs.filter((j) => ids.includes(j.professional_id) && (pendente ? j.status === 'orcamento_enviado' : j.hoje));
      return { data: linhas.map((j) => ({ professional_id: j.professional_id })), error: null };
    },
    conversations: (calls) => {
      const ids = calls.find((c) => c.method === 'in').args[1];
      return { data: conversas.filter((c) => ids.includes(c.professional_id)), error: null };
    },
    messages: (calls) => {
      const ids = calls.find((c) => c.method === 'in').args[1];
      return { data: mensagens.filter((m) => ids.includes(m.conversation_id)), error: null };
    },
  };
}

test('sem profissionais: não envia nada', async () => {
  reset();
  const res = await handler();
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { sent: 0, total: 0 });
});

test('só avisa quem tem algo para tratar, com o texto certo (singular/plural)', async () => {
  reset({
    pros: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }],
    jobs: [
      { professional_id: 'p1', hoje: true },
      { professional_id: 'p1', hoje: true },
      { professional_id: 'p1', status: 'orcamento_enviado' },
    ],
    conversas: [{ id: 'c1', professional_id: 'p1' }],
    mensagens: [
      { conversation_id: 'c1', sender_id: 'cliente' },
      { conversation_id: 'c1', sender_id: 'p1' }, // enviada pelo próprio: não conta
    ],
  });
  const res = await handler();
  assert.equal(JSON.parse(res.body).sent, 1);
  assert.equal(scenario.pushes.length, 1);
  assert.equal(scenario.pushes[0].id, 'p1');
  assert.equal(scenario.pushes[0].payload.body, '2 trabalhos hoje · 1 orçamento por responder · 1 mensagem por ler');
});

test('REGRESSÃO: número de consultas não cresce com o número de profissionais', async () => {
  reset({ pros: Array.from({ length: 5 }, (_, i) => ({ id: 'a' + i })) });
  await handler();
  const pequeno = scenario.log.length;

  reset({ pros: Array.from({ length: 150 }, (_, i) => ({ id: 'b' + i })) });
  await handler();
  const grande = scenario.log.length;

  assert.equal(grande, pequeno, 'com 150 profissionais (1 lote) tem de fazer as mesmas consultas que com 5');
});

test('mais de 200 profissionais: processa em lotes', async () => {
  reset({ pros: Array.from({ length: 450 }, (_, i) => ({ id: 'p' + i })) });
  await handler();
  const consultasJobs = scenario.log.filter((l) => l.table === 'jobs').length;
  assert.equal(consultasJobs, 3 * 2, '3 lotes x 2 consultas de jobs (hoje + orçamentos)');
});

test('erro da base de dados -> 500 (não engole a falha)', async () => {
  reset({ pros: [{ id: 'p1' }] });
  scenario.queries.jobs = () => ({ data: null, error: { message: 'timeout' } });
  const res = await handler();
  assert.equal(res.statusCode, 500);
});
