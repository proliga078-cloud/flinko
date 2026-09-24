// Testa a lógica pura do relatório semanal enviado por email aos donos.
const test = require('node:test');
const assert = require('node:assert');

const AGORA = Date.parse('2026-09-28T07:00:00Z'); // segunda-feira
const dias = (n) => new Date(AGORA - n * 864e5).toISOString();

test('relatorio: compara a última semana com a anterior e ignora admins e demo', async () => {
  const { relatorio } = await import('../../netlify/functions/admin-weekly-report.mjs');
  const r = relatorio({
    perfis: [
      { id: 'a', account_type: 'professional', created_at: dias(2), verified: true },
      { id: 'b', account_type: 'professional', created_at: dias(3) },
      { id: 'c', account_type: 'professional', created_at: dias(10) },
      { id: 'd', account_type: 'client', created_at: dias(1) },
      { id: 'adm', account_type: 'professional', created_at: dias(1), is_admin: true },
      { id: 'demo', account_type: 'professional', created_at: dias(1), is_demo: true },
    ],
    visitas: [{ visitor_id: 'v1', created_at: dias(1) }, { visitor_id: 'v1', created_at: dias(2) }, { visitor_id: 'v2', created_at: dias(9) }, { visitor_id: 'vadm', user_id: 'adm', created_at: dias(1) }],
  }, AGORA);
  const n = Object.fromEntries(r.numeros.map((x) => [x.rotulo, [x.atual, x.antes]]));
  assert.deepStrictEqual(n['Profissionais novos'], [2, 1]);
  assert.deepStrictEqual(n['Clientes novos'], [1, 0]);
  assert.deepStrictEqual(n['Visitantes únicos'], [1, 1]);
  assert.match(r.totais, /^3 profissionais \(1 verificados\) · 1 clientes$/);
  assert.match(r.assunto, /resumo da semana/);
});

test('relatorio: lista o que ficou por tratar', async () => {
  const { relatorio, html } = await import('../../netlify/functions/admin-weekly-report.mjs');
  const r = relatorio({
    rgpd: [{ status: 'pending', created_at: dias(25) }],
    verif: [{ status: 'pending' }, { status: 'pending' }],
    apoio: [{ status: 'aberto' }, { status: 'resolvido' }],
    pedidos: [{ status: 'open', created_at: dias(3), tem_proposta: false }, { status: 'open', created_at: dias(3), tem_proposta: true }],
    acoes: 4,
  }, AGORA);
  assert.strictEqual(r.pendentes.length, 4);
  assert.match(r.pendentes[0], /1 pedido\(s\) RGPD.*há 25 dias/);
  assert.match(r.pendentes[1], /^2 pedido\(s\) de verificação/);
  assert.match(r.pendentes[2], /^1 pedido\(s\) de apoio/);
  assert.match(r.pendentes[3], /^1 pedido\(s\) de clientes sem nenhuma proposta/);
  assert.match(html(r), /4 ação\(ões\) de administração/);
});

test('relatorio: sem nada pendente diz isso no email', async () => {
  const { relatorio, html } = await import('../../netlify/functions/admin-weekly-report.mjs');
  assert.match(html(relatorio({}, AGORA)), /Nada pendente/);
});
