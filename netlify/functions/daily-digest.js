const{createClient}=require('@supabase/supabase-js')
const{sendPush}=require('./_push')

const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY)

const PAGINA=1000      // limite por pedido do PostgREST
const LOTE_PROS=200    // profissionais processados por lote (mantem os filtros .in() curtos)
const PUSH_EM_PARALELO=10

function emLotes(lista,tamanho){
  const out=[]
  for(let i=0;i<lista.length;i+=tamanho)out.push(lista.slice(i,i+tamanho))
  return out
}

// Le todas as paginas de uma consulta (o PostgREST corta a 1000 linhas).
// `consulta(de,ate)` tem de devolver o query builder com .range() aplicado.
async function lerTudo(consulta){
  const linhas=[]
  for(let de=0;;de+=PAGINA){
    const{data,error}=await consulta(de,de+PAGINA-1)
    if(error)throw new Error(error.message)
    linhas.push(...(data||[]))
    if(!data||data.length<PAGINA)break
  }
  return linhas
}

function contarPor(linhas,chave){
  const m={}
  for(const l of linhas)m[l[chave]]=(m[l[chave]]||0)+1
  return m
}

// Corre uma vez por dia (ver netlify.toml). Manda um resumo por notificacao
// push só a quem tem mesmo algo que precise de atenção — sem spam diário.
//
// Antes fazia 3+ consultas por profissional, uma a seguir a outra: com
// centenas de profissionais estourava o limite de tempo da function. Agora
// faz um pequeno numero de consultas por lote de profissionais e envia os
// push em paralelo.
exports.handler=async()=>{
  try{
    const pros=await lerTudo((de,ate)=>admin.from('profiles').select('id,name').eq('is_demo',false).neq('notify_digest',false).order('id').range(de,ate))
    if(!pros.length)return{statusCode:200,body:JSON.stringify({sent:0,total:0})}

    const today=new Date();today.setHours(0,0,0,0)
    const tomorrow=new Date(today.getTime()+86400000)
    const todayISO=today.toISOString(),tomorrowISO=tomorrow.toISOString()

    const avisos=[]
    for(const lote of emLotes(pros.map(p=>p.id),LOTE_PROS)){
      const jobsHoje=contarPor(await lerTudo((de,ate)=>admin.from('jobs').select('professional_id')
        .in('professional_id',lote).gte('scheduled_at',todayISO).lt('scheduled_at',tomorrowISO).order('id').range(de,ate)),'professional_id')
      const orcamentos=contarPor(await lerTudo((de,ate)=>admin.from('jobs').select('professional_id')
        .in('professional_id',lote).eq('status','orcamento_enviado').order('id').range(de,ate)),'professional_id')

      const conversas=await lerTudo((de,ate)=>admin.from('conversations').select('id,professional_id')
        .in('professional_id',lote).order('id').range(de,ate))
      const donoDaConversa={}
      conversas.forEach(c=>{donoDaConversa[c.id]=c.professional_id})
      const porLer={}
      for(const lc of emLotes(conversas.map(c=>c.id),LOTE_PROS)){
        const msgs=await lerTudo((de,ate)=>admin.from('messages').select('conversation_id,sender_id')
          .in('conversation_id',lc).eq('read',false).order('id').range(de,ate))
        msgs.forEach(m=>{
          const dono=donoDaConversa[m.conversation_id]
          if(m.sender_id!==dono)porLer[dono]=(porLer[dono]||0)+1
        })
      }

      for(const id of lote){
        const parts=[]
        const t=jobsHoje[id]||0,o=orcamentos[id]||0,u=porLer[id]||0
        if(t)parts.push(t+' trabalho'+(t>1?'s':'')+' hoje')
        if(o)parts.push(o+' orçamento'+(o>1?'s':'')+' por responder')
        if(u)parts.push(u+' mensagem'+(u>1?'s':'')+' por ler')
        if(parts.length)avisos.push({id,body:parts.join(' · ')})
      }
    }

    let sent=0
    for(const grupo of emLotes(avisos,PUSH_EM_PARALELO)){
      const rs=await Promise.all(grupo.map(a=>sendPush(a.id,{
        title:'O teu resumo do dia',
        body:a.body,
        url:'/dashboard.html',
        tag:'daily-digest'
      })))
      sent+=rs.filter(r=>r&&r.sent).length
    }
    return{statusCode:200,body:JSON.stringify({sent,total:pros.length})}
  }catch(err){
    console.error('daily-digest error:',err)
    return{statusCode:500,body:JSON.stringify({error:err.message})}
  }
}
