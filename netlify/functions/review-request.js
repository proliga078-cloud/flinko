// Pedido de avaliação quando um trabalho fica pago.
//
// Chamada pelo dashboard do profissional. Confirma que o trabalho é dele e está
// pago, cria (ou reaproveita) um link de avaliação de uso único ligado a esse
// trabalho e, se o cliente tem conta na Flinko, envia-lhe:
//   - email com as 5 estrelas clicáveis (cada uma abre avaliar.html já com
//     essa nota escolhida: é só confirmar);
//   - push;
//   - uma mensagem na conversa.
// Devolve sempre o link, para o profissional o poder partilhar à mão (ex.:
// trabalhos de clientes sem conta).
const { createClient } = require('@supabase/supabase-js')
const { sendPush } = require('./_push')

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const FROM = process.env.RESEND_FROM || 'Flinko <onboarding@resend.dev>'
const SITE = 'https://flinko.pt'
const json = (statusCode, body) => ({ statusCode, body: JSON.stringify(body) })
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

function estrelasHtml(link) {
  return [1, 2, 3, 4, 5].map((n) =>
    `<a href="${link}&amp;s=${n}" style="display:inline-block;text-decoration:none;font-size:34px;line-height:1;color:#F5A623;padding:0 3px" aria-label="${n} estrela${n > 1 ? 's' : ''}">★</a>`).join('')
}

function emailHtml({ nomeCliente, nomePro, titulo, link }) {
  return `<!DOCTYPE html><html lang="pt"><body style="margin:0;padding:0;background:#FAF8F4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<div style="max-width:520px;margin:0 auto;padding:28px 20px">
  <div style="font-size:20px;font-weight:800;color:#14181F;margin-bottom:22px">Flink<span style="color:#BB5C08">o</span></div>
  <div style="background:#fff;border-radius:14px;padding:26px;box-shadow:0 2px 12px rgba(20,24,31,.06);font-size:15px;color:#14181F;line-height:1.6;text-align:center">
    <p style="margin:0 0 10px;text-align:left">Olá${nomeCliente ? ' ' + esc(nomeCliente) : ''},</p>
    <p style="margin:0 0 18px;text-align:left">Como correu <b>${esc(titulo)}</b> com <b>${esc(nomePro)}</b>? A tua opinião ajuda outras pessoas a escolher (e demora 10 segundos).</p>
    <div style="margin:6px 0 10px">${estrelasHtml(link)}</div>
    <p style="margin:0 0 20px;font-size:13px;color:#707580">Toca nas estrelas para avaliar</p>
    <a href="${link}" style="display:inline-block;background:#BB5C08;color:#fff;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:999px">Avaliar ${esc(nomePro.split(' ')[0])}</a>
  </div>
  <p style="font-size:12px;color:#707580;text-align:center;margin-top:20px;line-height:1.6">Recebeste este email porque contrataste um profissional pela Flinko.</p>
</div></body></html>`
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' }
  try {
    const token = (event.headers.authorization || '').replace(/^Bearer\s+/i, '')
    if (!token) return json(401, { error: 'Sem sessao.' })
    const { data: u, error: ue } = await admin.auth.getUser(token)
    if (ue || !u || !u.user) return json(401, { error: 'Sessao invalida.' })

    const { jobId } = JSON.parse(event.body || '{}')
    if (!jobId) return json(400, { error: 'Falta jobId.' })
    const { data: job } = await admin.from('jobs').select('id,professional_id,client_id,conversation_id,title,status').eq('id', jobId).maybeSingle()
    if (!job) return json(404, { error: 'Trabalho nao encontrado.' })
    if (job.professional_id !== u.user.id) return json(403, { error: 'O trabalho nao e teu.' })
    if (job.status !== 'pago' && job.status !== 'concluido') return json(400, { error: 'O trabalho ainda nao esta concluido.' })

    // um link por trabalho (reaproveita se já existir)
    let { data: convite } = await admin.from('review_invites').select('token,used_at').eq('job_id', job.id).maybeSingle()
    let novo = false
    if (!convite) {
      const r = await admin.from('review_invites').insert({ professional_id: job.professional_id, client_id: job.client_id || null, job_id: job.id, source: 'trabalho' }).select('token,used_at').single()
      if (r.error) throw new Error(r.error.message)
      convite = r.data; novo = true
    }
    const link = `${SITE}/avaliar.html?t=${convite.token}`
    if (!novo || convite.used_at || !job.client_id) return json(200, { link, sent: false })

    const [{ data: pro }, { data: cliente }] = await Promise.all([
      admin.from('profiles').select('name').eq('id', job.professional_id).maybeSingle(),
      admin.from('profiles').select('name,notify_email').eq('id', job.client_id).maybeSingle(),
    ])
    const nomePro = (pro && pro.name) || 'o profissional'
    const nomeCliente = cliente && cliente.name ? String(cliente.name).split(' ')[0] : ''

    if (job.conversation_id) {
      await admin.from('messages').insert({ conversation_id: job.conversation_id, sender_id: job.professional_id, content: `Obrigado! O trabalho ficou concluído. Se puderes, avalia aqui (demora 10 segundos): ${link}` })
    }
    await sendPush(job.client_id, { title: `Como correu com ${nomePro}?`, body: 'Toca para deixar a tua avaliação (10 segundos).', url: `/avaliar.html?t=${convite.token}`, tag: 'review-' + job.id }).catch(() => {})

    let sent = false
    if (process.env.RESEND_API_KEY && cliente && cliente.notify_email !== false) {
      const { data: enderecos } = await admin.rpc('emails_for', { ids: [job.client_id] })
      const para = enderecos && enderecos[0] && enderecos[0].email
      if (para) {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: FROM, to: [para], subject: `Como correu com ${nomePro.replace(/\s+/g, ' ')}?`, html: emailHtml({ nomeCliente, nomePro, titulo: job.title || 'o trabalho', link }) }),
        })
        sent = res.ok
        if (!res.ok) console.error('review-request: Resend', res.status, await res.text().catch(() => ''))
      }
    }
    return json(200, { link, sent })
  } catch (e) {
    console.error('review-request error:', e)
    return json(500, { error: e.message })
  }
}

exports.emailHtml = emailHtml
