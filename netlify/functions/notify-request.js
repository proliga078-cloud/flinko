const{createClient}=require('@supabase/supabase-js')
const{sendPush}=require('./_push')
const{sendWhatsApp}=require('./_whatsapp')

const RESEND_API_KEY=process.env.RESEND_API_KEY
const FROM=process.env.RESEND_FROM||'Flinko <onboarding@resend.dev>'
const SITE=process.env.URL||'https://flinko.pt'
const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY)

const MAX_DESTINATARIOS=15
// Limite por cliente: pedidos notificados por hora. Impede usar a plataforma
// para enviar emails em massa criando pedidos em ciclo.
const MAX_PEDIDOS_POR_HORA=5
const PLANOS_PAGOS=['starter','pro','premium']

// Escolhe quem avisar: primeiro quem trabalha na mesma zona do pedido, depois
// quem tem plano pago, e so entao os restantes. Antes eram sempre os mesmos 15
// (sem ordem), independentemente da localizacao.
function ordenarPorRelevancia(pros,localPedido){
  const local=String(localPedido||'').toLowerCase().trim()
  const pontos=p=>{
    const loc=String(p.location||'').toLowerCase()
    return (local&&loc&&(loc.includes(local)||local.includes(loc))?2:0)+(PLANOS_PAGOS.includes(p.plan)?1:0)
  }
  return pros.slice().sort((a,b)=>pontos(b)-pontos(a))
}

function esc(s){
  return String(s==null?'':s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;')
}

function eur(v){
  const n=Number(v)
  return isFinite(n)?n.toLocaleString('pt-PT',{style:'currency',currency:'EUR',maximumFractionDigits:0}):null
}

exports.handler=async(event)=>{
  if(event.httpMethod!=='POST')return{statusCode:405,body:'Method Not Allowed'}
  if(!RESEND_API_KEY)return{statusCode:200,body:JSON.stringify({skipped:true,reason:'RESEND_API_KEY nao configurada'})}

  try{
    // Antes isto aceitava um endereco vindo do browser, o que permitia a
    // qualquer pessoa enviar email em nome da Flinko para quem quisesse.
    // Agora exige sessao e descobre os destinatarios aqui.
    const token=(event.headers.authorization||'').replace(/^Bearer\s+/i,'')
    if(!token)return{statusCode:401,body:JSON.stringify({error:'Sem sessao.'})}

    const{data:userData,error:userErr}=await admin.auth.getUser(token)
    if(userErr||!userData||!userData.user)return{statusCode:401,body:JSON.stringify({error:'Sessao invalida.'})}
    const autorId=userData.user.id

    const{requestId}=JSON.parse(event.body||'{}')
    if(!requestId)return{statusCode:400,body:JSON.stringify({error:'Falta requestId.'})}

    // O pedido tem de existir e pertencer a quem esta a chamar.
    const{data:pedido}=await admin.from('requests')
      .select('id,client_id,title,category,location,budget_from,budget_to')
      .eq('id',requestId).maybeSingle()
    if(!pedido)return{statusCode:404,body:JSON.stringify({error:'Pedido nao encontrado.'})}
    if(pedido.client_id!==autorId)return{statusCode:403,body:JSON.stringify({error:'O pedido nao e teu.'})}

    // Limite por hora deste cliente.
    const desde=new Date(Date.now()-3600000).toISOString()
    const{count:recentes}=await admin.from('requests')
      .select('id',{count:'exact',head:true})
      .eq('client_id',autorId).gte('notified_at',desde)
    if(recentes>=MAX_PEDIDOS_POR_HORA)return{statusCode:429,body:JSON.stringify({error:'Demasiados pedidos numa hora. Tenta mais tarde.'})}

    // Reclama o pedido de forma atomica: so a primeira chamada passa. Chamadas
    // repetidas com o mesmo requestId ficam sem efeito.
    const{data:reclamado}=await admin.from('requests')
      .update({notified_at:new Date().toISOString()})
      .eq('id',requestId).is('notified_at',null).select('id')
    if(!reclamado||!reclamado.length)return{statusCode:200,body:JSON.stringify({sent:0,skipped:true,reason:'pedido ja notificado'})}

    const{data:pros}=await admin.from('profiles')
      .select('id,name,notify_email,location,plan')
      .eq('category',pedido.category)
      .eq('approved',true).eq('suspended',false).eq('is_demo',false)
      .neq('id',autorId)
      .limit(200)

    const candidatos=ordenarPorRelevancia((pros||[]).filter(p=>p.notify_email!==false),pedido.location).slice(0,MAX_DESTINATARIOS)
    if(!candidatos.length)return{statusCode:200,body:JSON.stringify({sent:0,reason:'ninguem nesta categoria'})}

    // Push nao depende de ter email: manda a todos os candidatos da categoria.
    // (esperamos por eles: numa funcao serverless, o que fica por esperar pode nunca correr)
    await Promise.allSettled(candidatos.map(p=>sendPush(p.id,{
      title:`Novo pedido em ${pedido.category}`,
      body:pedido.title,
      url:'/pedidos.html',
      tag:'request-'+pedido.id
    })))
    // WhatsApp: só a quem ligou os alertas no painel (desligado sem Twilio).
    await sendWhatsApp(candidatos.map(p=>p.id),'pedido',()=>[pedido.category,pedido.title,pedido.location||'Portugal']).catch(()=>{})

    // Os emails vem do auth, nao de profiles.
    const{data:enderecos}=await admin.rpc('emails_for',{ids:candidatos.map(p=>p.id)})
    const mapa={}
    ;(enderecos||[]).forEach(function(e){mapa[e.id]=e.email})
    const alvos=candidatos.map(function(p){return{name:p.name,email:mapa[p.id]}}).filter(function(p){return !!p.email})
    if(!alvos.length)return{statusCode:200,body:JSON.stringify({sent:0,reason:'ninguem nesta categoria'})}

    const titulo=esc(pedido.title)
    const cat=esc(pedido.category)
    const local=esc(pedido.location||'Portugal')
    const de=eur(pedido.budget_from), ate=eur(pedido.budget_to)
    const orcamento=de?(ate&&ate!==de?de+' a '+ate:'a partir de '+de):null
    const link=SITE+'/pedidos'

    let enviados=0
    for(const p of alvos){
      const html=`
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <div style="font-size:22px;font-weight:800;color:#132420;margin-bottom:20px">Flink<span style="color:#E8720A">o</span></div>
        <h2 style="color:#14181F;font-size:18px;margin-bottom:8px">Novo pedido em ${cat}</h2>
        <p style="color:#5B6270;font-size:14px;line-height:1.6">Ol&aacute;${p.name?' '+esc(p.name):''},</p>
        <p style="color:#5B6270;font-size:14px;line-height:1.6">Algu&eacute;m publicou um pedido que pode ser para ti:</p>
        <div style="background:#F7F8FA;padding:14px 16px;border-left:3px solid #E8720A;border-radius:6px;color:#14181F;font-size:14px;margin:16px 0">
          <strong>${titulo}</strong><br/>${local}${orcamento?' &middot; '+esc(orcamento):''}
        </div>
        <a href="${link}" style="display:inline-block;background:#E8720A;color:#fff;padding:11px 22px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:700">Ver pedido e responder</a>
        <p style="color:#94a3b8;font-size:12px;margin-top:24px">Recebeste este email porque tens perfil na categoria "${cat}". Podes desligar os avisos no teu painel.</p>
      </div>`

      const resp=await fetch('https://api.resend.com/emails',{
        method:'POST',
        headers:{'Authorization':`Bearer ${RESEND_API_KEY}`,'Content-Type':'application/json'},
        body:JSON.stringify({from:FROM,to:[p.email],subject:`Novo pedido em ${pedido.category} na Flinko`,html})
      })
      if(resp.ok)enviados++
      else console.error('Resend error:',await resp.text())
    }

    return{statusCode:200,body:JSON.stringify({sent:enviados})}
  }catch(err){
    console.error('notify-request error:',err)
    return{statusCode:500,body:JSON.stringify({error:err.message})}
  }
}
