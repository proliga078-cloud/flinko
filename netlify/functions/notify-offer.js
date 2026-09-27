// Avisa o cliente (email + push) quando recebe uma proposta a um pedido.
//
// Chamada pelo browser do profissional logo depois de enviar a proposta. Nada
// vem do browser além do id da proposta: o servidor confirma que é mesmo de
// quem chama, descobre o cliente e o email, e só avisa uma vez por proposta
// (notified_at, reclamado de forma atómica).
const { createClient } = require('@supabase/supabase-js')
const { sendPush } = require('./_push')

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const FROM = process.env.RESEND_FROM || 'Flinko <onboarding@resend.dev>'
const SITE = process.env.URL || 'https://flinko.pt'

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const eur = (v) => { const n = Number(v); return isFinite(n) && n > 0 ? n.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }) : null }
const json = (statusCode, body) => ({ statusCode, body: JSON.stringify(body) })

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' }
  try {
    const token = (event.headers.authorization || '').replace(/^Bearer\s+/i, '')
    if (!token) return json(401, { error: 'Sem sessao.' })
    const { data: u, error: ue } = await admin.auth.getUser(token)
    if (ue || !u || !u.user) return json(401, { error: 'Sessao invalida.' })

    const { offerId } = JSON.parse(event.body || '{}')
    if (!offerId) return json(400, { error: 'Falta offerId.' })

    const { data: oferta } = await admin.from('request_offers').select('id,request_id,professional_id,price_from,price_to,message').eq('id', offerId).maybeSingle()
    if (!oferta) return json(404, { error: 'Proposta nao encontrada.' })
    if (oferta.professional_id !== u.user.id) return json(403, { error: 'A proposta nao e tua.' })

    // Só a primeira chamada passa (repetições e edições não voltam a avisar).
    const { data: reclamada } = await admin.from('request_offers').update({ notified_at: new Date().toISOString() }).eq('id', offerId).is('notified_at', null).select('id')
    if (!reclamada || !reclamada.length) return json(200, { skipped: true, reason: 'ja avisado' })

    const [{ data: pedido }, { data: pro }] = await Promise.all([
      admin.from('requests').select('id,client_id,title').eq('id', oferta.request_id).maybeSingle(),
      admin.from('profiles').select('name,category').eq('id', oferta.professional_id).maybeSingle(),
    ])
    if (!pedido) return json(404, { error: 'Pedido nao encontrado.' })
    const { data: cliente } = await admin.from('profiles').select('name,notify_email').eq('id', pedido.client_id).maybeSingle()

    const nomePro = (pro && pro.name) || 'Um profissional'
    const preco = eur(oferta.price_from) ? (eur(oferta.price_to) && oferta.price_to !== oferta.price_from ? eur(oferta.price_from) + ' a ' + eur(oferta.price_to) : 'a partir de ' + eur(oferta.price_from)) : null
    const link = SITE + '/pedido.html?id=' + encodeURIComponent(pedido.id)

    await sendPush(pedido.client_id, { title: 'Nova proposta de ' + nomePro, body: (preco ? preco + ' · ' : '') + pedido.title, url: '/pedido.html?id=' + pedido.id, tag: 'offer-' + pedido.id }).catch(() => {})

    if (!process.env.RESEND_API_KEY || !cliente || cliente.notify_email === false) return json(200, { sent: false, push: true })
    const { data: enderecos } = await admin.rpc('emails_for', { ids: [pedido.client_id] })
    const para = enderecos && enderecos[0] && enderecos[0].email
    if (!para) return json(200, { sent: false, push: true })

    const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px">
  <div style="font-size:22px;font-weight:800;color:#132420;margin-bottom:20px">Flink<span style="color:#E8720A">o</span></div>
  <h2 style="color:#14181F;font-size:18px;margin-bottom:8px">Recebeste uma proposta</h2>
  <p style="color:#5B6270;font-size:14px;line-height:1.6">Ol&aacute;${cliente.name ? ' ' + esc(String(cliente.name).split(' ')[0]) : ''},</p>
  <p style="color:#5B6270;font-size:14px;line-height:1.6"><strong>${esc(nomePro)}</strong>${pro && pro.category ? ' (' + esc(pro.category) + ')' : ''} respondeu ao teu pedido <strong>${esc(pedido.title)}</strong>:</p>
  <div style="background:#F7F8FA;padding:14px 16px;border-left:3px solid #E8720A;border-radius:6px;color:#14181F;font-size:14px;margin:16px 0">${preco ? '<strong>' + esc(preco) + '</strong><br/>' : ''}${esc(String(oferta.message || '').slice(0, 300)) || 'Sem mensagem.'}</div>
  <a href="${link}" style="display:inline-block;background:#E8720A;color:#fff;padding:11px 22px;border-radius:999px;text-decoration:none;font-size:14px;font-weight:700">Ver e comparar propostas</a>
  <p style="color:#94a3b8;font-size:12px;margin-top:24px">Recebeste este email porque publicaste um pedido na Flinko. Podes desligar os avisos no teu painel.</p>
</div>`
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [para], subject: `Nova proposta de ${nomePro.replace(/\s+/g, ' ')} para "${String(pedido.title).slice(0, 60)}"`, html }),
    })
    if (!res.ok) { console.error('notify-offer: Resend', res.status, await res.text().catch(() => '')); return json(200, { sent: false, push: true }) }
    return json(200, { sent: true, push: true })
  } catch (e) {
    console.error('notify-offer error:', e)
    return json(500, { error: e.message })
  }
}
