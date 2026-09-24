// Muda o plano de um profissional a partir do painel admin (admin.html),
// mas de forma segura para quem já tem uma subscrição Stripe real.
//
// Bug encontrado em auditoria: admin.html mudava profiles.plan diretamente
// do browser (saveProfileEdit / saveSubEdit / revertToFreePlan), sem tocar
// em stripe_subscription_id. Se o profissional tivesse uma subscrição Stripe
// ainda ativa nesse momento:
//   1) o cliente continuava a ser cobrado todos os meses por um plano que a
//      Proliga já não lhe estava a dar (o admin "revertia para Free" mas o
//      Stripe não sabia disso e não parava de cobrar); e
//   2) na próxima renovação, stripe-webhook.js recebe customer.subscription.updated
//      para essa MESMA subscrição (que continua "active" porque nunca foi
//      cancelada) e faz `.eq('stripe_subscription_id', sub.id)` — o que
//      REPÕE sozinho o plano antigo, desfazendo silenciosamente a ação do
//      admin sem erro nenhum.
//
// Esta função corre no servidor (tem a chave secreta do Stripe) e, sempre
// que o perfil tem uma subscrição Stripe associada, cancela-a a sério antes
// de mudar o plano, e desliga stripe_subscription_id do perfil para nenhum
// webhook futuro voltar a mexer nele.
const Stripe=require('stripe')
const{createClient}=require('@supabase/supabase-js')
const stripe=Stripe(process.env.STRIPE_SECRET_KEY)
const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY)
const{requireAdmin,audit}=require('./_admin.js')

const ALLOWED_PLANS=['free','starter','pro','premium']

exports.handler=async(event)=>{
  if(event.httpMethod!=='POST')return{statusCode:405,body:'Method Not Allowed'}
  try{
    // Confirma que quem pede é mesmo admin e dono (os admins de apoio não
    // mexem em dinheiro) — lê o perfil diretamente com a service role (que
    // ignora RLS), em vez de confiar em nada vindo do browser.
    const auth=await requireAdmin(admin,event,{owner:true})
    if(auth.error)return auth.error

    const body=JSON.parse(event.body||'{}')
    const{targetProfileId,plan}=body
    if(!targetProfileId||typeof targetProfileId!=='string')return{statusCode:400,body:JSON.stringify({error:'targetProfileId em falta.'})}
    if(!ALLOWED_PLANS.includes(plan))return{statusCode:400,body:JSON.stringify({error:'Plano inválido.'})}

    const{data:target,error:targetErr}=await admin.from('profiles').select('id,name,plan,stripe_subscription_id').eq('id',targetProfileId).maybeSingle()
    if(targetErr)return{statusCode:500,body:JSON.stringify({error:targetErr.message})}
    if(!target)return{statusCode:404,body:JSON.stringify({error:'Perfil não encontrado.'})}

    const updates={plan}
    if(target.stripe_subscription_id){
      try{
        const sub=await stripe.subscriptions.retrieve(target.stripe_subscription_id)
        if(sub&&sub.status!=='canceled'){
          await stripe.subscriptions.cancel(target.stripe_subscription_id)
        }
      }catch(stripeErr){
        // resource_missing = a subscrição já não existe no Stripe (p.ex. já
        // tinha sido cancelada por outra via) — não é um erro real, seguimos
        // para atualizar o perfil na mesma.
        if(stripeErr.code!=='resource_missing'){
          console.error('admin-set-plan: erro ao cancelar subscrição Stripe:',stripeErr)
          return{statusCode:502,body:JSON.stringify({error:'Não foi possível cancelar a subscrição no Stripe: '+stripeErr.message})}
        }
      }
      // Sem isto, o próximo evento do Stripe para esta subscrição (mesmo já
      // cancelada, alguns eventos ainda chegam) voltava a encontrar este
      // perfil por stripe_subscription_id e a reescrever o plano.
      updates.stripe_subscription_id=null
    }

    const{error:updateErr}=await admin.from('profiles').update(updates).eq('id',targetProfileId)
    if(updateErr)return{statusCode:500,body:JSON.stringify({error:updateErr.message})}

    await audit(admin,auth.user,'plano_alterado',{targetType:'profile',targetId:targetProfileId,summary:`Plano de ${target.name||'—'}: ${target.plan||'free'} → ${plan}${target.stripe_subscription_id?' (subscrição Stripe cancelada)':''}`,details:{de:target.plan||'free',para:plan,stripeCancelled:!!target.stripe_subscription_id}})

    return{statusCode:200,body:JSON.stringify({success:true,stripeCancelled:!!target.stripe_subscription_id})}
  }catch(err){
    console.error('admin-set-plan error:',err)
    return{statusCode:500,body:JSON.stringify({error:err.message})}
  }
}
