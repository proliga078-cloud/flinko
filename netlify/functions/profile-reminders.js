// Lembretes a profissionais com o perfil por completar.
//
// Corre uma vez por dia (netlify.toml). A quem criou conta há 1, 3 ou 7 dias e
// ainda não tem área e zona, foto, descrição ou pelo menos um serviço, envia UM
// email (e push, se tiver) a dizer exatamente o que falta, com um link que abre
// o guia "Completa o teu perfil" no dashboard. Como cada pessoa só está no dia
// 1, 3 ou 7 uma vez, recebe no máximo três lembretes, e nunca se desligou os
// emails no dashboard (notify_email = false).
const { createClient } = require('@supabase/supabase-js')
const { sendPush } = require('./_push')

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const FROM = process.env.RESEND_FROM || 'Flinko <onboarding@resend.dev>'
const SITE = 'https://flinko.pt'
const DIAS = [1, 3, 7]
const DIA = 864e5

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

// Função pura (testável): o que falta a cada perfil.
function falta(p, nServicos) {
  const out = []
  if (!p.category || !p.location) out.push('área e zona')
  if (!p.photo_url) out.push('foto')
  if (!p.bio || !String(p.bio).trim()) out.push('descrição')
  if (!nServicos) out.push('primeiro serviço')
  return out
}

// Função pura (testável): quem recebe lembrete hoje e em que dia está.
function aLembrar(perfis, servicosPorPerfil, agora = Date.now()) {
  const hoje = new Date(agora); hoje.setUTCHours(0, 0, 0, 0)
  const out = []
  for (const p of perfis) {
    if (p.is_demo || p.suspended || p.is_admin || p.account_type === 'client' || p.notify_email === false) continue
    const criado = new Date(p.created_at); criado.setUTCHours(0, 0, 0, 0)
    const dia = Math.round((hoje - criado) / DIA)
    if (!DIAS.includes(dia)) continue
    const f = falta(p, servicosPorPerfil[p.id] || 0)
    if (f.length) out.push({ id: p.id, name: p.name, dia, falta: f })
  }
  return out
}

function assunto(l) {
  const nome = String(l.name || '').trim().split(/\s+/)[0]
  if (l.dia === 1) return 'Falta pouco para apareceres nas pesquisas da Flinko'
  if (l.dia === 3) return (nome ? nome + ', os' : 'Os') + ' clientes ainda não te encontram na Flinko'
  return 'Último lembrete: completa o teu perfil na Flinko'
}

function emailHtml(l) {
  const nome = String(l.name || '').trim().split(/\s+/)[0]
  const lista = l.falta.map((f) => `<li style="margin:4px 0">${esc(f)}</li>`).join('')
  const critico = l.falta.includes('área e zona')
    ? '<p style="margin:0 0 14px">Sem área e zona, o teu perfil <b>não aparece em nenhuma pesquisa</b>.</p>'
    : '<p style="margin:0 0 14px">Perfis completos, com foto e preços, recebem muito mais contactos.</p>'
  return `<!DOCTYPE html><html lang="pt"><body style="margin:0;padding:0;background:#FAF8F4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<div style="max-width:520px;margin:0 auto;padding:28px 20px">
  <div style="font-size:20px;font-weight:800;color:#14181F;margin-bottom:22px">Flink<span style="color:#E8720A">o</span></div>
  <div style="background:#fff;border-radius:14px;padding:26px;box-shadow:0 2px 12px rgba(20,24,31,.06);font-size:15px;color:#14181F;line-height:1.6">
    <p style="margin:0 0 14px">Olá${nome ? ' ' + esc(nome) : ''},</p>
    ${critico}
    <p style="margin:0 0 6px">Falta-te:</p>
    <ul style="margin:0 0 20px;padding-left:20px">${lista}</ul>
    <a href="${SITE}/dashboard?completar=1" style="display:inline-block;background:#E8720A;color:#fff;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:999px">Completar em 2 minutos</a>
    <p style="margin:18px 0 0;font-size:13px;color:#707580">É grátis e sem comissões. Se precisares de ajuda, responde a este email.</p>
  </div>
  <p style="font-size:12px;color:#707580;text-align:center;margin-top:20px;line-height:1.6">Recebeste este email porque criaste um perfil profissional na Flinko.<br/>Podes desligar os avisos por email no teu <a href="${SITE}/dashboard" style="color:#B85608">dashboard</a>.</p>
</div></body></html>`
}

exports.handler = async () => {
  try {
    const desde = new Date(Date.now() - 9 * DIA).toISOString()
    const { data: perfis, error } = await admin.from('profiles')
      .select('id,name,category,location,photo_url,bio,created_at,notify_email,account_type,is_demo,suspended,is_admin')
      .gte('created_at', desde).limit(1000)
    if (error) throw new Error(error.message)
    const ids = (perfis || []).map((p) => p.id)
    const servicos = {}
    if (ids.length) {
      const { data: sv } = await admin.from('services').select('professional_id').in('professional_id', ids)
      ;(sv || []).forEach((s) => { servicos[s.professional_id] = (servicos[s.professional_id] || 0) + 1 })
    }
    const lembretes = aLembrar(perfis || [], servicos)
    if (!lembretes.length) return { statusCode: 200, body: JSON.stringify({ enviados: 0 }) }

    const { data: enderecos } = await admin.rpc('emails_for', { ids: lembretes.map((l) => l.id) })
    const email = {}
    ;(enderecos || []).forEach((e) => { email[e.id] = e.email })

    let enviados = 0
    for (const l of lembretes) {
      await sendPush(l.id, { title: 'Completa o teu perfil na Flinko', body: 'Falta: ' + l.falta.join(', ') + '.', url: '/dashboard?completar=1', tag: 'perfil-incompleto' }).catch(() => {})
      if (!process.env.RESEND_API_KEY || !email[l.id]) continue
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: FROM, to: [email[l.id]], reply_to: process.env.RESEND_REPLY_TO || 'flinkogeral@gmail.com', subject: assunto(l), html: emailHtml(l) }),
      })
      if (res.ok) enviados++
      else console.error('profile-reminders: Resend', res.status, await res.text().catch(() => ''))
    }
    return { statusCode: 200, body: JSON.stringify({ enviados, candidatos: lembretes.length }) }
  } catch (e) {
    console.error('profile-reminders error:', e)
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) }
  }
}

exports.aLembrar = aLembrar
exports.falta = falta
exports.assunto = assunto
exports.emailHtml = emailHtml
