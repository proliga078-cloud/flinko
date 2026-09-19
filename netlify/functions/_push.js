// Modulo interno (nao e uma function exposta - nao tem exports.handler).
// Usado por outras functions para mandar notificacoes push a um profile_id.
const webpush=require('web-push')
const{createClient}=require('@supabase/supabase-js')

const VAPID_PUBLIC=process.env.VAPID_PUBLIC_KEY
const VAPID_PRIVATE=process.env.VAPID_PRIVATE_KEY
const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY)

if(VAPID_PUBLIC&&VAPID_PRIVATE){
  // O contacto do VAPID e enviado aos servicos de push (Google, Apple, Mozilla);
  // configura VAPID_SUBJECT no Netlify com um email da Flinko.
  webpush.setVapidDetails(process.env.VAPID_SUBJECT||'mailto:flinkogeral@gmail.com',VAPID_PUBLIC,VAPID_PRIVATE)
}

// Manda uma notificacao push a todos os dispositivos subscritos de um
// profile_id. Nunca rebenta a function que a chama: falhas ficam so em log.
async function sendPush(profileId,{title,body,url,tag}){
  if(!VAPID_PUBLIC||!VAPID_PRIVATE)return{skipped:true,reason:'VAPID nao configurado'}
  try{
    const{data:subs}=await admin.from('push_subscriptions').select('id,endpoint,p256dh,auth').eq('profile_id',profileId)
    if(!subs||!subs.length)return{skipped:true,reason:'sem subscricoes'}

    const payload=JSON.stringify({title,body,url,tag})
    const results=await Promise.allSettled(subs.map(s=>
      webpush.sendNotification({endpoint:s.endpoint,keys:{p256dh:s.p256dh,auth:s.auth}},payload)
    ))

    // Subscricoes mortas (410/404) sao removidas para nao tentarmos sempre.
    const mortas=[]
    results.forEach((r,i)=>{
      if(r.status==='rejected'){
        const code=r.reason&&r.reason.statusCode
        if(code===410||code===404)mortas.push(subs[i].id)
      }
    })
    if(mortas.length)await admin.from('push_subscriptions').delete().in('id',mortas)

    return{sent:results.filter(r=>r.status==='fulfilled').length,removed:mortas.length}
  }catch(err){
    console.error('sendPush error:',err)
    return{error:err.message}
  }
}

module.exports={sendPush}
