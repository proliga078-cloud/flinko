// Avisos automaticos para o administrador do Flinko.
//
// Corre uma vez por dia (o horario esta em `config.schedule`, em UTC) e manda
// UMA notificacao push aos administradores com o que precisa de atencao:
// pedidos RGPD a aproximar-se do prazo, verificacoes por tratar, pedidos de
// clientes sem proposta ha mais de 24 h, notificacoes que falharam e
// subscricoes a expirar. Se nao houver nada, nao envia nada (sem spam).
//
// So corre no deploy de producao (o Netlify nao executa funcoes agendadas em
// deploy previews). Usa o mesmo canal de push que o daily-digest.
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

export const config = { schedule: '0 8 * * *' }

const DIA = 864e5

// Funcao pura (testavel): recebe os dados e devolve as linhas do resumo.
export function resumo({ gdpr = [], verif = [], pedidos = [], propostas = [], falhadas = 0, expiram = [] }, agora = Date.now()) {
  const linhas = []
  const atrasoRgpd = gdpr.filter(g => agora - new Date(g.created_at).getTime() > 20 * DIA).length
  if (gdpr.length) linhas.push(`${gdpr.length} pedido(s) RGPD em aberto${atrasoRgpd ? ` (${atrasoRgpd} perto do prazo de 30 dias)` : ''}`)
  if (verif.length) linhas.push(`${verif.length} verificação(ões) por tratar`)
  const comProposta = new Set(propostas.map(p => p.request_id))
  const semProposta = pedidos.filter(r => !comProposta.has(r.id) && agora - new Date(r.created_at).getTime() > DIA).length
  if (semProposta) linhas.push(`${semProposta} pedido(s) de clientes sem proposta há mais de 24 h`)
  if (falhadas) linhas.push(`${falhadas} notificação(ões) falharam`)
  if (expiram.length) linhas.push(`${expiram.length} plano(s) a expirar em 3 dias`)
  return linhas
}

async function todas(consulta) {
  const out = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await consulta(de, de + 999)
    if (error) throw new Error(error.message)
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return out
}

export default async () => {
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const { sendPush } = require('./_push.js')
    const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    const agora = Date.now()
    const [gdpr, verif, pedidos, falhadasRows, expiram, admins] = await Promise.all([
      todas((a, b) => db.from('gdpr_requests').select('id,created_at').in('status', ['pending', 'in_progress']).order('id').range(a, b)),
      todas((a, b) => db.from('verification_requests').select('id').eq('status', 'pending').order('id').range(a, b)),
      todas((a, b) => db.from('requests').select('id,created_at').eq('status', 'open').order('id').range(a, b)),
      todas((a, b) => db.from('notification_queue').select('id').eq('status', 'failed').order('id').range(a, b)),
      todas((a, b) => db.from('profiles').select('id').neq('plan', 'free').eq('is_demo', false).eq('is_admin', false)
        .gt('plan_expires_at', new Date(agora).toISOString()).lt('plan_expires_at', new Date(agora + 3 * DIA).toISOString()).order('id').range(a, b)),
      todas((a, b) => db.from('profiles').select('id').eq('is_admin', true).order('id').range(a, b))
    ])
    let propostas = []
    if (pedidos.length) propostas = await todas((a, b) => db.from('request_offers').select('request_id').in('request_id', pedidos.map(p => p.id)).order('id').range(a, b))
    const linhas = resumo({ gdpr, verif, pedidos, propostas, falhadas: falhadasRows.length, expiram }, agora)
    if (!linhas.length) return new Response(JSON.stringify({ sent: 0, motivo: 'nada a avisar' }), { status: 200 })
    let sent = 0
    for (const a of admins) {
      const r = await sendPush(a.id, { title: 'Flinko · Avisos', body: linhas.join(' · '), url: '/admin', tag: 'admin-alerts' })
      if (r && r.sent) sent += r.sent
    }
    return new Response(JSON.stringify({ sent, linhas }), { status: 200 })
  } catch (err) {
    console.error('admin-alerts error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
}
