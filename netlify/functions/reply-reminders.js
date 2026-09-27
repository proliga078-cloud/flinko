// Lembrete de mensagens por responder (corre de hora a hora, ver netlify.toml).
//
// Quando um cliente escreve e o profissional não responde em 2 horas, o
// profissional recebe um segundo aviso (push e email): quem responde primeiro
// costuma ficar com o trabalho. Um só lembrete por mensagem, só até 24 horas
// depois, e nunca de noite (22h–8h em Portugal): as mensagens da noite são
// lembradas de manhã.
const { createClient } = require('@supabase/supabase-js')
const { sendPush } = require('./_push')

const RESEND_API_KEY = process.env.RESEND_API_KEY
const FROM = process.env.RESEND_FROM || 'Flinko <onboarding@resend.dev>'
const SITE = 'https://flinko.pt'
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const primeiro = (n) => String(n || '').trim().split(/\s+/)[0] || ''

// Hora em Portugal continental (0–23).
function horaLisboa(agora = new Date()) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', hour: '2-digit', hourCycle: 'h23' }).format(agora))
}
function horaDeSilencio(agora = new Date()) {
  const h = horaLisboa(agora)
  return h >= 22 || h < 8
}

function haQuanto(iso, agora = new Date()) {
  const h = Math.floor((agora - new Date(iso)) / 36e5)
  return h < 1 ? 'há pouco' : h === 1 ? 'há 1 hora' : `há ${h} horas`
}

function trecho(t) {
  t = String(t || '').replace(/\s+/g, ' ').trim()
  if (!t) return '📷 Enviou fotos'
  return t.length > 160 ? t.slice(0, 157) + '…' : t
}

function emailHtml({ proNome, clienteNome, texto, quando, link }) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px">
  <div style="font-size:22px;font-weight:800;color:#132420;margin-bottom:20px">Flink<span style="color:#E8720A">o</span></div>
  <h2 style="color:#14181F;font-size:18px;margin-bottom:8px">${esc(clienteNome)} está à espera da tua resposta</h2>
  <p style="color:#5B6270;font-size:14px;line-height:1.6">Olá${proNome ? ' ' + esc(proNome) : ''}, ${esc(clienteNome)} escreveu-te ${esc(quando)}:</p>
  <div style="background:#F7F8FA;padding:14px 16px;border-left:3px solid #E8720A;border-radius:6px;color:#14181F;font-size:14px;margin:16px 0">${esc(texto)}</div>
  <p style="color:#5B6270;font-size:14px;line-height:1.6">Quem responde primeiro costuma ficar com o trabalho. Mesmo que não possas, uma resposta curta deixa o cliente bem impressionado.</p>
  <a href="${link}" style="display:inline-block;background:#E8720A;color:#fff;padding:11px 22px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:700">Responder agora</a>
  <p style="color:#94a3b8;font-size:12px;margin-top:24px">Recebeste este lembrete porque tens uma conversa por responder na Flinko. Podes desligar os avisos por email no teu painel.</p>
</div>`
}

async function run(agora = new Date()) {
  try {
    if (horaDeSilencio(agora)) return { statusCode: 200, body: JSON.stringify({ skipped: 'hora de silêncio' }) }
    const { data: pendentes, error } = await admin.rpc('mensagens_por_responder', { p_desde: '2 hours', p_ate: '24 hours' })
    if (error) throw error
    if (!pendentes || !pendentes.length) return { statusCode: 200, body: JSON.stringify({ sent: 0 }) }

    const ids = [...new Set(pendentes.flatMap((p) => [p.professional_id, p.client_id]))]
    const { data: perfis } = await admin.from('profiles').select('id,name,notify_email,suspended').in('id', ids)
    const perfil = {}; (perfis || []).forEach((p) => { perfil[p.id] = p })
    const { data: enderecos } = await admin.rpc('emails_for', { ids: [...new Set(pendentes.map((p) => p.professional_id))] })
    const email = {}; (enderecos || []).forEach((e) => { email[e.id] = e.email })

    let enviados = 0
    for (const m of pendentes) {
      const pro = perfil[m.professional_id]
      if (!pro || pro.suspended) continue
      // reclama a mensagem primeiro: se outra execução já a lembrou, não repete
      const { error: dup } = await admin.from('lembretes_resposta').insert({ message_id: m.message_id })
      if (dup) continue
      const clienteNome = primeiro(perfil[m.client_id] && perfil[m.client_id].name) || 'Um cliente'
      const texto = trecho(m.content)
      const link = `${SITE}/messages.html?c=${m.conversation_id}`
      await sendPush(m.professional_id, { title: `${clienteNome} está à espera da tua resposta`, body: texto, url: `/messages.html?c=${m.conversation_id}`, tag: 'reply-' + m.conversation_id }).catch(() => {})
      if (RESEND_API_KEY && pro.notify_email !== false && email[m.professional_id]) {
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: FROM, to: [email[m.professional_id]], subject: `${clienteNome} está à espera da tua resposta na Flinko`, html: emailHtml({ proNome: primeiro(pro.name), clienteNome, texto, quando: haQuanto(m.created_at, agora), link }) }),
        })
        if (!r.ok) console.error('reply-reminders: Resend', r.status, await r.text().catch(() => ''))
      }
      enviados++
    }
    return { statusCode: 200, body: JSON.stringify({ sent: enviados }) }
  } catch (err) {
    console.error('reply-reminders error:', err)
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}

exports.handler = async () => run()
exports.run = run
exports.horaLisboa = horaLisboa
exports.horaDeSilencio = horaDeSilencio
exports.haQuanto = haQuanto
exports.trecho = trecho
