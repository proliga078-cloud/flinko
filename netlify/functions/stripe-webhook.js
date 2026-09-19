const Stripe=require('stripe')
const{createClient}=require('@supabase/supabase-js')
const stripe=Stripe(process.env.STRIPE_SECRET_KEY)
const supabase=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY)

// price id do Stripe -> plano. Esta e a fonte de verdade do plano: o
// metadata.plan so e escrito no checkout, por isso ficava desatualizado se o
// cliente mudasse de plano no portal de faturacao.
const PLAN_BY_PRICE={}
for(const[envName,plan]of[
['STRIPE_PRICE_STARTER_MONTHLY','starter'],['STRIPE_PRICE_STARTER_YEARLY','starter'],
['STRIPE_PRICE_PRO_MONTHLY','pro'],['STRIPE_PRICE_PRO_YEARLY','pro']
]){
if(process.env[envName])PLAN_BY_PRICE[process.env[envName]]=plan
}

function planOf(sub){
const item=sub&&sub.items&&sub.items.data&&sub.items.data[0]
const priceId=item&&item.price&&item.price.id
return PLAN_BY_PRICE[priceId]||(sub&&sub.metadata&&sub.metadata.plan)||'pro'
}

// O supabase-js devolve {error} em vez de lancar excecao. Se o erro for
// ignorado, o webhook responde 200, o Stripe nao volta a tentar e o cliente
// fica a pagar num plano que a BD nao registou. Aqui o erro sobe ate ao
// catch do handler, que responde 500 e faz o Stripe repetir o evento.
async function updateProfiles(patch,column,value){
const{error}=await supabase.from('profiles').update(patch).eq(column,value)
if(error)throw new Error('Falha ao atualizar profiles ('+column+'): '+error.message)
}

exports.handler=async(event)=>{
const sig=event.headers['stripe-signature']
let stripeEvent
try{
const payload=event.isBase64Encoded?Buffer.from(event.body,'base64'):event.body
stripeEvent=stripe.webhooks.constructEvent(payload,sig,process.env.STRIPE_WEBHOOK_SECRET)
}catch(err){
console.error('Webhook signature verification failed:',err.message)
return{statusCode:400,body:`Webhook Error: ${err.message}`}
}
try{
if(stripeEvent.type==='checkout.session.completed'){
const session=stripeEvent.data.object
const userId=session.client_reference_id
let plan='pro'
if(session.subscription){
const sub=await stripe.subscriptions.retrieve(session.subscription)
plan=planOf(sub)
}
if(userId){
await updateProfiles({plan,stripe_customer_id:session.customer,stripe_subscription_id:session.subscription},'id',userId)
}else{
console.warn('checkout.session.completed sem client_reference_id: nenhum perfil atualizado. session=',session.id)
}
}else if(stripeEvent.type==='customer.subscription.updated'){
const sub=stripeEvent.data.object
// active/trialing dao direito ao plano pago. past_due tambem: o Stripe
// tenta cobrar de novo durante dias e, se falhar tudo, envia unpaid ou
// canceled — so ai o plano volta a gratis. Cortar ao primeiro cartao
// recusado penalizava clientes com um problema temporario.
const ativo=['active','trialing','past_due'].includes(sub.status)
const plano=ativo?planOf(sub):'free'
await updateProfiles({plan:plano},'stripe_subscription_id',sub.id)
console.log('subscription.updated',sub.id,sub.status,'->',plano)
}else if(stripeEvent.type==='customer.subscription.deleted'){
const sub=stripeEvent.data.object
await updateProfiles({plan:'free',stripe_subscription_id:null},'stripe_subscription_id',sub.id)
}else if(stripeEvent.type==='charge.dispute.created'){
// Uma contestação de pagamento (chargeback) é um sinal de risco/fraude —
// suspendemos de imediato a visibilidade pública do perfil (a mesma flag
// 'suspended' que a moderação manual usa) até alguém da equipa rever o
// caso. Deliberadamente NÃO mexemos em plan/stripe_subscription_id aqui:
// a subscrição pode continuar ativa e a disputa pode ainda resolver-se a
// favor da Flinko — mudar o plano de forma preventiva arriscava cair no
// mesmo ciclo de "o próximo webhook da subscrição repõe o plano sozinho"
// que foi corrigido no admin (ver admin-set-plan.js). Um humano decide o
// resto a partir do separador Profissionais/RGPD do admin.
const dispute=stripeEvent.data.object
if(dispute.charge){
const charge=await stripe.charges.retrieve(dispute.charge)
const customerId=typeof charge.customer==='string'?charge.customer:(charge.customer&&charge.customer.id)
if(customerId){
await updateProfiles({suspended:true},'stripe_customer_id',customerId)
console.warn('charge.dispute.created: perfil suspenso automaticamente por contestação de pagamento. dispute=',dispute.id,'customer=',customerId)
}else{
console.warn('charge.dispute.created: charge sem customer associado, nada para suspender. dispute=',dispute.id)
}
}else{
console.warn('charge.dispute.created: evento sem charge associado. dispute=',dispute.id)
}
}
return{statusCode:200,body:JSON.stringify({received:true})}
}catch(err){
console.error('stripe-webhook handler error:',err)
return{statusCode:500,body:JSON.stringify({error:err.message})}
}
}
