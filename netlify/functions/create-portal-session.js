const Stripe=require('stripe')
const{createClient}=require('@supabase/supabase-js')
const stripe=Stripe(process.env.STRIPE_SECRET_KEY)
const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY)

exports.handler=async(event)=>{
  if(event.httpMethod!=='POST')return{statusCode:405,body:'Method Not Allowed'}
  try{
    // O customerId vinha do browser sem prova nenhuma de que pertencia a
    // quem pedia — qualquer pessoa com sessao podia ler o stripe_customer_id
    // de OUTRO utilizador (a coluna e legivel por qualquer conta autenticada)
    // e abrir o portal de faturacao dela: ver faturas, cartao, e ate cancelar
    // a subscricao de outra pessoa. Agora exige sessao valida e vai buscar o
    // customerId aqui, ao proprio perfil de quem pediu — nunca ao que o
    // browser mandar.
    const token=(event.headers.authorization||'').replace(/^Bearer\s+/i,'')
    if(!token)return{statusCode:401,body:JSON.stringify({error:'Sem sessão. Inicia sessão primeiro.'})}
    const{data:userData,error:userErr}=await admin.auth.getUser(token)
    if(userErr||!userData||!userData.user)return{statusCode:401,body:JSON.stringify({error:'Sessão inválida. Inicia sessão novamente.'})}
    const userId=userData.user.id

    const{data:profile}=await admin.from('profiles').select('stripe_customer_id').eq('id',userId).maybeSingle()
    const customerId=profile&&profile.stripe_customer_id
    if(!customerId)return{statusCode:400,body:JSON.stringify({error:'Ainda não tens uma subscrição paga ativa.'})}

    const siteUrl=process.env.URL||`https://${event.headers.host}`
    const portal=await stripe.billingPortal.sessions.create({customer:customerId,return_url:`${siteUrl}/dashboard.html`})
    return{statusCode:200,body:JSON.stringify({url:portal.url})}
  }catch(err){
    console.error('create-portal-session error:',err)
    return{statusCode:500,body:JSON.stringify({error:err.message})}
  }
}
