// Envio de emails a um grupo de profissionais a partir do painel admin
// (admin.html › Contactar profissionais). Só donos.
//
// Antes, o painel só abria o mailto: de uma pessoa de cada vez. Aqui o admin
// escolhe um segmento (ex.: "perfil incompleto"), escreve o texto uma vez e o
// servidor envia um email personalizado a cada um pelo Resend (o mesmo
// serviço que já manda as notificações de mensagens).
//
// Por omissão é para comunicações de serviço (sobre a conta e o perfil). Não
// envia a quem desligou os emails no dashboard (profiles.notify_email = false),
// e cada email diz porque foi recebido e como deixar de receber.
// Com promo:true (planos, campanhas) só segue para quem tem consentimento
// registado no painel (admin_items kind "consent", o registo mais recente de
// cada pessoa tem de ser "dado") — RGPD art. 7.º e Lei 41/2004 art. 13.º-A.
//
//   action:"preview" -> conta quantos vão receber e quantos ficam de fora (e
//                       porquê), sem enviar nada.
//   action:"send"    -> envia e regista o envio em admin_audit.
const{createClient}=require('@supabase/supabase-js')
const{json,requireAdmin,audit}=require('./_admin.js')
const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY)

const FROM=process.env.RESEND_FROM||'Flinko <onboarding@resend.dev>'
const REPLY_TO=process.env.RESEND_REPLY_TO||'flinkogeral@gmail.com'
const SITE='https://flinko.pt'
const MAX_RECIPIENTS=500
const BATCH=100

const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const firstName=n=>String(n||'').trim().split(/\s+/)[0]||''
const fill=(txt,p)=>String(txt).replace(/\{nome\}/g,firstName(p.name)).replace(/\{categoria\}/g,(p.category||'a sua área').toLowerCase())

function emailHtml(text){
  const body=esc(text).split(/\n{2,}/).map(par=>`<p style="margin:0 0 14px;font-size:15px;color:#14181F;line-height:1.6">${par.replace(/\n/g,'<br>')}</p>`).join('')
  return `<!DOCTYPE html><html lang="pt"><body style="margin:0;padding:0;background:#FAF8F4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<div style="max-width:520px;margin:0 auto;padding:28px 20px">
  <div style="font-size:20px;font-weight:800;color:#14181F;margin-bottom:22px">Flink<span style="color:#E8720A">o</span></div>
  <div style="background:#fff;border-radius:14px;padding:26px;box-shadow:0 2px 12px rgba(20,24,31,.06)">${body}</div>
  <p style="font-size:12px;color:#707580;text-align:center;margin-top:20px;line-height:1.6">Recebeste este email porque tens uma conta profissional na Flinko.<br/>Para deixares de receber emails da Flinko, desliga os avisos por email no teu <a href="${SITE}/dashboard.html" style="color:#B85608">dashboard</a> ou responde a esta mensagem com PARAR.</p>
</div></body></html>`
}

// Função pura (testável): decide quem recebe e quem fica de fora.
function recipients(profiles,emails,consent=null){
  const ok=[],skipped=[]
  for(const p of profiles){
    if(consent&&consent[p.id]!=='dado'){skipped.push({id:p.id,reason:'sem consentimento para promoções'});continue}
    if(p.is_demo||p.is_admin){skipped.push({id:p.id,reason:'conta de admin ou demo'});continue}
    if(p.suspended){skipped.push({id:p.id,reason:'conta suspensa'});continue}
    if(p.notify_email===false){skipped.push({id:p.id,reason:'desligou os emails'});continue}
    const email=emails[p.user_id||p.id]
    if(!email){skipped.push({id:p.id,reason:'sem email'});continue}
    ok.push({...p,email})
  }
  return{ok,skipped}
}

// Estado mais recente do consentimento de cada perfil ("dado" ou "retirado").
function latestConsent(rows){
  const last={}
  for(const r of rows){const d=r.data||r;if(!d.ref)continue;const k=(d.date||'')+'|'+(d.at||'');if(!last[d.ref]||k>last[d.ref].k)last[d.ref]={k,status:d.status}}
  return Object.fromEntries(Object.entries(last).map(([id,v])=>[id,v.status]))
}

async function emailMap(){
  const map={}
  for(let page=1;page<=50;page++){
    const{data,error}=await admin.auth.admin.listUsers({page,perPage:1000})
    if(error)throw new Error(error.message)
    const users=(data&&data.users)||[]
    users.forEach(u=>{if(u.email)map[u.id]=u.email})
    if(users.length<1000)break
  }
  return map
}

exports.handler=async(event)=>{
  if(event.httpMethod!=='POST')return{statusCode:405,body:'Method Not Allowed'}
  try{
    const auth=await requireAdmin(admin,event,{owner:true})
    if(auth.error)return auth.error

    const body=JSON.parse(event.body||'{}')
    const{action,profileIds,subject,message,messages,promo}=body
    if(!Array.isArray(profileIds)||!profileIds.length)return json(400,{error:'Escolhe pelo menos um destinatário.'})
    if(profileIds.length>MAX_RECIPIENTS)return json(400,{error:`No máximo ${MAX_RECIPIENTS} destinatários por envio.`})
    if(!profileIds.every(id=>typeof id==='string'))return json(400,{error:'profileIds inválidos.'})

    const{data:profiles,error}=await admin.from('profiles').select('id,user_id,name,category,notify_email,suspended,is_demo,is_admin').in('id',profileIds)
    if(error)return json(500,{error:error.message})
    let consent=null
    if(promo){
      const{data:rows,error:cErr}=await admin.from('admin_items').select('data').eq('kind','consent')
      if(cErr)return json(500,{error:cErr.message})
      consent=latestConsent(rows||[])
    }
    const{ok,skipped}=recipients(profiles||[],await emailMap(),consent)

    if(action==='preview')return json(200,{recipients:ok.length,skipped})

    if(action!=='send')return json(400,{error:'action inválida (usar "preview" ou "send").'})
    const subj=String(subject||'').trim(),msg=String(message||'').trim()
    if(!subj||subj.length>150)return json(400,{error:'O assunto é obrigatório (máx. 150 caracteres).'})
    if(msg.length<10||msg.length>5000)return json(400,{error:'A mensagem tem de ter entre 10 e 5000 caracteres.'})
    if(!process.env.RESEND_API_KEY)return json(503,{error:'RESEND_API_KEY não está configurada no Netlify, por isso não é possível enviar emails.'})
    if(!ok.length)return json(400,{error:'Ninguém deste grupo pode receber email.',skipped})
    // O painel pode mandar o texto já preenchido para cada pessoa ({falta},
    // {vistas}…, que só ele sabe calcular). Senão usa a mensagem comum.
    const per=messages&&typeof messages==='object'?messages:{}
    const textFor=p=>typeof per[p.id]==='string'&&per[p.id].trim()?String(per[p.id]).trim().slice(0,5000):fill(msg,p)

    const sent=[],failed=[]
    for(let i=0;i<ok.length;i+=BATCH){
      const chunk=ok.slice(i,i+BATCH)
      const res=await fetch('https://api.resend.com/emails/batch',{
        method:'POST',
        headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},
        body:JSON.stringify(chunk.map(p=>({from:FROM,to:[p.email],reply_to:REPLY_TO,subject:fill(subj,p),html:emailHtml(textFor(p)),text:textFor(p)})))
      })
      if(res.ok)chunk.forEach(p=>sent.push(p.id))
      else{
        const txt=await res.text().catch(()=>'')
        console.error('admin-send-campaign: Resend recusou o lote:',res.status,txt)
        chunk.forEach(p=>failed.push({id:p.id,reason:'Resend '+res.status}))
      }
    }

    await audit(admin,auth.user,'email_massa',{targetType:'campaign',summary:`Email${promo?' promocional':''} “${subj}” enviado a ${sent.length} profissional(is)${failed.length?` (${failed.length} falharam)`:''}`,
      details:{subject:subj,message:msg,promo:!!promo,sent,failed,skipped}})
    return json(200,{sent:sent.length,failed,skipped,sentIds:sent})
  }catch(err){
    console.error('admin-send-campaign error:',err)
    return json(500,{error:err.message})
  }
}

exports.recipients=recipients
exports.latestConsent=latestConsent
exports.fill=fill
exports.emailHtml=emailHtml
