// Reembolsos Stripe a partir do painel admin (admin.html).
//
// Lacuna encontrada em auditoria: quando havia uma disputa (chargeback) ou
// uma reclamação legítima de um cliente, o admin conseguia suspender o
// perfil (toggleSuspended) ou cancelar a subscrição (admin-set-plan.js),
// mas não existia NENHUMA forma de devolver o dinheiro — o próprio
// reembolso, que costuma ser a forma mais rápida e barata de resolver uma
// disputa antes de ela virar chargeback definitivo (com taxa fixa para a
// Proliga), tinha de ser feito manualmente fora do site, no dashboard do
// Stripe, por quem tivesse acesso a essa conta.
//
// Esta função corre no servidor (tem a chave secreta do Stripe) e serve
// duas ações relacionadas, ambas exigindo admin:
//   action:"list"   -> devolve os últimos pagamentos (charges) do cliente
//                       Stripe associado ao perfil, para o admin escolher
//                       qual reembolsar.
//   action:"refund" -> emite o reembolso (total ou parcial) de um desses
//                       charges.
//
// Isto NÃO mexe em profiles.plan nem em stripe_subscription_id — um
// reembolso não implica cancelar a subscrição (o cliente pode continuar
// subscrito depois de ser reembolsado por um mês em concreto), por isso
// fica deliberadamente fora do âmbito desta função. Se o admin também
// quiser cancelar o plano, usa a ação separada em admin-set-plan.js.
const Stripe=require('stripe')
const{createClient}=require('@supabase/supabase-js')
const stripe=Stripe(process.env.STRIPE_SECRET_KEY)
const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY)

// Motivos aceites pelo Stripe (stripe.com/docs/api/refunds/create) — não
// inventar outros valores, a API rejeita-os.
const ALLOWED_REASONS=['duplicate','fraudulent','requested_by_customer']

async function requireAdmin(event){
const token=(event.headers.authorization||'').replace(/^Bearer\s+/i,'')
if(!token)return{error:{statusCode:401,body:JSON.stringify({error:'Sem sessão. Inicia sessão primeiro.'})}}
const{data:userData,error:userErr}=await admin.auth.getUser(token)
if(userErr||!userData||!userData.user)return{error:{statusCode:401,body:JSON.stringify({error:'Sessão inválida. Inicia sessão novamente.'})}}
const{data:callerProfile}=await admin.from('profiles').select('is_admin').eq('user_id',userData.user.id).maybeSingle()
if(!callerProfile||!callerProfile.is_admin)return{error:{statusCode:403,body:JSON.stringify({error:'Sem permissões de administrador.'})}}
return{}
}

exports.handler=async(event)=>{
if(event.httpMethod!=='POST')return{statusCode:405,body:'Method Not Allowed'}
try{
const authCheck=await requireAdmin(event)
if(authCheck.error)return authCheck.error

const body=JSON.parse(event.body||'{}')
const{action,targetProfileId}=body
if(!targetProfileId||typeof targetProfileId!=='string')return{statusCode:400,body:JSON.stringify({error:'targetProfileId em falta.'})}

const{data:target,error:targetErr}=await admin.from('profiles').select('id,stripe_customer_id').eq('id',targetProfileId).maybeSingle()
if(targetErr)return{statusCode:500,body:JSON.stringify({error:targetErr.message})}
if(!target)return{statusCode:404,body:JSON.stringify({error:'Perfil não encontrado.'})}

if(action==='list'){
if(!target.stripe_customer_id)return{statusCode:200,body:JSON.stringify({charges:[]})}
const list=await stripe.charges.list({customer:target.stripe_customer_id,limit:10})
const charges=list.data.map(c=>({
id:c.id,
amount:c.amount,
amount_refunded:c.amount_refunded,
currency:c.currency,
refunded:c.refunded,
paid:c.paid,
created:c.created,
description:c.description||null
}))
return{statusCode:200,body:JSON.stringify({charges})}
}

if(action==='refund'){
const{chargeId,amount,reason}=body
if(!chargeId||typeof chargeId!=='string')return{statusCode:400,body:JSON.stringify({error:'chargeId em falta.'})}
if(amount!==undefined&&(!Number.isInteger(amount)||amount<=0))return{statusCode:400,body:JSON.stringify({error:'amount tem de ser um número inteiro de cêntimos maior que zero.'})}
if(reason!==undefined&&!ALLOWED_REASONS.includes(reason))return{statusCode:400,body:JSON.stringify({error:'Motivo de reembolso inválido.'})}
if(!target.stripe_customer_id)return{statusCode:400,body:JSON.stringify({error:'Este perfil não tem nenhum cliente Stripe associado.'})}

// Confirma que o charge é mesmo deste cliente antes de reembolsar — o
// chargeId vem do browser, e mesmo vindo de um admin autenticado é
// barato confirmar que não foi trocado por engano (ex: copiar/colar
// para o perfil errado).
let charge
try{
charge=await stripe.charges.retrieve(chargeId)
}catch(stripeErr){
return{statusCode:502,body:JSON.stringify({error:'Não foi possível consultar o pagamento no Stripe: '+stripeErr.message})}
}
if(charge.customer!==target.stripe_customer_id)return{statusCode:403,body:JSON.stringify({error:'Este pagamento não pertence ao cliente Stripe deste perfil.'})}

try{
const refund=await stripe.refunds.create({
charge:chargeId,
...(amount!==undefined?{amount}:{}),
...(reason?{reason}:{})
})
return{statusCode:200,body:JSON.stringify({success:true,refund:{id:refund.id,amount:refund.amount,status:refund.status}})}
}catch(stripeErr){
console.error('admin-refund: erro ao criar reembolso Stripe:',stripeErr)
return{statusCode:502,body:JSON.stringify({error:'Não foi possível processar o reembolso no Stripe: '+stripeErr.message})}
}
}

return{statusCode:400,body:JSON.stringify({error:'action inválida (usar "list" ou "refund").'})}
}catch(err){
console.error('admin-refund error:',err)
return{statusCode:500,body:JSON.stringify({error:err.message})}
}
}
