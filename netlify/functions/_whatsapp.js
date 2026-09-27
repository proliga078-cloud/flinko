// Alertas no WhatsApp para profissionais (via Twilio).
//
// Fica desligado até existirem estas variáveis no Netlify:
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
//   TWILIO_WHATSAPP_FROM      número WhatsApp da Flinko, ex.: +351912345678
//   TWILIO_TPL_PEDIDO         ContentSid (HX...) do modelo "novo pedido"
//                             variáveis: {{1}} categoria, {{2}} título, {{3}} zona
//   TWILIO_TPL_MENSAGEM       ContentSid (HX...) do modelo "nova mensagem"
//                             variáveis: {{1}} nome de quem escreveu, {{2}} início da mensagem
// Mensagens iniciadas pela empresa só podem usar modelos aprovados pela Meta,
// por isso cada tipo de alerta tem o seu modelo. Sem o modelo, esse alerta não sai.
//
// Só recebe quem ligou os alertas no painel (profile_private.whatsapp_alerts)
// e tem um telemóvel válido guardado.
const{createClient}=require('@supabase/supabase-js')

const SID=process.env.TWILIO_ACCOUNT_SID
const TOKEN=process.env.TWILIO_AUTH_TOKEN
const FROM=process.env.TWILIO_WHATSAPP_FROM
const MODELOS={pedido:process.env.TWILIO_TPL_PEDIDO,mensagem:process.env.TWILIO_TPL_MENSAGEM}
const admin=process.env.SUPABASE_URL?createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY):null

function enabled(){return !!(SID&&TOKEN&&FROM)}

// Telemóvel em formato internacional (+351912345678) ou null.
// Números portugueses sem indicativo: só telemóveis (começam por 9).
function normalizarTelemovel(v){
  let t=String(v||'').replace(/[\s().-]/g,'')
  if(t.startsWith('00'))t='+'+t.slice(2)
  if(/^9\d{8}$/.test(t))t='+351'+t
  if(/^\+3519\d{8}$/.test(t))return t
  if(/^\+351/.test(t))return null // fixo português: não tem WhatsApp
  return /^\+[1-9]\d{7,14}$/.test(t)?t:null
}

function corta(s,n){s=String(s==null?'':s).replace(/\s+/g,' ').trim();return s.length>n?s.slice(0,n-1)+'…':s}

async function enviar(para,modelo,vars){
  const body=new URLSearchParams({From:'whatsapp:'+FROM,To:'whatsapp:'+para,ContentSid:modelo,ContentVariables:JSON.stringify(vars)})
  const r=await fetch('https://api.twilio.com/2010-04-01/Accounts/'+SID+'/Messages.json',{
    method:'POST',
    headers:{'Authorization':'Basic '+Buffer.from(SID+':'+TOKEN).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},
    body:body.toString()
  })
  if(!r.ok){console.error('Twilio error:',r.status,await r.text().catch(()=>''));return false}
  return true
}

// Envia o alerta `tipo` a cada profissional que o ligou. varsDe(id) devolve
// as variáveis do modelo para essa pessoa. Devolve quantos foram enviados.
async function sendWhatsApp(ids,tipo,varsDe,db){
  const modelo=MODELOS[tipo]
  if(!enabled()||!modelo)return{sent:0,skipped:true}
  db=db||admin
  const lista=[...new Set((ids||[]).filter(Boolean))]
  if(!lista.length)return{sent:0}
  const{data}=await db.from('profile_private').select('profile_id,phone,whatsapp_alerts').in('profile_id',lista).eq('whatsapp_alerts',true)
  let sent=0
  for(const row of data||[]){
    const tel=normalizarTelemovel(row.phone)
    if(!tel)continue
    const vars={}
    ;(varsDe(row.profile_id)||[]).forEach((v,i)=>{vars[String(i+1)]=corta(v,120)||'-'})
    try{if(await enviar(tel,modelo,vars))sent++}catch(e){console.error('whatsapp:',e.message)}
  }
  return{sent}
}

module.exports={sendWhatsApp,enabled,normalizarTelemovel}
