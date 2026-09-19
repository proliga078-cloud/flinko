// Testa netlify/functions/weather-alert.js.
//
// Bug encontrado em auditoria: a versão anterior fazia um pedido HTTP ao
// Open-Meteo por PROFISSIONAL, dentro de um for..await sequencial — mas
// PT_PLACES só tem ~28 zonas fixas, por isso vários profissionais quase
// sempre partilham a mesma zona (ex: todos os jardineiros do Porto), o que
// significava o MESMO pedido repetido uma vez por profissional. O teste
// principal abaixo ("agrupa por zona...") é o que prova a correção: dois
// profissionais na mesma zona só devem gerar UM pedido ao Open-Meteo.
const test = require('node:test');
const assert = require('node:assert/strict');
const { stubModule } = require('./helpers/stub-require');

const scenario = {};

process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';

// Fake cliente Supabase com um query-builder encadeável (select/eq/in/gte/lte)
// que só resolve quando é "await"ado (é um thenable) — mais flexível que
// makeFakeSupabaseAdmin de helpers/fakes.js, que só cobre select().eq().maybeSingle().
// Regista todas as chamadas da cadeia para os testes poderem inspecionar
// com que filtros (ex: que IDs) cada tabela foi consultada.
function makeFakeSupabaseAdminQueryable() {
  return function createClient() {
    return {
      from(table) {
        const calls = [];
        const builder = {};
        ['select', 'eq', 'in', 'gte', 'lte', 'order', 'range'].forEach((method) => {
          builder[method] = (...args) => { calls.push({ method, args }); return builder; };
        });
        builder.then = (resolve, reject) => {
          const handler = scenario.queries && scenario.queries[table];
          const result = handler ? handler(calls) : { data: [], error: null };
          return Promise.resolve(result).then(resolve, reject);
        };
        return builder;
      },
    };
  };
}

const HANDLER_PATH = require.resolve('../../netlify/functions/weather-alert.js');
stubModule('@supabase/supabase-js', { createClient: makeFakeSupabaseAdminQueryable() }, HANDLER_PATH);
stubModule('./_push', {
  sendPush: async (profileId, payload) => {
    scenario.pushCalls.push({ profileId, payload });
    return { sent: 1 };
  },
}, HANDLER_PATH);

const { handler } = require(HANDLER_PATH);

function resetScenario() {
  scenario.queries = {};
  scenario.pushCalls = [];
  scenario.fetchCalls = [];
}

function weatherResponse(precipitationByOffset) {
  // precipitationByOffset[0] = probabilidade para o dia-alvo (hoje+2 dias).
  const time = [];
  const precipitation_probability_max = [];
  const base = new Date(Date.now() + 2 * 86400000);
  precipitationByOffset.forEach((p, i) => {
    const d = new Date(base.getTime() + i * 86400000);
    time.push(d.toISOString().slice(0, 10));
    precipitation_probability_max.push(p);
  });
  return { ok: true, json: async () => ({ daily: { time, precipitation_probability_max } }) };
}

function installFetch(rainByPlaceIndex) {
  // rainByPlaceIndex: função (url) => resposta fetch fake.
  global.fetch = async (url) => {
    scenario.fetchCalls.push(url);
    return rainByPlaceIndex(url);
  };
}

test.afterEach(() => { delete global.fetch; });

test('sem profissionais de categorias outdoor: não consulta jobs, Open-Meteo nem envia push', async () => {
  resetScenario();
  scenario.queries.profiles = () => ({ data: [], error: null });
  installFetch(() => { throw new Error('não devia ser chamado'); });

  const res = await handler();
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { checked: 0, alerted: 0 });
  assert.equal(scenario.fetchCalls.length, 0);
  assert.equal(scenario.pushCalls.length, 0);
});

test('nenhum profissional tem localização reconhecida: não chama jobs nem Open-Meteo', async () => {
  resetScenario();
  scenario.queries.profiles = () => ({ data: [{ id: 'p1', location: 'Marte' }], error: null });
  scenario.queries.jobs = () => { throw new Error('não devia consultar jobs sem zona reconhecida'); };
  installFetch(() => { throw new Error('não devia ser chamado'); });

  const res = await handler();
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { checked: 1, alerted: 0 });
});

test('CORREÇÃO DO BUG: dois profissionais na mesma zona com trabalho no dia-alvo só geram UM pedido ao Open-Meteo', async () => {
  resetScenario();
  scenario.queries.profiles = () => ({
    data: [
      { id: 'p1', name: 'Jardineiro 1', category: 'Jardineiros', location: 'Porto' },
      { id: 'p2', name: 'Jardineiro 2', category: 'Jardineiros', location: 'Porto' },
    ],
    error: null,
  });
  scenario.queries.jobs = (calls) => {
    const inCall = calls.find((c) => c.method === 'in' && c.args[0] === 'professional_id');
    assert.deepEqual(new Set(inCall.args[1]), new Set(['p1', 'p2']), 'a consulta de jobs deve ser uma só, para todos os profissionais relevantes, não uma por profissional');
    return {
      data: [
        { id: 'j1', title: 'Poda', professional_id: 'p1' },
        { id: 'j2', title: 'Relvado', professional_id: 'p2' },
      ],
      error: null,
    };
  };
  installFetch(() => weatherResponse([80]));

  const res = await handler();
  assert.equal(res.statusCode, 200);
  assert.equal(scenario.fetchCalls.length, 1, 'dois profissionais na MESMA zona devem gerar só UM pedido ao Open-Meteo, não dois');
  assert.equal(scenario.pushCalls.length, 2, 'ambos os profissionais dessa zona devem ser avisados');
  assert.deepEqual(JSON.parse(res.body), { checked: 2, alerted: 2 });
});

test('profissionais em zonas diferentes: um pedido ao Open-Meteo por zona distinta', async () => {
  resetScenario();
  scenario.queries.profiles = () => ({
    data: [
      { id: 'p1', category: 'Jardineiros', location: 'Porto' },
      { id: 'p2', category: 'Pintores', location: 'Lisboa' },
    ],
    error: null,
  });
  scenario.queries.jobs = () => ({
    data: [
      { id: 'j1', professional_id: 'p1' },
      { id: 'j2', professional_id: 'p2' },
    ],
    error: null,
  });
  installFetch(() => weatherResponse([20])); // abaixo do limiar, não gera push

  const res = await handler();
  assert.equal(scenario.fetchCalls.length, 2, 'duas zonas distintas devem gerar dois pedidos, um por zona');
  assert.equal(scenario.pushCalls.length, 0, '20% está abaixo do limiar de 60%, não deve avisar ninguém');
});

test('zona sem ninguém com trabalho no dia-alvo: não gasta pedido ao Open-Meteo nessa zona', async () => {
  resetScenario();
  scenario.queries.profiles = () => ({
    data: [
      { id: 'p1', category: 'Jardineiros', location: 'Porto' },
      { id: 'p2', category: 'Pintores', location: 'Lisboa' },
    ],
    error: null,
  });
  // só p1 (Porto) tem trabalho no dia-alvo
  scenario.queries.jobs = () => ({ data: [{ id: 'j1', professional_id: 'p1' }], error: null });
  installFetch(() => weatherResponse([80]));

  const res = await handler();
  assert.equal(scenario.fetchCalls.length, 1, 'Lisboa não tem ninguém com trabalho nesse dia — não deve gastar um pedido');
  assert.equal(scenario.pushCalls.length, 1);
  assert.equal(scenario.pushCalls[0].profileId, 'p1');
});

test('probabilidade de chuva abaixo do limiar (60%): não avisa ninguém', async () => {
  resetScenario();
  scenario.queries.profiles = () => ({ data: [{ id: 'p1', category: 'Jardineiros', location: 'Porto' }], error: null });
  scenario.queries.jobs = () => ({ data: [{ id: 'j1', professional_id: 'p1' }], error: null });
  installFetch(() => weatherResponse([59]));

  await handler();
  assert.equal(scenario.pushCalls.length, 0);
});

test('probabilidade de chuva igual ao limiar (60%): avisa, com a mensagem certa', async () => {
  resetScenario();
  scenario.queries.profiles = () => ({ data: [{ id: 'p1', category: 'Jardineiros', location: 'Porto' }], error: null });
  scenario.queries.jobs = () => ({ data: [{ id: 'j1', professional_id: 'p1' }, { id: 'j2', professional_id: 'p1' }], error: null });
  installFetch(() => weatherResponse([60]));

  const res = await handler();
  assert.equal(scenario.pushCalls.length, 1);
  const { payload } = scenario.pushCalls[0];
  assert.match(payload.body, /60% de chuva em Porto/);
  assert.match(payload.body, /2 trabalhos agendados/);
  assert.equal(payload.url, '/dashboard.html');
  assert.deepEqual(JSON.parse(res.body), { checked: 1, alerted: 1 });
});

test('erro/timeout do Open-Meteo numa zona não impede as outras zonas de serem avisadas', async () => {
  resetScenario();
  scenario.queries.profiles = () => ({
    data: [
      { id: 'p1', category: 'Jardineiros', location: 'Porto' },
      { id: 'p2', category: 'Pintores', location: 'Lisboa' },
    ],
    error: null,
  });
  scenario.queries.jobs = () => ({
    data: [{ id: 'j1', professional_id: 'p1' }, { id: 'j2', professional_id: 'p2' }],
    error: null,
  });
  let call = 0;
  global.fetch = async (url) => {
    scenario.fetchCalls.push(url);
    call++;
    if (call === 1) throw new Error('Open-Meteo indisponível');
    return weatherResponse([80]);
  };

  const res = await handler();
  assert.equal(res.statusCode, 200, 'uma falha numa zona não deve rebentar a function toda');
  assert.equal(scenario.pushCalls.length, 1, 'a zona que falhou não avisa ninguém, mas a outra continua normalmente');
});

test('resposta ok:false do Open-Meteo é tratada como sem dado (não avisa, não rebenta)', async () => {
  resetScenario();
  scenario.queries.profiles = () => ({ data: [{ id: 'p1', category: 'Jardineiros', location: 'Porto' }], error: null });
  scenario.queries.jobs = () => ({ data: [{ id: 'j1', professional_id: 'p1' }], error: null });
  global.fetch = async () => { scenario.fetchCalls.push(1); return { ok: false }; };

  const res = await handler();
  assert.equal(res.statusCode, 200);
  assert.equal(scenario.pushCalls.length, 0);
});
