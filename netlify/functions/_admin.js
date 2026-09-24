// Modulo interno (nao e uma function exposta - nao tem exports.handler).
// Autorizacao e registo de acoes partilhados pelas functions do painel admin.
//
// Niveis de acesso (profiles.admin_role, ver a migracao painel_gestao_completo):
//   owner   -> tudo, incluindo dinheiro (planos, reembolsos, Stripe), RGPD e
//              emails em massa.
//   support -> ve o painel e trata verificacoes, moderacao e apoio, mas as
//              functions marcadas com {owner:true} recusam-no.
// Um admin antigo sem admin_role conta como owner (era o comportamento antes
// de existirem papeis).

const json = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

async function requireAdmin(db, event, { owner = false } = {}) {
  const token = ((event.headers && (event.headers.authorization || event.headers.Authorization)) || '').replace(/^Bearer\s+/i, '')
  if (!token) return { error: json(401, { error: 'Sem sessão. Inicia sessão primeiro.' }) }
  const { data: userData, error: userErr } = await db.auth.getUser(token)
  if (userErr || !userData || !userData.user) return { error: json(401, { error: 'Sessão inválida. Inicia sessão novamente.' }) }
  const { data: me } = await db.from('profiles').select('is_admin,admin_role').eq('user_id', userData.user.id).maybeSingle()
  if (!me || !me.is_admin) return { error: json(403, { error: 'Sem permissões de administrador.' }) }
  const role = me.admin_role || 'owner'
  if (owner && role !== 'owner') return { error: json(403, { error: 'Esta ação é só para donos do Flinko (a tua conta é de apoio).' }) }
  return { user: userData.user, role }
}

// Regista uma acao em admin_audit. Nunca rebenta a function que a chama: se
// o registo falhar, fica so em log (a acao principal ja aconteceu).
async function audit(db, user, action, { targetType = null, targetId = null, summary = null, details = {} } = {}) {
  try {
    const { error } = await db.from('admin_audit').insert({
      actor_id: user ? user.id : null,
      actor_email: user ? user.email || null : null,
      action,
      target_type: targetType,
      target_id: targetId == null ? null : String(targetId),
      summary,
      details
    })
    if (error) console.error('admin_audit insert error:', error.message || error)
  } catch (e) {
    console.error('admin_audit insert error:', e)
  }
}

module.exports = { json, requireAdmin, audit }
