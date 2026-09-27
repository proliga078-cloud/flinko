// Testa netlify/functions/profile-reminders.js — lembretes a profissionais com
// o perfil por completar (dia 1, 3 e 7 depois de criar conta).
const test = require('node:test');
const assert = require('node:assert/strict');
const { stubModule } = require('./helpers/stub-require');
const { makeQueryableSupabase } = require('./helpers/queryable');

const scenario = {};
process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';

const HANDLER_PATH = require.resolve('../../netlify/functions/profile-reminders.js');
stubModule('@supabase/supabase-js', { createClient: makeQueryableSupabase(scenario) }, HANDLER_PATH);
stubModule('./_push', { sendPush: async (id, payload) => { scenario.pushes.push({ id, payload }); return { sent: 1 }; } }, HANDLER_PATH);
const { handler, aLembrar, falta, emailHtml } = require(HANDLER_PATH);

const DIA = 864e5;
const agora = Date.UTC(2026, 8, 27, 9, 0, 0);
const criado = (dias) => new Date(agora - dias * DIA).toISOString();
const pro = (id, dias, extra) => ({ id, name: 'Rui Alves', category: null, location: null, photo_url: null, bio: null, created_at: criado(dias), account_type: 'professional', notify_email: true, ...extra });
const completo = { category: 'Eletricistas', location: 'Braga', photo_url: 'x', bio: 'Olá, sou eletricista.' };

test('falta: diz exatamente o que falta', () => {
  assert.deepEqual(falta(pro('a', 1), 0), ['área e zona', 'foto', 'descrição', 'primeiro serviço']);
  assert.deepEqual(falta(pro('a', 1, completo), 2), []);
  assert.deepEqual(falta(pro('a', 1, { ...completo, photo_url: null }), 1), ['foto']);
});

test('aLembrar: só nos dias 1, 3 e 7, e só a quem tem algo por fazer e não desligou os emails', () => {
  const perfis = [
    pro('d0', 0), pro('d1', 1), pro('d2', 2), pro('d3', 3), pro('d7', 7), pro('d8', 8),
    pro('completo', 1, completo),
    pro('sem-emails', 3, { notify_email: false }),
    pro('cliente', 1, { account_type: 'client' }),
    pro('demo', 1, { is_demo: true }),
  ];
  const r = aLembrar(perfis, { completo: 1 }, agora);
  assert.deepEqual(r.map((x) => [x.id, x.dia]), [['d1', 1], ['d3', 3], ['d7', 7]]);
});

test('email: escapa o nome e liga ao guia do dashboard', () => {
  const html = emailHtml({ name: '<b>Rui</b> Alves', dia: 1, falta: ['área e zona', 'foto'] });
  assert.doesNotMatch(html, /<b>Rui<\/b>/);
  assert.match(html, /&lt;b&gt;Rui&lt;\/b&gt;/);
  assert.match(html, /dashboard\?completar=1/);
  assert.match(html, /não aparece em nenhuma pesquisa/);
});

test('handler: envia email e push a quem está no dia certo', async () => {
  const realNow = Date.now;
  Date.now = () => agora;
  const sent = [];
  const realFetch = global.fetch;
  global.fetch = async (url, opts) => { sent.push({ url, body: JSON.parse(opts.body) }); return { ok: true, text: async () => '' }; };
  process.env.RESEND_API_KEY = 're_test';
  try {
    scenario.pushes = [];
    scenario.queries = {
      profiles: () => ({ data: [pro('p1', 1), pro('p2', 2), pro('p3', 3, completo)], error: null }),
      services: () => ({ data: [{ professional_id: 'p3' }], error: null }),
    };
    scenario.rpc = { emails_for: () => ({ data: [{ id: 'p1', email: 'rui@exemplo.pt' }], error: null }) };
    const res = await handler();
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), { enviados: 1, candidatos: 1 });
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].body.to, ['rui@exemplo.pt']);
    assert.equal(scenario.pushes[0].id, 'p1');
    assert.equal(scenario.pushes[0].payload.url, '/dashboard?completar=1');
  } finally {
    Date.now = realNow; global.fetch = realFetch; delete process.env.RESEND_API_KEY;
  }
});
