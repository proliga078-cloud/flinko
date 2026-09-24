// Receita real vinda do Stripe, para o painel admin (admin.html). Só donos.
//
// O MRR do painel era uma estimativa (nº de perfis com plano pago × preço que
// o admin escreve nas Definições): não sabia de descontos, pagamentos
// falhados, reembolsos, disputas nem cancelamentos. Esta função lê o que
// aconteceu de facto na conta Stripe:
//   - dinheiro recebido, taxas, reembolsos e líquido por mês (6 meses);
//   - MRR das subscrições ativas, com os preços reais de cada uma;
//   - subscrições com pagamento em atraso e cancelamentos recentes;
//   - disputas (chargebacks) dos últimos 90 dias e saldo disponível.
const Stripe=require('stripe')
const{createClient}=require('@supabase/supabase-js')
const{json,requireAdmin}=require('./_admin.js')
const stripe=Stripe(process.env.STRIPE_SECRET_KEY)
const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY)

const DAY=86400
const MAX_ITEMS=3000 // limite de segurança para não percorrer contas enormes

// Valor mensal de um item de subscrição, em cêntimos.
function monthlyCents(item){
  const price=item.price||item.plan||{}
  const rec=price.recurring||{interval:price.interval,interval_count:price.interval_count}
  const amount=(price.unit_amount!=null?price.unit_amount:price.amount||0)*(item.quantity||1)
  const every=rec.interval_count||1
  switch(rec.interval){
    case'year':return amount/(12*every)
    case'week':return amount*52/12/every
    case'day':return amount*365/12/every
    default:return amount/every
  }
}

// Desconto de um cupão, aplicado ao valor mensal.
function applyDiscount(cents,sub){
  const c=sub.discount&&sub.discount.coupon
  if(!c)return cents
  if(c.percent_off)return cents*(1-c.percent_off/100)
  if(c.amount_off)return Math.max(0,cents-c.amount_off)
  return cents
}

async function collect(list){
  const out=[]
  for await(const x of list){out.push(x);if(out.length>=MAX_ITEMS)break}
  return out
}

const monthKey=ts=>{const d=new Date(ts*1000);return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')}

// Função pura (testável): resume transações e subscrições.
function summarize({transactions=[],subscriptions=[],canceled=[],disputes=[],balance=null,now=Math.floor(Date.now()/1000),names={}}){
  const months={}
  const start=new Date(now*1000);start.setUTCDate(1)
  for(let i=5;i>=0;i--){const d=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()-i,1));months[d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')]={gross:0,refunds:0,fees:0,disputes:0,net:0}}
  let gross30=0,refunds30=0,fees30=0,net30=0
  for(const t of transactions){
    const m=months[monthKey(t.created)]
    const recent=t.created>=now-30*DAY
    const isCharge=t.type==='charge'||t.type==='payment'
    const isRefund=t.type==='refund'||t.type==='payment_refund'
    const isDispute=t.type==='adjustment'&&/dispute/i.test(t.reporting_category||t.description||'')
    if(m){
      if(isCharge)m.gross+=t.amount
      if(isRefund)m.refunds+=-t.amount
      if(isDispute)m.disputes+=-t.amount
      m.fees+=t.fee||0
      m.net+=t.net
    }
    if(recent){
      if(isCharge)gross30+=t.amount
      if(isRefund)refunds30+=-t.amount
      fees30+=t.fee||0
      net30+=t.net
    }
  }
  const live=subscriptions.filter(s=>['active','trialing','past_due'].includes(s.status))
  const mrr=live.filter(s=>s.status!=='trialing').reduce((sum,s)=>sum+applyDiscount((s.items&&s.items.data||[]).reduce((a,i)=>a+monthlyCents(i),0),s),0)
  const who=s=>names[typeof s.customer==='string'?s.customer:(s.customer&&s.customer.id)]||null
  const pastDue=subscriptions.filter(s=>s.status==='past_due'||s.status==='unpaid').map(s=>({id:s.id,customer:who(s),since:s.current_period_start||s.created,monthly:Math.round((s.items&&s.items.data||[]).reduce((a,i)=>a+monthlyCents(i),0))}))
  const churned30=canceled.filter(s=>(s.canceled_at||s.ended_at||0)>=now-30*DAY).map(s=>({id:s.id,customer:who(s),canceled_at:s.canceled_at||s.ended_at,reason:s.cancellation_details&&s.cancellation_details.reason||null}))
  const eur=b=>b?(b.find(x=>x.currency==='eur')||b[0]||{amount:0}).amount:0
  return{
    currency:'eur',
    last30:{gross:gross30,refunds:refunds30,fees:fees30,net:net30},
    months:Object.entries(months).map(([month,v])=>({month,...v})),
    mrr:Math.round(mrr),
    subscriptions:{active:live.filter(s=>s.status==='active').length,trialing:live.filter(s=>s.status==='trialing').length,pastDue:pastDue.length},
    pastDue,
    churned30,
    disputes:disputes.map(d=>({id:d.id,amount:d.amount,status:d.status,reason:d.reason,created:d.created,customer:names[d.customer]||null})),
    balance:balance?{available:eur(balance.available),pending:eur(balance.pending)}:null
  }
}

exports.handler=async(event)=>{
  if(event.httpMethod!=='POST')return{statusCode:405,body:'Method Not Allowed'}
  try{
    const auth=await requireAdmin(admin,event,{owner:true})
    if(auth.error)return auth.error
    if(!process.env.STRIPE_SECRET_KEY)return json(503,{error:'STRIPE_SECRET_KEY não está configurada no Netlify.'})

    const now=Math.floor(Date.now()/1000)
    const since=now-190*DAY
    const[transactions,allSubs,disputes,balance]=await Promise.all([
      collect(stripe.balanceTransactions.list({created:{gte:since},limit:100})),
      collect(stripe.subscriptions.list({status:'all',limit:100})),
      collect(stripe.disputes.list({created:{gte:now-90*DAY},limit:100})),
      stripe.balance.retrieve().catch(()=>null)
    ])
    const subscriptions=allSubs.filter(s=>s.status!=='canceled'),canceled=allSubs.filter(s=>s.status==='canceled')

    // Nome do perfil Flinko de cada cliente Stripe, para a lista de atrasos.
    const ids=[...new Set(subscriptions.concat(canceled).map(s=>typeof s.customer==='string'?s.customer:s.customer&&s.customer.id).concat(disputes.map(d=>d.customer)).filter(Boolean))]
    const names={}
    if(ids.length){
      const{data}=await admin.from('profiles').select('stripe_customer_id,name,id').in('stripe_customer_id',ids)
      ;(data||[]).forEach(p=>{names[p.stripe_customer_id]={name:p.name,profile_id:p.id}})
    }

    return json(200,summarize({transactions,subscriptions,canceled,disputes,balance,now,names}))
  }catch(err){
    console.error('admin-stripe-summary error:',err)
    return json(500,{error:err.message})
  }
}

exports.summarize=summarize
exports.monthlyCents=monthlyCents
