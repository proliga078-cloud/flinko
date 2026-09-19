import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import webpush from "npm:web-push@3.6.7"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const HOOK_SECRET = Deno.env.get("PROLIGA_HOOK_SECRET")
const SITE = "https://flinko.pt"

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:equipa@flinko.pt"

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
}

function getResendKey(): string | undefined {
  for (const k of ["RESEND_API_KEY", "RESEND_KEY", "RESEND_TOKEN", "RESEND", "EMAIL_API_KEY"]) {
    const v = Deno.env.get(k)
    if (v) return v
  }
  return undefined
}

function getFrom(): string {
  return Deno.env.get("PROLIGA_FROM_EMAIL") ?? Deno.env.get("FROM_EMAIL") ?? "Flinko <onboarding@resend.dev>"
}

function esc(s: string) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string
  ))
}

function shell(inner: string) {
  return `<!DOCTYPE html><html lang="pt"><body style="margin:0;padding:0;background:#FAF8F4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<div style="max-width:520px;margin:0 auto;padding:28px 20px">
  <div style="font-size:20px;font-weight:800;color:#14181F;margin-bottom:22px">Flink<span style="color:#E8720A">o</span></div>
  <div style="background:#fff;border-radius:14px;padding:26px;box-shadow:0 2px 12px rgba(20,24,31,.06)">
    ${inner}
  </div>
  <p style="font-size:12px;color:#707580;text-align:center;margin-top:20px;line-height:1.6">Recebeste este email porque tens uma conta na Flinko.<br/>Podes desligar estes avisos no teu <a href="${SITE}/dashboard.html" style="color:#1E4FD6">dashboard</a>.</p>
</div></body></html>`
}

function templateNewMessage(name: string, sender: string, preview: string) {
  const saudacao = name ? `Olá ${esc(name.split(" ")[0])},` : "Olá,"
  return shell(`
    <p style="margin:0 0 14px;font-size:15px;color:#14181F">${saudacao}</p>
    <p style="margin:0 0 18px;font-size:15px;color:#14181F;line-height:1.6">Tens uma nova mensagem de <strong>${esc(sender)}</strong> na Flinko.</p>
    <div style="background:#F7F8FA;border-radius:10px;padding:14px;font-size:14px;color:#5B6270;line-height:1.6;margin-bottom:22px">"${esc(preview)}"</div>
    <a href="${SITE}/messages.html" style="display:inline-block;background:#1E4FD6;color:#fff;font-size:15px;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:9px">Ver e responder</a>
    <p style="margin:20px 0 0;font-size:13px;color:#707580;line-height:1.6">Responder rápido aumenta as tuas hipóteses de fechar o trabalho.</p>
  `)
}

function templateVerificationRequest(name: string, sender: string, preview: string) {
  const saudacao = name ? `Olá ${esc(name.split(" ")[0])},` : "Olá,"
  return shell(`
    <p style="margin:0 0 14px;font-size:15px;color:#14181F">${saudacao}</p>
    <p style="margin:0 0 18px;font-size:15px;color:#14181F;line-height:1.6"><strong>${esc(sender)}</strong> pediu verificação de perfil na Flinko.</p>
    <div style="background:#F7F8FA;border-radius:10px;padding:14px;font-size:14px;color:#5B6270;line-height:1.6;margin-bottom:22px">${esc(preview)}</div>
    <a href="${SITE}/admin" style="display:inline-block;background:#1E4FD6;color:#fff;font-size:15px;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:9px">Rever pedido no admin</a>
    <p style="margin:20px 0 0;font-size:13px;color:#707580;line-height:1.6">Revê os documentos e aprova ou rejeita o pedido.</p>
  `)
}

function buildEmail(kind: string, name: string, sender: string, preview: string) {
  if (kind === "verification_request") {
    return {
      subject: `Pedido de verificação de ${sender}`,
      html: templateVerificationRequest(name, sender, preview)
    }
  }
  return {
    subject: `Nova mensagem de ${sender} na Flinko`,
    html: templateNewMessage(name, sender, preview)
  }
}

function buildPushPayload(kind: string, sender: string, preview: string) {
  if (kind === "verification_request") {
    return JSON.stringify({
      title: `Pedido de verificação de ${sender}`,
      body: preview?.slice(0, 140) || "Um profissional pediu verificação de perfil.",
      url: `${SITE}/admin`
    })
  }
  return JSON.stringify({
    title: `Nova mensagem de ${sender}`,
    body: preview?.slice(0, 140) || "Tens uma nova mensagem na Flinko.",
    url: `${SITE}/messages.html`
  })
}

async function sendPush(db: ReturnType<typeof createClient>, recipientProfileId: string, kind: string, senderName: string, preview: string) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return { attempted: 0, sent: 0 }
  if (!recipientProfileId) return { attempted: 0, sent: 0 }

  const { data: subs } = await db
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("profile_id", recipientProfileId)

  if (!subs || subs.length === 0) return { attempted: 0, sent: 0 }

  const payload = buildPushPayload(kind, senderName, preview)

  let sent = 0
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload
      )
      sent++
    } catch (e) {
      const status = (e as { statusCode?: number })?.statusCode
      if (status === 404 || status === 410) {
        await db.from("push_subscriptions").delete().eq("id", s.id)
      }
    }
  }
  return { attempted: subs.length, sent }
}

Deno.serve(async (req: Request) => {
  if (HOOK_SECRET && req.headers.get("x-proliga-secret") !== HOOK_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } })
  }

  const url = new URL(req.url)

  // O diagnóstico só existe quando há segredo configurado (senão qualquer um via os nomes das variáveis).
  if (HOOK_SECRET && url.searchParams.get("diag") === "1") {
    const nomes = Object.keys(Deno.env.toObject())
      .filter((k) => /RESEND|EMAIL|SMTP|MAIL|SENDGRID|POSTMARK|HOOK|FROM|VAPID/i.test(k))
      .sort()
    return new Response(JSON.stringify({
      variaveis_relacionadas: nomes,
      chave_de_envio_detetada: !!getResendKey(),
      remetente: getFrom(),
      push_configurado: !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY)
    }), { headers: { "Content-Type": "application/json" } })
  }

  const RESEND_KEY = getResendKey()
  const FROM = getFrom()

  const db = createClient(SUPABASE_URL, SERVICE_KEY)

  // linhas que ainda precisam de push OU de email
  const { data: rows, error } = await db
    .from("notification_queue")
    .select("*")
    .or("status.eq.pending,push_sent.eq.false")
    .lt("attempts", 3)
    .order("created_at", { ascending: true })
    .limit(30)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } })
  }
  if (!rows || rows.length === 0) {
    return new Response(JSON.stringify({ processed: 0 }), { headers: { "Content-Type": "application/json" } })
  }

  let sent = 0, failed = 0, pushSent = 0, pushAttempted = 0
  for (const r of rows) {
    const kind = r.kind || "new_message"

    // push so tenta se ainda nao foi enviado para esta linha
    if (!r.push_sent) {
      try {
        const pushResult = await sendPush(db, r.recipient_profile_id, kind, r.sender_name, r.preview)
        pushSent += pushResult.sent
        pushAttempted += pushResult.attempted
        if (pushResult.attempted > 0) {
          await db.from("notification_queue").update({ push_sent: true }).eq("id", r.id)
        }
      } catch (_e) {
        // nao bloqueia o email se o push falhar
      }
    }

    if (r.status !== "pending") continue
    if (!RESEND_KEY) continue

    try {
      const { subject, html } = buildEmail(kind, r.recipient_name, r.sender_name, r.preview)
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: FROM,
          to: [r.recipient_email],
          subject,
          html
        })
      })
      if (res.ok) {
        await db.from("notification_queue").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", r.id)
        sent++
      } else {
        const txt = await res.text()
        await db.from("notification_queue").update({ attempts: r.attempts + 1, last_error: txt.slice(0, 300), status: r.attempts + 1 >= 3 ? "failed" : "pending" }).eq("id", r.id)
        failed++
      }
    } catch (e) {
      await db.from("notification_queue").update({ attempts: r.attempts + 1, last_error: String(e).slice(0, 300), status: r.attempts + 1 >= 3 ? "failed" : "pending" }).eq("id", r.id)
      failed++
    }
  }

  return new Response(JSON.stringify({
    processed: rows.length,
    email_sent: sent,
    email_failed: failed,
    email_configured: !!RESEND_KEY,
    push_attempted: pushAttempted,
    push_sent: pushSent
  }), { headers: { "Content-Type": "application/json" } })
})
