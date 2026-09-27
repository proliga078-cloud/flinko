// Testa netlify/functions/notify-offer.js — aviso ao cliente de uma proposta nova.
const test = require('node:test');
const assert = require('node:assert/strict');
const { stubModule } = require('./helpers/stub-require');
const { makeQueryableSupabase } = require('./helpers/queryable');

const scenario = {};
process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';
const HANDLER_PATH = require.resolve('../../netlify/functions/notify-offer.js');
stubModule('@supabase/supabase-js', { createClient: makeQueryableSupabase(scenario) }, HANDLER_PATH);
stubModule('./_push', { sendPush: async (id, payload) => { scenario.pushes.push({ id, payload }); return { sent: 1 }; } }, HANDLER_PATH);
const { handler } = require(HANDLER_PATH);

const ev = (body, token = 'tok') => ({ httpMethod: 'POST', headers: { authorization: 'Bearer ' + token }, body: JSON.stringify(body) });

function reset({ uid = 'pro-1', offer = { id: 'of-1', request_id: 'req-1', professional_id: 'pro-1', price_from: 80, price_to: 120, message: 'Posso ir amanhã' }, claimed = true } = {}) {
  scenario.pushes = []; scenario.log = [];
  scenario.getUser = (t) => (t === 'tok' ? { data: { user: { id: uid } }, error: null } : { data: null, error: { message: 'x' } });
  scenario.queries = {
    request_offers: (calls) => (calls.some((c) => c.method === 'update') ? { data: claimed ? [{ id: 'of-1' }] : [], error: null } : { data: offer ? [offer] : [], error: null }),
    requests: () => ({ data: [{ id: 'req-1', client_id: 'cli-1', title: 'Trocar quadro <elétrico>' }], error: null }),
    profiles: (calls) => (calls.some((c) => c.method === 'eq' && c.args[1] === 'cli-1') ? { data: [{ name: 'Ana Silva', notify_email: true }], error: null } : { data: [{ name: 'Rui Alves', category: 'Eletricistas' }], error: null }),
  };
  scenario.rpc = { emails_for: () => ({ data: [{ id: 'cli-1', email: 'ana@exemplo.pt' }], error: null }) };
}

test('proposta nova: avisa o cliente por push e email, com escape e link para comparar', async () => {
  reset();
  const sent = []; const realFetch = global.fetch;
  global.fetch = async (url, o) => { sent.push(JSON.parse(o.body)); return { ok: true, text: async () => '' }; };
  process.env.RESEND_API_KEY = 're_x';
  try {
    const res = await handler(ev({ offerId: 'of-1' }));
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), { sent: true, push: true });
    assert.equal(scenario.pushes[0].id, 'cli-1');
    assert.equal(sent[0].to[0], 'ana@exemplo.pt');
    assert.match(sent[0].html, /pedido\.html\?id=req-1/);
    assert.match(sent[0].html, /Trocar quadro &lt;elétrico&gt;/);
    assert.match(sent[0].html, /80 € a 120 €|80\s€ a 120\s€/);
  } finally { global.fetch = realFetch; delete process.env.RESEND_API_KEY; }
});

test('sem sessão, proposta de outra pessoa ou já avisada: não avisa', async () => {
  reset();
  assert.equal((await handler(ev({ offerId: 'of-1' }, 'mau'))).statusCode, 401);
  reset({ uid: 'intruso' });
  assert.equal((await handler(ev({ offerId: 'of-1' }))).statusCode, 403);
  reset({ claimed: false });
  const r = await handler(ev({ offerId: 'of-1' }));
  assert.equal(JSON.parse(r.body).reason, 'ja avisado');
  assert.equal(scenario.pushes.length, 0);
});
