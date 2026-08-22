const Stripe=require('stripe')
const{createClient}=require('@supabase/supabase-js')
const stripe=Stripe(process.env.STRIPE_SECRET_KEY)
const supabase=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY)

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
plan=sub.metadata?.plan||plan
}
if(userId){
await supabase.from('profiles').update({plan,stripe_customer_id:session.customer,stripe_subscription_id:session.subscription}).eq('id',userId)
}
}else if(stripeEvent.type==='customer.subscription.updated'){
const sub=stripeEvent.data.object
// Estados que dao direito ao plano pago. Qualquer outro (past_due, unpaid,
// canceled, incomplete_expired, paused) faz voltar ao gratis.
const ativo=['active','trialing'].includes(sub.status)
const plano=ativo?(sub.metadata?.plan||'pro'):'free'
await supabase.from('profiles').update({plan:plano}).eq('stripe_subscription_id',sub.id)
console.log('subscription.updated',sub.id,sub.status,'->',plano)
}else if(stripeEvent.type==='customer.subscription.deleted'){
const sub=stripeEvent.data.object
await supabase.from('profiles').update({plan:'free',stripe_subscription_id:null}).eq('stripe_subscription_id',sub.id)
}else if(stripeEvent.type==='charge.dispute.created'){
// Uma contestação de pagamento (chargeback) é um sinal de risco/fraude —
// suspendemos de imediato a visibilidade pública do perfil (a mesma flag
// 'suspended' que a moderação manual usa) até alguém da equipa rever o
// caso. Deliberadamente NÃO mexemos em plan/stripe_subscription_id aqui:
// a subscrição pode continuar ativa e a disputa pode ainda resolver-se a
// favor da Proliga — mudar o plano de forma preventiva arriscava cair no
// mesmo ciclo de "o próximo webhook da subscrição repõe o plano sozinho"
// que foi corrigido no admin (ver admin-set-plan.js). Um humano decide o
// resto a partir do separador Profissionais/RGPD do admin.
const dispute=stripeEvent.data.object
if(dispute.charge){
const charge=await stripe.charges.retrieve(dispute.charge)
const customerId=typeof charge.customer==='string'?charge.customer:(charge.customer&&charge.customer.id)
if(customerId){
await supabase.from('profiles').update({suspended:true}).eq('stripe_customer_id',customerId)
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
