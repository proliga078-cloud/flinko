async function loadStats(){
  const[{count:mc},{count:rc},{data:revs},{count:sc}]=await Promise.all([
    db.from('conversations').select('*',{count:'exact',head:true}).eq('professional_id',profileId),
    db.from('reviews').select('*',{count:'exact',head:true}).eq('professional_id',profileId),
    db.from('reviews').select('rating').eq('professional_id',profileId),
    db.from('services').select('*',{count:'exact',head:true}).eq('professional_id',profileId)
  ])
  servicesCount=sc||0
  msgsCount=mc||0
  reviewsCount=rc||0
  document.getElementById('stat-msgs').textContent=mc||0
  const msub=document.getElementById('stat-msgs-sub')
  if(msub)msub.textContent=(mc||0)>0?'Em curso':'Nenhuma por responder'
  const savg=document.getElementById('stat-avg'),savgSub=document.getElementById('stat-avg-sub')
  if(revs&&revs.length){
    reviewsAvg=(revs.reduce((s,r)=>s+r.rating,0)/revs.length).toFixed(1)
    if(savg)savg.textContent=reviewsAvg+' ★'
    if(savgSub)savgSub.textContent=revs.length+' avaliaç'+(revs.length!==1?'ões':'ão')
  } else {
    reviewsAvg=null
    if(savg)savg.textContent='—'
    if(savgSub)savgSub.textContent='Sem avaliações ainda'
  }

  // Visualizações do perfil (últimos 30 dias) + gráfico
  const d30=new Date();d30.setDate(d30.getDate()-29);d30.setHours(0,0,0,0)
  const{data:views}=await db.from('profile_views').select('viewed_at').eq('profile_id',profileId).gte('viewed_at',d30.toISOString().slice(0,10))
  document.getElementById('stat-views').textContent=views?views.length:0
  renderViewsChart(views||[])

  // Faturação este mês
  const monthStart=new Date();monthStart.setDate(1);monthStart.setHours(0,0,0,0)
  const{data:paidJobs}=await db.from('jobs').select('paid_amount').eq('professional_id',profileId).eq('status','pago').gte('paid_at',monthStart.toISOString())
  const total=(paidJobs||[]).reduce((s,j)=>s+(Number(j.paid_amount)||0),0)
  document.getElementById('stat-earnings').textContent=total>0?('€'+total.toFixed(0)):'€0'
  const esub=document.getElementById('stat-earnings-sub')
  if(esub)esub.textContent=(paidJobs&&paidJobs.length)?((paidJobs.length)+' trabalho'+(paidJobs.length!==1?'s':'')+' pago'+(paidJobs.length!==1?'s':'')):'Sem trabalhos pagos'
  const cw=document.getElementById('charts-wrap')
  if(cw&&(total>0||(views&&views.length)))cw.style.display='grid'

  // Faturação últimos 6 meses (gráfico)
  const d6=new Date();d6.setMonth(d6.getMonth()-5);d6.setDate(1);d6.setHours(0,0,0,0)
  const{data:paid6}=await db.from('jobs').select('paid_amount,paid_at').eq('professional_id',profileId).eq('status','pago').gte('paid_at',d6.toISOString())
  renderEarningsChart(paid6||[])

  renderInsights()
  renderFollowupReminders()
  // updateSidebar() (que chama renderSetup()) corre logo no init(), ANTES
  // desta função ter resolvido — nesse primeiro render, servicesCount ainda
  // está a 0 por omissão, por isso o passo "Publica o primeiro serviço"
  // podia aparecer como pendente mesmo quando o profissional já tem
  // serviços publicados. Agora que servicesCount está atualizado, voltamos
  // a desenhar o cartão para refletir o estado real.
  window.__statsLoaded=true
  renderSetup()
  if(typeof maybeAutoOnboarding==='function')maybeAutoOnboarding()
}

function renderViewsChart(views){
  const ctx=document.getElementById('chart-views')
  if(!ctx)return
  if(typeof Chart==='undefined'){loadLib('chart').then(()=>renderViewsChart(views)).catch(()=>{});return}
  const days=[],counts={}
  for(let i=29;i>=0;i--){
    const d=new Date();d.setDate(d.getDate()-i)
    const key=d.toISOString().slice(0,10)
    days.push(key);counts[key]=0
  }
  views.forEach(v=>{if(counts[v.viewed_at]!==undefined)counts[v.viewed_at]++})
  const labels=days.map(d=>{const dt=new Date(d+'T00:00:00');return dt.getDate()+'/'+(dt.getMonth()+1)})
  const data=days.map(d=>counts[d])
  if(chartViews)chartViews.destroy()
  chartViews=new Chart(ctx,{
    type:'line',
    data:{labels,datasets:[{data,borderColor:'#E8720A',backgroundColor:'rgba(232,114,10,.08)',fill:true,tension:.3,pointRadius:0,borderWidth:2}]},
    options:{plugins:{legend:{display:false}},scales:{x:{ticks:{maxTicksLimit:6,font:{size:10}},grid:{display:false}},y:{beginAtZero:true,ticks:{precision:0,font:{size:10}}}}}
  })
}

function renderEarningsChart(paidJobs){
  const ctx=document.getElementById('chart-earnings')
  if(!ctx)return
  if(typeof Chart==='undefined'){loadLib('chart').then(()=>renderEarningsChart(paidJobs)).catch(()=>{});return}
  const months=[]
  for(let i=5;i>=0;i--){
    const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-i)
    months.push({key:d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'),label:d.toLocaleDateString('pt-PT',{month:'short'})})
  }
  const totals={}
  months.forEach(m=>totals[m.key]=0)
  paidJobs.forEach(j=>{
    if(!j.paid_at)return
    const d=new Date(j.paid_at)
    const key=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')
    if(totals[key]!==undefined)totals[key]+=Number(j.paid_amount)||0
  })
  if(chartEarnings)chartEarnings.destroy()
  chartEarnings=new Chart(ctx,{
    type:'bar',
    data:{labels:months.map(m=>m.label),datasets:[{data:months.map(m=>totals[m.key]),backgroundColor:'#E8720A',borderRadius:6,maxBarThickness:28}]},
    options:{plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{font:{size:10}}},y:{beginAtZero:true,ticks:{callback:v=>'€'+v,font:{size:10}}}}}
  })
}

function renderStatusChart(jobs){
  const ctx=document.getElementById('chart-status')
  if(!ctx)return
  if(typeof Chart==='undefined'){loadLib('chart').then(()=>renderStatusChart(jobs)).catch(()=>{});return}
  const counts={}
  jobs.forEach(j=>{counts[j.status]=(counts[j.status]||0)+1})
  let labels=Object.keys(counts).map(k=>JOB_STATUS_LABELS[k]||k)
  let data=Object.values(counts)
  let colors=['#E8720A','#F59E0B','#22c55e','#a855f7','#ef4444','#06b6d4','#64748b','#94a3b8']
  if(!data.length){labels=['Sem trabalhos'];data=[1];colors=['#e5e7eb']}
  if(chartStatus)chartStatus.destroy()
  chartStatus=new Chart(ctx,{
    type:'doughnut',
    data:{labels,datasets:[{data,backgroundColor:colors,borderWidth:0}]},
    options:{plugins:{legend:{position:'bottom',labels:{font:{size:10},boxWidth:10,padding:8}}},cutout:'62%'}
  })
}

function renderSetup(){
  const card=document.getElementById('setup-card')
  if(!card||!profileData)return
  const qs=document.getElementById('quick-service')
  if(qs)qs.style.display=(profileData.account_type!=='client'&&profileData.category&&servicesCount===0)?'block':'none'
  const qcat=document.getElementById('quick-category')
  if(qcat){
    const falta=profileData.account_type!=='client'&&(!profileData.category||!profileData.location)
    qcat.style.display=falta?'block':'none'
    if(falta)fillQuickCategory()
  }
  if(profileData.account_type==='client'){card.style.display='none';return}
  const passos=[
    {t:'Criar conta',s:'',ok:true},
    // Categoria e zona separadas (em vez de um único passo combinado): sem
    // categoria o perfil não aparece em NENHUMA pesquisa por categoria nem
    // na grelha de categorias da homepage — é o passo mais crítico de
    // todos, por isso tem de ficar claro qual dos dois falta exatamente.
    {t:'Escolher categoria',s:'Sem categoria não apareces em nenhuma pesquisa nem na homepage',ok:!!profileData.category,go:()=>showPage('profile')},
    {t:'Escolher zona',s:'Para apareceres nas pesquisas da tua zona',ok:!!profileData.location,go:()=>showPage('profile')},
    {t:'Acrescenta foto e descrição',s:'Perfis com foto recebem mais contactos',ok:!!(profileData.photo_url&&profileData.bio),go:()=>showPage('profile')},
    {t:'Publica o primeiro serviço',s:'Os clientes veem o que fazes e a partir de quanto',ok:servicesCount>0,go:()=>showPage('services')}
  ]
  const feitos=passos.filter(p=>p.ok).length
  if(feitos===passos.length){card.style.display='none';return}
  card.style.display='block'
  const faltam=passos.length-feitos
  document.getElementById('setup-title').textContent=`Falta${faltam>1?'m':''} ${faltam} passo${faltam>1?'s':''} para apareceres nas pesquisas`
  document.getElementById('setup-count').textContent=`${feitos} / ${passos.length}`
  document.getElementById('setup-fill').style.width=(feitos/passos.length*100)+'%'
  document.getElementById('setup-list').innerHTML=passos.map((p,i)=>{
    if(p.ok)return `<div class="setup-row done"><svg class="ic" viewBox="0 0 24 24" style="width:19px;height:19px;color:var(--green)"><circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-4.5"/></svg><div class="sr-txt"><div class="sr-t">${p.t}</div></div></div>`
    const primeiro=passos.findIndex(x=>!x.ok)===i
    return `<div class="setup-row"><div class="sr-circle"></div><div class="sr-txt"><div class="sr-t">${p.t}</div><div class="sr-s">${p.s}</div></div>
      <button class="btn ${primeiro?'btn-primary':'btn-outline'} btn-sm" onclick="setupGo(${i})">${primeiro?'Completar':'Adicionar'}</button></div>`
  }).join('')
  window.__setupPassos=passos
}
function setupGo(i){const p=(window.__setupPassos||[])[i];if(p&&p.go)p.go()}

function renderFollowupReminders(){
  const sec=document.getElementById('followup-section')
  const list=document.getElementById('followup-list')
  if(!sec||!list)return
  const now=new Date()
  const needsFollowup=allJobs.filter(j=>{
    if(j.status!=='orcamento_enviado')return false
    const base=j.last_followup_at||j.quote_sent_at||j.created_at
    if(!base)return false
    return (now-new Date(base))/86400000>=3
  }).sort((a,b)=>new Date(a.last_followup_at||a.quote_sent_at||a.created_at)-new Date(b.last_followup_at||b.quote_sent_at||b.created_at))

  if(!needsFollowup.length){sec.style.display='none';return}
  sec.style.display='block'
  list.innerHTML=needsFollowup.map(j=>{
    const base=new Date(j.last_followup_at||j.quote_sent_at||j.created_at)
    const dias=Math.floor((now-base)/86400000)
    return `<div class="fin-row">
      <div style="flex:1;min-width:0"><div class="fr-t" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(j.title)}</div>
      <div class="fr-s">${escapeHtml(j.client_name||'Cliente')} · orçamento parado há ${dias} dia${dias!==1?'s':''}</div></div>
      <button class="btn btn-outline btn-sm" onclick="markFollowedUp('${j.id}')">Marcar como contactado</button>
    </div>`
  }).join('')
}

async function markFollowedUp(jobId){
  const{error}=await db.from('jobs').update({last_followup_at:new Date().toISOString()}).eq('id',jobId)
  if(error){alert('Erro: '+error.message);return}
  const j=allJobs.find(x=>x.id===jobId)
  if(j)j.last_followup_at=new Date().toISOString()
  renderFollowupReminders()
}

function renderInsights(){
  const el=document.getElementById('ai-insights')
  if(!el||!profileData)return
  const tips=[]
  const now=new Date()

  const missing=[]
  if(!profileData.photo_url)missing.push('foto de perfil')
  if(!profileData.bio)missing.push('biografia')
  if(missing.length)tips.push({type:'warn',icon:'alert',text:`O teu perfil está incompleto (falta ${missing.join(' e ')}). Perfis completos recebem mais contactos.`})

  if(servicesCount===0)tips.push({type:'warn',icon:'alert',text:'Ainda não publicaste nenhum serviço. Adiciona pelo menos um em "Serviços" para apareceres nas pesquisas.'})

  const stale=allJobs.filter(j=>['novo','negociacao'].includes(j.status)&&(now-new Date(j.created_at))/86400000>3)
  if(stale.length)tips.push({type:'warn',icon:'clock',text:`Tens ${stale.length} trabalho${stale.length>1?'s':''} por avançar há mais de 3 dias. Responder rápido aumenta as hipóteses de fechar negócio.`})

  const waiting=allJobs.filter(j=>j.status==='orcamento_enviado'&&j.quote_sent_at&&(now-new Date(j.quote_sent_at))/86400000>5)
  if(waiting.length)tips.push({type:'warn',icon:'clock',text:`Tens ${waiting.length} orçamento${waiting.length>1?'s':''} enviado${waiting.length>1?'s':''} há mais de 5 dias sem resposta. Considera fazer um follow-up.`})

  const weekEnd=new Date(now);weekEnd.setDate(weekEnd.getDate()+7)
  const thisWeek=allJobs.filter(j=>j.scheduled_at&&j.status!=='cancelado'&&new Date(j.scheduled_at)>=now&&new Date(j.scheduled_at)<=weekEnd)
  if(thisWeek.length)tips.push({type:'good',icon:'calendar',text:`Tens ${thisWeek.length} trabalho${thisWeek.length>1?'s':''} agendado${thisWeek.length>1?'s':''} para os próximos 7 dias.`})

  const paid=allJobs.filter(j=>j.status==='pago'&&j.paid_amount)
  if(paid.length){
    const avgTicket=paid.reduce((s,j)=>s+Number(j.paid_amount),0)/paid.length
    tips.push({type:'good',icon:'trend',text:`O teu ticket médio é de €${avgTicket.toFixed(0)}, com base em ${paid.length} trabalho${paid.length>1?'s':''} pago${paid.length>1?'s':''}.`})
  }

  const completed=allJobs.filter(j=>j.completed_at)
  if(completed.length>=3){
    const dowCount=[0,0,0,0,0,0,0]
    completed.forEach(j=>dowCount[new Date(j.completed_at).getDay()]++)
    const maxIdx=dowCount.indexOf(Math.max(...dowCount))
    const dowNames=['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado']
    tips.push({type:'good',icon:'chart',text:`A maior parte dos teus trabalhos concluídos caem à ${dowNames[maxIdx]}.`})
  }

  if(marketPriceCache&&marketPriceCache.category===profileData.category)tips.push({type:'good',icon:'coin',text:`Profissionais de ${escapeHtml(profileData.category)} na Flinko cobram, em média, entre €${marketPriceCache.lo.toFixed(0)} e €${marketPriceCache.hi.toFixed(0)}. Usa isto para ajustares os teus preços.`})

  const respN=profileData.response_sample_count||0
  const respM=profileData.avg_response_minutes
  if(respN>=3&&respM!=null){
    if(Number(respM)<=120)tips.push({type:'good',icon:'clock',text:`Respondes em média em ${fmtResponseMins(respM)} — o selo "Responde rápido" está visível no teu perfil público. Continua assim.`})
    else tips.push({type:'warn',icon:'clock',text:`Respondes em média em ${fmtResponseMins(respM)}. Se responderes em menos de 2 horas, ganhas o selo "Responde rápido" no teu perfil público.`})
  }else if(respN>0){
    tips.push({type:'good',icon:'clock',text:`Faltam ${3-respN} resposta${3-respN>1?'s':''} a clientes para calcularmos o teu tempo médio e mostrarmos o selo no perfil.`})
  }

  const fechados=allJobs.filter(j=>['concluido','pago'].includes(j.status)&&Number(j.paid_amount??j.quote_amount??0)>0)
  const comMat=fechados.filter(j=>j.material_cost!=null)
  if(fechados.length>=2&&comMat.length===0){
    tips.push({type:'warn',icon:'coin',text:`Tens ${fechados.length} trabalhos fechados mas nenhum com o custo de material preenchido. Sem isso não sabes quanto sobrou — só quanto entrou. Preenche em "Trabalhos".`})
  }else if(comMat.length>=2){
    const g={}
    comMat.forEach(j=>{
      const k=(j.job_type&&j.job_type.trim())||'Sem tipo'
      if(!g[k])g[k]={rec:0,mat:0}
      g[k].rec+=Number(j.paid_amount??j.quote_amount??0)
      g[k].mat+=Number(j.material_cost??0)
    })
    const arr=Object.entries(g).map(([t,v])=>({t,pct:v.rec>0?((v.rec-v.mat)/v.rec)*100:0})).sort((a,b)=>b.pct-a.pct)
    if(arr.length>=2&&arr[0].pct-arr[arr.length-1].pct>=15){
      tips.push({type:'good',icon:'coin',text:`Os teus trabalhos de ${arr[0].t} deixam ${arr[0].pct.toFixed(0)}% de margem, contra ${arr[arr.length-1].pct.toFixed(0)}% nos de ${arr[arr.length-1].t}. Vê o detalhe em Finanças.`})
    }else{
      const totR=comMat.reduce((a,j)=>a+Number(j.paid_amount??j.quote_amount??0),0)
      const totM=comMat.reduce((a,j)=>a+Number(j.material_cost??0),0)
      if(totR>0)tips.push({type:'good',icon:'coin',text:`A tua margem média é de ${(((totR-totM)/totR)*100).toFixed(0)}%, com base em ${comMat.length} trabalhos com material registado.`})
    }
  }

  if(!tips.length)tips.push({type:'good',icon:'check',text:'Tudo em dia! Sem alertas de momento — continua o bom trabalho.'})

  el.innerHTML=tips.map(t=>`<div class="insight-card ${t.type}"><div class="ic-badge">${insightIcon(t.icon)}</div><div>${t.text}</div></div>`).join('')
}

function fmtResponseMins(mins){
  const m=Number(mins)
  if(!isFinite(m))return '—'
  if(m<60)return `${Math.round(m)} min`
  if(m<1440)return `${(m/60).toFixed(m<600?1:0).replace('.0','')} h`
  const d=Math.round(m/1440)
  return `${d} dia${d>1?'s':''}`
}

function insightIcon(name){
  const paths={
    alert:'<path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
    calendar:'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    trend:'<path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/>',
    chart:'<path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/>',
    check:'<path d="M20 6 9 17l-5-5"/>',
    coin:'<circle cx="12" cy="12" r="9"/><path d="M12 6v12M15.5 9.5a2.5 2.5 0 0 0-2.5-2H11a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4h-2a2.5 2.5 0 0 1-2.5-2"/>'
  }
  return `<svg class="ic-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name]||paths.check}</svg>`
}

function renderMiniAgenda(){
  const el=document.getElementById('mini-agenda')
  if(!el)return
  const now=new Date()
  const upcoming=allJobs.filter(j=>j.scheduled_at&&j.status!=='cancelado'&&new Date(j.scheduled_at)>=now).sort((a,b)=>new Date(a.scheduled_at)-new Date(b.scheduled_at)).slice(0,3)
  if(!upcoming.length){el.innerHTML='<div class="tc-empty"><div class="ico" style="background:var(--blue-light);color:var(--blue)"><svg class="ic" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg></div><p>Nada marcado.<br/><span>Clica num dia para adicionares.</span></p></div>';return}
  el.innerHTML=upcoming.map(j=>{
    const d=new Date(j.scheduled_at)
    const dateStr=d.toLocaleDateString('pt-PT',{weekday:'short',day:'2-digit',month:'short'})
    const timeStr=d.toLocaleTimeString('pt-PT',{hour:'2-digit',minute:'2-digit'})
    return `<div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:12px">
      <div style="width:30px;height:30px;border-radius:9px;background:var(--blue-light);color:var(--blue);display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg class="ic" viewBox="0 0 24 24" style="width:14px;height:14px"><path d="M13 2 3 14h7l-1 8 10-12h-7z"/></svg></div>
      <div style="min-width:0"><div style="font-size:12.5px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(j.title)}</div><div style="font-size:11px;color:var(--muted)">${dateStr}, ${timeStr}</div></div>
    </div>`
  }).join('')
}

function subscribeJobsRealtime(){
  if(jobsChannel)return
  jobsChannel=db.channel('jobs-changes-'+profileId)
    .on('postgres_changes',{event:'*',schema:'public',table:'jobs',filter:'professional_id=eq.'+profileId},()=>{
      loadJobs()
      loadStats()
    })
    .subscribe()
}

async function loadRecentMsgs(){
  const{data}=await db.from('conversations').select('id,client_id,last_message,last_message_at').eq('professional_id',profileId).order('last_message_at',{ascending:false}).limit(3)
  const el=document.getElementById('recent-msgs')
  if(!data||!data.length){el.innerHTML='<div class="tc-empty"><div class="ico" style="background:var(--green-light,#EAF7EE);color:var(--green)"><svg class="ic" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div><p>Ainda sem mensagens.<br/><span>Avisamos-te por email quando chegarem.</span></p></div>';return}
  const clientIds=data.map(c=>c.client_id)
  const{data:clients}=await db.from('profiles').select('id,name').in('id',clientIds)
  const nameMap={}
  clients&&clients.forEach(c=>nameMap[c.id]=c.name)
  el.innerHTML=data.map(m=>`
    <div class="msg-item" onclick="location.href='messages.html'">
      <div class="msg-header"><div class="msg-from">${escapeHtml(nameMap[m.client_id]||'Cliente')}</div><div class="msg-date">${new Date(m.last_message_at).toLocaleDateString('pt-PT')}</div></div>
      <div class="msg-preview">${escapeHtml((m.last_message||'').slice(0,120))}</div>
    </div>`).join('')
}

async function loadRecentReviews(){
  const{data}=await db.from('reviews').select('*').eq('professional_id',profileId).order('created_at',{ascending:false}).limit(3)
  const el=document.getElementById('recent-reviews')
  const section=document.getElementById('recent-reviews-section')
  // Só mostra o cartão quando há pelo menos 1 avaliação — sem isto, todos os
  // profissionais novos (a maioria neste momento) veriam um cartão vazio
  // "Sem avaliações ainda" na página de resumo, sem qualquer valor.
  if(!data||!data.length){if(section)section.style.display='none';return}
  if(section)section.style.display='block'
  el.innerHTML=data.map(r=>{
    const stars='★'.repeat(r.rating)+'☆'.repeat(5-r.rating)
    return`<div class="list-item">
      <div class="list-item-body">
        <div class="list-item-title">${escapeHtml(r.reviewer_name)} <span style="color:var(--gold)">${stars}</span></div>
        <div class="list-item-sub">${escapeHtml(r.comment||'(sem comentário)')}</div>
      </div>
    </div>`
  }).join('')
}

// NOTA: checkUpgrade() é definido em assets/billing.js (carregado depois
// deste ficheiro em dashboard.html), que é a versão que fica ativa em
// runtime — cobre também o plano "premium" e é a única definição desde
// que este duplicado foi removido (auditoria total, ago/2026). Manter
// apenas uma definição evita divergência silenciosa entre as duas versões
// (a duplicada aqui já tinha ficado sem chamar loadDiaryDash()/loadFaqsDash(),
// deixando as tabs "Diário" e "FAQ" vazias até o utilizador escrever algo).

