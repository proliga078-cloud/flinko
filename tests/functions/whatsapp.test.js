// Testa netlify/functions/_whatsapp.js — alertas no WhatsApp via Twilio.
//
// O que estes testes protegem:
//  - sem as variáveis da Twilio (ou sem o modelo aprovado) nada é enviado;
//  - só recebe quem ligou os alertas e tem um telemóvel válido;
//  - o pedido à Twilio leva o número certo, o modelo e as variáveis.
const test = require('node:test');
const assert = require('node:assert/strict');

function carregar(env) {
  const chaves = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM', 'TWILIO_TPL_PEDIDO', 'TWILIO_TPL_MENSAGEM'];
  chaves.forEach((k) => { delete process.env[k]; });
  Object.assign(process.env, env);
  delete require.cache[require.resolve('../../netlify/functions/_whatsapp.js')];
  delete require.cache[require.resolve('../../netlify/functions/whatsapp-status.js')];
  return require('../../netlify/functions/_whatsapp.js');
}

// profile_private falso: devolve só as linhas com whatsapp_alerts, como o filtro real.
function fakeDb(rows) {
  const q = { ids: null };
  const b = {
    select() { return b; },
    in(_c, ids) { q.ids = ids; return b; },
    eq() { return Promise.resolve({ data: rows.filter((r) => q.ids.includes(r.profile_id) && r.whatsapp_alerts), error: null }); },
  };
  return { from: () => b };
}

const ENV = { TWILIO_ACCOUNT_SID: 'AC123', TWILIO_AUTH_TOKEN: 'tok', TWILIO_WHATSAPP_FROM: '+351910000000', TWILIO_TPL_PEDIDO: 'HXpedido' };

test('normalizarTelemovel: aceita telemóveis PT e internacionais, recusa fixos e lixo', () => {
  const { normalizarTelemovel: n } = carregar({});
  assert.equal(n('912 345 678'), '+351912345678');
  assert.equal(n('+351 93-123-4567'), '+351931234567');
  assert.equal(n('00351961234567'), '+351961234567');
  assert.equal(n('+33612345678'), '+33612345678');
  assert.equal(n('223456789'), null);      // fixo do Porto
  assert.equal(n('+351223456789'), null);
  assert.equal(n('abc'), null);
  assert.equal(n(''), null);
});

test('sem Twilio configurada: não envia nada e o painel não mostra a opção', async () => {
  const wa = carregar({});
  let chamadas = 0;
  global.fetch = async () => { chamadas++; return { ok: true }; };
  const r = await wa.sendWhatsApp(['p1'], 'pedido', () => ['a'], fakeDb([{ profile_id: 'p1', phone: '912345678', whatsapp_alerts: true }]));
  assert.deepEqual(r, { sent: 0, skipped: true });
  assert.equal(chamadas, 0);
  const st = await require('../../netlify/functions/whatsapp-status.js').handler();
  assert.equal(JSON.parse(st.body).enabled, false);
});

test('modelo em falta: esse tipo de alerta não sai', async () => {
  const wa = carregar(ENV);
  let chamadas = 0;
  global.fetch = async () => { chamadas++; return { ok: true }; };
  const r = await wa.sendWhatsApp(['p1'], 'mensagem', () => ['a'], fakeDb([{ profile_id: 'p1', phone: '912345678', whatsapp_alerts: true }]));
  assert.equal(r.skipped, true);
  assert.equal(chamadas, 0);
});

test('envia só a quem ligou os alertas e tem telemóvel válido, com o modelo e as variáveis', async () => {
  const wa = carregar(ENV);
  const pedidos = [];
  global.fetch = async (url, opts) => { pedidos.push({ url, opts }); return { ok: true }; };
  const rows = [
    { profile_id: 'p1', phone: '912 345 678', whatsapp_alerts: true },
    { profile_id: 'p2', phone: '912000000', whatsapp_alerts: false },   // não ligou
    { profile_id: 'p3', phone: '223456789', whatsapp_alerts: true },    // fixo
  ];
  const r = await wa.sendWhatsApp(['p1', 'p2', 'p3', 'p1'], 'pedido', () => ['Eletricistas', 'Trocar quadro', 'Braga'], fakeDb(rows));
  assert.deepEqual(r, { sent: 1 });
  assert.equal(pedidos.length, 1);
  assert.equal(pedidos[0].url, 'https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json');
  assert.equal(pedidos[0].opts.headers.Authorization, 'Basic ' + Buffer.from('AC123:tok').toString('base64'));
  const body = new URLSearchParams(pedidos[0].opts.body);
  assert.equal(body.get('From'), 'whatsapp:+351910000000');
  assert.equal(body.get('To'), 'whatsapp:+351912345678');
  assert.equal(body.get('ContentSid'), 'HXpedido');
  assert.deepEqual(JSON.parse(body.get('ContentVariables')), { 1: 'Eletricistas', 2: 'Trocar quadro', 3: 'Braga' });
  const st = await require('../../netlify/functions/whatsapp-status.js').handler();
  assert.equal(JSON.parse(st.body).enabled, true);
});

test('erro da Twilio não rebenta: conta como não enviado', async () => {
  const wa = carregar(ENV);
  global.fetch = async () => ({ ok: false, status: 400, text: async () => 'bad' });
  const origErr = console.error; console.error = () => {};
  const r = await wa.sendWhatsApp(['p1'], 'pedido', () => ['a', 'b', 'c'], fakeDb([{ profile_id: 'p1', phone: '912345678', whatsapp_alerts: true }]));
  console.error = origErr;
  assert.deepEqual(r, { sent: 0 });
});
