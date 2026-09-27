// Mensagens da Flinko para um grupo de profissionais (admin.html › Contactar
// profissionais › "Mensagem da Flinko").
//
// Cada profissional recebe a mensagem na sua conversa com a Flinko, dentro da
// plataforma (messages.html), e pode responder. A conversa fica entre a conta
// do admin que envia e o profissional, marcada como is_flinko: o profissional
// vê "Flinko" e as respostas chegam às mensagens do admin.
// Avisa cada um por push e por email (a quem não desligou os emails).
//
//   action:"preview" -> quantos recebem e quem fica de fora (e porquê)
//   action:"send"    -> envia e regista em admin_audit
const{createClient}=require('@supabase/supabase-js')
const{json,requireAdmin,audit}=require('./_admin.js')
const{sendPush}=require('./_push')
const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY)

const FROM=process.env.RESEND_FROM||'Flinko <onboarding@resend.dev>'
const SITE='https://flinko.pt'
const MAX_RECIPIENTS=500
const BATCH=100

const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const firstName=n=>String(n||'').trim().split(/\s+/)[0]||''
const fill=(txt,p)=>String(txt).replace(/\{nome\}/g,firstName(p.name)).replace(/\{categoria\}/g,(p.category||'a sua área').toLowerCase())

// Função pura (testável): quem recebe e quem fica de fora.
function recipients(profiles,senderId,blockedBy){
  const ok=[],skipped=[]
  for(const p of profiles){
    if(p.id===senderId){skipped.push({id:p.id,reason:'és tu'});continue}
    if(p.is_demo||p.is_admin){skipped.push({id:p.id,reason:'conta de admin ou demo'});continue}
    if(p.suspended){skipped.push({id:p.id,reason:'conta suspensa'});continue}
    if(blockedBy.has(p.id)){skipped.push({id:p.id,reason:'bloqueou a Flinko'});continue}
    ok.push(p)
  }
  return{ok,skipped}
}

function emailHtml(nome,texto){
  const trecho=esc(texto.length>400?texto.slice(0,397)+'…':texto).replace(/\n/g,'<br>')
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px">
  <div style="font-size:22px;font-weight:800;color:#132420;margin-bottom:20px">Flink<span style="color:#E8720A">o</span></div>
  <h2 style="color:#14181F;font-size:18px;margin-bottom:8px">Tens uma mensagem da equipa Flinko</h2>
  <p style="color:#5B6270;font-size:14px;line-height:1.6">Olá${nome?' '+esc(nome):''},</p>
  <div style="background:#F7F8FA;padding:14px 16px;border-left:3px solid #E8720A;border-radius:6px;color:#14181F;font-size:14px;margin:16px 0;line-height:1.6">${trecho}</div>
  <a href="${SITE}/messages" style="display:inline-block;background:#E8720A;color:#fff;padding:11px 22px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:700">Ver e responder</a>
  <p style="color:#94a3b8;font-size:12px;margin-top:24px">Recebeste este email porque tens conta profissional na Flinko. Podes desligar os avisos por email no teu painel.</p>
</div>`
}

exports.handler=async(event)=>{
  if(event.httpMethod!=='POST')return{statusCode:405,body:'Method Not Allowed'}
  try{
    const auth=await requireAdmin(admin,event)
    if(auth.error)return auth.error
    const senderId=auth.user.id

    const{action,profileIds,message,messages}=JSON.parse(event.body||'{}')
    if(!Array.isArray(profileIds)||!profileIds.length)return json(400,{error:'Escolhe pelo menos um profissional.'})
    if(profileIds.length>MAX_RECIPIENTS)return json(400,{error:`No máximo ${MAX_RECIPIENTS} profissionais por envio.`})
    if(!profileIds.every(id=>typeof id==='string'))return json(400,{error:'profileIds inválidos.'})
    const ids=[...new Set(profileIds)]

    const[{data:profiles,error},{data:blocks}]=await Promise.all([
      admin.from('profiles').select('id,name,category,notify_email,suspended,is_demo,is_admin').in('id',ids),
      admin.from('user_blocks').select('blocker_id').eq('blocked_id',senderId).in('blocker_id',ids)
    ])
    if(error)return json(500,{error:error.message})
    const{ok,skipped}=recipients(profiles||[],senderId,new Set((blocks||[]).map(b=>b.blocker_id)))

    if(action==='preview')return json(200,{recipients:ok.length,skipped})
    if(action!=='send')return json(400,{error:'action inválida (usar "preview" ou "send").'})

    const msg=String(message||'').trim()
    if(msg.length<2||msg.length>4000)return json(400,{error:'A mensagem tem de ter entre 2 e 4000 caracteres.'})
    if(!ok.length)return json(400,{error:'Ninguém deste grupo pode receber a mensagem.',skipped})
    const per=messages&&typeof messages==='object'?messages:{}
    const textFor=p=>typeof per[p.id]==='string'&&per[p.id].trim()?String(per[p.id]).trim().slice(0,4000):fill(msg,p).slice(0,4000)

    // 1) conversas: reaproveita as que já existem com este admin, cria as que faltam
    const okIds=ok.map(p=>p.id)
    const{data:existentes,error:e1}=await admin.from('conversations').select('id,professional_id').eq('client_id',senderId).in('professional_id',okIds)
    if(e1)return json(500,{error:e1.message})
    const convDe={}
    ;(existentes||[]).forEach(c=>{convDe[c.professional_id]=c.id})
    const jaExistem=Object.values(convDe)
    if(jaExistem.length)await admin.from('conversations').update({is_flinko:true}).in('id',jaExistem)
    const faltam=okIds.filter(id=>!convDe[id])
    if(faltam.length){
      const{data:novas,error:e2}=await admin.from('conversations').insert(faltam.map(id=>({professional_id:id,client_id:senderId,is_flinko:true}))).select('id,professional_id')
      if(e2)return json(500,{error:e2.message})
      ;(novas||[]).forEach(c=>{convDe[c.professional_id]=c.id})
    }

    // 2) mensagens
    const linhas=ok.filter(p=>convDe[p.id]).map(p=>({conversation_id:convDe[p.id],sender_id:senderId,content:textFor(p),attachments:[]}))
    const{error:e3}=await admin.from('messages').insert(linhas)
    if(e3)return json(500,{error:e3.message})
    const sent=ok.filter(p=>convDe[p.id])

    // 3) avisos: push a todos, email a quem não desligou (em lotes)
    for(let i=0;i<sent.length;i+=50){
      await Promise.allSettled(sent.slice(i,i+50).map(p=>sendPush(p.id,{title:'Mensagem da Flinko',body:textFor(p).slice(0,140),url:'/messages.html?c='+convDe[p.id],tag:'flinko-'+convDe[p.id]})))
    }
    let emailed=0
    const querEmail=sent.filter(p=>p.notify_email!==false)
    if(process.env.RESEND_API_KEY&&querEmail.length){
      const{data:enderecos}=await admin.rpc('emails_for',{ids:querEmail.map(p=>p.id)})
      const mail={};(enderecos||[]).forEach(e=>{mail[e.id]=e.email})
      const alvo=querEmail.filter(p=>mail[p.id])
      for(let i=0;i<alvo.length;i+=BATCH){
        const chunk=alvo.slice(i,i+BATCH)
        const res=await fetch('https://api.resend.com/emails/batch',{
          method:'POST',
          headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},
          body:JSON.stringify(chunk.map(p=>({from:FROM,to:[mail[p.id]],subject:'Tens uma mensagem da Flinko',html:emailHtml(firstName(p.name),textFor(p))})))
        })
        if(res.ok)emailed+=chunk.length
        else console.error('admin-flinko-message: Resend recusou o lote:',res.status,await res.text().catch(()=>''))
      }
    }

    await audit(admin,auth.user,'mensagem_flinko',{targetType:'campaign',summary:`Mensagem da Flinko enviada a ${sent.length} profissional(is)`,
      details:{message:msg,sent:sent.map(p=>p.id),skipped}})
    return json(200,{sent:sent.length,emailed,skipped,sentIds:sent.map(p=>p.id)})
  }catch(err){
    console.error('admin-flinko-message error:',err)
    return json(500,{error:err.message})
  }
}

exports.recipients=recipients
exports.fill=fill
