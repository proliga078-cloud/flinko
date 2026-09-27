// ============================================================
// DASHBOARD DO CLIENTE — Início, Profissionais Guardados, Histórico de
// Trabalhos, Avaliações que Dei, Dados Pessoais.
//
// Antes, um utilizador com account_type==='client' via o MESMO dashboard
// construído para profissionais, com a maioria das secções escondidas por
// CSS (ver o bloco "if(profileData?.account_type==='client')" em
// dashboard-core.js) — sobrava, na prática, um único formulário
// ("Publicar Novo Pedido") e mais nada. Este ficheiro constrói uma
// experiência própria para clientes, reaproveitando as tabelas e o
// design system já existentes (requests, jobs, reviews, dashboard.css).
//
// "Profissionais Guardados" depende da tabela saved_professionals, criada
// em supabase/migrations/ — essa migração ainda não foi aplicada à base
// de dados em produção (é uma alteração de infraestrutura viva, fora do
// âmbito de uma revisão de código) e tem de ser aplicada manualmente
// antes desta secção funcionar. Até lá, mostra uma mensagem em vez de
// rebentar o resto do dashboard.
// ============================================================

let clientRequests=[],clientJobsCache=[],clientReviewsCache=[]

async function loadClientHome(){
if(!profileId)return
const[{data:reqs},{data:jobs},{data:revs}]=await Promise.all([
db.from('requests').select('*').eq('client_id',profileId).order('created_at',{ascending:false}),
db.from('jobs').select('*').eq('client_id',profileId).order('scheduled_at',{ascending:true,nullsFirst:false}),
db.from('reviews').select('*').eq('client_id',profileId)
])
clientRequests=reqs||[]
clientJobsCache=jobs||[]
clientReviewsCache=revs||[]

const abertos=clientRequests.filter(r=>r.status==='open').length
const now=new Date()
const agendados=clientJobsCache.filter(j=>j.status==='agendado'&&j.scheduled_at&&new Date(j.scheduled_at)>=now).length
const yearStart=new Date(now.getFullYear(),0,1)
const totalGasto=clientJobsCache.filter(j=>j.status==='pago'&&j.paid_at&&new Date(j.paid_at)>=yearStart).reduce((s,j)=>s+(Number(j.paid_amount)||0),0)

const elReq=document.getElementById('ch-stat-requests');if(elReq)elReq.textContent=abertos
const elAg=document.getElementById('ch-stat-scheduled');if(elAg)elAg.textContent=agendados
const elGasto=document.getElementById('ch-stat-spent');if(elGasto)elGasto.textContent='€'+totalGasto.toFixed(0)
const elRev=document.getElementById('ch-stat-reviews');if(elRev)elRev.textContent=clientReviewsCache.length

const upcoming=clientJobsCache.filter(j=>j.scheduled_at&&j.status==='agendado'&&new Date(j.scheduled_at)>=now).slice(0,4)
const elUp=document.getElementById('ch-upcoming')
if(elUp){
if(!upcoming.length){
elUp.innerHTML='<div class="tc-empty"><div class="ico" style="background:var(--blue-light);color:var(--blue)"><svg class="ic" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg></div><p>Sem agendamentos.<br/><span>Quando um profissional marcar um trabalho contigo, aparece aqui.</span></p></div>'
}else{
elUp.innerHTML=upcoming.map(j=>{
const d=new Date(j.scheduled_at)
return `<div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:12px">
<div style="width:30px;height:30px;border-radius:9px;background:var(--blue-light);color:var(--blue);display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg class="ic" viewBox="0 0 24 24" style="width:14px;height:14px"><path d="M13 2 3 14h7l-1 8 10-12h-7z"/></svg></div>
<div style="min-width:0"><div style="font-size:12.5px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(j.title)}</div><div style="font-size:11px;color:var(--muted)">${d.toLocaleDateString('pt-PT',{weekday:'short',day:'2-digit',month:'short'})}, ${d.toLocaleTimeString('pt-PT',{hour:'2-digit',minute:'2-digit'})}</div></div>
</div>`
}).join('')
}
}

const activity=[
...clientRequests.map(r=>({date:r.created_at,text:`Publicaste o pedido "${r.title}"`})),
...clientJobsCache.filter(j=>j.status==='concluido'||j.status==='pago').map(j=>({date:j.paid_at||j.completed_at||j.updated_at,text:j.status==='pago'?`Pagaste o trabalho "${j.title}"`:`O trabalho "${j.title}" foi concluído`}))
].filter(a=>a.date).sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,5)
const elAct=document.getElementById('ch-activity')
if(elAct){
if(!activity.length)elAct.innerHTML='<div class="tc-empty"><p>Ainda sem atividade.</p></div>'
else elAct.innerHTML=activity.map(a=>`<div class="fin-row"><div class="fr-ico"><svg class="ic" viewBox="0 0 24 24" style="width:15px;height:15px"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg></div><div style="flex:1;min-width:0"><div class="fr-t">${escapeHtml(a.text)}</div><div class="fr-s">${new Date(a.date).toLocaleDateString('pt-PT')}</div></div></div>`).join('')
}

renderClientSpendChart()
loadRecommendedPros()
}

let chartClientSpend=null
function renderClientSpendChart(){
const ctx=document.getElementById('chart-client-spend')
if(!ctx)return
if(typeof Chart==='undefined'){loadLib('chart').then(renderClientSpendChart).catch(()=>{});return}
const months=[]
for(let i=5;i>=0;i--){
const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-i)
months.push({key:d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'),label:d.toLocaleDateString('pt-PT',{month:'short'})})
}
const totals={}
months.forEach(m=>totals[m.key]=0)
clientJobsCache.filter(j=>j.status==='pago'&&j.paid_at).forEach(j=>{
const d=new Date(j.paid_at)
const key=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')
if(totals[key]!==undefined)totals[key]+=Number(j.paid_amount)||0
})
if(chartClientSpend)chartClientSpend.destroy()
chartClientSpend=new Chart(ctx,{
type:'bar',
data:{labels:months.map(m=>m.label),datasets:[{data:months.map(m=>totals[m.key]),backgroundColor:'#0F8B5F',borderRadius:6,maxBarThickness:28}]},
options:{plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{font:{size:10}}},y:{beginAtZero:true,ticks:{callback:v=>'€'+v,font:{size:10}}}}}
})
}

async function loadRecommendedPros(){
const el=document.getElementById('ch-recommended')
if(!el)return
const cats=[...new Set(clientRequests.map(r=>r.category).filter(Boolean))]
let query=db.from('profiles').select('id,name,slug,category,location,photo_url,plan').eq('account_type','professional')
if(cats.length)query=query.in('category',cats)
const{data}=await query.order('plan',{ascending:false}).limit(6)
if(!data||!data.length){el.innerHTML='<div class="tc-empty"><p>Publica um pedido para veres recomendações aqui.</p></div>';return}
el.innerHTML=data.map(p=>{
const link=p.slug?`/${p.slug}`:`/profile.html?id=${p.id}`
const initials=(p.name||'?').split(' ').map(n=>n[0]).slice(0,2).join('').toUpperCase()
return `<a href="${escapeHtml(link)}" class="pro-pick-row" style="text-decoration:none;color:inherit">
<div class="pro-pick-avatar">${p.photo_url?`<img src="${escapeHtml(p.photo_url)}" alt=""/>`:initials}</div>
<div style="min-width:0;flex:1"><div style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(p.name)}</div><div style="font-size:11.5px;color:var(--muted)">${escapeHtml(p.category||'')}${p.location?' · '+escapeHtml(p.location):''}</div></div>
</a>`
}).join('')
}

// ---------- OS MEUS PEDIDOS: cartões de estatísticas ----------
async function renderMyRequestsStats(){
if(!profileId)return
const{data}=await db.from('requests').select('status').eq('client_id',profileId)
const total=(data||[]).length
const open=(data||[]).filter(r=>r.status==='open').length
const resolved=total-open
const t=document.getElementById('mr-stat-total');if(t)t.textContent=total
const o=document.getElementById('mr-stat-open');if(o)o.textContent=open
const r=document.getElementById('mr-stat-resolved');if(r)r.textContent=resolved
}

// ---------- HISTÓRICO DE TRABALHOS ----------
const CLIENT_JOB_STATUS_LABELS={novo:'Novo',negociacao:'Em negociação',orcamento_enviado:'Orçamento enviado',aceite:'Aceite',agendado:'Agendado',concluido:'Concluído',pago:'Pago',cancelado:'Cancelado'}
async function loadClientJobs(){
const el=document.getElementById('client-jobs-list')
if(!el)return
const{data}=await db.from('jobs').select('*').eq('client_id',profileId).order('created_at',{ascending:false})
if(!data||!data.length){el.innerHTML='<div class="empty">Ainda não tens nenhum trabalho com profissionais da Flinko.</div>';return}
el.innerHTML=data.map(j=>{
const isDone=j.status==='cancelado'
return `<div class="list-item">
<div class="list-item-body">
<div class="list-item-title">${escapeHtml(j.title)} <span class="status-pill ${isDone?'status-resolved':'status-open'}">${CLIENT_JOB_STATUS_LABELS[j.status]||j.status}</span></div>
<div class="list-item-sub">${j.scheduled_at?new Date(j.scheduled_at).toLocaleDateString('pt-PT',{day:'2-digit',month:'short',year:'numeric'})+' · ':''}${j.paid_amount?'€'+Number(j.paid_amount).toFixed(0):(j.quote_amount?'€'+Number(j.quote_amount).toFixed(0)+' (orçamento)':'')}</div>
</div>
</div>`
}).join('')
}

// ---------- AVALIAÇÕES QUE DEI ----------
async function loadClientReviews(){
const el=document.getElementById('client-reviews-list')
if(!el)return
const{data}=await db.from('reviews').select('*').eq('client_id',profileId).order('created_at',{ascending:false})
if(!data||!data.length){el.innerHTML='<div class="empty">Ainda não deixaste nenhuma avaliação. Depois de um trabalho terminado, o profissional recebe um pedido para deixares a tua opinião.</div>';return}
const proIds=[...new Set(data.map(r=>r.professional_id))]
const{data:pros}=await db.from('profiles').select('id,name').in('id',proIds)
const nameMap={};(pros||[]).forEach(p=>nameMap[p.id]=p.name)
el.innerHTML=data.map(r=>{
const stars='★'.repeat(r.rating)+'☆'.repeat(5-r.rating)
return `<div class="list-item">
<div class="list-item-body">
<div class="list-item-title">${escapeHtml(nameMap[r.professional_id]||'Profissional')} <span style="color:var(--gold)">${stars}</span></div>
<div class="list-item-sub">${escapeHtml(r.comment||'(sem comentário)')}</div>
</div>
</div>`
}).join('')
}

// ---------- PROFISSIONAIS GUARDADOS ----------
async function loadSavedPros(){
const el=document.getElementById('saved-pros-list')
if(!el)return
const{data,error}=await db.from('saved_professionals').select('professional_id,created_at,profiles:professional_id(id,name,slug,category,location,photo_url)').eq('client_id',profileId).order('created_at',{ascending:false})
if(error){el.innerHTML='<div class="empty">Ainda não é possível carregar os profissionais guardados.</div>';return}
if(!data||!data.length){el.innerHTML='<div class="empty">Ainda não guardaste nenhum profissional.</div>';return}
el.innerHTML=data.map(s=>{
const p=s.profiles||{}
const link=p.slug?`/${p.slug}`:`/profile.html?id=${p.id}`
const initials=(p.name||'?').split(' ').map(n=>n[0]).slice(0,2).join('').toUpperCase()
return `<div class="list-item">
<div class="pro-pick-avatar" style="margin-right:2px">${p.photo_url?`<img src="${escapeHtml(p.photo_url)}" alt=""/>`:initials}</div>
<div class="list-item-body">
<div class="list-item-title">${escapeHtml(p.name||'Profissional')}</div>
<div class="list-item-sub">${escapeHtml(p.category||'')}${p.location?' · '+escapeHtml(p.location):''}</div>
<div class="list-item-actions"><a href="${escapeHtml(link)}" class="btn btn-outline btn-sm">Ver perfil</a><button class="btn btn-danger btn-sm" onclick="removeSavedPro('${s.professional_id}')">Remover</button></div>
</div>
</div>`
}).join('')
}
async function saveProfessional(professionalId){
if(!profileId)return
const{error}=await db.from('saved_professionals').insert({client_id:profileId,professional_id:professionalId})
if(error){alert('Não foi possível guardar: '+error.message);return}
}
async function removeSavedPro(professionalId){
const{error}=await db.from('saved_professionals').delete().eq('client_id',profileId).eq('professional_id',professionalId)
if(error){alert('Não foi possível remover: '+error.message);return}
loadSavedPros()
}

// ---------- DADOS PESSOAIS (cliente) ----------
function fillClientProfileForm(){
if(!profileData)return
const n=document.getElementById('cp-name');if(n)n.value=profileData.name||''
const ph=document.getElementById('cp-photo');if(ph)ph.value=profileData.photo_url||''
const prev=document.getElementById('cp-photo-preview')
if(prev&&profileData.photo_url){prev.innerHTML=`<img src="${escapeHtml(profileData.photo_url)}" style="width:64px;height:64px;border-radius:50%;object-fit:cover;border:3px solid var(--blue)"/>`;prev.style.display='block'}
const nt=document.getElementById('cp-notif');if(nt)nt.checked=profileData.notify_email!==false
}
async function saveClientProfile(){
if(!profileId)return
const name=document.getElementById('cp-name').value.trim()
if(!name){showAlert('cp-error','O nome não pode ficar vazio.','error');return}
const updates={
name,
photo_url:document.getElementById('cp-photo').value.trim()||null,
notify_email:document.getElementById('cp-notif').checked,
updated_at:new Date().toISOString()
}
const{error}=await db.from('profiles').update(updates).eq('id',profileId)
if(error){showAlert('cp-error','Erro ao guardar: '+error.message,'error');return}
profileData={...profileData,...updates}
updateSidebar()
showAlert('cp-success','Dados guardados com sucesso!')
}
async function uploadClientPhoto(input){
const file=input.files[0]
if(!file)return
if(file.size>5*1024*1024){showAlert('cp-error','Foto demasiado grande. Máx 5MB.','error');return}
const preview=document.getElementById('cp-photo-preview')
preview.innerHTML='<div style="font-size:13px;color:var(--muted)">A carregar...</div>'
preview.style.display='block'
try{
const uploadFile=await resizeImageFile(file)
const ext=uploadFile.name.split('.').pop()
const path=`profiles/${user.id}/avatar.${ext}`
const{error}=await db.storage.from('proliga-media').upload(path,uploadFile,{upsert:true,contentType:uploadFile.type})
if(error)throw error
const{data:urlData}=db.storage.from('proliga-media').getPublicUrl(path)
document.getElementById('cp-photo').value=urlData.publicUrl
preview.innerHTML=`<img src="${escapeHtml(urlData.publicUrl)}" style="width:64px;height:64px;border-radius:50%;object-fit:cover;border:3px solid var(--blue)"/>`
}catch(e){
console.error('Erro ao carregar foto:',e)
showAlert('cp-error','Não foi possível carregar a foto. Tenta novamente.','error')
preview.style.display='none'
document.getElementById('cp-photo').value=''
}
}

// ---------- NAVEGAÇÃO MÓVEL (barra de baixo) DO CLIENTE ----------
function clientMobShow(name){
showPage(name)
document.querySelectorAll('#mobile-nav-client-items .mob-item[data-cmob]').forEach(function(m){
m.classList.toggle('active',m.dataset.cmob===name)
})
}
