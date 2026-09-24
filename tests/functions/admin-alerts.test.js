// Testa a logica pura do resumo diario de avisos do administrador.
const test = require('node:test')
const assert = require('node:assert')

test('resumo: sem nada a avisar devolve lista vazia', async () => {
  const { resumo } = await import('../../netlify/functions/admin-alerts.mjs')
  assert.deepStrictEqual(resumo({}), [])
})

test('resumo: junta os avisos relevantes', async () => {
  const { resumo } = await import('../../netlify/functions/admin-alerts.mjs')
  const agora = Date.parse('2026-09-23T08:00:00Z')
  const dias = n => new Date(agora - n * 864e5).toISOString()
  const linhas = resumo({
    gdpr: [{ created_at: dias(25) }, { created_at: dias(2) }],
    verif: [{ id: 1 }],
    pedidos: [{ id: 'a', created_at: dias(3) }, { id: 'b', created_at: dias(3) }, { id: 'c', created_at: dias(0.2) }],
    propostas: [{ request_id: 'b' }],
    falhadas: 2,
    expiram: [{ id: 'x' }]
  }, agora)
  assert.strictEqual(linhas.length, 5)
  assert.match(linhas[0], /2 pedido\(s\) RGPD.*1 perto do prazo/)
  assert.match(linhas[2], /^1 pedido\(s\) de clientes sem proposta/)
})

test('resumo: pedidos de apoio e denúncias com mais de 48 h entram no aviso', async () => {
  const { resumo } = await import('../../netlify/functions/admin-alerts.mjs')
  const agora = Date.parse('2026-09-23T08:00:00Z')
  const dias = n => new Date(agora - n * 864e5).toISOString()
  const linhas = resumo({ apoio: [{ status: 'aberto', created_at: dias(3) }, { status: 'curso', created_at: dias(5) }, { status: 'aberto', created_at: dias(1) }] }, agora)
  assert.deepStrictEqual(linhas, ['2 pedido(s) de apoio ou denúncia(s) há mais de 48 h'])
})
