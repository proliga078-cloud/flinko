// Contas com o registo a meio (admin.html › Avisos).
//
// Entre junho e agosto de 2026 houve contas criadas e confirmadas que nunca
// chegaram a ter perfil (uma falha no registo, entretanto corrigida). Essas
// pessoas não aparecem no painel e nunca voltaram. Esta função encontra-as e,
// quando o admin carrega no botão, envia-lhes um convite para acabarem o
// registo (ao entrarem, auth.html pergunta se querem contratar ou oferecer
// serviços e cria o perfil). Só donos.
//
//   action:"preview" -> quem está nesta situação e se já foi convidado
//   action:"send"    -> envia o convite a quem ainda não foi convidado nos
//                       últimos 30 dias e regista em admin_audit
const{createClient}=require('@supabase/supabase-js')
const{json,requireAdmin,audit}=require('./_admin.js')
const{enviarEmails}=require('./_resend')
const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY)

const FROM=process.env.RESEND_FROM||'Flinko <onboarding@resend.dev>'
const REPLY_TO=process.env.RESEND_REPLY_TO||'flinkogeral@gmail.com'
const LINK='https://flinko.pt/auth?tab=login'
const DIAS_ENTRE_CONVITES=30

const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))

function primeiroNome(u){
  const m=u.user_metadata||{}
  const n=String(m.full_name||m.name||'').trim()
  return n&&!n.includes('@')?n.split(/\s+/)[0]:''
}

// Função pura (testável): contas sem perfil, com a data do último convite.
function incompletos(users,profileIds,convites,agora=Date.now()){
  const temPerfil=new Set(profileIds)
  return users.filter(u=>u.email&&!temPerfil.has(u.id)).map(u=>{
    const c=convites[u.id]||null
    return{
      id:u.id,email:u.email,nome:primeiroNome(u),criada:u.created_at,
      via:(u.app_metadata&&u.app_metadata.provider)||'email',
      convidado:c,
      podeConvidar:!c||(agora-new Date(c))/864e5>=DIAS_ENTRE_CONVITES,
    }
  }).sort((a,b)=>String(a.criada).localeCompare(String(b.criada)))
}

function assunto(){return 'Falta só um passo para entrares na Flinko'}

function texto(c){
  const como=c.via==='google'?'carrega em "Continuar com Google"':'entra com o teu email e palavra-passe'
  return `Olá${c.nome?' '+c.nome:''}!

Criaste conta na Flinko, mas o teu registo ficou a meio. A culpa foi nossa: um erro no site não deixou acabar o registo. Pedimos desculpa, já está corrigido.

Para acabar, ${como} e escolhe se procuras um profissional ou se ofereces serviços. Demora menos de 1 minuto:
${LINK}

Se não te lembras da palavra-passe, carrega em "Esqueci a palavra-passe" na página de entrada.

Obrigado,
Equipa Flinko`
}

function emailHtml(c){
  const como=c.via==='google'?'carrega em <b>“Continuar com Google”</b>':'entra com o teu email e palavra-passe'
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px">
  <div style="font-size:22px;font-weight:800;color:#132420;margin-bottom:20px">Flink<span style="color:#BB5C08">o</span></div>
  <h2 style="color:#14181F;font-size:18px;margin-bottom:8px">Falta só um passo</h2>
  <p style="color:#5B6270;font-size:14px;line-height:1.6">Olá${c.nome?' '+esc(c.nome):''}!</p>
  <p style="color:#5B6270;font-size:14px;line-height:1.6">Criaste conta na Flinko, mas o teu registo ficou a meio. A culpa foi nossa: um erro no site não deixou acabar o registo. Pedimos desculpa, já está corrigido.</p>
  <p style="color:#5B6270;font-size:14px;line-height:1.6">Para acabar, ${como} e escolhe se procuras um profissional ou se ofereces serviços. Demora menos de 1 minuto.</p>
  <a href="${LINK}" style="display:inline-block;background:#BB5C08;color:#fff;padding:11px 22px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:700;margin:6px 0 14px">Acabar o registo</a>
  <p style="color:#5B6270;font-size:13px;line-height:1.6">Se não te lembras da palavra-passe, carrega em “Esqueci a palavra-passe” na página de entrada.</p>
  <p style="color:#5B6270;font-size:14px;line-height:1.6">Obrigado,<br>Equipa Flinko</p>
  <p style="color:#94a3b8;font-size:12px;margin-top:24px">Recebeste este email porque criaste conta em flinko.pt. Se não quiseres continuar, basta ignorares esta mensagem.</p>
</div>`
}

async function todasAsContas(){
  const out=[]
  for(let page=1;page<=50;page++){
    const{data,error}=await admin.auth.admin.listUsers({page,perPage:1000})
    if(error)throw new Error(error.message)
    const users=(data&&data.users)||[]
    out.push(...users)
    if(users.length<1000)break
  }
  return out
}

async function ultimosConvites(){
  const{data}=await admin.from('admin_audit').select('details,at').eq('action','convite_registo')
  const m={}
  ;(data||[]).forEach(r=>((r.details&&r.details.sent)||[]).forEach(id=>{if(!m[id]||r.at>m[id])m[id]=r.at}))
  return m
}

exports.handler=async(event)=>{
  if(event.httpMethod!=='POST')return{statusCode:405,body:'Method Not Allowed'}
  try{
    const auth=await requireAdmin(admin,event,{owner:true})
    if(auth.error)return auth.error
    const{action}=JSON.parse(event.body||'{}')
    const[users,{data:perfis,error:pErr},convites]=await Promise.all([todasAsContas(),admin.from('profiles').select('id').range(0,99999),ultimosConvites()])
    if(pErr)return json(500,{error:pErr.message})
    const lista=incompletos(users,(perfis||[]).map(p=>p.id),convites)
    const alvo=lista.filter(c=>c.podeConvidar)

    if(action==='preview')return json(200,{total:lista.length,porConvidar:alvo.length,contas:lista,exemplo:{assunto:assunto(),texto:texto(alvo[0]||{via:'email',nome:''})}})
    if(action!=='send')return json(400,{error:'action inválida (usar "preview" ou "send").'})
    if(!alvo.length)return json(400,{error:'Não há ninguém por convidar.'})
    if(!process.env.RESEND_API_KEY)return json(503,{error:'RESEND_API_KEY não está configurada no Netlify.'})

    const res=await enviarEmails(alvo.map(c=>({from:FROM,to:[c.email],reply_to:REPLY_TO,subject:assunto(),html:emailHtml(c),text:texto(c)})))
    const sent=[],failed=[],falhas=[]
    alvo.forEach((c,i)=>{if(res[i]&&res[i].ok)sent.push(c.id);else{failed.push(c.id);falhas.push({id:c.id,email:c.email,motivo:(res[i]&&res[i].motivo)||'erro'})}})
    await audit(admin,auth.user,'convite_registo',{targetType:'campaign',summary:`Convite para acabar o registo enviado a ${sent.length} conta(s)${failed.length?` (${failed.length} falharam)`:''}`,details:{sent,failed,falhas}})
    return json(200,{sent:sent.length,failed:failed.length,falhas})
  }catch(err){
    console.error('admin-registos-a-meio error:',err)
    return json(500,{error:err.message})
  }
}

exports.incompletos=incompletos
exports.texto=texto
exports.emailHtml=emailHtml
