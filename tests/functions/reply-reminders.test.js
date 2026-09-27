// Testa netlify/functions/reply-reminders.js — lembrete ao profissional de
// mensagens de clientes por responder.
//
// O que estes testes protegem:
//  - de noite (22h–8h em Portugal) não envia nada;
//  - um só lembrete por mensagem (se já foi reclamada, não repete);
//  - email só a quem não desligou os emails; push sempre; suspensos nunca.
const test = require('node:test');
const assert = require('node:assert/strict');
const { stubModule } = require('./helpers/stub-require');
const { makeQueryableSupabase } = require('./helpers/queryable');

process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';
process.env.RESEND_API_KEY = 're_fake';

const scenario = {};
const FN_PATH = require.resolve('../../netlify/functions/reply-reminders.js');
stubModule('@supabase/supabase-js', { createClient: makeQueryableSupabase(scenario) }, FN_PATH);
stubModule('./_push', { sendPush: async (id, payload) => { scenario.pushes.push({ id, payload }); return { sent: 1 }; } }, FN_PATH);
const { handler, run, horaLisboa, horaDeSilencio, haQuanto, trecho } = require(FN_PATH);

// meio-dia (UTC) de um dia fixo: os testes não dependem da hora a que correm
const agora = Date.UTC(2026, 6, 1, 12, 0, 0);
const PENDENTES = [
  { message_id: 'm1', conversation_id: 'c1', professional_id: 'rui', client_id: 'ana', content: 'Olá! Pode vir amanhã?', created_at: new Date(agora - 3 * 36e5).toISOString() },
  { message_id: 'm2', conversation_id: 'c2', professional_id: 'marta', client_id: 'ana', content: '', created_at: new Date(agora - 5 * 36e5).toISOString() },
  { message_id: 'm3', conversation_id: 'c3', professional_id: 'susp', client_id: 'ana', content: 'x', created_at: new Date(agora - 4 * 36e5).toISOString() },
  { message_id: 'm4', conversation_id: 'c4', professional_id: 'rui', client_id: 'ana', content: 'já lembrada', created_at: new Date(agora - 4 * 36e5).toISOString() },
];

function reset() {
  Object.keys(scenario).forEach((k) => delete scenario[k]);
  scenario.pushes = [];
  scenario.claimed = [];
  scenario.rpc = {
    mensagens_por_responder: (args) => { scenario.rpcArgs = args; return { data: PENDENTES, error: null }; },
    emails_for: ({ ids }) => ({ data: ids.map((id) => ({ id, email: id + '@x.pt' })), error: null }),
  };
  scenario.queries = {
    profiles: () => ({ data: [{ id: 'rui', name: 'Rui Alves' }, { id: 'marta', name: 'Marta Sousa', notify_email: false }, { id: 'susp', name: 'S', suspended: true }, { id: 'ana', name: 'Ana Silva' }], error: null }),
    lembretes_resposta: (calls) => {
      const id = calls.find((c) => c.method === 'insert').args[0].message_id;
      if (id === 'm4') return { data: null, error: { message: 'duplicate key' } };
      scenario.claimed.push(id);
      return { data: null, error: null };
    },
  };
}

test('horas: Lisboa com hora de verão e silêncio das 22h às 8h', () => {
  assert.equal(horaLisboa(new Date('2026-07-01T12:30:00Z')), 13);
  assert.equal(horaLisboa(new Date('2026-12-01T12:30:00Z')), 12);
  assert.equal(horaDeSilencio(new Date('2026-07-01T21:10:00Z')), true);  // 22h10
  assert.equal(horaDeSilencio(new Date('2026-07-01T06:59:00Z')), true);  // 7h59
  assert.equal(horaDeSilencio(new Date('2026-07-01T07:00:00Z')), false); // 8h00
  assert.equal(haQuanto(new Date(agora - 3.5 * 36e5).toISOString(), new Date(agora)), 'há 3 horas');
  assert.equal(trecho(''), '📷 Enviou fotos');
  assert.equal(trecho('a'.repeat(200)).length, 158);
});

test('envia um lembrete por mensagem: push a todos, email só a quem quer, nunca a suspensos nem repetidos', async () => {
  reset();
  const emails = [];
  global.fetch = async (url, opts) => { emails.push(JSON.parse(opts.body)); return { ok: true }; };
  const res = await run(new Date(agora));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { sent: 2 });
  assert.deepEqual(scenario.rpcArgs, { p_desde: '2 hours', p_ate: '24 hours' });
  assert.deepEqual(scenario.claimed, ['m1', 'm2']);
  assert.deepEqual(scenario.pushes.map((p) => [p.id, p.payload.title, p.payload.url]), [
    ['rui', 'Ana está à espera da tua resposta', '/messages.html?c=c1'],
    ['marta', 'Ana está à espera da tua resposta', '/messages.html?c=c2'],
  ]);
  assert.equal(emails.length, 1); // a Marta desligou os emails
  assert.deepEqual(emails[0].to, ['rui@x.pt']);
  assert.match(emails[0].html, /Olá Rui, Ana escreveu-te há 3 horas/);
  assert.match(emails[0].html, /Pode vir amanhã\?/);
  assert.match(emails[0].html, /messages\.html\?c=c1/);
});

test('de noite não pede nada à base de dados', async () => {
  reset();
  const res = await run(new Date('2026-07-01T23:30:00Z'));
  assert.deepEqual(JSON.parse(res.body), { skipped: 'hora de silêncio' });
  assert.equal(scenario.rpcArgs, undefined);
  assert.equal(typeof handler, 'function');
});
