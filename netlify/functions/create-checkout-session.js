const Stripe=require('stripe')
const{createClient}=require('@supabase/supabase-js')
const stripe=Stripe(process.env.STRIPE_SECRET_KEY)
const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY)
// Apenas o plano Pro esta a venda. O Premium foi descontinuado do site;
// subscricoes antigas continuam validas mas nao se aceitam novas.
const PRICE_MAP={pro_monthly:process.env.STRIPE_PRICE_PRO_MONTHLY,pro_yearly:process.env.STRIPE_PRICE_PRO_YEARLY}

exports.handler=async(event)=>{
if(event.httpMethod!=='POST')return{statusCode:405,body:'Method Not Allowed'}
try{
// O userId e o email vinham do browser, sem prova nenhuma de que quem
// pedia era mesmo essa pessoa — dava para criar uma subscricao paga
// (com o cartao do proprio atacante) e atribui-la ao ID de outra conta
// qualquer, sobrepondo-se ao stripe_customer_id/plano dela. Agora exige
// sessao valida e descobre o userId/email aqui, a partir do token.
const token=(event.headers.authorization||'').replace(/^Bearer\s+/i,'')
if(!token)return{statusCode:401,body:JSON.stringify({error:'Sem sessão. Inicia sessão primeiro.'})}
const{data:userData,error:userErr}=await admin.auth.getUser(token)
if(userErr||!userData||!userData.user)return{statusCode:401,body:JSON.stringify({error:'Sessão inválida. Inicia sessão novamente.'})}
const userId=userData.user.id
const email=userData.user.email
const{plan,billing}=JSON.parse(event.body||'{}')
const priceId=PRICE_MAP[`${plan}_${billing}`]
if(!priceId)return{statusCode:400,body:JSON.stringify({error:'Plano ou periodicidade inválidos.'})}
const siteUrl=process.env.URL||`https://${event.headers.host}`
const session=await stripe.checkout.sessions.create({
mode:'subscription',
payment_method_types:['card'],
line_items:[{price:priceId,quantity:1}],
customer_email:email,
client_reference_id:userId,
subscription_data:{metadata:{supabase_user_id:userId,plan}},
// A Proliga esta no regime de isencao do artigo 53.o do CIVA, por isso
// nao liquida IVA. O automatic_tax fica DESLIGADO de proposito: o preco
// mostrado no site e o valor final que o cliente paga.
// Se um dia o volume de negocios ultrapassar o limiar do art. 53.o,
// e preciso registar o IVA em Tax > Localizacoes no Stripe e voltar a
// ligar automatic_tax:{enabled:true} aqui.
// A morada e o NIF continuam a ser recolhidos porque sao necessarios
// para emitir a fatura ao profissional.
billing_address_collection:'required',
tax_id_collection:{enabled:true},
success_url:`${siteUrl}/dashboard.html?checkout=success`,
cancel_url:`${siteUrl}/pricing.html?checkout=cancel`,
allow_promotion_codes:true
})
return{statusCode:200,body:JSON.stringify({url:session.url})}
}catch(err){
console.error('create-checkout-session error:',err)
return{statusCode:500,body:JSON.stringify({error:err.message})}
}
}
