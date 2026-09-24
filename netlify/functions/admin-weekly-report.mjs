// Relatório semanal por email para os donos do Flinko.
//
// Corre todas as segundas-feiras (horário em `config.schedule`, em UTC) e envia
// aos administradores com papel de dono um resumo da semana anterior
// comparada com a semana antes dessa: registos, pedidos, conversas,
// avaliações, visitas, e o que ficou por tratar (RGPD, verificações, apoio).
// Complementa o admin-alerts (push diário, só quando há algo urgente).
//
// Só corre no deploy de produção (o Netlify não executa funções agendadas em
// deploy previews). Usa o Resend, como o notify-message.
export const config = { schedule: '0 7 * * 1' }

const DIA = 864e5
const SITE = 'https://flinko.pt'

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

// Função pura (testável): recebe os dados e devolve o assunto e as secções.
export function relatorio({ perfis = [], pedidos = [], conversas = [], avaliacoes = [], visitas = [], apoio = [], rgpd = [], verif = [], acoes = 0 }, agora = Date.now()) {
  const a = agora - 7 * DIA, b = agora - 14 * DIA
  const entre = (arr, de, ate, f = 'created_at') => arr.filter(x => { const t = new Date(x[f]).getTime(); return t >= de && t < ate })
  const reais = perfis.filter(p => !p.is_demo && !p.is_admin)
  const pros = reais.filter(p => p.account_type !== 'client'), clientes = reais.filter(p => p.account_type === 'client')
  const ignorar = new Set(perfis.filter(p => p.is_demo || p.is_admin).map(p => p.id))
  const vis = visitas.filter(v => !(v.user_id && ignorar.has(v.user_id)))
  const uniq = arr => new Set(arr.map(v => v.visitor_id)).size
  const linha = (rotulo, atual, antes) => {
    const d = atual - antes
    return { rotulo, atual, antes, texto: `${rotulo}: ${atual} (${d >= 0 ? '+' : ''}${d} vs semana anterior)` }
  }
  const numeros = [
    linha('Profissionais novos', entre(pros, a, agora + 1).length, entre(pros, b, a).length),
    linha('Clientes novos', entre(clientes, a, agora + 1).length, entre(clientes, b, a).length),
    linha('Pedidos de clientes', entre(pedidos, a, agora + 1).length, entre(pedidos, b, a).length),
    linha('Conversas novas', entre(conversas, a, agora + 1).length, entre(conversas, b, a).length),
    linha('Avaliações', entre(avaliacoes, a, agora + 1).length, entre(avaliacoes, b, a).length),
    linha('Visitantes únicos', uniq(entre(vis, a, agora + 1)), uniq(entre(vis, b, a)))
  ]
  const pendentes = []
  const rgpdAbertos = rgpd.filter(g => g.status === 'pending' || g.status === 'in_progress')
  if (rgpdAbertos.length) pendentes.push(`${rgpdAbertos.length} pedido(s) RGPD em aberto (o mais antigo há ${Math.max(...rgpdAbertos.map(g => Math.floor((agora - new Date(g.created_at)) / DIA)))} dias; prazo de 30)`)
  const vp = verif.filter(v => v.status === 'pending').length
  if (vp) pendentes.push(`${vp} pedido(s) de verificação por tratar`)
  const ap = apoio.filter(t => t.status !== 'resolvido')
  if (ap.length) pendentes.push(`${ap.length} pedido(s) de apoio ou denúncias por resolver`)
  const semProposta = pedidos.filter(r => r.status === 'open' && !r.tem_proposta && agora - new Date(r.created_at) > DIA).length
  if (semProposta) pendentes.push(`${semProposta} pedido(s) de clientes sem nenhuma proposta`)
  const totais = `${pros.length} profissionais (${pros.filter(p => p.verified).length} verificados) · ${clientes.length} clientes`
  const semana = `${new Date(a).toLocaleDateString('pt-PT')} a ${new Date(agora - DIA).toLocaleDateString('pt-PT')}`
  return {
    assunto: `Flinko · resumo da semana (${semana})`,
    semana, numeros, pendentes, totais, acoes
  }
}

export function html(r) {
  const li = arr => arr.map(x => `<li style="margin:0 0 6px">${esc(x)}</li>`).join('')
  return `<!DOCTYPE html><html lang="pt"><body style="margin:0;background:#FAF8F4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:28px 20px"><div style="font-size:20px;font-weight:800;color:#14181F;margin-bottom:18px">Flink<span style="color:#E8720A">o</span> · resumo semanal</div>
<div style="background:#fff;border-radius:14px;padding:24px;color:#14181F;font-size:14px;line-height:1.6">
<p style="margin:0 0 12px;color:#707580">Semana de ${esc(r.semana)} · ${esc(r.totais)}</p>
<h3 style="margin:0 0 8px;font-size:15px">Números</h3><ul style="margin:0 0 16px;padding-left:18px">${li(r.numeros.map(n => n.texto))}</ul>
<h3 style="margin:0 0 8px;font-size:15px">Por tratar</h3>${r.pendentes.length ? `<ul style="margin:0 0 16px;padding-left:18px">${li(r.pendentes)}</ul>` : '<p style="margin:0 0 16px">Nada pendente. 🎉</p>'}
<p style="margin:0 0 16px;color:#707580">${r.acoes} ação(ões) de administração registadas esta semana.</p>
<a href="${SITE}/admin" style="display:inline-block;background:#1E4FD6;color:#fff;font-weight:700;text-decoration:none;padding:11px 20px;border-radius:9px">Abrir o painel</a>
</div></div></body></html>`
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
    if (!process.env.RESEND_API_KEY) return new Response(JSON.stringify({ sent: 0, motivo: 'RESEND_API_KEY em falta' }), { status: 200 })
    const { createClient } = await import('@supabase/supabase-js')
    const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    const agora = Date.now(), desde = new Date(agora - 14 * DIA).toISOString()
    const [perfis, pedidos, conversas, avaliacoes, visitas, apoio, rgpd, verif, acoes, propostas] = await Promise.all([
      todas((a, b) => db.from('profiles').select('id,user_id,account_type,is_demo,is_admin,admin_role,verified,created_at').order('id').range(a, b)),
      todas((a, b) => db.from('requests').select('id,status,created_at').order('id').range(a, b)),
      todas((a, b) => db.from('conversations').select('id,created_at').gte('created_at', desde).order('id').range(a, b)),
      todas((a, b) => db.from('reviews').select('id,created_at').gte('created_at', desde).order('id').range(a, b)),
      todas((a, b) => db.from('site_visits').select('visitor_id,user_id,created_at').gte('created_at', desde).order('id').range(a, b)),
      todas((a, b) => db.from('support_tickets').select('id,status').neq('status', 'resolvido').order('id').range(a, b)).catch(() => []),
      todas((a, b) => db.from('gdpr_requests').select('id,status,created_at').in('status', ['pending', 'in_progress']).order('id').range(a, b)),
      todas((a, b) => db.from('verification_requests').select('id,status').eq('status', 'pending').order('id').range(a, b)),
      db.from('admin_audit').select('id', { count: 'exact', head: true }).gte('at', new Date(agora - 7 * DIA).toISOString()).then(r => r.count || 0, () => 0),
      todas((a, b) => db.from('request_offers').select('request_id').order('id').range(a, b))
    ])
    const comProposta = new Set(propostas.map(p => p.request_id))
    pedidos.forEach(r => { r.tem_proposta = comProposta.has(r.id) })
    const r = relatorio({ perfis, pedidos, conversas, avaliacoes, visitas, apoio, rgpd, verif, acoes }, agora)

    const donos = perfis.filter(p => p.is_admin && (p.admin_role || 'owner') === 'owner')
    const FROM = process.env.RESEND_FROM || 'Flinko <onboarding@resend.dev>'
    let sent = 0
    for (const d of donos) {
      const { data } = await db.auth.admin.getUserById(d.user_id || d.id)
      const email = data && data.user && data.user.email
      if (!email) continue
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: FROM, to: [email], subject: r.assunto, html: html(r) })
      })
      if (res.ok) sent++
      else console.error('admin-weekly-report: Resend recusou:', res.status, await res.text().catch(() => ''))
    }
    return new Response(JSON.stringify({ sent, pendentes: r.pendentes.length }), { status: 200 })
  } catch (err) {
    console.error('admin-weekly-report error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
}
