// Pedidos RGPD a partir do painel admin (gestao.html › Moderação e apoio), só para donos.
//
// Antes, o painel só mostrava os pedidos: exportar os dados de alguém ou
// apagar uma conta tinha de ser feito à mão no Supabase, e com o prazo legal
// de 30 dias (RGPD, art. 12.º/3) isso ficava facilmente por cumprir.
//
//   action:"export" -> devolve em JSON todos os dados pessoais da conta, para o
//                      admin descarregar e enviar à pessoa.
//   action:"delete" -> apaga a conta de facto: cancela a subscrição Stripe (para
//                      não continuar a cobrar), apaga os ficheiros guardados,
//                      tira o user_id das visitas e apaga o utilizador em
//                      auth.users (o resto cai em cascata pelas chaves
//                      estrangeiras). Exige que o admin escreva o nome da
//                      conta, como confirmação.
//
// O pedido RGPD em si desaparece com a conta (cascata), por isso a prova de
// que foi cumprido fica em admin_audit, que não tem ligação à conta.
const Stripe=require('stripe')
const{createClient}=require('@supabase/supabase-js')
const{json,requireAdmin,audit}=require('./_admin.js')
const stripe=Stripe(process.env.STRIPE_SECRET_KEY)
const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY)

// [tabela, coluna que liga à conta]. Tabelas que não existam são ignoradas.
const EXPORT_TABLES=[
  ['profile_private','profile_id'],
  ['services','professional_id'],
  ['portfolio_items','professional_id'],
  ['reviews','professional_id','reviews_received'],
  ['reviews','client_id','reviews_written'],
  ['conversations','professional_id','conversations_as_professional'],
  ['conversations','client_id','conversations_as_client'],
  ['messages','sender_id','messages_sent'],
  ['requests','client_id'],
  ['request_offers','professional_id'],
  ['jobs','professional_id'],
  ['quotes','professional_id'],
  ['saved_professionals','client_id'],
  ['gdpr_requests','profile_id'],
  ['verification_requests','profile_id'],
  ['support_tickets','reporter_id'],
  ['site_events','user_id']
]

// Pastas onde o site guarda ficheiros de cada conta (ver os upload() em assets/).
const STORAGE_PREFIXES=[
  ['proliga-media','portfolio/'],['proliga-media','profiles/'],['proliga-media','ads/'],
  ['proliga-media','diary/'],['proliga-media','requests/'],['verification-docs','']
]

async function exportData(profileId){
  const out={}
  const{data:profile}=await admin.from('profiles').select('*').eq('id',profileId).maybeSingle()
  out.profile=profile||null
  try{
    const{data}=await admin.auth.admin.getUserById(profile&&profile.user_id||profileId)
    if(data&&data.user)out.account={email:data.user.email,created_at:data.user.created_at,last_sign_in_at:data.user.last_sign_in_at}
  }catch(e){}
  for(const[table,col,key]of EXPORT_TABLES){
    const{data,error}=await admin.from(table).select('*').eq(col,profileId)
    if(!error)out[key||table]=data||[]
  }
  const{data:visits}=await admin.from('site_visits').select('path,referrer,created_at').eq('user_id',profileId)
  if(visits)out.site_visits=visits
  return out
}

async function removeFiles(profileId){
  let removed=0
  for(const[bucket,base]of STORAGE_PREFIXES){
    const folder=base+profileId
    try{
      const{data}=await admin.storage.from(bucket).list(folder,{limit:1000})
      const paths=(data||[]).filter(f=>f&&f.name).map(f=>folder+'/'+f.name)
      if(paths.length){
        const{error}=await admin.storage.from(bucket).remove(paths)
        if(!error)removed+=paths.length
      }
    }catch(e){console.error('admin-gdpr: erro ao apagar ficheiros',bucket,folder,e)}
  }
  return removed
}

exports.handler=async(event)=>{
  if(event.httpMethod!=='POST')return{statusCode:405,body:'Method Not Allowed'}
  try{
    const auth=await requireAdmin(admin,event,{owner:true})
    if(auth.error)return auth.error

    const body=JSON.parse(event.body||'{}')
    const{action,requestId}=body
    if(!requestId||typeof requestId!=='string')return json(400,{error:'requestId em falta.'})

    const{data:req,error:reqErr}=await admin.from('gdpr_requests').select('id,profile_id,request_type,status,created_at').eq('id',requestId).maybeSingle()
    if(reqErr)return json(500,{error:reqErr.message})
    if(!req)return json(404,{error:'Pedido RGPD não encontrado.'})

    const{data:profile}=await admin.from('profiles').select('id,user_id,name,stripe_subscription_id').eq('id',req.profile_id).maybeSingle()
    if(!profile)return json(404,{error:'A conta deste pedido já não existe.'})

    if(action==='export'){
      const data=await exportData(profile.id)
      await audit(admin,auth.user,'rgpd_exportacao',{targetType:'gdpr_requests',targetId:req.id,summary:`Dados de ${profile.name||'—'} exportados (pedido RGPD)`,details:{profile_id:profile.id}})
      return json(200,{generated_at:new Date().toISOString(),request:{id:req.id,type:req.request_type,created_at:req.created_at},data})
    }

    if(action==='delete'){
      if(req.request_type!=='delete')return json(400,{error:'Este pedido não é de eliminação.'})
      if(req.status==='completed'||req.status==='cancelled')return json(400,{error:'Este pedido já está fechado.'})
      if(String(body.confirmName||'').trim()!==String(profile.name||'').trim())return json(400,{error:'O nome escrito não coincide com o nome da conta.'})

      let stripeCancelled=false
      if(profile.stripe_subscription_id){
        try{
          const sub=await stripe.subscriptions.retrieve(profile.stripe_subscription_id)
          if(sub&&sub.status!=='canceled'){await stripe.subscriptions.cancel(profile.stripe_subscription_id);stripeCancelled=true}
        }catch(stripeErr){
          if(stripeErr.code!=='resource_missing'){
            console.error('admin-gdpr: erro ao cancelar subscrição Stripe:',stripeErr)
            return json(502,{error:'Não foi possível cancelar a subscrição no Stripe, por isso a conta não foi apagada: '+stripeErr.message})
          }
        }
      }

      const files=await removeFiles(profile.id)
      await admin.from('site_visits').update({user_id:null}).eq('user_id',profile.id)

      const{error:delErr}=await admin.auth.admin.deleteUser(profile.user_id||profile.id)
      if(delErr){
        console.error('admin-gdpr: erro ao apagar utilizador:',delErr)
        return json(500,{error:'Não foi possível apagar a conta: '+delErr.message})
      }

      await audit(admin,auth.user,'rgpd_eliminacao',{targetType:'profile',targetId:profile.id,
        summary:`Conta de ${profile.name||'—'} eliminada a pedido (RGPD, pedido de ${new Date(req.created_at).toLocaleDateString('pt-PT')})`,
        details:{request_id:req.id,requested_at:req.created_at,files_removed:files,stripe_cancelled:stripeCancelled}})
      return json(200,{success:true,filesRemoved:files,stripeCancelled})
    }

    return json(400,{error:'action inválida (usar "export" ou "delete").'})
  }catch(err){
    console.error('admin-gdpr error:',err)
    return json(500,{error:err.message})
  }
}
