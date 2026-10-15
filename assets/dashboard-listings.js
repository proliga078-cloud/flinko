// SERVICES
async function loadServices(){
const{data}=await db.from('services').select('*').eq('professional_id',profileId).order('created_at')
const el=document.getElementById('services-list')
if(!data||!data.length){el.innerHTML='<div class="empty">Sem serviços publicados ainda.</div>';return}
el.innerHTML=data.map(s=>`
<div class="list-item">
<div class="list-item-body">
<div class="list-item-title">${escapeHtml(s.title)}</div>
<div class="list-item-sub">${escapeHtml(s.description||'')} ${s.price_from?`· €${s.price_from}${s.price_to?'–€'+s.price_to:''} / ${s.price_unit||'hora'}`:''}
</div>
</div>
<div><button class="btn btn-danger btn-sm" onclick="deleteService('${s.id}')"><svg class="ic" viewBox="0 0 24 24" style="width:14px;height:14px"><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/><path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/></svg></button></div>
</div>`).join('')
}

async function addService(){
if(!profileId){showAlert('srv-error','Erro: perfil não carregado. Recarrega a página.','error');return}
const plan=(profileData&&profileData.plan)||'free'
// Igual ao trigger enforce_service_limit da base de dados: Grátis 2; planos pagos sem limite.
const svcMax=['starter','pro','empresas','premium'].includes(plan)?Infinity:2
const{count:svcCount}=await db.from('services').select('*',{count:'exact',head:true}).eq('professional_id',profileId)
if(svcCount>=svcMax){showAlert('srv-error','Atingiste o limite de '+svcMax+' serviços do plano '+plan.toUpperCase()+'. Faz upgrade para adicionares mais.','error');return}
const title=document.getElementById('srv-title').value.trim()
if(!title){showAlert('srv-error','O nome do serviço é obrigatório.','error');return}
const{error}=await db.from('services').insert({
professional_id:profileId,title,
description:document.getElementById('srv-desc').value.trim()||null,
price_from:parseFloat(document.getElementById('srv-pmin').value)||null,
price_to:parseFloat(document.getElementById('srv-pmax').value)||null,
price_unit:document.getElementById('srv-unit').value
})
if(error){showAlert('srv-error','Erro: '+error.message,'error');return}
showAlert('srv-success','Serviço adicionado!')
servicesCount=(servicesCount||0)+1
if(typeof renderSetup==='function')renderSetup()
;['srv-title','srv-desc','srv-pmin','srv-pmax'].forEach(id=>document.getElementById(id).value='')
loadServices()
}

async function deleteService(id){
if(!confirm('Remover este serviço?'))return
const{error}=await db.from('services').delete().eq('id',id)
if(error){alert('Não foi possível remover: '+error.message);return}
loadServices()
}

// PORTFOLIO
async function loadPortfolio(){
const{data}=await db.from('portfolio_items').select('*').eq('professional_id',profileId).order('created_at',{ascending:false})
const grid=document.getElementById('portfolio-grid')
if(!grid)return
if(!data||!data.length){grid.innerHTML='<div class="empty">Sem fotos ainda.</div>';return}
grid.innerHTML=data.map(item=>`
<div class="port-img">
<img src="${escapeHtml(item.photo_url)}" alt="${escapeHtml(item.caption||item.title||'')}"/>
${item.title?`<span style="position:absolute;top:6px;left:6px;background:var(--blue);color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px">Caso de sucesso</span>`:''}
<button class="del" onclick="deletePortItem('${item.id}')">✕</button>
</div>`).join('')
}

function toggleCaseFields(){
const on=document.getElementById('port-is-case').checked
document.getElementById('case-fields').style.display=on?'block':'none'
}

async function uploadPortfolioBeforePhoto(input){
const file=input.files[0]
if(!file)return
if(file.size>10*1024*1024){showAlert('port-error','Foto demasiado grande. Máx 10MB.','error');return}
const preview=document.getElementById('port-before-preview')
preview.innerHTML='<div style="font-size:13px;color:var(--muted)">A carregar...</div>'
preview.style.display='block'
try{
const uploadFile=await resizeImageFile(file)
const ext=uploadFile.name.split('.').pop()
const path=`portfolio/${profileId}/before-${Date.now()}.${ext}`
const{error}=await db.storage.from('proliga-media').upload(path,uploadFile,{contentType:uploadFile.type})
if(error)throw error
const{data:urlData}=db.storage.from('proliga-media').getPublicUrl(path)
document.getElementById('port-before-url').value=urlData.publicUrl
preview.innerHTML=`<img src="${escapeHtml(urlData.publicUrl)}" style="width:100px;height:100px;border-radius:10px;object-fit:cover"/>`
}catch(e){
console.error('Erro ao carregar foto "antes":', e);
showAlert('port-error','Não foi possível carregar a foto. Tenta novamente.','error');
preview.style.display = 'none';
document.getElementById('port-before-url').value = '';
}
}

async function addPortfolioItem(){
const url=document.getElementById('port-url').value.trim()
if(!url){showAlert('port-error','Insere o URL da imagem.');return}
const isCase=document.getElementById('port-is-case').checked
const{error}=await db.from('portfolio_items').insert({
professional_id:profileId,
photo_url:url,
caption:document.getElementById('port-cap').value.trim()||null,
title:isCase?(document.getElementById('port-title').value.trim()||null):null,
description:isCase?(document.getElementById('port-desc').value.trim()||null):null,
duration_label:isCase?(document.getElementById('port-duration').value.trim()||null):null,
before_photo_url:isCase?(document.getElementById('port-before-url').value.trim()||null):null
})
if(error){showAlert('port-error','Erro: '+error.message,'error');return}
showAlert('port-success','Foto adicionada!')
;['port-url','port-cap','port-title','port-desc','port-duration','port-before-url'].forEach(id=>document.getElementById(id).value='')
document.getElementById('port-is-case').checked=false
document.getElementById('case-fields').style.display='none'
document.getElementById('port-before-preview').style.display='none'
loadPortfolio()
}

// DIARIO DE TRABALHOS
async function loadDiaryDash(){
if(!profileId)return
const{data}=await db.from('professional_updates').select('*').eq('professional_id',profileId).order('created_at',{ascending:false})
const el=document.getElementById('diary-dash-list')
if(!el)return
if(!data||!data.length){el.innerHTML='<div class="empty">Sem publicações ainda.</div>';return}
el.innerHTML=data.map(u=>`
<div class="list-item">
<div class="list-item-body">
<div class="list-item-title">${escapeHtml(u.content)}</div>
<div class="list-item-sub">${u.location_label?escapeHtml(u.location_label)+' · ':''}${new Date(u.created_at).toLocaleDateString('pt-PT')}</div>
</div>
<div><button class="btn btn-danger btn-sm" onclick="deleteDiaryUpdate('${u.id}')">✕</button></div>
</div>`).join('')
}
async function addDiaryUpdate(){
const content=document.getElementById('diary-content').value.trim()
if(!content){showAlert('diary-error','Escreve o que fizeste.','error');return}
const{error}=await db.from('professional_updates').insert({
professional_id:profileId,content,
location_label:document.getElementById('diary-location').value.trim()||null,
photo_url:document.getElementById('diary-photo-url').value.trim()||null
})
if(error){showAlert('diary-error','Erro: '+error.message,'error');return}
showAlert('diary-success','Publicado!')
;['diary-content','diary-location','diary-photo-url'].forEach(id=>document.getElementById(id).value='')
document.getElementById('diary-photo-preview').style.display='none'
loadDiaryDash()
}
async function deleteDiaryUpdate(id){
if(!confirm('Remover esta publicação?'))return
const{error}=await db.from('professional_updates').delete().eq('id',id)
if(error){alert('Não foi possível remover: '+error.message);return}
loadDiaryDash()
}
async function uploadDiaryPhoto(input){
const file=input.files[0]
if(!file)return
if(file.size>10*1024*1024){showAlert('diary-error','Foto demasiado grande. Máx 10MB.','error');return}
const preview=document.getElementById('diary-photo-preview')
preview.innerHTML='<div style="font-size:13px;color:var(--muted)">A carregar...</div>'
preview.style.display='block'
try{
const uploadFile=await resizeImageFile(file)
const ext=uploadFile.name.split('.').pop()
const path=`diary/${profileId}/${Date.now()}.${ext}`
const{error}=await db.storage.from('proliga-media').upload(path,uploadFile,{contentType:uploadFile.type})
if(error)throw error
const{data:urlData}=db.storage.from('proliga-media').getPublicUrl(path)
document.getElementById('diary-photo-url').value=urlData.publicUrl
preview.innerHTML=`<img src="${escapeHtml(urlData.publicUrl)}" style="width:100px;height:100px;border-radius:10px;object-fit:cover"/>`
}catch(e){
console.error('Erro ao carregar foto do diário:', e);
showAlert('diary-error','Não foi possível carregar a foto. Tenta novamente.','error');
preview.style.display = 'none';
document.getElementById('diary-photo-url').value = '';
}
}

// FAQ
async function loadFaqsDash(){
if(!profileId)return
const{data}=await db.from('professional_faqs').select('*').eq('professional_id',profileId).order('order_index')
const el=document.getElementById('faq-dash-list')
if(!el)return
if(!data||!data.length){el.innerHTML='<div class="empty">Sem perguntas ainda.</div>';return}
el.innerHTML=data.map(f=>`
<div class="list-item">
<div class="list-item-body">
<div class="list-item-title">${escapeHtml(f.question)}</div>
<div class="list-item-sub">${escapeHtml(f.answer)}</div>
</div>
<div><button class="btn btn-danger btn-sm" onclick="deleteFaqDash('${f.id}')">✕</button></div>
</div>`).join('')
}
async function addFaqDash(){
const question=document.getElementById('faq-question').value.trim()
const answer=document.getElementById('faq-answer').value.trim()
if(!question||!answer){showAlert('faq-error','Preenche a pergunta e a resposta.','error');return}
const{count}=await db.from('professional_faqs').select('*',{count:'exact',head:true}).eq('professional_id',profileId)
const{error}=await db.from('professional_faqs').insert({professional_id:profileId,question,answer,order_index:count||0})
if(error){showAlert('faq-error','Erro: '+error.message,'error');return}
showAlert('faq-success','Adicionado!')
document.getElementById('faq-question').value=''
document.getElementById('faq-answer').value=''
loadFaqsDash()
}
async function deleteFaqDash(id){
if(!confirm('Remover esta pergunta?'))return
const{error}=await db.from('professional_faqs').delete().eq('id',id)
if(error){alert('Não foi possível remover: '+error.message);return}
loadFaqsDash()
}

async function deletePortItem(id){
if(!confirm('Remover esta foto?'))return
const{error}=await db.from('portfolio_items').delete().eq('id',id)
if(error){alert('Não foi possível remover: '+error.message);return}
loadPortfolio()
}

// REVIEWS
const SRC_LABEL={trabalho:'✓ Trabalho feito pela Flinko',convite:'Cliente convidado pelo profissional'}
async function loadReviews(){
loadReviewInvites()
const{data}=await db.from('reviews').select('id,professional_id,client_id,reviewer_name,rating,comment,created_at,source,job_id').eq('professional_id',profileId).order('created_at',{ascending:false})
const el=document.getElementById('reviews-list')
if(!data||!data.length){el.innerHTML='<div class="empty">Sem avaliações ainda.</div>';return}
const avg=(data.reduce((s,r)=>s+r.rating,0)/data.length).toFixed(1)
el.innerHTML=`<div style="background:var(--white);border-radius:16px;padding:20px;margin-bottom:16px;text-align:center;border:1px solid var(--border)">
<div style="font-size:48px;font-weight:900;color:var(--blue)">${avg}</div>
<div style="color:var(--gold);font-size:24px">${'★'.repeat(Math.round(avg))}${'☆'.repeat(5-Math.round(avg))}</div>
<div style="font-size:14px;color:var(--muted)">${data.length} avaliação${data.length!==1?'ões':''}</div>
</div>`+data.map(r=>`
<div class="list-item">
<div class="list-item-body">
<div class="list-item-title">${escapeHtml(r.reviewer_name)} <span style="color:var(--gold)">${'★'.repeat(r.rating)+'☆'.repeat(5-r.rating)}</span> <span style="font-size:12px;color:var(--muted);font-weight:400">${new Date(r.created_at).toLocaleDateString('pt-PT')}</span></div>
<div class="list-item-sub">${escapeHtml(r.comment||'(sem comentário)')}</div>${SRC_LABEL[r.source]?'<div style="font-size:12px;color:var(--muted);margin-top:4px">'+SRC_LABEL[r.source]+'</div>':''}
</div>
</div>`).join('')
}

// Convites de avaliação para clientes antigos (review_invites, uso único).
async function createReviewInvite(){
  const erro=document.getElementById('inv-error'),btn=document.getElementById('inv-btn')
  const nome=document.getElementById('inv-name').value.trim()
  erro.style.display='none'
  if(!nome){erro.textContent='Escreve o nome do cliente.';erro.style.display='block';return}
  btn.disabled=true
  const{data,error}=await db.from('review_invites').insert({professional_id:profileId,client_name:nome}).select('token').single()
  btn.disabled=false
  if(error||!data){erro.textContent='Não foi possível criar o link: '+((error&&error.message)||'erro');erro.style.display='block';return}
  document.getElementById('inv-name').value=''
  showReviewLink('https://flinko.pt/avaliar.html?t='+data.token,nome)
  loadReviewInvites()
}
async function loadReviewInvites(){
  const el=document.getElementById('inv-list');if(!el)return
  const{data}=await db.from('review_invites').select('token,client_name,source,created_at,used_at').eq('professional_id',profileId).order('created_at',{ascending:false}).limit(8)
  const L=(data||[]).filter(i=>i.source==='convite')
  el.innerHTML=L.length?'<div style="font-size:12px;font-weight:700;color:var(--muted);margin-bottom:6px">Links enviados</div>'+L.map(i=>'<div class="fin-row"><div style="flex:1;min-width:0"><div class="fr-t">'+escapeHtml(i.client_name||'Cliente')+'</div><div class="fr-s">'+new Date(i.created_at).toLocaleDateString('pt-PT')+'</div></div>'+(i.used_at?'<span style="color:var(--green);font-weight:700;font-size:13px">✓ Avaliou</span>':'<button class="btn btn-outline btn-sm" onclick="showReviewLink(\'https://flinko.pt/avaliar.html?t='+i.token+'\',\''+escapeHtml(String(i.client_name||'').replace(/[\\']/g,''))+'\')">Reenviar</button>')+'</div>').join(''):''
}

function showPage(name){
document.querySelectorAll('.page-section').forEach(p=>p.classList.remove('active'))
document.getElementById(`page-${name}`).classList.add('active')
const grupoPerfil=['profile','services','portfolio','diario','faq']
document.querySelectorAll('.nav-item[data-page]').forEach(n=>{
const alvo=n.dataset.page
n.classList.toggle('active', alvo===name || (alvo==='profile'&&grupoPerfil.includes(name)&&name!=='services'))
})
if(profileData?.account_type!=='client'){
document.querySelectorAll('.mob-item').forEach((m,i)=>{
const pages=['overview','trabalhos','agenda','profile','messages']
m.classList.toggle('active',pages[i]===name)
})
}
document.querySelectorAll('.ptab').forEach(t=>t.classList.toggle('on',t.dataset.ptab===name))
if(name==='services'){loadServices();loadMarketPricing()}
if(name==='portfolio')loadPortfolio()
if(name==='diario')loadDiaryDash()
if(name==='faq')loadFaqsDash()
if(name==='reviews')loadReviews()
if(name==='myrequests'){loadMyRequests();renderMyRequestsStats()}
if(name==='trabalhos'){loadJobs();loadQuotes()}
if(name==='clientes')renderClientHistory()
if(name==='agenda')renderCalendar()
if(name==='referrals')loadReferrals()
if(name==='convidar')loadInvites()
if(name==='financas'){renderFinance();loadExpenses();populateReportYears();renderAnnualReport()}
if(name==='mercado'&&planLimits.market_insights)loadMarketInsights()
if(name==='privacidade')loadGdprRequests()
if(name==='client-home')loadClientHome()
if(name==='verificacao')loadVerificationStatus()
  if(name==='saved-pros')loadSavedPros()
if(name==='client-jobs')loadClientJobs()
if(name==='client-reviews')loadClientReviews()
}

// Publicação rápida do primeiro serviço, no Resumo (cartão #quick-service).
// Cartão do Resumo para profissionais sem categoria ou zona: sem isso o perfil
// não aparece em nenhuma pesquisa. Copia as opções dos selects do formulário
// do perfil, para não haver duas listas de categorias/distritos a manter.
function fillQuickCategory(){
const cat=document.getElementById('qcat-cat'),dist=document.getElementById('qcat-district')
if(!cat||!dist)return
const copiar=(de,para)=>{if(para.options.length>1)return;[...document.getElementById(de).options].forEach(o=>{if(o.value||o.text&&!o.text.startsWith('Escolhe'))para.add(new Option(o.text,o.value||o.text))})}
copiar('p-cat',cat);copiar('p-district',dist)
if(profileData?.category)cat.value=profileData.category
}
async function quickCategory(){
const erro=document.getElementById('qcat-error')
const mostrar=m=>{erro.textContent=m;erro.style.display='block'}
erro.style.display='none'
if(!profileId){mostrar('Erro: perfil não carregado. Recarrega a página.');return}
const category=document.getElementById('qcat-cat').value
const district=document.getElementById('qcat-district').value
if(!category||!district){mostrar('Escolhe a categoria e o distrito.');return}
const btn=document.getElementById('qcat-btn')
btn.disabled=true
const updates={category,location:district,updated_at:new Date().toISOString()}
const{error}=await db.from('profiles').update(updates).eq('id',profileId)
btn.disabled=false
if(error){mostrar('Não foi possível guardar: '+error.message);return}
profileData={...profileData,...updates}
document.getElementById('p-cat').value=category
document.getElementById('p-district').value=district
renderSetup()
if(typeof updateSidebar==='function')updateSidebar()
}
async function quickService(){
const erro=document.getElementById('qs-error')
const mostrar=m=>{erro.textContent=m;erro.style.display='block'}
erro.style.display='none'
if(!profileId){mostrar('Erro: perfil não carregado. Recarrega a página.');return}
const title=document.getElementById('qs-title').value.trim()
if(!title){mostrar('Diz o que fazes (o nome do serviço é obrigatório).');return}
const preco=parseFloat(document.getElementById('qs-price').value)
const btn=document.getElementById('qs-btn')
btn.disabled=true
const{error}=await db.from('services').insert({
professional_id:profileId,title,
price_from:preco>0?preco:null,
price_unit:document.getElementById('qs-unit').value
})
btn.disabled=false
if(error){mostrar('Não foi possível publicar: '+error.message);return}
document.getElementById('qs-title').value='';document.getElementById('qs-price').value=''
servicesCount=(servicesCount||0)+1
renderSetup()
const t=document.createElement('div')
t.textContent='Serviço publicado! Já aparece no teu perfil.'
t.setAttribute('role','status')
t.style.cssText='position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#132420;color:#fff;padding:12px 20px;border-radius:12px;font-weight:600;font-size:14px;z-index:9999;box-shadow:0 10px 30px rgba(0,0,0,.25)'
document.body.appendChild(t)
setTimeout(()=>t.remove(),3500)
}
