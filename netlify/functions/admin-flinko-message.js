// Mensagens da Flinko para um grupo de profissionais (gestao.html › Mensagens ›
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
//   action:"inbox"   -> conversas da Flinko (para o painel /gestao)
//   action:"thread"  -> mensagens de uma conversa da Flinko
//   action:"reply"   -> responde numa conversa da Flinko
//
// Out/2026: há uma só conversa da Flinko por profissional. Se outro admin a
// começou, as mensagens saem em nome dessa conta (sender = client_id da
// conversa). Antes, cada admin só via e respondia às suas, e a base de dados
// recusava as respostas dos outros.
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
  <div style="font-size:22px;font-weight:800;color:#132420;margin-bottom:20px">Flink<span style="color:#BB5C08">o</span></div>
  <h2 style="color:#14181F;font-size:18px;margin-bottom:8px">Tens uma mensagem da equipa Flinko</h2>
  <p style="color:#5B6270;font-size:14px;line-height:1.6">Olá${nome?' '+esc(nome):''},</p>
  <div style="background:#F7F8FA;padding:14px 16px;border-left:3px solid #BB5C08;border-radius:6px;color:#14181F;font-size:14px;margin:16px 0;line-height:1.6">${trecho}</div>
  <a href="${SITE}/messages" style="display:inline-block;background:#BB5C08;color:#fff;padding:11px 22px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:700">Ver e responder</a>
  <p style="color:#94a3b8;font-size:12px;margin-top:24px">Recebeste este email porque tens conta na Flinko. Podes desligar os avisos por email no teu painel.</p>
</div>`
}

exports.handler=async(event)=>{
  if(event.httpMethod!=='POST')return{statusCode:405,body:'Method Not Allowed'}
  try{
    const auth=await requireAdmin(admin,event)
    if(auth.error)return auth.error
    const senderId=auth.user.id

    const{action,profileIds,message,messages,conversationId}=JSON.parse(event.body||'{}')
    if(action==='inbox')return inbox()
    if(action==='thread'||action==='reply'){
      const{data:conv}=await admin.from('conversations').select('id,professional_id,client_id,is_flinko').eq('id',String(conversationId||'')).maybeSingle()
      if(!conv||!conv.is_flinko)return json(403,{error:'Só podes ver e responder a conversas da Flinko.'})
      return action==='thread'?thread(conv):reply(conv,message,auth.user)
    }
    if(!Array.isArray(profileIds)||!profileIds.length)return json(400,{error:'Escolhe pelo menos um profissional.'})
    if(profileIds.length>MAX_RECIPIENTS)return json(400,{error:`No máximo ${MAX_RECIPIENTS} profissionais por envio.`})
    if(!profileIds.every(id=>typeof id==='string'))return json(400,{error:'profileIds inválidos.'})
    const ids=[...new Set(profileIds)]

    const[{data:profiles,error},{data:blocks}]=await Promise.all([
      admin.from('profiles').select('id,name,category,account_type,notify_email,suspended,is_demo,is_admin').in('id',ids),
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

    // 1) conversas: reaproveita as que já existem, cria as que faltam
    const ehCliente=p=>p.account_type==='client'
    const okIds=ok.filter(p=>!ehCliente(p)).map(p=>p.id)
    const cliIds=ok.filter(ehCliente).map(p=>p.id)
    const{data:existentes,error:e1}=await admin.from('conversations').select('id,professional_id,client_id').eq('is_flinko',true).in('professional_id',okIds).order('created_at',{ascending:true})
    if(e1)return json(500,{error:e1.message})
    const convDe={},remetente={}
    ;(existentes||[]).forEach(c=>{if(!convDe[c.professional_id]){convDe[c.professional_id]=c.id;remetente[c.professional_id]=c.client_id||senderId}})
    // Uma conversa normal que este admin já tenha com o profissional passa a ser a da Flinko (evita duplicar).
    const semFlinko=okIds.filter(id=>!convDe[id])
    if(semFlinko.length){
      const{data:minhas}=await admin.from('conversations').select('id,professional_id').eq('client_id',senderId).in('professional_id',semFlinko)
      const usar=(minhas||[]).filter(c=>semFlinko.includes(c.professional_id)&&!convDe[c.professional_id])
      usar.forEach(c=>{convDe[c.professional_id]=c.id;remetente[c.professional_id]=senderId})
      if(usar.length)await admin.from('conversations').update({is_flinko:true}).in('id',usar.map(c=>c.id))
    }
    const faltam=okIds.filter(id=>!convDe[id])
    if(faltam.length){
      const{data:novas,error:e2}=await admin.from('conversations').insert(faltam.map(id=>({professional_id:id,client_id:senderId,is_flinko:true}))).select('id,professional_id')
      if(e2)return json(500,{error:e2.message})
      ;(novas||[]).forEach(c=>{convDe[c.professional_id]=c.id;remetente[c.professional_id]=senderId})
    }
    // Clientes: a conversa da Flinko tem o admin no lugar do profissional.
    if(cliIds.length){
      const{data:cc,error:e4}=await admin.from('conversations').select('id,professional_id,client_id').eq('is_flinko',true).in('client_id',cliIds).order('created_at',{ascending:true})
      if(e4)return json(500,{error:e4.message})
      ;(cc||[]).forEach(c=>{if(!convDe[c.client_id]){convDe[c.client_id]=c.id;remetente[c.client_id]=c.professional_id||senderId}})
      const faltamCli=cliIds.filter(id=>!convDe[id])
      if(faltamCli.length){
        const{data:nc,error:e5}=await admin.from('conversations').insert(faltamCli.map(id=>({professional_id:senderId,client_id:id,is_flinko:true}))).select('id,professional_id,client_id')
        if(e5)return json(500,{error:e5.message})
        ;(nc||[]).forEach(c=>{convDe[c.client_id]=c.id;remetente[c.client_id]=senderId})
      }
    }

    // 2) mensagens
    const linhas=ok.filter(p=>convDe[p.id]).map(p=>({conversation_id:convDe[p.id],sender_id:remetente[p.id]||senderId,content:textFor(p),attachments:[]}))
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

// Avisa o profissional (push e email, a quem não desligou) de uma mensagem nova.
async function avisar(p,convId,texto){
  try{await sendPush(p.id,{title:'Mensagem da Flinko',body:texto.slice(0,140),url:'/messages.html?c='+convId,tag:'flinko-'+convId})}catch(e){}
  if(!process.env.RESEND_API_KEY||p.notify_email===false)return false
  const{data:end}=await admin.rpc('emails_for',{ids:[p.id]})
  const para=(end||[])[0]&&end[0].email
  if(!para)return false
  const res=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:FROM,to:[para],subject:'Tens uma mensagem da Flinko',html:emailHtml(firstName(p.name),texto)})})
  return !!res.ok
}

// Numa conversa da Flinko, o "outro" é o participante que não é admin (o
// profissional, ou o cliente quando a Flinko escreve a clientes).
async function adminIds(){
  const{data}=await admin.from('profiles').select('id').eq('is_admin',true)
  return new Set((data||[]).map(p=>p.id))
}
const outroDe=(c,adm)=>adm.has(c.client_id)?c.professional_id:adm.has(c.professional_id)?c.client_id:c.professional_id
const flinkoDe=(c,adm)=>outroDe(c,adm)===c.client_id?c.professional_id:c.client_id

async function inbox(){
  const{data:convs,error}=await admin.from('conversations').select('id,professional_id,client_id,last_message,last_message_at').eq('is_flinko',true).order('last_message_at',{ascending:false}).limit(300)
  if(error)return json(500,{error:error.message})
  const adm=await adminIds()
  const ids=[...new Set((convs||[]).map(c=>outroDe(c,adm)))]
  const[{data:pros},{data:msgs}]=await Promise.all([
    ids.length?admin.from('profiles').select('id,name,category,photo_url,account_type').in('id',ids):{data:[]},
    (convs||[]).length?admin.from('messages').select('conversation_id,sender_id,created_at').in('conversation_id',convs.map(c=>c.id)).order('created_at',{ascending:false}).limit(2000):{data:[]}
  ])
  const pro=Object.fromEntries((pros||[]).map(p=>[p.id,p]))
  const ultimo={};(msgs||[]).forEach(m=>{if(!ultimo[m.conversation_id])ultimo[m.conversation_id]=m})
  return json(200,{conversations:(convs||[]).map(c=>{const o=outroDe(c,adm),p=pro[o]||{},cli=o===c.client_id||p.account_type==='client';return{id:c.id,personId:o,tipo:cli?'cliente':'profissional',professionalId:cli?null:o,name:p.name||(cli?'Cliente':'Profissional'),category:cli?'Cliente':(p.category||''),photo:p.photo_url||null,lastMessage:c.last_message||'',lastAt:c.last_message_at,porResponder:!!(ultimo[c.id]&&ultimo[c.id].sender_id===o)}})})
}

async function thread(conv){
  const outro=outroDe(conv,await adminIds())
  const{data,error}=await admin.from('messages').select('id,sender_id,content,created_at').eq('conversation_id',conv.id).order('created_at',{ascending:true}).limit(500)
  if(error)return json(500,{error:error.message})
  return json(200,{messages:(data||[]).map(m=>({id:m.id,content:m.content,createdAt:m.created_at,deFlinko:m.sender_id!==outro}))})
}

async function reply(conv,message,user){
  const texto=String(message||'').trim()
  if(texto.length<1||texto.length>4000)return json(400,{error:'Escreve a resposta (até 4000 caracteres).'})
  const adm=await adminIds()
  const{error}=await admin.from('messages').insert({conversation_id:conv.id,sender_id:flinkoDe(conv,adm),content:texto,attachments:[]})
  if(error)return json(500,{error:error.message})
  const{data:p}=await admin.from('profiles').select('id,name,notify_email').eq('id',outroDe(conv,adm)).maybeSingle()
  const emailed=p?await avisar(p,conv.id,texto):false
  await audit(admin,user,'resposta_flinko',{targetType:'conversation',targetId:conv.id,summary:'Resposta da Flinko a '+((p&&p.name)||'profissional')})
  return json(200,{sent:1,emailed})
}

exports.recipients=recipients
exports.fill=fill
