const{createClient}=require('@supabase/supabase-js')
const{sendPush}=require('./_push')

const RESEND_API_KEY=process.env.RESEND_API_KEY
const FROM=process.env.RESEND_FROM||'Flinko <onboarding@resend.dev>'
const SITE=process.env.URL||'https://flinko.pt'
const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY)

// Intervalo minimo entre emails da mesma conversa para a mesma pessoa.
// Sem isto, uma conversa de dez mensagens gerava dez emails.
const MINUTOS_ENTRE_AVISOS=30

function esc(s){
  return String(s==null?'':s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;')
}

exports.handler=async(event)=>{
  if(event.httpMethod!=='POST')return{statusCode:405,body:'Method Not Allowed'}
  if(!RESEND_API_KEY)return{statusCode:200,body:JSON.stringify({skipped:true,reason:'RESEND_API_KEY nao configurada'})}

  try{
    // Quem chama tem de provar que e quem diz ser. O email do destinatario
    // NUNCA vem do browser: e descoberto aqui com a chave de servico.
    const token=(event.headers.authorization||'').replace(/^Bearer\s+/i,'')
    if(!token)return{statusCode:401,body:JSON.stringify({error:'Sem sessao.'})}

    const{data:userData,error:userErr}=await admin.auth.getUser(token)
    if(userErr||!userData||!userData.user)return{statusCode:401,body:JSON.stringify({error:'Sessao invalida.'})}
    const remetenteId=userData.user.id

    const{conversationId,preview}=JSON.parse(event.body||'{}')
    if(!conversationId)return{statusCode:400,body:JSON.stringify({error:'Falta conversationId.'})}

    // A conversa tem de existir e o remetente tem de fazer parte dela.
    const{data:conv}=await admin.from('conversations')
      .select('id,professional_id,client_id').eq('id',conversationId).maybeSingle()
    if(!conv)return{statusCode:404,body:JSON.stringify({error:'Conversa nao encontrada.'})}
    if(conv.professional_id!==remetenteId&&conv.client_id!==remetenteId){
      return{statusCode:403,body:JSON.stringify({error:'Nao pertences a esta conversa.'})}
    }

    const destinatarioId=conv.professional_id===remetenteId?conv.client_id:conv.professional_id

    const[{data:para},{data:de},{data:enderecos}]=await Promise.all([
      admin.from('profiles').select('name,notify_email').eq('id',destinatarioId).maybeSingle(),
      admin.from('profiles').select('name').eq('id',remetenteId).maybeSingle(),
      // O email ja nao vive em profiles: vem do auth, por esta funcao
      // que so a chave de servico pode executar.
      admin.rpc('emails_for',{ids:[destinatarioId]})
    ])

    const emailPara=(enderecos&&enderecos[0])?enderecos[0].email:null
    if(!para||!emailPara)return{statusCode:200,body:JSON.stringify({skipped:true,reason:'destinatario sem email'})}
    if(para.notify_email===false)return{statusCode:200,body:JSON.stringify({skipped:true,reason:'avisos desligados'})}

    // Se a pessoa ja leu tudo, nao ha nada a avisar.
    const{count:porLer}=await admin.from('messages')
      .select('id',{count:'exact',head:true})
      .eq('conversation_id',conversationId).neq('sender_id',destinatarioId).eq('read',false)
    if(!porLer)return{statusCode:200,body:JSON.stringify({skipped:true,reason:'ja esta lido'})}

    // Trava anti-spam: um aviso por conversa a cada MINUTOS_ENTRE_AVISOS.
    const desde=new Date(Date.now()-MINUTOS_ENTRE_AVISOS*60000).toISOString()
    const{count:recentes}=await admin.from('message_notices')
      .select('id',{count:'exact',head:true})
      .eq('conversation_id',conversationId).eq('recipient_id',destinatarioId).gte('sent_at',desde)
    if(recentes)return{statusCode:200,body:JSON.stringify({skipped:true,reason:'aviso recente enviado'})}

    const nomeRaw=(de&&de.name)||'Alguem'
    const previewRaw=String(preview||'').slice(0,300)
    const nomeDe=esc(nomeRaw)
    const trecho=esc(previewRaw)
    const link=SITE+'/messages'

    const html=`
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <div style="font-size:22px;font-weight:800;color:#132420;margin-bottom:20px">Flink<span style="color:#E8720A">o</span></div>
      <h2 style="color:#14181F;font-size:18px;margin-bottom:8px">Nova mensagem na Flinko</h2>
      <p style="color:#5B6270;font-size:14px;line-height:1.6">Ol&aacute;${para.name?' '+esc(para.name):''},</p>
      <p style="color:#5B6270;font-size:14px;line-height:1.6"><strong>${nomeDe}</strong> enviou-te uma mensagem:</p>
      <div style="background:#F7F8FA;padding:14px 16px;border-left:3px solid #E8720A;border-radius:6px;color:#14181F;font-size:14px;margin:16px 0">${trecho}</div>
      <a href="${link}" style="display:inline-block;background:#E8720A;color:#fff;padding:11px 22px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:700">Ver e responder</a>
      <p style="color:#94a3b8;font-size:12px;margin-top:24px">Recebeste este email porque tens conta na Flinko. Podes desligar os avisos no teu painel.</p>
    </div>`

    const resp=await fetch('https://api.resend.com/emails',{
      method:'POST',
      headers:{'Authorization':`Bearer ${RESEND_API_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify({from:FROM,to:[emailPara],subject:`Nova mensagem de ${nomeRaw.replace(/\s+/g," ")} na Flinko`,html})
    })
    const data=await resp.json()
    if(!resp.ok){console.error('Resend error:',data);return{statusCode:resp.status,body:JSON.stringify(data)}}

    await admin.from('message_notices').insert({conversation_id:conversationId,recipient_id:destinatarioId})

    // Esperar pelo push: numa funcao serverless, o que fica por esperar pode nunca chegar a correr.
    await sendPush(destinatarioId,{title:`Nova mensagem de ${nomeRaw}`,body:previewRaw||'Enviou-te uma mensagem na Flinko.',url:'/messages.html',tag:'message-'+conversationId}).catch(()=>{})

    return{statusCode:200,body:JSON.stringify({sent:true})}
  }catch(err){
    console.error('notify-message error:',err)
    return{statusCode:500,body:JSON.stringify({error:err.message})}
  }
}
