// Testa netlify/functions/review-request.js — pedido de avaliação de um trabalho pago.
const test = require('node:test');
const assert = require('node:assert/strict');
const { stubModule } = require('./helpers/stub-require');
const { makeQueryableSupabase } = require('./helpers/queryable');

const scenario = {};
process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';
const HANDLER_PATH = require.resolve('../../netlify/functions/review-request.js');
stubModule('@supabase/supabase-js', { createClient: makeQueryableSupabase(scenario) }, HANDLER_PATH);
stubModule('./_push', { sendPush: async (id, payload) => { scenario.pushes.push({ id, payload }); return { sent: 1 }; } }, HANDLER_PATH);
const { handler, emailHtml } = require(HANDLER_PATH);

const ev = (body, token = 'tok') => ({ httpMethod: 'POST', headers: { authorization: 'Bearer ' + token }, body: JSON.stringify(body) });
function reset({ uid = 'pro-1', job = { id: 'job-1', professional_id: 'pro-1', client_id: 'cli-1', conversation_id: 'conv-1', title: 'Quadro elétrico', status: 'pago' }, existing = null } = {}) {
  scenario.pushes = []; scenario.log = []; scenario.inserts = [];
  scenario.getUser = () => ({ data: { user: { id: uid } }, error: null });
  scenario.queries = {
    jobs: () => ({ data: job ? [job] : [], error: null }),
    review_invites: (calls) => {
      const ins = calls.find((c) => c.method === 'insert');
      if (ins) { scenario.inserts.push({ table: 'review_invites', row: ins.args[0] }); return { data: [{ token: 'tok123', used_at: null }], error: null }; }
      return { data: existing ? [existing] : [], error: null };
    },
    profiles: (calls) => ({ data: [calls.some((c) => c.method === 'eq' && c.args[1] === 'cli-1') ? { name: 'Ana Silva', notify_email: true } : { name: 'Rui Alves' }], error: null }),
    messages: (calls) => { const ins = calls.find((c) => c.method === 'insert'); if (ins) scenario.inserts.push({ table: 'messages', row: ins.args[0] }); return { data: null, error: null }; },
  };
  scenario.rpc = { emails_for: () => ({ data: [{ id: 'cli-1', email: 'ana@exemplo.pt' }], error: null }) };
}

test('trabalho pago: cria o link, envia email com estrelas, push e mensagem no chat', async () => {
  reset();
  const sent = []; const realFetch = global.fetch;
  global.fetch = async (url, o) => { sent.push(JSON.parse(o.body)); return { ok: true, text: async () => '' }; };
  process.env.RESEND_API_KEY = 're_x';
  try {
    const res = await handler(ev({ jobId: 'job-1' }));
    const body = JSON.parse(res.body);
    assert.equal(res.statusCode, 200);
    assert.equal(body.link, 'https://flinko.pt/avaliar.html?t=tok123');
    assert.equal(body.sent, true);
    assert.deepEqual(scenario.inserts[0].row, { professional_id: 'pro-1', client_id: 'cli-1', job_id: 'job-1', source: 'trabalho' });
    assert.match(scenario.inserts[1].row.content, /avaliar\.html\?t=tok123/);
    assert.equal(scenario.pushes[0].id, 'cli-1');
    assert.equal(sent[0].to[0], 'ana@exemplo.pt');
    for (let n = 1; n <= 5; n++) assert.match(sent[0].html, new RegExp('t=tok123&amp;s=' + n));
  } finally { global.fetch = realFetch; delete process.env.RESEND_API_KEY; }
});

test('link já existente: devolve o mesmo e não volta a enviar', async () => {
  reset({ existing: { token: 'velho', used_at: null } });
  const res = await handler(ev({ jobId: 'job-1' }));
  assert.deepEqual(JSON.parse(res.body), { link: 'https://flinko.pt/avaliar.html?t=velho', sent: false });
  assert.equal(scenario.pushes.length, 0);
});

test('trabalho de outro profissional ou ainda não concluído: recusa', async () => {
  reset({ uid: 'intruso' });
  assert.equal((await handler(ev({ jobId: 'job-1' }))).statusCode, 403);
  reset({ job: { id: 'job-1', professional_id: 'pro-1', status: 'agendado' } });
  assert.equal((await handler(ev({ jobId: 'job-1' }))).statusCode, 400);
});

test('email escapa o título e o nome', () => {
  const html = emailHtml({ nomeCliente: 'Ana', nomePro: '<b>Rui</b>', titulo: '<script>x</script>', link: 'https://flinko.pt/avaliar.html?t=a' });
  assert.doesNotMatch(html, /<script>x/); assert.doesNotMatch(html, /<b>Rui<\/b>/);
});
