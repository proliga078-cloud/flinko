// TRABALHOS (PIPELINE + AGENDA)
let allJobs=[]
const JOB_STATUS_LABELS={novo:'Novo',negociacao:'Negociação',orcamento_enviado:'Orçamento Enviado',aceite:'Aceite',agendado:'Agendado',concluido:'Concluído',pago:'Pago',cancelado:'Cancelado'}
const KANBAN_COLUMNS=[
  {key:'novo',label:'Novo',statuses:['novo','negociacao']},
  {key:'orcamento_enviado',label:'Orçamento',statuses:['orcamento_enviado','aceite']},
  {key:'agendado',label:'Agendado',statuses:['agendado']},
  {key:'concluido',label:'Concluído',statuses:['concluido']},
  {key:'pago',label:'Pago',statuses:['pago']}
]

async function loadJobs(){
  const{data}=await db.from('jobs').select('*').eq('professional_id',profileId).order('created_at',{ascending:false})
  allJobs=data||[]
  renderPipeline()
  renderCalendar()
  renderStatusChart(allJobs)
  renderInsights()
  renderFollowupReminders()
  renderMiniAgenda()
  renderFinance()
}

function toLocalDT(iso){
  if(!iso)return ''
  const d=new Date(iso)
  const pad=n=>String(n).padStart(2,'0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function jobCardHtml(j){
  const statusOpts=Object.keys(JOB_STATUS_LABELS).map(k=>`<option value="${k}" ${k===j.status?'selected':''}>${JOB_STATUS_LABELS[k]}</option>`).join('')
  return `<div class="job-card" data-id="${j.id}">
    <div class="jc-title">${escapeHtml(j.title)}</div>
    <div class="jc-client">${escapeHtml(j.client_name||'Cliente')}</div>
    <input type="number" min="0" placeholder="Valor (€)" value="${j.quote_amount??''}" style="width:100%;margin-bottom:6px" onchange="updateJobField('${j.id}','quote_amount',this.value?parseFloat(this.value):null)"/>
    <div class="jc-margin">
      <input type="number" min="0" placeholder="Material (€)" value="${j.material_cost??''}" title="Quanto gastaste em material" onchange="updateJobField('${j.id}','material_cost',this.value?parseFloat(this.value):null)"/>
      <input type="text" list="job-types" placeholder="Tipo" value="${escapeHtml(j.job_type||'')}" title="Ex: Reparação, Instalação completa" onchange="updateJobField('${j.id}','job_type',this.value.trim()||null)"/>
    </div>
    ${marginBadge(j)}
    <textarea placeholder="Material a levar (opcional)" style="width:100%;margin-bottom:6px;min-height:40px;font-size:12px;padding:8px 10px" onchange="updateJobField('${j.id}','materials_checklist',this.value.trim()||null)">${escapeHtml(j.materials_checklist||'')}</textarea>
    <input type="datetime-local" value="${toLocalDT(j.scheduled_at)}" style="width:100%;margin-bottom:6px" onchange="updateJobField('${j.id}','scheduled_at',this.value?new Date(this.value).toISOString():null)"/>
    <select onchange="updateJobStatus('${j.id}',this.value)">${statusOpts}</select>
    <div class="jc-actions" style="margin-top:8px">
      <button class="btn btn-outline btn-sm" onclick="openQuoteModal('${j.id}')" title="Gerar orçamento PDF"><svg class="ic" viewBox="0 0 24 24" style="width:14px;height:14px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg></button>
      <button class="btn btn-outline btn-sm" onclick="openReferModal('${j.id}')" title="Referir a outro profissional"><svg class="ic" viewBox="0 0 24 24" style="width:14px;height:14px"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg></button>
      <button class="btn btn-danger btn-sm" onclick="deleteJob('${j.id}')"><svg class="ic" viewBox="0 0 24 24" style="width:14px;height:14px"><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/><path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/></svg></button>
    </div>
  </div>`
}

function renderClientHistory(){
  const el=document.getElementById('clients-list')
  if(!el)return
  const q=(document.getElementById('client-search')?.value||'').toLowerCase().trim()
  const groups={}
  allJobs.forEach(j=>{
    const key=j.client_id||('n:'+(j.client_name||'Cliente'))
    if(!groups[key])groups[key]={name:j.client_name||'Cliente',jobs:[],total:0}
    groups[key].jobs.push(j)
    if(j.status==='pago')groups[key].total+=Number(j.paid_amount??j.quote_amount??0)
  })
  let list=Object.values(groups)
  if(q)list=list.filter(g=>g.name.toLowerCase().includes(q))
  list.sort((a,b)=>b.total-a.total||b.jobs.length-a.jobs.length)
  if(!list.length){el.innerHTML='<div class="form-section"><div class="tc-empty"><p>Sem clientes ainda.</p></div></div>';return}
  el.innerHTML=list.map(g=>{
    const repeat=g.jobs.length>1
    return `<div class="form-section" style="margin-bottom:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-weight:700;font-size:14px">${escapeHtml(g.name)}</div>
          ${repeat?`<span style="font-size:11px;color:#B4650A;background:#FBEFE0;display:inline-block;padding:1px 8px;border-radius:99px;margin-top:4px">cliente recorrente · ${g.jobs.length}x</span>`:''}
        </div>
        <div style="font-size:16px;font-weight:700;color:var(--green)">${eur(g.total)}</div>
      </div>
    </div>`
  }).join('')
}

function renderPipeline(){
  const board=document.getElementById('kanban-board')
  const active=allJobs.filter(j=>j.status!=='cancelado')
  board.innerHTML=KANBAN_COLUMNS.map(col=>{
    const items=active.filter(j=>col.statuses.includes(j.status))
    return `<div class="kanban-col">
      <div class="kanban-col-title">${col.label}<span class="kanban-col-count">${items.length}</span></div>
      <div class="kanban-cards">${items.length?items.map(jobCardHtml).join(''):'<div class="kanban-empty">Sem trabalhos</div>'}</div>
    </div>`
  }).join('')
}

const MESES=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']

function jobFim(j){
  return new Date(new Date(j.scheduled_at).getTime()+(j.duration_minutes||60)*60000)
}

function duracaoTexto(min){
  const m=Number(min)||60
  if(m<60)return m+' min'
  const h=Math.floor(m/60), r=m%60
  if(m>=480)return 'dia inteiro'
  if(m===240)return 'meio dia'
  return h+(r?'h'+String(r).padStart(2,'0'):(h===1?' hora':' horas'))
}

// Dois trabalhos chocam se um comeca antes de o outro acabar.
function trabalhosQueChocam(lista){
  const ord=lista.slice().sort((a,b)=>new Date(a.scheduled_at)-new Date(b.scheduled_at))
  const maus=new Set()
  for(let i=0;i<ord.length-1;i++){
    if(jobFim(ord[i])>new Date(ord[i+1].scheduled_at)){maus.add(ord[i].id);maus.add(ord[i+1].id)}
  }
  return maus
}

function jobsAgendados(){
  return allJobs.filter(j=>j.scheduled_at&&j.status!=='cancelado')
}

function calShiftMonth(delta){
  calMonth+=delta
  if(calMonth<0){calMonth=11;calYear--}
  if(calMonth>11){calMonth=0;calYear++}
  calSelected=null
  renderCalendar()
}

function calGoToday(){
  const h=new Date()
  calYear=h.getFullYear();calMonth=h.getMonth();calSelected=h.getDate()
  renderCalendar()
}

function calSelectDay(day){
  calSelected=calSelected===day?null:day
  renderCalendar()
}

function renderCalendar(){
  const grid=document.getElementById('cal-grid')
  const title=document.getElementById('cal-title')
  if(!grid||!title)return

  title.textContent=MESES[calMonth]+' de '+calYear
  const ant=document.getElementById('cal-mes-ant')
  const seg=document.getElementById('cal-mes-seg')
  if(ant)ant.textContent=MESES[(calMonth+11)%12]
  if(seg)seg.textContent=MESES[(calMonth+1)%12]

  // A semana comeca a segunda, como em Portugal.
  const primeiro=new Date(calYear,calMonth,1)
  const desloc=(primeiro.getDay()+6)%7
  const diasNoMes=new Date(calYear,calMonth+1,0).getDate()
  const diasMesAnterior=new Date(calYear,calMonth,0).getDate()

  const porDia={}
  jobsAgendados().forEach(j=>{
    const d=new Date(j.scheduled_at)
    if(d.getFullYear()===calYear&&d.getMonth()===calMonth){
      (porDia[d.getDate()]=porDia[d.getDate()]||[]).push(j)
    }
  })
  Object.keys(porDia).forEach(k=>porDia[k].sort((a,b)=>new Date(a.scheduled_at)-new Date(b.scheduled_at)))

  const hoje=new Date()
  const ehHoje=d=>d===hoje.getDate()&&calMonth===hoje.getMonth()&&calYear===hoje.getFullYear()

  let html=''
  for(let i=desloc;i>0;i--){
    html+='<button class="cal-day fora" disabled><div class="cal-num">'+(diasMesAnterior-i+1)+'</div></button>'
  }

  for(let dia=1;dia<=diasNoMes;dia++){
    const doDia=porDia[dia]||[]
    const choque=trabalhosQueChocam(doDia)
    const dow=new Date(calYear,calMonth,dia).getDay()
    const fds=(dow===0||dow===6)
    const cls=['cal-day']
    if(fds)cls.push('fds')
    if(ehHoje(dia))cls.push('hoje')
    if(calSelected===dia)cls.push('escolhido')

    let eventos=''
    doDia.slice(0,2).forEach((j,idx)=>{
      const d=new Date(j.scheduled_at)
      const hh=d.getHours()
      const mm=d.getMinutes()
      const hora=hh+'h'+(mm?String(mm).padStart(2,'0'):'')
      const quem=j.client_name||j.title||'Trabalho'
      const cor=choque.has(j.id)?'r':(idx%2?'a':'v')
      eventos+='<div class="cal-ev '+cor+'">'+escapeHtml(hora+' '+quem)+'</div>'
    })
    if(doDia.length>2)eventos+='<div class="cal-mais">+'+(doDia.length-2)+'</div>'

    html+='<button class="'+cls.join(' ')+'" onclick="calSelectDay('+dia+')">'+
          '<div class="cal-num">'+dia+'</div>'+eventos+'</button>'
  }

  const sobra=(7-((desloc+diasNoMes)%7))%7
  for(let i=1;i<=sobra;i++){
    html+='<button class="cal-day fora" disabled><div class="cal-num">'+i+'</div></button>'
  }

  grid.innerHTML=html
  renderDiaOuProximos(porDia)
}

function linhaTrabalhoHtml(j,choque){
  const d=new Date(j.scheduled_at)
  const hora=d.toLocaleTimeString('pt-PT',{hour:'2-digit',minute:'2-digit'})
  const partes=[]
  if(j.title)partes.push(escapeHtml(j.title))
  partes.push(duracaoTexto(j.duration_minutes))
  if(j.quote_amount!=null)partes.push(eur(j.quote_amount))
  const nota=choque
    ? '<div class="dia-nota" style="color:#A32D2D">Choca com outro trabalho a esta hora</div>'
    : ''
  return '<div class="dia-linha">'+
    '<div class="dia-hora">'+hora+'</div>'+
    '<div class="dia-corpo">'+
      '<div class="dia-nome">'+escapeHtml(j.client_name||j.title||'Trabalho')+'</div>'+
      '<div class="dia-sub">'+partes.join(' · ')+'</div>'+nota+
    '</div></div>'
}

function renderDiaOuProximos(porDia){
  const titulo=document.getElementById('agenda-day-title')
  const lista=document.getElementById('agenda-list')
  const qa=document.getElementById('quick-add-section')
  const qaT=document.getElementById('quick-add-title')
  if(!titulo||!lista)return

  const btnAdd='<button class="dia-add" onclick="focarMarcar()"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>Marcar trabalho neste dia</button>'

  if(calSelected){
    const data=new Date(calYear,calMonth,calSelected)
    const etiqueta=data.toLocaleDateString('pt-PT',{weekday:'long',day:'numeric',month:'long'})
    titulo.textContent=etiqueta
    if(qa){qa.style.display='block';qaT.textContent='Marcar em '+etiqueta}
    const doDia=(porDia&&porDia[calSelected])||[]
    if(!doDia.length){
      lista.innerHTML='<div class="dia-vazio">Nada marcado neste dia.</div>'+btnAdd
      return
    }
    const choque=trabalhosQueChocam(doDia)
    const aviso=choque.size?'<div class="aviso-choque"><svg viewBox="0 0 24 24"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>Tens trabalhos sobrepostos neste dia</div>':''
    lista.innerHTML=aviso+doDia.map(j=>linhaTrabalhoHtml(j,choque.has(j.id))).join('')+btnAdd
    return
  }

  if(qa)qa.style.display='none'
  titulo.textContent='Próximos trabalhos'
  // So o que ainda esta para vir. Antes isto mostrava o passado tambem.
  const agora=Date.now()
  const proximos=jobsAgendados()
    .filter(j=>jobFim(j).getTime()>=agora)
    .sort((a,b)=>new Date(a.scheduled_at)-new Date(b.scheduled_at))
    .slice(0,8)
  if(!proximos.length){
    lista.innerHTML='<div class="dia-vazio">Não tens nada marcado. Escolhe um dia no calendário para marcares.</div>'
    return
  }
  const choque=trabalhosQueChocam(proximos)
  lista.innerHTML=proximos.map(j=>{
    const d=new Date(j.scheduled_at)
    const dia=d.toLocaleDateString('pt-PT',{weekday:'short',day:'numeric',month:'short'})
    return linhaTrabalhoHtml(j,choque.has(j.id)).replace('<div class="dia-hora">',
      '<div class="dia-hora" style="width:74px;font-size:13px;line-height:1.35">'+dia+'<br>')
  }).join('')
}

function focarMarcar(){
  const el=document.getElementById('qa-title')
  if(el){el.scrollIntoView({behavior:'smooth',block:'center'});el.focus()}
}

function renderAgenda(){renderCalendar()}

async function quickAddToDay(){
  if(!calSelected||!profileId)return
  const titleInput=document.getElementById('qa-title')
  const timeInput=document.getElementById('qa-time')
  const title=titleInput.value.trim()
  if(!title){showAlert('qa-error','Escreve o que vais fazer.','error');return}
  const time=timeInput.value||'09:00'
  const[h,m]=time.split(':').map(Number)
  const dt=new Date(calYear,calMonth,calSelected,h||0,m||0,0,0)
  const clientEl=document.getElementById('qa-client')
  const durEl=document.getElementById('qa-dur')
  const duracao=Number(durEl&&durEl.value)||60

  // Avisar antes de gravar, mas deixar marcar na mesma: as vezes
  // e mesmo preciso ter duas coisas ao mesmo tempo.
  const fimNovo=new Date(dt.getTime()+duracao*60000)
  const choca=jobsAgendados().some(j=>{
    const i=new Date(j.scheduled_at)
    return i<fimNovo && jobFim(j)>dt
  })
  if(choca&&!confirm('Já tens outro trabalho a esta hora. Queres marcar na mesma?'))return

  const{error}=await db.from('jobs').insert({
    professional_id:profileId,title,status:'agendado',
    client_name:(clientEl&&clientEl.value.trim())||null,
    duration_minutes:duracao,
    scheduled_at:dt.toISOString()
  })
  if(error){showAlert('qa-error','Erro ao marcar: '+error.message,'error');return}
  titleInput.value=''
  if(clientEl)clientEl.value=''
  showAlert('qa-success','Trabalho marcado.')
  loadJobs()
}

async function addJob(){
  const title=document.getElementById('job-title').value.trim()
  if(!title){showAlert('job-error','Indica um título para o trabalho.','error');return}
  const client_name=document.getElementById('job-client').value.trim()||null
  const amountVal=document.getElementById('job-amount').value
  const quote_amount=amountVal?parseFloat(amountVal):null
  const{error}=await db.from('jobs').insert({professional_id:profileId,title,client_name,quote_amount,status:'novo'})
  if(error){showAlert('job-error','Erro ao adicionar: '+error.message,'error');return}
  document.getElementById('job-title').value=''
  document.getElementById('job-client').value=''
  document.getElementById('job-amount').value=''
  showAlert('job-success','Trabalho adicionado!')
  loadJobs()
}

async function updateJobField(id,field,value){
  const{error}=await db.from('jobs').update({[field]:value}).eq('id',id)
  if(error){alert('Não foi possível guardar: '+error.message);return}
  loadJobs()
}

async function updateJobStatus(id,status){
  const updates={status}
  if(status==='concluido')updates.completed_at=new Date().toISOString()
  if(status==='pago'){
    updates.paid_at=new Date().toISOString()
    const job=allJobs.find(j=>j.id===id)
    if(job&&!job.paid_amount)updates.paid_amount=job.quote_amount||null
  }
  const{error}=await db.from('jobs').update(updates).eq('id',id)
  if(error){alert('Não foi possível atualizar o estado: '+error.message);return}
  if(status==='pago')await requestReviewForJob(id)
  loadJobs()
}

// Pede avaliacao automaticamente assim que um trabalho fica pago (e quando a taxa de resposta e mais alta)
async function requestReviewForJob(jobId){
  try{
    const job=allJobs.find(j=>j.id===jobId)
    if(!job||!job.conversation_id)return
    const{data:already}=await db.from('messages').select('id').eq('conversation_id',job.conversation_id).ilike('content','%deixa a tua avaliação%').limit(1).maybeSingle()
    if(already)return
    const link=profileData?.slug?('https://flinko.pt/'+profileData.slug):('https://flinko.pt/profile.html?id='+profileId)
    const content='Obrigado! O trabalho foi concluído e pago. Se puderes, deixa a tua avaliação aqui: '+link
    await db.from('messages').insert({conversation_id:job.conversation_id,sender_id:profileId,content})
    await db.from('conversations').update({last_message:content,last_message_at:new Date().toISOString()}).eq('id',job.conversation_id)
    notifyReviewRequest(job.conversation_id,content)
  }catch(e){}
}

// Sem isto, o pedido de avaliação fica só dentro do chat e o cliente só o
// vê se voltar a abrir a Flinko por iniciativa própria — a mesma Netlify
// Function que avisa por email/push em mensagens normais (messages.html)
// tem de ser chamada aqui também, senão o pedido automático fica mudo.
async function notifyReviewRequest(conversationId,content){
  try{
    const{data:{session}}=await db.auth.getSession()
    if(!session)return
    await fetch('/.netlify/functions/notify-message',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token},
      body:JSON.stringify({conversationId,preview:content})
    })
  }catch(e){}
}

async function deleteJob(id){
  if(!confirm('Remover este trabalho?'))return
  const{error}=await db.from('jobs').delete().eq('id',id)
  if(error){alert('Não foi possível remover: '+error.message);return}
  loadJobs()
}

async function loadChatUnread(){
  const{data:convos}=await db.from('conversations').select('id').or('client_id.eq.'+profileId+',professional_id.eq.'+profileId)
  const badge=document.getElementById('chat-badge')
  if(!convos||!convos.length){badge.style.display='none';return}
  const ids=convos.map(c=>c.id)
  const{count}=await db.from('messages').select('*',{count:'exact',head:true}).in('conversation_id',ids).eq('read',false).neq('sender_id',profileId)
  if(count>0){badge.textContent=count;badge.style.display='inline-block'}
  else badge.style.display='none'
}

